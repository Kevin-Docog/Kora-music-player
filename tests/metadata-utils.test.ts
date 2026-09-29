import { describe, expect, it } from "vitest";
import { applyMetadataPatch } from "../lib/metadata-utils";

describe("local metadata edits", () => {
  it("updates text metadata and reparses edited LRC lyrics", () => {
    const track = applyMetadataPatch({
      title: "Old title",
      artist: "Old artist",
      album: "Old album",
      lyrics: false,
    }, {
      title: " New title ",
      artist: "New artist",
      album: "New album",
      lyricsText: "[00:01.00]First\n[00:02.50][00:04.00]Second",
    });

    expect(track.title).toBe("New title");
    expect(track.artist).toBe("New artist");
    expect(track.album).toBe("New album");
    expect(track.lyrics).toBe(true);
    expect(track.lyricLines).toEqual([
      { time: 1, text: "First" },
      { time: 2.5, text: "Second" },
      { time: 4, text: "Second" },
    ]);
  });
});
