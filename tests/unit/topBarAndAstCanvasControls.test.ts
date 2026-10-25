import { describe, it, expect } from 'vitest';
import { useReplayStore } from '../../src/state/replayStore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('TopBar Engine Dropdown & AstCanvasPanel Dual Split (Issues 1 & 2)', () => {
  it('allows switching engines via setActiveEngine and setDualEngines in store', () => {
    const store = useReplayStore.getState();

    // Default engine
    expect(store.activeEngine).toBe('erdf');

    // Switch to Clang
    store.setActiveEngine('clang');
    expect(useReplayStore.getState().activeEngine).toBe('clang');

    // Switch to Tree-sitter
    store.setActiveEngine('treesitter');
    expect(useReplayStore.getState().activeEngine).toBe('treesitter');

    // Switch back to ERDF
    store.setActiveEngine('erdf');
    expect(useReplayStore.getState().activeEngine).toBe('erdf');

    // Dual split engines
    store.setDualEngines('erdf', 'treesitter');
    expect(useReplayStore.getState().dualLeftEngine).toBe('erdf');
    expect(useReplayStore.getState().dualRightEngine).toBe('treesitter');
  });

  it('TopBar uses a select dropdown for engine selection instead of bulky button strip (Issue 1)', () => {
    const topBarPath = join(process.cwd(), 'src/ui/components/TopBar.tsx');
    const content = readFileSync(topBarPath, 'utf-8');

    // Must have a <select> element for selecting activeEngine
    expect(content).toContain('value={activeEngine}');
    expect(content).toContain('setActiveEngine(e.target.value as ComparativeEngineId)');
    expect(content).toContain('<option value="erdf">');
    expect(content).toContain('<option value="clang">');
    expect(content).toContain('<option value="treesitter">');

    // Must NOT have individual wide buttons for engine selection
    expect(content).not.toContain("onClick={() => setActiveEngine('erdf')}");
    expect(content).not.toContain("onClick={() => setActiveEngine('clang')}");
    expect(content).not.toContain("onClick={() => setActiveEngine('treesitter')}");

    // TopBar must consistently keep the Engine dropdown and NOT replace it with a redundant compare dropdown
    expect(content).not.toContain('Compare:');
    expect(content).not.toContain('erdf-clang');

    // Demo select must have responsive max-width constraint to prevent overflow
    expect(content).toContain('max-w-[130px]');
  });

  it('AstCanvasPanel does not render redundant Compare presets strip next to Dual Split button (Issue 2)', () => {
    const astCanvasPath = join(process.cwd(), 'src/ui/components/AstCanvasPanel.tsx');
    const content = readFileSync(astCanvasPath, 'utf-8');

    // Dual Split button exists
    expect(content).toContain("onClick={() => setAstDiffMode('split')}");
    expect(content).toContain('Dual Split');

    // Must NOT have the redundant compare buttons next to Dual Split
    expect(content).not.toContain('{/* Dual Engine Comparison Quick Presets */}');
    expect(content).not.toContain("setDualEngines('erdf', 'clang')");
    expect(content).not.toContain("setDualEngines('erdf', 'treesitter')");
    expect(content).not.toContain("setDualEngines('clang', 'treesitter')");
  });

  it('BottomDock includes symbol table with withoutTable={false} and ContextDrawer passes withoutTable={true} (Issue 3)', () => {
    const bottomDockPath = join(process.cwd(), 'src/ui/components/BottomDock.tsx');
    const bottomDockContent = readFileSync(bottomDockPath, 'utf-8');
    expect(bottomDockContent).toContain('<ScopeSymbolsView withoutTable={false} />');

    const contextDrawerPath = join(process.cwd(), 'src/ui/components/ContextDrawer.tsx');
    const contextDrawerContent = readFileSync(contextDrawerPath, 'utf-8');
    expect(contextDrawerContent).toContain('<ScopeSymbolsView withoutTable={true} />');

    const scopeSymbolsPath = join(process.cwd(), 'src/ui/components/ScopeSymbolsView.tsx');
    const scopeSymbolsContent = readFileSync(scopeSymbolsPath, 'utf-8');
    expect(scopeSymbolsContent).toContain('!withoutTable && <SymbolTableView');
  });

  it('TopBar removes badges (100% AST, +err) next to engine selector (Issue 2)', () => {
    const topBarPath = join(process.cwd(), 'src/ui/components/TopBar.tsx');
    const content = readFileSync(topBarPath, 'utf-8');
    expect(content).not.toContain('100% AST');
    expect(content).not.toContain('astPreservationIndex}% AST');
  });

  it('EditorPanel preserves crisp contrast on error blast lines without animate-pulse opacity drops (Issue 1 & 4)', () => {
    const editorPath = join(process.cwd(), 'src/ui/components/EditorPanel.tsx');
    const content = readFileSync(editorPath, 'utf-8');

    // Blast lines and blast tokens must not have animate-pulse which causes text to fade into background
    expect(content).not.toContain("lineBackground = 'bg-rose-100/90 dark:bg-rose-950/40 border-l-2 border-rose-500 animate-pulse");
    expect(content).not.toContain("blastGutterStyle = 'text-rose-950 dark:text-rose-300 font-bold bg-rose-100 dark:bg-rose-950/50 animate-pulse'");

    // Must have crisp text-rose-950 font-bold contrast
    expect(content).toContain('text-rose-950 font-bold');

    // Selection styling in EditorPanel and index.css
    expect(content).toContain('selection:bg-sky-200 selection:text-slate-900');

    const cssPath = join(process.cwd(), 'src/index.css');
    const cssContent = readFileSync(cssPath, 'utf-8');
    expect(cssContent).toContain('textarea::selection');
    expect(cssContent).toContain('input::selection');
    expect(cssContent).toContain('html.dark select');
    expect(cssContent).toContain('html.dark option');
  });

  it('AstCanvasPanel export button has only icon (no Export Image text) and uses Canvas 2D rasterization (Issue 6)', () => {
    const astCanvasPath = join(process.cwd(), 'src/ui/components/AstCanvasPanel.tsx');
    const content = readFileSync(astCanvasPath, 'utf-8');

    // Must NOT have text label "Export Image" inside the button
    expect(content).not.toContain('<span>Export Image</span>');
    expect(content).not.toContain('>Export Image<');

    // Must have Camera icon with proper tooltip
    expect(content).toContain('<Camera className=');
    expect(content).toContain('title="Export AST Image (PNG)"');

    // exportAsPng must use Canvas 2D drawing of links and nodes to prevent blank PNG exports
    expect(content).toContain('drawCanvasLinks');
    expect(content).toContain('drawCanvasNodes');
  });
});
