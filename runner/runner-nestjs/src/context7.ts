import { config } from './config.js';

const CONTEXT7_BASE = 'https://api.context7.com/v1';
const LIBRARY_ID = '/nestjs/docs.nestjs.com';

const QUERIES = [
  'NestJS CRUD module controller service DTO with Prisma, class-validator, Guards, Swagger decorators',
  'NestJS Pipes ValidationPipe ParseIntPipe, pagination query parameters, exception filters',
];

let cachedDocs: string | null = null;

async function queryContext7(libraryId: string, query: string): Promise<string> {
  const url = `${CONTEXT7_BASE}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ libraryId, query }),
  });
  if (!res.ok) { console.warn(`Context7 query failed (${res.status})`); return ''; }
  const data = await res.json() as { content: string };
  return data.content ?? '';
}

export async function fetchNestJsDocs(): Promise<string> {
  if (cachedDocs) return cachedDocs;
  if (!config.CONTEXT7_ENABLED) { cachedDocs = ''; return cachedDocs; }
  console.log('Fetching NestJS documentation from Context7...');
  const results: string[] = [];
  for (const query of QUERIES) {
    const content = await queryContext7(LIBRARY_ID, query);
    if (content) results.push(content);
  }
  cachedDocs = results.join('\n\n---\n\n');
  console.log(`Context7: cached ${cachedDocs.length} chars of NestJS docs`);
  return cachedDocs;
}
