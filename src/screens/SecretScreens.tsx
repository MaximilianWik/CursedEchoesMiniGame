/**
 * Secret romance screens — unchanged gameplay, extracted to a separate module
 * so App.tsx stays focused on the game.
 */

import type {MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, Dispatch, SetStateAction, CSSProperties} from 'react';
import {DESIGN_W, DESIGN_H} from '../graphics';

export type SecretHeart = {id: number; x: number; y: number; scale: number};

export type SecretAskScreenProps = {
  yesChecked: boolean;
  setYesChecked: (v: boolean) => void;
  noHoverPos: {x: number; y: number} | null;
  runAway: (e?: ReactMouseEvent | ReactTouchEvent) => void;
  onBack: () => void;
};

export function SecretAskScreen({yesChecked, setYesChecked, noHoverPos, runAway, onBack}: SecretAskScreenProps) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-[#050002] z-[100] flex flex-col items-center justify-center fade-in">
      <button onClick={onBack} className="absolute top-8 left-8 z-[120] text-[#ff80cc]/60 hover:text-[#ff80cc] font-[Cinzel] tracking-widest transition-all drop-shadow-[0_0_10px_rgba(255,128,204,0.3)] hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)]">← BACK</button>
      <img src="/Jessyka.gif" alt="Jessyka" className="w-auto h-[350px] object-cover rounded-2xl mb-8" />
      <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center mb-12">
        Får jag chans på dig? &lt;3
      </h1>
      <div className="flex gap-16 w-full justify-center">
        <label className="flex items-center gap-2 cursor-pointer group">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={yesChecked}
              onChange={(e) => setYesChecked(e.target.checked)}
              className="peer appearance-none w-4 h-4 border border-[#ff80cc]/50 rounded-[2px] bg-black/50 checked:bg-[#ff80cc] checked:border-[#ff80cc] transition-all cursor-pointer shadow-[0_0_10px_rgba(255,128,204,0.2)]"
            />
            <svg className="absolute w-2.5 h-2.5 text-[#050002] pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <span className="text-xl text-[#ff80cc]/70 font-[Cinzel] tracking-widest group-hover:text-[#ff80cc] group-hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] transition-all">JA OMG</span>
        </label>
        <label
          className={`flex items-center gap-2 cursor-pointer group ${noHoverPos ? 'absolute' : ''} transition-all duration-100 z-[110]`}
          style={noHoverPos ? {left: `${noHoverPos.x}px`, top: `${noHoverPos.y}px`} : {}}
          onMouseEnter={runAway}
          onClick={runAway}
          onTouchStart={runAway}
        >
          <div className="relative flex items-center justify-center pointer-events-none">
            <input type="checkbox" checked={false} onChange={() => {}} className="peer appearance-none w-4 h-4 border border-[#ff80cc]/50 rounded-[2px] bg-black/50 transition-all shadow-[0_0_10px_rgba(255,128,204,0.2)]" tabIndex={-1} />
            <svg className="absolute w-2.5 h-2.5 text-[#050002] opacity-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <span className="text-xl text-[#ff80cc]/70 font-[Cinzel] tracking-widest group-hover:text-[#ff80cc] group-hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] transition-all pointer-events-none">NEJ USCHH</span>
        </label>
      </div>
    </div>
  );
}

export type SecretLoveScreenProps = {
  secretHearts: SecretHeart[];
  setSecretHearts: Dispatch<SetStateAction<SecretHeart[]>>;
  setKissPos: (p: {x: number; y: number} | null) => void;
  smoochAudio: HTMLAudioElement | null;
  onBack: () => void;
};

export function SecretLoveScreen({secretHearts, setSecretHearts, setKissPos, smoochAudio, onBack}: SecretLoveScreenProps) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-[#050002] z-[100] flex flex-col items-center justify-center fade-in">
      <button onClick={onBack} className="absolute top-8 left-8 z-[120] text-[#ff80cc]/60 hover:text-[#ff80cc] font-[Cinzel] tracking-widest transition-all drop-shadow-[0_0_10px_rgba(255,128,204,0.3)] hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)]">← BACK</button>
      <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center mb-8">CLICK ME!!!!</h1>
      <img
        src="/placeholder.jpg"
        alt="Placeholder"
        className="w-auto h-[350px] object-cover rounded-2xl mb-8 hover:shadow-[0_0_30px_rgba(255,128,204,0.6)] transition-all active:scale-95 cursor-none"
        onMouseEnter={(e) => setKissPos({x: e.clientX, y: e.clientY})}
        onMouseMove={(e) => setKissPos({x: e.clientX, y: e.clientY})}
        onMouseLeave={() => setKissPos(null)}
        onClick={() => {
          if (smoochAudio) {
            try { smoochAudio.currentTime = 0; void smoochAudio.play(); } catch { /* ignore */ }
          }
          const numHearts = 15;
          const newHearts = Array.from({length: numHearts}).map((_, i) => ({
            id: Date.now() + i + Math.random(),
            x: Math.random() * DESIGN_W,
            y: Math.random() * DESIGN_H,
            scale: Math.random() * 0.8 + 0.5,
          }));
          setSecretHearts(prev => [...prev, ...newHearts]);
          window.setTimeout(() => {
            setSecretHearts(prev => prev.filter(h => !newHearts.find(n => n.id === h.id)));
          }, 2000);
        }}
      />
      <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center">
        Jag älskar dig baby &lt;333
      </h1>
      {secretHearts.map(heart => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-[120] animate-float-heart"
          style={{left: heart.x, top: heart.y, '--scale': heart.scale} as unknown as CSSProperties}
        >
          <span className="text-6xl drop-shadow-[0_0_10px_rgba(255,128,204,0.8)]">❤️</span>
        </div>
      ))}
    </div>
  );
}
