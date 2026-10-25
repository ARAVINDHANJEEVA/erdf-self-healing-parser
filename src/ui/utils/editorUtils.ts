/**
 * Helper utilities for EditorPanel:
 * - AST span lookup and ancestor path traversal
 * - Token classification & syntax coloring
 * - Line & column coordinate calculations
 * - Line segment slicing for syntax highlighting & inline error squiggles
 * - Character limit thresholds & visual status
 */

import { AstNode, AstNodeKind } from '../../language/ast';
import { Diagnostic, SourceSpan, Token, TokenKind } from '../../language/types';
import {
  isBinaryOperator,
  isDelimiter,
  isKeyword,
  isTypeKeyword,
} from '../../language/tokenKinds';
import { MAX_SOURCE_CODE_LENGTH } from '../../state/replayStore';

// ==========================================
// 1. AST Span Lookup & Hierarchy
// ==========================================

export interface AstNodeSummary {
  readonly id: string;
  readonly kind: AstNodeKind;
  readonly label: string;
  readonly details: string;
  readonly spanText: string;
  readonly provenance: 'source' | 'recovered' | 'partial';
  readonly ancestors: string[];
}

/**
 * Returns all direct child AST nodes for a given node.
 */
export function getAstNodeChildren(node: AstNode): AstNode[] {
  if (!node) return [];
  const children: AstNode[] = [];

  switch (node.kind) {
    case 'Program':
      if (node.body) children.push(...node.body);
      break;
    case 'LetDeclaration':
      if (node.identifier) children.push(node.identifier);
      if (node.initializer) children.push(node.initializer);
      break;
    case 'VariableDeclaration':
      if (node.identifier) children.push(node.identifier);
      if (node.initializer) children.push(node.initializer);
      break;
    case 'FunctionDeclaration':
      if (node.name) children.push(node.name);
      if (node.parameters) children.push(...node.parameters);
      if (node.body) children.push(node.body);
      break;
    case 'Parameter':
      if (node.name) children.push(node.name);
      break;
    case 'ReturnStatement':
      if (node.value) children.push(node.value);
      break;
    case 'ForStatement':
      if (node.initializer) children.push(node.initializer);
      if (node.condition) children.push(node.condition);
      if (node.increment) children.push(node.increment);
      if (node.body) children.push(node.body);
      break;
    case 'IfStatement':
      if (node.condition) children.push(node.condition);
      if (node.thenBranch) children.push(node.thenBranch);
      if (node.elseBranch) children.push(node.elseBranch);
      break;
    case 'WhileStatement':
      if (node.condition) children.push(node.condition);
      if (node.body) children.push(node.body);
      break;
    case 'BlockStatement':
      if (node.statements) children.push(...node.statements);
      break;
    case 'ExpressionStatement':
      if (node.expression) children.push(node.expression);
      break;
    case 'BinaryExpression':
      if (node.left) children.push(node.left);
      if (node.right) children.push(node.right);
      break;
    case 'UnaryExpression':
      if (node.operand) children.push(node.operand);
      break;
    case 'AssignmentExpression':
      if (node.assignee) children.push(node.assignee);
      if (node.value) children.push(node.value);
      break;
    case 'CallExpression':
      if (node.callee) children.push(node.callee);
      if (node.arguments) children.push(...node.arguments);
      break;
    case 'GroupExpression':
      if (node.expression) children.push(node.expression);
      break;
    case 'PartialNode':
      if (node.partiallyParsedChildren) {
        children.push(...node.partiallyParsedChildren);
      }
      break;
    case 'LiteralNode':
    case 'IdentifierNode':
    case 'PreprocessorDirective':
      break;
  }

  return children;
}

/**
 * Checks if a character offset is strictly within a node's source span.
 * For non-empty spans [start, end), offset must satisfy start <= offset < end.
 * For zero-width/point spans [start, start], offset must equal start.
 */
export function isOffsetInSpan(span: SourceSpan, offset: number): boolean {
  if (span.start === span.end) {
    return offset === span.start;
  }
  return offset >= span.start && offset < span.end;
}

