import React from 'react';
import { useReplayStore } from '../../state/replayStore';
import { Search, Hash, ShieldCheck, Sparkles, ArrowRight, Zap, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getSemanticRecommendation } from '../../semantics/typeChecker';

export const InspectorPanel: React.FC = () => {
  const {
    currentState,
    currentSequence,
    parseResult,
    config,
    semanticResult,
    applySemanticFix,
  } = useReplayStore();
  const { activeRule, cursor, tokens, phase, currentCheckpointRef, stateHash } =
    currentState;

  const typoSuggestions = semanticResult?.suggestions || [];
  const semanticTypoCount = typoSuggestions.length;
  const semanticDiagnostics = semanticResult?.diagnostics || [];

  const currentToken = tokens[cursor] || tokens[tokens.length - 1];
  const currentEvent = parseResult?.events[currentSequence - 1];

  const phaseColorMap: Record<string, string> = {
    lex: 'bg-sky-950 text-sky-400 border-sky-800',
    parse: 'bg-indigo-950 text-indigo-400 border-indigo-800',
    recovery: 'bg-amber-950 text-amber-300 border-amber-800',
    commit: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          <h2 className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-mono">
            Decision Inspector
          </h2>
        </div>
        <span
          className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider border shadow-sm ${
            phaseColorMap[phase] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          }`}
        >
          Phase: {phase}
        </span>
      </div>

      <div className="p-2.5 space-y-2 overflow-y-auto flex-1 text-xs text-slate-700 dark:text-slate-300 font-mono">
        {/* Active Grammar Rule & Call Context */}
        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-1 text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
            <span>Production Rule</span>
            <span className="text-slate-500 dark:text-slate-400 font-mono text-[9px]">{currentCheckpointRef || 'cp-0'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 font-bold text-xs font-mono">
              {activeRule || 'program'}
            </span>
            <span className="text-slate-400 dark:text-slate-500 text-[10px]">→ dispatch</span>
          </div>
        </div>

        {/* Current Parser Focus Token */}
        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase block mb-1">
            Focus Token at Cursor #{cursor}
          </span>
          {currentToken ? (
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-900 dark:text-slate-100 font-bold font-mono text-xs">
                '{currentToken.lexeme || currentToken.kind}'
              </span>
              <div className="text-right text-[10px] text-slate-500 dark:text-slate-400">
                <span className="text-sky-600 dark:text-sky-400 font-semibold">{currentToken.kind}</span>
                <span className="text-slate-400 dark:text-slate-600 ml-1">({currentToken.origin})</span>
              </div>
            </div>
          ) : (
            <span className="text-slate-400 dark:text-slate-600 italic">EOF</span>
          )}
        </div>

        {/* Current ERDF Event Badge */}
        {currentEvent && (
          <div className="bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
              <span>Event Record</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">#{currentEvent.sequence}</span>
            </div>
            <div className="text-emerald-700 dark:text-emerald-300 font-bold text-xs font-mono mt-0.5">
              {currentEvent.type}
            </div>
          </div>
        )}

        {/* Multi-Factor Cost Model Card */}
        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase mb-1">
            <span>Cost Objective Formula</span>
            <span className="text-purple-600 dark:text-purple-400 font-mono text-[9px]">4-factor</span>
          </div>
          <div className="text-[11px] text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-800 mb-1.5">
            Cost = λl·Cl + λs·Cs + λm·Cm + λd·Cd
          </div>
          <div className="grid grid-cols-3 gap-1 text-[10px] text-center font-mono">
            <div className="bg-slate-50 dark:bg-slate-950 p-1 rounded border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[9px]">λs (struct)</span>
              <span className="text-sky-600 dark:text-sky-300 font-bold">{config.weights.structural}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-1 rounded border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[9px]">λm (sem)</span>
              <span className="text-purple-600 dark:text-purple-300 font-bold">{config.weights.semanticRisk}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-1 rounded border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[9px]">λd (diag)</span>
              <span className="text-amber-600 dark:text-amber-300 font-bold">{config.weights.diagnostic}</span>
            </div>
          </div>
        </div>

        {/* Symbol Typo Fixes & Recommendations Card */}
        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
            <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Symbol & Typo Recommendations</span>
            </span>
            {semanticTypoCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 text-[9px] font-bold">
                {semanticTypoCount} Typo Fix{semanticTypoCount !== 1 ? 'es' : ''}
              </span>
            ) : semanticDiagnostics.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[9px] font-bold">
                {semanticDiagnostics.length} Issue{semanticDiagnostics.length !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[9px] font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                Clean
              </span>
            )}
          </div>

          {/* Actionable Typo Quick-Fixes */}
          {semanticTypoCount > 0 && (
            <div className="space-y-1.5 pt-0.5">
              {typoSuggestions.map((cand) => (
                <div
                  key={cand.id}
                  className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] truncate">
                      <span className="line-through text-rose-600 dark:text-rose-300 font-semibold">{cand.originalName}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-sky-500 dark:text-sky-400 shrink-0" />
                      <span className="text-emerald-700 dark:text-emerald-300 font-bold">{cand.suggestedName}</span>
                    </div>
                    <span className="text-[9px] text-sky-600 dark:text-sky-400/90 block">
                      Did you mean '{cand.suggestedName}'? ({cand.matchPercentage}% match)
                    </span>
                  </div>
                  <button
                    onClick={() => applySemanticFix(cand)}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[10px] shrink-0 transition flex items-center gap-1 cursor-pointer shadow-sm whitespace-nowrap"
                    title={`Fix typo: replace with ${cand.suggestedName}`}
                  >
                    <Zap className="w-2.5 h-2.5 fill-current" />
                    <span>Fix</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Actionable Scope Diagnostic Advice & Recommendations */}
          {semanticDiagnostics.length > 0 && (
            <div className="space-y-1.5 pt-0.5">
              {semanticDiagnostics.map((diag, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-0.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300 text-[10px]">
                      <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="uppercase text-[8px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold">
                        {diag.semanticKind}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 truncate">{diag.message}</span>
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-600 dark:text-slate-300 font-sans pl-4">
                    <strong className="text-sky-700 dark:text-sky-300 font-semibold">Advice: </strong>
                    {getSemanticRecommendation(diag)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Clean State */}
          {semanticTypoCount === 0 && semanticDiagnostics.length === 0 && (
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>All symbols resolved against active scope hierarchy.</span>
            </div>
          )}
        </div>

        {/* State Signature Hash */}
        <div className="bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] uppercase font-semibold text-slate-500">Hash:</span>
          </div>
          <div className="font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1 text-[10px] bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
            <Hash className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            <span>{stateHash}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
