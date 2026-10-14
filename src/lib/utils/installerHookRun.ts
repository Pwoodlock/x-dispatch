/**
 * Velopack (and Squirrel, for installs being moved over) start the app for a moment
 * with a hook argument while installing, updating or uninstalling. Those runs exit
 * right away and must not touch what the user's own sessions left behind.
 */
export function isInstallerHookRun(argv: readonly string[]): boolean {
  return argv.some((arg) => arg.startsWith('--veloapp-') || arg.startsWith('--squirrel-'));
}
