import React from 'react';
import { EyeOff, Volume2, VolumeX } from 'lucide-react';
import { CHAPTERS, ChapterId, getChapterById } from '../engine/chapters';
import { SanctuaryHudSnapshot } from '../engine/SanctuaryEngine';

interface SanctuaryHUDProps {
  hud: SanctuaryHudSnapshot;
  entered: boolean;
  muted: boolean;
  stillness: boolean;
  hintVisible: boolean;
  onSelectChapter: (chapter: ChapterId) => void;
  onToggleMute: () => void;
  onEnterStillness: () => void;
}

const FLOATING_TEXT_SHADOW =
  '[text-shadow:0_1px_12px_rgba(0,0,0,0.92),0_1px_3px_rgba(0,0,0,0.95)]';

export const SanctuaryHUD: React.FC<SanctuaryHUDProps> = ({
  hud,
  entered,
  muted,
  stillness,
  hintVisible,
  onSelectChapter,
  onToggleMute,
  onEnterStillness,
}) => {
  const activeChapter = getChapterById(hud.chapter);
  const showChrome = entered && !stillness;

  return (
    <div
      aria-hidden={!showChrome}
      className={`fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-5 sm:p-8 transition-opacity duration-700 ease-out ${
        showChrome ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Top Bar: Borderless Floating Gallery Typography */}
      <header className="flex items-center justify-between gap-4 w-full">
        {/* Top-Left: SOLSTICE wordmark + hairline divider + current Roman numeral */}
        <div
          className={`pointer-events-auto flex items-baseline gap-3 sm:gap-4 ${FLOATING_TEXT_SHADOW}`}
        >
          <span className="font-editorial text-sm sm:text-base tracking-[0.28em] text-[#f5efe6] whitespace-nowrap shrink-0">
            SOLSTICE
          </span>
          <span
            aria-hidden="true"
            className="h-3.5 w-px bg-[#ebe6de]/30 self-center shrink-0"
          />
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-editorial text-sm sm:text-base tracking-[0.14em] text-[#d4b282] whitespace-nowrap shrink-0">
              {activeChapter.numeral}
            </span>
            <span className="hidden sm:inline font-telemetry text-[11px] tracking-[0.22em] text-[#dcd4c8] whitespace-nowrap truncate">
              {activeChapter.title}
            </span>
          </div>
        </div>

        {/* Top-Right: Borderless Solar Telemetry, Sound & Stillness Controls */}
        <div
          className={`pointer-events-auto flex items-center gap-3 sm:gap-5 shrink-0 ${FLOATING_TEXT_SHADOW}`}
        >
          <div
            data-testid="solar-telemetry"
            className="hidden md:flex items-center gap-2.5 text-[#dfd7cb] font-telemetry text-[11px] tracking-[0.16em] whitespace-nowrap"
          >
            <span>{hud.telemetryText}</span>
            <span aria-hidden="true" className="text-[#ebe6de]/30">
              ·
            </span>
            <span className="text-[#c8bfb2]">{hud.phase}</span>
          </div>

          <span
            aria-hidden="true"
            className="hidden md:block h-3.5 w-px bg-[#ebe6de]/25 shrink-0"
          />

          <button
            type="button"
            onClick={onToggleMute}
            disabled={!showChrome}
            aria-label={muted ? 'Unmute cathedral sound' : 'Mute cathedral sound'}
            aria-pressed={!muted}
            className="inline-flex items-center justify-center gap-2 min-h-[40px] min-w-[40px] px-1.5 text-[#ebe4da] font-telemetry text-[11px] tracking-[0.18em] uppercase whitespace-nowrap shrink-0 transition-colors duration-200 hover:text-[#d4b282] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4b282] cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5 text-[#b3aa9c]" aria-hidden="true" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-[#d4b282]" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound'}</span>
          </button>

          <span
            aria-hidden="true"
            className="h-3.5 w-px bg-[#ebe6de]/25 shrink-0"
          />

          <button
            type="button"
            onClick={onEnterStillness}
            disabled={!showChrome}
            aria-label="Enter Stillness Mode"
            className="inline-flex items-center justify-center gap-2 min-h-[40px] min-w-[40px] px-1.5 text-[#ebe4da] font-telemetry text-[11px] tracking-[0.18em] uppercase whitespace-nowrap shrink-0 transition-colors duration-200 hover:text-[#d4b282] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4b282] cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5 text-[#c8bfb2]" aria-hidden="true" />
            <span className="hidden sm:inline">Stillness</span>
          </button>
        </div>
      </header>

      {/* Bottom-Center: Borderless Floating Hint, Harmonic Lock & Hairline Chapter Switcher */}
      <footer className={`flex flex-col items-center gap-2.5 pb-1 w-full ${FLOATING_TEXT_SHADOW}`}>
        {/* Compact mobile telemetry line */}
        <div
          aria-hidden="true"
          className="md:hidden font-telemetry text-[10px] tracking-[0.16em] text-[#cfc7ba]"
        >
          {hud.telemetryText}
        </div>

        {/* Prism Vault borderless hairline alignment indicator -> quiet "RESONANCE ACHIEVED" whisper */}
        {hud.chapter === 'prism' && (
          <div
            data-testid="prism-alignment-status"
            className="relative flex items-center justify-center min-h-[22px] py-0.5"
          >
            <div
              aria-hidden={hud.allPrismsAligned}
              className={`flex items-center gap-3 transition-opacity duration-1000 ease-out ${
                hud.allPrismsAligned ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            >
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className={`block h-[2px] w-4 transition-colors duration-300 ${
                      idx < hud.alignedPrisms ? 'bg-[#d4b282]' : 'bg-[#ebe6de]/28'
                    }`}
                  />
                ))}
              </div>
              <span className="font-telemetry text-[10px] tracking-[0.22em] uppercase text-[#e6dfd4] whitespace-nowrap">
                {`${hud.alignedPrisms}/3 Prisms Aligned`}
              </span>
            </div>

            <div
              aria-hidden={!hud.allPrismsAligned}
              className={`absolute inset-0 flex items-center justify-center gap-3.5 transition-opacity duration-1200 ease-out ${
                hud.allPrismsAligned ? 'opacity-80' : 'opacity-0 pointer-events-none'
              }`}
            >
              <span aria-hidden="true" className="block h-px w-6 bg-[#d4b282]/50" />
              <span className="font-telemetry text-[10px] tracking-[0.3em] uppercase text-[#edd7b3]/90 whitespace-nowrap">
                Resonance Achieved
              </span>
              <span aria-hidden="true" className="block h-px w-6 bg-[#d4b282]/50" />
            </div>
          </div>
        )}

        {/* Contextual 4-word interaction hint that fades smoothly after interaction or during climax */}
        <p
          data-testid="chapter-hint"
          className={`font-editorial italic text-sm tracking-[0.08em] text-[#eee7dc]/90 transition-opacity duration-700 ${
            hintVisible && !(hud.chapter === 'prism' && hud.allPrismsAligned)
              ? 'opacity-100'
              : 'opacity-0'
          }`}
        >
          {activeChapter.hint}
        </p>

        {/* Three borderless hairline chapter switches */}
        <nav
          aria-label="Sanctuary movements"
          className="pointer-events-auto flex items-center justify-center border-t border-[#ebe6de]/20 pt-0.5 px-2 sm:px-4 max-w-[94vw]"
        >
          {CHAPTERS.map((chap, idx) => {
            const isActive = hud.chapter === chap.id;
            return (
              <React.Fragment key={chap.id}>
                {idx > 0 && (
                  <span
                    aria-hidden="true"
                    className="h-3 w-px bg-[#ebe6de]/22 shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelectChapter(chap.id)}
                  disabled={!showChrome}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative min-h-[44px] px-3.5 sm:px-6 font-telemetry text-[11px] sm:text-xs tracking-[0.22em] uppercase whitespace-nowrap shrink-0 transition-colors duration-250 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#d4b282] cursor-pointer ${
                    isActive
                      ? 'text-[#f8f3eb]'
                      : 'text-[#b5ada0] hover:text-[#f2ece3]'
                  }`}
                >
                  {chap.shortLabel}
                  <span
                    aria-hidden="true"
                    className={`absolute left-3 right-3 bottom-1 h-px transition-opacity duration-300 ${
                      isActive ? 'bg-[#d4b282] opacity-100' : 'bg-transparent opacity-0'
                    }`}
                  />
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </footer>
    </div>
  );
};
