import { config } from './config.js';

async function ensureDir(dirPath: string): Promise<void> {
  if (!dirPath) return;
  await fetch(`${config.CALLBACK_BASE_URL}/api/fs/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath, recursive: true }),
  });
}

export async function writeResultFile(filePath: string, content: string): Promise<void> {
  // Ensure parent directory exists
  const dir = filePath.includes('/') ? filePath.replace(/\/[^/]+$/, '') : '';
  await ensureDir(dir);

  // Try createFile first (new file), fall back to writeFile (overwrite)
  const createRes = await fetch(`${config.CALLBACK_BASE_URL}/api/fs/createFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  if (createRes.ok) return;

  const writeRes = await fetch(`${config.CALLBACK_BASE_URL}/api/fs/writeFile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  if (!writeRes.ok) {
    const body = await writeRes.text();
    throw new Error(`Failed to write ${filePath}: ${writeRes.status} ${body}`);
  }
}
