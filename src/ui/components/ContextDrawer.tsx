import React, { useState, useMemo, useCallback } from 'react';
import { useReplayStore } from '../../state/replayStore';
import { formatCandidateAction } from '../utils/candidateFormatter';
import {
  Award,
  Search,
  AlertTriangle,
  X,
  CheckCircle2,
  XCircle,
  Eye,
  Zap,
  Activity,
  ArrowRight,
  Flame,
  Layers,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { ErdfPhase } from '../../erdf/schema';
import { RepairCandidate } from '../../language/types';
import { groupCandidatesByIncident } from '../utils/incidentGrouping';
import {
  generateCompilerDoctorRationale,
  generateEngineRationale,
} from '../../analysis/rationaleGenerator';
import { calculateCandidateBlastRadius } from '../../analysis/blastRadiusEngine';
import { ScopeSymbolsView } from './ScopeSymbolsView';
import { getSemanticRecommendation } from '../../semantics/typeChecker';

export type ContextDrawerTab = 'arena' | 'showdown' | 'doctor' | 'inspector' | 'symbols' | 'diagnostics';
export type InspectorBarPosition = 'top' | 'right';

export interface ContextDrawerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  activeTab: ContextDrawerTab;
  onTabChange: (tab: ContextDrawerTab) => void;
  autoOpenOnErrors: boolean;
  onToggleAutoOpen: () => void;
  position?: InspectorBarPosition;
  onPositionChange?: (pos: InspectorBarPosition) => void;
}

