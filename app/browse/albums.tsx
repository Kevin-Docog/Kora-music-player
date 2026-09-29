import { useDeferredValue, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAudioPlayerController } from "@/lib/audio-player-context";
import { groupByAlbum } from "@/lib/browse-utils";
import { queueTrackFromLibrary, useLibraryController, type LibraryTrack } from "@/lib/library-context";

const lime = "#c8f34a";
const muted = "#9299a3";

export default function AlbumsScreen() {
  const router = useRouter();
  const { tracks } = useLibraryController();
  const { playList } = useAudioPlayerController();
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const allGroups = useMemo(() => groupByAlbum(tracks), [tracks]);
  const groups = useMemo(() => { const needle = deferredQuery.trim().toLowerCase(); return needle ? allGroups.filter((group) => `${group.name} ${group.artist}`.toLowerCase().includes(needle)) : allGroups; }, [allGroups, deferredQuery]);
  const selected = groups.find((group) => `${group.name}\u0000${group.artist}` === selectedKey);
  // Plays in the order of the album/artist list you are looking at; the rest of the library follows.
  const playLibraryTrack = (track: LibraryTrack) => {
    if (!track.uri) return;
    const list = (selected?.tracks ?? [track]).filter((item) => item.uri);
    playList(list.map(queueTrackFromLibrary), track.id);
  };

  const listHeader = <>
    <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={10}><MaterialIcons name="arrow-back" size={24} color="#f2f4ef" /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>BROWSE BY</Text><Text style={styles.title}>Albums</Text></View><View style={styles.count}><Text style={styles.countValue}>{groups.length}</Text><Text style={styles.countLabel}>albums</Text></View></View>
    <View style={styles.search}><MaterialIcons name="search" size={19} color="#7d858f" /><TextInput value={query} onChangeText={setQuery} placeholder="Search albums or artists" placeholderTextColor="#7d858f" style={styles.searchInput} /></View>
  </>;

  if (selected) {
    return <ScreenContainer containerClassName="bg-[#0a0b0d]" className="px-5"><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    {listHeader}
    <><Pressable onPress={() => setSelectedKey(null)} style={styles.backBrowse}><MaterialIcons name="chevron-left" size={17} color={lime} /><Text style={styles.backBrowseText}>All albums</Text></Pressable><View style={styles.detailHeader}><View style={[styles.heroArt, { backgroundColor: selected.tone }]}>{selected.artworkUri ? <Image source={{ uri: selected.artworkUri }} style={styles.heroImage} /> : <Text style={styles.heroInitials}>{selected.initials}</Text>}</View><View style={{ flex: 1 }}><Text style={styles.detailEyebrow}>ALBUM</Text><Text numberOfLines={2} style={styles.detailTitle}>{selected.name}</Text><Text style={styles.detailMeta}>{selected.artist} · {selected.tracks.length} track{selected.tracks.length === 1 ? "" : "s"}</Text></View></View><Pressable onPress={() => playLibraryTrack(selected.tracks[0])} style={styles.playAll}><MaterialIcons name="play-arrow" size={18} color="#0a0b0d" /><Text style={styles.playAllText}>Play album</Text></Pressable>{selected.tracks.map((track) => <TrackRow key={track.id} track={track} onPress={() => playLibraryTrack(track)} />)}</>
  </ScrollView></ScreenContainer>;
  }

  // Thousands of artists/albums: only the visible cards are drawn.
  return <ScreenContainer containerClassName="bg-[#0a0b0d]" className="px-5"><FlatList
    data={groups}
    numColumns={2}
    columnWrapperStyle={styles.gridRow}
    keyExtractor={(group) => `${group.name}-${group.artist}`}
    renderItem={({ item: group }) => <Pressable onPress={() => setSelectedKey(`${group.name}\u0000${group.artist}`)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}><View style={[styles.cardArt, { backgroundColor: group.tone }]}>{group.artworkUri ? <Image source={{ uri: group.artworkUri }} style={styles.cardImage} /> : <Text style={styles.cardInitials}>{group.initials}</Text>}</View><Text numberOfLines={1} style={styles.cardTitle}>{group.name}</Text><Text numberOfLines={1} style={styles.cardMeta}>{group.artist} · {group.tracks.length} track{group.tracks.length === 1 ? "" : "s"}</Text></Pressable>}
    ListHeaderComponent={listHeader}
    ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="album" size={30} color={lime} /><Text style={styles.emptyTitle}>No albums found</Text><Text style={styles.emptyCopy}>Scan your device or try another search.</Text></View>}
    contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    initialNumToRender={10}
    maxToRenderPerBatch={8}
    windowSize={7}
    removeClippedSubviews
  /></ScreenContainer>;
}

