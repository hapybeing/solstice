/**
 * Pure 12-slot ring buffer for interactive obsidian mirror pool ripples.
 * Shared between WebGL shader uniforms and procedural caustic/audio modulation.
 */

export const MAX_RIPPLES = 12;
export const RIPPLE_LIFETIME_SEC = 7.5;
export const RIPPLE_WAVE_SPEED = 2.75;

export interface RippleSlot {
  x: number;
  z: number;
  startTime: number;
  strength: number;
}

export interface RippleBufferState {
  slots: RippleSlot[];
  writeIndex: number;
  totalSpawned: number;
}

export function createRippleBuffer(): RippleBufferState {
  const slots: RippleSlot[] = [];
  for (let i = 0; i < MAX_RIPPLES; i++) {
    slots.push({
      x: 0,
      z: 0,
      startTime: -999,
      strength: 0,
    });
  }
  return {
    slots,
    writeIndex: 0,
    totalSpawned: 0,
  };
}

export function pushRipple(
  buffer: RippleBufferState,
  x: number,
  z: number,
  nowSec: number,
  strength = 1.0,
): RippleSlot {
  const clampedStrength = Math.max(0.15, Math.min(1.5, strength));
  const slot = buffer.slots[buffer.writeIndex];
  slot.x = x;
  slot.z = z;
  slot.startTime = nowSec;
  slot.strength = clampedStrength;

  buffer.writeIndex = (buffer.writeIndex + 1) % MAX_RIPPLES;
  buffer.totalSpawned += 1;
  return slot;
}

/**
 * Evaluate aggregate ripple energy in [0, 1] at time `nowSec` for modulating
 * water caustics across the stone colonnades and altar steps.
 */
export function computeActiveRippleEnergy(buffer: RippleBufferState, nowSec: number): number {
  let energy = 0;
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const slot = buffer.slots[i];
    const age = nowSec - slot.startTime;
    if (age >= 0 && age < RIPPLE_LIFETIME_SEC && slot.strength > 0) {
      const env = Math.exp(-age * 0.58) * (1 - age / RIPPLE_LIFETIME_SEC);
      energy += env * slot.strength * 0.42;
    }
  }
  return Math.min(1, energy);
}

/**
 * Evaluate physically damped circular wave displacement at point (x, z) and time `nowSec`.
 */
export function evaluateRippleHeight(
  buffer: RippleBufferState,
  x: number,
  z: number,
  nowSec: number,
): number {
  let height = 0;
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const slot = buffer.slots[i];
    const age = nowSec - slot.startTime;
    if (age <= 0 || age >= RIPPLE_LIFETIME_SEC || slot.strength <= 0) continue;

    const dist = Math.hypot(x - slot.x, z - slot.z);
    const waveFront = age * RIPPLE_WAVE_SPEED;
    const distFromFront = dist - waveFront;

    // Localized ring packet with viscous time/distance damping
    const envelope =
      Math.exp(-distFromFront * distFromFront * 0.55) *
      Math.exp(-age * 0.52) *
      (1 / (1 + dist * 0.14));

    height += Math.sin(dist * 3.8 - age * 7.8) * envelope * slot.strength;
  }
  return height;
}
