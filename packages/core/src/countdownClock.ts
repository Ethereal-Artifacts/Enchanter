export const COUNTDOWN_UNIT_MS = 1000;
const COUNTDOWN_PREDELAY_MS = 600;
const COUNTDOWN_MOTION_MS = 675;

export function countdownMotionFrame(elapsedMs: number): { unit: number; progress: number } {
	const elapsed = Math.max(0, elapsedMs);
	// The first move begins with the countdown. Later moves retain the 600 ms delay
	// after their second boundary, then interpolate for 650 ms.
	if (elapsed < COUNTDOWN_UNIT_MS + COUNTDOWN_PREDELAY_MS) {
		return { unit: 0, progress: Math.min(1, elapsed / COUNTDOWN_MOTION_MS) };
	}
	const delayed = elapsed - COUNTDOWN_PREDELAY_MS;
	return {
		unit: Math.floor(delayed / COUNTDOWN_UNIT_MS),
		progress: Math.min(1, (delayed % COUNTDOWN_UNIT_MS) / COUNTDOWN_MOTION_MS)
	};
}
