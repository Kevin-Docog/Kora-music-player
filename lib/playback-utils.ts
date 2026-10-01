export type RepeatMode = "shuffle" | "all" | "one";

export function getNextQueueIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode,
  random = Math.random,
) {
  if (queueLength <= 0) return -1;
  if (repeatMode === "one") return Math.min(Math.max(currentIndex, 0), queueLength - 1);
  if (repeatMode === "all") return (Math.max(currentIndex, 0) + 1) % queueLength;
  if (queueLength === 1) return 0;

  const candidates = Array.from({ length: queueLength }, (_, index) => index).filter((index) => index !== currentIndex);
  return candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))];
}

/**
 * Index to play when the person taps Next. Repeat-one only applies when a song ends by itself,
 * so a manual Next always moves to a different song (in order) whenever the queue has more than one.
 */
export function getManualNextIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode,
  random = Math.random,
) {
  if (queueLength <= 0) return -1;
  const mode: RepeatMode = repeatMode === "one" ? "all" : repeatMode;
  const nextIndex = getNextQueueIndex(currentIndex, queueLength, mode, random);
  if (queueLength > 1 && nextIndex === currentIndex) return (Math.max(currentIndex, 0) + 1) % queueLength;
  return nextIndex;
}

/**
 * "Shuffled deck": every song plays once before any song repeats.
 * `played` holds the ids already heard in the current cycle. Returns the index to play next and
 * the updated played set (a new cycle starts automatically once everything has been heard).
 */
export function getShuffleNextIndex(
  ids: string[],
  currentIndex: number,
  played: ReadonlySet<string>,
  random = Math.random,
): { index: number; played: Set<string> } {
  if (ids.length === 0) return { index: -1, played: new Set() };
  if (ids.length === 1) return { index: 0, played: new Set([ids[0]]) };

  const nextPlayed = new Set(played);
  const currentId = ids[currentIndex];
  if (currentId !== undefined) nextPlayed.add(currentId);

  let candidates: number[] = [];
  for (let i = 0; i < ids.length; i += 1) if (!nextPlayed.has(ids[i])) candidates.push(i);

  if (candidates.length === 0) {
    // Everything has been heard: start a new cycle, only excluding the song that just played.
    nextPlayed.clear();
    if (currentId !== undefined) nextPlayed.add(currentId);
    candidates = [];
    for (let i = 0; i < ids.length; i += 1) if (i !== currentIndex) candidates.push(i);
  }

  const pick = candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))];
  nextPlayed.add(ids[pick]);
  return { index: pick, played: nextPlayed };
}

/** Orders `list` by a saved list of ids; songs not in the saved list keep their relative order at the end. */
export function orderBySavedIds<T extends { id: string }>(list: T[], savedIds: string[]) {
  const position = new Map<string, number>();
  savedIds.forEach((id, index) => { if (!position.has(id)) position.set(id, index); });
  const known = list.filter((item) => position.has(item.id)).sort((a, b) => (position.get(a.id) as number) - (position.get(b.id) as number));
  const unknown = list.filter((item) => !position.has(item.id));
  return [...known, ...unknown];
}

/** Returns a randomly ordered copy of `list` (Fisher–Yates). */
export function shuffleList<T>(list: readonly T[], random = Math.random): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.max(0, Math.min(0.999999, random())) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
