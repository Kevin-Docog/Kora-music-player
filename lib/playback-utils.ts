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
