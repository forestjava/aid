import { config } from './config.js';

export interface ParsedEntities {
  [entityName: string]: {
    [attributeName: string]: string;
  };
}

export async function fetchParsedEntities(path: string): Promise<ParsedEntities> {
  const url = `${config.CALLBACK_BASE_URL}/api/parse/json?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch parsed entities: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { path: string; entities: ParsedEntities };
  return data.entities;
}

export async function fetchSourceText(path: string): Promise<string> {
  const url = `${config.CALLBACK_BASE_URL}/api/parse/text?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch source text: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { path: string; content: string };
  return data.content;
}
