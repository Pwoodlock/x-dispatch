import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/electron/renderer';
import { reactErrorHandler, init as reactInit } from '@sentry/react';
import { initSentryContext } from '@/lib/sentry/sentryContext';
import { TRANSIENT_NET_ERROR_PATTERN } from '@/lib/sentry/transientNetErrors';
import { BRIDGE_CALL_TIMEOUT_MS, withTimeout } from '@/lib/startup/startupFallback';
import { showStartupFailure } from '@/lib/startup/startupPage';
import App from './App';

// Initialize app - check crash reports setting first
export async function bootstrap(): Promise<void> {
  try {
    // Packaged builds load index.html over file://, so the protocol can't tell
    // dev from production; a check for app:// kept Sentry off in every release.
    // On a tablet this is the first trip over the WebSocket: a socket that never opens must
    // not hold the whole app at a black page. Without an answer the app renders, Sentry off.
    const sendCrashReports = await withTimeout(
      window.appAPI.getSendCrashReports(),
      BRIDGE_CALL_TIMEOUT_MS,
      'Crash report setting'
    );
    if (!import.meta.env.DEV && sendCrashReports) {
      Sentry.init(
        {
          dsn: 'https://0279f306474c382f68b1605fb27be652@o4508345478742016.ingest.de.sentry.io/4510878234837072',
          release: `x-dispatch@${await window.appAPI.getVersion()}`,
          integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
          ignoreErrors: [TRANSIENT_NET_ERROR_PATTERN],
          tracesSampleRate: 1.0,
          // The free plan holds 50 replays a month: keep them for sessions with an error.
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 1.0,
        },
        reactInit
      );
      initSentryContext();
    }
  } catch (err) {
    // Config not available yet (first run), or the desktop did not answer: skip Sentry.
    window.appAPI.log.warn('Sentry skipped at startup', String(err));
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement, {
    // An error no boundary catches unmounts the whole tree, which would leave a blank page.
    onUncaughtError: reactErrorHandler((error) => showStartupFailure(error, 'render')),
  }).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
