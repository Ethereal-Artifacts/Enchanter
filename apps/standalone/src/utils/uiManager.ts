// @ts-nocheck
/**
 * Enchanter - UI Manager
 *
 * Handles all aspects of the user interface for parameter control:
 * - Creates and manages sliders, controls, and selectors
 * - Updates visual representation of parameter values
 * - Handles parameter changes and updates configuration
 * - Organizes UI components in the parameter panel
 * - Provides real-time feedback on parameter adjustments
 */

import { config } from '@ethereal/enchanter-core/config';
import { availableSchemes } from '@ethereal/enchanter-core/utils/colorTheory';
import { ParameterDefinition, Config, HSB } from '@ethereal/enchanter-core/types';
import { presetManager } from './presetManager.js';

interface ColorScheme {
  name: string;
  colors: HSB[];
}

// Export an object to store slider references by config path.
export const parameterSliders: Record<string, { slider: HTMLInputElement; valueDisplay: HTMLSpanElement }> = {};

let presetSelect: HTMLSelectElement | null = null;
let schemeSelect: HTMLSelectElement | null = null;
let applyPresetFn: ((name: string) => boolean | Promise<boolean>) | null = null;

// Add a new parameter for Hue (colorSettings.baseH) here as requested.
export const PARAM_DEFINITIONS: ParameterDefinition[] = [
  {
    path: "cellSize",
    label: "Cell Size",
    description: "Larger cells = chunkier visuals; smaller = finer details.",
    min: config.minCellSize,
    max: config.maxCellSize,
    step: 1,
    type: "range"
  },
  {
    path: "tickRate",
    label: "Simulation Speed (Ticks/sec)",
    description: "Higher = faster animation & updates.",
    min: config.minTickRate,
    max: config.maxTickRate,
    step: 1,
    type: "range"
  },
  {
    path: "activeCellDensity",
    label: "Target Coverage",
    description: "Desired fraction of cells active (0.0 - 1.0).",
    min: 0.1,
    max: 1.0,
    step: 0.01,
    type: "range"
  },
  {
    path: "decay.baseDelay",
    label: "Decay Delay",
    description: "Ticks before a new cell is allowed to decay.",
    min: 0,
    max: 500,
    step: 10,
    type: "range"
  },
  {
    path: "decay.baseDecayChance",
    label: "Decay Chance",
    description: "Initial probability a cell fades each tick (0 - 1).",
    min: 0,
    max: 1,
    step: 0.01,
    type: "range"
  },
  {
    path: "creepingFig.baseActivations",
    label: "Growth Attempts",
    description: "Expansions a single active cell tries per tick.",
    min: 1,
    max: 20,
    step: 1,
    type: "range"
  },
  {
    path: "creepingFig.neighborRadius",
    label: "Spread Radius",
    description: "Max distance a cell can expand in one step.",
    min: 1,
    max: 5,
    step: 1,
    type: "range"
  },
  {
    path: "creepingFig.branchAge",
    label: "Branching Age",
    description: "Ticks a cell must live before spawning new branches.",
    min: 0,
    max: 30,
    step: 1,
    type: "range"
  },
  {
    path: "creepingFig.directionFollowChance",
    label: "Directional Persistence",
    description: "Chance of continuing along the same path (0 - 1).",
    min: 0,
    max: 1,
    step: 0.01,
    type: "range"
  },
  {
    path: "binaryTransitions.enabled",
    label: "Binary Death Switch",
    description: "Fully opaque vs. dead once alpha < threshold.",
    type: "checkbox"
  },
  {
    path: "binaryTransitions.threshold",
    label: "Binary Death Threshold",
    description: "Alpha cutoff; below => cell dies immediately.",
    min: 0,
    max: 1,
    step: 0.01,
    type: "range"
  },
  {
    path: "colorSettings.baseH",
    label: "Hue",
    description: "Base Hue (0 - 360°).",
    min: 0,
    max: 360,
    step: 1,
    type: "range"
  }
];

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

type UpdateConfigFunction = {
  (path: string, value: number): void;
  (path: string, value: string): void;
  (path: string, value: boolean): void;
};

function createRange(def: ParameterDefinition, updateConfigFn: UpdateConfigFunction): HTMLDivElement {
  const container = document.createElement('div');
  container.classList.add('slider-container');

  const label = document.createElement('label');
  label.textContent = def.label;

  const desc = document.createElement('p');
  desc.classList.add('param-desc');
  desc.textContent = def.description;

  const slider = document.createElement('input') as HTMLInputElement;
  slider.type = 'range';
  if (def.min !== undefined) slider.setAttribute('min', def.min.toString());
  if (def.max !== undefined) slider.setAttribute('max', def.max.toString());
  if (def.step !== undefined) slider.setAttribute('step', def.step.toString());
  slider.setAttribute('value', getConfigValueByPath(def.path).toString());

  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = (Math.round(parseFloat(slider.value) * 100) / 100).toString();



  slider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    valueDisplay.textContent = (Math.round(val * 100) / 100).toString();
    config._overrides[def.path] = true;
    setConfigValueByPath(def.path, val);
    updateConfigFn(def.path, val);
  });



  container.appendChild(label);
  container.appendChild(desc);
  container.appendChild(slider);
  container.appendChild(valueDisplay);

  parameterSliders[def.path] = { slider, valueDisplay };

  return container;
}

