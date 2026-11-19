import * as THREE from 'three';
import { MAX_RIPPLES } from './rippleBuffer';

export interface SharedCausticUniforms {
  uTime: { value: number };
  uSunColor: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uCausticIntensity: { value: number };
  uRipples: { value: THREE.Vector4[] };
  uPrismBloom: { value: number };
  uPrismAlignments: { value: THREE.Vector3 };
  uEclipseFactor: { value: number };
}

export function createSharedCausticUniforms(): SharedCausticUniforms {
  const ripples: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_RIPPLES; i++) {
    ripples.push(new THREE.Vector4(0, 0, -999, 0));
  }
  return {
    uTime: { value: 0 },
    uSunColor: { value: new THREE.Color(0xfff1dc) },
    uSunDir: { value: new THREE.Vector3(0.25, 0.9, 0.15).normalize() },
    uCausticIntensity: { value: 0.55 },
    uRipples: { value: ripples },
    uPrismBloom: { value: 0 },
    uPrismAlignments: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
    uEclipseFactor: { value: 0 },
  };
}

/**
 * Enhances architectural PBR materials (travertine concrete walls, fluted columns,
 * bronze column collars, wet basalt plinths, stepped altar) with dramatic
 * Villeneuve / Tadao Ando Oculus Chiaroscuro — plunging outer concrete walls
 * and unlit column faces into deep charcoal / nocturnal indigo-black shadow while
 * letting the directional Oculus sunbeam and sky slit carve luminous highlights.
 * (Bounced water caustics are rendered in a dedicated THREE.AdditiveBlending pass.)
 */
export function attachStoneCausticsShader(
  material: THREE.MeshStandardMaterial,
  shared: SharedCausticUniforms,
  options?: { isBronze?: boolean },
): void {
  const isBronze = options?.isBronze === true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uEclipseFactor = shared.uEclipseFactor;

    shader.vertexShader =
      `
      varying vec3 vCausticWorldPos;
      varying vec3 vCausticWorldNormal;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      #include <project_vertex>
      vCausticWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vCausticWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `,
    );

    shader.fragmentShader =
      `
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uEclipseFactor;
      varying vec3 vCausticWorldPos;
      varying vec3 vCausticWorldNormal;
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      {
        vec3 sunDirN = normalize(uSunDir);
        vec3 nW = normalize(vCausticWorldNormal);
        float dyRoof = max(0.0, 18.2 - vCausticWorldPos.y);
        float roofHitX = vCausticWorldPos.x + (sunDirN.x / max(sunDirN.y, 0.28)) * dyRoof;
        float roofHitZ = vCausticWorldPos.z + (sunDirN.z / max(sunDirN.y, 0.28)) * dyRoof;

        // Sharp architectural oculus slit aperture projected along solar vector
        float inSlitX = smoothstep(2.85, 1.05, abs(roofHitX));
        float inSlitZ = smoothstep(21.0, 15.5, abs(roofHitZ + 3.5));
        float ribShadow = smoothstep(0.06, 0.17, abs(fract((roofHitZ + 20.5) / 5.5) - 0.5));
        float ndotl = dot(nW, sunDirN);
        float sunFacing = smoothstep(-0.12, 0.38, ndotl);
        float oculusLightMask = inSlitX * inSlitZ * mix(0.26, 1.0, ribShadow) * sunFacing;

        // Lateral gallery shadow dropoff: outer walls & unlit column backs plunge into deep charcoal gloom
        float naveCoreFalloff = smoothstep(11.4, 3.8, abs(vCausticWorldPos.x));
        float ceilingApertureGlow = smoothstep(13.8, 18.2, vCausticWorldPos.y) * smoothstep(3.9, 1.0, abs(vCausticWorldPos.x)) * 0.58;

        // Deep Villeneuve chiaroscuro shadow floor (and haunting nocturnal indigo during Silver Lunar Eclipse)
        float shadowFloor = mix(${isBronze ? '0.20' : '0.078'}, ${isBronze ? '0.09' : '0.028'}, uEclipseFactor);
        float galleryBounce = naveCoreFalloff * mix(0.11, 0.032, uEclipseFactor);
        float chiaroscuro = mix(shadowFloor + galleryBounce, 1.06, clamp(oculusLightMask + ceilingApertureGlow, 0.0, 1.0));
        outgoingLight *= chiaroscuro;

        // Subtle nocturnal indigo-black atmospheric fill on unlit stone during Silver Lunar Eclipse
        vec3 nocturnalTint = vec3(0.006, 0.011, 0.026) * uEclipseFactor * (1.0 - oculusLightMask);
        outgoingLight += nocturnalTint;

        // Controlled grazing highlight inside direct oculus blade (soft-toned to prevent pure white clipping)
        outgoingLight += uSunColor * oculusLightMask * ${isBronze ? '0.16' : '0.095'};
      }
      #include <opaque_fragment>
      `,
    );
  };
  material.customProgramCacheKey = () =>
    isBronze ? 'solstice-bronze-chiaroscuro-v6' : 'solstice-stone-chiaroscuro-v6';
}

