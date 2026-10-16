/**
 * Enchanter - Configuration
 *
 * Central configuration system that defines:
 * - Core system settings (dimensions, cell size, tick rate)
 * - Growth and decay parameters for cell behaviors
 * - Color settings and processing parameters
 * - Visual effect and transition properties
 *
 * Provides a single source of truth for all configurable parameters
 * used throughout the application.
 */

// File: config.ts

interface DecayConfig {
  baseDelay: number;
  normalStep: number;
  randomRange: number;
  slowdownFactor: number;
  minDecayChance: number;
  baseDecayChance: number;
  edgeBreakChance: number;
  voidDropChance: number;
}

interface CreepingFigConfig {
  baseActivations: number;
  neighborRadius: number;
  branchAge: number;
  directionFollowChance: number;
  maxActiveCells: number;
  expansionBiasFactor: number;
  bounceReflectionFactor: number;
}

interface BurstMechanicsConfig {
  pulseChance: number;
  burstSize: number;
  burstDecayMultiplier: number;
}

interface EquilibriumConfig {
  maxExpansionScale: number;
  maxDecayScale: number;
  minExpansionScale: number;
  minDecayScale: number;
  expansionResponse: number;
  decayResponse: number;
}

interface BinaryTransitionsConfig {
  enabled: boolean;
  threshold: number;
}

interface ColorSettings {
  baseH: number;
  baseS: number;
  baseB: number;
  scheme: string;
}

export interface Config {
  // CORE SYSTEM SETTINGS
  canvasWidth: number;
  canvasHeight: number;
  cellSize: number;
  minCellSize: number;
  maxCellSize: number;
  tickRate: number;
  minTickRate: number;
  maxTickRate: number;
  decay: DecayConfig;
  creepingFig: CreepingFigConfig;
  burstMechanics: BurstMechanicsConfig;
  activeCellDensity: number;
  equilibrium: EquilibriumConfig;
  binaryTransitions: BinaryTransitionsConfig;
  colorSettings: ColorSettings;
  derivedColors: any[];
  _overrides: Record<string, any>;
  RANDOM_START: boolean;
}

export const config: Config = {
  // CORE SYSTEM SETTINGS
  canvasWidth: 1080,
  canvasHeight: 1920,

  // GRID & CELL SIZE
  cellSize: 8,
  minCellSize: 1,
  maxCellSize: 30,

  // SIMULATION SPEED
  tickRate: 60,
  minTickRate: 2,
  maxTickRate: 200,

  // DECAY SYSTEM
  decay: {
    baseDelay: 100,
    normalStep: 0.02,
    randomRange: 20,
    slowdownFactor: 0.05,
    minDecayChance: 0.002,
    baseDecayChance: 0.35,
    edgeBreakChance: 0.25,
    voidDropChance: 0.10
  },

  // GROWTH SYSTEM
  creepingFig: {
    baseActivations: 5,
    neighborRadius: 2,
    branchAge: 5,
    directionFollowChance: 0.3,
    maxActiveCells: 10000,
    expansionBiasFactor: 0.2,
    bounceReflectionFactor: 1.0
  },

  // HIGH-ENERGY BURSTS
  burstMechanics: {
    pulseChance: 0.12,
    burstSize: 30,
    burstDecayMultiplier: 1.5
  },

  // SYSTEM EQUILIBRIUM
  activeCellDensity: 0.62,
  equilibrium: {
    maxExpansionScale: 7,
    maxDecayScale: 4,
    minExpansionScale: 0.3,
    minDecayScale: 0.15,
    expansionResponse: 1.2,
    decayResponse: 1.1
  },

  // BINARY TRANSITIONS
  binaryTransitions: {
    enabled: false,
    threshold: 0.25
  },

  // COLOR SETTINGS for derived color schemes (using HSB)
  colorSettings: {
    baseH: 0,         // Hue (0 - 360)
    baseS: 100,       // Saturation (0 - 100)
    baseB: 100,       // Brightness (0 - 100)
    scheme: "analogous"
  },

  // Holds derived colors computed from the color settings.
  derivedColors: [],

  // Internal override flags for parameters touched manually.
  _overrides: {},

  // RANDOM START SETTING
  RANDOM_START: false
};
