import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAudioPlayerController } from "@/lib/audio-player-context";
import { useLibraryController } from "@/lib/library-context";

const lime = "#c8f34a";
const ink = "#0a0b0d";
const muted = "#9299a3";

type ListeningItem = {
  id: string;
  title: string;
  artist: string;
  initials: string;
  tone: string;
  artworkUri?: string;
};

export default function HomeScreen() {
  const { queue, currentTrack, isPlaying, togglePlay, playTrack } = useAudioPlayerController();
  const { tracks, scanState } = useLibraryController();
  const router = useRouter();
  const continueListening = useMemo<ListeningItem[]>(() => (currentTrack ? [currentTrack, ...tracks.filter((track) => track.id !== currentTrack.id)] : tracks).slice(0, 5).map((track) => ({ id: track.id, title: track.title, artist: track.artist, tone: track.tone, initials: track.initials, artworkUri: track.artworkUri })), [currentTrack, tracks]);

  const playItem = (item: ListeningItem) => {
    const queued = queue.find((candidate) => candidate.id === item.id);
    if (queued) { playTrack(queued); return; }
    // The queue can be behind the library (e.g. right after launch), so fall back to the library track.
    const libraryTrack = tracks.find((candidate) => candidate.id === item.id);
    if (libraryTrack?.uri) {
      playTrack({ id: libraryTrack.id, title: libraryTrack.title, artist: libraryTrack.artist, album: libraryTrack.album, duration: libraryTrack.duration, tone: libraryTrack.tone, initials: libraryTrack.initials, artworkUri: libraryTrack.artworkUri, source: libraryTrack.uri });
    }
  };

  return (
    <ScreenContainer containerClassName="bg-[#0a0b0d]" className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <View style={styles.logo}><MaterialIcons name="graphic-eq" size={18} color={ink} /></View>
            <Text style={styles.brand}>kora</Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>TUESDAY, SEPTEMBER 28</Text>
        <Text style={styles.greeting}>Good evening</Text>
        <Text style={styles.subGreeting}>Pick up where you left off.</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTopline}>
            <View style={styles.pill}><MaterialIcons name="auto-awesome" size={13} color={lime} /><Text style={styles.pillText}>YOUR DAILY MIX</Text></View>
            <Text style={styles.heroMeta}>{scanState.status === "scanning" ? "SCANNING" : tracks.length ? "LOCAL MIX" : "NO MUSIC"}</Text>
          </View>
          <View style={styles.heroBody}>
            <View style={styles.artworkLarge}>
              <View style={styles.artworkRing} />
              <View style={styles.artworkCore}><MaterialIcons name="graphic-eq" size={42} color={lime} /></View>
              <Text style={styles.artworkLabel}>K O R A</Text>
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>A softer kind of loud.</Text>
              <Text style={styles.heroCopy}>A warm mix of familiar favorites and new finds.</Text>
              <Pressable onPress={tracks.length ? togglePlay : () => router.push("/library")} style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}>
                <MaterialIcons name={tracks.length ? (isPlaying ? "pause" : "play-arrow") : "library-music"} size={18} color={ink} />
                <Text style={styles.playText}>{tracks.length ? (isPlaying ? "Pause mix" : "Play mix") : "Scan library"}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{currentTrack ? "Continue listening" : "Your device library"}</Text>
          <Pressable onPress={() => router.push("/library")}><Text style={styles.link}>See all</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
          {continueListening.length ? continueListening.map((item) => (
            <Pressable key={item.id} onPress={() => playItem(item)} style={({ pressed }) => [styles.continueCard, pressed && styles.pressed]}>
              <View style={[styles.smallArtwork, { backgroundColor: item.tone }]}>
                {item.artworkUri ? <Image source={{ uri: item.artworkUri }} style={styles.artworkImage} /> : <Text style={styles.artworkInitials}>{item.initials}</Text>}
                <MaterialIcons name="play-circle" size={22} color="#ffffff" style={styles.cardPlay} />
              </View>
              <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.cardArtist}>{item.artist}</Text>
            </Pressable>
          )) : <Pressable onPress={() => router.push("/library")} style={styles.emptyLibrary}><MaterialIcons name="music-off" size={25} color={lime} /><View><Text style={styles.emptyTitle}>No music found yet</Text><Text style={styles.emptyCopy}>Scan your device library to get started.</Text></View><MaterialIcons name="chevron-right" size={21} color={lime} /></Pressable>}
        </ScrollView>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 28 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  logo: { width: 33, height: 33, borderRadius: 11, backgroundColor: lime, alignItems: "center", justifyContent: "center" },
  brand: { color: "#f4f5f0", fontSize: 22, fontWeight: "800", letterSpacing: -0.8 },
  eyebrow: { color: "#7d858f", fontSize: 10, fontWeight: "800", letterSpacing: 1.7 },
  greeting: { color: "#f4f5f0", fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -1.2, marginTop: 7 },
  subGreeting: { color: muted, fontSize: 14, marginTop: 4, marginBottom: 23 },
  heroCard: { borderRadius: 24, backgroundColor: "#171a20", padding: 18, overflow: "hidden", borderWidth: 1, borderColor: "#282d35", marginBottom: 27 },
  heroGlow: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "#2b3d30", right: -68, top: -84, opacity: 0.75 },
  heroTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#25321d", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  pillText: { color: lime, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  heroMeta: { color: "#7f8992", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroBody: { flexDirection: "row", alignItems: "center", gap: 17 },
  artworkLarge: { width: 130, height: 130, borderRadius: 20, backgroundColor: "#233b33", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: "#4b6550" },
  artworkRing: { position: "absolute", width: 118, height: 118, borderRadius: 59, borderWidth: 1, borderColor: "#a3c65a", opacity: 0.5 },
  artworkCore: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#15251f", alignItems: "center", justifyContent: "center" },
  artworkLabel: { position: "absolute", bottom: 12, color: "#b7d878", fontSize: 8, fontWeight: "800", letterSpacing: 3 },
  heroText: { flex: 1 },
  heroTitle: { color: "#f4f5f0", fontSize: 20, fontWeight: "800", lineHeight: 24 },
  heroCopy: { color: "#a0a6ad", fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 14 },
  playButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: lime, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  playText: { color: ink, fontSize: 12, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 13 },
  sectionTitle: { color: "#f0f2ed", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  link: { color: lime, fontSize: 12, fontWeight: "800" },
  horizontalList: { gap: 12 },
  emptyLibrary: { width: 330, minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, backgroundColor: "#171a20", borderRadius: 16, borderWidth: 1, borderColor: "#282d35" },
  emptyTitle: { color: "#e8ebe5", fontSize: 13, fontWeight: "800" },
  emptyCopy: { color: muted, fontSize: 11, marginTop: 4 },
  continueCard: { width: 142 },
  smallArtwork: { height: 142, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 9, overflow: "hidden" },
  artworkImage: { width: "100%", height: "100%" },
  artworkInitials: { color: "#f3f4ee", fontSize: 22, fontWeight: "900", opacity: 0.7 },
  cardPlay: { position: "absolute", right: 9, bottom: 9 },
  cardTitle: { color: "#e8ebe5", fontSize: 12, fontWeight: "800" },
  cardArtist: { color: muted, fontSize: 11, marginTop: 4 },
  pressed: { opacity: 0.7 },
});
