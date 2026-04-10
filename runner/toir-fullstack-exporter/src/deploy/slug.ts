import { createHash } from 'node:crypto';

/**
 * Generates a repo slug in the format gen-{yyyymmdd}-{8charHash}
 * UTC date, hash derived from jobId
 */
export function generateSlug(jobId: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const date = `${yyyy}${mm}${dd}`;

  const hash = createHash('sha1').update(jobId).digest('hex').slice(0, 8);

  return `gen-${date}-${hash}`;
}
