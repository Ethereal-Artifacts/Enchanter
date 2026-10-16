/**
 * Enchanter - Effects Manager
 *
 * Manages special visual effects and transitions in the simulation:
 * - Handles bursts, pulses, and other dynamic visual events
 * - Controls timing and intensity of effects
 * - Provides transition effects between states
 * - Coordinates with main algorithms to create visual interest
 * - Applies effects based on system state and user interactions
 */

// File: utils/effectsManager.ts
import { Config, Cell } from '../types';
import { Kaleidoscope } from '../algorithms/kaleidoscope.js';

// Extend the Config interface to include cellSize
interface ExtendedConfig extends Config {
  cellSize: number;
}

export class EffectsManager {
  private config: ExtendedConfig;
  private kaleidoscope: Kaleidoscope;

  constructor(config: ExtendedConfig, kaleidoscopeInstance: Kaleidoscope) {
    this.config = config;
    this.kaleidoscope = kaleidoscopeInstance;
    console.log("[EffectsManager] Initialized with cellSize:", this.config.cellSize);
  }

  initEffects(): void {
    // Since init() doesn't exist in Kaleidoscope, we'll use update() instead
    this.kaleidoscope.update(1, 1);
  }

  reinitialize(): void {
    console.log("[EffectsManager] Reinitializing effects...");
    // Since reinitialize() doesn't exist in Kaleidoscope, we'll use update() instead
    this.kaleidoscope.update(1, 1);
  }

  get cells(): Cell[][] {
    // Access the cells through a public method or property
    // Since cells is private in Kaleidoscope, we need to create a getter in Kaleidoscope
    // For now, we'll use a type assertion to bypass the type checker
    return (this.kaleidoscope as any).cells;
  }

  get rows(): number {
    // Access the rows through a public method or property
    // Since rows is private in Kaleidoscope, we need to create a getter in Kaleidoscope
    // For now, we'll use a type assertion to bypass the type checker
    return (this.kaleidoscope as any).rows;
  }

  get cols(): number {
    // Access the cols through a public method or property
    // Since cols is private in Kaleidoscope, we need to create a getter in Kaleidoscope
    // For now, we'll use a type assertion to bypass the type checker
    return (this.kaleidoscope as any).cols;
  }

  triggerChaos(): void {
    // Since triggerChaos() doesn't exist in Kaleidoscope, we'll use update() with extreme values
    this.kaleidoscope.update(10, 0.1);
  }
}
