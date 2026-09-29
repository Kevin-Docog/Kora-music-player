import { describe, expect, it } from "vitest";
import { getNextQueueIndex } from "../lib/playback-utils";

describe("playback selection", () => {
  it("loops through the queue in repeat-all mode", () => {
    expect(getNextQueueIndex(2, 3, "all")).toBe(0);
  });

  it("repeats the current track in repeat-one mode", () => {
    expect(getNextQueueIndex(1, 4, "one")).toBe(1);
  });

  it("never selects the current track when shuffling", () => {
    expect(getNextQueueIndex(1, 4, "shuffle", () => 0)).toBe(0);
    expect(getNextQueueIndex(1, 4, "shuffle", () => 0.99)).toBe(3);
  });
});
