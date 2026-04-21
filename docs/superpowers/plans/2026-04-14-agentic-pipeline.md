# Agentic Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the LLM code generation pipeline to use full agentic tool use (list_files/read_file/write_file) against a shared Docker workspace volume, replacing the current single-shot `===FILE:===` text parsing approach.

**Architecture:** Orchestrator owns all git operations (clone in Phase 0, final push after Phase 2). All three runners (prisma, nestjs, react-admin) share a `workspace` Docker volume and use a common `agenticLoop` implementation that converses with the LLM over OpenAI-compatible `tools` + `tool_calls` until the LLM stops invoking tools. Runners never touch git.

**Tech Stack:** Node 22 + tsx (runners), NestJS 11 + Jest (orchestrator), OpenAI-compatible LLM API (deepseek/deepseek-v3.2), Docker Compose shared volumes, Handlebars (existing static templates).

**Spec:** `docs/superpowers/specs/2026-04-14-agentic-pipeline-design.md`

---

## File Structure

### New files

- `runner/shared/fileTools.ts` — implementations of list_files/read_file/write_file with path traversal protection
- `runner/shared/fileTools.spec.ts` — unit tests for fileTools
- `runner/shared/agenticLoop.ts` — multi-turn LLM conversation loop, tool-call handling
- `runner/shared/agenticLoop.spec.ts` — unit tests for agenticLoop (mocked LLM)
- `runner/shared/package.json` — needed so each runner's Docker build can copy shared code
- `runner/shared/tsconfig.json` — TypeScript config for shared code

### Modified files

- `docker-compose.yml` (aid root) — add `workspace` volume, mount to server + three runners
- `runner/runner-prisma/src/index.ts` — accept `workspacePath`, call agenticLoop
- `runner/runner-prisma/src/llmClient.ts` — new system prompt, delegate to agenticLoop
- `runner/runner-prisma/src/writeResult.ts` — **delete**
- `runner/runner-prisma/src/validator.ts` — keep, but called inside agentic loop as an optional post-check
- `runner/runner-prisma/Dockerfile` — copy shared code into image
- `runner/runner-prisma/package.json` — add workspace path to shared
- `runner/runner-nestjs/src/index.ts` — same treatment
- `runner/runner-nestjs/src/llmClient.ts` — same treatment
- `runner/runner-nestjs/src/fileParser.ts` — **delete**
- `runner/runner-nestjs/src/writeResult.ts` — **delete**
- `runner/runner-nestjs/Dockerfile` — copy shared code
- `runner/runner-nestjs/package.json` — add workspace path
- `runner/runner-react-admin/src/index.ts` — same treatment
- `runner/runner-react-admin/src/llmClient.ts` — same treatment
- `runner/runner-react-admin/src/fileParser.ts` — **delete**
- `runner/runner-react-admin/src/writeResult.ts` — **delete**
- `runner/runner-react-admin/Dockerfile` — copy shared code
- `runner/runner-react-admin/package.json` — add workspace path
- `runner/shared/fileParser.ts` — **delete**
- `server/src/orchestrator/orchestrator.service.ts` — clone in Phase 0, stop extracting files from runner results, final git push after Phase 2
- `server/src/orchestrator/file-parser.ts` — **delete** (no longer parses `===FILE:===`)
- `server/src/orchestrator/file-parser.spec.ts` — **delete**
- `server/src/exporters/exporters.service.ts` — extend payload type to include `workspacePath` + `projectName`
- `server/src/types/runner.ts` — extend RunnerPayload type

---

## Task 1: Add shared workspace volume to aid docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Open `docker-compose.yml` and check current state**

Run: `cat docker-compose.yml`

Expected: current file has `backend`, `frontend`, `proxy` services and a `proxy` network, no volumes section.

- [ ] **Step 2: Add `workspace` named volume and mount it to `backend`**

Edit `docker-compose.yml`:

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: server/Dockerfile
    container_name: aid-backend
    environment:
      - FS_ROOT_PATH=/data
    volumes:
      - ./data:/data
      - workspace:/workspace
    networks:
      - proxy
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: client/Dockerfile
    container_name: aid-frontend
    networks:
      - proxy
    restart: unless-stopped

  proxy:
    image: nginx:latest
    container_name: aid-proxy
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
      - frontend
    networks:
      - proxy
    restart: unless-stopped

networks:
  proxy:
    driver: bridge

volumes:
  workspace:
```

- [ ] **Step 3: Verify compose file is valid**

Run: `docker compose config > /dev/null && echo OK`

Expected: `OK` (no yaml errors).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add workspace volume to aid docker-compose"
```

---

## Task 2: Create `runner/shared/` package scaffold

**Files:**
- Create: `runner/shared/package.json`
- Create: `runner/shared/tsconfig.json`
- Create: `runner/shared/index.ts` (barrel export)

- [ ] **Step 1: Create `runner/shared/package.json`**

```json
{
  "name": "@aid/runner-shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "index.ts",
  "scripts": {
    "test": "node --test --experimental-strip-types --no-warnings '**/*.spec.ts'"
  }
}
```

