/**
 * Clean MiniLang seed programs covering declarations, control flow,
 * complex expressions, function calls, and block structures.
 */

export interface SeedProgram {
  readonly id: string;
  readonly name: string;
  readonly source: string;
}

export const SEED_PROGRAMS: readonly SeedProgram[] = [
  {
    id: 'seed-01-declarations',
    name: 'Variable Declarations',
    source: `let x = 10;\nlet y = 20;\nlet sum = x + y;`,
  },
  {
    id: 'seed-02-arithmetic-precedence',
    name: 'Arithmetic Precedence',
    source: `let total = (10 + 20) * 3 - 4 / 2;\nlet discount = total * 0.1;`,
  },
  {
    id: 'seed-03-if-else-branching',
    name: 'If-Else Conditionals',
    source: `if (score >= 90) {\n  grade = "A";\n} else {\n  grade = "B";\n}`,
  },
  {
    id: 'seed-04-while-loop',
    name: 'While Loop Iteration',
    source: `let count = 0;\nwhile (count < 10) {\n  count = count + 1;\n}`,
  },
  {
    id: 'seed-05-function-calls',
    name: 'Function Calls & Output',
    source: `print(name, 100 + 50);\nlog("Complete");`,
  },
  {
    id: 'seed-06-complex-composite',
    name: 'Composite Statements',
    source: `let a = 5;\nlet b = 10;\nif (a < b && b > 0) {\n  let c = (a * b) + 2;\n  print(c);\n}`,
  },
];
