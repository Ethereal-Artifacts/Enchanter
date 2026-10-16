/**
 * PAL geometry: Ether static vs π/3 radial thinking.
 *
 * STATIC — Ether-monogram White SVG circles (Figma `1123:17267`), the metric
 * four-dot Ether also composed as `ether-hero`.
 * THINKING — centroid + six rays at θ₀ + k·π/3. A legal rest occupies the
 * centroid and any three distinct rays. Canonical Ether orientation is the
 * even triad. Ring-to-ring motion is a circular arc; centroid stays an interchange.
 */

export type Point = { readonly x: number; readonly y: number };

export type Ray = 0 | 1 | 2 | 3 | 4 | 5;
export type ThinkingNode = 'c' | Ray;

export const RAYS: readonly Ray[] = [0, 1, 2, 3, 4, 5];

export const PAL_VIEWBOX = 48;

/** Ether-monogram circle radius (`14.004 − 9.004`). */
export const PAL_DOT_RADIUS = 5;

/**
 * Canonical Ether static centers, SVG order:
 * bottom-left, bottom-right, top, inner.
 */
const STATIC_POSITIONS: readonly Point[] = [
	{ x: 9.004, y: 37.212 },
	{ x: 38.996, y: 37.212 },
	{ x: 24, y: 10.788 },
	{ x: 24, y: 27.848 }
];

const OUTER_STATIC = STATIC_POSITIONS.slice(0, 3);

const centroid: Point = {
	x: STATIC_POSITIONS.reduce((s, p) => s + p.x, 0) / 4,
	y: STATIC_POSITIONS.reduce((s, p) => s + p.y, 0) / 4
};

const radius =
	OUTER_STATIC.reduce((s, p) => s + Math.hypot(p.x - centroid.x, p.y - centroid.y), 0) / 3;

const principal = Math.atan2(STATIC_POSITIONS[2].y - centroid.y, STATIC_POSITIONS[2].x - centroid.x);

export const SEGMENT = Math.PI / 3;

const ring: readonly Point[] = RAYS.map((k) => ({
	x: centroid.x + radius * Math.cos(principal + k * SEGMENT),
	y: centroid.y + radius * Math.sin(principal + k * SEGMENT)
}));

export const palGeometry = {
	viewBox: PAL_VIEWBOX,
	dotRadius: PAL_DOT_RADIUS,
	static: {
		positions: STATIC_POSITIONS
	},
	thinking: {
		centroid,
		radius,
		principal,
		ring
	}
} as const;

/** Centroid + even triad (principal / Ether-like orientation). */
export const CANONICAL_THINKING: readonly ThinkingNode[] = ['c', 0, 2, 4];

export const EVEN_TRIAD: readonly Ray[] = [0, 2, 4];
export const ODD_TRIAD: readonly Ray[] = [1, 3, 5];

export function thinkingPoint(node: ThinkingNode): Point {
	return node === 'c' ? palGeometry.thinking.centroid : palGeometry.thinking.ring[node];
}

/** Shortest signed π/3 steps; 180° uses +3 (never a diameter chord through the centroid). */
export function ringArcDelta(from: Ray, to: Ray): number {
	let delta = (to - from + 6) % 6;
	if (delta === 0) return 0;
	if (delta > 3) delta -= 6;
	return delta;
}

export function pointOnRing(theta: number): Point {
	const { centroid, radius } = palGeometry.thinking;
	return {
		x: centroid.x + radius * Math.cos(theta),
		y: centroid.y + radius * Math.sin(theta)
	};
}

/** Open π/3 nodes between from and to on the chosen signed arc (excludes endpoints). */
export function ringArcInterior(from: Ray, to: Ray): Ray[] {
	const delta = ringArcDelta(from, to);
	const steps = Math.abs(delta);
	if (steps < 2) return [];
	const sign = delta > 0 ? 1 : -1;
	const interior: Ray[] = [];
	for (let k = 1; k < steps; k += 1) {
		interior.push((((from + sign * k) % 6) + 6) % 6 as Ray);
	}
	return interior;
}

export function sampleRingArc(from: Ray, to: Ray, t: number): Point {
	const delta = ringArcDelta(from, to);
	const theta = palGeometry.thinking.principal + (from + delta * t) * SEGMENT;
	return pointOnRing(theta);
}

export function isLegalStep(from: ThinkingNode, to: ThinkingNode): boolean {
	if (from === to) return false;
	if (from === 'c' || to === 'c') return true;
	return true;
}

export function ringNeighbors(ray: Ray): [Ray, Ray] {
	return [((ray + 5) % 6) as Ray, ((ray + 1) % 6) as Ray];
}

