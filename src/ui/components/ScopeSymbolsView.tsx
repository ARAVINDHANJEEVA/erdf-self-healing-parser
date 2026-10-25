import React, { useState } from 'react';
import { useReplayStore } from '../../state/replayStore';
import {
  SemanticRepairCandidate,
  getSemanticRecommendation,
} from '../../semantics/typeChecker';
import {
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Info,
  Lightbulb,
} from 'lucide-react';
import { SymbolTableView } from './SymbolTableView';

export interface ScopeSymbolsViewProps {
  onJumpToLine?: (line: number) => void;
  withoutTable?: boolean;
}

export const ScopeSymbolsView: React.FC<ScopeSymbolsViewProps> = ({
  onJumpToLine,
  withoutTable = false,
}) => {
  const {
    semanticResult,
    applySemanticFix,
  } = useReplayStore();

  const [appliedFixId, setAppliedFixId] = useState<string | null>(null);

  const suggestions = semanticResult?.suggestions || [];
  const semanticDiagnostics = semanticResult?.diagnostics || [];

  const handleApplyFix = (cand: SemanticRepairCandidate) => {
    setAppliedFixId(cand.id);
    applySemanticFix(cand);
    setTimeout(() => setAppliedFixId(null), 1400);
  };

  // When rendered in the BottomDock (!withoutTable), display ONLY the symbol table itself
  if (!withoutTable) {
    return (
      <div className="font-mono text-xs text-slate-800 dark:text-slate-200">
        {!withoutTable && <SymbolTableView onJumpToLine={onJumpToLine} />}
      </div>
    );
  }

  return (
    <div className="space-y-3 font-mono text-xs text-slate-800 dark:text-slate-200">
      {/* 1. Typo Suggestions & Quick-Fix Actions Card */}
      {suggestions.length > 0 ? (
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-bold text-xs">
              <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>Semantic Typo Recovery ({suggestions.length})</span>
            </div>
            <span className="text-[10px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono">
              Levenshtein Distance Metric
            </span>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
            The symbol table detected undeclared variable names. In-scope fuzzy matching identified high-probability corrections:
          </p>

          <div className="space-y-2 pt-1">
            {suggestions.map((cand) => {
              const isApplied = appliedFixId === cand.id;
              return (
                <div
                  key={cand.id}
                  className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
                >
                  <div className="space-y-1 font-mono min-w-0">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="line-through text-rose-600 dark:text-rose-300 font-semibold bg-rose-50 dark:bg-rose-500/20 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-500/30 whitespace-nowrap">
                        {cand.originalName}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
                      <span className="text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30 whitespace-nowrap">
                        {cand.suggestedName}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] whitespace-nowrap">
                        (type: <strong className="text-sky-700 dark:text-sky-300">{cand.symbol.typeSpecifier}</strong>)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 whitespace-nowrap">
                      <span className="text-sky-600 dark:text-sky-400 font-semibold">
                        Dist: {cand.distance}
                      </span>
                      <span>•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {cand.matchPercentage}% match
                      </span>
                      <span>•</span>
                      <span>
                        Ln {cand.replacementSpan.line}, Col {cand.replacementSpan.column}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleApplyFix(cand)}
                    disabled={isApplied}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center justify-center gap-1.5 shrink-0 shadow-sm cursor-pointer whitespace-nowrap ${
                      isApplied
                        ? 'bg-emerald-700 text-white font-semibold'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {isApplied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Applied!</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Apply Symbol Fix</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-sans text-[11px] text-slate-600 dark:text-slate-300">
            All identifiers resolved against active scopes. No symbol typos detected.
          </span>
        </div>
      )}

      {/* 2. Actionable Semantic Scope Diagnostics & Advice */}
      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Scope Diagnostic Advice & Recommendations</span>
          </span>
          {semanticDiagnostics.length > 0 ? (
            <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/30 font-semibold whitespace-nowrap">
              {semanticDiagnostics.length} issue{semanticDiagnostics.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30 font-semibold flex items-center gap-1 whitespace-nowrap">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              Clean
            </span>
          )}
        </div>

        {semanticDiagnostics.length === 0 ? (
          <div className="p-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">Scope Diagnostics Clean</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-sans leading-relaxed">
                All referenced variables, parameters, and function calls are properly declared within accessible scope boundaries. Type signatures and return contracts match expected semantics.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {semanticDiagnostics.map((diag, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300 min-w-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold whitespace-nowrap shrink-0">
                      {diag.semanticKind}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 truncate">{diag.message}</span>
                  </div>
                  {diag.span.line > 0 && (
                    <button
                      onClick={() => onJumpToLine && onJumpToLine(diag.span.line)}
                      className="text-[10px] text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300 font-mono transition whitespace-nowrap shrink-0 ml-1 cursor-pointer"
                      title="Jump to line"
                    >
                      Ln {diag.span.line}:{diag.span.column}
                    </button>
                  )}
                </div>

                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-1.5 text-[11px]">
                  <Info className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span className="text-slate-700 dark:text-slate-300 font-sans">
                    <strong className="text-sky-700 dark:text-sky-300 font-semibold">Recommendation: </strong>
                    {getSemanticRecommendation(diag)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
