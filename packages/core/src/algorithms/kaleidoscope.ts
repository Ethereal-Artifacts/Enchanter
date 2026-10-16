// @ts-nocheck
/**
 * Enchanter - Kaleidoscope Algorithm
 *
 * Implements a cellular automaton that creates kaleidoscope-like symmetric patterns:
 * - Manages cell growth and decay through quadrant mirroring
 * - Handles cell state transitions and color interpolation
 * - Creates balanced, symmetric visual patterns that evolve over time
 * - Responds to equilibrium parameters to maintain target cell density
 */

import { CreepingFig } from './creepingFig.js';
import { Cell, BounceFunction, RGB } from '../types';
import { GridManager, Direction } from '../utils/gridManager';

/** Brief post-handoff trickle — keeps a sparse field from culling out. */
type CullBoost = {
  minBase: number;
  startedAt: number;
  durationMs: number;
  perTick: number;
};

export class Kaleidoscope {
  private cells: Cell[][];
  private rows: number;
  private cols: number;
  private bounceFn: BounceFunction;
  private baseRows: number;
  private baseCols: number;
  private baseCells: Cell[][];
  private creepingFig: CreepingFig;
  private gridManager: GridManager;
  private cullBoost: CullBoost | null = null;

  constructor(
    initialRow: number,
    initialCol: number,
    fullCells: Cell[][],
    rows: number,
    cols: number,
    gridManager: GridManager
  ) {
    this.cells = fullCells;
    this.rows = rows;
    this.cols = cols;
    this.gridManager = gridManager;
    this.bounceFn = gridManager.bounceCoordinates.bind(gridManager);

    // Base quadrant is top-left quarter
    this.baseRows = Math.floor(rows / 2);
    this.baseCols = Math.floor(cols / 2);

    // Create a sub-grid for the creeping fig using the GridManager
    this.baseCells = this.gridManager.createSubGrid(
      this.baseRows,
      this.baseCols,
      { r: 128, g: 0, b: 128, a: 1 }
    );

    // The single CreepingFig in that sub-grid
    const baseRow = Math.floor(this.baseRows / 2);
    const baseCol = Math.floor(this.baseCols / 2);
    this.creepingFig = new CreepingFig(
      baseRow,
      baseCol,
      this.baseCells,
      this.baseRows,
      this.baseCols,
      this.bounceBaseCoordinates.bind(this),
      this.gridManager
    );
  }

  update(growthMultiplier: number, decayMultiplier: number): void {
    // Update base creeper
    this.creepingFig.update(growthMultiplier);
    this.creepingFig.updateDecay(decayMultiplier);

    // Mirror the base quadrant to the full grid
    this.reflectBaseQuadrant();
  }

  /**
   * Preset/Spell handoff: a short, low-rate cull shield.
   * Only tops up when the base is near-empty — never a coverage fill.
   */
  beginCullBoost(durationMs: number = 1200): void {
    const capacity = Math.max(1, this.baseRows * this.baseCols);
    // ~2% of the base quadrant, floored so a sparse field can recover without flooding.
    const minBase = Math.max(12, Math.min(48, Math.ceil(capacity * 0.02)));
    const active = this.creepingFig.getActiveCount();
    if (active >= minBase) {
      this.cullBoost = null;
      return;
    }
    this.cullBoost = {
      minBase,
      startedAt: performance.now(),
      durationMs: Math.max(200, durationMs),
      perTick: 2
    };
  }

  /** Population mask over base-quadrant cells (null frees it). Spawn only — never culls. */
  setSpawnMask(mask: ((i: number, j: number) => boolean) | null): void {
    this.creepingFig.setSpawnMask(mask);
  }

  /** Temporary per-cell decay multiplier over base-quadrant cells (null = normal). */
  setDecayBoost(boost: ((i: number, j: number) => number) | null): void {
    this.creepingFig.setDecayBoost(boost);
  }

  /** Empty the field so a spawn mask can build the population from nothing. */
  clearPopulation(): void {
    this.creepingFig.clear();
    this.reflectBaseQuadrant();
  }

  /** Seed the annulus inner..radius around a base-quadrant point. */
  seedWithin(count: number, ci: number, cj: number, inner: number, radius: number): number {
    const added = this.creepingFig.seedWithin(count, ci, cj, inner, radius);
    if (added > 0) this.reflectBaseQuadrant();
    return added;
  }

  isCullBoosting(): boolean {
    return this.cullBoost != null;
  }

  /** Add at most a couple cells per tick while below the modest floor. */
  stepCullBoost(): number {
    if (!this.cullBoost) return 0;
    const { minBase, startedAt, durationMs, perTick } = this.cullBoost;
    const active = this.creepingFig.getActiveCount();
    const expired = performance.now() - startedAt >= durationMs;
    if (active >= minBase || expired) {
      this.cullBoost = null;
      return 0;
    }
    const need = Math.min(perTick, minBase - active);
    if (need <= 0) {
      this.cullBoost = null;
      return 0;
    }
    const added = this.creepingFig.seedBurst(need);
    if (added > 0) this.reflectBaseQuadrant();
    return added;
  }

  private reflectBaseQuadrant(): void {
    for (let i = 0; i < this.baseRows; i++) {
      for (let j = 0; j < this.baseCols; j++) {
        const src = this.baseCells[i][j];

        // Copy to all four quadrants using GridManager
        this.gridManager.copyCell(this.cells, i, j, src);
        this.gridManager.copyCell(
          this.cells,
          i,
          j + this.baseCols,
          this.baseCells[i][this.baseCols - j - 1]
        );
        this.gridManager.copyCell(
          this.cells,
          i + this.baseRows,
          j,
          this.baseCells[this.baseRows - i - 1][j]
        );
        this.gridManager.copyCell(
          this.cells,
          i + this.baseRows,
          j + this.baseCols,
          this.baseCells[this.baseRows - i - 1][this.baseCols - j - 1]
        );
      }
    }
  }

  private bounceBaseCoordinates(i: number, j: number, direction: Direction): { newI: number; newJ: number } {
    const newI = Math.max(0, Math.min(i, this.baseRows - 1));
    const newJ = Math.max(0, Math.min(j, this.baseCols - 1));
    return { newI, newJ };
  }
}
