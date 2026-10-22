// Bundled typefaces: nothing is fetched from a font CDN at runtime.
// Roboto is X-Plane 12's own UI face; B612 is the Airbus cockpit-display face, used for readouts.
// Its digits share one width, so numbers line up like a mono font, while dots and colons stay narrow.
import '@fontsource/b612/400.css';
import '@fontsource/b612/700.css';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './index.css';
import { clearRetryFlag, shouldRetryLoad } from './lib/startup/startupFallback';
import { showStartupFailure } from './lib/startup/startupPage';

// A file dropped outside a drop zone would otherwise navigate the window to it.
for (const type of ['dragover', 'drop'] as const) {
  document.addEventListener(type, (e) => e.preventDefault());
}

// In a browser on another device (tablet access) there is no preload: install
// window.*API over a WebSocket first. The dynamic import keeps every app module
// from evaluating before the bridge exists.
try {
  if (!('appAPI' in window)) {
    const { installRemoteBridge } = await import('./lib/bridge/browser/installRemoteBridge');
    installRemoteBridge();
  }
  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
  clearRetryFlag(sessionStorage);
} catch (err) {
  // Nothing has rendered yet, so a failed import or a bootstrap error would leave a blank
  // page. A module that fails to load is usually transient: the dev server rebuilding, a
  // tablet page served before the desktop updated its chunks, or a dropped fetch. One reload
  // covers those; a second failure says what happened and what to do, and main logs it.
  if (shouldRetryLoad(err, sessionStorage)) {
    window.location.reload();
  } else {
    showStartupFailure(err, 'load');
    throw err;
  }
}
