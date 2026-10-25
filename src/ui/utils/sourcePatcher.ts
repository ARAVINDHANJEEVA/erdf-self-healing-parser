/**
 * Smart Source Code Patching Utility.
 * Translates candidate token edits into precise character replacements on sourceCode.
 * Handles intelligent delimiter anchoring, multi-edit consolidation, and batch application
 * in reverse character offset order to guarantee zero index drift.
 */

import { Edit, RepairCandidate, Token, TokenKind } from '../../language/types';

export interface TextReplacement {
  readonly start: number;
  readonly end: number;
  readonly newText: string;
}

interface InternalReplacement extends TextReplacement {
  readonly order: number;
}

/**
 * Returns canonical text representation for a given token kind.
 */
export function getLexemeForKind(kind: TokenKind): string {
  switch (kind) {
    case 'SEMICOLON':
      return ';';
    case 'RPAREN':
      return ')';
    case 'LPAREN':
      return '(';
    case 'RBRACE':
      return '}';
    case 'LBRACE':
      return '{';
    case 'COMMA':
      return ',';
    case 'ASSIGN':
      return '=';
    case 'PLUS':
      return '+';
    case 'MINUS':
      return '-';
    case 'STAR':
      return '*';
    case 'SLASH':
      return '/';
    case 'RETURN':
      return 'return';
    case 'INT':
      return 'int';
    case 'FLOAT':
      return 'float';
    case 'CHAR':
      return 'char';
    case 'DOUBLE':
      return 'double';
    case 'VOID':
      return 'void';
    case 'IF':
      return 'if';
    case 'ELSE':
      return 'else';
    case 'WHILE':
      return 'while';
    case 'FOR':
      return 'for';
    default:
      return kind.toLowerCase();
  }
}

/**
 * Locates the target token within baseTokens using source character span coordinates,
 * falling back to bounded position index if span matching is unavailable.
 * This completely decouples source patching from virtual stream index drift caused by earlier recovery edits.
 */
export function findTargetTokenInBase(
  edit: Edit,
  baseTokens: readonly Token[]
): { targetToken: Token | undefined; targetIndex: number } {
  if (baseTokens.length === 0) {
    return { targetToken: undefined, targetIndex: 0 };
  }

  const targetSpan = edit.token?.span || edit.deletedToken?.span;
  if (targetSpan) {
    // 1. Exact match by span start and end
    const exactIdx = baseTokens.findIndex(
      (t) => t.span.start === targetSpan.start && t.span.end === targetSpan.end
    );
    if (exactIdx !== -1) {
      return { targetToken: baseTokens[exactIdx], targetIndex: exactIdx };
    }

    // 2. Match by span start (e.g. synthetic tokens created with actualToken.span)
    const startIdx = baseTokens.findIndex((t) => t.span.start === targetSpan.start);
    if (startIdx !== -1) {
      return { targetToken: baseTokens[startIdx], targetIndex: startIdx };
    }

    // 3. Match token enclosing the span start
    const enclosingIdx = baseTokens.findIndex(
      (t) => t.span.start <= targetSpan.start && targetSpan.start < t.span.end
    );
    if (enclosingIdx !== -1) {
      return { targetToken: baseTokens[enclosingIdx], targetIndex: enclosingIdx };
    }
  }

  // 4. Fallback: bounded edit.position
  const fallbackIdx = Math.max(0, Math.min(edit.position, baseTokens.length - 1));
  return { targetToken: baseTokens[fallbackIdx], targetIndex: fallbackIdx };
}

/**
 * Determines the smart insertion offset in character coordinates for a synthetic token.
 * Trailing delimiters (e.g. missing semicolons at line ends) are smart-anchored directly
 * after the preceding token instead of prepending to subsequent lines.
 */
function determineInsertPosition(
  edit: Edit,
  baseTokens: readonly Token[],
  sourceCode: string
): number {
  if (baseTokens.length === 0) return 0;

  const { targetToken, targetIndex } = findTargetTokenInBase(edit, baseTokens);
  // For insertion before targetToken:
  // prevToken is the token directly preceding targetToken in the base source code
  // nextToken is the targetToken itself
  const prevToken = targetIndex > 0 ? baseTokens[targetIndex - 1] : undefined;
  const nextToken = targetToken;
  const kind = edit.token?.kind;

  // Statement-terminating semicolon anchoring
  if (kind === 'SEMICOLON' && prevToken) {
    const nextStart = nextToken && nextToken.kind !== 'EOF' ? nextToken.span.start : sourceCode.length;
    const textBetween = sourceCode.slice(prevToken.span.end, nextStart);
    const hasNewline = /[\r\n]/.test(textBetween);

    // If there is a newline between tokens, or next token is block closer / EOF,
    // anchor semicolon directly after previous token (e.g., "return final_sum;")
    if (hasNewline || !nextToken || nextToken.kind === 'EOF' || nextToken.kind === 'RBRACE') {
      return prevToken.span.end;
    }

    // Even on same line, semicolons attach directly to the preceding token
    return prevToken.span.end;
  }

  // Closing parenthesis anchoring
  if (kind === 'RPAREN' && prevToken) {
    const nextStart = nextToken && nextToken.kind !== 'EOF' ? nextToken.span.start : sourceCode.length;
    const textBetween = sourceCode.slice(prevToken.span.end, nextStart);
    const hasNewline = /[\r\n]/.test(textBetween);

    if (hasNewline || nextToken?.kind === 'SEMICOLON' || nextToken?.kind === 'RBRACE') {
      return prevToken.span.end;
    }
  }

  // Closing brace anchoring at EOF or block end
  if (kind === 'RBRACE' && prevToken) {
    if (!nextToken || nextToken.kind === 'EOF') {
      return sourceCode.length;
    }
  }

  // Default: anchor at next token start if available, otherwise previous token end
  if (nextToken && nextToken.kind !== 'EOF') {
    return nextToken.span.start;
  }

  if (prevToken) {
    return prevToken.span.end;
  }

  return 0;
}

