/**
 * Panic-mode synchronization strategy.
 * Safely discards malformed tokens until reaching a synchronization token,
 * producing a PartialNode to record skipped structure without silent erasure.
 */

import { Diagnostic, SourceSpan, Token, TokenKind } from '../language/types';
import { PartialNode, createPartialNode } from '../language/ast';
import { combineSpans } from '../parser/parser';

export interface PanicRecoveryResult {
  readonly status: 'recovered' | 'failed';
  readonly discardedTokens: readonly Token[];
  readonly resyncToken: Token;
  readonly partialNode: PartialNode;
  readonly diagnostic: Diagnostic;
}

export function performPanicRecovery(
  streamConsume: () => Token,
  streamPeek: () => Token,
  streamIsAtEnd: () => boolean,
  syncSet: ReadonlySet<TokenKind>,
  attemptedConstruct: string,
  errorSpan: SourceSpan
): PanicRecoveryResult {
  const discarded: Token[] = [];
  let current = streamPeek();

  // If the offending token is not in syncSet, discard tokens until one is found
  while (!syncSet.has(current.kind) && !streamIsAtEnd()) {
    discarded.push(streamConsume());
    current = streamPeek();
  }

  // Progress guard: If no tokens were discarded and current token is not EOF,
  // consume one token to guarantee cursor progression and avoid infinite loops
  if (discarded.length === 0 && !streamIsAtEnd()) {
    discarded.push(streamConsume());
    current = streamPeek();
  }

  const resyncToken = current;
  const isRecovered = syncSet.has(resyncToken.kind) || streamIsAtEnd();

  const discardSpan: SourceSpan =
    discarded.length > 0
      ? combineSpans(discarded[0].span, discarded[discarded.length - 1].span)
      : errorSpan;

  const discardNames = discarded.map((t) => `'${t.lexeme || t.kind}'`).join(', ');
  const diagId = `diag-panic-${discardSpan.start}`;

  const diagnostic: Diagnostic = {
    id: diagId,
    severity: 'error',
    message: `Syntax error in ${attemptedConstruct}. Discarded tokens [${discardNames}] to resynchronize at '${resyncToken.lexeme || resyncToken.kind}'.`,
    span: discardSpan,
    code: 'RECOVERY_PANIC_DISCARD',
  };

  const partialNode = createPartialNode(
    attemptedConstruct,
    [],
    diagId,
    discardSpan,
    [`panic-${discardSpan.start}`]
  );

  return {
    status: isRecovered ? 'recovered' : 'failed',
    discardedTokens: discarded,
    resyncToken,
    partialNode,
    diagnostic,
  };
}
