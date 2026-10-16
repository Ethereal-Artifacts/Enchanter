// @ts-nocheck
/**
 * Enchanter - Color Theory
 *
 * Handles all color generation and processing for visual effects:
 * - Provides color scheme generation using color theory principles
 * - Implements various color harmonies (complementary, triadic, analogous, etc.)
 * - Manages HSB to RGB color conversions
 * - Generates derived colors from base colors according to selected schemes
 * - Exports color utilities used throughout the application
 */

import { HSB, RGB } from '../types.js';

type ColorSchemeFunction = (baseH: number, baseS: number, baseB: number) => HSB[];

/**
 * Converts HSB (Hue, Saturation, Brightness) color to RGB.
 *
 * @param h Hue value (0-360)
 * @param s Saturation value (0-100)
 * @param b Brightness value (0-100)
 * @returns RGB color object with alpha = 1
 */
export function hsbToRgb(h: number, s: number, b: number): RGB {
  s /= 100;
  b /= 100;
  const c = b * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = b - c;
  let r1: number, g1: number, b1: number;

  if (h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a: 1
  };
}

/**
 * Converts RGB color to HSB.
 *
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @returns HSB color object
 */
export function rgbToHsb(r: number, g: number, b: number): HSB {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = Math.round(h * 60);
  }

  return {
    h,
    s: Math.round(s * 100),
    b: Math.round(v * 100)
  };
}

/**
 * Interpolates between two colors in RGB space.
 *
 * @param color1 Starting RGB color
 * @param color2 Ending RGB color
 * @param t Interpolation factor (0-1)
 * @returns Interpolated RGB color
 */
export function interpolateRgb(color1: RGB, color2: RGB, t: number): RGB {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * t),
    g: Math.round(color1.g + (color2.g - color1.g) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t),
    a: color1.a + (color2.a - color1.a) * t
  };
}

/**
 * Interpolates between two colors in HSB space (better for visual transitions).
 *
 * @param color1 Starting HSB color
 * @param color2 Ending HSB color
 * @param t Interpolation factor (0-1)
 * @returns Interpolated HSB color
 */
export function interpolateHsb(color1: HSB, color2: HSB, t: number): HSB {
  // Handle hue interpolation across the color wheel
  let h1 = color1.h;
  let h2 = color2.h;

  // Ensure shortest path around the color wheel
  if (Math.abs(h2 - h1) > 180) {
    if (h1 < h2) {
      h1 += 360;
    } else {
      h2 += 360;
    }
  }

  return {
    h: Math.round((h1 + (h2 - h1) * t) % 360),
    s: Math.round(color1.s + (color2.s - color1.s) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t)
  };
}

/**
 * Generates a CSS color string from an RGB color.
 *
 * @param color RGB color object
 * @returns CSS rgba string
 */
export function rgbToCss(color: RGB): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

/**
 * Adjusts the brightness of an RGB color.
 *
 * @param color RGB color to adjust
 * @param factor Factor to multiply brightness by (>1 brightens, <1 darkens)
 * @returns Adjusted RGB color
 */
export function adjustBrightness(color: RGB, factor: number): RGB {
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r * factor))),
    g: Math.min(255, Math.max(0, Math.round(color.g * factor))),
    b: Math.min(255, Math.max(0, Math.round(color.b * factor))),
    a: color.a
  };
}

