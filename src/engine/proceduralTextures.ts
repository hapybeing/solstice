import * as THREE from 'three';

export interface ArchitecturalTextureSet {
  concreteMap: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  concreteRoughness: THREE.CanvasTexture;
  flutedMap: THREE.CanvasTexture;
  flutedBump: THREE.CanvasTexture;
  flutedRoughness: THREE.CanvasTexture;
  grainDataUrl: string;
  dispose: () => void;
}

/** Deterministic PRNG (Mulberry32) so procedural travertine textures look identical across loads */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 2D tileable value noise helper */
function buildTileableNoiseField(gridSize: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const field = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < field.length; i++) {
    field[i] = rng();
  }
  return field;
}

function sampleTileableNoise(field: Float32Array, gridSize: number, u: number, v: number): number {
  const x = (((u % 1) + 1) % 1) * gridSize;
  const y = (((v % 1) + 1) % 1) * gridSize;
  const x0 = Math.floor(x) % gridSize;
  const y0 = Math.floor(y) % gridSize;
  const x1 = (x0 + 1) % gridSize;
  const y1 = (y0 + 1) % gridSize;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = field[y0 * gridSize + x0];
  const n10 = field[y0 * gridSize + x1];
  const n01 = field[y1 * gridSize + x0];
  const n11 = field[y1 * gridSize + x1];

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmTileable(
  fields: Float32Array[],
  sizes: number[],
  u: number,
  v: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < fields.length; i++) {
    sum += sampleTileableNoise(fields[i], sizes[i], u, v) * amp;
    norm += amp;
    amp *= 0.52;
  }
  return sum / norm;
}

