import { describe, expect, it } from "vitest";
import { getUncachedAssetIds, mergeScannedTrack, mergeScannedTracks } from "../lib/library-scan-utils";

describe("incremental library scanning", () => {
  it("appends each scanned track immediately", () => {
    expect(mergeScannedTrack([], { id: "one", title: "One" })).toEqual([{ id: "one", title: "One" }]);
  });

  it("replaces an earlier version of the same track", () => {
    expect(mergeScannedTrack([{ id: "one", title: "Old" }], { id: "one", title: "New" })).toEqual([{ id: "one", title: "New" }]);
  });

  it("keeps already discovered tracks available when a scan is cancelled", () => {
    const discovered = mergeScannedTrack([], { id: "one", title: "One" });
    expect(discovered).toHaveLength(1);
  });

  it("keeps restored tracks while refreshing scanned matches", () => {
    expect(mergeScannedTracks([{ id: "old", title: "Already here" }, { id: "same", title: "Old metadata" }], [{ id: "same", title: "Fresh metadata" }, { id: "new", title: "New song" }])).toEqual([
      { id: "old", title: "Already here" },
      { id: "same", title: "Fresh metadata" },
      { id: "new", title: "New song" },
    ]);
  });

  it("returns only device assets that are not already cached", () => {
    expect(getUncachedAssetIds([{ id: "cached" }, { id: "new" }, { id: "newer" }], new Set(["cached"]))).toEqual(["new", "newer"]);
  });

  it("moves duplicated scanned tracks to the end once, keeping the newest copy", () => {
    expect(mergeScannedTracks([{ id: "a", v: 1 }], [{ id: "b", v: 1 }, { id: "b", v: 2 }, { id: "a", v: 3 }])).toEqual([
      { id: "b", v: 2 },
      { id: "a", v: 3 },
    ]);
  });
});
