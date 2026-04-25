import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ohm from 'ohm-js';

function resolveGrammarPath(): string {
  if (process.env.GRAMMAR_PATH) {
    return process.env.GRAMMAR_PATH;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Local dev: src/validator/grammar.ts → aid/shared/grammar.ohm
  const local = path.resolve(here, '../../../../shared/grammar.ohm');
  if (fs.existsSync(local)) return local;
  // Docker image where shared/ is copied next to the package: /app/../shared/grammar.ohm
  const inImage = path.resolve(here, '../../shared/grammar.ohm');
  if (fs.existsSync(inImage)) return inImage;
  throw new Error(`Grammar file not found. Tried: ${local}, ${inImage}. Set GRAMMAR_PATH env to override.`);
}

const grammarSource = fs.readFileSync(resolveGrammarPath(), 'utf-8');

export const dslGrammar: ohm.Grammar = ohm.grammar(grammarSource);
