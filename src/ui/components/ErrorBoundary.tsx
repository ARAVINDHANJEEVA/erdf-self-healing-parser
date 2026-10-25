import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { useReplayStore } from '../../state/replayStore';
import { CURATED_DEMOS } from '../../demos/curatedDemos';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by Workbench ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    const store = useReplayStore.getState();
    store.loadDemo(CURATED_DEMOS[0].id);
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 select-none font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-rose-900/60 rounded-xl p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="p-3 bg-rose-950/60 text-rose-400 rounded-full mb-4 border border-rose-800/80">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <h2 className="text-base font-bold text-slate-100 mb-2">
              Workbench Execution Exception
            </h2>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              An unexpected render or state transition error occurred. The application state was safely isolated to prevent data corruption.
            </p>

            {this.state.error && (
              <div className="w-full bg-slate-950 border border-slate-800 rounded p-3 mb-4 text-left font-mono text-[11px] text-rose-300 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow transition"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Workbench to Default State
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
