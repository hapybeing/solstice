/**
 * Pure solar ephemeris and architectural lighting palette math for SOLSTICE.
 * Maps normalized solarProgress in [0, 1] across four atmospheric acts:
 *   0.00 -> Pale Dawn
 *   0.38 -> Blinding Zenith
 *   0.72 -> Deep Amber Dusk
 *   1.00 -> Silver Lunar Eclipse
 */

export type SolarPhase =
  | 'Pale Dawn'
  | 'Blinding Zenith'
  | 'Deep Amber Dusk'
  | 'Silver Lunar Eclipse';

export interface RGBTuple {
  r: number;
  g: number;
  b: number;
}

export interface SolarState {
  progress: number;
  altitudeDeg: number;
  azimuthDeg: number;
  sunDirection: [number, number, number];
  sunColor: RGBTuple;
  skyColor: RGBTuple;
  groundColor: RGBTuple;
  fogColor: RGBTuple;
  beamColor: RGBTuple;
  fogDensity: number;
  sunIntensity: number;
  hemiIntensity: number;
  beamOpacity: number;
  exposure: number;
  eclipseFactor: number;
  phase: SolarPhase;
  telemetryText: string;
}

interface PaletteStop {
  t: number;
  sunColor: RGBTuple;
  skyColor: RGBTuple;
  groundColor: RGBTuple;
  fogColor: RGBTuple;
  beamColor: RGBTuple;
  fogDensity: number;
  sunIntensity: number;
  hemiIntensity: number;
  beamOpacity: number;
  exposure: number;
}

const PALETTE_STOPS: readonly PaletteStop[] = [
  {
    // 0.00 Pale Dawn — hushed charcoal vaults, cool silver-alabaster morning raking light
    t: 0.0,
    sunColor: { r: 0.96, g: 0.87, b: 0.77 },
    skyColor: { r: 0.34, g: 0.42, b: 0.56 },
    groundColor: { r: 0.04, g: 0.038, b: 0.042 },
    fogColor: { r: 0.028, g: 0.032, b: 0.042 },
    beamColor: { r: 0.92, g: 0.88, b: 0.82 },
    fogDensity: 0.026,
    sunIntensity: 2.9,
    hemiIntensity: 0.075,
    beamOpacity: 0.27,
    exposure: 0.88,
  },
  {
    // 0.38 Blinding Zenith — searing warm-ivory oculus blade against cavernous charcoal stone
    t: 0.38,
    sunColor: { r: 1.0, g: 0.94, b: 0.82 },
    skyColor: { r: 0.48, g: 0.52, b: 0.58 },
    groundColor: { r: 0.06, g: 0.052, b: 0.042 },
    fogColor: { r: 0.036, g: 0.033, b: 0.03 },
    beamColor: { r: 1.0, g: 0.94, b: 0.83 },
    fogDensity: 0.022,
    sunIntensity: 3.9,
    hemiIntensity: 0.095,
    beamOpacity: 0.31,
    exposure: 0.92,
  },
  {
    // 0.72 Deep Amber Dusk — molten bronze chiaroscuro slicing through dark umber gloom
    t: 0.72,
    sunColor: { r: 1.0, g: 0.54, b: 0.22 },
    skyColor: { r: 0.26, g: 0.15, b: 0.11 },
    groundColor: { r: 0.04, g: 0.024, b: 0.015 },
    fogColor: { r: 0.032, g: 0.019, b: 0.013 },
    beamColor: { r: 1.0, g: 0.6, b: 0.28 },
    fogDensity: 0.027,
    sunIntensity: 3.3,
    hemiIntensity: 0.065,
    beamOpacity: 0.34,
    exposure: 0.9,
  },
  {
    // 1.00 Silver Lunar Eclipse — nocturnal indigo-black sanctuary pierced by razor-sharp silver moonbeam
    t: 1.0,
    sunColor: { r: 0.7, g: 0.83, b: 1.0 },
    skyColor: { r: 0.1, g: 0.15, b: 0.26 },
    groundColor: { r: 0.012, g: 0.016, b: 0.028 },
    fogColor: { r: 0.01, g: 0.014, b: 0.026 },
    beamColor: { r: 0.76, g: 0.88, b: 1.0 },
    fogDensity: 0.031,
    sunIntensity: 2.35,
    hemiIntensity: 0.038,
    beamOpacity: 0.32,
    exposure: 0.85,
  },
];

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: RGBTuple, b: RGBTuple, t: number): RGBTuple {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  };
}

