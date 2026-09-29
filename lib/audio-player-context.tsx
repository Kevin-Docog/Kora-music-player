import {
  AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getNextQueueIndex, type RepeatMode } from "@/lib/playback-utils";

export type QueueTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  tone: string;
  initials: string;
  duration: string;
  source: number | string;
  artworkUri?: string;
};

export const DEFAULT_QUEUE: QueueTrack[] = [];

type AudioPlayerContextValue = {
  queue: QueueTrack[];
  currentTrack: QueueTrack | null;
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  backgroundAudioEnabled: boolean;
  repeatMode: RepeatMode;
  togglePlay: () => void;
  playTrack: (track: QueueTrack) => void;
  next: () => void;
  previous: () => void;
  addToQueue: (track: QueueTrack) => void;
  replaceQueue: (tracks: QueueTrack[]) => void;
  updateQueueTrack: (trackId: string, patch: Partial<QueueTrack>) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
  setBackgroundAudioEnabled: (enabled: boolean) => void;
  toggleRepeatMode: () => void;
  normalizeVolume: boolean;
  smoothTransitions: boolean;
  equalizerPreset: string;
  setNormalizeVolume: (enabled: boolean) => void;
  setSmoothTransitions: (enabled: boolean) => void;
  setEqualizerPreset: (preset: string) => void;
  seekTo: (seconds: number) => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);
// Playback position ticks 4x/second. Keeping it in its own context means only the
// components that draw a progress bar or synced lyrics re-render, not the whole app.
type AudioProgressValue = { position: number; duration: number };
const AudioProgressContext = createContext<AudioProgressValue>({ position: 0, duration: 0 });
const LAST_TRACK_KEY = "kora.audio.last-track";
const LAST_POSITION_KEY = "kora.audio.last-position";
const AUDIO_SETTINGS_KEY = "kora.audio.settings";
const PRESET_GAIN: Record<string, number> = { Flat: 1, Warm: 0.92, Vocal: 0.96, "Bass boost": 0.88 };

