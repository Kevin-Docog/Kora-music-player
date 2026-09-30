import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAudioPlayerController } from "@/lib/audio-player-context";
import { queueTrackFromLibrary, useLibraryController } from "@/lib/library-context";
import { buildDailyMix, dayKey } from "@/lib/mix-utils";

const lime = "#c8f34a";
const ink = "#0a0b0d";
const muted = "#9299a3";

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

function formatToday(date: Date) {
  try { return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase(); } catch { return date.toDateString().toUpperCase(); }
}

type ListeningItem = {
  id: string;
  title: string;
  artist: string;
  initials: string;
  tone: string;
  artworkUri?: string;
};

export default function HomeScreen() {
  const { queue, currentTrack, isPlaying, togglePlay, playTrack, playMix } = useAudioPlayerController();
  const { tracks, scanState } = useLibraryController();
  const router = useRouter();
  // Live date and greeting (refreshed every minute so it stays right if the app is left open).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  // Favorites live in Library; re-read them whenever Home comes into view.
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem("kora.library.favorites").then((value) => {
      if (!value) { setFavoriteIds([]); return; }
      try { const parsed = JSON.parse(value) as unknown; setFavoriteIds(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []); } catch { setFavoriteIds([]); }
    }).catch(() => undefined);
  }, []));

  // Daily mix: same songs all day (seeded by the date), until the person taps Remix.
  const [remixCount, setRemixCount] = useState(0);
  const today = dayKey(now);
  const mix = useMemo(() => buildDailyMix(tracks.filter((track) => track.uri), favoriteIds, today * 100 + remixCount), [tracks, favoriteIds, today, remixCount]);
  const mixIds = useMemo(() => new Set(mix.map((track) => track.id)), [mix]);
  const mixQueued = mix.length > 0 && mix.every((track, index) => queue[index]?.id === track.id);
  const mixActive = mixQueued && !!currentTrack && mixIds.has(currentTrack.id);
  const mixArtists = useMemo(() => Array.from(new Set(mix.map((track) => track.artist).filter((name) => name && !/unknown/i.test(name)))).slice(0, 3), [mix]);
  const favoriteCount = useMemo(() => mix.filter((track) => favoriteIds.includes(track.id)).length, [mix, favoriteIds]);

  const onMixPress = () => {
    if (!mix.length) { router.push("/library"); return; }
    if (mixActive) { togglePlay(); return; }
    playMix(mix.map(queueTrackFromLibrary), mix[0].id);
  };

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

        <Text style={styles.eyebrow}>{formatToday(now)}</Text>
        <Text style={styles.greeting}>{greetingFor(now)}</Text>
        <Text style={styles.subGreeting}>Pick up where you left off.</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTopline}>
            <View style={styles.pill}><MaterialIcons name="auto-awesome" size={13} color={lime} /><Text style={styles.pillText}>YOUR DAILY MIX</Text></View>
            <View style={styles.metaRow}><Text style={styles.heroMeta}>{scanState.status === "scanning" ? "SCANNING" : mix.length ? `${mix.length} SONGS` : "NO MUSIC"}</Text>{mix.length > 1 && <Pressable onPress={() => setRemixCount((count) => count + 1)} hitSlop={10} style={({ pressed }) => [styles.remix, pressed && styles.pressed]}><MaterialIcons name="refresh" size={15} color={lime} /><Text style={styles.remixText}>REMIX</Text></Pressable>}</View>
          </View>
          <View style={styles.heroBody}>
            <View style={styles.artworkLarge}>
              <View style={styles.artworkRing} />
              <View style={styles.artworkCore}><MaterialIcons name="graphic-eq" size={32} color={lime} /></View>
              <Text style={styles.artworkLabel}>K O R A</Text>
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>{mix.length ? "Today\u2019s mix" : "No music yet"}</Text>
              <Text style={styles.heroCopy}>{mix.length ? `${mixArtists.length ? `With ${mixArtists.join(", ")}${new Set(mix.map((track) => track.artist)).size > mixArtists.length ? " and more" : ""}. ` : ""}${favoriteCount ? `Includes ${favoriteCount} of your favorites.` : "Heart songs in Library to get more of your favorites."}` : "Scan your device library to build a mix."}</Text>
              <Pressable onPress={onMixPress} style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}>
                <MaterialIcons name={mix.length ? (mixActive && isPlaying ? "pause" : "play-arrow") : "library-music"} size={18} color={ink} />
                <Text style={styles.playText}>{mix.length ? (mixActive ? (isPlaying ? "Pause mix" : "Resume mix") : "Play mix") : "Open library"}</Text>
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
                {item.artworkUri ? <Image source={{ uri: item.artworkUri }} style={styles.artworkImage} /> : <MaterialIcons name="music-note" size={34} color="#f3f4ee" style={{ opacity: 0.8 }} />}
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
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  logo: { width: 33, height: 33, borderRadius: 11, backgroundColor: lime, alignItems: "center", justifyContent: "center" },
  brand: { color: "#f4f5f0", fontSize: 22, fontWeight: "800", letterSpacing: -0.8 },
  eyebrow: { color: "#7d858f", fontSize: 10, fontWeight: "800", letterSpacing: 1.7 },
  greeting: { color: "#f4f5f0", fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -1.2, marginTop: 7 },
  subGreeting: { color: muted, fontSize: 13, marginTop: 3, marginBottom: 18 },
  heroCard: { borderRadius: 22, backgroundColor: "#171a20", padding: 14, overflow: "hidden", borderWidth: 1, borderColor: "#282d35", marginBottom: 22 },
  heroGlow: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "#2b3d30", right: -68, top: -84, opacity: 0.75 },
  heroTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#25321d", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  pillText: { color: lime, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  remix: { flexDirection: "row", alignItems: "center", gap: 3 },
  remixText: { color: lime, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroMeta: { color: "#7f8992", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroBody: { flexDirection: "row", alignItems: "center", gap: 14 },
  artworkLarge: { width: 100, height: 100, borderRadius: 18, backgroundColor: "#233b33", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: "#4b6550" },
  artworkRing: { position: "absolute", width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderColor: "#a3c65a", opacity: 0.5 },
  artworkCore: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#15251f", alignItems: "center", justifyContent: "center" },
  artworkLabel: { position: "absolute", bottom: 8, color: "#b7d878", fontSize: 8, fontWeight: "800", letterSpacing: 3 },
  heroText: { flex: 1 },
  heroTitle: { color: "#f4f5f0", fontSize: 17, fontWeight: "800", lineHeight: 21 },
  heroCopy: { color: "#a0a6ad", fontSize: 11, lineHeight: 16, marginTop: 5, marginBottom: 11 },
  playButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: lime, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  playText: { color: ink, fontSize: 12, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 13 },
  sectionTitle: { color: "#f0f2ed", fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  link: { color: lime, fontSize: 12, fontWeight: "800" },
  horizontalList: { gap: 12 },
  emptyLibrary: { width: 330, minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, backgroundColor: "#171a20", borderRadius: 16, borderWidth: 1, borderColor: "#282d35" },
  emptyTitle: { color: "#e8ebe5", fontSize: 13, fontWeight: "800" },
  emptyCopy: { color: muted, fontSize: 11, marginTop: 4 },
  continueCard: { width: 112 },
  smallArtwork: { height: 112, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 9, overflow: "hidden" },
  artworkImage: { width: "100%", height: "100%" },
  artworkInitials: { color: "#f3f4ee", fontSize: 22, fontWeight: "900", opacity: 0.7 },
  cardPlay: { position: "absolute", right: 9, bottom: 9 },
  cardTitle: { color: "#e8ebe5", fontSize: 12, fontWeight: "800" },
  cardArtist: { color: muted, fontSize: 11, marginTop: 4 },
  pressed: { opacity: 0.7 },
});
