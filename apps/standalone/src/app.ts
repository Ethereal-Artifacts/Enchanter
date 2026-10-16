// @ts-nocheck
/**
 * Enchanter - Main Application
 *
 * Entry point for the application that initializes all core components:
 * - Sets up the canvas and grid system
 * - Creates and manages the simulation algorithms
 * - Handles color generation and processing
 * - Initializes UI components, parameters and macros
 * - Manages the animation loop and timing
 */

// File: app.ts
import { config, Config } from '@ethereal/enchanter-core/config';
import { grimoire } from './data.js';
import { GridManager } from '@ethereal/enchanter-core/utils/gridManager';
import { TickManager } from '@ethereal/enchanter-core/utils/tickManager';
import { setupKeyControls } from './utils/keys.js';
import { Kaleidoscope } from '@ethereal/enchanter-core/algorithms/kaleidoscope';
import { EquilibriumManager } from '@ethereal/enchanter-core/utils/equilibriumManager';
import { setupUI, parameterSliders, PARAM_DEFINITIONS, syncCreatorPreset } from './utils/uiManager.js';
import { setupMacrosUI, macros, setLoadedPresetName } from './utils/macrosUI.js';
import {
  getDerivedColors,
  hsbToRgb,
  interpolateRgb,
  rgbToCss
} from '@ethereal/enchanter-core/utils/colorTheory';
import { Cell, HSB, RGB } from '@ethereal/enchanter-core/types';
import { presetManager } from './utils/presetManager.js';
import {
  ELEMENTS,
  type ElementId
} from './utils/spellCatalog.js';
import {
  armCircleRevealMask,
  circleRevealDecayBoost,
  circleRevealSeeds,
  circleRevealSpawnMask,
  completeCircleRevealImmediate,
  sampleCircleReveal,
  startCircleReveal as beginCircleReveal,
  visibleCanvasRect,
  tickCircleReveal,
  isCircleRevealComplete
} from './circleReveal.js';

let gm: GridManager;
let kaleidoscope: Kaleidoscope;
const equilibriumManager = new EquilibriumManager();
const tickManager = new TickManager();

let renderLoopId = 0;
let lastFrameAt = 0;
/** Soft hold — skip simulation steps; tick clock stays running. */
let manifestationHeld = false;
let manifestationPausedAt: number | null = null;
/** True from circle start until its spawn mask is released. */
let revealMasking = false;

/** Gradual tick-rate rush (filter / preset) — never stop/restart the clock. */
type TickRamp = {
  from: number;
  peak: number;
  to: number;
  startedAt: number;
  upMs: number;
  holdMs: number;
  downMs: number;
};
let tickRamp: TickRamp | null = null;
/** Full rush duration: climb → brief hold → release. */
const TICK_RUSH_TOTAL_MS = 3000;
const TICK_RUSH_UP_MS = 1100;
const TICK_RUSH_HOLD_MS = 200;
const TICK_RUSH_DOWN_MS = TICK_RUSH_TOTAL_MS - TICK_RUSH_UP_MS - TICK_RUSH_HOLD_MS;

function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Quint easing keeps acceleration continuous into and out of the peak hold. */
function easeInOutQuint(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2;
}

function clampTickRate(rate: number): number {
  return Math.max(config.minTickRate, Math.min(config.maxTickRate, rate));
}

/**
 * Surge tick rate to the ceiling over ~3s, then ease back to `releaseTo`
 * (defaults to the current resting rate). Re-clicking restarts the rush;
 * if one is already running, release still aims at that rush’s rest target.
 */
export function rushTickRate(releaseTo?: number): void {
  if (tickManager.isTempoOwningTiming()) {
    tickRamp = null;
    return;
  }
  const rest = clampTickRate(
    releaseTo ?? (tickRamp ? tickRamp.to : config.tickRate)
  );
  tickRamp = {
    from: clampTickRate(config.tickRate),
    peak: config.maxTickRate,
    to: rest,
    startedAt: performance.now(),
    upMs: TICK_RUSH_UP_MS,
    holdMs: TICK_RUSH_HOLD_MS,
    downMs: TICK_RUSH_DOWN_MS
  };
}

