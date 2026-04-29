/**
 * AfromanIntro — 20 s cutscene overlay before the secret boss fight.
 *
 * Real implementation (sprite silhouette reveal, music fade-in, text beats)
 * is wired in step 4 of the 0.3.0 plan. This file acts as the mount point.
 */

import {useEffect, useRef, useState} from 'react';
import {playMusicSample, stopMusicSample} from '../game/audio';

export type AfromanIntroProps = {
  onComplete: () => void;
};

/** Text beats — [ms offset into intro, headline] */
const BEATS: {at: number; text: string; small?: boolean}[] = [
  {at: 0,     text: 'SECRET BOSS',            small: true},
  {at: 5000,  text: 'IS THAT...',             small: false},
  {at: 10000, text: 'AFROMAN ENTERS THE CYPHER'},
  {at: 16000, text: 'THE SET BEGINS'},
];

const INTRO_MS = 20000;
/** After this many ms the player is allowed to skip with any key or Escape. */
const SKIP_ALLOWED_AFTER_MS = 5000;

export function AfromanIntro({onComplete}: AfromanIntroProps) {
  const startAt = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  const completed = useRef(false);

  // Kick off the music sample at mount — we want the 20 s buildup of the
  // track to play over the cutscene.
  useEffect(() => {
    playMusicSample('afroman');
    return () => {
      // If we unmount without completing (e.g., the phase was abandoned via
      // a stray dev jump), stop the sample so it doesn't leak.
      if (!completed.current) stopMusicSample();
    };
  }, []);

  // rAF-driven timer for the intro.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const el = now - startAt.current;
      setElapsed(el);
      if (el >= INTRO_MS) {
        if (!completed.current) {
          completed.current = true;
          onComplete();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  // Skip handler — any key / click after SKIP_ALLOWED_AFTER_MS.
  useEffect(() => {
    const trySkip = () => {
      if (completed.current) return;
      if (performance.now() - startAt.current < SKIP_ALLOWED_AFTER_MS) return;
      completed.current = true;
      // Fast-forward the music by setting the sample's currentTime to the end
      // of the buildup. The audio layer exposes this via playMusicSample's
      // returned object; simplest: just let the sample keep playing — the
      // fight starts at the drop naturally if we align, but skipping means we
      // accept a small desync. Acceptable per the plan.
      onComplete();
    };
    const onKey = (e: KeyboardEvent) => {
      // Ignore purely modifier keys.
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      e.preventDefault();
      trySkip();
    };
    window.addEventListener('keydown', onKey, {capture: true});
    window.addEventListener('click', trySkip);
    return () => {
      window.removeEventListener('keydown', onKey, {capture: true});
      window.removeEventListener('click', trySkip);
    };
  }, [onComplete]);

  // Phase progression — each stage enables specific visual layers.
  const phase =
    elapsed < 5000  ? 'fade-in'
    : elapsed < 10000 ? 'silhouette'
    : elapsed < 16000 ? 'reveal'
    : 'drop';

  // Which text beat is current.
  const activeBeat = [...BEATS].reverse().find(b => elapsed >= b.at && elapsed < b.at + 5000);

  // Final intensity ramp for the psychedelic background (0..1).
  const psychT = Math.min(1, elapsed / INTRO_MS);

  // Canskip flag for the hint.
  const canSkip = elapsed >= SKIP_ALLOWED_AFTER_MS;

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden afi-root" data-phase={phase}>
      {/* Psychedelic background — concentric hue-cycling rings. */}
      <div
        className="afi-bg"
        style={{
          opacity: Math.min(1, elapsed / 4000),
          filter: `hue-rotate(${(psychT * 360).toFixed(0)}deg) saturate(${(0.6 + psychT * 0.8).toFixed(2)})`,
        }}
        aria-hidden
      />
      <div className="afi-rings" aria-hidden />

      {/* Giant speaker stacks pulsing at the stage edges. */}
      <div className="afi-speaker afi-speaker-left" aria-hidden />
      <div className="afi-speaker afi-speaker-right" aria-hidden />

      {/* AfroMan reveal — silhouette first, then full-color sprite. */}
      <div className="afi-sprite-wrap" aria-hidden>
        {phase === 'silhouette' && (
          <img
            src="/AfroManIDLE.png"
            alt=""
            className="afi-sprite afi-sprite-silhouette"
            draggable={false}
          />
        )}
        {(phase === 'reveal' || phase === 'drop') && (
          <img
            src="/AfroManIDLE.png"
            alt="AfroMan"
            className={`afi-sprite afi-sprite-full ${phase === 'drop' ? 'is-dropping' : ''}`}
            draggable={false}
          />
        )}
        {/* Spotlight beams from the stage speakers */}
        {(phase === 'reveal' || phase === 'drop') && (
          <>
            <div className="afi-spot afi-spot-left" aria-hidden />
            <div className="afi-spot afi-spot-right" aria-hidden />
          </>
        )}
      </div>

      {/* Active beat banner */}
      {activeBeat && (
        <div
          key={activeBeat.at}
          className={`afi-banner ${activeBeat.small ? 'is-small' : ''}`}
        >
          {activeBeat.text}
        </div>
      )}

      {/* Skip hint */}
      {canSkip && phase !== 'drop' && (
        <div className="afi-skip-hint">
          <span>Press any key to skip</span>
        </div>
      )}

      {/* Crash-in final vignette at the drop moment */}
      {elapsed >= 19600 && elapsed <= INTRO_MS && (
        <div className="afi-crash" aria-hidden />
      )}
    </div>
  );
}
