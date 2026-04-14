# Agentic Pipeline Design: Shared Workspace + Tool Use

**Date:** 2026-04-14  
**Status:** Approved  
**Branch:** feat/fullstack-generation

---

## Problem Statement

The current LLM generation pipeline sends one HTTP request to the LLM and parses the entire response as a block of `===FILE:===` markers. This stateless, single-shot approach fails for two reasons:

1. **Cross-file inconsistency** — LLM generates 20+ files simultaneously without verifying consistency between them (e.g., `PrismaService` missing from `providers[]` in a NestJS module).
2. **No filesystem awareness** — LLM cannot read already-existing files (static templates, previously generated files) to align imports, paths, or DI registration.

---

## Solution Overview

Replace the single-shot text generation with a **full agentic loop** using OpenAI-compatible tool use (`tools` + `tool_calls`). All runners share a single cloned git repository via a Docker volume. The LLM navigates the filesystem through tools (`read_file`, `write_file`, `list_files`) instead of generating all files in one text blob.

---

## Architecture

### Shared Workspace Volume

A Docker volume `workspace` is mounted to all runner containers and the orchestrator. Each generated project occupies a subdirectory:

```
/workspace/{projectName}/
  backend/
    src/
      prisma/prisma.service.ts    ← static template (already in repo)
      auth/auth.module.ts         ← static template
      equipment/                  ← LLM writes here
        equipment.module.ts
        equipment.service.ts
        equipment.controller.ts
        dto/
  frontend/
    src/
      authProvider.ts             ← static template (Handlebars rendered)
      dataProvider.ts             ← static template
      resources/                  ← LLM writes here
        equipment/
  schema.prisma                   ← LLM writes (runner-prisma)
  docker-compose.yml              ← static template
  nginx/nginx.conf                ← static template
```

### Pipeline Phases

```
Phase 0 — Orchestrator (no LLM)
  ├── createGiteaRepo(projectName)
  ├── renderHandlebarsTemplates() → git push to Gitea
  │   (docker-compose.yml, Dockerfiles × 3, nginx.conf,
  │    package.json × 2, tsconfig × 2, auth files, authProvider.ts, dataProvider.ts)
  └── git clone [gitea/{projectName}] → /workspace/{projectName}/
      (workspace now has all static templates, ready for LLM runners)

Phase 1 — runner-prisma (sequential, blocks Phase 2)
  └── agentic loop in /workspace/{projectName}/
        LLM reads DSL via read_file → writes schema.prisma via write_file
        (no git operations — orchestrator owns all git)

Phase 2 — runner-nestjs + runner-react-admin (parallel)
  ├── runner-nestjs:
  │     agentic loop → reads /workspace/{projectName}/ → writes to backend/src/
  └── runner-react-admin:
        agentic loop → reads /workspace/{projectName}/ → writes to frontend/src/
  (no git operations — directories don't overlap, no conflicts)

Finalization — Orchestrator (after both Phase 2 jobs complete)
  ├── git -C /workspace/{projectName} add .
  ├── git -C /workspace/{projectName} commit -m "feat: add generated code"
  ├── git -C /workspace/{projectName} push
  └── Portainer deploy
```

---

## Agentic Loop

### Tool Definitions (OpenAI-compatible)

```typescript
const AGENTIC_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories at a given path within the project workspace.',
      parameters: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Path relative to project root, e.g. "backend/src"' },
        },
        required: ['dir'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the project workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to project root, e.g. "backend/src/prisma/prisma.service.ts"' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or overwrite a file in the project workspace. Creates parent directories automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to project root' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
];

// All runners use the same three tools above.
// Git operations (clone, commit, push) are owned exclusively by the Orchestrator.
```

### Loop Implementation (`runner/shared/agenticLoop.ts`)

```typescript
interface AgenticLoopOptions {
  systemPrompt: string;
  userPrompt: string;
  workspacePath: string;  // absolute path to /workspace/{projectName}
  tools: Tool[];
  maxIterations?: number; // default: 50
  onProgress?: (message: string) => void;
}

export async function runAgenticLoop(opts: AgenticLoopOptions): Promise<void> {
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.userPrompt },
  ];

  const MAX = opts.maxIterations ?? 50;

  for (let i = 0; i < MAX; i++) {
    const response = await callLLMWithTools(messages, opts.tools);
    const choice = response.choices[0];

    messages.push(choice.message);  // add assistant turn to history

    const toolCalls = choice.message.tool_calls;
    if (!toolCalls?.length) break;  // finish_reason === 'stop' or no tool calls

    for (const toolCall of toolCalls) {
      opts.onProgress?.(`Tool: ${toolCall.function.name}`);
      const args = JSON.parse(toolCall.function.arguments);
      const result = await executeTool(toolCall.function.name, args, opts.workspacePath);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result),
      });
    }
  }
}
```

### Tool Execution (`runner/shared/fileTools.ts`)

