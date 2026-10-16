// @ts-nocheck
/**
 * Enchanter - Grid Manager
 *
 * REFACTORING SUMMARY:
 * This file has been enhanced to centralize all grid-related functionality that was previously
 * scattered across multiple files (Kaleidoscope, CreepingFig, app.ts). The changes include:
 *
 * 1. Moved cell creation, activation, and copying functionality from algorithm classes
 * 2. Created shared types like Direction and CellPosition that are used across the application
 * 3. Added utility methods for grid operations (isValidPosition, getNeighbors, etc.)
 * 4. Provided methods to manipulate cells with proper boundary checking
 * 5. Standardized bounce/reflection behavior at grid edges
 *
 * This refactoring improves separation of concerns by making the GridManager the single
 * source of truth for all grid operations, while allowing algorithm classes to focus on
 * their specific behaviors rather than low-level grid management.
 *
 * Manages the cellular grid that forms the foundation of the simulation:
 * - Creates and maintains the 2D grid of cells
 * - Handles cell initialization and reset operations
 * - Provides coordinate transformation and boundary checks
 * - Implements bouncing and reflection behavior at grid edges
 * - Ensures grid consistency and cell state integrity
 * - Provides utilities for creating sub-grids and manipulating cells
 * - Centralizes all grid-related operations for better separation of concerns
 */

// File: utils/gridManager.ts
import { Cell, RGB, HSB } from '../types.js';
import { config } from '../config.js';
import { hsbToRgb } from './colorTheory.js';

export interface Direction {
  di: number;
  dj: number;
}

export interface BounceResult {
  newI: number;
  newJ: number;
  newDirection: Direction;
}

export interface CellPosition {
  i: number;
  j: number;
}

export class GridManager {
  private rows: number;
  private cols: number;
  private cells: Cell[][] = [];

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.initializeGrid();
  }

  /**
   * Initialize the main grid with empty cells
   */
  private initializeGrid(): void {
    this.cells = [];
    for (let i = 0; i < this.rows; i++) {
      this.cells[i] = [];
      for (let j = 0; j < this.cols; j++) {
        this.cells[i][j] = this.createEmptyCell();
      }
    }
  }

  /**
   * Create a new empty cell with default values
   */
  public createEmptyCell(): Cell {
    return {
      state: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      decaying: false,
      birth: 0,
      decayDelay: 0
    };
  }

  /**
   * Create a sub-grid with specified dimensions
   */
  public createSubGrid(rows: number, cols: number, defaultColor?: RGB): Cell[][] {
    const subGrid: Cell[][] = [];
    for (let i = 0; i < rows; i++) {
      subGrid[i] = [];
      for (let j = 0; j < cols; j++) {
        subGrid[i][j] = {
          state: 0,
          color: defaultColor ? { ...defaultColor } : { r: 0, g: 0, b: 0, a: 1 },
          decaying: false,
          birth: 0,
          decayDelay: 0
        };
      }
    }
    return subGrid;
  }

  /**
   * Activate a cell at the specified position
   */
  public activateCell(
    grid: Cell[][],
    i: number,
    j: number,
    dir?: Direction,
    color?: RGB,
    cycle: number = 0
  ): void {
    if (!this.isValidPosition(grid, i, j)) return;

    const c = grid[i][j];
    c.state = 1;

    if (color) {
      c.color = { ...color };
    } else if (!c.color) {
      c.color = { r: 0, g: 0, b: 0, a: 1 };
    }

    // Check for derived colors from config
    const derived = config.derivedColors;
    if (derived && derived.length > 0 && !color) {
      const idx = Math.floor(Math.random() * derived.length);
      const hsb = derived[idx] as HSB;
      c.color = hsbToRgb(hsb.h, hsb.s, hsb.b);
    }

    c.decaying = false;
    c.birth = cycle;
    c.prevDir = dir;
    c.decayDelay = config.decay.baseDelay +
      Math.floor(Math.random() * config.decay.randomRange);
  }

  /**
   * Copy a cell from source to target
   */
  public copyCell(
    targetGrid: Cell[][],
    targetRow: number,
    targetCol: number,
    sourceCell: Cell
  ): void {
    if (!this.isValidPosition(targetGrid, targetRow, targetCol)) return;

    const targetCell = targetGrid[targetRow][targetCol];

    targetCell.state = sourceCell.state;
    targetCell.color = sourceCell.color ? { ...sourceCell.color } : undefined;
    targetCell.decaying = sourceCell.decaying;
    targetCell.birth = sourceCell.birth;
    targetCell.decayDelay = sourceCell.decayDelay;
    targetCell.prevDir = sourceCell.prevDir;
  }

  /**
   * Check if coordinates are within grid bounds
   */
  public isValidPosition(grid: Cell[][], i: number, j: number): boolean {
    return i >= 0 && i < grid.length && j >= 0 && grid[i] && j < grid[i].length;
  }

  // Bounce: clamp i,j to grid boundaries. Return the new coords + direction if needed.
  public bounceCoordinates(i: number, j: number, direction: Direction): BounceResult {
    const newI = Math.max(0, Math.min(i, this.rows - 1));
    const newJ = Math.max(0, Math.min(j, this.cols - 1));

    let newDirection: Direction = { di: direction.di, dj: direction.dj };
    if (i < 0 || i >= this.rows) newDirection.di = -direction.di;
    if (j < 0 || j >= this.cols) newDirection.dj = -direction.dj;

    return { newI, newJ, newDirection };
  }

  /**
   * Reset all cells in the grid
   */
  public resetGrid(): void {
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const cell = this.cells[i][j];
        cell.state = 0;
        cell.color = { r: 0, g: 0, b: 0, a: 1 };
        cell.decaying = false;
        cell.birth = 0;
        cell.decayDelay = 0;
        cell.prevDir = undefined;
      }
    }
  }

  /**
   * Get neighbors of a cell within a specific radius
   */
  public getNeighbors(grid: Cell[][], i: number, j: number, radius: number = 1): CellPosition[] {
    const neighbors: CellPosition[] = [];

    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        if (di === 0 && dj === 0) continue;

        const ni = i + di;
        const nj = j + dj;

        if (this.isValidPosition(grid, ni, nj)) {
          neighbors.push({ i: ni, j: nj });
        }
      }
    }

    return neighbors;
  }

  // Public getters
  public getCells(): Cell[][] {
    return this.cells;
  }

  public getRows(): number {
    return this.rows;
  }

  public getCols(): number {
    return this.cols;
  }

  /**
   * Get a specific cell if coordinates are valid
   */
  public getCell(i: number, j: number): Cell | null {
    if (this.isValidPosition(this.cells, i, j)) {
      return this.cells[i][j];
    }
    return null;
  }

  /**
   * Set a specific cell's properties
   */
  public setCell(i: number, j: number, cellProps: Partial<Cell>): boolean {
    if (!this.isValidPosition(this.cells, i, j)) return false;

    const cell = this.cells[i][j];
    Object.assign(cell, cellProps);
    return true;
  }
}
