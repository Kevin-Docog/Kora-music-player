import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { QueueTrack } from "@/lib/audio-player-context";
import { useLibraryController, type LibraryTrack } from "@/lib/library-context";
import { usePlaylistController } from "@/lib/playlist-context";

const lime = "#c8f34a";
const muted = "#d8beb9";

type Mode = "menu" | "playlist" | "edit";
type Props = {
  open: boolean;
  onClose: () => void;
  track: QueueTrack | null;
  libraryTrack?: LibraryTrack;
};

// Same "Add to playlist" and "Edit metadata" actions as the Library's 3-dot menu, for the song that is playing.
// Render it inside the Now Playing modal so it can open on top of it.
export function SongOptions({ open, onClose, track, libraryTrack }: Props) {
  const { updateTrackMetadata } = useLibraryController();
  const { playlists, addTrackToPlaylist, createPlaylist } = usePlaylistController();
  const [mode, setMode] = useState<Mode>("menu");
  const [creating, setCreating] = useState(false);
  const [moodName, setMoodName] = useState("");
  const [draft, setDraft] = useState({ title: "", artist: "", album: "", lyricsText: "" });
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (open) { setMode("menu"); setCreating(false); setMoodName(""); }
  }, [open]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!track) return null;

  const beginEdit = () => {
    setDraft({ title: track.title, artist: track.artist, album: track.album, lyricsText: libraryTrack?.lyricsText || "" });
    setMode("edit");
  };
  const saveTo = (playlistId: string, title: string) => {
    addTrackToPlaylist(playlistId, track.id);
    setToast(`Saved to ${title}`);
    onClose();
  };
  const saveEdit = () => {
    updateTrackMetadata(track.id, draft);
    setToast("Metadata updated on this device");
    onClose();
  };

  return (
    <>
      <Modal visible={open} transparent animationType={mode === "menu" ? "fade" : "slide"} onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {mode === "menu" ? (
              <>
                <Text style={styles.kicker}>SONG OPTIONS</Text>
                <Text numberOfLines={1} style={styles.title}>{track.title}</Text>
                <Pressable onPress={() => setMode("playlist")} style={styles.choice}><Text style={styles.choiceText}>Add to playlist</Text><MaterialIcons name="playlist-add" size={20} color={lime} /></Pressable>
                <Pressable onPress={beginEdit} style={styles.choice}><Text style={styles.choiceText}>Edit metadata</Text><MaterialIcons name="edit" size={18} color={lime} /></Pressable>
                <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Close</Text></Pressable>
              </>
            ) : mode === "playlist" ? (
              <>
                <View style={styles.header}>
                  <View style={{ flex: 1 }}><Text style={styles.kicker}>SAVE SONG</Text><Text style={styles.title}>Choose a playlist</Text><Text numberOfLines={1} style={styles.subtitle}>{track.title}</Text></View>
                  <Pressable onPress={onClose} style={styles.close}><MaterialIcons name="close" size={21} color="#f4f5f0" /></Pressable>
                </View>
                {!creating ? (
                  <>
                    <View style={styles.playlistChoices}>
                      {playlists.map((playlist) => (
                        <Pressable key={playlist.id} onPress={() => saveTo(playlist.id, playlist.title)} style={styles.playlistChoice}>
                          <View style={[styles.choiceIcon, { backgroundColor: playlist.tone }]}><MaterialIcons name={playlist.id === "liked" ? "favorite" : "music-note"} size={15} color={playlist.id === "liked" ? "#ff887d" : lime} /></View>
                          <Text style={styles.choiceText}>{playlist.title}</Text>
                          <MaterialIcons name="chevron-right" size={19} color="#747d86" />
                        </Pressable>
                      ))}
                    </View>
                    <Pressable onPress={() => setCreating(true)} style={styles.newMood}><MaterialIcons name="add" size={17} color={lime} /><Text style={styles.newMoodText}>Create a new mood playlist</Text></Pressable>
                  </>
                ) : (
                  <>
                    <TextInput autoFocus value={moodName} onChangeText={setMoodName} placeholder="e.g. Late night drive" placeholderTextColor="#747d86" style={styles.input} returnKeyType="done" />
                    <Pressable onPress={() => { const playlist = createPlaylist(moodName.trim() || "New mood"); saveTo(playlist.id, playlist.title); }} style={styles.button}><MaterialIcons name="add" size={18} color="#0a0b0d" /><Text style={styles.buttonText}>Create and save</Text></Pressable>
                  </>
                )}
              </>
            ) : (
              <>
                <View style={styles.header}>
                  <View style={{ flex: 1 }}><Text style={styles.kicker}>LOCAL EDIT</Text><Text style={styles.title}>Edit metadata</Text><Text style={styles.subtitle}>Saved in Kora without changing the source file.</Text></View>
                  <Pressable onPress={onClose} style={styles.close}><MaterialIcons name="close" size={21} color="#f4f5f0" /></Pressable>
                </View>
                <TextInput value={draft.title} onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))} placeholder="Title" placeholderTextColor="#747d86" style={styles.input} />
                <TextInput value={draft.artist} onChangeText={(value) => setDraft((current) => ({ ...current, artist: value }))} placeholder="Artist" placeholderTextColor="#747d86" style={styles.input} />
                <TextInput value={draft.album} onChangeText={(value) => setDraft((current) => ({ ...current, album: value }))} placeholder="Album" placeholderTextColor="#747d86" style={styles.input} />
                <TextInput value={draft.lyricsText} onChangeText={(value) => setDraft((current) => ({ ...current, lyricsText: value }))} placeholder="Lyrics or LRC timestamps (optional)" placeholderTextColor="#747d86" style={[styles.input, styles.lyricsInput]} multiline textAlignVertical="top" />
                <Pressable onPress={saveEdit} style={styles.button}><MaterialIcons name="save" size={18} color="#0a0b0d" /><Text style={styles.buttonText}>Save changes</Text></Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
      {toast ? <View pointerEvents="none" style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#15181c", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 33, borderWidth: 1, borderColor: "#31363e" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  kicker: { color: lime, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#f1f3ee", fontSize: 21, fontWeight: "800", marginTop: 7 },
  subtitle: { color: muted, fontSize: 12, marginTop: 4, maxWidth: 270 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#23272d", alignItems: "center", justifyContent: "center" },
  choice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#20252b", borderRadius: 11, padding: 13, marginTop: 8 },
  choiceText: { flex: 1, color: "#eef0eb", fontSize: 12, fontWeight: "800" },
  cancel: { alignItems: "center", backgroundColor: "#24292f", borderRadius: 11, paddingVertical: 12, marginTop: 13 },
  cancelText: { color: "#d5d9d3", fontSize: 12, fontWeight: "800" },
  playlistChoices: { marginTop: 14, gap: 7 },
  playlistChoice: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#20252b", borderRadius: 11, padding: 9 },
  choiceIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  newMood: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#39422f", borderRadius: 11, paddingVertical: 11, marginTop: 12 },
  newMoodText: { color: lime, fontSize: 11, fontWeight: "800" },
  input: { color: "#eef0eb", backgroundColor: "#20252b", borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, marginTop: 12, fontSize: 13 },
  lyricsInput: { minHeight: 110 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: lime, borderRadius: 11, paddingVertical: 13, marginTop: 16 },
  buttonText: { color: "#0a0b0d", fontSize: 12, fontWeight: "900" },
  toast: { position: "absolute", left: 24, right: 24, bottom: 40, alignItems: "center" },
  toastText: { color: "#0a0b0d", backgroundColor: lime, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, fontSize: 12, fontWeight: "800", overflow: "hidden" },
});