function stepTickRamp(nowMs: number = performance.now()): void {
  if (!tickRamp) return;
  if (tickManager.isTempoOwningTiming()) {
    tickRamp = null;
    return;
  }
  const { from, peak, to, startedAt, upMs, holdMs, downMs } = tickRamp;
  const elapsed = nowMs - startedAt;
  let rate: number;
  if (upMs > 0 && elapsed < upMs) {
    rate = from + (peak - from) * easeInOutQuint(elapsed / upMs);
  } else if (elapsed < upMs + holdMs) {
    rate = peak;
  } else if (downMs > 0 && elapsed < upMs + holdMs + downMs) {
    rate = peak + (to - peak) * easeInOutQuint((elapsed - upMs - holdMs) / downMs);
  } else {
    rate = to;
    tickRamp = null;
  }
  config.tickRate = clampTickRate(rate);
}

/** Independently selected Element maps from the shell (empty = none). */
let selectedElementPool: ElementId[] = [];
/** Palette currently displayed, including an active member of the random pool. */
let activeElement: ElementId | null = null;
let onActiveElement: ((element: ElementId) => void) | undefined;

/** Pixel origin of the cell grid inside the canvas bitmap (centers leftover). */
let gridOriginX = 0;
let gridOriginY = 0;

/** Even floor — kaleidoscope mirrors halves; odd cols/rows leave a dead strip and shift the axis. */
function evenFloor(n: number): number {
  const v = Math.floor(n);
  return v - (v % 2);
}

function createSimulation(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = config.canvasWidth;
  canvas.height = config.canvasHeight;

  const cell = config.cellSize;
  const rows = evenFloor(config.canvasHeight / cell);
  const cols = evenFloor(config.canvasWidth / cell);
  gridOriginX = Math.floor((config.canvasWidth - cols * cell) / 2);
  gridOriginY = Math.floor((config.canvasHeight - rows * cell) / 2);

  gm = new GridManager(rows, cols);
  kaleidoscope = new Kaleidoscope(
    Math.floor(rows / 4),
    Math.floor(cols / 4),
    gm.getCells(),
    rows,
    cols,
    gm
  );
}

let pinnedColors: HSB[] | null = null;
/**
 * Smooth reagent morph — live cells RGB-blend into the destination map.
 * The pin stays on the from-map until the morph ends (no HSB/scheme mid-colors).
 */
let colorMorphFrom: HSB[] | null = null;
let colorMorphTo: HSB[] | null = null;
let colorMorphStartedAt = 0;
let clearPinAfterMorph = false;
/**
 * Per-cell morph endpoints: live cell color → destination map color.
 * Never snap to a from-swatch (that reads as a pick, not a blend).
 */
let cellMorphActive: Uint8Array | null = null;
let cellMorphFromR: Float32Array | null = null;
let cellMorphFromG: Float32Array | null = null;
let cellMorphFromB: Float32Array | null = null;
let cellMorphToR: Float32Array | null = null;
let cellMorphToG: Float32Array | null = null;
let cellMorphToB: Float32Array | null = null;
let cellMorphCols = 0;
const COLOR_MORPH_MS = 900;

function updateDerivedColors(): void {
  if (pinnedColors && pinnedColors.length > 0) {
    config.derivedColors = pinnedColors.map((c) => ({ ...c }));
    return;
  }
  const cs = config.colorSettings;
  config.derivedColors = getDerivedColors(cs.baseH, 100, cs.baseB, cs.scheme)
    .map((color) => ({ ...color, s: 100 }));
}

function paletteToHsbList(palette: {
  baseH?: number;
  baseS?: number;
  baseB?: number;
  scheme?: string;
  colors?: HSB[];
}): HSB[] {
  // Reagent maps: use authored swatches only — do not recalculate via scheme.
  if (palette.colors && palette.colors.length > 0) {
    return palette.colors.map((c) => ({ h: c.h, s: c.s, b: c.b }));
  }
  if (
    palette.baseH !== undefined &&
    palette.baseS !== undefined &&
    palette.baseB !== undefined
  ) {
    return [{ h: palette.baseH, s: palette.baseS, b: palette.baseB }];
  }
  const cs = config.colorSettings;
  return [{ h: cs.baseH, s: cs.baseS, b: cs.baseB }];
}

