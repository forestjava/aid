import { config } from '../config.js';
import type { ToolDefinition, ToolContext, ToolHandler } from './types.js';

export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'writeFile',
    description:
      'Записывает сгенерированный DSL-контент в файл. Вызови для каждого файла, который нужно создать.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          enum: ['dto', 'api'],
          description: 'Тип файла: dto для DTO-контейнеров, api для API-контейнеров',
        },
        content: {
          type: 'string',
          description: 'Полный DSL-контент файла',
        },
      },
      required: ['filename', 'content'],
      additionalProperties: false,
    },
  },
};

async function writeRemoteFile(filePath: string, content: string): Promise<void> {
  const url = `${config.CALLBACK_BASE_URL}/api/fs/writeFile`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to write file "${filePath}": HTTP ${response.status}: ${body}`);
  }
}

export async function execute(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  const filename = args.filename as string;
  const content = args.content as string;
  const outputPath = `${context.sourcePath}.${filename}`;
  await writeRemoteFile(outputPath, content);
  return outputPath;
}

export default { definition, execute } satisfies ToolHandler;
