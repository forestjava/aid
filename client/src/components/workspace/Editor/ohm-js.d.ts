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

  export interface Node {
    source: Interval;
    sourceString: string;
    children: Node[];
    ctorName: string;
    isTerminal(): boolean;
    isNonterminal(): boolean;
  }

  export interface Interval {
    startIdx: number;
    endIdx: number;
    contents: string;
  }

  export interface Semantics {
    addOperation<T = any>(name: string, operations: ActionDict<T>): Semantics;
    (match: MatchResult): SemanticAdapter;
  }

  export interface SemanticAdapter {
    [key: string]: any;
  }

  export interface ActionDict<T = any> {
    [key: string]: (...args: Node[]) => T;
    _terminal?: (this: Node) => T;
    _iter?: (...children: Node[]) => T;
    _nonterminal?: (...children: Node[]) => T;
  }

  export function grammar(source: string): Grammar;
}

