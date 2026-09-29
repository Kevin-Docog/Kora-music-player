export function prepareTracksForPersistence<T extends { artworkUri?: string }>(tracks: T[]) {
  return tracks.map((track) => ({
    ...track,
    ...(track.artworkUri?.startsWith("data:") ? { artworkUri: undefined } : {}),
    // Parsed lyric lines duplicate lyricsText and are rebuilt on load, so don't write them twice.
    lyricLines: undefined,
  }));
}
