/**
 * Pure rotational inertia and solar-alignment physics for the three suspended
 * crystal monoliths in Movement III (The Prism Vault).
 */

export interface PrismBody {
  id: number;
  angle: number;
  angularVelocity: number;
  /** Target offset angle relative to solar azimuth so each prism has distinct sculptural geometry */
  facetOffset: number;
  /** Alignment score in [0, 1], where 1.0 means crystal facet is locked to sunbeam */
  alignment: number;
  locked: boolean;
  /** Brief cooldown after deliberately dragging a locked prism so the detent never fights release */
  releaseCooldown: number;
}

export interface PrismSystemState {
  prisms: PrismBody[];
  alignedCount: number;
  totalResonance: number;
  allAligned: boolean;
  /** Smooth bloom energy [0, 1] that swells when all three prisms lock */
  bloomIntensity: number;
  /** True once all 3 prisms lock until the user drags a prism again */
  climaxActive: boolean;
  /** Elapsed seconds inside the 5-second ceremonial climax sequence [0, CLIMAX_DURATION_SEC] */
  climaxElapsed: number;
  /** Smoothly eased 0..1 progress across the 5-second ceremonial climax */
  climaxProgress: number;
  /** Damped 0..1 weight used to glide the camera out to the full-nave vista and smoothly back on drag */
  climaxCameraWeight: number;
}

export const CLIMAX_DURATION_SEC = 5.0;

const TWO_PI = Math.PI * 2;
const SYMMETRY_PERIOD = Math.PI / 3; // 6-sided beveled hexagonal crystal repeats optimal refraction every 60°
const LOCK_THRESHOLD = 0.85;
const ANGULAR_DAMPING = 2.75;
const MAGNETIC_SNAP_STRENGTH = 4.0;

