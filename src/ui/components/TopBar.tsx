import React from 'react';
import { useReplayStore } from '../../state/replayStore';
import { CURATED_DEMOS } from '../../demos/curatedDemos';
import { ComparativeEngineId } from '../../analysis/comparativeRunners';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  AlertTriangle,
  SlidersHorizontal,
  Terminal,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottomClose,
  PanelBottomOpen,
  Flame,
  Layers,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';

export type ViewMode = 'split' | 'ast-focus' | 'debugger';

export interface TopBarProps {
  onOpenConfigModal: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  isLeftOpen: boolean;
  onToggleLeft: () => void;
  isRightOpen: boolean;
  onToggleRight: () => void;
  isBottomOpen: boolean;
  onToggleBottom: () => void;
  inspectorPosition?: 'top' | 'right';
  onBackToLanding?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenConfigModal,
  isLeftOpen,
  onToggleLeft,
  isRightOpen,
  onToggleRight,
  isBottomOpen,
  onToggleBottom,
  inspectorPosition: _inspectorPosition = 'top',
  onBackToLanding,
}) => {
  const {
    sourceCode,
    parseResult,
    currentState,
    currentSequence,
    isPlaying,
    playbackSpeed,
    loadDemo,
    stepForward,
    stepBackward,
    setIsPlaying,
    setPlaybackSpeed,
    jumpToNextError,
    activeEngine,
    setActiveEngine,
    theme,
    toggleTheme,
  } = useReplayStore();

  const totalEvents = parseResult?.events.length || 0;
  const activeDiagnostics =
    parseResult?.diagnostics && parseResult.diagnostics.length > 0
      ? parseResult.diagnostics
      : currentState.diagnostics;
  const errorCount = activeDiagnostics.filter((d) => d.severity === 'error').length;
  const recoveredCount = parseResult?.committedRepairs?.length ?? currentState.committedRepairs.length;

  return (
    <header className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 text-slate-800 dark:text-slate-200 select-none shadow-sm z-30 shrink-0 whitespace-nowrap overflow-x-auto scrollbar-none">
      {/* Brand & Demo Selector */}
      <div className="flex items-center gap-3">
        {onBackToLanding ? (
          <button
            type="button"
            onClick={onBackToLanding}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0 hover:opacity-85 transition group text-left focus:outline-none select-none shrink-0"
            title="Return to Landing Page"
            aria-label="Return to Landing Page"
          >
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500 via-indigo-600 to-purple-600 p-0.5 shadow-sm shadow-sky-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-100 dark:bg-slate-950 rounded-[4px] flex items-center justify-center">
                <Terminal className="w-3 h-3 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-xs group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                  Self-Healing C Parser
                </span>
              </div>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-2 select-none shrink-0">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500 via-indigo-600 to-purple-600 p-0.5 shadow-sm shadow-sky-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-100 dark:bg-slate-950 rounded-[4px] flex items-center justify-center">
                <Terminal className="w-3 h-3 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-xs">
                  Self-Healing C Parser
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Demo Selector Pill */}
        <div className="flex items-center gap-1.5 pl-2 sm:border-l border-slate-200 dark:border-slate-800">
          <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400 hidden md:inline" />
          <select
            value={CURATED_DEMOS.find((d) => d.source === sourceCode)?.id || ''}
            onChange={(e) => {
              if (e.target.value) loadDemo(e.target.value);
            }}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded-md px-2 py-0.5 text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 transition cursor-pointer max-w-[130px] sm:max-w-[180px] md:max-w-[240px] lg:max-w-[280px] truncate"
          >
            <option value="" disabled className="bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 py-1">
              {sourceCode ? 'Custom Source' : 'Choose an example...'}
            </option>
            {CURATED_DEMOS.map((demo) => (
              <option key={demo.id} value={demo.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 py-1">
                {demo.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Unified Playback Controls Group */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <button
          onClick={stepBackward}
          disabled={currentSequence <= 0}
          title="Step Backward (Left Arrow)"
          className="p-1 rounded bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 disabled:opacity-30 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          title={
            isPlaying
              ? 'Pause Playback (Space)'
              : currentSequence >= totalEvents
              ? 'Replay From Start (Space)'
              : 'Resume Playback (Space)'
          }
          className={`px-2.5 py-0.5 rounded-md flex items-center gap-1.5 text-xs font-semibold shadow transition cursor-pointer ${
            isPlaying
              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
              : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/30'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause className="w-3 h-3 fill-current" /> Pause
            </>
          ) : currentSequence >= totalEvents ? (
            <>
              <Play className="w-3 h-3 fill-current" /> Replay
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
          title="Step Forward (Right Arrow)"
          className="p-1 rounded bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 disabled:opacity-30 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        {/* Speed Multiplier Pill */}
        <select
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
          className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-[11px] font-mono text-slate-700 dark:text-slate-300 rounded px-1.5 py-0.5 ml-0.5 focus:outline-none transition cursor-pointer"
          title="Playback animation speed"
        >
          <option value={0.25} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">0.25x</option>
          <option value={0.5} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">0.5x</option>
          <option value={1.0} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">1.0x</option>
          <option value={2.0} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">2.0x</option>
          <option value={4.0} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">4.0x</option>
        </select>

        {/* Next Error Jump Button */}
        <button
          onClick={jumpToNextError}
          title="Jump directly to next syntax recovery point"
          className={`ml-1 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
            errorCount > 0
              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
              : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
          }`}
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${errorCount > 0 ? 'text-white' : 'text-amber-500 dark:text-amber-400'}`} />
          <span className="hidden md:inline">Next Error</span>
          {errorCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-white font-mono text-[9px] font-bold flex items-center justify-center">
              {errorCount}
            </span>
          )}
          {recoveredCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-[9px] font-bold flex items-center justify-center border border-emerald-300 dark:border-emerald-700">
              {recoveredCount} fix
            </span>
          )}
        </button>
      </div>

      {/* Pillar 2: Live Multi-Engine Selection Dropdown */}
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono shadow-sm shrink-0 whitespace-nowrap">
        <span className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1">
          {activeEngine === 'erdf' && <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          {activeEngine === 'clang' && <Flame className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />}
          {activeEngine === 'treesitter' && <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
          <span className="hidden sm:inline">Engine:</span>
        </span>
        <select
          value={activeEngine}
          onChange={(e) => setActiveEngine(e.target.value as ComparativeEngineId)}
          className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded px-2 py-0.5 text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 transition cursor-pointer"
          title="Select Active Compiler Engine"
        >
          <option value="erdf">ERDF Self-Healing</option>
          <option value="clang">Clang Panic Mode</option>
          <option value="treesitter">Tree-sitter Splicing</option>
        </select>
      </div>

      {/* Unified Panels Controller & Right Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Unified Panel Toggles Group */}
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs shrink-0 whitespace-nowrap">
          <button
            onClick={onToggleLeft}
            title={isLeftOpen ? 'Hide Editor (Ctrl+B)' : 'Show Editor (Ctrl+B)'}
            className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
              isLeftOpen
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
            }`}
          >
            {isLeftOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
            <span className="hidden xl:inline">Editor</span>
          </button>

          <button
            onClick={onToggleBottom}
            title={isBottomOpen ? 'Hide Timeline Dock (Ctrl+J)' : 'Show Timeline Dock (Ctrl+J)'}
            className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
              isBottomOpen
                ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
            }`}
          >
            {isBottomOpen ? <PanelBottomClose className="w-3.5 h-3.5" /> : <PanelBottomOpen className="w-3.5 h-3.5" />}
            <span className="hidden xl:inline">Dock</span>
          </button>

          <button
            onClick={onToggleRight}
            title={isRightOpen ? 'Hide Inspector (Ctrl+K)' : 'Show Inspector (Ctrl+K)'}
            className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
              isRightOpen
                ? 'bg-purple-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
            }`}
          >
            {isRightOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden xl:inline">Inspector</span>
          </button>
        </div>

        {/* Theme Switching Button (Icon-Only, immediately left of Weights button) */}
        <button
          onClick={toggleTheme}
          className="p-1.5 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded-md text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-indigo-600" />
          )}
        </button>

        {/* Cost Weights Configuration Button (Icon-Only, NO "Weights" text label) */}
        <button
          onClick={onOpenConfigModal}
          className="p-1.5 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded-md text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          title="Configure Multi-Factor Cost Penalties & Search Budgets"
          aria-label="Configure Weights"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
        </button>
      </div>
    </header>
  );
};
