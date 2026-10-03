import { Animated, FlatList, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { HeartPop, Pulse, PressScale, tapHaptic } from "@/components/fx";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioPlayerController, useAudioProgress, type QueueTrack } from "@/lib/audio-player-context";
import { useLibraryController } from "@/lib/library-context";
import { getActiveLyricIndex } from "@/lib/lyrics-utils";
import { SongOptions } from "@/components/song-options";

type MiniPlayerProps = { bottom: number };
const lime = "#c8f34a";
const muted = "#d8beb9";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

const QUEUE_ROW_HEIGHT = 58;

// These read the 4x/second progress context on their own, so the rest of the
// player (bar, modals, queue) no longer re-renders on every tick.
const SeekBar = memo(function SeekBar({ seekTo }: { seekTo: (seconds: number) => void }) {
  const { position, duration } = useAudioProgress();
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;
  const widthRef = useRef(1);
  const responder = useMemo(() => {
    const seekFromEvent = (locationX: number) => {
      const fraction = Math.min(1, Math.max(0, locationX / Math.max(1, widthRef.current)));
      seekToRef.current(fraction * Math.max(durationRef.current, 1));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => seekFromEvent(event.nativeEvent.locationX),
      onPanResponderMove: (event) => seekFromEvent(event.nativeEvent.locationX),
    });
  }, []);
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  return (
    <View style={styles.progressArea}>
      <View {...responder.panHandlers} onLayout={(event) => { widthRef.current = event.nativeEvent.layout.width; }} style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.progressThumb, { left: `${Math.max(0, progress * 100)}%` }]} />
      </View>
      <View style={styles.timeRow}><Text style={styles.timeText}>{formatTime(position)}</Text><Text style={styles.timeText}>{formatTime(duration || 236)}</Text></View>
    </View>
  );
});

/** One lyric line: the current line grows and brightens, lines further away fade out. */
const LyricLine = memo(function LyricLine({ text, distance, onLayout }: { text: string; distance: number; onLayout: (event: { nativeEvent: { layout: { y: number; height: number } } }) => void }) {
  const progress = useSharedValue(distance === 0 ? 1 : 0);
  const fade = useSharedValue(Math.max(0.25, 0.7 - Math.min(distance, 4) * 0.12));
  useEffect(() => {
    progress.value = withTiming(distance === 0 ? 1 : 0, { duration: 320 });
    fade.value = withTiming(distance === 0 ? 1 : Math.max(0.25, 0.7 - Math.min(distance, 4) * 0.12), { duration: 320 });
  }, [distance, progress, fade]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: 0.88 + progress.value * 0.12 }] }));
  return (
    <Reanimated.View onLayout={onLayout} style={[{ transformOrigin: "left center" }, animatedStyle]}>
      <Text style={distance === 0 ? styles.lyricActive : styles.lyricMuted}>{text}</Text>
    </Reanimated.View>
  );
});

/** Soft colored halo that follows the cover's rounded-square border (stacked translucent rounded layers, no blur package needed). */
const GLOW_LAYERS = [
  { grow: 6, opacity: 0.28 },
  { grow: 14, opacity: 0.2 },
  { grow: 24, opacity: 0.13 },
  { grow: 36, opacity: 0.08 },
  { grow: 50, opacity: 0.04 },
];
const CoverGlow = memo(function CoverGlow({ color, playing }: { color: string; playing: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(playing ? 1.03 : 0.98, { duration: 700 });
  }, [playing, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      {/* Same size and position as the cover, so every layer grows outward from its edge. */}
      <Reanimated.View style={[{ width: "100%", maxWidth: 370, aspectRatio: 1 }, animatedStyle]}>
        {GLOW_LAYERS.map((layer) => (
          <View
            key={layer.grow}
            style={{
              position: "absolute",
              top: -layer.grow,
              left: -layer.grow,
              right: -layer.grow,
              bottom: -layer.grow,
              borderRadius: 25 + layer.grow,
              backgroundColor: color,
              opacity: layer.opacity,
            }}
          />
        ))}
      </Reanimated.View>
    </View>
  );
});

