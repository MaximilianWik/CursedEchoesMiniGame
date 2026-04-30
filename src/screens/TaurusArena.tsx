/**
 * TaurusArena — cinematic backdrop for the Taurus Demon fight.
 *
 * The dark-gothic counterpart to AfromanArena. Fills the frame below the
 * action canvas (z < 5) with a ruined rampart scene: crumbling wall with
 * crenellations in silhouette, four flickering torches braced at the wings,
 * swinging chains overhead, a ground crack-glow burning beneath the boss,
 * distant lightning, and a constant ember storm rising from the floor.
 *
 * Everything is CSS-only. No images, no canvas. All layers sit below the
 * boss sprite (z: 5) so Taurus + projectiles + words still render on top.
 */

export type TaurusArenaProps = {
  /** Flashes true briefly when the boss sprite flinches (phrase damage).
   *  Used to pulse the ground crack brighter — a reactive "the earth
   *  shakes when he's wounded" beat. */
  hit: boolean;
};

export function TaurusArena({hit}: TaurusArenaProps) {
  return (
    <div className={`tarena-root ${hit ? 'is-hit' : ''}`} aria-hidden>
      {/* Static moonlit sky gradient fading down to stone rubble. */}
      <div className="tarena-sky" />

      {/* Distant mountain / distant rampart silhouette, set deep in the
          scene. Very dark, low-contrast. */}
      <div className="tarena-distant" />

      {/* Rear rampart wall with crenellations — the defining silhouette. */}
      <div className="tarena-wall" />

      {/* Chains hanging from the top of the frame, swaying gently. */}
      <div className="tarena-chain tarena-chain-1" />
      <div className="tarena-chain tarena-chain-2" />
      <div className="tarena-chain tarena-chain-3" />

      {/* Four torches at the wings — two per side, staggered heights. */}
      <div className="tarena-torch tarena-torch-1">
        <div className="tarena-torch-flame" />
      </div>
      <div className="tarena-torch tarena-torch-2">
        <div className="tarena-torch-flame" />
      </div>
      <div className="tarena-torch tarena-torch-3">
        <div className="tarena-torch-flame" />
      </div>
      <div className="tarena-torch tarena-torch-4">
        <div className="tarena-torch-flame" />
      </div>

      {/* Stone floor — perspective-warped slabs receding into the boss. */}
      <div className="tarena-floor" />

      {/* Ground crack — a jagged glowing rift burning under the boss. Pulses
          brighter when `hit` flips true. */}
      <div className="tarena-crack" />

      {/* Rising embers — continuous storm across the whole width. */}
      <div className="tarena-embers" />

      {/* Rare distant lightning — flash every ~7 s. */}
      <div className="tarena-lightning" />

      {/* Soft blood-red vignette bringing focus to center-top where Taurus
          stands. Sits above almost everything but below the action canvas. */}
      <div className="tarena-vignette" />
    </div>
  );
}
