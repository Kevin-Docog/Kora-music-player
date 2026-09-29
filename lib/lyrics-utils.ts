export type LyricLine = { time: number; text: string };

export function getActiveLyricIndex(lines: LyricLine[] | undefined, position: number) {
  if (!lines?.length) return -1;
  let activeIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= position + 0.05) activeIndex = index;
    else break;
  }
  return activeIndex;
}