```typescript
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  workspacePath: string,
): Promise<unknown> {
  const resolvePath = (rel: string) => {
    const abs = path.resolve(workspacePath, rel);
    if (!abs.startsWith(workspacePath)) throw new Error('Path traversal denied');
    return abs;
  };

  switch (name) {
    case 'list_files': {
      const dir = resolvePath(args.dir as string);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
    }
    case 'read_file': {
      const file = resolvePath(args.path as string);
      return { content: await fs.readFile(file, 'utf-8') };
    }
    case 'write_file': {
      const file = resolvePath(args.path as string);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, args.content as string, 'utf-8');
      return { success: true, path: args.path };
    }
    case 'git_commit_push': {
      await exec(`git -C ${workspacePath} add .`);
      await exec(`git -C ${workspacePath} commit -m "${args.message}"`);
      await exec(`git -C ${workspacePath} push`);
      return { success: true };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

---

## Changes Per Component

### `runner/shared/`

| File | Change |
|---|---|
| `fileParser.ts` | Remove (no longer needed — no `===FILE:===` format) |
| `agenticLoop.ts` | **New** — multi-turn loop implementation |
| `fileTools.ts` | **New** — list_files, read_file, write_file implementations |

### `runner-prisma/src/`

| File | Change |
|---|---|
| `llmClient.ts` | Rewrite: system prompt instructs tool use instead of text output |
| `writeResult.ts` | Remove |
| `index.ts` | Accept `workspacePath` in start request; call `runAgenticLoop` |

### `runner-nestjs/src/`

| File | Change |
|---|---|
| `llmClient.ts` | Rewrite: system prompt instructs tool use |
| `writeResult.ts` | Remove |
| `fileParser.ts` | Remove |
| `index.ts` | Accept `workspacePath`; call `runAgenticLoop`; no git push (orchestrator does it) |

### `runner-react-admin/src/`

Same changes as `runner-nestjs`.

### `server/src/orchestrator/orchestrator.service.ts`

| Phase | Change |
|---|---|
| Phase 0 addition | After pushing templates to Gitea: `git clone` repo to `/workspace/{projectName}/` |
| Phase 1 start | Add `workspacePath` + `projectName` to runner start request; no clone in runner |
| Phase 1 wait | After job complete, workspace has schema.prisma written by LLM |
| Phase 2 start | Pass `workspacePath` — no clone needed, already exists |
| Phase 2 wait | After both complete: `git add . && git commit && git push` from orchestrator |
| File extraction | Remove `extractFilesFromResult()` — runners no longer return file maps |

### `docker-compose.yml` (aid system)

```yaml
volumes:
  workspace:

services:
  server:
    volumes:
      - workspace:/workspace
  runner-prisma:
    volumes:
      - workspace:/workspace
    environment:
      - GITEA_URL=http://gitea:3000
      - GITEA_TOKEN=${GITEA_TOKEN}
  runner-nestjs:
    volumes:
      - workspace:/workspace
  runner-react-admin:
    volumes:
      - workspace:/workspace
```

---

## Start Request Protocol

### Before (all runners)
```typescript
interface StartRequest {
  jobId: string;
  path: string;         // DSL file path in aid filesystem
}
```

### After
```typescript
interface StartRequest {
  jobId: string;
  path: string;              // DSL file path in aid filesystem
  workspacePath: string;     // /workspace/{projectName} — absolute path on shared volume
  projectName: string;       // for git remote URL construction
}
```

Runners no longer return `{ files: {} }` in their completion message — they report only `{ message: '...' }`.

---

## System Prompt Changes

### runner-prisma (before)
> "Output ===FILE: schema.prisma=== ... ===END_FILE==="

### runner-prisma (after)
> "You have tools: list_files, read_file, write_file, git_commit_push. Start by reading the DSL file, then write schema.prisma to the workspace. When done, call git_commit_push."

### runner-nestjs (before)
> "Respond with multiple files using ===FILE: path=== format."

### runner-nestjs (after)
> "You have tools: list_files, read_file, write_file. Start by reading backend/src/ to see existing structure (auth, prisma files). Then write each entity module, controller, service, and DTOs. Read what you write to verify imports are correct. When all files are written, stop calling tools."

---

## Error Handling

| Scenario | Handling |
|---|---|
| LLM exceeds `maxIterations` | Runner marks job as failed with message "Max iterations reached" |
| `write_file` path traversal attempt | `executeTool` throws, runner marks job failed |
| `git_commit_push` fails in runner-prisma | Runner retries once; if still fails, job fails |
| Phase 2 runner fails | Orchestrator marks generation as partial; still pushes whatever was written by the successful runner |
| Workspace dir already exists (re-run) | Orchestrator deletes `/workspace/{projectName}` before git clone in Phase 0 |

---

## Testing

### Unit Tests
- `fileTools.ts`: test list_files, read_file, write_file with a temp dir; verify path traversal is blocked
- `agenticLoop.ts`: mock LLM responses (tool call → stop); verify correct message history construction

### Integration Tests
- Existing `orchestrator.integration.spec.ts`: update to not expect `===FILE:===` in runner responses; mock runner jobs as completing without file payloads
- New: test that shared workspace path is passed correctly to all runners

### Manual Verification
- Spin up full stack; trigger generation; verify `/workspace/{projectName}` has correct structure after each phase
- Verify final git push produces valid repo in Gitea

---

## Out of Scope

- Tool call caching or deduplication
- LLM model change (stays on `deepseek/deepseek-v3.2`)
- Workspace persistence across server restarts (volume is ephemeral per-run)
- Multi-project concurrent generation isolation (volume subdirs by projectName handle this)
