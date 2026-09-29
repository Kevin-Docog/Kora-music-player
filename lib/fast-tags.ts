// Reads title / artist / album / lyrics / cover art straight from the start of an audio file.
//
// Why this exists: on a big Android library, tag readers that pull whole files (or use HTTP-style
// range requests against file:// URIs) are extremely slow. This reader asks for a small first chunk,
// walks the tag structure, and only fetches extra byte ranges for the pieces it actually wants
// (for example the cover picture). It is pure TypeScript with an injected byte reader so it can be
// unit-tested without a device.

export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

export type FastPicture = { data: Uint8Array; format: string };
export type FastTags = {
  title?: string;
  artist?: string;
  album?: string;
  lyricsText?: string;
  picture?: FastPicture;
};
export type FastTagOptions = { picture?: boolean };

const HEAD_BYTES = 32 * 1024;
const MAX_PICTURE_BYTES = 8 * 1024 * 1024;

class Source {
  private head: Uint8Array | null = null;
  constructor(private readonly reader: ByteReader) {}

  async get(offset: number, length: number): Promise<Uint8Array> {
    if (length <= 0 || offset < 0) return new Uint8Array(0);
    if (offset + length <= HEAD_BYTES) {
      if (!this.head) this.head = await this.reader(0, HEAD_BYTES);
      return this.head.subarray(Math.min(offset, this.head.length), Math.min(offset + length, this.head.length));
    }
    return this.reader(offset, length);
  }
}

// ---- byte helpers ----------------------------------------------------------
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u32le = (b: Uint8Array, o: number) => ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;
const syncsafe = (b: Uint8Array, o: number) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

function latin1(b: Uint8Array) {
  let out = "";
  for (let i = 0; i < b.length; i += 1) out += String.fromCharCode(b[i]);
  return out;
}

function utf8(b: Uint8Array) {
  let out = "";
  for (let i = 0; i < b.length;) {
    const c = b[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c >= 0xc0 && c < 0xe0 && i < b.length) out += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f));
    else if (c >= 0xe0 && c < 0xf0 && i + 1 < b.length) out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f));
    else if (c >= 0xf0 && i + 2 < b.length) {
      const cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

function utf16(b: Uint8Array, littleEndian: boolean) {
  let out = "";
  for (let i = 0; i + 1 < b.length; i += 2) {
    out += String.fromCharCode(littleEndian ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
  }
  return out;
}

/** ID3 text encodings: 0 = latin1, 1 = UTF-16 with BOM, 2 = UTF-16BE, 3 = UTF-8. */
function decodeText(encoding: number, b: Uint8Array) {
  if (encoding === 1) {
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return utf16(b.subarray(2), true);
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return utf16(b.subarray(2), false);
    return utf16(b, true);
  }
  if (encoding === 2) return utf16(b, false);
  if (encoding === 3) return utf8(b);
  return latin1(b);
}

const wide = (encoding: number) => encoding === 1 || encoding === 2;

function findTerminator(b: Uint8Array, start: number, encoding: number) {
  if (wide(encoding)) {
    for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
    return -1;
  }
  for (let i = start; i < b.length; i += 1) if (b[i] === 0) return i;
  return -1;
}

const clean = (value: string) => value.replace(/\u0000+$/g, "").trim() || undefined;
const cleanList = (value: string) => value.split("\u0000").map((part) => part.trim()).filter(Boolean).join(", ") || undefined;

function removeUnsync(b: Uint8Array) {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i += 1) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i += 1;
  }
  return out.subarray(0, n);
}

// ---- ID3v2 (mp3 and friends) ----------------------------------------------
function parseId3Text(body: Uint8Array) {
  if (!body.length) return undefined;
  return decodeText(body[0], body.subarray(1));
}

function parseId3Lyrics(body: Uint8Array) {
  if (body.length < 5) return undefined;
  const encoding = body[0];
  const terminator = findTerminator(body, 4, encoding);
  const textStart = terminator < 0 ? 4 : terminator + (wide(encoding) ? 2 : 1);
  return clean(decodeText(encoding, body.subarray(textStart)));
}

function parseId3Picture(body: Uint8Array, isV22: boolean): FastPicture | undefined {
  if (body.length < 8) return undefined;
  const encoding = body[0];
  let p = 1;
  let format: string;
  if (isV22) {
    format = `image/${latin1(body.subarray(1, 4)).toLowerCase()}`;
    p = 4;
  } else {
    const end = body.indexOf(0, p);
    if (end < 0) return undefined;
    format = latin1(body.subarray(p, end));
    p = end + 1;
  }
  if (format === "-->") return undefined; // link to an external image, not embedded
  p += 1; // picture type
  const terminator = findTerminator(body, p, encoding);
  if (terminator < 0) return undefined;
  p = terminator + (wide(encoding) ? 2 : 1);
  const data = body.subarray(p);
  return data.length ? { data, format } : undefined;
}