- [ ] **Step 2: Create `runner/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create empty `runner/shared/index.ts` barrel**

```typescript
export * from './fileTools.ts';
export * from './agenticLoop.ts';
```

Note: This file references modules created in later tasks; it will not compile until Tasks 3 and 4 are done. That's expected. `.ts` extensions work under both `tsx` (runner runtime) and `node --test --experimental-strip-types` (shared-package test runtime).

- [ ] **Step 4: Commit**

```bash
git add runner/shared/package.json runner/shared/tsconfig.json runner/shared/index.ts
git commit -m "chore: scaffold runner/shared package"
```

---

## Task 3: Implement `fileTools.ts` with tests (TDD)

**Files:**
- Create: `runner/shared/fileTools.ts`
- Create: `runner/shared/fileTools.spec.ts`

- [ ] **Step 1: Write failing tests first**

Create `runner/shared/fileTools.spec.ts`:

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { executeTool } from './fileTools.ts';

let workspace: string;

describe('fileTools', () => {
  before(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aid-ft-'));
    await fs.mkdir(path.join(workspace, 'backend', 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'backend', 'src', 'hello.ts'), 'export const x = 1;');
  });

  after(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('list_files returns entries with type', async () => {
    const result = await executeTool('list_files', { dir: 'backend/src' }, workspace) as Array<{ name: string; type: string }>;
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'hello.ts');
    assert.equal(result[0].type, 'file');
  });

  it('read_file returns content', async () => {
    const result = await executeTool('read_file', { path: 'backend/src/hello.ts' }, workspace) as { content: string };
    assert.equal(result.content, 'export const x = 1;');
  });

  it('write_file creates missing directories', async () => {
    await executeTool('write_file', { path: 'backend/src/new/deep/file.ts', content: 'ok' }, workspace);
    const content = await fs.readFile(path.join(workspace, 'backend/src/new/deep/file.ts'), 'utf-8');
    assert.equal(content, 'ok');
  });

  it('write_file blocks path traversal', async () => {
    await assert.rejects(
      () => executeTool('write_file', { path: '../escape.txt', content: 'x' }, workspace),
      /Path traversal/,
    );
  });

  it('read_file blocks path traversal', async () => {
    await assert.rejects(
      () => executeTool('read_file', { path: '../../etc/passwd' }, workspace),
      /Path traversal/,
    );
  });

  it('unknown tool throws', async () => {
    await assert.rejects(
      () => executeTool('rm_rf', {}, workspace),
      /Unknown tool/,
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd runner/shared && node --test --experimental-strip-types --no-warnings fileTools.spec.ts`

Expected: FAIL — `fileTools.ts` does not exist.

- [ ] **Step 3: Implement `runner/shared/fileTools.ts`**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
}

export interface FileToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const FILE_TOOL_SCHEMAS: FileToolSchema[] = [
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
        additionalProperties: false,
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
          path: { type: 'string', description: 'Path relative to project root' },
        },
        required: ['path'],
        additionalProperties: false,
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
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
];

function resolvePath(workspacePath: string, rel: string): string {
  const normalizedWorkspace = path.resolve(workspacePath);
  const abs = path.resolve(normalizedWorkspace, rel);
  const withSep = normalizedWorkspace.endsWith(path.sep) ? normalizedWorkspace : normalizedWorkspace + path.sep;
  if (abs !== normalizedWorkspace && !abs.startsWith(withSep)) {
    throw new Error(`Path traversal denied: ${rel}`);
  }
  return abs;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  workspacePath: string,
): Promise<unknown> {
  switch (name) {
    case 'list_files': {
      const dir = resolvePath(workspacePath, args.dir as string);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.map<FileEntry>(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
      }));
    }
    case 'read_file': {
      const file = resolvePath(workspacePath, args.path as string);
      const content = await fs.readFile(file, 'utf-8');
      return { content };
    }
    case 'write_file': {
      const file = resolvePath(workspacePath, args.path as string);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, args.content as string, 'utf-8');
      return { success: true, path: args.path };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd runner/shared && node --test --experimental-strip-types --no-warnings fileTools.spec.ts`

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add runner/shared/fileTools.ts runner/shared/fileTools.spec.ts
git commit -m "feat(runner/shared): add fileTools with path traversal protection"
```

---

## Task 4: Implement `agenticLoop.ts` with tests (TDD)

**Files:**
- Create: `runner/shared/agenticLoop.ts`
- Create: `runner/shared/agenticLoop.spec.ts`

- [ ] **Step 1: Write failing tests first**

Create `runner/shared/agenticLoop.spec.ts`:

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAgenticLoop } from './agenticLoop.ts';
import type { ChatMessage, LLMResponse } from './agenticLoop.ts';
import { FILE_TOOL_SCHEMAS } from './fileTools.ts';

let workspace: string;

describe('agenticLoop', () => {
  before(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aid-al-'));
  });
  after(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('stops when LLM returns no tool_calls', async () => {
    let callCount = 0;
    const llm = async (): Promise<LLMResponse> => {
      callCount++;
      return {
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'done' },
        }],
      };
    };

    await runAgenticLoop({
      systemPrompt: 'sys',
      userPrompt: 'user',
      workspacePath: workspace,
      tools: FILE_TOOL_SCHEMAS,
      callLLM: llm,
    });
    assert.equal(callCount, 1);
  });

  it('executes tool_calls and adds tool results to history', async () => {
    let step = 0;
    const observed: ChatMessage[][] = [];

    const llm = async (messages: ChatMessage[]): Promise<LLMResponse> => {
      observed.push([...messages]);
      step++;
      if (step === 1) {
        return {
          choices: [{
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'write_file', arguments: JSON.stringify({ path: 'a.txt', content: 'hi' }) },
              }],
            },
          }],
        };
      }
      return {
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'done' },
        }],
      };
    };

    await runAgenticLoop({
      systemPrompt: 'sys',
      userPrompt: 'user',
      workspacePath: workspace,
      tools: FILE_TOOL_SCHEMAS,
      callLLM: llm,
    });
    assert.equal(step, 2);
    // Verify second call included the tool result message
    const secondCallMessages = observed[1];
    const toolMsg = secondCallMessages.find(m => m.role === 'tool');
    assert.ok(toolMsg, 'tool message must be present in second call');
    assert.equal(toolMsg!.tool_call_id, 'call_1');
    // Verify file was actually written
    const written = await fs.readFile(path.join(workspace, 'a.txt'), 'utf-8');
    assert.equal(written, 'hi');
  });

  it('stops at maxIterations and throws', async () => {
    const llm = async (): Promise<LLMResponse> => ({
      choices: [{
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_x',
            type: 'function',
            function: { name: 'list_files', arguments: JSON.stringify({ dir: '.' }) },
          }],
        },
      }],
    });

    await assert.rejects(
      () => runAgenticLoop({
        systemPrompt: 'sys',
        userPrompt: 'user',
        workspacePath: workspace,
        tools: FILE_TOOL_SCHEMAS,
        callLLM: llm,
        maxIterations: 3,
      }),
      /Max iterations/,
    );
  });

  it('reports tool errors back to LLM instead of throwing', async () => {
    let step = 0;
    let toolResultSeen: string | undefined;
    const llm = async (messages: ChatMessage[]): Promise<LLMResponse> => {
      step++;
      if (step === 1) {
        return {
          choices: [{
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_e',
                type: 'function',
                function: { name: 'read_file', arguments: JSON.stringify({ path: 'missing.txt' }) },
              }],
            },
          }],
        };
      }
      const toolMsg = messages.find(m => m.role === 'tool');
      toolResultSeen = toolMsg?.content as string;
      return {
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'done' },
        }],
      };
    };

    await runAgenticLoop({
      systemPrompt: 'sys',
      userPrompt: 'user',
      workspacePath: workspace,
      tools: FILE_TOOL_SCHEMAS,
      callLLM: llm,
    });
    assert.ok(toolResultSeen?.includes('error'), `expected error in tool result, got: ${toolResultSeen}`);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd runner/shared && node --test --experimental-strip-types --no-warnings agenticLoop.spec.ts`

Expected: FAIL — `agenticLoop.ts` does not exist.

- [ ] **Step 3: Implement `runner/shared/agenticLoop.ts`**

```typescript
import { executeTool, FileToolSchema } from './fileTools.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LLMResponse {
  choices: Array<{
    index: number;
    finish_reason: string;
    message: ChatMessage;
  }>;
}

