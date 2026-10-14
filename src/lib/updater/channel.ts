import { isNewerVersion } from '@/lib/utils/versionCompare';

/**
 * A release manifest read from the download host: the version, `null` when the
 * host has none for that channel, `undefined` when it could not be read.
 */
export type ManifestVersion = string | null | undefined;

export interface ChannelInput {
  installed: string;
  latestStable: ManifestVersion;
  latestBeta: ManifestVersion;
  /** The user's saved choice. */
  betaEnabled: boolean;
}

export interface ChannelPlan {
  /** A beta newer than the newest full release is published. */
  betaAvailable: boolean;
  /** Choice to save: a beta run ends once a full release catches up with it. */
  betaEnabled: boolean;
  /** Read the beta feed rather than the full release feed. */
  beta: boolean;
  /** The installed beta is newer than the full release the user is going back to. */
  allowDowngrade: boolean;
}

/**
 * Which update feed to follow. Beta testers get each beta, and the full release
 * once it catches up with their beta, which also ends their beta run: the next
 * beta is a new opt-in. A manifest that could not be read changes nothing.
 */
export function planUpdateChannel(input: ChannelInput): ChannelPlan {
  const { installed, latestStable, latestBeta } = input;
  if (latestStable === undefined || latestBeta === undefined) {
    return {
      betaAvailable: input.betaEnabled,
      betaEnabled: input.betaEnabled,
      beta: input.betaEnabled,
      allowDowngrade: false,
    };
  }
  const betaAvailable =
    latestBeta !== null && (latestStable === null || isNewerVersion(latestStable, latestBeta));
  const betaEnabled = input.betaEnabled && betaAvailable;
  const allowDowngrade =
    !betaEnabled && latestStable !== null && isNewerVersion(latestStable, installed);
  return { betaAvailable, betaEnabled, beta: betaEnabled, allowDowngrade };
}

/**
 * Velopack channel of this platform's builds. Windows full releases keep the
 * default `win` channel, which is what old Squirrel installs migrate through.
 */
export function updateChannel(platform: NodeJS.Platform, arch: string, beta: boolean): string {
  const base = platform === 'win32' ? 'win' : `${platform}-${arch}`;
  return beta ? `${base}-beta` : base;
}
