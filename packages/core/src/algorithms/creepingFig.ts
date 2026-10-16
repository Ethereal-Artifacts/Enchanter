// @ts-nocheck
/**
 * Enchanter - Creeping Fig Algorithm
 *
 * Implements a cellular growth algorithm that mimics organic growth patterns:
 * - Creates branching, vine-like structures that spread across the grid
 * - Manages cell activation, growth direction, and propagation
 * - Handles neighbor detection and branch formation
 * - Implements edge reflection and containment behaviors
 * - Controls growth rate and branch density parameters
 */

import { config } from '../config.js';
import { Cell, RGB, HSB, BounceFunction } from '../types';
import { GridManager, Direction, CellPosition } from '../utils/gridManager';
import { hsbToRgb } from '../utils/colorTheory.js';

export class CreepingFig {
  private cells: Cell[][];
  private rows: number;
  private cols: number;
  private bounceFn: BounceFunction;
  private activeCells: CellPosition[];
  private totalCells: number;
  private cycle: number;
  private gridManager: GridManager | null;
  /** Population mask: when set, cells may only spawn where it returns true. */
  private spawnMask: ((i: number, j: number) => boolean) | null = null;
  /** Per-cell decay multiplier (>= 1), for a temporary, local death boost. */
  private decayBoost: ((i: number, j: number) => number) | null = null;

  constructor(
    initialRow: number,
    initialCol: number,
    cells: Cell[][],
    rows: number,
    cols: number,
    bounceFn: BounceFunction,
    gridManager?: GridManager
  ) {
    this.cells = cells;
    this.rows = rows;
    this.cols = cols;
    this.bounceFn = bounceFn;
    this.gridManager = gridManager || null;

    this.activeCells = [];
    this.activateCell(initialRow, initialCol, undefined);
    this.activeCells.push({ i: initialRow, j: initialCol });

    this.totalCells = rows * cols;
    this.cycle = 0;
  }

  update(growthMultiplier: number): void {
    const figCfg = config.creepingFig;
    const baseActivations = figCfg.baseActivations;
    const neighborRadius = figCfg.neighborRadius;
    const branchAge = figCfg.branchAge;
    const directionFollowChance = figCfg.directionFollowChance;

    this.cycle++;
    this.pruneInactive();
    if (this.activeCells.length === 0) return;

    let expansions = Math.floor(baseActivations * growthMultiplier);
    expansions = Math.max(expansions, 1);

    for (let a = 0; a < expansions; a++) {
      if (this.activeCells.length === 0) break;

      const index = Math.floor(Math.random() * this.activeCells.length);
      const { i, j } = this.activeCells[index];
      const cell = this.cells[i][j];
      if (!cell) continue;

      const age = this.cycle - (cell.birth || 0);
      if (age < branchAge) continue;

      // Get a random direction, either following previous or choosing new
      let chosenOffset: Direction;

      if (Math.random() < 0.2) {
        // Get random neighbor offset
        chosenOffset = this.getRandomNeighborOffset(neighborRadius);
      } else if (cell.prevDir && Math.random() < directionFollowChance) {
        // Follow previous direction
        chosenOffset = cell.prevDir as Direction;
      } else {
        // Get random neighbor offset
        chosenOffset = this.getRandomNeighborOffset(neighborRadius);
      }

      let newI = i + chosenOffset.di;
      let newJ = j + chosenOffset.dj;

      if (newI < 0 || newI >= this.rows || newJ < 0 || newJ >= this.cols) {
        const result = this.bounceFn(newI, newJ, chosenOffset);
        if (result) {
          newI = result.newI;
          newJ = result.newJ;
        }
      }

      const isValid = this.gridManager ?
        this.gridManager.isValidPosition(this.cells, newI, newJ) :
        (newI >= 0 && newI < this.rows && newJ >= 0 && newJ < this.cols && !!this.cells[newI][newJ]);

      if (!isValid) continue;

      if (this.spawnMask && !this.spawnMask(newI, newJ)) continue;

      if (this.cells[newI][newJ].state === 0) {
        this.activateCell(newI, newJ, chosenOffset);
        this.activeCells.push({ i: newI, j: newJ });
      }
    }
  }

