/**
 * Ethereal Artifacts text scramble — PAL-12K TextScramble, ordinary JavaScript.
 * Browser-native text scramble.
 *
 * Chrome reveal (`build`): grow slots → loop glyphs → scramble down with duds.
 * Retarget play (no build): keep current letters until each cell’s PAL window.
 */

export const ELEMENT_SCRAMBLE_CHARS = ['🜃', '🜂', '🜄', '🜁'] as const;

type DudClass = 'core' | 'module' | 'interface' | 'payload';

const PRODUCT_CLASS_GLYPH: Record<DudClass, string> = {
  core: '🜃',
  module: '🜂',
  interface: '🜄',
  payload: '🜁'
};

const ELEMENT_MARKS = new Set<string>(ELEMENT_SCRAMBLE_CHARS);

const CLASS_OF_GLYPH: Record<string, DudClass> = {
  '🜃': 'core',
  '🜂': 'module',
  '🜄': 'interface',
  '🜁': 'payload'
};

/**
 * PAL-12K `TextScramble` is frame-counted at ~60 Hz.
 * `start = rand(50)` then `end = start + rand(50)`; duds tick at 0.1.
 * Footer-style chrome uses `speed: 2` (half those windows).
 */
const PAL_FRAME_MS = 1000 / 60;
const PAL_START_FRAMES = 50;
const PAL_HOLD_FRAMES = 50;
const DUD_TICK = 0.1;
/** Frames between revealing the next character slot while building. */
const BUILD_FRAMES_PER_SLOT = 2;
/** Extra glyph-loop frames after every slot is present, before resolve. */
const BUILD_EXTRA_FRAMES = 18;

export function isWhitespaceUnit(unit: string): boolean {
  return unit === ' ' || unit === '\n' || unit === '\t';
}

/** Code-point units so 🜁 stays one cell, not a UTF-16 surrogate pair. */
export function unitsOf(text: string): string[] {
  return [...text];
}

function randomElementChar(): string {
  return ELEMENT_SCRAMBLE_CHARS[Math.floor(Math.random() * ELEMENT_SCRAMBLE_CHARS.length)]!;
}

/** Closing dud before a cell resolves is always Core. */
export function dudElementChar(closing = false): string {
  return closing ? PRODUCT_CLASS_GLYPH.core : randomElementChar();
}

function isElementMark(unit: string): boolean {
  return ELEMENT_MARKS.has(unit);
}

function palWindow(frames: number, speed: number): number {
  return Math.max(1, Math.round(frames / speed));
}

function palStartMs(speed: number): number {
  return Math.floor(Math.random() * palWindow(PAL_START_FRAMES, speed)) * PAL_FRAME_MS;
}

function palEndMs(start: number, speed: number): number {
  return start + (Math.floor(Math.random() * palWindow(PAL_HOLD_FRAMES, speed)) + 1) * PAL_FRAME_MS;
}

function motionDuration(): number {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 0;
  }
  return 1;
}

type Cell = {
  from: string;
  to: string;
  start: number;
  end: number;
  char?: string;
  node: HTMLSpanElement;
  done: boolean;
  /** Last dud for this cell has been Core. */
  coreClose?: boolean;
};

export type ScrambleMountOptions = {
  /**
   * Wrap alchemical marks in `.class-glyph` (Noto Sans Symbols).
   * URL / chrome duds need this so marks render.
   */
  classGlyph?: boolean;
  /** Initial paint. Footer/URL start empty (build) or as duds; SKU chips start settled. */
  start?: 'duds' | 'settled';
  /** `2` halves PAL start/hold windows (footer). Working text stays `1`. */
  speed?: number;
  /**
   * Grow to full length with glyph loops, hold, then resolve.
   * Defaults on when `start` is `duds` (chrome reveal).
   */
  build?: boolean;
};

export type AsciiScramble = {
  /** Off-screen: clear slots (build) or fill with element duds. */
  reset: () => void;
  /** Snap to the current (or given) string with no run. */
  settle: (text?: string) => void;
  /** Rebuild the field for a new string. Does not play. */
  setText: (text: string, asDuds?: boolean) => void;
  /** Build → glyph loop → resolve (or retarget scramble). Returns a cancel fn. */
  play: (onComplete?: () => void) => () => void;
};

/**
 * PAL TextScramble, mounted once. Spans are reused; play only mutates
 * text and class. Chrome reveal builds length first; retarget play keeps
 * each cell’s letter until its `start`, then a `.dud` mark, then the target.
 */
