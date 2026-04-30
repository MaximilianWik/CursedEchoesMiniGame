/**
 * BonfireInterlude — the resting beat between zones and after boss
 * defeats. HP + estus are refilled by the caller before this mounts.
 *
 * 0.3.18 — cathedral-level redesign. Night-sky backdrop with stars,
 * distant ruined spires silhouetted on the horizon, drifting ground
 * fog, rising embers + soul-wisps, and a proper multi-layer bonfire
 * centrepiece with the broken-sword icon + shrine stones at its base.
 * Boss defeats get a dedicated SOUL CLAIMED badge; every exit gets a
 * framed "next trial" card with the upcoming zone's name + subtitle.
 *
 * Same prop contract as before.
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
  // 0.3.18 — renamed 'boss-defeated' from "VICTORY ACHIEVED" to "SOUL
  // CLAIMED" so the bonfire interlude doesn't collide with the actual
  // VictoryScreen title that runs after the final boss. Bonfire is for
  // between-boss resting; Victory is for the end of the run.
  'zone-cleared':   {title: 'BONFIRE LIT',  sub: 'Warmth returns. The flame strengthens you.'},
  'boss-defeated':  {title: 'SOUL CLAIMED', sub: 'A great soul is yours. Rest, then rise.'},
  'new-zone':       {title: 'ONWARD',       sub: 'A new trial awaits in the dark.'},
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
      className="absolute top-0 left-0 w-full h-full z-[56] overflow-hidden fade-in bf-root"
      onClick={() => canAdvance && onContinue()}
    >
      {/* ─── Atmospheric backdrop layers ──────────────────────── */}
      <div className="bf-sky" aria-hidden />
      <div className="bf-stars" aria-hidden />
      <div className="bf-ruins" aria-hidden />
      <div className="bf-horizon-glow" aria-hidden />
      <div className="bf-fog" aria-hidden />
      <div className="bf-embers" aria-hidden />
      <div className="bf-souls" aria-hidden />

      {/* ─── Content stack ────────────────────────────────────── */}
      <div className="relative z-[2] h-full w-full flex flex-col items-center justify-start pt-10 px-6">
        {/* Sigil divider above the title */}
        <div className="bf-sigil" aria-hidden>
          <span>✦</span>
          <span className="bf-sigil-line" />
          <span>◆</span>
          <span className="bf-sigil-line" />
          <span>✦</span>
        </div>

        <h1 className="bf-title">{lines.title}</h1>
        <p className="bf-sub">{lines.sub}</p>

        {defeatedBossName && reason === 'boss-defeated' && (
          <div className="bf-defeated-badge slide-in" style={{animationDelay: '300ms'}}>
            <span className="bf-defeated-sigil">★</span>
            <span>{defeatedBossName} FELLED</span>
            <span className="bf-defeated-sigil">★</span>
          </div>
        )}

        {/* ─── Bonfire centrepiece ────────────────────────────── */}
        <div className="bf-bonfire slide-in" style={{animationDelay: '600ms'}} aria-hidden>
          {/* Ground shadow pool */}
          <div className="bf-bonfire-shadow" />
          {/* Stacked shrine stones at the base */}
          <div className="bf-stone bf-stone-1" />
          <div className="bf-stone bf-stone-2" />
          <div className="bf-stone bf-stone-3" />
          <div className="bf-stone bf-stone-4" />
          {/* Outer halo */}
          <div className="bf-bonfire-halo" />
          {/* Rotating light rays */}
          <div className="bf-bonfire-rays" />
          {/* Hot center core */}
          <div className="bf-bonfire-core" />
          {/* Layered flames */}
          <div className="bf-bonfire-flame bf-bonfire-flame-1" />
          <div className="bf-bonfire-flame bf-bonfire-flame-2" />
          <div className="bf-bonfire-flame bf-bonfire-flame-3" />
          {/* Broken sword in the pile — DS iconography */}
          <div className="bf-bonfire-sword" />
          {/* Log base */}
          <div className="bf-bonfire-logs" />
          {/* Floating embers */}
          <div className="bf-bonfire-ember bf-bonfire-ember-1" />
          <div className="bf-bonfire-ember bf-bonfire-ember-2" />
          <div className="bf-bonfire-ember bf-bonfire-ember-3" />
          <div className="bf-bonfire-ember bf-bonfire-ember-4" />
        </div>

        {/* ─── Next trial card ────────────────────────────────── */}
        <div className="bf-next-card slide-in" style={{animationDelay: '900ms'}}>
          <div className="bf-next-label">
            <span className="bf-next-sigil">◈</span>
            <span>Next Trial</span>
            <span className="bf-next-sigil">◈</span>
          </div>
          <div className="bf-next-name">{nextZoneName}</div>
          <div className="bf-next-sub">{nextZoneSubtitle}</div>
        </div>

        {/* Continue hint — only clickable after the 1.4 s grace window */}
        <div className={`bf-continue ${canAdvance ? 'is-ready' : ''}`}>
          <span className="bf-continue-arrow">❯</span>
          <span>Press any key to continue</span>
          <span className="bf-continue-arrow">❮</span>
        </div>
      </div>
    </div>
  );
}
