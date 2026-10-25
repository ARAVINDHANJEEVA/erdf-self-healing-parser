import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaultConfig';
import { TokenKind } from '../src/language/types';

describe('Stage 1 Toolchain Smoke Test', () => {
  it('loads default recovery configuration correctly', () => {
    expect(DEFAULT_CONFIG.grammarVersion).toBe('minilang-0.1.0');
    expect(DEFAULT_CONFIG.weights.structural).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.budgets.maxCost).toBe(20.0);
  });

  it('verifies token kinds and types', () => {
    const kind: TokenKind = 'SEMICOLON';
    expect(kind).toBe('SEMICOLON');
  });
});
