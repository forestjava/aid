import type { Extension } from '@codemirror/state';
import { dslSyntaxHighlight } from './dsl-syntax-highlight';

/**
 * Языковая поддержка для DSL
 * Использует Ohm грамматику для парсинга и подсветки синтаксиса
 * через ViewPlugin с decorations
 */
export const dslLanguage: Extension = [
  dslSyntaxHighlight
];

