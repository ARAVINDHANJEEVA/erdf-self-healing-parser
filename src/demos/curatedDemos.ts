/**
 * Curated C demonstration programs showcasing varied syntax error recovery behaviors.
 */

export interface DemoProgram {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly expectedErrorPattern: string;
}

export const CURATED_DEMOS: readonly DemoProgram[] = [
  {
    id: 'unclosed-parenthesis',
    title: 'C Missing Parenthesis in Expression',
    description:
      'Arithmetic expression in main() opens with ( but encounters a semicolon ; before closing. System synthesizes ghost ) delimiter.',
    source: `#include <stdio.h>\n\nint main() {\n  int total = (10 + 20;\n  int tax = 5;\n  int final_sum = total + tax;\n  return final_sum;\n}`,
    expectedErrorPattern: "Expected ')'",
  },
  {
    id: 'missing-semicolon',
    title: 'C Missing Statement Semicolon',
    description:
      'Variable declaration lacks trailing semicolon ; before next statement. System inserts synthetic ; delimiter.',
    source: `int calculate_total() {\n  int price = 100\n  int quantity = 3;\n  return price * quantity;\n}`,
    expectedErrorPattern: "Expected ';'",
  },
  {
    id: 'unclosed-block-brace',
    title: 'C Unclosed Function Brace at EOF',
    description:
      'Function and if-block open with { but hit EOF before closing. System inserts synthetic } at file end.',
    source: `#include <stdio.h>\n\nint main() {\n  int score = 95;\n  if (score >= 90) {\n    printf("Grade: A\\n");\n    return 0;`,
    expectedErrorPattern: "Expected '}'",
  },
  {
    id: 'clean-expressions',
    title: 'Clean C Multi-Function Program',
    description:
      'Valid C program demonstrating headers, helper functions, Pratt precedence, and control flow without errors.',
    source: `#include <stdio.h>\n\nint add(int a, int b) {\n  return a + b;\n}\n\nint main() {\n  int result = add(10, 20) * 3 - 4 / 2;\n  if (result > 50) {\n    printf("High result: %d\\n", result);\n    return 1;\n  } else {\n    printf("Normal result: %d\\n", result);\n    return 0;\n  }\n}`,
    expectedErrorPattern: 'None',
  },
  {
    id: 'panic-garbage',
    title: 'C Panic Mode Recovery (Corrupted Syntax)',
    description:
      'Unrecoverable punctuation clusters trigger panic mode, skipping malformed tokens into a PartialNode without deadlocking.',
    source: `int main() {\n  int * / = ; \n  int recovered = 42;\n  return recovered;\n}`,
    expectedErrorPattern: 'Panic discard',
  },
  {
    id: 'multi-error-recovery',
    title: 'C Multi-Error Recovery & Batch Solutions',
    description:
      'Program containing multiple distinct syntax errors across lines. System discovers, scores, and recovers all errors independently, allowing 1-click batch application.',
    source: `#include <stdio.h>\n\nint main() {\n  int total = (10 + 20;\n  int tax = 5;\n  int final_sum = total + tax;\n  return final_sum\n}`,
    expectedErrorPattern: "Expected ')' and ';'",
  },
  {
    id: 'for-loop-arrays',
    title: 'C For Loops & Compound Assignments',
    description:
      'Demonstrates C for loop iteration, prefix/postfix increments, and compound assignment operators.',
    source: `#include <stdio.h>\n\nint main() {\n  int sum = 0;\n  for (int i = 0; i < 10; i++) {\n    sum += i;\n  }\n  return sum;\n}`,
    expectedErrorPattern: 'None',
  },
  {
    id: 'semantic-symbol-recovery',
    title: 'Semantic Typo Recovery & Scope Symbols',
    description:
      'Demonstrates semantic symbol-table integration and fuzzy typo recovery. Variable "totl" is misspelled; system calculates Levenshtein distance against in-scope "total" and provides 1-click symbol replacement.',
    source: `#include <stdio.h>\n\nint main() {\n  int total = 100;\n  int tax = 15;\n  totl = (10 + 20);\n  int final_sum = totl + tax;\n  return final_sum;\n}`,
    expectedErrorPattern: "Undeclared identifier 'totl'",
  },
];
