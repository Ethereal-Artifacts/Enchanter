import { countdownMotionFrame } from './countdownClock.js';
import {
	PAL_VIEWBOX,
	configKey,
	isLegalThinking,
	isStaticConfiguration,
	palGeometry,
	sampleRingArc,
	thinkingPoint,
	type Point,
	type Ray,
	type ThinkingNode
} from './palGeometry.js';
import {
	applyMove,
	pickMove,
	shortestThinkingReset,
	staticAssignmentSteps,
	thinkingAssignmentFromPoints,
	validateMove,
	type PalMove,
	type WorldStep
} from './palSolver.js';

/** Quintic ease-in-out for PAL motion. */
function quintInOut(t: number): number {
	return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;
}

/**
 * Error rattle vs PAL-12K `animateError` (linear 1−t fade, constant frequency).
 * Amplitude stays at PAL's 0.45; converted from the old ortho frustum (1.42).
 */
const ERROR_MS = 1400;
const ERROR_SHAKE_CYCLES = 14;
const ERROR_COLOR_CYCLES = 4;
const ERROR_SHAKE_AMP = 0.45;
const FRUSTUM = 1.42;

/**
 * PAL-12K `animateProcessing`: +0.06 progress per rAF, `quintInOut`.
 * Site processing is 30% slower.
 */
const TURN_PROGRESS_STEP = 0.06 * 0.7;

/** Local end-of-calculation snap: last remaining think clip only. Does not mutate TURN_PROGRESS_STEP. */
export const FINAL_THINK_DURATION_SCALE = 0.5;

export function thinkClipProgressStep(options: {
	kind: 'think' | 'world' | 'worldSet';
	calculationComplete: boolean;
	returningToStatic: boolean;
	remainingThinkMoves: number;
}): number {
	if (options.kind !== 'think') return TURN_PROGRESS_STEP;
	if (options.returningToStatic) return TURN_PROGRESS_STEP;
	if (!options.calculationComplete) return TURN_PROGRESS_STEP;
	if (options.remainingThinkMoves !== 1) return TURN_PROGRESS_STEP;
	return TURN_PROGRESS_STEP / FINAL_THINK_DURATION_SCALE;
}

const REST_FILL = '#f2eeea';
const ERROR_FILL = '#d02018';

export type Runtime = {
	canvas: SVGSVGElement;
	setWorking: (working: boolean) => void;
	setClockElapsed: (elapsedMs: number) => void;
	/** Resolves after at least `count` think moves have completed while working. */
	waitForThinkMoves: (count: number) => Promise<void>;
	/**
	 * Resolves when dots sit on the Ether static pose and the loop is idle.
	 * Use after `setWorking(false)` so the original return-to-static path finishes.
	 */
	waitUntilStatic: () => Promise<void>;
	pulseError: () => void;
	resize: () => void;
	dispose: () => void;
};

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
	return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

type Motion =
	| { kind: 'linear'; from: Point; to: Point }
	| { kind: 'arc'; from: Ray; to: Ray };

function sampleMotion(motion: Motion, t: number): Point {
	if (motion.kind === 'arc') return sampleRingArc(motion.from, motion.to, t);
	return lerpPoint(motion.from, motion.to, t);
}

function motionsForMove(fromOcc: readonly ThinkingNode[], move: PalMove): Motion[] {
	const byDot = new Map(move.steps.map((step) => [step.dot, step]));
	return fromOcc.map((node, i) => {
		const step = byDot.get(i);
		if (!step) {
			const p = thinkingPoint(node);
			return { kind: 'linear' as const, from: p, to: p };
		}
		if (step.from !== 'c' && step.to !== 'c') {
			return { kind: 'arc' as const, from: step.from, to: step.to };
		}
		return {
			kind: 'linear' as const,
			from: thinkingPoint(step.from),
			to: thinkingPoint(step.to)
		};
	});
}

