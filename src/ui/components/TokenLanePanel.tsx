import React from 'react';
import { useReplayStore } from '../../state/replayStore';
import { Layers, Ghost, Trash2 } from 'lucide-react';

export const TokenLanePanel: React.FC = () => {
  const { currentState } = useReplayStore();
  const { tokens, cursor } = currentState;

  const syntheticCount = tokens.filter((t) => t.origin === 'synthetic').length;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      {/* Panel Header */}
      <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] font-mono">
            Virtual Token Stream
          </h2>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded bg-sky-500 inline-block border border-sky-400" />
            <span>Source</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded bg-purple-200 dark:bg-purple-900 inline-block border border-purple-500 dark:border-purple-400 border-dashed" />
            <span className="text-purple-700 dark:text-purple-300 font-medium">Ghost ({syntheticCount})</span>
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-850 border border-slate-300 dark:border-slate-750 text-slate-700 dark:text-slate-300 font-bold">
            Pos: {cursor} / {tokens.length}
          </span>
        </div>
      </div>

      {/* Token Stream Horizontal Ribbon */}
      <div className="flex-1 px-3 py-2 overflow-x-auto flex items-center gap-2 select-none font-mono text-xs scrollbar-thin">
        {tokens.map((token, index) => {
          const isCurrent = index === cursor;
          const isSynthetic = token.origin === 'synthetic';
          const isPassed = index < cursor;

          let badgeStyle =
            'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-750 text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-850';

          if (isSynthetic) {
            badgeStyle =
              'bg-purple-50 dark:bg-purple-950 border-purple-400 dark:border-purple-500 border-dashed text-purple-900 dark:text-purple-200 shadow-sm';
          } else if (token.kind === 'ERROR') {
            badgeStyle = 'bg-rose-50 dark:bg-rose-950 border-rose-400 dark:border-rose-600 text-rose-900 dark:text-rose-200';
          } else if (isPassed) {
            badgeStyle = 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-60';
          }

          if (isCurrent) {
            badgeStyle +=
              ' ring-2 ring-sky-500 dark:ring-sky-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-950 scale-105 shadow-md shadow-sky-500/30';
          }

          return (
            <div
              key={token.id || index}
              title={`#${index} [${token.kind}]\nOrigin: ${token.origin}\nSpan: Ln ${token.span.line}:${token.span.column}${
                token.syntheticReason ? `\nRepair: ${token.syntheticReason}` : ''
              }`}
              className={`shrink-0 px-2.5 py-1.5 rounded-md border flex flex-col items-center justify-center min-w-[58px] transition-all cursor-pointer relative group ${badgeStyle}`}
            >
              {/* Token sequence index */}
              <span className="text-[9px] text-slate-500 font-mono absolute -top-1.5 px-1 rounded bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800">
                #{index}
              </span>

              <div className="flex items-center gap-1 font-bold text-xs mt-1">
                {isSynthetic && <Ghost className="w-3 h-3 text-purple-600 dark:text-purple-400 animate-pulse" />}
                {token.kind === 'ERROR' && <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />}
                <span className="font-mono">
                  {token.kind === 'EOF' ? 'EOF' : token.lexeme || token.kind}
                </span>
              </div>

              <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 font-medium tracking-tight mt-0.5">
                {token.kind}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
