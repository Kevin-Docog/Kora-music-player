import { describe, expect, it } from "vitest";
import { filterMusicTracks, formatDuration } from "../lib/music-utils";

const tracks = [
  { id: "1", title: "Last Night on Earth", artist: "Green Day", album: "Breakdown", lyrics: true },
  { id: "2", title: "Night Drive", artist: "Kora Demo", album: "After Dark", lyrics: false },
];

describe("music utilities", () => {
  it("formats audio duration as minutes and seconds", () => {
    expect(formatDuration(236)).toBe("3:56");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(-10)).toBe("0:00");
  });

  it("filters tracks by query and library filter", () => {
    expect(filterMusicTracks(tracks, "green", "All tracks", [], (track) => track.id)).toHaveLength(1);
    expect(filterMusicTracks(tracks, "", "Favorites", ["2"], (track) => track.id)[0].title).toBe("Night Drive");
    expect(filterMusicTracks(tracks, "", "With lyrics", [], (track) => track.id)[0].title).toBe("Last Night on Earth");
  });
});
