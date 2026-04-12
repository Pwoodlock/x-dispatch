import { app, screen } from 'electron';
import os from 'os';
import logger, { getLogPath } from './logger';

export function logStartupEnvironment(shouldInitSentry: boolean): void {
  const displays = screen.getAllDisplays();
  const primaryDisplay = displays[0];

  logger.main.info('════════════════════════════════════════════════════════════════');
  logger.main.info(`X-Dispatch v${app.getVersion()} starting`);
  logger.main.info('════════════════════════════════════════════════════════════════');

  // OS & hardware
  logger.main.info(`OS: ${os.platform()} ${os.release()} (${os.arch()})`);
  logger.main.info(
    `System: ${os.cpus()[0]?.model || 'Unknown CPU'}, ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB RAM`
  );
  logger.main.info(
    `Electron: ${process.versions.electron}, Chrome: ${process.versions.chrome}, Node: ${process.versions.node}`
  );

  // GPU: basic info (vendor, device, driver) — async, logged when ready
  app
    .getGPUInfo('basic')
    .then((gpu) => {
      const g = gpu as {
        gpu?: {
          devices?: Array<{
            vendorId: number;
            deviceId: number;
            driverVersion?: string;
          }>;
        };
      };
      const devices = g.gpu?.devices ?? [];
      for (const dev of devices) {
        logger.main.info(
          `GPU: vendor=0x${dev.vendorId.toString(16)} device=0x${dev.deviceId.toString(16)} driver=${dev.driverVersion ?? 'unknown'}`
        );
      }
    })
    .catch(() => logger.main.warn('GPU: failed to query gpu info'));

  // GPU feature status (hardware acceleration state)
  const gpuFeatures = app.getGPUFeatureStatus();
  logger.main.info(
    `GPU compositing: ${gpuFeatures.gpu_compositing}, webgl: ${gpuFeatures.webgl}, webgl2: ${gpuFeatures.webgl2}`
  );

  // Per-display details
  for (const [i, display] of displays.entries()) {
    const label = display.id === primaryDisplay?.id ? 'primary' : 'secondary';
    logger.main.info(
      `Display ${i + 1} (${label}): ${display.size.width}x${display.size.height}, scale=${display.scaleFactor}, rotation=${display.rotation}, colorDepth=${display.colorDepth}`
    );
  }

  // Misc
  logger.main.info(`Locale: ${app.getLocale()}`);
  logger.main.info(`Paths: userData=${app.getPath('userData')}`);
  logger.main.debug(`Log file: ${getLogPath()}`);

  // Crash reporting
  logger.main.info(`Crash reporting: ${shouldInitSentry ? 'enabled' : 'disabled'}`);
}