export function mountAsciiScramble(
  el: HTMLElement,
  text: string,
  options: ScrambleMountOptions = {}
): AsciiScramble {
  const classGlyph = options.classGlyph === true;
  const startDuds = (options.start ?? 'duds') === 'duds';
  const speed = options.speed && options.speed > 0 ? options.speed : 1;
  const build = options.build ?? startDuds;
  const cells: Cell[] = [];

  const paintClass = (unit: string, dud: boolean) => {
    const parts: string[] = [];
    if (dud) {
      parts.push('dud');
      const cls = CLASS_OF_GLYPH[unit];
      if (cls) parts.push(`dud--${cls}`);
    }
    if (classGlyph && isElementMark(unit)) parts.push('class-glyph');
    return parts.join(' ');
  };

  const paint = (cell: Cell, unit: string, dud: boolean) => {
    cell.node.className = paintClass(unit, dud);
    cell.node.textContent = unit;
  };

  const clearCell = (cell: Cell) => {
    cell.node.className = '';
    cell.node.textContent = '';
  };

  const displayedOf = (cell: Cell) => cell.node.textContent ?? '';

  const rebuild = (value: string, asDuds: boolean, fromUnits?: string[]) => {
    const to = unitsOf(value);
    cells.length = 0;
    const frag = document.createDocumentFragment();
    let cellIndex = 0;
    const retargeting = fromUnits != null;

    for (let i = 0; i < to.length; i++) {
      const dest = to[i] ?? '';
      if (isWhitespaceUnit(dest)) {
        frag.appendChild(document.createTextNode(dest));
        continue;
      }
      const node = document.createElement('span');
      const from = fromUnits?.[cellIndex] ?? '';
      const cell: Cell = {
        from,
        to: dest,
        start: 0,
        end: 0,
        node,
        done: true
      };
      if (asDuds && build) clearCell(cell);
      else if (asDuds) paint(cell, dudElementChar(), true);
      else if (retargeting && from) paint(cell, from, false);
      else if (retargeting) clearCell(cell);
      else paint(cell, dest, false);
      frag.appendChild(node);
      cells.push(cell);
      cellIndex += 1;
    }

    el.replaceChildren(frag);
  };

  rebuild(text, startDuds);

  let frameRequest = 0;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
  };

  const setText = (next: string, asDuds = false) => {
    cancel();
    const previous = cells.map((cell) => displayedOf(cell));
    rebuild(next, asDuds, asDuds ? undefined : previous);
  };

  const reset = () => {
    cancel();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      cell.done = true;
      cell.char = undefined;
      cell.coreClose = false;
      if (build) clearCell(cell);
      else paint(cell, dudElementChar(), true);
    }
  };

  const settle = (next?: string) => {
    if (next != null) setText(next);
    else cancel();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      cell.done = true;
      cell.char = undefined;
      paint(cell, cell.to, false);
    }
  };

  const tickDuds = (limit: number) => {
    const n = Math.min(limit, cells.length);
    for (let i = 0; i < n; i++) {
      const cell = cells[i]!;
      if (!cell.char || Math.random() < DUD_TICK) {
        cell.char = dudElementChar();
        paint(cell, cell.char, true);
      }
    }
  };

  const armResolve = () => {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      cell.from = displayedOf(cell);
      cell.start = palStartMs(speed);
      cell.end = palEndMs(cell.start, speed);
      cell.char = undefined;
      cell.done = false;
      cell.coreClose = false;
    }
  };

  const play = (onComplete?: () => void) => {
    cancel();
    cancelled = false;

    if (cells.length === 0 || motionDuration() === 0 || typeof requestAnimationFrame === 'undefined') {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]!;
        paint(cell, cell.to, false);
      }
      onComplete?.();
      return () => {};
    }

    if (!build) {
      const origin = performance.now();
      armResolve();

      const update = (now: number) => {
        if (cancelled) return;
        if (runResolve(now - origin)) {
          onComplete?.();
          return;
        }
        frameRequest = requestAnimationFrame(update);
      };

      frameRequest = requestAnimationFrame(update);
      return cancel;
    }

    // Build → hold (extra glyph loop) → resolve.
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      cell.done = false;
      cell.char = undefined;
      cell.coreClose = false;
      clearCell(cell);
    }

    const framesPerSlot = Math.max(1, Math.round(BUILD_FRAMES_PER_SLOT / speed));
    const extraHoldMs = palWindow(BUILD_EXTRA_FRAMES, speed) * PAL_FRAME_MS;
    let phase: 'build' | 'hold' | 'resolve' = 'build';
    let revealed = 0;
    let buildTicks = 0;
    let holdOrigin = 0;
    let resolveOrigin = 0;

    const update = (now: number) => {
      if (cancelled) return;

      if (phase === 'build') {
        buildTicks += 1;
        const target = Math.min(cells.length, Math.floor(buildTicks / framesPerSlot));
        while (revealed < target) {
          const cell = cells[revealed]!;
          cell.char = dudElementChar();
          paint(cell, cell.char, true);
          revealed += 1;
        }
        tickDuds(revealed);
        if (revealed >= cells.length) {
          phase = 'hold';
          holdOrigin = now;
        }
        frameRequest = requestAnimationFrame(update);
        return;
      }

      if (phase === 'hold') {
        tickDuds(cells.length);
        if (now - holdOrigin >= extraHoldMs) {
          phase = 'resolve';
          resolveOrigin = now;
          armResolve();
        }
        frameRequest = requestAnimationFrame(update);
        return;
      }

      if (runResolve(now - resolveOrigin)) {
        onComplete?.();
        return;
      }
      frameRequest = requestAnimationFrame(update);
    };

    frameRequest = requestAnimationFrame(update);
    return cancel;
  };

  /** @returns true when every cell has settled. */
  const runResolve = (frame: number): boolean => {
    let pending = 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      if (cell.done) continue;

      if (frame >= cell.end) {
        if (!cell.coreClose) {
          cell.coreClose = true;
          cell.char = dudElementChar(true);
          paint(cell, cell.char, true);
          pending += 1;
          continue;
        }
        cell.done = true;
        cell.char = undefined;
        paint(cell, cell.to, false);
        continue;
      }

      pending += 1;

      if (frame >= cell.start) {
        if (!cell.char || Math.random() < DUD_TICK) {
          cell.char = dudElementChar();
          paint(cell, cell.char, true);
        }
      }
    }

    return pending <= 0;
  };

  return { reset, settle, setText, play };
}

