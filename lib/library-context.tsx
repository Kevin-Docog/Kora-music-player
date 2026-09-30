import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyMetadataPatch, type MetadataPatch } from "@/lib/metadata-utils";
import { Buffer } from "buffer";
import { mapNativeAudioAsset, parseLrc, pictureToArtwork, type EmbeddedArtwork, type EmbeddedMusicTags, type NativeAudioAsset, type ScannedMusicTrack } from "@/lib/music-metadata";
import { readFastTags, type ByteReader } from "@/lib/fast-tags";
import { sortLibraryTracks, type LibrarySort } from "@/lib/library-utils";
import { prepareTracksForPersistence } from "@/lib/library-persistence";
import { mergeScannedTracks } from "@/lib/library-scan-utils";
import { useAudioPlayerController, type QueueTrack } from "@/lib/audio-player-context";
export type { LibrarySort } from "@/lib/library-utils";

export type LibraryTrack = ScannedMusicTrack & {
  addedAt: number;
  /** True once artwork has been looked for, so cached tracks aren't re-read on every launch. */
  artChecked?: boolean;
  lyricsText?: string;
  lyricLines?: Array<{ time: number; text: string }>;
};

export type ScanStatus = "idle" | "scanning" | "paused" | "complete" | "cancelled" | "denied" | "unavailable" | "error";

export type ScanState = {
  status: ScanStatus;
  processed: number;
  total: number;
  lastScannedAt?: number;
  message?: string;
};

const TRACKS_KEY = "kora.library.tracks";
const SCAN_KEY = "kora.library.scan";
const OVERRIDES_KEY = "kora.library.metadata-overrides";
const PAGE_SIZE = 1000;
const pausedMessage = (processed: number, total: number) => (total ? `Paused — ${processed} of ${total} tracks done. Tap Resume to continue` : "Scan paused. Tap Resume to continue");
const LIBRARY_FILE = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}kora-library.json` : undefined;

type AssetWithMetadata = MediaLibrary.Asset & {
  title?: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
};
type AssetInfoWithMetadata = Awaited<ReturnType<typeof MediaLibrary.getAssetInfoAsync>> & {
  artworkUri?: string;
};

function uniqueUris(uris: Array<string | undefined>) {
  return Array.from(new Set(uris.filter((uri): uri is string => Boolean(uri))));
}


// ---- Artwork storage -------------------------------------------------------
// Embedded covers are saved as small files and referenced by URI. Keeping them as
// base64 strings in state/AsyncStorage made big libraries slow and (because of the old
// size limit) dropped most covers entirely.
const ARTWORK_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}artwork/` : undefined;
let artworkDirReady: Promise<unknown> | null = null;

