import React from 'react';

interface IntroVeilProps {
  visible: boolean;
  onEnter: () => void;
}

export const IntroVeil: React.FC<IntroVeilProps> = ({ visible, onEnter }) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="solstice-intro-title"
      aria-hidden={!visible}
      className={`fixed inset-0 z-30 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-1000 ease-out ${
        visible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none'
      }`}
      style={{
        background:
          'radial-gradient(ellipse 75% 70% at 50% 46%, rgba(18, 16, 14, 0.78) 0%, rgba(10, 9, 8, 0.94) 100%)',
      }}
    >
      <div className="max-w-lg w-full flex flex-col items-center">
        <p className="font-telemetry text-[11px] tracking-[0.32em] text-[#a79e91] uppercase mb-7">
          Architectural Light Sanctuary
        </p>

        <h1
          id="solstice-intro-title"
          className="font-editorial text-4xl sm:text-6xl font-normal tracking-[0.26em] text-[#f2ece3] pl-[0.26em]"
          style={{ textWrap: 'balance' }}
        >
          SOLSTICE
        </h1>

        <div
          aria-hidden="true"
          className="w-20 h-px bg-[#d4b282]/45 my-6"
        />

        <p className="font-editorial italic text-lg sm:text-xl tracking-[0.06em] text-[#cdc5b8] mb-12">
          An Architecture of Light
        </p>

        <button
          type="button"
          onClick={onEnter}
          disabled={!visible}
          className="group relative inline-flex items-center justify-center min-h-[48px] px-9 py-3 border border-[#ebe6de]/35 bg-[#141210]/85 text-[#f2ece3] font-telemetry text-xs tracking-[0.26em] uppercase whitespace-nowrap transition-colors duration-300 hover:border-[#d4b282] hover:text-[#ffffff] hover:bg-[#1c1916] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4b282] cursor-pointer"
        >
          Enter Sanctuary
        </button>

        <p className="mt-8 font-telemetry text-[10px] tracking-[0.2em] text-[#857d72]">
          THREE MOVEMENTS · PROCEDURAL SOUND
        </p>
      </div>
    </div>
  );
};