  private getRandomNeighborOffset(radius: number): Direction {
    // Create a random neighbor offset within the specified radius
    const offsets: Direction[] = [];
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        if (di === 0 && dj === 0) continue;
        offsets.push({ di, dj });
      }
    }
    return offsets[Math.floor(Math.random() * offsets.length)];
  }

  updateDecay(baseMultiplier: number): void {
    const dCfg = config.decay;
    const baseDecayChance = dCfg.baseDecayChance;
    const decaySlowdownFactor = dCfg.slowdownFactor;
    const minDecayChance = dCfg.minDecayChance;
    const edgeBreakChance = dCfg.edgeBreakChance;

    const binaryOn = config.binaryTransitions.enabled;
    const threshold = config.binaryTransitions.threshold;

    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const c = this.cells[i][j];
        if (!c) continue;
        if (c.state === 1) {
          const decayMultiplier = baseMultiplier * (this.decayBoost ? this.decayBoost(i, j) : 1);
          const age = this.cycle - (c.birth || 0);
          let decayChance = baseDecayChance / (1 + age * decaySlowdownFactor);
          decayChance = Math.max(decayChance, minDecayChance);

          const isEdge =
            i === 0 || j === 0 ||
            i === this.rows - 1 || j === this.cols - 1 ||
            (this.cells[i - 1] && this.cells[i - 1][j] && this.cells[i - 1][j].state === 0) ||
            (this.cells[i + 1] && this.cells[i + 1][j] && this.cells[i + 1][j].state === 0) ||
            (this.cells[i] && this.cells[i][j - 1] && this.cells[i][j - 1].state === 0) ||
            (this.cells[i] && this.cells[i][j + 1] && this.cells[i][j + 1].state === 0);

          if (isEdge && Math.random() < edgeBreakChance * decayMultiplier) {
            if (c.color) {
              c.color.a -= 0.1;
            }
          } else if (Math.random() < decayChance * decayMultiplier) {
            if (c.color) {
              c.color.a -= 0.015;
            }
          }

          if (binaryOn) {
            if (c.color && c.color.a < threshold) {
              c.state = 0;
            }
          } else {
            if (c.color && c.color.a < 0.01) {
              c.state = 0;
            }
          }
        }
      }
    }
  }

  private pruneInactive(): void {
    this.activeCells = this.activeCells.filter(({ i, j }) => {
      const c = this.cells[i][j];
      return c && c.state === 1;
    });
    if (this.activeCells.length === 0) {
      // With a population mask, only reseed inside it (a few tries, else wait).
      for (let tries = 0; tries < (this.spawnMask ? 24 : 1); tries++) {
        const i = Math.floor(Math.random() * this.rows);
        const j = Math.floor(Math.random() * this.cols);
        if (this.spawnMask && !this.spawnMask(i, j)) continue;
        this.activateCell(i, j, undefined);
        this.activeCells.push({ i, j });
        break;
      }
    }
  }

  /** Temporary per-cell decay multiplier; null restores normal decay everywhere. */
  setDecayBoost(boost: ((i: number, j: number) => number) | null): void {
    this.decayBoost = boost;
  }

  /** Restrict (or, with null, free) where new cells may spawn. */
  setSpawnMask(mask: ((i: number, j: number) => boolean) | null): void {
    this.spawnMask = mask;
  }

  /** Empty the quadrant — the population is then built by the spawn mask. */
  clear(): void {
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const c = this.cells[i][j];
        if (c) {
          c.state = 0;
          c.decaying = false;
        }
      }
    }
    this.activeCells = [];
  }

  /** Seed `count` idle cells at random points of the annulus inner..radius around (ci, cj). */
  seedWithin(count: number, ci: number, cj: number, inner: number, radius: number): number {
    let added = 0;
    const innerSq = inner * inner;
    const outerSq = radius * radius;
    for (let n = 0; n < count; n++) {
      const rr = Math.sqrt(innerSq + Math.random() * (outerSq - innerSq));
      const theta = Math.random() * Math.PI * 2;
      const i = Math.floor(ci + rr * Math.sin(theta));
      const j = Math.floor(cj + rr * Math.cos(theta));
      const c = this.cells[i]?.[j];
      if (!c || c.state === 1) continue;
      if (this.spawnMask && !this.spawnMask(i, j)) continue;
      this.activateCell(i, j, undefined);
      this.activeCells.push({ i, j });
      added += 1;
    }
    return added;
  }

  /** Active count in the base quadrant (after pruning dead refs). */
  getActiveCount(): number {
    this.pruneInactive();
    return this.activeCells.length;
  }

  /** Activate up to `count` idle cells (one small batch for cull boost). */
  seedBurst(count: number): number {
    if (count <= 0) return 0;
    this.pruneInactive();
    let added = 0;
    let guard = 0;
    const limit = Math.max(count * 8, count + 16);
    while (added < count && guard++ < limit) {
      const i = Math.floor(Math.random() * this.rows);
      const j = Math.floor(Math.random() * this.cols);
      const c = this.cells[i]?.[j];
      if (!c || c.state === 1) continue;
      if (this.spawnMask && !this.spawnMask(i, j)) continue;
      this.activateCell(i, j, undefined);
      this.activeCells.push({ i, j });
      added += 1;
    }
    return added;
  }

  private activateCell(i: number, j: number, dir: Direction | undefined): void {
    if (this.gridManager) {
      this.gridManager.activateCell(this.cells, i, j, dir, undefined, this.cycle);
      return;
    }

    // Fallback if GridManager not available
    const dCfg = config.decay;
    const c = this.cells[i][j];
    if (!c) return;
    c.state = 1;
    if (!c.color) {
      c.color = { r: 0, g: 0, b: 0, a: 1 };
    }
    const derived = config.derivedColors;
    if (derived && derived.length > 0) {
      const idx = Math.floor(Math.random() * derived.length);
      const hsb = derived[idx] as HSB;
      c.color = hsbToRgb(hsb.h, hsb.s, hsb.b);
    } else {
      c.color = { r: 255, g: 0, b: 0, a: 1 };
    }
    c.decaying = false;
    c.birth = this.cycle;
    c.prevDir = dir;
    c.decayDelay = dCfg.baseDelay + Math.floor(Math.random() * dCfg.randomRange);
  }
}
