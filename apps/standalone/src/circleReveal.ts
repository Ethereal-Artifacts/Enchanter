/**
 * Circle reveal — a POPULATION MASK, not a paint cull.
 *
 * The simulation runs live. For five seconds a circle grows from the center of
 * the visualization grid (radius 0 → covers the grid, quint-out) and cells may only
 * SPAWN inside it. When the circle ends the mask is dropped and cells grow
 * freely.
 *
 * The kaleidoscope simulates one quadrant and mirrors it. A circle on the text
 * is therefore folded into that quadrant: for any cell, the distance to the
 * nearest mirror image of the origin is its distance to the folded origin. The
 * mask is built in that folded space, so the population stays symmetric (a
 * text origin off the grid center shows up as mirrored twins that merge).
 *
 * Rim sub-animation is PAL-12K's `performGlitchEffect` (qrCodeMeshAnimation.ts),
 * one shared duration = Math.random() * 500 + 250, one flip per duration / 5. A
 * cell flickers from the moment the rim crosses it, at most 3 flips (0,1,0), then
 * resolves to visible. It only modulates paint
 * on cells that already exist — nothing is hidden that the sim has spawned.
 *
 * Opening only, interior cells (behind the rim) carry a temporary decay boost that
 * fades to normal by 50% of the ripple's time.
 *
 * Engine glue is four calls on Kaleidoscope: clearPopulation, setSpawnMask,
 * setDecayBoost, seedWithin. Nothing here reads or writes cells directly.
 */

/** The whole ripple — last cell crossed, last flicker settled — takes this long. */
export const REVEAL_MS = 5000;
/** quintOut reaches 99.5% of its value at 1 - 0.005^(1/5) of its span. */
const CURVE_END_FRACTION = 1 - Math.pow(0.005, 0.2);
/** Seeds per cell of newly covered area, before growth takes over. */
const SEED_DENSITY = 0.02;
/** The circle is never smaller than the origin cell. */
const MIN_RADIUS_CELLS = 0.75;

/** qrCodeMeshAnimation.ts / performGlitchEffect: one flip every duration / 5. */
const GLITCH_TIMES = 5;
/** A cell flickers at most this many flips, then resolves to visible. */
const MAX_FLIPS = 3;

/** Opening only: interior cells die faster, fading to normal by this fraction of REVEAL_MS. */
const DEATH_BOOST_UNTIL = 0.5;
/** Extra decay multiplier at t = 0 (1 + this); the edge-break chance saturates near x4. */
const DEATH_BOOST_PEAK = 4;
/** The boosted zone is the interior: it trails the rim at this fraction of the radius. */
const DEATH_BOOST_INTERIOR = 0.7;
const DURATION_MIN_MS = 250;
const DURATION_SPAN_MS = 500;

/** Quintic ease-out — fast out of the origin, easing to the edge. */
export function quintOut(t: number): number {
  const u = Math.min(1, Math.max(0, t)) - 1;
  return u * u * u * u * u + 1;
}

/** Inverse of quintOut: progress (0-1) at which the eased value reaches `v`. */
function quintOutInverse(v: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 0.2);
}

/** performGlitchEffect in clock form (see qrCodeMeshAnimation.ts). */
function glitchOpacity(
  now: number,
  glitchStart: number,
  duration: number,
  startOpacity: number
): number {
  if (now < glitchStart) return startOpacity;
  const count = Math.floor((now - glitchStart) / (duration / GLITCH_TIMES));
  if (count >= MAX_FLIPS) return startOpacity === 0 ? 1 : 0;
  return count % 2 === 0 ? startOpacity : startOpacity === 0 ? 1 : 0;
}

type StartOptions = {
  /** Origin of the ripple, canvas bitmap px (center of the visualization). */
  originX: number;
  originY: number;
  gridOriginX: number;
  gridOriginY: number;
  cellSize: number;
  rows: number;
  cols: number;
  /** Canvas bitmap px actually on screen (object-fit: cover crops the tall canvas). */
  visible?: { left: number; top: number; right: number; bottom: number };
  now?: number;
};

type Phase = 'off' | 'masked' | 'running';

export type SeedRequest = {
  count: number;
  /** Folded origin, base-quadrant cell units. */
  i: number;
  j: number;
  /** Annulus newly covered since the last request. */
  inner: number;
  radius: number;
};

