import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPrismImpulse,
  computeTargetPrismAngle,
  createInitialPrismSystem,
  stepPrismSystem,
} from './prismPhysics';

test('initial prism system begins misaligned with zero bloom', () => {
  const sys = createInitialPrismSystem();
  assert.equal(sys.prisms.length, 3);
  assert.equal(sys.allAligned, false);
  assert.equal(sys.bloomIntensity, 0);
});

test('applying rotational impulse imparts velocity that decays with heavy inertia', () => {
  const sys = createInitialPrismSystem();
  const initialAngle = sys.prisms[0].angle;
  applyPrismImpulse(sys, 0, 0.25);

  const peakVel = sys.prisms[0].angularVelocity;
  assert.ok(peakVel > 1.0);

  for (let i = 0; i < 40; i++) {
    stepPrismSystem(sys, 0.016, 180, false);
  }

  assert.notEqual(sys.prisms[0].angle, initialAngle);
  assert.ok(Math.abs(sys.prisms[0].angularVelocity) < Math.abs(peakVel));
});

test('aligning all three prisms to solar target locks harmonic resonance and triggers bloom', () => {
  const sys = createInitialPrismSystem();
  const azimuth = 210;

  for (const prism of sys.prisms) {
    prism.angle = computeTargetPrismAngle(azimuth, prism.facetOffset);
    prism.angularVelocity = 0;
  }

  const first = stepPrismSystem(sys, 0.016, azimuth, false);
  assert.equal(sys.alignedCount, 3);
  assert.equal(sys.allAligned, true);
  assert.equal(first.justCompletedAll, true);
  assert.ok(sys.totalResonance > 0.99);

  for (let i = 0; i < 120; i++) {
    stepPrismSystem(sys, 0.05, azimuth, false);
  }
  assert.equal(sys.climaxActive, true);
  assert.equal(sys.climaxProgress, 1);
  assert.ok(sys.climaxCameraWeight > 0.95);
  assert.ok(sys.bloomIntensity > 0.92);
});

test('dragging any prism during the 3/3 resonance climax smoothly returns to interactive control', () => {
  const sys = createInitialPrismSystem();
  const azimuth = 195;

  for (const prism of sys.prisms) {
    prism.angle = computeTargetPrismAngle(azimuth, prism.facetOffset);
    prism.angularVelocity = 0;
  }

  stepPrismSystem(sys, 0.05, azimuth, false);
  for (let i = 0; i < 80; i++) {
    stepPrismSystem(sys, 0.05, azimuth, false);
  }
  assert.equal(sys.climaxActive, true);
  assert.ok(sys.climaxCameraWeight > 0.6);

  // Dragging prism 1 immediately releases ceremonial climax and glides camera weight back to 0
  applyPrismImpulse(sys, 1, 0.2);
  assert.equal(sys.climaxActive, false);
  assert.equal(sys.climaxProgress, 0);

  for (let i = 0; i < 60; i++) {
    stepPrismSystem(sys, 0.05, azimuth, false);
  }
  assert.equal(sys.allAligned, false);
  assert.ok(sys.climaxCameraWeight < 0.05);
});
