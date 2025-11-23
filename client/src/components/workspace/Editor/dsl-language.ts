import { StreamLanguage } from '@codemirror/language';
import { dslStreamParser } from './dsl-parser';

// Создаём языковую поддержку
export const dslLanguage = StreamLanguage.define(dslStreamParser);