export type CallLLMFn = (messages: ChatMessage[], tools: FileToolSchema[]) => Promise<LLMResponse>;

export interface AgenticLoopOptions {
  systemPrompt: string;
  userPrompt: string;
  workspacePath: string;
  tools: FileToolSchema[];
  callLLM: CallLLMFn;
  maxIterations?: number;
  onProgress?: (msg: string) => void;
}

export async function runAgenticLoop(opts: AgenticLoopOptions): Promise<void> {
  const max = opts.maxIterations ?? 50;
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.userPrompt },
  ];

  for (let iter = 0; iter < max; iter++) {
    const response = await opts.callLLM(messages, opts.tools);
    const choice = response.choices?.[0];
    if (!choice) throw new Error('LLM returned no choices');

    messages.push(choice.message);

    const toolCalls = choice.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return;

    for (const call of toolCalls) {
      opts.onProgress?.(`Tool: ${call.function.name}`);
      let result: unknown;
      try {
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        result = await executeTool(call.function.name, args, opts.workspacePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { error: message };
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(`Max iterations (${max}) reached without LLM stopping`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd runner/shared && node --test --experimental-strip-types --no-warnings agenticLoop.spec.ts`

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add runner/shared/agenticLoop.ts runner/shared/agenticLoop.spec.ts
git commit -m "feat(runner/shared): add agentic loop with tool_calls handling"
```

---

## Task 5: Extend runner start request protocol

**Files:**
- Modify: `server/src/types/runner.ts`
- Modify: `server/src/exporters/exporters.service.ts`

- [ ] **Step 1: Read current `server/src/types/runner.ts`**

Run: `cat server/src/types/runner.ts`

- [ ] **Step 2: Update type definitions**

If `RunnerPayload` or similar type exists, extend it. Replace/add the interface:

```typescript
export interface ExporterConfig {
  exporterId: string;
  name: string;
  baseUrl: string;
  startPath: string;
}

export interface RunnerStartPayload {
  jobId: string;
  path: string;
  workspacePath?: string;   // absolute path inside shared volume, e.g. /workspace/{projectName}
  projectName?: string;     // used for logging / progress messages
}
```

Both new fields are optional so old exporters (crud-api, demo, contract) that are not being refactored still work.

- [ ] **Step 3: Update `exporters.service.ts` startJob signature**

In `server/src/exporters/exporters.service.ts`, find the `startJob` method and change the payload type:

```typescript
async startJob(
  config: ExporterConfig,
  payload: RunnerStartPayload,
): Promise<void> {
  // ... existing body; no behavior change, just type widening
}
```

Make sure to import `RunnerStartPayload` from `../types/runner`.

- [ ] **Step 4: Run existing server tests to check nothing broke**

Run: `cd server && npm test -- --testPathPattern='orchestrator|exporters'`

Expected: all tests still PASS (we only widened types).

- [ ] **Step 5: Commit**

```bash
git add server/src/types/runner.ts server/src/exporters/exporters.service.ts
git commit -m "feat(orchestrator): extend runner payload with workspacePath and projectName"
```

---

## Task 6: Orchestrator clones workspace in Phase 0

**Files:**
- Modify: `server/src/orchestrator/orchestrator.service.ts`

- [ ] **Step 1: Identify Phase 0 section in `orchestrator.service.ts`**

Look for the block that calls `templateService.renderTemplates(...)` followed by `giteaClient.pushFiles(...)`. Note the current structure — there is no workspace step today.

- [ ] **Step 2: Add workspace root constant near the top of the class**

Inside `OrchestratorService` class body, add:

```typescript
private readonly workspaceRoot = '/workspace';
```

- [ ] **Step 3: Add helper method for git clone on shared volume**

Inside the class, add:

```typescript
private async prepareWorkspace(projectName: string, repoCloneUrl: string): Promise<string> {
  const targetDir = `${this.workspaceRoot}/${projectName}`;
  const { promisify } = await import('node:util');
  const { exec } = await import('node:child_process');
  const execP = promisify(exec);

  // wipe if exists (re-run case)
  await execP(`rm -rf ${targetDir}`);
  await execP(`mkdir -p ${this.workspaceRoot}`);
  await execP(`git clone ${repoCloneUrl} ${targetDir}`);
  // configure git identity so commits succeed later
  await execP(`git -C ${targetDir} config user.email "aid@greact.ru"`);
  await execP(`git -C ${targetDir} config user.name "aid-orchestrator"`);
  return targetDir;
}
```

- [ ] **Step 4: Call `prepareWorkspace` after template push in `runPipeline`**

After the existing `await this.giteaClient.pushFiles(dto.projectName, files, 'chore: initial project scaffold');`, add:

```typescript
this.updateProgress(jobId, 'processing', 'Cloning workspace...');
const workspacePath = await this.prepareWorkspace(dto.projectName, repo.clone_url);
```

Note: `repo.clone_url` must be the authenticated URL that includes the Gitea token so `git clone` and later `git push` work non-interactively. If `GiteaClient.createRepo` does not yet return an authenticated URL, construct it here:

```typescript
const authClone = repo.clone_url.replace(
  'http://',
  `http://${this.giteaUser}:${this.giteaToken}@`,
);
const workspacePath = await this.prepareWorkspace(dto.projectName, authClone);
```

Read `giteaUser` and `giteaToken` from `ConfigService` in the constructor:

```typescript
this.giteaUser = configService.get('GITEA_USER', 'aid');
this.giteaToken = configService.get('GITEA_TOKEN', '');
```

Declare the two as `private readonly` fields on the class.

- [ ] **Step 5: Pass `workspacePath` and `projectName` to every runner start call**

Find the `this.exportersService.startJob(...)` calls in `runPipeline`. Each currently passes `{ jobId, path: dto.dslPath }`. Change them to:

```typescript
await this.exportersService.startJob(prismaConfig, {
  jobId: prismaJob.jobId,
  path: dto.dslPath,
  workspacePath,
  projectName: dto.projectName,
});
```

Same for `nestjsConfig` and `reactAdminConfig` calls.

- [ ] **Step 6: Run orchestrator tests to check compile + existing assertions**

Run: `cd server && npm test -- --testPathPattern='orchestrator'`

Expected: existing tests still PASS (template assertions unchanged; we only added new fields).

- [ ] **Step 7: Commit**

```bash
git add server/src/orchestrator/orchestrator.service.ts
git commit -m "feat(orchestrator): clone repo to shared workspace in Phase 0"
```

---

## Task 7: Orchestrator does final git push, stops extracting files from runner results

**Files:**
- Modify: `server/src/orchestrator/orchestrator.service.ts`

- [ ] **Step 1: Remove file extraction from Phase 1 and Phase 2 result handling**

Delete the calls to `this.extractFilesFromResult(prismaResult)` and the subsequent `giteaClient.pushFiles(...)` for Phase 1. Replace with a no-op progress message:

```typescript
const prismaResult = await this.waitForJob(prismaJob.jobId, 120000);
this.updateProgress(jobId, 'processing', 'Phase 1 complete. Schema written to workspace.');
```

Same for Phase 2: delete the loop that walks `results`, calls `extractFilesFromResult`, aggregates into `allGeneratedFiles`, and calls `giteaClient.pushFiles(...)` with generated code.

Keep the `succeeded` / `failed` tracking — that's still used for progress reporting.

- [ ] **Step 2: Add final git commit+push helper**

Inside the class:

```typescript
private async finalizeWorkspace(workspacePath: string, commitMessage: string): Promise<void> {
  const { promisify } = await import('node:util');
  const { exec } = await import('node:child_process');
  const execP = promisify(exec);

  // Detect if there is anything to commit
  const { stdout } = await execP(`git -C ${workspacePath} status --porcelain`);
  if (stdout.trim().length === 0) {
    this.logger.warn(`No changes in ${workspacePath} to commit`);
    return;
  }

  await execP(`git -C ${workspacePath} add .`);
  await execP(`git -C ${workspacePath} commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
  await execP(`git -C ${workspacePath} push`);
}
```

- [ ] **Step 3: Call `finalizeWorkspace` after Phase 2 results are aggregated**

Replace the Phase 2 Gitea push logic with:

```typescript
this.updateProgress(jobId, 'processing', 'Committing and pushing generated code...');
await this.finalizeWorkspace(workspacePath, 'feat: add generated code');
```

Put this BEFORE the Portainer deploy step, AFTER the `failed.length`/`succeeded.length` branching.

- [ ] **Step 4: Delete `file-parser.ts` and its spec**

```bash
rm server/src/orchestrator/file-parser.ts
rm server/src/orchestrator/file-parser.spec.ts
```

Also search for and remove any `extractFilesFromResult` private method in `orchestrator.service.ts` and any imports of `parseFileOutput` from `file-parser`.

Run: `grep -rn 'file-parser\|extractFilesFromResult\|parseFileOutput' server/src` — expected: no matches after removal.

- [ ] **Step 5: Update orchestrator integration test**

Edit `server/src/orchestrator/orchestrator.integration.spec.ts` — the template-only test already asserts on `renderTemplates` output directly and does NOT use file-parser, so it should still pass. If there are other specs that import `file-parser`, delete those specs.

Run: `cd server && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -u server
git commit -m "refactor(orchestrator): owns all git ops; drop file-parser"
```

---

## Task 8: Prepare runner Dockerfiles to copy shared code

**Files:**
- Modify: `runner/runner-prisma/Dockerfile`
- Modify: `runner/runner-nestjs/Dockerfile`
- Modify: `runner/runner-react-admin/Dockerfile`

All three Dockerfiles currently copy only their own source. They need access to `runner/shared/` and must have `git` installed (future tasks may need it; orchestrator does git ops, but runners can still benefit from having git available for debugging — skip if not strictly needed).

- [ ] **Step 1: Update `runner/runner-prisma/Dockerfile`**

Replace the file with:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy shared package first (leverages docker cache)
COPY runner/shared /app/shared

# Copy runner's own package
COPY runner/runner-prisma/package*.json /app/runner/
WORKDIR /app/runner
RUN npm install
RUN npx prisma --version || true
COPY runner/runner-prisma/. /app/runner/

EXPOSE 3004
CMD ["npm", "start"]
```

- [ ] **Step 2: Update `runner/runner-nestjs/Dockerfile`**

Replace with:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY runner/shared /app/shared

COPY runner/runner-nestjs/package*.json /app/runner/
WORKDIR /app/runner
RUN npm install
COPY runner/runner-nestjs/. /app/runner/

EXPOSE 3005
CMD ["npm", "start"]
```

- [ ] **Step 3: Update `runner/runner-react-admin/Dockerfile`**

Replace with:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY runner/shared /app/shared

COPY runner/runner-react-admin/package*.json /app/runner/
WORKDIR /app/runner
RUN npm install
COPY runner/runner-react-admin/. /app/runner/

EXPOSE 3006
CMD ["npm", "start"]
```

- [ ] **Step 4: Update docker-compose files that build these runners**

For each runner service in `docker-compose.yml` (or whichever compose file builds them — check with `grep -rn 'runner-prisma\|runner-nestjs\|runner-react-admin' *.yml`), ensure the build context is the project root (so `runner/shared` is accessible):

```yaml
  runner-prisma:
    build:
      context: .
      dockerfile: runner/runner-prisma/Dockerfile
    container_name: aid-runner-prisma
    volumes:
      - workspace:/workspace
    networks:
      - proxy
```

Same pattern for nestjs and react-admin runners (ports 3005, 3006 respectively). Every runner service must mount `workspace:/workspace`.

- [ ] **Step 5: Build each runner image to verify Dockerfile works**

Run:
```bash
docker build -f runner/runner-prisma/Dockerfile -t test-runner-prisma .
docker build -f runner/runner-nestjs/Dockerfile -t test-runner-nestjs .
docker build -f runner/runner-react-admin/Dockerfile -t test-runner-react-admin .
```

Expected: all three build successfully, and `/app/shared` is present in each image.

Verify: `docker run --rm test-runner-prisma ls /app/shared` — should list `fileTools.ts`, `agenticLoop.ts`, etc.

- [ ] **Step 6: Commit**

```bash
git add runner/runner-prisma/Dockerfile runner/runner-nestjs/Dockerfile runner/runner-react-admin/Dockerfile docker-compose.yml
git commit -m "chore(runner): mount workspace volume and include shared code in images"
```

---

## Task 9: Refactor runner-prisma to agentic mode

**Files:**
- Modify: `runner/runner-prisma/src/index.ts`
- Modify: `runner/runner-prisma/src/llmClient.ts`
- Delete: `runner/runner-prisma/src/writeResult.ts`
- Modify: `runner/runner-prisma/package.json` (add reference to shared)

- [ ] **Step 1: Add `@aid/runner-shared` dependency via relative path**

Edit `runner/runner-prisma/package.json`:

```json
{
  "name": "runner-prisma",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@aid/runner-shared": "file:../shared",
    "dotenv": "^16.4.0",
    "express": "^5.1.0",
    "prisma": "^6.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.9.0"
  }
}
```

Run: `cd runner/runner-prisma && npm install`

Expected: `@aid/runner-shared` symlinked to `../shared`.

- [ ] **Step 2: Rewrite `runner/runner-prisma/src/llmClient.ts`**

```typescript
import { config } from './config.js';
import { fetchPrismaDocs } from './context7.js';
import {
  ChatMessage,
  LLMResponse,
  CallLLMFn,
  FILE_TOOL_SCHEMAS,
  runAgenticLoop,
} from '@aid/runner-shared';

const SYSTEM_PROMPT = `You are a Prisma schema generator with file tools.

You operate on a project workspace. Your job: read the DSL description and write a valid \`schema.prisma\` to \`backend/prisma/schema.prisma\`.

Tools available:
- list_files(dir) — inspect workspace structure
- read_file(path) — read any file (the DSL is injected in the first user message; use read_file only for cross-checking existing files)
- write_file(path, content) — write schema.prisma

RULES:
1. Use Prisma 6 syntax with PostgreSQL provider.
2. Always include datasource and generator blocks.
3. Use @id @default(uuid()) for primary keys.
4. Use @relation with explicit fields and references.
5. camelCase field names, PascalCase model names.
6. When schema is complete, write it with write_file and stop calling tools. Do not emit any final assistant text describing the file — just stop.`;

export async function generatePrismaSchemaAgentic(
  dslContent: string,
  workspacePath: string,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const context7Docs = await fetchPrismaDocs();

  const callLLM: CallLLMFn = async (messages, tools) => {
    const body: Record<string, unknown> = {
      model: config.AI_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    };
    if (config.AI_MAX_TOKENS) body.max_tokens = config.AI_MAX_TOKENS;
    if (config.AI_TEMPERATURE !== undefined) body.temperature = config.AI_TEMPERATURE;

    const res = await fetch(config.AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`LLM API error (${res.status}): ${errBody}`);
    }
    return await res.json() as LLMResponse;
  };

  const docsPreamble = context7Docs
    ? `Reference documentation for Prisma schema syntax:\n\n${context7Docs}\n\n---\n\n`
    : '';
  const userPrompt = `${docsPreamble}Generate backend/prisma/schema.prisma for the following DSL entities:\n\n${dslContent}`;

  await runAgenticLoop({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    workspacePath,
    tools: FILE_TOOL_SCHEMAS,
    callLLM,
    onProgress,
  });
}
```

- [ ] **Step 3: Rewrite `runner/runner-prisma/src/index.ts`**

```typescript
import express from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceText } from './fetchSource.js';
import { generatePrismaSchemaAgentic } from './llmClient.js';
import { validatePrismaSchema } from './validator.js';

interface StartRequest {
  jobId: string;
  path: string;
  workspacePath: string;
  projectName: string;
}

const MAX_RETRIES = 2;

async function processJob(jobId: string, sourcePath: string, workspacePath: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Starting Prisma schema generation (agentic mode)...');

    await sendProgress(jobId, 'processing', 'Fetching DSL source...');
    const sourceContent = await fetchSourceText(sourcePath);

    let lastError = '';
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const label = attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : '';
      await sendProgress(jobId, 'processing', `Agentic loop${label}...`);

      let dsl = sourceContent;
      if (attempt > 0 && lastError) {
        dsl += `\n\n--- PREVIOUS ATTEMPT FAILED VALIDATION ---\n${lastError}\nWrite a corrected schema.prisma.`;
      }

      await generatePrismaSchemaAgentic(dsl, workspacePath, (m) => {
        sendProgress(jobId, 'processing', m);
      });

      const schemaPath = path.join(workspacePath, 'backend', 'prisma', 'schema.prisma');
      let schema: string;
      try {
        schema = await fs.readFile(schemaPath, 'utf-8');
      } catch {
        lastError = 'LLM did not write backend/prisma/schema.prisma';
        if (attempt === MAX_RETRIES) throw new Error(lastError);
        continue;
      }

      const result = validatePrismaSchema(schema);
      if (result.valid) {
        if (result.formatted && result.formatted !== schema) {
          await fs.writeFile(schemaPath, result.formatted, 'utf-8');
        }
        await sendProgress(jobId, 'completed', 'Schema generated and validated.');
        return;
      }

      lastError = result.error ?? 'Unknown validation error';
      if (attempt === MAX_RETRIES) {
        throw new Error(`Schema validation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, message);
    await sendProgress(jobId, 'failed', message);
  }
}

const app = express();
app.use(express.json());

app.post('/start', (req, res) => {
  const { jobId, path: sourcePath, workspacePath } = req.body as StartRequest;
  if (!jobId || !sourcePath || !workspacePath) {
    res.status(400).json({ error: 'jobId, path, workspacePath are required' });
    return;
  }
  processJob(jobId, sourcePath, workspacePath);
  res.status(202).json({ received: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', runner: 'prisma' });
});

app.listen(Number(config.PORT), () => {
  console.log(`runner-prisma listening on port ${config.PORT}`);
});
```

- [ ] **Step 4: Delete `writeResult.ts`**

```bash
rm runner/runner-prisma/src/writeResult.ts
```

- [ ] **Step 5: Type-check runner-prisma**

Run: `cd runner/runner-prisma && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add runner/runner-prisma
git commit -m "refactor(runner-prisma): switch to agentic loop with shared tools"
```

---

## Task 10: Refactor runner-nestjs to agentic mode

**Files:**
- Modify: `runner/runner-nestjs/package.json`
- Modify: `runner/runner-nestjs/src/llmClient.ts`
- Modify: `runner/runner-nestjs/src/index.ts`
- Delete: `runner/runner-nestjs/src/writeResult.ts`
- Delete: `runner/runner-nestjs/src/fileParser.ts`

- [ ] **Step 1: Add `@aid/runner-shared` to package.json**

Edit `runner/runner-nestjs/package.json` to add under `dependencies`:

```json
"@aid/runner-shared": "file:../shared"
```

Also ensure `"type": "module"` is set.

Run: `cd runner/runner-nestjs && npm install`

- [ ] **Step 2: Rewrite `runner/runner-nestjs/src/llmClient.ts`**

```typescript
import { config } from './config.js';
import { fetchNestJsDocs } from './context7.js';
import {
  CallLLMFn,
  LLMResponse,
  FILE_TOOL_SCHEMAS,
  runAgenticLoop,
} from '@aid/runner-shared';

const SYSTEM_PROMPT = `You are a NestJS backend code generator with file tools.

You operate on a project workspace. Your job: generate CRUD modules for each DSL entity into \`backend/src/\`.

Tools available:
- list_files(dir) — start by listing \`backend/src\` to see auth and prisma folders already provided
- read_file(path) — READ \`backend/src/prisma/prisma.service.ts\` and \`backend/src/auth/auth.module.ts\` before writing modules that import them; the exact import paths and class names live there
- write_file(path, content) — write each file

RULES:
1. For EACH entity: write {entity}.module.ts, {entity}.controller.ts, {entity}.service.ts, dto/create-{entity}.dto.ts, dto/update-{entity}.dto.ts in \`backend/src/{entity-kebab}/\`.
2. Write ONE \`backend/src/app.module.ts\` that imports ALL entity modules + AuthModule + PrismaService.
3. Every \`*.module.ts\` MUST include PrismaService in its providers array when the corresponding service injects it.
4. Controllers use @UseGuards(JwtAuthGuard), @ApiBearerAuth(), @ApiTags('{entity}').
5. Use EXACT model and field names from \`backend/prisma/schema.prisma\` (read it first).
6. Import PrismaService from '../prisma/prisma.service'; JwtAuthGuard from '../auth/jwt-auth.guard'.
7. Import Prisma types from '@prisma/client', never from 'generated/prisma'.
8. DTOs use class-validator decorators.
9. Controllers implement findAll (GET /), findOne (GET /:id), create (POST /), update (PATCH /:id), remove (DELETE /:id) with skip/take pagination.
10. Entity folder names use kebab-case.
11. When all files are written, stop calling tools. Do not emit a final assistant narrative.`;

export async function generateNestJsBackendAgentic(
  dslContent: string,
  workspacePath: string,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const context7Docs = await fetchNestJsDocs();

  const callLLM: CallLLMFn = async (messages, tools) => {
    const body: Record<string, unknown> = {
      model: config.AI_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    };
    if (config.AI_MAX_TOKENS) body.max_tokens = config.AI_MAX_TOKENS;
    if (config.AI_TEMPERATURE !== undefined) body.temperature = config.AI_TEMPERATURE;

    const res = await fetch(config.AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`LLM API error (${res.status}): ${errBody}`);
    }
    return await res.json() as LLMResponse;
  };

  const docsPreamble = context7Docs
    ? `Reference documentation for NestJS:\n\n${context7Docs}\n\n---\n\n`
    : '';
  const userPrompt = `${docsPreamble}Generate the NestJS backend for these DSL entities:\n\n${dslContent}\n\nStart by listing backend/src/ and reading the existing prisma and auth files.`;

  await runAgenticLoop({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    workspacePath,
    tools: FILE_TOOL_SCHEMAS,
    callLLM,
    onProgress,
    maxIterations: 80,
  });
}
```

- [ ] **Step 3: Rewrite `runner/runner-nestjs/src/index.ts`**

```typescript
import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceText } from './fetchSource.js';
import { generateNestJsBackendAgentic } from './llmClient.js';

interface StartRequest {
  jobId: string;
  path: string;
  workspacePath: string;
  projectName: string;
}

async function processJob(jobId: string, sourcePath: string, workspacePath: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Starting NestJS backend generation (agentic mode)...');
    await sendProgress(jobId, 'processing', 'Fetching DSL source...');
    const dslContent = await fetchSourceText(sourcePath);

    await sendProgress(jobId, 'processing', 'Running agentic loop...');
    await generateNestJsBackendAgentic(dslContent, workspacePath, (m) => {
      sendProgress(jobId, 'processing', m);
    });

    await sendProgress(jobId, 'completed', 'Backend generated.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, message);
    await sendProgress(jobId, 'failed', message);
  }
}

const app = express();
app.use(express.json());

app.post('/start', (req, res) => {
  const { jobId, path: sourcePath, workspacePath } = req.body as StartRequest;
  if (!jobId || !sourcePath || !workspacePath) {
    res.status(400).json({ error: 'jobId, path, workspacePath are required' });
    return;
  }
  processJob(jobId, sourcePath, workspacePath);
  res.status(202).json({ received: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', runner: 'nestjs' });
});

app.listen(Number(config.PORT), () => {
  console.log(`runner-nestjs listening on port ${config.PORT}`);
});
```

- [ ] **Step 4: Delete obsolete files**

```bash
rm runner/runner-nestjs/src/writeResult.ts
rm runner/runner-nestjs/src/fileParser.ts
```

- [ ] **Step 5: Type-check**

Run: `cd runner/runner-nestjs && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add runner/runner-nestjs
git commit -m "refactor(runner-nestjs): switch to agentic loop with shared tools"
```

---

## Task 11: Refactor runner-react-admin to agentic mode

**Files:**
- Modify: `runner/runner-react-admin/package.json`
- Modify: `runner/runner-react-admin/src/llmClient.ts`
- Modify: `runner/runner-react-admin/src/index.ts`
- Delete: `runner/runner-react-admin/src/writeResult.ts`
- Delete: `runner/runner-react-admin/src/fileParser.ts`

- [ ] **Step 1: Add shared dependency**

Edit `runner/runner-react-admin/package.json` — add `"@aid/runner-shared": "file:../shared"` under `dependencies` and set `"type": "module"`.

Run: `cd runner/runner-react-admin && npm install`

- [ ] **Step 2: Rewrite `runner/runner-react-admin/src/llmClient.ts`**

```typescript
import { config } from './config.js';
import { fetchReactAdminDocs } from './context7.js';
import {
  CallLLMFn,
  LLMResponse,
  FILE_TOOL_SCHEMAS,
  runAgenticLoop,
} from '@aid/runner-shared';

const SYSTEM_PROMPT = `You are a React Admin frontend code generator with file tools.

You operate on a project workspace. Your job: generate admin UI into \`frontend/src/\`.

Tools:
- list_files(dir) — start by listing \`frontend/src\` to see authProvider.ts and dataProvider.ts already provided
- read_file(path) — READ \`frontend/src/authProvider.ts\` and \`frontend/src/dataProvider.ts\` before App.tsx; read \`backend/prisma/schema.prisma\` for field names
- write_file(path, content) — write each file

RULES:
1. Write ONE \`frontend/src/App.tsx\` with <Admin> containing all <Resource> declarations.
2. For EACH entity write \`frontend/src/resources/{entity-kebab}/\`: {Entity}List.tsx, {Entity}Edit.tsx, {Entity}Create.tsx, {Entity}Show.tsx, index.ts (barrel).
3. Write \`frontend/src/main.tsx\` entry point that imports App and renders it; call initKeycloak() before rendering.
4. Map Prisma types: String→TextField/TextInput, Int/Float→NumberField/NumberInput, Boolean→BooleanField/BooleanInput, DateTime→DateField/DateInput, enum→SelectField/SelectInput, relation→ReferenceField/ReferenceInput.
5. List views use <DataTable> with <DataTable.Col>.
6. Edit/Create use <SimpleForm>; Show uses <SimpleShowLayout>.
7. Import authProvider from './authProvider', dataProvider from './dataProvider'.
8. Use EXACT field names from schema.prisma.
9. Do NOT regenerate authProvider.ts or dataProvider.ts — read them, import from them.
10. When all files are written, stop calling tools.`;

export async function generateReactAdminAgentic(
  dslContent: string,
  workspacePath: string,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const context7Docs = await fetchReactAdminDocs();

  const callLLM: CallLLMFn = async (messages, tools) => {
    const body: Record<string, unknown> = {
      model: config.AI_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    };
    if (config.AI_MAX_TOKENS) body.max_tokens = config.AI_MAX_TOKENS;
    if (config.AI_TEMPERATURE !== undefined) body.temperature = config.AI_TEMPERATURE;

    const res = await fetch(config.AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`LLM API error (${res.status}): ${errBody}`);
    }
    return await res.json() as LLMResponse;
  };

  const docsPreamble = context7Docs
    ? `Reference documentation for React Admin:\n\n${context7Docs}\n\n---\n\n`
    : '';
  const userPrompt = `${docsPreamble}Generate the React Admin frontend for these DSL entities:\n\n${dslContent}\n\nStart by listing frontend/src/ and reading the existing authProvider and dataProvider.`;

  await runAgenticLoop({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    workspacePath,
    tools: FILE_TOOL_SCHEMAS,
    callLLM,
    onProgress,
    maxIterations: 80,
  });
}
```

- [ ] **Step 3: Rewrite `runner/runner-react-admin/src/index.ts`**

```typescript
import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceText } from './fetchSource.js';
import { generateReactAdminAgentic } from './llmClient.js';

interface StartRequest {
  jobId: string;
  path: string;
  workspacePath: string;
  projectName: string;
}

async function processJob(jobId: string, sourcePath: string, workspacePath: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Starting React Admin generation (agentic mode)...');
    await sendProgress(jobId, 'processing', 'Fetching DSL source...');
    const dslContent = await fetchSourceText(sourcePath);

    await sendProgress(jobId, 'processing', 'Running agentic loop...');
    await generateReactAdminAgentic(dslContent, workspacePath, (m) => {
      sendProgress(jobId, 'processing', m);
    });

    await sendProgress(jobId, 'completed', 'Frontend generated.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, message);
    await sendProgress(jobId, 'failed', message);
  }
}

const app = express();
app.use(express.json());

app.post('/start', (req, res) => {
  const { jobId, path: sourcePath, workspacePath } = req.body as StartRequest;
  if (!jobId || !sourcePath || !workspacePath) {
    res.status(400).json({ error: 'jobId, path, workspacePath are required' });
    return;
  }
  processJob(jobId, sourcePath, workspacePath);
  res.status(202).json({ received: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', runner: 'react-admin' });
});

app.listen(Number(config.PORT), () => {
  console.log(`runner-react-admin listening on port ${config.PORT}`);
});
```

- [ ] **Step 4: Delete obsolete files**

```bash
rm runner/runner-react-admin/src/writeResult.ts
rm runner/runner-react-admin/src/fileParser.ts
```

- [ ] **Step 5: Type-check**

Run: `cd runner/runner-react-admin && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add runner/runner-react-admin
git commit -m "refactor(runner-react-admin): switch to agentic loop with shared tools"
```

---

## Task 12: Delete old shared file parser

**Files:**
- Delete: `runner/shared/fileParser.ts`

- [ ] **Step 1: Confirm nothing imports it**

Run: `grep -rn 'fileParser\|parseFileOutput' runner/`

Expected: only matches inside `runner/shared/fileParser.ts` itself.

- [ ] **Step 2: Delete the file**

```bash
rm runner/shared/fileParser.ts
```

- [ ] **Step 3: Commit**

```bash
git add -u runner/shared
git commit -m "chore(runner/shared): remove obsolete fileParser"
```

---

## Task 13: End-to-end integration smoke test

**Files:**
- Modify (only if needed): `server/src/orchestrator/orchestrator.integration.spec.ts`

- [ ] **Step 1: Run full server test suite**

Run: `cd server && npm test`

Expected: all PASS. The template integration test asserts on `TemplateService.renderTemplates` output, which is unchanged.

- [ ] **Step 2: Local Docker Compose smoke test**

Run:
```bash
docker compose down -v           # nukes old workspace volume
docker compose up -d --build
docker compose logs -f backend   # verify startup
```

Expected: all services come up healthy. `docker volume ls | grep workspace` shows the volume exists.

- [ ] **Step 3: Trigger a test generation (manual)**

Using whatever the existing trigger is (HTTP POST to the orchestrator endpoint with a `projectName`, `domain`, `dslPath`), kick off one full run against a small known DSL.

Watch progress via SSE (`/api/jobs/{jobId}/sse`). Expect progress messages to include:
- "Rendering project templates..."
- "Cloning workspace..."
- "Phase 1: Generating Prisma schema..."
- "Tool: list_files" / "Tool: read_file" / "Tool: write_file" (from agentic loop progress callback)
- "Phase 1 complete. Schema written to workspace."
- "Phase 2: Generating backend and frontend in parallel..."
- Two streams of "Tool: ..." messages interleaved
- "Committing and pushing generated code..."
- "Generation complete..."

- [ ] **Step 4: Verify Gitea repo state**

Browse the Gitea repo for the test project. Expect:
- Static templates present (docker-compose.yml, Dockerfiles, nginx.conf)
- `backend/prisma/schema.prisma` with generated models
- `backend/src/<entity>/` folders with module/controller/service/dto files
- `backend/src/app.module.ts` with PrismaService in providers of every module that injects it (manually spot-check 2-3 modules)
- `frontend/src/App.tsx` with all resources, `frontend/src/resources/<entity>/` folders with List/Edit/Create/Show/index.ts

- [ ] **Step 5: Verify deployed stack**

If Portainer deploy succeeded, check that the backend container starts (no `PrismaService` DI errors) and frontend renders (no Keycloak redirect loop).

- [ ] **Step 6: Commit any test adjustments made during verification**

If any test files were updated during this smoke test pass:

```bash
git add -u
git commit -m "test: adjust integration tests after agentic refactor"
```

---

## Task 14: Document the new pipeline in EXPORTER_DEV_GUIDE

**Files:**
- Modify: `runner/EXPORTER_DEV_GUIDE.md`

- [ ] **Step 1: Read existing guide**

Run: `cat runner/EXPORTER_DEV_GUIDE.md`

- [ ] **Step 2: Append a new section explaining the agentic mode**

Add a section near the bottom:

```markdown
## Agentic Mode (since 2026-04-14)

runner-prisma, runner-nestjs, and runner-react-admin now run in agentic mode:

- Each runner receives `workspacePath` in its start request.
- The workspace is a subdirectory of `/workspace`, shared between all runners via a Docker volume, and is pre-populated by the orchestrator with a `git clone` of the project repo (which already contains static templates).
- The runner does not return generated files in the job completion payload. It calls `runAgenticLoop` from `@aid/runner-shared`, which invokes the LLM in a multi-turn conversation with `list_files`, `read_file`, `write_file` tools against the workspace.
- After Phase 2, the orchestrator runs `git add . && git commit && git push` against the workspace.
- Legacy exporters (crud-api, demo, contract) continue to work with the old `{jobId, path}` payload — the new `workspacePath` and `projectName` fields are optional on the shared payload type.
```

- [ ] **Step 3: Commit**

```bash
git add runner/EXPORTER_DEV_GUIDE.md
git commit -m "docs(runner): document agentic mode in exporter guide"
```

---

## Verification Checklist (end of plan)

- [ ] `runner/shared/` has `fileTools.ts`, `agenticLoop.ts`, their specs, package.json, tsconfig.json
- [ ] `runner/shared/fileParser.ts` deleted
- [ ] All three runners (prisma, nestjs, react-admin) import from `@aid/runner-shared`
- [ ] No runner has `writeResult.ts` or `fileParser.ts`
- [ ] `server/src/orchestrator/file-parser.ts` and its spec deleted
- [ ] `orchestrator.service.ts` clones in Phase 0, does final git push after Phase 2, does NOT extract files from runner results
- [ ] `docker-compose.yml` has `workspace` named volume, mounted to backend + three runners
- [ ] Runner Dockerfiles build with project-root context and include `/app/shared`
- [ ] `server && npm test` PASS
- [ ] End-to-end smoke test produces a valid Gitea repo with both backend and frontend
- [ ] EXPORTER_DEV_GUIDE documents the new mode
