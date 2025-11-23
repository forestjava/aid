import * as ohm from 'ohm-js';
import grammarSource from '../../../../../grammar.ohm?raw';

export const dslGrammar = ohm.grammar(grammarSource);