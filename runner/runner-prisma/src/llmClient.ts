import { config } from './config.js';
import { fetchPrismaDocs } from './context7.js';
import { runAgenticLoop, FILE_TOOL_SCHEMAS } from '@aid/runner-shared';
import type { CallLLMFn, LLMResponse } from '@aid/runner-shared';

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
    body.provider = {
      allow_fallbacks: true,
    };

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
