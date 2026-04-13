import { config } from './config.js';
import { fetchNestJsDocs } from './context7.js';

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
interface ChatResponse { choices: { message: { content: string } }[]; error?: { message: string }; }

const SYSTEM_PROMPT = `You are a NestJS backend code generator. You generate NestJS 11 modules from entity descriptions and a Prisma schema.

OUTPUT FORMAT:
Respond with multiple files using this exact format (no other text):
===FILE: path/to/file.ts===
<file content>
===END_FILE===

RULES:
1. Generate for EACH entity: {entity}.module.ts, {entity}.controller.ts, {entity}.service.ts, dto/create-{entity}.dto.ts, dto/update-{entity}.dto.ts
2. Generate ONE app.module.ts that imports ALL entity modules + AuthModule + PrismaService.
3. Controllers use @UseGuards(JwtAuthGuard) on all endpoints.
4. Controllers use @ApiBearerAuth() and @ApiTags('{entity}') Swagger decorators.
5. Services inject PrismaService and use Prisma Client for all DB operations.
6. Use the EXACT model and field names from the provided schema.prisma.
7. DTOs use class-validator decorators: @IsString(), @IsInt(), @IsOptional(), etc.
8. Controllers implement: findAll (GET /), findOne (GET /:id), create (POST /), update (PATCH /:id), remove (DELETE /:id).
9. Use pagination: findAll accepts query params skip/take, returns { data, total }.
10. Import paths: PrismaService from '../prisma/prisma.service', JwtAuthGuard from '../auth/jwt-auth.guard'.
11. Do NOT generate auth or prisma files — they are provided as static references.
12. Entity folder names use kebab-case: equipment-status/, not equipmentStatus/.
13. Do NOT import types from 'generated/prisma'. Instead, import from '@prisma/client'. Example: import { Prisma } from '@prisma/client';
14. Import PrismaService from '../prisma/prisma.service'. Import Prisma namespace from '@prisma/client'.`;

export async function generateNestJsBackend(dslContent: string, prismaSchema: string, authReference: string): Promise<string> {
  const context7Docs = await fetchNestJsDocs();
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  if (context7Docs) {
    messages.push({ role: 'user', content: `Reference documentation for NestJS:\n\n${context7Docs}` });
    messages.push({ role: 'assistant', content: 'Understood. I will follow NestJS patterns from the documentation.' });
  }

  messages.push({
    role: 'user',
    content: `## Prisma Schema (source of truth for types and field names)\n\n\`\`\`prisma\n${prismaSchema}\n\`\`\`\n\n## Auth Reference Code (DO NOT regenerate these, import from them)\n\n${authReference}\n\n## DSL Entity Descriptions\n\n${dslContent}\n\nGenerate the complete NestJS backend. Use ===FILE: path=== ... ===END_FILE=== format.`,
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
