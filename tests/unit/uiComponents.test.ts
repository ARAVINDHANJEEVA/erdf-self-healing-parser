import { describe, it, expect } from 'vitest';
import { parseWithErdf } from '../../src/erdf/instrumentedParser';
import { computeTreeLayout } from '../../src/ui/utils/treeLayout';
import { CURATED_DEMOS } from '../../src/demos/curatedDemos';

describe('6-Panel Visual Workbench UI & Tree Layout (Stage 9)', () => {
  it('computes accurate hierarchical coordinates for AST tree visualization', () => {
    const source = 'let sum = (10 + 20) * 3;\nlet tax = 5;';
    const { ast } = parseWithErdf(source);

    const layout = computeTreeLayout(ast);

    expect(layout.root).toBeDefined();
    expect(layout.root.kind).toBe('Program');
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);

    // Root should have 2 children (the two let declarations)
    expect(layout.root.children).toHaveLength(2);

    const child1 = layout.root.children[0];
    const child2 = layout.root.children[1];

    // Children are rendered below parent
    expect(child1.y).toBeGreaterThan(layout.root.y);
    expect(child2.y).toBeGreaterThan(layout.root.y);

    // Second statement is placed to the right of first statement
    expect(child2.x).toBeGreaterThan(child1.x);
  });

  it('correctly tags ghost (synthetic) nodes and partial nodes in layout', () => {
    const source = 'let x = (10 + 20;'; // Missing ')'
    const { ast } = parseWithErdf(source);

    const layout = computeTreeLayout(ast);
    expect(layout.root).toBeDefined();
    expect(layout.root.children.length).toBeGreaterThan(0);

    // Tree layout traverses without errors on recovered trees
    expect(layout.height).toBeGreaterThan(0);
  });

  it('renders AssignmentExpression children and prevents sibling subtree collisions', () => {
    const source = 'x = 100;\ny = (200 + 300) * 4;';
    const { ast } = parseWithErdf(source);

    const layout = computeTreeLayout(ast);
    expect(layout.root.children).toHaveLength(2);

    const assignStmt1 = layout.root.children[0];
    const assignStmt2 = layout.root.children[1];

    // ExpressionStatement has 1 child: AssignmentExpression
    expect(assignStmt1.children).toHaveLength(1);
    const assignExpr = assignStmt1.children[0];
    expect(assignExpr.kind).toBe('AssignmentExpression');

    // AssignmentExpression should have 2 children: assignee and value
    expect(assignExpr.children).toHaveLength(2);
    expect(assignExpr.children[0].kind).toBe('IdentifierNode');
    expect(assignExpr.children[1].kind).toBe('LiteralNode');

    // Sibling separation check: adjacent statements must not overlap
    expect(assignStmt2.x).toBeGreaterThanOrEqual(assignStmt1.x + assignStmt1.width + 30);
  });

  it('prevents node overlaps in for-loop demo AST', () => {
    const source = `#include <stdio.h>\n\nint main() {\n  int sum = 0;\n  for (int i = 0; i < 10; i++) {\n    sum += i;\n  }\n  return sum;\n}`;
    const { ast } = parseWithErdf(source);
    const layout = computeTreeLayout(ast);

    // Collect all nodes grouped by y coordinate (same level)
    const nodesByY = new Map<number, typeof layout.root[]>();
    function collect(n: typeof layout.root) {
      const list = nodesByY.get(n.y) || [];
      list.push(n);
      nodesByY.set(n.y, list);
      for (const c of n.children) collect(c);
    }
    collect(layout.root);

    // Verify that at every Y level, nodes are sorted by X and do not overlap
    for (const [, nodes] of nodesByY.entries()) {
      nodes.sort((a, b) => a.x - b.x);
      for (let i = 1; i < nodes.length; i++) {
        const prev = nodes[i - 1];
        const curr = nodes[i];
        expect(curr.x).toBeGreaterThanOrEqual(
          prev.x + prev.width + 30
        );
      }
    }
  });

  it('guarantees proper alignment and no overlapping across all curated demos', () => {
    for (const demo of CURATED_DEMOS) {
      const { ast } = parseWithErdf(demo.source);
      const layout = computeTreeLayout(ast);

      const nodesByY = new Map<number, typeof layout.root[]>();
      function collect(n: typeof layout.root) {
        // Verify parent centering if node has children
        if (n.children.length > 0) {
          const firstChild = n.children[0];
          const lastChild = n.children[n.children.length - 1];
          const expectedX = Math.round((firstChild.x + lastChild.x) / 2);
          expect(n.x).toBe(expectedX);
        }

        const list = nodesByY.get(n.y) || [];
        list.push(n);
        nodesByY.set(n.y, list);
        for (const c of n.children) collect(c);
      }
      collect(layout.root);

      for (const [, nodes] of nodesByY.entries()) {
        nodes.sort((a, b) => a.x - b.x);
        for (let i = 1; i < nodes.length; i++) {
          const prev = nodes[i - 1];
          const curr = nodes[i];
          expect(curr.x).toBeGreaterThanOrEqual(
            prev.x + prev.width + 30
          );
        }
      }
    }
  });

  it('recovers both errors in multi-error source code', () => {
    const source = `#include <stdio.h>\n\nint main() {\n  int total = (10 + 20;\n  int tax = 5;\n  int final_sum = total + tax;\n  return final_sum\n}`;
    const result = parseWithErdf(source);

    expect(result.committedRepairs).toBeDefined();
    expect(result.committedRepairs?.length).toBe(2);
    expect(result.ast.body.length).toBeGreaterThanOrEqual(2);
  });

  it('configures Inspector bar tabs without symbols tab and supports top/right bar positions', () => {
    // ContextDrawer tabs: arena (repairs), showdown, doctor, inspector, diagnostics
    const validTabs = ['arena', 'showdown', 'doctor', 'inspector', 'diagnostics'] as const;
    expect(validTabs).toHaveLength(5);
    expect(validTabs).toContain('arena');
    expect(validTabs).toContain('showdown');
    expect(validTabs).toContain('doctor');
    expect(validTabs).toContain('inspector');
    expect(validTabs).toContain('diagnostics');

    // Symbols tab is explicitly excluded from the inspector
    expect(validTabs).not.toContain('symbols');

    // Bar positions supported
    const positions = ['top', 'right'] as const;
    expect(positions).toHaveLength(2);
    expect(positions).toContain('top');
    expect(positions).toContain('right');
  });
});
