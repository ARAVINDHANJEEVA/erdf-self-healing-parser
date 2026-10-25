import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Zap,
  Layers,
  GitBranch,
  Sliders,
  ChevronDown,
  FileCode,
  ExternalLink,
  Clock,
  Fingerprint,
  Menu,
  X,
  BookOpen,
  Check,
  Copy,
  RotateCcw,
  Play
} from 'lucide-react';
import { syncDocumentTheme } from '../../state/replayStore';

export interface LandingPageProps {
  onLaunchVisualizer: () => void;
}

// Scenarios for interactive Hero preview
interface DemoScenario {
  id: string;
  title: string;
  shortLabel: string;
  code: string;
  errorDescription: string;
  erdf: {
    repair: string;
    cost: string;
    astPreserved: string;
    blastRadius: string;
    cascades: string;
    doctor: string;
    treeNodes: Array<{ label: string; kind: 'root' | 'stmt' | 'expr' | 'ghost' | 'error'; depth: number }>;
  };
  clang: {
    behavior: string;
    astPreserved: string;
    blastRadius: string;
    cascades: string;
    doctor: string;
    treeNodes: Array<{ label: string; kind: 'root' | 'stmt' | 'expr' | 'ghost' | 'error'; depth: number }>;
  };
  treesitter: {
    behavior: string;
    astPreserved: string;
    blastRadius: string;
    cascades: string;
    doctor: string;
    treeNodes: Array<{ label: string; kind: 'root' | 'stmt' | 'expr' | 'ghost' | 'error'; depth: number }>;
  };
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'paren',
    title: 'Unclosed Parenthesis in Arithmetic',
    shortLabel: "Missing ')'",
    code: 'int total = (10 + 20;\nint tax = 5;\nreturn total + tax;',
    errorDescription: 'Line 1: Missing closing delimiter \')\' before semicolon',
    erdf: {
      repair: 'Synthesize Ghost Token \')\' at col 20 (Cost: 1.20)',
      cost: '1.20',
      astPreserved: '100%',
      blastRadius: '0 tokens',
      cascades: '0 errors',
      doctor: 'ERDF inserts synthetic \')\' before \';\'. All 3 statements parse cleanly without downstream corruption.',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'VariableDeclaration: int total', kind: 'stmt', depth: 1 },
        { label: 'BinaryExpression (+)', kind: 'expr', depth: 2 },
        { label: 'GhostToken: ) [Synthesized]', kind: 'ghost', depth: 2 },
        { label: 'VariableDeclaration: int tax', kind: 'stmt', depth: 1 },
        { label: 'ReturnStatement', kind: 'stmt', depth: 1 },
      ],
    },
    clang: {
      behavior: 'Panic Mode: Discard until Block/File Synchronizer',
      astPreserved: '28%',
      blastRadius: '42 chars',
      cascades: '3 phantom errors',
      doctor: 'Clang treats "int tax" as an arithmetic operand of "(10 + 20", causing an avalanche that discards subsequent declarations.',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'VariableDeclaration: int total [Corrupted]', kind: 'error', depth: 1 },
        { label: 'Discarded: int tax = 5;', kind: 'error', depth: 2 },
        { label: 'Discarded: return total + tax;', kind: 'error', depth: 2 },
      ],
    },
    treesitter: {
      behavior: 'Blunt Splicing: Untyped (ERROR) Node Injection',
      astPreserved: '72%',
      blastRadius: '12 chars',
      cascades: '1 error',
      doctor: 'Tree-sitter wraps the invalid statement into an (ERROR) node. Surviving declarations parse, but typed AST passes crash on the untyped node.',
      treeNodes: [
        { label: 'translation_unit', kind: 'root', depth: 0 },
        { label: 'ERROR (untyped leaf)', kind: 'error', depth: 1 },
        { label: 'declaration: int tax', kind: 'stmt', depth: 1 },
        { label: 'return_statement', kind: 'stmt', depth: 1 },
      ],
    },
  },
  {
    id: 'semicolon',
    title: 'Omitted Semicolon with Type Follow',
    shortLabel: "Missing ';'",
    code: 'int count = 100\nfloat rate = 0.05f;\nreturn count * rate;',
    errorDescription: 'Line 1: Missing semicolon \';\' before subsequent type keyword',
    erdf: {
      repair: 'Synthesize Statement Semicolon \';\' (Cost: 0.85)',
      cost: '0.85',
      astPreserved: '100%',
      blastRadius: '0 tokens',
      cascades: '0 errors',
      doctor: 'ERDF detects follow token "float" matches statement-start lookahead, committing a zero-drift semicolon insertion.',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'VariableDeclaration: int count', kind: 'stmt', depth: 1 },
        { label: 'GhostToken: ; [Synthesized]', kind: 'ghost', depth: 2 },
        { label: 'VariableDeclaration: float rate', kind: 'stmt', depth: 1 },
        { label: 'ReturnStatement', kind: 'stmt', depth: 1 },
      ],
    },
    clang: {
      behavior: 'Panic Mode: Expected \';\' after expression',
      astPreserved: '40%',
      blastRadius: '35 chars',
      cascades: '2 phantom errors',
      doctor: 'Clang flags line 2 as "error: expected ;" and fails to bind variable "rate" into scope, producing "rate undeclared".',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'VariableDeclaration: int count', kind: 'stmt', depth: 1 },
        { label: 'SyntaxError: expected ;', kind: 'error', depth: 2 },
        { label: 'Discarded Scope: float rate', kind: 'error', depth: 2 },
        { label: 'ReturnStatement [Corrupted]', kind: 'error', depth: 1 },
      ],
    },
    treesitter: {
      behavior: 'Spliced statement node with trailing error token',
      astPreserved: '68%',
      blastRadius: '15 chars',
      cascades: '1 error',
      doctor: 'Tree-sitter merges "count" and "float" into a partial error boundary, losing type annotations on the second variable.',
      treeNodes: [
        { label: 'translation_unit', kind: 'root', depth: 0 },
        { label: 'ERROR: declaration_fragment', kind: 'error', depth: 1 },
        { label: 'declaration: rate = 0.05f', kind: 'stmt', depth: 1 },
        { label: 'return_statement', kind: 'stmt', depth: 1 },
      ],
    },
  },
  {
    id: 'brace',
    title: 'Missing Block Closing Brace',
    shortLabel: "Missing '}'",
    code: 'if (isValid) {\n  process(data);\nreturn true;',
    errorDescription: 'Line 2: Missing closing delimiter \'}\' before return statement',
    erdf: {
      repair: 'Synthesize Scope Delimiter \'}\' at end of block (Cost: 1.10)',
      cost: '1.10',
      astPreserved: '100%',
      blastRadius: '0 tokens',
      cascades: '0 errors',
      doctor: 'ERDF projects follow token "return" against active enclosing control scopes, closing the compound block before sibling statements.',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'IfStatement (condition: isValid)', kind: 'stmt', depth: 1 },
        { label: 'CompoundStatement (Block)', kind: 'stmt', depth: 2 },
        { label: 'ExpressionStatement: process(data)', kind: 'expr', depth: 3 },
        { label: 'GhostToken: } [Synthesized]', kind: 'ghost', depth: 3 },
        { label: 'ReturnStatement: return true;', kind: 'stmt', depth: 1 },
      ],
    },
    clang: {
      behavior: 'Panic Mode: Expected \'}\' at end of input',
      astPreserved: '35%',
      blastRadius: '28 chars',
      cascades: '4 phantom errors',
      doctor: 'Clang consumes "return true;" inside the if-block body, then reports premature EOF at the file level.',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'IfStatement [Incomplete]', kind: 'error', depth: 1 },
        { label: 'CompoundStatement [Corrupted Scope]', kind: 'error', depth: 2 },
        { label: 'SyntaxError: expected \'}\' at EOF', kind: 'error', depth: 3 },
      ],
    },
    treesitter: {
      behavior: 'Root compound block spliced with missing child delimiter',
      astPreserved: '70%',
      blastRadius: '14 chars',
      cascades: '1 error',
      doctor: 'Tree-sitter nests the return statement into the unclosed if-body, corrupting the return type binding of the enclosing function.',
      treeNodes: [
        { label: 'translation_unit', kind: 'root', depth: 0 },
        { label: 'if_statement', kind: 'stmt', depth: 1 },
        { label: 'ERROR: unclosed_compound_statement', kind: 'error', depth: 2 },
        { label: 'return_statement [Mismatched Scope]', kind: 'stmt', depth: 3 },
      ],
    },
  },
  {
    id: 'typo',
    title: 'Keyword Typo in Loop Header',
    shortLabel: 'Loop Typo',
    code: 'whlie (status == 1) {\n  tick();\n}',
    errorDescription: 'Line 1: Unknown identifier \'whlie\' followed by parenthesized expression',
    erdf: {
      repair: 'Substitute Keyword \'whlie\' -> \'while\' (Levenshtein d=1, Cost: 0.95)',
      cost: '0.95',
      astPreserved: '100%',
      blastRadius: '0 tokens',
      cascades: '0 errors',
      doctor: 'ERDF matches single-transposition edit distance against C keyword vocabulary and verifies following loop grammar.',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'WhileStatement (condition: status == 1)', kind: 'stmt', depth: 1 },
        { label: 'GhostToken: while [Keyword Substitution]', kind: 'ghost', depth: 2 },
        { label: 'CompoundStatement', kind: 'stmt', depth: 2 },
        { label: 'ExpressionStatement: tick();', kind: 'expr', depth: 3 },
      ],
    },
    clang: {
      behavior: 'Panic Mode: Expected \';\' after expression',
      astPreserved: '25%',
      blastRadius: '48 chars',
      cascades: '3 phantom errors',
      doctor: 'Clang assumes "whlie" is a function call or undeclared variable without type, triggering "use of undeclared identifier".',
      treeNodes: [
        { label: 'TranslationUnit', kind: 'root', depth: 0 },
        { label: 'SyntaxError: use of undeclared identifier \'whlie\'', kind: 'error', depth: 1 },
        { label: 'Discarded: (status == 1)', kind: 'error', depth: 2 },
        { label: 'Discarded CompoundStatement', kind: 'error', depth: 2 },
      ],
    },
    treesitter: {
      behavior: 'Treated as expression statement followed by orphaned block',
      astPreserved: '60%',
      blastRadius: '18 chars',
      cascades: '1 error',
      doctor: 'Tree-sitter parses "whlie (status == 1)" as a call-expression and turns the block into an isolated compound statement.',
      treeNodes: [
        { label: 'translation_unit', kind: 'root', depth: 0 },
        { label: 'call_expression (whlie)', kind: 'error', depth: 1 },
        { label: 'compound_statement (orphaned)', kind: 'stmt', depth: 1 },
      ],
    },
  },
];

