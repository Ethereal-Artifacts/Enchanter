/**
 * Enchanter - Macro System
 *
 * Implements a modulation system for creating dynamic parameter changes:
 * - Provides oscillators and modulation sources for parameters
 * - Supports various waveforms (sine, triangle, square)
 * - Manages target parameters and modulation depth
 * - Controls timing, frequency and phase of modulations
 * - Enables creation of complex, evolving visual behaviors
 */

// File: utils/macros.ts

interface MacroTarget {
  path: string;
  baseline?: number;
}

export class Macro {
  public targets: MacroTarget[];
  public useCurrentBaseline: boolean;
  public currentBaseline: number = 0;
  public trigFunc: string;
  public periodMultiplier: number;
  public lfoPeriod: number;
  public dampener: number;
  public enabled: boolean;
  private baseline: number = 0;

  constructor() {
    // Each target: { path: string, influence: number, baseline?: number }
    this.targets = [];
    // Global macro settings:
    this.useCurrentBaseline = false; // default off
    this.trigFunc = "sin";
    this.periodMultiplier = 1.0;
    this.lfoPeriod = 100; // ticks
    this.dampener = 0.5;
    // On/off toggle for macro
    this.enabled = true;
  }

  public getBaseline(): number {
    return this.currentBaseline;
  }

  public setBaseline(value: number): void {
    this.currentBaseline = value;
  }

  getModulation(tick: number): number {
    // Apply periodMultiplier: adjust the tick count
    const adjustedTick = tick * this.periodMultiplier;
    const phase = (adjustedTick % this.lfoPeriod) / this.lfoPeriod;
    let wave: number;
    switch (this.trigFunc) {
      case "sin":
        wave = Math.sin(phase * 2 * Math.PI);
        break;
      case "cos":
        wave = Math.cos(phase * 2 * Math.PI);
        break;
      case "tan":
        wave = Math.tan(phase * 2 * Math.PI);
        break;
      case "csc":
        wave = 1 / Math.sin(phase * 2 * Math.PI);
        break;
      case "sec":
        wave = 1 / Math.cos(phase * 2 * Math.PI);
        break;
      case "cot":
        wave = 1 / Math.tan(phase * 2 * Math.PI);
        break;
      default:
        wave = Math.sin(phase * 2 * Math.PI);
    }
    return wave * this.dampener;
  }
}
