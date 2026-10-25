import React from 'react';
import { useReplayStore } from '../../state/replayStore';
import {
  Clock,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const TimelinePanel: React.FC = () => {
  const {
    parseResult,
    currentSequence,
    seekToSequence,
    stepForward,
    stepBackward,
    isPlaying,
    setIsPlaying,
  } = useReplayStore();

  const events = parseResult?.events || [];
  const totalEvents = events.length;
  const currentEvent = events[currentSequence - 1];

  return (
    <div className="bg-slate-50 dark:bg-[#050814] border-t border-slate-200 dark:border-slate-800/80 px-4 py-2 flex flex-col gap-1.5 text-xs select-none shadow-md z-20">
      {/* Upper Timeline Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] font-mono">
            Replay Timeline
          </span>
          <span className="font-mono text-slate-600 dark:text-slate-400 text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold">
            <span className="text-sky-600 dark:text-sky-400">{currentSequence}</span> / {totalEvents} events
          </span>
        </div>

        {/* Phase Legend */}
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-sky-500/80 inline-block" /> Parse
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-purple-500/80 inline-block" /> Recovery Search
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500/80 inline-block" /> Commit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Error
          </span>
        </div>
      </div>

      {/* Interactive Phase Track & Slider */}
      <div className="relative flex items-center h-4 my-0.5">
        {/* Background phase stripes */}
        <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-950 rounded-full flex overflow-hidden border border-slate-300 dark:border-slate-800/80 shadow-inner">
          {events.map((evt, index) => {
            let color = 'bg-slate-300 dark:bg-slate-800';
            if (evt.phase === 'parse') color = 'bg-sky-200 dark:bg-sky-900/50';
            if (evt.phase === 'recovery') color = 'bg-purple-200 dark:bg-purple-900/60';
            if (evt.phase === 'commit') color = 'bg-emerald-200 dark:bg-emerald-900/50';
            if (evt.type === 'SyntaxErrorDetected' || evt.type === 'PanicDiscard') {
              color = 'bg-rose-500 dark:bg-rose-600';
            }

            const isPast = index < currentSequence;
            if (isPast) {
              if (evt.phase === 'parse') color = 'bg-sky-500 dark:bg-sky-600';
              if (evt.phase === 'recovery') color = 'bg-purple-500 dark:bg-purple-600';
              if (evt.phase === 'commit') color = 'bg-emerald-500 dark:bg-emerald-500';
            }

            return (
              <div
                key={index}
                className={`h-full flex-1 ${color} cursor-pointer transition-colors`}
                onClick={() => seekToSequence(index + 1)}
                title={`#${evt.sequence}: ${evt.type} (${evt.phase})`}
              />
            );
          })}
        </div>

        {/* Draggable Scrubber Range Input Overlay */}
        <input
          type="range"
          min={0}
          max={totalEvents}
          value={currentSequence}
          onChange={(e) => seekToSequence(parseInt(e.target.value, 10))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>

      {/* Bottom Step Bar */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <button
            onClick={stepBackward}
            disabled={currentSequence <= 0}
            className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-30 flex items-center gap-1 border border-slate-300 dark:border-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition"
          >
            <ChevronLeft className="w-3 h-3" /> Prev
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-3 py-0.5 rounded font-medium flex items-center gap-1 text-white shadow-sm transition ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" /> Play
              </>
            )}
          </button>

          <button
            onClick={stepForward}
            disabled={currentSequence >= totalEvents}
            className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-30 flex items-center gap-1 border border-slate-300 dark:border-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {currentEvent ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500">Active Event:</span>
              <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-bold">
                {currentEvent.type}
              </span>
              <span className="text-slate-500 text-[10px]">({currentEvent.phase})</span>
            </div>
          ) : (
            <span className="text-slate-500 italic">Timeline at initial state</span>
          )}
        </div>
      </div>
    </div>
  );
};
