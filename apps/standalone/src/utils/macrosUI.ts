/**
 * Enchanter - Macro UI
 *
 * Implements the user interface for creating and controlling parameter macros:
 * - Provides controls for creating, editing and removing macros
 * - Manages UI for setting macro targets, waveforms, and modulation depths
 * - Handles real-time visualization of macro activity
 * - Maintains the collection of active macros
 * - Synchronizes UI state with the underlying macro system
 */

import { Macro } from './macros.js';
import { config } from '@ethereal/enchanter-core/config';
import { presetManager } from './presetManager.js';

interface ParamDef {
  path: string;
  label: string;
}

interface TrigFunction {
  value: string;
  label: string;
}

interface PeriodChoice {
  value: number;
  label: string;
}

interface MacroTarget {
  path: string;
  baseline?: number;
}

export const macros: Macro[] = [];

let loadedPresetLabel: HTMLElement | null = null;

export function setLoadedPresetName(name: string): void {
  if (loadedPresetLabel) loadedPresetLabel.textContent = `Loaded Preset: ${name}`;
}

// Updated list of available parameters for macros (excluding cellSize)
// Now includes "Binary Death Threshold" and "Hue".
const paramDefs: ParamDef[] = [
  { path: "tickRate", label: "Tick Rate" },
  { path: "activeCellDensity", label: "Target Coverage" },
  { path: "decay.baseDelay", label: "Decay Delay" },
  { path: "decay.baseDecayChance", label: "Decay Chance" },
  { path: "creepingFig.baseActivations", label: "Growth Attempts" },
  { path: "creepingFig.neighborRadius", label: "Spread Radius" },
  { path: "creepingFig.branchAge", label: "Branching Age" },
  { path: "creepingFig.directionFollowChance", label: "Directional Persistence" },
  { path: "binaryTransitions.threshold", label: "Binary Death Threshold" },
  { path: "colorSettings.baseH", label: "Hue" }
];

const trigFunctions: TrigFunction[] = [
  { value: "sin", label: "sin" },
  { value: "cos", label: "cos" },
  { value: "tan", label: "tan" },
  { value: "csc", label: "csc" },
  { value: "sec", label: "sec" },
  { value: "cot", label: "cot" }
];

// Updated period multiplier choices: from 1/64 to x8
const periodChoices: PeriodChoice[] = [
  { value: 0.015625, label: "×1/64" },
  { value: 0.03125, label: "×1/32" },
  { value: 0.0625, label: "×1/16" },
  { value: 0.125, label: "×1/8" },
  { value: 0.25, label: "×1/4" },
  { value: 0.5, label: "×1/2" },
  { value: 1.0, label: "×1" },
  { value: 2.0, label: "×2" },
  { value: 4.0, label: "×4" },
  { value: 8.0, label: "×8" }
];

export function setupMacrosUI(onMacroChange: (macro: Macro | null) => void): void {
  const container = document.querySelector('#macrosPanel .glass-inner');
  if (!container) return;

  container.innerHTML = '<h3>Macros & LFO</h3>';

  loadedPresetLabel = document.createElement('div');
  loadedPresetLabel.style.marginBottom = '12px';
  loadedPresetLabel.style.padding = '8px';
  loadedPresetLabel.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  loadedPresetLabel.style.borderRadius = '4px';
  loadedPresetLabel.style.fontSize = '14px';
  loadedPresetLabel.style.color = '#ccc';
  loadedPresetLabel.textContent = 'Loaded Preset: —';
  container.appendChild(loadedPresetLabel);

  // Create button container for better layout
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '8px';
  buttonContainer.style.marginBottom = '8px';

  const addMacroBtn = document.createElement('button');
  addMacroBtn.textContent = "Add Macro";
  addMacroBtn.addEventListener('click', () => {
    const macro = new Macro();
    macro.targets = [];
    macro.useCurrentBaseline = false;
    macro.trigFunc = "sin";
    macro.periodMultiplier = 1.0;
    macro.lfoPeriod = 100;
    macro.dampener = 0.5;
    macro.enabled = true;
    macros.push(macro);
    renderMacro(macro, container, onMacroChange);
    if (onMacroChange) onMacroChange(macro);
  });

  const savePresetBtn = document.createElement('button');
  savePresetBtn.textContent = "Save Preset";
  savePresetBtn.addEventListener('click', async () => {
    try {
      const presetName = await presetManager.saveCurrentConfig();
      savePresetBtn.textContent = `Saved: ${presetName}`;
      setTimeout(() => {
        savePresetBtn.textContent = "Save Preset";
      }, 2000);
    } catch (error) {
      savePresetBtn.textContent = "Error Saving";
      setTimeout(() => {
        savePresetBtn.textContent = "Save Preset";
      }, 2000);
    }
  });

  buttonContainer.appendChild(addMacroBtn);
  buttonContainer.appendChild(savePresetBtn);
  container.appendChild(buttonContainer);

  // Render existing macros that were loaded from preset
  console.log(`Rendering ${macros.length} existing macros in UI`);
  console.log('Macros to render:', macros);
  macros.forEach((macro, index) => {
    console.log(`Rendering macro ${index}:`, macro);
    renderMacro(macro, container, onMacroChange);
  });
}

