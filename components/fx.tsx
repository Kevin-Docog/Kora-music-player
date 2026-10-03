import { memo, useEffect, useRef, type ReactNode } from "react";
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/** Small vibration for taps. Never throws (some devices have no haptics). */
export function tapHaptic(kind: "light" | "medium" | "select" = "light") {
  try {
    if (kind === "select") void Haptics.selectionAsync();
    else void Haptics.impactAsync(kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* ignore */
  }
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: "light" | "medium" | "select";
};

/** Drop-in replacement for Pressable that shrinks slightly while pressed (with optional vibration). */
export function PressScale({ style, scaleTo = 0.96, haptic, onPressIn, onPressOut, children, ...rest }: PressScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320 });
        if (haptic) tapHaptic(haptic);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children as ReactNode}
    </AnimatedPressable>
  );
}

/** Pops (grows then settles) whenever `active` turns on. Used for the favorite heart. */
export function HeartPop({ active, children }: { active: boolean; children: ReactNode }) {
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (active) scale.value = withSequence(withSpring(1.45, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10, stiffness: 260 }));
    else scale.value = withSequence(withTiming(0.8, { duration: 90 }), withSpring(1));
  }, [active, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function EqBar({ playing, color, delay, max }: { playing: boolean; color: string; delay: number; max: number }) {
  const height = useSharedValue(max * 0.35);
  useEffect(() => {
    if (playing) {
      height.value = withDelay(delay, withRepeat(withSequence(
        withTiming(max, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        withTiming(max * 0.25, { duration: 360, easing: Easing.inOut(Easing.quad) }),
      ), -1, false));
    } else {
      cancelAnimation(height);
      height.value = withTiming(max * 0.35, { duration: 200 });
    }
    return () => cancelAnimation(height);
  }, [playing, delay, max, height]);
  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: color }, animatedStyle]} />;
}

/** Three little bars that dance while a song plays. */
export const EqBars = memo(function EqBars({ playing, color = "#c8f34a", size = 14 }: { playing: boolean; color?: string; size?: number }) {
  return (
    <View style={{ height: size, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
      <EqBar playing={playing} color={color} delay={0} max={size} />
      <EqBar playing={playing} color={color} delay={140} max={size} />
      <EqBar playing={playing} color={color} delay={70} max={size} />
    </View>
  );
});

/** Softly breathing wrapper (scale pulse) used for the play button while music plays. */
export function Pulse({ active, children, style }: { active: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (active) {
      scale.value = withRepeat(withSequence(
        withTiming(1.07, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ), -1, false);
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 200 });
    }
    return () => cancelAnimation(scale);
  }, [active, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** Shimmering placeholder block shown while content loads. */
export function Skeleton({ width, height, radius = 10, style }: { width?: number | `${number}%`; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.35);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(
      withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }),
    ), -1, false);
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: "#2a3037" }, style, animatedStyle]} />;
}

/** A few placeholder song rows, shown while the library is loading or scanning. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <View style={{ gap: 14, paddingTop: 8 }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Skeleton width={52} height={52} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={index % 2 ? "58%" : "72%"} height={13} />
            <Skeleton width={index % 2 ? "38%" : "46%"} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Tab bar icon that bounces when its tab becomes active. */
export function BounceIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (focused) {
      scale.value = withSequence(withTiming(0.8, { duration: 80 }), withSpring(1.18, { damping: 6, stiffness: 300 }), withSpring(1, { damping: 10 }));
      lift.value = withSequence(withTiming(-5, { duration: 110 }), withSpring(0, { damping: 8, stiffness: 260 }));
    }
  }, [focused, scale, lift]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }, { scale: scale.value }] }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
