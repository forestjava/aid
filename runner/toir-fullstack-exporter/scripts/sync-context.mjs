#!/usr/bin/env node
// Syncs static context (prompts, docs, tools) from the toir-automatization
// repository into ./context/ so the production exporter image is self-contained.
// This script runs ON HOST before `docker build`.

import { mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exporterRoot = resolve(__dirname, '..');
const sourceRoot = resolve(exporterRoot, '../../../toir-automatization');
const destRoot = resolve(exporterRoot, 'context');

const PROMPTS = [
  'general-prompt.md',
  'auth-rules.md',
  'backend-rules.md',
  'frontend-rules.md',
  'prisma-rules.md',
  'runtime-rules.md',
  'validation-rules.md',
  'claude-orchestration-rules.md',
];

const DOCS = [
  'repository-structure.md',
  'api-dsl-conventions.md',
  'completion-contract.md',
  'generation-playbook.md',
];

const TOOLS = [
  'api-summary.mjs',
  'generate-api-summary.mjs',
  'validate-generation.mjs',
];

async function assertExists(path, label) {
  try {
    await stat(path);
  } catch (err) {
    throw new Error(`Missing required ${label}: ${path}`);
  }
}

async function syncGroup(subdir, files) {
  const srcDir = join(sourceRoot, subdir);
  const dstDir = join(destRoot, subdir);
  await assertExists(srcDir, `source directory '${subdir}'`);

  // Clear destination subdirectory so deletions in source propagate.
  await rm(dstDir, { recursive: true, force: true });
  await mkdir(dstDir, { recursive: true });

  for (const file of files) {
    const src = join(srcDir, file);
    const dst = join(dstDir, file);
    await assertExists(src, `file '${subdir}/${file}'`);
    await copyFile(src, dst);
    console.log(`\u2192 ${dst}`);
  }
  return files.length;
}

async function main() {
  await assertExists(sourceRoot, "toir-automatization repository");
  await mkdir(destRoot, { recursive: true });

  let total = 0;
  total += await syncGroup('prompts', PROMPTS);
  total += await syncGroup('docs', DOCS);
  total += await syncGroup('tools', TOOLS);

  console.log(`\nSynced ${total} files from toir-automatization`);
}

main().catch((err) => {
  console.error(`\n[sync-context] FAILED: ${err.message}`);
  process.exit(1);
});
