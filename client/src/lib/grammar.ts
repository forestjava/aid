import * as ohm from 'ohm-js';
import grammarSource from '@shared/grammar.ohm?raw';

export const dslGrammar = ohm.grammar(grammarSource);