export function initCircleRevealState() {
  let phase: Phase = 'masked';
  let t0 = 0;
  let duration = 0;
  /** Rim travel time: REVEAL_MS minus the glitch tail, so the flicker ends at REVEAL_MS. */
  let rimMs = REVEAL_MS;
  /** Span of the quintOut curve; rim reaches the far corner at rimMs, not at the curve's end. */
  let curveMs = REVEAL_MS;
  let curveEnd = 1;
  let rows = 0;
  let cols = 0;
  /** Folded origin and reach, in base-quadrant cell units. */
  let foldI = 0;
  let foldJ = 0;
  let reach = 1;
  let seededRadius = 0;
  let entryAt = new Float32Array(0);

  function armMask(): void {
    phase = 'masked';
  }

  function completeImmediate(): void {
    phase = 'off';
  }

  function radiusAt(now: number): number {
    if (phase !== 'running') return Infinity;
    const elapsed = Math.min(now - t0, rimMs);
    const eased = quintOut(elapsed / curveMs) / curveEnd;
    return Math.max(MIN_RADIUS_CELLS, reach * eased);
  }

  /** Distance from a cell center to the nearest mirror image of the origin. */
  function foldedDistance(i: number, j: number): number {
    const y = i + 0.5;
    const x = j + 0.5;
    const di = Math.min(y, rows - y) - foldI;
    const dj = Math.min(x, cols - x) - foldJ;
    return Math.sqrt(di * di + dj * dj);
  }

  function start(options: StartOptions): void {
    t0 = options.now ?? performance.now();
    rows = options.rows;
    cols = options.cols;
    // Origin in cell units, then folded into the simulated (top-left) quadrant.
    const oi = (options.originY - options.gridOriginY) / options.cellSize;
    const oj = (options.originX - options.gridOriginX) / options.cellSize;
    const ci = Math.min(Math.max(oi, 0), rows);
    const cj = Math.min(Math.max(oj, 0), cols);
    foldI = Math.min(ci, rows - ci);
    foldJ = Math.min(cj, cols - cj);
    // The circle must reach the far corner of what is ON SCREEN, so the 5 s is
    // spent on pixels the viewer can see. Corners are folded like everything else.
    const v = options.visible ?? {
      left: options.gridOriginX,
      top: options.gridOriginY,
      right: options.gridOriginX + cols * options.cellSize,
      bottom: options.gridOriginY + rows * options.cellSize
    };
    const edgesI = [(v.top - options.gridOriginY) / options.cellSize, (v.bottom - options.gridOriginY) / options.cellSize];
    const edgesJ = [(v.left - options.gridOriginX) / options.cellSize, (v.right - options.gridOriginX) / options.cellSize];
    reach = 1;
    for (const ei of edgesI) {
      for (const ej of edgesJ) {
        const y = Math.min(Math.max(ei, 0), rows);
        const x = Math.min(Math.max(ej, 0), cols);
        reach = Math.max(reach, Math.hypot(Math.min(y, rows - y) - foldI, Math.min(x, cols - x) - foldJ) + 1);
      }
    }
    duration = Math.random() * DURATION_SPAN_MS + DURATION_MIN_MS;
    // Flicker lasts MAX_FLIPS intervals of duration / GLITCH_TIMES, then resolves.
    rimMs = REVEAL_MS - (duration * MAX_FLIPS) / GLITCH_TIMES;
    curveMs = rimMs / CURVE_END_FRACTION;
    curveEnd = quintOut(rimMs / curveMs);
    entryAt = new Float32Array(rows * cols).fill(Number.NaN);
    seededRadius = 0;
    phase = 'running';
    console.info(
      `[circle-reveal] origin ${foldI.toFixed(1)},${foldJ.toFixed(1)} reach ${reach.toFixed(0)} cells, ` +
        `quint-out rim ${rimMs.toFixed(0)}ms + ${((duration * MAX_FLIPS) / GLITCH_TIMES).toFixed(0)}ms flicker = ${REVEAL_MS}ms`
    );
  }

  /** Population mask over base-quadrant cells: spawn only inside the circle. */
  function spawnMask(): ((i: number, j: number) => boolean) | null {
    if (phase !== 'running') return null;
    return (i, j) => {
      const di = i + 0.5 - foldI;
      const dj = j + 0.5 - foldJ;
      return Math.sqrt(di * di + dj * dj) <= radiusAt(performance.now());
    };
  }

  /**
   * Opening-only death boost per base-quadrant cell (a decay multiplier >= 1).
   * Applies to the interior behind the rim; fades to 1 by DEATH_BOOST_UNTIL.
   */
  function decayBoost(): ((i: number, j: number) => number) | null {
    if (phase !== 'running') return null;
    return (i, j) => {
      const now = performance.now();
      const p = (now - t0) / REVEAL_MS;
      if (p >= DEATH_BOOST_UNTIL) return 1;
      const di = i + 0.5 - foldI;
      const dj = j + 0.5 - foldJ;
      if (Math.sqrt(di * di + dj * dj) > DEATH_BOOST_INTERIOR * radiusAt(now)) return 1;
      return 1 + DEATH_BOOST_PEAK * (1 - p / DEATH_BOOST_UNTIL);
    };
  }

  /** Seeds for the ring of area the circle has newly covered since last tick. */
  function seedRequest(now: number): SeedRequest | null {
    if (phase !== 'running') return null;
    const radius = radiusAt(now);
    const inner = seededRadius;
    const area = Math.PI * (radius * radius - inner * inner);
    if (area <= 0) return null;
    seededRadius = radius;
    // Sampled over the full annulus; samples outside the simulated quadrant fall
    // away, so density inside it stays SEED_DENSITY. A tiny circle still gets one.
    const count = Math.max(1, Math.round(area * SEED_DENSITY));
    return { count, i: foldI, j: foldJ, inner, radius };
  }

  /** Once per vsync. Returns true when the circle is finished. */
  function tick(now: number): boolean {
    if (phase === 'running' && now >= t0 + REVEAL_MS) phase = 'off';
    return phase === 'off';
  }

  /** Paint opacity: the rim flickers each cell as it passes; everything else is normal. */
  function sample(i: number, j: number, now: number): number {
    if (phase === 'off') return 1;
    if (phase === 'masked') return 0;
    const slot = i * cols + j;
    let at = entryAt[slot]!;
    if (Number.isNaN(at)) {
      // Time the rim crossed this cell: invert the quint-out radius curve.
      const progress = Math.min(1, foldedDistance(i, j) / reach);
      at = t0 + curveMs * quintOutInverse(progress * curveEnd);
      entryAt[slot] = at;
    }
    return glitchOpacity(now, at, duration, 0);
  }

  return { armMask, completeImmediate, start, tick, sample, spawnMask, decayBoost, seedRequest, isComplete: () => phase === 'off' };
}

