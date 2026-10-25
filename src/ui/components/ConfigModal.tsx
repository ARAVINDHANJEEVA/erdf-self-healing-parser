import React from 'react';
import { useReplayStore } from '../../state/replayStore';
import { X, Sliders, RotateCcw } from 'lucide-react';
import { DEFAULT_CONFIG } from '../../config/defaultConfig';

export interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) => {
  const { config, setConfig } = useReplayStore();

  if (!isOpen) return null;

  const applyPreset = (preset: 'balanced' | 'conservative' | 'aggressive') => {
    if (preset === 'balanced') {
      setConfig(DEFAULT_CONFIG);
    } else if (preset === 'conservative') {
      setConfig({
        weights: { structural: 5.0, semanticRisk: 6.0, diagnostic: 4.0 },
        budgets: { maxCost: 15.0, maxEdits: 1, maxExploredStates: 40, lookaheadWindow: 5 },
      });
    } else if (preset === 'aggressive') {
      setConfig({
        weights: { structural: 1.5, semanticRisk: 2.0, diagnostic: 1.5 },
        budgets: { maxCost: 35.0, maxEdits: 2, maxExploredStates: 80, lookaheadWindow: 3 },
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-[#080d1a] border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col text-slate-800 dark:text-slate-200 text-xs font-mono">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 font-sans">
              Recovery Cost Weights & Budgets
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Presets Bar */}
        <div className="px-4 py-2.5 bg-slate-100/60 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-[11px] whitespace-nowrap overflow-x-auto scrollbar-none">
          <span className="text-slate-600 dark:text-slate-400 font-sans font-medium">Presets:</span>
          <button
            onClick={() => applyPreset('conservative')}
            className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0"
          >
            Conservative
          </button>
          <button
            onClick={() => applyPreset('balanced')}
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
          >
            Balanced
          </button>
          <button
            onClick={() => applyPreset('aggressive')}
            className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0"
          >
            Aggressive
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Penalty Weights */}
          <div className="space-y-3 bg-slate-50 dark:bg-[#050814] p-3 rounded-lg border border-slate-200 dark:border-slate-850 shadow-inner">
            <h4 className="font-semibold text-sky-600 dark:text-sky-400 text-xs uppercase tracking-wider flex items-center justify-between">
              <span>Penalty Multipliers (λ)</span>
              <span className="text-slate-500 text-[10px]">Objective Terms</span>
            </h4>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300">Structural Penalty (λs):</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">{config.weights.structural}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={config.weights.structural}
                onChange={(e) =>
                  setConfig({
                    weights: {
                      ...config.weights,
                      structural: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300">Semantic Risk Proxy (λm):</span>
                <span className="font-bold text-purple-600 dark:text-purple-400">{config.weights.semanticRisk}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={config.weights.semanticRisk}
                onChange={(e) =>
                  setConfig({
                    weights: {
                      ...config.weights,
                      semanticRisk: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300">Diagnostic Penalty (λd):</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{config.weights.diagnostic}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={config.weights.diagnostic}
                onChange={(e) =>
                  setConfig({
                    weights: {
                      ...config.weights,
                      diagnostic: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Search Budgets */}
          <div className="space-y-3 bg-slate-50 dark:bg-[#050814] p-3 rounded-lg border border-slate-200 dark:border-slate-850 shadow-inner">
            <h4 className="font-semibold text-purple-600 dark:text-purple-400 text-xs uppercase tracking-wider">
              Search Pruning Budgets
            </h4>

            <div className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-slate-300">Max Cost Cutoff:</span>
              <input
                type="number"
                value={config.budgets.maxCost}
                onChange={(e) =>
                  setConfig({
                    budgets: {
                      ...config.budgets,
                      maxCost: parseFloat(e.target.value) || 20,
                    },
                  })
                }
                className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-750 rounded text-right font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-slate-300">Lookahead Window (W tokens):</span>
              <input
                type="number"
                min="1"
                max="10"
                value={config.budgets.lookaheadWindow}
                onChange={(e) =>
                  setConfig({
                    budgets: {
                      ...config.budgets,
                      lookaheadWindow: parseInt(e.target.value, 10) || 4,
                    },
                  })
                }
                className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-750 rounded text-right font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-sans">
          <button
            onClick={() => setConfig(DEFAULT_CONFIG)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded text-xs transition border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 font-medium whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white font-medium text-xs transition shadow-sm whitespace-nowrap cursor-pointer"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
