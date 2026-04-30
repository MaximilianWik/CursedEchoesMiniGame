/**
 * TaurusIntro — 20 s cutscene overlay before the Taurus Demon fight.
 *
 * The dark-gothic counterpart to AfromanIntro. Plays the taurus soundtrack
 * over a layered reveal: ember-soaked black → silhouette rising from below
 * → full sprite with a fire ring at his feet → roar / screen shake / HP
 * bar drop. Uninterruptible — keystrokes and clicks are swallowed by the
 * global router while phase is 'boss-intro-taurus'.
 */

import {useEffect, useRef, useState} from 'react';
import {playMusicSample, stopMusicSample} from '../game/audio';

export type TaurusIntroProps = {
  onComplete: () => void;
};

/** Banner beats — [ms offset, text, optional small-variant]. */
const BEATS: {at: number; text: string; small?: boolean}[] = [
  {at: 0,     text: 'THE RAMPART STIRS',       small: true},
  {at: 5000,  text: 'SOMETHING BREATHES',      small: false},
  {at: 10000, text: 'TAURUS DEMON APPROACHES', small: false},
  {at: 16000, text: 'THE BURG REMEMBERS FIRE', small: false},
];

const INTRO_MS = 20000;

export function TaurusIntro({onComplete}: TaurusIntroProps) {
  const startAt = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  const completed = useRef(false);

  // Kick off the music sample at mount. Loops if the source is shorter
  // than the 20 s cutscene.
  useEffect(() => {
    playMusicSample('taurus', 1.0, 1800);
    return () => {
      if (!completed.current) stopMusicSample();
    };
  }, []);

  // rAF-driven timer.
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

  // Phase progression — different layers turn on at each stage.
  const phase =
    elapsed < 5000  ? 'gloom'
    : elapsed < 10000 ? 'silhouette'
    : elapsed < 16000 ? 'reveal'
    : 'roar';

  const activeBeat = [...BEATS].reverse().find(b => elapsed >= b.at && elapsed < b.at + 5000);

  // Dim-to-dread progression — saturation climbs, black vignette loosens.
  const dreadT = Math.min(1, elapsed / INTRO_MS);

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden tar-root" data-phase={phase}>
      {/* Static black+red vignette — loosens as the reveal progresses. */}
      <div
        className="tar-bg"
        style={{
          // Fade the stamina-red inward glow in as the reveal approaches.
          opacity: Math.min(1, elapsed / 4500),
        }}
        aria-hidden
      />

      {/* 0.3.13 — rotating fire-conic, 200% oversized so rotation never
          reveals the frame corners. Fades in across the phases. */}
      <div className="tar-fire-conic" aria-hidden />

      {/* Rising ember stream — constant through the whole intro. */}
      <div className="tar-embers" aria-hidden />

      {/* Gothic cracks that spread outward from the center as dread builds. */}
      <div
        className="tar-cracks"
        style={{
          opacity: Math.min(1, (elapsed - 2000) / 4000),
          transform: `scale(${(0.55 + dreadT * 0.6).toFixed(3)})`,
        }}
        aria-hidden
      />

      {/* Distant lightning flash — random triggers get stronger later. */}
      <div className="tar-lightning" aria-hidden />

      {/* Taurus reveal — silhouette first (filter: brightness 0), then full. */}
      <div className="tar-sprite-wrap" aria-hidden>
        {phase === 'silhouette' && (
          <img
            src="/TaurusIDLE.png"
            alt=""
            className="tar-sprite tar-sprite-silhouette"
            draggable={false}
          />
        )}
        {(phase === 'reveal' || phase === 'roar') && (
          <img
            src="/TaurusIDLE.png"
            alt="Taurus Demon"
            className={`tar-sprite tar-sprite-full ${phase === 'roar' ? 'is-roaring' : ''}`}
            draggable={false}
          />
        )}
        {/* Fire ring at his feet — appears with the silhouette, intensifies on roar */}
        {phase !== 'gloom' && (
          <div className={`tar-fire-ring ${phase === 'roar' ? 'is-flaring' : ''}`} aria-hidden />
        )}
      </div>

      {/* Gothic corner brackets — four ornate angle pieces framing the viewport */}
      <div className="tar-frame-tl" aria-hidden />
      <div className="tar-frame-tr" aria-hidden />
      <div className="tar-frame-bl" aria-hidden />
      <div className="tar-frame-br" aria-hidden />

      {/* Active beat banner */}
      {activeBeat && (
        <div
          key={activeBeat.at}
          className={`tar-banner ${activeBeat.small ? 'is-small' : ''}`}
        >
          {activeBeat.text}
        </div>
      )}

      {/* Blood-red flash at the roar moment */}
      {elapsed >= 19400 && elapsed <= INTRO_MS && (
        <div className="tar-roar-flash" aria-hidden />
      )}
    </div>
  );
}
