import type { ToolDefinition, ToolContext } from './types.js';
import writeFile from './writeFile.js';

const handlers: Record<string, typeof writeFile> = {
  writeFile,
};

export const toolDefinitions: ToolDefinition[] = Object.values(handlers).map((h) => h.definition);

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler.execute(args, context);
}

export type { ToolContext } from './types.js';
