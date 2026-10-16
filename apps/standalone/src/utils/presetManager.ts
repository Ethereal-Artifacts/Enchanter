// @ts-nocheck
/**
 * Enchanter - Preset Manager
 *
 * Handles preset operations:
 * - Loading random presets on startup
 * - Saving current configurations as new presets
 * - Managing preset files in the presets directory
 */

import { config, Config } from '@ethereal/enchanter-core/config';
import { Macro } from './macros.js';
import { stablePresets } from '../data.js';

export interface Preset {
  name: string;
  config: Partial<Config>;
  macros?: Macro[];
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class PresetManager {
  private static instance: PresetManager;
  private presets: Preset[] = [];

  private constructor() {}

  static getInstance(): PresetManager {
    if (!PresetManager.instance) {
      PresetManager.instance = new PresetManager();
    }
    return PresetManager.instance;
  }

  async loadPresets(): Promise<void> {
    try {
      // Load all presets from the main presets folder
      const allPresets = await this.loadAllPresets();

      // Combine all presets
      this.presets = allPresets;

      console.log(`Loaded ${this.presets.length} total presets:`);
      this.presets.forEach((preset, index) => {
        console.log(`  ${index}: ${preset.name}`);
      });

      // If no presets loaded at all, create a basic default
      if (this.presets.length === 0) {
        console.warn('No presets found, creating basic default');
        this.presets.push(this.createBasicDefault());
      }
    } catch (error) {
      console.error('Error loading presets:', error);
    }
  }

  private createBasicDefault(): Preset {
    return {
      name: 'basic-default',
      config: {
        cellSize: 10,
        tickRate: 60,
        activeCellDensity: 0.62,
        colorSettings: {
          baseH: 0,
          baseS: 100,
          baseB: 100,
          scheme: "analogous"
        }
      },
      macros: []
    };
  }

  private async loadAllPresets(): Promise<Preset[]> {
    return stablePresets.map((preset) => cloneSerializable(preset)) as Preset[];
  }

  getRandomPreset(): Preset | null {
    console.log(`Available presets for random selection: ${this.presets.length}`);
    this.presets.forEach((preset, index) => {
      console.log(`  ${index}: ${preset.name}`);
    });

    if (this.presets.length === 0) {
      console.warn('No presets available for random selection');
      return null;
    }

    // If there's only one preset, always return it (no randomness needed)
    if (this.presets.length === 1) {
      const selectedPreset = this.presets[0];
      console.log(`Only one preset available: ${selectedPreset.name}`);
      return selectedPreset;
    }

    // Randomly select from all available presets
    const randomIndex = Math.floor(Math.random() * this.presets.length);
    const selectedPreset = this.presets[randomIndex];
    console.log(`Randomly selected preset: ${selectedPreset.name} (index: ${randomIndex})`);
    return selectedPreset;
  }



  async applyPreset(preset: Preset): Promise<void> {
    if (!preset || !preset.config) {
      console.warn('Invalid preset provided to applyPreset:', preset);
      return;
    }

    console.log(`Applying preset: ${preset.name}`);
    console.log('Preset config:', preset.config);

    // Contiguous morph: never replace live grid geometry mid-session.
    // cellSize / canvas size stay with the running Vessel; tickRate is handled
    // by the caller's ramp (or tempo lock), not a hard snap from JSON.
    const incoming = cloneSerializable(preset.config) as Partial<Config>;
    const {
      cellSize: _ignoreCellSize,
      canvasWidth: _ignoreCanvasWidth,
      canvasHeight: _ignoreCanvasHeight,
      tickRate: presetTickRate,
      ...rest
    } = incoming;
    Object.assign(config, rest);
    config.canvasWidth = 1080;
    config.canvasHeight = 1920;
    // Stash authored target so applyPresetByName can ramp toward it.
    if (typeof presetTickRate === 'number' && Number.isFinite(presetTickRate)) {
      (config as Config & { _presetTickRate?: number })._presetTickRate = presetTickRate;
    } else {
      delete (config as Config & { _presetTickRate?: number })._presetTickRate;
    }

    console.log('Applied config values:', {
      cellSize: config.cellSize,
      tickRate: config.tickRate,
      activeCellDensity: config.activeCellDensity,
      colorSettings: config.colorSettings
    });

    // Complete macro replacement while the manifestation keeps running.
    // An empty macro list must clear modulation left by the previous preset.
    const { macros } = await import('./macrosUI.js');
    macros.length = 0;
    const reconstructedMacros = (preset.macros || []).map(macroData => {
      const macro = new Macro();
      Object.assign(macro, cloneSerializable(macroData));
      return macro;
    });
    macros.push(...reconstructedMacros);
    console.log(`Applied ${reconstructedMacros.length} macros from preset`);

    console.log(`Successfully applied preset: ${preset.name}`);
  }

  async saveCurrentConfig(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const presetName = `preset-${timestamp}`;

    // Create a copy of the current config (excluding internal properties)
    const configCopy: Partial<Config> = { ...config };
    delete configCopy._overrides;
    delete configCopy.derivedColors;

    // Get current macros
    let currentMacros: Macro[] = [];
    try {
      const { macros } = await import('./macrosUI.js');
      currentMacros = [...macros];
    } catch (error) {
      console.warn('Failed to get current macros:', error);
    }

    const preset: Preset = {
      name: presetName,
      config: configCopy,
      macros: currentMacros
    };

    try {
      // Create downloadable JSON file (this is the only storage method now)
      this.downloadPresetAsJSON(preset);

      console.log(`Saved preset: ${presetName} with ${currentMacros.length} macros`);
      console.log('Preset saved as downloadable JSON file. Add it to the presets/ folder to include it in random selection.');
      return presetName;
    } catch (error) {
      console.error('Error saving preset:', error);
      throw error;
    }
  }



  private downloadPresetAsJSON(preset: Preset): void {
    // Create the complete preset data including both config and macros
    const presetData = {
      ...preset.config,
      macros: preset.macros || []
    };

    const jsonContent = JSON.stringify(presetData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getPresetNames(): string[] {
    return this.presets.map(preset => preset.name);
  }

  getPresetDefinition(name: string): { config: Partial<Config>; macros: Macro[] } | null {
    const preset = this.presets.find(candidate => candidate.name === name);
    if (!preset) return null;
    return cloneSerializable({
      config: preset.config,
      macros: preset.macros || []
    });
  }

  getPresets(): Preset[] {
    return cloneSerializable(this.presets);
  }
}

export const presetManager = PresetManager.getInstance();