function hashArtwork(base64: string) {
  // Hash every character (two independent 32-bit hashes) so different covers of the same
  // size can't collide and end up sharing one file.
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < base64.length; i += 1) {
    const code = base64.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) ^ code) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}${base64.length.toString(36)}`;
}

async function saveArtworkFile(trackId: string, art: EmbeddedArtwork) {
  if (!ARTWORK_DIR) return undefined;
  try {
    artworkDirReady ??= FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true }).catch(() => undefined);
    await artworkDirReady;
    // One file per unique cover (a 12-track album shares a single image instead of 12 copies).
    const uri = `${ARTWORK_DIR}art-${hashArtwork(art.base64)}.${art.extension}`;
    const existing = await FileSystem.getInfoAsync(uri).catch(() => undefined);
    if (!existing?.exists) await FileSystem.writeAsStringAsync(uri, art.base64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  } catch {
    return undefined;
  }
}

/** iOS changes the app container path between updates, so re-point saved artwork at today's folder. */
function restoreArtworkUri(uri?: string) {
  if (!uri || !ARTWORK_DIR || !/\/artwork\/[^/]+$/.test(uri) || uri.startsWith("content:")) return uri;
  return `${ARTWORK_DIR}${uri.split("/artwork/").pop()}`;
}

const COVER_NAMES = ["cover", "folder", "front", "albumart", "album"];
const COVER_EXTENSIONS = ["jpg", "jpeg", "png"];
const folderListingCache = new Map<string, Map<string, string> | null>();

/** Lists a folder once and remembers it, instead of probing for files once per song. */
async function listFolder(folder: string) {
  if (folderListingCache.has(folder)) return folderListingCache.get(folder) ?? null;
  let listing: Map<string, string> | null = null;
  try {
    const names = await FileSystem.readDirectoryAsync(folder);
    listing = new Map(names.map((name) => [name.toLowerCase(), name]));
  } catch {
    listing = null; // e.g. Android hides non-audio files from apps that only hold the audio permission
  }
  folderListingCache.set(folder, listing);
  return listing;
}

function folderOf(uri: string) {
  const cleanUri = uri.split("?")[0];
  if (/^(content|ph):\/\//i.test(cleanUri)) return undefined;
  const slash = cleanUri.lastIndexOf("/");
  return slash < 0 ? undefined : cleanUri.slice(0, slash + 1);
}

/** Falls back to cover.jpg / folder.jpg next to the song, like most desktop players do. */
async function findFolderCover(candidates: string[]) {
  for (const uri of candidates) {
    const folder = folderOf(uri);
    if (!folder) continue;
    const listing = await listFolder(folder);
    if (!listing) continue;
    for (const name of COVER_NAMES) {
      for (const extension of COVER_EXTENSIONS) {
        const match = listing.get(`${name}.${extension}`);
        if (match) return `${folder}${match}`;
      }
    }
  }
  return undefined;
}

/**
 * Reads only the parts of the file that hold tags, through native file reads.
 * If the platform ignores the requested byte range and hands back the whole file,
 * that copy is kept and sliced instead, so results stay correct either way.
 */
function makeByteReader(uri: string): ByteReader {
  let whole: Uint8Array | undefined;
  return async (offset, length) => {
    if (whole) return whole.subarray(Math.min(offset, whole.length), Math.min(offset + length, whole.length));
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: offset, length });
    if (!base64) return new Uint8Array(0);
    const bytes = Buffer.from(base64, "base64");
    if (offset === 0 && bytes.length > length) {
      whole = bytes;
      return bytes.subarray(0, length);
    }
    return bytes.length > length ? bytes.subarray(0, length) : bytes;
  };
}

async function readEmbeddedTags(candidates: string[], wantPicture: boolean): Promise<EmbeddedMusicTags> {
  const attempts = uniqueUris(candidates.flatMap((uri) => {
    let decoded = uri;
    try { decoded = decodeURI(uri); } catch { /* keep the raw URI */ }
    return [uri, decoded];
  }));
  for (const uri of attempts) {
    try {
      const tags = await readFastTags(makeByteReader(uri), { picture: wantPicture });
      const artwork = tags.picture ? pictureToArtwork({ data: tags.picture.data, format: tags.picture.format }) : undefined;
      return { title: tags.title, artist: tags.artist, album: tags.album, lyricsText: tags.lyricsText, artwork };
    } catch {
      // This URI form couldn't be read; try the next one.
    }
  }
  return {};
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function readSiblingLrc(candidates: string[], filename: string) {
  const baseNames = uniqueUris([
    filename.replace(/\.[^/.]+$/, ""),
    ...candidates.map((uri) => { const name = uri.split("?")[0].split("/").pop() ?? ""; try { return decodeURIComponent(name).replace(/\.[^/.]+$/, ""); } catch { return name.replace(/\.[^/.]+$/, ""); } }),
  ]);
  for (const uri of candidates) {
    const folder = folderOf(uri);
    if (!folder) continue;
    const listing = await listFolder(folder);
    if (!listing) continue;
    for (const baseName of baseNames) {
      const match = listing.get(`${baseName}.lrc`.toLowerCase());
      if (!match) continue;
      try {
        const contents = await FileSystem.readAsStringAsync(`${folder}${match}`);
        if (contents.trim()) return contents;
      } catch { /* try the next candidate */ }
    }
  }
  return undefined;
}

function enrichLyrics(track: LibraryTrack, lyricsText?: string) {
  if (!lyricsText?.trim()) return track;
  return { ...track, lyrics: true, lyricsText, lyricLines: parseLrc(lyricsText) };
}

function applySavedOverride(track: LibraryTrack, patch?: MetadataPatch) {
  return patch ? applyMetadataPatch(track, patch) : track;
}

export function queueTrackFromLibrary(track: LibraryTrack): QueueTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    tone: track.tone,
    initials: track.initials,
    artworkUri: track.artworkUri,
    source: track.uri,
  };
}

type LibraryContextValue = {
  tracks: LibraryTrack[];
  scanState: ScanState;
  refreshLibrary: () => Promise<void>;
  pauseScan: () => void;
  resumeScan: () => void;
  cancelScan: () => void;
  artworkEnabled: boolean;
  lyricsEnabled: boolean;
  setArtworkEnabled: (enabled: boolean) => void;
  setLyricsEnabled: (enabled: boolean) => void;
  sortTracks: (sort: LibrarySort) => LibraryTrack[];
  updateTrackMetadata: (trackId: string, patch: MetadataPatch) => void;
  /** Deletes the song file from the device (the system may ask for confirmation). Returns true if it was deleted. */
  deleteTrack: (trackId: string) => Promise<boolean>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: PropsWithChildren) {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [scanState, setScanState] = useState<ScanState>({ status: "idle", processed: 0, total: 0 });
  const [overrides, setOverrides] = useState<Record<string, MetadataPatch>>({});
  const [artworkEnabled, setArtworkEnabledState] = useState(true);
  const [lyricsEnabled, setLyricsEnabledState] = useState(true);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const overridesRef = useRef(overrides);
  const tracksRef = useRef<LibraryTrack[]>([]);
  const artworkEnabledRef = useRef(true);
  const lyricsEnabledRef = useRef(true);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  const scanProgressRef = useRef({ processed: 0, total: 0 });
  const checkpointRef = useRef<(() => void) | null>(null);
  // Scans must wait until the saved library is loaded; otherwise the cache looks empty and every song is re-read.
  const hydrationRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (!hydrationRef.current) {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => { resolve = done; });
    hydrationRef.current = { promise, resolve };
  }
  const { replaceQueue, mergeIntoQueue, updateQueueTrack } = useAudioPlayerController();

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { artworkEnabledRef.current = artworkEnabled; }, [artworkEnabled]);
  useEffect(() => { lyricsEnabledRef.current = lyricsEnabled; }, [lyricsEnabled]);

  useEffect(() => {
    const safeGet = (key: string) => AsyncStorage.getItem(key).catch(() => null);
    void (async () => {
      const [savedScan, savedOverrides, savedArtwork, savedLyrics] = await Promise.all([
        safeGet(SCAN_KEY),
        safeGet(OVERRIDES_KEY),
        safeGet("kora.library.show-artwork"),
        safeGet("kora.library.match-lyrics"),
      ]);
      // The library lives in a file: AsyncStorage on Android can't reliably hold thousands of tracks in one value.
      let savedTracks: string | null = null;
      try {
        if (LIBRARY_FILE && (await FileSystem.getInfoAsync(LIBRARY_FILE)).exists) savedTracks = await FileSystem.readAsStringAsync(LIBRARY_FILE);
      } catch { /* fall back to the old storage below */ }
      if (!savedTracks) savedTracks = await safeGet(TRACKS_KEY);

      let loadedOverrides: Record<string, MetadataPatch> = {};
      if (savedOverrides) {
        try { loadedOverrides = JSON.parse(savedOverrides) as Record<string, MetadataPatch>; } catch { /* use defaults */ }
      }
      setOverrides(loadedOverrides);
      if (savedTracks) {
        try {
          const parsedTracks = JSON.parse(savedTracks) as LibraryTrack[];
          const restoredTracks = parsedTracks.filter((track) => Boolean(track.uri)).map((track) => applySavedOverride({ ...track, artworkUri: restoreArtworkUri(track.artworkUri), lyricLines: track.lyricLines?.length ? track.lyricLines : track.lyricsText ? parseLrc(track.lyricsText) : track.lyricLines }, loadedOverrides[track.id]));
          tracksRef.current = restoredTracks;
          setTracks(restoredTracks);
          replaceQueue(restoredTracks.map(queueTrackFromLibrary));
        } catch { /* use defaults */ }
      }
      if (savedScan) {
        try { setScanState(JSON.parse(savedScan) as ScanState); } catch { /* use defaults */ }
      }
      if (savedArtwork !== null) setArtworkEnabledState(savedArtwork !== "false");
      if (savedLyrics !== null) setLyricsEnabledState(savedLyrics !== "false");
      setStorageHydrated(true);
      hydrationRef.current?.resolve();
    })();
  }, [replaceQueue]);

  useEffect(() => {
    if (!storageHydrated) return;
    // Writing thousands of tracks on every change froze the UI during scans; save once things settle.
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      if (scanningRef.current) return; // the scan's final update triggers the save
      const persistedTracks = prepareTracksForPersistence(tracks);
      if (!LIBRARY_FILE) return;
      void FileSystem.writeAsStringAsync(LIBRARY_FILE, JSON.stringify(persistedTracks))
        .then(() => AsyncStorage.removeItem(TRACKS_KEY)) // the old copy is no longer needed once the file is saved
        .catch(() => undefined);
    }, 4000);
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current); };
  }, [storageHydrated, tracks]);
  useEffect(() => { if (storageHydrated && scanState.status !== "scanning") void AsyncStorage.setItem(SCAN_KEY, JSON.stringify(scanState)); }, [scanState, storageHydrated]);
  useEffect(() => { if (storageHydrated) void AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides)); }, [overrides, storageHydrated]);

  const updateScan = useCallback((next: ScanState) => setScanState(next), []);

  const refreshLibrary = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    cancelRequestedRef.current = false;
    pauseRequestedRef.current = false;
    scanProgressRef.current = { processed: 0, total: 0 };
    if (Platform.OS === "web") {
      updateScan({ status: "complete", processed: tracksRef.current.length, total: tracksRef.current.length, lastScannedAt: Date.now(), message: "Device scanning is available in the native build" });
      scanningRef.current = false;
      return;
    }

    updateScan({ status: "scanning", processed: 0, total: 0, message: "Checking this device for music" });
    try {
      await hydrationRef.current?.promise;
      if (!(await MediaLibrary.isAvailableAsync())) {
        updateScan({ status: "unavailable", processed: 0, total: 0, message: "Media access is not available on this device" });
        return;
      }

      const currentPermission = await MediaLibrary.getPermissionsAsync(false, ["audio"]);
      const permission = currentPermission.granted ? currentPermission : await MediaLibrary.requestPermissionsAsync(false, ["audio"]);
      if (!permission.granted) {
        updateScan({ status: "denied", processed: 0, total: 0, message: "Music permission was not granted" });
        return;
      }

      const assets: MediaLibrary.Asset[] = [];
      const scanned: LibraryTrack[] = [];
      const restoredTracks = tracksRef.current;
      const cachedTracksById = new Map(restoredTracks.map((track) => [track.id, track]));
      let cachedCount = 0;
      let cursor: string | undefined;
      let hasNextPage = true;
      let lastUiUpdate = 0;
      const reportProgress = (processed: number, total: number, message: string, force = false) => {
        scanProgressRef.current = { processed, total };
        const now = Date.now();
        if (!force && now - lastUiUpdate < 250) return; // avoid re-rendering the app for every single song
        lastUiUpdate = now;
        const paused = pauseRequestedRef.current;
        updateScan({ status: paused ? "paused" : "scanning", processed, total, message: paused ? pausedMessage(processed, total) : message });
      };
      // Saves everything scanned so far, so quitting (or the app being killed) mid-scan loses nothing:
      // next time only the songs that were never scanned are read.
      let lastCheckpoint = Date.now();
      const checkpoint = () => {
        if (!LIBRARY_FILE || !scanned.length) return;
        lastCheckpoint = Date.now();
        const { processed, total } = scanProgressRef.current;
        const snapshot = prepareTracksForPersistence(mergeScannedTracks(restoredTracks, scanned));
        void FileSystem.writeAsStringAsync(LIBRARY_FILE, JSON.stringify(snapshot)).catch(() => undefined);
        void AsyncStorage.setItem(SCAN_KEY, JSON.stringify({ status: "paused", processed, total, message: pausedMessage(processed, total) } satisfies ScanState)).catch(() => undefined);
      };
      checkpointRef.current = checkpoint;
      const waitWhilePaused = async () => {
        if (!pauseRequestedRef.current) return;
        checkpoint();
        while (pauseRequestedRef.current && !cancelRequestedRef.current) await new Promise((resolve) => setTimeout(resolve, 250));
      };
      while (hasNextPage) {
        await waitWhilePaused();
        if (cancelRequestedRef.current) {
          updateScan({ status: "cancelled", processed: 0, total: assets.length, message: "Scan cancelled" });
          return;
        }
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          ...(cursor ? { after: cursor } : {}),
          mediaType: "audio",
          sortBy: "default",
        });
        assets.push(...page.assets);
        cursor = page.endCursor;
        hasNextPage = page.hasNextPage && Boolean(cursor);
        reportProgress(0, assets.length, `Found ${assets.length} music file${assets.length === 1 ? "" : "s"}`);
      }

      // Cached tracks are reused instantly. A cached track is only re-read if artwork was never checked
      // for it (tracks saved by older versions), so covers that were skipped before now get picked up.
      const newAssets: Array<{ asset: AssetWithMetadata; index: number }> = [];
      assets.forEach((rawAsset, index) => {
        const asset = rawAsset as AssetWithMetadata;
        const cachedTrack = cachedTracksById.get(asset.id);
        if (cachedTrack && (cachedTrack.artChecked || !artworkEnabledRef.current)) {
          scanned.push(cachedTrack);
          cachedCount += 1;
        } else {
          newAssets.push({ asset, index });
        }
      });

      const buildTrack = async (asset: AssetWithMetadata, index: number) => {
        // On Android asset.uri is already a readable file:// path, so skip the slow per-song info lookup.
        const info = /^file:/i.test(asset.uri) ? undefined : await MediaLibrary.getAssetInfoAsync(asset).catch(() => undefined) as AssetInfoWithMetadata | undefined;
        const localUri = info?.localUri || asset.uri;
        const candidateUris = uniqueUris([localUri, asset.uri]);
        const wantArtwork = artworkEnabledRef.current;
        const embedded = await readEmbeddedTags(candidateUris, wantArtwork);
        const wantLyrics = lyricsEnabledRef.current;
        const lrcText = wantLyrics ? embedded.lyricsText || await readSiblingLrc(candidateUris, asset.filename) : undefined;
        let artworkUri: string | undefined;
        if (wantArtwork) {
          artworkUri = asset.artworkUri || info?.artworkUri;
          if (!artworkUri && embedded.artwork) artworkUri = await saveArtworkFile(asset.id, embedded.artwork);
          if (!artworkUri) artworkUri = await findFolderCover(candidateUris);
        }
        const enrichedAsset: NativeAudioAsset = {
          id: asset.id,
          filename: asset.filename,
          uri: asset.uri,
          localUri,
          duration: asset.duration,
          title: embedded.title || asset.title,
          artist: embedded.artist || asset.artist,
          album: embedded.album || asset.album,
          artworkUri,
        };
        const baseTrack = mapNativeAudioAsset(enrichedAsset, index);
        const previous = cachedTracksById.get(asset.id);
        return applySavedOverride(enrichLyrics({ ...baseTrack, addedAt: previous?.addedAt ?? Date.now() - index, artChecked: true }, lrcText), overridesRef.current[baseTrack.id]);
      };

      // Read a few files at a time and publish results in batches so the list stays responsive while scanning.
      const CONCURRENCY = 8;
      const pending: LibraryTrack[] = [];
      let lastFlush = Date.now();
      const flush = (force = false) => {
        if (!pending.length) return;
        if (!force && pending.length < 60 && Date.now() - lastFlush < 1000) return;
        const batch = pending.splice(0, pending.length);
        lastFlush = Date.now();
        setTracks((current) => mergeScannedTracks(current, batch));
        // Songs are playable (and queueable) as soon as they are scanned, not only when the scan ends.
        mergeIntoQueue(batch.map(queueTrackFromLibrary));
      };
      let processedNew = 0;
      for (let start = 0; start < newAssets.length; start += CONCURRENCY) {
        await waitWhilePaused();
        if (cancelRequestedRef.current) {
          flush(true);
          const keptTracks = mergeScannedTracks(restoredTracks, scanned);
          setTracks(keptTracks);
          replaceQueue(keptTracks.map(queueTrackFromLibrary));
          updateScan({ status: "cancelled", processed: cachedCount + processedNew, total: assets.length, message: `Scan cancelled — ${scanned.length} track${scanned.length === 1 ? "" : "s"} kept` });
          return;
        }
        const chunk = newAssets.slice(start, start + CONCURRENCY);
        await Promise.all(chunk.map(async ({ asset, index }) => {
          try {
            const track = await buildTrack(asset, index);
            scanned.push(track);
            pending.push(track);
          } catch {
            // Unreadable tags shouldn't hide the song: fall back to what the device already knows.
            const fallback: LibraryTrack = { ...mapNativeAudioAsset({ id: asset.id, filename: asset.filename, uri: asset.uri, duration: asset.duration, title: asset.title, artist: asset.artist, album: asset.album }, index), addedAt: Date.now() - index, artChecked: true };
            const track = applySavedOverride(fallback, overridesRef.current[fallback.id]);
            scanned.push(track);
            pending.push(track);
          }
        }));
        processedNew += chunk.length;
        flush();
        if (Date.now() - lastCheckpoint > 10000) checkpoint();
        reportProgress(cachedCount + processedNew, assets.length, `Scanning new music ${processedNew} of ${newAssets.length}`);
        await yieldToUi();
      }
      flush(true);

      let merged = mergeScannedTracks(restoredTracks, scanned);
      // Drop songs that were deleted from the device. Skipped if the device reported no music at all
      // (e.g. permission problems) so a bad read can never wipe the whole library.
      if (assets.length > 0) {
        const deviceIds = new Set(assets.map((asset) => asset.id));
        merged = merged.filter((track) => deviceIds.has(track.id));
      }
      setTracks(merged);
      replaceQueue(merged.map(queueTrackFromLibrary));
      // Save right away (not after the 4s delay) so closing the app can't lose this scan and force a full rescan.
      if (LIBRARY_FILE) await FileSystem.writeAsStringAsync(LIBRARY_FILE, JSON.stringify(prepareTracksForPersistence(merged))).catch(() => undefined);
      const newCount = Math.max(0, scanned.length - cachedCount);
      updateScan({ status: "complete", processed: assets.length, total: assets.length, lastScannedAt: Date.now(), message: scanned.length ? `${cachedCount} cached, ${newCount} new music track${newCount === 1 ? "" : "s"} ready` : "No music found on this device" });
    } catch {
      updateScan({ status: "error", processed: 0, total: 0, message: "The device library could not be read" });
    } finally {
      scanningRef.current = false;
      cancelRequestedRef.current = false;
      pauseRequestedRef.current = false;
      checkpointRef.current = null;
    }
  }, [mergeIntoQueue, replaceQueue, updateScan]);

  const pauseScan = useCallback(() => {
    if (!scanningRef.current || pauseRequestedRef.current) return;
    pauseRequestedRef.current = true;
    const { processed, total } = scanProgressRef.current;
    updateScan({ status: "paused", processed, total, message: pausedMessage(processed, total) });
    checkpointRef.current?.();
  }, [updateScan]);

  const resumeScan = useCallback(() => {
    if (scanningRef.current) {
      pauseRequestedRef.current = false;
      const { processed, total } = scanProgressRef.current;
      updateScan({ status: "scanning", processed, total, message: "Resuming scan" });
      return;
    }
    // A scan interrupted by quitting the app: songs already saved are skipped, only the rest are read.
    void refreshLibrary();
  }, [refreshLibrary, updateScan]);

  const cancelScan = useCallback(() => {
    if (scanningRef.current) {
      cancelRequestedRef.current = true;
      return;
    }
    updateScan({ status: "cancelled", processed: 0, total: 0, message: `Scan cancelled — ${tracksRef.current.length} tracks kept` });
  }, [updateScan]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Downloads and sync can fire many change events at once; wait for things to settle before rescanning.
    const subscription = MediaLibrary.addListener(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refreshLibrary(); }, 2500);
    });
    return () => { if (timer) clearTimeout(timer); subscription.remove(); };
  }, [refreshLibrary]);

  const setArtworkEnabled = useCallback((enabled: boolean) => {
    setArtworkEnabledState(enabled);
    artworkEnabledRef.current = enabled;
    void AsyncStorage.setItem("kora.library.show-artwork", String(enabled));
    if (enabled) {
      // Tracks were never checked for art while it was off, so re-read them once.
      const next = tracksRef.current.map((track) => ({ ...track, artChecked: false }));
      tracksRef.current = next;
      setTracks(next);
      void refreshLibrary();
      return;
    }
    const next = tracksRef.current.map((track) => ({ ...track, artworkUri: undefined, artChecked: false }));
    tracksRef.current = next;
    setTracks(next);
    replaceQueue(next.map(queueTrackFromLibrary));
  }, [refreshLibrary, replaceQueue]);

  const setLyricsEnabled = useCallback((enabled: boolean) => {
    setLyricsEnabledState(enabled);
    void AsyncStorage.setItem("kora.library.match-lyrics", String(enabled));
    if (!enabled) setTracks((current) => current.map((track) => ({ ...track, lyricsText: undefined, lyricLines: [] })));
  }, []);

  const updateTrackMetadata = useCallback((trackId: string, patch: MetadataPatch) => {
    const nextPatch = {
      ...(overridesRef.current[trackId] ?? {}),
      ...patch,
    };
    overridesRef.current = { ...overridesRef.current, [trackId]: nextPatch };
    setOverrides(overridesRef.current);
    setTracks((current) => current.map((track) => track.id === trackId ? applyMetadataPatch(track, patch) : track));
    updateQueueTrack(trackId, {
      ...(patch.title !== undefined ? { title: patch.title.trim() || undefined } : {}),
      ...(patch.artist !== undefined ? { artist: patch.artist.trim() || undefined } : {}),
      ...(patch.album !== undefined ? { album: patch.album.trim() || undefined } : {}),
    });
  }, [updateQueueTrack]);

  const deleteTrack = useCallback(async (trackId: string) => {
    if (Platform.OS === "web") return false;
    try {
      const deleted = await MediaLibrary.deleteAssetsAsync([trackId]);
      if (!deleted) return false;
    } catch {
      return false;
    }
    const next = tracksRef.current.filter((track) => track.id !== trackId);
    tracksRef.current = next;
    setTracks(next);
    replaceQueue(next.map(queueTrackFromLibrary));
    return true;
  }, [replaceQueue]);

  const sortTracks = useCallback((sort: LibrarySort) => sortLibraryTracks(tracks, sort), [tracks]);
  const value = useMemo(() => ({ tracks, scanState, refreshLibrary, pauseScan, resumeScan, cancelScan, artworkEnabled, lyricsEnabled, setArtworkEnabled, setLyricsEnabled, sortTracks, updateTrackMetadata, deleteTrack }), [artworkEnabled, cancelScan, lyricsEnabled, pauseScan, refreshLibrary, resumeScan, scanState, setArtworkEnabled, setLyricsEnabled, sortTracks, tracks, updateTrackMetadata, deleteTrack]);
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibraryController() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibraryController must be used inside LibraryProvider");
  return context;
}
