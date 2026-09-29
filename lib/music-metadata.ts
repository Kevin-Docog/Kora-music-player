// Metadata reading is intentionally read-only: edits are stored as local overrides so the
// app never mutates the user's original music files.
import { Buffer } from "buffer";

export type NativeAudioAsset = {
  id: string;
  filename: string;
  uri: string;
  duration: number;
  localUri?: string;
  title?: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
};

export type ScannedMusicTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  uri: string;
  artworkUri?: string;
  tone: string;
  initials: string;
  lyrics: boolean;
};

export type LyricLine = { time: number; text: string };
export type EmbeddedArtwork = { base64: string; extension: "jpg" | "png" | "webp" | "gif" };
export type EmbeddedMusicTags = {
  title?: string;
  artist?: string;
  album?: string;
  lyricsText?: string;
  artworkUri?: string;
  artwork?: EmbeddedArtwork;
};

const tones = ["#273b53", "#554060", "#63433e", "#374e3f", "#464052", "#3d4e3b"];
// Covers are written to a file (not kept in memory/AsyncStorage), so large art is fine.
const MAX_EMBEDDED_ARTWORK_BYTES = 8 * 1024 * 1024;

function extensionForMime(format: string): EmbeddedArtwork["extension"] {
  const mime = format.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function sniffExtension(bytes: ArrayLike<number>): EmbeddedArtwork["extension"] | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "webp";
  return undefined;
}

/** Converts an embedded picture into base64 without copying it into a giant JS array first. */
export function pictureToArtwork(picture: unknown): EmbeddedArtwork | undefined {
  if (!picture || typeof picture !== "object") return undefined;
  const record = picture as { data?: unknown; format?: unknown };
  const data = record.data;
  if (!Array.isArray(data) && !(data instanceof Uint8Array)) return undefined;
  const bytes = data as ArrayLike<number>;
  if (!bytes.length || bytes.length > MAX_EMBEDDED_ARTWORK_BYTES) return undefined;
  const format = typeof record.format === "string" ? record.format : "";
  // Trust the real image header over the tag's declared MIME type (many files get it wrong).
  const extension = sniffExtension(bytes) ?? extensionForMime(format);
  return { base64: Buffer.from(data as Uint8Array | number[]).toString("base64"), extension };
}

export function formatMusicDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function parseMusicFilename(filename: string) {
  const withoutExtension = filename.replace(/\.[^/.]+$/, "").trim();
  const parts = withoutExtension.split(/\s[-–—]\s/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: "Unknown artist", title: withoutExtension || "Untitled" };
}

export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timestampPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const line of text.split(/\r?\n/)) {
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    timestampPattern.lastIndex = 0;
    while ((match = timestampPattern.exec(line)) !== null) {
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0")}`) : 0;
      timestamps.push(Number(match[1]) * 60 + Number(match[2]) + fraction);
    }
    if (!timestamps.length) continue;
    const lyricText = line.replace(timestampPattern, "").trim();
    if (!lyricText) continue;
    timestamps.forEach((time) => lines.push({ time, text: lyricText }));
  }

  return lines.sort((a, b) => a.time - b.time);
}

export function mapNativeAudioAsset(asset: NativeAudioAsset, index = 0): ScannedMusicTrack {
  const parsed = parseMusicFilename(asset.filename);
  const title = asset.title?.trim() || parsed.title;
  const artist = asset.artist?.trim() || parsed.artist;
  const album = asset.album?.trim() || "Unknown album";
  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "♪";
  return {
    id: `asset-${asset.id}`,
    title,
    artist,
    album,
    duration: formatMusicDuration(asset.duration),
    uri: asset.localUri || asset.uri,
    artworkUri: asset.artworkUri,
    tone: tones[index % tones.length],
    initials,
    lyrics: false,
  };
}
