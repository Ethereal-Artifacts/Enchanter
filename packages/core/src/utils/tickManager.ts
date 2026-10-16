/**
 * Enchanter - Tick Manager
 *
 * Owns the simulation clock.
 *
 * Tempo-owned paths (locked BPM, free-run tickRate, MIDI disconnect fallback)
 * emit ticks from the display vsync loop via harmonic subdivision of BPM:
 * musical phase accumulates per frame; ticks fire only on frame boundaries.
 *
 * Live MIDI Clock still emits from pulses while transport is running — hardware
 * phase stays authoritative; vsync only paints.
 */

import { EventBus } from './eventBus.js';
import { config } from '../config.js';

export type TickClockSource = 'internal' | 'midi' | 'harmonic';

export type MidiTransportState = 'stopped' | 'running' | 'disconnected';

/** Simulation ticks intended per quarter note. K=24 ≈ one tick per MIDI clock pulse. */
export const DEFAULT_TICKS_PER_QUARTER = 24;

const MIDI_PPQN = 24;
const CLOCK_TIMEOUT_MS = 600;
const BPM_SMOOTH = 0.25;
/** Cap catch-up ticks per display frame (spiral-of-death guard). */
const MAX_TICKS_PER_FRAME = 4;
const FPS_EMA = 0.15;

export class TickManager {
  private eventBus: EventBus;
  public cycleCount: number;

  private clockSource: TickClockSource = 'harmonic';
  private ticksPerQuarter = DEFAULT_TICKS_PER_QUARTER;
  private pulseAccumulator = 0;
  private pulsesPerTick: number;
  private lastClockAtMs: number | null = null;
  private estimatedBpm: number | null = null;
  private transport: MidiTransportState = 'stopped';
  private midiOwnsTiming = false;
  private waitingForMidiStart = false;
  /** Locked internal BPM; when set, TickManager owns tempo without MIDI Clock. */
  private lockedBpm: number | null = null;

  private running = false;
  private lastFrameAtMs: number | null = null;
  /** Fractional simulation ticks owed (musical phase × K). */
  private tickPhase = 0;
  /** Continuous quarter-note phase (does not reset on tick emit). */
  private quarterPhase = 0;
  private beatsPerBar = 4;
  private downbeatThisFrame = false;
  private lastBarIndex = -1;
  /** Accumulated operator phase correction in quarter notes (display only). */
  private downbeatCorrectionQuarters = 0;
  /** When false, bar/downbeat phase is frozen (starts on media play). */
  private beatTransport = false;
  private displayFpsEma: number | null = null;
  /** Operator quantizer framerate; 0/null = use measured display fps. */
  private quantizerFps: number | null = null;
  private lastFramesPerTick: number | null = null;

  constructor() {
    this.eventBus = new EventBus();
    this.cycleCount = 0;
    this.pulsesPerTick = MIDI_PPQN / this.ticksPerQuarter;
  }

  start(): void {
    this.running = true;
    this.lastFrameAtMs = null;
    // Keep residual phase when restarting so unlock/lock does not hitch hard.
    if (this.midiOwnsTiming && this.transport === 'stopped') {
      this.clockSource = 'midi';
      return;
    }
    if (this.usesMidiPulseEmission()) {
      this.clockSource = 'midi';
      return;
    }
    this.clockSource = 'harmonic';
    this.syncTickRateFromTempo();
  }

  stop(): void {
    this.running = false;
    this.lastFrameAtMs = null;
  }

  isRunning(): boolean {
    if (!this.running) return false;
    if (this.midiOwnsTiming && this.transport === 'stopped') return false;
    return true;
  }

  onTick(callback: (data: { cycle: number }) => void): void {
    this.eventBus.on('tick', callback);
  }

  getClockSource(): TickClockSource {
    return this.clockSource;
  }

  getEstimatedBpm(): number | null {
    return this.estimatedBpm;
  }