function nearestPaletteIndex(color: RGB, paletteRgb: RGB[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < paletteRgb.length; i += 1) {
    const p = paletteRgb[i]!;
    const d =
      (color.r - p.r) * (color.r - p.r) +
      (color.g - p.g) * (color.g - p.g) +
      (color.b - p.b) * (color.b - p.b);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function clearCellMorphBuffers(): void {
  cellMorphActive = null;
  cellMorphFromR = null;
  cellMorphFromG = null;
  cellMorphFromB = null;
  cellMorphToR = null;
  cellMorphToG = null;
  cellMorphToB = null;
  cellMorphCols = 0;
}

/** Capture each live cell’s real color → nearest swatch on the destination map. */
function captureCellMorphEndpoints(toPalette: HSB[]): void {
  clearCellMorphBuffers();
  if (!gm || toPalette.length === 0) return;
  const rows = gm.getRows();
  const cols = gm.getCols();
  const cells = gm.getCells();
  const toRgb = toPalette.map((c) => hsbToRgb(c.h, c.s, c.b));
  const n = rows * cols;
  const active = new Uint8Array(n);
  const fromR = new Float32Array(n);
  const fromG = new Float32Array(n);
  const fromB = new Float32Array(n);
  const toR = new Float32Array(n);
  const toG = new Float32Array(n);
  const toB = new Float32Array(n);
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const cell = cells[i]![j]!;
      if (cell.state !== 1 || !cell.color || cell.color.a <= 0) continue;
      const k = i * cols + j;
      const dest = toRgb[nearestPaletteIndex(cell.color, toRgb)]!;
      active[k] = 1;
      fromR[k] = cell.color.r;
      fromG[k] = cell.color.g;
      fromB[k] = cell.color.b;
      toR[k] = dest.r;
      toG[k] = dest.g;
      toB[k] = dest.b;
    }
  }
  cellMorphActive = active;
  cellMorphFromR = fromR;
  cellMorphFromG = fromG;
  cellMorphFromB = fromB;
  cellMorphToR = toR;
  cellMorphToG = toG;
  cellMorphToB = toB;
  cellMorphCols = cols;
}

function paintCellsAlongMorph(t: number): void {
  if (
    !gm ||
    !cellMorphActive ||
    !cellMorphFromR ||
    !cellMorphFromG ||
    !cellMorphFromB ||
    !cellMorphToR ||
    !cellMorphToG ||
    !cellMorphToB ||
    cellMorphCols <= 0
  ) {
    return;
  }
  const cells = gm.getCells();
  const rows = gm.getRows();
  const cols = cellMorphCols;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const k = i * cols + j;
      if (!cellMorphActive[k]) continue;
      const cell = cells[i]![j]!;
      if (cell.state !== 1 || !cell.color) continue;
      const rgb = interpolateRgb(
        {
          r: cellMorphFromR[k]!,
          g: cellMorphFromG[k]!,
          b: cellMorphFromB[k]!,
          a: 1
        },
        {
          r: cellMorphToR[k]!,
          g: cellMorphToG[k]!,
          b: cellMorphToB[k]!,
          a: 1
        },
        t
      );
      cell.color = { r: rgb.r, g: rgb.g, b: rgb.b, a: cell.color.a };
    }
  }
}

function beginColorMorph(target: HSB[], opts?: { clearPinWhenDone?: boolean }): void {
  const from =
    pinnedColors && pinnedColors.length > 0
      ? pinnedColors.map((c) => ({ ...c }))
      : (config.derivedColors ?? target).map((c) => ({ ...c }));
  colorMorphFrom = from.length ? from : target.map((c) => ({ ...c }));
  colorMorphTo = target.map((c) => ({ ...c }));
  colorMorphStartedAt = performance.now();
  clearPinAfterMorph = Boolean(opts?.clearPinWhenDone);
  // Hold the from-map pin for the whole morph — new growth must not sample
  // invented mid-hues between reagent maps.
  pinnedColors = colorMorphFrom.map((c) => ({ ...c }));
  if (pinnedColors[0]) {
    config.colorSettings.baseH = pinnedColors[0].h;
    config.colorSettings.baseS = pinnedColors[0].s;
    config.colorSettings.baseB = pinnedColors[0].b;
  }
  captureCellMorphEndpoints(colorMorphTo);
  updateDerivedColors();
}

function stepColorMorph(): void {
  if (!colorMorphFrom || !colorMorphTo) return;
  const t = Math.min(1, (performance.now() - colorMorphStartedAt) / COLOR_MORPH_MS);
  const eased = easeInOutCubic(t);
  // Live pixels only — RGB blend into destination swatches. Never HSB-lerp
  // the maps (that calculates colors that exist in neither reagent).
  paintCellsAlongMorph(eased);
  if (t < 1) return;
  if (clearPinAfterMorph) {
    pinnedColors = null;
    clearPinAfterMorph = false;
    // The departing Reagent temporarily owned the base settings during the
    // morph. Restore the preset before deriving subsequent unbound colors.
    const settings = presetManager.getPresetDefinition(activePresetName)?.config?.colorSettings;
    if (settings) Object.assign(config.colorSettings, settings);
  } else {
    pinnedColors = colorMorphTo.map((c) => ({ ...c }));
    if (pinnedColors[0]) {
      config.colorSettings.baseH = pinnedColors[0].h;
      config.colorSettings.baseS = pinnedColors[0].s;
      config.colorSettings.baseB = pinnedColors[0].b;
    }
  }
  colorMorphFrom = null;
  colorMorphTo = null;
  clearCellMorphBuffers();
  updateDerivedColors();
}

