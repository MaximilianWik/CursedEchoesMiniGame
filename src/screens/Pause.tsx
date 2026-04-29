/**
 * Pause overlay — semi-transparent, centered menu. Keyboard-navigable.
 */

import type {ReactNode} from 'react';
import {APP_VERSION} from '../version';

export type PauseScreenProps = {
  onResume: () => void;
  onOpenSettings: () => void;
  onOpenDev: () => void;
  onAbandon: () => void;
};

export function PauseScreen({onResume, onOpenSettings, onOpenDev, onAbandon}: PauseScreenProps) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black/80 backdrop-blur-[2px] z-[55] flex flex-col items-center justify-center fade-in">
      <h1 className="font-[Cinzel] text-5xl text-amber-500 tracking-[0.4em] mb-2 drop-shadow-[0_0_20px_rgba(180,83,9,0.5)]">PAUSED</h1>
      <p className="text-amber-700/70 text-xs tracking-[0.4em] uppercase mb-12">The flame wavers, waiting</p>

      <div className="flex flex-col gap-3 w-72">
        <PauseBtn onClick={onResume}>RESUME</PauseBtn>
        <PauseBtn onClick={onOpenSettings}>SETTINGS</PauseBtn>
        <PauseBtn onClick={onOpenDev} emerald>◇ DEV CONSOLE</PauseBtn>
        <PauseBtn onClick={onAbandon} danger>ABANDON RUN</PauseBtn>
      </div>

      <p className="mt-12 text-amber-900/50 font-[Cinzel] text-[10px] tracking-[0.4em] uppercase">
        <kbd className="px-1 py-0.5 mx-1 border border-amber-800 text-amber-500">ESC</kbd> to resume
      </p>

      {/* Version badge — bottom-right corner. */}
      <div className="absolute bottom-4 right-4 font-[Cinzel] text-xs tracking-[0.35em] uppercase text-amber-700/60 select-none">
        v{APP_VERSION}
      </div>
    </div>
  );
}

function PauseBtn({children, onClick, danger, emerald}: {children: ReactNode; onClick: () => void; danger?: boolean; emerald?: boolean}) {
  let cls = 'border-amber-800 text-amber-500 hover:text-amber-300 hover:bg-amber-950/40 hover:border-amber-400';
  if (danger) cls = 'border-red-900 text-red-400/80 hover:text-red-300 hover:bg-red-950/40 hover:border-red-500';
  else if (emerald) cls = 'border-emerald-700/70 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-950/40 hover:border-emerald-400';
  return (
    <button
      onClick={onClick}
      className={`px-8 py-3 border font-[Cinzel] tracking-[0.3em] transition-all ${cls}`}
    >
      {children}
    </button>
  );
}
