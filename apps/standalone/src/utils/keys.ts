// @ts-nocheck
/**
 * Enchanter - Keyboard Controls
 *
 * Implements keyboard input handling for user interaction:
 * - Maps keyboard keys to specific simulation parameters and actions
 * - Handles keyboard events and updates configuration values
 * - Provides shortcuts for adjusting simulation parameters
 * - Supports modifier keys for fine/coarse adjustments
 * - Displays on-screen feedback for keyboard interactions
 */

// File: utils/keys.ts
import { Config } from '@ethereal/enchanter-core/types';
import { Macro } from './macros';

interface Parameter {
  name: 'minCellSize' | 'maxCellSize' | 'minTickRate' | 'maxTickRate' | 'activeCellDensity';
  display: string;
  min: number;
  max: number;
}

interface KeyControls {
  setCurrentMacro: (macro: Macro) => void;
  clearCurrentMacro: () => void;
  dispose: () => void;
}

export function setupKeyControls(
  config: Config,
  onConfigChange: () => void,
  onHotkeyLog: (message: string) => void
): KeyControls {
  const parameters: Parameter[] = [
    {
      name: 'minCellSize',
      display: 'Grid Resolution (cellSize)',
      min: config.minCellSize,
      max: config.maxCellSize
    },
    {
      name: 'minTickRate',
      display: 'Tick Rate',
      min: config.minTickRate,
      max: config.maxTickRate
    },
    {
      name: 'activeCellDensity',
      display: 'Active Cell Density',
      min: 0.1,
      max: 1.0
    }
  ];

  let activeParamIndex = 0;
  let currentMacro: Macro | null = null; // last touched macro instance

  onHotkeyLog(`Parameter: ${parameters[activeParamIndex].display}. Use Tab to cycle; ArrowUp/Down to adjust.`);

  const listeners: Array<(event: KeyboardEvent) => void> = [];
  parameters.forEach(param => {
    const listener = (event: KeyboardEvent) => {
      if (!(document.querySelector('.enchanter-runtime')?.contains(event.target as Node))) return;
      if ((event.target as HTMLElement)?.matches('input, select, textarea, button, a')) return;
      if (event.key === param.name) {
        if (typeof config[param.name as keyof Config] === 'number') {
          const currentValue = config[param.name as keyof Config] as number;
          let newValue = currentValue;
          if (event.shiftKey) {
            newValue += 0.1; // Increase step by 0.1 if Shift is pressed
          } else {
            newValue += 0.05;
          }
          // Clamp the value within the defined min/max range if they exist
          if (param.min !== undefined && param.max !== undefined) {
            newValue = Math.max(param.min, Math.min(param.max, newValue));
          }
          (config as any)[param.name] = newValue;
          onHotkeyLog(`${param.display} updated: ${currentValue} -> ${newValue}`);
          onConfigChange();
        }
      } else if (event.key === 'Tab') {
        event.preventDefault();
        activeParamIndex = (activeParamIndex + 1) % parameters.length;
        currentMacro = null;
        onHotkeyLog(`Active param: ${parameters[activeParamIndex].display}`);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (currentMacro) {
          if (event.key === 'ArrowUp') {
            currentMacro.setBaseline(currentMacro.getBaseline() + 0.1);
          } else if (event.key === 'ArrowDown') {
            currentMacro.setBaseline(currentMacro.getBaseline() - 0.1);
          }
        }
      }
    };
    listeners.push(listener);
    document.addEventListener('keydown', listener);
  });

  return {
    dispose: () => listeners.forEach(listener => document.removeEventListener('keydown', listener)),
    setCurrentMacro: (macro: Macro) => {
      currentMacro = macro;
      onHotkeyLog(`Macro control activated.`);
    },
    clearCurrentMacro: () => {
      currentMacro = null;
      onHotkeyLog(`Macro control cleared.`);
    }
  };
}