type ReagentPalette = {
  baseH?: number;
  baseS?: number;
  baseB?: number;
  scheme?: string;
  colors?: HSB[];
};

/** Cached Element Reagent palettes for home-screen map swaps. */
const reagentPalettes = new Map<ElementId, ReagentPalette>();
let ambientNextSwapAt = 0;
let ambientLastElement: ElementId | null = null;
let ambientQuickSwapsRemaining = 0;

/** Home screen: hold each activated Element map for 8–16s before swapping. */
const AMBIENT_SWAP_MIN_MS = 8000;
const AMBIENT_SWAP_MAX_MS = 16000;

function nextAmbientSwapDelay(): number {
  return AMBIENT_SWAP_MIN_MS + Math.random() * (AMBIENT_SWAP_MAX_MS - AMBIENT_SWAP_MIN_MS);
}

async function loadReagentPalettes(): Promise<void> {
  for (const element of ELEMENTS) {
    const body = grimoire.reagents[element] as { palette?: ReagentPalette | null };
    if (body.palette) reagentPalettes.set(element, body.palette);
  }
}

/**
 * Random: three quick introductory swaps, then the existing 8–16s pace.
 * One selected → locked. None → no swap.
 */
function maybeAmbientElementColor(): void {
  if (selectedElementPool.length < 2) return;
  if (colorMorphFrom || colorMorphTo) return;
  if (reagentPalettes.size === 0) return;
  const now = performance.now();
  if (ambientNextSwapAt === 0) {
    ambientNextSwapAt = now + nextAmbientSwapDelay();
    return;
  }
  if (now < ambientNextSwapAt) return;

  const pool = selectedElementPool.filter(
    (el) => el !== ambientLastElement && reagentPalettes.has(el)
  );
  const pick = pool[Math.floor(Math.random() * Math.max(1, pool.length))] ?? selectedElementPool[0];
  if (!pick) {
    ambientNextSwapAt = now + nextAmbientSwapDelay();
    return;
  }
  const palette = reagentPalettes.get(pick);
  if (!palette?.colors?.length && palette?.baseH === undefined) {
    ambientNextSwapAt = now + nextAmbientSwapDelay();
    return;
  }
  activeElement = pick;
  ambientLastElement = pick;
  ambientQuickSwapsRemaining = Math.max(0, ambientQuickSwapsRemaining - 1);
  ambientNextSwapAt = now + (ambientQuickSwapsRemaining > 0 ? 1500 : nextAmbientSwapDelay());
  constrainColor(palette);
  onActiveElement?.(pick);
}

interface MacroTarget {
  path: string;
  baseline?: number;
}

interface Macro {
  enabled: boolean;
  getModulation: (t: number) => number;
  targets: MacroTarget[];
}

function applyMacros(): void {
  const t = tickManager.cycleCount || 0;
  const tempoOwns = tickManager.isTempoOwningTiming();
  macros.forEach((macro: Macro) => {
    if (!macro.enabled) return;
    let rawWave = macro.getModulation(t);
    let normWave = (rawWave + 1) / 2;
    macro.targets.forEach(tgt => {
      if (config._overrides[tgt.path]) return;
      if (tgt.path === 'tickRate' && (tempoOwns || tickRamp)) return;
      let currentVal = getConfigValueByPath(tgt.path);
      if (tgt.baseline === undefined) {
        tgt.baseline = currentVal;
      }
      const def = PARAM_DEFINITIONS.find(d => d.path === tgt.path);
      if (!def || def.max === undefined || def.min === undefined) return;
      const targetVal = def.min + (normWave * (def.max - def.min));
      let newVal = Math.max(def.min, Math.min(def.max, targetVal));
      newVal = Math.round(newVal * 100) / 100;
      setConfigValueByPath(tgt.path, newVal);
    });
  });
  config._overrides = {};
}

function getConfigValueByPath(pathStr: string): any {
  const parts = pathStr.split(".");
  let current: any = config;
  for (const p of parts) {
    current = current[p];
  }
  return current;
}

function setConfigValueByPath(pathStr: string, newValue: any): void {
  const parts = pathStr.split(".");
  let current: any = config;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = newValue;
}