/**
 * Converts a candidate's token edits into character-based text replacements.
 */
export function candidateToReplacements(
  candidate: RepairCandidate,
  baseTokens: readonly Token[],
  sourceCode: string,
  baseOrder: number = 0
): InternalReplacement[] {
  const replacements: InternalReplacement[] = [];

  for (let i = 0; i < candidate.edits.length; i++) {
    const edit = candidate.edits[i];
    const order = baseOrder + i;
    const { targetToken } = findTargetTokenInBase(edit, baseTokens);

    switch (edit.action) {
      case 'delete': {
        const tokenToDelete = edit.deletedToken ?? targetToken;
        if (tokenToDelete?.span) {
          replacements.push({
            start: tokenToDelete.span.start,
            end: tokenToDelete.span.end,
            newText: '',
            order,
          });
        }
        break;
      }

      case 'substitute': {
        const tokenToSub = edit.deletedToken ?? targetToken;
        const newText =
          edit.token?.lexeme ?? (edit.token ? getLexemeForKind(edit.token.kind) : '');
        if (tokenToSub?.span) {
          replacements.push({
            start: tokenToSub.span.start,
            end: tokenToSub.span.end,
            newText,
            order,
          });
        }
        break;
      }

      case 'insert': {
        const rawText =
          edit.token?.lexeme ?? (edit.token ? getLexemeForKind(edit.token.kind) : '');
        const insertPos = determineInsertPosition(edit, baseTokens, sourceCode);

        // Ensure alphanumeric keyword/identifier insertions do not fuse with adjacent alphanumeric tokens
        let newText = rawText;
        if (
          /^[a-zA-Z0-9_]/.test(newText) &&
          insertPos > 0 &&
          /[a-zA-Z0-9_]/.test(sourceCode[insertPos - 1])
        ) {
          newText = ' ' + newText;
        }
        if (
          (/[a-zA-Z0-9_]$/.test(newText) || newText.endsWith('}')) &&
          insertPos < sourceCode.length &&
          /[a-zA-Z0-9_]/.test(sourceCode[insertPos])
        ) {
          newText = newText + ' ';
        }

        replacements.push({
          start: insertPos,
          end: insertPos,
          newText,
          order,
        });
        break;
      }
    }
  }

  return replacements;
}

/**
 * Merges overlapping or co-located replacements and sorts them in descending start order
 * for safe sequential application without index drift.
 */
export function mergeAndSortReplacements(
  replacements: readonly InternalReplacement[]
): TextReplacement[] {
  if (replacements.length === 0) return [];

  // Sort ascending by start, then by original order
  const sorted = [...replacements].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.order - b.order;
  });

  const merged: TextReplacement[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // If pure insertions at the exact same anchor point, concatenate their texts
    if (current.start === current.end && next.start === next.end && current.start === next.start) {
      current.newText += next.newText;
      continue;
    }

    // If next overlaps or touches current range
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end);
      current.newText += next.newText;
    } else {
      merged.push({
        start: current.start,
        end: current.end,
        newText: current.newText,
      });
      current = { ...next };
    }
  }

  merged.push({
    start: current.start,
    end: current.end,
    newText: current.newText,
  });

  // Sort descending by start offset for safe sequential application
  return merged.sort((a, b) => b.start - a.start);
}

/**
 * Applies a list of text replacements to sourceCode in descending character order.
 */
export function applyReplacementsToSource(
  sourceCode: string,
  replacements: readonly TextReplacement[]
): string {
  let patched = sourceCode;

  for (const rep of replacements) {
    const start = Math.max(0, Math.min(rep.start, patched.length));
    const end = Math.max(start, Math.min(rep.end, patched.length));
    patched = patched.slice(0, start) + rep.newText + patched.slice(end);
  }

  return patched;
}

/**
 * Applies a single RepairCandidate to source code.
 */
export function applyCandidateToSource(
  sourceCode: string,
  candidate: RepairCandidate,
  baseTokens: readonly Token[]
): string {
  if (!candidate || !candidate.edits || candidate.edits.length === 0) {
    return sourceCode;
  }

  const rawReplacements = candidateToReplacements(candidate, baseTokens, sourceCode);
  const sortedReplacements = mergeAndSortReplacements(rawReplacements);
  return applyReplacementsToSource(sourceCode, sortedReplacements);
}

/**
 * Applies multiple RepairCandidates (e.g. all winning solutions) simultaneously
 * to source code in a single safe pass without index drift.
 */
export function applyMultipleCandidatesToSource(
  sourceCode: string,
  candidates: readonly RepairCandidate[],
  baseTokens: readonly Token[]
): string {
  if (!candidates || candidates.length === 0) {
    return sourceCode;
  }

  const allReplacements: InternalReplacement[] = [];
  let baseOrder = 0;

  for (const cand of candidates) {
    if (cand && cand.edits && cand.edits.length > 0) {
      const reps = candidateToReplacements(cand, baseTokens, sourceCode, baseOrder);
      allReplacements.push(...reps);
      baseOrder += cand.edits.length * 10;
    }
  }

  if (allReplacements.length === 0) {
    return sourceCode;
  }

  const sortedReplacements = mergeAndSortReplacements(allReplacements);
  return applyReplacementsToSource(sourceCode, sortedReplacements);
}