/**
 * Recursively locates the deepest / innermost AST node spanning the given character offset.
 */
export function findCoveringAstNode(
  node: AstNode | null | undefined,
  offset: number
): AstNode | null {
  if (!node || !node.span) return null;
  if (!isOffsetInSpan(node.span, offset)) {
    return null;
  }

  const children = getAstNodeChildren(node);
  let bestChildMatch: AstNode | null = null;
  let smallestSpan = Infinity;

  for (const child of children) {
    const match = findCoveringAstNode(child, offset);
    if (match && match.span) {
      const spanLen = match.span.end - match.span.start;
      if (spanLen < smallestSpan) {
        smallestSpan = spanLen;
        bestChildMatch = match;
      }
    }
  }

  if (bestChildMatch) return bestChildMatch;
  return node;
}

/**
 * Returns the chain of ancestor AST nodes from root down to the covering node at offset.
 */
export function getAstNodeAncestors(
  root: AstNode | null | undefined,
  offset: number
): AstNode[] {
  if (!root || !root.span) return [];
  if (!isOffsetInSpan(root.span, offset)) return [];

  const path: AstNode[] = [root];
  let current: AstNode = root;

  while (true) {
    const children = getAstNodeChildren(current);
    let nextChild: AstNode | null = null;
    let smallestSpan = Infinity;

    for (const child of children) {
      if (child.span && isOffsetInSpan(child.span, offset)) {
        const spanLen = child.span.end - child.span.start;
        if (spanLen < smallestSpan) {
          smallestSpan = spanLen;
          nextChild = child;
        }
      }
    }

    if (nextChild) {
      path.push(nextChild);
      current = nextChild;
    } else {
      break;
    }
  }

  return path;
}

/**
 * Formats user-friendly metadata summary for an AST node tooltip.
 */
export function formatAstNodeSummary(
  node: AstNode,
  ancestors: AstNode[] = []
): AstNodeSummary {
  let label: string = node.kind;
  let details = '';

  switch (node.kind) {
    case 'Program':
      label = 'Program';
      details = `Root AST (${node.body?.length || 0} top-level declarations)`;
      break;
    case 'LetDeclaration':
      label = `let ${node.identifier?.name || ''}`;
      details = `Variable binding (${node.typeSpecifier || 'inferred'})`;
      break;
    case 'VariableDeclaration':
      label = `${node.typeSpecifier}${node.isPointer ? '*' : ''} ${node.identifier?.name || ''}`;
      details = `Variable declaration (${node.typeSpecifier}${node.initializer ? ', initialized' : ''})`;
      break;
    case 'FunctionDeclaration':
      label = `${node.returnType} ${node.name?.name || 'fn'}()`;
      details = `Function (${node.parameters?.length || 0} parameter${node.parameters?.length === 1 ? '' : 's'})`;
      break;
    case 'Parameter':
      label = `${node.typeSpecifier} ${node.name?.name || ''}`;
      details = 'Function parameter';
      break;
    case 'ReturnStatement':
      label = 'return';
      details = node.value ? 'Return statement with value' : 'Return statement (void)';
      break;
    case 'ForStatement':
      label = 'for (...)';
      details = 'For loop statement';
      break;
    case 'IfStatement':
      label = 'if (...)';
      details = node.elseBranch ? 'If-Else conditional statement' : 'If statement';
      break;
    case 'WhileStatement':
      label = 'while (...)';
      details = 'While loop statement';
      break;
    case 'BlockStatement':
      label = '{ ... }';
      details = `Block (${node.statements?.length || 0} statement${node.statements?.length === 1 ? '' : 's'})`;
      break;
    case 'ExpressionStatement':
      label = 'Expression';
      details = 'Expression evaluated as statement';
      break;
    case 'BinaryExpression':
      label = `BinaryOp '${node.operator}'`;
      details = `Binary expression with operator '${node.operator}'`;
      break;
    case 'UnaryExpression':
      label = `UnaryOp '${node.operator}'`;
      details = `Unary operation '${node.operator}'`;
      break;
    case 'AssignmentExpression':
      label = `${node.assignee?.name || ''} = ...`;
      details = `Assignment to '${node.assignee?.name || 'target'}'`;
      break;
    case 'CallExpression': {
      const calleeName =
        node.callee && node.callee.kind === 'IdentifierNode'
          ? (node.callee as any).name
          : 'fn';
      label = `${calleeName}()`;
      details = `Function invocation (${node.arguments?.length || 0} argument${
        node.arguments?.length === 1 ? '' : 's'
      })`;
      break;
    }
    case 'LiteralNode':
      label = `${node.raw}`;
      details = `Literal (${node.literalType}): ${node.value}`;
      break;
    case 'IdentifierNode':
      label = `${node.name}`;
      details = `Identifier: '${node.name}'`;
      break;
    case 'GroupExpression':
      label = '( ... )';
      details = 'Parenthesized expression grouping';
      break;
    case 'PreprocessorDirective':
      label = `${node.directive}`;
      details = 'Preprocessor directive';
      break;
    case 'PartialNode':
      label = `Partial: ${node.attemptedConstruct}`;
      details = 'Incomplete construct recovered during parsing';
      break;
  }

  const spanText = node.span
    ? `Ln ${node.span.line}:${node.span.column} • [${node.span.start}..${node.span.end}]`
    : '';

  const ancestorKinds = ancestors
    .filter((a) => a.id !== node.id)
    .map((a) => a.kind);

  return {
    id: node.id,
    kind: node.kind,
    label,
    details,
    spanText,
    provenance: node.provenance || 'source',
    ancestors: ancestorKinds,
  };
}

