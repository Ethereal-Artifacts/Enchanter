/**
 * Centered-group logo — SVG PAL from origin/launch-navigation-fixes
 * (the four-dot Enchanter mark).
 */

import { palGeometry } from '@ethereal/enchanter-core/palGeometry';
import { createRuntime as createPalRuntime, type Runtime } from '@ethereal/enchanter-core/pal.runtime';

export type { Runtime };

function buildPalSvg(): SVGSVGElement {
	const ns = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(ns, 'svg');
	svg.setAttribute('class', 'pal');
	svg.setAttribute('viewBox', `0 0 ${palGeometry.viewBox} ${palGeometry.viewBox}`);
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('aria-hidden', 'true');

	const mark = document.createElementNS(ns, 'g');
	mark.setAttribute('class', 'pal__mark');
	for (const dot of palGeometry.static.positions) {
		const circle = document.createElementNS(ns, 'circle');
		circle.setAttribute('class', 'pal-dot');
		circle.setAttribute('cx', String(dot.x));
		circle.setAttribute('cy', String(dot.y));
		circle.setAttribute('r', String(palGeometry.dotRadius));
		circle.setAttribute('fill', 'currentColor');
		mark.append(circle);
	}
	svg.append(mark);
	return svg;
}

export function createRuntime(): Runtime {
	const svg = buildPalSvg();
	return createPalRuntime(svg);
}
