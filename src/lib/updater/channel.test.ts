import { describe, expect, it } from 'vitest';
import { planUpdateChannel, updateChannel } from './channel';

describe('planUpdateChannel', () => {
  it('offers the beta toggle only while a beta is newer than the full release', () => {
    const open = { installed: '2.6.0', latestStable: '2.6.0', betaEnabled: false };
    expect(planUpdateChannel({ ...open, latestBeta: '2.6.1-rc1' }).betaAvailable).toBe(true);
    expect(planUpdateChannel({ ...open, latestBeta: '2.6.0-rc3' }).betaAvailable).toBe(false);
    expect(planUpdateChannel({ ...open, latestBeta: null }).betaAvailable).toBe(false);
  });

  it('keeps a tester on the beta feed while their beta is current', () => {
    const plan = planUpdateChannel({
      installed: '2.6.1-rc1',
      latestStable: '2.6.0',
      latestBeta: '2.6.1-rc2',
      betaEnabled: true,
    });
    expect(plan).toEqual({
      betaAvailable: true,
      betaEnabled: true,
      beta: true,
      allowDowngrade: false,
    });
  });

  it('moves a tester to the full release once it catches up, and ends the beta run', () => {
    const plan = planUpdateChannel({
      installed: '2.6.1-rc1',
      latestStable: '2.6.1',
      latestBeta: '2.6.1-rc1',
      betaEnabled: true,
    });
    expect(plan).toEqual({
      betaAvailable: false,
      betaEnabled: false,
      beta: false,
      allowDowngrade: false,
    });
  });

  it('takes a tester who leaves back to the full release, older than their beta', () => {
    const plan = planUpdateChannel({
      installed: '2.6.1-rc1',
      latestStable: '2.6.0',
      latestBeta: '2.6.1-rc1',
      betaEnabled: false,
    });
    expect(plan).toMatchObject({ betaAvailable: true, beta: false, allowDowngrade: true });
  });

  it('keeps the saved choice when a manifest could not be read', () => {
    const plan = planUpdateChannel({
      installed: '2.6.1-rc1',
      latestStable: '2.6.0',
      latestBeta: undefined,
      betaEnabled: true,
    });
    expect(plan).toMatchObject({ betaEnabled: true, beta: true, allowDowngrade: false });
  });
});

describe('updateChannel', () => {
  it('keeps the default Windows channel for full releases and splits Linux by arch', () => {
    expect(updateChannel('win32', 'x64', false)).toBe('win');
    expect(updateChannel('win32', 'x64', true)).toBe('win-beta');
    expect(updateChannel('linux', 'arm64', false)).toBe('linux-arm64');
    expect(updateChannel('linux', 'x64', true)).toBe('linux-x64-beta');
  });
});
