export const DEFAULT_AUTO_SCAN_ON_LAUNCH = true;

export function parseAutoScanPreference(value: string | null | undefined) {
  if (value === null || value === undefined) return DEFAULT_AUTO_SCAN_ON_LAUNCH;
  return value !== "false";
}
