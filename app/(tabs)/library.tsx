import AsyncStorage from "@react-native-async-storage/async-storage";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Image } from "expo-image";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";

import { filterMusicTracks } from "@/lib/music-utils";

import { useAudioPlayerController, useAudioProgress } from "@/lib/audio-player-context";

import { queueTrackFromLibrary, useLibraryController, type LibrarySort, type LibraryTrack } from "@/lib/library-context";

import { usePlaylistController } from "@/lib/playlist-context";

import { getActiveLyricIndex } from "@/lib/lyrics-utils";

const lime = "#c8f34a";

const muted = "#9299a3";

const FAVORITES_KEY = "kora.library.favorites";

const VIEW_PREFS_KEY = "kora.library.view-prefs";

const SORT_VALUES: LibrarySort[] = ["recent", "title", "artist", "album", "duration"];

const FILTER_VALUES = ["All tracks", "Favorites", "With lyrics"];

type Draft = {
  title: string;
  artist: string;
  album: string;
  lyricsText: string;
};

export default function LibraryScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All tracks");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [showSort, setShowSort] = useState(false);
  const [lyricsTrack, setLyricsTrack] = useState<LibraryTrack | null>(null);
  const [moodTrack, setMoodTrack] = useState<LibraryTrack | null>(null);
  const [menuTrack, setMenuTrack] = useState<LibraryTrack | null>(null);
  const [editTrack, setEditTrack] = useState<LibraryTrack | null>(null);
  const [draft, setDraft] = useState<Draft>({
    title: "",
    artist: "",
    album: "",
    lyricsText: "",
  });
  const [moodName, setMoodName] = useState("");
  const [creatingMood, setCreatingMood] = useState(false);
  const [toast, setToast] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);

  const lyricsScrollRef = useRef<ScrollView>(null);

  const { playList, currentTrack } = useAudioPlayerController();
  const { position } = useAudioProgress();

  const {
    tracks,
    scanState,
    refreshLibrary,
    pauseScan,
    resumeScan,
    cancelScan,
    sortTracks,
    updateTrackMetadata,
    deleteTrack,
  } = useLibraryController();

  const { playlists, addTrackToPlaylist, createPlaylist } = usePlaylistController();

  const router = useRouter();

  const deferredQuery = useDeferredValue(query);

  const sortedTracks = useMemo(() => sortTracks(sort), [sort, sortTracks]);

  const filteredTracks = useMemo(
    () =>
      filterMusicTracks(
        sortedTracks,
        deferredQuery,
        filter,
        favorites,
        (track) => track.id,
      ),
    [favorites, filter, deferredQuery, sortedTracks],
  );

  const sortLabel =
    sort === "recent"
      ? "Recently added"
      : sort === "title"
        ? "Song A–Z"
        : sort === "artist"
          ? "Artist"
          : sort === "album"
            ? "Album"
            : "Duration";

  const activeLyricIndex = getActiveLyricIndex(
    lyricsTrack?.lyricLines,
    lyricsTrack?.id === currentTrack?.id ? position : 0,
  );

  const isScanning = scanState.status === "scanning";
  const isPaused = scanState.status === "paused";

  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(VIEW_PREFS_KEY)
      .then((value) => {
        if (!value) return;

        try {
          const saved = JSON.parse(value) as {
            sort?: string;
            filter?: string;
          };

          if (saved.sort && SORT_VALUES.includes(saved.sort as LibrarySort)) {
            setSort(saved.sort as LibrarySort);
          }

          if (saved.filter && FILTER_VALUES.includes(saved.filter)) {
            setFilter(saved.filter);
          }
        } catch {
        }
      })
      .catch(() => undefined)
      .finally(() => setViewPrefsLoaded(true));
  }, []);

  useEffect(() => {
    if (viewPrefsLoaded) {
      void AsyncStorage.setItem(
        VIEW_PREFS_KEY,
        JSON.stringify({ sort, filter }),
      ).catch(() => undefined);
    }
  }, [sort, filter, viewPrefsLoaded]);

  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // Forget favorites whose song was deleted (only once a scan has finished, so a partial library never removes any).
  useEffect(() => {
    if (!favoritesLoaded || scanState.status !== "complete" || tracks.length === 0) return;
    const validIds = new Set(tracks.map((track) => track.id));
    setFavorites((current) => (current.every((id) => validIds.has(id)) ? current : current.filter((id) => validIds.has(id))));
  }, [favoritesLoaded, scanState.status, tracks]);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY)
      .then((value) => {
        if (!value) return;

        try {
          setFavorites(JSON.parse(value) as string[]);
        } catch {
        }
      })
      .catch(() => undefined)
      .finally(() => setFavoritesLoaded(true));
  }, []);

  useEffect(() => {
    if (favoritesLoaded) {
      void AsyncStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(favorites),
      ).catch(() => undefined);
    }
  }, [favorites, favoritesLoaded]);

  useEffect(() => {
    if (!lyricsTrack || activeLyricIndex < 0) return;

    lyricsScrollRef.current?.scrollTo({
      y: Math.max(0, activeLyricIndex * 38 - 56),
      animated: true,
    });
  }, [activeLyricIndex, lyricsTrack]);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(""), 2400);

    return () => clearTimeout(timer);
  }, [toast]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const playLibraryTrack = (track: LibraryTrack) => {
    if (!track.uri) return;

    playList(
      sortedTracks.filter((item) => item.uri).map(queueTrackFromLibrary),
      track.id,
    );
  };

  const beginEdit = (track: LibraryTrack) => {
    setEditTrack(track);

    setDraft({
      title: track.title,
      artist: track.artist,
      album: track.album,
      lyricsText: track.lyricsText || "",
    });
  };

  const saveEdit = () => {
    if (!editTrack) return;

    updateTrackMetadata(editTrack.id, draft);

    setEditTrack(null);
    setToast("Metadata updated on this device");
  };

  const closeMood = () => {
    setMoodTrack(null);
    setCreatingMood(false);
    setMoodName("");
  };

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const renderTrack = useCallback(
    ({ item }: { item: LibraryTrack }) => (
      <TrackRow
        track={item}
        isFavorite={favoriteSet.has(item.id)}
        onPlay={playLibraryTrack}
        onToggleFavorite={toggleFavorite}
        onLyrics={setLyricsTrack}
        onMenu={setMenuTrack}
      />
    ),
    [favoriteSet, sortedTracks, playList],
  );

  return (
    <ScreenContainer containerClassName="bg-[#0a0b0d]" className="px-5">
      <FlatList
        data={filteredTracks}
        keyExtractor={trackKeyExtractor}
        renderItem={renderTrack}
        extraData={favorites}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
                <Text style={styles.title}>Library</Text>
              </View>

              <View style={styles.counter}>
                <Text style={styles.counterValue}>{tracks.length}</Text>
                <Text style={styles.counterLabel}>tracks</Text>
              </View>
            </View>

            <View style={styles.scanLine}>
              <View style={styles.scanCopy}>
                <MaterialIcons
                  name={
                    isScanning
                      ? "sync"
                      : scanState.status === "complete"
                        ? "check-circle"
                        : scanState.status === "cancelled" || isPaused
                          ? "pause-circle-outline"
                          : "library-music"
                  }
                  size={16}
                  color={lime}
                />

                <Text numberOfLines={1} style={styles.scanText}>
                  {scanState.message || "Music stays local to this device"}
                </Text>
              </View>

              <View style={styles.scanActions}>
                <Pressable
                  onPress={() => {
                    if (isScanning) pauseScan();
                    else if (isPaused) resumeScan();
                    else void refreshLibrary();
                  }}
                  style={({ pressed }) => [
                    styles.refreshButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialIcons
                    name={
                      isScanning
                        ? "pause"
                        : isPaused
                          ? "play-arrow"
                          : "refresh"
                    }
                    size={16}
                    color="#0a0b0d"
                  />

                  <Text style={styles.refreshText}>
                    {isScanning
                      ? "Pause"
                      : isPaused
                        ? "Resume"
                        : "Refresh"}
                  </Text>
                </Pressable>

                {isScanning || isPaused ? (
                  <Pressable
                    onPress={cancelScan}
                    style={({ pressed }) => [
                      styles.refreshButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <MaterialIcons
                      name="close"
                      size={16}
                      color="#0a0b0d"
                    />

                    <Text style={styles.refreshText}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.browseRow}>
              <Pressable
                onPress={() => router.push("/browse/artists")}
                style={({ pressed }) => [
                  styles.browseButton,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="person"
                  size={16}
                  color={lime}
                />

                <Text style={styles.browseButtonText}>Artists</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/browse/albums")}
                style={({ pressed }) => [
                  styles.browseButton,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="album"
                  size={16}
                  color={lime}
                />

                <Text style={styles.browseButtonText}>Albums</Text>
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <MaterialIcons
                name="search"
                size={20}
                color="#7d858f"
              />

              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Songs, artists, albums"
                placeholderTextColor="#7d858f"
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {["All tracks", "Favorites", "With lyrics"].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.filterChip,
                    filter === item && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      filter === item && styles.filterTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>{filter}</Text>

              <Pressable
                onPress={() => setShowSort(true)}
                style={styles.sortButton}
              >
                <Text style={styles.sortText}>{sortLabel}</Text>

                <MaterialIcons
                  name="keyboard-arrow-down"
                  size={14}
                  color={muted}
                />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons
              name={
                isScanning
                  ? "sync"
                  : tracks.length === 0
                    ? "music-off"
                    : "search-off"
              }
              size={30}
              color={lime}
            />

            <Text style={styles.emptyTitle}>
              {isScanning
                ? "Scanning your device"
                : tracks.length === 0
                  ? "No music found on this device"
                  : "Nothing matches that search"}
            </Text>

            <Text style={styles.emptyCopy}>
              {isScanning
                ? "Reading audio metadata, artwork, and lyrics locally."
                : tracks.length === 0
                  ? "Add music to your device, then refresh the library."
                  : "Try another song, artist, or filter."}
            </Text>
          </View>
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />

      <Modal
        visible={scanState.status === "denied"}
        transparent
        animationType="fade"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.permissionSheet}>
            <View style={styles.permissionIcon}>
              <MaterialIcons
                name="music-note"
                size={25}
                color="#0a0b0d"
              />
            </View>

            <Text style={styles.sheetKicker}>WELCOME TO KORA</Text>

            <Text style={styles.permissionTitle}>
              Give Kora access to your music
            </Text>

            <Text style={styles.permissionCopy}>
              Kora uses your device music permission to read song metadata,
              artwork, and lyrics locally. Your music stays on this device.
            </Text>

            <Pressable
              onPress={() => {
                void refreshLibrary();
              }}
              style={styles.permissionButton}
            >
              <Text style={styles.permissionButtonText}>
                Allow music access
              </Text>

              <MaterialIcons
                name="arrow-forward"
                size={18}
                color="#0a0b0d"
              />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!menuTrack}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuTrack(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sortSheet}>
            <Text style={styles.sheetKicker}>SONG OPTIONS</Text>

            <Text
              numberOfLines={1}
              style={styles.sheetTitle}
            >
              {menuTrack?.title}
            </Text>

            <Pressable
              onPress={() => {
                const track = menuTrack;
                setMenuTrack(null);

                if (track) {
                  setTimeout(() => setMoodTrack(track), 250);
                }
              }}
              style={styles.sortChoice}
            >
              <Text style={styles.choiceText}>Add to playlist</Text>

              <MaterialIcons
                name="playlist-add"
                size={20}
                color={lime}
              />
            </Pressable>

            <Pressable
              onPress={() => {
                const track = menuTrack;
                setMenuTrack(null);

                if (track) {
                  setTimeout(() => beginEdit(track), 250);
                }
              }}
              style={styles.sortChoice}
            >
              <Text style={styles.choiceText}>Edit metadata</Text>

              <MaterialIcons
                name="edit"
                size={18}
                color={lime}
              />
            </Pressable>

            <Pressable
              onPress={() => {
                const track = menuTrack;
                setMenuTrack(null);
                if (!track) return;
                setTimeout(() => {
                  Alert.alert(
                    "Delete song?",
                    `"${track.title}" will be deleted from this device. This can't be undone.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          void deleteTrack(track.id).then((deleted) => setToast(deleted ? "Song deleted" : "Couldn't delete this song"));
                        },
                      },
                    ],
                  );
                }, 250);
              }}
              style={styles.sortChoice}
            >
              <Text style={[styles.choiceText, { color: "#ff6b6b" }]}>Delete song</Text>

              <MaterialIcons
                name="delete-outline"
                size={20}
                color="#ff6b6b"
              />
            </Pressable>

            <Pressable
              onPress={() => setMenuTrack(null)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSort}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSort(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sortSheet}>
            <Text style={styles.sheetKicker}>SORT LIBRARY</Text>

            <Text style={styles.sheetTitle}>Choose an order</Text>

            {(
              [
                ["recent", "Recently added"],
                ["title", "Song A–Z"],
                ["artist", "Artist"],
                ["album", "Album"],
                ["duration", "Duration"],
              ] as [LibrarySort, string][]
            ).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => {
                  setSort(value);
                  setShowSort(false);
                }}
                style={styles.sortChoice}
              >
                <Text style={styles.choiceText}>{label}</Text>

                {sort === value && (
                  <MaterialIcons
                    name="check"
                    size={18}
                    color={lime}
                  />
                )}
              </Pressable>
            ))}

            <Pressable
              onPress={() => setShowSort(false)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!lyricsTrack}
        transparent
        animationType="slide"
        onRequestClose={() => setLyricsTrack(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.lyricsSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>LYRICS</Text>

                <Text
                  numberOfLines={1}
                  style={styles.sheetTitle}
                >
                  {lyricsTrack?.title}
                </Text>

                <Text style={styles.sheetArtist}>
                  {lyricsTrack?.artist}
                </Text>
              </View>

              <Pressable
                onPress={() => setLyricsTrack(null)}
                style={styles.close}
              >
                <MaterialIcons
                  name="close"
                  size={21}
                  color="#f4f5f0"
                />
              </Pressable>
            </View>

            <ScrollView
              ref={lyricsScrollRef}
              style={styles.lyricsBox}
            >
              {lyricsTrack?.lyricLines?.length ? (
                lyricsTrack.lyricLines.map((line, index) => (
                  <Text
                    key={`${line.time}-${index}`}
                    style={[
                      styles.lyricLine,
                      index !== activeLyricIndex &&
                        styles.lyricLineMuted,
                      index === activeLyricIndex &&
                        styles.lyricLineActive,
                    ]}
                  >
                    {line.text}
                  </Text>
                ))
              ) : (
                <Text style={styles.noLyricsCopy}>
                  {lyricsTrack?.lyricsText ||
                    "Lyrics are not available for this song."}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!moodTrack}
        transparent
        animationType="slide"
        onRequestClose={closeMood}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.moodSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>SAVE SONG</Text>

                <Text style={styles.sheetTitle}>
                  Choose a playlist
                </Text>

                <Text style={styles.sheetArtist}>
                  {moodTrack?.title}
                </Text>
              </View>

              <Pressable
                onPress={closeMood}
                style={styles.close}
              >
                <MaterialIcons
                  name="close"
                  size={21}
                  color="#f4f5f0"
                />
              </Pressable>
            </View>

            <Text style={styles.moodCopy}>
              Choose where this Library song should be saved.
            </Text>

            {!creatingMood ? (
              <>
                <View style={styles.playlistChoices}>
                  {playlists.map((playlist) => (
                    <Pressable
                      key={playlist.id}
                      onPress={() => {
                        if (moodTrack) {
                          addTrackToPlaylist(
                            playlist.id,
                            moodTrack.id,
                          );
                        }

                        setToast(`Saved to ${playlist.title}`);
                        closeMood();
                      }}
                      style={styles.playlistChoice}
                    >
                      <View
                        style={[
                          styles.choiceIcon,
                          { backgroundColor: playlist.tone },
                        ]}
                      >
                        <MaterialIcons
                          name={
                            playlist.id === "liked"
                              ? "favorite"
                              : "music-note"
                          }
                          size={15}
                          color={
                            playlist.id === "liked"
                              ? "#ff887d"
                              : lime
                          }
                        />
                      </View>

                      <Text style={styles.choiceText}>
                        {playlist.title}
                      </Text>

                      <MaterialIcons
                        name="chevron-right"
                        size={19}
                        color="#747d86"
                      />
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  onPress={() => setCreatingMood(true)}
                  style={styles.newMoodButton}
                >
                  <MaterialIcons
                    name="add"
                    size={17}
                    color={lime}
                  />

                  <Text style={styles.newMoodText}>
                    Create a new mood playlist
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  autoFocus
                  value={moodName}
                  onChangeText={setMoodName}
                  placeholder="e.g. Late night drive"
                  placeholderTextColor="#747d86"
                  style={styles.moodInput}
                  returnKeyType="done"
                />

                <Pressable
                  onPress={() => {
                    const playlist = createPlaylist(
                      moodName.trim() || "New mood",
                    );

                    if (moodTrack) {
                      addTrackToPlaylist(
                        playlist.id,
                        moodTrack.id,
                      );
                    }

                    setToast(`Saved to ${playlist.title}`);
                    closeMood();
                  }}
                  style={styles.sheetButton}
                >
                  <MaterialIcons
                    name="add"
                    size={18}
                    color="#0a0b0d"
                  />

                  <Text style={styles.sheetButtonText}>
                    Create and save
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!editTrack}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTrack(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.editSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>LOCAL EDIT</Text>

                <Text style={styles.sheetTitle}>
                  Edit metadata
                </Text>

                <Text style={styles.sheetArtist}>
                  Saved in Kora without changing the source file.
                </Text>
              </View>

              <Pressable
                onPress={() => setEditTrack(null)}
                style={styles.close}
              >
                <MaterialIcons
                  name="close"
                  size={21}
                  color="#f4f5f0"
                />
              </Pressable>
            </View>

            <TextInput
              value={draft.title}
              onChangeText={(value) =>
                setDraft((current) => ({
                  ...current,
                  title: value,
                }))
              }
              placeholder="Title"
              placeholderTextColor="#747d86"
              style={styles.editInput}
            />

            <TextInput
              value={draft.artist}
              onChangeText={(value) =>
                setDraft((current) => ({
                  ...current,
                  artist: value,
                }))
              }
              placeholder="Artist"
              placeholderTextColor="#747d86"
              style={styles.editInput}
            />

            <TextInput
              value={draft.album}
              onChangeText={(value) =>
                setDraft((current) => ({
                  ...current,
                  album: value,
                }))
              }
              placeholder="Album"
              placeholderTextColor="#747d86"
              style={styles.editInput}
            />

            <TextInput
              value={draft.lyricsText}
              onChangeText={(value) =>
                setDraft((current) => ({
                  ...current,
                  lyricsText: value,
                }))
              }
              placeholder="Lyrics or LRC timestamps (optional)"
              placeholderTextColor="#747d86"
              style={[styles.editInput, styles.lyricsInput]}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              onPress={saveEdit}
              style={styles.sheetButton}
            >
              <MaterialIcons
                name="save"
                size={18}
                color="#0a0b0d"
              />

              <Text style={styles.sheetButtonText}>
                Save changes
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {toast && (
        <View style={styles.saveToast}>
          <MaterialIcons
            name="check-circle"
            size={17}
            color={lime}
          />

          <Text style={styles.saveToastText}>{toast}</Text>

          <Pressable onPress={() => setToast("")}>
            <MaterialIcons
              name="close"
              size={16}
              color="#93a578"
            />
          </Pressable>
        </View>
      )}
    </ScreenContainer>
  );
}

type TrackRowProps = {
  track: LibraryTrack;
  isFavorite: boolean;
  onPlay: (track: LibraryTrack) => void;
  onToggleFavorite: (id: string) => void;
  onLyrics: (track: LibraryTrack) => void;
  onMenu: (track: LibraryTrack) => void;
};

const trackKeyExtractor = (track: LibraryTrack) => track.id;

const TrackRow = memo(function TrackRow({
  track,
  isFavorite,
  onPlay,
  onToggleFavorite,
  onLyrics,
  onMenu,
}: TrackRowProps) {
  return (
    <Pressable
      onPress={() => onPlay(track)}
      style={({ pressed }) => [
        styles.trackRow,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.trackArt,
          { backgroundColor: track.tone },
        ]}
      >
        {track.artworkUri ? (
          <Image
            source={{ uri: track.artworkUri }}
            style={styles.trackImage}
            contentFit="cover"
            recyclingKey={track.id}
            cachePolicy="memory-disk"
            transition={0}
          />
        ) : (
          <MaterialIcons name="music-note" size={22} color="#f3f5ef" style={{ opacity: 0.8 }} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={styles.trackTitle}
        >
          {track.title}
        </Text>

        <Text
          numberOfLines={1}
          style={styles.trackMeta}
        >
          {track.artist} · {track.album}
        </Text>

        <View style={styles.tagRow}>
          {track.lyrics && (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onLyrics(track);
              }}
              style={styles.lyricsTag}
            >
              <MaterialIcons
                name="lyrics"
                size={11}
                color={lime}
              />

              <Text style={styles.lyricsTagText}>
                LYRICS
              </Text>
            </Pressable>
          )}

          <Text style={styles.duration}>
            {track.duration}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onToggleFavorite(track.id);
        }}
        hitSlop={10}
      >
        <MaterialIcons
          name={
            isFavorite
              ? "favorite"
              : "favorite-border"
          }
          size={20}
          color={isFavorite ? lime : "#707780"}
        />
      </Pressable>

      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onMenu(track);
        }}
        hitSlop={10}
      >
        <MaterialIcons
          name="more-vert"
          size={21}
          color="#707780"
        />
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: 10,
    paddingBottom: 24,
  },

  browseRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },

  browseButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#172019",
    borderWidth: 1,
    borderColor: "#35452e",
    borderRadius: 11,
    paddingVertical: 10,
  },

  browseButtonText: {
    color: "#e4eddc",
    fontSize: 11,
    fontWeight: "800",
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  eyebrow: {
    color: "#7d858f",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },

  title: {
    color: "#f2f4ef",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -1.2,
    marginTop: 6,
  },

  counter: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingBottom: 4,
  },

  counterValue: {
    color: lime,
    fontSize: 19,
    fontWeight: "900",
  },

  counterLabel: {
    color: muted,
    fontSize: 11,
  },

  scanActions: {
    flexDirection: "row",
    gap: 6,
  },

  scanLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 15,
  },

  scanCopy: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  scanText: {
    color: muted,
    fontSize: 10,
  },

  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: lime,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
  },

  refreshText: {
    color: "#0a0b0d",
    fontSize: 10,
    fontWeight: "900",
  },

  disabled: {
    opacity: 0.55,
  },

  searchBox: {
    height: 47,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    backgroundColor: "#13161a",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#24282d",
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    color: "#eef0eb",
    fontSize: 13,
  },

  filterRow: {
    gap: 8,
    paddingBottom: 20,
  },

  filterChip: {
    borderWidth: 1,
    borderColor: "#2a3036",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#111417",
  },

  filterChipActive: {
    backgroundColor: lime,
    borderColor: lime,
  },

  filterText: {
    color: muted,
    fontSize: 11,
    fontWeight: "700",
  },

  filterTextActive: {
    color: "#0a0b0d",
  },

  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },

  sectionTitle: {
    color: "#eef0eb",
    fontSize: 17,
    fontWeight: "800",
  },

  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 5,
  },

  sortText: {
    color: muted,
    fontSize: 10,
  },

  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#1b1e22",
  },

  trackArt: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  trackImage: {
    width: "100%",
    height: "100%",
  },

  initials: {
    color: "#f3f5ef",
    fontSize: 12,
    fontWeight: "900",
    opacity: 0.75,
  },

  trackTitle: {
    color: "#eef0eb",
    fontSize: 13,
    fontWeight: "800",
  },

  trackMeta: {
    color: muted,
    fontSize: 10,
    marginTop: 4,
  },

  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },

  lyricsTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#202e19",
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
  },

  lyricsTagText: {
    color: lime,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  duration: {
    color: "#737b84",
    fontSize: 10,
  },

  pressed: {
    opacity: 0.7,
  },

  empty: {
    alignItems: "center",
    paddingVertical: 45,
    gap: 8,
  },

  emptyTitle: {
    color: "#eef0eb",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  emptyCopy: {
    color: muted,
    fontSize: 12,
    textAlign: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },

  sortSheet: {
    backgroundColor: "#15181c",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 33,
    borderWidth: 1,
    borderColor: "#31363e",
  },

  sortChoice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#20252b",
    borderRadius: 11,
    padding: 13,
    marginTop: 8,
  },

  choiceText: {
    flex: 1,
    color: "#eef0eb",
    fontSize: 12,
    fontWeight: "800",
  },

  cancelButton: {
    alignItems: "center",
    backgroundColor: "#24292f",
    borderRadius: 11,
    paddingVertical: 12,
    marginTop: 13,
  },

  cancelText: {
    color: "#d5d9d3",
    fontSize: 12,
    fontWeight: "800",
  },

  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    backgroundColor: "#626972",
    borderRadius: 2,
    marginBottom: 20,
  },

  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  sheetKicker: {
    color: lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  sheetTitle: {
    color: "#f1f3ee",
    fontSize: 21,
    fontWeight: "800",
    marginTop: 7,
  },

  sheetArtist: {
    color: muted,
    fontSize: 12,
    marginTop: 4,
    maxWidth: 270,
  },

  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#23272d",
    alignItems: "center",
    justifyContent: "center",
  },

  lyricsSheet: {
    backgroundColor: "#15181c",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 33,
    borderWidth: 1,
    borderColor: "#31363e",
  },

  lyricsBox: {
    maxHeight: 280,
    backgroundColor: "#101215",
    borderRadius: 18,
    marginTop: 20,
    padding: 20,
  },

  lyricLine: {
    color: "#eff1ec",
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "700",
    marginBottom: 13,
  },

  lyricLineActive: {
    color: lime,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "900",
  },

  lyricLineMuted: {
    color: "#68717b",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },

  noLyricsCopy: {
    color: muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  moodSheet: {
    backgroundColor: "#15181c",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 33,
    borderWidth: 1,
    borderColor: "#31363e",
  },

  moodCopy: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
  },

  playlistChoices: {
    marginTop: 14,
    gap: 7,
  },

  playlistChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#20252b",
    borderRadius: 11,
    padding: 9,
  },

  choiceIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  newMoodButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#39422f",
    borderRadius: 11,
    paddingVertical: 11,
    marginTop: 12,
  },

  newMoodText: {
    color: lime,
    fontSize: 11,
    fontWeight: "800",
  },

  moodInput: {
    color: "#eef0eb",
    backgroundColor: "#20252b",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginTop: 17,
  },

  sheetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: lime,
    borderRadius: 11,
    paddingVertical: 13,
    marginTop: 16,
  },

  sheetButtonText: {
    color: "#0a0b0d",
    fontSize: 12,
    fontWeight: "900",
  },

  editSheet: {
    backgroundColor: "#15181c",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: "#31363e",
  },

  editInput: {
    color: "#eef0eb",
    backgroundColor: "#20252b",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginTop: 10,
    fontSize: 13,
  },

  lyricsInput: {
    minHeight: 110,
  },

  permissionSheet: {
    backgroundColor: "#15181c",
    borderRadius: 24,
    margin: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#31363e",
  },

  permissionIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: lime,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  permissionTitle: {
    color: "#f1f3ee",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    marginTop: 8,
  },

  permissionCopy: {
    color: muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: lime,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 20,
  },

  permissionButtonText: {
    color: "#0a0b0d",
    fontSize: 12,
    fontWeight: "900",
  },

  saveToast: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c2819",
    borderWidth: 1,
    borderColor: "#3c5532",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 13,
  },

  saveToastText: {
    flex: 1,
    color: "#dbe8cd",
    fontSize: 12,
    fontWeight: "700",
  },
});