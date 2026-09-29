/** Small seeded random generator so the same day gives the same mix. */
export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dayKey(date: Date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/**
 * Builds the "Daily mix": up to `size` songs, leaning on favorites (about 60%) and filled out with
 * other songs from the library, in a shuffled order. The same seed (day + remix count) always
 * gives the same mix, so it stays put during the day until the person taps Remix.
 */
export function buildDailyMix<T extends { id: string }>(tracks: T[], favoriteIds: Iterable<string>, seed: number, size = 30): T[] {
  if (tracks.length === 0) return [];
  const random = createSeededRandom(seed);
  const favorites = new Set(favoriteIds);
  const favoriteTracks = shuffled(tracks.filter((track) => favorites.has(track.id)), random);
  const otherTracks = shuffled(tracks.filter((track) => !favorites.has(track.id)), random);
  const target = Math.min(size, tracks.length);

  const favoriteTarget = Math.min(favoriteTracks.length, Math.ceil(target * 0.6));
  const picked = [...favoriteTracks.slice(0, favoriteTarget), ...otherTracks.slice(0, target - favoriteTarget)];
  // Not enough non-favorites to fill the mix: top up with the remaining favorites.
  if (picked.length < target) picked.push(...favoriteTracks.slice(favoriteTarget, favoriteTarget + (target - picked.length)));
  return shuffled(picked, random);
}
