import { describe, expect, it } from "vitest";
import { prepareTracksForPersistence } from "../lib/library-persistence";

describe("library persistence", () => {
  it("drops inline base64 artwork but keeps provider artwork URIs", () => {
    const tracks = prepareTracksForPersistence([
      { id: "embedded", artworkUri: "data:image/jpeg;base64,large" },
      { id: "provider", artworkUri: "content://media/external/audio/1" },
      { id: "none" },
    ]);

    expect(tracks[0].artworkUri).toBeUndefined();
    expect(tracks[1].artworkUri).toBe("content://media/external/audio/1");
    expect(tracks[2].artworkUri).toBeUndefined();
  });
});
