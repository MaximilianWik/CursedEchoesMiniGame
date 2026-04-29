/**
 * BossSelect — one-time fork in the road at the end of Undead Burg.
 *
 * Shown ONCE per save file (gated by `abyss_boss_select_seen` in localStorage).
 * Presents two panels: the canonical Taurus Demon (gothic) and the secret
 * AfroMan (psychedelic). The player's choice is persisted — every subsequent
 * run skips this screen and routes directly to the remembered boss.
 *
 * Keyboard:
 *   ← → / A D  — move focus between panels
 *   Enter / Space — commit
 *   Tab — toggle focus
 *
 * Mouse:
 *   hover to focus, click to commit.
 */

import {useEffect, useRef, useState} from 'react';
import type {BossSelectChoice} from '../game/settings';

export type {BossSelectChoice};

export type BossSelectProps = {
  onPick: (choice: BossSelectChoice) => void;
  /** Which panel to focus on mount. Used to pre-select the player's last
   *  pick when the fork re-appears on a replay. Omit for default (Taurus). */
  initialChoice?: BossSelectChoice;
};

const PANELS: {
  id: BossSelectChoice;
  name: string;
  title: string;
  lore: string;
  accent: string;
  sideClass: string;
  emblem: string;
}[] = [
  {
    id: 'taurus',
    name: 'TAURUS DEMON',
    title: 'Beast of the Ramparts',
    lore:
      'Long-stirred in the rubble. The stones remember its charge — and still ache at its passing. Carved from the fallen, horned and hungering, it waits upon the wall.',
    accent: '#b4501c',
    sideClass: 'bs-panel-taurus',
    emblem: '◈',
  },
  {
    id: 'afroman',
    name: 'AFROMAN',
    title: 'The Afroholic King',
    lore:
      'He wandered in from a dimension where the First Flame is a spliff and the Kiln is a house party. He brings tall cans, questionable dance moves, and a bassline the Undead Burg\u2019s stones were never meant to hear.',
    accent: '#ff4fb3',
    sideClass: 'bs-panel-afroman',
    emblem: '✦',
  },
];

export function BossSelect({onPick, initialChoice}: BossSelectProps) {
  // Match `initialChoice` against the PANELS order so the pre-focus is
  // schema-stable even if the array gets reordered later. Falls back to 0
  // (Taurus) when initialChoice is missing / unrecognized.
  const initialFocus: 0 | 1 = initialChoice
    ? (PANELS.findIndex(p => p.id === initialChoice) === 1 ? 1 : 0)
    : 0;
  const [focus, setFocus] = useState<0 | 1>(initialFocus);
  const [committing, setCommitting] = useState<BossSelectChoice | null>(null);
  const mountedAt = useRef(performance.now());

  // Keyboard nav. Also blocks the global keydown router via preventDefault
  // on Enter/Arrows so the mobile-input relay below doesn't eat them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (committing) return;
      // Debounce: first ~400ms after mount, ignore keystrokes (skips any key
      // that was still in-flight from the zone loop).
      if (performance.now() - mountedAt.current < 400) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setFocus(0);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setFocus(1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setFocus(f => (f === 0 ? 1 : 0));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        commit(PANELS[focus].id);
      }
    };
    // Capture-phase so we beat the game's global handler.
    window.addEventListener('keydown', onKey, {capture: true});
    return () => window.removeEventListener('keydown', onKey, {capture: true});
  }, [focus, committing]);

  function commit(id: BossSelectChoice) {
    if (committing) return;
    setCommitting(id);
    // Small dramatic beat before we hand off so the commit animation plays.
    window.setTimeout(() => onPick(id), 650);
  }

  return (
    <div className="absolute top-0 left-0 w-full h-full z-[58] overflow-hidden bs-root">
      <div className="bs-backdrop" aria-hidden />
      <div className="bs-ember-stream" aria-hidden />

      <div className="relative h-full w-full flex flex-col items-center justify-center">
        <div className="bs-title-block">
          <div className="bs-subtitle">A fork in the trial</div>
          <h1 className="bs-title">CHOOSE THY FOE</h1>
          <div className="bs-flavor">The abyss watches either road.</div>
        </div>

        <div className="bs-panels">
          {PANELS.map((p, i) => {
            const isFocused = focus === i;
            const isCommitted = committing === p.id;
            const isFaded = committing !== null && committing !== p.id;
            return (
              <button
                type="button"
                key={p.id}
                className={`bs-panel ${p.sideClass} ${isFocused ? 'is-focused' : ''} ${isCommitted ? 'is-committed' : ''} ${isFaded ? 'is-faded' : ''}`}
                style={{animationDelay: (i === 0 ? '0ms' : '160ms')}}
                onMouseEnter={() => !committing && setFocus(i as 0 | 1)}
                onFocus={() => !committing && setFocus(i as 0 | 1)}
                onClick={() => commit(p.id)}
              >
                <div className="bs-panel-inner">
                  <div className="bs-panel-scene" aria-hidden />
                  <div className="bs-panel-emblem" style={{color: p.accent, textShadow: `0 0 22px ${p.accent}`}}>{p.emblem}</div>
                  <div className="bs-panel-title" style={{color: p.accent}}>{p.name}</div>
                  <div className="bs-panel-subtitle">{p.title}</div>
                  <div className="bs-panel-lore">{p.lore}</div>
                  <div className="bs-panel-cta" style={{color: p.accent}}>
                    {isCommitted ? 'CHOSEN' : 'CONFRONT'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Gothic filigree divider */}
        <div className="bs-divider" aria-hidden>
          <div className="bs-divider-line" />
          <div className="bs-divider-sigil">◆</div>
          <div className="bs-divider-line" />
        </div>

        <div className="bs-hint">
          <span className="bs-kbd">←</span>
          <span className="bs-kbd">→</span>
          <span>to consider · </span>
          <span className="bs-kbd">ENTER</span>
          <span>to commit</span>
        </div>

        {initialChoice && (
          <div className="bs-warn">
            <span>Last chosen: <strong>{initialChoice === 'afroman' ? 'AfroMan' : 'Taurus Demon'}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
