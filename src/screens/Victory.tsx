/**
 * Victory screen — after Gwyn falls. Same stats structure as GameOver but
 * titled triumphantly and framed in gold.
 */

import type {ReactNode} from 'react';
import type {Rank} from '../graphics';
import type {RunStats, DerivedStats} from '../game/stats';
import {APP_VERSION} from '../version';

export type VictoryScreenProps = {
  finalScore: number;
  maxCombo: number;
  topRank: Rank;
  stats: RunStats;
  derived: DerivedStats;
  onTryAgain: () => void;
  onOpenDev: () => void;
};

export function VictoryScreen(props: VictoryScreenProps) {
  const {finalScore, maxCombo, topRank, stats, derived, onTryAgain, onOpenDev} = props;
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black z-50 flex flex-col items-center justify-center fade-in ce-victory-bg">
      <div className="ce-victory-rays" aria-hidden />
      <h1 className="font-[Cinzel] font-bold text-5xl md:text-6xl text-amber-300 tracking-[0.2em] whitespace-nowrap ce-victory-title">
        VICTORY ACHIEVED
      </h1>
      <p className="text-amber-200/70 font-serif italic tracking-wider mt-3 mb-10 ce-victory-sub">
        The First Flame is yours to kindle.
      </p>

      <div className="grid grid-cols-2 gap-x-12 gap-y-1 text-amber-100/80 font-[Cinzel] text-sm tracking-widest">
        <StatLine label="Souls" value={finalScore.toLocaleString()} />
        <StatLine label="Max Combo" value={String(maxCombo)} trailing={<img src={`/${topRank.id}-removebg-preview.png`} alt={topRank.label} className="inline h-7 object-contain ml-2" />} />
        <StatLine label="Accuracy" value={derived.accuracy + '%'} />
        <StatLine label="WPM" value={String(derived.wpm)} />
        <StatLine label="Time" value={derived.secondsSurvivedLabel} />
        <StatLine label="Bosses felled" value={String(stats.bossesDefeated)} />
        <StatLine label="Words banished" value={String(stats.wordsKilled)} />
        <StatLine label="Projectiles parried" value={String(stats.projectilesDeflected)} />
        <StatLine label="Dodges" value={String(stats.dodgesSuccessful)} />
        <StatLine label="Estus drunk" value={String(stats.estusDrunk)} />
      </div>

      <button
        onClick={onTryAgain}
        className="mt-12 px-12 py-3 border border-amber-500 text-amber-300 hover:bg-amber-900/30 hover:border-amber-200 transition-all uppercase tracking-[0.4em] font-[Cinzel] shadow-[0_0_25px_rgba(255,200,80,0.35)]"
      >
        Begin Anew
      </button>
      <button
        onClick={onOpenDev}
        className="absolute bottom-6 left-6 z-[65] px-3 py-1.5 border border-emerald-700/70 bg-black/60 text-emerald-300 hover:text-emerald-100 hover:border-emerald-400 font-[Cinzel] text-[10px] tracking-[0.4em] uppercase"
      >
        ◇ DEV
      </button>

      {/* Version badge — bottom-right corner, gold-tinted to match the victory frame. */}
      <div className="absolute bottom-6 right-6 z-[65] font-[Cinzel] text-[10px] tracking-[0.4em] uppercase text-amber-500/60 select-none">
        v{APP_VERSION}
      </div>
    </div>
  );
}

function StatLine({label, value, trailing}: {label: string; value: string; trailing?: ReactNode}) {
  return (
    <>
      <span className="text-amber-600/70 uppercase text-[10px] tracking-[0.4em] text-right">{label}</span>
      <span className="text-amber-100 flex items-center">{value}{trailing}</span>
    </>
  );
}
