import { config } from './config.js';

export async function fetchSourceText(path: string): Promise<string> {
  const url = `${config.CALLBACK_BASE_URL}/api/parse/text?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
  const data = await res.json() as { path: string; content: string };
  return data.content;
}

export async function fetchFile(filePath: string): Promise<string> {
  const url = `${config.CALLBACK_BASE_URL}/api/fs/readFile?path=${encodeURIComponent(filePath)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file ${filePath}: ${res.status}`);
  const data = await res.json() as { path: string; content: string };
  return data.content;
}

export async function fetchAuthReference(): Promise<string> {
  const files = [
    'backend/src/auth/auth.module.ts',
    'backend/src/auth/jwt.strategy.ts',
    'backend/src/auth/jwt-auth.guard.ts',
    'backend/src/prisma/prisma.service.ts',
  ];
  const contents: string[] = [];
  for (const f of files) {
    try {
      const content = await fetchFile(f);
      contents.push(`// --- ${f} ---\n${content}`);
    } catch { console.warn(`Could not fetch reference file: ${f}`); }
  }
  return contents.join('\n\n');
}
