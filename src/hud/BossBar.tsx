/**
 * BossBar — shown during boss fights. Large, ominous. Name, title, HP ticks.
 */

import {memo} from 'react';

export type BossBarStats = {
  name: string;
  title: string;
  hpPct: number;          // 0..1
  themeColor: string;     // accent color for the bar fill
  phaseIdx: number;
};

export const BossBar = memo(function BossBar({stats}: {stats: BossBarStats}) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none select-none flex flex-col items-center w-[680px] max-w-[90%]">
      <div className="text-[10px] text-amber-200/70 font-[Cinzel] tracking-[0.4em] uppercase">
        {stats.title}
      </div>
      <div className="font-[Cinzel] text-2xl font-bold tracking-[0.25em] mb-2" style={{color: stats.themeColor, textShadow: `0 0 18px ${stats.themeColor}, 0 0 4px rgba(0,0,0,0.9)`}}>
        {stats.name}
      </div>
      <div
        className="relative h-3 w-full border border-black/80"
        style={{
          background: 'linear-gradient(180deg, rgba(30,10,10,0.85), rgba(10,4,4,0.85))',
          boxShadow: `0 0 22px ${stats.themeColor}`,
        }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${Math.max(0, Math.min(100, stats.hpPct * 100))}%`,
            background: `linear-gradient(90deg, #3a0606 0%, ${stats.themeColor} 100%)`,
          }}
        />
        {/* Phase ticks */}
        {[0.66, 0.33].map(tick => (
          <div key={tick} className="absolute top-0 h-full w-[1px] bg-black/80" style={{left: `${tick * 100}%`}} />
        ))}
        {/* Gothic frame */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.3) 100%)',
        }} />
      </div>
      {stats.phaseIdx > 0 && (
        <div className="text-[10px] text-red-300/70 font-[Cinzel] tracking-[0.4em] uppercase mt-1 animate-pulse">
          Phase {stats.phaseIdx + 1}
        </div>
      )}
    </div>
  );
});
