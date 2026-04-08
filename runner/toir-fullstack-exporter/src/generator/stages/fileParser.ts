import type { FileEntry } from './types.js';

/**
 * Parse a per-entity LLM response into FileEntry objects. The expected format
 * is a single JSON object `{"files":[{"path":"...","content":"..."}]}` and the
 * stages prompt for that explicitly. We accept several real-world variants:
 *
 *   1. raw JSON                 — best case
 *   2. JSON inside ```json ...``` (or unlabeled ``` ... ```) fence
 *   3. prose with multiple file blocks where each block is preceded by a path
 *      line (e.g. `### server/src/.../foo.ts` or just the path on its own
 *      line) followed by a fenced code block. Used as a forgiving fallback.
 *
 * Returns an empty array if nothing parseable is found.
 */
export function parseLlmFiles(raw: string): FileEntry[] {
  const fromJson = tryParseJsonFiles(raw);
  if (fromJson.length > 0) return fromJson;

  return tryParseFencedFiles(raw);
}

function tryParseJsonFiles(raw: string): FileEntry[] {
  const candidates: string[] = [];

  // Strategy 1: pull out the first ```json ... ``` (or unlabeled ``` ... ```) fence.
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) candidates.push(fenceMatch[1]);

  // Strategy 2: locate the outermost {...} object containing `"files"`.
  const objMatch = raw.match(/\{[\s\S]*"files"[\s\S]*\}/);
  if (objMatch) candidates.push(objMatch[0]);

  // Strategy 3: try the raw text trimmed.
  candidates.push(raw.trim());

  for (const cand of candidates) {
    try {
      const obj = JSON.parse(cand) as { files?: unknown };
      if (obj && Array.isArray(obj.files)) {
        const out: FileEntry[] = [];
        for (const f of obj.files) {
          if (
            f &&
            typeof f === 'object' &&
            typeof (f as FileEntry).path === 'string' &&
            typeof (f as FileEntry).content === 'string'
          ) {
            out.push({
              path: (f as FileEntry).path,
              content: (f as FileEntry).content,
            });
          }
        }
        if (out.length > 0) return out;
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

/**
 * Forgiving fallback: pair file-path lines with the fenced code block that
 * follows them. Catches responses that ignored the JSON instruction and used
 * markdown sections instead.
 */
function tryParseFencedFiles(raw: string): FileEntry[] {
  const out: FileEntry[] = [];
  // Match: a line containing a path-like token (server/... or client/...),
  // optionally inside backticks or after a markdown header / list marker,
  // followed by a fenced code block on the next non-blank line.
  const re =
    /(?:^|\n)[#>*\-`\s]*([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|json|prisma|md))[`\s]*\n+```[a-zA-Z0-9]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const p = m[1];
    if (p.startsWith('server/') || p.startsWith('client/')) {
      out.push({ path: p, content: m[2] });
    }
  }
  return out;
}

/**
 * Split a list of files into in-zone (kept) and out-of-zone (dropped) buckets
 * based on a required path prefix. The caller is expected to log dropped
 * entries — this helper does no logging itself so it can stay pure.
 */
export function filterByPrefix(
  files: FileEntry[],
  prefix: string,
): { kept: FileEntry[]; dropped: FileEntry[] } {
  const kept: FileEntry[] = [];
  const dropped: FileEntry[] = [];
  for (const f of files) {
    if (f.path.startsWith(prefix)) kept.push(f);
    else dropped.push(f);
  }
  return { kept, dropped };
}
