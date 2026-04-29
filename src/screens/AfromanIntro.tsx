/**
 * AfromanIntro — 20 s cutscene overlay before the secret boss fight.
 *
 * Plays the song's 20-second intro buildup over a layered reveal of the
 * AfroMan sprite (silhouette → full colour) with staged text banners. Hands
 * off to enterBoss('afroman') when the timer hits INTRO_MS.
 *
 * 0.3.3 — no skip. The cutscene is a single uninterruptible beat so the
 * music and the drop always land together.
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

  // 0.3.3 — no skip handler. Any key/click during the cutscene is swallowed
  // by the global keydown router (phase !== 'zone' | 'boss' → early return)
  // so nothing leaks through to the fight. The music and the reveal land
  // together, every time.

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

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden afi-root" data-phase={phase}>
      {/* Psychedelic background — concentric hue-cycling rings. Oversized
          so the rotating element always covers the frame; see .afi-bg CSS. */}
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

      {/* Crash-in final vignette at the drop moment */}
      {elapsed >= 19600 && elapsed <= INTRO_MS && (
        <div className="afi-crash" aria-hidden />
      )}
    </div>
  );
}
