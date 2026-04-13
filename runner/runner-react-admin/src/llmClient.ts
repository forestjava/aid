import { config } from './config.js';
import { fetchReactAdminDocs } from './context7.js';

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
interface ChatResponse { choices: { message: { content: string } }[]; error?: { message: string }; }

const SYSTEM_PROMPT = `You are a React Admin frontend code generator. You generate React Admin 5.x components from entity descriptions and a Prisma schema.

OUTPUT FORMAT:
Respond with multiple files using this exact format (no other text):
===FILE: path/to/file.tsx===
<file content>
===END_FILE===

RULES:
1. Generate ONE App.tsx with <Admin> component containing all <Resource> declarations.
2. For EACH entity generate: {Entity}List.tsx, {Entity}Edit.tsx, {Entity}Create.tsx, {Entity}Show.tsx in resources/{entity}/ folder.
3. Use the EXACT field names from the provided schema.prisma.
4. Map Prisma types to React Admin fields:
   - String → <TextField>, <TextInput>
   - Int/Float → <NumberField>, <NumberInput>
   - Boolean → <BooleanField>, <BooleanInput>
   - DateTime → <DateField>, <DateInput>
   - Enum → <SelectField>, <SelectInput> with choices
   - Relation (foreign key) → <ReferenceField>, <ReferenceInput>
5. List views use <DataTable> with <DataTable.Col> for each visible field.
6. Edit/Create forms use <SimpleForm> with appropriate input components.
7. Show views use <SimpleShowLayout> with field components.
8. Import authProvider from './authProvider' and dataProvider from './dataProvider' in App.tsx.
9. Do NOT generate authProvider.ts or dataProvider.ts — they are provided as static references.
10. App.tsx must call initKeycloak() before rendering <Admin>.
11. Entity folder names use kebab-case: equipment-status/, not EquipmentStatus/.
12. Generate a main.tsx entry point that imports App and renders it.
13. For EACH entity folder, generate an index.ts barrel export file that re-exports all components. Example:
    // resources/equipment/index.ts
    export { EquipmentList } from './EquipmentList';
    export { EquipmentEdit } from './EquipmentEdit';
    export { EquipmentCreate } from './EquipmentCreate';
    export { EquipmentShow } from './EquipmentShow';
14. In App.tsx, import from the barrel: import { EquipmentList, ... } from './resources/equipment';`;

export async function generateReactAdminFrontend(dslContent: string, prismaSchema: string, authReference: string): Promise<string> {
  const context7Docs = await fetchReactAdminDocs();
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (context7Docs) {
    messages.push({ role: 'user', content: `Reference documentation for React Admin:\n\n${context7Docs}` });
    messages.push({ role: 'assistant', content: 'Understood. I will follow React Admin patterns from the documentation.' });
  }
  messages.push({
    role: 'user',
    content: `## Prisma Schema (source of truth for types and field names)\n\n\`\`\`prisma\n${prismaSchema}\n\`\`\`\n\n## Auth Reference Code (DO NOT regenerate these, import from them)\n\n${authReference}\n\n## DSL Entity Descriptions\n\n${dslContent}\n\nGenerate the complete React Admin frontend. Use ===FILE: path=== ... ===END_FILE=== format.`,
  });

  const body: Record<string, unknown> = { model: config.AI_MODEL, messages };
  if (config.AI_MAX_TOKENS) body.max_tokens = config.AI_MAX_TOKENS;
  if (config.AI_TEMPERATURE !== undefined) body.temperature = config.AI_TEMPERATURE;

  const res = await fetch(config.AI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.AI_API_KEY}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) { const errBody = await res.text(); throw new Error(`LLM API error (${res.status}): ${errBody}`); }
  const data = await res.json() as ChatResponse;
  if (data.error) throw new Error(`LLM error: ${data.error.message}`);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty response');
  return content;
}