export type CircleRevealInstance = ReturnType<typeof initCircleRevealState>;

/** Session instance — same role as `qrPolyhedronMeshAnimationInstance` in PAL. */
let instance = initCircleRevealState();

export function armCircleRevealMask(): void {
  instance.armMask();
}

export function completeCircleRevealImmediate(): void {
  instance.completeImmediate();
}

export function startCircleReveal(options: StartOptions): void {
  instance = initCircleRevealState();
  instance.start(options);
}

export function tickCircleReveal(nowMs: number = performance.now()): boolean {
  return instance.tick(nowMs);
}

/** True only after the rendered ripple and its final flicker have completed. */
export function isCircleRevealComplete(): boolean {
  return instance.isComplete();
}

export function sampleCircleReveal(
  i: number,
  j: number,
  nowMs: number = performance.now()
): number {
  return instance.sample(i, j, nowMs);
}

export function circleRevealSpawnMask(): ((i: number, j: number) => boolean) | null {
  return instance.spawnMask();
}

export function circleRevealDecayBoost(): ((i: number, j: number) => number) | null {
  return instance.decayBoost();
}

export function circleRevealSeeds(nowMs: number = performance.now()): SeedRequest | null {
  return instance.seedRequest(nowMs);
}

/** Part of the canvas bitmap that is on screen (`object-fit: cover`), in bitmap px. */
export function visibleCanvasRect(canvas: HTMLCanvasElement): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(rect.width / canvas.width, rect.height / canvas.height);
  const offsetX = (rect.width - canvas.width * scale) / 2;
  const offsetY = (rect.height - canvas.height * scale) / 2;
  return {
    left: -offsetX / scale,
    top: -offsetY / scale,
    right: (rect.width - offsetX) / scale,
    bottom: (rect.height - offsetY) / scale
  };
}

/** Center of an element, mapped through the canvas `object-fit: cover`. */
export function elementCenterOnCanvas(
  el: Element,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const box = el.getBoundingClientRect();
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(rect.width / canvas.width, rect.height / canvas.height);
  const offsetX = (rect.width - canvas.width * scale) / 2;
  const offsetY = (rect.height - canvas.height * scale) / 2;
  return {
    x: (box.left + box.width / 2 - rect.left - offsetX) / scale,
    y: (box.top + box.height / 2 - rect.top - offsetY) / scale
  };
}
