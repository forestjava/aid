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
  // Read from bundled reference files (not from aid filesystem)
  const fs = await import('fs');
  const path = await import('path');
  const refsDir = path.join(import.meta.dirname ?? __dirname, 'refs');
  const files = ['authProvider.ts', 'dataProvider.ts'];
  const contents: string[] = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(refsDir, f), 'utf-8');
      contents.push(`// --- ${f} ---\n${content}`);
    } catch { console.warn(`Could not read reference file: ${f}`); }
  }
  return contents.join('\n\n');
}