// ==========================================
// 2. Token Classification & Syntax Highlighting
// ==========================================

export type TokenCategory =
  | 'type'
  | 'keyword'
  | 'number'
  | 'string'
  | 'boolean'
  | 'preprocessor'
  | 'operator'
  | 'delimiter'
  | 'identifier'
  | 'comment'
  | 'error'
  | 'default';

export function categorizeToken(kind: TokenKind | 'COMMENT' | string): TokenCategory {
  if (kind === 'COMMENT') return 'comment';
  if (kind === 'ERROR') return 'error';
  if (kind === 'PREPROCESSOR') return 'preprocessor';
  if (kind === 'NUMBER') return 'number';
  if (kind === 'STRING' || kind === 'CHAR_LITERAL') return 'string';
  if (kind === 'TRUE' || kind === 'FALSE') return 'boolean';

  const tKind = kind as TokenKind;
  if (isTypeKeyword(tKind)) return 'type';
  if (isKeyword(tKind)) return 'keyword';
  if (
    isBinaryOperator(tKind) ||
    tKind === 'BANG' ||
    tKind === 'TILDE' ||
    tKind === 'PLUS_PLUS' ||
    tKind === 'MINUS_MINUS' ||
    tKind === 'ARROW' ||
    tKind === 'DOT' ||
    tKind === 'QUESTION'
  ) {
    return 'operator';
  }
  if (isDelimiter(tKind)) return 'delimiter';
  if (tKind === 'IDENT') return 'identifier';

  return 'default';
}

/**
 * Returns Tailwind CSS classes for syntax highlighting.
 */
export function getTokenColorClass(kind: TokenKind | 'COMMENT' | string): string {
  const category = categorizeToken(kind);
  switch (category) {
    case 'type':
      return 'text-cyan-700 dark:text-cyan-400 font-medium'; // C types: int, float, void, etc.
    case 'keyword':
      return 'text-purple-700 dark:text-purple-400 font-semibold'; // Control keywords: if, return, for, etc.
    case 'number':
      return 'text-amber-700 dark:text-amber-400 font-medium'; // Numbers: 42, 3.14
    case 'string':
      return 'text-emerald-700 dark:text-emerald-400'; // Strings: "hello", 'a'
    case 'boolean':
      return 'text-amber-800 dark:text-amber-300 font-medium'; // true, false
    case 'preprocessor':
      return 'text-indigo-700 dark:text-indigo-400 font-medium'; // #include, #define
    case 'operator':
      return 'text-sky-700 dark:text-sky-400 font-medium'; // +, -, *, =, ==, etc.
    case 'delimiter':
      return 'text-slate-500 dark:text-slate-400'; // (, ), {, }, ;, etc.
    case 'identifier':
      return 'text-slate-900 dark:text-slate-200'; // variable and function names
    case 'comment':
      return 'text-slate-500 italic'; // // or /* */
    case 'error':
      return 'text-rose-600 dark:text-rose-400 font-bold'; // Unrecognized chars
    default:
      return 'text-slate-800 dark:text-slate-300';
  }
}

