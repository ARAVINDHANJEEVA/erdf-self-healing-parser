/**
 * Hierarchical tree layout calculation for SVG AST rendering.
 * Computes deterministic (x, y) coordinates and cubic Bezier link paths.
 */

import { AstNode } from '../../language/ast';
import { SourceSpan } from '../../language/types';

export interface LayoutNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly provenance: 'source' | 'recovered' | 'partial';
  readonly repairIds: readonly string[];
  readonly span?: SourceSpan;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly children: readonly LayoutNode[];
}

export interface TreeLayoutResult {
  readonly root: LayoutNode;
  readonly width: number;
  readonly height: number;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 48;
const HORIZONTAL_SPACING = 30;
const VERTICAL_SPACING = 55;

interface MutableLayoutNode {
  id: string;
  label: string;
  kind: string;
  provenance: 'source' | 'recovered' | 'partial';
  repairIds: readonly string[];
  span?: SourceSpan;
  relX: number;
  width: number;
  height: number;
  children: MutableLayoutNode[];
}

interface Contour {
  levels: { minX: number; maxX: number }[];
}

function shiftSubtree(node: MutableLayoutNode, dx: number): void {
  node.relX += dx;
  for (const child of node.children) {
    shiftSubtree(child, dx);
  }
}

function layoutSubtree(node: AstNode): { layout: MutableLayoutNode; contour: Contour } {
  const rawChildren = getChildren(node).filter((c, idx, arr) => c && arr.indexOf(c) === idx);
  const label = getNodeLabel(node);

  if (rawChildren.length === 0) {
    const leaf: MutableLayoutNode = {
      id: node.id,
      label,
      kind: node.kind,
      provenance: node.provenance,
      repairIds: node.repairIds || [],
      span: node.span,
      relX: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      children: [],
    };
    return {
      layout: leaf,
      contour: { levels: [{ minX: 0, maxX: NODE_WIDTH }] },
    };
  }

  const childResults = rawChildren.map((c) => layoutSubtree(c));
  const children: MutableLayoutNode[] = [];
  const combinedContour: Contour = { levels: [] };

  for (let i = 0; i < childResults.length; i++) {
    const { layout: childLayout, contour: childContour } = childResults[i];

    if (i === 0) {
      children.push(childLayout);
      combinedContour.levels = childContour.levels.map((l) => ({ ...l }));
    } else {
      let shift = 0;

      // 1. Guarantee minimum horizontal separation between adjacent sibling roots
      const prevChild = children[i - 1];
      const minRootShift =
        prevChild.relX + NODE_WIDTH + HORIZONTAL_SPACING - childLayout.relX;
      if (minRootShift > shift) {
        shift = minRootShift;
      }

      // 2. Guarantee separation across all overlapping depth levels between this subtree and preceding siblings
      const maxDepth = Math.min(
        combinedContour.levels.length,
        childContour.levels.length
      );
      for (let d = 0; d < maxDepth; d++) {
        const prevRight = combinedContour.levels[d].maxX;
        const curLeft = childContour.levels[d].minX;
        const required = prevRight + HORIZONTAL_SPACING - curLeft;
        if (required > shift) {
          shift = required;
        }
      }

      // 3. Guarantee that deeper levels in childLayout clear preceding siblings
      if (childContour.levels.length > combinedContour.levels.length && combinedContour.levels.length > 0) {
        const prevDeepestRight = combinedContour.levels[combinedContour.levels.length - 1].maxX;
        for (let d = combinedContour.levels.length; d < childContour.levels.length; d++) {
          const curLeft = childContour.levels[d].minX;
          const required = prevDeepestRight + HORIZONTAL_SPACING - curLeft;
          if (required > shift) {
            shift = required;
          }
        }
      }

      // Shift child and all its descendants by computed offset
      shiftSubtree(childLayout, shift);

      // Merge child's shifted contour into combinedContour
      for (let d = 0; d < childContour.levels.length; d++) {
        const shiftedMin = childContour.levels[d].minX + shift;
        const shiftedMax = childContour.levels[d].maxX + shift;
        if (d < combinedContour.levels.length) {
          combinedContour.levels[d].minX = Math.min(
            combinedContour.levels[d].minX,
            shiftedMin
          );
          combinedContour.levels[d].maxX = Math.max(
            combinedContour.levels[d].maxX,
            shiftedMax
          );
        } else {
          combinedContour.levels.push({ minX: shiftedMin, maxX: shiftedMax });
        }
      }

      children.push(childLayout);
    }
  }

  // Parent is centered over first and last child
  const firstChildX = children[0].relX;
  const lastChildX = children[children.length - 1].relX;
  const parentMidX = Math.round((firstChildX + lastChildX) / 2);

  const parentNode: MutableLayoutNode = {
    id: node.id,
    label,
    kind: node.kind,
    provenance: node.provenance,
    repairIds: node.repairIds || [],
    span: node.span,
    relX: parentMidX,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    children,
  };

  const parentContour: Contour = {
    levels: [
      { minX: parentMidX, maxX: parentMidX + NODE_WIDTH },
      ...combinedContour.levels,
    ],
  };

  return { layout: parentNode, contour: parentContour };
}

export function computeTreeLayout(astNode: AstNode): TreeLayoutResult {
  const { layout: rootLayout } = layoutSubtree(astNode);

  // Normalize horizontal origin to prevent negative coordinates
  let minX = Infinity;
  function findMinX(n: MutableLayoutNode) {
    if (n.relX < minX) minX = n.relX;
    for (const c of n.children) findMinX(c);
  }
  findMinX(rootLayout);

  const offsetX = minX < 20 ? 20 - minX : 20;
  const offsetY = 20;

  function assignFinalCoordinates(n: MutableLayoutNode, depth: number): LayoutNode {
    const x = Math.round(n.relX + offsetX);
    const y = Math.round(depth * (NODE_HEIGHT + VERTICAL_SPACING) + offsetY);
    const mappedChildren = n.children.map((c) => assignFinalCoordinates(c, depth + 1));
    return {
      id: n.id,
      label: n.label,
      kind: n.kind,
      provenance: n.provenance,
      repairIds: n.repairIds,
      span: n.span,
      x,
      y,
      width: n.width,
      height: n.height,
      children: mappedChildren,
    };
  }

  const root = assignFinalCoordinates(rootLayout, 0);

  // Compute bounding box
  let maxX = 0;
  let maxY = 0;
  function traverseBounds(n: LayoutNode) {
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
    for (const c of n.children) traverseBounds(c);
  }
  traverseBounds(root);

  return {
    root,
    width: maxX + 60,
    height: maxY + 60,
  };
}

function getChildren(node: AstNode): AstNode[] {
  switch (node.kind) {
    case 'Program':
      return [...node.body];
    case 'LetDeclaration':
      return node.initializer ? [node.identifier, node.initializer] : [node.identifier];
    case 'VariableDeclaration':
      return (node as any).initializer
        ? [(node as any).identifier, (node as any).initializer]
        : [(node as any).identifier];
    case 'FunctionDeclaration': {
      const list: AstNode[] = [];
      if ((node as any).name) list.push((node as any).name);
      if (Array.isArray((node as any).parameters)) {
        for (const p of (node as any).parameters) {
          if (p && !list.includes(p)) list.push(p);
        }
      }
      if ((node as any).body && !list.includes((node as any).body)) {
        list.push((node as any).body);
      }
      return list;
    }
    case 'Parameter':
      return [(node as any).name];
    case 'ReturnStatement':
      return (node as any).value ? [(node as any).value] : [];
    case 'ForStatement': {
      const parts: AstNode[] = [];
      if ((node as any).initializer) parts.push((node as any).initializer);
      if ((node as any).condition) parts.push((node as any).condition);
      if ((node as any).increment) parts.push((node as any).increment);
      if ((node as any).body) parts.push((node as any).body);
      return parts;
    }
    case 'PreprocessorDirective':
      return [];
    case 'IfStatement':
      return node.elseBranch
        ? [node.condition, node.thenBranch, node.elseBranch]
        : [node.condition, node.thenBranch];
    case 'WhileStatement':
      return [node.condition, node.body];
    case 'BlockStatement':
      return [...node.statements];
    case 'ExpressionStatement':
      return [node.expression];
    case 'BinaryExpression':
      return [node.left, node.right];
    case 'UnaryExpression':
      return [node.operand];
    case 'AssignmentExpression': {
      const parts: AstNode[] = [];
      if ((node as any).assignee) parts.push((node as any).assignee);
      if ((node as any).value) parts.push((node as any).value);
      return parts;
    }
    case 'CallExpression':
      return [node.callee, ...node.arguments];
    case 'GroupExpression':
      return [node.expression];
    case 'PartialNode':
      return [...(node.partiallyParsedChildren as AstNode[])];
    case 'LiteralNode':
    case 'IdentifierNode':
    default:
      return [];
  }
}

function getNodeLabel(node: AstNode): string {
  switch (node.kind) {
    case 'Program':
      return 'Program';
    case 'LetDeclaration':
      return `let ${node.identifier.name}`;
    case 'VariableDeclaration':
      return `${(node as any).typeSpecifier || 'var'} ${(node as any).identifier?.name || ''}`;
    case 'FunctionDeclaration':
      return `fn ${(node as any).returnType || 'void'} ${(node as any).name?.name || 'main'}()`;
    case 'Parameter':
      return `${(node as any).typeSpecifier || 'type'} ${(node as any).name?.name || ''}`;
    case 'ReturnStatement':
      return 'return ...;';
    case 'ForStatement':
      return 'for (...)';
    case 'PreprocessorDirective':
      return `${(node as any).directive || '#include'}`;
    case 'IfStatement':
      return 'if (...)';
    case 'WhileStatement':
      return 'while (...)';
    case 'BlockStatement':
      return '{ ... }';
    case 'ExpressionStatement':
      return 'expr;';
    case 'BinaryExpression':
      return `Binary (${node.operator})`;
    case 'UnaryExpression':
      return `Unary (${node.operator})`;
    case 'AssignmentExpression':
      return `Assign (${node.assignee.name})`;
    case 'CallExpression':
      return 'Call(...)';
    case 'LiteralNode':
      return `Literal: ${node.raw}`;
    case 'IdentifierNode':
      return `Ident: ${node.name}`;
    case 'GroupExpression':
      return '( ... )';
    case 'PartialNode':
      if (node.attemptedConstruct === 'ERROR') return '(ERROR) Spliced';
      if (node.attemptedConstruct === 'panic_discarded_region') return 'Panic Discarded';
      return `Partial: ${node.attemptedConstruct}`;
    default:
      return (node as any).kind || 'Node';
  }
}
