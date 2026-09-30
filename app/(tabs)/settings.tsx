import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useLibraryController } from "@/lib/library-context";
import { registerBackgroundLibraryScanAsync, unregisterBackgroundLibraryScanAsync } from "@/lib/background-library-task";

const lime = "#c8f34a";
const muted = "#9299a3";
const SETTINGS_KEY = "kora.settings";

type SettingsState = { normalize: boolean; crossfade: boolean; artwork: boolean; showLyrics: boolean; backgroundScan: boolean; preset: string };
const DEFAULT_SETTINGS: SettingsState = { normalize: true, crossfade: false, artwork: true, showLyrics: true, backgroundScan: true, preset: "Warm" };

export default function SettingsScreen() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [toast, setToast] = useState("");
    const { scanState, refreshLibrary, resumeScan, artworkEnabled, lyricsEnabled, setArtworkEnabled, setLyricsEnabled } = useLibraryController();

  useEffect(() => { AsyncStorage.getItem(SETTINGS_KEY).then((saved) => { if (saved) { try { setSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(saved) as Partial<SettingsState>) }); } catch { /* use defaults */ } } setSettingsHydrated(true); }).catch(() => setSettingsHydrated(true)); }, []);
  useEffect(() => { if (settingsHydrated) void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings, settingsHydrated]);

  const flash = (message: string) => { setToast(message); setTimeout(() => setToast(""), 2200); };
  const toggleBackgroundScan = () => {
    const next = !settings.backgroundScan;
    setSettings((current) => ({ ...current, backgroundScan: next }));
    void (next ? registerBackgroundLibraryScanAsync() : unregisterBackgroundLibraryScanAsync());
    flash(next ? "Background library refresh enabled" : "Background library refresh disabled");
  };
  const scanMessage = useMemo(() => {
    if (scanState.status === "scanning") return scanState.total ? `Reading ${scanState.processed} of ${scanState.total} tracks` : "Preparing device library";
    if (scanState.status === "paused") return "Scan paused — tap to resume";
    if (scanState.status === "complete") return scanState.lastScannedAt ? `Last refreshed ${new Date(scanState.lastScannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Library is up to date";
    if (scanState.status === "denied") return "Allow audio access to scan this device";
    if (scanState.status === "error") return "Scan failed — tap to try again";
    return "Music, albums, artwork, and .lrc files";
  }, [scanState]);

  return (
    <ScreenContainer containerClassName="bg-[#0a0b0d]" className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Text style={styles.eyebrow}>PREFERENCES</Text><Text style={styles.title}>Settings</Text></View></View>

        <Text style={styles.groupLabel}>LIBRARY</Text>
        <View style={styles.groupCard}>
          <Pressable disabled={scanState.status === "scanning"} onPress={() => { if (scanState.status === "paused") { resumeScan(); flash("Resuming scan…"); } else { void refreshLibrary(); flash("Refreshing your music library…"); } }} style={({ pressed }) => [styles.scanRow, pressed && styles.pressed]}><View style={styles.scanCircle}><MaterialIcons name={scanState.status === "scanning" ? "hourglass-top" : "sync"} size={18} color="#0a0b0d" /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{scanState.status === "scanning" ? "Refreshing library" : "Refresh this device"}</Text><Text style={styles.rowSubtitle}>{scanMessage}</Text></View><MaterialIcons name="arrow-forward" size={19} color={scanState.status === "scanning" ? "#64703e" : lime} /></Pressable>
          <View style={styles.divider} />
          <SettingRow icon="album" title="Show album artwork" subtitle="Use embedded art when a file provides it" value={artworkEnabled} onPress={() => setArtworkEnabled(!artworkEnabled)} />
          <View style={styles.divider} />
          <SettingRow icon="lyrics" title="Match lyric files" subtitle="Look for embedded lyrics and .lrc files beside music" value={lyricsEnabled} onPress={() => setLyricsEnabled(!lyricsEnabled)} />
          <View style={styles.divider} />
          <SettingRow icon="notifications-active" title="Background scan notifications" subtitle="Notify when Kora refreshes your music library" value={settings.backgroundScan} onPress={toggleBackgroundScan} />
        </View>

        <Text style={styles.groupLabel}>ABOUT KORA</Text>
        <View style={styles.aboutRow}><MaterialIcons name="info-outline" size={19} color={muted} /><Text style={styles.aboutText}>Version 1.0.0</Text><Text style={styles.aboutRight}>Made for local listening</Text></View>
        {toast && <Pressable onPress={() => setToast("")} style={styles.toast}><MaterialIcons name="check-circle" size={17} color={lime} /><Text style={styles.toastText}>{toast}</Text><MaterialIcons name="close" size={15} color="#93a578" /></Pressable>}
      </ScrollView>
    </ScreenContainer>
  );
}

function SettingRow({ icon, title, subtitle, value, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; value: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}><View style={styles.rowIcon}><MaterialIcons name={icon} size={18} color={lime} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View><Switch value={value} onValueChange={onPress} trackColor={{ false: "#32383f", true: "#536d2d" }} thumbColor={value ? lime : "#969da5"} /></Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 28 }, header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }, eyebrow: { color: "#7d858f", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 }, title: { color: "#f2f4ef", fontSize: 27, fontWeight: "800", letterSpacing: -1.2, marginTop: 6 }, profileCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, backgroundColor: "#15181c", borderRadius: 17, borderWidth: 1, borderColor: "#292e34", marginBottom: 27 }, profileIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: lime, alignItems: "center", justifyContent: "center" }, profileTitle: { color: "#eef0eb", fontSize: 13, fontWeight: "800" }, profileCopy: { color: muted, fontSize: 10, marginTop: 3 }, groupLabel: { color: "#7d858f", fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 9, marginLeft: 2 }, groupCard: { backgroundColor: "#13161a", borderRadius: 17, borderWidth: 1, borderColor: "#24282d", paddingHorizontal: 13, marginBottom: 23 }, settingRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 69 }, rowIcon: { width: 33, height: 33, borderRadius: 11, backgroundColor: "#24321b", alignItems: "center", justifyContent: "center" }, rowTitle: { color: "#eef0eb", fontSize: 12, fontWeight: "800" }, rowSubtitle: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 4 }, divider: { height: 1, backgroundColor: "#24282d" }, soundCard: { backgroundColor: "#13161a", borderRadius: 17, borderWidth: 1, borderColor: "#24282d", padding: 14, marginBottom: 23 }, soundHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, activeValue: { color: lime, fontSize: 11, fontWeight: "900" }, presetRow: { flexDirection: "row", gap: 7, marginTop: 16 }, preset: { flex: 1, alignItems: "center", borderRadius: 9, paddingVertical: 8, backgroundColor: "#1c2025", borderWidth: 1, borderColor: "#282e35" }, presetActive: { backgroundColor: "#30421e", borderColor: "#637e36" }, presetText: { color: muted, fontSize: 10, fontWeight: "700" }, presetTextActive: { color: lime }, scanRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 75 }, scanCircle: { width: 34, height: 34, borderRadius: 12, backgroundColor: lime, alignItems: "center", justifyContent: "center" }, aboutRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 2, paddingVertical: 6 }, aboutText: { color: muted, fontSize: 11 }, aboutRight: { color: "#666f79", fontSize: 10, marginLeft: "auto" }, toast: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#1f2c1a", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, marginTop: 18 }, toastText: { color: "#eaf5ce", fontSize: 11, fontWeight: "700" }, pressed: { opacity: 0.7 },
});