// ==========================================
// 3. Cursor & Coordinate Utilities
// ==========================================

export interface CursorPosition {
  readonly line: number;   // 1-based line number
  readonly column: number; // 1-based column number
}

/**
 * Calculates 1-based line and column from a 0-based character offset.
 */
export function getCursorCoordinates(code: string, offset: number): CursorPosition {
  const safeOffset = Math.max(0, Math.min(offset, code.length));
  const before = code.slice(0, safeOffset);
  const lines = before.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Pre-calculates start offsets for each line in code for rapid index lookups.
 */
export function calculateLineOffsets(code: string): number[] {
  const lines = code.split('\n');
  const offsets = new Array<number>(lines.length);
  let cur = 0;
  for (let i = 0; i < lines.length; i++) {
    offsets[i] = cur;
    cur += lines[i].length + 1; // +1 for '\n'
  }
  return offsets;
}

// ==========================================
// 4. Line Segment Builder for Syntax Highlighting & Squiggles
// ==========================================

export interface LineSegment {
  readonly text: string;
  readonly kind: TokenKind | 'COMMENT' | 'WHITESPACE';
  readonly diagnostic?: Diagnostic;
  readonly isSquiggle: boolean;
  readonly startOffset: number;
  readonly endOffset: number;
}

/**
 * Slices a single line of code into styled segments with syntax colors and inline squiggles.
 */
export function buildLineSegments(
  lineIndex: number,
  lineText: string,
  lineStart: number,
  tokens: readonly Token[],
  comments: readonly Token[],
  diagnostics: readonly Diagnostic[]
): LineSegment[] {
  const lineEnd = lineStart + lineText.length;

  // Filter relevant items for this line
  const activeLineDiagnostics = diagnostics.filter((d) => {
    if (d.span.line === lineIndex + 1) return true;
    return d.span.end >= lineStart && d.span.start <= lineEnd;
  });

  // Empty line edge case
  if (lineText.length === 0) {
    const diag = activeLineDiagnostics[0];
    if (diag) {
      return [
        {
          text: '\u00A0', // Non-breaking space for visible squiggle
          kind: 'WHITESPACE',
          diagnostic: diag,
          isSquiggle: true,
          startOffset: lineStart,
          endOffset: lineStart,
        },
      ];
    }
    return [
      {
        text: '',
        kind: 'WHITESPACE',
        isSquiggle: false,
        startOffset: lineStart,
        endOffset: lineStart,
      },
    ];
  }

  // Intersecting tokens and comments
  const lineTokens = tokens.filter(
    (t) => t.kind !== 'EOF' && t.span.end > lineStart && t.span.start < lineEnd
  );
  const lineComments = comments.filter(
    (c) => c.span.end > lineStart && c.span.start < lineEnd
  );

  // Classify each character column
  interface CharMeta {
    kind: TokenKind | 'COMMENT' | 'WHITESPACE';
    diagnostic?: Diagnostic;
  }

  const charMetas: CharMeta[] = new Array(lineText.length);
  for (let col = 0; col < lineText.length; col++) {
    const offset = lineStart + col;
    let kind: TokenKind | 'COMMENT' | 'WHITESPACE' = 'WHITESPACE';

    // Match token
    for (const t of lineTokens) {
      if (offset >= t.span.start && offset < t.span.end) {
        kind = t.kind;
        break;
      }
    }

    // Match comment if not inside token
    if (kind === 'WHITESPACE') {
      for (const c of lineComments) {
        if (offset >= c.span.start && offset < c.span.end) {
          kind = 'COMMENT';
          break;
        }
      }
    }

    // Match diagnostic squiggle with exact character span accuracy
    let diagMatch: Diagnostic | undefined;
    for (const d of activeLineDiagnostics) {
      if (d.span.end > d.span.start) {
        if (offset >= d.span.start && offset < d.span.end) {
          diagMatch = d;
          break;
        }
      } else if (d.span.start === d.span.end) {
        // Zero-width diagnostic: underline single character at start
        if (offset === d.span.start) {
          diagMatch = d;
          break;
        }
      }
      // End-of-line diagnostic: line match where error position is at or past end of line
      if (d.span.line === lineIndex + 1 && d.span.start >= lineEnd) {
        if (col === lineText.length - 1) {
          diagMatch = d;
          break;
        }
      }
    }

    charMetas[col] = { kind, diagnostic: diagMatch };
  }

  // Group contiguous characters into segments
  const segments: LineSegment[] = [];
  let segStart = 0;

  while (segStart < lineText.length) {
    const currentMeta = charMetas[segStart];
    let segEnd = segStart + 1;

    while (
      segEnd < lineText.length &&
      charMetas[segEnd].kind === currentMeta.kind &&
      charMetas[segEnd].diagnostic?.id === currentMeta.diagnostic?.id
    ) {
      segEnd++;
    }

    const chunkText = lineText.slice(segStart, segEnd);
    segments.push({
      text: chunkText,
      kind: currentMeta.kind,
      diagnostic: currentMeta.diagnostic,
      isSquiggle: Boolean(currentMeta.diagnostic),
      startOffset: lineStart + segStart,
      endOffset: lineStart + segEnd,
    });

    segStart = segEnd;
  }

  return segments;
}

// ==========================================
// 5. Character Limit Warning Utilities
// ==========================================

export type CharacterLimitLevel =
  | 'normal'
  | 'notice'
  | 'warning'
  | 'critical'
  | 'exceeded';

export interface CharacterLimitStatus {
  readonly current: number;
  readonly max: number;
  readonly remaining: number;
  readonly ratio: number;
  readonly pct: number;
  readonly level: CharacterLimitLevel;
  readonly badgeText: string;
  readonly colorClass: string;
  readonly barColorClass: string;
  readonly isWarning: boolean;
}

/**
 * Computes warning thresholds and progress indicators for the 100,000 char limit.
 */
export function getCharacterLimitStatus(
  currentLength: number,
  maxLength: number = MAX_SOURCE_CODE_LENGTH
): CharacterLimitStatus {
  const current = Math.max(0, currentLength);
  const remaining = Math.max(0, maxLength - current);
  const ratio = Math.min(1, current / maxLength);
  const pct = Math.round(ratio * 100);

  let level: CharacterLimitLevel = 'normal';
  let badgeText = `${current.toLocaleString()} / 100k`;
  let colorClass = 'text-slate-400';
  let barColorClass = 'bg-emerald-500';
  let isWarning = false;

  if (current >= maxLength) {
    level = 'exceeded';
    badgeText = 'Limit Reached (100k)';
    colorClass = 'text-rose-400 font-bold';
    barColorClass = 'bg-rose-500';
    isWarning = true;
  } else if (ratio >= 0.95) {
    level = 'critical';
    badgeText = `${remaining.toLocaleString()} chars left`;
    colorClass = 'text-rose-400 font-semibold';
    barColorClass = 'bg-rose-500 animate-pulse';
    isWarning = true;
  } else if (ratio >= 0.8) {
    level = 'warning';
    badgeText = `Approaching limit (${pct}%)`;
    colorClass = 'text-amber-400 font-medium';
    barColorClass = 'bg-amber-400';
    isWarning = true;
  } else if (ratio >= 0.6) {
    level = 'notice';
    badgeText = `${current.toLocaleString()} / 100k`;
    colorClass = 'text-slate-300';
    barColorClass = 'bg-sky-400';
    isWarning = false;
  }

  return {
    current,
    max: maxLength,
    remaining,
    ratio,
    pct,
    level,
    badgeText,
    colorClass,
    barColorClass,
    isWarning,
  };
}
