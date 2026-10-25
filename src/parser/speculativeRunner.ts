/**
 * Speculative parsing runner.
 * Clones from a checkpoint, applies a repair candidate patch in a VirtualTokenStream,
 * and parses ahead from the statement boundary up to windowSize without mutating committed parser state.
 */

import { Edit, ParserCheckpoint, Token } from '../language/types';
import { VirtualTokenStream } from './virtualStream';
import { Parser } from './parser';

export interface SpeculativeResult {
  readonly outcome: 'pass' | 'fail' | 'limit';
  readonly sourceTokensProgressed: number;
  readonly failures: number;
  readonly reachedConstructEnd: boolean;
}

export function runSpeculativeParse(
  baseTokens: readonly Token[],
  checkpoint: ParserCheckpoint,
  candidateEdits: readonly Edit[],
  windowSize: number = 4
): SpeculativeResult {
  // Start speculative parse from the beginning of the containing statement
  const startPos = checkpoint.statementStartCursor;

  // 1. Create a virtual stream patched with candidate edits
  const virtualStream = VirtualTokenStream.fromEdits(
    baseTokens,
    candidateEdits,
    startPos
  );

  // 2. Clone a speculative parser at the statement start
  const speculativeParser = new Parser(
    virtualStream,
    [],
    [],
    startPos
  );

  const initialSourceConsumed = virtualStream.getSourceTokensConsumed();
  let failures = 0;
  let reachedConstructEnd = false;

  // 3. Parse forward up to windowSize source tokens
  try {
    while (!virtualStream.isAtEnd()) {
      const progressed =
        virtualStream.getSourceTokensConsumed() - initialSourceConsumed;
      if (progressed >= windowSize) {
        break;
      }

      // If we already parsed the repaired statement and next token is a block delimiter,
      // we have successfully reached the end of the enclosing block construct.
      if (reachedConstructEnd && virtualStream.peek().kind === 'RBRACE') {
        break;
      }

      speculativeParser.parseStatement();
      reachedConstructEnd = true;
    }
  } catch {
    failures++;
  }

  failures += speculativeParser.getDiagnostics().length;
  const sourceTokensProgressed =
    virtualStream.getSourceTokensConsumed() - initialSourceConsumed;

  let outcome: 'pass' | 'fail' | 'limit';
  if (failures === 0 && (sourceTokensProgressed >= windowSize || reachedConstructEnd)) {
    outcome = 'pass';
  } else if (failures > 0) {
    outcome = 'fail';
  } else {
    outcome = 'limit';
  }

  return {
    outcome,
    sourceTokensProgressed,
    failures,
    reachedConstructEnd,
  };
}