  getTransportState(): MidiTransportState {
    return this.transport;
  }

  isMidiOwningTiming(): boolean {
    return this.midiOwnsTiming;
  }

  /** MIDI Clock or locked BPM — macros must not rewrite tickRate. */
  isTempoOwningTiming(): boolean {
    return this.midiOwnsTiming || this.lockedBpm != null;
  }

  getLockedBpm(): number | null {
    return this.lockedBpm;
  }

  getTicksPerQuarter(): number {
    return this.ticksPerQuarter;
  }

  /** Smoothed display fps observed by advanceFrame (null until two frames). */
  getDisplayFps(): number | null {
    return this.displayFpsEma;
  }

  /** Framerate used by the harmonic quantizer (setting or measured). */
  getQuantizerFps(): number | null {
    return this.quantizerFps ?? this.displayFpsEma;
  }

  getQuantizerFpsSetting(): number {
    return this.quantizerFps ?? 0;
  }

  /**
   * Global quantizer framerate. Pass 0/null for auto (measured vsync).
   * Locked values (24/30/48/60/120) drive frames-per-tick harmonics.
   */
  setQuantizerFps(fps: number | null): void {
    if (fps == null || !Number.isFinite(fps) || fps <= 0) {
      this.quantizerFps = null;
      return;
    }
    this.quantizerFps = Math.max(12, Math.min(240, fps));
  }

  /**
   * Ideal display frames between simulation ticks at the current tempo/fps.
   * Integer harmonics read cleanly; non-integer means nearest-frame quantize.
   */
  getFramesPerTick(): number | null {
    return this.lastFramesPerTick;
  }

  getBeatsPerBar(): number {
    return this.beatsPerBar;
  }

  setBeatsPerBar(n: number): void {
    if (!Number.isFinite(n) || n < 1) return;
    this.beatsPerBar = Math.max(1, Math.min(16, Math.round(n)));
  }

  /** Fractional quarters since transport origin (monotonic while running). */
  getQuarterPhase(): number {
    return this.quarterPhase;
  }

