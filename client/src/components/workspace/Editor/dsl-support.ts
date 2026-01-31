import type { Extension } from '@codemirror/state';
import { dslLanguage } from './dsl-language';
import { dslLinter } from './dsl-linter';
import { dslClickToNavigate } from './dsl-click-to-navigate';

// Объединяем все расширения
export const dslSupport: Extension[] = [
  dslLanguage,
  dslLinter,
  dslClickToNavigate,
];

