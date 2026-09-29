import { describe, expect, it } from "vitest";
import { getManualNextIndex, getNextQueueIndex, getShuffleNextIndex, orderBySavedIds } from "../lib/playback-utils";

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

describe("manual next", () => {
  it("moves to the following song even in repeat-one mode", () => {
    expect(getManualNextIndex(1, 4, "one")).toBe(2);
    expect(getManualNextIndex(3, 4, "one")).toBe(0);
  });

  it("follows queue order in repeat-all and skips the current song in shuffle", () => {
    expect(getManualNextIndex(0, 3, "all")).toBe(1);
    expect(getManualNextIndex(1, 4, "shuffle", () => 0)).toBe(0);
  });

  it("stays on the only song when the queue has one track", () => {
    expect(getManualNextIndex(0, 1, "one")).toBe(0);
    expect(getManualNextIndex(0, 0, "one")).toBe(-1);
  });
});

describe("shuffled deck", () => {
  it("plays every song once before any song repeats", () => {
    const ids = ["a", "b", "c", "d", "e"];
    let played = new Set<string>();
    let index = 0;
    played.add(ids[0]);
    const heard = [ids[0]];
    for (let step = 0; step < 4; step += 1) {
      const pick = getShuffleNextIndex(ids, index, played, Math.random);
      index = pick.index;
      played = pick.played;
      heard.push(ids[index]);
    }
    expect(new Set(heard).size).toBe(5);
  });

  it("starts a new cycle without immediately repeating the current song", () => {
    const ids = ["a", "b", "c"];
    const pick = getShuffleNextIndex(ids, 2, new Set(ids), () => 0);
    expect(pick.index).not.toBe(2);
    expect([...pick.played].sort()).toEqual([ids[pick.index], "c"].sort());
  });

  it("handles empty and single-song queues", () => {
    expect(getShuffleNextIndex([], 0, new Set()).index).toBe(-1);
    expect(getShuffleNextIndex(["a"], 0, new Set()).index).toBe(0);
  });
});

describe("saved queue order", () => {
  it("restores the saved order and keeps unknown songs at the end", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(orderBySavedIds(list, ["c", "a", "x"]).map((item) => item.id)).toEqual(["c", "a", "b", "d"]);
  });
});
