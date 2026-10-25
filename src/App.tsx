import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useReplayStore, syncDocumentTheme } from './state/replayStore';
import { TopBar, ViewMode } from './ui/components/TopBar';
import { EditorPanel } from './ui/components/EditorPanel';
import { AstCanvasPanel } from './ui/components/AstCanvasPanel';
import { ContextDrawer, ContextDrawerTab } from './ui/components/ContextDrawer';
import { BottomDock, BottomDockTab } from './ui/components/BottomDock';
import { ConfigModal } from './ui/components/ConfigModal';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { LandingPage } from './ui/components/LandingPage';

export const App: React.FC = () => {
  const studioTheme = useReplayStore((s) => s.theme);
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#studio') return false;
    }
    return true;
  });

  // Ensure documentElement has strictly light theme when viewing LandingPage,
  // and restores user's preferred studio theme when in the Visualizer Studio.
  useEffect(() => {
    if (showLanding) {
      syncDocumentTheme('light');
    } else {
      syncDocumentTheme(studioTheme);
    }
  }, [showLanding, studioTheme]);

  const handleLaunchVisualizer = () => {
    setShowLanding(false);
    if (typeof window !== 'undefined') {
      window.location.hash = 'studio';
    }
  };

  const handleBackToLanding = () => {
    setShowLanding(true);
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#studio') {
        setShowLanding(false);
      } else if (
        window.location.hash === '' ||
        window.location.hash === '#landing' ||
        window.location.hash.startsWith('#overview') ||
        window.location.hash.startsWith('#architecture') ||
        window.location.hash.startsWith('#showdown') ||
        window.location.hash.startsWith('#cost-model') ||
        window.location.hash.startsWith('#faq')
      ) {
        setShowLanding(true);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [isBottomOpen, setIsBottomOpen] = useState(false);
  const [rightTab, setRightTab] = useState<ContextDrawerTab>('inspector');
  const [bottomTab, setBottomTab] = useState<BottomDockTab>('tokens');
  const [autoOpenOnErrors, setAutoOpenOnErrors] = useState(true);

  // Inspector column position: fixed to right side (Editor | AST | Inspector)
  const [inspectorPosition, setInspectorPosition] = useState<'top' | 'right'>('right');

  const handleInspectorPositionChange = (pos: 'top' | 'right') => {
    setInspectorPosition(pos);
    try {
      localStorage.setItem('sh_inspector_position', pos);
    } catch {
      // ignore
    }
  };

  // Resizable split state for Editor vs AST Canvas
  const [editorWidth, setEditorWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);

  const lastAutoOpenedSeqRef = useRef<number | null>(null);

  const {
    runParser,
    stepForward,
    stepBackward,
    setIsPlaying,
    isPlaying,
    playbackSpeed,
    currentState,
  } = useReplayStore();

  // Run initial parse on mount
  useEffect(() => {
    runParser();
  }, [runParser]);

  // Playback Timer Loop: automatically advances timeline when isPlaying is active
  useEffect(() => {
    if (!isPlaying) return;

    const delay = Math.max(80, Math.round(900 / playbackSpeed));
    const timer = setInterval(() => {
      const store = useReplayStore.getState();
      const total = store.parseResult?.events.length || 0;
      if (store.currentSequence < total) {
        store.stepForward();
      } else {
        store.setIsPlaying(false);
      }
    }, delay);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed]);

  // Context-aware Auto-Open: Automatically surface Right Drawer when entering error recovery on a NEW step
  useEffect(() => {
    if (!autoOpenOnErrors) return;
    const currentSeq = currentState.sequence;
    const hasCandidates = currentState.candidates.length > 0;
    const isRecoveryOrCommit =
      currentState.phase === 'recovery' ||
      currentState.phase === 'commit';

    // Only auto-open if we entered a NEW sequence with recovery/candidates
    if (
      (hasCandidates || isRecoveryOrCommit) &&
      lastAutoOpenedSeqRef.current !== currentSeq
    ) {
      lastAutoOpenedSeqRef.current = currentSeq;
      setIsRightOpen(true);
      if (hasCandidates) {
        setRightTab('arena');
      }
    }
  }, [
    currentState.sequence,
    currentState.phase,
    currentState.candidates.length,
    autoOpenOnErrors,
  ]);

  // Draggable Splitter Handlers
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.max(220, Math.min(window.innerWidth * 0.65, e.clientX));
        setEditorWidth(newWidth);
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // View Mode Presets Handler
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'split') {
      setIsLeftOpen(true);
      setIsRightOpen(true);
    } else if (mode === 'ast-focus') {
      setIsLeftOpen(false);
      setIsRightOpen(false);
    } else if (mode === 'debugger') {
      setIsLeftOpen(true);
      setIsRightOpen(true);
      setRightTab('arena');
    }
  };

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes if typing inside the code editor or an input
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsLeftOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsBottomOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsRightOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, stepForward, stepBackward, setIsPlaying]);

  if (showLanding) {
    return (
      <ErrorBoundary>
        <LandingPage onLaunchVisualizer={handleLaunchVisualizer} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen w-screen bg-slate-50 dark:bg-[#040711] text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
        {/* Top Bar with Consolidated Controls & Presets */}
        <TopBar
          onOpenConfigModal={() => setIsConfigOpen(true)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          isLeftOpen={isLeftOpen}
          onToggleLeft={() => setIsLeftOpen((prev) => !prev)}
          isRightOpen={isRightOpen}
          onToggleRight={() => setIsRightOpen((prev) => !prev)}
          isBottomOpen={isBottomOpen}
          onToggleBottom={() => setIsBottomOpen((prev) => !prev)}
          inspectorPosition={inspectorPosition}
          onBackToLanding={handleBackToLanding}
        />

        {/* Dynamic Main Workspace Area */}
        <div className="flex-1 flex min-h-0 bg-slate-100 dark:bg-[#040711] overflow-hidden relative">
          {/* Left Panel: Code Editor (Collapsible & Resizable) */}
          {isLeftOpen && (
            <div
              style={{ width: `${editorWidth}px` }}
              className="flex flex-col min-h-0 shrink-0 border-r border-slate-200 dark:border-slate-800/80 relative"
            >
              <EditorPanel />
            </div>
          )}

          {/* Draggable Divider Handle */}
          {isLeftOpen && (
            <div
              onMouseDown={startResizing}
              className={`w-1.5 hover:w-2 bg-slate-200 hover:bg-sky-500/80 dark:bg-slate-900 active:bg-sky-400 cursor-col-resize transition-colors shrink-0 z-20 group relative flex items-center justify-center select-none ${
                isResizing ? 'bg-sky-500 w-2' : ''
              }`}
            >
              <div className="w-[1px] h-6 bg-slate-400 dark:bg-slate-700 group-hover:bg-white rounded" />
            </div>
          )}

          {/* Center Main Hero: Recovered AST Tree Canvas (Expansive) */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-slate-50 dark:bg-[#050814] relative overflow-hidden">
            <AstCanvasPanel />
          </main>

          {/* Right Context Drawer / Inspector: Candidates, Inspector & Semantic Diagnostics */}
          {isRightOpen && (
            <ContextDrawer
              isOpen={isRightOpen}
              onToggleOpen={() => setIsRightOpen((prev) => !prev)}
              activeTab={rightTab}
              onTabChange={setRightTab}
              autoOpenOnErrors={autoOpenOnErrors}
              onToggleAutoOpen={() => setAutoOpenOnErrors((prev) => !prev)}
              position="right"
              onPositionChange={handleInspectorPositionChange}
            />
          )}
        </div>

        {/* Bottom Consolidated Dock: Timeline Scrubber & Full-Width Token Stream */}
        <BottomDock
          isOpen={isBottomOpen}
          onToggleOpen={() => setIsBottomOpen((prev) => !prev)}
          activeTab={bottomTab}
          onTabChange={setBottomTab}
        />

        {/* Multi-Factor Cost Configuration Modal */}
        <ConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
        />
      </div>
    </ErrorBoundary>
  );
};

export default App;
