import * as fs from 'fs';
import * as path from 'path';

let cached: string | null = null;

// shared/docs/field-contract.md is copied into every runner's image by its
// Dockerfile (COPY runner/shared /app/shared), so resolve relative to this file.
export function loadFieldContract(): string {
  if (cached !== null) return cached;

  const docPath = path.join(
    import.meta.dirname ?? __dirname,
    'docs',
    'field-contract.md',
  );
  try {
    cached = fs.readFileSync(docPath, 'utf-8');
  } catch {
    console.warn(`field-contract.md not found at ${docPath}, proceeding without`);
    cached = '';
  }
  return cached;
}
