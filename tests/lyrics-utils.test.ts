import { describe, expect, it } from "vitest";
import { getActiveLyricIndex } from "../lib/lyrics-utils";

describe("lyric synchronization", () => {
  const lines = [
    { time: 0, text: "Intro" },
    { time: 5, text: "First line" },
    { time: 12.5, text: "Second line" },
  ];

  it("selects the latest line at or before playback position", () => {
    expect(getActiveLyricIndex(lines, 0)).toBe(0);
    expect(getActiveLyricIndex(lines, 8)).toBe(1);
    expect(getActiveLyricIndex(lines, 12.5)).toBe(2);
  });

  it("returns no active line when lyrics are unavailable", () => {
    expect(getActiveLyricIndex(undefined, 10)).toBe(-1);
    expect(getActiveLyricIndex([], 10)).toBe(-1);
  });
});
