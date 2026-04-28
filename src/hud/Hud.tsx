/**
 * HUD — health, souls, dodge stamina, combo rank, zone name, accuracy (top-left).
 * Estus is rendered separately (bottom-left) to keep the top block breathable.
 * Driven by a 10 Hz tick from the game loop.
 */

import {memo, useEffect, useRef, useState} from 'react';
import type {Rank} from '../graphics';

export type HudStats = {
  score: number;
  health: number;
  maxHealth: number;
  combo: number;
  maxCombo: number;
  difficulty: number;
  accuracy: number;
  isBlessed: boolean;
  currentRank: Rank;
  estusCharges: number;
  estusMax: number;
  estusActive: boolean;
  stamina: number;
  maxStamina: number;
  zoneName: string;
  zoneSubtitle: string;
  zoneTimeLeft: number;
  zoneDuration: number;
  bossActive: boolean;
};

export const Hud = memo(function Hud({stats}: {stats: HudStats}) {
  const hpPct = (stats.health / stats.maxHealth) * 100;
  const stamPct = (stats.stamina / stats.maxStamina) * 100;
  const lowHp = stats.health <= 3;
  const zonePct = stats.zoneDuration > 0
    ? Math.max(0, Math.min(100, ((stats.zoneDuration - stats.zoneTimeLeft) / stats.zoneDuration) * 100))
    : 0;
  const flameCalls = !stats.bossActive && stats.zoneTimeLeft > 0 && stats.zoneTimeLeft <= 10;
  const showZoneProgress = !stats.bossActive && stats.zoneDuration > 0;

  // Detect rank changes and trigger a one-shot animation on the rank image.
  const [rankChangeKey, setRankChangeKey] = useState(0);
  const prevRank = useRef(stats.currentRank.id);
  useEffect(() => {
    if (prevRank.current !== stats.currentRank.id) {
      prevRank.current = stats.currentRank.id;
      setRankChangeKey(k => k + 1);
    }
  }, [stats.currentRank.id]);

  return (
    <>
      {/* ───── Top-left block: HP / stamina / souls / zone / combo ───── */}
      <div className="absolute top-8 left-8 flex flex-col gap-2 z-30 pointer-events-none select-none max-w-[360px]">
        {stats.isBlessed && (
          <div className="text-xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest animate-pulse drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] mb-1">
            BLESSED BY GODESS
          </div>
        )}

        {/* HP bar */}
        <div className={`relative h-4 w-[300px] border transition-all duration-300 ${
          stats.isBlessed
            ? 'bg-[#1a000d] border-[#ff80cc] shadow-[0_0_20px_rgba(255,128,204,0.8)]'
            : lowHp
              ? 'bg-[#1a0a0a] border-[#ff3030] shadow-[0_0_18px_rgba(255,30,30,0.7)] animate-pulse'
              : 'bg-[#1a0a0a] border-[#3d1a1a]'
        }`}>
          <div
            className={`h-full transition-all duration-300 ${
              stats.isBlessed
                ? 'bg-linear-to-r from-[#ff0080] to-[#ff80cc]'
                : 'bg-linear-to-r from-[#8b0000] to-[#ff0000]'
            }`}
            style={{width: `${hpPct}%`}}
          />
          <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(90deg,transparent_0,transparent_28px,rgba(0,0,0,0.35)_28px,rgba(0,0,0,0.35)_30px)]" />
        </div>

        {/* Dodge stamina bar */}
        <div className="relative h-2 w-[220px] border border-emerald-900/60 bg-emerald-950/30 mt-1">
          <div
            className="h-full bg-gradient-to-r from-emerald-700 to-lime-400 transition-all"
            style={{width: `${stamPct}%`}}
          />
        </div>

        {/* Souls / difficulty / accuracy */}
        <div className="text-xl opacity-70 font-[Cinzel] hud-glow">Souls: {stats.score.toString().padStart(6, '0')}</div>
        <div className="text-xs opacity-60 font-[Cinzel] tracking-[0.3em] uppercase">
          {stats.zoneName} · Difficulty {stats.difficulty}
        </div>
        <div className="text-sm opacity-60 font-[Cinzel]">Accuracy: {stats.accuracy}%</div>

        {/* Zone-progress bar (hidden during boss) */}
        {showZoneProgress && (
          <div className="flex items-center gap-2 mt-1">
            <div className="relative h-1.5 w-[240px] border border-amber-900/50 bg-amber-950/40">
              <div
                className="h-full bg-gradient-to-r from-amber-800 to-amber-400 transition-all"
                style={{width: `${zonePct}%`}}
              />
            </div>
            <span className="text-[10px] text-amber-700/80 font-mono tracking-widest">
              {Math.ceil(stats.zoneTimeLeft)}s
            </span>
          </div>
        )}
        {flameCalls && (
          <div className="text-xs text-amber-400 font-[Cinzel] tracking-[0.4em] uppercase animate-pulse drop-shadow-[0_0_10px_rgba(255,170,60,0.6)]">
            ◈ The flame calls ◈
          </div>
        )}

        {/* Combo rank image — animates on rank change. */}
        <div className="flex flex-col items-start gap-1 mt-2">
          <img
            key={rankChangeKey}
            src={`/${stats.currentRank.id}-removebg-preview.png`}
            alt={stats.currentRank.label}
            className={`h-20 object-contain rank-icon ${stats.currentRank.id === 'SSS' ? 'rank-icon-sss' : ''}`}
            draggable={false}
          />
          <div className={`text-xl font-[Cinzel] hud-glow ${stats.combo > 0 ? 'opacity-80' : 'opacity-50'}`}>
            x{stats.combo}
          </div>
        </div>
      </div>

      {/* ───── Bottom-left block: estus flasks ───── */}
      <div className="absolute bottom-8 left-8 flex flex-col items-start gap-2 z-30 pointer-events-none select-none">
        <div className="flex items-end gap-2">
          {Array.from({length: stats.estusMax}).map((_, i) => {
            const filled = i < stats.estusCharges;
            const draining = stats.estusActive && i === stats.estusCharges;
            return (
              <div
                key={i}
                className={`relative w-8 h-12 border-2 transition-all ${
                  filled
                    ? 'border-amber-500 bg-gradient-to-t from-orange-700 to-amber-400 shadow-[0_0_12px_rgba(220,140,40,0.7)]'
                    : 'border-amber-900/60 bg-amber-950/30'
                } ${draining ? 'estus-drain' : ''}`}
                style={{clipPath: 'polygon(35% 0, 65% 0, 82% 16%, 85% 100%, 15% 100%, 18% 16%)'}}
              />
            );
          })}
        </div>
        <span className="text-xs text-amber-600/80 font-[Cinzel] tracking-[0.4em] uppercase">
          ESTUS {stats.estusCharges}/{stats.estusMax}
        </span>
      </div>
    </>
  );
});
