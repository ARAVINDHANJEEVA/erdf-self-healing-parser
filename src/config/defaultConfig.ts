import { TokenKind } from '../language/types';

export interface CostWeights {
  readonly structural: number;
  readonly semanticRisk: number;
  readonly diagnostic: number;
}

export interface PruningBudgets {
  readonly maxCost: number;
  readonly maxEdits: number;
  readonly maxExploredStates: number;
  readonly lookaheadWindow: number;
}

export interface RecoveryConfig {
  readonly grammarVersion: string;
  readonly engineVersion: string;
  readonly weights: CostWeights;
  readonly baseLexicalCosts: Partial<Record<TokenKind, number>>;
  readonly defaultLexicalCost: number;
  readonly budgets: PruningBudgets;
  readonly ambiguityThreshold: number;
}

export const DEFAULT_CONFIG: RecoveryConfig = {
  grammarVersion: 'minilang-0.1.0',
  engineVersion: 'erdf-2.0.0',
  weights: {
    structural: 3.0,
    semanticRisk: 4.0,
    diagnostic: 2.5,
  },
  baseLexicalCosts: {
    SEMICOLON: 1.0,
    RPAREN: 1.2,
    RBRACE: 2.0,
    COMMA: 1.0,
    ASSIGN: 2.0,
    PLUS: 1.5,
    MINUS: 1.5,
    STAR: 1.5,
    SLASH: 1.5,
    IDENT: 5.0,
    NUMBER: 4.5,
    STRING: 4.5,
    LET: 3.5,
    IF: 3.5,
    WHILE: 3.5,
    ELSE: 3.0,
  },
  defaultLexicalCost: 2.0,
  budgets: {
    maxCost: 20.0,
    maxEdits: 2,
    maxExploredStates: 60,
    lookaheadWindow: 4,
  },
  ambiguityThreshold: 0.8,
};