export function buildClockSegments(seconds = 60): { from: Point[]; to: Point[]; motion: Motion[] | null }[] {
	const enter = thinkingAssignmentFromPoints(palGeometry.static.positions);
	let occupancy = enter.occupancy;
	let positions = palGeometry.static.positions.map((point) => ({ ...point }));
	const enterTargets = occupancy.map(thinkingPoint);
	const segments = [{ from: positions, to: enterTargets, motion: null as Motion[] | null }];
	positions = enterTargets;
	let previousKey: string | null = null;
	let previousMove: PalMove | null = null;
	let seed = 0x50414c;
	const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
	for (let second = 1; second < seconds - 2; second += 1) {
		const move = pickMove(occupancy, { random, previousKey, lastMove: previousMove });
		if (!move) break;
		const next = applyMove(occupancy, move);
		const nextPositions = next.map(thinkingPoint);
		segments.push({ from: positions, to: nextPositions, motion: motionsForMove(occupancy, move) });
		previousKey = configKey(occupancy);
		previousMove = move;
		occupancy = next;
		positions = nextPositions;
	}
	const staticTargets = positions.map((point) => ({ ...point }));
	for (const step of staticAssignmentSteps(positions)) staticTargets[step.dot] = { ...step.to };
	segments.push({ from: positions, to: staticTargets, motion: null });
	segments.push({ from: staticTargets, to: staticTargets, motion: null });
	return segments;
}

