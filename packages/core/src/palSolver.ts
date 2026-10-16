import {
	CANONICAL_THINKING,
	assignMinCost,
	configKey,
	isCanonicalThinking,
	isLegalThinking,
	isLegalStep,
	occupancySet,
	ringArcInterior,
	palGeometry,
	ringArcDelta,
	sameConfiguration,
	thinkingDestinations,
	indexThinkingOccupancy,
	thinkingPoint,
	type Point,
	type Ray,
	type ThinkingNode
} from './palGeometry.js';

export type PalStep = { dot: number; from: ThinkingNode; to: ThinkingNode };
export type PalMove = { steps: PalStep[] };

/** After uniform 1-in-4 class pick, 1-dot must pass this catch (0.25 × 0.40 ≈ 0.10). */
export const ONE_DOT_CATCH = 0.4;
export const MOVE_CLASS_WEIGHT: Record<1 | 2 | 3 | 4, number> = {
	1: 1,
	2: 1,
	3: 1,
	4: 1.3
};

/** Repeat a non-arc transformation in the same ring sense, when legal. */
export const MOVE_REPEAT_BIAS = 0.25;

export type PickContext = {
	random?: () => number;
	previousKey?: string | null;
	lastMove?: PalMove | null;
	/** Finisher / last approach: only 1-dot moves (no double-dot turns). */
	singleOnly?: boolean;
};

function uniqueDestinations(steps: PalStep[]): boolean {
	const dest = steps.map((step) => step.to);
	return new Set(dest).size === dest.length;
}

/** Two dots must not exchange their current nodes (including centroid ↔ ray). */
function hasPairwiseSwap(steps: readonly PalStep[]): boolean {
	for (let i = 0; i < steps.length; i += 1) {
		for (let j = i + 1; j < steps.length; j += 1) {
			if (steps[i].to === steps[j].from && steps[j].to === steps[i].from) return true;
		}
	}
	return false;
}

function isIdentity(occupancy: readonly ThinkingNode[], next: readonly ThinkingNode[]): boolean {
	return occupancy.every((node, i) => node === next[i]);
}

function reversedMove(move: PalMove): PalMove {
	return {
		steps: move.steps.map((step) => ({ dot: step.dot, from: step.to, to: step.from }))
	};
}

function sameMove(a: PalMove, b: PalMove): boolean {
	if (a.steps.length !== b.steps.length) return false;
	const key = (m: PalMove) =>
		m.steps
			.map((s) => `${s.dot}:${s.from}>${s.to}`)
			.sort()
			.join('|');
	return key(a) === key(b);
}

export function validateMove(
	occupancy: readonly ThinkingNode[],
	move: PalMove
): boolean {
	if (occupancy.length !== 4 || move.steps.length === 0) return false;
	if (!uniqueDestinations(move.steps) || hasPairwiseSwap(move.steps)) return false;
	const hasArc = move.steps.some((step) => step.from !== 'c' && step.to !== 'c');
	if (hasArc && move.steps.length > 2) return false;
	const movers = new Set(move.steps.map((step) => step.dot));
	const claimed = new Set(move.steps.map((step) => step.to));
	for (const step of move.steps) {
		if (step.dot < 0 || step.dot >= occupancy.length) return false;
		if (occupancy[step.dot] !== step.from) return false;
		if (!isLegalStep(step.from, step.to)) return false;
	}
	for (let i = 0; i < occupancy.length; i += 1) {
		if (!movers.has(i) && claimed.has(occupancy[i])) return false;
	}
	const occupied = occupancySet(occupancy);
	const sweepReserved = new Set<ThinkingNode>();
	for (const step of move.steps) {
		if (step.from === 'c' || step.to === 'c') continue;
		for (const ray of ringArcInterior(step.from, step.to)) {
			if (occupied.has(ray) || claimed.has(ray) || sweepReserved.has(ray)) return false;
			sweepReserved.add(ray);
		}
	}
	const next = occupancy.slice();
	for (const step of move.steps) next[step.dot] = step.to;
	if (new Set(next).size !== 4) return false;
	if (!isLegalThinking(next)) return false;
	if (isIdentity(occupancy, next)) return false;
	return true;
}

/**
 * Atomic radial transformations: ring arcs and centroid interchange.
 * Destinations reserved; result must be a legal triad+center.
 */
