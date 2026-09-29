import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useAudioPlayerController } from "@/lib/audio-player-context";
import { usePlaylistController } from "@/lib/playlist-context";

const lime = "#c8f34a";
const muted = "#9299a3";

export default function PlaylistsScreen() {
  const [showCreate, setShowCreate] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<ReturnType<typeof usePlaylistController>["playlists"][number] | null>(null);
  const [notice, setNotice] = useState("");
  const { queue, playTrack } = useAudioPlayerController();
  const { playlists, createPlaylist: createPlaylistInContext, renamePlaylist: renamePlaylistInContext, deletePlaylist, removeTrackFromPlaylist } = usePlaylistController();

  const createPlaylist = () => {
    const typedName = newName;
    const playlist = createPlaylistInContext(typedName);
    setNewName("");
    setShowCreate(false);
    setNotice(`${playlist.title} created`);
  };

  const renamePlaylist = () => {
    if (!selectedPlaylist) return;
    const title = renameName.trim() || selectedPlaylist.title;
    renamePlaylistInContext(selectedPlaylist.id, title);
    setSelectedPlaylist((current) => current ? { ...current, title } : current);
    setRenameName("");
    setShowRename(false);
    setNotice(`Renamed to ${title}`);
  };

  const removePlaylist = () => {
    if (!selectedPlaylist) return;
    deletePlaylist(selectedPlaylist.id);
    setShowDelete(false);
    setSelectedPlaylist(null);
    setNotice("Playlist deleted");
  };

  const playPlaylist = () => {
    const firstId = selectedPlaylist?.trackIds[0];
    const track = queue.find((item) => item.id === firstId) ?? queue[0];
    if (track) playTrack(track);
  };

  const removeSong = (trackId: string) => {
    if (!selectedPlaylist) return;
    removeTrackFromPlaylist(selectedPlaylist.id, trackId);
    setSelectedPlaylist((current) => current ? { ...current, trackIds: current.trackIds.filter((id) => id !== trackId), count: `${current.trackIds.filter((id) => id !== trackId).length} tracks` } : current);
    setNotice("Song removed from playlist");
  };

  return (
    <ScreenContainer containerClassName="bg-[#0a0b0d]" className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Text style={styles.eyebrow}>SMART MIXES + PLAYLISTS</Text><Text style={styles.title}>Playlists</Text></View></View>
        <Text style={styles.intro}>A little organization for every version of you.</Text>

        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your playlists</Text><Text style={styles.sectionCaption}>Tap a playlist to view its songs.</Text></View><Pressable onPress={() => setShowCreate(true)} hitSlop={8}><Text style={styles.link}>New playlist</Text></Pressable></View>
        {playlists.map((playlist) => <Pressable key={playlist.id} onPress={() => setSelectedPlaylist(playlist)} style={({ pressed }) => [styles.largeCard, pressed && styles.pressed]}><View style={[styles.largeArtwork, { backgroundColor: playlist.tone }]}>{playlist.id === "liked" ? <MaterialIcons name="favorite" size={27} color="#ff887d" /> : <MaterialIcons name="music-note" size={27} color={lime} />}<Text style={styles.artworkLabel}>{playlist.id === "liked" ? "LIKED" : "MOOD"}</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.largeTitle}>{playlist.title}</Text><Text numberOfLines={1} style={styles.largeCopy}>{playlist.subtitle}</Text><View style={styles.largeMeta}><Text style={styles.metaText}>{playlist.count}</Text><Text style={styles.metaDot}>·</Text><Text style={styles.metaText}>Local playlist</Text></View></View><MaterialIcons name="chevron-right" size={25} color="#858e98" /></Pressable>)}
        {notice && <Pressable onPress={() => setNotice("")} style={styles.toast}><MaterialIcons name="check-circle" size={17} color={lime} /><Text style={styles.toastText}>{notice}</Text><MaterialIcons name="close" size={15} color="#93a578" /></Pressable>}
      </ScrollView>

      <Modal visible={!!selectedPlaylist} transparent animationType="slide" onRequestClose={() => setSelectedPlaylist(null)}><View style={styles.modalBackdrop}><View style={styles.detailSheet}><View style={styles.sheetHandle} /><View style={styles.detailHeader}><View style={[styles.detailArtwork, { backgroundColor: selectedPlaylist?.tone ?? "#35432c" }]}><MaterialIcons name={selectedPlaylist?.id === "liked" ? "favorite" : "music-note"} size={25} color={selectedPlaylist?.id === "liked" ? "#ff887d" : lime} /></View><View style={{ flex: 1 }}><Text style={styles.sheetKicker}>PLAYLIST</Text><Text numberOfLines={1} style={styles.sheetTitle}>{selectedPlaylist?.title}</Text><Text style={styles.sheetArtist}>{selectedPlaylist?.count} · Local playlist</Text></View><Pressable onPress={() => setSelectedPlaylist(null)} style={styles.close}><MaterialIcons name="close" size={20} color="#f4f5f0" /></Pressable></View><Text style={styles.locationHint}>Songs saved here stay in this playlist.</Text><View style={styles.detailActions}><Pressable onPress={playPlaylist} style={styles.primaryAction}><MaterialIcons name="play-arrow" size={18} color="#0a0b0d" /><Text style={styles.primaryActionText}>Play playlist</Text></Pressable><Pressable onPress={() => { setRenameName(selectedPlaylist?.title ?? ""); setShowRename(true); }} style={styles.secondaryAction}><MaterialIcons name="edit" size={17} color="#e9eee5" /><Text style={styles.secondaryActionText}>Rename</Text></Pressable><Pressable disabled={selectedPlaylist?.id === "liked"} onPress={() => setShowDelete(true)} style={[styles.secondaryAction, selectedPlaylist?.id === "liked" && styles.disabledAction]}><MaterialIcons name="delete-outline" size={18} color={selectedPlaylist?.id === "liked" ? "#626a72" : "#ff9188"} /></Pressable></View><Text style={styles.songsHeading}>Songs</Text>{selectedPlaylist?.trackIds.length ? selectedPlaylist.trackIds.map((id) => { const track = queue.find((item) => item.id === id); return track ? <View key={id} style={styles.songRow}><Pressable onPress={() => playTrack(track)} style={styles.songMain}><View style={[styles.songArt, { backgroundColor: track.tone }]}><Text style={styles.songInitials}>{track.initials}</Text></View><View style={{ flex: 1 }}><Text style={styles.songTitle}>{track.title}</Text><Text style={styles.songArtist}>{track.artist}</Text></View><MaterialIcons name="play-arrow" size={19} color={lime} /></Pressable><Pressable onPress={() => removeSong(id)} hitSlop={10} style={styles.removeSong}><MaterialIcons name="remove-circle-outline" size={19} color="#ff9188" /></Pressable></View> : null; }) : <View style={styles.emptySongs}><MaterialIcons name="music-note" size={24} color={lime} /><Text style={styles.emptySongsText}>No songs yet. Use a song menu in Library to save one to this playlist.</Text></View>}</View></View></Modal>

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}><View style={styles.modalBackdrop}><View style={styles.createCard}><Text style={styles.modalKicker}>NEW MOOD</Text><Text style={styles.modalTitle}>Create a playlist</Text><Text style={styles.modalCopy}>Choose a name, then save songs into it from the Library menu.</Text><TextInput autoFocus value={newName} onChangeText={setNewName} placeholder="e.g. Slow mornings" placeholderTextColor="#747d86" style={styles.input} returnKeyType="done" onSubmitEditing={createPlaylist} /><View style={styles.modalActions}><Pressable onPress={() => { setNewName(""); setShowCreate(false); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={createPlaylist} style={styles.createButton}><Text style={styles.createText}>Create</Text></Pressable></View></View></View></Modal>

      <Modal visible={showRename} transparent animationType="fade" onRequestClose={() => setShowRename(false)}><View style={styles.modalBackdrop}><View style={styles.createCard}><Text style={styles.modalKicker}>EDIT PLAYLIST</Text><Text style={styles.modalTitle}>Rename playlist</Text><TextInput autoFocus value={renameName} onChangeText={setRenameName} placeholder="Playlist name" placeholderTextColor="#747d86" style={styles.input} returnKeyType="done" onSubmitEditing={renamePlaylist} /><View style={styles.modalActions}><Pressable onPress={() => setShowRename(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={renamePlaylist} style={styles.createButton}><Text style={styles.createText}>Save</Text></Pressable></View></View></View></Modal>

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}><View style={styles.modalBackdrop}><View style={styles.createCard}><Text style={styles.modalKicker}>REMOVE PLAYLIST</Text><Text style={styles.modalTitle}>Delete {selectedPlaylist?.title}?</Text><Text style={styles.modalCopy}>The playlist will be removed from Kora, but your music files will stay safe.</Text><View style={styles.modalActions}><Pressable onPress={() => setShowDelete(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={removePlaylist} style={styles.deleteButton}><Text style={styles.deleteText}>Delete</Text></Pressable></View></View></View></Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 26 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  eyebrow: { color: "#7d858f", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: "#f2f4ef", fontSize: 31, fontWeight: "800", letterSpacing: -1.2, marginTop: 6 },
  intro: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 29 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 13 },
  sectionTitle: { color: "#eef0eb", fontSize: 17, fontWeight: "800" },
  sectionCaption: { color: muted, fontSize: 12, marginTop: 4 },
  link: { color: lime, fontSize: 12, fontWeight: "800" },
  largeCard: { flexDirection: "row", alignItems: "center", gap: 13, padding: 11, backgroundColor: "#13161a", borderWidth: 1, borderColor: "#24282d", borderRadius: 17, marginBottom: 11 },
  largeArtwork: { width: 74, height: 74, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  artworkLabel: { color: "rgba(243,245,222,0.72)", fontSize: 8, fontWeight: "900", letterSpacing: 1.4, marginTop: 6 },
  largeTitle: { color: "#eef0eb", fontSize: 14, fontWeight: "800" },
  largeCopy: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  largeMeta: { flexDirection: "row", gap: 6, marginTop: 7 },
  metaText: { color: "#707983", fontSize: 9 },
  metaDot: { color: "#707983", fontSize: 9 },
  toast: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#1f2c1a", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, marginTop: 18 },
  toastText: { flex: 1, color: "#eaf5ce", fontSize: 11, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 22 },
  createCard: { backgroundColor: "#171a1e", borderRadius: 22, padding: 21, borderWidth: 1, borderColor: "#343a42" },
  modalKicker: { color: lime, fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  modalTitle: { color: "#f4f5f0", fontSize: 23, fontWeight: "800", marginTop: 6 },
  modalCopy: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  input: { color: "#f0f2ed", backgroundColor: "#101215", borderRadius: 12, borderWidth: 1, borderColor: "#343a42", paddingHorizontal: 13, paddingVertical: 12, marginTop: 18, fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 9, marginTop: 17 },
  cancelButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 11, backgroundColor: "#24292f" },
  cancelText: { color: "#d5d9d3", fontSize: 12, fontWeight: "800" },
  createButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 11, backgroundColor: lime },
  createText: { color: "#0a0b0d", fontSize: 12, fontWeight: "900" },
  deleteButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 11, backgroundColor: "#8f302a" },
  deleteText: { color: "#fff3ef", fontSize: 12, fontWeight: "900" },
  detailSheet: { backgroundColor: "#171a1e", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 30, borderWidth: 1, borderColor: "#333941", maxHeight: "82%" },
  sheetHandle: { alignSelf: "center", width: 38, height: 4, backgroundColor: "#626972", borderRadius: 2, marginBottom: 18 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  detailArtwork: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sheetKicker: { color: lime, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  sheetTitle: { color: "#f4f5f0", fontSize: 22, fontWeight: "800", marginTop: 4 },
  sheetArtist: { color: muted, fontSize: 11, marginTop: 4 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#23272d", alignItems: "center", justifyContent: "center" },
  locationHint: { color: "#9caf77", backgroundColor: "#1e2b1a", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, alignSelf: "flex-start", fontSize: 10, marginTop: 16 },
  detailActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  primaryAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: lime, borderRadius: 11, paddingVertical: 11 },
  primaryActionText: { color: "#0a0b0d", fontSize: 11, fontWeight: "900" },
  secondaryAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#24292f", borderRadius: 11, paddingHorizontal: 11, paddingVertical: 11 },
  secondaryActionText: { color: "#e9eee5", fontSize: 11, fontWeight: "800" },
  disabledAction: { opacity: 0.55 },
  songsHeading: { color: "#eef0eb", fontSize: 15, fontWeight: "800", marginTop: 22, marginBottom: 7 },
  songRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#252a30" },
  songMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  removeSong: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  songArt: { width: 37, height: 37, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  songInitials: { color: "#f3f5ef", fontSize: 10, fontWeight: "900" },
  songTitle: { color: "#eef0eb", fontSize: 11, fontWeight: "800" },
  songArtist: { color: muted, fontSize: 10, marginTop: 3 },
  emptySongs: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#202a1b", borderRadius: 12, padding: 12, marginTop: 4 },
  emptySongsText: { flex: 1, color: "#a8bb81", fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
});
