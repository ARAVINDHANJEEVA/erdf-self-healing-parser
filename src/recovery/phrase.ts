/**
 * Phrase-level syntax error recovery generator.
 * Proposes safe, locally plausible delimiter and separator insertions (e.g. missing ')', ';', '}')
 * and speculatively validates them before committing.
 */

import {
  CostBreakdown,
  Edit,
  ParserCheckpoint,
  RepairCandidate,
  Token,
  TokenKind,
} from '../language/types';
import { isStatementStart } from '../language/tokenKinds';
import { createSyntheticToken } from '../language/lexer';
import { runSpeculativeParse } from '../parser/speculativeRunner';
import { DEFAULT_CONFIG } from '../config/defaultConfig';

let phraseCandidateCounter = 0;

export function resetPhraseCandidateCounter(): void {
  phraseCandidateCounter = 0;
}

export function generatePhraseLevelCandidates(
  baseTokens: readonly Token[],
  checkpoint: ParserCheckpoint,
  expectedKind: TokenKind,
  actualToken: Token,
  windowSize: number = 4
): RepairCandidate[] {
  const candidates: RepairCandidate[] = [];
  const pos = checkpoint.cursor;

  // 1. Missing RPAREN before block or statement terminator
  if (
    expectedKind === 'RPAREN' &&
    (actualToken.kind === 'LBRACE' ||
      actualToken.kind === 'SEMICOLON' ||
      actualToken.kind === 'COMMA' ||
      isStatementStart(actualToken.kind) ||
      actualToken.kind === 'EOF')
  ) {
    const synth = createSyntheticToken(
      'RPAREN',
      ')',
      actualToken.span,
      `Inserted missing closing parenthesis ')' before '${actualToken.lexeme || actualToken.kind}'`,
      ++phraseCandidateCounter
    );

    const edits: Edit[] = [{ action: 'insert', position: pos, token: synth }];
    const candidate = buildCandidate('phrase', edits, [expectedKind], baseTokens, checkpoint, windowSize, [
      `Phrase insertion: missing ')' before '${actualToken.lexeme || actualToken.kind}'`,
    ]);
    candidates.push(candidate);
  }

  // 2. Missing SEMICOLON before next statement or block end
  if (
    expectedKind === 'SEMICOLON' &&
    (isStatementStart(actualToken.kind) ||
      actualToken.kind === 'RBRACE' ||
      actualToken.kind === 'EOF')
  ) {
    const synth = createSyntheticToken(
      'SEMICOLON',
      ';',
      actualToken.span,
      `Inserted missing statement terminator ';' before '${actualToken.lexeme || actualToken.kind}'`,
      ++phraseCandidateCounter
    );

    const edits: Edit[] = [{ action: 'insert', position: pos, token: synth }];
    const candidate = buildCandidate('phrase', edits, [expectedKind], baseTokens, checkpoint, windowSize, [
      `Phrase insertion: missing ';' before '${actualToken.lexeme || actualToken.kind}'`,
    ]);
    candidates.push(candidate);
  }

  // 3. Missing RBRACE before next top-level statement or EOF
  if (
    expectedKind === 'RBRACE' &&
    (actualToken.kind === 'EOF' || isStatementStart(actualToken.kind))
  ) {
    const synth = createSyntheticToken(
      'RBRACE',
      '}',
      actualToken.span,
      `Inserted missing closing block brace '}' before '${actualToken.lexeme || actualToken.kind}'`,
      ++phraseCandidateCounter
    );

    const edits: Edit[] = [{ action: 'insert', position: pos, token: synth }];
    const candidate = buildCandidate('phrase', edits, [expectedKind], baseTokens, checkpoint, windowSize, [
      `Phrase insertion: missing '}' before '${actualToken.lexeme || actualToken.kind}'`,
    ]);
    candidates.push(candidate);
  }

  return candidates;
}

function buildCandidate(
  strategy: 'phrase',
  edits: readonly Edit[],
  expected: readonly TokenKind[],
  baseTokens: readonly Token[],
  checkpoint: ParserCheckpoint,
  windowSize: number,
  reasons: string[]
): RepairCandidate {
  const tokenKind = edits[0]?.token?.kind || 'SEMICOLON';
  const lexCost = DEFAULT_CONFIG.baseLexicalCosts[tokenKind] ?? DEFAULT_CONFIG.defaultLexicalCost;

  const cost: CostBreakdown = {
    lexical: lexCost,
    structural: 0,
    semanticRisk: 0,
    diagnostic: 0,
    total: lexCost,
  };

  const spec = runSpeculativeParse(baseTokens, checkpoint, edits, windowSize);

  const status = spec.outcome === 'pass' ? 'generated' : 'rejected';
  if (spec.outcome === 'fail') {
    reasons.push('Speculative lookahead validation failed: secondary syntax error encountered.');
  }

  return {
    id: `cand-${strategy}-${++phraseCandidateCounter}`,
    strategy,
    edits,
    expected,
    cost,
    validation: {
      window: windowSize,
      sourceTokensProgressed: spec.sourceTokensProgressed,
      outcome: spec.outcome,
      failures: spec.failures,
    },
    status,
    reasons,
  };
}
