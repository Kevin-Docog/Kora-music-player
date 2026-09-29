import { parseLrc, type LyricLine } from "./music-metadata";

export type MetadataPatch = {
  title?: string;
  artist?: string;
  album?: string;
  lyricsText?: string;
};

export type MetadataEditableTrack = {
  title: string;
  artist: string;
  album: string;
  lyrics: boolean;
  lyricsText?: string;
  lyricLines?: LyricLine[];
};

export function normalizeMetadataPatch(patch: MetadataPatch): MetadataPatch {
  return {
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.artist !== undefined ? { artist: patch.artist.trim() } : {}),
    ...(patch.album !== undefined ? { album: patch.album.trim() } : {}),
    ...(patch.lyricsText !== undefined ? { lyricsText: patch.lyricsText.trim() } : {}),
  };
}

export function applyMetadataPatch<T extends MetadataEditableTrack>(track: T, patch: MetadataPatch): T & { lyricsText?: string; lyricLines?: LyricLine[] } {
  const normalized = normalizeMetadataPatch(patch);
  const lyricsText = normalized.lyricsText !== undefined ? normalized.lyricsText : track.lyricsText;
  return {
    ...track,
    ...(normalized.title !== undefined ? { title: normalized.title || track.title } : {}),
    ...(normalized.artist !== undefined ? { artist: normalized.artist || track.artist } : {}),
    ...(normalized.album !== undefined ? { album: normalized.album || track.album } : {}),
    ...(normalized.lyricsText !== undefined ? {
      lyricsText: lyricsText || undefined,
      lyrics: Boolean(lyricsText),
      lyricLines: lyricsText ? parseLrc(lyricsText) : [],
    } : {}),
  };
}