function configureTexture(
  tex: THREE.CanvasTexture,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates high-resolution poured travertine concrete textures inspired by Tadao Ando:
 * - Warm raw limestone/travertine mineral veining
 * - Precision horizontal and vertical architectural formwork joints
 * - Iconic recessed circular tie-rod holes arranged in geometric panel grids
 * - Matching bump & roughness maps so grazing oculus light reveals stone depth
 */
function createTravertineConcreteMaps(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = roughCanvas.width = size;
  colorCanvas.height = bumpCanvas.height = roughCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const cImg = cCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  const sizes = [8, 16, 32, 64];
  const fields = sizes.map((s, idx) => buildTileableNoiseField(s, 104729 + idx * 7919));
  const veinFields = [buildTileableNoiseField(12, 44111), buildTileableNoiseField(24, 99133)];
  const rng = createRng(7711);

  const cData = cImg.data;
  const bData = bImg.data;
  const rData = rImg.data;

  // 4 horizontal formwork courses x 2 vertical panel bays per tile
  const hPanels = 4;
  const vPanels = 2;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const panelRow = Math.floor(v * hPanels);
    const panelV = (v * hPanels) % 1;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const panelCol = Math.floor(u * vPanels);
      const panelU = (u * vPanels) % 1;

      const idx = (y * size + x) * 4;

      // Subtle per-panel tonal variation (authentic poured concrete batch shift)
      const panelSeed = ((panelRow * 7 + panelCol * 13) % 11) / 11;
      const panelTone = (panelSeed - 0.5) * 14;

      // Travertine sedimentary horizontal strata + mottled trowel grain
      const grain = fbmTileable(fields, sizes, u, v);
      const strata = fbmTileable(veinFields, [12, 24], u * 0.45, v * 3.6 + grain * 0.08);
      const microPore = rng() < 0.012 ? -18 : (rng() - 0.5) * 5;

      // Horizontal & vertical formwork seams
      const distToHSeam = Math.min(panelV, 1 - panelV) * (size / hPanels);
      const distToVSeam = Math.min(panelU, 1 - panelU) * (size / vPanels);
      const seamDist = Math.min(distToHSeam, distToVSeam);

      let seamDarken = 0;
      let seamBump = 0;
      let seamRoughDelta = 0;
      if (seamDist < 2.2) {
        const s = 1 - seamDist / 2.2;
        seamDarken = -34 * s * s;
        seamBump = -95 * s;
        seamRoughDelta = 26 * s;
      } else if (seamDist < 5.5) {
        // Slight mineral bevel highlight along cast edge
        const edge = 1 - (seamDist - 2.2) / 3.3;
        seamDarken = 4.5 * edge;
        seamBump = 10 * edge;
      }

      // Base warm raw travertine stone RGB
      const mineral = (grain - 0.5) * 26 + (strata - 0.5) * 22 + panelTone + microPore;
      const baseR = Math.max(48, Math.min(228, 152 + mineral + seamDarken));
      const baseG = Math.max(44, Math.min(220, 143 + mineral * 0.96 + seamDarken));
      const baseB = Math.max(38, Math.min(208, 129 + mineral * 0.88 + seamDarken));

      cData[idx] = baseR;
      cData[idx + 1] = baseG;
      cData[idx + 2] = baseB;
      cData[idx + 3] = 255;

      const bumpVal = Math.max(
        0,
        Math.min(255, 134 + (grain - 0.5) * 62 + (strata - 0.5) * 38 + microPore * 1.4 + seamBump),
      );
      bData[idx] = bData[idx + 1] = bData[idx + 2] = bumpVal;
      bData[idx + 3] = 255;

      // Roughness: travertine concrete sits in matte range ~0.68 - 0.93 (174 - 238)
      const roughVal = Math.max(
        155,
        Math.min(246, 204 + (0.5 - grain) * 42 + (0.5 - strata) * 22 + seamRoughDelta),
      );
      rData[idx] = rData[idx + 1] = rData[idx + 2] = roughVal;
      rData[idx + 3] = 255;
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Draw signature Ando tie-rod holes (2 rows x 3 holes per formwork panel)
  const panelW = size / vPanels;
  const panelH = size / hPanels;
  const holeXs = [0.16, 0.5, 0.84];
  const holeYs = [0.28, 0.72];

  for (let row = 0; row < hPanels; row++) {
    for (let col = 0; col < vPanels; col++) {
      for (const hx of holeXs) {
        for (const hy of holeYs) {
          const cx = col * panelW + hx * panelW;
          const cy = row * panelH + hy * panelH;
          const radius = 3.2;

          // Recessed shadow cone on diffuse map
          const cGrad = cCtx.createRadialGradient(cx - 0.6, cy - 0.6, 0.5, cx, cy, radius * 1.35);
          cGrad.addColorStop(0, 'rgba(34, 30, 26, 0.82)');
          cGrad.addColorStop(0.65, 'rgba(58, 52, 46, 0.62)');
          cGrad.addColorStop(1, 'rgba(148, 138, 125, 0)');
          cCtx.fillStyle = cGrad;
          cCtx.beginPath();
          cCtx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
          cCtx.fill();

          // Deep recess on bump map
          const bGrad = bCtx.createRadialGradient(cx, cy, 0.4, cx, cy, radius * 1.25);
          bGrad.addColorStop(0, 'rgba(12, 12, 12, 0.95)');
          bGrad.addColorStop(0.7, 'rgba(55, 55, 55, 0.7)');
          bGrad.addColorStop(1, 'rgba(134, 134, 134, 0)');
          bCtx.fillStyle = bGrad;
          bCtx.beginPath();
          bCtx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2);
          bCtx.fill();

          // Matte recessed roughness
          rCtx.fillStyle = 'rgba(240, 240, 240, 0.8)';
          rCtx.beginPath();
          rCtx.arc(cx, cy, radius, 0, Math.PI * 2);
          rCtx.fill();
        }
      }
    }
  }

  return {
    map: configureTexture(new THREE.CanvasTexture(colorCanvas), true, 1, 1, maxAnisotropy),
    bump: configureTexture(new THREE.CanvasTexture(bumpCanvas), false, 1, 1, maxAnisotropy),
    roughness: configureTexture(new THREE.CanvasTexture(roughCanvas), false, 1, 1, maxAnisotropy),
  };
}

