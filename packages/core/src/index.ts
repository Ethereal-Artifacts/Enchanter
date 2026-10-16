// Existing runtime modules are exported by responsibility; app.ts continues to compose the UI.
export { config } from './config.js';
export * as grid from './utils/gridManager.js';
export * as color from './utils/colorTheory.js';
export * as evolution from './algorithms/creepingFig.js';
export * as kaleidoscope from './algorithms/kaleidoscope.js';
export * as effects from './utils/effectsManager.js';
export * as equilibrium from './utils/equilibriumManager.js';
export * as events from './utils/eventBus.js';
export * as ticks from './utils/tickManager.js';
export * as countdown from './countdownClock.js';
export * as palGeometry from './palGeometry.js';
export * as palSolver from './palSolver.js';
export * as palRuntime from './pal.runtime.js';
export type { Config, Cell, HSB, RGB, BounceFunction, ParameterDefinition } from './types.js';