async function readId3(src: Source, options: FastTagOptions): Promise<{ tags: FastTags; end: number } | null> {
  const header = await src.get(0, 10);
  if (header.length < 10 || header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null;
  const major = header[3];
  const flags = header[5];
  const size = syncsafe(header, 6);
  const end = 10 + size;
  const tags: FastTags = {};
  const result = { tags, end: end + (major === 4 && flags & 0x10 ? 10 : 0) };
  if (major < 2 || major > 4) return result;

  const isV22 = major === 2;
  const idLength = isV22 ? 3 : 4;
  const headerLength = isV22 ? 6 : 10;
  const tagUnsync = (flags & 0x80) !== 0 && major < 4;
  let pos = 10;

  if (flags & 0x40 && major >= 3) {
    const ext = await src.get(pos, 4);
    if (ext.length === 4) pos += major === 4 ? syncsafe(ext, 0) : u32be(ext, 0) + 4;
  }

  let artistFallback: string | undefined;
  while (pos + headerLength <= end) {
    const frameHeader = await src.get(pos, headerLength);
    if (frameHeader.length < headerLength || frameHeader[0] === 0) break;
    const id = latin1(frameHeader.subarray(0, idLength));
    const frameSize = isV22
      ? (frameHeader[3] << 16) | (frameHeader[4] << 8) | frameHeader[5]
      : major === 3 ? u32be(frameHeader, 4) : syncsafe(frameHeader, 4);
    const frameFlags = isV22 ? 0 : (frameHeader[8] << 8) | frameHeader[9];
    const bodyStart = pos + headerLength;
    if (frameSize <= 0 || bodyStart + frameSize > end) break;
    pos = bodyStart + frameSize;

    const kind =
      id === "TIT2" || id === "TT2" ? "title"
      : id === "TPE1" || id === "TP1" ? "artist"
      : id === "TPE2" || id === "TP2" ? "artist2"
      : id === "TALB" || id === "TAL" ? "album"
      : id === "USLT" || id === "ULT" ? "lyrics"
      : id === "APIC" || id === "PIC" ? "picture"
      : null;
    if (!kind) continue;
    if (kind === "picture" && (!options.picture || tags.picture)) continue;
    if (kind === "picture" && frameSize > MAX_PICTURE_BYTES) continue;

    // Skip compressed / encrypted frames; we can't read them.
    if (major === 4 && frameFlags & 0x000c) continue;
    if (major === 3 && frameFlags & 0x00c0) continue;

    let body = await src.get(bodyStart, frameSize);
    if (body.length < frameSize) continue;
    if (major === 4 && frameFlags & 0x0001) body = body.subarray(4); // data length indicator
    if (tagUnsync || (major === 4 && frameFlags & 0x0002)) body = removeUnsync(body);

    if (kind === "title") tags.title ??= clean(parseId3Text(body) ?? "");
    else if (kind === "artist") tags.artist ??= cleanList(parseId3Text(body) ?? "");
    else if (kind === "artist2") artistFallback ??= cleanList(parseId3Text(body) ?? "");
    else if (kind === "album") tags.album ??= clean(parseId3Text(body) ?? "");
    else if (kind === "lyrics") tags.lyricsText ??= parseId3Lyrics(body);
    else if (kind === "picture") tags.picture = parseId3Picture(body, isV22);
  }
  tags.artist ??= artistFallback;
  return result;
}

// ---- FLAC -----------------------------------------------------------------
async function readFlac(src: Source, offset: number, options: FastTagOptions): Promise<FastTags | null> {
  const magic = await src.get(offset, 4);
  if (magic.length < 4 || latin1(magic) !== "fLaC") return null;
  const tags: FastTags = {};
  const artists: string[] = [];
  let pos = offset + 4;

  for (let block = 0; block < 64; block += 1) {
    const header = await src.get(pos, 4);
    if (header.length < 4) break;
    const isLast = (header[0] & 0x80) !== 0;
    const type = header[0] & 0x7f;
    const length = (header[1] << 16) | (header[2] << 8) | header[3];
    const bodyStart = pos + 4;
    pos = bodyStart + length;

    if (type === 4 && length < 1024 * 1024) {
      const body = await src.get(bodyStart, length);
      if (body.length >= 8) {
        let p = 4 + u32le(body, 0);
        const count = p + 4 <= body.length ? u32le(body, p) : 0;
        p += 4;
        for (let i = 0; i < count && p + 4 <= body.length; i += 1) {
          const entryLength = u32le(body, p);
          p += 4;
          const entry = utf8(body.subarray(p, p + entryLength));
          p += entryLength;
          const eq = entry.indexOf("=");
          if (eq <= 0) continue;
          const key = entry.slice(0, eq).toUpperCase();
          const value = entry.slice(eq + 1).trim();
          if (!value) continue;
          if (key === "TITLE") tags.title ??= value;
          else if (key === "ARTIST") artists.push(value);
          else if (key === "ALBUMARTIST" && !tags.artist) tags.artist = value;
          else if (key === "ALBUM") tags.album ??= value;
          else if (key === "LYRICS" || key === "UNSYNCEDLYRICS" || key === "UNSYNCED LYRICS") tags.lyricsText ??= value;
        }
      }
    } else if (type === 6 && options.picture && !tags.picture && length <= MAX_PICTURE_BYTES) {
      const body = await src.get(bodyStart, length);
      if (body.length >= 32) {
        let p = 4;
        const mimeLength = u32be(body, p);
        p += 4;
        const format = latin1(body.subarray(p, p + mimeLength));
        p += mimeLength;
        const descriptionLength = u32be(body, p);
        p += 4 + descriptionLength + 16;
        const dataLength = u32be(body, p);
        p += 4;
        const data = body.subarray(p, p + dataLength);
        if (data.length) tags.picture = { data, format };
      }
    }
    if (isLast) break;
  }
  if (artists.length) tags.artist = artists.join(", ");
  return tags;
}

// ---- MP4 / M4A ------------------------------------------------------------
type Atom = { start: number; end: number };

async function findAtom(src: Source, start: number, end: number, type: string): Promise<Atom | null> {
  let pos = start;
  for (let i = 0; i < 512 && pos + 8 <= end; i += 1) {
    const header = await src.get(pos, 16);
    if (header.length < 8) return null;
    let size = u32be(header, 0);
    const name = latin1(header.subarray(4, 8));
    let headerLength = 8;
    if (size === 1) {
      if (header.length < 16) return null;
      size = u32be(header, 8) * 2 ** 32 + u32be(header, 12);
      headerLength = 16;
    } else if (size === 0) {
      if (!Number.isFinite(end)) return null;
      size = end - pos;
    }
    if (size < headerLength) return null;
    if (name === type) return { start: pos + headerLength, end: Math.min(pos + size, end) };
    pos += size;
  }
  return null;
}

async function readMp4(src: Source, options: FastTagOptions): Promise<FastTags | null> {
  const ftyp = await src.get(4, 4);
  if (ftyp.length < 4 || latin1(ftyp) !== "ftyp") return null;
  const tags: FastTags = {};
  const moov = await findAtom(src, 0, Infinity, "moov");
  if (!moov) return tags;
  const udta = await findAtom(src, moov.start, moov.end, "udta");
  if (!udta) return tags;
  const meta = await findAtom(src, udta.start, udta.end, "meta");
  if (!meta) return tags;
  const ilst = await findAtom(src, meta.start + 4, meta.end, "ilst"); // meta is a "full box": 4 bytes of version/flags
  if (!ilst) return tags;

  let pos = ilst.start;
  for (let i = 0; i < 256 && pos + 8 <= ilst.end; i += 1) {
    const header = await src.get(pos, 8);
    if (header.length < 8) break;
    const size = u32be(header, 0);
    const name = latin1(header.subarray(4, 8));
    if (size < 8) break;
    const itemStart = pos + 8;
    const itemEnd = Math.min(pos + size, ilst.end);
    pos += size;

    const field = name === "\u00a9nam" ? "title" : name === "\u00a9ART" ? "artist" : name === "aART" ? "artist2" : name === "\u00a9alb" ? "album" : name === "\u00a9lyr" ? "lyrics" : name === "covr" ? "picture" : null;
    if (!field) continue;
    if (field === "picture" && (!options.picture || tags.picture)) continue;
    const data = await findAtom(src, itemStart, itemEnd, "data");
    if (!data || data.end - data.start <= 8) continue;
    const payloadLength = data.end - data.start - 8;
    if (payloadLength > MAX_PICTURE_BYTES) continue;
    const meta8 = await src.get(data.start, 8);
    const payload = await src.get(data.start + 8, payloadLength);
    if (meta8.length < 8 || payload.length < payloadLength) continue;
    if (field === "picture") {
      const kind = meta8[3];
      tags.picture = { data: payload, format: kind === 14 ? "image/png" : "image/jpeg" };
    } else {
      const text = clean(utf8(payload));
      if (field === "title") tags.title ??= text;
      else if (field === "artist") tags.artist ??= text;
      else if (field === "artist2") { if (!tags.artist) tags.artist = text; }
      else if (field === "album") tags.album ??= text;
      else if (field === "lyrics") tags.lyricsText ??= text;
    }
  }
  return tags;
}

/**
 * Reads embedded tags. Supports MP3 (ID3v2.2/2.3/2.4), FLAC and MP4/M4A/AAC-in-MP4.
 * Other containers return {} so callers can fall back to the device's own metadata.
 */
export async function readFastTags(reader: ByteReader, options: FastTagOptions = {}): Promise<FastTags> {
  const src = new Source(reader);
  const id3 = await readId3(src, options);
  if (id3) {
    // Some FLAC files carry an ID3 header in front of the stream.
    const flac = await readFlac(src, id3.end, options).catch(() => null);
    return flac ? { ...id3.tags, ...Object.fromEntries(Object.entries(flac).filter(([, value]) => value !== undefined)) } : id3.tags;
  }
  const flac = await readFlac(src, 0, options);
  if (flac) return flac;
  const mp4 = await readMp4(src, options);
  return mp4 ?? {};
}
