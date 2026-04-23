import * as fs from 'fs';
import * as path from 'path';
import { loadFieldContract } from '@aid/runner-shared';

let cachedDocs: string | null = null;

export async function fetchReactAdminDocs(): Promise<string> {
  if (cachedDocs !== null) return cachedDocs;

  const docsPath = path.join(import.meta.dirname ?? __dirname, 'docs', 'react-admin-reference.md');
  let raDocs = '';
  try {
    raDocs = fs.readFileSync(docsPath, 'utf-8');
  } catch {
    console.warn(`Reference docs not found at ${docsPath}, proceeding without`);
  }

  const contract = loadFieldContract();
  cachedDocs = [raDocs, contract].filter(Boolean).join('\n\n---\n\n');
  console.log(`Loaded ${cachedDocs.length} chars of React Admin reference + field contract`);
  return cachedDocs;
}