/** Reveal existing button labels without replacing component-owned DOM. */
export function scrambleButtonEntrance(root: ParentNode, onComplete?: () => void): () => void {
  let cancelled = false;
  let pending = 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onComplete?.(); return () => {}; }
  const cleanups: Array<() => void> = [];
  for (const label of root.querySelectorAll<HTMLElement>('.btn__label')) {
    const text = label.textContent ?? '';
    if (!text.trim() || !label.parentElement) continue;
    pending += 1;
    const overlay = label.cloneNode(false) as HTMLElement;
    overlay.removeAttribute('id');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.entranceScramble = 'true';
    Object.assign(overlay.style, {
      position: 'absolute', left: `${label.offsetLeft}px`, top: `${label.offsetTop}px`,
      width: `${label.offsetWidth}px`, height: `${label.offsetHeight}px`,
      pointerEvents: 'none'
    });
    const visibility = label.style.visibility;
    label.style.visibility = 'hidden';
    label.parentElement.append(overlay);
    const field = mountAsciiScramble(overlay, text, {classGlyph: true, start: 'duds', speed: 2});
    field.reset();
    let cancel: (() => void) | undefined;
    let frame = 0;
    const centered = label.closest('#begin-slot') !== null;
    const style = getComputedStyle(label);
    const rightAligned = style.direction === 'rtl' && style.writingMode === 'horizontal-tb';
    const align = () => {
      overlay.style.left = `${label.offsetLeft}px`;
      overlay.style.top = `${label.offsetTop}px`;
      const ink = document.createRange();
      ink.selectNodeContents(label);
      const target = ink.getBoundingClientRect();
      ink.selectNodeContents(overlay);
      const painted = ink.getBoundingClientRect();
      overlay.style.top = `${label.offsetTop + target.top - painted.top + (centered ? (target.height - painted.height) / 2 : 0)}px`;
      overlay.style.left = `${label.offsetLeft + target.left - painted.left + (centered ? (target.width - painted.width) / 2 : rightAligned ? target.width - painted.width : 0)}px`;
      frame = requestAnimationFrame(align);
    };
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      cancelAnimationFrame(frame);
      label.style.visibility = visibility;
      overlay.remove();
      if (--pending === 0 && !cancelled) onComplete?.();
    };
    frame = requestAnimationFrame(align);
    cancel = field.play(restore);
    cleanups.push(() => { cancel?.(); restore(); });
  }
  if (pending === 0) onComplete?.();
  return () => { cancelled = true; cleanups.forEach(cleanup => cleanup()); };
}
