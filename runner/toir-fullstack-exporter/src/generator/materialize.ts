import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const MOCK_DIR = fileURLToPath(new URL('../../context/mock-project', import.meta.url));

const TEXT_EXTS = new Set(['.yml', '.yaml', '.html', '.htm', '.conf', '.txt', '.md', '.json']);
const TEXT_BASENAMES = new Set(['Dockerfile']);

/**
 * Copies the bundled mock-project directory to /tmp/jobs/{jobId}/ and replaces
 * placeholder tokens (__SLUG__, __EXTERNAL_NET__) inside text files.
 *
 * @returns absolute path to the materialized working directory
 */
export async function materializeMockProject(jobId: string, slug: string): Promise<string> {
  const targetDir = `/tmp/jobs/${jobId}`;

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(MOCK_DIR, targetDir, { recursive: true });

  await replaceInDir(targetDir, {
    __SLUG__: slug,
    __EXTERNAL_NET__: config.PORTAINER_EXTERNAL_NETWORK,
  });

  console.log(`[materialize] Mock project copied to ${targetDir} (slug=${slug})`);
  return targetDir;
}

async function replaceInDir(dir: string, replacements: Record<string, string>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await replaceInDir(full, replacements);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTS.has(ext) && !TEXT_BASENAMES.has(entry.name)) continue;

    const original = await fs.readFile(full, 'utf8');
    let next = original;
    for (const [token, value] of Object.entries(replacements)) {
      next = next.split(token).join(value);
    }
    if (next !== original) {
      await fs.writeFile(full, next);
    }
  }
}
