import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CathedralAudioEngine } from './audioEngine';
import { ChapterId, dampScalar, getChapterById } from './chapters';
import {
  applyPrismImpulse,
  createInitialPrismSystem,
  PrismSystemState,
  stepPrismSystem,
} from './prismPhysics';
import { createArchitecturalTextures, ArchitecturalTextureSet } from './proceduralTextures';
import {
  computeActiveRippleEnergy,
  createRippleBuffer,
  MAX_RIPPLES,
  pushRipple,
  RippleBufferState,
} from './rippleBuffer';
import { buildSanctuaryRig, SanctuaryRig } from './sanctuaryGeometry';
import { createSharedCausticUniforms, SharedCausticUniforms } from './shaders';
import { clamp01, evaluateSolarState, SolarPhase } from './solarMath';

export interface SanctuaryHudSnapshot {
  chapter: ChapterId;
  solarProgress: number;
  altitudeDeg: number;
  azimuthDeg: number;
  telemetryText: string;
  phase: SolarPhase;
  alignedPrisms: number;
  allPrismsAligned: boolean;
  resonanceClimax: boolean;
  climaxProgress: number;
  rippleCount: number;
  grainDataUrl: string;
  webglError: string | null;
}

export interface SanctuaryCallbacks {
  onHudUpdate: (snapshot: SanctuaryHudSnapshot) => void;
  onChapterInteract: (chapter: ChapterId) => void;
}