/**
 * Generates fluted limestone/travertine maps for the monumental colonnade shafts.
 */
function createFlutedStoneMaps(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const width = 512;
  const height = 512;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = roughCanvas.width = width;
  colorCanvas.height = bumpCanvas.height = roughCanvas.height = height;

  const cCtx = colorCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const cImg = cCtx.createImageData(width, height);
  const bImg = bCtx.createImageData(width, height);
  const rImg = rCtx.createImageData(width, height);

  const sizes = [8, 16, 32];
  const fields = sizes.map((s, idx) => buildTileableNoiseField(s, 55001 + idx * 3313));
  const flutes = 20;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    // Subtle stone drum joints along column height (5 drums)
    const drumV = (v * 5) % 1;
    const drumDist = Math.min(drumV, 1 - drumV) * (height / 5);
    const drumJoint = drumDist < 1.8 ? 1 - drumDist / 1.8 : 0;

    for (let x = 0; x < width; x++) {
      const u = x / width;
      const idx = (y * width + x) * 4;

      // Concave classical-brutalist fluting profile
      const flutePhase = (u * flutes) % 1;
      const centered = Math.abs(flutePhase - 0.5) * 2; // 0 at trough, 1 at arris ridge
      const fluteProfile = Math.pow(centered, 2.2); // crisp arris ridges, concave channels

      const grain = fbmTileable(fields, sizes, u * 1.5, v * 2.2);
      const mineral = (grain - 0.5) * 24;
      const ao = (fluteProfile - 0.5) * 26 - drumJoint * 28;

      cImg.data[idx] = Math.max(42, Math.min(232, 158 + mineral + ao));
      cImg.data[idx + 1] = Math.max(38, Math.min(224, 149 + mineral * 0.95 + ao));
      cImg.data[idx + 2] = Math.max(34, Math.min(212, 134 + mineral * 0.88 + ao));
      cImg.data[idx + 3] = 255;

      const bump = Math.max(
        0,
        Math.min(255, 76 + fluteProfile * 142 + (grain - 0.5) * 28 - drumJoint * 85),
      );
      bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bump;
      bImg.data[idx + 3] = 255;

      // Polished ridges slightly smoother than recessed flute channels
      const rough = Math.max(
        148,
        Math.min(244, 212 - fluteProfile * 28 + (0.5 - grain) * 24 + drumJoint * 20),
      );
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: configureTexture(new THREE.CanvasTexture(colorCanvas), true, 1, 2, maxAnisotropy),
    bump: configureTexture(new THREE.CanvasTexture(bumpCanvas), false, 1, 2, maxAnisotropy),
    roughness: configureTexture(new THREE.CanvasTexture(roughCanvas), false, 1, 2, maxAnisotropy),
  };
}

/** Subtle monochrome 35mm architectural film grain data URL (zero external files) */
function createFilmGrainDataUrl(): string {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rng = createRng(99371);

  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rng() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 20;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createArchitecturalTextures(maxAnisotropy: number): ArchitecturalTextureSet {
  const concrete = createTravertineConcreteMaps(maxAnisotropy);
  const fluted = createFlutedStoneMaps(maxAnisotropy);
  const grainDataUrl = createFilmGrainDataUrl();

  return {
    concreteMap: concrete.map,
    concreteBump: concrete.bump,
    concreteRoughness: concrete.roughness,
    flutedMap: fluted.map,
    flutedBump: fluted.bump,
    flutedRoughness: fluted.roughness,
    grainDataUrl,
    dispose: () => {
      concrete.map.dispose();
      concrete.bump.dispose();
      concrete.roughness.dispose();
      fluted.map.dispose();
      fluted.bump.dispose();
      fluted.roughness.dispose();
    },
  };
}
