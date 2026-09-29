export type FilterableTrack = {
  title: string;
  artist: string;
  album: string;
  lyrics: boolean;
};

export function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function filterMusicTracks<T extends FilterableTrack>(tracks: T[], query: string, filter: string, favoriteIds: string[], getId: (track: T) => string) {
  const normalizedQuery = query.trim().toLowerCase();
  return tracks.filter((track) => {
    const searchable = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
    const matchesQuery = searchable.includes(normalizedQuery);
    const matchesFilter = filter === "All tracks" || (filter === "Favorites" && favoriteIds.includes(getId(track))) || (filter === "With lyrics" && track.lyrics);
    return matchesQuery && matchesFilter;
  });
}
