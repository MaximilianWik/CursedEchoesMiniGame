/**
 * Victory — the cathedral reveal after Gwyn (or the final canonical boss)
 * falls. Cinematic, gold/cinder palette, staged reveal.
 *
 * Layout top-to-bottom:
 *   1. Cathedral backdrop (archway silhouette, rose window, god rays,
 *      floating ash particles)
 *   2. Sigil divider + "VICTORY ACHIEVED" + subtitle
 *   3. Secret-route badge (AfroMan also felled — optional)
 *   4. Hero bonfire centrepiece — multi-layer flame pillar with halo
 *   5. Three gothic stat cards (The Ascent / The Pilgrimage / Accolades)
 *   6. "Begin Anew" CTA with flanking sigils
 *   7. Dev + version pills in the corners (unchanged)
 *
 * Every beat has a staggered delay matching the existing GameOver cadence
 * (2200 / 2400 / 2600 / 2900 / 3200 / 3400 ms) so the two end-state
 * screens feel like siblings.
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

  // Derived accolades — pills shown in the right-hand card when criteria
  // are met. Keeps the victory feeling earned by surfacing what the
  // player actually did beyond just clearing the run.
  const accolades: {label: string; detail: string; accent: 'gold' | 'secret' | 'cinder' | 'steel'}[] = [];
  accolades.push({
    label: 'LORD OF CINDER',
    detail: 'Gwyn has been linked.',
    accent: 'cinder',
  });
  if (stats.secretBossDefeated) {
    accolades.push({
      label: 'SECRET ROUTE',
      detail: 'AfroMan felled in the cypher.',
      accent: 'secret',
    });
  }
  if (derived.accuracy >= 95) {
    accolades.push({
      label: 'IMMACULATE',
      detail: `${derived.accuracy}% accuracy — no wasted strokes.`,
      accent: 'gold',
    });
  }
  if (stats.perfectParries >= 5) {
    accolades.push({
      label: 'PERFECT TIMING',
      detail: `${stats.perfectParries} beat-perfect parries.`,
      accent: 'gold',
    });
  }
  if (topRank.id === 'S' || topRank.id === 'SS' || topRank.id === 'SSS') {
    accolades.push({
      label: topRank.id + ' RANK',
      detail: topRank.label,
      accent: 'steel',
    });
  }
  if (stats.dodgesSuccessful >= 20) {
    accolades.push({
      label: 'NIMBLE',
      detail: `${stats.dodgesSuccessful} successful dodges.`,
      accent: 'steel',
    });
  }

  return (
    <div className="absolute top-0 left-0 w-full h-full z-50 overflow-hidden fade-in vic-root">
      {/* ─── Cathedral backdrop ─────────────────────────────────── */}
      <div className="vic-sky" aria-hidden />
      <div className="vic-rose-window" aria-hidden />
      <div className="vic-rays" aria-hidden />
      <div className="vic-arch" aria-hidden />
      <div className="vic-pillars-left" aria-hidden />
      <div className="vic-pillars-right" aria-hidden />
      <div className="vic-stained-left" aria-hidden />
      <div className="vic-stained-right" aria-hidden />
      <div className="vic-ash" aria-hidden />
      <div className="vic-floor-shine" aria-hidden />

      {/* ─── Scrollable content — vertical stack ───────────────── */}
      <div className="relative z-[2] h-full w-full flex flex-col items-center justify-start pt-6 px-6">
        {/* Top sigil + title block */}
        <div className="vic-title-block">
          <div className="vic-sigil vic-sigil-top" aria-hidden>
            <span>✦</span><span className="vic-sigil-line" /><span>◆</span><span className="vic-sigil-line" /><span>✦</span>
          </div>
          <h1 className="vic-title">VICTORY ACHIEVED</h1>
          <p className="vic-sub">The First Flame is yours to kindle.</p>
          {stats.secretBossDefeated && (
            <div className="vic-secret-badge slide-in" style={{animationDelay: '2400ms'}}>
              <span className="vic-secret-sigil">★</span>
              <span>Secret Route — AfroMan felled</span>
              <span className="vic-secret-sigil">★</span>
            </div>
          )}
        </div>

        {/* Hero bonfire — multi-layer cathedral flame */}
        <div className="vic-bonfire slide-in" style={{animationDelay: '2200ms'}} aria-hidden>
          <div className="vic-bonfire-halo" />
          <div className="vic-bonfire-rays" />
          <div className="vic-bonfire-core" />
          <div className="vic-bonfire-flame vic-bonfire-flame-1" />
          <div className="vic-bonfire-flame vic-bonfire-flame-2" />
          <div className="vic-bonfire-flame vic-bonfire-flame-3" />
          <div className="vic-bonfire-sword" />
          <div className="vic-bonfire-logs" />
          <div className="vic-bonfire-ember vic-bonfire-ember-1" />
          <div className="vic-bonfire-ember vic-bonfire-ember-2" />
          <div className="vic-bonfire-ember vic-bonfire-ember-3" />
        </div>

        {/* ─── Three-column gothic stat plate ───────────────────── */}
        <div className="vic-columns slide-in" style={{animationDelay: '2600ms'}}>
          {/* Column 1 — THE ASCENT (featured numbers) */}
          <section className="vic-card vic-card-ascent">
            <GothicHeader>The Ascent</GothicHeader>
            <div className="vic-hero-stat">
              <div className="vic-hero-label">Souls</div>
              <div className="vic-hero-value vic-hero-value-xl">{finalScore.toLocaleString()}</div>
            </div>
            <div className="vic-divider" />
            <div className="vic-hero-stat">
              <div className="vic-hero-label">Max Combo</div>
              <div className="vic-hero-value flex items-center gap-3 justify-center">
                <span>{maxCombo}</span>
                <img
                  src={`/${topRank.id}-removebg-preview.png`}
                  alt={topRank.label}
                  className="h-10 object-contain drop-shadow-[0_0_12px_rgba(255,210,140,0.6)]"
                />
              </div>
              <div className="vic-hero-sublabel">{topRank.label}</div>
            </div>
            <div className="vic-divider" />
            <div className="vic-hero-stat">
              <div className="vic-hero-label">Time</div>
              <div className="vic-hero-value">{derived.secondsSurvivedLabel}</div>
            </div>
          </section>

          {/* Column 2 — THE PILGRIMAGE (full inventory) */}
          <section className="vic-card vic-card-trial">
            <GothicHeader>The Pilgrimage</GothicHeader>
            <div className="vic-stat-grid">
              <TrialStat label="Accuracy"          value={derived.accuracy + '%'} />
              <TrialStat label="Words / min"       value={String(derived.wpm)} />
              <TrialStat label="Bosses felled"     value={String(stats.bossesDefeated)} />
              <TrialStat label="Words banished"    value={String(stats.wordsKilled)} />
              <TrialStat label="Projectiles parried" value={String(stats.projectilesDeflected)} />
              <TrialStat label="Dodges"            value={String(stats.dodgesSuccessful)} />
              <TrialStat label="Estus drunk"       value={String(stats.estusDrunk)} />
              {stats.perfectParries > 0 && (
                <TrialStat label="Perfect parries" value={String(stats.perfectParries)} accent="secret" />
              )}
              {stats.biggestHit > 0 && (
                <TrialStat label="Biggest hit taken" value={String(stats.biggestHit)} accent="danger" />
              )}
            </div>
          </section>

          {/* Column 3 — ACCOLADES (title pills) */}
          <section className="vic-card vic-card-accolades">
            <GothicHeader>Accolades</GothicHeader>
            <div className="vic-accolade-list">
              {accolades.map((a, i) => (
                <div
                  key={i}
                  className={`vic-accolade vic-accolade-${a.accent}`}
                  style={{animationDelay: `${2700 + i * 120}ms`}}
                >
                  <div className="vic-accolade-title">{a.label}</div>
                  <div className="vic-accolade-detail">{a.detail}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ─── Primary CTA ──────────────────────────────────────── */}
        <button
          onClick={onTryAgain}
          className="vic-begin-anew opacity-0 fade-in"
          style={{animationDelay: '3200ms'}}
          autoFocus
        >
          <span className="vic-begin-sigil">✦</span>
          Begin Anew
          <span className="vic-begin-sigil">✦</span>
        </button>
      </div>

      {/* Dev button — bottom-left, unchanged role */}
      <button
        onClick={onOpenDev}
        className="absolute bottom-5 left-5 z-[65] px-3 py-1.5 border border-emerald-700/70 bg-black/60 text-emerald-300 hover:text-emerald-100 hover:border-emerald-400 font-[Cinzel] text-[10px] tracking-[0.4em] uppercase opacity-0 fade-in"
        style={{animationDelay: '3400ms'}}
      >
        ◇ DEV
      </button>

      {/* Version pill — bottom-right, gold to match the victory frame */}
      <div className="absolute bottom-5 right-5 z-[65] px-3 py-1.5 border border-amber-400/80 bg-black/70 rounded-sm font-[Cinzel] text-[11px] tracking-[0.4em] uppercase text-amber-200 shadow-[0_0_16px_rgba(255,210,100,0.45)] select-none">
        v{APP_VERSION}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Presentational primitives — mirrors GameOver's gothic header
// pattern so both end-state screens feel like siblings.
// ─────────────────────────────────────────────────────────────

function GothicHeader({children}: {children: ReactNode}) {
  return (
    <div className="vic-card-header">
      <span className="vic-card-sigil">✦</span>
      <h2>{children}</h2>
      <span className="vic-card-sigil">✦</span>
    </div>
  );
}

type TrialAccent = 'default' | 'danger' | 'secret';

function TrialStat({label, value, accent = 'default'}: {label: string; value: string; accent?: TrialAccent}) {
  return (
    <div className={`vic-stat vic-stat-${accent}`}>
      <span className="vic-stat-label">{label}</span>
      <span className="vic-stat-dots" aria-hidden />
      <span className="vic-stat-value">{value}</span>
    </div>
  );
}
