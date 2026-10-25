/**
 * Virtual Token Stream.
 * Overlays repair candidate edits (insert, delete, substitute) onto an immutable
 * base token stream without mutating the original source stream.
 */

import { Edit, Token } from '../language/types';

export class VirtualTokenStream {
  private readonly stream: readonly Token[];
  private readIndex: number = 0;
  private sourceTokensConsumed: number = 0;

  constructor(tokens: readonly Token[], initialCursor: number = 0) {
    this.stream = Object.freeze([...tokens]);
    this.readIndex = initialCursor;
  }

  /**
   * Constructs a new VirtualTokenStream by applying edits to a base token array.
   */
  public static fromEdits(
    baseTokens: readonly Token[],
    edits: readonly Edit[],
    initialCursor: number = 0
  ): VirtualTokenStream {
    // Clone base array to build patched token sequence
    const patched: Token[] = [...baseTokens];

    // Sort edits descending by position so insertions/deletions don't invalidate subsequent indices
    const sortedEdits = [...edits].sort((a, b) => b.position - a.position);

    for (const edit of sortedEdits) {
      const pos = Math.max(0, Math.min(edit.position, patched.length));
      switch (edit.action) {
        case 'insert':
          if (edit.token) {
            patched.splice(pos, 0, edit.token);
          }
          break;
        case 'delete':
          if (pos < patched.length) {
            patched.splice(pos, 1);
          }
          break;
        case 'substitute':
          if (edit.token && pos < patched.length) {
            patched.splice(pos, 1, edit.token);
          }
          break;
      }
    }

    return new VirtualTokenStream(patched, initialCursor);
  }

  public peek(offset: number = 0): Token {
    const idx = this.readIndex + offset;
    if (idx < this.stream.length) {
      return this.stream[idx];
    }
    return this.stream[this.stream.length - 1]; // EOF sentinel
  }

  public consume(): Token {
    const token = this.peek();
    if (!this.isAtEnd()) {
      this.readIndex++;
      if (token.origin === 'source') {
        this.sourceTokensConsumed++;
      }
    }
    return token;
  }

  public cursor(): number {
    return this.readIndex;
  }

  public seek(position: number): void {
    this.readIndex = Math.max(0, Math.min(position, this.stream.length));
  }

  public isAtEnd(): boolean {
    return this.peek().kind === 'EOF';
  }

  public getSourceTokensConsumed(): number {
    return this.sourceTokensConsumed;
  }

  public getRemainingCount(): number {
    return Math.max(0, this.stream.length - this.readIndex);
  }

  public toArray(): readonly Token[] {
    return this.stream;
  }
}
