import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_SUMMARY_TOOL = fileURLToPath(
  new URL('../../context/tools/api-summary.mjs', import.meta.url),
);

/**
 * Phase 6: Context Sync
 *
 * 1. Writes the raw DSL source into `<workingDir>/domain/<name>.api.dsl` so the
 *    validator's Tier-1 check (`Expected at least one domain/*.api.dsl file`)
 *    passes AND so the downstream `buildApiSummary` tool can re-parse it from
 *    the generated project.
 *
 * 2. Generates `api-summary.json` at the repository root via the canonical
 *    `buildApiSummary` helper from `context/tools/api-summary.mjs`. The
 *    validator re-runs `buildApiSummary(rootDir)` and compares it byte-for-byte
 *    against the file on disk, so using the same helper here guarantees the
 *    freshness check passes.
 *
 * Both artifacts are downstream from `contract-freeze` but intentionally
 * derived from the DSL text rather than from `FrozenContract`, because the
 * validator expects the exact shape produced by the tool (which contract-freeze
 * lossily flattens).
 */

interface ApiSummaryToolModule {
  buildApiSummary: (rootDir: string) => unknown;
}

export interface ContextSyncOptions {
  /** Base name for the DSL file written under domain/ (without extension). */
  dslName?: string;
}

export async function syncContext(
  workingDir: string,
  dslContent: string,
  options: ContextSyncOptions = {},
): Promise<void> {
  const dslName = options.dslName ?? 'main';

  // 1. Write the DSL source into domain/ so the validator sees it.
  const domainDir = path.join(workingDir, 'domain');
  await fs.mkdir(domainDir, { recursive: true });
  await fs.writeFile(path.join(domainDir, `${dslName}.api.dsl`), dslContent, 'utf8');

  // 2. Generate api-summary.json using the canonical tool. JSON.stringify with
  //    2-space indent matches what the validator computes as `expected`.
  const mod = (await import(API_SUMMARY_TOOL)) as ApiSummaryToolModule;
  const summary = mod.buildApiSummary(workingDir);
  const serialized = JSON.stringify(summary, null, 2);

  await fs.writeFile(path.join(workingDir, 'api-summary.json'), serialized, 'utf8');
}
