import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { ArchitecturalTextureSet } from './proceduralTextures';
import {
  attachStoneCausticsShader,
  createAdditiveCausticsMaterial,
  createAtmosphericHazeMaterial,
  createObsidianReflectorShader,
  createPrismCrystalMaterial,
  createSpectralRibbonMaterial,
  createVolumetricBeamMaterial,
  SharedCausticUniforms,
} from './shaders';

export interface PrismAssembly {
  id: number;
  group: THREE.Group;
  crystalMesh: THREE.Mesh;
  hitProxy: THREE.Mesh;
  crystalMaterial: THREE.ShaderMaterial;
  floorRibbon: THREE.Mesh;
  wallRibbon: THREE.Mesh;
  ribbonMaterial: THREE.ShaderMaterial;
  anchorPosition: THREE.Vector3;
}

export interface SanctuaryRig {
  root: THREE.Group;
  waterMesh: Reflector;
  waterMaterial: THREE.ShaderMaterial;
  beamPivot: THREE.Group;
  beamMaterial: THREE.ShaderMaterial;
  stoneCausticsMaterial: THREE.ShaderMaterial;
  bronzeCausticsMaterial: THREE.ShaderMaterial;
  naveClimaxRibbonMaterial: THREE.ShaderMaterial;
  naveClimaxRibbons: THREE.Mesh[];
  floorHazeMaterial: THREE.ShaderMaterial;
  oculusHazeMaterial: THREE.ShaderMaterial;
  skyStripMaterial: THREE.MeshBasicMaterial;
  prisms: PrismAssembly[];
  prismHitProxies: THREE.Mesh[];
  waterHitPlane: THREE.Mesh;
  disposeReflector: () => void;
  disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
  };
}

/**
 * Helper to create an extruded beveled hexagonal crystal monolith geometry
 * centered vertically at its midpoint.
 */
function createBeveledPrismGeometry(
  radius: number,
  height: number,
  sides = 6,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    // Slight sculptural asymmetry between major and minor facets for sharper spectral cuts
    const r = i % 2 === 0 ? radius : radius * 0.86;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: radius * 0.16,
    bevelThickness: radius * 0.24,
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Rotate so extrusion axis runs along Y, center around origin, and ensure flat-faceted optical planes
  geom.rotateX(Math.PI / 2);
  geom.center();
  const faceted = geom.index ? geom.toNonIndexed() : geom;
  if (faceted !== geom) geom.dispose();
  faceted.computeVertexNormals();
  return faceted;
}

/**
 * Builds the entire monumental poured-travertine architectural sanctuary, fluted
 * colonnades, stepped sunken altar, longitudinal oculus roof, volumetric shafts,
 * true planar-reflected obsidian mirror pool, atmospheric haze, and suspended prisms.
 */
