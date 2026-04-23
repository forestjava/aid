import * as fs from 'fs';
import * as path from 'path';
import { loadFieldContract } from '@aid/runner-shared';

let cachedDocs: string | null = null;

export async function fetchPrismaDocs(): Promise<string> {
  if (cachedDocs !== null) return cachedDocs;

  const docsPath = path.join(import.meta.dirname ?? __dirname, 'docs', 'prisma-reference.md');
  let prismaDocs = '';
  try {
    prismaDocs = fs.readFileSync(docsPath, 'utf-8');
  } catch {
    console.warn(`Reference docs not found at ${docsPath}, proceeding without`);
  }

  const contract = loadFieldContract();
  cachedDocs = [prismaDocs, contract].filter(Boolean).join('\n\n---\n\n');
  console.log(`Loaded ${cachedDocs.length} chars of Prisma reference + field contract`);
  return cachedDocs;
}
