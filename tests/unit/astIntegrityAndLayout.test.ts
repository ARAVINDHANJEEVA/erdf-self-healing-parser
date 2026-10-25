import { describe, it, expect } from 'vitest';
import { CURATED_DEMOS } from '../../src/demos/curatedDemos';
import { runClangPanicEngine, runTreeSitterEngine, runErdfEngine } from '../../src/analysis/comparativeRunners';
import { computeTreeLayout, LayoutNode } from '../../src/ui/utils/treeLayout';
import { readFileSync } from 'fs';
import { join } from 'path';

function collectAllNodes(node: LayoutNode, acc: LayoutNode[] = []): LayoutNode[] {
  acc.push(node);
  for (const child of node.children) {
    collectAllNodes(child, acc);
  }
  return acc;
}

function findOverlaps(root: LayoutNode): string[] {
  const issues: string[] = [];
  const nodesByDepth: Record<number, LayoutNode[]> = {};

  function collect(n: LayoutNode, depth: number) {
    nodesByDepth[depth] = nodesByDepth[depth] || [];
    nodesByDepth[depth].push(n);
    for (const c of n.children) collect(c, depth + 1);
  }
  collect(root, 0);

  for (const [depth, nodes] of Object.entries(nodesByDepth)) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        // Check if nodes at same depth overlap horizontally
        const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        if (overlap > 0) {
          issues.push(
            `Overlap at depth ${depth}: [${a.label} (${a.kind}) at x=${a.x}] and [${b.label} (${b.kind}) at x=${b.x}] (overlap: ${overlap}px)`
          );
        }
      }
    }
  }
  return issues;
}

describe('AST Integrity, Unique Node IDs, and Overlap Prevention', () => {
  it('guarantees 100% unique node IDs in Clang Panic and Tree-sitter engine runs', () => {
    for (const demo of CURATED_DEMOS) {
      const clangResult = runClangPanicEngine(demo.source);
      if (clangResult.ast) {
        const clangLayout = computeTreeLayout(clangResult.ast);
        const clangNodes = collectAllNodes(clangLayout.root);
        const clangIds = clangNodes.map((n) => n.id);
        const uniqueClangIds = new Set(clangIds);
        expect(uniqueClangIds.size, `Duplicate node IDs in Clang engine for demo ${demo.id}`).toBe(
          clangIds.length
        );
      }

      const tsResult = runTreeSitterEngine(demo.source);
      if (tsResult.ast) {
        const tsLayout = computeTreeLayout(tsResult.ast);
        const tsNodes = collectAllNodes(tsLayout.root);
        const tsIds = tsNodes.map((n) => n.id);
        const uniqueTsIds = new Set(tsIds);
        expect(uniqueTsIds.size, `Duplicate node IDs in Tree-sitter engine for demo ${demo.id}`).toBe(
          tsIds.length
        );
      }
    }
  });

  it('guarantees zero horizontal overlaps across all curated demos in all three engines', () => {
    for (const demo of CURATED_DEMOS) {
      for (const engine of ['erdf', 'clang', 'treesitter'] as const) {
        let ast: any;
        if (engine === 'erdf') ast = runErdfEngine(demo.source).ast;
        else if (engine === 'clang') ast = runClangPanicEngine(demo.source).ast;
        else ast = runTreeSitterEngine(demo.source).ast;

        if (ast) {
          const layout = computeTreeLayout(ast);
          const overlaps = findOverlaps(layout.root);
          expect(overlaps, `Overlaps detected in demo ${demo.id} for engine ${engine}`).toHaveLength(0);
        }
      }
    }
  });

  it('removes emojis from engine options in TopBar and AST canvas views', () => {
    const topBarContent = readFileSync(join(process.cwd(), 'src/ui/components/TopBar.tsx'), 'utf-8');
    expect(topBarContent).toContain('<option value="erdf">ERDF Self-Healing</option>');
    expect(topBarContent).toContain('<option value="clang">Clang Panic Mode</option>');
    expect(topBarContent).toContain('<option value="treesitter">Tree-sitter Splicing</option>');
    expect(topBarContent).not.toMatch(/<option[^>]*>[^<]*⚡[^<]*<\/option>/);
    expect(topBarContent).not.toMatch(/<option[^>]*>[^<]*🔥[^<]*<\/option>/);
    expect(topBarContent).not.toMatch(/<option[^>]*>[^<]*📚[^<]*<\/option>/);

    const astCanvasContent = readFileSync(
      join(process.cwd(), 'src/ui/components/AstCanvasPanel.tsx'),
      'utf-8'
    );
    expect(astCanvasContent).not.toContain('🔥 Clang Panic Collapsed');
    expect(astCanvasContent).not.toContain('⚡ ERDF Ghost Healed');
    expect(astCanvasContent).toContain('Clang Panic Collapsed');
    expect(astCanvasContent).toContain('ERDF Ghost Healed');

    // Confirm that cascade destroyed node does not render overlapping Flame icon inside text box
    expect(astCanvasContent).not.toMatch(/isCascadeDestroyed\s*&&\s*\(\s*<g[^>]*>\s*<Flame/);
  });
});