export function enumerateMoves(occupancy: readonly ThinkingNode[]): PalMove[] {
	if (!isLegalThinking(occupancy)) return [];
	const moves: PalMove[] = [];
	const seenSignatures = new Set<string>();
	const n = occupancy.length;
	const maxMask = 1 << n;

	for (let mask = 1; mask < maxMask; mask += 1) {
		const movers: number[] = [];
		for (let i = 0; i < n; i += 1) {
			if (mask & (1 << i)) movers.push(i);
		}

		const choices = movers.map((dot) => thinkingDestinations(occupancy[dot]));

		function walk(index: number, steps: PalStep[]) {
			if (index === movers.length) {
				if (!uniqueDestinations(steps)) return;
				if (hasPairwiseSwap(steps)) return;
				if (!validateMove(occupancy, { steps })) return;
				const signature = steps
					.map((s) => `${s.dot}:${s.from}>${s.to}`)
					.sort()
					.join('|');
				if (seenSignatures.has(signature)) return;
				seenSignatures.add(signature);
				moves.push({ steps: steps.map((s) => ({ ...s })) });
				return;
			}
			const dot = movers[index];
			const from = occupancy[dot];
			for (const to of choices[index]) {
				steps.push({ dot, from, to });
				walk(index + 1, steps);
				steps.pop();
			}
		}

		walk(0, []);
	}

	return moves;
}

export function applyMove(
	occupancy: readonly ThinkingNode[],
	move: PalMove
): ThinkingNode[] {
	const next = occupancy.slice();
	const claimed = new Set<ThinkingNode>();
	for (const step of move.steps) {
		if (claimed.has(step.to)) throw new Error('PAL destination collision');
		claimed.add(step.to);
	}
	for (const step of move.steps) {
		next[step.dot] = step.to;
	}
	if (new Set(next).size !== next.length) throw new Error('PAL duplicate occupancy');
	return next;
}

function hasRingArc(move: PalMove): boolean {
	return move.steps.some((step) => step.from !== 'c' && step.to !== 'c');
}

function centroidOutRays(move: PalMove): Ray[] {
	return move.steps
		.filter((step): step is PalStep & { to: Ray } => step.from === 'c' && step.to !== 'c')
		.map((step) => step.to);
}

function centroidInRays(move: PalMove): Ray[] {
	return move.steps
		.filter((step): step is PalStep & { from: Ray } => step.from !== 'c' && step.to === 'c')
		.map((step) => step.from);
}

/** +1 / −1 ring sense from a centroid interchange; null for arcs or undirected hops. */
function transformationSense(move: PalMove): 1 | -1 | null {
	if (hasRingArc(move)) return null;
	const ins = centroidInRays(move);
	const outs = centroidOutRays(move);
	if (ins.length === 0 || outs.length === 0) return null;
	let sign = 0;
	for (let i = 0; i < Math.min(ins.length, outs.length); i += 1) {
		const delta = ringArcDelta(ins[i], outs[i]);
		if (delta === 0) continue;
		sign += delta > 0 ? 1 : -1;
	}
	if (sign === 0) return null;
	return sign > 0 ? 1 : -1;
}

function continuesSameDirection(previous: PalMove, next: PalMove): boolean {
	if (hasRingArc(next) || hasRingArc(previous)) return false;
	if (next.steps.length !== previous.steps.length) return false;
	if (centroidInRays(next).length !== centroidInRays(previous).length) return false;
	if (centroidOutRays(next).length !== centroidOutRays(previous).length) return false;
	const sense = transformationSense(previous);
	if (!sense) return false;
	const prevOuts = centroidOutRays(previous);
	const nextOuts = centroidOutRays(next);
	if (prevOuts.length === 0 || nextOuts.length !== prevOuts.length) return false;
	return nextOuts.every((ray, i) => {
		const delta = ringArcDelta(prevOuts[i] ?? prevOuts[0]!, ray);
		if (delta === 0) return false;
		return (delta > 0 ? 1 : -1) === sense;
	});
}

function pickWeightedClass(
	classes: Array<1 | 2 | 3 | 4>,
	random: () => number
): 1 | 2 | 3 | 4 | null {
	if (classes.length === 0) return null;
	const weights = classes.map((count) => MOVE_CLASS_WEIGHT[count]);
	const sum = weights.reduce((a, b) => a + b, 0);
	let ticket = random() * sum;
	for (let i = 0; i < classes.length; i += 1) {
		ticket -= weights[i];
		if (ticket <= 0) return classes[i];
	}
	return classes[classes.length - 1] ?? null;
}