export function getSolarPhase(progress: number): SolarPhase {
  const p = clamp01(progress);
  if (p < 0.22) return 'Pale Dawn';
  if (p < 0.56) return 'Blinding Zenith';
  if (p < 0.86) return 'Deep Amber Dusk';
  return 'Silver Lunar Eclipse';
}

export function formatSolarTelemetry(altitudeDeg: number, azimuthDeg: number): string {
  const alt = altitudeDeg.toFixed(1).padStart(4, ' ');
  const azm = azimuthDeg.toFixed(1).padStart(5, ' ');
  return `ALT ${alt.trim()}° // AZM ${azm.trim()}°`;
}

export function evaluateSolarState(rawProgress: number): SolarState {
  const p = clamp01(rawProgress);

  // Locate surrounding palette stops
  let stopA = PALETTE_STOPS[0];
  let stopB = PALETTE_STOPS[PALETTE_STOPS.length - 1];
  let localT = 0;

  for (let i = 0; i < PALETTE_STOPS.length - 1; i++) {
    const curr = PALETTE_STOPS[i];
    const next = PALETTE_STOPS[i + 1];
    if (p >= curr.t && p <= next.t) {
      stopA = curr;
      stopB = next;
      const span = Math.max(0.0001, next.t - curr.t);
      const u = (p - curr.t) / span;
      localT = u * u * (3 - 2 * u);
      break;
    }
  }

  // Altitude curve:
  // Dawn (~26°) -> Zenith (~76°) -> Dusk (~23°) -> Lunar Eclipse (~48° cool moon arc)
  const dayArc = Math.sin(clamp01(p / 0.84) * Math.PI);
  const eclipseFactor = smoothstep(0.78, 0.98, p);
  const solarAlt = 22 + dayArc * 54;
  const lunarAlt = 46 + Math.sin((p - 0.78) * Math.PI * 2.1) * 8;
  const altitudeDeg = lerp(solarAlt, lunarAlt, eclipseFactor);

  // Azimuth sweeps dramatically across the oculus axis so shadows rake across both colonnades
  // Range: 92° (East) -> 180° (South/Overhead) -> 274° (West) -> 318° (Lunar NW)
  const azimuthDeg = lerp(96, 316, p);

  const altRad = (altitudeDeg * Math.PI) / 180;
  // Convert architectural azimuth so that at Zenith (p~0.38) the beam slices nearly straight down
  // with slight sculptural tilt toward the altar, while Dawn tilts from +X and Dusk from -X.
  const lateralSwing = Math.cos(clamp01(p / 0.82) * Math.PI); // +1 at dawn, 0 at zenith, -1 at dusk
  const lunarSwing = lerp(lateralSwing, -0.35, eclipseFactor);

  const horiz = Math.cos(altRad);
  const sinY = Math.sin(altRad);

  // Keep directional rays sweeping prominently across the transverse nave (X) and slightly down the nave (Z)
  const rawX = lunarSwing * horiz * 0.92;
  const rawY = Math.max(0.32, sinY);
  const rawZ = lerp(0.34, -0.38, p) * horiz;

  const invLen = 1 / Math.hypot(rawX, rawY, rawZ);
  const sunDirection: [number, number, number] = [
    rawX * invLen,
    rawY * invLen,
    rawZ * invLen,
  ];

  return {
    progress: p,
    altitudeDeg,
    azimuthDeg,
    sunDirection,
    sunColor: lerpRgb(stopA.sunColor, stopB.sunColor, localT),
    skyColor: lerpRgb(stopA.skyColor, stopB.skyColor, localT),
    groundColor: lerpRgb(stopA.groundColor, stopB.groundColor, localT),
    fogColor: lerpRgb(stopA.fogColor, stopB.fogColor, localT),
    beamColor: lerpRgb(stopA.beamColor, stopB.beamColor, localT),
    fogDensity: lerp(stopA.fogDensity, stopB.fogDensity, localT),
    sunIntensity: lerp(stopA.sunIntensity, stopB.sunIntensity, localT),
    hemiIntensity: lerp(stopA.hemiIntensity, stopB.hemiIntensity, localT),
    beamOpacity: lerp(stopA.beamOpacity, stopB.beamOpacity, localT),
    exposure: lerp(stopA.exposure, stopB.exposure, localT),
    eclipseFactor,
    phase: getSolarPhase(p),
    telemetryText: formatSolarTelemetry(altitudeDeg, azimuthDeg),
  };
}
