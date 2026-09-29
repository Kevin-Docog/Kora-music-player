export function mergeScannedTrack<T extends { id: string }>(current: T[], next: T) {
  const withoutExisting = current.filter((track) => track.id !== next.id);
  return [...withoutExisting, next];
}

export function mergeScannedTracks<T extends { id: string }>(current: T[], scanned: T[]) {
  // Same result as merging one-by-one (scanned tracks replace old ones and go last), but O(n + m).
  const incoming = new Map<string, T>();
  for (const track of scanned) {
    incoming.delete(track.id);
    incoming.set(track.id, track);
  }
  if (!incoming.size) return [...current];
  return [...current.filter((track) => !incoming.has(track.id)), ...incoming.values()];
}

export function getUncachedAssetIds<T extends { id: string }>(assets: T[], cachedIds: Set<string>) {
  return assets.filter((asset) => !cachedIds.has(asset.id)).map((asset) => asset.id);
}
