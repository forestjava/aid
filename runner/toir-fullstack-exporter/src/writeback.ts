import { config } from './config.js';

/**
 * Writes content to a file on the server via the filesystem API.
 * PUT {CALLBACK_BASE_URL}/api/fs/writeFile  body: { path, content }
 */
export async function writeResultFile(filePath: string, content: string): Promise<void> {
  const url = `${config.CALLBACK_BASE_URL}/api/fs/writeFile`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to write file "${filePath}": HTTP ${response.status}: ${body}`);
  }
}
