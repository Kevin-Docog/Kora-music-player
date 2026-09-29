import { describe, expect, it } from "vitest";
import { addTrackToPlaylistState, buildPlaylist, deletePlaylistState, migrateSavedPlaylists, removeTrackFromPlaylistState, renamePlaylistState, type Playlist } from "../lib/playlist-context";

const playlists: Playlist[] = [
  { id: "liked", title: "Liked songs", subtitle: "Favorites", count: "1 tracks", tone: "#4b352c", trackIds: ["1"] },
  { id: "mood", title: "Night mood", subtitle: "A mood", count: "0 tracks", tone: "#35432c", trackIds: [] },
];

describe("playlist state helpers", () => {
  it("adds a song once and updates the count", () => {
    const added = addTrackToPlaylistState(playlists, "mood", "3");
    expect(added[1].trackIds).toEqual(["3"]);
    expect(added[1].count).toBe("1 tracks");
    expect(addTrackToPlaylistState(added, "mood", "3")[1].trackIds).toEqual(["3"]);
  });

  it("renames a playlist without changing its songs", () => {
    const renamed = renamePlaylistState(playlists, "mood", "  Late drive  ");
    expect(renamed[1].title).toBe("Late drive");
    expect(renamed[1].trackIds).toEqual([]);
  });

  it("deletes the selected playlist", () => {
    expect(deletePlaylistState(playlists, "liked")).toHaveLength(1);
    expect(deletePlaylistState(playlists, "mood")).toHaveLength(1);
  });

  it("removes a song from only the selected playlist", () => {
    const withSong = addTrackToPlaylistState(playlists, "mood", "3");
    const removed = removeTrackFromPlaylistState(withSong, "mood", "3");
    expect(removed[1].trackIds).toEqual([]);
    expect(removed[1].count).toBe("0 tracks");
    expect(removed[0].trackIds).toEqual(["1"]);
  });

  it("removes the old Liked songs playlist from saved data", () => {
    const migrated = migrateSavedPlaylists([{ ...playlists[0], trackIds: ["1", "2"], count: "2 tracks" }]);
    expect(migrated).toEqual([]);
  });

  it("keeps the name entered when creating a playlist", () => {
    expect(buildPlaylist("  Workout drive  ", "test-id").title).toBe("Workout drive");
    expect(buildPlaylist("", "empty-id").title).toBe("New mood");
  });
});