  /** Beat index within the bar, 1..beatsPerBar. */
  getBeatInBar(): number {
    const q = ((this.quarterPhase % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
    return Math.floor(q) + 1;
  }

  /** 0..1 progress through the current bar. */
  getBarPhase(): number {
    const q = ((this.quarterPhase % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
    return q / this.beatsPerBar;
  }

  /** True if this frame crossed a downbeat (bar boundary). Cleared on next advanceFrame. */
  didDownbeat(): boolean {
    return this.downbeatThisFrame;
  }

  /** UI consumes a MIDI-latched downbeat after painting the frame. */
  clearDownbeat(): void {
    this.downbeatThisFrame = false;
  }

  getDownbeatCorrectionQuarters(): number {
    return this.downbeatCorrectionQuarters;
  }

  isBeatTransportRunning(): boolean {
    return this.beatTransport;
  }

  /**
   * Arm/disarm the bar clock. Turning on resets to downbeat (beat 1).
   * Simulation ticks are unaffected.
   */
  setBeatTransport(running: boolean): void {
    if (running === this.beatTransport) return;
    this.beatTransport = running;
    if (running) {
      this.quarterPhase = Math.floor(this.quarterPhase / this.beatsPerBar) * this.beatsPerBar;
      this.lastBarIndex = Math.floor(this.quarterPhase / this.beatsPerBar);
      this.downbeatThisFrame = true;
      this.downbeatCorrectionQuarters = 0;
    }
  }

  /**
   * Declare that right now is the downbeat (beat 1).
   * Snaps bar phase to 0 without changing BPM.
   */
  correctDownbeatNow(): void {
    const intoBar = ((this.quarterPhase % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
    this.quarterPhase -= intoBar;
    this.downbeatCorrectionQuarters -= intoBar;
    this.lastBarIndex = Math.floor(this.quarterPhase / this.beatsPerBar);
    this.downbeatThisFrame = true;
  }

  /**
   * Shift downbeat phase by quarter notes.
   * Positive = our clock runs ahead of the music (downbeat arrives sooner).
   * Negative = delay our downbeat.
   */
  nudgeDownbeat(quarters: number): void {
    if (!Number.isFinite(quarters) || quarters === 0) return;
    this.quarterPhase += quarters;
    this.downbeatCorrectionQuarters += quarters;
    this.lastBarIndex = Math.floor(this.quarterPhase / this.beatsPerBar);
    const intoBar = ((this.quarterPhase % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
    if (intoBar < 1e-6) this.downbeatThisFrame = true;
  }

  /** Clear accumulated correction tracking (phase unchanged). */
  resetDownbeatCorrectionLabel(): void {
    this.downbeatCorrectionQuarters = 0;
  }

  /** 0..1 brightness envelope for the current beat (1 at beat attack, decays). */
  getBeatPulse(): number {
    const q = ((this.quarterPhase % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
    const intoBeat = q - Math.floor(q);
    return Math.max(0, 1 - intoBeat * 4);
  }

  setTicksPerQuarter(k: number): void {
    if (!Number.isFinite(k) || k <= 0) return;
    this.ticksPerQuarter = k;
    this.pulsesPerTick = MIDI_PPQN / k;
    this.pulseAccumulator = 0;
    this.syncTickRateFromTempo();
  }

  /**
   * Lock simulation to a fixed BPM on the harmonic frame clock.
   * Pass null to unlock. While locked (and MIDI not owning), macros cannot rewrite tickRate.
   */
  setLockedBpm(bpm: number | null): void {
    if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) {
      this.lockedBpm = null;
      this.syncTickRateFromTempo();
      if (!this.midiOwnsTiming) this.clockSource = 'harmonic';
      return;
    }
    this.lockedBpm = Math.max(20, Math.min(300, bpm));
    this.estimatedBpm = this.lockedBpm;
    this.syncTickRateFromTempo();
    if (!this.midiOwnsTiming) this.clockSource = 'harmonic';
  }

  /**
   * When true, preset/audio macros must not rewrite tickRate; TickManager drives tempo.
   */
  setMidiTimingOwnership(enabled: boolean): void {
    if (this.midiOwnsTiming === enabled) return;
    this.midiOwnsTiming = enabled;
    this.pulseAccumulator = 0;
    this.lastClockAtMs = null;
    this.tickPhase = 0;
    if (!enabled) {
      this.clockSource = 'harmonic';
      this.transport = 'stopped';
      this.waitingForMidiStart = false;
      this.syncTickRateFromTempo();
      return;
    }
    this.clockSource = 'midi';
    this.waitingForMidiStart = false;
    this.transport = 'stopped';
  }

  /**
   * Drive harmonic (frame-quantized) simulation from the vsync loop.
   * Returns how many simulation ticks were emitted this frame.
   */
  advanceFrame(nowMs: number = performance.now()): number {
    this.pollMidiWatchdog(nowMs);

    if (!this.running) {
      this.downbeatThisFrame = false;
      this.lastFrameAtMs = nowMs;
      return 0;
    }
    if (this.midiOwnsTiming && this.transport === 'stopped') {
      this.downbeatThisFrame = false;
      this.lastFrameAtMs = nowMs;
      return 0;
    }
    if (this.usesMidiPulseEmission()) {
      // Keep any downbeat latched by MIDI pulses until the UI paints this frame.
      this.lastFrameAtMs = nowMs;
      return 0;
    }

    this.downbeatThisFrame = false;

    if (this.lastFrameAtMs == null) {
      this.lastFrameAtMs = nowMs;
      this.clockSource = 'harmonic';
      return 0;
    }

    const dtMs = nowMs - this.lastFrameAtMs;
    this.lastFrameAtMs = nowMs;
    if (!(dtMs > 0) || dtMs > 250) {
      // Tab resume / hitch — resync phase without dumping a burst.
      this.tickPhase = 0;
      return 0;
    }

    const dtSec = dtMs / 1000;
    const fpsInstant = 1 / dtSec;
    this.displayFpsEma =
      this.displayFpsEma == null
        ? fpsInstant
        : this.displayFpsEma * (1 - FPS_EMA) + fpsInstant * FPS_EMA;

    const bpm = this.effectiveBpm();
    const tickRate = this.clampTickRate((bpm * this.ticksPerQuarter) / 60);
    config.tickRate = tickRate;
    const quantFps = this.quantizerFps ?? this.displayFpsEma;
    this.lastFramesPerTick =
      quantFps != null && tickRate > 0 ? quantFps / tickRate : null;

    // Bar/downbeat UI clock — only while media transport is playing.
    if (this.beatTransport) {
      this.quarterPhase += (bpm / 60) * dtSec;
      this.noteDownbeatCrossing();
    }

    // Musical phase: quarters per second = bpm/60; ticks per quarter = K.
    this.tickPhase += (bpm / 60) * this.ticksPerQuarter * dtSec;

    // Optional integer-harmonic snap: when frames/tick is near an integer,
    // emit at most one tick on the nearest frame boundary (cleaner pixels).
    const harmonic = this.lastFramesPerTick;
    let emitted = 0;
    if (
      harmonic != null &&
      Number.isFinite(harmonic) &&
      harmonic >= 1 &&
      Math.abs(harmonic - Math.round(harmonic)) < 0.08
    ) {
      const framesPerTick = Math.max(1, Math.round(harmonic));
      // Convert phase to frame units relative to harmonic grid.
      while (this.tickPhase >= 1 - 1e-9 && emitted < MAX_TICKS_PER_FRAME) {
        this.tickPhase -= 1;
        this.emitTick();
        emitted += 1;
        // Soft-lock: discard tiny residual so the next tick waits ~framesPerTick frames.
        if (this.tickPhase < 1 / framesPerTick) this.tickPhase = 0;
      }
    } else {
      while (this.tickPhase >= 1 - 1e-9 && emitted < MAX_TICKS_PER_FRAME) {
        this.tickPhase -= 1;
        this.emitTick();
        emitted += 1;
      }
      if (emitted === MAX_TICKS_PER_FRAME) this.tickPhase = Math.min(this.tickPhase, 0.999);
    }

    this.clockSource = 'harmonic';
    return emitted;
  }

  /** MIDI Start (0xFA): begin from next clock; do not reset cycleCount. */
  onMidiStart(): void {
    if (!this.midiOwnsTiming) return;
    this.waitingForMidiStart = false;
    this.transport = 'running';
    this.pulseAccumulator = 0;
    this.tickPhase = 0;
    this.quarterPhase = 0;
    this.lastBarIndex = -1;
    this.downbeatThisFrame = true;
    this.clockSource = 'midi';
  }

  /** MIDI Continue (0xFB): resume without resetting phase accumulator hard. */
  onMidiContinue(): void {
    if (!this.midiOwnsTiming) return;
    this.waitingForMidiStart = false;
    this.transport = 'running';
    this.clockSource = 'midi';
  }

  /**
   * MIDI Stop (0xFC): external transport stop — distinct from disconnect.
   * Halts ticks until Start/Continue; does not fall back to internal clock.
   */
  onMidiStop(): void {
    if (!this.midiOwnsTiming) return;
    this.transport = 'stopped';
    this.waitingForMidiStart = true;
    this.lastClockAtMs = null;
    this.tickPhase = 0;
  }

  /** MIDI Clock (0xF8). */
  onMidiClock(nowMs: number = performance.now()): void {
    if (!this.midiOwnsTiming) return;
    if (this.waitingForMidiStart) {
      this.updateBpmFromClock(nowMs);
      return;
    }
    if (!this.running) {
      this.updateBpmFromClock(nowMs);
      return;
    }

    this.updateBpmFromClock(nowMs);
    this.transport = 'running';
    this.clockSource = 'midi';

    this.pulseAccumulator += 1;
    // One MIDI clock = 1/24 quarter; advance continuous bar phase with pulses.
    this.quarterPhase += 1 / MIDI_PPQN;
    this.noteDownbeatCrossing();
    while (this.pulseAccumulator + 1e-9 >= this.pulsesPerTick) {
      this.pulseAccumulator -= this.pulsesPerTick;
      this.emitTick();
    }
  }

  /** Call from vsync when MIDI-owned to recover from silence. */
  pollMidiWatchdog(nowMs: number = performance.now()): void {
    if (!this.midiOwnsTiming) return;
    if (this.transport === 'stopped') return;
    if (this.lastClockAtMs == null) return;
    if (nowMs - this.lastClockAtMs < CLOCK_TIMEOUT_MS) return;
    // Disconnect / clock loss: harmonic frame fallback at last BPM. Not Stop.
    this.transport = 'disconnected';
    this.clockSource = 'harmonic';
    this.pulseAccumulator = 0;
  }

  /** Test helper: inject a precise number of simulation ticks without MIDI. */
  debugEmitTicks(count: number): void {
    for (let i = 0; i < count; i++) this.emitTick();
  }

  private usesMidiPulseEmission(): boolean {
    if (!this.midiOwnsTiming) return false;
    if (this.transport === 'stopped') return false;
    if (this.transport === 'disconnected') return false;
    // Running with recent clocks — pulses own emission.
    if (this.lastClockAtMs == null) return false;
    return performance.now() - this.lastClockAtMs < CLOCK_TIMEOUT_MS;
  }

  private effectiveBpm(): number {
    if (this.lockedBpm != null) return this.lockedBpm;
    if (this.estimatedBpm != null && this.midiOwnsTiming) return this.estimatedBpm;
    // Free-run: treat config.tickRate as the tempo target (macros may write it).
    const fromRate = (config.tickRate * 60) / this.ticksPerQuarter;
    if (Number.isFinite(fromRate) && fromRate > 0) return Math.max(20, Math.min(300, fromRate));
    return 120;
  }

  private syncTickRateFromTempo(): void {
    const bpm = this.effectiveBpm();
    config.tickRate = this.clampTickRate((bpm * this.ticksPerQuarter) / 60);
  }

  private noteDownbeatCrossing(): void {
    const barIndex = Math.floor(this.quarterPhase / this.beatsPerBar);
    if (barIndex !== this.lastBarIndex) {
      if (this.lastBarIndex >= 0) this.downbeatThisFrame = true;
      this.lastBarIndex = barIndex;
    }
  }

  private emitTick(): void {
    this.cycleCount++;
    this.eventBus.emit('tick', { cycle: this.cycleCount });
  }

  private updateBpmFromClock(nowMs: number): void {
    if (this.lastClockAtMs != null) {
      const dt = nowMs - this.lastClockAtMs;
      if (dt > 0 && dt < 500) {
        const instantBpm = 60 / ((dt * MIDI_PPQN) / 1000);
        this.estimatedBpm =
          this.estimatedBpm == null
            ? instantBpm
            : this.estimatedBpm * (1 - BPM_SMOOTH) + instantBpm * BPM_SMOOTH;
        if (this.midiOwnsTiming && this.estimatedBpm != null) {
          config.tickRate = this.clampTickRate(
            (this.estimatedBpm * this.ticksPerQuarter) / 60
          );
        }
      }
    }
    this.lastClockAtMs = nowMs;
  }

  private clampTickRate(rate: number): number {
    return Math.max(config.minTickRate, Math.min(config.maxTickRate, rate));
  }
}
