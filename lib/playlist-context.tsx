import { useLibraryController } from "@/lib/library-context";
import { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";

export type Playlist = {
  id: string;
  title: string;
  subtitle: string;
  count: string;
  tone: string;
  trackIds: string[];
};

const INITIAL_PLAYLISTS: Playlist[] = [];

export function migrateSavedPlaylists(playlists: Playlist[]) {
  return playlists.filter((playlist) => playlist.id !== "liked");
}

export function buildPlaylist(title: string, id = `${Date.now()}`): Playlist {
  const normalizedTitle = title.trim() || "New mood";
  return { id, title: normalizedTitle, subtitle: "A mood made by you", count: "0 tracks", tone: "#35432c", trackIds: [] };
}

type PlaylistContextValue = {
  playlists: Playlist[];
  createPlaylist: (title: string) => Playlist;
  renamePlaylist: (id: string, title: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
};

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function addTrackToPlaylistState(playlists: Playlist[], playlistId: string, trackId: string) {
  return playlists.map((playlist) => {
    if (playlist.id !== playlistId || playlist.trackIds.includes(trackId)) return playlist;
    const trackIds = [...playlist.trackIds, trackId];
    return { ...playlist, trackIds, count: `${trackIds.length} tracks` };
  });
}

export function renamePlaylistState(playlists: Playlist[], playlistId: string, title: string) {
  return playlists.map((playlist) => playlist.id === playlistId ? { ...playlist, title: title.trim() || playlist.title } : playlist);
}

export function removeTrackFromPlaylistState(playlists: Playlist[], playlistId: string, trackId: string) {
  return playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    const trackIds = playlist.trackIds.filter((id) => id !== trackId);
    return { ...playlist, trackIds, count: `${trackIds.length} tracks` };
  });
}

export function deletePlaylistState(playlists: Playlist[], playlistId: string) {
  return playlists.filter((playlist) => playlist.id !== playlistId);
}

/** Removes ids of songs that no longer exist from every playlist. Returns the same array when nothing changed. */
export function pruneMissingTracksState(playlists: Playlist[], validIds: Set<string>) {
  let changed = false;
  const next = playlists.map((playlist) => {
    const trackIds = playlist.trackIds.filter((id) => validIds.has(id));
    if (trackIds.length === playlist.trackIds.length) return playlist;
    changed = true;
    return { ...playlist, trackIds, count: `${trackIds.length} tracks` };
  });
  return changed ? next : playlists;
}

export function PlaylistProvider({ children }: PropsWithChildren) {
  const [playlists, setPlaylists] = useState(INITIAL_PLAYLISTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("kora.playlists").then((saved) => {
      if (saved) {
        try { setPlaylists(migrateSavedPlaylists(JSON.parse(saved) as Playlist[])); } catch { /* use defaults */ }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) void AsyncStorage.setItem("kora.playlists", JSON.stringify(playlists));
  }, [loaded, playlists]);

  // After a finished scan (or a delete) the library is the source of truth: forget songs that are gone.
  const { tracks, scanState } = useLibraryController();
  useEffect(() => {
    if (!loaded || scanState.status !== "complete" || tracks.length === 0) return;
    const validIds = new Set(tracks.map((track) => track.id));
    setPlaylists((current) => pruneMissingTracksState(current, validIds));
  }, [loaded, scanState.status, tracks]);

  const createPlaylist = (title: string) => {
    const playlist = buildPlaylist(title, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setPlaylists((current) => [...current, playlist]);
    return playlist;
  };

  const renamePlaylist = (id: string, title: string) => {
    setPlaylists((current) => renamePlaylistState(current, id, title));
  };

  const deletePlaylist = (id: string) => {
    setPlaylists((current) => deletePlaylistState(current, id));
  };

  const addTrackToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((current) => addTrackToPlaylistState(current, playlistId, trackId));
  };

  const removeTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((current) => removeTrackFromPlaylistState(current, playlistId, trackId));
  };

  const value = useMemo(() => ({ playlists, createPlaylist, renamePlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist }), [playlists]);
  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>;
}

export function usePlaylistController() {
  const context = useContext(PlaylistContext);
  if (!context) throw new Error("usePlaylistController must be used inside PlaylistProvider");
  return context;
}
