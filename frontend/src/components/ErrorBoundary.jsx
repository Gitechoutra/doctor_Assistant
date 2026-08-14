import { Component } from "react";

/** Catches a render-time crash anywhere below it and shows what happened.
 *
 *  Without this, a throw during render unmounts the entire tree and leaves a
 *  blank white page with nothing on screen pointing at the cause — the error
 *  is only in the browser console, which is easy to miss and impossible to
 *  read from a screenshot.
 *
 *  "Clear local data" is offered because the most likely thing a user can fix
 *  themselves is a stale or corrupt localStorage entry left by an older build.
 *  It signs the session out; it does not touch anything on the server.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled render error:", error, info?.componentStack);
  }

  handleReset = () => {
    try {
      localStorage.clear();
    } finally {
      window.location.assign("/");
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The page failed to load. Reloading usually clears it. If it keeps
            happening, clearing this browser&rsquo;s saved data for the app will
            sign you out and reset it.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100">
            {String(error?.message || error)}
          </pre>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              Reload the page
            </button>
            <button
              onClick={this.handleReset}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Clear local data and sign out
            </button>
          </div>
        </div>
      </div>
    );
  }
}