function updateParameterSliders(): void {
  for (const path in parameterSliders) {
    const { slider, valueDisplay } = parameterSliders[path];

    const currentVal = getConfigValueByPath(path);
    slider.value = currentVal;
    valueDisplay.textContent = (Math.round(currentVal * 100) / 100).toString();
  }
}

function render(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cells = gm.getCells();
  const rows = gm.getRows();
  const cols = gm.getCols();
  const cellSize = config.cellSize;
  const binaryOn = config.binaryTransitions.enabled;
  const nowMs = performance.now();

  if (tickCircleReveal(nowMs) && revealMasking) {
    // Circle finished — cells may spawn anywhere again.
    revealMasking = false;
    kaleidoscope?.setSpawnMask(null);
    kaleidoscope?.setDecayBoost(null);
  }

  const ox = gridOriginX;
  const oy = gridOriginY;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cell = cells[i]![j]!;
      if (cell.state === 1 && cell.color) {
        const opacity = sampleCircleReveal(i, j, nowMs);
        if (opacity <= 0) continue;

        const px = ox + j * cellSize;
        const py = oy + i * cellSize;
        const baseA = binaryOn ? 1.0 : cell.color.a;
        ctx.fillStyle = rgbToCss({
          ...cell.color,
          a: baseA * opacity
        });
        ctx.fillRect(px, py, cellSize, cellSize);
      }
    }
  }
  updateParameterSliders();
}

function onTick(): void {
  // Cull boost may trickle during soft hold so a sparse handoff does not die waiting.
  if (manifestationHeld) {
    if (kaleidoscope?.isCullBoosting()) kaleidoscope.stepCullBoost();
    return;
  }

  maybeAmbientElementColor();
  updateDerivedColors();
  applyMacros();

  let activeCellsCount = 0;
  const cells = gm.getCells();
  const rows = gm.getRows();
  const cols = gm.getCols();
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cell = cells[i][j];
      if (cell.state === 1 && cell.color && cell.color.a > 0) activeCellsCount++;
    }
  }
  const coverageFraction = (activeCellsCount / (gm.getRows() * gm.getCols())) || 0;
  equilibriumManager.update(coverageFraction);

  const { growthMultiplier, decayMultiplier } = {
    growthMultiplier: equilibriumManager.getGrowthMultiplier(),
    decayMultiplier: equilibriumManager.getDecayMultiplier()
  };
  const seeds = circleRevealSeeds();
  if (seeds) kaleidoscope.seedWithin(seeds.count, seeds.i, seeds.j, seeds.inner, seeds.radius);
  kaleidoscope.update(growthMultiplier, decayMultiplier);
  if (kaleidoscope.isCullBoosting()) kaleidoscope.stepCullBoost();
  // Paint happens on the vsync render loop — not on the simulation tick.
}

function updateConfig(path: string, val: any): void {
  console.log(`[Config Updated] ${path} = ${val}`);
  // tickRate: write only — harmonic clock reads config each frame. Never stop.
  // cellSize: session-stable after boot; changing it would wipe living cells.
  if (path === 'cellSize') {
    console.warn('[Config] cellSize is locked while the manifestation is live');
    return;
  }
  if (path === 'tickRate') {
    tickRamp = null;
    if (tickManager.isTempoOwningTiming()) return;
  }
  // Update the config object
  const parts = path.split('.');
  let current: any = config;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = val;

  // Update macro baselines for this parameter
  updateMacroBaselines(path, val);
}

// Track which parameters are currently being manually adjusted


function updateMacroBaselines(path: string, newValue: any): void {
  // Import macros and update baselines for matching parameters
  import('./utils/macrosUI.js').then(({ macros }) => {
    macros.forEach(macro => {
      macro.targets.forEach(target => {
        if (target.path === path) {
          // Update the baseline to the new manual value
          target.baseline = newValue;
          console.log(`Updated baseline for ${path} to ${newValue}`);
        }
      });
    });
  }).catch(error => {
    console.warn('Failed to update macro baselines:', error);
  });
}



let engineWired = false;
let keyCleanup: (() => void) | null = null;
let tickWired = false;
let activePresetName = '';

