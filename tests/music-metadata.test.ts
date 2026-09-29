import { describe, expect, it } from "vitest";
import { formatMusicDuration, mapNativeAudioAsset, parseLrc, parseMusicFilename, pictureToArtwork } from "../lib/music-metadata";

describe("native music metadata", () => {
  it("parses artist and title from a common filename", () => {
    expect(parseMusicFilename("Green Day - Last Night on Earth.mp3")).toEqual({ artist: "Green Day", title: "Last Night on Earth" });
  });

  it("formats native durations and maps a playable URI", () => {
    expect(formatMusicDuration(245)).toBe("4:05");
    const track = mapNativeAudioAsset({ id: "abc", filename: "Track.m4a", uri: "file:///music/track.m4a", duration: 61 }, 0);
    expect(track).toMatchObject({ id: "asset-abc", title: "Track", artist: "Unknown artist", album: "Unknown album", duration: "1:01", uri: "file:///music/track.m4a" });
  });

  it("parses timestamped sidecar lyrics", () => {
    expect(parseLrc("[00:12.50]Second line\n[00:01]First line")).toEqual([
      { time: 1, text: "First line" },
      { time: 12.5, text: "Second line" },
    ]);
  });

  it("supports repeated timestamps on a single lyric line", () => {
    expect(parseLrc("[00:02.00][00:04.00]Repeat me")).toEqual([
      { time: 2, text: "Repeat me" },
      { time: 4, text: "Repeat me" },
    ]);
  });
});

describe("embedded artwork", () => {
  it("keeps covers larger than the old 128KB limit", () => {
    const big = [0xff, 0xd8, ...new Array(300 * 1024).fill(7)];
    const art = pictureToArtwork({ data: big, format: "image/jpeg" });
    expect(art?.extension).toBe("jpg");
    expect(art?.base64.length).toBeGreaterThan(300 * 1024);
  });

  it("trusts the image header over a wrong declared MIME type", () => {
    const art = pictureToArtwork({ data: [0x89, 0x50, 0x4e, 0x47, 1, 2, 3], format: "image/jpeg" });
    expect(art?.extension).toBe("png");
  });

  it("ignores empty or invalid pictures", () => {
    expect(pictureToArtwork({ data: [] })).toBeUndefined();
    expect(pictureToArtwork(undefined)).toBeUndefined();
  });
});
