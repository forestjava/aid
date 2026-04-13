import { config } from './config.js';

const CONTEXT7_BASE = 'https://api.context7.com/v1';
const LIBRARY_ID = '/prisma/prisma';

const QUERIES = [
  'Prisma schema model definition with relations enums PostgreSQL types @id @default @relation one-to-many many-to-many',
  'Prisma @@map @@index @unique @updatedAt DateTime optional fields nullable',
];

let cachedDocs: string | null = null;

async function queryContext7(libraryId: string, query: string): Promise<string> {
  try {
    const url = `${CONTEXT7_BASE}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryId, query }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`Context7 query failed (${res.status}): ${query.slice(0, 50)}...`);
      return '';
    }

    const data = await res.json() as { content: string };
    return data.content ?? '';
  } catch (err) {
    console.warn(`Context7 unreachable: ${err instanceof Error ? err.message : err}`);
    return '';
  }
}

export async function fetchPrismaDocs(): Promise<string> {
  if (cachedDocs) return cachedDocs;

  if (!config.CONTEXT7_ENABLED) {
    cachedDocs = '';
    return cachedDocs;
  }

  console.log('Fetching Prisma documentation from Context7...');
  const results: string[] = [];

  for (const query of QUERIES) {
    const content = await queryContext7(LIBRARY_ID, query);
    if (content) results.push(content);
  }

  cachedDocs = results.join('\n\n---\n\n');
  console.log(`Context7: cached ${cachedDocs.length} chars of Prisma docs`);
  return cachedDocs;
}
