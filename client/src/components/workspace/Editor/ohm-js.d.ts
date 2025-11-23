declare module 'ohm-js' {
  export interface Grammar {
    match(input: string, startRule?: string): MatchResult;
    createSemantics(): Semantics;
  }

  export interface MatchResult {
    succeeded(): boolean;
    failed(): boolean;
    getRightmostFailurePosition(): number;
    getExpectedText(): string;
  }

  export interface Semantics {
    addOperation<T = any>(name: string, operations: ActionDict): SemanticOperation<T>;
  }

  export interface SemanticOperation<T = any> {
    (match: MatchResult): T;
  }

  export interface ActionDict {
    [key: string]: (...args: any[]) => any;
  }

  export function grammar(source: string): Grammar;
}