export function buildSanctuaryRig(
  textures: ArchitecturalTextureSet,
  sharedUniforms: SharedCausticUniforms,
  enableShadows: boolean,
  isSoftwareGl: boolean,
): SanctuaryRig {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // --- Shared Architectural PBR Materials ---
  // Clone texture instances with scale-appropriate repeats for walls vs altar vs ceiling
  const wallColorMap = textures.concreteMap.clone();
  wallColorMap.repeat.set(6, 3);
  wallColorMap.needsUpdate = true;
  const wallBumpMap = textures.concreteBump.clone();
  wallBumpMap.repeat.set(6, 3);
  wallBumpMap.needsUpdate = true;
  const wallRoughMap = textures.concreteRoughness.clone();
  wallRoughMap.repeat.set(6, 3);
  wallRoughMap.needsUpdate = true;

  const concreteWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdcd6cc,
      map: wallColorMap,
      bumpMap: wallBumpMap,
      bumpScale: 0.18,
      roughnessMap: wallRoughMap,
      roughness: 0.95,
      metalness: 0.02,
      envMapIntensity: 0.045,
    }),
  );
  attachStoneCausticsShader(concreteWallMat, sharedUniforms);

  const apseColorMap = textures.concreteMap.clone();
  apseColorMap.repeat.set(3, 2.5);
  apseColorMap.needsUpdate = true;
  const apseBumpMap = textures.concreteBump.clone();
  apseBumpMap.repeat.set(3, 2.5);
  apseBumpMap.needsUpdate = true;
  const apseRoughMap = textures.concreteRoughness.clone();
  apseRoughMap.repeat.set(3, 2.5);
  apseRoughMap.needsUpdate = true;

  const travertineMonolithMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2dcd2,
      map: apseColorMap,
      bumpMap: apseBumpMap,
      bumpScale: 0.22,
      roughnessMap: apseRoughMap,
      roughness: 0.9,
      metalness: 0.03,
      envMapIntensity: 0.055,
    }),
  );
  attachStoneCausticsShader(travertineMonolithMat, sharedUniforms);

  const flutedColumnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe4ded4,
      map: textures.flutedMap,
      bumpMap: textures.flutedBump,
      bumpScale: 0.28,
      roughnessMap: textures.flutedRoughness,
      roughness: 0.88,
      metalness: 0.03,
      envMapIntensity: 0.055,
    }),
  );
  attachStoneCausticsShader(flutedColumnMat, sharedUniforms);

  // Dark basalt plinth stone (wet lower stone meeting mirror water)
  const wetBasaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a1817,
      bumpMap: textures.concreteBump,
      bumpScale: 0.09,
      roughness: 0.3,
      metalness: 0.16,
      envMapIntensity: 0.32,
    }),
  );
  attachStoneCausticsShader(wetBasaltMat, sharedUniforms);

  // Architectural patinated bronze accents (column collars, prism suspension mounts)
  const darkBronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x624d38,
      roughness: 0.32,
      metalness: 0.86,
      envMapIntensity: 0.65,
    }),
  );
  attachStoneCausticsShader(darkBronzeMat, sharedUniforms, { isBronze: true });

  // Dedicated THREE.AdditiveBlending bounced water-caustic layers (delicate bounced light with soft vertical falloff)
  const stoneCausticsMaterial = trackMat(createAdditiveCausticsMaterial(sharedUniforms));
  const bronzeCausticsMaterial = trackMat(
    createAdditiveCausticsMaterial(sharedUniforms, { isBronze: true }),
  );

  // Fine suspension wire material
  const cableMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b6a56,
      roughness: 0.42,
      metalness: 0.88,
      envMapIntensity: 0.5,
    }),
  );

  const configureShadow = (mesh: THREE.Mesh, cast = true, receive = true) => {
    mesh.castShadow = enableShadows && cast;
    mesh.receiveShadow = enableShadows && receive;
  };

  // =========================================================================
  // 1. TRUE OBSIDIAN MIRROR POOL (Planar THREE.Reflector + 12-Ripple Warping)
  // =========================================================================
  const waterGeo = trackGeo(new THREE.PlaneGeometry(30, 62, 1, 1));
  const reflectorResolution = isSoftwareGl ? 512 : 1024;
  const waterMesh = new Reflector(waterGeo, {
    clipBias: 0.003,
    textureWidth: reflectorResolution,
    textureHeight: reflectorResolution,
    color: 0x0a0909,
    shader: createObsidianReflectorShader(sharedUniforms),
  });
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, 0, -2);
  waterMesh.renderOrder = 0;
  root.add(waterMesh);

  const waterMaterial = waterMesh.material as THREE.ShaderMaterial;

  // Dedicated invisible raycast plane for Movement II water touches
  const waterHitGeo = trackGeo(new THREE.PlaneGeometry(30, 62, 1, 1));
  waterHitGeo.rotateX(-Math.PI / 2);
  const waterHitMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
  const waterHitPlane = new THREE.Mesh(waterHitGeo, waterHitMat);
  waterHitPlane.position.copy(waterMesh.position);
  root.add(waterHitPlane);

  // =========================================================================
  // 2. MONUMENTAL CHAMBER ENCLOSURE (Side Walls, Deep Buttresses, End Walls)
  // =========================================================================
  const wallHeight = 18.2;
  const naveLength = 56;
  const sideWallGeo = trackGeo(new THREE.BoxGeometry(1.4, wallHeight, naveLength));

  const leftWall = new THREE.Mesh(sideWallGeo, concreteWallMat);
  leftWall.position.set(-11.4, wallHeight * 0.5 - 0.1, -2);
  configureShadow(leftWall, true, true);
  root.add(leftWall);

  const rightWall = new THREE.Mesh(sideWallGeo, concreteWallMat);
  rightWall.position.set(11.4, wallHeight * 0.5 - 0.1, -2);
  configureShadow(rightWall, true, true);
  root.add(rightWall);

  // Deep rhythmic architectural wall pilasters behind each colonnade bay
  const pilasterGeo = trackGeo(new THREE.BoxGeometry(1.25, wallHeight, 1.35));
  const bayZs = [12.5, 7.0, 1.5, -4.0, -9.5, -15.0, -20.5];
  for (const z of bayZs) {
    for (const side of [-1, 1]) {
      const pilaster = new THREE.Mesh(pilasterGeo, travertineMonolithMat);
      pilaster.position.set(side * 10.25, wallHeight * 0.5 - 0.1, z);
      configureShadow(pilaster, true, true);
      root.add(pilaster);
    }
  }

  // Rear Apse Monolith Wall (z = -25.2) with monumental vertical shadow reveal framing the altar
  const apseBackGeo = trackGeo(new THREE.BoxGeometry(24.5, wallHeight + 0.8, 1.6));
  const apseBackWall = new THREE.Mesh(apseBackGeo, travertineMonolithMat);
  apseBackWall.position.set(0, wallHeight * 0.5, -25.6);
  configureShadow(apseBackWall, false, true);
  root.add(apseBackWall);

  // Two towering flanking apse baffle walls creating Tadao Ando's signature deep shadow slit
  const baffleGeo = trackGeo(new THREE.BoxGeometry(8.2, wallHeight, 1.4));
  for (const side of [-1, 1]) {
    const baffle = new THREE.Mesh(baffleGeo, travertineMonolithMat);
    baffle.position.set(side * 6.5, wallHeight * 0.5 - 0.1, -23.6);
    configureShadow(baffle, true, true);
    root.add(baffle);
  }

  // Entry Rear Wall (behind camera at z = +25.5 so interior is completely sealed)
  const entryWall = new THREE.Mesh(apseBackGeo, concreteWallMat);
  entryWall.position.set(0, wallHeight * 0.5, 25.5);
  configureShadow(entryWall, true, true);
  root.add(entryWall);

  // Submerged stone perimeter curbs framing the flooded water basin
  const curbGeo = trackGeo(new THREE.BoxGeometry(1.5, 0.34, naveLength));
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(curbGeo, wetBasaltMat);
    curb.position.set(side * 10.0, 0.08, -2);
    configureShadow(curb, false, true);
    root.add(curb);
  }

  // =========================================================================
  // 3. MONUMENTAL FLUTED COLONNADES (14 Composite 5-Part Columns)
  // =========================================================================
  const plinthGeo = trackGeo(new THREE.BoxGeometry(1.88, 0.42, 1.88));
  const baseCollarGeo = trackGeo(new THREE.CylinderGeometry(0.76, 0.84, 0.24, 24));
  const shaftGeo = trackGeo(new THREE.CylinderGeometry(0.62, 0.72, 15.65, 28, 1));
  const neckCollarGeo = trackGeo(new THREE.CylinderGeometry(0.57, 0.62, 0.28, 24));
  const capitalGeo = trackGeo(new THREE.BoxGeometry(1.76, 0.68, 1.76));

  // Dedicated THREE.AdditiveBlending caustic projection shells batched via InstancedMesh (3 draw calls total)
  const plinthCausticGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.425, 1.9));
  const collarCausticGeo = trackGeo(new THREE.CylinderGeometry(0.77, 0.85, 0.245, 24, 1, true));
  const lowerShaftCausticGeo = trackGeo(new THREE.CylinderGeometry(0.71, 0.73, 3.0, 28, 1, true));

  const totalColumns = bayZs.length * 2;
  const plinthCausticInst = new THREE.InstancedMesh(plinthCausticGeo, stoneCausticsMaterial, totalColumns);
  const collarCausticInst = new THREE.InstancedMesh(collarCausticGeo, bronzeCausticsMaterial, totalColumns);
  const lowerShaftCausticInst = new THREE.InstancedMesh(lowerShaftCausticGeo, stoneCausticsMaterial, totalColumns);
  plinthCausticInst.renderOrder = 2;
  collarCausticInst.renderOrder = 2;
  lowerShaftCausticInst.renderOrder = 2;
  const instMatrix = new THREE.Matrix4();
  let colIdx = 0;

  for (const z of bayZs) {
    for (const side of [-1, 1]) {
      const cx = side * 6.15;
      const colGroup = new THREE.Group();
      colGroup.position.set(cx, 0, z);

      // Part 1: Wet basalt submerged plinth grounded at y = 0
      const plinth = new THREE.Mesh(plinthGeo, wetBasaltMat);
      plinth.position.y = 0.16;
      configureShadow(plinth, true, true);
      colGroup.add(plinth);

      // Part 2: Patinated bronze transition ring
      const collar = new THREE.Mesh(baseCollarGeo, darkBronzeMat);
      collar.position.y = 0.48;
      configureShadow(collar, true, true);
      colGroup.add(collar);

      // Part 3: Towering fluted travertine shaft
      const shaft = new THREE.Mesh(shaftGeo, flutedColumnMat);
      shaft.position.y = 0.6 + 15.65 * 0.5;
      configureShadow(shaft, true, true);
      colGroup.add(shaft);

      // Part 4: Recessed architectural shadow-gap necking
      const neck = new THREE.Mesh(neckCollarGeo, darkBronzeMat);
      neck.position.y = 16.38;
      configureShadow(neck, true, true);
      colGroup.add(neck);

      // Part 5: Monolithic square travertine abacus capital
      const capital = new THREE.Mesh(capitalGeo, travertineMonolithMat);
      capital.position.y = 16.86;
      configureShadow(capital, true, true);
      colGroup.add(capital);

      root.add(colGroup);

      instMatrix.makeTranslation(cx, 0.165, z);
      plinthCausticInst.setMatrixAt(colIdx, instMatrix);
      instMatrix.makeTranslation(cx, 0.48, z);
      collarCausticInst.setMatrixAt(colIdx, instMatrix);
      instMatrix.makeTranslation(cx, 0.6 + 1.5, z);
      lowerShaftCausticInst.setMatrixAt(colIdx, instMatrix);
      colIdx++;
    }
  }

  plinthCausticInst.instanceMatrix.needsUpdate = true;
  collarCausticInst.instanceMatrix.needsUpdate = true;
  lowerShaftCausticInst.instanceMatrix.needsUpdate = true;
  root.add(plinthCausticInst, collarCausticInst, lowerShaftCausticInst);

  // Additive bounced-light caustic wainscot along lower side walls & apse base
  const sideWallCausticGeo = trackGeo(new THREE.PlaneGeometry(naveLength, 3.3, 1, 1));
  for (const side of [-1, 1]) {
    const wallCaustic = new THREE.Mesh(sideWallCausticGeo, stoneCausticsMaterial);
    wallCaustic.position.set(side * 10.66, 1.66, -2);
    wallCaustic.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
    wallCaustic.renderOrder = 2;
    root.add(wallCaustic);
  }

  const apseCausticGeo = trackGeo(new THREE.PlaneGeometry(24.0, 3.3, 1, 1));
  const apseCaustic = new THREE.Mesh(apseCausticGeo, stoneCausticsMaterial);
  apseCaustic.position.set(0, 1.66, -22.84);
  apseCaustic.renderOrder = 2;
  root.add(apseCaustic);

  // =========================================================================
  // 4. VAULTED ROOF SLABS & LONGITUDINAL OCULUS SLIT
  // =========================================================================
  // Longitudinal architrave beams spanning the colonnades
  const architraveGeo = trackGeo(new THREE.BoxGeometry(2.1, 1.45, naveLength));
  for (const side of [-1, 1]) {
    const architrave = new THREE.Mesh(architraveGeo, travertineMonolithMat);
    architrave.position.set(side * 6.15, 17.85, -2);
    configureShadow(architrave, true, true);
    root.add(architrave);
  }

  // Heavy coffered roof decks flanking the central longitudinal Oculus Slit (slit width = 2.9m, x in [-1.45, +1.45])
  const roofSlabGeo = trackGeo(new THREE.BoxGeometry(10.6, 1.35, naveLength));
  for (const side of [-1, 1]) {
    const roofSlab = new THREE.Mesh(roofSlabGeo, concreteWallMat);
    roofSlab.position.set(side * 6.75, 18.65, -2);
    configureShadow(roofSlab, true, true);
    root.add(roofSlab);
  }

  // Deep chamfered concrete Oculus Slit reveal cheeks that catch raking light
  const revealGeo = trackGeo(new THREE.BoxGeometry(0.45, 1.95, 38.0));
  for (const side of [-1, 1]) {
    const reveal = new THREE.Mesh(revealGeo, travertineMonolithMat);
    reveal.position.set(side * 1.62, 18.15, -3.5);
    configureShadow(reveal, true, true);
    root.add(reveal);
  }

  // Solid roof end caps closing the oculus at z > 15.5 and z < -22.5
  const capFrontGeo = trackGeo(new THREE.BoxGeometry(4.2, 1.5, 11.5));
  const capFront = new THREE.Mesh(capFrontGeo, concreteWallMat);
  capFront.position.set(0, 18.6, 21.0);
  configureShadow(capFront, true, true);
  root.add(capFront);

  const capBackGeo = trackGeo(new THREE.BoxGeometry(4.2, 1.5, 6.0));
  const capBack = new THREE.Mesh(capBackGeo, concreteWallMat);
  capBack.position.set(0, 18.6, -24.8);
  configureShadow(capBack, true, true);
  root.add(capBack);

  // Rhythmic transverse structural concrete ribs bridging the nave (leaving open sky bays)
  const ribGeo = trackGeo(new THREE.BoxGeometry(13.2, 0.72, 0.72));
  for (const z of bayZs) {
    const rib = new THREE.Mesh(ribGeo, travertineMonolithMat);
    rib.position.set(0, 17.55, z);
    configureShadow(rib, true, true);
    root.add(rib);
  }

  // Luminous sky aperture strip visible directly through the longitudinal oculus slit
  const skyStripMaterial = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xeae4d8,
      fog: false,
    }),
  );
  const skyStripGeo = trackGeo(new THREE.PlaneGeometry(5.6, 42.0));
  skyStripGeo.rotateX(Math.PI / 2);
  const skyStrip = new THREE.Mesh(skyStripGeo, skyStripMaterial);
  skyStrip.position.set(0, 20.6, -3.5);
  root.add(skyStrip);

  // =========================================================================
  // 5. STEPPED SUNKEN ALTAR & MONOLITHIC DAIS (z = -14.5 to -23.0)
  // =========================================================================
  const altarGroup = new THREE.Group();
  altarGroup.position.set(0, 0, -18.2);

  // Three broad concentric travertine steps rising cleanly out of the black mirror pool
  const stepSpecs = [
    { w: 9.8, h: 0.24, d: 8.4, y: 0.08, mat: wetBasaltMat },
    { w: 8.2, h: 0.22, d: 6.8, y: 0.29, mat: travertineMonolithMat },
    { w: 6.4, h: 0.22, d: 5.0, y: 0.49, mat: travertineMonolithMat },
  ];
  for (const spec of stepSpecs) {
    const stepGeo = trackGeo(new THREE.BoxGeometry(spec.w, spec.h, spec.d));
    const stepMesh = new THREE.Mesh(stepGeo, spec.mat);
    stepMesh.position.y = spec.y;
    configureShadow(stepMesh, true, true);
    altarGroup.add(stepMesh);

    const stepCausticGeo = trackGeo(
      new THREE.BoxGeometry(spec.w + 0.025, spec.h + 0.014, spec.d + 0.025),
    );
    const stepCaustic = new THREE.Mesh(stepCausticGeo, stoneCausticsMaterial);
    stepCaustic.position.y = spec.y + 0.005;
    stepCaustic.renderOrder = 2;
    altarGroup.add(stepCaustic);
  }

  // Central monolithic travertine altar table + bronze reveal seam
  const altarBaseGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.92, 1.45));
  const altarBase = new THREE.Mesh(altarBaseGeo, travertineMonolithMat);
  altarBase.position.set(0, 1.06, -0.6);
  configureShadow(altarBase, true, true);
  altarGroup.add(altarBase);

  const altarBaseCausticGeo = trackGeo(new THREE.BoxGeometry(3.425, 0.925, 1.475));
  const altarBaseCaustic = new THREE.Mesh(altarBaseCausticGeo, stoneCausticsMaterial);
  altarBaseCaustic.position.set(0, 1.06, -0.6);
  altarBaseCaustic.renderOrder = 2;
  altarGroup.add(altarBaseCaustic);

  const altarTrimGeo = trackGeo(new THREE.BoxGeometry(3.46, 0.06, 1.5));
  const altarTrim = new THREE.Mesh(altarTrimGeo, darkBronzeMat);
  altarTrim.position.set(0, 1.54, -0.6);
  configureShadow(altarTrim, false, true);
  altarGroup.add(altarTrim);

  // Sculptural central stone stele rising behind the altar inside the shadow reveal
  const steleGeo = trackGeo(new THREE.BoxGeometry(1.65, 9.6, 0.68));
  const stele = new THREE.Mesh(steleGeo, travertineMonolithMat);
  stele.position.set(0, 5.2, -4.6);
  configureShadow(stele, true, true);
  altarGroup.add(stele);

  root.add(altarGroup);

  // =========================================================================
  // 6. VOLUMETRIC GOD RAYS (Layered Angled Light-Curtain Sheets)
  // =========================================================================
  const beamMaterial = trackMat(createVolumetricBeamMaterial());
  const beamPivot = new THREE.Group();
  // Anchored along the roof oculus centerline so rotating tilts the descending rays cleanly
  beamPivot.position.set(0, 18.2, -3.5);

  // Construct 5 parallel translucent architectural light-curtain sheets & 3 cross-baffles
  // spanning the oculus length (NO particle clouds)
  const beamHeight = 23.5;
  const longSheetGeo = trackGeo(new THREE.PlaneGeometry(34.0, beamHeight, 1, 1));
  longSheetGeo.rotateY(Math.PI / 2);
  // Translate so top edge sits at y = 0 (oculus slit) and bottom extends downward to -beamHeight
  longSheetGeo.translate(0, -beamHeight * 0.5, 0);

  const xOffsets = [-1.15, -0.58, 0.0, 0.58, 1.15];
  for (const xOff of xOffsets) {
    const sheet = new THREE.Mesh(longSheetGeo, beamMaterial);
    sheet.position.x = xOff;
    sheet.renderOrder = 3;
    beamPivot.add(sheet);
  }

  // Subtle cross-section sheets so even looking straight down the nave has rich volumetric depth
  const crossSheetGeo = trackGeo(new THREE.PlaneGeometry(2.75, beamHeight, 1, 1));
  crossSheetGeo.translate(0, -beamHeight * 0.5, 0);
  const zOffsets = [-11.5, -5.5, 0.5, 6.5];
  for (const zOff of zOffsets) {
    const sheet = new THREE.Mesh(crossSheetGeo, beamMaterial);
    sheet.position.z = zOff;
    sheet.renderOrder = 3;
    beamPivot.add(sheet);
  }

  root.add(beamPivot);

  // =========================================================================
  // 7. THE THREE SUSPENDED CRYSTAL PRISMS & CHROMATIC SPECTRAL RIBBONS
  // =========================================================================
  const prismConfigs = [
    { z: -6.4, y: 5.55, x: -0.92, radius: 0.46, height: 2.85 },
    { z: -8.9, y: 4.95, x: 0.05, radius: 0.54, height: 3.35 },
    { z: -11.4, y: 5.45, x: 0.96, radius: 0.44, height: 2.7 },
  ];

  const prisms: PrismAssembly[] = [];
  const prismHitProxies: THREE.Mesh[] = [];
  const hitProxyMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));

  const capGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.32, 0.22, 6));
  const wireGeo = trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 13.5, 6));

  prismConfigs.forEach((cfg, idx) => {
    const group = new THREE.Group();
    group.position.set(cfg.x, cfg.y, cfg.z);

    // Sculptural beveled hexagonal crystal monolith
    const crystalGeo = trackGeo(createBeveledPrismGeometry(cfg.radius, cfg.height, 6));
    const crystalMaterial = trackMat(createPrismCrystalMaterial());
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMaterial);
    crystalMesh.renderOrder = 5;
    group.add(crystalMesh);

    // Patinated bronze upper & lower suspension caps
    const topCap = new THREE.Mesh(capGeo, darkBronzeMat);
    topCap.position.y = cfg.height * 0.5 + 0.16;
    configureShadow(topCap, true, false);
    group.add(topCap);

    const botCap = new THREE.Mesh(capGeo, darkBronzeMat);
    botCap.rotation.x = Math.PI;
    botCap.position.y = -(cfg.height * 0.5 + 0.16);
    group.add(botCap);

    // Fine tension cable rising to the oculus ceiling beam
    const wire = new THREE.Mesh(wireGeo, cableMat);
    wire.position.y = cfg.height * 0.5 + 0.2 + 13.5 * 0.5;
    group.add(wire);

    // Generous invisible hit cylinder for effortless drag interaction on touch & desktop
    const hitGeo = trackGeo(new THREE.CylinderGeometry(cfg.radius * 2.1, cfg.radius * 2.1, cfg.height * 1.25, 10));
    const hitProxy = new THREE.Mesh(hitGeo, hitProxyMat);
    hitProxy.userData.prismIndex = idx;
    group.add(hitProxy);
    prismHitProxies.push(hitProxy);

    root.add(group);

    // Wide, soft, translucent optical dispersion bands cast onto the altar & rear apse concrete
    const ribbonMaterial = trackMat(createSpectralRibbonMaterial());

    const floorRibbonGeo = trackGeo(new THREE.PlaneGeometry(4.2, 14.0, 1, 1));
    floorRibbonGeo.rotateX(-Math.PI / 2);
    const floorRibbon = new THREE.Mesh(floorRibbonGeo, ribbonMaterial);
    floorRibbon.position.set(cfg.x * 1.4, 0.625, -16.6 + idx * 0.45);
    floorRibbon.renderOrder = 4;
    root.add(floorRibbon);

    const wallRibbonGeo = trackGeo(new THREE.PlaneGeometry(4.6, 13.4, 1, 1));
    const wallRibbon = new THREE.Mesh(wallRibbonGeo, ribbonMaterial);
    wallRibbon.position.set(cfg.x * 2.1, 5.4 + idx * 0.8, -22.72);
    wallRibbon.renderOrder = 4;
    root.add(wallRibbon);

    prisms.push({
      id: idx,
      group,
      crystalMesh,
      hitProxy,
      crystalMaterial,
      floorRibbon,
      wallRibbon,
      ribbonMaterial,
      anchorPosition: new THREE.Vector3(cfg.x, cfg.y, cfg.z),
    });
  });

  // =========================================================================
  // 8. NAVE-WIDE ETHEREAL CLIMAX DISPERSION RIBBONS (Revealed at 3/3 Lock)
  // =========================================================================
  const naveClimaxRibbonMaterial = trackMat(createSpectralRibbonMaterial());
  naveClimaxRibbonMaterial.uniforms.uIntensity.value = 0.0;
  naveClimaxRibbonMaterial.uniforms.uBloom.value = 0.0;
  const naveClimaxRibbons: THREE.Mesh[] = [];

  // Sweeping left & right cathedral wall dispersion washes bathing the concrete colonnade
  const naveWallWashGeo = trackGeo(new THREE.PlaneGeometry(15.5, 28.0, 1, 1));
  for (const side of [-1, 1]) {
    const wash = new THREE.Mesh(naveWallWashGeo, naveClimaxRibbonMaterial);
    wash.position.set(side * 10.48, 7.8, -6.5);
    wash.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
    wash.rotation.z = side * 0.22;
    wash.visible = false;
    wash.renderOrder = 4;
    root.add(wash);
    naveClimaxRibbons.push(wash);
  }

  // Two translucent diagonal dispersion fans radiating from the suspended prisms across the nave air
  const prismFanGeo = trackGeo(new THREE.PlaneGeometry(14.0, 18.0, 1, 1));
  for (const side of [-1, 1]) {
    const fan = new THREE.Mesh(prismFanGeo, naveClimaxRibbonMaterial);
    fan.position.set(side * 4.2, 6.2, -9.2);
    fan.rotation.y = side * -0.46;
    fan.rotation.z = side * 0.28;
    fan.visible = false;
    fan.renderOrder = 4;
    root.add(fan);
    naveClimaxRibbons.push(fan);
  }

  // Unified rear apse cathedral dispersion veil framing the stele & altar
  const apseClimaxGeo = trackGeo(new THREE.PlaneGeometry(18.5, 16.5, 1, 1));
  const apseClimaxWash = new THREE.Mesh(apseClimaxGeo, naveClimaxRibbonMaterial);
  apseClimaxWash.position.set(0, 7.6, -22.62);
  apseClimaxWash.visible = false;
  apseClimaxWash.renderOrder = 4;
  root.add(apseClimaxWash);
  naveClimaxRibbons.push(apseClimaxWash);

  // =========================================================================
  // 9. SUBTLE ARCHITECTURAL ATMOSPHERIC HAZE (Floor Mist & Oculus Halo)
  // =========================================================================
  const floorHazeMaterial = trackMat(createAtmosphericHazeMaterial());
  const floorHazeGeo = trackGeo(new THREE.PlaneGeometry(18.5, 4.4, 1, 1));
  const floorHazeZs = [-18.5, -11.0, -3.5, 4.0];
  for (const hz of floorHazeZs) {
    const hazePlane = new THREE.Mesh(floorHazeGeo, floorHazeMaterial);
    hazePlane.position.set(0, 1.55, hz);
    hazePlane.renderOrder = 2;
    root.add(hazePlane);
  }

  const oculusHazeMaterial = trackMat(createAtmosphericHazeMaterial());
  const oculusHazeGeo = trackGeo(new THREE.PlaneGeometry(7.2, 39.0, 1, 1));
  oculusHazeGeo.rotateX(Math.PI / 2);
  const oculusHazePlane = new THREE.Mesh(oculusHazeGeo, oculusHazeMaterial);
  oculusHazePlane.position.set(0, 17.35, -3.5);
  oculusHazePlane.renderOrder = 2;
  root.add(oculusHazePlane);

  return {
    root,
    waterMesh,
    waterMaterial,
    beamPivot,
    beamMaterial,
    stoneCausticsMaterial,
    bronzeCausticsMaterial,
    naveClimaxRibbonMaterial,
    naveClimaxRibbons,
    floorHazeMaterial,
    oculusHazeMaterial,
    skyStripMaterial,
    prisms,
    prismHitProxies,
    waterHitPlane,
    disposeReflector: () => {
      waterMesh.dispose();
    },
    disposables: {
      geometries,
      materials,
    },
  };
}
