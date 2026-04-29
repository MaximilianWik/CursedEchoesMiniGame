/**
 * GameOver — the post-death reveal.
 *
 * Kept elements (all of them, just better dressed):
 *   • "YOU DIED" dramatic reveal (unchanged timing)
 *   • Run stats (souls, max combo w/ rank badge, accuracy, WPM, time, zone,
 *     bosses felled, words banished, projectiles parried, dodges, estus,
 *     deadliest letter)
 *   • Combo-over-time graph
 *   • Secret-route badge if the player took the fork
 *   • Hall of Records
 *   • Secret password affordance (ILOVEMYGF → onUnlock)
 *   • Try Again button + Dev console button + version pill
 *
 * Layout: YOU DIED as the hero, then three gothic parchment-style columns
 * side-by-side — RUN (featured numbers), TRIAL (full stat inventory), and
 * RECORDS (Hall of Records). Combo graph runs as a banner beneath the
 * columns, the secret-password affordance gets a proper framed gate under
 * that, and the Try Again CTA anchors the bottom.
 */

import {useEffect, useRef} from 'react';
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

  // ── Combo-over-time graph — wider + prettier than before. Amber instead
  //    of red so it reads as "story of the run", not a second death cue.
  useEffect(() => {
    const c = graphRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 620, H = 96;
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + 'px'; c.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Grid lines (faint horizontal bands at 25/50/75% of max).
    ctx.strokeStyle = 'rgba(180, 100, 40, 0.14)';
    ctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) {
      const y = (H - 8) * (1 - g / 4) + 4;
      ctx.beginPath();
      ctx.moveTo(8, y); ctx.lineTo(W - 8, y);
      ctx.stroke();
    }

    const pts = stats.comboOverTime;
    if (pts.length < 2) {
      // Empty-state — centered italic text.
      ctx.fillStyle = 'rgba(180, 130, 60, 0.5)';
      ctx.font = 'italic 12px "EB Garamond", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Not enough combo to remember', W / 2, H / 2);
      return;
    }
    const maxC = Math.max(10, ...pts.map(p => p.combo));
    const minT = pts[0].t;
    const maxT = pts[pts.length - 1].t;
    const xRange = Math.max(1, maxT - minT);

    // Area fill under the curve — amber gradient.
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = 8 + ((pts[i].t - minT) / xRange) * (W - 16);
      const y = H - (pts[i].combo / maxC) * (H - 14) - 6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(W - 8, H - 4);
    ctx.lineTo(8, H - 4);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255, 170, 80, 0.28)');
    grad.addColorStop(1, 'rgba(255, 170, 80, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Curve line — amber, glowing.
    ctx.strokeStyle = '#ffb055';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff8030';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = 8 + ((pts[i].t - minT) / xRange) * (W - 16);
      const y = H - (pts[i].combo / maxC) * (H - 14) - 6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Peak marker — small circle + label at the max combo.
    let peakIdx = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].combo > pts[peakIdx].combo) peakIdx = i;
    const px = 8 + ((pts[peakIdx].t - minT) / xRange) * (W - 16);
    const py = H - (pts[peakIdx].combo / maxC) * (H - 14) - 6;
    ctx.fillStyle = '#fff2d0';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffb055';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
  }, [stats.comboOverTime]);

  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black z-50 flex flex-col items-center ce-death-bg overflow-hidden fade-in">
      <div className="ce-death-embers" aria-hidden />
      <div className="ce-died-vignette" aria-hidden />

      {/* Hero — YOU DIED reveal + optional secret-route badge */}
      <div className="relative flex flex-col items-center mt-8 mb-3">
        <div className="ce-died-smoke" aria-hidden />
        <div className="ce-died">YOU DIED</div>
        {(stats.secretBossChosen || stats.secretBossDefeated) && (
          <div
            className="go-secret-badge slide-in"
            style={{animationDelay: '2400ms'}}
          >
            <span className="go-secret-sigil">★</span>
            <span>
              Secret Route — {stats.secretBossDefeated ? 'AfroMan felled' : 'AfroMan challenged'}
            </span>
            <span className="go-secret-sigil">★</span>
          </div>
        )}
      </div>

      {/* Three-column main plate */}
      <div className="go-columns slide-in" style={{animationDelay: '2200ms'}}>
        {/* ─── Column 1 — THE RUN (featured numbers) ─── */}
        <section className="go-card go-card-run">
          <GothicHeader>The Run</GothicHeader>

          <div className="go-hero-stat">
            <div className="go-hero-label">Souls</div>
            <div className="go-hero-value go-hero-value-xl">{finalScore.toLocaleString()}</div>
          </div>

          <div className="go-divider" />

          <div className="go-hero-stat">
            <div className="go-hero-label">Max Combo</div>
            <div className="go-hero-value flex items-center gap-3 justify-center">
              <span>{maxCombo}</span>
              <img
                src={`/${topRank.id}-removebg-preview.png`}
                alt={topRank.label}
                className="h-10 object-contain drop-shadow-[0_0_12px_rgba(255,180,80,0.55)]"
              />
            </div>
            <div className="go-hero-sublabel">{topRank.label}</div>
          </div>

          <div className="go-divider" />

          <div className="go-hero-row">
            <div className="go-hero-micro">
              <div className="go-hero-label">Time</div>
              <div className="go-hero-value">{derived.secondsSurvivedLabel}</div>
            </div>
            <div className="go-hero-micro">
              <div className="go-hero-label">Fell in</div>
              <div className="go-hero-value go-hero-value-zone">{zoneName}</div>
            </div>
          </div>
        </section>

        {/* ─── Column 2 — THE TRIAL (detailed inventory) ─── */}
        <section className="go-card go-card-trial">
          <GothicHeader>The Trial</GothicHeader>

          <div className="go-stat-grid">
            <TrialStat label="Accuracy"     value={derived.accuracy + '%'} />
            <TrialStat label="Words / min"  value={String(derived.wpm)} />
            <TrialStat label="Bosses felled"       value={String(stats.bossesDefeated)} />
            <TrialStat label="Words banished"      value={String(stats.wordsKilled)} />
            <TrialStat label="Projectiles parried" value={String(stats.projectilesDeflected)} />
            <TrialStat label="Dodges"              value={String(stats.dodgesSuccessful)} />
            <TrialStat label="Estus drunk"         value={String(stats.estusDrunk)} />
            {stats.secretBossDefeated && (
              <TrialStat label="Perfect parries"   value={String(stats.perfectParries)} accent="secret" />
            )}
            <TrialStat
              label="Deadliest letter"
              value={stats.deadliestLetter || '—'}
              accent="danger"
            />
          </div>
        </section>

        {/* ─── Column 3 — HALL OF RECORDS ─── */}
        <section className="go-card go-card-records">
          <GothicHeader>Hall of Records</GothicHeader>

          {highscores.length === 0 ? (
            <div className="go-records-empty">
              <div className="go-records-sigil">◈</div>
              <p>No legendary souls yet.</p>
              <p className="italic opacity-60">The ledger waits.</p>
            </div>
          ) : (
            <div className="go-records-list">
              {highscores.map((hs, i) => (
                <div
                  key={i}
                  className={`go-record ${finalScore > 0 && hs.souls === finalScore && hs.maxCombo === maxCombo ? 'is-current' : ''}`}
                >
                  <div className="go-record-rank">{romanize(i + 1)}</div>
                  <div className="go-record-body">
                    <div className="go-record-souls">{hs.souls.toLocaleString()}</div>
                    <div className="go-record-meta">
                      <span>Max combo</span>
                      <span className="go-record-meta-value">{hs.maxCombo}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Combo-over-time graph — wider banner under the columns */}
      <div className="go-graph-frame slide-in" style={{animationDelay: '2600ms'}}>
        <div className="go-graph-header">
          <span className="go-graph-title">Combo over time</span>
          <span className="go-graph-peak">peak {maxCombo}</span>
        </div>
        <canvas ref={graphRef} className="go-graph-canvas" />
      </div>

      {/* Secret-password gate — framed, clearly an affordance now. */}
      <form
        className="go-secret-gate slide-in"
        style={{animationDelay: '2900ms'}}
        onSubmit={(e) => {
          e.preventDefault();
          if (secretPassword.toUpperCase() === 'ILOVEMYGF') onUnlock();
          else {
            setPasswordError(true);
            window.setTimeout(() => setPasswordError(false), 500);
            setSecretPassword('');
          }
        }}
      >
        <span className="go-secret-gate-label">Secret Password</span>
        <input
          type="password"
          value={secretPassword}
          onChange={(e) => setSecretPassword(e.target.value)}
          className={`go-secret-gate-input ${passwordError ? 'is-error animate-[shake_0.5s_ease-in-out]' : ''}`}
          placeholder="..."
          aria-label="Secret password"
        />
      </form>

      {/* Primary CTA */}
      <button
        onClick={onTryAgain}
        className="go-try-again opacity-0 fade-in"
        style={{animationDelay: '3200ms'}}
      >
        <span className="go-try-again-sigil">◈</span>
        Try Again
        <span className="go-try-again-sigil">◈</span>
      </button>

      {/* Dev button — bottom-left, unchanged role */}
      <button
        onClick={onOpenDev}
        className="absolute bottom-5 left-5 z-[65] px-3 py-1.5 border border-emerald-700/70 bg-black/60 text-emerald-300 hover:text-emerald-100 hover:border-emerald-400 font-[Cinzel] text-[10px] tracking-[0.4em] uppercase opacity-0 fade-in"
        style={{animationDelay: '3400ms'}}
      >
        ◇ DEV
      </button>

      {/* Version pill — bottom-right */}
      <div className="absolute bottom-5 right-5 px-3 py-1.5 border border-amber-600/80 bg-black/70 rounded-sm font-[Cinzel] text-[11px] tracking-[0.4em] uppercase text-amber-300 shadow-[0_0_14px_rgba(255,180,60,0.35)] select-none">
        v{APP_VERSION}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Presentational primitives
// ─────────────────────────────────────────────────────────────

function GothicHeader({children}: {children: React.ReactNode}) {
  return (
    <div className="go-card-header">
      <span className="go-card-sigil">◈</span>
      <h2>{children}</h2>
      <span className="go-card-sigil">◈</span>
    </div>
  );
}

type TrialAccent = 'default' | 'danger' | 'secret';

function TrialStat({label, value, accent = 'default'}: {label: string; value: string; accent?: TrialAccent}) {
  return (
    <div className={`go-stat go-stat-${accent}`}>
      <span className="go-stat-label">{label}</span>
      <span className="go-stat-dots" aria-hidden />
      <span className="go-stat-value">{value}</span>
    </div>
  );
}

/** Map 1..5 to I..V — a tiny flourish on the Hall of Records ranks. */
function romanize(n: number): string {
  const roman: Record<number, string> = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V'};
  return roman[n] ?? String(n);
}