const colorSchemes: Record<string, ColorSchemeFunction> = {
    // Standard Schemes
    analogous: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 30) % 360, s: baseS, b: baseB },
      { h: (baseH - 30 + 360) % 360, s: baseS, b: baseB }
    ],
    complementary: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 180) % 360, s: baseS, b: baseB }
    ],
    triadic: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 120) % 360, s: baseS, b: baseB },
      { h: (baseH + 240) % 360, s: baseS, b: baseB }
    ],
    tetradic: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 90) % 360, s: baseS, b: baseB },
      { h: (baseH + 180) % 360, s: baseS, b: baseB },
      { h: (baseH + 270) % 360, s: baseS, b: baseB }
    ],
    monochromatic: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: baseH, s: baseS, b: Math.min(baseB + 20, 100) },
      { h: baseH, s: baseS, b: Math.max(baseB - 20, 0) }
    ],
    pastel: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.max(baseS - 40, 0), b: Math.min(baseB + 30, 100) },
      { h: (baseH + 30) % 360, s: Math.max(baseS - 40, 0), b: Math.min(baseB + 30, 100) },
      { h: (baseH - 30 + 360) % 360, s: Math.max(baseS - 40, 0), b: Math.min(baseB + 30, 100) }
    ],
    neon: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.min(baseS + 40, 100), b: baseB },
      { h: (baseH + 120) % 360, s: Math.min(baseS + 40, 100), b: baseB },
      { h: (baseH + 240) % 360, s: Math.min(baseS + 40, 100), b: baseB }
    ],
    dark: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: Math.max(baseB - 30, 0) },
      { h: (baseH + 60) % 360, s: baseS, b: Math.max(baseB - 30, 0) },
      { h: (baseH + 300) % 360, s: baseS, b: Math.max(baseB - 30, 0) }
    ],
    vibrant: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.min(baseS + 20, 100), b: Math.min(baseB + 10, 100) },
      { h: (baseH + 40) % 360, s: Math.min(baseS + 20, 100), b: Math.min(baseB + 10, 100) },
      { h: (baseH - 40 + 360) % 360, s: Math.min(baseS + 20, 100), b: Math.min(baseB + 10, 100) }
    ],
    muted: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.max(baseS - 50, 0), b: baseB }
    ],
    clash: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 160) % 360, s: baseS, b: baseB }
    ],
    metallic: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.max(baseS - 30, 0), b: Math.max(baseB - 10, 0) },
      { h: baseH, s: Math.max(baseS - 50, 0), b: baseB }
    ],
    earthy: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.max(baseS - 60, 0), b: baseB }
    ],
    gradient: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: baseH, s: baseS, b: Math.min(baseB + 20, 100) },
      { h: baseH, s: baseS, b: Math.min(baseB + 40, 100) }
    ],
    // Extended Schemes
    pentatonic: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 5; i++) {
        arr.push({ h: (baseH + i * 72) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    hexatonic: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 6; i++) {
        arr.push({ h: (baseH + i * 60) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    heptatonic: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 7; i++) {
        arr.push({ h: (baseH + i * (360 / 7)) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    octatonic: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 8; i++) {
        arr.push({ h: (baseH + i * 45) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    nonatonic: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 9; i++) {
        arr.push({ h: (baseH + i * 40) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    spectrum: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 10; i++) {
        arr.push({ h: (baseH + i * 36) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    "analogous-complementary": (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 30) % 360, s: baseS, b: baseB },
      { h: (baseH + 180) % 360, s: baseS, b: baseB },
      { h: (baseH + 150) % 360, s: baseS, b: baseB }
    ],
    "double-split-complementary": (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 150) % 360, s: baseS, b: baseB },
      { h: (baseH + 210) % 360, s: baseS, b: baseB },
      { h: (baseH + 330) % 360, s: baseS, b: baseB },
      { h: (baseH + 30) % 360, s: baseS, b: baseB }
    ],
    "complementary-triadic": (baseH, baseS, baseB) => {
      const comp = (baseH + 180) % 360;
      return [
        { h: baseH, s: baseS, b: baseB },
        { h: comp, s: baseS, b: baseB },
        { h: (baseH + 120) % 360, s: baseS, b: baseB },
        { h: (baseH + 240) % 360, s: baseS, b: baseB }
      ];
    },
    duotone: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: baseH, s: Math.max(baseS - 20, 0), b: Math.min(baseB + 20, 100) }
    ],
    tritone: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: baseH, s: Math.min(baseS + 20, 100), b: baseB },
      { h: baseH, s: Math.max(baseS - 20, 0), b: baseB }
    ],
    "double analogous": (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: (baseH + 20) % 360, s: baseS, b: baseB },
      { h: (baseH - 20 + 360) % 360, s: baseS, b: baseB },
      { h: (baseH + 40) % 360, s: baseS, b: baseB },
      { h: (baseH - 40 + 360) % 360, s: baseS, b: baseB }
    ],
    sequential: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 5; i++) {
        const newB = Math.min(baseB + i * ((100 - baseB) / 4), 100);
        arr.push({ h: baseH, s: baseS, b: newB });
      }
      return arr;
    },
    diverging: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = -2; i <= 2; i++) {
        const newB = Math.max(0, Math.min(baseB + i * 20, 100));
        arr.push({ h: baseH, s: baseS, b: newB });
      }
      return arr;
    },
    cyclic: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 12; i++) {
        arr.push({ h: (baseH + i * 30) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    achromatic: (baseH, baseS, baseB) => {
      return [10, 30, 50, 70, 90].map(b => ({ h: 0, s: 0, b }));
    },
    accent: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: 0, s: 0, b: 90 },
      { h: 0, s: 0, b: 10 },
      { h: (baseH + 180) % 360, s: baseS, b: baseB }
    ],
    subtle: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.max(baseS - 30, 0), b: baseB },
      { h: (baseH + 10) % 360, s: Math.max(baseS - 30, 0), b: Math.min(baseB + 10, 100) },
      { h: (baseH - 10 + 360) % 360, s: Math.max(baseS - 30, 0), b: Math.max(baseB - 10, 0) }
    ],
    "high-contrast": (baseH, baseS, baseB) => [
      { h: baseH, s: 100, b: baseB },
      { h: baseH, s: 100, b: Math.min(baseB + 20, 100) },
      { h: baseH, s: 100, b: Math.max(baseB - 20, 0) }
    ],
    vintage: (baseH, baseS, baseB) => [
      { h: baseH, s: Math.max(baseS - 40, 0), b: 50 },
      { h: baseH, s: Math.max(baseS - 40, 0), b: 40 },
      { h: baseH, s: Math.max(baseS - 40, 0), b: 60 }
    ],
    retro: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 4; i++) {
        arr.push({ h: (baseH + i * 40) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    minimalist: (baseH, baseS, baseB) => [
      { h: baseH, s: baseS, b: baseB },
      { h: 0, s: 0, b: 100 },
      { h: 0, s: 0, b: 0 }
    ],
    "double-triadic": (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 3; i++) {
        arr.push({ h: (baseH + i * 120) % 360, s: baseS, b: baseB });
        arr.push({ h: (baseH + 60 + i * 120) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    "quadruple-split": (baseH, baseS, baseB) => {
      return [
        { h: baseH, s: baseS, b: baseB },
        { h: (baseH + 135) % 360, s: baseS, b: baseB },
        { h: (baseH + 180) % 360, s: baseS, b: baseB },
        { h: (baseH + 225) % 360, s: baseS, b: baseB },
        { h: (baseH + 315) % 360, s: baseS, b: baseB }
      ];
    },
    "jewel-tone": (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 4; i++) {
        arr.push({ h: (baseH + i * 90) % 360, s: Math.min(baseS + 20, 100), b: 50 });
      }
      return arr;
    },
    "pastel-gradient": (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 5; i++) {
        arr.push({
          h: baseH,
          s: Math.max(baseS - 40, 0),
          b: Math.min(baseB + i * (((100 - baseB) / 4) + 10), 100)
        });
      }
      return arr;
    },
    colorful: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 7; i++) {
        arr.push({ h: (baseH + i * (360 / 7)) % 360, s: baseS, b: baseB });
      }
      return arr;
    },
    "complementary-monochrome": (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = -1; i <= 1; i++) {
        arr.push({ h: baseH, s: baseS, b: Math.max(0, Math.min(baseB + i * 15, 100)) });
        arr.push({ h: (baseH + 180) % 360, s: baseS, b: Math.max(0, Math.min(baseB + i * 15, 100)) });
      }
      return arr;
    },
    "analogous-gradient": (baseH, baseS, baseB) => {
      return [
        { h: (baseH - 30 + 360) % 360, s: baseS, b: baseB },
        { h: (baseH - 15 + 360) % 360, s: baseS, b: baseB },
        { h: baseH, s: baseS, b: baseB },
        { h: (baseH + 15) % 360, s: baseS, b: baseB },
        { h: (baseH + 30) % 360, s: baseS, b: baseB }
      ];
    },
    "earthy-vintage": (baseH, baseS, baseB) => [
      { h: baseH, s: Math.max(baseS - 40, 0), b: Math.max(baseB - 10, 0) },
      { h: baseH, s: Math.max(baseS - 40, 0), b: baseB },
      { h: baseH, s: Math.max(baseS - 40, 0), b: Math.min(baseB + 10, 100) }
    ],
    "neon-gradient": (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = 0; i < 3; i++) {
        arr.push({
          h: baseH,
          s: Math.min(baseS + 40, 100),
          b: Math.max(0, Math.min(baseB + i * 10, 100))
        });
      }
      return arr;
    },
    saturated: (baseH, baseS, baseB) => {
      const arr: HSB[] = [];
      for (let i = -1; i <= 1; i++) {
        arr.push({ h: (baseH + i * 20 + 360) % 360, s: 100, b: baseB });
      }
      return arr;
    },
    // Special themed schemes:
    "cyberpunk-themed": (baseH, baseS, baseB) => [
      { h: 320, s: 90, b: 50 },
      { h: 210, s: 90, b: 50 },
      { h: 140, s: 90, b: 50 },
      { h: 190, s: 90, b: 50 },
      { h: 280, s: 90, b: 50 }
    ],
    "burning-man-themed": (baseH, baseS, baseB) => [
      { h: 5, s: 85, b: 50 },
      { h: 25, s: 80, b: 50 },
      { h: 15, s: 70, b: 40 },
      { h: 40, s: 40, b: 70 },
      { h: 45, s: 70, b: 55 }
    ]
  };

  export function getDerivedColors(baseH: number, baseS: number, baseB: number, scheme: string = "analogous"): HSB[] {
    const fn = colorSchemes[scheme.toLowerCase()] || colorSchemes.analogous;
    return fn(baseH, baseS, baseB);
  }

  export const availableSchemes: string[] = Object.keys(colorSchemes);