export function AudioPlayerProvider({ children }: PropsWithChildren) {
  const [queue, setQueue] = useState(DEFAULT_QUEUE);
  const queueRef = useRef(queue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [backgroundAudioEnabled, setBackgroundAudioEnabledState] = useState(true);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("shuffle");
  const playerRef = useRef<AudioPlayer | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const [normalizeVolume, setNormalizeVolumeState] = useState(true);
  const [smoothTransitions, setSmoothTransitionsState] = useState(false);
  const [equalizerPreset, setEqualizerPresetState] = useState("Warm");
  const [audioSettingsHydrated, setAudioSettingsHydrated] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const resumePositionRef = useRef(0);
  const resumeTrackIdRef = useRef<string | null>(null);
  const lastPositionWriteRef = useRef(0);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const finishHandledRef = useRef(false);
  const repeatModeRef = useRef<RepeatMode>("shuffle");
  const nextRef = useRef<(auto?: boolean) => void>(() => undefined);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { positionRef.current = position; durationRef.current = duration; }, [position, duration]);

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(LAST_TRACK_KEY), AsyncStorage.getItem(LAST_POSITION_KEY)]).then(([saved, savedPosition]) => {
      if (savedPosition) resumePositionRef.current = Math.max(0, Number(savedPosition) || 0);
      if (!saved) return;
      try {
        const track = JSON.parse(saved) as QueueTrack;
        if (!track?.id || !track.source) return;
        lastTrackIdRef.current = track.id;
        resumeTrackIdRef.current = track.id;
        // The library may already have filled the queue by the time this async read finishes.
        // Overwriting it with a single track is what made next/previous/queue appear "stuck".
        const existing = queueRef.current;
        if (existing.length > 0) {
          const savedIndex = existing.findIndex((item) => item.id === track.id);
          if (savedIndex >= 0 && !playerRef.current) {
            currentIndexRef.current = savedIndex;
            setCurrentIndex(savedIndex);
          }
          return;
        }
        queueRef.current = [track];
        setQueue([track]);
        currentIndexRef.current = 0;
        setCurrentIndex(0);
      } catch { /* ignore invalid saved playback state */ }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(AUDIO_SETTINGS_KEY).then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<{ normalizeVolume: boolean; smoothTransitions: boolean; equalizerPreset: string; backgroundAudioEnabled: boolean; repeatMode: RepeatMode }>;
          if (typeof parsed.normalizeVolume === "boolean") setNormalizeVolumeState(parsed.normalizeVolume);
          if (typeof parsed.smoothTransitions === "boolean") setSmoothTransitionsState(parsed.smoothTransitions);
          if (typeof parsed.equalizerPreset === "string") setEqualizerPresetState(parsed.equalizerPreset);
          if (typeof parsed.backgroundAudioEnabled === "boolean") setBackgroundAudioEnabledState(parsed.backgroundAudioEnabled);
          if (parsed.repeatMode === "shuffle" || parsed.repeatMode === "all" || parsed.repeatMode === "one") setRepeatMode(parsed.repeatMode);
        } catch { /* use defaults */ }
      }
      setAudioSettingsHydrated(true);
    }).catch(() => setAudioSettingsHydrated(true));
  }, []);

  useEffect(() => {
    if (!audioSettingsHydrated) return;
    void AsyncStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ normalizeVolume, smoothTransitions, equalizerPreset, backgroundAudioEnabled, repeatMode })).catch(() => undefined);
  }, [audioSettingsHydrated, backgroundAudioEnabled, equalizerPreset, normalizeVolume, repeatMode, smoothTransitions]);

  useEffect(() => {
    if (!audioSettingsHydrated) return;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix", interruptionModeAndroid: "doNotMix", allowsRecording: false, shouldPlayInBackground: backgroundAudioEnabled, shouldRouteThroughEarpiece: false }).catch(() => undefined);
  }, [audioSettingsHydrated, backgroundAudioEnabled]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const stopPlayer = useCallback(() => {
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    fadeTimerRef.current = null;
    listenerRef.current?.remove();
    listenerRef.current = null;
    try { playerRef.current?.pause(); } catch { /* player may already be released */ }
    playerRef.current?.remove();
    playerRef.current = null;
    setIsPlaying(false);
    setIsBuffering(false);
    setPosition(0);
    setDuration(0);
  }, []);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      interruptionModeAndroid: "doNotMix",
      allowsRecording: false,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    }).catch(() => undefined);

    return () => stopPlayer();
  }, [stopPlayer]);

  const loadTrack = useCallback((index: number, autoplay: boolean) => {
    const track = queueRef.current[index];
    if (!track || !track.source) return;

    lastTrackIdRef.current = track.id;
    if (resumeTrackIdRef.current !== track.id) resumePositionRef.current = 0;
    void AsyncStorage.setItem(LAST_TRACK_KEY, JSON.stringify(track)).catch(() => undefined);

    stopPlayer();
    finishHandledRef.current = false;
    const player = createAudioPlayer(track.source, { updateInterval: 250, keepAudioSessionActive: true });
    playerRef.current = player;
    const targetVolume = (normalizeVolume ? 0.82 : 1) * (PRESET_GAIN[equalizerPreset] ?? 1);
    player.volume = smoothTransitions && autoplay ? 0 : targetVolume;
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setPosition(0);
    setDuration(0);
    setIsBuffering(true);
    setIsPlaying(autoplay);
    player.setActiveForLockScreen(true, {
      title: track.title,
      artist: track.artist,
      albumTitle: track.album,
    });
    listenerRef.current = player.addListener("playbackStatusUpdate", (nextStatus) => {
      if (nextStatus.didJustFinish && !finishHandledRef.current) {
        finishHandledRef.current = true;
        nextRef.current(true);
        return;
      }
      setPosition(nextStatus.currentTime);
      setDuration(nextStatus.duration);
      setIsPlaying(nextStatus.playing);
      setIsBuffering(nextStatus.isBuffering);
      if (nextStatus.isLoaded && resumePositionRef.current > 0 && nextStatus.duration > resumePositionRef.current) {
        void player.seekTo(resumePositionRef.current);
        resumePositionRef.current = 0;
        resumeTrackIdRef.current = null;
      }
      const now = Date.now();
      if (now - lastPositionWriteRef.current > 5000) {
        lastPositionWriteRef.current = now;
        void AsyncStorage.setItem(LAST_POSITION_KEY, String(Math.max(0, nextStatus.currentTime))).catch(() => undefined);
      }
    });

    if (autoplay) {
      player.play();
      if (smoothTransitions) {
        let step = 0;
        fadeTimerRef.current = setInterval(() => {
          step += 1;
          player.volume = Math.min(targetVolume, targetVolume * step / 7);
          if (step >= 7 && fadeTimerRef.current) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }
        }, 50);
      }
    }
  }, [equalizerPreset, normalizeVolume, smoothTransitions, stopPlayer]);

  const pushHistory = useCallback(() => {
    const currentId = queueRef.current[currentIndexRef.current]?.id;
    if (!currentId || !playerRef.current) return;
    const history = historyRef.current;
    if (history[history.length - 1] !== currentId) history.push(currentId);
    if (history.length > 100) history.shift();
  }, []);

  // `auto` = the song ended on its own. A manual tap on Next must always move to a different
  // song, even in repeat-one mode (repeat-one only applies when a song finishes by itself).
  const next = useCallback((auto = false) => {
    const mode = repeatModeRef.current;
    const effectiveMode: RepeatMode = !auto && mode === "one" ? "all" : mode;
    const nextIndex = getNextQueueIndex(currentIndexRef.current, queueRef.current.length, effectiveMode);
    if (nextIndex < 0) return;
    pushHistory();
    loadTrack(nextIndex, true);
  }, [loadTrack, pushHistory]);

  useEffect(() => { nextRef.current = next; }, [next]);

  const manualNext = useCallback(() => next(false), [next]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) {
      if (queueRef.current.length === 0) return;
      loadTrack(currentIndexRef.current, true);
      return;
    }
    if (isPlaying) {
      playerRef.current.pause();
      void AsyncStorage.setItem(LAST_POSITION_KEY, String(Math.max(0, positionRef.current))).catch(() => undefined);
    } else {
      if (durationRef.current > 0 && positionRef.current >= durationRef.current - 0.25) void playerRef.current.seekTo(0);
      playerRef.current.play();
    }
  }, [isPlaying, loadTrack]);

  const playTrack = useCallback((track: QueueTrack) => {
    const existingIndex = queueRef.current.findIndex((item) => item.id === track.id);
    if (existingIndex >= 0) {
      if (existingIndex !== currentIndexRef.current) pushHistory();
      loadTrack(existingIndex, true);
      return;
    }
    pushHistory();
    const nextQueue = [...queueRef.current, track];
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    loadTrack(nextQueue.length - 1, true);
  }, [loadTrack, pushHistory]);

  const replaceQueue = useCallback((tracks: QueueTrack[]) => {
    const previousId = queueRef.current[currentIndexRef.current]?.id;
    const preferredId = previousId || lastTrackIdRef.current;
    const nextIndex = preferredId ? tracks.findIndex((track) => track.id === preferredId) : -1;
    queueRef.current = tracks;
    setQueue(tracks);

    if (tracks.length === 0) {
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      stopPlayer();
      return;
    }

    if (nextIndex >= 0) {
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      return;
    }

    currentIndexRef.current = 0;
    setCurrentIndex(0);
    if (playerRef.current) stopPlayer();
  }, [stopPlayer]);

  const updateQueueTrack = useCallback((trackId: string, patch: Partial<QueueTrack>) => {
    const nextQueue = queueRef.current.map((track) => track.id === trackId ? { ...track, ...patch } : track);
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    const updated = nextQueue[currentIndexRef.current];
    if (updated && updated.id === trackId && playerRef.current) {
      playerRef.current.setActiveForLockScreen(true, {
        title: updated.title,
        artist: updated.artist,
        albumTitle: updated.album,
      });
    }
  }, []);

  const previous = useCallback(() => {
    const list = queueRef.current;
    if (list.length === 0) return;
    // Like most players: past the first few seconds, Previous restarts the song.
    if (playerRef.current && positionRef.current > 3) {
      void playerRef.current.seekTo(0);
      return;
    }
    // Walk back through what was actually played (works for shuffle too).
    while (historyRef.current.length > 0) {
      const id = historyRef.current.pop() as string;
      const index = list.findIndex((item) => item.id === id);
      if (index >= 0 && index !== currentIndexRef.current) {
        loadTrack(index, true);
        return;
      }
    }
    const previousIndex = (currentIndexRef.current - 1 + list.length) % list.length;
    loadTrack(previousIndex, true);
  }, [loadTrack]);

  const addToQueue = useCallback((track: QueueTrack) => {
    if (queueRef.current.some((item) => item.id === track.id)) return;
    const nextQueue = [...queueRef.current, track];
    queueRef.current = nextQueue;
    setQueue(nextQueue);
  }, []);

  const removeFromQueue = useCallback((trackId: string) => {
    if (queueRef.current.length <= 1) return;
    const removedIndex = queueRef.current.findIndex((item) => item.id === trackId);
    if (removedIndex < 0) return;
    const wasCurrent = removedIndex === currentIndexRef.current;
    const wasPlaying = isPlaying;
    const nextQueue = queueRef.current.filter((item) => item.id !== trackId);
    const nextIndex = removedIndex < currentIndexRef.current
      ? currentIndexRef.current - 1
      : Math.min(currentIndexRef.current, nextQueue.length - 1);
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);
    if (wasCurrent) loadTrack(nextIndex, wasPlaying);
  }, [isPlaying, loadTrack]);

  const clearQueue = useCallback(() => {
    const current = queueRef.current[currentIndexRef.current];
    if (!current) return;
    replaceQueue([current]);
  }, [replaceQueue]);

  const setBackgroundAudioEnabled = useCallback((enabled: boolean) => {
    setBackgroundAudioEnabledState(enabled);
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      interruptionModeAndroid: "doNotMix",
      allowsRecording: false,
      shouldPlayInBackground: enabled,
      shouldRouteThroughEarpiece: false,
    }).catch(() => undefined);
  }, []);

  const toggleRepeatMode = useCallback(() => {
    setRepeatMode((mode) => mode === "shuffle" ? "all" : mode === "all" ? "one" : "shuffle");
  }, []);

  const setNormalizeVolume = useCallback((enabled: boolean) => {
    setNormalizeVolumeState(enabled);
    if (playerRef.current) playerRef.current.volume = (enabled ? 0.82 : 1) * (PRESET_GAIN[equalizerPreset] ?? 1);
  }, [equalizerPreset]);
  const setSmoothTransitions = useCallback((enabled: boolean) => setSmoothTransitionsState(enabled), []);
  const setEqualizerPreset = useCallback((preset: string) => {
    setEqualizerPresetState(preset);
    if (playerRef.current) playerRef.current.volume = (normalizeVolume ? 0.82 : 1) * (PRESET_GAIN[preset] ?? 1);
  }, [normalizeVolume]);

  const seekTo = useCallback((seconds: number) => {
    const safeSeconds = Math.max(0, seconds);
    if (playerRef.current) void playerRef.current.seekTo(safeSeconds);
    setPosition(safeSeconds);
    void AsyncStorage.setItem(LAST_POSITION_KEY, String(safeSeconds)).catch(() => undefined);
  }, []);

  const value = useMemo<AudioPlayerContextValue>(() => ({
    queue,
    currentTrack: queue[currentIndex] ?? null,
    currentIndex,
    isPlaying,
    isBuffering,
    backgroundAudioEnabled,
    repeatMode,
    togglePlay,
    playTrack,
    next: manualNext,
    previous,
    addToQueue,
    replaceQueue,
    updateQueueTrack,
    removeFromQueue,
    clearQueue,
    setBackgroundAudioEnabled,
    toggleRepeatMode,
    normalizeVolume,
    smoothTransitions,
    equalizerPreset,
    setNormalizeVolume,
    setSmoothTransitions,
    setEqualizerPreset,
    seekTo,
  }), [addToQueue, backgroundAudioEnabled, clearQueue, currentIndex, equalizerPreset, isBuffering, isPlaying, manualNext, normalizeVolume, playTrack, previous, queue, removeFromQueue, repeatMode, replaceQueue, seekTo, setBackgroundAudioEnabled, setEqualizerPreset, setNormalizeVolume, setSmoothTransitions, smoothTransitions, togglePlay, toggleRepeatMode, updateQueueTrack]);

  const progress = useMemo<AudioProgressValue>(() => ({ position, duration }), [position, duration]);

  return (
    <AudioPlayerContext.Provider value={value}>
      <AudioProgressContext.Provider value={progress}>{children}</AudioProgressContext.Provider>
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayerController() {
  const context = useContext(AudioPlayerContext);
  if (!context) throw new Error("useAudioPlayerController must be used inside AudioPlayerProvider");
  return context;
}

export function useAudioProgress() {
  return useContext(AudioProgressContext);
}
