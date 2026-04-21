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