export const ContextDrawer: React.FC<ContextDrawerProps> = ({
  isOpen,
  onToggleOpen,
  activeTab,
  onTabChange,
  autoOpenOnErrors,
  onToggleAutoOpen,
  position = 'right',
  onPositionChange: _onPositionChange,
}) => {
  const {
    currentState,
    config,
    selectedCandidateId,
    selectCounterfactual,
    parseResult,
    applyCandidateSolution,
    applyAllWinningRepairs,
    activeEngine,
    setActiveEngine,
    comparativeShowdown,
    setHoveredCandidateId,
    sourceCode,
    semanticResult,
    applySemanticFix,
  } = useReplayStore();

  const [selectedIncidentFilter, setSelectedIncidentFilter] = useState<string>('all');
  const [justAppliedId, setJustAppliedId] = useState<string | null>(null);
  const [justAppliedAll, setJustAppliedAll] = useState<boolean>(false);

  // Resizable dimension state (Height for top bar, Width for right bar)
  const [barHeight, setBarHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sh_inspector_top_height');
      return saved ? Math.max(140, Math.min(480, parseInt(saved, 10))) : 220;
    } catch {
      return 220;
    }
  });

  const [barWidth, setBarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sh_inspector_right_width');
      return saved ? Math.max(280, Math.min(650, parseInt(saved, 10))) : 380;
    } catch {
      return 380;
    }
  });

  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Resize handler for Top Bar (dragging bottom border down/up)
  const startResizingTop = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startY = e.clientY;
      const initialHeight = barHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startY;
        const newHeight = Math.max(140, Math.min(window.innerHeight * 0.6, initialHeight + delta));
        setBarHeight(newHeight);
        try {
          localStorage.setItem('sh_inspector_top_height', newHeight.toString());
        } catch {
          // ignore
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [barHeight]
  );

  // Resize handler for Right Bar (dragging left border left/right)
  const startResizingRight = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const initialWidth = barWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.max(280, Math.min(window.innerWidth * 0.6, initialWidth + delta));
        setBarWidth(newWidth);
        try {
          localStorage.setItem('sh_inspector_right_width', newWidth.toString());
        } catch {
          // ignore
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [barWidth]
  );

  const {
    candidates,
    winningCandidateId,
    activeRule,
    cursor,
    tokens,
    phase,
    currentCheckpointRef,
    stateHash,
    diagnostics: stateDiagnostics,
  } = currentState;

  const diagnostics =
    parseResult?.diagnostics && parseResult.diagnostics.length > 0
      ? parseResult.diagnostics
      : stateDiagnostics;

  const committed =
    currentState.committedRepairs.length > 0
      ? currentState.committedRepairs
      : parseResult?.committedRepairs || [];

  const incidents = useMemo(() => {
    return groupCandidatesByIncident(candidates, committed, diagnostics);
  }, [candidates, committed, diagnostics]);

  const winningRepairsCount = incidents.filter((inc) => inc.winningCandidate !== null).length;

  const displayedIncidents = useMemo(() => {
    if (selectedIncidentFilter === 'all') return incidents;
    const filtered = incidents.filter((inc) => inc.id === selectedIncidentFilter);
    return filtered.length > 0 ? filtered : incidents;
  }, [incidents, selectedIncidentFilter]);

  const handleApplyAll = () => {
    setJustAppliedAll(true);
    applyAllWinningRepairs();
    setTimeout(() => setJustAppliedAll(false), 1500);
  };

  const handleApplyCandidate = (cand: RepairCandidate) => {
    setJustAppliedId(cand.id);
    applyCandidateSolution(cand);
    setTimeout(() => setJustAppliedId(null), 1500);
  };

  // Selected or active candidate for Compiler Doctor evaluation
  const activeFocusCandidate = useMemo(() => {
    if (selectedCandidateId) {
      const found = candidates.find((c) => c.id === selectedCandidateId);
      if (found) return found;
    }
    const firstInc = incidents[0];
    if (firstInc?.winningCandidate) return firstInc.winningCandidate;
    if (firstInc?.candidates?.[0]) return firstInc.candidates[0];
    return candidates[0] || null;
  }, [selectedCandidateId, candidates, incidents]);

  const activeWinner = useMemo(() => {
    return (
      candidates.find((c) => c.id === winningCandidateId) ||
      incidents[0]?.winningCandidate ||
      null
    );
  }, [candidates, winningCandidateId, incidents]);

  const doctorRationale = useMemo(() => {
    if (activeFocusCandidate) {
      return generateCompilerDoctorRationale(activeFocusCandidate, activeWinner, sourceCode);
    }
    return generateEngineRationale(activeEngine, comparativeShowdown);
  }, [activeFocusCandidate, activeWinner, sourceCode, activeEngine, comparativeShowdown]);

  const currentToken = tokens[cursor] || tokens[tokens.length - 1];
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const candidateCount = candidates.length;
  const typoSuggestions = semanticResult?.suggestions || [];
  const semanticTypoCount = typoSuggestions.length;
  const semanticDiagnostics = semanticResult?.diagnostics || [];

  // Phase badge styles
  const phaseColorMap: Record<ErdfPhase, string> = {
    lex: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800',
    parse: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800',
    recovery: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
    commit: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  };

  if (!isOpen) {
    return null;
  }

  const isTopBar = position === 'top';

  return (
    <aside
      style={isTopBar ? { height: `${barHeight}px` } : { width: `${barWidth}px` }}
      className={`bg-white dark:bg-[#070b16] flex flex-col shrink-0 select-none z-20 shadow-2xl transition-all duration-150 relative ${
        isTopBar
          ? 'w-full border-b border-slate-200 dark:border-slate-800/80'
          : 'h-full border-l border-slate-200 dark:border-slate-800/80'
      }`}
    >
      {/* Inspector Bar Header */}
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs shrink-0">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 py-0.5 whitespace-nowrap">
          {/* Tab 1: Repairs / Candidates */}
          <button
            onClick={() => onTabChange('arena')}
            title="Inspect repair candidate branches and apply fixes"
            className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1 shrink-0 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'arena'
                ? 'bg-purple-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Award className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold whitespace-nowrap hidden sm:inline">Repairs</span>
            <span className="font-semibold whitespace-nowrap sm:hidden">Fixes</span>
            {candidateCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'arena' ? 'bg-purple-800 text-white' : 'bg-slate-100 dark:bg-slate-700 text-purple-700 dark:text-purple-300'
              }`}>
                {candidateCount}
              </span>
            )}
          </button>

          {/* Tab 2: Showdown */}
          <button
            onClick={() => onTabChange('showdown')}
            title="Live Multi-Engine Comparative Showdown (ERDF vs Clang vs Tree-sitter)"
            className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1 shrink-0 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'showdown'
                ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold whitespace-nowrap hidden sm:inline">Showdown</span>
            <span className="font-semibold whitespace-nowrap sm:hidden">Show</span>
          </button>

          {/* Tab 3: Doctor */}
          <button
            onClick={() => onTabChange('doctor')}
            title="Compiler Doctor causal diagnosis & avalanche analysis"
            className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1 shrink-0 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'doctor'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold whitespace-nowrap hidden sm:inline">Doctor</span>
            <span className="font-semibold whitespace-nowrap sm:hidden">Doc</span>
          </button>

          {/* Tab 4: Inspector / Decision State */}
          <button
            onClick={() => onTabChange('inspector')}
            title="Token cursor, active grammar rule & 4-factor cost objectives"
            className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1 shrink-0 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'inspector'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold whitespace-nowrap hidden sm:inline">Inspector</span>
            <span className="font-semibold whitespace-nowrap sm:hidden">Inspect</span>
          </button>

          {/* Tab 5: Symbols & Semantic Recommendations */}
          <button
            onClick={() => onTabChange('symbols')}
            title="Inspect symbol checking, typo quick-fixes & scope diagnostic recommendations"
            className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1 shrink-0 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'symbols'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold whitespace-nowrap hidden sm:inline">Symbols</span>
            <span className="font-semibold whitespace-nowrap sm:hidden">Sym</span>
            {semanticTypoCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'symbols' ? 'bg-sky-800 text-white' : 'bg-slate-100 dark:bg-slate-700 text-sky-700 dark:text-sky-300'
              }`}>
                {semanticTypoCount}
              </span>
            )}
          </button>

          {/* Tab 6: Diagnostics */}
          <button
            onClick={() => onTabChange('diagnostics')}
            title="Syntax diagnostics & compiler error messages"
            className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1 shrink-0 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'diagnostics'
                ? 'bg-rose-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold whitespace-nowrap hidden sm:inline">Diagnostics</span>
            <span className="font-semibold whitespace-nowrap sm:hidden">Diag</span>
            {errorCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'diagnostics' ? 'bg-rose-800 text-white' : 'bg-slate-100 dark:bg-slate-700 text-rose-700 dark:text-rose-300'
              }`}>
                {errorCount}
              </span>
            )}
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
          {/* Auto-Open Toggle */}
          <button
            onClick={onToggleAutoOpen}
            title={`Auto-open inspector during syntax recovery: ${autoOpenOnErrors ? 'Enabled' : 'Disabled'}`}
            className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 border transition cursor-pointer whitespace-nowrap ${
              autoOpenOnErrors
                ? 'bg-sky-600 text-white border-sky-500 font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span className="hidden md:inline font-mono">Auto</span>
          </button>

          {/* Close Button */}
          <button
            onClick={onToggleOpen}
            title="Close Inspector (Ctrl+K)"
            className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inspector Body Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs text-slate-800 dark:text-slate-200">
        {/* TAB 1: REPAIRS (ARENA) */}
        {activeTab === 'arena' && (
          <div className="space-y-3">
            {/* Header Toolbar: Incidents Filter & Batch Apply Button */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Syntax Incidents:
                </span>
                <span className="text-slate-800 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 font-bold">
                  {incidents.length} error{incidents.length !== 1 ? 's' : ''}
                </span>
                <span className="text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800/60 font-semibold">
                  {candidateCount} repair candidate{candidateCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Apply All Winning Repairs Button */}
              {winningRepairsCount > 0 && (
                <button
                  onClick={handleApplyAll}
                  className="py-1.5 px-3 rounded-md text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm whitespace-nowrap shrink-0"
                  title="Apply all winning repair solutions across the entire codebase simultaneously"
                >
                  {justAppliedAll ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      <span>Applied All Solutions!</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-white fill-current" />
                      <span>
                        Apply All Winning Solutions ({winningRepairsCount} Fix{winningRepairsCount > 1 ? 'es' : ''})
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Error Incident Filter Pills (if multiple errors) */}
            {incidents.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none whitespace-nowrap">
                <button
                  onClick={() => setSelectedIncidentFilter('all')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium shrink-0 whitespace-nowrap transition cursor-pointer ${
                    selectedIncidentFilter === 'all'
                      ? 'bg-purple-600 text-white font-semibold shadow-sm'
                      : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  All Errors ({incidents.length})
                </button>
                {incidents.map((inc) => (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedIncidentFilter(inc.id)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium shrink-0 whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                      selectedIncidentFilter === inc.id
                        ? 'bg-purple-600 text-white font-semibold shadow-sm'
                        : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span>Error #{inc.index}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">Ln {inc.line}</span>
                    {inc.winningCandidate && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {candidateCount === 0 && incidents.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center text-slate-500">
                <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400/60 mb-2 stroke-1" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-300">Clean Syntax Stream</p>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  No syntax errors or active repair candidates at the current checkpoint.
                </p>
              </div>
            ) : (
              displayedIncidents.map((inc) => (
                <div key={inc.id} className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono bg-slate-100 dark:bg-slate-900 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                      <span>Error #{inc.index} (Line {inc.line}, Col {inc.column})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          inc.isResolved
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                        }`}
                      >
                        {inc.isResolved ? 'Resolved' : 'Needs Repair'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                        {inc.candidates.length} options
                      </span>
                    </div>
                  </div>

                  {/* Responsive Grid for Candidates */}
                  <div
                    className={
                      isTopBar
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5'
                        : 'space-y-2.5'
                    }
                  >
                    {inc.candidates.map((cand, cIdx) => {
                      const isWinner =
                        cand.id === inc.winningCandidate?.id ||
                        cand.id === winningCandidateId ||
                        cand.status === 'selected';
                      const isSelectedForPreview = cand.id === selectedCandidateId;
                      const editSummary = formatCandidateAction(cand);
                      const blast = calculateCandidateBlastRadius(
                        sourceCode,
                        cand,
                        inc.candidates,
                        inc.winningCandidate
                      );

                      let borderStyle = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300';
                      if (isWinner) {
                        borderStyle =
                          'border-emerald-500 dark:border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-slate-900 dark:text-slate-100 shadow-sm shadow-emerald-500/10';
                      } else if (cand.status === 'pruned') {
                        borderStyle = 'border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 text-slate-600 dark:text-slate-400';
                      } else if (cand.status === 'rejected') {
                        borderStyle = 'border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-slate-600 dark:text-slate-400';
                      }

                      if (isSelectedForPreview) {
                        borderStyle += ' ring-2 ring-purple-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950';
                      }

                      return (
                        <div
                          key={cand.id || cIdx}
                          onMouseEnter={() => setHoveredCandidateId(cand.id)}
                          onMouseLeave={() => setHoveredCandidateId(null)}
                          className={`p-2.5 rounded-lg border transition-all flex flex-col justify-between ${borderStyle}`}
                        >
                          <div>
                            {/* Card Header */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isWinner ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                                ) : cand.status === 'pruned' ? (
                                  <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                                ) : cand.status === 'rejected' ? (
                                  <XCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                                ) : (
                                  <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                                )}
                                <span
                                  className="font-bold text-slate-900 dark:text-slate-200 text-xs truncate"
                                  title={editSummary}
                                >
                                  {editSummary}
                                </span>
                              </div>

                              {isWinner ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 text-[10px] font-bold dark:border-emerald-700 uppercase tracking-wider shrink-0">
                                  Recommended
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-[10px] font-mono border border-slate-200 dark:border-slate-800 shrink-0">
                                  {cand.status}
                                </span>
                              )}
                            </div>

                            {/* Key Metrics: Cost & Blast Radius */}
                            <div className="grid grid-cols-2 gap-1.5 mb-2 text-[11px]">
                              <div className="bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Total Penalty:</span>
                                <span className="font-bold text-amber-700 dark:text-amber-300 font-mono">
                                  {cand.cost?.total !== undefined ? cand.cost.total.toFixed(2) : '0.00'}
                                </span>
                              </div>

                              <div
                                className={`p-1.5 rounded border flex items-center justify-between ${
                                  blast.severity === 'zero'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                    : blast.severity === 'medium'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                }`}
                              >
                                <span>Blast Radius:</span>
                                <span className="font-bold">{blast.blastRadius} tok</span>
                              </div>
                            </div>

                            {/* Lookahead Validation Meter */}
                            <div className="mb-2.5">
                              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                                <span>Lookahead Verification</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {cand.validation?.sourceTokensProgressed || 0} /{' '}
                                  {config.budgets?.lookaheadWindow || 4} verified
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-200 dark:border-slate-800">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    isWinner
                                      ? 'bg-emerald-500'
                                      : cand.status === 'pruned'
                                      ? 'bg-amber-500'
                                      : 'bg-sky-500'
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      ((cand.validation?.sourceTokensProgressed || 0) /
                                        (config.budgets?.lookaheadWindow || 4)) *
                                        100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons: Preview AST & Apply Solution */}
                          <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                            <button
                              onClick={() =>
                                selectCounterfactual(isSelectedForPreview ? null : cand.id)
                              }
                              className={`py-1.5 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                                isSelectedForPreview
                                  ? 'bg-purple-600 text-white font-semibold shadow-sm'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white'
                              }`}
                              title="Preview this repair branch on the AST canvas"
                            >
                              <Eye className="w-3.5 h-3.5 shrink-0" />
                              <span className="whitespace-nowrap">
                                {isSelectedForPreview ? 'Active Preview' : 'Preview Tree'}
                              </span>
                            </button>

                            <button
                              onClick={() => handleApplyCandidate(cand)}
                              className="py-1.5 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                              title="Apply this repair solution directly to source code"
                            >
                              {justAppliedId === cand.id ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                  <span>Applied!</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5 text-white fill-current" />
                                  <span>Apply Fix</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: LIVE MULTI-ENGINE SHOWDOWN */}
        {activeTab === 'showdown' && (
          <div className="space-y-3">
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-xs">
                  <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Comparative Engine Showdown</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-sans mt-0.5">
                  Side-by-side comparison of error recovery across 3 compiler architectures.
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 font-semibold">
                Live Benchmarking
              </span>
            </div>

            {/* 3 Engine Cards: Grid on Top Bar, Stack on Right Bar */}
            <div className={isTopBar ? 'grid grid-cols-1 md:grid-cols-3 gap-3' : 'space-y-3'}>
              {/* Engine 1: ERDF */}
              <div
                className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
                  activeEngine === 'erdf'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/50 ring-1 ring-emerald-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>ERDF Self-Healing</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 uppercase">
                      Optimal
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-normal mb-3">
                    Synthesizes minimal ghost delimiters via bounded lookahead search without discarding source tokens.
                  </p>

                  <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-md bg-slate-50 dark:bg-black/40 text-center text-[11px] mb-3 border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Blast Radius</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">0 tokens</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Cascading</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">0 errors</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">AST Intact</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">100%</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveEngine('erdf')}
                  className={`w-full py-1.5 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shadow-sm ${
                    activeEngine === 'erdf'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {activeEngine === 'erdf' ? '✓ Active Engine' : 'Activate ERDF View'}
                </button>
              </div>

              {/* Engine 2: Clang/GCC Panic Mode */}
              <div
                className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
                  activeEngine === 'clang'
                    ? 'bg-rose-50 dark:bg-slate-900 border-rose-500 shadow-md ring-1 ring-rose-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5 text-xs">
                      <Flame className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>Clang/GCC Panic Mode</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 uppercase">
                      Cascade Failure
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-normal mb-3">
                    Discards tokens until statement synchronizer, triggering secondary phantom errors.
                  </p>

                  <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-md bg-slate-50 dark:bg-slate-950 text-center text-[11px] mb-3 border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Blast Radius</span>
                      <span className="font-bold text-rose-700 dark:text-rose-400">
                        {comparativeShowdown?.clang.blastRadius ?? 14} tokens
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Cascading</span>
                      <span className="font-bold text-rose-700 dark:text-rose-400">
                        +{comparativeShowdown?.clang.cascadingMultiplier ?? 3} errors
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">AST Intact</span>
                      <span className="font-bold text-rose-700 dark:text-rose-400">
                        {comparativeShowdown?.clang.astPreservationIndex ?? 35}%
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveEngine('clang')}
                  className={`w-full py-1.5 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shadow-sm ${
                    activeEngine === 'clang'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {activeEngine === 'clang' ? '✓ Active Engine' : 'Preview Clang Collapse'}
                </button>
              </div>

              {/* Engine 3: Tree-sitter Incremental Splicing */}
              <div
                className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
                  activeEngine === 'treesitter'
                    ? 'bg-amber-50 dark:bg-slate-900 border-amber-500 shadow-md ring-1 ring-amber-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                      <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Tree-sitter Splicing</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 uppercase">
                      ERROR Node
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-normal mb-3">
                    Wraps the damaged fragment in an opaque ERROR node without inferring missing tokens.
                  </p>

                  <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-md bg-slate-50 dark:bg-slate-950 text-center text-[11px] mb-3 border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Blast Radius</span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        {comparativeShowdown?.treesitter.blastRadius ?? 4} tokens
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Cascading</span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        +{comparativeShowdown?.treesitter.cascadingMultiplier ?? 1} error
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">AST Intact</span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        {comparativeShowdown?.treesitter.astPreservationIndex ?? 75}%
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveEngine('treesitter')}
                  className={`w-full py-1.5 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shadow-sm ${
                    activeEngine === 'treesitter'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {activeEngine === 'treesitter' ? '✓ Active Engine' : 'Preview Tree-sitter'}
                </button>
              </div>
            </div>

            {/* Teaching Callout */}
            <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 text-xs">
              <span className="font-bold text-indigo-900 dark:text-indigo-300 block mb-1">
                Key Finding: Why ERDF Outperforms Traditional Compilers
              </span>
              <p className="text-slate-700 dark:text-slate-300 font-sans leading-relaxed text-xs">
                {comparativeShowdown?.ahaMomentExplanation ||
                  'Traditional compilers panic when encountering missing delimiters, discarding valid statements and confusing developers with 30 false errors for 1 missing bracket. ERDF solves this by treating recovery as an optimal path search with virtual lookahead validation.'}
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: COMPILER DOCTOR */}
        {activeTab === 'doctor' && (
          <div className="space-y-3">
            <div className={isTopBar ? 'grid grid-cols-1 md:grid-cols-3 gap-3' : 'space-y-3'}>
              {/* Panel 1: Clinical Diagnosis & Hypothesis */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                    {doctorRationale.title}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-relaxed">
                  {doctorRationale.clinicalDiagnosis}
                </p>

                <div className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 mt-2">
                  <span className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider block mb-1">
                    Causal Hypothesis
                  </span>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-sans italic">
                    "{doctorRationale.hypothesis}"
                  </p>
                </div>
              </div>

              {/* Panel 2: Downstream Ripple Effect */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                  Downstream Avalanche Ripple-Effect:
                </span>
                <div className="space-y-1.5">
                  {doctorRationale.causalChain.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                      <span className="text-slate-800 dark:text-slate-200 font-sans leading-tight">{step}</span>
                    </div>
                  ))}
                </div>

                <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs mt-2">
                  <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider block mb-0.5">
                    Panic Mode Impact:
                  </span>
                  <p className="text-rose-900 dark:text-rose-200 font-sans text-xs">
                    {doctorRationale.downstreamConsequence}
                  </p>
                </div>
              </div>

              {/* Panel 3: Prescription & Scorecard */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/80 text-xs">
                  <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Doctor's Prescription</span>
                  </span>
                  <p className="text-emerald-950 dark:text-emerald-100 font-sans font-semibold text-xs leading-normal">
                    {doctorRationale.erdfDecision}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">
                    Avalanche Contrast:
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                      <span className="text-rose-700 dark:text-rose-400 block text-[10px] font-bold mb-1">Panic Path</span>
                      <span className="text-slate-700 dark:text-slate-300 block text-[11px]">
                        Br: {doctorRationale.scorecard.candidateBlastRadius} tok
                      </span>
                      <span className="text-slate-700 dark:text-slate-300 block text-[11px]">
                        +{doctorRationale.scorecard.candidateCascadingMultiplier} cascades
                      </span>
                      <span className="text-rose-800 dark:text-rose-300 font-bold block text-xs mt-1">
                        AST: {doctorRationale.scorecard.candidateAstPreservation}%
                      </span>
                    </div>

                    <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60">
                      <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] font-bold mb-1">ERDF Solution</span>
                      <span className="text-slate-700 dark:text-slate-300 block text-[11px]">Br: 0 tok</span>
                      <span className="text-slate-700 dark:text-slate-300 block text-[11px]">0 cascades</span>
                      <span className="text-emerald-800 dark:text-emerald-300 font-bold block text-xs mt-1">
                        AST: 100%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: INSPECTOR (DECISION & STATE) */}
        {activeTab === 'inspector' && (
          <div className="space-y-3">
            <div
              className={
                isTopBar
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3'
                  : 'space-y-2.5'
              }
            >
              {/* Card 1: Parser Rule & Checkpoint */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2 text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                    <span>Active Grammar Rule</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                        phaseColorMap[phase] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {phase}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-sky-100 dark:bg-sky-950 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 font-bold text-sm font-mono">
                      {activeRule || 'program'}
                    </span>
                  </div>
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-xs mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  Checkpoint Ref: <span className="text-slate-900 dark:text-slate-200 font-bold">{currentCheckpointRef || 'cp-0'}</span>
                </div>
              </div>

              {/* Card 2: Current Focus Token */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase block mb-2">
                    Focus Token at Cursor #{cursor}
                  </span>
                  {currentToken ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800 text-xs font-bold">
                          {currentToken.kind}
                        </span>
                        <span className="text-slate-900 dark:text-white font-bold text-sm font-mono">
                          "{currentToken.lexeme}"
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Origin:{' '}
                        <span
                          className={
                            currentToken.origin === 'synthetic'
                              ? 'text-purple-700 dark:text-purple-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300'
                          }
                        >
                          {currentToken.origin}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 dark:text-slate-500 text-xs italic">End of Token Stream (EOF)</div>
                  )}
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-xs mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  {currentToken
                    ? `Line ${currentToken.span.line}, Column ${currentToken.span.column}`
                    : 'Stream Completed'}
                </div>
              </div>

              {/* Card 3: 4-Factor Recovery Cost Weights */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-2">
                  Recovery Cost Multipliers
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Lexical:</span>
                    <span className="font-bold text-sky-700 dark:text-sky-400">{config.defaultLexicalCost}x</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Structural:</span>
                    <span className="font-bold text-indigo-700 dark:text-indigo-400">{config.weights.structural}x</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Semantic:</span>
                    <span className="font-bold text-purple-700 dark:text-purple-400">{config.weights.semanticRisk}x</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Diagnostic:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{config.weights.diagnostic}x</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Execution Status & Replay State */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase block mb-2">
                    Replay Event Status
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Step Sequence:</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">#{currentState.sequence}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Total Tokens:</span>
                      <span className="text-slate-900 dark:text-slate-200 font-bold">{tokens.length}</span>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>State Hash:</span>
                  <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">
                    {stateHash ? stateHash.slice(0, 10) + '…' : '0x00000000'}
                  </span>
                </div>
              </div>

              {/* Card 5: Symbol Checking & Semantic Recommendations (Without Table) */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                  <span className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    <span>Symbol Checking & Recommendations</span>
                  </span>
                  {semanticTypoCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30 text-[10px] font-bold">
                      {semanticTypoCount} Typo Fix{semanticTypoCount !== 1 ? 'es' : ''}
                    </span>
                  ) : semanticDiagnostics.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 text-[10px] font-bold">
                      {semanticDiagnostics.length} Issue{semanticDiagnostics.length !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      Clean
                    </span>
                  )}
                </div>

                {/* 1. Actionable Typo Quick-Fixes */}
                {semanticTypoCount > 0 && (
                  <div className="space-y-1.5 pt-0.5">
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 font-sans leading-tight">
                      Undeclared identifiers detected. Fuzzy matching found in-scope corrections:
                    </p>
                    <div className="space-y-1.5">
                      {typoSuggestions.map((cand) => (
                        <div
                          key={cand.id}
                          className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 transition"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 text-xs flex-wrap">
                              <span className="line-through text-rose-800 dark:text-rose-300 font-semibold bg-rose-100 dark:bg-rose-500/20 px-2 py-0.5 rounded border border-rose-300 dark:border-rose-500/30">
                                {cand.originalName}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span className="text-emerald-800 dark:text-emerald-300 font-bold bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/30">
                                {cand.suggestedName}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400 text-[10px]">({cand.symbol.typeSpecifier})</span>
                            </div>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block pt-0.5">
                              Did you mean '{cand.suggestedName}'? ({cand.matchPercentage}% match) • Ln {cand.replacementSpan.line}:{cand.replacementSpan.column}
                            </span>
                          </div>
                          <button
                            onClick={() => applySemanticFix(cand)}
                            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shrink-0 transition flex items-center gap-1 cursor-pointer shadow-sm whitespace-nowrap"
                            title={`Replace '${cand.originalName}' with '${cand.suggestedName}'`}
                          >
                            <Zap className="w-3.5 h-3.5 fill-current" />
                            <span>Apply Symbol Fix</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Actionable Scope Diagnostic Advice & Recommendations */}
                {semanticDiagnostics.length > 0 && (
                  <div className="space-y-1.5 pt-0.5">
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 font-sans font-medium leading-tight">
                      Scope Diagnostic Advice & Recommendations:
                    </p>
                    <div className="space-y-1.5">
                      {semanticDiagnostics.map((diag, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 font-semibold">
                                {diag.semanticKind}
                              </span>
                              <span className="text-slate-800 dark:text-slate-200 truncate">{diag.message}</span>
                            </span>
                            {diag.span.line > 0 && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono shrink-0 ml-1">
                                Ln {diag.span.line}:{diag.span.column}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-700 dark:text-slate-300 font-sans pl-4">
                            <strong className="text-sky-700 dark:text-sky-300 font-semibold">Advice: </strong>
                            {getSemanticRecommendation(diag)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Reassuring Clean Status */}
                {semanticTypoCount === 0 && semanticDiagnostics.length === 0 && (
                  <div className="p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-[11px] font-sans">
                      All variables, functions, and scopes resolved cleanly. Zero symbol or semantic conflicts detected.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SYMBOLS & SEMANTIC RECOMMENDATIONS (WITHOUT TABLE) */}
        {activeTab === 'symbols' && (
          <div className="space-y-3">
            <ScopeSymbolsView withoutTable={true} />
          </div>
        )}

        {/* TAB 6: DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800/80 text-xs">
              <span className="uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400 text-xs">
                Active Syntax Diagnostics
              </span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-rose-700 dark:text-rose-400 font-bold">{errorCount} errors</span>
                <span className="text-slate-400">•</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{warningCount} warnings</span>
              </div>
            </div>

            {diagnostics.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center text-slate-500">
                <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400/60 mb-2 stroke-1" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Clean Syntax Stream</p>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Zero syntax violations detected in the current code stream.
                </p>
              </div>
            ) : (
              <div
                className={
                  isTopBar
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5'
                    : 'space-y-2'
                }
              >
                {diagnostics.map((diag, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border text-xs font-mono transition ${
                      diag.severity === 'error'
                        ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/70 text-rose-900 dark:text-rose-200'
                        : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>{diag.code || 'SYNTAX_ERROR'}</span>
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        Line {diag.span.line}, Col {diag.span.column}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-normal">
                      {diag.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize Handle: Bottom edge for Top Bar, Left edge for Right Bar */}
      {isTopBar ? (
        <div
          onMouseDown={startResizingTop}
          onDoubleClick={() => setBarHeight((h) => (h > 260 ? 180 : 320))}
          className={`w-full h-1.5 hover:h-2 bg-slate-200 dark:bg-slate-900 hover:bg-sky-500/80 active:bg-sky-400 cursor-row-resize transition-all shrink-0 z-30 group relative flex items-center justify-center select-none ${
            isResizing ? 'bg-sky-500 h-2' : ''
          }`}
        >
          <div className="h-[2px] w-12 bg-slate-400 dark:bg-slate-700 group-hover:bg-sky-600 dark:group-hover:bg-white rounded-full transition-colors" />
        </div>
      ) : (
        <div
          onMouseDown={startResizingRight}
          onDoubleClick={() => setBarWidth((w) => (w > 400 ? 340 : 480))}
          className={`absolute left-0 top-0 bottom-0 w-1.5 hover:w-2 bg-slate-200 dark:bg-slate-900 hover:bg-sky-500/80 active:bg-sky-400 cursor-col-resize transition-all shrink-0 z-30 group flex items-center justify-center select-none ${
            isResizing ? 'bg-sky-500 w-2' : ''
          }`}
        >
          <div className="w-[1px] h-8 bg-slate-400 dark:bg-slate-700 group-hover:bg-sky-600 dark:group-hover:bg-white rounded-full transition-colors" />
        </div>
      )}
    </aside>
  );
};