export async function initializePresets(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  await presetManager.loadPresets();

  let presetToLoad: any = null;

  if (config.RANDOM_START) {
    presetToLoad = presetManager.getRandomPreset();
    if (presetToLoad) {
      console.log(`Loading random preset: ${presetToLoad.name}`);
    }
  }

  if (!presetToLoad) {
    const allPresets = presetManager.getPresets();
    presetToLoad = allPresets.find((preset) => preset.name === 'time_in_motion');
    if (presetToLoad) {
      console.log(`Loading time in motion preset: ${presetToLoad.name}`);
    } else if (allPresets.length > 0) {
      presetToLoad = allPresets[0];
      console.log(`Loading fallback preset: ${presetToLoad.name}`);
    }
  }

  if (presetToLoad) {
    await presetManager.applyPreset(presetToLoad);
    activePresetName = presetToLoad.name;
    console.log(`Applied preset: ${presetToLoad.name}`);
  } else {
    console.warn('No presets available, using default config');
  }
}

export async function initializeApp(): Promise<void> {
  if (engineWired) return;

  await initializePresets();
  await loadReagentPalettes();

  await new Promise((resolve) => setTimeout(resolve, 100));

  setupUI(updateConfig, applyPresetByName);
  setupMacrosUI(() => {});
  hideCreatorPanels();
  // Stencil on before the first paint — AVE cells stay invisible until rim reveal.
  armCircleRevealMask();
  createSimulation();
  if (!tickWired) {
    tickManager.onTick(onTick);
    tickWired = true;
  }
  tickManager.start();
  startVsyncRenderLoop();
  keyCleanup = setupKeyControls(config, () => {}, console.log).dispose;
  engineWired = true;
}

/** Call after boot so ?preset= is honored. */
export async function finalizeBindBootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset');
  if (preset) {
    await applyPresetByName(preset);
  } else if (activePresetName !== 'default') {
    await applyPresetByName('default');
  }
}

/** Keep ambient Element pool in sync with the shell toggles. */
export function syncShellElement(selected: readonly ElementId[], cycle = true, onActive?: (element: ElementId) => void, quickStart = false): void {
  selectedElementPool = cycle ? [...selected] : [];
  onActiveElement = onActive;
  activeElement = selected.length === 1 ? selected[0]!
    : activeElement && selected.includes(activeElement) ? activeElement : selected[0] ?? null;
  ambientLastElement = activeElement;
  ambientQuickSwapsRemaining = quickStart && selectedElementPool.length >= 2 ? 3 : 0;
  ambientNextSwapAt = selectedElementPool.length >= 2
    ? performance.now() + (ambientQuickSwapsRemaining ? 1000 : nextAmbientSwapDelay()) : 0;
  if (activeElement) onActiveElement?.(activeElement);
}

function startVsyncRenderLoop(): void {
  if (renderLoopId) return;
  lastFrameAt = performance.now();
  const frame = (now: number) => {
    renderLoopId = requestAnimationFrame(frame);
    lastFrameAt = now;
    stepTickRamp(now);
    if (!manifestationHeld) stepColorMorph();
    if (!gm) return;
    tickManager.advanceFrame(now);
    render();
  };
  renderLoopId = requestAnimationFrame(frame);
}

type ReagentFile = {
  name: string;
  palette: {
    baseH?: number;
    baseS?: number;
    baseB?: number;
    scheme?: string;
    colors?: { h: number; s: number; b: number }[];
  } | null;
};

export async function startEngine(): Promise<void> {
  await initializeApp();
}

/** Stop the engine when its host closes the experience. */
export function disposeEngine(): void {
  onActiveElement = undefined;
  selectedElementPool = [];
  activeElement = null;
  ambientLastElement = null;
  ambientQuickSwapsRemaining = 0;
  ambientNextSwapAt = 0;
  if (renderLoopId) {
    cancelAnimationFrame(renderLoopId);
    renderLoopId = 0;
  }
  tickManager.stop();
  manifestationHeld = true;
  engineWired = false;
  keyCleanup?.();
  keyCleanup = null;
}

/**
 * Swap Spell/preset contiguously: living cells keep evolving; palette morphs
 * into the new scheme. Never rebuilds the grid. Never stops the tick clock.
 * Tick rate surges high then eases to the preset’s authored target.
 * Element pins re-assert via constrainColor after this returns.
 */
