import { describe, expect, it } from "vitest";
import { buildDailyMix } from "../lib/mix-utils";

const library = Array.from({ length: 100 }, (_, index) => ({ id: `t${index}` }));

describe("daily mix", () => {
  it("builds up to 30 unique songs and is stable for the same seed", () => {
    const first = buildDailyMix(library, [], 20260929);
    const again = buildDailyMix(library, [], 20260929);
    expect(first).toHaveLength(30);
    expect(new Set(first.map((track) => track.id)).size).toBe(30);
    expect(first.map((track) => track.id)).toEqual(again.map((track) => track.id));
  });

  it("changes with a different seed (remix)", () => {
    const a = buildDailyMix(library, [], 2026092900).map((track) => track.id);
    const b = buildDailyMix(library, [], 2026092901).map((track) => track.id);
    expect(a).not.toEqual(b);
  });

  it("leans on favorites but still mixes in other songs", () => {
    const favorites = library.slice(0, 50).map((track) => track.id);
    const mix = buildDailyMix(library, favorites, 1);
    const favoriteCount = mix.filter((track) => favorites.includes(track.id)).length;
    expect(favoriteCount).toBe(18);
    expect(mix.length - favoriteCount).toBe(12);
  });

  it("uses every song when the library is small and handles empty libraries", () => {
    expect(buildDailyMix(library.slice(0, 5), [], 3)).toHaveLength(5);
    expect(buildDailyMix([], [], 3)).toEqual([]);
  });
});