function TrackRow({ track, onPress }: { track: LibraryTrack; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.trackRow, pressed && styles.pressed]}><View style={[styles.trackArt, { backgroundColor: track.tone }]}>{track.artworkUri ? <Image source={{ uri: track.artworkUri }} style={styles.trackImage} /> : <Text style={styles.trackInitials}>{track.initials}</Text>}</View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text><Text numberOfLines={1} style={styles.trackMeta}>{track.artist} · {track.duration}</Text></View><MaterialIcons name="play-arrow" size={20} color={lime} /></Pressable>; }

const styles = StyleSheet.create({ content: { paddingTop: 10, paddingBottom: 28 }, header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 20 }, headerCopy: { flex: 1 }, eyebrow: { color: "#7d858f", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 }, title: { color: "#f2f4ef", fontSize: 27, fontWeight: "800", letterSpacing: -1.2, marginTop: 5 }, count: { alignItems: "flex-end" }, countValue: { color: lime, fontSize: 19, fontWeight: "900" }, countLabel: { color: muted, fontSize: 10 }, search: { height: 47, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, backgroundColor: "#13161a", borderRadius: 13, borderWidth: 1, borderColor: "#24282d", marginBottom: 20 }, searchInput: { flex: 1, color: "#eef0eb", fontSize: 13 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 13 }, gridRow: { gap: 13 }, card: { width: "47%", marginBottom: 8 }, cardArt: { aspectRatio: 1, borderRadius: 17, alignItems: "center", justifyContent: "center", overflow: "hidden" }, cardImage: { width: "100%", height: "100%" }, cardInitials: { color: "#f3f5ef", fontSize: 24, fontWeight: "900", opacity: 0.78 }, cardTitle: { color: "#eef0eb", fontSize: 13, fontWeight: "800", marginTop: 9 }, cardMeta: { color: muted, fontSize: 10, marginTop: 4 }, backBrowse: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 17 }, backBrowseText: { color: lime, fontSize: 12, fontWeight: "800" }, detailHeader: { flexDirection: "row", alignItems: "center", gap: 14 }, heroArt: { width: 104, height: 104, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" }, heroImage: { width: "100%", height: "100%" }, heroInitials: { color: "#f3f5ef", fontSize: 26, fontWeight: "900" }, detailEyebrow: { color: lime, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 }, detailTitle: { color: "#f2f4ef", fontSize: 24, fontWeight: "800", marginTop: 5 }, detailMeta: { color: muted, fontSize: 12, marginTop: 6 }, playAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: lime, borderRadius: 11, paddingVertical: 12, marginTop: 18, marginBottom: 24 }, playAllText: { color: "#0a0b0d", fontSize: 12, fontWeight: "900" }, trackRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#1b1e22" }, trackArt: { width: 45, height: 45, borderRadius: 13, alignItems: "center", justifyContent: "center", overflow: "hidden" }, trackImage: { width: "100%", height: "100%" }, trackInitials: { color: "#f3f5ef", fontSize: 11, fontWeight: "900" }, trackTitle: { color: "#eef0eb", fontSize: 13, fontWeight: "800" }, trackMeta: { color: muted, fontSize: 10, marginTop: 4 }, empty: { alignItems: "center", paddingVertical: 65, gap: 8 }, emptyTitle: { color: "#eef0eb", fontSize: 16, fontWeight: "800" }, emptyCopy: { color: muted, fontSize: 12 }, pressed: { opacity: 0.7 } });
