/**
 * Replaces a blank page with the startup failure page and tells the main process, which
 * logs the failure and forwards it to Sentry. The renderer's own Sentry client starts
 * later, inside bootstrap, so main is the only reporter at this point.
 */
import {
  type StartupFailure,
  type StartupFailureReport,
  type StartupStage,
  buildStartupReport,
  clearRetryFlag,
  formatStartupError,
  hostFromUserAgent,
  startupFailureHtml,
} from './startupFallback';

function reportToMain(report: StartupFailureReport): void {
  try {
    const api = window.appAPI;
    if (!api) return;
    if (typeof api.reportStartupFailure === 'function') {
      void api.reportStartupFailure(report);
    } else {
      // A tablet page served by an older desktop: the log line still gets through.
      api.log.error(`[Startup] ${report.stage}: ${report.error}`);
    }
  } catch {
    // No bridge, or it is what failed: the page still shows the message.
  }
}

async function bridgeLogPath(): Promise<string | null> {
  try {
    return window.appAPI ? await window.appAPI.getLogPath() : null;
  } catch {
    return null;
  }
}

function render(failure: StartupFailure): void {
  const root = document.getElementById('root') ?? document.body;
  root.innerHTML = startupFailureHtml(failure);
  root.querySelector('[data-startup-action="reload"]')?.addEventListener('click', () => {
    clearRetryFlag(sessionStorage);
    window.location.reload();
  });
  root.querySelector('[data-startup-action="log"]')?.addEventListener('click', () => {
    void window.appAPI?.openLogFile();
  });
}

let shown = false;

/** Shows the failure page once; later errors from the same start are ignored. */
export function showStartupFailure(err: unknown, stage: StartupStage): void {
  if (shown) return;
  shown = true;
  const failure: StartupFailure = {
    host: hostFromUserAgent(navigator.userAgent),
    stage,
    error: formatStartupError(err),
    logPath: null,
  };
  reportToMain(buildStartupReport(failure, navigator.userAgent));
  render(failure);
  void bridgeLogPath().then((logPath) => {
    if (logPath) render({ ...failure, logPath });
  });
}