// Reusable scratch vectors (zero GC allocations inside render loop)
const _vecTargetPos = new THREE.Vector3();
const _vecTargetLook = new THREE.Vector3();
const _vecPointerNdc = new THREE.Vector2();
const _vecSunPos = new THREE.Vector3();
const _vecBeamTiltAxis = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class SanctuaryEngine {
  private container: HTMLElement;
  private callbacks: SanctuaryCallbacks;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private altarBounceLight: THREE.PointLight;
  private fog: THREE.FogExp2;

  private textures: ArchitecturalTextureSet | null = null;
  private sharedUniforms: SharedCausticUniforms;
  private rig: SanctuaryRig | null = null;
  private audio: CathedralAudioEngine;
  private raycaster = new THREE.Raycaster();

  private isSoftwareGl: boolean;
  private disposed = false;
  private frameHandle = 0;
  private lastTimestamp = 0;
  private elapsedSec = 0;
  private lastHudPushSec = -1;

  // Interactive simulation state
  private chapter: ChapterId = 'oculus';
  private solarProgress = 0.28; // Opens in sculptural golden morning-zenith chiaroscuro
  private targetSolarProgress = 0.28;
  private rippleBuffer: RippleBufferState = createRippleBuffer();
  private prismState: PrismSystemState = createInitialPrismSystem();

  // Camera smooth state
  private currentCamPos = new THREE.Vector3(0.0, 2.55, 16.4);
  private currentCamLook = new THREE.Vector3(0.0, 6.2, -12.0);
  private currentFov = 48;

  // Pointer & touch gesture tracking
  private pointerX = 0; // normalized [-1, 1]
  private pointerY = 0; // normalized [-1, 1]
  private smoothPointerX = 0;
  private smoothPointerY = 0;
  private isPointerDown = false;
  private activePointerId: number | null = null;
  private lastClientX = 0;
  private lastClientY = 0;
  private activePrismIndex = -1;
  private lastDragRippleSec = -1;
  private grainDataUrl = '';
  private envTexture: THREE.Texture | null = null;

  constructor(container: HTMLElement, callbacks: SanctuaryCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.audio = new CathedralAudioEngine();
    this.sharedUniforms = createSharedCausticUniforms();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0c0b);
    this.fog = new THREE.FogExp2(0x161412, 0.02);
    this.scene.fog = this.fog;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.2, 95);
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentCamLook);

    // Primary solar directional light casting sweeping architectural shadows
    this.sunLight = new THREE.DirectionalLight(0xfff1dc, 4.2);
    this.sunLight.position.set(14, 28, 8);
    this.sunLight.target.position.set(0, 0, -4);
    this.scene.add(this.sunLight.target);
    this.scene.add(this.sunLight);

    // Warm/cool architectural hemisphere fill (slashed low for monumental chiaroscuro)
    this.hemiLight = new THREE.HemisphereLight(0x6e8099, 0x0c0a09, 0.085);
    this.scene.add(this.hemiLight);

    // Whisper-subtle reflected sanctuary bounce light near the sunken altar & prisms
    this.altarBounceLight = new THREE.PointLight(0xd8b482, 0.42, 22, 1.8);
    this.altarBounceLight.position.set(0, 2.8, -11.0);
    this.scene.add(this.altarBounceLight);

    this.initRenderer();
  }

  private initRenderer(): void {
    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setPixelRatio(
        this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      );

      const enableShadows = !this.isSoftwareGl;
      renderer.shadowMap.enabled = enableShadows;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const width = Math.max(1, this.container.clientWidth);
      const height = Math.max(1, this.container.clientHeight);
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      renderer.domElement.setAttribute('data-testid', 'sanctuary-canvas');

      this.container.appendChild(renderer.domElement);
      this.renderer = renderer;

      // Configure tight orthographic shadow frustum covering the sanctuary nave
      this.sunLight.castShadow = enableShadows;
      this.sunLight.shadow.mapSize.width = 1024;
      this.sunLight.shadow.mapSize.height = 1024;
      this.sunLight.shadow.camera.near = 2;
      this.sunLight.shadow.camera.far = 72;
      this.sunLight.shadow.camera.left = -22;
      this.sunLight.shadow.camera.right = 22;
      this.sunLight.shadow.camera.top = 26;
      this.sunLight.shadow.camera.bottom = -26;
      this.sunLight.shadow.bias = -0.0005;
      this.sunLight.shadow.normalBias = 0.03;

      // Procedural studio environment map (RoomEnvironment) on all devices for PBR realism
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.envTexture = envRT.texture;
      this.scene.environment = this.envTexture;
      pmrem.dispose();

      // Procedural travertine concrete & fluted stone textures (zero external URLs)
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      this.textures = createArchitecturalTextures(maxAniso);
      this.grainDataUrl = this.textures.grainDataUrl;

      // Build monumental sanctuary geometry + true Reflector mirror pool + custom shaders
      this.rig = buildSanctuaryRig(
        this.textures,
        this.sharedUniforms,
        enableShadows,
        this.isSoftwareGl,
      );
      this.scene.add(this.rig.root);

      // Seed one gentle inaugural ripple in the distance so water caustics breathe on arrival
      pushRipple(this.rippleBuffer, 0.0, -5.2, 0.0, 0.72);

      // Apply initial solar lighting state cleanly and paint frame 0 immediately
      this.applySolarAndSceneState(0.016);

      if (!this.isSoftwareGl) {
        renderer.compile(this.scene, this.camera);
      }
      renderer.render(this.scene, this.camera);

      this.attachEvents(renderer.domElement);
      this.pushHudSnapshot(true);
      this.startLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WebGL initialization failed';
      this.callbacks.onHudUpdate({
        chapter: this.chapter,
        solarProgress: this.solarProgress,
        altitudeDeg: 45,
        azimuthDeg: 180,
        telemetryText: 'ALT 45.0° // AZM 180.0°',
        phase: 'Blinding Zenith',
        alignedPrisms: 0,
        allPrismsAligned: false,
        resonanceClimax: false,
        climaxProgress: 0,
        rippleCount: 0,
        grainDataUrl: '',
        webglError: msg,
      });
    }
  }

  private attachEvents(canvas: HTMLCanvasElement): void {
    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.stopLoop();
  };

  private handleContextRestored = (): void => {
    if (!this.disposed) {
      this.startLoop();
    }
  };

  private handleResize = (): void => {
    if (!this.renderer || this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, this.camera);
  };

  private updatePointerNdc(clientX: number, clientY: number): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const nx = ((clientX - rect.left) / w) * 2 - 1;
    const ny = -(((clientY - rect.top) / h) * 2 - 1);
    this.pointerX = Math.max(-1, Math.min(1, nx));
    this.pointerY = Math.max(-1, Math.min(1, ny));
    _vecPointerNdc.set(this.pointerX, this.pointerY);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.audio.unlock();
    this.isPointerDown = true;
    this.activePointerId = e.pointerId;
    this.lastClientX = e.clientX;
    this.lastClientY = e.clientY;
    this.updatePointerNdc(e.clientX, e.clientY);

    if (this.chapter === 'pool') {
      this.castWaterRippleAtPointer(1.05);
      this.callbacks.onChapterInteract('pool');
    } else if (this.chapter === 'prism') {
      this.activePrismIndex = this.pickPrismAtPointer();
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    this.updatePointerNdc(e.clientX, e.clientY);

    if (!this.isPointerDown) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    const dx = e.clientX - this.lastClientX;
    const dy = e.clientY - this.lastClientY;
    this.lastClientX = e.clientX;
    this.lastClientY = e.clientY;

    const viewportW = Math.max(320, this.container.clientWidth);

    if (this.chapter === 'oculus') {
      if (Math.abs(dx) > 0.5) {
        // Horizontal drag smoothly scrubs sun across Dawn -> Zenith -> Dusk -> Eclipse
        this.targetSolarProgress = clamp01(this.targetSolarProgress + (dx / viewportW) * 1.15);
        this.callbacks.onChapterInteract('oculus');
      }
    } else if (this.chapter === 'pool') {
      // Dragging across the mirror water leaves a serene trail of damped ripples
      if (Math.hypot(dx, dy) > 4 && this.elapsedSec - this.lastDragRippleSec > 0.14) {
        this.castWaterRippleAtPointer(0.75);
        this.lastDragRippleSec = this.elapsedSec;
        this.callbacks.onChapterInteract('pool');
      }
    } else if (this.chapter === 'prism') {
      if (Math.abs(dx) > 0.5) {
        const deltaRad = (dx / viewportW) * Math.PI * 1.85;
        applyPrismImpulse(this.prismState, this.activePrismIndex, deltaRad);
        this.callbacks.onChapterInteract('prism');
      }
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    this.isPointerDown = false;
    this.activePointerId = null;
    this.activePrismIndex = -1;
  };

  private castWaterRippleAtPointer(strength: number): void {
    if (!this.rig) return;
    this.raycaster.setFromCamera(_vecPointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.rig.waterHitPlane, false);
    if (hits.length > 0) {
      const pt = hits[0].point;
      // Keep ripples inside the central flooded nave basin
      const rx = Math.max(-9.6, Math.min(9.6, pt.x));
      const rz = Math.max(-22.0, Math.min(18.0, pt.z));
      pushRipple(this.rippleBuffer, rx, rz, this.elapsedSec, strength);
      this.audio.triggerWaterRipple(rx, rz, strength);
    }
  }

  private pickPrismAtPointer(): number {
    if (!this.rig) return -1;
    this.raycaster.setFromCamera(_vecPointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.rig.prismHitProxies, false);
    if (hits.length > 0) {
      const idx = hits[0].object.userData.prismIndex;
      if (typeof idx === 'number') return idx;
    }
    return -1;
  }

  // =========================================================================
  // PUBLIC IMPERATIVE API FOR REACT UI & KEYBOARD ACCESSIBILITY
  // =========================================================================
  public setChapter(chapter: ChapterId): void {
    if (this.chapter === chapter) return;
    this.chapter = chapter;
    if (chapter === 'pool') {
      // Send a welcoming delicate ripple down the nave when gliding to the pool
      pushRipple(this.rippleBuffer, 0.3, -4.5, this.elapsedSec, 0.85);
      this.audio.triggerWaterRipple(0.3, -4.5, 0.6);
    }
    this.pushHudSnapshot(true);
  }

  public unlockAudio(): void {
    this.audio.unlock();
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public nudgeSolar(delta: number): void {
    this.targetSolarProgress = clamp01(this.targetSolarProgress + delta);
    this.callbacks.onChapterInteract('oculus');
  }

  public nudgePrisms(deltaRad: number): void {
    applyPrismImpulse(this.prismState, -1, deltaRad);
    this.callbacks.onChapterInteract('prism');
  }

  public triggerCenterRipple(): void {
    const rx = (Math.random() - 0.5) * 3.5;
    const rz = -4.5 + (Math.random() - 0.5) * 4.0;
    pushRipple(this.rippleBuffer, rx, rz, this.elapsedSec, 1.0);
    this.audio.triggerWaterRipple(rx, rz, 0.9);
    this.callbacks.onChapterInteract('pool');
  }

  // =========================================================================
  // RENDER LOOP (GPU rAF vs Software WebGL afterDraw pacing)
  // =========================================================================
  private startLoop(): void {
    this.lastTimestamp = performance.now();
    this.tick();
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frameHandle);
    clearTimeout(this.frameHandle);
  }

  private afterDraw(cb: () => void): void {
    if (!this.renderer || this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameHandle = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.frameHandle = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameHandle = window.setTimeout(cb, 80);
      }
    };
    this.frameHandle = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed || !this.renderer) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) * 0.001;
    this.lastTimestamp = now;
    const dt = Math.max(0.001, Math.min(0.35, rawDt));
    this.elapsedSec += dt;

    this.applySolarAndSceneState(dt);
    this.renderer.render(this.scene, this.camera);

    // Push throttled HUD snapshot (~8 Hz max, zero 60Hz React state churn)
    if (this.elapsedSec - this.lastHudPushSec >= 0.125) {
      this.pushHudSnapshot(false);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameHandle = requestAnimationFrame(this.tick);
    }
  };

  private applySolarAndSceneState(dt: number): void {
    // 1. Smoothly damp solar scrub progress
    this.solarProgress = dampScalar(this.solarProgress, this.targetSolarProgress, 5.2, dt);
    const solar = evaluateSolarState(this.solarProgress);

    // 2. Step prism rotational physics & 5-second climax in stable <= 0.05s substeps
    const substeps = Math.max(1, Math.ceil(dt / 0.05));
    const subDt = dt / substeps;
    let newlyLockedIndex: number | null = null;
    let justCompletedAll = false;
    for (let s = 0; s < substeps; s++) {
      const ev = stepPrismSystem(
        this.prismState,
        subDt,
        solar.azimuthDeg,
        this.isPointerDown && this.chapter === 'prism',
      );
      if (ev.justCompletedAll) justCompletedAll = true;
      if (ev.newlyLockedIndex !== null && newlyLockedIndex === null) {
        newlyLockedIndex = ev.newlyLockedIndex;
      }
    }
    if (justCompletedAll) {
      this.audio.triggerHarmonicResonanceSwell();
      this.pushHudSnapshot(true);
    } else if (newlyLockedIndex !== null) {
      this.audio.triggerPrismLock(newlyLockedIndex);
      this.pushHudSnapshot(true);
    }

    // 3. Smooth pointer parallax & breathing camera chapter choreography
    this.smoothPointerX = dampScalar(this.smoothPointerX, this.pointerX, 3.2, dt);
    this.smoothPointerY = dampScalar(this.smoothPointerY, this.pointerY, 3.2, dt);

    const chap = getChapterById(this.chapter);
    const breathX = Math.sin(this.elapsedSec * 0.34) * chap.breathAmplitude;
    const breathY = Math.cos(this.elapsedSec * 0.27) * chap.breathAmplitude * 0.65;

    // During Movement III 3/3 Resonance Climax, smoothly glide camera backward & slightly upward
    // to reveal the entire cathedral nave bathed in unified prismatic refraction.
    const climaxCamW = this.chapter === 'prism' ? this.prismState.climaxCameraWeight : 0;
    const basePosX = chap.cameraPosition[0] + (0.0 - chap.cameraPosition[0]) * climaxCamW;
    const basePosY = chap.cameraPosition[1] + (6.45 - chap.cameraPosition[1]) * climaxCamW;
    const basePosZ = chap.cameraPosition[2] + (15.4 - chap.cameraPosition[2]) * climaxCamW;

    const baseLookX = chap.cameraTarget[0] + (0.0 - chap.cameraTarget[0]) * climaxCamW;
    const baseLookY = chap.cameraTarget[1] + (5.15 - chap.cameraTarget[1]) * climaxCamW;
    const baseLookZ = chap.cameraTarget[2] + (-11.8 - chap.cameraTarget[2]) * climaxCamW;

    const targetFov = chap.fov + (52.0 - chap.fov) * climaxCamW;

    _vecTargetPos.set(
      basePosX + this.smoothPointerX * chap.parallaxScale + breathX,
      basePosY + this.smoothPointerY * chap.parallaxScale * 0.38 + breathY,
      basePosZ,
    );
    _vecTargetLook.set(
      baseLookX + this.smoothPointerX * chap.parallaxScale * 0.42,
      baseLookY + this.smoothPointerY * chap.parallaxScale * 0.24,
      baseLookZ,
    );

    const camLambda = 2.8;
    const camDt = Math.min(0.25, dt);
    this.currentCamPos.x = dampScalar(this.currentCamPos.x, _vecTargetPos.x, camLambda, camDt);
    this.currentCamPos.y = dampScalar(this.currentCamPos.y, _vecTargetPos.y, camLambda, camDt);
    this.currentCamPos.z = dampScalar(this.currentCamPos.z, _vecTargetPos.z, camLambda, camDt);

    this.currentCamLook.x = dampScalar(this.currentCamLook.x, _vecTargetLook.x, camLambda, camDt);
    this.currentCamLook.y = dampScalar(this.currentCamLook.y, _vecTargetLook.y, camLambda, camDt);
    this.currentCamLook.z = dampScalar(this.currentCamLook.z, _vecTargetLook.z, camLambda, camDt);

    this.currentFov = dampScalar(this.currentFov, targetFov, camLambda, camDt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.02) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentCamLook);

    // 4. Update directional sun light, hemisphere fill, atmospheric fog & exposure
    const [sx, sy, sz] = solar.sunDirection;
    _vecSunPos.set(sx * 38, sy * 38, sz * 38 - 4);
    this.sunLight.position.copy(_vecSunPos);
    this.sunLight.color.setRGB(solar.sunColor.r, solar.sunColor.g, solar.sunColor.b);
    this.sunLight.intensity = solar.sunIntensity;

    this.hemiLight.color.setRGB(solar.skyColor.r, solar.skyColor.g, solar.skyColor.b);
    this.hemiLight.groundColor.setRGB(
      solar.groundColor.r,
      solar.groundColor.g,
      solar.groundColor.b,
    );
    this.hemiLight.intensity = solar.hemiIntensity;

    const climaxEnergy = this.prismState.allAligned
      ? this.prismState.climaxProgress
      : Math.max(0, (this.prismState.bloomIntensity - 0.34) / 0.66);

    this.altarBounceLight.color.setRGB(solar.beamColor.r, solar.beamColor.g, solar.beamColor.b);
    this.altarBounceLight.intensity =
      (0.32 + solar.sunIntensity * 0.08 + this.prismState.bloomIntensity * 0.28 + climaxEnergy * 0.14) *
      (1 - solar.eclipseFactor * 0.45);

    this.fog.color.setRGB(solar.fogColor.r, solar.fogColor.g, solar.fogColor.b);
    this.fog.density = solar.fogDensity;
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.fog.color);
    }
    if (this.renderer) {
      // Subtle exposure lift strictly bounded to prevent pure-white highlight clipping during climax
      this.renderer.toneMappingExposure =
        solar.exposure + this.prismState.bloomIntensity * 0.022 + climaxEnergy * 0.015;
    }

    // 5. Sync shared uniforms, volumetric beam angle, true mirror pool ripples, haze, and prisms
    this.sharedUniforms.uTime.value = this.elapsedSec;
    this.sharedUniforms.uSunColor.value.setRGB(
      solar.sunColor.r,
      solar.sunColor.g,
      solar.sunColor.b,
    );
    this.sharedUniforms.uSunDir.value.set(sx, sy, sz).normalize();
    this.sharedUniforms.uEclipseFactor.value = solar.eclipseFactor;

    const rippleEnergy = computeActiveRippleEnergy(this.rippleBuffer, this.elapsedSec);
    this.sharedUniforms.uCausticIntensity.value =
      (0.55 + solar.sunIntensity * 0.16) * (1.0 + rippleEnergy * 0.8);
    this.sharedUniforms.uPrismBloom.value = this.prismState.bloomIntensity;
    this.sharedUniforms.uPrismAlignments.value.set(
      this.prismState.prisms[0].alignment,
      this.prismState.prisms[1].alignment,
      this.prismState.prisms[2].alignment,
    );

    const uniformRipples = this.sharedUniforms.uRipples.value;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const slot = this.rippleBuffer.slots[i];
      uniformRipples[i].set(slot.x, slot.z, slot.startTime, slot.strength);
    }

    if (this.rig) {
      // Sky aperture strip visible directly through the longitudinal oculus slit
      this.rig.skyStripMaterial.color.setRGB(
        Math.min(1, solar.skyColor.r * 1.1 + solar.sunColor.r * 0.58),
        Math.min(1, solar.skyColor.g * 1.1 + solar.sunColor.g * 0.58),
        Math.min(1, solar.skyColor.b * 1.1 + solar.sunColor.b * 0.58),
      );

      // True Reflector obsidian mirror pool atmosphere uniforms
      this.rig.waterMaterial.uniforms.uSkyColor.value.setRGB(
        solar.skyColor.r,
        solar.skyColor.g,
        solar.skyColor.b,
      );
      this.rig.waterMaterial.uniforms.uFogColor.value.copy(this.fog.color);
      this.rig.waterMaterial.uniforms.uFogDensity.value = this.fog.density;

      // Sync additive bounced-light water caustics fog density
      this.rig.stoneCausticsMaterial.uniforms.uFogDensity.value = this.fog.density;
      this.rig.bronzeCausticsMaterial.uniforms.uFogDensity.value = this.fog.density;

      // Subtle atmospheric floor mist & oculus halo haze (gently swells during 3/3 climax)
      this.rig.floorHazeMaterial.uniforms.uTime.value = this.elapsedSec;
      this.rig.floorHazeMaterial.uniforms.uHazeColor.value.setRGB(
        solar.beamColor.r * 0.45 + solar.fogColor.r * 1.4,
        solar.beamColor.g * 0.45 + solar.fogColor.g * 1.4,
        solar.beamColor.b * 0.45 + solar.fogColor.b * 1.4,
      );
      this.rig.floorHazeMaterial.uniforms.uOpacity.value =
        0.085 + (1 - solar.eclipseFactor) * 0.035 + climaxEnergy * 0.055;

      this.rig.oculusHazeMaterial.uniforms.uTime.value = this.elapsedSec;
      this.rig.oculusHazeMaterial.uniforms.uHazeColor.value.setRGB(
        solar.beamColor.r,
        solar.beamColor.g,
        solar.beamColor.b,
      );
      this.rig.oculusHazeMaterial.uniforms.uOpacity.value =
        0.13 + solar.beamOpacity * 0.16 + climaxEnergy * 0.06;

      // Tilt volumetric light shafts directly with incoming solar ray vector
      const tiltZ = Math.atan2(sx, Math.max(0.32, sy)) * 0.78;
      const tiltX = -Math.atan2(sz, Math.max(0.32, sy)) * 0.42;
      _vecBeamTiltAxis.set(tiltX, 0, tiltZ);
      this.rig.beamPivot.rotation.set(_vecBeamTiltAxis.x, 0, _vecBeamTiltAxis.z);
      this.rig.beamMaterial.uniforms.uTime.value = this.elapsedSec;
      this.rig.beamMaterial.uniforms.uBeamColor.value.setRGB(
        solar.beamColor.r,
        solar.beamColor.g,
        solar.beamColor.b,
      );
      this.rig.beamMaterial.uniforms.uResonance.value = climaxEnergy;
      this.rig.beamMaterial.uniforms.uOpacity.value =
        solar.beamOpacity + this.prismState.bloomIntensity * 0.11 + climaxEnergy * 0.16;
      this.rig.beamMaterial.uniforms.uFogColor.value.copy(this.fog.color);
      this.rig.beamMaterial.uniforms.uFogDensity.value = this.fog.density;

      // Nave-wide ethereal dispersion washes blooming across concrete walls during 3/3 climax
      const naveBloom = Math.max(0, climaxEnergy);
      const showNaveWashes = naveBloom > 0.015;
      this.rig.naveClimaxRibbonMaterial.uniforms.uTime.value = this.elapsedSec;
      this.rig.naveClimaxRibbonMaterial.uniforms.uIntensity.value = naveBloom * 0.72;
      this.rig.naveClimaxRibbonMaterial.uniforms.uBloom.value = naveBloom * 0.95;
      this.rig.naveClimaxRibbonMaterial.uniforms.uSunColor.value.setRGB(
        solar.sunColor.r,
        solar.sunColor.g,
        solar.sunColor.b,
      );
      for (let k = 0; k < this.rig.naveClimaxRibbons.length; k++) {
        const wash = this.rig.naveClimaxRibbons[k];
        wash.visible = showNaveWashes;
        if (showNaveWashes) {
          const s = 0.82 + naveBloom * 0.34;
          wash.scale.set(s, 0.88 + naveBloom * 0.24, 1);
        }
      }

      // Update the three suspended beveled crystal monoliths & chromatic spectral ribbons
      const beamSweepX = -(sx / Math.max(0.35, sy)) * 6.5;
      for (let i = 0; i < this.rig.prisms.length; i++) {
        const asm = this.rig.prisms[i];
        const body = this.prismState.prisms[i];

        // Gentle architectural pendulum float + physical rotational inertia
        const bob = Math.sin(this.elapsedSec * 0.72 + i * 2.1) * 0.065;
        asm.group.position.y = asm.anchorPosition.y + bob;
        asm.group.rotation.y = body.angle;
        asm.group.rotation.z = Math.sin(this.elapsedSec * 0.42 + i * 1.4) * 0.015;

        // Crystal shader uniforms
        asm.crystalMaterial.uniforms.uTime.value = this.elapsedSec;
        asm.crystalMaterial.uniforms.uSunDir.value.set(sx, sy, sz).normalize();
        asm.crystalMaterial.uniforms.uSunColor.value.setRGB(
          solar.sunColor.r,
          solar.sunColor.g,
          solar.sunColor.b,
        );
        asm.crystalMaterial.uniforms.uSkyColor.value.setRGB(
          solar.skyColor.r,
          solar.skyColor.g,
          solar.skyColor.b,
        );
        asm.crystalMaterial.uniforms.uAlignment.value = body.alignment;
        asm.crystalMaterial.uniforms.uBloom.value = this.prismState.bloomIntensity;

        // Projected chromatic spectral ribbons sweep across the altar steps and rear travertine wall
        const angleSweep = Math.sin(body.angle * 2.0) * 1.65;
        const ribbonIntensity =
          body.alignment * (0.54 + solar.sunIntensity * 0.10) + climaxEnergy * 0.18;
        asm.ribbonMaterial.uniforms.uTime.value = this.elapsedSec;
        asm.ribbonMaterial.uniforms.uIntensity.value = ribbonIntensity;
        asm.ribbonMaterial.uniforms.uBloom.value = this.prismState.bloomIntensity * 0.85;
        asm.ribbonMaterial.uniforms.uSunColor.value.setRGB(
          solar.sunColor.r,
          solar.sunColor.g,
          solar.sunColor.b,
        );

        asm.floorRibbon.position.x = asm.anchorPosition.x * 1.4 + beamSweepX * 0.55 + angleSweep;
        asm.floorRibbon.rotation.z = angleSweep * 0.08 + beamSweepX * 0.04;
        asm.floorRibbon.scale.set(
          0.72 + body.alignment * 0.55 + this.prismState.bloomIntensity * 0.45 + climaxEnergy * 0.35,
          1,
          0.85 + body.alignment * 0.35 + climaxEnergy * 0.3,
        );

        asm.wallRibbon.position.x = asm.anchorPosition.x * 2.1 + beamSweepX * 0.95 + angleSweep * 1.3;
        asm.wallRibbon.position.y = 4.6 + i * 1.25 - (sy - 0.6) * 2.2;
        asm.wallRibbon.rotation.z = (i - 1) * 0.18 + angleSweep * 0.09;
        asm.wallRibbon.scale.set(
          0.75 + body.alignment * 0.65 + this.prismState.bloomIntensity * 0.6 + climaxEnergy * 0.45,
          0.8 + body.alignment * 0.4 + this.prismState.bloomIntensity * 0.35 + climaxEnergy * 0.25,
          1,
        );
      }
    }

    // 6. Update procedural cathedral audio atmosphere
    this.audio.updateAtmosphere(
      solar.altitudeDeg,
      solar.eclipseFactor,
      [
        this.prismState.prisms[0].alignment,
        this.prismState.prisms[1].alignment,
        this.prismState.prisms[2].alignment,
      ],
      climaxEnergy,
    );
  }

  private pushHudSnapshot(force: boolean): void {
    if (!force && this.elapsedSec - this.lastHudPushSec < 0.12) return;
    this.lastHudPushSec = this.elapsedSec;
    const solar = evaluateSolarState(this.solarProgress);

    this.callbacks.onHudUpdate({
      chapter: this.chapter,
      solarProgress: this.solarProgress,
      altitudeDeg: solar.altitudeDeg,
      azimuthDeg: solar.azimuthDeg,
      telemetryText: solar.telemetryText,
      phase: solar.phase,
      alignedPrisms: this.prismState.alignedCount,
      allPrismsAligned: this.prismState.allAligned,
      resonanceClimax: this.prismState.climaxActive,
      climaxProgress: this.prismState.climaxProgress,
      rippleCount: this.rippleBuffer.totalSpawned,
      grainDataUrl: this.grainDataUrl,
      webglError: null,
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.stopLoop();

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);

    if (this.renderer) {
      const dom = this.renderer.domElement;
      dom.removeEventListener('pointerdown', this.handlePointerDown);
      dom.removeEventListener('webglcontextlost', this.handleContextLost);
      dom.removeEventListener('webglcontextrestored', this.handleContextRestored);
      if (dom.parentElement === this.container) {
        this.container.removeChild(dom);
      }
    }

    if (this.rig) {
      this.rig.disposeReflector();
      this.rig.disposables.geometries.forEach((g) => g.dispose());
      this.rig.disposables.materials.forEach((m) => m.dispose());
      this.scene.remove(this.rig.root);
      this.rig = null;
    }

    this.textures?.dispose();
    this.envTexture?.dispose();
    this.audio.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
