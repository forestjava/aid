import { config } from './config.js';
import { fetchNestJsDocs } from './context7.js';
import { runAgenticLoop, FILE_TOOL_SCHEMAS } from '@aid/runner-shared';
import type { CallLLMFn, LLMResponse } from '@aid/runner-shared';

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
11. Enum fields in DTOs MUST use \`@ApiProperty({ enum: EnumName, enumName: 'EnumName' })\` — NEVER \`@ApiProperty({ type: EnumName })\` (causes "circular dependency" Swagger error).
12. Import enums from '@prisma/client': \`import { EnumName } from '@prisma/client'\`.
13. DTOs contain ONLY scalar fields and foreign key ids (\`xxxId: string\`). DO NOT include relation objects (e.g. no nested \`user: UserDto\` in CreateFooDto). Relations are resolved on the response side only.
14. If you absolutely must reference another DTO class in @ApiProperty, use lazy resolver form: \`@ApiProperty({ type: () => OtherDto })\` — never the bare class.
15. For optional/nullable scalar fields use \`@IsOptional()\` + \`@ApiProperty({ required: false })\`.
16. For @Param() / @Query() parameters typed as Prisma enums: ALWAYS add explicit Swagger decorator immediately above. Example:
    \`\`\`
    @ApiParam({ name: 'newStatus', enum: EquipmentStatus, enumName: 'EquipmentStatus' })
    @Param('newStatus') newStatus: EquipmentStatus,
    \`\`\`
    Without this, Swagger crashes at runtime with "circular dependency" on the enum's first value. The same applies to @ApiQuery for @Query() with enum types.
17. Import \`ApiParam\`, \`ApiQuery\` from '@nestjs/swagger' whenever a controller uses enum-typed @Param or @Query.
18. When all files are written, stop calling tools. Do not emit a final assistant narrative.`;

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