/**
 * Dedicated THREE.AdditiveBlending bounced water-caustics shader projected onto
 * the lower stone plinths, bronze column collars, lower fluted shafts, walls, and
 * altar steps. Soft vertical falloff and ~35% reduced opacity ensure it reads as
 * delicate light bounced off the obsidian pool rather than a painted pattern.
 */
export function createAdditiveCausticsMaterial(
  shared: SharedCausticUniforms,
  options?: { isBronze?: boolean },
): THREE.ShaderMaterial {
  const isBronze = options?.isBronze === true;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uSunColor: shared.uSunColor,
      uSunDir: shared.uSunDir,
      uCausticIntensity: shared.uCausticIntensity,
      uRipples: shared.uRipples,
      uPrismBloom: shared.uPrismBloom,
      uEclipseFactor: shared.uEclipseFactor,
      uFogColor: { value: new THREE.Color(0x090808) },
      uFogDensity: { value: 0.024 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec4 localPos = vec4(position, 1.0);
        vec3 localNormal = normal;
        #ifdef USE_INSTANCING
          localPos = instanceMatrix * localPos;
          localNormal = mat3(instanceMatrix) * localNormal;
        #endif
        vec4 wp = modelMatrix * localPos;
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uCausticIntensity;
      uniform vec4 uRipples[${MAX_RIPPLES}];
      uniform float uPrismBloom;
      uniform float uEclipseFactor;
      uniform float uFogDensity;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      float causticWeb(vec2 p, float t) {
        vec2 p1 = p * 2.15 + vec2(t * 0.26, -t * 0.21);
        vec2 p2 = p * 2.60 + vec2(-t * 0.22, t * 0.28);
        float w1 = sin(p1.x + sin(p1.y * 1.62 + t * 0.68));
        float w2 = sin(p2.y + cos(p2.x * 1.52 - t * 0.56));
        float w3 = sin((p1.x - p2.y) * 1.18 + t * 0.52);
        float net = abs(w1 + w2 + w3 * 0.7) / 2.7;
        float crisp = pow(clamp(1.0 - net, 0.0, 1.0), 5.6);
        float softHalo = pow(clamp(1.0 - net, 0.0, 1.0), 2.4) * 0.14;
        return crisp + softHalo;
      }

      void main() {
        // Silky, soft vertical falloff from water surface upward into cathedral darkness
        float topFade = pow(smoothstep(${isBronze ? '1.85' : '3.25'}, 0.04, vWorldPos.y), 1.85);
        float waterLineFade = smoothstep(-0.04, 0.14, vWorldPos.y);
        float heightFade = topFade * waterLineFade;
        if (heightFade < 0.002) discard;

        float rippleBoost = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 rp = uRipples[i];
          float age = uTime - rp.z;
          if (age > 0.0 && age < 7.5 && rp.w > 0.01) {
            float d = length(vWorldPos.xz - rp.xy);
            float front = age * 2.75;
            float band = exp(-pow(d - front, 2.0) * 0.20);
            float env = exp(-age * 0.50) * (1.0 / (1.0 + d * 0.13));
            rippleBoost += (0.26 + 1.15 * band) * env * rp.w;
          }
        }
        rippleBoost = clamp(rippleBoost, 0.0, 1.35);

        vec2 projCoord = vec2(
          vWorldPos.x * 0.92 + vWorldPos.z * 0.76,
          vWorldPos.y * 1.30 - vWorldPos.z * 0.40
        );
        float cA = causticWeb(projCoord, uTime * 1.0 + rippleBoost * 0.32);
        float cB = causticWeb(projCoord * 1.44 + vec2(3.1, -1.7), -uTime * 0.82);
        float caustic = cA * 0.62 + cB * 0.48;

        vec3 nW = normalize(vWorldNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        // Emphasize vertical faces & softly taper horizontal plinth tops so it reads as bounced light
        float verticalWeight = 0.16 + 0.84 * (1.0 - abs(nW.y));
        float facingFade = smoothstep(0.04, 0.34, abs(dot(nW, viewDir)));
        // Gentle attenuation toward far corners & nocturnal eclipse
        float naveLightEnvelope = mix(0.68, 1.0, smoothstep(11.5, 4.2, abs(vWorldPos.x)));
        float eclipseAtten = mix(1.0, 0.72, uEclipseFactor);

        // ~35% softer opacity than prior opaque injection for airy bounced-light realism
        float baseScale = ${isBronze ? '1.18' : '0.52'};
        float baseEmphasis = 0.42 + 0.58 * smoothstep(2.1, 0.10, vWorldPos.y);
        float strength = (0.042 + rippleBoost * 0.22) * uCausticIntensity * heightFade * verticalWeight * facingFade * baseScale * baseEmphasis * naveLightEnvelope * eclipseAtten;

        // Match exponential cathedral fog so distant caustics dissolve naturally
        float camDist = length(cameraPosition - vWorldPos);
        float fogAtten = exp(-pow(camDist * uFogDensity * 0.88, 2.0));
        float alpha = clamp(caustic * strength * fogAtten, 0.0, ${isBronze ? '0.28' : '0.24'});
        if (alpha < 0.002) discard;

        // Whisper-subtle prismatic tint absorbed into bounced water light during 3/3 climax
        vec3 bounceTint = mix(
          uSunColor,
          mix(uSunColor, vec3(0.94, 0.86, 0.99), 0.3 + 0.25 * sin(vWorldPos.z * 0.35 + uTime * 0.4)),
          uPrismBloom * 0.55
        );
        // Pure RGB with alpha for THREE.AdditiveBlending (avoids double-multiplying alpha)
        gl_FragColor = vec4(bounceTint, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/**
 * Custom GLSL volumetric light shaft descending from the longitudinal roof oculus.
 * Softened Fresnel falloff prevents pure-white clipping while revealing slow 3D air drift.
 */
export function createVolumetricBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBeamColor: { value: new THREE.Color(0xfff1dc) },
      uOpacity: { value: 0.3 },
      uResonance: { value: 0.0 },
      uFogColor: { value: new THREE.Color(0x090808) },
      uFogDensity: { value: 0.024 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uBeamColor;
      uniform float uOpacity;
      uniform float uResonance;
      uniform vec3 uFogColor;
      uniform float uFogDensity;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z);
      }

      float fbm3D(vec3 p) {
        float val = 0.0;
        float amp = 0.55;
        for (int i = 0; i < 3; i++) {
          val += noise3D(p) * amp;
          p = p * 2.04 + vec3(1.7, -0.9, 2.3);
          amp *= 0.48;
        }
        return val;
      }

      vec3 etherealPrismSheen(float t) {
        vec3 warm = vec3(0.96, 0.68, 0.36);
        vec3 pearl = vec3(0.92, 0.88, 0.72);
        vec3 aqua = vec3(0.52, 0.80, 0.78);
        vec3 violet = vec3(0.62, 0.54, 0.88);
        float s = clamp(t, 0.0, 1.0) * 3.0;
        if (s < 1.0) return mix(warm, pearl, s);
        if (s < 2.0) return mix(pearl, aqua, s - 1.0);
        return mix(aqua, violet, s - 2.0);
      }

      void main() {
        // Wide, silky edge feathering across beam curtain width
        float edgeX = smoothstep(0.0, 0.34, vUv.x) * smoothstep(1.0, 0.66, vUv.x);
        // Smooth vertical gradient: luminous at the oculus slit, gently diffusing toward floor
        float verticalGrad = smoothstep(0.0, 0.22, vUv.y) * mix(0.20, 0.92, pow(vUv.y, 1.65));

        // Generous colonnade clearance fade so beams never hard-clip columns
        float colonnadeClearance = smoothstep(5.35, 3.25, abs(vWorldPos.x));
        float floorClearance = smoothstep(-0.1, 0.6, vWorldPos.y);

        // Softened Fresnel angle falloff (prevents harsh grazing planes or white clipping)
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndotv = abs(dot(normalize(vWorldNormal), viewDir));
        float viewFade = pow(smoothstep(0.08, 0.72, ndotv), 1.35);

        // Slow heavy cathedral air convection inside the sunbeam
        vec3 driftPos = vWorldPos * vec3(0.15, 0.11, 0.13) + vec3(uTime * 0.02, -uTime * 0.036, uTime * 0.015);
        float airDrift = fbm3D(driftPos);
        float striations = 0.76 + 0.24 * sin(vUv.x * 14.0 + airDrift * 2.8);
        float airDensity = mix(0.54, 1.12, airDrift) * striations;

        float camDist = length(cameraPosition - vWorldPos);
        float nearFade = smoothstep(1.8, 5.8, camDist);
        float distFog = exp(-pow(camDist * uFogDensity * 0.78, 2.0));

        float alpha = edgeX * verticalGrad * colonnadeClearance * floorClearance * viewFade * airDensity * nearFade * distFog * uOpacity;
        if (alpha < 0.002) discard;

        vec3 baseCol = mix(uFogColor, uBeamColor, 0.92);
        // During 3/3 resonance climax, weave a radiant ethereal prismatic sheen into the volumetric shaft
        float sheenCoord = clamp(vUv.x * 0.72 + (1.0 - vUv.y) * 0.28 + (airDrift - 0.5) * 0.25, 0.0, 1.0);
        vec3 climaxTint = etherealPrismSheen(sheenCoord);
        vec3 col = mix(baseCol, climaxTint, uResonance * 0.58) * (0.72 + 0.28 * pow(vUv.y, 1.8));
        // Soft highlight shoulder compression prevents pure-white clipping during climax swell
        float peak = max(col.r, max(col.g, col.b));
        col /= (1.0 + peak * (0.14 + uResonance * 0.28));

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.38 + uResonance * 0.11));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Subtle architectural atmospheric haze sheet hovering near the floor and oculus slit
 * to heighten monumental scale and chiaroscuro depth (no particle clouds).
 */
export function createAtmosphericHazeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHazeColor: { value: new THREE.Color(0x9f9282) },
      uOpacity: { value: 0.14 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uHazeColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        float xFade = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
        float yFade = smoothstep(0.0, 0.38, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        float drift = noise2D(vWorldPos.xz * 0.16 + vec2(uTime * 0.03, -uTime * 0.02)) * 0.65
                    + noise2D(vWorldPos.xz * 0.34 - vec2(uTime * 0.02, uTime * 0.025)) * 0.35;
        float camDist = length(cameraPosition - vWorldPos);
        float nearFade = smoothstep(2.5, 8.5, camDist);

        float alpha = xFade * yFade * mix(0.55, 1.15, drift) * nearFade * uOpacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uHazeColor, clamp(alpha, 0.0, 0.24));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Custom shader definition for THREE.Reflector — blends a TRUE planar mirror pass
 * (`tDiffuse` via `textureMatrix`) of the fluted columns, oculus slit, hanging crystal
 * prisms, and refracted chromatic bands underneath the 12-ripple Obsidian Water Shader!
 * Every ripple physically warps the live mirrored reflection and catches razor-sharp
 * specular crest highlights.
 */
export function createObsidianReflectorShader(shared: SharedCausticUniforms) {
  return {
    name: 'ObsidianMirrorPoolShader',
    uniforms: {
      color: { value: new THREE.Color(0x090909) },
      tDiffuse: { value: null as THREE.Texture | null },
      textureMatrix: { value: new THREE.Matrix4() },
      uTime: shared.uTime,
      uSunColor: shared.uSunColor,
      uSunDir: shared.uSunDir,
      uSkyColor: { value: new THREE.Color(0x667788) },
      uFogColor: { value: new THREE.Color(0x090808) },
      uFogDensity: { value: 0.024 },
      uRipples: shared.uRipples,
      uPrismBloom: shared.uPrismBloom,
      uPrismAlignments: shared.uPrismAlignments,
    },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vMirrorUv;
      varying vec3 vWorldPos;

      void main() {
        vMirrorUv = textureMatrix * vec4(position, 1.0);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform vec3 uSkyColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec4 uRipples[${MAX_RIPPLES}];
      uniform float uPrismBloom;
      uniform vec3 uPrismAlignments;

      varying vec4 vMirrorUv;
      varying vec3 vWorldPos;

      void main() {
        vec2 p = vWorldPos.xz;

        // Micro-stillness ambient surface tension
        float dx = cos(p.x * 0.85 + uTime * 0.42) * 0.003 + sin(p.y * 0.72 - uTime * 0.3) * 0.0025;
        float dz = sin(p.y * 0.8 + uTime * 0.36) * 0.003 + cos(p.x * 0.64 + uTime * 0.26) * 0.0025;
        float rippleEnergy = 0.0;
        float rippleCrest = 0.0;
        float rippleEdge = 0.0;

        // Evaluate 12 physically damped circular ripples & analytical slopes
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 rp = uRipples[i];
          float age = uTime - rp.z;
          if (age > 0.0 && age < 7.5 && rp.w > 0.01) {
            vec2 delta = p - rp.xy;
            float dist = length(delta) + 0.0001;
            float waveFront = age * 2.75;
            float diff = dist - waveFront;

            float packet = exp(-diff * diff * 0.56) * exp(-age * 0.44) * (1.0 / (1.0 + dist * 0.11));
            float phase = dist * 5.0 - age * 9.2;
            float slope = cos(phase) * packet * rp.w * 0.46;

            vec2 dir = delta / dist;
            dx += dir.x * slope;
            dz += dir.y * slope;

            float waveAbs = abs(sin(phase));
            rippleEnergy += waveAbs * packet * rp.w;
            rippleCrest += pow(max(0.0, sin(phase)), 2.2) * packet * rp.w;
            rippleEdge += pow(max(0.0, abs(cos(phase))), 3.5) * packet * rp.w;
          }
        }

        vec3 N = normalize(vec3(-dx, 1.0, -dz));
        vec3 V = normalize(cameraPosition - vWorldPos);

        // Schlick Fresnel calibrated for deep obsidian architectural mirror water
        float ndotv = max(dot(N, V), 0.0);
        float fresnel = 0.24 + 0.74 * pow(1.0 - ndotv, 2.8);

        // Dynamically warp the TRUE planar mirror reflection UVs using ripple slopes!
        vec4 warpedUv = vMirrorUv;
        float distWarpScale = 0.68 * max(warpedUv.w, 0.25);
        warpedUv.x += dx * distWarpScale;
        warpedUv.y += dz * distWarpScale;

        // Subtle chromatic edge dispersion across strong ripple crests on the reflected image
        vec4 refCenter = texture2DProj(tDiffuse, warpedUv);
        vec3 mirrorSample = refCenter.rgb;
        if (rippleEnergy > 0.03) {
          vec4 uvR = warpedUv;
          vec4 uvB = warpedUv;
          uvR.x += dx * 0.055 * max(warpedUv.w, 0.25);
          uvB.x -= dx * 0.055 * max(warpedUv.w, 0.25);
          mirrorSample = vec3(
            texture2DProj(tDiffuse, uvR).r,
            refCenter.g,
            texture2DProj(tDiffuse, uvB).b
          );
        }

        // Deep volcanic obsidian water bed absorbing ~26% of mirror light for moody luxury contrast
        vec3 obsidianBase = color * 0.4 + vec3(0.004, 0.004, 0.005);
        vec3 reflectedColor = mirrorSample * mix(0.72, 0.98, fresnel);
        vec3 finalColor = mix(obsidianBase, reflectedColor, fresnel);

        // Direct solar beam footprint onto the obsidian water surface
        float beamOffsetX = -(uSunDir.x / max(uSunDir.y, 0.28)) * 17.8;
        float beamOffsetZ = -(uSunDir.z / max(uSunDir.y, 0.28)) * 17.8;
        float onBeamX = smoothstep(2.9, 0.55, abs(p.x - beamOffsetX));
        float onBeamZ = smoothstep(19.5, 11.5, abs((p.y - beamOffsetZ) + 3.5));
        float directSunStrip = onBeamX * onBeamZ;

        // Razor-sharp solar specular glints along perturbed ripple rings
        vec3 L = normalize(uSunDir);
        vec3 H = normalize(L + V);
        float specSharp = pow(max(dot(N, H), 0.0), 190.0) * (0.55 + 1.35 * directSunStrip);
        float specBroad = pow(max(dot(N, H), 0.0), 28.0) * 0.18 * (0.4 + 0.6 * directSunStrip);

        // Crisp sculptural specular rim along expanding ripple crests
        float crestSpecular = clamp(rippleCrest, 0.0, 1.8) * (0.58 + 0.85 * directSunStrip)
                            + clamp(rippleEdge, 0.0, 1.6) * 0.36;

        finalColor += uSunColor * (specSharp * 1.55 + specBroad + crestSpecular * 0.62);
        finalColor += uSkyColor * clamp(rippleEdge, 0.0, 1.4) * 0.22;

        // Subtle underwater caustic filigree inside the direct oculus sun strip
        float floorCaustic = sin(p.x * 3.0 + dx * 28.0 + uTime * 0.95) * cos(p.y * 2.5 + dz * 28.0 - uTime * 0.75);
        floorCaustic = pow(max(0.0, floorCaustic), 3.4);
        finalColor += uSunColor * floorCaustic * directSunStrip * (0.045 + clamp(rippleEnergy, 0.0, 1.0) * 0.18);

        // Ethereal unified prismatic sheen gliding across the obsidian mirror pool during 3/3 resonance climax
        if (uPrismBloom > 0.02) {
          float poolBandX = exp(-pow(p.x / 6.2, 2.0));
          float poolBandZ = exp(-pow((p.y + 6.5) / 14.5, 2.0));
          float specPhase = clamp((p.x + 5.6) / 11.2 + dx * 1.4, 0.0, 1.0);
          vec3 p0 = vec3(0.92, 0.36, 0.22);
          vec3 p1 = vec3(0.95, 0.80, 0.44);
          vec3 p2 = vec3(0.38, 0.78, 0.68);
          vec3 p3 = vec3(0.42, 0.56, 0.90);
          vec3 p4 = vec3(0.58, 0.42, 0.82);
          float s = specPhase * 4.0;
          vec3 poolSpec = s < 1.0 ? mix(p0, p1, s)
            : s < 2.0 ? mix(p1, p2, s - 1.0)
            : s < 3.0 ? mix(p2, p3, s - 2.0)
            : mix(p3, p4, s - 3.0);
          float bloomSheen = poolBandX * poolBandZ * uPrismBloom * (0.15 + 0.09 * fresnel);
          finalColor += poolSpec * bloomSheen;
        }

        // Exponential atmospheric depth fog matching scene.fog (FogExp2)
        float camDist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-pow(camDist * uFogDensity, 2.0));
        finalColor = mix(finalColor, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  };
}

/**
 * Custom GLSL flat-faceted lead-crystal transmission + Fresnel + chromatic dispersion
 * shader for the three suspended beveled crystal monoliths.
 */
export function createPrismCrystalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.25, 0.9, 0.15).normalize() },
      uSunColor: { value: new THREE.Color(0xfff1dc) },
      uSkyColor: { value: new THREE.Color(0x8899aa) },
      uAlignment: { value: 0.2 },
      uBloom: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;

      void main() {
        vLocalPos = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform float uAlignment;
      uniform float uBloom;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;

      vec3 opticalGlassSpectrum(float t) {
        // Refined museum-glass dispersion (warm ochre-crimson -> pale gold -> seafoam -> slate-azure -> soft violet)
        vec3 r = vec3(0.92, 0.32, 0.22);
        vec3 y = vec3(0.98, 0.80, 0.42);
        vec3 g = vec3(0.36, 0.78, 0.62);
        vec3 b = vec3(0.34, 0.60, 0.92);
        vec3 v = vec3(0.56, 0.42, 0.84);

        float s = clamp(t, 0.0, 1.0) * 4.0;
        if (s < 1.0) return mix(r, y, s);
        if (s < 2.0) return mix(y, g, s - 1.0);
        if (s < 3.0) return mix(g, b, s - 2.0);
        return mix(b, v, s - 3.0);
      }

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);

        float ndotv = abs(dot(N, V));
        float fresnel = pow(1.0 - ndotv, 2.5);

        vec3 H = normalize(L + V);
        float specSharp = pow(max(abs(dot(N, H)), 0.0), 190.0);
        float specFacet = pow(max(abs(dot(N, H)), 0.0), 32.0);
        float sunCatch = pow(max(dot(N, L) * 0.5 + 0.5, 0.0), 2.4);

        vec3 refracted = refract(-V, N, 0.64);
        float dispCoord = fract(dot(refracted, L) * 1.05 + vLocalPos.y * 0.24 + dot(N, vec3(0.7, 0.2, -0.5)) * 0.4);
        vec3 chroma = opticalGlassSpectrum(dispCoord);

        // Deep smoky optical quartz interior contrasted against luminous cut-glass edges
        vec3 interior = mix(vec3(0.04, 0.045, 0.055), uSkyColor * 0.45, 0.35 + 0.38 * sunCatch);
        vec3 sunCore = uSunColor * (0.32 + 0.68 * uAlignment + 0.48 * uBloom);

        float dispersionWeight = (0.22 + 0.85 * fresnel) * (0.38 + 0.76 * uAlignment + 0.48 * uBloom);
        vec3 color = interior + sunCore * (0.20 + 0.62 * specFacet) + chroma * dispersionWeight;

        // Crisp controlled crystal edge glint (luminous cut glass catching the oculus shaft)
        color += mix(uSunColor, vec3(1.0), 0.52) * (specSharp * 2.1 + fresnel * (0.58 + 0.52 * uAlignment));

        float alpha = clamp(0.28 + fresnel * 0.62 + specSharp * 0.46 + uAlignment * 0.16, 0.26, 0.94);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Projected soft, wide, translucent optical dispersion bands — like real sunlight
 * refracted through thick museum crystal onto rough poured travertine concrete
 * (organic stone modulation, soft Gaussian falloff, never an opaque neon rainbow).
 */
export function createSpectralRibbonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.3 },
      uBloom: { value: 0.0 },
      uSunColor: { value: new THREE.Color(0xfff1dc) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uBloom;
      uniform vec3 uSunColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.5);
        return fract(p.x * p.y);
      }

      float stoneGrain(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      vec3 naturalSunlightSpectrum(float x) {
        // Real thick-glass solar dispersion: warm sienna-red -> amber -> warm ivory -> pale sage -> mist azure -> muted violet
        vec3 c0 = vec3(0.92, 0.28, 0.16);
        vec3 c1 = vec3(0.98, 0.62, 0.24);
        vec3 c2 = vec3(0.98, 0.90, 0.56);
        vec3 c3 = vec3(0.42, 0.80, 0.64);
        vec3 c4 = vec3(0.32, 0.58, 0.90);
        vec3 c5 = vec3(0.50, 0.36, 0.78);

        float s = clamp(x, 0.0, 1.0) * 5.0;
        if (s < 1.0) return mix(c0, c1, s);
        if (s < 2.0) return mix(c1, c2, s - 1.0);
        if (s < 3.0) return mix(c2, c3, s - 2.0);
        if (s < 4.0) return mix(c3, c4, s - 3.0);
        return mix(c4, c5, s - 4.0);
      }

      void main() {
        // Soft Gaussian optical fan across width & length (no hard rectangular plane edges)
        float dx = (vUv.x - 0.5) * 2.0;
        float dy = (vUv.y - 0.5) * 2.0;
        float widthMask = exp(-dx * dx * 2.6) * smoothstep(1.0, 0.68, abs(dx));
        float lengthMask = exp(-dy * dy * 1.9) * smoothstep(1.0, 0.65, abs(dy));

        // Subtle rough travertine stone absorption texture so light feels cast ONTO stone
        float roughStone = 0.78 + 0.22 * stoneGrain(vWorldPos.xz * 2.8 + vWorldPos.xy * 1.9);
        float opticalDrift = 0.92 + 0.08 * sin(vUv.y * 8.0 - uTime * 0.7 + vUv.x * 4.0);

        // Soft warm white solar core blending outward into dispersed chromatic edges
        vec3 spec = naturalSunlightSpectrum(vUv.x);
        float coreBlend = exp(-dx * dx * 6.5) * 0.20;
        vec3 lightColor = mix(spec, uSunColor * 1.02, 0.24 + coreBlend);

        float alpha = widthMask * lengthMask * roughStone * opticalDrift * (0.08 + uIntensity * 0.38 + uBloom * 0.36);
        if (alpha < 0.003) discard;

        // Soft Reinhard shoulder keeps overlapping additive ribbons luminous & ethereal without clipping to pure white
        vec3 col = lightColor * (0.88 + uBloom * 0.44);
        float peak = max(col.r, max(col.g, col.b));
        col /= (1.0 + peak * (0.18 + uBloom * 0.30));

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.52 + uBloom * 0.10));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