function createCheckbox(def: ParameterDefinition, updateConfigFn: UpdateConfigFunction): HTMLDivElement {
  const container = document.createElement('div');
  container.classList.add('checkbox-container');

  const label = document.createElement('label');
  label.textContent = def.label;

  const desc = document.createElement('p');
  desc.classList.add('param-desc');
  desc.textContent = def.description;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!getConfigValueByPath(def.path);

  checkbox.addEventListener('change', (e) => {
    const val = (e.target as HTMLInputElement).checked;
    setConfigValueByPath(def.path, val);
    updateConfigFn(def.path, val);
  });

  container.appendChild(label);
  container.appendChild(desc);
  container.appendChild(checkbox);
  return container;
}

function createColorSettings(updateConfigFn: UpdateConfigFunction): HTMLDivElement {
  const container = document.createElement('div');
  container.classList.add('slider-container');

  container.appendChild(createRange({
    path: "colorSettings.baseS",
    label: "Saturation",
    description: "Base saturation (0 - 100%).",
    min: 0,
    max: 100,
    step: 1,
    type: "range"
  }, updateConfigFn));
  container.appendChild(createRange({
    path: "colorSettings.baseB",
    label: "Brightness",
    description: "Base brightness (0 - 100%).",
    min: 0,
    max: 100,
    step: 1,
    type: "range"
  }, updateConfigFn));

  const schemeContainer = document.createElement('div');
  schemeContainer.classList.add('checkbox-container');

  const schemeLabel = document.createElement('label');
  schemeLabel.textContent = "Color Scheme";
  schemeContainer.appendChild(schemeLabel);

  const schemeDesc = document.createElement('p');
  schemeDesc.classList.add('param-desc');
  schemeDesc.textContent = "Select a color scheme.";
  schemeContainer.appendChild(schemeDesc);

  schemeSelect = document.createElement('select');
  schemeSelect.id = 'color-scheme-select';
  availableSchemes.forEach(schemeName => {
    const option = document.createElement('option');
    option.value = schemeName;
    option.textContent = schemeName;
    schemeSelect!.appendChild(option);
  });

  schemeSelect.value = config.colorSettings.scheme;

  schemeSelect.addEventListener('change', (e) => {
    const schemeName = (e.target as HTMLSelectElement).value;
    config.colorSettings.scheme = schemeName;
    updateConfigFn("colorScheme", schemeName);
  });

  schemeContainer.appendChild(schemeSelect);
  container.appendChild(schemeContainer);

  return container;
}

function createPresetSelector(): HTMLDivElement {
  const container = document.createElement('div');
  container.classList.add('checkbox-container');

  const label = document.createElement('label');
  label.setAttribute('for', 'preset-select');
  label.textContent = 'Preset';
  container.appendChild(label);

  const desc = document.createElement('p');
  desc.classList.add('param-desc');
  desc.textContent = 'Load any preset while the panels are open.';
  container.appendChild(desc);

  presetSelect = document.createElement('select');
  presetSelect.id = 'preset-select';
  presetSelect.setAttribute('aria-label', 'Preset');
  const select = presetSelect;
  presetManager.getPresetNames().forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    if (applyPresetFn) void applyPresetFn(select.value);
  });

  container.appendChild(select);
  return container;
}

export function syncCreatorPreset(name: string): void {
  if (presetSelect && Array.from(presetSelect.options).some((option) => option.value === name)) {
    presetSelect.value = name;
  }
  if (schemeSelect) {
    schemeSelect.value = config.colorSettings.scheme;
  }
}

export function setupUI(
  updateConfigFn: UpdateConfigFunction,
  onApplyPreset?: (name: string) => boolean | Promise<boolean>
): void {
  applyPresetFn = onApplyPreset || null;
  const glassInner = document.querySelector('#parametersPanel .glass-inner') as HTMLElement;
  const title = document.createElement('h3');
  title.textContent = "Parameters";
  glassInner.appendChild(title);
  glassInner.appendChild(createPresetSelector());

  PARAM_DEFINITIONS.forEach(def => {
    let control: HTMLElement | undefined;
    if (def.type === 'range') {
      control = createRange(def, updateConfigFn);
    } else if (def.type === 'checkbox') {
      control = createCheckbox(def, updateConfigFn);
    }
    if (control) glassInner.appendChild(control);
  });
  glassInner.appendChild(createColorSettings(updateConfigFn));
}
