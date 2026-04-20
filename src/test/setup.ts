/**
 * Vitest setup file.
 * Runs before each test file.
 */
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.appAPI
Object.defineProperty(window, 'appAPI', {
  value: {
    log: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getConfigPath: vi.fn().mockResolvedValue('/config'),
    getLogPath: vi.fn().mockResolvedValue('/logs'),
    getProcessMemory: vi.fn().mockResolvedValue({ rss: 0, heapUsed: 0 }),
    getTileCacheStats: vi.fn().mockResolvedValue({
      entryCount: 0,
      totalSize: 0,
      hitRate: 0,
    }),
  },
  writable: true,
});

// Mock window.xplaneAPI
Object.defineProperty(window, 'xplaneAPI', {
  value: {
    getPath: vi.fn().mockResolvedValue(null),
  },
  writable: true,
});

// Mock window.xplaneServiceAPI
Object.defineProperty(window, 'xplaneServiceAPI', {
  value: {
    isStreamConnected: vi.fn().mockResolvedValue(false),
  },
  writable: true,
});

// Mock window.navAPI
Object.defineProperty(window, 'navAPI', {
  value: {
    getAllAirspaces: vi.fn().mockResolvedValue([]),
  },
  writable: true,
});

// Mock window.airportAPI
Object.defineProperty(window, 'airportAPI', {
  value: {
    getAirportData: vi.fn().mockResolvedValue(null),
  },
  writable: true,
});

// Silence console.error in tests unless it's an actual error
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning:')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
