import React, { useState, useMemo } from 'react';
import { useReplayStore } from '../../state/replayStore';
import {
  Database,
  Search,
  Code2,
  Variable,
  Layers,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

export interface CodeSymbolItem {
  id: string;
  name: string;
  kind: 'variable' | 'function' | 'parameter' | 'builtin' | 'undeclared';
  typeSpecifier: string;
  scopeName: string;
  scopeKind: string;
  line: number;
  column: number;
  usages: number;
  status: 'declared' | 'builtin' | 'undeclared';
  isShadowed?: boolean;
}

export interface SymbolTableViewProps {
  onJumpToLine?: (line: number) => void;
}

export function extractCodeSymbols(
  semanticResult: ReturnType<typeof useReplayStore.getState>['semanticResult'],
  tokens: readonly any[]
): CodeSymbolItem[] {
  if (!semanticResult) return [];

  // Count occurrences of lexemes across all code tokens (IDENT, types, keywords, etc.)
  const tokenCounts = new Map<string, number>();
  for (const t of tokens) {
    if (t.kind !== 'EOF' && t.kind !== 'COMMENT') {
      tokenCounts.set(t.lexeme, (tokenCounts.get(t.lexeme) || 0) + 1);
    }
  }

  const items: CodeSymbolItem[] = [];
  const seenIds = new Set<string>();

  // 1. Extract symbols across all scopes that were declared in user code or used builtins
  for (const scope of semanticResult.allScopes) {
    for (const [name, sym] of scope.symbols.entries()) {
      const isBuiltin =
        sym.id.startsWith('builtin') || (sym.span.start === 0 && sym.span.end === 0);

      if (isBuiltin) {
        // Built-in symbol: ONLY include if it is actually used/referenced in the code!
        const usages = tokenCounts.get(name) || 0;
        if (usages > 0 && !seenIds.has(sym.id)) {
          seenIds.add(sym.id);
          // Locate the first token line where this builtin is referenced
          const refToken = tokens.find((t) => t.lexeme === name);
          items.push({
            id: sym.id,
            name: sym.name,
            kind: sym.kind,
            typeSpecifier: sym.returnType
              ? `${sym.returnType}(${(sym.parameterTypes || []).join(', ')})`
              : sym.typeSpecifier,
            scopeName: 'Global (Built-in)',
            scopeKind: 'global',
            line: refToken ? refToken.span.line : 1,
            column: refToken ? refToken.span.column : 1,
            usages,
            status: 'builtin',
          });
        }
      } else {
        // User-defined symbol (variable, parameter, function)
        if (!seenIds.has(sym.id)) {
          seenIds.add(sym.id);
          const usages = tokenCounts.get(name) || 1;
          const isShadowed = scope.parent ? scope.parent.lookup(name) !== undefined : false;

          let formattedType = sym.typeSpecifier;
          if (sym.kind === 'function') {
            formattedType = `${sym.returnType || sym.typeSpecifier}(${(sym.parameterTypes || []).join(', ')})`;
          }

          let scopeDisplayName = scope.name;
          if (scope.kind === 'function') {
            const fnName =
              (scope as any).functionName ||
              scope.name.replace(/^function\s+/, '').replace(/\(\)$/, '');
            scopeDisplayName = `${fnName}()`;
          } else if (scope.kind === 'block') {
            let parentFn: string | null = null;
            let ancestor: any = scope.parent;
            while (ancestor) {
              if (ancestor.kind === 'function') {
                parentFn =
                  ancestor.functionName ||
                  ancestor.name.replace(/^function\s+/, '').replace(/\(\)$/, '');
                break;
              }
              ancestor = ancestor.parent;
            }
            scopeDisplayName = parentFn ? `${parentFn}() block` : 'Block';
          } else if (scope.kind === 'global') {
            scopeDisplayName = 'Global';
          }

          items.push({
            id: sym.id,
            name: sym.name,
            kind: sym.kind,
            typeSpecifier: formattedType,
            scopeName: scopeDisplayName,
            scopeKind: scope.kind,
            line: sym.span.line,
            column: sym.span.column,
            usages,
            status: 'declared',
            isShadowed,
          });
        }
      }
    }
  }

  // 2. Identify undeclared identifiers used in code from semantic diagnostics
  const undeclaredSeen = new Set<string>();
  for (const diag of semanticResult.diagnostics) {
    if (diag.semanticKind === 'undeclared-identifier') {
      const undeclaredName =
        diag.symbolCandidate?.originalName ||
        diag.message.match(/Undeclared identifier '([^']+)'/)?.[1] ||
        '';

      if (undeclaredName && !undeclaredSeen.has(undeclaredName)) {
        undeclaredSeen.add(undeclaredName);
        const usages = tokenCounts.get(undeclaredName) || 1;
        items.push({
          id: `undeclared-${undeclaredName}-${diag.span.start}`,
          name: undeclaredName,
          kind: 'undeclared',
          typeSpecifier: 'unknown',
          scopeName: 'Unresolved',
          scopeKind: 'unknown',
          line: diag.span.line,
          column: diag.span.column,
          usages,
          status: 'undeclared',
        });
      }
    }
  }

  // Sort by line ascending, then column ascending
  return items.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
}