function smootherstep01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function normalizeAngle(rad: number): number {
  let a = rad % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

/**
 * Shortest angular distance to the nearest crystal symmetry plane (every 60 deg).
 * Returns signed delta in [-SYMMETRY_PERIOD/2, +SYMMETRY_PERIOD/2].
 */
export function shortestSymmetryError(currentAngle: number, targetAngle: number): number {
  const diff = currentAngle - targetAngle;
  const wrapped =
    ((((diff + SYMMETRY_PERIOD * 0.5) % SYMMETRY_PERIOD) + SYMMETRY_PERIOD) %
      SYMMETRY_PERIOD) -
    SYMMETRY_PERIOD * 0.5;
  return wrapped;
}

export function computeTargetPrismAngle(solarAzimuthDeg: number, facetOffset: number): number {
  return normalizeAngle((solarAzimuthDeg * Math.PI) / 180 + facetOffset);
}

export function createInitialPrismSystem(): PrismSystemState {
  // Start slightly out of alignment so the visitor experiences turning them into resonance
  const initialOffsets = [0.41, -0.34, 0.48];
  const facetOffsets = [0.0, 0.24, -0.18];

  const prisms: PrismBody[] = initialOffsets.map((angle, id) => ({
    id,
    angle,
    angularVelocity: 0,
    facetOffset: facetOffsets[id],
    alignment: 0.2,
    locked: false,
    releaseCooldown: 0,
  }));

  return {
    prisms,
    alignedCount: 0,
    totalResonance: 0.2,
    allAligned: false,
    bloomIntensity: 0,
    climaxActive: false,
    climaxElapsed: 0,
    climaxProgress: 0,
    climaxCameraWeight: 0,
  };
}

/**
 * Apply rotational impulse (from pointer drag or keyboard nudge) to a prism.
 * Dragging any prism during the 3/3 resonance climax smoothly returns to interactive control.
 */
export function applyPrismImpulse(
  state: PrismSystemState,
  prismIndex: number,
  deltaRadians: number,
): void {
  const clamped = Math.max(-0.45, Math.min(0.45, deltaRadians));
  const breakingClimax = state.climaxActive || state.allAligned;
  if (breakingClimax && Math.abs(clamped) > 0.001) {
    state.climaxActive = false;
    state.climaxElapsed = 0;
    state.climaxProgress = 0;
  }

  if (prismIndex >= 0 && prismIndex < state.prisms.length) {
    const p = state.prisms[prismIndex];
    if (p.locked || breakingClimax) {
      p.releaseCooldown = 0.55;
    }
    p.angularVelocity = Math.max(-2.35, Math.min(2.35, p.angularVelocity + clamped * 7.2));
    return;
  }

  // Distribute torque with distinct moments of inertia across the 3 monoliths.
  // While seeking alignment, already-locked prisms hold firmly so the remaining ones can catch.
  // Once all 3 are locked, dragging freely releases them back into interactive motion.
  const weights = [1.0, 0.78, 1.22];
  for (let i = 0; i < state.prisms.length; i++) {
    const p = state.prisms[i];
    if (breakingClimax) {
      p.releaseCooldown = 0.55;
    }
    const resistance = breakingClimax ? 1.0 : p.locked ? 0.0 : 1.0;
    p.angularVelocity = Math.max(
      -2.35,
      Math.min(2.35, p.angularVelocity + clamped * 6.0 * weights[i] * resistance),
    );
  }
}

/**
 * Advance rotational inertia, viscous damping, magnetic harmonic detent,
 * and the 5-second ceremonial 3/3 resonance climax.
 */
export function stepPrismSystem(
  state: PrismSystemState,
  dt: number,
  solarAzimuthDeg: number,
  isDragging: boolean,
): { newlyLockedIndex: number | null; justCompletedAll: boolean } {
  const safeDt = Math.max(0.0001, Math.min(0.05, dt));
  const wasAllAligned = state.allAligned;
  let newlyLockedIndex: number | null = null;
  let alignedCount = 0;
  let resonanceSum = 0;

  for (let i = 0; i < state.prisms.length; i++) {
    const prism = state.prisms[i];
    const wasLocked = prism.locked;
    const targetAngle = computeTargetPrismAngle(solarAzimuthDeg, prism.facetOffset);
    const err = shortestSymmetryError(prism.angle, targetAngle);
    const absErr = Math.abs(err);

    if (prism.releaseCooldown > 0) {
      prism.releaseCooldown = Math.max(0, prism.releaseCooldown - safeDt);
    }

    // Tactile harmonic magnetic detent & eddy-current braking when settling into alignment.
    // Disabled briefly during releaseCooldown so dragging a locked crystal out of climax feels effortless.
    if (
      !isDragging &&
      prism.releaseCooldown <= 0 &&
      absErr < 0.22 &&
      Math.abs(prism.angularVelocity) < 2.8
    ) {
      prism.angularVelocity -= err * (MAGNETIC_SNAP_STRENGTH * 2.6) * safeDt;
      prism.angularVelocity *= Math.exp(-7.2 * safeDt);
    }

    // Exponential viscous damping (heavy crystal monolith inertia)
    const decay = Math.exp(-ANGULAR_DAMPING * safeDt);
    prism.angularVelocity *= decay;
    if (Math.abs(prism.angularVelocity) < 0.0004) {
      prism.angularVelocity = 0;
    }

    prism.angle = normalizeAngle(prism.angle + prism.angularVelocity * safeDt);

    // Recompute alignment factor in [0, 1] using optical peak
    const postErr = Math.abs(shortestSymmetryError(prism.angle, targetAngle));
    const normalizedErr = postErr / (SYMMETRY_PERIOD * 0.5); // 0 = aligned, 1 = max misaligned
    const alignment = Math.pow(Math.max(0, 1 - normalizedErr), 1.75);

    prism.alignment = alignment;
    prism.locked = alignment >= LOCK_THRESHOLD;

    if (prism.locked) {
      alignedCount++;
      if (!wasLocked && newlyLockedIndex === null) {
        newlyLockedIndex = i;
      }
    }
    resonanceSum += alignment;
  }

  state.alignedCount = alignedCount;
  state.totalResonance = resonanceSum / state.prisms.length;
  state.allAligned = alignedCount === state.prisms.length;

  const justCompletedAll = !wasAllAligned && state.allAligned;
  if (justCompletedAll) {
    state.climaxActive = true;
    state.climaxElapsed = 0;
    state.climaxProgress = 0;
  } else if (!state.allAligned) {
    state.climaxActive = false;
    state.climaxElapsed = 0;
    state.climaxProgress = 0;
  }

  if (state.climaxActive) {
    state.climaxElapsed = Math.min(CLIMAX_DURATION_SEC, state.climaxElapsed + safeDt);
    state.climaxProgress = smootherstep01(state.climaxElapsed / CLIMAX_DURATION_SEC);
    // Track the 5-second ceremonial smootherstep curve directly without extra lag
    state.climaxCameraWeight = Math.max(state.climaxCameraWeight, state.climaxProgress);
  } else {
    // Smoothly glide camera back to intimate interactive prism framing when released
    state.climaxCameraWeight *= Math.exp(-3.4 * safeDt);
    if (state.climaxCameraWeight < 0.001) {
      state.climaxCameraWeight = 0;
    }
  }

  // Gradually swell bloom across the 5-second climax without snapping abruptly
  const targetBloom = state.allAligned
    ? 0.42 + 0.58 * (state.climaxActive ? state.climaxProgress : 1.0)
    : state.totalResonance * 0.34;
  const bloomRate = state.allAligned ? 2.4 : 2.8;
  const bloomLerp = 1 - Math.exp(-bloomRate * safeDt);
  state.bloomIntensity += (targetBloom - state.bloomIntensity) * bloomLerp;

  return {
    newlyLockedIndex,
    justCompletedAll,
  };
}