export function thinkingAdjacent(a: ThinkingNode, b: ThinkingNode): boolean {
	if (a === b) return false;
	if (a === 'c' || b === 'c') return true;
	const [prev, next] = ringNeighbors(a);
	return b === prev || b === next;
}

/** Destinations for one atomic step: centroid interchange or any other ring node (arc). */
export function thinkingDestinations(node: ThinkingNode): ThinkingNode[] {
	if (node === 'c') return [...RAYS];
	return ['c', ...RAYS.filter((ray) => ray !== node)];
}

export function occupancySet(occupancy: readonly ThinkingNode[]): Set<ThinkingNode> {
	return new Set(occupancy);
}

export function sameConfiguration(
	a: readonly ThinkingNode[],
	b: readonly ThinkingNode[]
): boolean {
	if (a.length !== b.length) return false;
	const sb = occupancySet(b);
	return a.every((node) => sb.has(node));
}

function sortedRays(occupancy: readonly ThinkingNode[]): Ray[] {
	return occupancy.filter((n): n is Ray => n !== 'c').sort((a, b) => a - b);
}

export function isLegalThinking(occupancy: readonly ThinkingNode[]): boolean {
	if (occupancy.length !== 4 || new Set(occupancy).size !== 4) return false;
	if (!occupancy.includes('c')) return false;
	const rays = sortedRays(occupancy);
	return rays.length === 3;
}

export function isCanonicalThinking(occupancy: readonly ThinkingNode[]): boolean {
	return occupancy.includes('c') && sameConfiguration(occupancy, CANONICAL_THINKING);
}

const POSITION_EPS = 0.05;

function nearly(a: Point, b: Point): boolean {
	return Math.hypot(a.x - b.x, a.y - b.y) < POSITION_EPS;
}

/** Configuration match: four points occupy the four static Ether positions, any order. */
export function isStaticConfiguration(points: readonly Point[]): boolean {
	if (points.length !== 4) return false;
	const used = new Set<number>();
	for (const point of points) {
		const idx = palGeometry.static.positions.findIndex(
			(target, i) => !used.has(i) && nearly(point, target)
		);
		if (idx < 0) return false;
		used.add(idx);
	}
	return used.size === 4;
}

export function assignMinCost(from: readonly Point[], to: readonly Point[]): number[] {
	const n = from.length;
	let best: number[] = from.map((_, i) => i);
	let bestCost = Infinity;

	function perm(prefix: number[], rest: number[]) {
		if (rest.length === 0) {
			let cost = 0;
			for (let i = 0; i < n; i += 1) {
				const a = from[i];
				const b = to[prefix[i]];
				cost += Math.hypot(a.x - b.x, a.y - b.y);
			}
			if (cost < bestCost) {
				bestCost = cost;
				best = prefix.slice();
			}
			return;
		}
		for (let i = 0; i < rest.length; i += 1) {
			perm([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
		}
	}

	perm(
		[],
		to.map((_, i) => i)
	);
	return best;
}

export function configKey(occupancy: readonly ThinkingNode[]): string {
	return [...occupancy].map(String).sort().join(',');
}

/**
 * Uniquely index four world points onto thinking nodes (centroid + rays).
 * Destinations are reserved: no two points share a node.
 */
export function indexThinkingOccupancy(points: readonly Point[]): ThinkingNode[] {
	if (points.length !== 4) {
		throw new Error('PAL occupancy requires four points');
	}

	const rayCombos: Ray[][] = [];
	for (let a = 0; a < 6; a += 1) {
		for (let b = a + 1; b < 6; b += 1) {
			for (let c = b + 1; c < 6; c += 1) {
				rayCombos.push([a as Ray, b as Ray, c as Ray]);
			}
		}
	}

	let best: ThinkingNode[] | null = null;
	let bestCost = Infinity;

	for (const rays of rayCombos) {
		const nodes: ThinkingNode[] = ['c', ...rays];
		const dests = nodes.map(thinkingPoint);
		const map = assignMinCost(points, dests);
		const occ: ThinkingNode[] = [];
		let cost = 0;
		for (let i = 0; i < 4; i += 1) {
			occ[i] = nodes[map[i]];
			const to = dests[map[i]];
			cost += Math.hypot(points[i].x - to.x, points[i].y - to.y);
		}
		if (new Set(occ).size !== 4 || !occ.includes('c')) continue;
		if (cost < bestCost) {
			bestCost = cost;
			best = occ;
		}
	}

	if (!best) throw new Error('PAL failed to index thinking occupancy');
	return best;
}
