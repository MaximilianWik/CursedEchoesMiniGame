/**
 * RankUpBanner — a small toast-style announcement that slides in on the left,
 * tucked just under the HUD zone/combo block. Non-blocking, fades quickly.
 * Respects reduce-motion (static fade only).
 */

import {memo} from 'react';

export type RankUpEvent = {
  id: number;
  rankId: string;
  label: string;
  color: string;
  timestamp: number;
};

const RANK_COLORS: Record<string, string> = {
  D: '#aaaaaa', C: '#c0b090', B: '#d9a055',
  A: '#ffaa55', S: '#ff7744', SS: '#ff4488', SSS: '#00ddff',
};

export function rankColor(id: string): string { return RANK_COLORS[id] ?? '#ff7744'; }

export const RankUpBanner = memo(function RankUpBanner({event, reduceMotion}: {event: RankUpEvent | null; reduceMotion: boolean}) {
  if (!event) return null;
  const animClass = reduceMotion ? 'rank-toast-static' : 'rank-toast-slide';
  return (
    <div
      key={event.id}
      className={`absolute left-8 top-[320px] z-[55] pointer-events-none ${animClass}`}
      style={{ ['--rank-color' as string]: event.color } as React.CSSProperties}
    >
      <div className="rank-toast">
        <span className="rank-toast-bar" aria-hidden />
        <div className="flex flex-col leading-tight">
          <span className="rank-toast-sub">Rank {event.rankId}</span>
          <span className="rank-toast-label">{event.label}</span>
        </div>
      </div>
    </div>
  );
});
