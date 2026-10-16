import { enchanterLicense } from './localization';
/**
 * Enchanter — experience shell.
 *
 * Elements (toggleable) + Spell dropdown + Begin.
 * `default` is the idle baseline; the engine keeps running.
 */

import { createRuntime } from './loader.js';
import {
  applyPresetByName,
  armVesselRevealMask,
  constrainColor,
  finalizeBindBootstrap,
  hideCreatorPanels,
  isManifestationRunning,
  pauseManifestation,
  pinColorMap,
  releaseColorConstraint,
  restartManifestation,
  resumeManifestation,
  rushTickRate,
  skipVesselReveal,
  snapshotManifestation,
  startEngine,
  startVesselCircleReveal,
  syncShellElement,
  waitForActiveRendering
} from './app.js';
import {
  ELEMENT_FILTER_COLOR,
  SPELL_PRESETS,
  type ElementId
} from './utils/spellCatalog.js';
import { mountAsciiScramble, scrambleButtonEntrance, type AsciiScramble } from './scramble.js';
import { grimoire } from './data.js';
import { mountLanguagePicker } from './languagePicker.js';
import { informationHeader, informationHTML, informationFor } from './information.js';
import { enchanterCopy, enchanterLanguage, enchanterDirection } from './localization.js';

type SpellFile = {
  name: string;
  glyph: string;
  preset: string | null;
  placeholderPreset: string;
  reagent: string;
};

type ReagentFile = {
  name: string;
  advertisement: string | null;
  palette: {
    baseH?: number;
    baseS?: number;
    baseB?: number;
    scheme?: string;
    colors?: { h: number; s: number; b: number }[];
  } | null;
};

type Mode = 'boot' | 'environment' | 'enchanting' | 'complete';

const ELEMENT_NAMES = ['EARTH', 'FIRE', 'WATER', 'AIR'] as const;
let visualElement: ElementId = 'EARTH';
const IDLE_PRESET = 'default';
const HUD_IDLE_MS = 3200;
const elements = new Map<string, SpellFile>();
const reagents = new Map<string, ReagentFile>();
let beginEntranceCleanup: (() => void) | null = null;
let appliedCopyLanguage: string | null = null;
let peripheralScrambleCleanup: (() => void) | null = null;
let externalLogoCanvas: SVGSVGElement | null = null;
let shellPointerCleanup: (() => void) | null = null;
let environmentBuilt = false;
let sceneScramble: AsciiScramble | null = null;
let sceneText = '';
let informationCleanup: (() => void) | null = null;
let fullscreenCleanup: (() => void) | null = null;
let runtimeRoot: HTMLElement | null = null;
export type EnchanterButtonRenderer = {
  licenseBadge?: (container: HTMLElement) => void;
  information?: (container: HTMLElement) => void;
  informationOpen?: (open: boolean) => void;
  informationLocale?: (language: string) => void;
  scene?: (container: HTMLElement, label: string) => HTMLSelectElement;
  sceneLabel?: (label: string) => void;
  create: (variant: string, color: string, label: string, hoverActive?: boolean) => HTMLButtonElement;
  host: (button: HTMLButtonElement) => HTMLElement;
  label: (button: HTMLButtonElement, label: string, scramble?: boolean) => boolean;
  pressed: (button: HTMLButtonElement, pressed: boolean) => void;
};
let buttonRenderer: EnchanterButtonRenderer | null = null;
export function setButtonRenderer(renderer: EnchanterButtonRenderer | null): void {
  buttonRenderer = renderer;
}
function appendButton(parent: HTMLElement, button: HTMLButtonElement): void {
  parent.append(buttonRenderer?.host(button) ?? button);
}
function rimControlHost(control: HTMLElement): HTMLSpanElement {
  const host = document.createElement('span');
  host.className = 'btn-host tooltip-anchor';
  host.append(control);
  return host;
}
let localeObserver: MutationObserver | null = null;
function localizedLabel(label: string): string {
  const language = document.documentElement.lang || 'en';
  const copy = enchanterCopy(language);
  const originals = enchanterCopy('en');
  for (const key of Object.keys(originals) as Array<keyof typeof originals>) {
    const text = originals[key];
    if (label.toUpperCase() === text.toUpperCase()) return copy[key];
  }
  for (const key of ['all', 'auto', 'earth', 'fire', 'water', 'air'] as const) {
    const text = originals[key];
    if (label.toUpperCase().endsWith(` ${text.toUpperCase()}`)) return label.slice(0, -text.length) + copy[key];
  }
  return label;
}
function syncRuntimeLocale(force = false): void {
  const root = hostRoot();
  const language = enchanterLanguage(document.documentElement.lang || 'en');
  if (!force && appliedCopyLanguage === language) return;
  appliedCopyLanguage = language;
  const copy = enchanterCopy(language);
  root.lang = language;
  root.dir = enchanterDirection(language);
  const info = document.getElementById('enchanter-info');
  if (info) {
    info.setAttribute('aria-label', copy.whatIsThis);
    info.lang = language;
    info.dir = enchanterDirection(language);
    if (buttonRenderer?.informationLocale) buttonRenderer.informationLocale(language);
    else {
      const information = informationFor(language);
      const header = info.querySelector('.tooltip__header');
      const body = info.querySelector('.tooltip__label');
      if (header) header.textContent = information.header;
      if (body) body.innerHTML = information.html;
    }
  }
  for (const [selector, text] of [
    ['.env-title', copy.title],
    ['.env-license a', copy.license]
  ]) {
    const node = root.querySelector(selector);
    if (node) node.textContent = text;
  }
  const promotionLabel = root.querySelector('#offline-promotion-label');
  if (promotionLabel) promotionLabel.textContent = copy.included;
  const credit = root.querySelector('.env-credit');
  if (credit) credit.textContent = copy.credit;
  if (buttonRenderer?.sceneLabel) buttonRenderer.sceneLabel(copy.spell);
  else {
    const label = root.querySelector('label[for="spell-select"]');
    if (label) label.textContent = copy.spell;
  }
  sizeSceneControl();
  root.querySelector('#spell-row')?.setAttribute('aria-label', copy.element);
  for (const button of root.querySelectorAll<HTMLElement>('[data-label-source]')) {
    const text = localizedLabel(button.dataset.labelSource!);
    if (!buttonRenderer?.label(button as HTMLButtonElement, text)) button.querySelector('.btn__label')?.replaceChildren(glyphText(text));
    if (button.closest('#begin-slot')) button.querySelector('.btn__label > span')?.setAttribute('id', 'begin-scramble');
    button.setAttribute('aria-label', text);
    const label = button.querySelector<HTMLElement>('.btn__label');
    if (label) label.dataset.stateLabel = text;
  }
  root.querySelector('[data-spell="ALL"]')?.setAttribute('title', copy.allHint);
  root.querySelector('[data-label-source="SNAPSHOT"]')?.setAttribute('title', copy.snapshotHint);
  syncPauseResumeButton();
  syncFullscreenButton();
}
const labelScrambles = new Map<HTMLElement, () => void>();

