import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Landing Page Structure, Typography, Content & Integration', () => {
  const landingPagePath = join(process.cwd(), 'src/ui/components/LandingPage.tsx');
  const appPath = join(process.cwd(), 'src/App.tsx');
  const topBarPath = join(process.cwd(), 'src/ui/components/TopBar.tsx');
  const indexCssPath = join(process.cwd(), 'src/index.css');

  it('LandingPage component file exists', () => {
    expect(existsSync(landingPagePath)).toBe(true);
  });

  it('LandingPage has NO login button and strictly uses light theme styling', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // No login button
    expect(content.toLowerCase()).not.toContain('sign in');
    expect(content.toLowerCase()).not.toContain('sign up');
    expect(content.toLowerCase()).not.toContain('log in');
    expect(content.toLowerCase()).not.toContain('login');

    // No dark theme toggle on the landing page
    expect(content).not.toContain('toggleTheme');
    expect(content).not.toContain('aria-label="Toggle Theme"');

    // Uses light background
    expect(content).toContain('bg-[#faf8f5]');
  });

  it('declares Cormorant Garamond font-face in index.css with variable and static weights', () => {
    const cssContent = readFileSync(indexCssPath, 'utf-8');

    expect(cssContent).toContain("font-family: 'Cormorant Garamond'");
    expect(cssContent).toContain('CormorantGaramond-VariableFont_wght.ttf');
    expect(cssContent).toContain('CormorantGaramond-Italic-VariableFont_wght.ttf');
    expect(cssContent).toContain('--font-serif:');
    expect(cssContent).toContain('.font-serif');
  });

  it('LandingPage uses Cormorant Garamond (font-serif) for prominent display headings', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Uses font-serif with large elegant display sizing
    expect(content).toContain('font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl');
    expect(content).toContain('The Self-Healing C Compiler That');
    expect(content).toContain('Never Panics');
  });

  it('includes required header navbar components: project title, nav links, balanced CTA buttons, with subtitle and badges removed', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Title present, subtitle and badge removed from header
    expect(content).toContain('ERDF Self-Healing Parser');
    expect(content).not.toContain('AST Error Recovery &bull; Outperforming Clang & Tree-sitter');

    // Navigation links
    expect(content).toContain('href="#overview"');
    expect(content).toContain('href="#architecture"');
    expect(content).toContain('href="#showdown"');
    expect(content).toContain('href="#cost-model"');
    expect(content).toContain('href="#faq"');

    // CTA buttons calling onLaunchVisualizer and opening Core Concepts modal
    expect(content).toContain('Launch Visualizer');
    expect(content).toContain('Core Concepts');
    expect(content).toContain('onLaunchVisualizer');
  });

  it('has removed the top Core Thesis banner completely while keeping the interactive Core Concepts modal', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Top Explainer Banner in header removed
    expect(content).not.toContain('Core Thesis');
    expect(content).not.toContain('Top Architectural Announcement & Explanation Banner');

    // Interactive Core Concepts Explainer Modal in header
    expect(content).toContain('Header Architectural Guide');
    expect(content).toContain('What is a Self-Healing Parser & AST?');
    expect(content).toContain('Why Clang Panic Mode Causes Cascading Avalanches');
    expect(content).toContain('Why Tree-sitter Splicing Breaks Semantic Invariants');
    expect(content).toContain('How ERDF Directed Futures Solve This');
    expect(content).toContain('isQuickExplainerOpen');
  });

  it('hero heading has clean Cormorant Garamond serif without yellow wavy underline and removes eyebrow pill', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Eyebrow pill removed
    expect(content).not.toContain('Next-Generation Compiler Diagnostics & AST Healing');

    // Never Panics has no wavy underline
    expect(content).not.toContain('decoration-wavy');
    expect(content).not.toContain('decoration-amber-400');
    expect(content).toContain('Never Panics');
  });

  it('features ambient bottom gradient glow inspired by JustDone.com', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    expect(content).toContain('Ambient Bottom Gradient Glow inspired by JustDone.com');
  });

  it('includes rich interactive UI/UX components: simulation trigger, copy code, AST node inspector, and interactive cost tuner', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    expect(content).toContain('Interactive Cost Penalty Simulator');
    expect(content).toContain('Simulate Healing Decision Process');
    expect(content).toContain('AST Provenance Inspector');
    expect(content).toContain('Focus Factor:');
    expect(content).toContain('Reset Defaults');
  });

  it('provides responsive mobile navigation menu', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    expect(content).toContain('isMobileMenuOpen');
    expect(content).toContain('Toggle Navigation Menu');
    expect(content).toContain('Mobile Navigation Drawer');
  });

  it('declares comprehensive static Cormorant Garamond font weights and italics in index.css', () => {
    const cssContent = readFileSync(indexCssPath, 'utf-8');

    expect(cssContent).toContain("font-family: 'Cormorant Garamond'");
    expect(cssContent).toContain('CormorantGaramond-VariableFont_wght.ttf');
    expect(cssContent).toContain('CormorantGaramond-Italic-VariableFont_wght.ttf');
    expect(cssContent).toContain('CormorantGaramond-Light.ttf');
    expect(cssContent).toContain('CormorantGaramond-LightItalic.ttf');
    expect(cssContent).toContain('CormorantGaramond-Regular.ttf');
    expect(cssContent).toContain('CormorantGaramond-Italic.ttf');
    expect(cssContent).toContain('CormorantGaramond-Medium.ttf');
    expect(cssContent).toContain('CormorantGaramond-MediumItalic.ttf');
    expect(cssContent).toContain('CormorantGaramond-SemiBold.ttf');
    expect(cssContent).toContain('CormorantGaramond-SemiBoldItalic.ttf');
    expect(cssContent).toContain('CormorantGaramond-Bold.ttf');
    expect(cssContent).toContain('CormorantGaramond-BoldItalic.ttf');
  });

  it('includes thorough explanation of Self-Healing Parser, AST, Clang Panic Mode, and Tree-sitter Splicing', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Self-healing & AST explanations
    expect(content).toContain('What is a Self-Healing Parser and why does the AST matter?');
    expect(content).toContain('Abstract Syntax Tree (AST)');
    expect(content).toContain('Language Server Protocols (LSP)');

    // Three-Way Showdown
    expect(content).toContain('Three-Way Engine Showdown');
    expect(content).toContain('ERDF Self-Healing');
    expect(content).toContain('Clang / GCC Panic Mode');
    expect(content).toContain('Tree-sitter Splicing');
    expect(content).toContain('Delimiter Synchronization Sets');
    expect(content).toContain('Error Node Splicing');

    // Mathematical Cost Model
    expect(content).toContain('Objective Multi-Factor Cost Optimization');
    expect(content).toContain('Cost(&Delta;) = &lambda;');
    expect(content).toContain('Lexical Penalty');
    expect(content).toContain('Structural Boundary');
    expect(content).toContain('Semantic Risk');
    expect(content).toContain('Diagnostic Progress');
  });

  it('features a comprehensive FAQ accordion explaining AST, directed futures, Clang, and Tree-sitter', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    expect(content).toContain('Frequently Asked Questions');
    expect(content).toContain('What is a Self-Healing Parser and why is it needed?');
    expect(content).toContain('What is an Abstract Syntax Tree (AST) and why do syntax errors corrupt it?');
    expect(content).toContain('How does ERDF compare to Clang Panic Mode?');
    expect(content).toContain('How does ERDF compare to Tree-sitter Incremental Splicing?');
    expect(content).toContain('How does ERDF eliminate cascading error avalanches?');
    expect(content).toContain('What are "Directed Futures" and how does speculative lookahead work?');
    expect(content).toContain('What is the Multi-Factor Mathematical Cost Model?');
    expect(content).toContain('What is the difference between a "Ghost Node" and a "Partial Node"?');
  });

  it('includes circular/stat metric cards inspired by JustDone', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    expect(content).toContain('100%');
    expect(content).toContain('AST Preservation Index');
    expect(content).toContain('0');
    expect(content).toContain('Cascade Error Avalanches');
    expect(content).toContain('&lt; 1ms');
    expect(content).toContain('Speculative Lookahead');
    expect(content).toContain('60 FPS');
    expect(content).toContain('Deterministic Time Travel');
  });

  it('App.tsx and LandingPage.tsx enforce strictly light theme and view switcher navigation', () => {
    const appContent = readFileSync(appPath, 'utf-8');

    expect(appContent).toContain("import { LandingPage } from './ui/components/LandingPage'");
    expect(appContent).toContain('showLanding');
    expect(appContent).toContain('setShowLanding');
    expect(appContent).toContain('syncDocumentTheme');
    expect(appContent).toContain("syncDocumentTheme('light')");
    expect(appContent).toContain('<LandingPage onLaunchVisualizer={handleLaunchVisualizer} />');
    expect(appContent).toContain('onBackToLanding={handleBackToLanding}');

    const landingContent = readFileSync(landingPagePath, 'utf-8');
    expect(landingContent).toContain("syncDocumentTheme('light')");

    const topBarContent = readFileSync(topBarPath, 'utf-8');
    expect(topBarContent).toContain('onBackToLanding');
    expect(topBarContent).toContain('title="Return to Landing Page"');
  });

  it('header navbar enforces single-line flex-nowrap, balanced button dimensions, and mobile drawer actions', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Header container enforces flex-nowrap to prevent wrapping onto 2 lines
    expect(content).toContain('flex-nowrap');

    // Nav links are single-line whitespace-nowrap
    expect(content).toContain('whitespace-nowrap');

    // Balanced button dimensions (h-10, rounded-full)
    expect(content).toContain('h-10 px-4 rounded-full border border-slate-300');
    expect(content).toContain('h-10 px-4 sm:px-5 rounded-full border border-transparent');

    // Mobile navigation drawer contains both Launch Visualizer and Core Concepts
    expect(content).toContain('Mobile Navigation Drawer');
    expect(content).toContain('Open Core Concepts Explainer');
    expect(content).toContain('onClick={() => {\n                  setIsMobileMenuOpen(false);\n                  onLaunchVisualizer();\n                }}');
  });

  it('three-way showdown dynamically highlights metrics based on selectedShowdownMetric', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Shows dynamic metric focus highlighting in showdown cards
    expect(content).toContain("selectedShowdownMetric === 'ast'");
    expect(content).toContain("selectedShowdownMetric === 'blast'");
    expect(content).toContain("selectedShowdownMetric === 'cascades'");
    expect(content).toContain("selectedShowdownMetric === 'provenance'");
    expect(content).toContain('ring-emerald-400 scale-[1.02]');
  });

  it('features prominent fixed JustDone-inspired ambient pastel gradient with required palette (#fed7aa, #fef3c7, #fecdd3, #e0f2fe over #faf8f5)', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Fixed full-viewport gradient container
    expect(content).toContain('fixed inset-0 z-0');
    // Required pastel palette colors present in gradient styling
    expect(content).toContain('#fed7aa');
    expect(content).toContain('#fef3c7');
    expect(content).toContain('#fecdd3');
    expect(content).toContain('#e0f2fe');
    expect(content).toContain('#faf8f5');

    // Ambient glow halo behind hero showcase card
    expect(content).toContain('Ambient Pastel Glow Halo behind Hero Showcase Card');
  });

  it('has removed the 4-column feature highlights strip from the hero section', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Stripped phrases
    expect(content).not.toContain('Zero Allocation Checkpoints');
    expect(content).not.toContain('O(1) speculative lookahead over virtual token streams');
    expect(content).not.toContain('0 Cascade Failures');
    expect(content).not.toContain('Eliminates phantom diagnostics downstream');
    expect(content).not.toContain('Tri-State AST Provenance\nSource, Ghost, and Partial node tracking');
    expect(content).not.toContain('1-Click Codebase Patch\nZero-drift character replacement engine');
  });

  it('TopBar has no explicit [ <- Landing ] button box and logo acts as seamless button', () => {
    const topBarContent = readFileSync(topBarPath, 'utf-8');

    // Logo button properties
    expect(topBarContent).toContain('onClick={onBackToLanding}');
    expect(topBarContent).toContain('bg-transparent border-0 p-0');
    expect(topBarContent).toContain('cursor-pointer');

    // No explicit button layout or box for landing redirect
    expect(topBarContent).not.toContain('<- Landing');
    expect(topBarContent).not.toContain('[ <- Landing ]');
    expect(topBarContent).not.toContain('ArrowLeft');
  });

  it('redesigns Hero showcase card with frosted glass, high visibility, and generous breathing room', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Modern frosted glass card styling with high visibility
    expect(content).toContain('Frosted Glass Showcase Card Container with High Visibility');
    expect(content).toContain('rounded-3xl bg-white/80 backdrop-blur-xl border border-white/80');
    expect(content).toContain('shadow-[0_25px_60px_-15px_rgba(15,23,42,0.08),0_0_0_1px_rgba(255,255,255,0.9)_inset]');

    // Ambient halo glow behind showcase card
    expect(content).toContain('Ambient Pastel Glow Halo behind Hero Showcase Card');
  });

  it('redesigns example menu as a sleek single-row horizontal segmented tab bar with concise labels', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // Single-row horizontal segmented tab bar
    expect(content).toContain('Sleek Single-Row Horizontal Segmented Tab Bar Example Menu');
    expect(content).toContain('rounded-full border border-slate-200/70 shadow-inner');
    expect(content).toContain('whitespace-nowrap');

    // Concise, clear labels
    expect(content).toContain("shortLabel: \"Missing ')'\"");
    expect(content).toContain("shortLabel: \"Missing ';'\"");
    expect(content).toContain("shortLabel: \"Missing '}'\"");
    expect(content).toContain("shortLabel: 'Loop Typo'");

    // Active state pill
    expect(content).toContain("bg-white text-slate-900 font-semibold shadow-xs ring-1 ring-slate-200/80");
  });

  it('includes elegant 3-engine toggle and streamlined interactive comparison layout', () => {
    const content = readFileSync(landingPagePath, 'utf-8');

    // 3-engine toggle bar with rounded-full pills and mobile overflow handling
    expect(content).toContain('Elegant 3-Engine Segmented Comparison Toggle Bar');
    expect(content).toContain('Compare Recovery Engine:');
    expect(content).toContain('ERDF Self-Healing');
    expect(content).toContain('Clang Panic');
    expect(content).toContain('Tree-sitter');
    expect(content).toContain('rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap');

    // High-contrast code panel
    expect(content).toContain('bg-slate-950 text-slate-100');
    expect(content).toContain('Syntax Error');

    // Interactive AST tree with inspection and primary action button
    expect(content).toContain('Simulate Healing Decision Process');
    expect(content).toContain('Constructed Abstract Syntax Tree (Click node to inspect):');
    expect(content).toContain('AST Provenance Inspector');
    expect(content).toContain('Open Interactive Graph Studio');

    // Unified single-ribbon 3-metric HUD eliminating nested box clutter
    expect(content).toContain('grid grid-cols-3 divide-x divide-slate-200/70 rounded-2xl bg-white/80 backdrop-blur-md');

    // Contextual engine recovery banners for all 3 engines
    expect(content).toContain('ERDF Minimum-Cost Repair:');
    expect(content).toContain('Clang Panic-Mode Recovery:');
    expect(content).toContain('Tree-sitter Incremental Splicing:');

    // Unified AST Node Inspector and Compiler Doctor panel
    expect(content).toContain('Unified AST Node Inspector & Compiler Doctor Box');
    expect(content).toContain('Show Compiler Doctor');
    expect(content).toContain('Compiler Doctor Causal Rationale:');

    // Single prominent action button (duplicate Inspect in Full Studio button removed)
    expect(content).not.toContain('Inspect in Full Studio &rarr;');
  });
});

