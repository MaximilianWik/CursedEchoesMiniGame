/**
 * Bonfire interlude — shown between zones and after boss defeats.
 * HP and estus are refilled by the caller before this mounts.
 */

import {useEffect, useState} from 'react';

export type BonfireReason = 'zone-cleared' | 'boss-defeated' | 'new-zone';

export type BonfireInterludeProps = {
  reason: BonfireReason;
  nextZoneName: string;
  nextZoneSubtitle: string;
  defeatedBossName?: string;
  onContinue: () => void;
};

const LINES: Record<BonfireReason, {title: string; sub: string}> = {
  'zone-cleared':   {title: 'BONFIRE LIT',      sub: 'Warmth returns. The flame strengthens you.'},
  'boss-defeated':  {title: 'VICTORY ACHIEVED', sub: 'A great soul is claimed.'},
  'new-zone':       {title: 'ONWARD',           sub: 'A new trial awaits.'},
};

export function BonfireInterlude({reason, nextZoneName, nextZoneSubtitle, defeatedBossName, onContinue}: BonfireInterludeProps) {
  const [canAdvance, setCanAdvance] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setCanAdvance(true), 1400);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!canAdvance) return;
    const onKey = () => onContinue();
    window.addEventListener('keydown', onKey, {once: true});
    return () => window.removeEventListener('keydown', onKey);
  }, [canAdvance, onContinue]);

  const lines = LINES[reason];

  return (
    <div
      className="absolute top-0 left-0 w-full h-full z-[56] flex flex-col items-center justify-center ce-bonfire-bg fade-in"
      onClick={() => canAdvance && onContinue()}
    >
      {defeatedBossName && reason === 'boss-defeated' && (
        <div className="font-[Cinzel] text-lg text-red-300/70 tracking-[0.4em] uppercase mb-2 slide-in" style={{animationDelay: '200ms'}}>
          {defeatedBossName} FELLED
        </div>
      )}
      <h1
        className="font-[Cinzel] font-bold text-5xl md:text-6xl text-amber-500 tracking-[0.3em] mb-4 ce-bonfire-title"
      >
        {lines.title}
      </h1>
      <p className="text-amber-200/70 text-sm font-serif italic tracking-wide mb-10 slide-in" style={{animationDelay: '400ms'}}>
        {lines.sub}
      </p>

      {/* Animated bonfire made of CSS layers */}
      <div className="ce-bonfire-sprite" aria-hidden>
        <div className="ce-bonfire-flame" />
        <div className="ce-bonfire-flame" style={{animationDelay: '-0.4s'}} />
        <div className="ce-bonfire-flame" style={{animationDelay: '-0.8s'}} />
      </div>

      <div className="mt-10 text-center slide-in" style={{animationDelay: '800ms'}}>
        <div className="text-xs text-amber-700/60 tracking-[0.5em] uppercase">Next trial</div>
        <div className="text-2xl font-[Cinzel] text-amber-400 tracking-[0.3em] mt-1">{nextZoneName}</div>
        <div className="text-xs text-amber-400/50 tracking-widest italic mt-1">{nextZoneSubtitle}</div>
      </div>

      <div className={`mt-12 text-amber-600/70 font-[Cinzel] tracking-[0.4em] uppercase text-xs transition-opacity ${canAdvance ? 'opacity-100 animate-pulse' : 'opacity-0'}`}>
        Press any key to continue
      </div>
    </div>
  );
}
