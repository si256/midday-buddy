import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleResetAndReload = (): void => {
    try {
      localStorage.removeItem('mdb_auth_token_v1');
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-slate-950 p-4 font-sans text-slate-800 dark:text-slate-200">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900 text-center animate-in fade-in duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 mb-5">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              MidDay Buddy Recovery Mode
            </h1>

            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              An unexpected display glitch occurred while rendering the campus interface. No account data was lost.
            </p>

            {this.state.error && (
              <div className="mt-4 rounded-xl bg-stone-100 p-3 text-left font-mono text-[11px] text-rose-600 dark:bg-slate-800 dark:text-rose-400 overflow-x-auto max-h-32">
                {this.state.error.message || 'Unknown runtime error'}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-700 transition-colors shadow-sm"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reload Application</span>
              </button>

              <button
                onClick={this.handleResetAndReload}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span>Reset Cache & Restore</span>
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-stone-100 dark:border-slate-800 text-[11px] text-slate-400">
              MidDay Buddy · Backed by CoreReacher Enterprises
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
