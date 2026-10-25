/**
 * Zustand state store managing interactive ERDF playback, timeline scrubbing,
 * snapshot-accelerated frame reconstruction, and counterfactual branch previewing.
 */

import { create } from 'zustand';
import { ErdfPhase } from '../erdf/schema';
import { ReplayState, createInitialReplayState } from '../erdf/reducer';
import { ErdfParseResult, parseWithErdf } from '../erdf/instrumentedParser';
import { SnapshotCache } from './snapshotCache';
import { DEFAULT_CONFIG, RecoveryConfig } from '../config/defaultConfig';
import { CURATED_DEMOS } from '../demos/curatedDemos';
import { tokenize } from '../language/lexer';
import { resetCandidateCounter } from '../recovery/minCostSearch';
import { RepairCandidate } from '../language/types';
import {
  applyCandidateToSource,
  applyMultipleCandidatesToSource,
} from '../ui/utils/sourcePatcher';
import { groupCandidatesByIncident } from '../ui/utils/incidentGrouping';
import {
  ComparativeEngineId,
  ComparativeShowdownResult,
  runComparativeShowdown,
} from '../analysis/comparativeRunners';
import {
  BlastRadiusAssessment,
  calculateCandidateBlastRadius,
} from '../analysis/blastRadiusEngine';
import {
  analyzeSemantics,
  SemanticAnalysisResult,
  SemanticRepairCandidate,
} from '../semantics/typeChecker';

export type Theme = 'dark' | 'light';

export interface ReplayStore {
  readonly sourceCode: string;
  readonly config: RecoveryConfig;
  readonly parseResult: ErdfParseResult | null;
  readonly currentSequence: number;
  readonly currentState: ReplayState;
  readonly isPlaying: boolean;
  readonly playbackSpeed: number;
  readonly selectedCandidateId: string | null;
  readonly snapshotCache: SnapshotCache | null;

  // Theme State
  readonly theme: Theme;

  // Multi-Engine Comparative Showdown & Blast-Radius State
  readonly activeEngine: ComparativeEngineId;
  readonly comparativeShowdown: ComparativeShowdownResult | null;
  readonly astDiffMode: 'standard' | 'overlay' | 'split';
  readonly dualLeftEngine: ComparativeEngineId;
  readonly dualRightEngine: ComparativeEngineId;
  readonly hoveredCandidateId: string | null;
  readonly activeBlastRadius: BlastRadiusAssessment | null;

  // Semantic Symbol-Table & Type-Checking State
  readonly semanticResult: SemanticAnalysisResult | null;
  readonly selectedScopeId: string | null;

  // Actions
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSourceCode: (code: string) => void;
  setConfig: (config: Partial<RecoveryConfig>) => void;
  runParser: () => void;
  seekToSequence: (sequence: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToPhase: (phase: ErdfPhase) => void;
  jumpToNextError: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  selectCounterfactual: (candidateId: string | null) => void;
  loadDemo: (demoId: string) => void;
  applyCandidateSolution: (candidate: RepairCandidate) => void;
  applyAllWinningRepairs: () => void;
  applySemanticFix: (fix: SemanticRepairCandidate) => void;
  setSelectedScopeId: (scopeId: string | null) => void;
  setActiveEngine: (engine: ComparativeEngineId) => void;
  setAstDiffMode: (mode: 'standard' | 'overlay' | 'split') => void;
  setDualEngines: (left: ComparativeEngineId, right: ComparativeEngineId) => void;
  setHoveredCandidateId: (candidateId: string | null) => void;
}

const initialSource = '';
const initialTokens = tokenize(initialSource).tokens;
const initialSnapshot = createInitialReplayState('initial-run', initialTokens);

export const MAX_SOURCE_CODE_LENGTH = 100_000;

export function syncDocumentTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  }
}

export function getPersistedTheme(): Theme {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem('sh_theme');
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // ignore
    }
  }
  return 'light';
}

const initialTheme = getPersistedTheme();
if (typeof document !== 'undefined') {
  syncDocumentTheme(initialTheme);
}

