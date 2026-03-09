import { config } from './config.js';

interface ParseTextResponse {
  path: string;
  content: string;
}

/**
 * Fetches DSL source content from the server's parse API.
 * GET {CALLBACK_BASE_URL}/api/parse/text?path={path}
 */
export async function fetchSourceContent(path: string): Promise<string> {
  const url = `${config.CALLBACK_BASE_URL}/api/parse/text?path=${encodeURIComponent(path)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch source: HTTP ${response.status}: ${body}`);
  }

  const data = (await response.json()) as ParseTextResponse;
  return data.content;
}
