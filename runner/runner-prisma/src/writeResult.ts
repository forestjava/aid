import { config } from './config.js';

export async function writeResultFile(filePath: string, content: string): Promise<void> {
  const url = `${config.CALLBACK_BASE_URL}/api/fs/writeFile`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });

  if (!res.ok) {
    throw new Error(`Failed to write ${filePath}: ${res.status} ${res.statusText}`);
  }
}