export function setRuntimeRoot(root: HTMLElement): void {
  runtimeRoot = root;
  appliedCopyLanguage = null;
  localeObserver?.disconnect();
  syncRuntimeLocale();
  localeObserver = new MutationObserver(() => syncRuntimeLocale());
  localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

export function resetEnchanterSession(): void {
  for (const cancel of labelScrambles.values()) cancel();
  labelScrambles.clear();
  localeObserver?.disconnect();
  localeObserver = null;
  environmentBuilt = false;
  informationCleanup?.();
  informationCleanup = null;
  sceneScramble?.settle();
  sceneScramble = null;
  sceneText = '';
  visualElement = 'EARTH';
  window.clearTimeout(hudTimer);
  window.clearTimeout(cursorHideTimer);
  window.clearTimeout(elementIntroTimer);
  elementIntroActive = false;
  fullscreenCleanup?.();
  fullscreenCleanup = null;
  peripheralScrambleCleanup?.();
  peripheralScrambleCleanup = null;
  beginEntranceCleanup?.();
  beginEntranceCleanup = null;
  appliedCopyLanguage = null;
  pauseResumeBtn = null;
  fullscreenBtn = null;
  elements.clear();
  reagents.clear();
  externalLogoCanvas = null;
  mode = 'boot';
  hostRoot().classList.remove('hide-cursor');
}

function hostRoot(): HTMLElement {
  return runtimeRoot ?? document.body;
}

export function setExternalLogoCanvas(canvas: SVGSVGElement | null): void {
  externalLogoCanvas = canvas;
}

let mode: Mode = 'boot';
/** Independently toggled Element Reagent maps. ALL is the mega-switch for all four. */
const selectedElements = new Set<ElementId>();
let activeSpellId = IDLE_PRESET;
let paused = false;
let hudTimer = 0;
let pauseResumeBtn: HTMLButtonElement | null = null;
let fullscreenBtn: HTMLButtonElement | null = null;
const CURSOR_HIDE_MS = 2500;
let cursorHideTimer = 0;

function bumpFullscreenCursor(): void {
  hostRoot().classList.remove('hide-cursor');
  window.clearTimeout(cursorHideTimer);
  if (!document.fullscreenElement) return;
  cursorHideTimer = window.setTimeout(() => {
    if (document.fullscreenElement) {
      hostRoot().classList.add('hide-cursor');
    }
  }, CURSOR_HIDE_MS);
}

/** Post-load auto tour: Earth first, then each Element alone until any button click. */
/** Matches the Element filter row: Earth → Fire → Water → Air. */
const ELEMENT_INTRO_ORDER: ElementId[] = [...ELEMENT_NAMES];
/** Hold Earth 5s after full load; then 3s per Element while cycling. */
const ELEMENT_INTRO_EARTH_MS = 5000;
const ELEMENT_INTRO_CYCLE_MS = 3000;
let elementIntroActive = false;
let elementIntroTimer = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function markButton(variant: string, color: string, label: string, hoverActive = false): HTMLButtonElement {
  if (buttonRenderer) {
    const button = buttonRenderer.create(variant, color, localizedLabel(label), hoverActive);
    button.dataset.labelSource = label;
    return button;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn--${variant} btn--${color}${hoverActive ? ' btn--hover-active' : ''}`;
  btn.innerHTML = `
    <span class="btn__face">
      <span class="btn__spin">
        <span class="btn__rail btn__rail--left">
          <span class="btn__mask btn__mask--tl" aria-hidden="true"><span class="btn__stroke btn__stroke--tl"></span></span>
          <span class="btn__mask btn__mask--bl" aria-hidden="true"><span class="btn__stroke btn__stroke--bl"></span></span>
        </span>
        <span class="btn__label"></span>
        <span class="btn__rail btn__rail--right">
          <span class="btn__mask btn__mask--tr" aria-hidden="true"><span class="btn__stroke btn__stroke--tr"></span></span>
          <span class="btn__mask btn__mask--br" aria-hidden="true"><span class="btn__stroke btn__stroke--br"></span></span>
        </span>
      </span>
    </span>`;
  const labelEl = btn.querySelector('.btn__label') as HTMLElement;
  btn.dataset.labelSource = label;
  labelEl.append(glyphText(localizedLabel(label)));
  return btn;
}

function markAnchor(label: string, href: string): HTMLAnchorElement {
  const rendered = markButton('link', 'white-orange', label, true);
  const anchor = document.createElement('a');
  anchor.className = rendered.className;
  anchor.dataset.labelSource = label;
  anchor.setAttribute('aria-label', localizedLabel(label));
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.replaceChildren(...Array.from(rendered.childNodes));
  return anchor;
}

/**
 * Wrap alchemical marks for Noto. One outer span — bare segments inside
 * `.btn__label` (inline-flex) each become flex items and trim spaces (`🜃 Core`).
 * Keep elemental glyphs distinct from surrounding text.
 */
function glyphText(text: string): HTMLSpanElement {
  const wrap = document.createElement('span');
  const pattern = /[🜃🜂🜄🜁]/gu;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) wrap.append(document.createTextNode(text.slice(last, index)));
    const span = document.createElement('span');
    span.className = 'class-glyph';
    span.textContent = match[0];
    wrap.append(span);
    last = index + match[0].length;
  }
  if (last < text.length) wrap.append(document.createTextNode(text.slice(last)));
  else if (last === 0) wrap.append(document.createTextNode(text));
  return wrap;
}

function cssDurationMs(value: string, fallback: number): number {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return fallback;
  return value.trim().endsWith('ms') ? amount : amount * 1000;
}

function setButtonLabel(btn: HTMLButtonElement, label: string): void {
  const labelEl = btn.querySelector('.btn__label') as HTMLElement | null;
  if (!labelEl) return;

  if (labelEl.dataset.stateLabel === label) return;
  const previous = labelEl.textContent ?? '';
  labelEl.dataset.stateLabel = label;
  labelScrambles.get(labelEl)?.();
  if (buttonRenderer?.label(btn, label, true)) return;
  if (previous === label || prefersReducedMotion()) {
    labelEl.replaceChildren(glyphText(label));
    return;
  }
  const scramble = mountAsciiScramble(labelEl, previous, { start: 'settled', classGlyph: true, speed: 2 });
  scramble.setText(label);
  labelScrambles.set(labelEl, scramble.play(() => labelScrambles.delete(labelEl)));
}

/** One HUD control — PAUSE and RESUME swap in place; width stays fixed. */
function syncPauseResumeButton(): void {
  if (!pauseResumeBtn) return;
  setButtonLabel(pauseResumeBtn, localizedLabel(paused ? 'RESUME' : 'PAUSE'));
  pauseResumeBtn.setAttribute('aria-label', localizedLabel(paused ? 'Resume' : 'Pause'));
}

/** One HUD control — FULLSCREEN and EXIT FULLSCREEN swap in place. */
function syncFullscreenButton(): void {
  if (!fullscreenBtn) return;
  const on = Boolean(document.fullscreenElement);
  setButtonLabel(fullscreenBtn, localizedLabel(on ? 'EXIT FULLSCREEN' : 'FULLSCREEN'));
  fullscreenBtn.setAttribute('aria-label', localizedLabel(on ? 'Exit fullscreen' : 'Fullscreen'));
  fullscreenBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

async function loadGrimoire(): Promise<void> {
  for (const name of ELEMENT_NAMES) {
    elements.set(name, grimoire.spells[name]);
    reagents.set(name, grimoire.reagents[name]);
  }
}

function allElementsSelected(): boolean {
  return ELEMENT_NAMES.every((name) => selectedElements.has(name));
}

function sizeSceneControl(): void {
  const select = document.getElementById('spell-select') as HTMLSelectElement | null;
  const control = select?.closest<HTMLElement>('.field__control');
  if (!select || !control) return;
  const style = getComputedStyle(select);
  const probe = document.createElement('span');
  Object.assign(probe.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre', font: style.font, letterSpacing: style.letterSpacing, writingMode: style.writingMode, textOrientation: style.textOrientation });
  probe.textContent = select.selectedOptions[0]?.textContent ?? '';
  control.append(probe);
  const vertical = style.writingMode.startsWith('vertical');
  const box = probe.getBoundingClientRect();
  const padding = vertical ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  control.style.setProperty('--scene-inline-size', `${Math.ceil((vertical ? box.height : box.width) + padding + 2)}px`);
  probe.remove();
  const text = select.selectedOptions[0]?.textContent ?? '';
  if (sceneScramble && text !== sceneText) {
    sceneText = text;
    sceneScramble.setText(text);
    if (prefersReducedMotion()) sceneScramble.settle();
    else sceneScramble.play();
  }
}

function paintElementChrome(): void {
  const allOn = allElementsSelected();
  document.querySelectorAll('[data-spell]').forEach((el) => {
    const key = el.getAttribute('data-spell');
    const on = key === 'AUTO' ? elementIntroActive
      : key === 'ALL' ? !elementIntroActive && allOn
      : key === visualElement;
    el.classList.toggle('btn--toggled', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    buttonRenderer?.pressed(el as HTMLButtonElement, on);
  });
}

function syncElementChrome(quickRandomStart = false): void {
  syncShellElement([...selectedElements], allElementsSelected() && !elementIntroActive, element => {
    visualElement = element;
    paintElementChrome();
  }, quickRandomStart);
  paintElementChrome();
  const select = document.getElementById('spell-select') as HTMLSelectElement | null;
  if (select) { select.value = activeSpellId; sizeSceneControl(); }
}

function selectedReagentPalettes(): NonNullable<ReagentFile['palette']>[] {
  return [...selectedElements]
    .map((name) => {
      const file = elements.get(name);
      return reagents.get(file?.reagent || name)?.palette ?? null;
    })
    .filter((palette): palette is NonNullable<ReagentFile['palette']> => palette != null);
}

/** Pin / morph using selected Element Reagent maps — never invented hues. */
function applySelectionColor(opts?: { immediate?: boolean }): void {
  const maps = selectedReagentPalettes();
  if (maps.length === 0) {
    releaseColorConstraint();
    return;
  }
  // Random holds one authored palette at a time; the engine owns its existing swap schedule.
  const palette = maps.length > 1 ? reagents.get(elements.get(visualElement)?.reagent || visualElement)?.palette ?? maps[0]! : maps[0]!;
  if (opts?.immediate) pinColorMap(palette);
  else constrainColor(palette);
}

/** Mode buttons own the cycling policy; individual buttons lock one element. */
function stopElementIntro(): void {
  elementIntroActive = false;
  if (elementIntroTimer) {
    window.clearTimeout(elementIntroTimer);
    elementIntroTimer = 0;
  }
}

function setSoloElement(id: ElementId): void {
  visualElement = id;
  selectedElements.clear();
  selectedElements.add(id);
  applySelectionColor();
  syncElementChrome();
}

function scheduleElementIntroStep(index: number): void {
  if (!elementIntroActive) return;
  const id = ELEMENT_INTRO_ORDER[index % ELEMENT_INTRO_ORDER.length]!;
  if (!paused) setSoloElement(id);
  elementIntroTimer = window.setTimeout(() => {
    scheduleElementIntroStep(paused ? index : index + 1);
  }, ELEMENT_INTRO_CYCLE_MS);
}

/**
 * After boot: Earth is preselected and held, then the cycle runs
 * FIRE → WATER → AIR → EARTH… until any button click.
 */
function startElementIntro(): void {
  stopElementIntro();
  elementIntroActive = true;
  // Preselect Earth before the first cycle.
  setSoloElement('EARTH');
  elementIntroTimer = window.setTimeout(() => {
    // First cycle step = FIRE (Earth already held).
    scheduleElementIntroStep(1);
  }, ELEMENT_INTRO_EARTH_MS);
}

async function selectElementFilter(key: 'AUTO' | 'ALL' | ElementId): Promise<void> {
  if (key === 'AUTO') { startElementIntro(); return; }
  stopElementIntro();
  if (key === 'ALL') {
    selectedElements.clear();
    for (const name of ELEMENT_NAMES) selectedElements.add(name);
  } else {
    // Solo like the shop — each Element press swaps the Reagent map.
    // Multi-add left maps[0] stuck on Earth so colors never changed on press.
    selectedElements.clear();
    selectedElements.add(key);
    visualElement = key;
  }
  applySelectionColor();
  syncElementChrome(key === 'ALL');
  // Every filter click: 3s tick-rate rush (climb → release). Re-click restarts it.
  rushTickRate();
  if (!isManifestationRunning()) resumeManifestation();
}

async function applySpellPattern(id: string): Promise<void> {
  // Contiguous preset morph — existing cells finish; new growth takes the new Spell.
  if (!(await applyPresetByName(id))) {
    syncElementChrome();
    return;
  }
  activeSpellId = id;
  applySelectionColor();
  syncElementChrome();
  if (!isManifestationRunning()) resumeManifestation();
}

function setMode(next: Mode): void {
  mode = next;
  hostRoot().dataset.mode = next;
  const environment = $('environment');
  const hud = $('enchantment-hud');
  hud.hidden = false;
  if (next !== 'environment') {
    hideCreatorPanels();
    hostRoot().classList.remove('environment-quiet');
  }
  const environmentVisible = next === 'boot' || next === 'environment';
  environment.inert = !environmentVisible || hostRoot().classList.contains('environment-quiet');
  environment.setAttribute(
    'aria-hidden',
    String(!environmentVisible || hostRoot().classList.contains('environment-quiet'))
  );
  const hudVisible = next === 'enchanting';
  hud.inert = !hudVisible;
  hud.setAttribute('aria-hidden', String(!hudVisible));
  if (!hudVisible) {
    hud.classList.remove('is-visible');
    window.clearTimeout(hudTimer);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable ||
    Boolean(target.closest('#enchanter-license-tooltip, #enchanter-license-panel'))
  );
}

function toggleEnvironmentChrome(): void {
  if (mode !== 'environment') return;
  hostRoot().classList.toggle('environment-quiet');
  const environment = $('environment');
  environment.inert = hostRoot().classList.contains('environment-quiet');
  environment.setAttribute(
    'aria-hidden',
    String(hostRoot().classList.contains('environment-quiet'))
  );
}

function showHud(show: boolean): void {
  const hud = $('enchantment-hud');
  const visible = mode === 'enchanting' && show;
  hud.hidden = false;
  hud.inert = !visible;
  hud.setAttribute('aria-hidden', String(!visible));
  if (mode !== 'enchanting') {
    hud.classList.remove('is-visible');
    return;
  }
  // Quint fade via .is-visible — do not snap with the hidden attribute.
  hud.classList.toggle('is-visible', show);
  window.clearTimeout(hudTimer);
  if (show) {
    hudTimer = window.setTimeout(() => {
      if (mode === 'enchanting' && !paused) {
        hud.classList.remove('is-visible');
      }
    }, HUD_IDLE_MS);
  }
}

function beginEnchantment(): void {
  setMode('enchanting');
  paused = false;
  hideCreatorPanels();
  syncPauseResumeButton();
  // Show chrome immediately — mouse-move alone must never be the only reveal.
  showHud(true);
  if (!isManifestationRunning()) resumeManifestation();
  const root = document.documentElement;
  if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
}

function pauseEnchantment(): void {
  if (mode !== 'enchanting' || paused) return;
  paused = true;
  // Soft hold — visuals freeze; engine ownership stays with the shell.
  pauseManifestation();
  syncPauseResumeButton();
  showHud(true);
}

function resumeEnchantment(): void {
  if (mode !== 'enchanting' || !paused) return;
  paused = false;
  resumeManifestation();
  syncPauseResumeButton();
  showHud(true);
}

function restartEnchantment(): void {
  if (mode !== 'enchanting') return;
  restartManifestation();
  paused = false;
  if (!isManifestationRunning()) resumeManifestation();
  syncPauseResumeButton();
  showHud(true);
}

function endEnchantment(): void {
  paused = false;
  returnToEnvironment();
}

function returnToEnvironment(): void {
  setMode('environment');
  if (!isManifestationRunning()) resumeManifestation();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function buildEnvironment(): void {
  if (environmentBuilt) return;
  environmentBuilt = true;
  const spellRow = $('spell-row');
  if (buttonRenderer) {
    $('selection-row').classList.add('enchanter-controls__filters');
    $('element-row').classList.add('enchanter-controls__filters');
  }
  spellRow.setAttribute('role', 'group');
  spellRow.setAttribute('aria-label', 'Element');

  // Auto / Random, then Earth / Fire / Water / Air.
  const filterOrder: Array<'AUTO' | 'ALL' | ElementId> = ['AUTO', 'ALL', ...ELEMENT_NAMES];

  for (let i = 0; i < filterOrder.length; i += 1) {
    const key = filterOrder[i]!;
    const wrap = document.createElement('div');
    // Each chip preserves its own staggered entrance.
    wrap.className = 'env-filter enchanter-controls__filter env-line';
    wrap.dataset.bootLine = String(i < 2 ? 5 + i : 6 + i);

    if (key === 'AUTO') {
      const button = markButton('filter-link', 'ethereal-orange', '🜃🜂🜄🜁 AUTO');
      button.dataset.spell = 'AUTO';
      button.addEventListener('click', () => { void selectElementFilter('AUTO'); });
      appendButton(wrap, button);
    } else if (key === 'ALL') {
      const allBtn = markButton('filter-link', 'ethereal-orange', '↻ RANDOM');
      allBtn.dataset.spell = 'ALL';
      allBtn.title = 'Random — switches between the four authored palettes';
      allBtn.addEventListener('click', () => {
        void selectElementFilter('ALL');
      });
      appendButton(wrap, allBtn);
    } else {
      const file = elements.get(key);
      const btn = markButton(
        'filter-link',
        ELEMENT_FILTER_COLOR[key],
        `${file?.glyph ?? ''} ${key}`.trim()
      );
      btn.dataset.spell = key;
      btn.addEventListener('click', () => {
        void selectElementFilter(key);
      });
      appendButton(wrap, btn);
    }

    if (i < 2) $('selection-row').insertBefore(wrap, $('spell-field-root'));
    else $('element-row').append(wrap);
  }

  const info = $('enchanter-info');
  buttonRenderer?.licenseBadge?.($('license-badge-slot'));
  if (buttonRenderer?.information) buttonRenderer.information(info);
  else info.innerHTML = `<div class="tooltip tooltip--bottom tooltip--caret-start tooltip--lines-text" style="--tooltip-text-max-width: 70ch"><span class="tooltip__caret" aria-hidden="true"><img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTQiIGhlaWdodD0iNiIgdmlld0JveD0iMCAwIDE0IDYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+Cgk8cGF0aCBkPSJNMCA2TDcgMEwxNCA2SDBaIiBmaWxsPSIjRjJFRUVBIi8+Cjwvc3ZnPgo=" alt="" width="14" height="6"></span><div class="tooltip__inner"><p class="tooltip__header">${informationHeader}</p><div class="tooltip__label">${informationHTML}</div></div></div>`;
  const infoButton = markButton('link', 'white-orange', 'What is this?', true);
  infoButton.style.setProperty('--btn-cursor', 'help');
  infoButton.setAttribute('aria-controls', 'enchanter-info');
  infoButton.setAttribute('aria-expanded', 'false');
  const informationEvents = new AbortController();
  let informationOpen = false;
  let informationAnimation: Animation | null = null;
  informationCleanup = () => { informationEvents.abort(); informationAnimation?.cancel(); };
  const setInformationOpen = (open: boolean) => {
    informationOpen = open;
    infoButton.setAttribute('aria-expanded', String(open));
    info.inert = !open;
    info.setAttribute('aria-hidden', String(!open));
    if (buttonRenderer?.informationOpen) {
      info.hidden = false;
      buttonRenderer.informationOpen(open);
      return;
    }
    const opacity = info.hidden ? 0 : Number(getComputedStyle(info).opacity);
    informationAnimation?.cancel();
    info.hidden = false;
    if (prefersReducedMotion()) { info.hidden = !open; return; }
    const style = getComputedStyle(info);
    const animation = info.animate([{opacity}, {opacity: open ? 1 : 0}], {
      duration: cssDurationMs(style.getPropertyValue('--duration-state'), 200),
      easing: style.getPropertyValue('--ease-quint-out').trim() || 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both'
    });
    informationAnimation = animation;
    animation.finished.then(() => {
      if (informationAnimation !== animation) return;
      info.hidden = !informationOpen;
      animation.cancel();
      informationAnimation = null;
    }, () => {});
  };
  infoButton.addEventListener('click', () => setInformationOpen(!informationOpen));
  document.addEventListener('pointerdown', event => {
    if (informationOpen && event.target instanceof Node && !info.contains(event.target) && !infoButton.contains(event.target)) setInformationOpen(false);
  }, { signal: informationEvents.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && informationOpen) {
      event.preventDefault();
      event.stopPropagation();
      setInformationOpen(false);
      infoButton.focus();
    }
  }, { signal: informationEvents.signal });
  if (buttonRenderer) appendButton($('info-slot'), infoButton);
  else $('info-slot').append(rimControlHost(infoButton));
  if (!buttonRenderer) {
    $('offline-top-links').append(rimControlHost(markAnchor('GitHub ↗', 'https://github.com/Ethereal-Artifacts/Enchanter')));
    $('offline-links').append(rimControlHost(markAnchor('Ethereal Artifacts ↗', 'https://ethereal-artifacts.systems')));
    const languagePicker = $('offline-locale');
    $('offline-links').append(languagePicker);
    mountLanguagePicker(languagePicker, label => markButton('link', 'white-orange', label, true), () => syncRuntimeLocale(true), informationEvents.signal);
    const promotion = $('offline-promotion');
    const promotionLabel = document.createElement('span');
    promotionLabel.id = 'offline-promotion-label';
    promotionLabel.textContent = enchanterCopy(document.documentElement.lang).included;
    promotion.append(promotionLabel, rimControlHost(markAnchor('ENCHNTD-USB-A-KY', 'https://ethereal-artifacts.systems/artifact/payload/enchanted-usb-a-key')));
    promotion.hidden = false;
  }

  const select = buttonRenderer?.scene?.($('spell-field-root'), enchanterCopy(document.documentElement.lang).spell)
    ?? $('spell-select') as HTMLSelectElement;
  if (!buttonRenderer?.scene) for (const spell of SPELL_PRESETS) {
    const opt = document.createElement('option');
    opt.value = spell.id;
    opt.textContent = spell.title;
    select.append(opt);
  }
  select.value = activeSpellId;
  const scenePaint = document.createElement('span');
  scenePaint.className = 'field__input scene-text';
  scenePaint.setAttribute('aria-hidden', 'true');
  select.classList.add('scene-select-scramble');
  select.closest('.field__control')?.append(scenePaint);
  const sceneInk = document.createElement('span');
  sceneInk.className = 'scene-text-value';
  scenePaint.append(sceneInk);
  sceneText = select.selectedOptions[0]?.textContent ?? '';
  sceneScramble = mountAsciiScramble(sceneInk, sceneText, { classGlyph: true, start: 'settled', build: false });
  void document.fonts.ready.then(sizeSceneControl);
  select.addEventListener('change', () => {
    sizeSceneControl();
    void applySpellPattern(select.value);
  });
  syncElementChrome();

  const begin = markButton('link', 'white-orange', 'CAST ENCHANTMENT', true);
  begin.addEventListener('click', () => {
    beginEnchantment();
  });
  appendButton($('begin-slot'), begin);

  const endBtn = markButton('link', 'white-orange', 'END', true);
  endBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    endEnchantment();
  });
  appendButton($('hud-actions'), endBtn);

  pauseResumeBtn = markButton('link', 'white-orange', 'PAUSE', true);
  pauseResumeBtn.classList.add('hud-pause-resume');
  pauseResumeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (paused) resumeEnchantment();
    else pauseEnchantment();
  });
  appendButton($('hud-actions'), pauseResumeBtn);
  syncPauseResumeButton();

  const hudActions: Array<[string, string | undefined, () => void]> = [
    ['RESTART', undefined, restartEnchantment],
    ['SNAPSHOT', 'Save one PNG frame from the canvas', () => snapshotManifestation()]
  ];
  hudActions.forEach(([label, title, fn]) => {
    const btn = markButton('link', 'white-orange', label, true);
    if (title) btn.title = title;
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      fn();
    });
    appendButton($('hud-actions'), btn);
  });

  fullscreenBtn = markButton('link', 'white-orange', 'FULLSCREEN', true);
  fullscreenBtn.classList.add('hud-fullscreen');
  fullscreenBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFullscreen();
  });
  appendButton($('hud-actions'), fullscreenBtn);
  syncFullscreenButton();
  const onFullscreenChange = () => {
    syncFullscreenButton();
    if (document.fullscreenElement) bumpFullscreenCursor();
    else {
      window.clearTimeout(cursorHideTimer);
      hostRoot().classList.remove('hide-cursor');
    }
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);
  fullscreenCleanup = () => document.removeEventListener('fullscreenchange', onFullscreenChange);

  const returnBtn = markButton('filled-white', 'default', 'RETURN');
  returnBtn.addEventListener('click', returnToEnvironment);
  appendButton($('return-slot'), returnBtn);

  syncRuntimeLocale(true);
  begin.querySelector('.btn__label > span')?.setAttribute('id', 'begin-scramble');
  const licenseLink = document.querySelector<HTMLAnchorElement>('.env-license a');
  const licenseDetails = document.getElementById('enchanter-license') as HTMLDetailsElement | null;
  if (licenseLink?.parentElement) {
    const licenseHost = licenseLink.parentElement;
    if (!buttonRenderer) licenseHost.classList.add('offline-license-host');
    const licenseButton = markButton('link', 'white-orange', 'License', true);
    licenseButton.style.setProperty('--btn-cursor', 'help');
    licenseButton.setAttribute('aria-label', 'Hippocratic License 3.0');
    if (!buttonRenderer) {
      // Reuse the existing standalone Tooltip markup and canonical styles.
      const tip = document.createElement('div');
      tip.id = 'enchanter-license-tooltip';
      // Legal language is fixed; presentation still follows the page writing plane.
      tip.lang = 'en';
      tip.dir = 'ltr';
      tip.setAttribute('role', 'tooltip');
      tip.tabIndex = 0;
      tip.setAttribute('aria-hidden', 'true');
      const shell = info.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
      if (shell) {
        shell.querySelector('.tooltip__header')!.textContent = 'Enchanter';
        const body = shell.querySelector('.tooltip__label')!;
        body.replaceChildren();
        const agreement = document.createElement('p');
        const emphasis = document.createElement('strong');
        emphasis.textContent = 'By using this software, you agree';
        agreement.append(emphasis, enchanterLicense.agreement.slice('By using this software, you agree'.length));
        const policy = document.createElement('p');
        policy.textContent = enchanterLicense.eventPolicy;
        const ethos = document.createElement('p');
        ethos.textContent = enchanterLicense.ethos;
        const citation = document.createElement('p');
        citation.textContent = enchanterLicense.discriminationCitation;
        const divider = document.createElement('hr');
        divider.className = 'license-agreement-divider';
        const description = document.createElement('p');
        description.textContent = enchanterLicense.description;
        const scope = document.createElement('p');
        scope.textContent = enchanterLicense.scope;
        body.append(agreement, policy, ethos, citation, divider, description, scope);
        const terms = licenseDetails?.querySelector('pre')?.cloneNode(true) as HTMLElement | undefined;
        if (terms) { terms.className = 'license-tooltip-text'; body.append(terms); }
        tip.append(shell);
      }
      hostRoot().append(tip);
      licenseButton.setAttribute('aria-describedby', tip.id);
      const showTip = (show: boolean) => {
        const face = licenseButton.querySelector('.btn__face')!.getBoundingClientRect();
        const left = Math.max(16, Math.min(face.left, innerWidth - tip.offsetWidth - 16));
        tip.style.left = `${left}px`;
        tip.style.top = `${face.bottom + 8}px`;
        shell?.classList.add('tooltip--caret-offset');
        shell?.style.setProperty('--tooltip-caret-offset', `${face.left + face.width / 2 - left}px`);
        tip.classList.toggle('is-open', show);
        tip.setAttribute('aria-hidden', String(!show));
        if (show) tip.focus({ preventScroll: true });
      };
      const opts = { signal: informationEvents.signal };
      licenseButton.addEventListener('click', () => showTip(!tip.classList.contains('is-open')), opts);
      document.addEventListener('pointerdown', event => {
        if (tip.classList.contains('is-open') && event.target instanceof Node && !tip.contains(event.target) && !licenseButton.contains(event.target)) showTip(false);
      }, opts);
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && tip.classList.contains('is-open')) { showTip(false); licenseButton.focus(); } }, opts);
    }
    licenseHost.replaceChildren();
    licenseHost.append(buttonRenderer?.host(licenseButton) ?? rimControlHost(licenseButton));
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function showBootLine(line: HTMLElement): void {
  line.inert = false;
  line.classList.add('is-shown');
  if (line.id === 'begin-slot' && !prefersReducedMotion()) {
    beginEntranceCleanup?.();
    beginEntranceCleanup = scrambleButtonEntrance(line, startVesselCircleReveal);
  }
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => { window.clearTimeout(timer); reject(signal?.reason); };
    const timer = window.setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const LOGO_THINK_ITERATIONS = 10;

// Populate the existing shell before measuring the PAL handoff destination.
export async function prepareEnvironment(): Promise<void> {
  await loadGrimoire();
  buildEnvironment();
}

export async function boot(signal?: AbortSignal, beforeReveal?: () => Promise<void>): Promise<void> {
  const assertActive = () => signal?.throwIfAborted();
  assertActive();
  // Logo processes at top of the centered group (≥10 think moves), then UI fades in.
  setMode('boot');
  hideCreatorPanels();
  hostRoot().removeAttribute('data-creator');

  const logoHost = $('logo-host');
  const runtime = externalLogoCanvas ? null : createRuntime();
  if (runtime) {
    logoHost.append(runtime.canvas);
    runtime.resize();
    runtime.setWorking(true);
  } else if (externalLogoCanvas) {
    logoHost.append(externalLogoCanvas);
  }

  const logoReady = (async () => {
    // Original finish: N think moves → setWorking(false) → shortest return to Ether static.
    if (!runtime) return;
    await runtime.waitForThinkMoves(LOGO_THINK_ITERATIONS);
    runtime.setWorking(false);
    await runtime.waitUntilStatic();
    // Stop the loop; keep the settled static SVG image.
    runtime.dispose();
  })();

  const engineReady = (async () => {
    await prepareEnvironment();
    assertActive();
    // Earth is the default map before any cell can spawn — snap, don't wait for intro.
    selectedElements.clear();
    selectedElements.add('EARTH');
    applySelectionColor({ immediate: true });
    syncElementChrome();
    await startEngine();
    assertActive();
    // Hold through boot; applyPreset clears hold, so re-assert after it.
    pauseManifestation();
    // Invisible stencil — cells may grow underneath; paint stays gated until rim reveal.
    armVesselRevealMask();
    activeSpellId = IDLE_PRESET;
    await applyPresetByName(IDLE_PRESET);
    pauseManifestation();
    armVesselRevealMask();
    // Preset apply must not leave the Vessel on a calculated scheme.
    applySelectionColor({ immediate: true });
    syncElementChrome();
    await finalizeBindBootstrap();
    pauseManifestation();
    armVesselRevealMask();
  })();

  await Promise.all([logoReady, engineReady]);
  assertActive();
  await beforeReveal?.();
  assertActive();

  setMode('environment');
  hideCreatorPanels();

  // Read down the centered layout; filter chips retain their 300ms stagger.
  const LINE_MS = 1000;
  const FILTER_STAGGER_MS = 300;
  const FILTER_LINE_FIRST = 5;
  const FILTER_LINE_LAST = 11;
  const reducedMotion = prefersReducedMotion();
  const lines = Array.from(
    document.querySelectorAll<HTMLElement>('[data-boot-line]')
  ).filter(el => el.id !== 'license-badge-slot' || el.childElementCount > 0).sort(
    (a, b) => Number(a.dataset.bootLine || 0) - Number(b.dataset.bootLine || 0)
  );
  const before = lines.filter((el) => Number(el.dataset.bootLine) < FILTER_LINE_FIRST);
  const filters = lines.filter((el) => {
    const n = Number(el.dataset.bootLine);
    return n >= FILTER_LINE_FIRST && n <= FILTER_LINE_LAST;
  });
  const after = lines.filter((el) => Number(el.dataset.bootLine) > FILTER_LINE_LAST);

  if (reducedMotion) {
    for (const line of lines) showBootLine(line);
    skipVesselReveal();
    resumeManifestation();
  } else {
    for (const line of before) {
      if (line.classList.contains('is-shown')) continue;
      showBootLine(line);
      await waitMs(LINE_MS, signal);
      assertActive();
    }

    for (let i = 0; i < filters.length; i += 1) {
      showBootLine(filters[i]!);
      if (i < filters.length - 1) await waitMs(FILTER_STAGGER_MS, signal);
      assertActive();
    }
    // Filters finished intro-ing — tick/sim may run under the stencil from here.
    resumeManifestation();
    // Begin inherits the former final website reveal at +3s after simulation starts.
    if (filters.length > 0 && after.length > 0) await waitMs(3 * LINE_MS, signal);
      assertActive();

    for (let i = 0; i < after.length; i += 1) {
      showBootLine(after[i]!);
      if (i < after.length - 1) await waitMs(LINE_MS, signal);
      assertActive();
    }
  }
  assertActive();
  await waitForActiveRendering(signal);
  hostRoot().dataset.animationReady = 'true';
  hostRoot().classList.add('is-ready');
  void waitForActiveRendering(signal, { afterRipple: true }).then(() => {
    if (!signal?.aborted) {
      // Keep Earth pinned through the entire ripple; arm the authored cycle
      // only after the renderer confirms a completed reveal.
      startElementIntro();
      const stops = ['info-slot', 'offline-links', 'offline-top-links', 'offline-promotion'].map(id => {
        const node = document.getElementById(id);
        return node ? scrambleButtonEntrance(node) : () => {};
      });
      peripheralScrambleCleanup = () => stops.forEach(stop => stop());
      hostRoot().dataset.rippleReady = 'true';
    }
  }).catch(() => {});
}

function onPointerActivity(): void {
  if (mode === 'enchanting') showHud(true);
}

function armShellPointerListeners(): void {
  const reveal = () => {
    bumpFullscreenCursor();
    onPointerActivity();
  };
  // Capture on window so fullscreen / overlay targets still reveal the HUD.
  window.addEventListener('pointermove', reveal, { capture: true, passive: true });
  window.addEventListener('mousemove', reveal, { capture: true, passive: true });
  window.addEventListener('pointerdown', reveal, { capture: true, passive: true });
  shellPointerCleanup = () => {
    window.removeEventListener('pointermove', reveal, true);
    window.removeEventListener('mousemove', reveal, true);
    window.removeEventListener('pointerdown', reveal, true);
  };
}

export function armEnchanterInteractions(): () => void {
  hideCreatorPanels();
  armShellPointerListeners();

  const onKeydown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      if (document.fullscreenElement) {
        event.preventDefault();
        document.exitFullscreen().catch(() => {});
      }
      return;
    }
    if (event.code === 'Space' && event.shiftKey) return;
    if (isTypingTarget(event.target)) return;
    if (mode === 'enchanting') {
      onPointerActivity();
      if (event.code === 'Space') {
        event.preventDefault();
        if (paused) resumeEnchantment();
        else pauseEnchantment();
      }
      if (event.key.toLowerCase() === 's' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        snapshotManifestation();
      }
      return;
    }
    if (mode === 'environment' && event.code === 'Space') {
      event.preventDefault();
      toggleEnvironmentChrome();
    }
  };
  document.addEventListener('keydown', onKeydown);
  return () => {
    document.removeEventListener('keydown', onKeydown);
    shellPointerCleanup?.();
    shellPointerCleanup = null;
  };
}

document.addEventListener('DOMContentLoaded', () => {
  setRuntimeRoot(document.body);
  void boot();
  armEnchanterInteractions();
});
