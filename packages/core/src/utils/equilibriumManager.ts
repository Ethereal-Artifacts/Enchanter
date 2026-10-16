/**
 * Enchanter - Equilibrium Manager
 *
 * Maintains system balance and stability by regulating growth and decay:
 * - Monitors active cell density and adjusts parameters to reach target values
 * - Dynamically scales growth and decay rates to maintain equilibrium
 * - Implements feedback mechanisms to prevent explosive growth or extinction
 * - Provides multipliers used by growth and decay algorithms
 * - Gradually adjusts parameters to create smooth transitions
 */

// File: utils/equilibriumManager.ts
import { config } from '../config.js';

interface EquilibriumConfig {
  maxExpansionScale: number;
  maxDecayScale: number;
  minExpansionScale: number;
  minDecayScale: number;
  expansionResponse: number;
  decayResponse: number;
}

export class EquilibriumManager {
  private targetFraction: number;
  private maxExpansionScale: number;
  private maxDecayScale: number;
  private minExpansionScale: number;
  private minDecayScale: number;
  private expansionResponse: number;
  private decayResponse: number;
  private growthMultiplier: number = 1;
  private decayMultiplier: number = 1;

  constructor() {
    const eqCfg = config.equilibrium as EquilibriumConfig;
    this.targetFraction = config.activeCellDensity;

    this.maxExpansionScale = eqCfg.maxExpansionScale;
    this.maxDecayScale = eqCfg.maxDecayScale;
    this.minExpansionScale = eqCfg.minExpansionScale;
    this.minDecayScale = eqCfg.minDecayScale;
    this.expansionResponse = eqCfg.expansionResponse;
    this.decayResponse = eqCfg.decayResponse;
  }

  update(currentCoverage: number): void {
    this.targetFraction = config.activeCellDensity;
    const difference = this.targetFraction - currentCoverage;
    let relativeDiff = Math.log1p(Math.abs(difference));

    if (difference > 0) {
      this.growthMultiplier = 1 + (relativeDiff * this.maxExpansionScale * this.expansionResponse);
      this.decayMultiplier = Math.max(1 - (relativeDiff * this.decayResponse), this.minDecayScale);
    } else {
      this.growthMultiplier = Math.max(1 - (relativeDiff * this.expansionResponse), this.minExpansionScale);
      this.decayMultiplier = 1 + (relativeDiff * this.maxDecayScale * this.decayResponse);
    }

    this.growthMultiplier = (this.growthMultiplier + 1) / 2;
    this.decayMultiplier = (this.decayMultiplier + 1) / 2;
  }

  // Public getters
  public getGrowthMultiplier(): number {
    return this.growthMultiplier;
  }

  public getDecayMultiplier(): number {
    return this.decayMultiplier;
  }
}