/** Thin progress line along the bottom edge of the mini player. */
const MiniProgress = memo(function MiniProgress() {
  const { position, duration } = useAudioProgress();
  const percent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 14, right: 14, bottom: 0, height: 2, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 1, overflow: "hidden" }}>
      <View style={{ width: `${percent}%`, height: 2, backgroundColor: lime }} />
    </View>
  );
});

const LyricsView = memo(function LyricsView({ lines, fallbackText }: { lines: Array<{ time: number; text: string }>; fallbackText?: string }) {
  const { position } = useAudioProgress();
  const scrollRef = useRef<ScrollView>(null);
  const lineLayouts = useRef<Record<number, { y: number; height: number }>>({});
  const [viewportHeight, setViewportHeight] = useState(0);
  const activeIndex = getActiveLyricIndex(lines, position);
  const synced = lines.length > 0;

  // Scroll so the current line sits in the middle of the lyrics area, using the real measured size of each line.
  const centerLine = useCallback((index: number) => {
    const layout = lineLayouts.current[index];
    if (!layout || !viewportHeight) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, layout.y + layout.height / 2 - viewportHeight / 2), animated: true });
  }, [viewportHeight]);

  useEffect(() => {
    lineLayouts.current = {};
  }, [lines]);

  useEffect(() => {
    if (activeIndex >= 0) centerLine(activeIndex);
  }, [activeIndex, centerLine]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.lyricContent}
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      // Extra space above and below lets the first and last lines reach the middle too.
      contentContainerStyle={synced ? [styles.lyricContentInner, { paddingVertical: viewportHeight / 2 }] : styles.lyricContentInner}
      showsVerticalScrollIndicator={false}
    >
      {synced ? null : <Text style={styles.lyricLabel}>LYRICS</Text>}
      {synced ? lines.map((line, index) => (
        <LyricLine
          key={`${line.time}-${index}`}
          text={line.text}
          distance={activeIndex < 0 ? index + 1 : Math.abs(index - activeIndex)}
          onLayout={(event) => {
            lineLayouts.current[index] = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height };
            if (index === activeIndex) centerLine(index);
          }}
        />
      )) : <Text style={styles.lyricMuted}>{fallbackText || "Lyrics are not available for this song."}</Text>}
    </ScrollView>
  );
});

const QueueRow = memo(function QueueRow({ track, active, onRemove }: { track: QueueTrack; active: boolean; onRemove: (id: string) => void }) {
  return (
    <View style={[styles.queueRow, active && styles.activeRow]}>
      <View style={[styles.queueArt, { backgroundColor: track.tone }]}>{track.artworkUri ? <Image source={{ uri: track.artworkUri }} style={styles.queueImage} /> : <MaterialIcons name="music-note" size={18} color="#f3f5ef" style={{ opacity: 0.8 }} />}</View>
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.queueTitle}>{track.title}</Text><Text numberOfLines={1} style={styles.queueArtist}>{track.artist}</Text></View>
      {active && <MaterialIcons name="volume-up" size={16} color={lime} />}
      <Pressable onPress={() => onRemove(track.id)} hitSlop={10}><MaterialIcons name="close" size={17} color="#747d86" /></Pressable>
    </View>
  );
});

