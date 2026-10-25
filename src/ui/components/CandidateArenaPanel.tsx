import React, { useState, useMemo } from 'react';
import { useReplayStore } from '../../state/replayStore';
import {
  Award,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Zap,
  Flame,
  Layers,
  Activity,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { formatCandidateAction } from '../utils/candidateFormatter';
import { groupCandidatesByIncident } from '../utils/incidentGrouping';
import {
  generateCompilerDoctorRationale,
  generateEngineRationale,
} from '../../analysis/rationaleGenerator';
import { calculateCandidateBlastRadius } from '../../analysis/blastRadiusEngine';

export type ArenaViewMode = 'repairs' | 'showdown' | 'doctor';

export const CandidateArenaPanel: React.FC = () => {
  const {
    currentState,
    parseResult,
    selectedCandidateId,
    selectCounterfactual,
    applyCandidateSolution,
    applyAllWinningRepairs,
    activeEngine,
    setActiveEngine,
    comparativeShowdown,
    setHoveredCandidateId,
    sourceCode,
  } = useReplayStore();
  const { candidates, winningCandidateId } = currentState;

  const [arenaMode, setArenaMode] = useState<ArenaViewMode>('repairs');
  const [selectedIncidentFilter, setSelectedIncidentFilter] = useState<string>('all');
  const [justAppliedId, setJustAppliedId] = useState<string | null>(null);
  const [justAppliedAll, setJustAppliedAll] = useState<boolean>(false);

  const diagnostics =
    parseResult?.diagnostics && parseResult.diagnostics.length > 0
      ? parseResult.diagnostics
      : currentState.diagnostics;

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

  // Selected or active candidate for Compiler Doctor evaluation
  const activeFocusCandidate = useMemo(() => {
    if (selectedCandidateId) {
      const found = candidates.find((c) => c.id === selectedCandidateId);
      if (found) return found;
    }
    // Default to first incident's winning candidate or first candidate
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

  const handleApplyAll = () => {
    setJustAppliedAll(true);
    applyAllWinningRepairs();
    setTimeout(() => setJustAppliedAll(false), 1500);
  };

  const handleApplyCandidate = (cand: typeof candidates[0]) => {
    setJustAppliedId(cand.id);
    applyCandidateSolution(cand);
    setTimeout(() => setJustAppliedId(null), 1500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 select-none">
      {/* Header & Arena Mode View Switcher */}
      <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-md border border-slate-200 dark:border-slate-800 text-[10px] font-mono whitespace-nowrap">
          <button
            onClick={() => setArenaMode('repairs')}
            className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
              arenaMode === 'repairs'
                ? 'bg-purple-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Award className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">Repairs</span>
            {candidates.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                arenaMode === 'repairs' ? 'bg-purple-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-purple-700 dark:text-purple-300'
              }`}>
                {candidates.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setArenaMode('showdown')}
            className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
              arenaMode === 'showdown'
                ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Zap className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">Showdown</span>
          </button>

          <button
            onClick={() => setArenaMode('doctor')}
            className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
              arenaMode === 'doctor'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Activity className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">Doctor</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0 whitespace-nowrap">
          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold whitespace-nowrap">
            {incidents.length} error{incidents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* VIEW MODE 1: REPAIRS ARENA */}
      {arenaMode === 'repairs' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Global "Fix All Errors" Batch Action Header Button */}
          {winningRepairsCount > 0 && (
            <div className="p-2 pb-0 shrink-0">
              <button
                onClick={handleApplyAll}
                className="w-full py-1.5 px-3 rounded-md text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm whitespace-nowrap"
                title="Apply all winning repair solutions across the entire codebase simultaneously"
              >
                {justAppliedAll ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    <span>Applied All Winning Solutions!</span>
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
            </div>
          )}

          {/* Error Incident Filter Tabs */}
          {incidents.length > 1 && (
            <div className="px-2 pt-2 flex items-center gap-1 overflow-x-auto scrollbar-none select-none shrink-0 whitespace-nowrap">
              <button
                onClick={() => setSelectedIncidentFilter('all')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium shrink-0 whitespace-nowrap transition cursor-pointer ${
                  selectedIncidentFilter === 'all'
                    ? 'bg-purple-600 text-white font-semibold shadow-sm'
                    : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
                }`}
              >
                All ({incidents.length})
              </button>
              {incidents.map((inc) => (
                <button
                  key={inc.id}
                  onClick={() => setSelectedIncidentFilter(inc.id)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium shrink-0 whitespace-nowrap transition flex items-center gap-1 cursor-pointer ${
                    selectedIncidentFilter === inc.id
                      ? 'bg-purple-600 text-white font-semibold shadow-sm'
                      : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span>#{inc.index}</span>
                  <span className="text-slate-500 dark:text-slate-400">Ln {inc.line}</span>
                  {inc.winningCandidate && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Candidate Cards List by Incident */}
          <div className="flex-1 p-2 space-y-3 overflow-y-auto text-xs font-mono">
            {candidates.length === 0 && incidents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
                <Award className="w-8 h-8 text-slate-400 dark:text-slate-700 mb-2 stroke-1" />
                <p className="text-xs font-mono text-slate-700 dark:text-slate-300">No active repair candidates.</p>
                <p className="text-[10px] text-slate-500 font-sans mt-1">
                  Candidates generate dynamically during syntax recovery search.
                </p>
              </div>
            ) : (
              displayedIncidents.map((inc) => (
                <div key={inc.id} className="space-y-2">
                  {/* Incident Header */}
                  <div className="flex items-center justify-between text-[10px] font-mono bg-slate-100 dark:bg-slate-900 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-slate-200">
                        Error #{inc.index} (Ln {inc.line}, Col {inc.column})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {inc.isResolved ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold uppercase">
                          Resolved
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 font-bold uppercase">
                          Unresolved
                        </span>
                      )}
                      <span className="text-slate-500 dark:text-slate-400 text-[9px]">{inc.candidates.length} cands</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-600 dark:text-slate-400 font-sans px-1 truncate" title={inc.description}>
                    {inc.description}
                  </div>

                  {/* Candidates inside this incident */}
                  <div className="space-y-2">
                    {inc.candidates.map((cand, idx) => {
                      const isWinner =
                        cand.id === inc.winningCandidate?.id ||
                        cand.id === winningCandidateId ||
                        cand.status === 'selected';
                      const isSelectedForPreview = cand.id === selectedCandidateId;
                      const editSummary = formatCandidateAction(cand);
                      const blast = calculateCandidateBlastRadius(sourceCode, cand, inc.candidates, inc.winningCandidate);

                      let borderStyle = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300';
                      if (isWinner) {
                        borderStyle =
                          'border-emerald-500/80 dark:border-emerald-600/80 bg-emerald-50/70 dark:bg-emerald-950/20 text-slate-900 dark:text-slate-100 shadow-sm shadow-emerald-500/10';
                      } else if (cand.status === 'pruned') {
                        borderStyle = 'border-amber-300 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/15 text-slate-600 dark:text-slate-400';
                      } else if (cand.status === 'rejected') {
                        borderStyle = 'border-rose-300 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/15 text-slate-600 dark:text-slate-400';
                      }

                      if (isSelectedForPreview) {
                        borderStyle += ' ring-2 ring-purple-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950';
                      }

                      return (
                        <div
                          key={cand.id || idx}
                          onMouseEnter={() => setHoveredCandidateId(cand.id)}
                          onMouseLeave={() => setHoveredCandidateId(null)}
                          className={`p-2 rounded-lg border transition-all cursor-pointer ${borderStyle}`}
                        >
                          {/* Title & Status Badge */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold">
                              <span className="text-slate-500 text-[10px]">#{idx + 1}</span>
                              <span className="text-slate-900 dark:text-slate-100 font-mono truncate max-w-[160px]" title={editSummary}>
                                {editSummary}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Blast Radius Zone Badge */}
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                                  blast.severity === 'zero'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                    : blast.severity === 'medium'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 animate-pulse'
                                }`}
                              >
                                Br: {blast.blastRadius} tok
                              </span>

                              {isWinner && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> WINNER
                                </span>
                              )}
                              {cand.status === 'rejected' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 flex items-center gap-1">
                                  <XCircle className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" /> REJECTED
                                </span>
                              )}
                              {cand.status === 'pruned' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" /> PRUNED
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Multi-Factor Cost Breakdown */}
                          <div className="grid grid-cols-4 gap-1 p-1 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-center mb-1.5">
                            <div>
                              <span className="text-slate-500 block text-[9px]">Lex</span>
                              <span className="text-slate-800 dark:text-slate-300">{cand.cost.lexical}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px]">Struct</span>
                              <span className="text-slate-800 dark:text-slate-300">{cand.cost.structural}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px]">Risk</span>
                              <span className="text-slate-800 dark:text-slate-300">{cand.cost.semanticRisk}</span>
                            </div>
                            <div className="font-bold">
                              <span className="text-slate-500 block text-[9px]">Cost</span>
                              <span className="text-sky-700 dark:text-sky-400">{cand.cost.total.toFixed(1)}</span>
                            </div>
                          </div>

                          {/* Speculative Lookahead Progress */}
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                            <span>Lookahead ({cand.validation.outcome}):</span>
                            <span className="text-slate-800 dark:text-slate-300 font-bold">
                              {cand.validation.sourceTokensProgressed}/{cand.validation.window} tok
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden mb-1.5 border border-slate-200 dark:border-slate-800">
                            <div
                              className={`h-full transition-all ${
                                cand.validation.outcome === 'pass'
                                  ? 'bg-gradient-to-r from-emerald-500 to-sky-400'
                                  : 'bg-rose-500'
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  (cand.validation.sourceTokensProgressed /
                                    Math.max(1, cand.validation.window)) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>

                          {/* Actions: Preview Counterfactual & Apply to Code */}
                          <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                            <button
                              onClick={() =>
                                selectCounterfactual(isSelectedForPreview ? null : cand.id)
                              }
                              className={`py-1.5 px-2 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 ${
                                isSelectedForPreview
                                  ? 'bg-purple-600 text-white font-semibold shadow-sm'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              <Eye className="w-3 h-3 shrink-0" />
                              <span className="whitespace-nowrap">{isSelectedForPreview ? 'Active Preview' : 'Preview AST'}</span>
                            </button>

                            <button
                              onClick={() => handleApplyCandidate(cand)}
                              className="py-1.5 px-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                              title="Apply this repair solution to editor code"
                            >
                              {justAppliedId === cand.id ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-white" />
                                  <span>Applied!</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3 h-3 text-white fill-current" />
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
        </div>
      )}

      {/* VIEW MODE 2: LIVE MULTI-ENGINE SHOWDOWN */}
      {arenaMode === 'showdown' && (
        <div className="flex-1 p-2.5 space-y-3 overflow-y-auto font-mono text-xs">
          <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-xs">
              <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Multi-Engine Comparative Showdown</span>
            </h3>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-sans mt-0.5">
              Simultaneous execution of identical source across 3 recovery paradigms.
            </p>
          </div>

          {/* Comparative Cards: 3 Parallel Engines */}
          <div className="space-y-2.5">
            {/* 1. ERDF Engine */}
            <div
              className={`p-2.5 rounded-lg border transition-all ${
                activeEngine === 'erdf'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/50 ring-1 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>ERDF Self-Healing</span>
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 uppercase">
                  Winning Strategy
                </span>
              </div>
              <p className="text-[10px] text-slate-700 dark:text-slate-300 font-sans leading-normal mb-2">
                Speculatively explores bounded repair candidates, scores multi-factor cost, and synthesizes ghost delimiters without discarding source tokens.
              </p>
              <div className="grid grid-cols-3 gap-1 p-1 rounded bg-slate-50 dark:bg-black/40 text-center text-[10px] mb-2 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Blast Radius (Br)</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">0 tokens</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Cascading (Mc)</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">0 errors</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">AST Integrity</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">100%</span>
                </div>
              </div>
              <button
                onClick={() => setActiveEngine('erdf')}
                className={`w-full py-1.5 rounded text-[10px] font-semibold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                  activeEngine === 'erdf'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                }`}
              >
                {activeEngine === 'erdf' ? 'Active Engine' : 'Activate ERDF Preview'}
              </button>
            </div>

            {/* 2. Clang/GCC Panic Mode */}
            <div
              className={`p-2.5 rounded-lg border transition-all ${
                activeEngine === 'clang'
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500 shadow-md shadow-rose-500/10 dark:shadow-rose-950/50 ring-1 ring-rose-500/30 animate-pulse'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5 text-xs">
                  <Flame className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Clang/GCC Traditional Panic</span>
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 uppercase">
                  Avalanche Failure
                </span>
              </div>
              <p className="text-[10px] text-slate-700 dark:text-slate-300 font-sans leading-normal mb-2">
                Discards unparseable tokens until statement/block synchronizer, dropping downstream declarations and generating phantom secondary diagnostics.
              </p>
              <div className="grid grid-cols-3 gap-1 p-1 rounded bg-slate-50 dark:bg-black/40 text-center text-[10px] mb-2 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Blast Radius (Br)</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400">
                    {comparativeShowdown?.clang.blastRadius ?? 14} tokens
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Cascading (Mc)</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400">
                    +{comparativeShowdown?.clang.cascadingMultiplier ?? 3} errors
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">AST Integrity</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400">
                    {comparativeShowdown?.clang.astPreservationIndex ?? 35}%
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveEngine('clang')}
                className={`w-full py-1.5 rounded text-[10px] font-semibold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                  activeEngine === 'clang'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                }`}
              >
                {activeEngine === 'clang' ? 'Active Engine' : 'Preview Clang Panic Collapse'}
              </button>
            </div>

            {/* 3. Tree-sitter Incremental Splicing */}
            <div
              className={`p-2.5 rounded-lg border transition-all ${
                activeEngine === 'treesitter'
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500 shadow-md shadow-amber-500/10 dark:shadow-amber-950/50 ring-1 ring-amber-500/30'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                  <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Tree-sitter Incremental Splicing</span>
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 uppercase">
                  Blunt ERROR Node
                </span>
              </div>
              <p className="text-[10px] text-slate-700 dark:text-slate-300 font-sans leading-normal mb-2">
                Wraps the broken fragment in an opaque ERROR node without delimiter inference. Preserves surrounding statements, but completely obscures local AST semantics.
              </p>
              <div className="grid grid-cols-3 gap-1 p-1 rounded bg-slate-50 dark:bg-black/40 text-center text-[10px] mb-2 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Blast Radius (Br)</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {comparativeShowdown?.treesitter.blastRadius ?? 4} tokens
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Cascading (Mc)</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    +{comparativeShowdown?.treesitter.cascadingMultiplier ?? 1} error
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">AST Integrity</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {comparativeShowdown?.treesitter.astPreservationIndex ?? 75}%
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveEngine('treesitter')}
                className={`w-full py-1.5 rounded text-[10px] font-semibold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                  activeEngine === 'treesitter'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                }`}
              >
                {activeEngine === 'treesitter' ? 'Active Engine' : 'Preview Tree-sitter Splicing'}
              </button>
            </div>
          </div>

          {/* The "Aha!" Teaching Callout */}
          <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 text-[11px]">
            <span className="font-bold text-indigo-900 dark:text-indigo-300 block mb-1">
              The "Aha!" Moment: Why ERDF Wins
            </span>
            <p className="text-slate-700 dark:text-slate-300 font-sans leading-relaxed text-[10px]">
              {comparativeShowdown?.ahaMomentExplanation ||
                'Traditional compilers panic when encountering missing delimiters, discarding valid statements and confusing developers with 30 false errors for 1 missing bracket. ERDF solves this by treating recovery as an optimal path search with virtual lookahead validation.'}
            </p>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: COMPILER DOCTOR CAUSAL RATIONALE */}
      {arenaMode === 'doctor' && (
        <div className="flex-1 p-2.5 space-y-3 overflow-y-auto font-mono text-xs">
          {/* Clinical Header */}
          <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                {doctorRationale.title}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-sans leading-normal">
              {doctorRationale.clinicalDiagnosis}
            </p>
          </div>

          {/* Clinical Hypothesis */}
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]">
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1">
              Causal Hypothesis
            </span>
            <p className="text-slate-700 dark:text-slate-200 font-sans italic">
              "{doctorRationale.hypothesis}"
            </p>
          </div>

          {/* Causal Chain Steps */}
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Downstream Avalanche Ripple-Effect:
            </span>
            <div className="space-y-1.5">
              {doctorRationale.causalChain.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px]"
                >
                  <ArrowRight className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span className="text-slate-700 dark:text-slate-200 font-sans leading-tight">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Downstream Consequence */}
          <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-[11px]">
            <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider block mb-1">
              Downstream Consequence
            </span>
            <p className="text-rose-900 dark:text-rose-200 font-sans leading-normal">
              {doctorRationale.downstreamConsequence}
            </p>
          </div>

          {/* Prescription / ERDF Decision */}
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/80 text-[11px]">
            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Doctor's Prescription</span>
            </span>
            <p className="text-emerald-950 dark:text-emerald-100 font-sans font-semibold leading-normal">
              {doctorRationale.erdfDecision}
            </p>
          </div>

          {/* Quantitative Contrast Scorecard */}
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              Quantitative Avalanche Contrast:
            </span>
            <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
              <div className="p-1.5 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                <span className="text-rose-800 dark:text-rose-400 block text-[9px] font-bold">Alternative Path</span>
                <span className="text-slate-700 dark:text-slate-300 block">Br: {doctorRationale.scorecard.candidateBlastRadius} tok</span>
                <span className="text-slate-700 dark:text-slate-300 block">Mc: +{doctorRationale.scorecard.candidateCascadingMultiplier} cascades</span>
                <span className="text-rose-800 dark:text-rose-300 font-bold block">Past: {doctorRationale.scorecard.candidateAstPreservation}%</span>
              </div>
              <div className="p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                <span className="text-emerald-800 dark:text-emerald-400 block text-[9px] font-bold">ERDF Solution</span>
                <span className="text-slate-700 dark:text-slate-300 block">Br: 0 tok</span>
                <span className="text-slate-700 dark:text-slate-300 block">Mc: 0 cascades</span>
                <span className="text-emerald-800 dark:text-emerald-300 font-bold block">Past: 100%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
