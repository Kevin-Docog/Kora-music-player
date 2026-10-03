import { memo, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

import { tapHaptic } from "@/components/fx";

export const ALPHABET = ["#", ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))];

/** "#" for titles that don't start with a letter (numbers, symbols), otherwise the capital first letter without accents. */
export function getAlphabetLetter(title: string): string {
  const first = (title || "").trim().charAt(0).normalize("NFD").charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

/** Index of the first song for each letter. */
export function buildLetterIndex(titles: readonly string[]): Record<string, number> {
  const index: Record<string, number> = {};
  titles.forEach((title, position) => {
    const letter = getAlphabetLetter(title);
    if (index[letter] === undefined) index[letter] = position;
  });
  return index;
}

type AlphabetRailProps = {
  /** Letters that have at least one song (others are dimmed). */
  available: Record<string, number>;
  onSelect: (letter: string) => void;
  /** Space kept free above and below the rail (for the header area and the mini player). */
  top?: number;
  bottom?: number;
};

/** A–Z strip on the right edge. Tap or slide a finger along it to jump to that letter. */
export const AlphabetRail = memo(function AlphabetRail({ available, onSelect, top = 150, bottom = 150 }: AlphabetRailProps) {
  const [touchedLetter, setTouchedLetter] = useState<string | null>(null);
  const heightRef = useRef(1);
  const lastLetterRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const pickFromY = (y: number) => {
    const ratio = Math.min(0.999, Math.max(0, y / heightRef.current));
    const letter = ALPHABET[Math.floor(ratio * ALPHABET.length)];
    if (letter === lastLetterRef.current) return;
    lastLetterRef.current = letter;
    setTouchedLetter(letter);
    tapHaptic("select");
    onSelectRef.current(letter);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => pickFromY(event.nativeEvent.locationY),
        onPanResponderMove: (event) => pickFromY(event.nativeEvent.locationY),
        onPanResponderRelease: () => { lastLetterRef.current = null; setTouchedLetter(null); },
        onPanResponderTerminate: () => { lastLetterRef.current = null; setTouchedLetter(null); },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <>
      {touchedLetter ? (
        <View pointerEvents="none" style={[styles.bubbleWrap, { top, bottom }]}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{touchedLetter}</Text>
          </View>
        </View>
      ) : null}
      <View
        {...panResponder.panHandlers}
        onLayout={(event) => { heightRef.current = Math.max(1, event.nativeEvent.layout.height); }}
        style={[styles.rail, { top, bottom }]}
      >
        {ALPHABET.map((letter) => (
          <View key={letter} pointerEvents="none" style={styles.letterCell}>
            <Text style={[styles.letter, available[letter] === undefined && styles.letterDim, touchedLetter === letter && styles.letterActive]}>{letter}</Text>
          </View>
        ))}
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  rail: { position: "absolute", right: 0, width: 20, alignItems: "center", justifyContent: "space-between", zIndex: 10 },
  letterCell: { flex: 1, width: 20, alignItems: "center", justifyContent: "center" },
  letter: { color: "#c8f34a", fontSize: 10, fontWeight: "800" },
  letterDim: { color: "#5b626b", fontWeight: "600" },
  letterActive: { color: "#ffffff", fontSize: 13 },
  bubbleWrap: { position: "absolute", right: 34, left: 0, alignItems: "flex-end", justifyContent: "center", zIndex: 11 },
  bubble: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#c8f34a", alignItems: "center", justifyContent: "center" },
  bubbleText: { color: "#0a0b0d", fontSize: 32, fontWeight: "900" },
});
