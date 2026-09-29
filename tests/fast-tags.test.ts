import { describe, expect, it } from "vitest";
import { readFastTags, type ByteReader } from "../lib/fast-tags";

// ---- tiny builders for synthetic audio files ----
const enc = (s: string) => Array.from(new TextEncoder().encode(s));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => be32(n).reverse();
const syncsafe = (n: number) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const utf16le = (s: string) => [0xff, 0xfe, ...Array.from(s).flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])];
const jpeg = (size: number) => [0xff, 0xd8, 0xff, 0xe0, ...new Array(size).fill(9)];

const readerFor = (bytes: number[]): { reader: ByteReader; reads: number[] } => {
  const data = Uint8Array.from(bytes);
  const reads: number[] = [];
  return { reads, reader: async (offset, length) => { reads.push(length); return data.slice(offset, offset + length); } };
};

function id3v23(frames: number[][]) {
  const body = frames.flat();
  return [...enc("ID3"), 3, 0, 0, ...syncsafe(body.length), ...body];
}
const frame23 = (id: string, body: number[]) => [...enc(id), ...be32(body.length), 0, 0, ...body];
const frame24 = (id: string, body: number[]) => [...enc(id), ...syncsafe(body.length), 0, 0, ...body];

describe("fast tag reader", () => {
  it("reads ID3v2.3 text, lyrics and a cover larger than 128KB", async () => {
    const cover = jpeg(300 * 1024);
    const file = [
      ...id3v23([
        frame23("TIT2", [1, ...utf16le("Sørø Song")]),
        frame23("TPE1", [0, ...enc("The Artist")]),
        frame23("TALB", [0, ...enc("Long Album")]),
        frame23("USLT", [0, ...enc("eng"), 0, ...enc("[00:01.00]Hello")]),
        frame23("APIC", [0, ...enc("image/jpeg"), 0, 3, 0, ...cover]),
      ]),
      ...new Array(1000).fill(0xff),
    ];
    const { reader } = readerFor(file);
    const tags = await readFastTags(reader, { picture: true });
    expect(tags.title).toBe("Sørø Song");
    expect(tags.artist).toBe("The Artist");
    expect(tags.album).toBe("Long Album");
    expect(tags.lyricsText).toBe("[00:01.00]Hello");
    expect(tags.picture?.data.length).toBe(cover.length);
    expect(tags.picture?.data[0]).toBe(0xff);
  });

  it("reads ID3v2.4 UTF-8 and does not fetch the picture when not wanted", async () => {
    const cover = jpeg(200 * 1024);
    const body = [
      ...frame24("TIT2", [3, ...enc("Título")]),
      ...frame24("TPE1", [3, ...enc("A"), 0, ...enc("B")]),
      ...frame24("APIC", [3, ...enc("image/jpeg"), 0, 3, ...enc("cover"), 0, ...cover]),
    ];
    const bytes = [...enc("ID3"), 4, 0, 0, ...syncsafe(body.length), ...body];
    const { reader, reads } = readerFor(bytes);
    const tags = await readFastTags(reader, { picture: false });
    expect(tags.title).toBe("Título");
    expect(tags.artist).toBe("A, B");
    expect(tags.picture).toBeUndefined();
    expect(Math.max(...reads)).toBeLessThanOrEqual(32 * 1024);
  });

  it("reads FLAC vorbis comments and picture", async () => {
    const comment = (s: string) => [...le32(enc(s).length), ...enc(s)];
    const vendor = enc("ref");
    const vorbis = [...le32(vendor.length), ...vendor, ...le32(3), ...comment("TITLE=Flac Song"), ...comment("ARTIST=One"), ...comment("ALBUM=Flac Album")];
    const cover = jpeg(50 * 1024);
    const mime = enc("image/jpeg");
    const picture = [...be32(3), ...be32(mime.length), ...mime, ...be32(0), ...be32(1), ...be32(1), ...be32(24), ...be32(0), ...be32(cover.length), ...cover];
    const block = (type: number, last: boolean, body: number[]) => [(last ? 0x80 : 0) | type, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body];
    const file = [...enc("fLaC"), ...block(0, false, new Array(34).fill(0)), ...block(4, false, vorbis), ...block(6, true, picture), 1, 2, 3];
    const tags = await readFastTags(readerFor(file).reader, { picture: true });
    expect(tags.title).toBe("Flac Song");
    expect(tags.artist).toBe("One");
    expect(tags.album).toBe("Flac Album");
    expect(tags.picture?.data.length).toBe(cover.length);
  });

  it("reads M4A tags even when the moov atom comes after a big mdat", async () => {
    const atom = (name: string, body: number[]) => [...be32(8 + body.length), ...enc(name), ...body];
    // Real files store the copyright sign in atom names as the single byte 0xA9, so build names from bytes.
    const item = (name: number[], payload: number[]) => { const data = atom("data", payload); return [...be32(8 + data.length), ...name, ...data]; };
    const text = (value: string) => [0, 0, 0, 1, 0, 0, 0, 0, ...enc(value)];
    const cover = jpeg(150 * 1024);
    const ilst = atom("ilst", [
      ...item([0xa9, 0x6e, 0x61, 0x6d], text("M4A Song")),
      ...item([0xa9, 0x41, 0x52, 0x54], text("M4A Artist")),
      ...item([0xa9, 0x61, 0x6c, 0x62], text("M4A Album")),
      ...item(enc("covr"), [0, 0, 0, 13, 0, 0, 0, 0, ...cover]),
    ]);
    const moov = atom("moov", [...atom("mvhd", new Array(100).fill(0)), ...atom("udta", atom("meta", [0, 0, 0, 0, ...ilst]))]);
    const mdat = atom("mdat", new Array(200 * 1024).fill(1));
    const file = [...atom("ftyp", [...enc("M4A "), 0, 0, 0, 0]), ...mdat, ...moov];
    const tags = await readFastTags(readerFor(file).reader, { picture: true });
    expect(tags.title).toBe("M4A Song");
    expect(tags.artist).toBe("M4A Artist");
    expect(tags.album).toBe("M4A Album");
    expect(tags.picture?.data.length).toBe(cover.length);
  });

  it("returns an empty result for unknown formats and never throws on junk", async () => {
    expect(await readFastTags(readerFor(enc("OggS....not supported")).reader, { picture: true })).toEqual({});
    expect(await readFastTags(readerFor([]).reader)).toEqual({});
    const junk = [...enc("ID3"), 3, 0, 0, ...syncsafe(50), ...new Array(50).fill(0x41)];
    await expect(readFastTags(readerFor(junk).reader, { picture: true })).resolves.toBeDefined();
  });
});
