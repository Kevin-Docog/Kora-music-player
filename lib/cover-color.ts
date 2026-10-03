import { useEffect, useState } from "react";
import { Image } from "expo-image";

const BASE83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
const decode83 = (text: string) => {
  let value = 0;
  for (const char of text) value = value * 83 + BASE83.indexOf(char);
  return value;
};
const srgbToLinear = (value: number) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (value: number) => {
  const v = Math.max(0, Math.min(1, value));
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
};

/** Turns a blurhash string into a small grid of [r, g, b] pixels (0-255). Returns [] if the hash is invalid. */
export function blurhashToPixels(hash: string, width = 8, height = 8): Array<[number, number, number]> {
  if (!hash || hash.length < 6) return [];
  const sizeFlag = decode83(hash[0]);
  const numY = Math.floor(sizeFlag / 9) + 1;
  const numX = (sizeFlag % 9) + 1;
  if (hash.length !== 4 + 2 * numX * numY) return [];
  const maxValue = (decode83(hash[1]) + 1) / 166;
  const colors: Array<[number, number, number]> = [];
  for (let i = 0; i < numX * numY; i += 1) {
    if (i === 0) {
      const value = decode83(hash.substring(2, 6));
      colors.push([srgbToLinear(value >> 16), srgbToLinear((value >> 8) & 255), srgbToLinear(value & 255)]);
    } else {
      const value = decode83(hash.substring(4 + i * 2, 6 + i * 2));
      const q = (n: number) => { const x = (n - 9) / 9; return Math.sign(x) * x * x * maxValue; };
      colors.push([q(Math.floor(value / 361)), q(Math.floor(value / 19) % 19), q(value % 19)]);
    }
  }
  const pixels: Array<[number, number, number]> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < numY; j += 1) {
        for (let i = 0; i < numX; i += 1) {
          const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
          const c = colors[i + j * numX];
          r += c[0] * basis; g += c[1] * basis; b += c[2] * basis;
        }
      }
      pixels.push([linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]);
    }
  }
  return pixels;
}

function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = ((g - b) / 255 / d) % 6;
    else if (max === g / 255) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToHex(h: number, s: number, v: number) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Picks the most eye-catching color of the cover (not just the muddy average), as a glow-friendly hex. */
export function pickGlowColor(pixels: Array<[number, number, number]>): string | null {
  if (!pixels.length) return null;
  const scored = pixels
    .map(([r, g, b]) => ({ ...rgbToHsv(r, g, b), r, g, b }))
    .map((p) => ({ ...p, score: p.s * Math.min(1, p.v * 1.4) * (p.v < 0.2 ? 0 : 1) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.score < 0.12) {
    // Nearly grayscale cover: use the average brightness as a soft neutral glow.
    const avg = pixels.reduce((sum, [r, g, b]) => sum + (r + g + b) / 3, 0) / pixels.length;
    const level = Math.round(Math.max(110, Math.min(220, avg + 40))).toString(16).padStart(2, "0");
    return `#${level}${level}${level}`;
  }
  const top = scored.slice(0, 4).filter((p) => p.score > best.score * 0.6);
  // Average the hue of the strongest pixels, then make sure it is bright and colorful enough to glow.
  const h = top[0].h;
  const s = Math.min(1, Math.max(0.55, top.reduce((sum, p) => sum + p.s, 0) / top.length));
  const v = Math.min(1, Math.max(0.75, top.reduce((sum, p) => sum + p.v, 0) / top.length));
  return hsvToHex(h, s, v);
}

const cache = new Map<string, string>();

/** The glow color for a cover image. Starts as `fallback`, then switches to a color taken from the artwork. */
export function useCoverColor(artworkUri: string | undefined, fallback: string): string {
  const [color, setColor] = useState(() => (artworkUri && cache.get(artworkUri)) || fallback);
  useEffect(() => {
    if (!artworkUri) { setColor(fallback); return; }
    const cached = cache.get(artworkUri);
    if (cached) { setColor(cached); return; }
    setColor(fallback);
    let cancelled = false;
    (async () => {
      try {
        const generate = (Image as unknown as { generateBlurhashAsync?: (source: string, components: [number, number]) => Promise<string | null> }).generateBlurhashAsync;
        if (typeof generate !== "function") return;
        const hash = await generate(artworkUri, [4, 3]);
        const picked = hash ? pickGlowColor(blurhashToPixels(hash)) : null;
        if (picked) {
          cache.set(artworkUri, picked);
          if (!cancelled) setColor(picked);
        }
      } catch {
        /* keep the fallback color */
      }
    })();
    return () => { cancelled = true; };
  }, [artworkUri, fallback]);
  return color;
}
