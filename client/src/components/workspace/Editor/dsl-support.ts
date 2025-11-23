import type { Extension } from '@codemirror/state';
import { dslLanguage } from './dsl-language';
import { dslLinter } from './dsl-linter';

// Объединяем все расширения
export const dslSupport: Extension[] = [
  dslLanguage,
  dslLinter,
];

