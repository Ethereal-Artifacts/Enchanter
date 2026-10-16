// @ts-nocheck
/**
 * Enchanter - Type Definitions
 *
 * Central location for shared TypeScript interfaces and types used across the application:
 * - Color types (RGB, HSB)
 * - Cell structure definitions
 * - Parameter and configuration interfaces
 * - Function type signatures
 *
 * Ensures consistent typing across modules and improves code maintainability.
 */

// Import Direction from GridManager to ensure type consistency
import { Direction } from './utils/gridManager.js';

export interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HSB {
  h: number;
  s: number;
  b: number;
}

export interface Cell {
  state: number;
  color?: RGB;
  birth?: number;
  prevDir?: Direction;
  decayDelay?: number;
  decaying?: boolean;
}

export interface Config {
  canvasWidth: number;
  canvasHeight: number;
  cellSize: number;
  minCellSize: number;
  maxCellSize: number;
  minTickRate: number;
  maxTickRate: number;
  decay: {
    baseDelay: number;
    baseDecayChance: number;
    slowdownFactor: number;
    minDecayChance: number;
    edgeBreakChance: number;
    randomRange: number;
  };
  creepingFig: {
    baseActivations: number;
    neighborRadius: number;
    branchAge: number;
    directionFollowChance: number;
  };
  binaryTransitions: {
    enabled: boolean;
    threshold: number;
  };
  colorSettings: {
    baseH: number;
    baseS: number;
    baseB: number;
    scheme?: string;
  };
  derivedColors?: HSB[];
  _overrides: Record<string, boolean>;
}

export interface ParameterDefinition {
  path: string;
  label: string;
  description: string;
  min?: number;
  max?: number;
  step?: number;
  type: "range" | "checkbox";
}

export type BounceFunction = (newI: number, newJ: number, offset: Direction) => { newI: number; newJ: number } | null;