function deepMergeConfig(
  base: RecoveryConfig,
  update: Partial<RecoveryConfig>
): RecoveryConfig {
  return {
    ...base,
    ...update,
    weights: {
      ...base.weights,
      ...(update.weights || {}),
    },
    budgets: {
      ...base.budgets,
      ...(update.budgets || {}),
    },
    baseLexicalCosts: {
      ...base.baseLexicalCosts,
      ...(update.baseLexicalCosts || {}),
    },
  };
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  sourceCode: initialSource,
  config: DEFAULT_CONFIG,
  parseResult: null,
  currentSequence: 0,
  currentState: initialSnapshot,
  isPlaying: false,
  playbackSpeed: 1.0,
  selectedCandidateId: null,
  snapshotCache: null,

  // Theme Initial State & Actions
  theme: initialTheme,
  setTheme: (theme: Theme) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('sh_theme', theme);
      }
    } catch {
      // ignore
    }
    syncDocumentTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const current = get().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  // Comparative Showdown & Blast-Radius Initial State
  activeEngine: 'erdf',
  comparativeShowdown: null,
  astDiffMode: 'standard',
  dualLeftEngine: 'erdf',
  dualRightEngine: 'clang',
  hoveredCandidateId: null,
  activeBlastRadius: null,

  // Semantic Symbol-Table & Type-Checking Initial State
  semanticResult: null,
  selectedScopeId: null,

  setSourceCode: (code: string) => {
    set({ sourceCode: code });
    get().runParser();
  },

  setConfig: (newConfig: Partial<RecoveryConfig>) => {
    set((state) => ({
      config: deepMergeConfig(state.config, newConfig),
    }));
    get().runParser();
  },

  runParser: () => {
    resetCandidateCounter();
    const { sourceCode, config, activeEngine } = get();
    const safeSource =
      sourceCode.length > MAX_SOURCE_CODE_LENGTH
        ? sourceCode.slice(0, MAX_SOURCE_CODE_LENGTH)
        : sourceCode;

    const result = parseWithErdf(safeSource, config);
    const { tokens } = tokenize(safeSource);

    const cache = new SnapshotCache(result.events, tokens, result.runSummary.inputHash, 15);
    const finalSeq = result.events.length;
    const finalState = cache.getStateAt(finalSeq);

    // Compute parallel multi-engine comparative showdown
    const showdown = runComparativeShowdown(safeSource, config);
    let blastRadius: BlastRadiusAssessment | null = null;
    const currentEngine = activeEngine || 'erdf';
    if (currentEngine === 'clang') {
      blastRadius = showdown.clang.blastRadiusAssessment;
    } else if (currentEngine === 'treesitter') {
      blastRadius = showdown.treesitter.blastRadiusAssessment;
    } else {
      blastRadius = showdown.erdf.blastRadiusAssessment;
    }

    // Run Semantic Symbol-Table & Type-Checking Analysis
    let semanticResult: SemanticAnalysisResult | null = null;
    try {
      semanticResult = analyzeSemantics(result.ast, safeSource);
    } catch (err) {
      console.error('Semantic symbol-table analysis error:', err);
    }

    set({
      parseResult: result,
      semanticResult,
      snapshotCache: cache,
      currentSequence: finalSeq,
      currentState: finalState,
      selectedCandidateId: null,
      isPlaying: false,
      comparativeShowdown: showdown,
      activeBlastRadius: blastRadius,
    });
  },

  seekToSequence: (seq: number) => {
    const { snapshotCache, parseResult } = get();
    if (!snapshotCache || !parseResult) return;

    const clamped = Math.max(0, Math.min(seq, parseResult.events.length));
    const reconstructed = snapshotCache.getStateAt(clamped);

    set({
      currentSequence: clamped,
      currentState: reconstructed,
    });
  },

  stepForward: () => {
    const { currentSequence, parseResult, seekToSequence } = get();
    if (parseResult && currentSequence < parseResult.events.length) {
      seekToSequence(currentSequence + 1);
    }
  },

  stepBackward: () => {
    const { currentSequence, seekToSequence } = get();
    if (currentSequence > 0) {
      seekToSequence(currentSequence - 1);
    }
  },

  jumpToPhase: (phase: ErdfPhase) => {
    const { parseResult, seekToSequence } = get();
    if (!parseResult) return;

    const targetEvent = parseResult.events.find((e) => e.phase === phase);
    if (targetEvent) {
      seekToSequence(targetEvent.sequence);
    }
  },

  jumpToNextError: () => {
    const { parseResult, currentSequence, seekToSequence } = get();
    if (!parseResult) return;

    const errorEventTypes = new Set([
      'SyntaxErrorDetected',
      'PanicDiscard',
      'CandidateGenerated',
      'RepairSelected',
      'RepairCommitted',
    ]);

    const nextErrorEvent = parseResult.events.find(
      (e) => errorEventTypes.has(e.type) && e.sequence > currentSequence
    );

    if (nextErrorEvent) {
      seekToSequence(nextErrorEvent.sequence);
    } else {
      // Loop around to first error if at end
      const firstError = parseResult.events.find((e) => errorEventTypes.has(e.type));
      if (firstError) {
        seekToSequence(firstError.sequence);
      }
    }
  },

  setIsPlaying: (isPlaying: boolean) => {
    const { currentSequence, parseResult, seekToSequence } = get();
    const total = parseResult?.events.length || 0;
    // If starting play and already at the end, restart from beginning
    if (isPlaying && currentSequence >= total) {
      seekToSequence(0);
    }
    set({ isPlaying });
  },

  setPlaybackSpeed: (speed: number) => {
    set({ playbackSpeed: speed });
  },

  selectCounterfactual: (candidateId: string | null) => {
    const { currentState, sourceCode, comparativeShowdown, activeEngine } = get();
    if (!candidateId) {
      let defaultBlast: BlastRadiusAssessment | null = null;
      if (comparativeShowdown) {
        if (activeEngine === 'clang') defaultBlast = comparativeShowdown.clang.blastRadiusAssessment;
        else if (activeEngine === 'treesitter') defaultBlast = comparativeShowdown.treesitter.blastRadiusAssessment;
        else defaultBlast = comparativeShowdown.erdf.blastRadiusAssessment;
      }
      set({ selectedCandidateId: null, activeBlastRadius: defaultBlast });
      return;
    }

    const candidate = currentState.candidates.find((c) => c.id === candidateId);
    let blast: BlastRadiusAssessment | null = null;
    if (candidate) {
      const winner =
        currentState.committedRepairs.find((w) => w.id === currentState.winningCandidateId) || null;
      blast = calculateCandidateBlastRadius(sourceCode, candidate, currentState.candidates, winner);
    }
    set({ selectedCandidateId: candidateId, activeBlastRadius: blast });
  },

  loadDemo: (demoId: string) => {
    const demo = CURATED_DEMOS.find((d) => d.id === demoId);
    if (demo) {
      set({ sourceCode: demo.source });
      get().runParser();
    }
  },

  applyCandidateSolution: (candidate: RepairCandidate) => {
    if (!candidate || !candidate.edits || candidate.edits.length === 0) return;
    const { sourceCode } = get();
    const { tokens } = tokenize(sourceCode);
    const patched = applyCandidateToSource(sourceCode, candidate, tokens);
    set({
      sourceCode: patched,
      selectedCandidateId: null,
    });
    get().runParser();
  },

  applyAllWinningRepairs: () => {
    const { sourceCode, currentState, parseResult } = get();
    const committed =
      currentState.committedRepairs.length > 0
        ? currentState.committedRepairs
        : parseResult?.committedRepairs || [];

    const activeDiagnostics =
      parseResult?.diagnostics && parseResult.diagnostics.length > 0
        ? parseResult.diagnostics
        : currentState.diagnostics;

    const incidents = groupCandidatesByIncident(
      currentState.candidates,
      committed,
      activeDiagnostics
    );

    const winners: RepairCandidate[] = [];
    for (const inc of incidents) {
      if (inc.winningCandidate && inc.winningCandidate.edits.length > 0) {
        if (!winners.some((w) => w.id === inc.winningCandidate!.id)) {
          winners.push(inc.winningCandidate);
        }
      }
    }

    const toApply = winners.length > 0 ? winners : committed;
    if (toApply.length === 0) return;

    const { tokens } = tokenize(sourceCode);
    const patched = applyMultipleCandidatesToSource(sourceCode, toApply, tokens);
    set({
      sourceCode: patched,
      selectedCandidateId: null,
    });
    get().runParser();
  },

  applySemanticFix: (fix: SemanticRepairCandidate) => {
    if (!fix || !fix.replacementSpan) return;
    const { sourceCode } = get();
    const { start, end } = fix.replacementSpan;
    if (start < 0 || end > sourceCode.length || start > end) return;
    const patched = sourceCode.slice(0, start) + fix.suggestedName + sourceCode.slice(end);
    set({
      sourceCode: patched,
      selectedCandidateId: null,
    });
    get().runParser();
  },

  setSelectedScopeId: (scopeId: string | null) => {
    set({ selectedScopeId: scopeId });
  },

  setActiveEngine: (engine: ComparativeEngineId) => {
    const { comparativeShowdown, astDiffMode, dualLeftEngine, dualRightEngine } = get();
    let blastRadius: BlastRadiusAssessment | null = null;
    if (comparativeShowdown) {
      if (engine === 'clang') {
        blastRadius = comparativeShowdown.clang.blastRadiusAssessment;
      } else if (engine === 'treesitter') {
        blastRadius = comparativeShowdown.treesitter.blastRadiusAssessment;
      } else {
        blastRadius = comparativeShowdown.erdf.blastRadiusAssessment;
      }
    }
    let newDualLeft = dualLeftEngine;
    let newDualRight = dualRightEngine;
    if (astDiffMode === 'split') {
      if (engine === 'clang') {
        newDualLeft = 'erdf';
        newDualRight = 'clang';
      } else if (engine === 'treesitter') {
        newDualLeft = 'erdf';
        newDualRight = 'treesitter';
      } else {
        newDualLeft = 'erdf';
        newDualRight = dualRightEngine === 'erdf' ? 'clang' : dualRightEngine;
      }
    }
    set({
      activeEngine: engine,
      activeBlastRadius: blastRadius,
      dualLeftEngine: newDualLeft,
      dualRightEngine: newDualRight,
    });
  },

  setAstDiffMode: (mode: 'standard' | 'overlay' | 'split') => {
    const { activeEngine, dualLeftEngine, dualRightEngine } = get();
    let newDualLeft = dualLeftEngine;
    let newDualRight = dualRightEngine;
    if (mode === 'split') {
      if (activeEngine === 'treesitter') {
        newDualLeft = 'erdf';
        newDualRight = 'treesitter';
      } else if (activeEngine === 'clang') {
        newDualLeft = 'erdf';
        newDualRight = 'clang';
      } else if (newDualLeft === newDualRight) {
        newDualLeft = 'erdf';
        newDualRight = 'clang';
      }
    }
    set({
      astDiffMode: mode,
      dualLeftEngine: newDualLeft,
      dualRightEngine: newDualRight,
    });
  },

  setDualEngines: (left: ComparativeEngineId, right: ComparativeEngineId) => {
    let safeLeft = left;
    let safeRight = right;
    if (safeLeft === safeRight) {
      if (safeLeft === 'clang') safeRight = 'treesitter';
      else if (safeLeft === 'treesitter') safeRight = 'clang';
      else safeRight = 'clang';
    }
    set({
      dualLeftEngine: safeLeft,
      dualRightEngine: safeRight,
    });
  },

  setHoveredCandidateId: (candidateId: string | null) => {
    const { currentState, sourceCode, comparativeShowdown, activeEngine, selectedCandidateId } = get();

    if (selectedCandidateId && !candidateId) {
      const selCand = currentState.candidates.find((c) => c.id === selectedCandidateId);
      if (selCand) {
        const winner =
          currentState.committedRepairs.find((w) => w.id === currentState.winningCandidateId) || null;
        const blast = calculateCandidateBlastRadius(sourceCode, selCand, currentState.candidates, winner);
        set({ hoveredCandidateId: null, activeBlastRadius: blast });
        return;
      }
    }

    if (!candidateId) {
      let defaultBlast: BlastRadiusAssessment | null = null;
      if (comparativeShowdown) {
        if (activeEngine === 'clang') defaultBlast = comparativeShowdown.clang.blastRadiusAssessment;
        else if (activeEngine === 'treesitter') defaultBlast = comparativeShowdown.treesitter.blastRadiusAssessment;
        else defaultBlast = comparativeShowdown.erdf.blastRadiusAssessment;
      }
      set({ hoveredCandidateId: null, activeBlastRadius: defaultBlast });
      return;
    }

    const candidate = currentState.candidates.find((c) => c.id === candidateId);
    if (candidate) {
      const winner =
        currentState.committedRepairs.find((w) => w.id === currentState.winningCandidateId) || null;
      const blast = calculateCandidateBlastRadius(sourceCode, candidate, currentState.candidates, winner);
      set({ hoveredCandidateId: candidateId, activeBlastRadius: blast });
    } else {
      set({ hoveredCandidateId: candidateId });
    }
  },
}));
