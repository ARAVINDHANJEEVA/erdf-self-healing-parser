import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useReplayStore } from '../../state/replayStore';
import { formatTraceSummary } from '../utils/traceFormatter';
import {
  Clock,
  Layers,
  ListOrdered,
  ChevronUp,
  ChevronDown,
  Database,
} from 'lucide-react';
import { ErdfPhase } from '../../erdf/schema';
import { ScopeSymbolsView } from './ScopeSymbolsView';

export type BottomDockTab = 'tokens' | 'trace' | 'symbols';

export interface BottomDockProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  activeTab: BottomDockTab;
  onTabChange: (tab: BottomDockTab) => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  isOpen,
  onToggleOpen,
  activeTab,
  onTabChange,
}) => {
  const {
    parseResult,
    currentSequence,
    seekToSequence,
    currentState,
  } = useReplayStore();

  const [trayHeight, setTrayHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sh_bottom_dock_height');
      return saved ? Math.max(90, Math.min(650, parseInt(saved, 10))) : 200;
    } catch {
      return 200;
    }
  });
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!isOpen) onToggleOpen();
      setIsResizing(true);
    },
    [isOpen, onToggleOpen]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Calculate height from bottom of viewport to mouse position minus top header/scrubber height
      const newHeight = window.innerHeight - e.clientY - 44;
      const clamped = Math.max(90, Math.min(window.innerHeight * 0.75, newHeight));
      setTrayHeight(clamped);
      try {
        localStorage.setItem('sh_bottom_dock_height', clamped.toString());
      } catch {
        // ignore
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const events = parseResult?.events || [];
  const totalEvents = events.length;
  const currentEvent = events[currentSequence - 1];
  const { tokens, cursor, phase } = currentState;
  const syntheticCount = tokens.filter((t) => t.origin === 'synthetic').length;

  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Automatically scroll active row into view during playback and scrubbing without lag
  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  }, [currentSequence]);

  const getPhaseColor = (p: ErdfPhase) => {
    switch (p) {
      case 'lex':
        return '#0284c7'; // sky-600
      case 'parse':
        return '#6366f1'; // indigo-500
      case 'recovery':
        return '#a855f7'; // purple-500
      case 'commit':
        return '#10b981'; // emerald-500
      default:
        return '#64748b'; // slate-500
    }
  };

  const seekFromPointer = useCallback(
    (clientX: number) => {
      if (!scrubberRef.current || totalEvents === 0) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const targetSequence = Math.round(percentage * totalEvents);
      seekToSequence(targetSequence);
    },
    [totalEvents, seekToSequence]
  );

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || totalEvents === 0) return;
    setIsScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    seekFromPointer(e.clientX);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    seekFromPointer(e.clientX);
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-[#050814] border-t border-slate-200 dark:border-slate-800/80 flex flex-col select-none shrink-0 z-20 shadow-lg">
      {/* Draggable Height Resizer Bar */}
      <div
        onMouseDown={startResizing}
        onDoubleClick={() => {
          if (!isOpen) onToggleOpen();
          setTrayHeight((prev) => (prev > 240 ? 160 : 320));
        }}
        className={`w-full h-1.5 hover:h-2 bg-slate-200 dark:bg-slate-900 hover:bg-sky-500/80 active:bg-sky-400 cursor-row-resize transition-all shrink-0 z-30 group relative flex items-center justify-center select-none ${
          isResizing ? 'bg-sky-500 h-2' : ''
        }`}
      >
        <div className="h-[2px] w-14 bg-slate-400 dark:bg-slate-700 group-hover:bg-sky-600 dark:group-hover:bg-white rounded-full transition-colors" />
      </div>

      {/* Sleek Scrubber Bar (Always Visible) */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 text-xs bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 whitespace-nowrap overflow-x-auto scrollbar-none">
        {/* Scrubber Progress Info */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className="font-semibold text-slate-700 dark:text-slate-200">Timeline:</span>
            <span className="text-sky-600 dark:text-sky-400 font-bold">{currentSequence}</span>
            <span className="text-slate-400 dark:text-slate-500">/</span>
            <span className="text-slate-600 dark:text-slate-400">{totalEvents}</span>
          </div>

          <span
            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border shadow-sm"
            style={{
              backgroundColor: `${getPhaseColor(phase)}20`,
              color: getPhaseColor(phase),
              borderColor: `${getPhaseColor(phase)}40`,
            }}
          >
            {phase}
          </span>
        </div>

        {/* Central Interactive Scrubber Track (Click & Drag Scrubbing) */}
        <div
          ref={scrubberRef}
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          onPointerCancel={handleScrubberPointerUp}
          className={`flex-1 h-3.5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden cursor-pointer relative border border-slate-200 dark:border-slate-800 group transition-all min-w-[120px] ${
            isScrubbing ? 'ring-1 ring-sky-500/60 dark:ring-sky-400/60' : ''
          }`}
          title="Click or drag to scrub replay execution timeline"
        >
          {/* Phase colored background track */}
          <div className="w-full h-full flex pointer-events-none">
            {events.map((ev, i) => (
              <div
                key={i}
                style={{
                  width: `${(1 / totalEvents) * 100}%`,
                  backgroundColor: getPhaseColor(ev.phase),
                  opacity: i < currentSequence ? 0.9 : 0.25,
                }}
                className="h-full transition-opacity"
              />
            ))}
          </div>

          {/* Current scrubber needle pointer */}
          <div
            className={`absolute top-0 bottom-0 w-2 bg-slate-800 dark:bg-white shadow-md shadow-slate-900/40 dark:shadow-white/60 -ml-1 pointer-events-none rounded-full transition-transform ${
              isScrubbing ? 'scale-125 bg-sky-600 dark:bg-sky-300 shadow-sky-500 dark:shadow-sky-400' : ''
            }`}
            style={{
              left: `${totalEvents > 0 ? (currentSequence / totalEvents) * 100 : 0}%`,
            }}
          />
        </div>

        {/* Current Event Summary Tag & Tray Expand Button */}
        <div className="flex items-center gap-2 shrink-0">
          {currentEvent && (
            <div className="hidden lg:flex items-center gap-1.5 font-mono text-[10px] text-slate-600 dark:text-slate-400 max-w-md truncate bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800" title={formatTraceSummary(currentEvent)}>
              <span className="text-slate-400 dark:text-slate-500">#{currentEvent.sequence}</span>
              <span className="text-sky-700 dark:text-sky-300 font-sans truncate font-medium">{formatTraceSummary(currentEvent)}</span>
            </div>
          )}

          {/* Bottom Drawer Tabs & Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0">
            <button
              onClick={() => {
                onTabChange('tokens');
                if (!isOpen) onToggleOpen();
              }}
              title="Toggle Virtual Token Stream"
              className={`px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                isOpen && activeTab === 'tokens'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
              <span>Tokens</span>
              <span className={`text-[9px] px-1 rounded-full ${isOpen && activeTab === 'tokens' ? 'bg-black/30 text-emerald-100' : 'bg-slate-200 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}`}>
                {tokens.length}
              </span>
            </button>

            <button
              onClick={() => {
                onTabChange('trace');
                if (!isOpen) onToggleOpen();
              }}
              title="Toggle ERDF Execution Trace Log"
              className={`px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                isOpen && activeTab === 'trace'
                  ? 'bg-sky-600 text-white font-semibold shadow-sm'
                  : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300" />
              <span>Trace</span>
            </button>

            <button
              onClick={() => {
                onTabChange('symbols');
                if (!isOpen) onToggleOpen();
              }}
              title="Toggle Semantic Symbol Table & Scopes"
              className={`px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                isOpen && activeTab === 'symbols'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
              <span>Symbols</span>
            </button>

            <button
              onClick={onToggleOpen}
              title={isOpen ? 'Collapse Drawer' : 'Expand Drawer'}
              className="p-1 rounded text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Full-Width Tray */}
      {isOpen && (
        <div
          style={{ height: `${trayHeight}px` }}
          className="bg-white dark:bg-[#070b16] border-t border-slate-200 dark:border-slate-800/90 flex flex-col overflow-hidden transition-[height] duration-75"
        >
          {/* TAB 1: VIRTUAL TOKEN STREAM (FULL HORIZONTAL WIDTH) */}
          {activeTab === 'tokens' && (
            <div className="flex-1 flex flex-col p-2 overflow-hidden">
              {/* Legend & Cursor Status */}
              <div className="flex items-center justify-between pb-1 px-1 text-[10px] font-mono text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-sky-100 dark:bg-sky-500/80 inline-block border border-sky-500 dark:border-sky-400" />
                    <span>Source Token</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-purple-100 dark:bg-purple-900/80 inline-block border border-purple-500 dark:border-purple-400 border-dashed" />
                    <span className="text-purple-700 dark:text-purple-300 font-medium">Ghost Synthetic ({syntheticCount})</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-rose-100 dark:bg-rose-950 inline-block border border-rose-500 dark:border-rose-600" />
                    <span className="text-rose-700 dark:text-rose-300">Syntax Error</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Cursor at Token: <span className="text-sky-600 dark:text-sky-300 font-bold">#{cursor}</span>
                  </span>
                  <span>•</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Total: <span className="text-slate-900 dark:text-slate-200 font-bold">{tokens.length}</span>
                  </span>
                </div>
              </div>

              {/* Full-Width Horizontal Token Ribbon */}
              <div className="flex-1 overflow-x-auto flex items-center gap-2 px-1 pt-1.5 scrollbar-thin">
                {tokens.map((token, index) => {
                  const isCurrent = index === cursor;
                  const isSynthetic = token.origin === 'synthetic';
                  const isPassed = index < cursor;

                  let badgeStyle =
                    'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm';

                  if (isSynthetic) {
                    badgeStyle =
                      'bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-500 border-dashed text-purple-900 dark:text-purple-200 shadow-sm';
                  } else if (token.kind === 'ERROR') {
                    badgeStyle = 'bg-rose-50 dark:bg-rose-950 border-rose-300 dark:border-rose-600 text-rose-900 dark:text-rose-200';
                  } else if (isPassed) {
                    badgeStyle = 'bg-slate-100/60 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-60';
                  }

                  if (isCurrent) {
                    badgeStyle +=
                      ' ring-2 ring-sky-500 dark:ring-sky-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-950 scale-105 shadow-md shadow-sky-500/20 font-semibold';
                  }

                  return (
                    <div
                      key={token.id || index}
                      className={`shrink-0 px-2.5 py-1 rounded-md border text-xs font-mono flex flex-col gap-0.5 transition-all select-text cursor-default ${badgeStyle}`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[9px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-sky-600 dark:text-sky-400/80">#{index}</span>
                        <span>{token.kind}</span>
                      </div>
                      <div className="font-bold text-[11px] font-mono tracking-wide truncate max-w-[120px] text-slate-900 dark:text-slate-100">
                        "{token.lexeme}"
                      </div>
                      {isSynthetic && (
                        <span className="text-[8px] uppercase tracking-wider text-purple-700 dark:text-purple-300 font-bold">
                          Synthetic Ghost
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CHRONOLOGICAL EXECUTION TRACE LOG */}
          {activeTab === 'trace' && (
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin font-mono text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-1 px-2 w-16">Seq</th>
                    <th className="py-1 px-2 w-28">Phase</th>
                    <th className="py-1 px-2 w-48">Event Type</th>
                    <th className="py-1 px-2">Summary / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                  {events.map((ev) => {
                    const isSelected = ev.sequence === currentSequence;
                    const summary = formatTraceSummary(ev);
                    return (
                      <tr
                        key={ev.sequence}
                        ref={isSelected ? activeRowRef : null}
                        onClick={() => seekToSequence(ev.sequence)}
                        className={`hover:bg-slate-100/70 dark:hover:bg-slate-800/60 cursor-pointer transition ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-sky-950/80 text-sky-900 dark:text-sky-100 font-semibold border-l-2 border-sky-500 dark:border-sky-400 shadow-inner'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <td className="py-1 px-2 text-slate-400 dark:text-slate-500">#{ev.sequence}</td>
                        <td className="py-1 px-2">
                          <span
                            className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border"
                            style={{
                              backgroundColor: `${getPhaseColor(ev.phase)}15`,
                              color: getPhaseColor(ev.phase),
                              borderColor: `${getPhaseColor(ev.phase)}30`,
                            }}
                          >
                            {ev.phase}
                          </span>
                        </td>
                        <td className="py-1 px-2 font-medium">{ev.type}</td>
                        <td className="py-1 px-2 text-slate-700 dark:text-slate-300 font-sans text-xs truncate max-w-2xl" title={summary}>
                          {summary}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: SCOPE & SYMBOLS VIEW */}
          {activeTab === 'symbols' && (
            <div className="flex-1 p-3 overflow-y-auto">
              <ScopeSymbolsView withoutTable={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