export const SymbolTableView: React.FC<SymbolTableViewProps> = ({ onJumpToLine }) => {
  const { semanticResult, currentState } = useReplayStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'variable' | 'function' | 'parameter'>('all');

  // Collect ONLY symbols that are defined or referenced in the current user code
  const codeSymbols = useMemo<CodeSymbolItem[]>(() => {
    return extractCodeSymbols(semanticResult, currentState?.tokens || []);
  }, [semanticResult, currentState?.tokens]);

  // Filter items by search query and kind selector
  const filteredSymbols = useMemo(() => {
    return codeSymbols.filter((sym) => {
      if (kindFilter !== 'all') {
        if (kindFilter === 'variable' && sym.kind !== 'variable' && sym.kind !== 'undeclared') {
          return false;
        }
        if (kindFilter === 'function' && sym.kind !== 'function') return false;
        if (kindFilter === 'parameter' && sym.kind !== 'parameter') return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        sym.name.toLowerCase().includes(q) ||
        sym.typeSpecifier.toLowerCase().includes(q) ||
        sym.scopeName.toLowerCase().includes(q) ||
        sym.kind.toLowerCase().includes(q) ||
        sym.status.toLowerCase().includes(q)
      );
    });
  }, [codeSymbols, kindFilter, searchQuery]);

  // Counts for header summary chips
  const varCount = codeSymbols.filter((s) => s.kind === 'variable' || s.kind === 'undeclared').length;
  const fnCount = codeSymbols.filter((s) => s.kind === 'function').length;
  const paramCount = codeSymbols.filter((s) => s.kind === 'parameter').length;

  return (
    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 font-mono text-xs overflow-hidden">
      {/* Header Bar */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
            <Database className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-slate-900 dark:text-slate-100 text-xs tracking-tight">
            Active Symbol Table
          </span>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
            {codeSymbols.length} used in code
          </span>
        </div>

        {/* Summary Breakdown Badges */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="px-1.5 py-0.2 rounded bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/25">
            {varCount} var{varCount !== 1 ? 's' : ''}
          </span>
          <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/25">
            {fnCount} func{fnCount !== 1 ? 's' : ''}
          </span>
          {paramCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/25">
              {paramCount} param{paramCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Filter and Search HUD */}
      <div className="px-3 pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Kind Filters */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px]">
          <button
            onClick={() => setKindFilter('all')}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              kindFilter === 'all'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All ({codeSymbols.length})
          </button>
          <button
            onClick={() => setKindFilter('variable')}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              kindFilter === 'variable'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Variables ({varCount})
          </button>
          <button
            onClick={() => setKindFilter('function')}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              kindFilter === 'function'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Functions ({fnCount})
          </button>
          {paramCount > 0 && (
            <button
              onClick={() => setKindFilter('parameter')}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                kindFilter === 'parameter'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Params ({paramCount})
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2 top-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbols..."
            className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-800 rounded pl-7 pr-2 py-1 text-[11px] focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Symbol Table */}
      <div className="overflow-x-auto px-3 pb-3">
        {filteredSymbols.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center text-slate-500 bg-slate-50 dark:bg-slate-950/50 rounded-lg border border-slate-200 dark:border-slate-800">
            <HelpCircle className="w-6 h-6 text-slate-400 dark:text-slate-600 mb-1.5" />
            <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">
              {searchQuery ? `No symbols matching "${searchQuery}"` : 'No symbols defined or used in the current code.'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-600 font-sans mt-0.5">
              Declare variables, write functions, or call standard routines to populate the symbol table.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 select-none">
                  <th className="py-2 px-3">Identifier</th>
                  <th className="py-2 px-3">Kind</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Scope</th>
                  <th className="py-2 px-3">Location</th>
                  <th className="py-2 px-3 text-center">Usages</th>
                  <th className="py-2 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSymbols.map((sym) => {
                  const isUndeclared = sym.status === 'undeclared';
                  const isBuiltin = sym.status === 'builtin';

                  return (
                    <tr
                      key={sym.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/70 transition-colors group"
                    >
                      {/* Name */}
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold">
                          {sym.kind === 'function' ? (
                            <Code2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          ) : sym.kind === 'parameter' ? (
                            <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                          ) : isUndeclared ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                          ) : (
                            <Variable className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                          )}
                          <span
                            className={
                              isUndeclared
                                ? 'text-rose-600 dark:text-rose-300 underline decoration-wavy decoration-rose-500'
                                : 'text-slate-800 dark:text-slate-100 group-hover:text-slate-950 dark:group-hover:text-white'
                            }
                          >
                            {sym.name}
                          </span>
                          {sym.isShadowed && (
                            <span
                              className="text-[9px] px-1 rounded bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30"
                              title="Shadows an outer scope variable"
                            >
                              shadows
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Kind */}
                      <td className="py-1.5 px-3 whitespace-nowrap text-[11px]">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                            sym.kind === 'function'
                              ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30'
                              : sym.kind === 'parameter'
                              ? 'bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30'
                              : isUndeclared
                              ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                              : 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30'
                          }`}
                        >
                          {sym.kind}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="py-1.5 px-3 whitespace-nowrap text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                        <code>{sym.typeSpecifier}</code>
                      </td>

                      {/* Scope */}
                      <td className="py-1.5 px-3 whitespace-nowrap text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                          {sym.scopeName}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="py-1.5 px-3 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                        <button
                          onClick={() => onJumpToLine && onJumpToLine(sym.line)}
                          className="hover:text-sky-600 dark:hover:text-sky-300 flex items-center gap-1 transition cursor-pointer text-[10px] font-mono"
                          title={`Jump to line ${sym.line}, column ${sym.column}`}
                        >
                          <span>
                            Ln {sym.line}:{sym.column}
                          </span>
                          {isBuiltin && (
                            <span className="text-[9px] px-1 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300/80 border border-amber-200 dark:border-amber-500/20">
                              c-std
                            </span>
                          )}
                          <ExternalLink className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
                        </button>
                      </td>

                      {/* Usages */}
                      <td className="py-1.5 px-3 whitespace-nowrap text-center">
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                          {sym.usages}×
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-1.5 px-3 whitespace-nowrap text-right">
                        {isUndeclared ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-[10px] font-semibold">
                            Undeclared
                          </span>
                        ) : isBuiltin ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 text-[10px] font-semibold">
                            Built-in (Used)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-semibold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            Declared
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