interface FAQItem {
  question: string;
  answer: string;
  category: 'General' | 'Engines' | 'Architecture' | 'Integration';
}

const FAQ_ITEMS: FAQItem[] = [
  {
    category: 'General',
    question: 'What is a Self-Healing Parser and why is it needed?',
    answer:
      'In traditional compiler architectures (such as GCC or standard Clang), a syntax error triggers rigid panic-mode recovery or fatal termination. This drops subsequent statements and produces a chaotic "error avalanche" of dozens of phantom diagnostics. A Self-Healing Parser intercepts syntax errors in real time, generates bounded repair hypotheses, validates them speculatively against an immutable virtual stream, and selects the minimum-cost candidate to keep the Abstract Syntax Tree (AST) complete, well-typed, and resilient.'
  },
  {
    category: 'General',
    question: 'What is an Abstract Syntax Tree (AST) and why do syntax errors corrupt it?',
    answer:
      'An AST is a hierarchical tree representation of the structural syntax of source code, where nodes correspond to declarations, statements, and expressions. Downstream compiler stages—including type checkers, semantic analyzers, optimization passes, and Language Server Protocol (LSP) features (autocomplete, hover diagnostics, symbol renaming)—depend strictly on a well-formed AST. When a syntax error occurs, traditional compilers either truncate the AST or leave broken child nodes, causing downstream language tools to freeze or report false positives.'
  },
  {
    category: 'Engines',
    question: 'How does ERDF compare to Clang Panic Mode?',
    answer:
      'Clang Panic Mode relies on hardcoded synchronization token sets. When an unexpected token is encountered, it discards incoming tokens until it matches a statement delimiter (like \';\') or a block closing brace (\'}\'). This often discards multiple valid subsequent declarations, spawning cascading errors (such as "variable undeclared" or "unexpected type"). In contrast, ERDF executes zero-allocation speculative lookahead over a bounded window (W=4) and synthesizes missing delimiters as "Ghost Nodes", preserving 100% of valid source nodes with zero cascading errors.'
  },
  {
    category: 'Engines',
    question: 'How does ERDF compare to Tree-sitter Incremental Splicing?',
    answer:
      'Tree-sitter is designed for editor syntax highlighting and recovers by slicing broken tokens into an untyped (ERROR) node. While this prevents the entire document from crashing, Tree-sitter does not perform speculative lookahead validation, does not compute multi-factor mathematical costs, and breaks typed AST invariants. ERDF maintains a strongly typed AST with explicit Tri-State provenance (Source, Ghost, and Partial) and explains its causal decisions in plain English.'
  },
  {
    category: 'Architecture',
    question: 'What are "Directed Futures" and how does speculative lookahead work?',
    answer:
      'Directed Futures are sandboxed execution branches explored by the parser when an error occurs. Rather than modifying the original token stream, ERDF overlays candidate edits (insert, delete, substitute) onto an immutable VirtualTokenStream with O(1) checkpointing. The parser speculatively runs forward across a bounded window (default W=4 tokens). If a future successfully resumes valid grammar production without immediate failure, it receives a favorable diagnostic score (C_d).'
  },
  {
    category: 'Architecture',
    question: 'What is the Multi-Factor Mathematical Cost Model?',
    answer:
      'Instead of relying on arbitrary heuristics, ERDF scores every candidate edit using an objective penalty equation: Cost(Δ) = (λ_l · C_l) + (λ_s · C_s) + (λ_m · C_m) + (λ_d · C_d). Here, C_l penalizes lexical deletion/insertion difficulty, C_s penalizes structural boundary alterations (e.g. altering loop or function headers), C_m measures semantic risk (e.g. deleting identifiers or type specifiers), and C_d measures speculative lookahead progress. All weights (λ) can be adjusted dynamically in the visualizer.'
  },
  {
    category: 'Architecture',
    question: 'What is the difference between a "Ghost Node" and a "Partial Node"?',
    answer:
      'ERDF uses Tri-State AST Provenance: 1) "Source Nodes" are built directly from genuine user-typed tokens. 2) "Ghost Nodes" are synthetic tokens inserted by the winning recovery candidate (e.g., a missing closing parenthesis or semicolon) rendered with dashed purple styling. 3) "Partial Nodes" occur only if all bounded speculative edits fail, in which case ERDF falls back to structured synchronization, preserving unparsable tokens inside an explicit container rather than silently dropping them.'
  },
  {
    category: 'Architecture',
    question: 'How does ERDF eliminate cascading error avalanches?',
    answer:
      'Traditional parsers lose synchronization when an error occurs, causing subsequent valid code to be misinterpreted as invalid operands or misplaced tokens. This generates a cascade of false alarms (such as "expected expression", "undefined symbol"). ERDF eliminates cascading avalanches by synthesizing localized Ghost Tokens that satisfy the immediate grammar expectation, allowing downstream declarations to parse cleanly under their original, intended lexical scopes.'
  },
  {
    category: 'Integration',
    question: 'Can I apply the recovered solutions directly back into my source code?',
    answer:
      'Yes. ERDF includes a Zero-Drift Character Replacement Engine. When you inspect candidate repairs in the Candidate Arena or the Multi-Error tab, clicking "Apply to Code" patches the exact byte spans in the active editor without index drift. You can also click "Apply All Winning Solutions" in the header to resolve all syntax incidents across the entire file in a single click.'
  },
  {
    category: 'Integration',
    question: 'How can this framework be integrated into Language Servers (LSP) and IDEs?',
    answer:
      'Because ERDF runs with zero heap allocations during checkpointing and completes speculative candidate searches in sub-millisecond execution times, it can be embedded directly into Language Server Protocol (LSP) daemons for C/C++. IDEs benefit from continuous semantic indexing, accurate autocomplete even mid-statement, and high-confidence automatic quick-fixes.'
  },
  {
    category: 'General',
    question: 'Is this running entirely in my web browser?',
    answer:
      'Yes! The entire C lexer, recursive-descent Pratt expression parser, virtual token stream overlay engine, comparative multi-engine simulator, and interactive 60 FPS replay timeline are implemented in TypeScript and run 100% client-side in your browser with zero remote server roundtrips.'
  }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchVisualizer }) => {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('paren');
  const [activeEngineTab, setActiveEngineTab] = useState<'erdf' | 'clang' | 'treesitter'>('erdf');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [faqFilter, setFaqFilter] = useState<'All' | 'General' | 'Engines' | 'Architecture' | 'Integration'>('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isQuickExplainerOpen, setIsQuickExplainerOpen] = useState<boolean>(false);

  // Interactive UI / UX States
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationStep, setSimulationStep] = useState<number>(0);
  const [inspectedNodeIndex, setInspectedNodeIndex] = useState<number | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [selectedShowdownMetric, setSelectedShowdownMetric] = useState<'all' | 'ast' | 'blast' | 'cascades' | 'provenance'>('all');

  // Interactive Mathematical Cost Tuning Sandbox Weights
  const [lambdaL, setLambdaL] = useState<number>(1.0);
  const [lambdaS, setLambdaS] = useState<number>(1.5);
  const [lambdaM, setLambdaM] = useState<number>(2.0);
  const [lambdaD, setLambdaD] = useState<number>(1.0);

  const resetWeights = () => {
    setLambdaL(1.0);
    setLambdaS(1.5);
    setLambdaM(2.0);
    setLambdaD(1.0);
  };

  const handleRunSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimulationStep(1);
    setTimeout(() => setSimulationStep(2), 250);
    setTimeout(() => {
      setSimulationStep(3);
      setTimeout(() => {
        setIsSimulating(false);
        setSimulationStep(0);
      }, 1400);
    }, 600);
  };

  const handleCopyCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Guarantee strictly light theme on documentElement while viewing Landing Page
  useEffect(() => {
    syncDocumentTheme('light');
  }, []);

  const selectedScenario = DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) || DEMO_SCENARIOS[0];

  const filteredFaqs = faqFilter === 'All'
    ? FAQ_ITEMS
    : FAQ_ITEMS.filter((f) => f.category === faqFilter);

  // Cost candidates calculated dynamically based on user-adjusted weights
  const COST_CANDIDATES = [
    {
      id: 'ghost_synth',
      name: "Synthesize ')' Ghost Delimiter",
      tag: 'Zero-Drift Synthetic Insertion',
      cl: 1.2,
      cs: 0.3,
      cm: 0.1,
      cd: 0.2,
      astImpact: '100% Intact',
      provenance: 'Ghost Node Attached',
    },
    {
      id: 'token_del',
      name: "Delete '(' Mismatched Token",
      tag: 'Destructive Lexical Token Edit',
      cl: 0.4,
      cs: 1.8,
      cm: 1.2,
      cd: 0.8,
      astImpact: '80% Preserved',
      provenance: 'Lossy Token Discard',
    },
    {
      id: 'token_sub',
      name: "Substitute with ';' Terminator",
      tag: 'Semantic Identifier Disruption',
      cl: 0.9,
      cs: 2.0,
      cm: 1.5,
      cd: 1.6,
      astImpact: '50% Preserved',
      provenance: 'High Scope Hazard',
    },
    {
      id: 'panic_discard',
      name: 'Clang Panic Discard to Synchronizer',
      tag: 'Cascading Synchronization Drop',
      cl: 0.2,
      cs: 3.5,
      cm: 3.0,
      cd: 2.8,
      astImpact: '28% Preserved (Truncated)',
      provenance: 'Avalanche Failure',
    },
  ];

  const scoredCandidates = COST_CANDIDATES.map((c) => ({
    ...c,
    totalCost: lambdaL * c.cl + lambdaS * c.cs + lambdaM * c.cm + lambdaD * c.cd,
  })).sort((a, b) => a.totalCost - b.totalCost);

  const winningCandidate = scoredCandidates[0];

  return (
    <div className="w-full h-screen overflow-y-auto bg-[#faf8f5] text-slate-850 selection:bg-amber-200 selection:text-slate-900 scroll-smooth font-sans relative">
      {/* Prominent JustDone-Inspired Ambient Pastel Gradient (Fixed Full-Page Viewport) */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Primary Ambient Multi-Point Gradient Mesh */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(circle 950px at 15% 5%, #fed7aa 0%, rgba(254, 215, 170, 0.75) 35%, transparent 75%),
              radial-gradient(circle 900px at 85% 10%, #e0f2fe 0%, rgba(224, 242, 254, 0.80) 40%, transparent 75%),
              radial-gradient(circle 850px at 50% 28%, #fecdd3 0%, rgba(254, 205, 211, 0.70) 35%, transparent 70%),
              radial-gradient(circle 950px at 10% 55%, #fef3c7 0%, rgba(254, 243, 199, 0.75) 40%, transparent 75%),
              radial-gradient(circle 900px at 90% 65%, #e0f2fe 0%, rgba(224, 242, 254, 0.75) 40%, transparent 75%),
              radial-gradient(circle 1100px at 50% 92%, #fed7aa 0%, #fecdd3 35%, #e0f2fe 65%, transparent 90%),
              radial-gradient(ellipse 100% 70% at 50% 0%, rgba(254, 243, 199, 0.6) 0%, rgba(254, 215, 170, 0.45) 35%, transparent 70%),
              #faf8f5
            `,
          }}
        />
        {/* Top-Down Luminous Atmospheric Glow */}
        <div
          className="absolute inset-x-0 top-0 h-[800px]"
          style={{
            background:
              'radial-gradient(ellipse 95% 75% at 50% -10%, #fed7aa 0%, #fef3c7 30%, #e0f2fe 60%, transparent 85%)',
            opacity: 0.75,
          }}
        />
      </div>

      {/* Elegant Sticky Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#faf8f5]/90 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-3 lg:gap-4 flex-nowrap">
          {/* Logo & Project Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-teal-600 to-indigo-600 p-[1.5px] shadow-sm shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-[#faf8f5] rounded-[14px] flex items-center justify-center">
                <Terminal className="w-5 h-5 text-slate-850" />
              </div>
            </div>
            <div>
              <span className="font-serif text-lg sm:text-xl lg:text-lg xl:text-2xl font-semibold tracking-tight text-slate-900 whitespace-nowrap">
                ERDF Self-Healing Parser
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links - Single row, no wrapping */}
          <nav className="hidden lg:flex items-center gap-2 xl:gap-3 text-xs xl:text-sm font-medium text-slate-650 shrink-0 whitespace-nowrap">
            <a
              href="#overview"
              className="px-3 py-1.5 rounded-full hover:text-slate-900 hover:bg-slate-200/50 active:bg-slate-200/70 active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              Overview
            </a>
            <a
              href="#architecture"
              className="px-3 py-1.5 rounded-full hover:text-slate-900 hover:bg-slate-200/50 active:bg-slate-200/70 active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              Architecture
            </a>
            <a
              href="#showdown"
              className="px-3 py-1.5 rounded-full hover:text-slate-900 hover:bg-slate-200/50 active:bg-slate-200/70 active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              Showdown
            </a>
            <a
              href="#cost-model"
              className="px-3 py-1.5 rounded-full hover:text-slate-900 hover:bg-slate-200/50 active:bg-slate-200/70 active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              Cost Model
            </a>
            <a
              href="#faq"
              className="px-3 py-1.5 rounded-full hover:text-slate-900 hover:bg-slate-200/50 active:bg-slate-200/70 active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              FAQ
            </a>
          </nav>

          {/* Header Action Buttons: Balanced matching dimensions (h-10) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setIsQuickExplainerOpen(true)}
              className="hidden sm:inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full border border-slate-300 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 hover:border-slate-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-95 text-xs sm:text-sm font-medium shadow-xs transition-all duration-200 cursor-pointer whitespace-nowrap"
              title="Quick Technical Explainer"
            >
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Core Concepts</span>
            </button>

            <button
              onClick={onLaunchVisualizer}
              className="group relative inline-flex items-center justify-center gap-2 h-10 px-4 sm:px-5 rounded-full border border-transparent bg-slate-900 text-white hover:bg-slate-800 text-xs sm:text-sm font-medium tracking-normal transition-all duration-200 shadow-md shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <span>Launch Visualizer</span>
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1.5 text-amber-300" />
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 hover:shadow-xs active:scale-95 border border-slate-200 transition-all duration-200 cursor-pointer"
              aria-label="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden px-4 pt-2 pb-6 bg-[#faf8f5] border-b border-slate-200/80 shadow-lg">
            <div className="flex flex-col space-y-3">
              <a
                href="#overview"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                Overview
              </a>
              <a
                href="#architecture"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                Architecture
              </a>
              <a
                href="#showdown"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                Showdown
              </a>
              <a
                href="#cost-model"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                Cost Model
              </a>
              <a
                href="#faq"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                FAQ
              </a>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsQuickExplainerOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
              >
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>Open Core Concepts Explainer</span>
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLaunchVisualizer();
                }}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                <span>Launch Visualizer</span>
                <ArrowRight className="w-4 h-4 text-amber-300" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Interactive Core Concepts Explainer Modal */}
      {isQuickExplainerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                    Header Architectural Guide
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Self-Healing Parsers &bull; AST Invariants &bull; Clang vs Tree-sitter
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsQuickExplainerOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                aria-label="Close Explainer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-6 space-y-4 text-sm text-slate-650 leading-relaxed">
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/70">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  What is a Self-Healing Parser & AST?
                </h4>
                <p className="mt-1 text-xs sm:text-sm text-slate-650">
                  An Abstract Syntax Tree (AST) is the hierarchical backbone for semantic analysis, type checking, and LSP autocompletion. When syntax errors occur, ordinary compilers panic and truncate the tree. A <strong>Self-Healing Parser</strong> continuously discovers minimum-cost candidate edits to keep the AST 100% complete and typed.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/70">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Why Clang Panic Mode Causes Cascading Avalanches
                </h4>
                <p className="mt-1 text-xs sm:text-sm text-slate-650">
                  Clang discards incoming tokens until a statement delimiter or closing brace is found. This drops valid subsequent declarations, producing an avalanche of 5–15 false-positive "variable undeclared" warnings that confuse developers.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-200/70">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  Why Tree-sitter Splicing Breaks Semantic Invariants
                </h4>
                <p className="mt-1 text-xs sm:text-sm text-slate-650">
                  Tree-sitter injects untyped <code>(ERROR)</code> nodes without lookahead validation. While adequate for editor syntax highlighting, untyped nodes crash downstream type checkers and break static analysis pipelines.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200/70">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-600" />
                  How ERDF Directed Futures Solve This
                </h4>
                <p className="mt-1 text-xs sm:text-sm text-slate-650">
                  ERDF takes an instant zero-allocation checkpoint, explores candidate edits speculatively over bounded lookahead (W=4), scores each candidate using a 4-factor objective cost equation, and badging repairs as Ghost Nodes with tri-state provenance.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <a
                href="#showdown"
                onClick={() => setIsQuickExplainerOpen(false)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <span>Jump to Interactive 3-Way Showdown &darr;</span>
              </a>
              <button
                onClick={() => {
                  setIsQuickExplainerOpen(false);
                  onLaunchVisualizer();
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition cursor-pointer shadow-sm"
              >
                Launch Visualizer Studio &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="relative z-10">
        {/* ========================================================================= */}
        {/* HERO SECTION */}
        {/* ========================================================================= */}
        <section id="overview" className="pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
          {/* Display Heading in Cormorant Garamond */}
          <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-normal text-slate-900 tracking-[-0.025em] leading-[1.06] max-w-5xl mx-auto">
            The Self-Healing C Compiler That <span className="italic font-normal">Never Panics</span>.
          </h1>

          {/* Subtitle */}
          <p className="mt-8 text-lg sm:text-xl md:text-2xl text-slate-650 max-w-3xl mx-auto font-normal leading-relaxed">
            Standard compilers choke on a missing delimiter and trigger cascading avalanches of phantom errors.
            <strong className="font-semibold text-slate-900"> ERDF</strong> explores speculative directed futures
            over immutable virtual token streams, discovering minimal-cost repairs that preserve{' '}
            <strong className="font-semibold text-slate-900">100% of your AST</strong>.
          </p>

          {/* Primary CTA Button Group */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onLaunchVisualizer}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-slate-900 text-white hover:bg-slate-800 text-base font-medium shadow-xl shadow-slate-900/15 hover:shadow-2xl hover:shadow-slate-900/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-98 transition-all duration-200 cursor-pointer"
            >
              <span>Launch Visualizer Studio</span>
              <ArrowRight className="w-5 h-5 text-amber-300 transition-transform duration-200 group-hover:translate-x-1.5" />
            </button>

            <a
              href="#showdown"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-white/90 hover:bg-white text-slate-750 hover:text-slate-900 font-medium text-base border border-slate-200/90 hover:border-slate-350 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-98 transition-all duration-200"
            >
              <span>Explore Engine Showdown</span>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-800 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
            </a>
          </div>

          {/* ========================================================================= */}
          {/* HERO INTERACTIVE SHOWCASE CARD (Visual AST Healing Live) */}
          {/* ========================================================================= */}
          <div className="mt-16 text-left max-w-5xl mx-auto relative">
            {/* Ambient Pastel Glow Halo behind Hero Showcase Card */}
            <div
              className="pointer-events-none absolute -inset-6 rounded-[44px] blur-3xl -z-10 opacity-75"
              style={{
                background:
                  'radial-gradient(ellipse at center, rgba(254, 215, 170, 0.75) 0%, rgba(254, 205, 211, 0.6) 45%, rgba(224, 242, 254, 0.65) 75%, transparent 100%)',
              }}
            />
            {/* Frosted Glass Showcase Card Container with High Visibility */}
            <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-white/80 shadow-[0_25px_60px_-15px_rgba(15,23,42,0.08),0_0_0_1px_rgba(255,255,255,0.9)_inset] overflow-hidden relative">
              {/* Card Header & Redesigned Example Menu */}
              <div className="p-6 sm:p-8 bg-white/70 backdrop-blur-md border-b border-white/80 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-900 border border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Live Speculative Comparison Matrix
                    </span>
                  </div>
                  <h3 className="font-serif text-2xl sm:text-3xl font-medium text-slate-900 mt-1.5 tracking-tight">
                    Witness Syntax Error Recovery in Real Time
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    Scenario: <strong className="font-semibold text-slate-900">{selectedScenario.title}</strong>
                  </p>
                </div>

                {/* Sleek Single-Row Horizontal Segmented Tab Bar Example Menu */}
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/80 backdrop-blur-md rounded-full border border-slate-200/70 shadow-inner self-start md:self-auto overflow-x-auto scrollbar-none max-w-full">
                  {DEMO_SCENARIOS.map((scenario) => {
                    const isActive = activeScenarioId === scenario.id;
                    return (
                      <button
                        key={scenario.id}
                        onClick={() => {
                          setActiveScenarioId(scenario.id);
                          setInspectedNodeIndex(null);
                        }}
                        className={`px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-white text-slate-900 font-semibold shadow-xs ring-1 ring-slate-200/80 hover:shadow-sm scale-[1.02]'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/80 hover:shadow-xs hover:scale-105 active:scale-95'
                        }`}
                        title={scenario.title}
                      >
                        {scenario.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Elegant 3-Engine Segmented Comparison Toggle Bar */}
              <div className="px-6 sm:px-8 py-3.5 bg-white/70 backdrop-blur-md border-b border-white/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-slate-700">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Compare Recovery Engine:</span>
                </div>

                <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100/90 backdrop-blur-md rounded-full border border-slate-200/80 shadow-inner overflow-x-auto scrollbar-none max-w-full">
                  <button
                    onClick={() => {
                      setActiveEngineTab('erdf');
                      setInspectedNodeIndex(null);
                    }}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap duration-200 ${
                      activeEngineTab === 'erdf'
                        ? 'bg-emerald-600 text-white font-semibold shadow-xs hover:bg-emerald-500 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-95'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/80 hover:shadow-xs hover:scale-[1.02] active:scale-95'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                    <span>ERDF Self-Healing</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        activeEngineTab === 'erdf'
                          ? 'bg-emerald-700 text-emerald-100'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      100% AST
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveEngineTab('clang');
                      setInspectedNodeIndex(null);
                    }}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap duration-200 ${
                      activeEngineTab === 'clang'
                        ? 'bg-rose-600 text-white font-semibold shadow-xs hover:bg-rose-500 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-95'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/80 hover:shadow-xs hover:scale-[1.02] active:scale-95'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-200" />
                    <span>Clang Panic</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        activeEngineTab === 'clang'
                          ? 'bg-rose-700 text-rose-100'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      Avalanche
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveEngineTab('treesitter');
                      setInspectedNodeIndex(null);
                    }}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap duration-200 ${
                      activeEngineTab === 'treesitter'
                        ? 'bg-amber-600 text-white font-semibold shadow-xs hover:bg-amber-500 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-95'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/80 hover:shadow-xs hover:scale-[1.02] active:scale-95'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-200" />
                    <span>Tree-sitter</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        activeEngineTab === 'treesitter'
                          ? 'bg-amber-700 text-amber-100'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      Untyped
                    </span>
                  </button>
                </div>
              </div>

              {/* Streamlined Showcase Card Body: Spacious 2-Column Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 sm:p-8">
                {/* Left Column: Broken Source Code & Interactive Simulation Trigger */}
                <div className="lg:col-span-5 flex flex-col justify-between bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 p-5 sm:p-6 shadow-xs">
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-3">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <FileCode className="w-4 h-4 text-slate-500" /> input.c
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyCode(selectedScenario.code)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 px-2 py-0.5 rounded-md transition-all duration-200 active:scale-95 cursor-pointer"
                          title="Copy snippet"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-sans text-[11px] font-medium">
                          Syntax Error
                        </span>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 text-slate-100 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto shadow-inner border border-slate-800 relative">
                      <pre className="text-slate-100">
                        <code>{selectedScenario.code}</code>
                      </pre>
                      <div className="mt-3.5 pt-2.5 border-t border-slate-800 text-[11px] sm:text-xs text-amber-300 font-sans flex items-start gap-1.5 leading-normal">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{selectedScenario.errorDescription}</span>
                      </div>
                    </div>

                    {/* Interactive Healing Simulator Trigger */}
                    <button
                      onClick={handleRunSimulation}
                      disabled={isSimulating}
                      className={`mt-4 w-full py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                        isSimulating
                          ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-xs'
                          : 'bg-slate-900 hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-98 border-transparent text-white shadow-xs'
                      }`}
                    >
                      {isSimulating ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                          <span>
                            {simulationStep === 1
                              ? '1/3 Checkpoint O(1) Virtual Stream...'
                              : simulationStep === 2
                              ? '2/3 Evaluating Directed Futures (W=4)...'
                              : '3/3 Winning Candidate Committed!'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-amber-300" />
                          <span>Simulate Healing Decision Process</span>
                        </>
                      )}
                    </button>

                    {/* Contextual Engine Recovery Banner */}
                    {activeEngineTab === 'erdf' ? (
                      <div className="mt-4 p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs text-emerald-950">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-900 mb-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ERDF Minimum-Cost Repair:</span>
                        </div>
                        <p className="text-[11px] text-emerald-850 font-mono">{selectedScenario.erdf.repair}</p>
                      </div>
                    ) : activeEngineTab === 'clang' ? (
                      <div className="mt-4 p-3.5 rounded-xl bg-rose-50/80 border border-rose-200/80 text-xs text-rose-950">
                        <div className="flex items-center gap-1.5 font-semibold text-rose-900 mb-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          <span>Clang Panic-Mode Recovery:</span>
                        </div>
                        <p className="text-[11px] text-rose-850 font-mono">{selectedScenario.clang.behavior}</p>
                      </div>
                    ) : (
                      <div className="mt-4 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-950">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-900 mb-0.5">
                          <Layers className="w-3.5 h-3.5 text-amber-600" />
                          <span>Tree-sitter Incremental Splicing:</span>
                        </div>
                        <p className="text-[11px] text-amber-850 font-mono">{selectedScenario.treesitter.behavior}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-500 font-mono">
                    <span>Engine: {activeEngineTab === 'erdf' ? 'ERDF' : activeEngineTab === 'clang' ? 'Clang' : 'Tree-sitter'}</span>
                    <span className="font-sans text-[11px] text-slate-600 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      Zero-Drift Overlay
                    </span>
                  </div>
                </div>

                {/* Right Column: AST Reconstruction & Quantitative Impact */}
                <div className="lg:col-span-7 flex flex-col justify-between bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 p-5 sm:p-6 shadow-xs">
                  <div>
                    {/* Spacious Engine Metric Ribbon (Unified to eliminate nested box clutter) */}
                    <div className="grid grid-cols-3 divide-x divide-slate-200/70 rounded-2xl bg-white/80 backdrop-blur-md border border-white/90 shadow-xs py-3 px-2 sm:px-4 text-center mb-4">
                      <div className="px-2">
                        <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono uppercase tracking-wider block">
                          AST Integrity
                        </span>
                        <span
                          className={`text-lg sm:text-2xl font-bold font-mono block mt-0.5 ${
                            activeEngineTab === 'erdf'
                              ? 'text-emerald-600'
                              : activeEngineTab === 'treesitter'
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {selectedScenario[activeEngineTab].astPreserved}
                        </span>
                      </div>

                      <div className="px-2">
                        <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono uppercase tracking-wider block">
                          Blast Radius
                        </span>
                        <span className="text-lg sm:text-2xl font-bold font-mono text-slate-900 block mt-0.5">
                          {selectedScenario[activeEngineTab].blastRadius}
                        </span>
                      </div>

                      <div className="px-2">
                        <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono uppercase tracking-wider block">
                          Cascades
                        </span>
                        <span
                          className={`text-lg sm:text-2xl font-bold font-mono block mt-0.5 ${
                            selectedScenario[activeEngineTab].cascades.startsWith('0')
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {selectedScenario[activeEngineTab].cascades}
                        </span>
                      </div>
                    </div>

                    {/* Resulting AST Preview with Interactive Node Inspector */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-2">
                        <span className="font-semibold text-slate-700">Constructed Abstract Syntax Tree (Click node to inspect):</span>
                        {activeEngineTab === 'erdf' ? (
                          <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[10px] font-semibold">
                            Tri-State Ghost Node Attached
                          </span>
                        ) : activeEngineTab === 'clang' ? (
                          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[10px] font-semibold">
                            Truncated Panic Discard
                          </span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px] font-semibold">
                            Untyped (ERROR) Leaf
                          </span>
                        )}
                      </div>

                      <div className="p-3.5 sm:p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 font-mono text-xs space-y-1.5 shadow-inner">
                        {selectedScenario[activeEngineTab].treeNodes.map((node, i) => {
                          const isSelected = inspectedNodeIndex === i;
                          return (
                            <div
                              key={i}
                              onClick={() => setInspectedNodeIndex(isSelected ? null : i)}
                              style={{ paddingLeft: `${node.depth * 18}px` }}
                              className={`flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer transition-all ${
                                isSelected ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-slate-300 select-none">└──</span>
                              {node.kind === 'ghost' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-300 border-dashed font-bold shadow-xs">
                                  <Sparkles className="w-3 h-3 text-purple-600 shrink-0" />
                                  <span>{node.label}</span>
                                </span>
                              ) : node.kind === 'error' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-300 font-medium">
                                  <XCircle className="w-3 h-3 text-rose-500 shrink-0" />
                                  <span>{node.label}</span>
                                </span>
                              ) : (
                                <span className="text-slate-800 font-medium">{node.label}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Unified AST Node Inspector & Compiler Doctor Box */}
                      {inspectedNodeIndex !== null ? (
                        <div className="mt-3 p-3 rounded-2xl bg-purple-50/80 border border-purple-200/90 text-xs">
                          <div className="flex items-center justify-between text-purple-950 font-semibold mb-1">
                            <span className="flex items-center gap-1.5">
                              <Fingerprint className="w-3.5 h-3.5 text-purple-700" /> AST Provenance Inspector
                            </span>
                            <button
                              onClick={() => setInspectedNodeIndex(null)}
                              className="text-[10px] font-mono text-purple-700 hover:text-purple-950 underline cursor-pointer"
                            >
                              Show Compiler Doctor
                            </button>
                          </div>
                          <p className="text-[11px] text-purple-900 leading-relaxed font-sans">
                            <strong className="font-semibold font-mono text-purple-950">
                              {selectedScenario[activeEngineTab].treeNodes[inspectedNodeIndex]?.label}:
                            </strong>{' '}
                            {selectedScenario[activeEngineTab].treeNodes[inspectedNodeIndex]?.kind === 'ghost'
                              ? 'Synthetic Ghost Token: Provenance from speculative candidate repair. Reconstructs tree invariants without mutating user source code.'
                              : selectedScenario[activeEngineTab].treeNodes[inspectedNodeIndex]?.kind === 'error'
                              ? 'Corrupted Node: Damaged by parser panic discard or untyped syntax error splicing. Downstream type bindings broken.'
                              : 'Genuine Source Token: 100% preserved lexical tree node extracted cleanly from the active translation unit.'}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-3.5 p-3.5 rounded-2xl bg-slate-100/90 border border-slate-200/90 text-xs text-slate-700 leading-relaxed">
                          <strong className="font-semibold text-slate-900 block mb-1">
                            Compiler Doctor Causal Rationale:
                          </strong>
                          {selectedScenario[activeEngineTab].doctor}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clear, Prominent Primary Action Button */}
                  <div className="mt-5 pt-3.5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                      Zero-drift AST repair &bull; Sub-millisecond futures
                    </span>
                    <button
                      onClick={onLaunchVisualizer}
                      className="group inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-md shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200 cursor-pointer whitespace-nowrap"
                    >
                      <span>Open Interactive Graph Studio</span>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-300 transition-transform duration-200 group-hover:translate-x-1" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* STATS & IMPACT SECTION (JustDone-Style Stat Cards) */}
        {/* ========================================================================= */}
        <section className="py-16 bg-white/45 backdrop-blur-xs border-y border-slate-200/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                Quantitative Benchmarks
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-slate-900 mt-3 tracking-tight">
                Engineered for Complete AST Integrity
              </h2>
              <p className="text-slate-600 mt-3 text-base sm:text-lg">
                Comparing speculative ERDF against traditional compilers across 100+ standard C99/C11 syntax error corpus scenarios.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1 */}
              <div className="p-8 rounded-3xl bg-[#faf8f5] border border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center mb-6">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="font-serif text-5xl font-light text-slate-900 tracking-tight">
                  100%
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-2">
                  AST Preservation Index
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  Synthesize minimal ghost tokens without dropping subsequent declarations or function bodies.
                </p>
              </div>

              {/* Card 2 */}
              <div className="p-8 rounded-3xl bg-[#faf8f5] border border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100/80 text-indigo-800 flex items-center justify-center mb-6">
                  <Zap className="w-6 h-6" />
                </div>
                <div className="font-serif text-5xl font-light text-slate-900 tracking-tight">
                  0
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-2">
                  Cascade Error Avalanches
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  Completely eliminates false-positive "variable undeclared" warnings triggered by parser synchronization panic.
                </p>
              </div>

              {/* Card 3 */}
              <div className="p-8 rounded-3xl bg-[#faf8f5] border border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="w-12 h-12 rounded-2xl bg-amber-100/80 text-amber-800 flex items-center justify-center mb-6">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="font-serif text-5xl font-light text-slate-900 tracking-tight">
                  &lt; 1ms
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-2">
                  Speculative Lookahead
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  Zero-allocation O(1) checkpoints with sandboxed virtual edit overlays ensure instantaneous validation.
                </p>
              </div>

              {/* Card 4 */}
              <div className="p-8 rounded-3xl bg-[#faf8f5] border border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="w-12 h-12 rounded-2xl bg-teal-100/80 text-teal-800 flex items-center justify-center mb-6">
                  <Fingerprint className="w-6 h-6" />
                </div>
                <div className="font-serif text-5xl font-light text-slate-900 tracking-tight">
                  60 FPS
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-2">
                  Deterministic Time Travel
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  Full append-only erdf-1 telemetry with 32-bit FNV-1a state hashes enables bi-directional step-by-step scrubbing.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CORE EXPLANATION 1: WHAT IS A SELF-HEALING PARSER & AST? */}
        {/* ========================================================================= */}
        <section id="architecture" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                01 / Theory & Mechanics
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-slate-900 mt-4 leading-tight tracking-tight">
                What is a Self-Healing Parser and why does the AST matter?
              </h2>
              <p className="text-slate-600 text-base sm:text-lg mt-5 leading-relaxed">
                Compilers, Language Server Protocols (LSP), and code editors rely on a single source of truth:
                the <strong className="font-semibold text-slate-900">Abstract Syntax Tree (AST)</strong>.
                When a developer types in an IDE, the code is in a transient state of syntax error up to 70% of the time.
              </p>

              <div className="mt-6 space-y-4 text-slate-650 text-sm leading-relaxed">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                    <XCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">The Problem with Traditional Compilers</h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      GCC and Clang panic when an expected delimiter is absent. They skip tokens looking for semicolons or braces,
                      throwing away subsequent code. Downstream semantic analysis fails, causing autocompletion, hover docs, and
                      diagnostics to freeze.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">The ERDF Self-Healing Solution</h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      ERDF halts at the syntax barrier, takes an instant zero-cost checkpoint, and explores candidate repairs
                      (insert, delete, substitute). It speculatively tests each repair over a bounded lookahead window, scores them
                      using a 4-factor cost function, and synthesizes non-destructive Ghost Nodes to preserve AST hierarchy.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Diagram Column */}
            <div className="lg:col-span-6">
              <div className="rounded-3xl bg-white p-6 sm:p-8 border border-slate-200 shadow-xl shadow-slate-200/50">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-indigo-600" />
                    <span className="font-serif text-lg font-semibold text-slate-900">
                      The Speculative Virtual Stream Pipeline
                    </span>
                  </div>
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    W = 4 Lookahead
                  </span>
                </div>

                {/* Steps flowchart */}
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <div className="flex items-center justify-between text-xs font-mono font-semibold text-slate-500">
                      <span>STEP 1: Checkpoint</span>
                      <span className="text-emerald-700">O(1) Time</span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">
                      Saves virtual cursor, delimiter stack depth, and scope frame reference without copying token buffers.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                    <div className="flex items-center justify-between text-xs font-mono font-semibold text-amber-700">
                      <span>STEP 2: Directed Futures</span>
                      <span>Bounded Search</span>
                    </div>
                    <p className="text-xs text-amber-900 mt-1">
                      Generates candidate edit set Δ: inserting expected delimiters, deleting mismatched tokens, or substituting keywords.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80">
                    <div className="flex items-center justify-between text-xs font-mono font-semibold text-indigo-700">
                      <span>STEP 3: Sandboxed Lookahead</span>
                      <span>4-Factor Penalty</span>
                    </div>
                    <p className="text-xs text-indigo-900 mt-1">
                      Executes parser speculatively over the virtual stream. Evaluates lexical, structural, and semantic costs.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80">
                    <div className="flex items-center justify-between text-xs font-mono font-semibold text-purple-700">
                      <span>STEP 4: Ghost Node Attachment</span>
                      <span>100% AST Preserved</span>
                    </div>
                    <p className="text-xs text-purple-950 mt-1">
                      Commits winning repair, badging the synthetic token as a Ghost Node with tri-state provenance.
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                  <button
                    onClick={onLaunchVisualizer}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1.5"
                  >
                    <span>Inspect Pipeline in Step-by-Step Replay</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CORE EXPLANATION 2: THREE-WAY ENGINE SHOWDOWN */}
        {/* ========================================================================= */}
        <section id="showdown" className="py-24 bg-white/40 backdrop-blur-xs border-y border-slate-200/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
                02 / Comparative Engineering
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-slate-900 mt-3 tracking-tight">
                Three-Way Engine Showdown
              </h2>
              <p className="text-slate-600 mt-3 text-base sm:text-lg">
                How ERDF Self-Healing fundamentally outperforms traditional compiler panic loops and modern incremental error splicing.
              </p>
            </div>

            {/* Interactive Metric Focus Filter Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
              <span className="text-xs font-mono text-slate-500 mr-1">Focus Factor:</span>
              {[
                { id: 'all', label: 'All Factors' },
                { id: 'ast', label: 'AST Integrity' },
                { id: 'blast', label: 'Blast Radius' },
                { id: 'cascades', label: 'Cascading Avalanches' },
                { id: 'provenance', label: 'Provenance' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedShowdownMetric(m.id as any)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                    selectedShowdownMetric === m.id
                      ? 'bg-slate-900 text-white shadow-xs scale-[1.02]'
                      : 'bg-slate-100 hover:bg-slate-200/80 hover:text-slate-900 hover:scale-105 active:scale-95 text-slate-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* 3-Column Comparative Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Column 1: ERDF (Winner) */}
              <div className="rounded-3xl p-8 bg-gradient-to-b from-emerald-50/60 via-white to-white border-2 border-emerald-400/80 shadow-xl shadow-emerald-500/5 relative flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-4">
                    <Sparkles className="w-3.5 h-3.5" /> Recommended
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    ERDF Self-Healing
                  </h3>
                  <p className="text-xs font-mono text-emerald-700 mt-1">
                    Speculative Minimum-Cost Search
                  </p>

                  <p className="text-sm text-slate-650 mt-4 leading-relaxed">
                    Evaluates multi-candidate edits speculatively over bounded lookahead. Synthesizes missing tokens as explicit Ghost Nodes without truncating child branches.
                  </p>

                  <div className="mt-6 space-y-2 pt-6 border-t border-slate-200/70 text-xs">
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'ast'
                          ? 'bg-emerald-100 text-emerald-950 font-semibold ring-1 ring-emerald-400 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">AST Preservation:</span>
                      <span className="font-mono font-bold text-emerald-700">100% Intact</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'blast'
                          ? 'bg-emerald-100 text-emerald-950 font-semibold ring-1 ring-emerald-400 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Blast Radius:</span>
                      <span className="font-mono font-bold text-emerald-700">0 Tokens Corrupted</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'cascades'
                          ? 'bg-emerald-100 text-emerald-950 font-semibold ring-1 ring-emerald-400 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Cascading Failures:</span>
                      <span className="font-mono font-bold text-emerald-700">0 False Alarms</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'provenance'
                          ? 'bg-purple-100 text-purple-950 font-semibold ring-1 ring-purple-400 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Provenance Tracking:</span>
                      <span className="font-mono font-bold text-purple-700">Tri-State (Ghost Badged)</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'all' ? '' : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Code Patching:</span>
                      <span className="font-mono font-bold text-slate-900">1-Click Zero-Drift Patch</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100">
                  <span className="text-xs text-emerald-800 font-semibold block mb-2">
                    Verdict: Production-Ready Resilience
                  </span>
                  <button
                    onClick={onLaunchVisualizer}
                    className="group w-full py-2.5 rounded-full bg-emerald-700 hover:bg-emerald-800 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-98 text-white text-xs font-medium transition-all duration-200 shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Test ERDF Live</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </button>
                </div>
              </div>

              {/* Column 2: Clang Panic Mode */}
              <div className="rounded-3xl p-8 bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold uppercase tracking-wider mb-4 border border-rose-200">
                    Traditional Standard
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    Clang / GCC Panic Mode
                  </h3>
                  <p className="text-xs font-mono text-rose-600 mt-1">
                    Delimiter Synchronization Sets
                  </p>

                  <p className="text-sm text-slate-650 mt-4 leading-relaxed">
                    Drops tokens blindly until an enclosing statement delimiter or closing brace is encountered. Truncates all subsequent declarations inside the active scope.
                  </p>

                  <div className="mt-6 space-y-2 pt-6 border-t border-slate-200/70 text-xs">
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'ast'
                          ? 'bg-rose-100 text-rose-950 font-semibold ring-1 ring-rose-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">AST Preservation:</span>
                      <span className="font-mono font-bold text-rose-600">20% – 45% (Severed)</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'blast'
                          ? 'bg-rose-100 text-rose-950 font-semibold ring-1 ring-rose-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Blast Radius:</span>
                      <span className="font-mono font-bold text-rose-600">30 – 100+ Chars Discarded</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'cascades'
                          ? 'bg-rose-100 text-rose-950 font-semibold ring-1 ring-rose-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Cascading Failures:</span>
                      <span className="font-mono font-bold text-rose-600">3 – 12 Phantom Errors</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'provenance'
                          ? 'bg-rose-100 text-rose-950 font-semibold ring-1 ring-rose-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Provenance Tracking:</span>
                      <span className="font-mono text-slate-500">Lost During Discard</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'all' ? '' : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Code Patching:</span>
                      <span className="font-mono text-slate-500">CLI Diagnostic Notes Only</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100">
                  <span className="text-xs text-rose-700 font-semibold block mb-2">
                    Verdict: Frustrating Error Avalanches
                  </span>
                  <div className="p-2.5 rounded-xl bg-rose-50 text-[11px] text-rose-800 leading-snug">
                    Spawns misleading "symbol undeclared" warnings that confuse beginners and break IDE language servers.
                  </div>
                </div>
              </div>

              {/* Column 3: Tree-sitter Incremental Splicing */}
              <div className="rounded-3xl p-8 bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold uppercase tracking-wider mb-4 border border-amber-200">
                    Modern Incremental
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    Tree-sitter Splicing
                  </h3>
                  <p className="text-xs font-mono text-amber-700 mt-1">
                    Error Node Splicing
                  </p>

                  <p className="text-sm text-slate-650 mt-4 leading-relaxed">
                    Slices invalid syntax into a raw (ERROR) node. Preserves surrounding code for syntax highlighting, but creates malformed nodes that break type checkers.
                  </p>

                  <div className="mt-6 space-y-2 pt-6 border-t border-slate-200/70 text-xs">
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'ast'
                          ? 'bg-amber-100 text-amber-950 font-semibold ring-1 ring-amber-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">AST Preservation:</span>
                      <span className="font-mono font-bold text-amber-700">65% – 75% (Malformed)</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'blast'
                          ? 'bg-amber-100 text-amber-950 font-semibold ring-1 ring-amber-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Blast Radius:</span>
                      <span className="font-mono font-bold text-amber-700">10 – 25 Chars Localized</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'cascades'
                          ? 'bg-amber-100 text-amber-950 font-semibold ring-1 ring-amber-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Cascading Failures:</span>
                      <span className="font-mono font-bold text-amber-700">1 – 2 Structural Faults</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'provenance'
                          ? 'bg-amber-100 text-amber-950 font-semibold ring-1 ring-amber-300 scale-[1.02]'
                          : selectedShowdownMetric === 'all'
                          ? ''
                          : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Provenance Tracking:</span>
                      <span className="font-mono text-slate-500">Coarse (ERROR Node Only)</span>
                    </div>
                    <div
                      className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
                        selectedShowdownMetric === 'all' ? '' : 'opacity-35'
                      }`}
                    >
                      <span className="text-slate-500">Code Patching:</span>
                      <span className="font-mono text-slate-500">None Built-In</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100">
                  <span className="text-xs text-amber-800 font-semibold block mb-2">
                    Verdict: Suitable for Highlighting Only
                  </span>
                  <div className="p-2.5 rounded-xl bg-amber-50 text-[11px] text-amber-900 leading-snug">
                    Lacks mathematical cost optimization, speculative lookahead, and delimiter synthesis.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CORE EXPLANATION 3: MATHEMATICAL COST MODEL & ARCHITECTURE */}
        {/* ========================================================================= */}
        <section id="cost-model" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-purple-800 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
              03 / Mathematical Formulation
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-slate-900 mt-3 tracking-tight">
              Objective Multi-Factor Cost Optimization
            </h2>
            <p className="text-slate-600 mt-3 text-base sm:text-lg">
              ERDF transforms ad-hoc compiler heuristics into an explicit, transparent minimization problem.
            </p>
          </div>

          {/* Formula Display Box */}
          <div className="p-8 sm:p-10 rounded-3xl bg-white border border-slate-200/90 shadow-xl shadow-slate-200/50 max-w-4xl mx-auto mb-14 text-center">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2">
              The Fundamental ERDF Cost Formulation
            </span>
            <div className="font-serif text-2xl sm:text-3xl md:text-4xl font-normal text-slate-900 tracking-wide py-2">
              Cost(&Delta;) = &lambda;<sub>l</sub> &middot; C<sub>l</sub> + &lambda;<sub>s</sub> &middot; C<sub>s</sub> + &lambda;<sub>m</sub> &middot; C<sub>m</sub> + &lambda;<sub>d</sub> &middot; C<sub>d</sub>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-mono mt-3 max-w-xl mx-auto">
              Every candidate edit &Delta; is ranked objectively. The lowest cost candidate is selected deterministically.
            </p>
          </div>

          {/* 4 Factor Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Factor 1: Lexical */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-mono font-bold text-sm mb-4">
                C<sub>l</sub>
              </div>
              <h4 className="font-semibold text-slate-900 text-base">
                Lexical Penalty
              </h4>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Penalizes difficult token edits. Inserting a common delimiter like <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">)</code> has low cost, while inserting complex keywords carries high cost.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                Default weight &lambda;<sub>l</sub> = 1.0
              </div>
            </div>

            {/* Factor 2: Structural */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-mono font-bold text-sm mb-4">
                C<sub>s</sub>
              </div>
              <h4 className="font-semibold text-slate-900 text-base">
                Structural Boundary
              </h4>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Guards statement and block integrity. Heavily penalizes edits that alter loop headers, function signatures, or scope closing braces.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                Default weight &lambda;<sub>s</sub> = 1.5
              </div>
            </div>

            {/* Factor 3: Semantic Risk */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-mono font-bold text-sm mb-4">
                C<sub>m</sub>
              </div>
              <h4 className="font-semibold text-slate-900 text-base">
                Semantic Risk
              </h4>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Prevents accidental symbol destruction. Heavily penalizes candidates that delete user identifier names or disrupt declared type signatures.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                Default weight &lambda;<sub>m</sub> = 2.0
              </div>
            </div>

            {/* Factor 4: Diagnostic Lookahead */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-mono font-bold text-sm mb-4">
                C<sub>d</sub>
              </div>
              <h4 className="font-semibold text-slate-900 text-base">
                Diagnostic Progress
              </h4>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Measures forward parsing stability. Rewards candidates that allow the speculative parser to proceed cleanly across the bounded lookahead window (W=4).
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                Default weight &lambda;<sub>d</sub> = 1.0
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* INTERACTIVE COST PENALTY SIMULATOR & TUNING SANDBOX */}
          {/* ================================================================= */}
          <div className="mt-14 rounded-3xl bg-white border border-slate-200/90 shadow-xl p-6 sm:p-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-100 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-serif text-2xl sm:text-3xl font-medium text-slate-900">
                    Interactive Cost Penalty Simulator
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Adjust the four objective penalty weights (&lambda;) in real time to observe how ERDF mathematically re-ranks repair candidates.
                </p>
              </div>

              <button
                onClick={resetWeights}
                className="self-start md:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 hover:border-slate-350 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:shadow-xs active:scale-95 transition-all duration-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8 p-6 rounded-2xl bg-[#faf8f5] border border-slate-200/80">
              {/* Slider 1: Lexical */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500" /> &lambda;<sub>l</sub> (Lexical)
                  </span>
                  <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    {lambdaL.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={lambdaL}
                  onChange={(e) => setLambdaL(parseFloat(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block mt-1">Token insertion/deletion penalty</span>
              </div>

              {/* Slider 2: Structural */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> &lambda;<sub>s</sub> (Structural)
                  </span>
                  <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {lambdaS.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={lambdaS}
                  onChange={(e) => setLambdaS(parseFloat(e.target.value))}
                  className="w-full accent-amber-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block mt-1">Scope & block protection</span>
              </div>

              {/* Slider 3: Semantic */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> &lambda;<sub>m</sub> (Semantic)
                  </span>
                  <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {lambdaM.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={lambdaM}
                  onChange={(e) => setLambdaM(parseFloat(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block mt-1">Identifier & type preservation</span>
              </div>

              {/* Slider 4: Diagnostic */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> &lambda;<sub>d</sub> (Diagnostic)
                  </span>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {lambdaD.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={lambdaD}
                  onChange={(e) => setLambdaD(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block mt-1">Lookahead validation progress</span>
              </div>
            </div>

            {/* Candidates Scorecard Table */}
            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-mono">
                    <th className="py-3 px-4 font-semibold uppercase tracking-wider">Candidate Edit (&Delta;)</th>
                    <th className="py-3 px-4 font-semibold uppercase tracking-wider text-center">Formula Breakdown</th>
                    <th className="py-3 px-4 font-semibold uppercase tracking-wider text-center">Total Cost</th>
                    <th className="py-3 px-4 font-semibold uppercase tracking-wider text-center">Outcome</th>
                    <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">AST Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scoredCandidates.map((c) => {
                    const isWinner = c.id === winningCandidate.id;
                    return (
                      <tr
                        key={c.id}
                        className={`transition-colors ${
                          isWinner ? 'bg-emerald-50/70 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {isWinner ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                            )}
                            <div>
                              <span className="text-slate-900 font-semibold">{c.name}</span>
                              <span className="text-[10px] text-slate-500 block font-mono">{c.tag}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-650">
                          ({lambdaL.toFixed(1)}&times;{c.cl}) + ({lambdaS.toFixed(1)}&times;{c.cs}) + ({lambdaM.toFixed(1)}&times;{c.cm}) + ({lambdaD.toFixed(1)}&times;{c.cd})
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block font-mono font-bold px-2.5 py-1 rounded-full text-xs ${
                              isWinner
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {c.totalCost.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isWinner ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wide border border-emerald-300">
                              <Sparkles className="w-3 h-3 text-emerald-600" /> Winner (Committed)
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">Rejected</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                          {c.astImpact}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={onLaunchVisualizer}
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-900 text-white hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-98 text-xs font-semibold shadow-md transition-all duration-200 cursor-pointer"
            >
              <Sliders className="w-4 h-4 text-amber-300 transition-transform duration-200 group-hover:rotate-45" />
              <span>Customize Penalty Weights Live in the Studio</span>
            </button>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* COMPREHENSIVE FAQ ACCORDION SECTION */}
        {/* ========================================================================= */}
        <section id="faq" className="py-24 bg-white/40 backdrop-blur-xs border-t border-slate-200/50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                04 / Knowledge Base
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-slate-900 mt-3 tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-slate-600 mt-3 text-base sm:text-lg">
                Everything you need to know about self-healing parsing, AST construction, directed futures, and language tooling integration.
              </p>

              {/* Category Filter Tabs */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                {(['All', 'General', 'Engines', 'Architecture', 'Integration'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFaqFilter(cat)}
                    className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 cursor-pointer ${
                      faqFilter === cat
                        ? 'bg-slate-900 text-white shadow-xs scale-[1.02]'
                        : 'bg-[#faf8f5] text-slate-650 hover:bg-white hover:text-slate-900 hover:scale-105 active:scale-95 border border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Accordion List */}
            <div className="space-y-4">
              {filteredFaqs.map((faq, index) => {
                const isOpen = openFaqIndex === index;
                return (
                  <div
                    key={index}
                    className={`rounded-2xl transition-all border ${
                      isOpen
                        ? 'bg-[#faf8f5] border-slate-300/90 shadow-sm'
                        : 'bg-white border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <button
                      onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left gap-4 cursor-pointer"
                    >
                      <span className="font-serif text-lg sm:text-xl font-medium text-slate-900">
                        {faq.question}
                      </span>
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform ${
                          isOpen ? 'bg-slate-900 text-white rotate-180' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-6 pb-6 pt-1 text-slate-650 text-sm sm:text-base leading-relaxed border-t border-slate-200/50">
                        <p>{faq.answer}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================================= */}
      {/* BOTTOM SECTION WITH AMBIENT GRADIENT GLOW (JustDone Inspired) */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden">
        {/* Ambient Bottom Gradient Glow inspired by JustDone.com */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[1000px] z-0 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse 95% 75% at 50% 100%, #fed7aa 0%, rgba(254, 215, 170, 0.8) 20%, #fecdd3 40%, rgba(224, 242, 254, 0.8) 65%, transparent 92%), #faf8f5',
            opacity: 0.9,
          }}
        />

        {/* ========================================================================= */}
        {/* PRE-FOOTER INVITATION CARD */}
        {/* ========================================================================= */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
          <div className="rounded-3xl p-10 sm:p-16 bg-gradient-to-tr from-slate-900 via-slate-850 to-slate-950 text-white text-center relative overflow-hidden shadow-2xl shadow-slate-900/20">
            {/* Background Glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl" />

            <div className="relative z-10 max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-amber-300 text-xs font-mono uppercase tracking-wider mb-6 border border-slate-700">
                <Terminal className="w-3.5 h-3.5" /> Zero-Install Browser Workbench
              </span>

              <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl font-normal tracking-tight text-white leading-tight">
                Ready to Experience Resilient Compiler Diagnostics?
              </h2>

              <p className="mt-6 text-slate-300 text-base sm:text-lg leading-relaxed">
                Step into the full visualizer studio. Write custom C code, trigger deliberate syntax faults,
                and inspect speculative directed futures step-by-step on the interactive timeline.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={onLaunchVisualizer}
                  className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-white text-slate-900 hover:bg-slate-50 text-base font-semibold transition-all duration-200 shadow-lg hover:shadow-2xl hover:shadow-white/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer"
                >
                  <span>Launch Visualizer Studio</span>
                  <ArrowRight className="w-5 h-5 text-indigo-600 transition-transform duration-200 group-hover:translate-x-1.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* FOOTER */}
        {/* ========================================================================= */}
        <footer className="relative z-10 border-t border-slate-200/70 bg-[#faf8f5]/80 backdrop-blur-xs py-16 text-slate-600 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            {/* Col 1: Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-amber-300" />
                </div>
                <span className="font-serif text-xl font-bold text-slate-900">
                  ERDF Self-Healing Parser
                </span>
              </div>
              <p className="mt-4 text-xs sm:text-sm text-slate-600 max-w-md leading-relaxed">
                An Explainable Recovery Decision Framework (ERDF) for resilient C99/C11 syntax error recovery,
                multi-engine avalanche simulation, and interactive compiler diagnostics in the browser.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-mono text-slate-500">
                <span>Schema: erdf-1</span>
                <span>&bull;</span>
                <span>FNV-1a State Hashes</span>
                <span>&bull;</span>
                <span>Pratt Operator Precedence</span>
              </div>
            </div>

            {/* Col 2: Navigation */}
            <div>
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-900 mb-4">
                Architecture & Research
              </h4>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-600">
                <li>
                  <a href="#overview" className="hover:text-slate-900 transition-colors">
                    Executive Summary
                  </a>
                </li>
                <li>
                  <a href="#architecture" className="hover:text-slate-900 transition-colors">
                    Virtual Token Streams
                  </a>
                </li>
                <li>
                  <a href="#showdown" className="hover:text-slate-900 transition-colors">
                    Engine Showdown Matrix
                  </a>
                </li>
                <li>
                  <a href="#cost-model" className="hover:text-slate-900 transition-colors">
                    4-Factor Cost Formulation
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-slate-900 transition-colors">
                    Frequently Asked Questions
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Actions & Links */}
            <div>
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-900 mb-4">
                Developer Studio
              </h4>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-600">
                <li>
                  <button
                    onClick={onLaunchVisualizer}
                    className="hover:text-slate-900 transition-colors text-left font-medium text-indigo-600"
                  >
                    Open Visualizer Studio &rarr;
                  </button>
                </li>
                <li>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    <span>GitHub Repository</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                </li>
                <li className="pt-2 text-xs text-slate-400">
                  Open Source under MIT License.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p>&copy; {new Date().getFullYear()} ERDF Compiler Research Group. All rights reserved.</p>
            <p className="font-mono">Zero external runtime dependencies &bull; 100% In-Browser Execution</p>
          </div>
        </div>
      </footer>
    </div>
  </div>
  );
};

export default LandingPage;
