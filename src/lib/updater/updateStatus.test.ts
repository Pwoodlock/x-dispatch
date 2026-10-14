import { describe, expect, it, vi } from 'vitest';
import { createUpdateStatusStore, parseReleaseVersion } from './updateStatus';

describe('parseReleaseVersion', () => {
  it('reads the version of the channel the manifest is for', () => {
    expect(parseReleaseVersion('{"tag":"v2.2.1","channel":"stable"}', 'stable')).toBe('2.2.1');
    expect(parseReleaseVersion('{"tag":"v2.3.0-rc1","channel":"rc"}', 'rc')).toBe('2.3.0-rc1');
  });

  it("ignores another channel's manifest and malformed payloads", () => {
    expect(parseReleaseVersion('{"tag":"v2.3.0-rc.1","channel":"rc"}', 'stable')).toBeNull();
    expect(parseReleaseVersion('{"channel":"stable"}', 'stable')).toBeNull();
    expect(parseReleaseVersion('not json', 'stable')).toBeNull();
  });
});

describe('createUpdateStatusStore', () => {
  it('starts idle with the download page as fallback', () => {
    const store = createUpdateStatusStore({ managed: true });
    expect(store.get()).toMatchObject({
      managed: true,
      install: 'idle',
      latestVersion: null,
      installVersion: null,
      error: null,
    });
    expect(store.get().url).toContain('x-dispatch.app');
  });

  it('notifies subscribers only when something changed', () => {
    const store = createUpdateStatusStore({ managed: false });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.patch({ install: 'idle' });
    expect(listener).not.toHaveBeenCalled();

    store.patch({ latestVersion: '2.2.1' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ latestVersion: '2.2.1' }));

    unsubscribe();
    store.patch({ install: 'checking' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps earlier fields when patching', () => {
    const store = createUpdateStatusStore({ managed: true });
    store.patch({ latestVersion: '2.2.1' });
    store.patch({ install: 'ready', installVersion: '2.2.1' });
    expect(store.get()).toMatchObject({
      latestVersion: '2.2.1',
      install: 'ready',
      installVersion: '2.2.1',
    });
  });
});
