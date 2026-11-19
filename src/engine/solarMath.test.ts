import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSolarState,
  formatSolarTelemetry,
  getSolarPhase,
} from './solarMath';

test('solar phases transition across Dawn, Zenith, Dusk, and Lunar Eclipse', () => {
  assert.equal(getSolarPhase(0.05), 'Pale Dawn');
  assert.equal(getSolarPhase(0.38), 'Blinding Zenith');
  assert.equal(getSolarPhase(0.72), 'Deep Amber Dusk');
  assert.equal(getSolarPhase(0.96), 'Silver Lunar Eclipse');
});

test('solar direction vector is always unit length and above horizon', () => {
  for (let i = 0; i <= 20; i++) {
    const p = i / 20;
    const state = evaluateSolarState(p);
    const [x, y, z] = state.sunDirection;
    const len = Math.hypot(x, y, z);
    assert.ok(Math.abs(len - 1) < 1e-5, `Expected unit length at p=${p}, got ${len}`);
    assert.ok(y > 0.25, `Expected positive solar elevation at p=${p}, got ${y}`);
  }
});

test('zenith has higher solar altitude and intensity than dawn and eclipse', () => {
  const dawn = evaluateSolarState(0.02);
  const zenith = evaluateSolarState(0.38);
  const eclipse = evaluateSolarState(0.98);

  assert.ok(zenith.altitudeDeg > dawn.altitudeDeg + 20);
  assert.ok(zenith.sunIntensity > dawn.sunIntensity);
  assert.ok(zenith.sunIntensity > eclipse.sunIntensity);
});

test('dusk shifts sun color warmer (red > blue) while eclipse shifts cooler (blue > red)', () => {
  const dusk = evaluateSolarState(0.72);
  const eclipse = evaluateSolarState(1.0);

  assert.ok(dusk.sunColor.r > dusk.sunColor.b * 2.0);
  assert.ok(eclipse.sunColor.b > eclipse.sunColor.r);
});

test('telemetry string formats altitude and azimuth cleanly', () => {
  assert.equal(formatSolarTelemetry(38.42, 214.11), 'ALT 38.4° // AZM 214.1°');
});