export async function applyPresetByName(name: string): Promise<boolean> {
  const found = presetManager.getPresets().find((preset) => preset.name === name);
  if (!found) {
    console.warn(`Preset not found: ${name}`);
    return false;
  }

  const liveFrom =
    pinnedColors && pinnedColors.length > 0
      ? pinnedColors.map((c) => ({ ...c }))
      : (config.derivedColors ?? []).map((c) => ({ ...c }));

  const rateBefore = config.tickRate;

  await presetManager.applyPreset(found);
  activePresetName = name;

  // Keep living Vessel — boot creates the grid once; presets never wipe it.
  if (!gm) {
    createSimulation();
  }

  const authored =
    (config as Config & { _presetTickRate?: number })._presetTickRate ?? rateBefore;
  delete (config as Config & { _presetTickRate?: number })._presetTickRate;
  // Restore pre-assign rate so the rush starts from the live tempo, not a snap.
  config.tickRate = rateBefore;
  rushTickRate(authored);

  // Element Reagent pin owns the map — never morph into the preset scheme or
  // clear the pin (that made the first spawn use calculated preset hues).
  const elementPinned = liveFrom.length > 0 && pinnedColors != null;
  if (elementPinned) {
    pinnedColors = liveFrom;
    updateDerivedColors();
  } else {
    pinnedColors = null;
    updateDerivedColors();
  }

  // Light cull shield only — a couple cells/tick if the base is near-empty.
  if (kaleidoscope) kaleidoscope.beginCullBoost(1200);

  if (!elementPinned) {
    const cs = config.colorSettings;
    const presetColors = getDerivedColors(cs.baseH, 100, cs.baseB, cs.scheme)
      .map((color) => ({ ...color, s: 100 }));
    if (liveFrom.length > 0) {
      pinnedColors = liveFrom;
      beginColorMorph(presetColors, { clearPinWhenDone: true });
    }
  }

  syncCreatorPreset(name);
  setLoadedPresetName(name);
  manifestationHeld = false;
  if (!tickManager.isRunning()) {
    tickManager.start();
  }
  return true;
}

export function getPresetNames(): string[] {
  return presetManager.getPresetNames();
}

export function getActivePresetName(): string {
  return activePresetName;
}

export type PresetParameterSnapshot = {
  sourcePreset: {
    config: Partial<Config>;
    macros: unknown[];
  };
  runtime: {
    config: Config;
    macros: unknown[];
  };
};

export function getPresetParameterSnapshot(): PresetParameterSnapshot {
  const sourcePreset = presetManager.getPresetDefinition(activePresetName);
  if (!sourcePreset) throw new Error(`Preset definition unavailable: ${activePresetName}`);
  return JSON.parse(JSON.stringify({
    sourcePreset,
    runtime: {
      config,
      macros
    }
  })) as PresetParameterSnapshot;
}

/**
 * Snap the Element Reagent palette immediately (no morph).
 * Use before the first spawn so new cells never pick a calculated preset scheme.
 */
export function pinColorMap(palette: {
  baseH?: number;
  baseS?: number;
  baseB?: number;
  scheme?: string;
  colors?: HSB[];
}): void {
  const colors = paletteToHsbList(palette);
  colorMorphFrom = null;
  colorMorphTo = null;
  clearPinAfterMorph = false;
  clearCellMorphBuffers();
  pinnedColors = colors.map((c) => ({ ...c }));
  if (pinnedColors[0]) {
    config.colorSettings.baseH = pinnedColors[0].h;
    config.colorSettings.baseS = pinnedColors[0].s;
    config.colorSettings.baseB = pinnedColors[0].b;
  }
  updateDerivedColors();
}

/**
 * Pin the Element Reagent palette and morph into it (no simulation restart).
 * Re-call after preset loads so preset colorSettings cannot snap the map away.
 */
export function constrainColor(palette: {
  baseH?: number;
  baseS?: number;
  baseB?: number;
  scheme?: string;
  colors?: HSB[];
}): void {
  // Morph the reagent map swatches only — do not snap bases/scheme (that recalculates).
  beginColorMorph(paletteToHsbList(palette), { clearPinWhenDone: false });
}

/** Restore the preset’s hue/brightness scheme at full unbound saturation. */
export function releaseColorConstraint(): void {
  const source = presetManager.getPresetDefinition(activePresetName);
  const cs = source?.config?.colorSettings ?? config.colorSettings;
  const target = getDerivedColors(cs.baseH, 100, cs.baseB, cs.scheme)
    .map((color) => ({ ...color, s: 100 }));
  beginColorMorph(target, { clearPinWhenDone: true });
}

export function pauseManifestation(): void {
  // Keep the engine clock owned by the shell; freeze visual morph time.
  if (!manifestationHeld) manifestationPausedAt = performance.now();
  manifestationHeld = true;
}

export function resumeManifestation(): void {
  if (manifestationPausedAt !== null) {
    const heldMs = performance.now() - manifestationPausedAt;
    colorMorphStartedAt += heldMs;
    if (ambientNextSwapAt) ambientNextSwapAt += heldMs;
    manifestationPausedAt = null;
  }
  manifestationHeld = false;
  if (!tickManager.isRunning()) tickManager.start();
}

