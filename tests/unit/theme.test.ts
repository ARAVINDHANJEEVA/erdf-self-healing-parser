import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useReplayStore, getPersistedTheme } from '../../src/state/replayStore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Light and Dark Theme Store & Controls', () => {
  let mockStorage: Record<string, string> = {};
  let classListSet = new Set<string>();
  let dataThemeAttr = '';
  let colorSchemeStyle = '';

  beforeEach(() => {
    mockStorage = {};
    classListSet = new Set<string>();
    dataThemeAttr = '';
    colorSchemeStyle = '';

    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };

    const documentMock = {
      documentElement: {
        classList: {
          add: (cls: string) => classListSet.add(cls),
          remove: (cls: string) => classListSet.delete(cls),
          contains: (cls: string) => classListSet.has(cls),
        },
        setAttribute: (attr: string, val: string) => {
          if (attr === 'data-theme') dataThemeAttr = val;
        },
        getAttribute: (attr: string) => (attr === 'data-theme' ? dataThemeAttr : null),
        style: {
          set colorScheme(val: string) {
            colorSchemeStyle = val;
          },
          get colorScheme() {
            return colorSchemeStyle;
          },
        },
      },
    };

    (globalThis as any).window = { localStorage: localStorageMock };
    (globalThis as any).localStorage = localStorageMock;
    (globalThis as any).document = documentMock;

    useReplayStore.getState().setTheme('dark');
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).document;
  });

  it('manages theme state in replayStore with localStorage persistence', () => {
    const store = useReplayStore.getState();
    expect(store.theme).toBe('dark');

    // Toggle to light
    store.toggleTheme();
    expect(useReplayStore.getState().theme).toBe('light');
    expect(mockStorage['sh_theme']).toBe('light');
    expect(classListSet.has('light')).toBe(true);
    expect(classListSet.has('dark')).toBe(false);
    expect(dataThemeAttr).toBe('light');
    expect(colorSchemeStyle).toBe('light');

    // Toggle back to dark
    useReplayStore.getState().toggleTheme();
    expect(useReplayStore.getState().theme).toBe('dark');
    expect(mockStorage['sh_theme']).toBe('dark');
    expect(classListSet.has('dark')).toBe(true);
    expect(classListSet.has('light')).toBe(false);
    expect(dataThemeAttr).toBe('dark');
    expect(colorSchemeStyle).toBe('dark');

    // Direct setTheme
    useReplayStore.getState().setTheme('light');
    expect(useReplayStore.getState().theme).toBe('light');
    expect(mockStorage['sh_theme']).toBe('light');
    expect(classListSet.has('light')).toBe(true);
  });

  it('defaults theme to light when no theme is persisted in localStorage', () => {
    delete mockStorage['sh_theme'];
    expect(getPersistedTheme()).toBe('light');
  });

  it('TopBar removes "Weights" text completely and places icon-only theme toggle to the left of the weights button', () => {
    const topBarPath = join(process.cwd(), 'src/ui/components/TopBar.tsx');
    const content = readFileSync(topBarPath, 'utf-8');

    // Verify theme toggle button exists with Sun / Moon icon
    expect(content).toContain('toggleTheme');
    expect(content).toContain('aria-label="Toggle Theme"');
    expect(content).toContain('<Sun');
    expect(content).toContain('<Moon');

    // Verify Weights button has NO "Weights" text label
    const weightsButtonIdx = content.indexOf('aria-label="Configure Weights"');
    expect(weightsButtonIdx).toBeGreaterThan(0);

    const weightsButtonChunk = content.slice(weightsButtonIdx, weightsButtonIdx + 300);
    expect(weightsButtonChunk).not.toContain('>Weights<');
    expect(weightsButtonChunk).not.toContain('<span>Weights</span>');
    expect(weightsButtonChunk).toContain('<SlidersHorizontal');

    // Verify theme button is rendered immediately to the left of the weights button
    const themeButtonIdx = content.indexOf('aria-label="Toggle Theme"');
    expect(themeButtonIdx).toBeGreaterThan(0);
    expect(themeButtonIdx).toBeLessThan(weightsButtonIdx);

    // Verify theme button contains NO visible text description elements
    const themeButtonChunk = content.slice(themeButtonIdx, weightsButtonIdx);
    expect(themeButtonChunk).not.toContain('<span>');
    expect(themeButtonChunk).not.toContain('<p>');
    expect(themeButtonChunk).not.toContain('<div>');
  });

  it('Editor token colors support both high-contrast light and dark themes', () => {
    const editorUtilsPath = join(process.cwd(), 'src/ui/utils/editorUtils.ts');
    const content = readFileSync(editorUtilsPath, 'utf-8');

    // Checks that getTokenColorClass provides dark: prefixes alongside high-contrast light colors
    expect(content).toContain('dark:text-cyan-400');
    expect(content).toContain('text-cyan-700');
    expect(content).toContain('dark:text-indigo-400');
    expect(content).toContain('text-indigo-700');
    expect(content).toContain('dark:text-emerald-400');
    expect(content).toContain('text-emerald-700');
  });

  it('AstCanvasPanel and BottomDock have light theme class coverage', () => {
    const astCanvasPath = join(process.cwd(), 'src/ui/components/AstCanvasPanel.tsx');
    const astContent = readFileSync(astCanvasPath, 'utf-8');

    expect(astContent).toContain('isLight ?');
    expect(astContent).toContain("isLight ? '#f8fafc' : '#050814'");
    expect(astContent).toContain("renderTreeLinks(node: LayoutNode, isLight = false)");

    const bottomDockPath = join(process.cwd(), 'src/ui/components/BottomDock.tsx');
    const bottomContent = readFileSync(bottomDockPath, 'utf-8');

    expect(bottomContent).toContain('bg-slate-50 dark:bg-[#050814]');
    expect(bottomContent).toContain('bg-white dark:bg-slate-950');
  });

  it('ContextDrawer and CandidateArenaPanel have thorough light theme coverage across all tabs and cards', () => {
    const contextDrawerPath = join(process.cwd(), 'src/ui/components/ContextDrawer.tsx');
    const drawerContent = readFileSync(contextDrawerPath, 'utf-8');

    // Drawer container & tabs
    expect(drawerContent).toContain('bg-white dark:bg-slate-900');
    expect(drawerContent).toContain('border-slate-200 dark:border-slate-800');
    // Incident header & cards
    expect(drawerContent).toContain('text-slate-900 dark:text-slate-100');
    expect(drawerContent).toContain('bg-emerald-50 dark:bg-emerald-950/30');
    // Showdown tab
    expect(drawerContent).toContain('Comparative Engine Showdown');
    expect(drawerContent).toContain('bg-emerald-100 dark:bg-emerald-950');
    // Doctor tab
    expect(drawerContent).toContain("Doctor's Prescription");
    expect(drawerContent).toContain('bg-rose-50 dark:bg-rose-950/30');

    const candidateArenaPath = join(process.cwd(), 'src/ui/components/CandidateArenaPanel.tsx');
    const arenaContent = readFileSync(candidateArenaPath, 'utf-8');

    expect(arenaContent).toContain('bg-white dark:bg-slate-900');
    expect(arenaContent).toContain('Multi-Engine Comparative Showdown');
    expect(arenaContent).toContain('bg-emerald-50 dark:bg-emerald-950/30');
    expect(arenaContent).toContain('bg-rose-50 dark:bg-rose-950/30');
    expect(arenaContent).toContain('bg-amber-50 dark:bg-amber-950/30');
    expect(arenaContent).toContain("Doctor's Prescription");
  });

  it('TimelinePanel, TokenLanePanel, and ConfigModal have light theme class coverage', () => {
    const timelinePath = join(process.cwd(), 'src/ui/components/TimelinePanel.tsx');
    const timelineContent = readFileSync(timelinePath, 'utf-8');
    expect(timelineContent).toContain('bg-slate-50 dark:bg-[#050814]');
    expect(timelineContent).toContain('text-slate-800 dark:text-slate-200');

    const tokenLanePath = join(process.cwd(), 'src/ui/components/TokenLanePanel.tsx');
    const tokenLaneContent = readFileSync(tokenLanePath, 'utf-8');
    expect(tokenLaneContent).toContain('bg-slate-50 dark:bg-slate-950');
    expect(tokenLaneContent).toContain('bg-white dark:bg-slate-900');

    const configModalPath = join(process.cwd(), 'src/ui/components/ConfigModal.tsx');
    const modalContent = readFileSync(configModalPath, 'utf-8');
    expect(modalContent).toContain('bg-white dark:bg-slate-900');
    expect(modalContent).toContain('text-slate-900 dark:text-slate-100');
  });

  it('index.css includes Tailwind v4 custom dark variant, html.light/dark, and styled scrollbars', () => {
    const cssPath = join(process.cwd(), 'src/index.css');
    const cssContent = readFileSync(cssPath, 'utf-8');

    expect(cssContent).toContain('@custom-variant dark');
    expect(cssContent).toContain('html.light');
    expect(cssContent).toContain('html.dark');
    expect(cssContent).toContain('html.light ::-webkit-scrollbar-thumb');
    expect(cssContent).toContain('html.dark ::-webkit-scrollbar-thumb');
  });
});

