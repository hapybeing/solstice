/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IntroVeil } from './components/IntroVeil';
import { SanctuaryHUD } from './components/SanctuaryHUD';
import { ChapterId } from './engine/chapters';
import { SanctuaryEngine, SanctuaryHudSnapshot } from './engine/SanctuaryEngine';

const INITIAL_HUD: SanctuaryHudSnapshot = {
  chapter: 'oculus',
  solarProgress: 0.28,
  altitudeDeg: 68.5,
  azimuthDeg: 157.6,
  telemetryText: 'ALT 68.5° // AZM 157.6°',
  phase: 'Blinding Zenith',
  alignedPrisms: 0,
  allPrismsAligned: false,
  resonanceClimax: false,
  climaxProgress: 0,
  rippleCount: 0,
  grainDataUrl: '',
  webglError: null,
};

function hasAutostartParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('autostart') === '1';
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SanctuaryEngine | null>(null);

  const [entered, setEntered] = useState<boolean>(() => hasAutostartParam());
  const [muted, setMuted] = useState<boolean>(false);
  const [stillness, setStillness] = useState<boolean>(false);
  const [hud, setHud] = useState<SanctuaryHudSnapshot>(INITIAL_HUD);
  const [interactedChapters, setInteractedChapters] = useState<Record<ChapterId, boolean>>({
    oculus: false,
    pool: false,
    prism: false,
  });

  // Track pointer down coordinates in Stillness Mode so a gentle tap restores UI
  const stillnessTapRef = useRef<{ x: number; y: number } | null>(null);
  const stillnessRef = useRef(stillness);
  stillnessRef.current = stillness;

  const chapterRef = useRef<ChapterId>(hud.chapter);
  chapterRef.current = hud.chapter;

  const handleChapterInteract = useCallback((chapter: ChapterId) => {
    setInteractedChapters((prev) => {
      if (prev[chapter]) return prev;
      return { ...prev, [chapter]: true };
    });
  }, []);

  const callbacksRef = useRef({
    onHudUpdate: (snapshot: SanctuaryHudSnapshot) => setHud(snapshot),
    onChapterInteract: handleChapterInteract,
  });
  callbacksRef.current.onChapterInteract = handleChapterInteract;

  // Mount pure Three.js engine once; never tear down on React state changes
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new SanctuaryEngine(mountEl, {
      onHudUpdate: (snapshot) => callbacksRef.current.onHudUpdate(snapshot),
      onChapterInteract: (chap) => callbacksRef.current.onChapterInteract(chap),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard accessibility & Stillness Mode escape handling
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stillnessRef.current) {
        setStillness(false);
        return;
      }
      if (!entered) return;

      if (e.key === '1') {
        engineRef.current?.setChapter('oculus');
      } else if (e.key === '2') {
        engineRef.current?.setChapter('pool');
      } else if (e.key === '3') {
        engineRef.current?.setChapter('prism');
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          const next = !prev;
          engineRef.current?.setMuted(next);
          return next;
        });
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (chapterRef.current === 'oculus') {
          engineRef.current?.nudgeSolar(0.045);
        } else if (chapterRef.current === 'prism') {
          engineRef.current?.nudgePrisms(0.18);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (chapterRef.current === 'oculus') {
          engineRef.current?.nudgeSolar(-0.045);
        } else if (chapterRef.current === 'prism') {
          engineRef.current?.nudgePrisms(-0.18);
        }
      } else if (e.key === ' ' && chapterRef.current === 'pool') {
        e.preventDefault();
        engineRef.current?.triggerCenterRipple();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entered]);

  // Restore Stillness Mode on a gentle tap anywhere (without blocking drag gestures)
  useEffect(() => {
    if (!stillness) return;

    const onPointerDown = (e: PointerEvent) => {
      stillnessTapRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      const start = stillnessTapRef.current;
      stillnessTapRef.current = null;
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) {
        setStillness(false);
      }
    };

    // Delay attachment slightly so the click that activated Stillness does not immediately dismiss it
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
    }, 180);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [stillness]);

  const handleEnterSanctuary = useCallback(() => {
    setEntered(true);
    engineRef.current?.unlockAudio();
  }, []);

  const handleSelectChapter = useCallback((chapter: ChapterId) => {
    engineRef.current?.unlockAudio();
    engineRef.current?.setChapter(chapter);
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.unlockAudio();
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleEnterStillness = useCallback(() => {
    setStillness(true);
  }, []);

  return (
    <main
      className="relative w-full h-full overflow-hidden bg-[#0b0a09] select-none"
      data-entered={entered ? 'true' : 'false'}
      data-chapter={hud.chapter}
      data-stillness={stillness ? 'true' : 'false'}
      data-aligned-prisms={String(hud.alignedPrisms)}
      data-resonance-climax={hud.resonanceClimax ? 'true' : 'false'}
      data-ripples={String(hud.rippleCount)}
    >
      {/* Dedicated isolated WebGL canvas mount */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Interactive 3D architectural sanctuary of light"
      />

      {/* Graceful WebGL fallback if graphics context is unavailable */}
      {hud.webglError && (
        <div
          role="alert"
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0d0c0b] px-6 text-center"
        >
          <h1 className="font-editorial text-3xl tracking-[0.22em] text-[#f2ece3] mb-4">
            SOLSTICE
          </h1>
          <p className="font-telemetry text-xs text-[#b8afa2] max-w-md leading-relaxed">
            WebGL rendering is currently unavailable in this browser environment ({hud.webglError}).
          </p>
        </div>
      )}

      {/* Subtle procedural 35mm architectural film grain + radial vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 solstice-vignette"
      />
      {hud.grainDataUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 opacity-35 mix-blend-overlay"
          style={{
            backgroundImage: `url(${hud.grainDataUrl})`,
            backgroundRepeat: 'repeat',
          }}
        />
      )}

      {/* Minimal Museum-Catalogue HUD */}
      <SanctuaryHUD
        hud={hud}
        entered={entered}
        muted={muted}
        stillness={stillness}
        hintVisible={!interactedChapters[hud.chapter]}
        onSelectChapter={handleSelectChapter}
        onToggleMute={handleToggleMute}
        onEnterStillness={handleEnterStillness}
      />

      {/* Serene Dark-Stone Intro Veil */}
      <IntroVeil visible={!entered} onEnter={handleEnterSanctuary} />
    </main>
  );
}
