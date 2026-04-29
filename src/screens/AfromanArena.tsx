/**
 * AfromanArena — dedicated backdrop for the secret boss fight.
 *
 * A multi-layered DOM scene that replaces the generic psychedelic overlay
 * with a proper disco/concert stage: rotating light beams, a mirrored disco
 * ball, speaker stacks that thump, lasers crossing, pyrotechnic bursts at
 * the stage edges, decorative Hennessy + beer bottles strewn across the
 * floor, falling confetti, and a smoke floor that grows denser with each
 * ZOOTED stack (0 → none, 3 → thick).
 *
 * All layers are CSS-only (no sprite sheets needed). Kept below z=5 so the
 * boss sprite (z=5) and the action canvas (z=10) render above it.
 */

export type AfromanArenaProps = {
  /** 0 = clean, 3 = fully zooted. Controls the smoke layer opacity + height. */
  zootedLevel: 0 | 1 | 2 | 3;
  /** True for the ~240ms after each detected bass kick — used to pulse the
   *  speakers and disco ball slightly brighter in sync with the music. */
  grooving: boolean;
};

export function AfromanArena({zootedLevel, grooving}: AfromanArenaProps) {
  return (
    <div className="afar-root" data-zooted={zootedLevel} data-grooving={grooving ? '1' : '0'} aria-hidden>
      {/* Floor + distant stage gradient */}
      <div className="afar-backdrop" />
      {/* Rear wall of colored neon bars */}
      <div className="afar-neon-wall">
        <div className="afar-neon-bar" style={{left: '8%', ['--neonHue' as string]: '330deg'}} />
        <div className="afar-neon-bar" style={{left: '22%', ['--neonHue' as string]: '190deg'}} />
        <div className="afar-neon-bar" style={{left: '36%', ['--neonHue' as string]: '50deg'}} />
        <div className="afar-neon-bar" style={{left: '50%', ['--neonHue' as string]: '130deg'}} />
        <div className="afar-neon-bar" style={{left: '64%', ['--neonHue' as string]: '280deg'}} />
        <div className="afar-neon-bar" style={{left: '78%', ['--neonHue' as string]: '20deg'}} />
        <div className="afar-neon-bar" style={{left: '92%', ['--neonHue' as string]: '220deg'}} />
      </div>

      {/* Disco ball + spinning reflection grid */}
      <div className="afar-disco">
        <div className="afar-disco-ball" />
        <div className="afar-disco-reflections" />
      </div>

      {/* Four giant rotating stage beams radiating from center-top */}
      <div className="afar-beam afar-beam-1" />
      <div className="afar-beam afar-beam-2" />
      <div className="afar-beam afar-beam-3" />
      <div className="afar-beam afar-beam-4" />

      {/* Crossing laser lines */}
      <div className="afar-laser afar-laser-a" />
      <div className="afar-laser afar-laser-b" />
      <div className="afar-laser afar-laser-c" />

      {/* Speaker stacks — thump with grooving */}
      <div className={`afar-speaker afar-speaker-left ${grooving ? 'is-thumping' : ''}`}>
        <div className="afar-speaker-cone afar-speaker-cone-top" />
        <div className="afar-speaker-cone afar-speaker-cone-bot" />
      </div>
      <div className={`afar-speaker afar-speaker-right ${grooving ? 'is-thumping' : ''}`}>
        <div className="afar-speaker-cone afar-speaker-cone-top" />
        <div className="afar-speaker-cone afar-speaker-cone-bot" />
      </div>

      {/* Pyrotechnic shooters — staggered so the bursts never align */}
      <div className="afar-pyro afar-pyro-1"><span /><span /><span /><span /><span /></div>
      <div className="afar-pyro afar-pyro-2"><span /><span /><span /><span /><span /></div>
      <div className="afar-pyro afar-pyro-3"><span /><span /><span /><span /><span /></div>
      <div className="afar-pyro afar-pyro-4"><span /><span /><span /><span /><span /></div>

      {/* Decorative bottles on the stage floor — Hennessy, tall cans */}
      <div className="afar-floor-props">
        <div className="afar-bottle afar-bottle-henn" style={{left: '6%'}} />
        <div className="afar-bottle afar-bottle-tall" style={{left: '14%'}} />
        <div className="afar-bottle afar-bottle-beer" style={{left: '20%'}} />
        <div className="afar-bottle afar-bottle-henn" style={{left: '78%'}} />
        <div className="afar-bottle afar-bottle-tall" style={{left: '85%'}} />
        <div className="afar-bottle afar-bottle-beer" style={{left: '92%'}} />
      </div>

      {/* Falling confetti — 12 pieces, each with its own hue + delay */}
      <div className="afar-confetti">
        {Array.from({length: 14}).map((_, i) => (
          <span
            key={i}
            className="afar-confetti-piece"
            style={{
              left: ((i * 7.3) % 100) + '%',
              animationDelay: (-i * 0.8) + 's',
              ['--confHue' as string]: ((i * 47) % 360) + 'deg',
              animationDuration: (3.5 + (i % 4) * 0.6) + 's',
            }}
          />
        ))}
      </div>

      {/* Smoke layer — three stacked volumes, each revealed at progressively
          higher ZOOTED levels via data-zooted. Level 0 = all hidden. */}
      <div className="afar-smoke afar-smoke-1" />
      <div className="afar-smoke afar-smoke-2" />
      <div className="afar-smoke afar-smoke-3" />
    </div>
  );
}
