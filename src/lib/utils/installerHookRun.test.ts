import { describe, expect, it } from 'vitest';
import { isInstallerHookRun } from './installerHookRun';

describe('isInstallerHookRun', () => {
  it('spots the Velopack and Squirrel hook runs', () => {
    expect(isInstallerHookRun(['x-dispatch.exe', '--veloapp-updated', '2.6.2'])).toBe(true);
    expect(isInstallerHookRun(['x-dispatch.exe', '--veloapp-obsolete', '2.6.1'])).toBe(true);
    expect(isInstallerHookRun(['x-dispatch.exe', '--squirrel-updated', '2.6.0'])).toBe(true);
  });

  it('leaves normal launches, links and files alone', () => {
    expect(isInstallerHookRun(['x-dispatch.exe'])).toBe(false);
    expect(isInstallerHookRun(['x-dispatch.exe', 'xdispatch://airport/LFBO'])).toBe(false);
    expect(isInstallerHookRun(['x-dispatch.exe', 'C:\\plans\\LFBO-LFPG.fms'])).toBe(false);
  });
});
