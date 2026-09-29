import { describe, expect, it } from "vitest";
import { sortLibraryTracks } from "../lib/library-utils";

const tracks = [
  { title: "Zed", artist: "Bravo", album: "B", duration: "4:00", addedAt: 1 },
  { title: "Alpha", artist: "Alpha", album: "A", duration: "2:00", addedAt: 3 },
];

describe("library sorting", () => {
  it("supports recent, artist, album, and duration orders", () => {
    expect(sortLibraryTracks(tracks, "recent")[0].title).toBe("Alpha");
    expect(sortLibraryTracks(tracks, "artist")[0].title).toBe("Alpha");
    expect(sortLibraryTracks(tracks, "album")[0].title).toBe("Alpha");
    expect(sortLibraryTracks(tracks, "duration")[0].title).toBe("Alpha");
  });

  it("supports Song A-Z title ordering", () => {
    expect(sortLibraryTracks([{ ...tracks[0], title: "zebra" }, { ...tracks[1], title: "Apple" }], "title").map((track) => track.title)).toEqual(["Apple", "zebra"]);
  });
});
