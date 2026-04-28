/**
 * HUD — health, souls, estus, dodge stamina, combo rank, zone name, accuracy.
 * Driven by a 10 Hz tick from the game loop so it re-renders at most 10×/s.
 */

import {memo} from 'react';
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
  zoneTimeLeft: number;       // seconds until zone ends (0 during boss/no-timer)
  zoneDuration: number;       // total zone duration in seconds
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

  return (
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

      {/* Estus row */}
      <div className="flex items-center gap-1.5 mt-0.5">
        {Array.from({length: stats.estusMax}).map((_, i) => {
          const filled = i < stats.estusCharges;
          return (
            <div
              key={i}
              className={`relative w-4 h-6 border transition-all ${
                filled
                  ? 'border-amber-500 bg-gradient-to-t from-orange-700 to-amber-400 shadow-[0_0_8px_rgba(220,140,40,0.5)]'
                  : 'border-amber-900/60 bg-amber-950/30'
              } ${stats.estusActive && i === stats.estusCharges ? 'animate-pulse' : ''}`}
              style={{clipPath: 'polygon(30% 0, 70% 0, 85% 20%, 85% 100%, 15% 100%, 15% 20%)'}}
            />
          );
        })}
        <span className="text-xs text-amber-600/80 font-[Cinzel] tracking-widest ml-2">
          ESTUS {stats.estusCharges}/{stats.estusMax}
        </span>
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

      {/* Combo */}
      <div className="flex flex-col items-start gap-1 mt-2">
        <img
          src={`/${stats.currentRank.id}-removebg-preview.png`}
          alt={stats.currentRank.label}
          className={`h-18 object-contain ${stats.currentRank.id === 'SSS' ? 'animate-shake' : ''}`}
          draggable={false}
        />
        <div className={`text-xl font-[Cinzel] hud-glow ${stats.combo > 0 ? 'opacity-80' : 'opacity-50'}`}>
          x{stats.combo}
        </div>
      </div>
    </div>
  );
});
