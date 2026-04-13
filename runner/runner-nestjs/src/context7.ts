import * as fs from 'fs';
import * as path from 'path';

let cachedDocs: string | null = null;

export async function fetchNestJsDocs(): Promise<string> {
  if (cachedDocs !== null) return cachedDocs;

  const docsPath = path.join(import.meta.dirname ?? __dirname, 'docs', 'nestjs-reference.md');
  try {
    cachedDocs = fs.readFileSync(docsPath, 'utf-8');
    console.log(`Loaded ${cachedDocs.length} chars of NestJS reference docs`);
  } catch {
    console.warn(`Reference docs not found at ${docsPath}, proceeding without`);
    cachedDocs = '';
  }
  return cachedDocs;
}
