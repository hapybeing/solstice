/**
 * Curated camera chapters ("The Three Cinematic Movements") for SOLSTICE.
 */

export type ChapterId = 'oculus' | 'pool' | 'prism';

export interface ChapterDefinition {
  id: ChapterId;
  numeral: 'I' | 'II' | 'III';
  shortLabel: string;
  title: string;
  subtitle: string;
  hint: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  fov: number;
  parallaxScale: number;
  breathAmplitude: number;
}

export const CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: 'oculus',
    numeral: 'I',
    shortLabel: 'I. OCULUS',
    title: 'THE OCULUS',
    subtitle: 'Time & Shadow',
    hint: 'Drag to move sun',
    cameraPosition: [0.0, 2.55, 16.4],
    cameraTarget: [0.0, 6.2, -12.0],
    fov: 48,
    parallaxScale: 0.72,
    breathAmplitude: 0.08,
  },
  {
    id: 'pool',
    numeral: 'II',
    shortLabel: 'II. POOL',
    title: 'THE MIRROR POOL',
    subtitle: 'Stillness & Caustics',
    hint: 'Touch water for ripples',
    cameraPosition: [3.2, 1.38, 10.6],
    cameraTarget: [-1.1, 0.95, -9.5],
    fov: 44,
    parallaxScale: 0.45,
    breathAmplitude: 0.05,
  },
  {
    id: 'prism',
    numeral: 'III',
    shortLabel: 'III. PRISM',
    title: 'THE PRISM VAULT',
    subtitle: 'Refraction & Resonance',
    hint: 'Drag to align prisms',
    cameraPosition: [2.65, 5.25, -0.8],
    cameraTarget: [0.0, 4.95, -9.2],
    fov: 40,
    parallaxScale: 0.36,
    breathAmplitude: 0.045,
  },
];

export function getChapterById(id: ChapterId): ChapterDefinition {
  return CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
}

export function dampScalar(current: number, target: number, lambda: number, dt: number): number {
  const safeDt = Math.max(0, Math.min(0.1, dt));
  return current + (target - current) * (1 - Math.exp(-lambda * safeDt));
}