export function pickMove(
	occupancy: readonly ThinkingNode[],
	context: PickContext = {}
): PalMove | null {
	const random = context.random ?? Math.random;
	if (!isLegalThinking(occupancy) || new Set(occupancy).size !== 4) return null;
	const all = enumerateMoves(occupancy);
	if (all.length === 0) return null;

	const allowed = (move: PalMove) => {
		if (!validateMove(occupancy, move)) return false;
		if (context.lastMove && sameMove(move, reversedMove(context.lastMove))) return false;
		if (context.previousKey) {
			const next = applyMove(occupancy, move);
			if (configKey(next) === context.previousKey) return false;
		}
		return true;
	};

	const byClass: Record<1 | 2 | 3 | 4, PalMove[]> = { 1: [], 2: [], 3: [], 4: [] };
	for (const move of all) {
		if (!allowed(move)) continue;
		const count = move.steps.length as 1 | 2 | 3 | 4;
		byClass[count].push(move);
	}

	if (context.singleOnly) {
		const singles = byClass[1];
		if (singles.length === 0) return null;
		if (context.lastMove && random() < MOVE_REPEAT_BIAS) {
			const continued = singles.filter((move) =>
				continuesSameDirection(context.lastMove!, move)
			);
			if (continued.length > 0) {
				return continued[Math.floor(random() * continued.length)] ?? null;
			}
		}
		return singles[Math.floor(random() * singles.length)] ?? null;
	}

	const legalClasses = ([1, 2, 3, 4] as const).filter((count) => byClass[count].length > 0);
	if (legalClasses.length === 0) return null;

	if (context.lastMove && random() < MOVE_REPEAT_BIAS) {
		const continued = all.filter(
			(move) => allowed(move) && continuesSameDirection(context.lastMove!, move)
		);
		if (continued.length > 0) {
			return continued[Math.floor(random() * continued.length)] ?? null;
		}
	}

	for (let attempt = 0; attempt < 24; attempt += 1) {
		const count = pickWeightedClass(legalClasses, random);
		if (!count) return null;
		if (count === 1 && random() >= ONE_DOT_CATCH) continue;
		const pool = byClass[count];
		if (pool.length === 0) continue;
		return pool[Math.floor(random() * pool.length)] ?? null;
	}

	const reroll = legalClasses.filter((count) => count !== 1 || byClass[1].length === 0);
	const classes = reroll.length > 0 ? reroll : legalClasses;
	const count = pickWeightedClass(classes, random);
	if (!count) return null;
	const pool = byClass[count];
	return pool[Math.floor(random() * pool.length)] ?? null;
}

/**
 * BFS back to canonical thinking. Finisher paths use only 1-dot moves so the
 * last approach is never a double-dot turn. Falls back to any-move BFS if
 * singles cannot reach the even triad (should be rare).
 */
export function shortestThinkingReset(occupancy: readonly ThinkingNode[]): PalMove[] {
	if (isCanonicalThinking(occupancy)) return [];

	const search = (singleOnly: boolean): PalMove[] => {
		const start = occupancy.slice();
		const queue: { occ: ThinkingNode[]; path: PalMove[] }[] = [{ occ: start, path: [] }];
		const seen = new Set([configKey(start)]);

		while (queue.length > 0) {
			const { occ, path } = queue.shift()!;
			const moves = enumerateMoves(occ).filter(
				(move) => !singleOnly || move.steps.length === 1
			);
			for (const move of moves) {
				const next = applyMove(occ, move);
				const key = configKey(next);
				if (seen.has(key)) continue;
				const nextPath = [...path, move];
				if (sameConfiguration(next, CANONICAL_THINKING)) {
					// Last two movements (or whole path if shorter) must be singles.
					const tail = nextPath.slice(-Math.min(2, nextPath.length));
					if (tail.every((m) => m.steps.length === 1)) return nextPath;
					if (singleOnly) return nextPath;
					continue;
				}
				seen.add(key);
				queue.push({ occ: next, path: nextPath });
			}
		}
		return [];
	};

	const singles = search(true);
	if (singles.length > 0) return singles;
	return search(false);
}

export type WorldStep = { dot: number; from: Point; to: Point };

export function staticAssignmentSteps(from: readonly Point[]): WorldStep[] {
	const targets = palGeometry.static.positions;
	const map = assignMinCost(from, targets);
	const steps: WorldStep[] = [];
	for (let dot = 0; dot < from.length; dot += 1) {
		const to = targets[map[dot]];
		if (Math.hypot(from[dot].x - to.x, from[dot].y - to.y) < 0.05) continue;
		steps.push({ dot, from: from[dot], to });
	}
	return steps;
}

export function thinkingAssignmentFromPoints(points: readonly Point[]): {
	occupancy: ThinkingNode[];
	steps: WorldStep[];
} {
	const occupancy = indexThinkingOccupancy(points);
	const claimed = new Set<ThinkingNode>();
	const steps: WorldStep[] = [];
	for (let dot = 0; dot < points.length; dot += 1) {
		const node = occupancy[dot];
		if (claimed.has(node)) throw new Error('PAL initial destination collision');
		claimed.add(node);
		const to = thinkingPoint(node);
		if (Math.hypot(points[dot].x - to.x, points[dot].y - to.y) < 0.05) continue;
		steps.push({ dot, from: points[dot], to });
	}
	return { occupancy, steps };
}

export function thinkingAssignmentFromStatic(): { occupancy: ThinkingNode[]; steps: WorldStep[] } {
	return thinkingAssignmentFromPoints(palGeometry.static.positions);
}
