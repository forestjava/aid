import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCAFFOLD_DIR = fileURLToPath(new URL('../../context/scaffold', import.meta.url));

export interface ScaffoldResult {
  copied: string[];
  missing: boolean;
}

/**
 * Copies the bundled scaffold templates into the working directory.
 *
 * Phase 7: scaffold templates not yet present, fill in Phase 6.5.
 * For now this function is a no-op when `context/scaffold/` does not exist
 * and reports the missing state so the orchestrator can continue.
 */
export async function copyScaffold(workingDir: string): Promise<ScaffoldResult> {
  const exists = await fs
    .stat(SCAFFOLD_DIR)
    .then((s) => s.isDirectory())
    .catch(() => false);

  if (!exists) {
    return { copied: [], missing: true };
  }

  const copied: string[] = [];
  await copyRecursive(SCAFFOLD_DIR, workingDir, SCAFFOLD_DIR, copied);
  return { copied, missing: false };
}

async function copyRecursive(
  srcDir: string,
  dstDir: string,
  rootSrc: string,
  copied: string[],
): Promise<void> {
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, dstPath, rootSrc, copied);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, dstPath);
      copied.push(path.relative(rootSrc, srcPath));
    }
  }
}
