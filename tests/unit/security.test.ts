import { describe, it, expect } from 'vitest';
import { canonicalJson } from '../../src/utils/hash';
import { tokenize } from '../../src/language/lexer';
import { Parser } from '../../src/parser/parser';
import { MAX_SOURCE_CODE_LENGTH, useReplayStore } from '../../src/state/replayStore';

describe('Security Hardening Tests', () => {
  describe('SEC-06: canonicalJson circular & prototype pollution guards', () => {
    it('gracefully handles circular references without infinite recursion', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const serialized = canonicalJson(circularObj);
      expect(serialized).toContain('"[Circular]"');
      expect(serialized).toContain('"name":"test"');
    });

    it('filters unsafe prototype pollution properties', () => {
      const objWithProto: any = {
        valid: 123,
      };
      // Explicitly define unsafe keys
      Object.defineProperty(objWithProto, '__proto__', {
        value: { polluted: true },
        enumerable: true,
      });

      const serialized = canonicalJson(objWithProto);
      expect(serialized).not.toContain('"polluted"');
      expect(serialized).toBe('{"valid":123}');
    });
  });

  describe('SEC-02: Parser call stack exhaustion & recursion depth limit', () => {
    it('catches deeply nested expressions and emits structured error without crashing', () => {
      // 300 nested parentheses exceeds the 250 call frame limit
      const deepSource = 'let x = ' + '('.repeat(300) + '1' + ')'.repeat(300) + ';';
      const tokens = tokenize(deepSource).tokens;

      const parser = new Parser(tokens);
      expect(() => parser.parse()).not.toThrow(RangeError); // Never uncatchable RangeError

      const diags = parser.getDiagnostics();
      expect(diags.some((d) => d.code === 'PARSE_MAX_RECURSION_EXCEEDED')).toBe(true);
    });
  });

  describe('SEC-03: Max input size guard in replay store', () => {
    it('defines and enforces MAX_SOURCE_CODE_LENGTH', () => {
      expect(MAX_SOURCE_CODE_LENGTH).toBe(100_000);
      const massiveInput = 'let x = 1;\n'.repeat(15_000); // ~180,000 characters
      expect(massiveInput.length).toBeGreaterThan(MAX_SOURCE_CODE_LENGTH);

      // Verify runParser executes without crashing the thread
      useReplayStore.getState().setSourceCode(massiveInput);
      expect(useReplayStore.getState().parseResult).not.toBeNull();
    });
  });
});
