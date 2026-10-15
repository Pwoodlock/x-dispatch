import { MotionConfig } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FlightStripWindow } from './components/FlightStripWindow';
import { TooltipProvider } from './components/ui/tooltip';
import './i18n';
import { QueryProvider } from './queries';
import { initializeFontSize } from './stores/settingsStore';
import { initializeTheme } from './stores/themeStore';

initializeTheme();
initializeFontSize();

/**
 * Root of the detached flight strip window. Kept apart from App so the strip
 * window never loads the map, the dialogs or the rest of the main window.
 */
export default function FlightStripApp() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={500} skipDelayDuration={300}>
            <FlightStripWindow />
          </TooltipProvider>
        </MotionConfig>
      </QueryProvider>
    </ErrorBoundary>
  );
}
