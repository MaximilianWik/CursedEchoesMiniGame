/**
 * GameOver screen — the classic Dark Souls YOU DIED reveal, now with rich stats.
 */

import {useEffect, useRef} from 'react';
import type {ReactNode} from 'react';
import type {Rank} from '../graphics';
import type {RunStats, DerivedStats} from '../game/stats';
import {APP_VERSION} from '../version';

export type HighScore = {souls: number; maxCombo: number};

export type GameOverScreenProps = {
  finalScore: number;
  maxCombo: number;
  topRank: Rank;
  stats: RunStats;
  derived: DerivedStats;
  zoneName: string;
  highscores: HighScore[];
  secretPassword: string;
  passwordError: boolean;
  setSecretPassword: (v: string) => void;
  setPasswordError: (v: boolean) => void;
  onUnlock: () => void;
  onTryAgain: () => void;
  onOpenDev: () => void;
};

export function GameOverScreen(props: GameOverScreenProps) {
  const {finalScore, maxCombo, topRank, stats, derived, zoneName, highscores,
    secretPassword, passwordError, setSecretPassword, setPasswordError, onUnlock, onTryAgain, onOpenDev} = props;
  const graphRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = graphRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 260, H = 80;
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + 'px'; c.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = stats.comboOverTime;
    ctx.fillStyle = 'rgba(139, 0, 0, 0.12)';
    ctx.fillRect(0, 0, W, H);
    if (pts.length < 2) return;
    const maxC = Math.max(10, ...pts.map(p => p.combo));
    const minT = pts[0].t;
    const maxT = pts[pts.length - 1].t;
    const xRange = Math.max(1, maxT - minT);
    ctx.strokeStyle = '#ff7744'; ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8; ctx.shadowColor = '#ff7744';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = ((pts[i].t - minT) / xRange) * W;
      const y = H - (pts[i].combo / maxC) * (H - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [stats.comboOverTime]);

  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black z-50 flex flex-col items-center justify-center fade-in ce-death-bg">
      <div className="ce-death-embers" aria-hidden />
      <div className="ce-died-vignette" aria-hidden />
      <div className="relative flex items-center justify-center">
        <div className="ce-died-smoke" aria-hidden />
        <div className="ce-died">YOU DIED</div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-x-10 gap-y-1 text-amber-100/70 font-[Cinzel] text-sm tracking-widest slide-in" style={{animationDelay: '2200ms'}}>
        <StatLine label="Souls" value={finalScore.toLocaleString()} />
        <StatLine label="Max Combo" value={String(maxCombo)} trailing={<img src={`/${topRank.id}-removebg-preview.png`} alt={topRank.label} className="inline h-7 object-contain ml-2" />} />
        <StatLine label="Accuracy" value={derived.accuracy + '%'} />
        <StatLine label="WPM" value={String(derived.wpm)} />
        <StatLine label="Time" value={derived.secondsSurvivedLabel} />
        <StatLine label="Zone" value={zoneName} />
        <StatLine label="Bosses felled" value={String(stats.bossesDefeated)} />
        <StatLine label="Words banished" value={String(stats.wordsKilled)} />
        <StatLine label="Projectiles parried" value={String(stats.projectilesDeflected)} />
        <StatLine label="Dodges" value={String(stats.dodgesSuccessful)} />
        <StatLine label="Estus drunk" value={String(stats.estusDrunk)} />
        <StatLine label="Deadliest letter" value={stats.deadliestLetter || '—'} />
      </div>

      {(stats.secretBossChosen || stats.secretBossDefeated) && (
        <div className="mt-4 px-4 py-1.5 border border-pink-400/80 bg-pink-950/30 rounded-sm font-[Cinzel] text-[11px] tracking-[0.35em] uppercase text-pink-200 shadow-[0_0_14px_rgba(255,120,200,0.35)] select-none slide-in" style={{animationDelay: '2400ms'}}>
          {stats.secretBossDefeated ? '★ Secret Route · AfroMan felled' : '★ Secret Route · AfroMan challenged'}
        </div>
      )}

      <div className="flex items-center gap-6 mt-8 slide-in" style={{animationDelay: '2600ms'}}>
        <div className="text-[10px] text-amber-600/60 tracking-[0.4em] uppercase">Combo over time</div>
        <canvas ref={graphRef} className="border border-amber-900/30 bg-black/40" />
      </div>

      <div className="mt-8 flex flex-col items-center opacity-0 fade-in" style={{animationDelay: '2900ms'}}>
        <p className="text-xs text-[#ff4444] font-bold mb-2 font-[Cinzel] tracking-[0.5em] uppercase drop-shadow-[0_0_10px_rgba(255,0,0,0.6)] animate-pulse">Secret Password</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (secretPassword.toUpperCase() === 'ILOVEMYGF') onUnlock();
          else {
            setPasswordError(true);
            window.setTimeout(() => setPasswordError(false), 500);
            setSecretPassword('');
          }
        }} className="flex">
          <input
            type="password"
            value={secretPassword}
            onChange={(e) => setSecretPassword(e.target.value)}
            className={`bg-[#0a0000] border ${passwordError ? 'border-red-500 shadow-[0_0_20px_rgba(255,0,0,0.6)]' : 'border-[#ff4444]/60 shadow-[0_0_20px_rgba(255,0,0,0.3)]'} text-red-100 font-serif text-center px-4 py-2 outline-none focus:border-[#ff4444] focus:shadow-[0_0_25px_rgba(255,0,0,0.5)] transition-all tracking-[0.3em] placeholder:text-[#ff4444]/30 w-48 ${passwordError ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
            placeholder="..."
          />
        </form>
      </div>

      <button
        onClick={onTryAgain}
        className="mt-10 px-10 py-3 border border-amber-900/60 text-amber-400 hover:bg-amber-900/20 hover:border-amber-400 transition-all uppercase tracking-[0.4em] font-[Cinzel] opacity-0 fade-in"
        style={{animationDelay: '3200ms'}}
      >
        Try Again
      </button>

      <button
        onClick={onOpenDev}
        className="absolute bottom-6 left-6 z-[65] px-3 py-1.5 border border-emerald-700/70 bg-black/60 text-emerald-300 hover:text-emerald-100 hover:border-emerald-400 font-[Cinzel] text-[10px] tracking-[0.4em] uppercase opacity-0 fade-in"
        style={{animationDelay: '3400ms'}}
      >
        ◇ DEV
      </button>

      <div className="absolute right-8 bottom-8 flex flex-col items-center z-[60] opacity-0 fade-in w-48" style={{animationDelay: '3000ms'}}>
        <h2 className="text-[#8b0000] font-[Cinzel] tracking-widest text-[1rem] leading-none mb-3 border-b border-[#8b0000]/50 pb-1 drop-shadow-[0_0_10px_rgba(139,0,0,0.8)] uppercase">Hall of Records</h2>
        {highscores.length === 0 ? (
          <div className="text-amber-700/50 font-[Cinzel] italic text-xs">No legendary souls yet...</div>
        ) : highscores.map((hs, i) => (
          <div key={i} className="flex flex-col w-full mb-2 bg-black/60 px-3 py-2 rounded-sm border border-amber-900/40 hover:bg-amber-900/10 transition-colors shadow-lg">
            <div className="flex justify-between items-end mb-1">
              <span className="text-amber-700/80 font-[Cinzel] text-xs tracking-widest">Rank {i + 1}</span>
              <span className="text-[#8b0000] font-[Cinzel] text-xl drop-shadow-[0_0_8px_rgba(139,0,0,0.6)] font-bold">{hs.souls.toString().padStart(6, '0')}</span>
            </div>
            <div className="flex justify-between border-t border-amber-900/30 pt-1 mt-1">
              <span className="text-[#a19787] font-[Cinzel] text-[9px] uppercase tracking-widest">Max Combo</span>
              <span className="text-amber-500 font-[Cinzel] text-xs font-bold">{hs.maxCombo}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Version badge — bottom-right corner, amber pill to stand out. */}
      <div className="absolute bottom-4 right-4 px-3 py-1.5 border border-amber-600/80 bg-black/70 rounded-sm font-[Cinzel] text-xs tracking-[0.4em] uppercase text-amber-300 shadow-[0_0_14px_rgba(255,180,60,0.35)] select-none">
        v{APP_VERSION}
      </div>
    </div>
  );
}

function StatLine({label, value, trailing}: {label: string; value: string; trailing?: ReactNode}) {
  return (
    <>
      <span className="text-amber-700/60 uppercase text-[10px] tracking-[0.4em] text-right">{label}</span>
      <span className="text-amber-200 flex items-center">{value}{trailing}</span>
    </>
  );
}