function renderMacro(macro: Macro, container: Element, onMacroChange: (macro: Macro | null) => void): void {
  const macroDiv = document.createElement('div');
  macroDiv.classList.add('macro-item');
  macroDiv.style.display = 'flex';
  macroDiv.style.flexDirection = 'column';
  macroDiv.style.gap = '8px';
  macroDiv.style.borderRadius = '8px';
  macroDiv.style.padding = '8px';

  renderMacroContents(macro, macroDiv, onMacroChange);
  container.appendChild(macroDiv);
}

function renderMacroContents(macro: Macro, macroDiv: HTMLElement, onMacroChange: (macro: Macro | null) => void): void {
  macroDiv.innerHTML = "";

  // 1) Parameter Instances
  macro.targets.forEach((tgt: MacroTarget, index: number) => {
    // Filter available options: only those not used (except for current tgt)
    const usedPaths = macro.targets.map(item => item.path);
    const availableOptions = paramDefs.filter(def => def.path === tgt.path || !usedPaths.includes(def.path));

    const paramContainer = document.createElement('div');
    paramContainer.style.display = 'flex';
    paramContainer.style.flexDirection = 'column';
    paramContainer.style.gap = '8px';
    paramContainer.style.border = '1px solid #444';
    paramContainer.style.padding = '6px';

    // Row: "Parameter:" label + dropdown
    const rowParam = document.createElement('div');
    rowParam.style.display = 'flex';
    rowParam.style.alignItems = 'center';
    rowParam.style.gap = '8px';

    const labelParam = document.createElement('label');
    labelParam.textContent = "Parameter:";
    rowParam.appendChild(labelParam);

    const paramSelect = document.createElement('select');
    paramSelect.style.flex = '1';
    availableOptions.forEach(def => {
      const opt = document.createElement('option');
      opt.value = def.path;
      opt.textContent = def.label;
      paramSelect.appendChild(opt);
    });
    paramSelect.value = tgt.path;
    paramSelect.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLSelectElement;
      tgt.path = target.value;
      if (onMacroChange) onMacroChange(macro);
    });
    rowParam.appendChild(paramSelect);
    paramContainer.appendChild(rowParam);



    // Remove parameter button (stacked below)
    const removeParamBtn = document.createElement('button');
    removeParamBtn.textContent = "Remove";
    removeParamBtn.addEventListener('click', () => {
      macro.targets.splice(index, 1);
      renderMacroContents(macro, macroDiv, onMacroChange);
      if (onMacroChange) onMacroChange(macro);
    });
    paramContainer.appendChild(removeParamBtn);

    macroDiv.appendChild(paramContainer);
  });

  // 2) "Add Parameter" button
  const addParamBtn = document.createElement('button');
  addParamBtn.textContent = "Add Parameter";

  // Determine available options not already used
  const usedPaths = macro.targets.map(item => item.path);
  const availableOptions = paramDefs.filter(def => !usedPaths.includes(def.path));

  if (availableOptions.length > 0) {
    addParamBtn.addEventListener('click', () => {
      macro.targets.push({ path: availableOptions[0].path });
      renderMacroContents(macro, macroDiv, onMacroChange);
      if (onMacroChange) onMacroChange(macro);
    });
  } else {
    addParamBtn.disabled = true;
    addParamBtn.textContent = "No Parameters Available";
    addParamBtn.style.opacity = '0.5';
  }

  macroDiv.appendChild(addParamBtn);

  // 3) LFO Controls
  // 3a) Row: "Trig Function:" + dropdown
  const rowTrig = document.createElement('div');
  rowTrig.style.display = 'flex';
  rowTrig.style.alignItems = 'center';
  rowTrig.style.gap = '8px';

  const labelTrig = document.createElement('label');
  labelTrig.textContent = "Trig Function:";
  rowTrig.appendChild(labelTrig);

  const trigSelect = document.createElement('select');
  trigSelect.style.flex = '1';
  trigFunctions.forEach(tf => {
    const opt = document.createElement('option');
    opt.value = tf.value;
    opt.textContent = tf.label;
    trigSelect.appendChild(opt);
  });
  trigSelect.value = macro.trigFunc || "sin";
  trigSelect.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLSelectElement;
    macro.trigFunc = target.value;
    if (onMacroChange) onMacroChange(macro);
  });
  rowTrig.appendChild(trigSelect);
  macroDiv.appendChild(rowTrig);

  // 3b) Row: "Period (× tickRate):" + dropdown
  const rowPeriod = document.createElement('div');
  rowPeriod.style.display = 'flex';
  rowPeriod.style.alignItems = 'center';
  rowPeriod.style.gap = '8px';

  const labelPeriod = document.createElement('label');
  labelPeriod.textContent = "Period (× tickRate):";
  rowPeriod.appendChild(labelPeriod);

  const periodSelect = document.createElement('select');
  periodSelect.style.flex = '1';
  periodChoices.forEach(pc => {
    const opt = document.createElement('option');
    opt.value = String(pc.value);
    opt.textContent = pc.label;
    periodSelect.appendChild(opt);
  });
  periodSelect.value = String(macro.periodMultiplier || 1.0);
  periodSelect.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLSelectElement;
    macro.periodMultiplier = parseFloat(target.value);
    if (onMacroChange) onMacroChange(macro);
  });
  rowPeriod.appendChild(periodSelect);
  macroDiv.appendChild(rowPeriod);

  // 3c) Row: "Dampener (0–1):" + slider
  const rowDamp = document.createElement('div');
  rowDamp.style.display = 'flex';
  rowDamp.style.alignItems = 'center';
  rowDamp.style.gap = '8px';

  const labelDamp = document.createElement('label');
  labelDamp.textContent = "Dampener (0–1):";
  rowDamp.appendChild(labelDamp);

  const dampSlider = document.createElement('input');
  dampSlider.type = 'range';
  dampSlider.min = '0';
  dampSlider.max = '1';
  dampSlider.step = '0.01';
  dampSlider.style.flex = '1';
  dampSlider.value = String(macro.dampener || 0.5);
  dampSlider.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    macro.dampener = parseFloat(target.value);
    if (onMacroChange) onMacroChange(macro);
  });
  rowDamp.appendChild(dampSlider);
  macroDiv.appendChild(rowDamp);

  // 4) Row: "On/Off" toggle
  const rowToggle = document.createElement('div');
  rowToggle.style.display = 'flex';
  rowToggle.style.alignItems = 'center';
  rowToggle.style.gap = '8px';

  const labelToggle = document.createElement('label');
  labelToggle.style.display = 'inline-flex';
  labelToggle.style.alignItems = 'center';
  labelToggle.style.gap = '4px';

  const toggleCheckbox = document.createElement('input');
  toggleCheckbox.type = 'checkbox';
  toggleCheckbox.checked = macro.enabled;
  toggleCheckbox.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLInputElement;
    macro.enabled = target.checked;
    if (onMacroChange) onMacroChange(macro);
  });
  labelToggle.appendChild(toggleCheckbox);
  labelToggle.appendChild(document.createTextNode("On/Off"));
  rowToggle.appendChild(labelToggle);
  macroDiv.appendChild(rowToggle);

  // 5) Remove Macro button
  const removeMacroBtn = document.createElement('button');
  removeMacroBtn.textContent = "Remove Macro";
  removeMacroBtn.addEventListener('click', () => {
    macroDiv.remove();
    const idx = macros.indexOf(macro);
    if (idx > -1) macros.splice(idx, 1);
    if (onMacroChange) onMacroChange(null);
  });
  macroDiv.appendChild(removeMacroBtn);
}
