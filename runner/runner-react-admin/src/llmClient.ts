import { config } from './config.js';
import { fetchReactAdminDocs } from './context7.js';
import { runAgenticLoop, FILE_TOOL_SCHEMAS } from '@aid/runner-shared';
import type { CallLLMFn, LLMResponse } from '@aid/runner-shared';

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
