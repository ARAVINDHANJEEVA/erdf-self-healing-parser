import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useReplayStore, MAX_SOURCE_CODE_LENGTH } from '../../state/replayStore';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Code2,
  Zap,
  GitBranch,
  Flame,
  Radio,
  Sparkles,
} from 'lucide-react';
import { groupCandidatesByIncident } from '../utils/incidentGrouping';
import { tokenize } from '../../language/lexer';
import { Diagnostic, Token } from '../../language/types';
import { SemanticDiagnostic } from '../../semantics/typeChecker';
import {
  findCoveringAstNode,
  getAstNodeAncestors,
  formatAstNodeSummary,
  getTokenColorClass,
  getCursorCoordinates,
  calculateLineOffsets,
  buildLineSegments,
  getCharacterLimitStatus,
  AstNodeSummary,
} from '../utils/editorUtils';

interface HoverInfo {
  x: number;
  y: number;
  offset: number;
  line: number;
  column: number;
  diagnostic: Diagnostic | null;
  astNode: AstNodeSummary | null;
  token: Token | null;
}

export const EditorPanel: React.FC = () => {
  const {
    sourceCode,
    setSourceCode,
    currentState,
    parseResult,
    applyCandidateSolution,
    activeBlastRadius,
    activeEngine,
    hoveredCandidateId,
    selectedCandidateId,
    semanticResult,
    applySemanticFix,
  } = useReplayStore();

  const [localCode, setLocalCode] = useState(sourceCode);
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1, selectionLength: 0 });
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [isHoveringPopover, setIsHoveringPopover] = useState(false);
  const [charWidth, setCharWidth] = useState<number>(7.2);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const charMeasureRef = useRef<HTMLSpanElement>(null);
  const lastSyncedSourceRef = useRef<string>(sourceCode);

  // Update cursor position Ln X, Col Y in real-time
  const updateCursorPosition = useCallback((codeOverride?: string) => {
    if (!textareaRef.current) return;
    const currentCode = codeOverride ?? textareaRef.current.value;
    const start = textareaRef.current.selectionStart ?? 0;
    const end = textareaRef.current.selectionEnd ?? 0;
    const { line, column } = getCursorCoordinates(currentCode, start);
    const selectionLength = Math.abs(end - start);
    setCursorPos({ line, column, selectionLength });
  }, []);

  // Synchronize when store changes externally (e.g. loading a demo or applying a fix)
  useEffect(() => {
    if (sourceCode !== lastSyncedSourceRef.current) {
      lastSyncedSourceRef.current = sourceCode;
      setLocalCode(sourceCode);
      if (textareaRef.current && textareaRef.current.value !== sourceCode) {
        textareaRef.current.value = sourceCode;
      }
      updateCursorPosition(sourceCode);
    }
  }, [sourceCode, updateCursorPosition]);

  // Debounce updates from user typing to the global store and parser
  useEffect(() => {
    if (localCode === sourceCode) return;
    const timer = setTimeout(() => {
      lastSyncedSourceRef.current = localCode;
      setSourceCode(localCode);
    }, 150);
    return () => clearTimeout(timer);
  }, [localCode, setSourceCode, sourceCode]);

  // Measure exact character width of JetBrains Mono for accurate column detection
  useEffect(() => {
    const measure = () => {
      if (charMeasureRef.current) {
        const rect = charMeasureRef.current.getBoundingClientRect();
        if (rect.width > 0) {
          setCharWidth(rect.width / 100);
        }
      }
    };
    measure();
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts?.ready?.then(measure);
    }
  }, []);

  // Synchronize gutter and overlay scrolling with editor textarea
  const handleScroll = () => {
    if (textareaRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      if (gutterRef.current) {
        gutterRef.current.scrollTop = scrollTop;
      }
      if (overlayRef.current) {
        overlayRef.current.scrollTop = scrollTop;
        overlayRef.current.scrollLeft = scrollLeft;
      }
    }
  };

  // Support Tab key indentation & Shift+Tab unindentation inside editor
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    setHoverInfo(null); // Dismiss hover tooltip on key press
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;

      if (e.shiftKey) {
        // Shift+Tab unindent
        const linesArr = val.split('\n');
        const { line } = getCursorCoordinates(val, start);
        const lineIdx = line - 1;
        if (linesArr[lineIdx]?.startsWith('  ')) {
          linesArr[lineIdx] = linesArr[lineIdx].slice(2);
          const nextVal = linesArr.join('\n');
          setLocalCode(nextVal);
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              const nextStart = Math.max(0, start - 2);
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = nextStart;
              updateCursorPosition(nextVal);
            }
          });
        }
      } else {
        const nextVal = val.substring(0, start) + '  ' + val.substring(end);
        setLocalCode(nextVal);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
            updateCursorPosition(nextVal);
          }
        });
      }
    }
  };

  // Jump editor cursor to diagnostic line and smoothly scroll viewport
  const jumpToLine = (line: number) => {
    if (!textareaRef.current) return;
    const linesArr = localCode.split('\n');
    let charOffset = 0;
    for (let i = 0; i < Math.min(line - 1, linesArr.length); i++) {
      charOffset += linesArr[i].length + 1;
    }
    textareaRef.current.focus();
    const lineLen = linesArr[line - 1]?.length || 0;
    textareaRef.current.setSelectionRange(charOffset, charOffset + lineLen);
    const targetScrollTop = Math.max(0, (line - 3) * 24);
    textareaRef.current.scrollTop = targetScrollTop;
    handleScroll();
    updateCursorPosition();
  };

  const lines = useMemo(() => localCode.split('\n'), [localCode]);
  const lineOffsets = useMemo(() => calculateLineOffsets(localCode), [localCode]);

  // Lex source code for live syntax highlighting and token extraction
  const lexerResult = useMemo(() => tokenize(localCode), [localCode]);

  const activeDiagnostics =
    parseResult?.diagnostics && parseResult.diagnostics.length > 0
      ? parseResult.diagnostics
      : currentState.diagnostics;

  const semanticDiagnostics = semanticResult?.diagnostics || [];
  const allDiagnostics = useMemo(() => {
    return [...activeDiagnostics, ...semanticDiagnostics];
  }, [activeDiagnostics, semanticDiagnostics]);

  const errorCount = allDiagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = allDiagnostics.filter((d) => d.severity === 'warning').length;
  const semanticFixesCount = semanticResult?.suggestions.length || 0;

  // Active cursor quick-fix candidate if cursor is within an undeclared identifier's span
  const activeCursorFix = useMemo(() => {
    if (!semanticResult?.suggestions || semanticResult.suggestions.length === 0) return null;
    const lineStart = lineOffsets[cursorPos.line - 1] ?? 0;
    const offset = lineStart + cursorPos.column - 1;
    return (
      semanticResult.suggestions.find(
        (s) => offset >= s.replacementSpan.start && offset <= s.replacementSpan.end
      ) || null
    );
  }, [semanticResult?.suggestions, cursorPos, lineOffsets]);

  const committed =
    currentState.committedRepairs.length > 0
      ? currentState.committedRepairs
      : parseResult?.committedRepairs || [];

  const incidents = useMemo(() => {
    return groupCandidatesByIncident(
      currentState.candidates,
      committed,
      activeDiagnostics
    );
  }, [currentState.candidates, committed, activeDiagnostics]);

  // Character limit status for visual indicators & badge warnings
  const charLimitStatus = useMemo(
    () => getCharacterLimitStatus(localCode.length, MAX_SOURCE_CODE_LENGTH),
    [localCode.length]
  );

  // Mouse move handler for Source Range Hover & Inline Error Tooltips
  const handleMouseMove = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (isHoveringPopover) return;
    if (!textareaRef.current || !viewportRef.current) return;
    const vpRect = viewportRef.current.getBoundingClientRect();
    const mouseX = e.clientX - vpRect.left + textareaRef.current.scrollLeft - 12; // 12px padding
    const mouseY = e.clientY - vpRect.top + textareaRef.current.scrollTop - 12; // 12px padding

    const lineIndex = Math.floor(mouseY / 24); // 24px line-height
    if (lineIndex < 0 || lineIndex >= lines.length || mouseX < 0) {
      setHoverInfo(null);
      return;
    }

    const currentLine = lines[lineIndex];
    const colIndex = Math.floor(mouseX / (charWidth || 7.2));
    const isPastEndOfLine = colIndex >= currentLine.length;
    const lineStart = lineOffsets[lineIndex] ?? 0;
    const lineEnd = lineStart + currentLine.length;

    // 1. Check for covering diagnostic
    const diag = allDiagnostics.find((d) => {
      if (d.span.line === lineIndex + 1 && d.span.start >= lineEnd) {
        return isPastEndOfLine && colIndex <= currentLine.length + 1;
      }
      const dEnd = Math.max(d.span.start + 1, d.span.end);
      const targetOffset = lineStart + colIndex;
      return targetOffset >= d.span.start && targetOffset < dEnd;
    });

    // If mouse is past end of line and not hovering an end-of-line diagnostic, don't trigger hover
    if (isPastEndOfLine && !diag) {
      setHoverInfo(null);
      return;
    }

    const charCol = Math.min(colIndex, Math.max(0, currentLine.length - 1));
    const offset = Math.min(lineStart + charCol, localCode.length);

    // 2. Check for covering AST node
    const activeAst = parseResult?.ast || null;
    const astNode = findCoveringAstNode(activeAst, offset);
    const ancestors = astNode ? getAstNodeAncestors(activeAst, offset) : [];
    const astSummary = astNode ? formatAstNodeSummary(astNode, ancestors) : null;

    // 3. Check for covering token
    const token = lexerResult.tokens.find(
      (t) => t.kind !== 'EOF' && offset >= t.span.start && offset < t.span.end
    );

    if (diag || astSummary || token) {
      setHoverInfo({
        x: e.clientX - vpRect.left,
        y: e.clientY - vpRect.top,
        offset,
        line: lineIndex + 1,
        column: Math.min(colIndex + 1, currentLine.length + 1),
        diagnostic: diag || null,
        astNode: astSummary,
        token: token || null,
      });
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseLeave = () => {
    if (!isHoveringPopover) {
      setHoverInfo(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#080d1a] border-r border-slate-200 dark:border-slate-800/80">
      {/* Hidden element for measuring exact font character width */}
      <span
        ref={charMeasureRef}
        className="absolute -left-[9999px] top-0 font-mono text-xs invisible select-none"
        aria-hidden="true"
      >
        {'X'.repeat(100)}
      </span>

      {/* IDE Editor Header Bar */}
      <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2">
          {/* Active File Tab */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-[#080d1a] border-t-2 border-t-sky-500 border-x border-b border-slate-200 dark:border-slate-800 rounded-t text-slate-800 dark:text-slate-100 font-mono text-[11px] font-semibold">
            <Code2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>main.c</span>
          </div>

          {/* Character limit warning badge in header if approaching limit */}
          {charLimitStatus.isWarning && (
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                charLimitStatus.level === 'exceeded' || charLimitStatus.level === 'critical'
                  ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-700 animate-pulse'
                  : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-current" />
              <span>{charLimitStatus.badgeText}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
          <span>{lines.length} lines</span>
          <span>•</span>
          <span
            className={
              charLimitStatus.isWarning
                ? charLimitStatus.colorClass
                : 'text-slate-500'
            }
          >
            {localCode.length.toLocaleString()} chars
          </span>
          <span>•</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-sky-700 dark:text-sky-300 font-semibold border border-slate-200 dark:border-slate-700">
            C (C99/C11)
          </span>
        </div>
      </div>

      {/* Interactive Quick-Fix Pill Banner when clicking or placing cursor on an undeclared variable */}
      {activeCursorFix && (
        <div className="px-3 py-1.5 bg-emerald-50 dark:bg-slate-900 border-b border-emerald-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono text-slate-800 dark:text-slate-200 select-none shadow-sm shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-400 dark:border-emerald-500 shadow-sm text-emerald-700 dark:text-emerald-400 shrink-0">
              <Zap className="w-3 h-3 fill-current" />
            </span>
            <span className="font-sans text-xs text-slate-800 dark:text-slate-200 truncate">
              Did you mean <strong className="font-mono text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 font-bold">'{activeCursorFix.suggestedName}'</strong>?
              <span className="text-slate-500 dark:text-slate-400 text-[10px] ml-2 font-mono hidden sm:inline">
                (Dist: {activeCursorFix.distance}, {activeCursorFix.matchPercentage}% match)
              </span>
            </span>
          </div>
          <button
            onClick={() => applySemanticFix(activeCursorFix)}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition whitespace-nowrap shrink-0"
            title={`Replace '${activeCursorFix.originalName}' with '${activeCursorFix.suggestedName}'`}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Apply Quick Fix</span>
          </button>
        </div>
      )}

      {/* Pillar 1: Quantified Impact Scorecard & Shockwave Heatmap Overlay */}
      {activeBlastRadius && (
        <div
          className={`px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b text-[11px] font-mono select-none transition-all ${
            activeBlastRadius.severity === 'zero'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm dark:bg-emerald-950/85 dark:border-emerald-700/80 dark:text-emerald-100 dark:shadow-emerald-950/50'
              : activeBlastRadius.severity === 'medium'
              ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm dark:bg-amber-950/90 dark:border-amber-700/80 dark:text-amber-100 dark:shadow-amber-950/50'
              : 'bg-rose-50 border-rose-300 text-rose-900 shadow-md dark:bg-rose-950/95 dark:border-rose-700/90 dark:text-rose-100 dark:shadow-rose-950/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                activeBlastRadius.severity === 'zero'
                  ? 'bg-emerald-500 ring-2 ring-emerald-500/50'
                  : activeBlastRadius.severity === 'medium'
                  ? 'bg-amber-500 ring-2 ring-amber-500/50'
                  : 'bg-rose-500 ring-2 ring-rose-500/50 animate-ping'
              }`}
            />
            <span className="font-bold tracking-tight flex items-center gap-1.5">
              {activeBlastRadius.severity === 'zero' && <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
              {activeBlastRadius.severity === 'medium' && <Radio className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
              {activeBlastRadius.severity === 'catastrophic' && <Flame className="w-3 h-3 text-rose-600 dark:text-rose-400 animate-pulse" />}
              <span>{activeBlastRadius.zoneName}</span>
            </span>

            {hoveredCandidateId && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/60 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300">
                Hovering Candidate
              </span>
            )}
            {selectedCandidateId && !hoveredCandidateId && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/60 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-purple-700 dark:text-purple-300 font-semibold">
                Counterfactual Branch
              </span>
            )}
            {!hoveredCandidateId && !selectedCandidateId && activeEngine !== 'erdf' && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/60 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-amber-700 dark:text-amber-300">
                Engine: {activeEngine === 'clang' ? 'Clang/GCC Panic' : 'Tree-sitter'}
              </span>
            )}
          </div>

          {/* Quantified Impact Scorecard Badges: Br, Mc, Past */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Blast Radius Br */}
            <div
              className="flex items-center gap-1 cursor-help"
              title={`Blast Radius (Br): ${activeBlastRadius.blastRadius} downstream tokens corrupted (${activeBlastRadius.blastRadiusChars} source characters affected)`}
            >
              <span className="text-slate-600 dark:text-slate-400 text-[10px]">B_r:</span>
              <span className="font-bold text-slate-900 dark:text-white bg-white/80 dark:bg-black/50 px-1.5 py-0.2 rounded border border-slate-300 dark:border-white/10">
                {activeBlastRadius.blastRadius} tok ({activeBlastRadius.blastRadiusChars} chars)
              </span>
            </div>

            {/* Cascading Diagnostic Multiplier Mc */}
            <div
              className="flex items-center gap-1 cursor-help"
              title={`Cascading Diagnostic Multiplier (Mc): ${activeBlastRadius.cascadingMultiplier} phantom secondary errors generated downstream`}
            >
              <span className="text-slate-600 dark:text-slate-400 text-[10px]">M_c:</span>
              <span
                className={`font-bold px-1.5 py-0.2 rounded border ${
                  activeBlastRadius.cascadingMultiplier === 0
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700/60'
                    : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/80 dark:text-rose-200 dark:border-rose-700/80 animate-pulse'
                }`}
              >
                +{activeBlastRadius.cascadingMultiplier} cascades
              </span>
            </div>

            {/* AST Preservation Index Past */}
            <div
              className="flex items-center gap-1 cursor-help"
              title={`AST Preservation Index (Past): ${activeBlastRadius.astPreservationIndex}% of valid syntactic constructs preserved in final tree`}
            >
              <span className="text-slate-600 dark:text-slate-400 text-[10px]">P_ast:</span>
              <span
                className={`font-bold px-1.5 py-0.2 rounded border ${
                  activeBlastRadius.astPreservationIndex >= 90
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700/60'
                    : activeBlastRadius.astPreservationIndex >= 70
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700/60'
                    : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/80 dark:text-rose-200 dark:border-rose-700/80'
                }`}
              >
                {activeBlastRadius.astPreservationIndex}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Editor & Line Numbers Area */}
      <div
        ref={editorContainerRef}
        className="flex-1 flex overflow-hidden relative font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-[#040711]"
      >
        {/* Line Gutter with synced scroll and active line highlight */}
        <div
          ref={gutterRef}
          className="w-11 bg-slate-50 dark:bg-[#060913] text-slate-400 dark:text-slate-500 py-3 select-none text-right pr-2.5 border-r border-slate-200 dark:border-slate-800/60 leading-6 font-mono text-[11px] font-light overflow-hidden shrink-0"
        >
          {lines.map((_, i) => {
            const isCurrentLine = cursorPos.line === i + 1;
            const isBlastLine = activeBlastRadius?.affectedLines.includes(i + 1);
            let blastGutterStyle = '';
            if (isBlastLine && activeBlastRadius) {
              if (activeBlastRadius.severity === 'zero') {
                blastGutterStyle = 'text-emerald-800 dark:text-emerald-400 font-semibold bg-emerald-100 dark:bg-emerald-950/30';
              } else if (activeBlastRadius.severity === 'medium') {
                blastGutterStyle = 'text-amber-800 dark:text-amber-400 font-semibold bg-amber-100 dark:bg-amber-950/35';
              } else {
                blastGutterStyle = 'text-rose-950 dark:text-rose-300 font-bold bg-rose-100 dark:bg-rose-950/50';
              }
            }

            return (
              <div
                key={i}
                className={`transition-colors ${
                  blastGutterStyle
                    ? blastGutterStyle
                    : isCurrentLine
                    ? 'text-sky-700 dark:text-sky-300 font-bold bg-sky-100 dark:bg-sky-950/40 -mr-2.5 pr-2.5'
                    : 'hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {i + 1}
              </div>
            );
          })}
        </div>

        {/* Code Viewport Container: Overlay + Textarea Stack */}
        <div ref={viewportRef} className="relative flex-1 overflow-hidden h-full bg-white dark:bg-[#040711]">
          {/* Syntax Highlighted & Inline Error Squiggle Overlay */}
          <div
            ref={overlayRef}
            className="absolute inset-0 pointer-events-none p-3 font-mono text-xs leading-6 overflow-hidden z-0 select-none whitespace-pre"
            style={{ tabSize: 2 }}
            aria-hidden="true"
          >
            {lines.map((lineText, lineIdx) => {
              const lineStart = lineOffsets[lineIdx] ?? 0;
              const segments = buildLineSegments(
                lineIdx,
                lineText,
                lineStart,
                lexerResult.tokens,
                lexerResult.comments,
                allDiagnostics
              );
              const isCurrentLine = cursorPos.line === lineIdx + 1;
              const isBlastLine = activeBlastRadius?.affectedLines.includes(lineIdx + 1);

              let lineBackground = '';
              if (isBlastLine && activeBlastRadius) {
                if (activeBlastRadius.severity === 'zero') {
                  lineBackground = 'bg-emerald-50 dark:bg-emerald-950/20 border-l-2 border-emerald-500 dark:border-emerald-400 text-emerald-950 dark:text-emerald-200';
                } else if (activeBlastRadius.severity === 'medium') {
                  lineBackground = 'bg-amber-50 dark:bg-amber-950/25 border-l-2 border-amber-500 dark:border-amber-400 text-amber-950 dark:text-amber-200';
                } else {
                  lineBackground = 'bg-rose-100/90 dark:bg-rose-950/40 border-l-2 border-rose-500 ring-1 ring-rose-500/20 text-rose-950 font-bold dark:text-rose-200';
                }
              } else if (isCurrentLine) {
                lineBackground = 'bg-sky-100/70 dark:bg-sky-950/20';
              }

              return (
                <div
                  key={lineIdx}
                  className={`h-6 leading-6 whitespace-pre min-w-full w-max ${lineBackground}`}
                >
                  {segments.map((seg, segIdx) => {
                    const colorClass = getTokenColorClass(seg.kind);
                    let squiggleStyle: React.CSSProperties | undefined;

                    if (seg.isSquiggle && seg.diagnostic) {
                      const isSemantic = seg.diagnostic.code.startsWith('SEM_');
                      const isError = seg.diagnostic.severity === 'error';
                      squiggleStyle = {
                        textDecorationLine: 'underline',
                        textDecorationStyle: 'wavy',
                        textDecorationColor: isSemantic
                          ? '#06b6d4'
                          : isError
                          ? '#f43f5e'
                          : '#fbbf24',
                        textUnderlineOffset: '3.5px',
                        backgroundColor: isSemantic
                          ? 'rgba(6, 182, 212, 0.16)'
                          : isError
                          ? 'rgba(244, 63, 94, 0.14)'
                          : 'rgba(251, 191, 36, 0.14)',
                      };
                    }

                    // Direct Visual Impact: Interactive Impact Zone overlay tinting exact tokens in blast radius
                    const isTokenInBlast =
                      activeBlastRadius?.impactSpan &&
                      seg.text.trim().length > 0 &&
                      Math.max(seg.startOffset, activeBlastRadius.impactSpan.start) <
                        Math.min(seg.endOffset, activeBlastRadius.impactSpan.end);

                    let blastTokenClass = '';
                    if (isTokenInBlast && activeBlastRadius) {
                      if (activeBlastRadius.severity === 'zero') {
                        blastTokenClass = 'bg-emerald-100 text-emerald-950 font-medium dark:bg-emerald-500/25 dark:text-emerald-200 rounded-sm px-0.5 shadow-sm';
                      } else if (activeBlastRadius.severity === 'medium') {
                        blastTokenClass = 'bg-amber-100 text-amber-950 font-medium border-b border-amber-500 dark:bg-amber-500/30 dark:text-amber-100 dark:border-amber-400 rounded-sm px-0.5';
                      } else {
                        blastTokenClass = 'bg-rose-200/80 text-rose-950 font-bold border-b-2 border-rose-600 dark:bg-rose-500/35 dark:text-rose-100 dark:border-rose-500 rounded-sm px-0.5';
                      }
                    }

                    return (
                      <span
                        key={segIdx}
                        className={`${colorClass} ${
                          seg.isSquiggle ? 'decoration-wavy underline' : ''
                        } ${blastTokenClass} ${
                          isBlastLine && !blastTokenClass ? 'text-rose-950 font-bold dark:text-rose-200' : ''
                        }`}
                        style={squiggleStyle}
                      >
                        {seg.text}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Interactive Text Area with Transparent Text & Visible Caret */}
          <textarea
            ref={textareaRef}
            value={localCode}
            onChange={(e) => {
              const val = e.target.value;
              setLocalCode(val);
              updateCursorPosition(val);
            }}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onKeyUp={() => updateCursorPosition()}
            onClick={() => updateCursorPosition()}
            onSelect={() => updateCursorPosition()}
            onFocus={() => updateCursorPosition()}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            maxLength={MAX_SOURCE_CODE_LENGTH}
            wrap="off"
            spellCheck={false}
            style={{ tabSize: 2 }}
            className="absolute inset-0 bg-transparent text-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500 caret-sky-600 dark:caret-sky-400 p-3 outline-none resize-none leading-6 font-mono text-xs selection:bg-sky-200 selection:text-slate-900 dark:selection:bg-sky-800 dark:selection:text-white border-none overflow-auto z-10"
            placeholder="Enter C source code (e.g. #include <stdio.h>, int main() { ... })..."
          />

          {/* Source Range & Inline Error Tooltip */}
          {hoverInfo && (() => {
            const isSemantic = Boolean(hoverInfo.diagnostic?.code.startsWith('SEM_'));
            const semCandidate = isSemantic
              ? (hoverInfo.diagnostic as SemanticDiagnostic).symbolCandidate
              : undefined;

            return (
              <div
                onMouseEnter={() => setIsHoveringPopover(true)}
                onMouseLeave={() => {
                  setIsHoveringPopover(false);
                  setHoverInfo(null);
                }}
                className="absolute z-30 rounded-md shadow-2xl p-2.5 max-w-sm text-xs font-mono transition-opacity border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 pointer-events-auto"
                style={{
                  top: Math.min(
                    Math.max(10, hoverInfo.y + 18),
                    (viewportRef.current?.clientHeight || 400) - 140
                  ),
                  left: Math.min(
                    Math.max(10, hoverInfo.x - 20),
                    (viewportRef.current?.clientWidth || 380) - 310
                  ),
                }}
              >
                {/* Diagnostic Hover Info */}
                {hoverInfo.diagnostic && (
                  <div className="space-y-1 mb-2">
                    <div
                      className={`flex items-center justify-between gap-2 pb-1 border-b ${
                        isSemantic
                          ? 'border-slate-200 dark:border-slate-800'
                          : hoverInfo.diagnostic.severity === 'error'
                          ? 'border-rose-200 dark:border-rose-800/60'
                          : 'border-amber-200 dark:border-amber-800/60'
                      }`}
                    >
                      <span
                        className={`flex items-center gap-1.5 font-bold text-[11px] ${
                          isSemantic
                            ? 'text-sky-700 dark:text-sky-300'
                            : hoverInfo.diagnostic.severity === 'error'
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {isSemantic ? (
                          <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        ) : hoverInfo.diagnostic.severity === 'error' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        )}
                        <span>
                          {isSemantic
                            ? 'Semantic Check'
                            : hoverInfo.diagnostic.severity === 'error'
                            ? 'Syntax Error'
                            : 'Warning'}
                        </span>
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                          isSemantic
                            ? 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30'
                            : 'bg-slate-100 text-slate-700 dark:bg-black/40 dark:text-slate-300'
                        }`}
                      >
                        {hoverInfo.diagnostic.code}
                      </span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-200 text-[11px] leading-tight font-sans">
                      {hoverInfo.diagnostic.message}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Ln {hoverInfo.diagnostic.span.line}, Col {hoverInfo.diagnostic.span.column}
                    </div>

                    {/* Interactive Quick-Fix Popover Button for Typo Recovery */}
                    {semCandidate && (
                      <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5 pointer-events-auto">
                        <div className="text-[11px] text-slate-700 dark:text-slate-200 font-sans">
                          Did you mean <strong className="text-sky-700 dark:text-sky-300 font-mono bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">'{semCandidate.suggestedName}'</strong>?
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] ml-1.5 font-mono">
                            (Dist: {semCandidate.distance}, {semCandidate.matchPercentage}% match)
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            applySemanticFix(semCandidate);
                            setHoverInfo(null);
                            setIsHoveringPopover(false);
                          }}
                          className="w-full py-1.5 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition whitespace-nowrap"
                          title={`Replace '${semCandidate.originalName}' with '${semCandidate.suggestedName}'`}
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>Apply Quick Fix</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* AST Node Hover Info */}
              {hoverInfo.astNode && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="flex items-center gap-1.5 font-bold text-[11px] text-sky-700 dark:text-sky-300">
                      <GitBranch className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>{hoverInfo.astNode.kind}</span>
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                        hoverInfo.astNode.provenance === 'recovered'
                          ? 'bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700'
                          : hoverInfo.astNode.provenance === 'partial'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700'
                          : 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
                      }`}
                    >
                      {hoverInfo.astNode.provenance}
                    </span>
                  </div>

                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    {hoverInfo.astNode.label}
                  </div>

                  {hoverInfo.astNode.details && (
                    <div className="text-[10px] text-slate-600 dark:text-slate-400 font-sans">
                      {hoverInfo.astNode.details}
                    </div>
                  )}

                  {hoverInfo.astNode.ancestors.length > 0 && (
                    <div className="text-[9px] text-slate-500 truncate pt-0.5">
                      Hierarchy: {hoverInfo.astNode.ancestors.join(' > ')}
                    </div>
                  )}
                </div>
              )}

              {/* Token Info if no AST node found */}
              {!hoverInfo.astNode && hoverInfo.token && (
                <div className="text-[10px] text-slate-600 dark:text-slate-400 flex items-center justify-between gap-3">
                  <span>Token: <strong className="text-sky-700 dark:text-sky-300">{hoverInfo.token.kind}</strong></span>
                  <span className="text-slate-500">'{hoverInfo.token.lexeme}'</span>
                </div>
              )}

              {/* Location Coordinates */}
              <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                <span>Ln {hoverInfo.line}, Col {hoverInfo.column}</span>
                <span>offset #{hoverInfo.offset}</span>
              </div>
            </div>
          );
        })()}
        </div>
      </div>

      {/* Real-time IDE Status Bar */}
      <div className="@container/status px-3 py-1 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400 select-none shrink-0 overflow-hidden whitespace-nowrap min-w-0">
        {/* Left: Cursor position indicator */}
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap min-w-0">
          <span className="text-slate-800 dark:text-slate-200 font-medium whitespace-nowrap">
            Ln {cursorPos.line}, Col {cursorPos.column}
          </span>
          {cursorPos.selectionLength > 0 && (
            <span className="text-sky-600 dark:text-sky-400 text-[10px] whitespace-nowrap">
              ({cursorPos.selectionLength} selected)
            </span>
          )}
        </div>

        {/* Right: Character limit indicator / warning, encoding, spaces */}
        <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
          {/* Character Limit Progress Bar & Warning Indicator */}
          <div
            className="flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            title={`Source size: ${charLimitStatus.current.toLocaleString()} / ${charLimitStatus.max.toLocaleString()} characters (${charLimitStatus.pct}%). Maximum limit is 100,000 chars.`}
          >
            {charLimitStatus.isWarning && (
              <AlertTriangle
                className={`w-3 h-3 animate-pulse shrink-0 ${
                  charLimitStatus.level === 'exceeded' || charLimitStatus.level === 'critical'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              />
            )}
            <div className="w-14 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 hidden sm:block @[280px]:block">
              <div
                className={`h-full transition-all duration-300 ${charLimitStatus.barColorClass}`}
                style={{ width: `${Math.max(2, charLimitStatus.pct)}%` }}
              />
            </div>
            <span className={`text-[10px] whitespace-nowrap font-mono ${charLimitStatus.colorClass}`}>
              {charLimitStatus.badgeText}
            </span>
          </div>

          <span className="text-slate-400 dark:text-slate-600 hidden sm:inline @[340px]:inline">•</span>
          <span className="text-slate-500 dark:text-slate-400 text-[10px] whitespace-nowrap hidden sm:inline @[340px]:inline">Spaces: 2</span>
          <span className="text-slate-400 dark:text-slate-600 hidden md:inline @[400px]:inline">•</span>
          <span className="text-slate-500 dark:text-slate-400 text-[10px] whitespace-nowrap hidden md:inline @[400px]:inline">UTF-8</span>
        </div>
      </div>

      {/* Diagnostic Markers Drawer */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-xs max-h-40 overflow-y-auto shrink-0">
        <div className="flex items-center justify-between mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <span>Diagnostics</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
              {allDiagnostics.length}
            </span>
          </span>

          <div className="flex items-center gap-2 text-[10px]">
            {errorCount > 0 && (
              <span className="text-rose-700 bg-rose-100 border border-rose-300 dark:text-rose-300 dark:bg-rose-500/20 dark:border-rose-500/30 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-amber-700 bg-amber-100 border border-amber-300 dark:text-amber-300 dark:bg-amber-500/20 dark:border-amber-500/30 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                {warningCount} warning{warningCount > 1 ? 's' : ''}
              </span>
            )}
            {semanticFixesCount > 0 && (
              <span className="text-sky-700 bg-sky-100 border border-sky-300 dark:text-sky-300 dark:bg-sky-500/20 dark:border-sky-500/30 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                {semanticFixesCount} quick fix{semanticFixesCount > 1 ? 'es' : ''}
              </span>
            )}
          </div>
        </div>

        {allDiagnostics.length === 0 ? (
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 py-1 font-mono">
            <Info className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>All statements well-formed. No syntax or semantic errors detected.</span>
          </p>
        ) : (
          <div className="space-y-1.5">
            {allDiagnostics.map((diag, idx) => {
              const isSemantic = Boolean(diag.code.startsWith('SEM_'));
              const semCandidate = isSemantic
                ? (diag as SemanticDiagnostic).symbolCandidate
                : undefined;

              const matchingIncident = incidents.find(
                (inc) =>
                  inc.line === diag.span.line ||
                  inc.winningCandidate?.edits.some(
                    (e) =>
                      e.token?.span.start === diag.span.start ||
                      e.deletedToken?.span.start === diag.span.start
                  )
              );
              const winningRepair = matchingIncident?.winningCandidate;

              return (
                <div
                  key={idx}
                  onClick={() => jumpToLine(diag.span.line)}
                  title={`Click to jump to line ${diag.span.line}`}
                  className="p-2.5 rounded-md flex items-start gap-2.5 text-[11px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition shadow-sm cursor-pointer"
                >
                  {isSemantic ? (
                    <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  ) : diag.severity === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 font-mono min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-200 whitespace-nowrap">
                        Ln {diag.span.line}, Col {diag.span.column}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        {semCandidate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              applySemanticFix(semCandidate);
                            }}
                            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-sky-600 hover:bg-sky-500 text-white transition flex items-center gap-1 cursor-pointer shadow-sm whitespace-nowrap shrink-0"
                            title={`Quick fix: Replace '${semCandidate.originalName}' with '${semCandidate.suggestedName}'`}
                          >
                            <Zap className="w-3 h-3 text-white fill-current" />
                            <span>Quick Fix: '{semCandidate.suggestedName}'</span>
                          </button>
                        )}
                        {winningRepair && !semCandidate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              applyCandidateSolution(winningRepair);
                            }}
                            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1 cursor-pointer shadow-sm whitespace-nowrap shrink-0"
                            title={`Quick fix: ${winningRepair.reasons[0] || 'Apply repair'}`}
                          >
                            <Zap className="w-3 h-3 text-white fill-current" />
                            <span>Apply Fix</span>
                          </button>
                        )}
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
                          {diag.code}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-slate-600 dark:text-slate-300 font-sans text-xs leading-normal">
                      {diag.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
