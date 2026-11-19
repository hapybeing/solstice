# SOLSTICE — An Architecture of Light

### Live Experience: [https://solstice-azure.vercel.app/](https://solstice-azure.vercel.app/)

A museum-grade, interactive 3D WebGL architectural sanctuary inspired by Tadao Ando’s concrete cathedrals, James Turrell’s light spaces, and minimalist monolithic chiaroscuro.

Built with **pure Three.js**, custom GLSL shaders, procedural HTML5 Canvas PBR textures, and generative **Web Audio API** cathedral acoustics—with zero external textures, HDRIs, audio files, or runtime asset dependencies.

---

## The Three Movements

Smoothly transition the camera across three curated chapters via the borderless gallery switcher:

1. **I. The Oculus *(Time & Shadow)***  
   A low-angle monumental view down the travertine colonnade. Drag horizontally across the sanctuary to scrub the sun from **Pale Dawn → Blinding Zenith → Deep Amber Dusk → Silver Lunar Eclipse**, shifting shadow geometry, atmospheric fog temperature, and tilted volumetric god rays in real time.
2. **II. The Mirror Pool *(Stillness & Caustics)***  
   The camera glides low over a flooded black mirror floor. Tap or drag directly on the obsidian water to send physically damped circular ripples across real-time reflections and awaken delicate additive water caustics dancing along the bronze collars, wet basalt plinths, and fluted column bases.
3. **III. The Prism Vault *(Refraction & Resonance)***  
   An intimate study of three suspended crystal monoliths hanging within the central oculus sunbeam. Drag to rotate the prisms with heavy physical inertia and magnetic harmonic detents. Aligning all three prisms (`3/3`) triggers a ceremonial **5-second Resonance Climax**: the camera glides back to reveal the entire nave bathed in ethereal prismatic dispersion while a cathedral harmonic chord swells into a long reverb tail. Drag any prism at any time to return seamlessly to interactive control.

---

## Technical Highlights

- **Monumental Chiaroscuro Architecture:** Fluted travertine colonnades, stepped sunken altar, recessed coffered roof, and a longitudinal sky oculus illuminated by dynamic solar directional light and `ACESFilmicToneMapping`.
- **100% Procedural PBR Materials:** High-resolution diffuse, bump, and roughness maps generated on offscreen HTML5 canvases—complete with horizontal concrete formwork seams, tie-rod dimples, mineral grain, brushed bronze patina, and subtle 35mm film grain.
- **Custom GLSL Volumetric God Rays:** Tilted light shafts descending from the oculus slit with smooth Fresnel edge attenuation, soft Reinhard highlight compression, and drifting 3D procedural air density.
- **True Obsidian Mirror Pool & Instanced Caustics:** Combines `THREE.Reflector` planar reflections with a 12-ripple ring-buffer distortion shader and instanced `THREE.AdditiveBlending` caustic overlays along lower architectural surfaces.
- **Chromatic Prism Optics:** Fresnel crystal transmission shaders projecting soft translucent spectral ribbons onto the concrete floor, apse, and nave walls.
- **Generative Cathedral Soundscape:** Real-time Web Audio API synthesis featuring an open-D atmospheric drone, procedural 5.8-second convolution reverb, water ripple chimes, crystalline prism resonances, and a fifth/octave climax swell.
- **Gallery-Grade UI & Stillness Mode:** Borderless floating typography with real-time solar altitude/azimuth telemetry and a one-click **Stillness** toggle that hides all interface chrome.

---

## Controls

| Action | Mouse / Touch | Keyboard |
| :--- | :--- | :--- |
| Switch Movement | Click chapter bar (`I` / `II` / `III`) | `1`, `2`, `3` |
| Scrub Solar Arc *(Movement I)* | Drag horizontally | `←` / `→` or `A` / `D` |
| Send Water Ripples *(Movement II)* | Tap or drag on the pool | `Space` |
| Rotate Crystal Prisms *(Movement III)* | Drag horizontally | `←` / `→` or `A` / `D` |
| Toggle Audio Mute | Click `SOUND` | `M` |
| Exit Stillness Mode | Tap anywhere | `Esc` |

---

## Tech Stack

- **3D & Shaders:** [Three.js](https://threejs.org/) (`three`, `Reflector`, custom GLSL)
- **Framework:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS v4
- **Audio:** Native Web Audio API (procedural synthesis & convolution reverb)
- **Testing:** Node.js `node:test` via `tsx`

---

## Project Structure

```text
src/
├── App.tsx                       # Root lifecycle, keyboard bindings & Stillness Mode
├── components/
│   ├── IntroVeil.tsx             # Architectural entry veil & audio unlock
│   └── SanctuaryHUD.tsx          # Borderless gallery HUD & solar telemetry
└── engine/
    ├── SanctuaryEngine.ts        # Core Three.js renderer, camera choreography & loop
    ├── sanctuaryGeometry.ts      # Colonnades, oculus, altar, prisms & instanced caustics
    ├── shaders.ts                # Custom GLSL (volumetrics, obsidian reflector, caustics, ribbons)
    ├── proceduralTextures.ts     # Offscreen canvas PBR travertine, bronze & film grain
    ├── audioEngine.ts            # Generative Web Audio drone, chimes & 5.8s reverb
    ├── chapters.ts               # Camera presets & movement metadata
    ├── solarMath.ts              # Solar ephemeris, color ramps & lighting curves
    ├── rippleBuffer.ts           # 12-slot interactive water ripple ring buffer
    └── prismPhysics.ts           # Rotational inertia, harmonic detents & 3/3 climax state
```

---

## Getting Started

### Prerequisites

- Node.js 20+

### Local Development

```bash
# Install dependencies
npm install

# Start the development server (http://localhost:3000)
npm run dev
```

### Build, Type-Check & Tests

```bash
# Type-check with TypeScript
npm run lint

# Run pure-logic unit tests (solar math, ripple buffer, prism physics)
npx tsx --test src/engine/solarMath.test.ts src/engine/rippleBuffer.test.ts src/engine/prismPhysics.test.ts

# Production build
npm run build

# Preview production build
npm run preview
```

---

## License

Licensed under the [Apache-2.0 License](https://www.apache.org/licenses/LICENSE-2.0).
