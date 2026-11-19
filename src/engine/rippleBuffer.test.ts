import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeActiveRippleEnergy,
  createRippleBuffer,
  evaluateRippleHeight,
  MAX_RIPPLES,
  pushRipple,
  RIPPLE_LIFETIME_SEC,
} from './rippleBuffer';

test('ripple ring buffer cycles cleanly across 12 slots without unbounded growth', () => {
  const buf = createRippleBuffer();
  assert.equal(buf.slots.length, MAX_RIPPLES);

  for (let i = 0; i < 15; i++) {
    pushRipple(buf, i * 0.5, -i * 0.25, i * 0.1, 1.0);
  }

  assert.equal(buf.totalSpawned, 15);
  assert.equal(buf.writeIndex, 15 % MAX_RIPPLES);
  // Slot 0 should have been overwritten by the 13th ripple (index 12)
  assert.equal(buf.slots[0].x, 6.0);
});

test('ripple energy peaks right after impact and decays to zero after lifetime', () => {
  const buf = createRippleBuffer();
  pushRipple(buf, 0, 0, 10.0, 1.0);

  const earlyEnergy = computeActiveRippleEnergy(buf, 10.2);
  const midEnergy = computeActiveRippleEnergy(buf, 12.5);
  const expiredEnergy = computeActiveRippleEnergy(buf, 10.0 + RIPPLE_LIFETIME_SEC + 0.2);

  assert.ok(earlyEnergy > 0.25);
  assert.ok(midEnergy < earlyEnergy);
  assert.equal(expiredEnergy, 0);
});

test('damped circular wave displacement propagates outward along wave front', () => {
  const buf = createRippleBuffer();
  pushRipple(buf, 0, 0, 0.0, 1.0);

  // At t = 1.0s, wavefront is around r = 2.75m; wave should have non-zero amplitude there
  // and near-zero far ahead of the wavefront (r = 14m)
  let maxNearFront = 0;
  for (let r = 2.0; r <= 3.5; r += 0.1) {
    maxNearFront = Math.max(maxNearFront, Math.abs(evaluateRippleHeight(buf, r, 0, 1.0)));
  }
  const farAhead = Math.abs(evaluateRippleHeight(buf, 14.0, 0, 1.0));

  assert.ok(maxNearFront > 0.2);
  assert.ok(farAhead < 0.001);
});