function mixHex(a: string, b: string, t: number): string {
	const parse = (hex: string) => [
		parseInt(hex.slice(1, 3), 16),
		parseInt(hex.slice(3, 5), 16),
		parseInt(hex.slice(5, 7), 16)
	];
	const [ar, ag, ab] = parse(a);
	const [br, bg, bb] = parse(b);
	const r = Math.round(lerp(ar, br, t));
	const g = Math.round(lerp(ag, bg, t));
	const bl = Math.round(lerp(ab, bb, t));
	return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

type Queued =
	| { kind: 'think'; move: PalMove }
	| { kind: 'world'; step: WorldStep; occupancy?: ThinkingNode[] }
	| { kind: 'worldSet'; targets: Point[]; occupancy: ThinkingNode[] };

export function createRuntime(root: SVGSVGElement, options: { mode?: 'working' | 'clock' } = {}): Runtime {
	const mark = root.querySelector<SVGGElement>('.pal__mark') ?? root;
	const dots = [...root.querySelectorAll<SVGCircleElement>('.pal-dot')];
	if (dots.length !== 4) {
		return {
			canvas: root,
			setWorking() {},
			setClockElapsed() {},
			waitForThinkMoves: async () => {},
			waitUntilStatic: async () => {},
			pulseError() {},
			resize() {},
			dispose() {}
		};
	}

	for (const dot of dots) {
		dot.setAttribute('r', String(palGeometry.dotRadius));
	}

	let positions: Point[] = palGeometry.static.positions.map((p) => ({ ...p }));
	let occupancy: ThinkingNode[] | null = null;
	let origins: Point[] = positions.map((p) => ({ ...p }));
	let targets: Point[] = positions.map((p) => ({ ...p }));
	let working = false;
	let reducedMotion = false;
	let playing = false;
	let erroring = false;
	let returning = false;
	let lastMove: PalMove | null = null;
	let previousKey: string | null = null;
	let queue: Queued[] = [];
	let motions: Motion[] | null = null;
	let pendingOccupancy: ThinkingNode[] | null = null;
	let errorStartedAt = 0;
	let animationProgress = 0;
	let clipProgressStep = TURN_PROGRESS_STEP;
	let clipKind: Queued['kind'] | null = null;
	let clipRemainingThink = 0;
	let clipFinalSnap = false;
	type FrameState = { kind: 'idle' } | { kind: 'scheduled'; id: number } | { kind: 'running' };
	let frameState: FrameState = { kind: 'idle' };
	let disposed = false;
	let thinkMovesCompleted = 0;
	const thinkWaiters: Array<{ count: number; resolve: () => void }> = [];
	const settleWaiters: Array<() => void> = [];
	const clockMode = options.mode === 'clock';
	const clockSegments = clockMode ? buildClockSegments() : [];

	function notifyThinkWaiters() {
		for (let i = thinkWaiters.length - 1; i >= 0; i -= 1) {
			const waiter = thinkWaiters[i];
			if (thinkMovesCompleted >= waiter.count) {
				thinkWaiters.splice(i, 1);
				waiter.resolve();
			}
		}
	}

	function isSettledStatic(): boolean {
		return (
			!playing &&
			!returning &&
			!working &&
			isStaticConfiguration(positions)
		);
	}

	function notifySettleWaiters() {
		if (!isSettledStatic() && !disposed && !reducedMotion) return;
		while (settleWaiters.length) settleWaiters.pop()?.();
	}

	const motionQuery =
		typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

	function paintDots(progress = 1) {
		const eased = quintInOut(progress);
		for (let i = 0; i < dots.length; i += 1) {
			const p = motions
				? sampleMotion(motions[i], eased)
				: lerpPoint(origins[i], targets[i], eased);
			dots[i].setAttribute('cx', String(p.x));
			dots[i].setAttribute('cy', String(p.y));
		}
	}

	function commitPositions() {
		positions = targets.map((p) => ({ ...p }));
		origins = positions.map((p) => ({ ...p }));
		paintDots(1);
	}

	function commitThink() {
		if (pendingOccupancy) {
			occupancy = pendingOccupancy;
			pendingOccupancy = null;
		}
		motions = null;
		if (!occupancy) {
			commitPositions();
			return;
		}
		positions = occupancy.map((node) => ({ ...thinkingPoint(node) }));
		origins = positions.map((p) => ({ ...p }));
		targets = positions.map((p) => ({ ...p }));
		paintDots(1);
		thinkMovesCompleted += 1;
		notifyThinkWaiters();
	}

	function resetClipTiming() {
		clipKind = null;
		clipRemainingThink = 0;
		clipFinalSnap = false;
		clipProgressStep = TURN_PROGRESS_STEP;
	}

	function refreshClipProgressStep() {
		if (working || returning || !clipFinalSnap || clipKind !== 'think') {
			clipProgressStep = TURN_PROGRESS_STEP;
			if (working || returning) clipFinalSnap = false;
			return;
		}
		clipProgressStep = thinkClipProgressStep({
			kind: 'think',
			calculationComplete: true,
			returningToStatic: false,
			remainingThinkMoves: 1
		});
	}

	function snapStatic() {
		occupancy = null;
		pendingOccupancy = null;
		motions = null;
		resetClipTiming();
		positions = palGeometry.static.positions.map((p) => ({ ...p }));
		origins = positions.map((p) => ({ ...p }));
		targets = positions.map((p) => ({ ...p }));
		paintDots(1);
	}

	function applyError(now: number) {
		const shakeT = (now - errorStartedAt) / ERROR_MS;
		if (shakeT >= 1) {
			mark.style.transform = '';
			for (const dot of dots) dot.setAttribute('fill', 'currentColor');
			erroring = false;
			return;
		}

		if (reducedMotion) {
			for (const dot of dots) dot.setAttribute('fill', ERROR_FILL);
			mark.style.transform = '';
			return;
		}

		const t = shakeT;
		const t2 = t * t;
		const envelope = 1 - t2 * t * (10 + t * (6 * t - 15));
		const travel = t * (2 - t2 * (2 - t));
		const amp = (ERROR_SHAKE_AMP / FRUSTUM) * (PAL_VIEWBOX / 2);
		const x = Math.sin(travel * Math.PI * ERROR_SHAKE_CYCLES) * (amp * envelope);
		mark.style.transform = `translate(${x}px, 0)`;
		const errorColorT = Math.sin(shakeT * Math.PI * ERROR_COLOR_CYCLES) * 0.5 + 0.5;
		const fill = mixHex(REST_FILL, ERROR_FILL, errorColorT);
		for (const dot of dots) dot.setAttribute('fill', fill);
	}

	function remainingThinkMoves(current: Queued): number {
		return (
			(current.kind === 'think' ? 1 : 0) + queue.filter((item) => item.kind === 'think').length
		);
	}

	/** Last two think moves before a wait target / return: singles only. */
	function finisherSingleOnly(): boolean {
		if (returning || !working) return true;
		for (const waiter of thinkWaiters) {
			if (thinkMovesCompleted >= waiter.count - 2) return true;
		}
		return false;
	}

	function pickThinkMove(occ: ThinkingNode[]): PalMove | null {
		return pickMove(occ, {
			previousKey,
			lastMove,
			singleOnly: finisherSingleOnly()
		});
	}

	function enqueueLookahead() {
		if (!working || returning || reducedMotion) return;
		if (queue.some((item) => item.kind === 'think')) return;
		const occ = pendingOccupancy ?? occupancy;
		if (!occ || new Set(occ).size !== 4) return;
		const move = pickThinkMove(occ);
		if (!move || !validateMove(occ, move)) return;
		queue.push({ kind: 'think', move });
	}

	function beginQueued(item: Queued) {
		origins = positions.map((p) => ({ ...p }));
		targets = positions.map((p) => ({ ...p }));
		motions = null;
		clipKind = item.kind;
		clipRemainingThink = remainingThinkMoves(item);
		clipFinalSnap =
			item.kind === 'think' &&
			!working &&
			!returning &&
			clipRemainingThink === 1;
		refreshClipProgressStep();
		if (item.kind === 'think') {
			if (!occupancy || occupancy.length !== 4 || new Set(occupancy).size !== 4) {
				playing = false;
				return;
			}
			if (!validateMove(occupancy, item.move)) {
				playing = false;
				return;
			}
			previousKey = configKey(occupancy);
			lastMove = item.move;
			pendingOccupancy = applyMove(occupancy, item.move);
			motions = motionsForMove(occupancy, item.move);
			origins = occupancy.map((node) => ({ ...thinkingPoint(node) }));
			targets = pendingOccupancy.map((node) => ({ ...thinkingPoint(node) }));
			enqueueLookahead();
		} else if (item.kind === 'worldSet') {
			occupancy = item.occupancy.slice();
			targets = item.targets.map((p) => ({ ...p }));
		} else {
			targets[item.step.dot] = { ...item.step.to };
			if (item.occupancy) occupancy = item.occupancy.slice();
		}
		animationProgress = 0;
		playing = true;
	}

	function playQueue() {
		const next = queue.shift();
		if (!next) {
			playing = false;
			return;
		}
		beginQueued(next);
	}

	function beginThinkingSession() {
		returning = false;
		queue = [];
		pendingOccupancy = null;
		motions = null;
		resetClipTiming();
		if (occupancy && isLegalThinking(occupancy) && new Set(occupancy).size === 4) {
			const move = pickThinkMove(occupancy);
			if (move) queue.push({ kind: 'think', move });
			playQueue();
			return;
		}
		lastMove = null;
		previousKey = null;
		const enter = thinkingAssignmentFromPoints(positions);
		occupancy = enter.occupancy.slice();
		if (new Set(occupancy).size !== 4) {
			playing = false;
			return;
		}
		if (enter.steps.length === 0) {
			const move = pickThinkMove(occupancy);
			if (move) queue.push({ kind: 'think', move });
			playQueue();
			return;
		}
		const nextTargets = positions.map((p) => ({ ...p }));
		const reservedNodes = new Set<ThinkingNode>();
		for (const step of enter.steps) {
			const node = occupancy[step.dot];
			if (reservedNodes.has(node)) {
				playing = false;
				return;
			}
			reservedNodes.add(node);
			nextTargets[step.dot] = { ...step.to };
		}
		queue.push({
			kind: 'worldSet',
			targets: nextTargets,
			occupancy: occupancy.slice()
		});
		playQueue();
	}

	function queueReset() {
		returning = true;
		lastMove = null;
		previousKey = null;
		queue = [];
		resetClipTiming();
		if (occupancy) {
			const path = shortestThinkingReset(occupancy);
			for (const move of path) queue.push({ kind: 'think', move });
			let projected = occupancy.slice();
			for (const move of path) projected = applyMove(projected, move);
			const from = projected.map((node) => thinkingPoint(node));
			for (const step of staticAssignmentSteps(from)) {
				queue.push({ kind: 'world', step });
			}
		} else {
			for (const step of staticAssignmentSteps(positions)) {
				queue.push({ kind: 'world', step });
			}
		}
		if (queue.length === 0) {
			returning = false;
			if (!isStaticConfiguration(positions)) snapStatic();
			playing = false;
			return;
		}
		playQueue();
	}

	function onTurnComplete() {
		if (pendingOccupancy) commitThink();
		else {
			motions = null;
			commitPositions();
		}
		if (queue.length > 0) {
			playQueue();
			return;
		}
		if (returning) {
			returning = false;
			if (isStaticConfiguration(positions)) occupancy = null;
			playing = false;
			if (working && !reducedMotion) ensureTurn();
			else notifySettleWaiters();
			return;
		}
		if (!working || reducedMotion) {
			if (!isStaticConfiguration(positions) && !reducedMotion) {
				queueReset();
				return;
			}
			if (reducedMotion) snapStatic();
			playing = false;
			notifySettleWaiters();
			return;
		}
		if (occupancy) {
			const move = pickThinkMove(occupancy);
			if (move) {
				queue.push({ kind: 'think', move });
				playQueue();
				return;
			}
		}
		playing = false;
	}

	function startLoop() {
		if (frameState.kind !== 'idle' || disposed) return;
		const scheduled: FrameState & { kind: 'scheduled' } = { kind: 'scheduled', id: 0 };
		frameState = scheduled;
		scheduled.id = requestAnimationFrame((now) => {
			// Cancelled callbacks cannot consume a newer frame's ownership.
			if (frameState !== scheduled || disposed) return;
			tick(now);
		});
	}

	function stopLoop() {
		if (frameState.kind === 'scheduled') cancelAnimationFrame(frameState.id);
		frameState = { kind: 'idle' };
	}

	function ensureTurn() {
		if (disposed || reducedMotion || !working || playing) return;
		beginThinkingSession();
		if (playing) startLoop();
	}

	function pulseError() {
		if (disposed) return;
		erroring = true;
		errorStartedAt = performance.now();
		// Shake and color are a paint overlay; the current occupancy and its
		// processing interpolation continue without restarting or slowing down.
		startLoop();
	}

	function tick(now: number) {
		if (disposed || frameState.kind !== 'scheduled') return;
		frameState = { kind: 'running' };

		if (playing) {
			refreshClipProgressStep();
			if (animationProgress >= 1) {
				onTurnComplete();
				animationProgress = 0;
			}
			if (playing) {
				paintDots(animationProgress);
				animationProgress += clipProgressStep;
			}
		}

		if (erroring) applyError(now);
		frameState = { kind: 'idle' };
		if (playing || erroring) startLoop();
	}

	function syncReducedMotion() {
		reducedMotion = Boolean(motionQuery?.matches);
		if (reducedMotion && erroring) {
			mark.style.transform = '';
			for (const dot of dots) dot.setAttribute('fill', 'currentColor');
			erroring = false;
		}
		if (reducedMotion && playing) {
			snapStatic();
			playing = false;
			returning = false;
			pendingOccupancy = null;
			motions = null;
			stopLoop();
		} else if (!reducedMotion && working) {
			ensureTurn();
		}
	}

	function resize() {}

	motionQuery?.addEventListener('change', syncReducedMotion);
	syncReducedMotion();
	snapStatic();

	return {
		canvas: root,
		setClockElapsed(elapsedMs: number) {
			if (!clockMode || disposed || clockSegments.length === 0) return;
			if (reducedMotion) {
				snapStatic();
				return;
			}
			const elapsed = Math.max(0, Math.min(elapsedMs, 59_999));
			const frame = countdownMotionFrame(elapsed);
			const segment = clockSegments[Math.min(frame.unit, clockSegments.length - 1)];
			origins = segment.from;
			targets = segment.to;
			motions = segment.motion;
			paintDots(frame.progress);
		},
		setWorking(next: boolean) {
			if (clockMode) return;
			working = next;
			if (working) {
				thinkMovesCompleted = 0;
				clipFinalSnap = false;
				clipProgressStep = TURN_PROGRESS_STEP;
				if (playing && occupancy && !returning) enqueueLookahead();
			}
			refreshClipProgressStep();
			if (disposed || reducedMotion) {
				if (working && reducedMotion) {
					// Reduced motion: count artificial iterations so boot can still wait.
					thinkMovesCompleted = Math.max(thinkMovesCompleted, 10);
					notifyThinkWaiters();
				}
				if (!working && reducedMotion) {
					snapStatic();
					playing = false;
					returning = false;
					notifySettleWaiters();
				}
				return;
			}
			if (working) {
				if (playing) startLoop();
				ensureTurn();
			} else if (!playing && !isStaticConfiguration(positions)) {
				queueReset();
				if (playing) startLoop();
			} else if (!playing && isStaticConfiguration(positions)) {
				notifySettleWaiters();
			}
		},
		waitForThinkMoves(count: number) {
			const need = Math.max(0, Math.floor(count));
			if (need === 0 || thinkMovesCompleted >= need || disposed) {
				return Promise.resolve();
			}
			if (reducedMotion) {
				thinkMovesCompleted = Math.max(thinkMovesCompleted, need);
				return Promise.resolve();
			}
			return new Promise<void>((resolve) => {
				thinkWaiters.push({ count: need, resolve });
			});
		},
		waitUntilStatic() {
			if (disposed || reducedMotion) {
				snapStatic();
				return Promise.resolve();
			}
			if (isSettledStatic()) return Promise.resolve();
			return new Promise<void>((resolve) => {
				settleWaiters.push(resolve);
			});
		},
		pulseError,
		resize,
		dispose() {
			if (disposed) return;
			disposed = true;
			playing = false;
			erroring = false;
			stopLoop();
			motionQuery?.removeEventListener('change', syncReducedMotion);
			mark.style.transform = '';
			while (thinkWaiters.length) thinkWaiters.pop()?.resolve();
			while (settleWaiters.length) settleWaiters.pop()?.();
		}
	};
}