export function MiniPlayer({ bottom }: MiniPlayerProps) {
  const insets = useSafeAreaInsets();
  const { queue, currentTrack, currentIndex, isPlaying, repeatMode, togglePlay, next, previous, removeFromQueue, clearQueue, toggleRepeatMode, seekTo } = useAudioPlayerController();
  const { tracks } = useLibraryController();
  const [showQueue, setShowQueue] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<"cover" | "lyric">("cover");
  const [favorite, setFavorite] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const repeatIcon = repeatMode === "shuffle" ? "shuffle" : repeatMode === "all" ? "repeat" : "repeat-one";
  const currentId = currentTrack?.id;
  const currentTitle = currentTrack?.title;
  // Was a full-library scan on every progress tick; now only when the song or library changes.
  const libraryTrack = useMemo(
    () => tracks.find((track) => track.id === currentId) ?? tracks.find((track) => track.title === currentTitle),
    [tracks, currentId, currentTitle],
  );
  const lyricLines = libraryTrack?.lyricLines ?? [];
  const renderQueueRow = useCallback(({ item, index }: { item: QueueTrack; index: number }) => <QueueRow track={item} active={index === currentIndex} onRemove={removeFromQueue} />, [currentIndex, removeFromQueue]);
  const queueKey = useCallback((item: QueueTrack, index: number) => `${item.id}-${index}`, []);
  const queueLayout = useCallback((_: ArrayLike<QueueTrack> | null | undefined, index: number) => ({ length: QUEUE_ROW_HEIGHT, offset: QUEUE_ROW_HEIGHT * index, index }), []);

  // Swipe gestures for the expanded player. Kept in a ref so the responders always call the latest handlers.
  const swipeActions = useRef({ next, previous, close: () => setShowNowPlaying(false) });
  swipeActions.current = { next, previous, close: () => setShowNowPlaying(false) };
  const coverShift = useRef(new Animated.Value(0)).current;
  const coverPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 || g.dy > 10,
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > Math.abs(g.dy)) coverShift.setValue(g.dx * 0.5);
      },
      onPanResponderRelease: (_, g) => {
        Animated.spring(coverShift, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        if (Math.abs(g.dx) > Math.abs(g.dy)) {
          if (g.dx < -60) swipeActions.current.next();
          else if (g.dx > 60) swipeActions.current.previous();
        } else if (g.dy > 90) {
          swipeActions.current.close();
        }
      },
      onPanResponderTerminate: () => Animated.spring(coverShift, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current;
  // Header area (and lyrics mode): swipe down only, so scrolling lyrics is never blocked.
  const closePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && g.dy > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90) swipeActions.current.close();
      },
    }),
  ).current;

  if (!currentTrack || queue.length === 0) return null;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.floatingWrap, { bottom }]}>
        <View style={styles.playerBar}>
          <PressScale onPress={() => setShowNowPlaying(true)} scaleTo={0.98} style={styles.mainHitArea}>
            <View style={[styles.art, { backgroundColor: currentTrack.tone }]}>{currentTrack.artworkUri ? <Image source={{ uri: currentTrack.artworkUri }} style={styles.artImage} /> : <MaterialIcons name="music-note" size={24} color="#f3f5ef" style={{ opacity: 0.8 }} />}</View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.title}>{currentTrack.title}</Text>
              <Text numberOfLines={1} style={styles.artist}>{currentTrack.artist} · {currentTrack.album}</Text>
            </View>
          </PressScale>
          <PressScale onPress={() => setShowQueue(true)} haptic="light" scaleTo={0.88} style={styles.iconButton}><MaterialIcons name="queue-music" size={21} color={lime} /></PressScale>
          <Pulse active={isPlaying}><PressScale onPress={togglePlay} haptic="light" scaleTo={0.88} style={styles.playButton}><MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={21} color="#0a0b0d" /></PressScale></Pulse>
          <MiniProgress />
        </View>
      </View>

      <Modal visible={showNowPlaying} animationType="slide" onRequestClose={() => setShowNowPlaying(false)}>
        <View style={[styles.nowPlaying, { backgroundColor: currentTrack.tone }]}>
          {currentTrack.artworkUri ? <Image source={{ uri: currentTrack.artworkUri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={70} /> : null}
          <View style={[styles.nowPlayingOverlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
            <View {...closePan.panHandlers}><View style={styles.topControls}><Pressable onPress={() => setShowNowPlaying(false)} hitSlop={10}><MaterialIcons name="keyboard-arrow-down" size={34} color="#f9f6f3" /></Pressable><Pressable onPress={() => setShowOptions(true)} hitSlop={10} style={styles.moreButton}><MaterialIcons name="more-vert" size={24} color="#f9f6f3" /></Pressable></View>
            <View style={styles.segmented}><Pressable onPress={() => setViewMode("cover")} style={[styles.segment, viewMode === "cover" && styles.segmentActive]}><Text style={[styles.segmentText, viewMode === "cover" && styles.segmentTextActive]}>COVER</Text></Pressable><Pressable onPress={() => setViewMode("lyric")} style={[styles.segment, viewMode === "lyric" && styles.segmentActive]}><Text style={[styles.segmentText, viewMode === "lyric" && styles.segmentTextActive]}>LYRIC</Text></Pressable></View></View>

            {viewMode === "cover" ? <View style={styles.coverContent} {...coverPan.panHandlers}><CoverGlow color={currentTrack.tone} playing={isPlaying} /><Animated.View style={[styles.largeCover, { transform: [{ translateX: coverShift }] }]}>{currentTrack.artworkUri ? <Image source={{ uri: currentTrack.artworkUri }} style={styles.coverImage} contentFit="cover" /> : <><View style={styles.coverGlow} /><View style={styles.coverCore}><MaterialIcons name="music-note" size={70} color={lime} /></View><Text style={styles.coverBrand}>KORA LOCAL PLAY</Text></>}</Animated.View><View style={styles.trackHeading}><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.nowTitle}>{currentTrack.title}</Text><Text numberOfLines={1} style={styles.nowArtist}>{currentTrack.artist}</Text></View><Pressable onPress={() => { tapHaptic(favorite ? "light" : "medium"); setFavorite((value) => !value); }} hitSlop={10}><HeartPop active={favorite}><MaterialIcons name={favorite ? "favorite" : "favorite-border"} size={33} color={favorite ? lime : "#f9f6f3"} /></HeartPop></Pressable></View></View> : <LyricsView lines={lyricLines} fallbackText={libraryTrack?.lyricsText} />}

            <SeekBar seekTo={seekTo} />
            <View style={styles.transport}><PressScale onPress={toggleRepeatMode} haptic="select" scaleTo={0.85} hitSlop={12}><MaterialIcons name={repeatIcon} size={29} color="#f9f6f3" /></PressScale><PressScale onPress={previous} haptic="light" scaleTo={0.82} hitSlop={12}><MaterialIcons name="skip-previous" size={39} color="#f9f6f3" /></PressScale><Pulse active={isPlaying}><PressScale onPress={togglePlay} haptic="medium" scaleTo={0.9} style={styles.bigPlay}><MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={39} color={currentTrack.tone} /></PressScale></Pulse><PressScale onPress={next} haptic="light" scaleTo={0.82} hitSlop={12}><MaterialIcons name="skip-next" size={39} color="#f9f6f3" /></PressScale><PressScale onPress={() => setShowQueue(true)} haptic="light" scaleTo={0.85} hitSlop={12}><MaterialIcons name="queue-music" size={30} color="#f9f6f3" /></PressScale></View>
          </View>
          <SongOptions open={showOptions} onClose={() => setShowOptions(false)} track={currentTrack} libraryTrack={libraryTrack} />
        </View>
      </Modal>

      <Modal visible={showQueue} transparent animationType="slide" onRequestClose={() => setShowQueue(false)}>
        <View style={styles.backdrop}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.kicker}>UP NEXT</Text><Text style={styles.sheetTitle}>Queue</Text></View><Pressable onPress={() => setShowQueue(false)} style={styles.close}><MaterialIcons name="close" size={20} color="#f4f5f0" /></Pressable></View>
          <FlatList style={styles.queueList} data={queue} extraData={currentIndex} keyExtractor={queueKey} renderItem={renderQueueRow} getItemLayout={queueLayout} initialScrollIndex={Math.min(Math.max(currentIndex, 0), Math.max(queue.length - 1, 0))} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} removeClippedSubviews showsVerticalScrollIndicator={false} />
          <View style={styles.controls}><Pressable onPress={previous} style={styles.control}><MaterialIcons name="skip-previous" size={19} color="#f0f2ed" /><Text style={styles.controlText}>Previous</Text></Pressable><Pressable onPress={next} style={styles.control}><MaterialIcons name="skip-next" size={19} color="#f0f2ed" /><Text style={styles.controlText}>Next</Text></Pressable><Pressable onPress={clearQueue} style={styles.control}><MaterialIcons name="clear-all" size={19} color={lime} /><Text style={[styles.controlText, { color: lime }]}>Clear</Text></Pressable></View>
        </View></View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingWrap: { position: "absolute", left: 14, right: 14, zIndex: 20 },
  playerBar: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, paddingRight: 9, backgroundColor: "#171a1e", borderRadius: 16, borderWidth: 1, borderColor: "#343a42", shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  mainHitArea: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  art: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  artImage: { width: "100%", height: "100%" },
  artText: { color: "#f3f5ef", fontSize: 12, fontWeight: "900", opacity: 0.85 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: "#f1f3ee", fontSize: 12, fontWeight: "800" },
  artist: { color: muted, fontSize: 10, marginTop: 4 },
  iconButton: { width: 35, height: 35, borderRadius: 18, backgroundColor: "#26321d", alignItems: "center", justifyContent: "center" },
  playButton: { width: 37, height: 37, borderRadius: 19, backgroundColor: lime, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  nowPlaying: { flex: 1 },
  nowPlayingOverlay: { flex: 1, paddingHorizontal: 26, backgroundColor: "rgba(0, 0, 0, 0.42)" },
  topControls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  moreButton: { width: 34, height: 40, alignItems: "center", justifyContent: "center" },
  segmented: { flexDirection: "row", alignSelf: "center", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 24, padding: 3, marginTop: -39, marginBottom: 28 },
  segment: { width: 108, paddingVertical: 11, alignItems: "center", borderRadius: 21 },
  segmentActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  segmentText: { color: "#d9c8c5", fontSize: 12, fontWeight: "800" },
  segmentTextActive: { color: "#ffffff" },
  coverContent: { flex: 1, justifyContent: "center" },
  largeCover: { aspectRatio: 1, width: "100%", maxWidth: 370, alignSelf: "center", borderRadius: 25, backgroundColor: "#7d1c14", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverImage: { position: "absolute", width: "100%", height: "100%" },
  coverGlow: { position: "absolute", width: "85%", height: "85%", borderRadius: 180, backgroundColor: "rgba(255,255,255,0.08)" },
  coverCore: { width: 126, height: 126, borderRadius: 63, backgroundColor: "rgba(18, 9, 10, 0.35)", alignItems: "center", justifyContent: "center" },
  coverInitials: { color: "#fff3ed", fontSize: 30, fontWeight: "900", letterSpacing: 2, marginTop: 19 },
  coverBrand: { color: "rgba(255,245,237,0.65)", fontSize: 9, fontWeight: "900", letterSpacing: 3, marginTop: 16 },
  trackHeading: { flexDirection: "row", alignItems: "center", gap: 15, marginTop: 23 },
  nowTitle: { color: "#fffaf7", fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  nowArtist: { color: "#d8beb9", fontSize: 16, marginTop: 7 },
  lyricContent: { flex: 1, paddingHorizontal: 8 },
  lyricContentInner: { justifyContent: "center", gap: 18, paddingVertical: 30 },
  lyricLabel: { color: lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginBottom: 8 },
  lyricMuted: { color: "rgba(255,248,244,0.5)", fontSize: 19, lineHeight: 27 },
  lyricActive: { color: "#fffaf7", fontSize: 24, lineHeight: 31, fontWeight: "800" },
  progressArea: { marginTop: 23 },
  progressTrack: { height: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.28)", position: "relative" },
  progressFill: { height: 4, borderRadius: 3, backgroundColor: "#fffaf7" },
  progressThumb: { position: "absolute", top: -5, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: "#fffaf7" },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 9 },
  timeText: { color: "#d8beb9", fontSize: 12 },
  transport: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28 },
  bigPlay: { width: 78, height: 78, borderRadius: 39, backgroundColor: "#fffaf7", alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#171a1e", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 28, borderWidth: 1, borderColor: "#333941", maxHeight: "75%" },
  handle: { alignSelf: "center", width: 38, height: 4, backgroundColor: "#626972", borderRadius: 2, marginBottom: 18 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  kicker: { color: lime, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  sheetTitle: { color: "#f4f5f0", fontSize: 24, fontWeight: "800", marginTop: 5 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#23272d", alignItems: "center", justifyContent: "center" },
  queueList: { maxHeight: 300 },
  queueRow: { height: 58, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "#252a30" },
  activeRow: { backgroundColor: "#1c2619", borderRadius: 12, paddingHorizontal: 8, borderBottomColor: "transparent" },
  queueArt: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  queueImage: { width: "100%", height: "100%" },
  queueInitials: { color: "#f3f5ef", fontSize: 10, fontWeight: "900" },
  queueTitle: { color: "#eef0eb", fontSize: 12, fontWeight: "800" },
  queueArtist: { color: muted, fontSize: 10, marginTop: 3 },
  controls: { flexDirection: "row", gap: 8, marginTop: 17 },
  control: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#24292f", paddingVertical: 10, borderRadius: 10 },
  controlText: { color: "#f0f2ed", fontSize: 10, fontWeight: "800" },
});
