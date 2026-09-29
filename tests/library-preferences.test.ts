import { describe, expect, it } from "vitest";
import { parseAutoScanPreference } from "../lib/library-preferences";

describe("launch rescan preference", () => {
  it("defaults to enabled for new installs", () => {
    expect(parseAutoScanPreference(null)).toBe(true);
  });

  it("restores the saved disabled state", () => {
    expect(parseAutoScanPreference("false")).toBe(false);
  });

  it("treats enabled and legacy values as enabled", () => {
    expect(parseAutoScanPreference("true")).toBe(true);
    expect(parseAutoScanPreference("legacy")).toBe(true);
  });
});
