import { describe, expect, it } from "vitest";
import { groupByAlbum, groupByArtist } from "../lib/browse-utils";

const tracks = [
  { id: "1", title: "One", artist: "Zed", album: "Night", duration: "3:00", initials: "ON", tone: "#111", artworkUri: "art://night" },
  { id: "2", title: "Two", artist: "Alpha", album: "Day", duration: "2:00", initials: "TW", tone: "#222" },
  { id: "3", title: "Three", artist: "Zed", album: "Night", duration: "4:00", initials: "TH", tone: "#333" },
];

describe("library browse grouping", () => {
  it("groups artists alphabetically and keeps their tracks", () => {
    const groups = groupByArtist(tracks);
    expect(groups.map((group) => group.name)).toEqual(["Alpha", "Zed"]);
    expect(groups[1].tracks).toHaveLength(2);
    expect(groups[1].artworkUri).toBe("art://night");
  });

  it("groups albums by album and artist", () => {
    const groups = groupByAlbum(tracks);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.name === "Night")?.tracks).toHaveLength(2);
  });
});
