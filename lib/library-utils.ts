export type SortableLibraryTrack = { artist: string; album: string; duration: string; addedAt: number; title: string };
export type LibrarySort = "recent" | "title" | "artist" | "album" | "duration";

function durationSeconds(duration: string) {
  const [minutes, seconds] = duration.split(":").map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
}

// String.localeCompare builds a new collator on every call, which is very slow on thousands of songs.
// Sharing one collator gives identical ordering at a fraction of the cost.
const baseCollator = new Intl.Collator(undefined, { sensitivity: "base" });
const defaultCollator = new Intl.Collator();

export function sortLibraryTracks<T extends SortableLibraryTrack>(tracks: T[], sort: LibrarySort) {
  if (sort === "duration") {
    const seconds = new Map(tracks.map((track) => [track, durationSeconds(track.duration)]));
    return [...tracks].sort((a, b) => (seconds.get(a) ?? 0) - (seconds.get(b) ?? 0));
  }
  return [...tracks].sort((a, b) => {
    if (sort === "title") return baseCollator.compare(a.title, b.title);
    if (sort === "artist") return defaultCollator.compare(a.artist, b.artist) || defaultCollator.compare(a.title, b.title);
    if (sort === "album") return defaultCollator.compare(a.album, b.album) || defaultCollator.compare(a.title, b.title);
    return b.addedAt - a.addedAt;
  });
}
