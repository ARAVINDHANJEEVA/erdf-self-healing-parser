import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useReplayStore } from '../../state/replayStore';
import { computeTreeLayout, LayoutNode } from '../utils/treeLayout';
import { tokenize } from '../../language/lexer';
import { VirtualTokenStream } from '../../parser/virtualStream';
import { RecoveringParser } from '../../parser/recoveringParser';
import { ProgramNode } from '../../language/ast';
import { Edit, SourceSpan, Token } from '../../language/types';
import { formatCandidateAction } from '../utils/candidateFormatter';
import { ComparativeEngineId } from '../../analysis/comparativeRunners';
import {
  GitBranch,
  Ghost,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  X,
  Camera,
  Loader2,
  Zap,
  Columns,
  GitCompare,
  Flame,
  Layers,
} from 'lucide-react';

export const AstCanvasPanel: React.FC = () => {
  const {
    parseResult,
    selectedCandidateId,
    sourceCode,
    config,
    currentState,
    currentSequence,
    selectCounterfactual,
    applyCandidateSolution,
    activeEngine,
    comparativeShowdown,
    astDiffMode,
    setAstDiffMode,
    dualLeftEngine,
    dualRightEngine,
    setDualEngines,
    activeBlastRadius,
    theme,
  } = useReplayStore();
  const isLight = theme === 'light';
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFittedAstIdRef = useRef<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Look up selected counterfactual candidate if one is active
  const selectedCandidate = useMemo(() => {
    if (!selectedCandidateId) return null;
    return currentState.candidates.find((c) => c.id === selectedCandidateId) || null;
  }, [selectedCandidateId, currentState.candidates]);

  // Non-blocking computation of counterfactual AST in useEffect with loading state
  const [astState, setAstState] = useState<{
    ast: ProgramNode | null;
    isCounterfactual: boolean;
    isLoading: boolean;
  }>({
    ast: parseResult?.ast || null,
    isCounterfactual: false,
    isLoading: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (selectedCandidate && selectedCandidate.edits.length > 0) {
      setAstState((prev) => ({ ...prev, isLoading: true }));

      const timer = setTimeout(() => {
        if (cancelled) return;
        try {
          const { tokens } = tokenize(sourceCode);
          const virtualStream = VirtualTokenStream.fromEdits(
            tokens,
            selectedCandidate.edits,
            0
          );
          const counterfactualTokens = virtualStream.toArray();
          const cfParser = new RecoveringParser(counterfactualTokens, config);
          const cfResult = cfParser.parse();

          // Mark AST nodes affected by this candidate's edits as recovered/counterfactual
          const markedAst = markCounterfactualNodes(
            cfResult.ast,
            selectedCandidate.edits,
            tokens
          );
          if (!cancelled) {
            setAstState({
              ast: markedAst,
              isCounterfactual: true,
              isLoading: false,
            });
          }
        } catch (err) {
          console.warn('Failed to compute counterfactual AST:', err);
          if (!cancelled) {
            setAstState({
              ast: parseResult?.ast || null,
              isCounterfactual: false,
              isLoading: false,
            });
          }
        }
      }, 0);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      setAstState({
        ast: parseResult?.ast || null,
        isCounterfactual: false,
        isLoading: false,
      });
    }
  }, [selectedCandidate, sourceCode, config, parseResult?.ast]);

  const { isCounterfactual, isLoading } = astState;

  // Determine active AST based on engine selection and AST Diff Matrix mode
  const displayedAst = useMemo(() => {
    if (astDiffMode === 'overlay') {
      const healthyAst = parseResult?.ast || null;
      if (!healthyAst) return null;

      // Extract destroyed spans based on active candidate or comparative engine
      let destroyedSpans: SourceSpan[] = [];
      if (selectedCandidate && activeBlastRadius?.impactSpan) {
        destroyedSpans = [activeBlastRadius.impactSpan];
      } else if (activeEngine === 'clang' && comparativeShowdown?.clang?.impactSpan) {
        destroyedSpans = [comparativeShowdown.clang.impactSpan];
      } else if (activeEngine === 'treesitter' && comparativeShowdown?.treesitter?.impactSpan) {
        destroyedSpans = [comparativeShowdown.treesitter.impactSpan];
      } else if (comparativeShowdown?.clang?.impactSpan) {
        destroyedSpans = [comparativeShowdown.clang.impactSpan];
      }
      return markDiffAst(healthyAst, destroyedSpans);
    }

    if (activeEngine === 'clang' && comparativeShowdown?.clang?.ast) {
      return comparativeShowdown.clang.ast;
    }
    if (activeEngine === 'treesitter' && comparativeShowdown?.treesitter?.ast) {
      return comparativeShowdown.treesitter.ast;
    }

    return astState.ast;
  }, [
    astDiffMode,
    activeEngine,
    comparativeShowdown,
    astState.ast,
    parseResult?.ast,
    selectedCandidate,
    activeBlastRadius,
  ]);

  const ast = displayedAst;

  // Memoize layout computation for primary canvas
  const layout = useMemo(() => (displayedAst ? computeTreeLayout(displayedAst) : null), [displayedAst]);

  // Handlers for switching split canvas engines safely without collision
  const handleSetDualLeft = useCallback(
    (engine: ComparativeEngineId) => {
      let nextRight = dualRightEngine;
      if (engine === nextRight) {
        if (engine === 'clang') nextRight = 'treesitter';
        else if (engine === 'treesitter') nextRight = 'clang';
        else nextRight = 'clang';
      }
      setDualEngines(engine, nextRight);
    },
    [dualRightEngine, setDualEngines]
  );

  const handleSetDualRight = useCallback(
    (engine: ComparativeEngineId) => {
      let nextLeft = dualLeftEngine;
      if (engine === nextLeft) {
        if (engine === 'clang') nextLeft = 'treesitter';
        else if (engine === 'treesitter') nextLeft = 'clang';
        else nextLeft = 'clang';
      }
      setDualEngines(nextLeft, engine);
    },
    [dualLeftEngine, setDualEngines]
  );

  // Helper to obtain AST for any given comparative engine
  const getEngineAst = useCallback(
    (engineId: ComparativeEngineId): ProgramNode | null => {
      if (engineId === 'erdf') return parseResult?.ast || astState.ast || null;
      if (engineId === 'clang') return comparativeShowdown?.clang?.ast || null;
      if (engineId === 'treesitter') return comparativeShowdown?.treesitter?.ast || null;
      return null;
    },
    [parseResult?.ast, astState.ast, comparativeShowdown]
  );

  // Layouts for Dual Split Canvas mode
  const splitLayoutLeft = useMemo(() => {
    const astToLayout = getEngineAst(dualLeftEngine);
    return astToLayout ? computeTreeLayout(astToLayout) : null;
  }, [dualLeftEngine, getEngineAst]);

  const splitLayoutRight = useMemo(() => {
    if (selectedCandidateId && astState.isCounterfactual && astState.ast && dualRightEngine === 'erdf') {
      return computeTreeLayout(astState.ast);
    }
    const astToLayout = getEngineAst(dualRightEngine);
    return astToLayout ? computeTreeLayout(astToLayout) : null;
  }, [selectedCandidateId, astState.isCounterfactual, astState.ast, dualRightEngine, getEngineAst]);

  // Search selected node across all active layouts
  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const searchRoot = (node: LayoutNode): LayoutNode | null => {
      if (node.id === selectedNodeId) return node;
      for (const child of node.children) {
        const found = searchRoot(child);
        if (found) return found;
      }
      return null;
    };
    if (layout) {
      const found = searchRoot(layout.root);
      if (found) return found;
    }
    if (splitLayoutLeft) {
      const found = searchRoot(splitLayoutLeft.root);
      if (found) return found;
    }
    if (splitLayoutRight) {
      const found = searchRoot(splitLayoutRight.root);
      if (found) return found;
    }
    return null;
  }, [selectedNodeId, layout, splitLayoutLeft, splitLayoutRight]);

  // Find currently active node in AST based on active event at currentSequence
  const activeNodeId = useMemo(
    () => resolveActiveNodeId(layout, currentSequence, parseResult, currentState),
    [layout, currentSequence, parseResult, currentState]
  );

  const activeNodeIdLeft = useMemo(
    () => resolveActiveNodeId(splitLayoutLeft, currentSequence, parseResult, currentState),
    [splitLayoutLeft, currentSequence, parseResult, currentState]
  );

  const activeNodeIdRight = useMemo(
    () => resolveActiveNodeId(splitLayoutRight, currentSequence, parseResult, currentState),
    [splitLayoutRight, currentSequence, parseResult, currentState]
  );

  // Auto-fit & center tree calculation (responsive to split dual mode width)
  const fitTreeToView = useCallback(() => {
    if (!containerRef.current) return;
    const isSplit = astDiffMode === 'split';
    const activeLayout = isSplit ? (splitLayoutLeft || splitLayoutRight || layout) : layout;
    if (!activeLayout) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const padding = 35;
    const availWidth = isSplit ? (rect.width / 2) - padding * 2 : rect.width - padding * 2;
    const availHeight = rect.height - padding * 2;

    const activeWidth = isSplit
      ? Math.max(splitLayoutLeft?.width || 0, splitLayoutRight?.width || 0, 1)
      : Math.max(activeLayout.width, 1);
    const activeHeight = isSplit
      ? Math.max(splitLayoutLeft?.height || 0, splitLayoutRight?.height || 0, 1)
      : Math.max(activeLayout.height, 1);

    const scaleX = availWidth / activeWidth;
    const scaleY = availHeight / activeHeight;
    const optimalZoom = Math.min(1.2, Math.max(0.25, Math.min(scaleX, scaleY)));

    // Center tree horizontally in the canvas / half-canvas
    const centeredX = Math.max(15, (availWidth - activeWidth * optimalZoom) / 2);
    const topY = 30;

    setZoom(optimalZoom);
    setPan({ x: centeredX, y: topY });
  }, [layout, splitLayoutLeft, splitLayoutRight, astDiffMode]);

  // Export full AST syntax tree as High-Resolution PNG
  const exportAsPng = useCallback(() => {
    const activeLayout = layout || splitLayoutLeft;
    if (!activeLayout) return;

    const padding = 60;
    const exportWidth = Math.max(activeLayout.width + padding * 2, 900);
    const exportHeight = Math.max(activeLayout.height + padding * 2, 600);
    const scale = 2; // High-DPI 2x Retina

    const canvas = document.createElement('canvas');
    canvas.width = exportWidth * scale;
    canvas.height = exportHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);

    // 1. Draw solid background
    ctx.fillStyle = isLight ? '#f8fafc' : '#050814';
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    // 2. Draw subtle dot grid
    ctx.fillStyle = isLight ? '#cbd5e1' : '#1e293b';
    for (let gx = 12; gx < exportWidth; gx += 24) {
      for (let gy = 12; gy < exportHeight; gy += 24) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Draw Header Title Watermark
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('AST Syntax Tree • Self-Healing Parser Visualizer', padding, 28);

    // Helper: Rounded Rectangle
    const drawRoundRect = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      if (typeof c.roundRect === 'function') {
        c.beginPath();
        c.roundRect(x, y, w, h, r);
      } else {
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
      }
    };

    // 4. Draw Links between parent and child nodes
    const drawCanvasLinks = (node: LayoutNode) => {
      const linkStroke = isLight ? '#94a3b8' : '#334155';
      ctx.strokeStyle = linkStroke;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);

      for (const child of node.children) {
        const parentBottomX = node.x + padding + node.width / 2;
        const parentBottomY = node.y + padding + node.height;
        const childTopX = child.x + padding + child.width / 2;
        const childTopY = child.y + padding;
        const midY = (parentBottomY + childTopY) / 2;

        ctx.beginPath();
        ctx.moveTo(parentBottomX, parentBottomY);
        ctx.bezierCurveTo(parentBottomX, midY, childTopX, midY, childTopX, childTopY);
        ctx.stroke();

        drawCanvasLinks(child);
      }
    };
    drawCanvasLinks(activeLayout.root);

    // 5. Draw Nodes
    const drawCanvasNodes = (node: LayoutNode) => {
      const nx = node.x + padding;
      const ny = node.y + padding;
      const nw = node.width;
      const nh = node.height;

      const isCascadeDestroyed = Boolean(
        node.repairIds?.includes('diff-destroyed') ||
        node.repairIds?.includes('clang-panic')
      );
      const isSpliced = Boolean(
        node.repairIds?.includes('treesitter-spliced') ||
        node.label.includes('ERROR') ||
        (node.kind === 'PartialNode' && (node as any).attemptedConstruct === 'ERROR')
      );
      const isGhost = node.provenance === 'recovered' && !isCascadeDestroyed;
      const isPartial = node.provenance === 'partial' && !isCascadeDestroyed && !isSpliced;
      const isActive = Boolean(activeNodeId && node.id === activeNodeId);
      const isSelected = Boolean(selectedNodeId && node.id === selectedNodeId);

      let fill = isLight ? '#ffffff' : '#0a1120';
      let stroke = isLight ? '#0284c7' : '#0284c7';
      let textColor = isLight ? '#0f172a' : '#f8fafc';

      if (isCascadeDestroyed) {
        fill = isLight ? '#fff1f2' : '#450a0a';
        stroke = isLight ? '#e11d48' : '#f43f5e';
        textColor = isLight ? '#9f1239' : '#fecdd3';
      } else if (isSpliced) {
        fill = isLight ? '#fffbeb' : '#451a03';
        stroke = isLight ? '#d97706' : '#f59e0b';
        textColor = isLight ? '#92400e' : '#fef3c7';
      } else if (isActive) {
        fill = isLight ? '#f0f9ff' : '#0c2340';
        stroke = isLight ? '#0284c7' : '#38bdf8';
        textColor = isLight ? '#0c4a6e' : '#ffffff';
      } else if (isSelected) {
        fill = isLight ? '#eef2ff' : '#1e1b4b';
        stroke = isLight ? '#4f46e5' : '#818cf8';
        textColor = isLight ? '#312e81' : '#ffffff';
      } else if (isGhost) {
        fill = isLight ? '#faf5ff' : '#2e1065';
        stroke = isLight ? '#9333ea' : '#c084fc';
        textColor = isLight ? '#6b21a8' : '#f3e8ff';
      } else if (isPartial) {
        fill = isLight ? '#fffbeb' : '#451a03';
        stroke = isLight ? '#d97706' : '#f59e0b';
        textColor = isLight ? '#92400e' : '#fef3c7';
      }

      // Outer focus glow for active / selected
      if (isActive || isSelected) {
        ctx.save();
        drawRoundRect(ctx, nx - 4, ny - 4, nw + 8, nh + 8, 12);
        ctx.strokeStyle = isActive
          ? (isLight ? '#0284c7' : '#38bdf8')
          : (isLight ? '#4f46e5' : '#818cf8');
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Node background
      ctx.save();
      ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      drawRoundRect(ctx, nx, ny, nw, nh, 8);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();

      // Node border
      ctx.save();
      if (isCascadeDestroyed || isSpliced || isGhost) {
        ctx.setLineDash([4, 3]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isCascadeDestroyed ? 2 : (isActive || isSelected ? 2.5 : 1.5);
      drawRoundRect(ctx, nx, ny, nw, nh, 8);
      ctx.stroke();
      ctx.restore();

      // Badges
      if (isActive && !isCascadeDestroyed) {
        const bw = 40;
        const bh = 14;
        const bx = nx + nw - bw + 4;
        const by = ny - 7;
        drawRoundRect(ctx, bx, by, bw, bh, 7);
        ctx.fillStyle = '#0284c7';
        ctx.fill();
        ctx.strokeStyle = isLight ? '#0369a1' : '#38bdf8';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 8px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ACTIVE', bx + bw / 2, by + bh / 2);
      } else if (isCascadeDestroyed) {
        const bw = 62;
        const bh = 14;
        const bx = nx + nw - bw + 4;
        const by = ny - 7;
        drawRoundRect(ctx, bx, by, bw, bh, 7);
        ctx.fillStyle = isLight ? '#fee2e2' : '#881337';
        ctx.fill();
        ctx.strokeStyle = isLight ? '#e11d48' : '#f43f5e';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 7.5px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = isLight ? '#9f1239' : '#fecdd3';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('COLLAPSED', bx + bw / 2, by + bh / 2);
      } else if (isSpliced) {
        const bw = 54;
        const bh = 14;
        const bx = nx + nw - bw + 4;
        const by = ny - 7;
        drawRoundRect(ctx, bx, by, bw, bh, 7);
        ctx.fillStyle = isLight ? '#fef3c7' : '#78350f';
        ctx.fill();
        ctx.strokeStyle = isLight ? '#d97706' : '#f59e0b';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 7.5px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = isLight ? '#92400e' : '#fef3c7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SPLICED', bx + bw / 2, by + bh / 2);
      } else if (isGhost) {
        const bw = 50;
        const bh = 14;
        const bx = nx + nw - bw + 4;
        const by = ny - 7;
        drawRoundRect(ctx, bx, by, bw, bh, 7);
        ctx.fillStyle = isLight ? '#f3e8ff' : '#581c87';
        ctx.fill();
        ctx.strokeStyle = isLight ? '#9333ea' : '#c084fc';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 8px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = isLight ? '#6b21a8' : '#f3e8ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HEALED', bx + bw / 2, by + bh / 2);
      }

      // Label text
      const displayLabel = node.label.length > 17 ? node.label.slice(0, 15) + '…' : node.label;
      ctx.font = '600 11px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayLabel, nx + nw / 2, ny + 20);

      // Red strike-through for collapsed nodes
      if (isCascadeDestroyed) {
        ctx.beginPath();
        ctx.moveTo(nx + 8, ny + 20);
        ctx.lineTo(nx + nw - 8, ny + 20);
        ctx.strokeStyle = isLight ? '#e11d48' : '#f43f5e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Kind text
      ctx.font = '400 9px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = isCascadeDestroyed
        ? (isLight ? '#e11d48' : '#fda4af')
        : isActive
        ? (isLight ? '#0284c7' : '#7dd3fc')
        : isSelected
        ? (isLight ? '#4f46e5' : '#a5b4fc')
        : (isLight ? '#64748b' : '#94a3b8');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.kind, nx + nw / 2, ny + 35);

      for (const child of node.children) {
        drawCanvasNodes(child);
      }
    };
    drawCanvasNodes(activeLayout.root);

    // 6. Trigger PNG download
    try {
      const a = document.createElement('a');
      a.download = `ast-tree-${Date.now()}.png`;
      a.href = canvas.toDataURL('image/png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export AST as PNG:', err);
    }
  }, [layout, splitLayoutLeft, isLight, activeNodeId, selectedNodeId]);

  // Auto-fit when mode, engines, or parsed AST changes
  useEffect(() => {
    if (!layout && !splitLayoutLeft && !splitLayoutRight) return;
    const astId = `${astDiffMode}-${dualLeftEngine}-${dualRightEngine}-${ast?.id || ''}-${ast?.span.end || 0}-${selectedCandidateId || 'committed'}-${parseResult?.runSummary?.finalAstHash || ''}`;
    if (lastFittedAstIdRef.current !== astId) {
      lastFittedAstIdRef.current = astId;
      fitTreeToView();
    }
  }, [ast, layout, splitLayoutLeft, splitLayoutRight, astDiffMode, dualLeftEngine, dualRightEngine, selectedCandidateId, parseResult?.runSummary?.finalAstHash, fitTreeToView]);

  const nodeCount = useMemo(() => {
    if (!layout) return 0;
    return countNodes(layout.root);
  }, [layout]);

  // Memoize rendered tree links and nodes to eliminate SVG DOM re-allocations during pan/drag
  const treeLinks = useMemo(() => {
    if (!layout) return null;
    return renderTreeLinks(layout.root, isLight);
  }, [layout, isLight]);

  const treeNodes = useMemo(() => {
    if (!layout) return null;
    return renderTreeNodes(layout.root, activeNodeId, selectedNodeId, (node) => {
      setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
    }, isLight);
  }, [layout, activeNodeId, selectedNodeId, isLight]);

  // Memoize Dual Split Canvas links and nodes
  const splitLinksLeft = useMemo(() => {
    if (!splitLayoutLeft) return null;
    return renderTreeLinks(splitLayoutLeft.root, isLight);
  }, [splitLayoutLeft, isLight]);

  const splitNodesLeft = useMemo(() => {
    if (!splitLayoutLeft) return null;
    return renderTreeNodes(splitLayoutLeft.root, activeNodeIdLeft, selectedNodeId, (node) =>
      setSelectedNodeId((prev) => (prev === node.id ? null : node.id)),
      isLight
    );
  }, [splitLayoutLeft, activeNodeIdLeft, selectedNodeId, isLight]);

  const splitLinksRight = useMemo(() => {
    if (!splitLayoutRight) return null;
    return renderTreeLinks(splitLayoutRight.root, isLight);
  }, [splitLayoutRight, isLight]);

  const splitNodesRight = useMemo(() => {
    if (!splitLayoutRight) return null;
    return renderTreeNodes(splitLayoutRight.root, activeNodeIdRight, selectedNodeId, (node) =>
      setSelectedNodeId((prev) => (prev === node.id ? null : node.id)),
      isLight
    );
  }, [splitLayoutRight, activeNodeIdRight, selectedNodeId, isLight]);

  // Pointer drag panning with capture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
  };

  // Smooth pointer-centered zooming (zooms toward mouse cursor)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const targetElement = e.currentTarget as HTMLElement;
    const rect = targetElement ? targetElement.getBoundingClientRect() : containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.15 : 0.85);
    const newZoom = Math.max(0.15, Math.min(4.0, parseFloat((zoom * factor).toFixed(3))));
    if (newZoom === zoom) return;

    // Zoom centered at mouse pointer coordinates
    const scaleRatio = newZoom / zoom;
    const newPanX = mouseX - (mouseX - pan.x) * scaleRatio;
    const newPanY = mouseY - (mouseY - pan.y) * scaleRatio;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  return (
    <div ref={containerRef} className={`flex flex-col h-full ${isLight ? 'bg-slate-50' : 'bg-[#050814]'} relative overflow-hidden select-none`}>
      {/* Panel Header */}
      <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between z-10 shrink-0 gap-2 min-w-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <GitBranch className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <h2 className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-mono whitespace-nowrap shrink-0">
            <span className="hidden sm:inline">Recovered </span>AST Canvas
          </h2>

          {isLoading && (
            <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 shadow-sm animate-pulse whitespace-nowrap shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Computing counterfactual...</span>
            </div>
          )}

          {isCounterfactual && selectedCandidate ? (
            <div className="flex items-center gap-1.5 ml-2 shrink-0 whitespace-nowrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-600 shadow-sm flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <Ghost className="w-3 h-3 text-purple-600 dark:text-purple-400 animate-pulse shrink-0" />
                <span className="text-purple-800 dark:text-purple-300">Speculative Preview:</span>
                <span className="text-purple-950 dark:text-white">{formatCandidateAction(selectedCandidate)}</span>
              </span>
              <button
                onClick={() => applyCandidateSolution(selectedCandidate)}
                className="px-2.5 py-1 rounded text-[10px] font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1 cursor-pointer shadow-sm whitespace-nowrap shrink-0"
                title="Apply this speculative repair directly to code"
              >
                <Zap className="w-3 h-3 text-white fill-current shrink-0" />
                <span>Apply Solution</span>
              </button>
              <button
                onClick={() => selectCounterfactual(null)}
                className="px-2 py-1 rounded text-[10px] font-mono font-medium bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Exit counterfactual preview and restore committed AST"
              >
                <X className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>Exit Preview</span>
              </button>
            </div>
          ) : layout ? (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 ml-1 shrink-0 whitespace-nowrap">
              <span className="text-slate-400 dark:text-slate-600">•</span>
              <span className="text-slate-600 dark:text-slate-400 font-light">{nodeCount} nodes</span>
              {selectedNodeId && (
                <>
                  <span className="text-slate-400 dark:text-slate-600">•</span>
                  <span className="text-indigo-600 dark:text-indigo-300 font-medium">Focus #{selectedNodeId}</span>
                  <button
                    onClick={() => setSelectedNodeId(null)}
                    className="text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer px-1 py-0.2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Clear selected node highlight"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Pillar 3: Visual AST Diff Matrix Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-md border border-slate-200 dark:border-slate-800 text-[10px] font-mono shrink-0 whitespace-nowrap">
          <button
            onClick={() => setAstDiffMode('standard')}
            title="Standard AST Tree: View single parsed syntax tree"
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
              astDiffMode === 'standard'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
            }`}
          >
            <span className="hidden sm:inline">Standard</span>
            <span className="sm:hidden">Std</span>
          </button>
          <button
            onClick={() => setAstDiffMode('overlay')}
            title="AST Diff Matrix Overlay: Highlights intact nodes, purple healed ghost nodes, and red strike-through cascade-destroyed nodes"
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              astDiffMode === 'overlay'
                ? 'bg-purple-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
            }`}
          >
            <GitCompare className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Diff Matrix</span>
            <span className="sm:hidden whitespace-nowrap">Diff</span>
          </button>
          <button
            onClick={() => setAstDiffMode('split')}
            title="Dual-Tree Split Canvas: Synchronized side-by-side comparison of Healthy vs Collapsed syntax trees"
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              astDiffMode === 'split'
                ? 'bg-purple-600 text-white font-semibold shadow-sm'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
            }`}
          >
            <Columns className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Dual Split</span>
            <span className="sm:hidden whitespace-nowrap">Split</span>
          </button>
        </div>

        {/* Zoom & Export Controls HUD */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs shrink-0 whitespace-nowrap">
          <button
            onClick={() => setZoom((z) => Math.max(0.15, parseFloat((z - 0.2).toFixed(2))))}
            className="hover:text-slate-950 dark:hover:text-white p-0.5 cursor-pointer"
            title="Zoom Out (Scroll Down)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-12 text-center text-[10px] font-mono font-semibold text-sky-600 dark:text-sky-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(4.0, parseFloat((z + 0.2).toFixed(2))))}
            className="hover:text-slate-950 dark:hover:text-white p-0.5 cursor-pointer"
            title="Zoom In (Scroll Up)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitTreeToView}
            className="hover:text-slate-950 dark:hover:text-white ml-1 pl-1 border-l border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Fit Tree to View"
          >
            <Maximize2 className="w-3 h-3 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-white" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 40, y: 30 });
            }}
            className="hover:text-slate-950 dark:hover:text-white ml-0.5 cursor-pointer"
            title="Reset Pan & Zoom (100%)"
          >
            <RotateCcw className="w-3 h-3 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" />
          </button>

          {/* Export AST as Image Button */}
          <button
            onClick={exportAsPng}
            disabled={!layout && !splitLayoutLeft}
            className="ml-1 pl-1.5 border-l border-slate-200 dark:border-slate-700 hover:text-slate-950 dark:hover:text-white p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-mono font-medium flex items-center justify-center transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
            title="Export AST Image (PNG)"
            aria-label="Export AST Image (PNG)"
          >
            <Camera className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* Dual Split Canvas Mode vs Single Unified Canvas Mode */}
      {astDiffMode === 'split' ? (
        <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-slate-200 dark:divide-slate-800">
          {/* Left Split Canvas */}
          <div className={`flex-1 flex flex-col min-w-0 h-full relative ${isLight ? 'bg-slate-50' : 'bg-[#050814]'}`}>
            <div className={`px-3 py-1 flex items-center justify-between text-[10px] font-mono select-none ${
              dualLeftEngine === 'erdf'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/40'
                : dualLeftEngine === 'treesitter'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/40'
                : 'bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/40'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`font-bold flex items-center gap-1.5 ${
                  dualLeftEngine === 'erdf'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : dualLeftEngine === 'treesitter'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}>
                  {dualLeftEngine === 'erdf' && <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                  {dualLeftEngine === 'clang' && <Flame className="w-3 h-3 text-rose-600 dark:text-rose-400" />}
                  {dualLeftEngine === 'treesitter' && <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                  <span>
                    {dualLeftEngine === 'erdf'
                      ? 'Healthy Tree (ERDF Self-Healing)'
                      : dualLeftEngine === 'treesitter'
                      ? 'Spliced Tree (Tree-sitter Splicing)'
                      : 'Collapsed Tree (Clang Panic Mode)'}
                  </span>
                </span>
                <div className="flex items-center gap-0.5 bg-white/80 dark:bg-black/40 rounded p-0.5 border border-slate-300 dark:border-slate-700">
                  <button
                    onClick={() => handleSetDualLeft('erdf')}
                    className={`px-1.5 py-0.2 rounded text-[9px] cursor-pointer transition ${
                      dualLeftEngine === 'erdf'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    ERDF
                  </button>
                  <button
                    onClick={() => handleSetDualLeft('clang')}
                    className={`px-1.5 py-0.2 rounded text-[9px] cursor-pointer transition ${
                      dualLeftEngine === 'clang'
                        ? 'bg-rose-600 text-white font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Clang
                  </button>
                  <button
                    onClick={() => handleSetDualLeft('treesitter')}
                    className={`px-1.5 py-0.2 rounded text-[9px] cursor-pointer transition ${
                      dualLeftEngine === 'treesitter'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Tree-sitter
                  </button>
                </div>
              </div>
              <span className={`px-1.5 py-0.2 rounded border text-[9px] ${
                dualLeftEngine === 'erdf'
                  ? 'text-emerald-700 dark:text-emerald-400/80 bg-emerald-100/60 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800/80'
                  : dualLeftEngine === 'treesitter'
                  ? 'text-amber-700 dark:text-amber-400/80 bg-amber-100/60 dark:bg-amber-950 border-amber-300 dark:border-amber-800/80'
                  : 'text-rose-700 dark:text-rose-400/80 bg-rose-100/60 dark:bg-rose-950 border-rose-300 dark:border-rose-800/80'
              }`}>
                {dualLeftEngine === 'erdf'
                  ? '100% AST Preserved'
                  : dualLeftEngine === 'treesitter'
                  ? `${comparativeShowdown?.treesitter?.astPreservationIndex ?? 75}% AST Preserved`
                  : `${comparativeShowdown?.clang?.astPreservationIndex ?? 35}% AST Preserved`}
              </span>
            </div>
            <div
              className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            >
              {splitLayoutLeft ? (
                <svg className="ast-tree-svg w-full h-full block overflow-hidden">
                  <defs>
                    <pattern id="dotGridSplit1" width="24" height="24" patternUnits="userSpaceOnUse">
                      <circle cx="2" cy="2" r="1" fill={isLight ? '#cbd5e1' : '#1e293b'} opacity={isLight ? '0.8' : '0.6'} />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#dotGridSplit1)" pointerEvents="none" />
                  <g className="ast-transform-root" transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    <g className="links">{splitLinksLeft}</g>
                    <g className="nodes">{splitNodesLeft}</g>
                  </g>
                </svg>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs">
                  No syntax tree
                </div>
              )}
            </div>
          </div>

          {/* Right Split Canvas */}
          <div className={`flex-1 flex flex-col min-w-0 h-full relative ${isLight ? 'bg-slate-100/50' : 'bg-[#060610]'}`}>
            <div className={`px-3 py-1 flex items-center justify-between text-[10px] font-mono select-none ${
              dualRightEngine === 'erdf'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/40'
                : dualRightEngine === 'treesitter'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/40'
                : 'bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/40'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`font-bold flex items-center gap-1.5 ${
                  dualRightEngine === 'erdf'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : dualRightEngine === 'treesitter'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}>
                  {dualRightEngine === 'erdf' && <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                  {dualRightEngine === 'clang' && <Flame className="w-3 h-3 text-rose-600 dark:text-rose-400" />}
                  {dualRightEngine === 'treesitter' && <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                  <span>
                    {selectedCandidate && dualRightEngine === 'erdf'
                      ? `Counterfactual Tree (${formatCandidateAction(selectedCandidate)})`
                      : dualRightEngine === 'treesitter'
                      ? 'Spliced Tree (Tree-sitter Splicing)'
                      : dualRightEngine === 'clang'
                      ? 'Collapsed Tree (Clang Panic Mode)'
                      : 'Healthy Tree (ERDF Self-Healing)'}
                  </span>
                </span>
                <div className="flex items-center gap-0.5 bg-white/80 dark:bg-black/40 rounded p-0.5 border border-slate-300 dark:border-slate-700">
                  <button
                    onClick={() => handleSetDualRight('erdf')}
                    className={`px-1.5 py-0.2 rounded text-[9px] cursor-pointer transition ${
                      dualRightEngine === 'erdf'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    ERDF
                  </button>
                  <button
                    onClick={() => handleSetDualRight('clang')}
                    className={`px-1.5 py-0.2 rounded text-[9px] cursor-pointer transition ${
                      dualRightEngine === 'clang'
                        ? 'bg-rose-600 text-white font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Clang
                  </button>
                  <button
                    onClick={() => handleSetDualRight('treesitter')}
                    className={`px-1.5 py-0.2 rounded text-[9px] cursor-pointer transition ${
                      dualRightEngine === 'treesitter'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Tree-sitter
                  </button>
                </div>
              </div>
              <span className={`px-1.5 py-0.2 rounded border text-[9px] ${
                dualRightEngine === 'erdf'
                  ? 'text-emerald-700 dark:text-emerald-400/80 bg-emerald-100/60 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800/80'
                  : dualRightEngine === 'treesitter'
                  ? 'text-amber-700 dark:text-amber-400/80 bg-amber-100/60 dark:bg-amber-950 border-amber-300 dark:border-amber-800/80'
                  : 'text-rose-700 dark:text-rose-400/80 bg-rose-100/60 dark:bg-rose-950 border-rose-300 dark:border-rose-800/80'
              }`}>
                {selectedCandidate && dualRightEngine === 'erdf'
                  ? `${activeBlastRadius?.astPreservationIndex ?? 45}% AST Preserved`
                  : dualRightEngine === 'treesitter'
                  ? `${comparativeShowdown?.treesitter?.astPreservationIndex ?? 75}% AST Preserved`
                  : dualRightEngine === 'clang'
                  ? `${comparativeShowdown?.clang?.astPreservationIndex ?? 35}% AST Preserved`
                  : '100% AST Preserved'}
              </span>
            </div>
            <div
              className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            >
              {splitLayoutRight ? (
                <svg className="ast-tree-svg w-full h-full block overflow-hidden">
                  <defs>
                    <pattern id="dotGridSplit2" width="24" height="24" patternUnits="userSpaceOnUse">
                      <circle cx="2" cy="2" r="1" fill={isLight ? '#cbd5e1' : '#1e293b'} opacity={isLight ? '0.8' : '0.6'} />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#dotGridSplit2)" pointerEvents="none" />
                  <g className="ast-transform-root" transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    <g className="links">{splitLinksRight}</g>
                    <g className="nodes">{splitNodesRight}</g>
                  </g>
                </svg>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs">
                  No syntax tree
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* SVG Canvas with Dot Grid Background */
        <div
          className={`flex-1 w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden ${isLight ? 'bg-slate-50' : 'bg-[#050814]'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          {layout ? (
            <svg className="ast-tree-svg w-full h-full block overflow-hidden">
              <defs>
                <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1" fill={isLight ? '#cbd5e1' : '#1e293b'} opacity={isLight ? '0.8' : '0.6'} />
                </pattern>
                <filter id="nodeShadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={isLight ? '#0f172a' : '#000000'} floodOpacity={isLight ? '0.1' : '0.4'} />
                </filter>
                {/* Vibrant active glowing halo for node currently active in replay step */}
                <filter id="activeGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Seamless Background Dot Grid spanning 100% of viewport */}
              <rect width="100%" height="100%" fill="url(#dotGrid)" pointerEvents="none" />

              {/* Transform Group: Pan & Zoom applied to elements, NEVER to the SVG tag */}
              <g className="ast-transform-root" transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Draw Links */}
                <g className="links">{treeLinks}</g>

                {/* Draw Nodes (with active step glowing node highlighted) */}
                <g className="nodes">{treeNodes}</g>
              </g>
            </svg>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs">
              No syntax tree generated.
            </div>
          )}
        </div>
      )}

      {/* Floating Selected Node Details HUD */}
      {selectedNodeData && (
        <div className="absolute bottom-12 right-4 z-20 max-w-sm bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700/80 rounded-lg p-3 shadow-xl font-mono text-xs text-slate-800 dark:text-slate-200 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-1.5 mb-2">
            <span className="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500 dark:bg-sky-400" />
              <span>{selectedNodeData.kind}</span>
            </span>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="text-slate-400 hover:text-slate-800 dark:hover:text-white p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="Close inspector"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Label:</span>
              <span className="text-slate-900 dark:text-white font-semibold">{selectedNodeData.label}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Status:</span>
              <span
                className={
                  selectedNodeData.repairIds?.includes('clang-panic')
                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                    : selectedNodeData.repairIds?.includes('treesitter-spliced')
                    ? 'text-amber-600 dark:text-amber-400 font-bold'
                    : selectedNodeData.provenance === 'recovered'
                    ? 'text-purple-600 dark:text-purple-400 font-bold'
                    : 'text-emerald-600 dark:text-emerald-400 font-bold'
                }
              >
                {selectedNodeData.repairIds?.includes('clang-panic')
                  ? 'Clang Panic Collapsed'
                  : selectedNodeData.repairIds?.includes('treesitter-spliced')
                  ? 'Tree-sitter Spliced (ERROR)'
                  : selectedNodeData.provenance === 'recovered'
                  ? 'ERDF Ghost Healed'
                  : 'Source Syntax'}
              </span>
            </div>
            {selectedNodeData.span && (
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Span:</span>
                <span className="text-slate-700 dark:text-slate-300">
                  Ln {selectedNodeData.span.line}, Col {selectedNodeData.span.column} ({selectedNodeData.span.start}..{selectedNodeData.span.end})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend Footer */}
      <div className="px-3 py-1 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 font-mono z-10 shrink-0 whitespace-nowrap overflow-x-auto scrollbar-none gap-4">
        <div className="flex items-center gap-4 shrink-0 whitespace-nowrap">
          <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2.5 h-2.5 rounded bg-sky-100 dark:bg-sky-950 border border-sky-500 dark:border-sky-400 inline-block shadow-sm" />
            <span className="text-slate-700 dark:text-slate-300">Source Node</span>
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2.5 h-2.5 rounded bg-purple-100 dark:bg-purple-950 border border-purple-500 dark:border-purple-400 border-dashed inline-block shadow-sm" />
            <span className="text-purple-700 dark:text-purple-300 font-medium">Ghost (Healed)</span>
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2.5 h-2.5 rounded bg-amber-100 dark:bg-amber-950 border border-amber-500 dark:border-amber-400 inline-block shadow-sm" />
            <span className="text-amber-700 dark:text-amber-300 font-medium">Spliced (ERROR)</span>
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2.5 h-2.5 rounded bg-rose-100 dark:bg-rose-950 border border-rose-500 border-dashed inline-block shadow-sm" />
            <span className="text-rose-700 dark:text-rose-300 line-through font-medium">Cascade-Destroyed</span>
          </span>
        </div>
        <span className="text-slate-500 shrink-0 whitespace-nowrap">Pan: drag • Zoom: wheel / buttons (up to 400%)</span>
      </div>
    </div>
  );
};

function renderTreeLinks(node: LayoutNode, isLight = false): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const linkStroke = isLight ? '#94a3b8' : '#334155';

  for (const child of node.children) {
    const parentBottomX = node.x + node.width / 2;
    const parentBottomY = node.y + node.height;
    const childTopX = child.x + child.width / 2;
    const childTopY = child.y;

    const midY = (parentBottomY + childTopY) / 2;
    const pathData = `M ${parentBottomX} ${parentBottomY} C ${parentBottomX} ${midY}, ${childTopX} ${midY}, ${childTopX} ${childTopY}`;

    elements.push(
      <path
        key={`link-${node.id}-${child.id}-${node.x}-${child.x}`}
        d={pathData}
        fill="none"
        stroke={linkStroke}
        strokeWidth="1.5"
        strokeDasharray="none"
      />
    );

    elements.push(...renderTreeLinks(child, isLight));
  }

  return elements;
}

function countNodes(node: LayoutNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

function renderTreeNodes(
  node: LayoutNode,
  activeNodeId?: string | null,
  selectedNodeId?: string | null,
  onNodeClick?: (node: LayoutNode) => void,
  isLight = false
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  const isCascadeDestroyed = Boolean(
    node.repairIds?.includes('diff-destroyed') ||
    node.repairIds?.includes('clang-panic')
  );
  const isSpliced = Boolean(
    node.repairIds?.includes('treesitter-spliced') ||
    node.label.includes('ERROR') ||
    (node.kind === 'PartialNode' && (node as any).attemptedConstruct === 'ERROR')
  );
  const isGhost = node.provenance === 'recovered' && !isCascadeDestroyed;
  const isPartial = node.provenance === 'partial' && !isCascadeDestroyed && !isSpliced;
  const isActive = Boolean(activeNodeId && node.id === activeNodeId);
  const isSelected = Boolean(selectedNodeId && node.id === selectedNodeId);

  let fill = isLight ? '#ffffff' : '#0a1120';
  let stroke = isLight ? '#0284c7' : '#0284c7';
  let strokeDasharray = 'none';
  let textColor = isLight ? '#0f172a' : '#f8fafc';

  if (isCascadeDestroyed) {
    fill = isLight ? '#fff1f2' : '#450a0a';
    stroke = isLight ? '#e11d48' : '#f43f5e';
    strokeDasharray = '4 3';
    textColor = isLight ? '#9f1239' : '#fecdd3';
  } else if (isSpliced) {
    fill = isLight ? '#fffbeb' : '#451a03';
    stroke = isLight ? '#d97706' : '#f59e0b';
    strokeDasharray = '4 3';
    textColor = isLight ? '#92400e' : '#fef3c7';
  } else if (isActive) {
    fill = isLight ? '#f0f9ff' : '#0c2340';
    stroke = isLight ? '#0284c7' : '#38bdf8';
    textColor = isLight ? '#0c4a6e' : '#ffffff';
  } else if (isSelected) {
    fill = isLight ? '#eef2ff' : '#1e1b4b';
    stroke = isLight ? '#4f46e5' : '#818cf8';
    textColor = isLight ? '#312e81' : '#ffffff';
  } else if (isGhost) {
    fill = isLight ? '#faf5ff' : '#2e1065';
    stroke = isLight ? '#9333ea' : '#c084fc';
    strokeDasharray = '4 3';
    textColor = isLight ? '#6b21a8' : '#f3e8ff';
  } else if (isPartial) {
    fill = isLight ? '#fffbeb' : '#451a03';
    stroke = isLight ? '#d97706' : '#f59e0b';
    textColor = isLight ? '#92400e' : '#fef3c7';
  }

  const displayLabel =
    node.label.length > 17 ? node.label.slice(0, 15) + '…' : node.label;

  elements.push(
    <g
      key={`node-${node.id}-${node.x}-${node.y}`}
      transform={`translate(${node.x}, ${node.y})`}
      className="cursor-pointer transition-transform hover:scale-105"
      filter="url(#nodeShadow)"
      onClick={(e) => {
        e.stopPropagation();
        onNodeClick?.(node);
      }}
    >
      <title>{`${node.label}\nKind: ${node.kind}\nProvenance: ${node.provenance}${
        isCascadeDestroyed ? '\n[CASCADE-DESTROYED BY AVALANCHE]' : ''
      }${isActive ? '\n[ACTIVE REPLAY STEP]' : ''}${isSelected ? '\n[SELECTED]' : ''}`}</title>

      {/* Active or Selected Glowing Ring */}
      {(isActive || isSelected) && (
        <rect
          x={-5}
          y={-5}
          width={node.width + 10}
          height={node.height + 10}
          rx="12"
          fill="none"
          stroke={isActive ? (isLight ? '#0284c7' : '#38bdf8') : (isLight ? '#4f46e5' : '#818cf8')}
          strokeWidth={isActive ? '2.5' : '2'}
          filter="url(#activeGlow)"
          className={isActive ? 'animate-pulse' : ''}
        />
      )}

      <rect
        width={node.width}
        height={node.height}
        rx="8"
        fill={fill}
        stroke={stroke}
        strokeWidth={isCascadeDestroyed ? '2' : isActive || isSelected ? '2.5' : '1.5'}
        strokeDasharray={strokeDasharray}
        className={isCascadeDestroyed ? 'animate-pulse' : ''}
      />

      {/* Active Step Indicator Pill Badge */}
      {isActive && !isCascadeDestroyed && (
        <g transform={`translate(${node.width - 34}, -7)`}>
          <rect
            width="38"
            height="14"
            rx="7"
            fill="#0284c7"
            stroke={isLight ? '#0369a1' : '#38bdf8'}
            strokeWidth="1"
          />
          <text
            x="19"
            y="10"
            textAnchor="middle"
            fontSize="8"
            fontWeight="bold"
            fill="#ffffff"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            ACTIVE
          </text>
        </g>
      )}

      {/* Cascade-Destroyed Pill Badge */}
      {isCascadeDestroyed && (
        <g transform={`translate(${node.width - 58}, -7)`}>
          <rect
            width="60"
            height="14"
            rx="7"
            fill={isLight ? '#fee2e2' : '#881337'}
            stroke={isLight ? '#e11d48' : '#f43f5e'}
            strokeWidth="1"
          />
          <text
            x="30"
            y="10"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="bold"
            fill={isLight ? '#9f1239' : '#fecdd3'}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            COLLAPSED
          </text>
        </g>
      )}

      {/* Spliced (ERROR) Pill Badge */}
      {isSpliced && !isCascadeDestroyed && (
        <g transform={`translate(${node.width - 56}, -7)`}>
          <rect
            width="58"
            height="14"
            rx="7"
            fill={isLight ? '#fef3c7' : '#78350f'}
            stroke={isLight ? '#d97706' : '#f59e0b'}
            strokeWidth="1"
          />
          <text
            x="29"
            y="10"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="bold"
            fill={isLight ? '#92400e' : '#fef3c7'}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            SPLICED
          </text>
        </g>
      )}

      {/* Ghost Healed Pill Badge */}
      {isGhost && (
        <g transform={`translate(${node.width - 48}, -7)`}>
          <rect
            width="50"
            height="14"
            rx="7"
            fill={isLight ? '#f3e8ff' : '#581c87'}
            stroke={isLight ? '#9333ea' : '#c084fc'}
            strokeWidth="1"
          />
          <text
            x="25"
            y="10"
            textAnchor="middle"
            fontSize="8"
            fontWeight="bold"
            fill={isLight ? '#6b21a8' : '#f3e8ff'}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            HEALED
          </text>
        </g>
      )}

      {/* Label in JetBrains Mono */}
      <text
        x={node.width / 2}
        y={20}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill={textColor}
        style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.01em' }}
      >
        {displayLabel}
      </text>

      {/* Red strike-through line for cascade-destroyed nodes */}
      {isCascadeDestroyed && (
        <line
          x1={8}
          y1={17}
          x2={node.width - 8}
          y2={17}
          stroke={isLight ? '#e11d48' : '#f43f5e'}
          strokeWidth="2"
        />
      )}

      {/* Node Kind in JetBrains Mono */}
      <text
        x={node.width / 2}
        y={35}
        textAnchor="middle"
        fontSize="9"
        fontWeight="400"
        fill={
          isCascadeDestroyed
            ? (isLight ? '#e11d48' : '#fda4af')
            : isActive
            ? (isLight ? '#0284c7' : '#7dd3fc')
            : isSelected
            ? (isLight ? '#4f46e5' : '#a5b4fc')
            : (isLight ? '#64748b' : '#94a3b8')
        }
        style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.02em' }}
      >
        {node.kind}
      </text>

      {isGhost && (
        <g transform="translate(6, 6)">
          <Ghost size={11} color={isLight ? '#9333ea' : '#c084fc'} />
        </g>
      )}

      {isPartial && (
        <g transform="translate(6, 6)">
          <AlertTriangle size={11} color={isLight ? '#d97706' : '#f59e0b'} />
        </g>
      )}
    </g>
  );

  for (const child of node.children) {
    elements.push(
      ...renderTreeNodes(child, activeNodeId, selectedNodeId, onNodeClick, isLight)
    );
  }

  return elements;
}

/**
 * Recursively searches tree layout to find the deepest/innermost AST node
 * spanning a specific token's SourceSpan.
 */
function findInnermostNodeAtSpan(
  node: LayoutNode,
  span: SourceSpan
): LayoutNode | null {
  if (!node.span) return null;
  const overlaps =
    Math.max(node.span.start, span.start) <= Math.min(node.span.end, span.end);
  if (!overlaps) return null;

  for (const child of node.children) {
    const deeper = findInnermostNodeAtSpan(child, span);
    if (deeper) return deeper;
  }
  return node;
}

function findNodeByIdOrPrefix(node: LayoutNode, id: string): LayoutNode | null {
  if (
    node.id === id ||
    node.id === `clang-${id}` ||
    node.id === `ts-${id}` ||
    node.id.startsWith(`clang-${id}-`) ||
    node.id.startsWith(`ts-${id}-`)
  ) {
    return node;
  }
  for (const child of node.children) {
    const found = findNodeByIdOrPrefix(child, id);
    if (found) return found;
  }
  return null;
}

function resolveActiveNodeId(
  targetLayout: { root: LayoutNode } | null,
  currentSequence: number,
  parseResult: any,
  currentState: any
): string | null {
  if (!targetLayout || currentSequence <= 0 || !parseResult) return null;
  const events = parseResult.events;
  const currentEvent = events[currentSequence - 1];
  if (!currentEvent) return null;
  if (currentEvent.type === 'NodeCreated' && currentEvent.payload?.nodeId) {
    const rawId = currentEvent.payload.nodeId;
    const matched = findNodeByIdOrPrefix(targetLayout.root, rawId);
    if (matched) return matched.id;
  }
  if (currentEvent.type === 'TokenConsumed' && currentEvent.payload?.token?.span) {
    const matched = findInnermostNodeAtSpan(targetLayout.root, currentEvent.payload.token.span);
    if (matched) return matched.id;
  }
  if (currentEvent.payload?.actualToken?.span) {
    const matched = findInnermostNodeAtSpan(targetLayout.root, currentEvent.payload.actualToken.span);
    if (matched) return matched.id;
  }
  if (currentState?.tokens && currentState.cursor < currentState.tokens.length) {
    const curToken = currentState.tokens[currentState.cursor];
    if (curToken?.span) {
      const matched = findInnermostNodeAtSpan(targetLayout.root, curToken.span);
      if (matched) return matched.id;
    }
  }
  return null;
}

/**
 * Traverses an AST resulting from a counterfactual repair preview and highlights
 * all nodes affected by or corresponding to the speculative repair edits.
 */
function markCounterfactualNodes(
  ast: ProgramNode,
  edits: readonly Edit[],
  tokens: readonly Token[]
): ProgramNode {
  if (!edits || edits.length === 0) return ast;

  const editSpans: SourceSpan[] = [];
  for (const edit of edits) {
    if (edit.deletedToken?.span) {
      editSpans.push(edit.deletedToken.span);
    }
    if (edit.token?.span) {
      editSpans.push(edit.token.span);
    }
    if (edit.position < tokens.length && tokens[edit.position]?.span) {
      editSpans.push(tokens[edit.position].span);
    }
  }

  function overlaps(nodeSpan: SourceSpan): boolean {
    return editSpans.some(
      (es) => Math.max(nodeSpan.start, es.start) <= Math.min(nodeSpan.end, es.end)
    );
  }

  function transformNode(node: any): any {
    if (!node || typeof node !== 'object') return node;

    const isTarget = node.span && overlaps(node.span);
    const updatedProvenance = isTarget ? 'recovered' : node.provenance || 'source';

    const copy = { ...node, provenance: updatedProvenance };

    for (const key of Object.keys(copy)) {
      if (key === 'provenance' || key === 'span' || key === 'repairIds') continue;
      const val = copy[key];
      if (Array.isArray(val)) {
        copy[key] = val.map((item) =>
          item && typeof item === 'object' && 'kind' in item ? transformNode(item) : item
        );
      } else if (val && typeof val === 'object' && 'kind' in val) {
        copy[key] = transformNode(val);
      }
    }

    return copy;
  }

  return transformNode(ast) as ProgramNode;
}

/**
 * Transforms a healthy AST into an AST Diff Matrix by tagging downstream
 * nodes corrupted or discarded by panic mode with 'diff-destroyed'.
 */
function markDiffAst(
  healthyAst: ProgramNode,
  destroyedSpans: readonly SourceSpan[]
): ProgramNode {
  if (!destroyedSpans || destroyedSpans.length === 0) return healthyAst;

  function isSpanDestroyed(nodeSpan: SourceSpan): boolean {
    return destroyedSpans.some((d) => {
      const dEnd = d.end > d.start ? d.end : d.start + 1;
      return nodeSpan.start < dEnd && nodeSpan.end > d.start;
    });
  }

  function transformNode(node: any): any {
    if (!node || typeof node !== 'object') return node;

    const isDestroyed = node.span && node.kind !== 'Program' && isSpanDestroyed(node.span);
    const updatedRepairIds = isDestroyed
      ? [...(node.repairIds || []), 'diff-destroyed']
      : node.repairIds || [];
    const updatedProvenance = isDestroyed ? 'partial' : node.provenance || 'source';

    const copy = { ...node, provenance: updatedProvenance, repairIds: updatedRepairIds };

    for (const key of Object.keys(copy)) {
      if (key === 'provenance' || key === 'span' || key === 'repairIds') continue;
      const val = copy[key];
      if (Array.isArray(val)) {
        copy[key] = val.map((item) =>
          item && typeof item === 'object' && 'kind' in item ? transformNode(item) : item
        );
      } else if (val && typeof val === 'object' && 'kind' in val) {
        copy[key] = transformNode(val);
      }
    }

    return copy;
  }

  return transformNode(healthyAst) as ProgramNode;
}