/** Arm the invisible stencil so active cells stay hidden until the rim reveal. */
export function armVesselRevealMask(): void {
  armCircleRevealMask();
}

/** Reduced-motion / bypass — drop the stencil and show every cell. */
export function skipVesselReveal(): void {
  completeCircleRevealImmediate();
}

/** Light stencil start — does not touch the sim, only schedules paint gates. */
export function startVesselCircleReveal(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!canvas || !gm) {
    completeCircleRevealImmediate();
    return;
  }
  const x = gridOriginX + gm.getCols() * config.cellSize / 2;
  const y = gridOriginY + gm.getRows() * config.cellSize / 2;
  beginCircleReveal({
    originX: x,
    originY: y,
    gridOriginX,
    gridOriginY,
    cellSize: config.cellSize,
    rows: gm.getRows(),
    cols: gm.getCols(),
    visible: visibleCanvasRect(canvas)
  });
  // Population mask: start from an empty field; cells may only spawn inside the circle.
  kaleidoscope.clearPopulation();
  kaleidoscope.setSpawnMask(circleRevealSpawnMask());
  kaleidoscope.setDecayBoost(circleRevealDecayBoost());
  revealMasking = true;
  manifestationHeld = false;
  if (!tickManager.isRunning()) tickManager.start();
}

export function getTickManager(): TickManager {
  return tickManager;
}

/** Resolve only after the existing render loop completes a new active frame.
 * Observes lifecycle state; does not change simulation or rendering behavior.
 */
export function waitForActiveRendering(signal?: AbortSignal, options: { allowHeld?: boolean; afterRipple?: boolean } = {}): Promise<void> {
  const observedFrame = lastFrameAt;
  return new Promise((resolve, reject) => {
    let frame = 0;
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const observe = () => {
      if (signal?.aborted) { abort(); return; }
      if (gm && renderLoopId && lastFrameAt > observedFrame && (options.allowHeld || isManifestationRunning()) && (!options.afterRipple || isCircleRevealComplete())) {
        signal?.removeEventListener('abort', abort);
        resolve();
      } else frame = requestAnimationFrame(observe);
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    frame = requestAnimationFrame(observe);
  });
}

export function isManifestationRunning(): boolean {
  return tickManager.isRunning() && !manifestationHeld;
}

export function restartManifestation(): void {
  // Operator restart may rebuild the grid; clock stays running.
  createSimulation();
  manifestationHeld = false;
  if (!tickManager.isRunning()) tickManager.start();
}

export function snapshotManifestation(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enchantment-${Date.now()}.png`;
    (document.querySelector('.enchanter-runtime') ?? document.body).appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export function beginExport(multiplier: number = 2): MediaRecorder | null {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!canvas || typeof MediaRecorder === 'undefined') return null;
  void multiplier;
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enchantment-${Date.now()}.webm`;
    (document.querySelector('.enchanter-runtime') ?? document.body).appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  recorder.start();
  return recorder;
}

export function toggleCreatorPanels(): void {
  const root = document.querySelector<HTMLElement>('.enchanter-runtime') ?? document.body;
  if (root.dataset.mode === 'boot') return;
  const on = root.getAttribute('data-creator') === '1';
  if (on) root.removeAttribute('data-creator');
  else root.setAttribute('data-creator', '1');
}

export function hideCreatorPanels(): void {
  (document.querySelector('.enchanter-runtime') ?? document.body).removeAttribute('data-creator');
  const paramPanel = document.getElementById('parametersPanel');
  const macrosPanel = document.getElementById('macrosPanel');
  if (paramPanel) paramPanel.style.display = 'none';
  if (macrosPanel) macrosPanel.style.display = 'none';
}

window.addEventListener('DOMContentLoaded', () => {
  hideCreatorPanels();
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!document.querySelector('.enchanter-runtime')) return;
  if (e.code !== 'Space' || !e.shiftKey) return;
  if (new URLSearchParams(window.location.search).get('experience') !== '1') return;
  if ((document.querySelector<HTMLElement>('.enchanter-runtime') ?? document.body).dataset.mode === 'boot') return;
  e.preventDefault();
  toggleCreatorPanels();
});

window.updateConfig = updateConfig;
window.snapshotManifestation = snapshotManifestation;

declare global {
  interface Window {
    updateConfig: (path: string, val: any) => void;
    snapshotManifestation: () => void;
  }
}
