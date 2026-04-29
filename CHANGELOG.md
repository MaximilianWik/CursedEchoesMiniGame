# Changelog

All notable changes to Cursed Echoes. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [0.2.8] — Grace shield, phrase-resume, wider SFX, visible version badges

Four targeted fixes and one major new mechanic: Jessyka's grace shield — a once-per-spawn defensive explosion that veils the player from damage, scours projectiles from the air, and pushes hostile words outward in a screen-wide wave of pink. Boss phrases no longer reset mid-type on mismatched keystrokes. Seven new dedicated SFX fill out the game's new moments. Version badges on all screens upgraded from "easy to miss" to "clearly legible".

### Phrase-reset hardening

Verified that `0.2.7`'s digit-projectile split fixed the original projectile-resets-phrase bug (the digit branch in `handleCharLive` never touches `wordsRef`). Also hardened the adjacent case where a letter-mismatch rescue-switch could still silently drop the phrase.

- **`w.typed` preserved on rescue-switch for boss phrases.** If the active word is `isBossPhrase`, the switch keeps its partial progress — the player can return to it later by typing its next-expected letter.
- **Resume-matching in the no-active-word branch.** The initial `findIndex` now matches on `w.text.charAt(w.typed.length) === char` instead of `startsWith(char)`, so a half-typed phrase is pickable again by typing what's next — not restarted from scratch.
- **Rescue-switch also matches next-expected-letter**, not just first-letter, so switching onto a half-typed word appends instead of overwriting.

### Jessyka's grace shield — new once-per-spawn defensive ability

When a projectile or enemy is about to damage the player and Jessyka is `active` with her grace still unspent, she automatically veils the player in a screen-wide love-explosion. The damage is cancelled, the air is scoured, and the screen becomes a cathedral of pink.

- **Auto-trigger.** Hooked into `applyDamageToPlayer` as an early-return: `tryJessykaGraceShield(d, time)` runs first, and if it fires, the caller's damage is dropped entirely. Works against both projectile hits (updateProjectiles) and word contact damage (updateWords).
- **Visual — three concentric shockwaves**:
  - Inner bright ring (`rgba(255,220,240,ALPHA)`, maxRadius 260) — the bright core of the blast.
  - Main pink ring (`rgba(255,120,200,ALPHA)`, maxRadius ≈ `DESIGN_W * 0.6`) — the body of the explosion.
  - Outer soft ring (`rgba(255,160,220,ALPHA)`, maxRadius ≈ `DESIGN_W * 0.75`) — the enveloping grace aura.
- **Particles — 190 across three layers**:
  - 120 radial heart+petal+sparkle burst fanned evenly around the player.
  - 40-particle slow "petal drift" layer at 120-frame life so the aftermath lingers for ~2 s.
  - 30 cream-angelic flecks drifting upward above the player (the "veil" imagery).
- **Screen flash recoloured to pink** (`radial-gradient` swapped to heart-hued), auto-restored to the default red after 700 ms so subsequent ordinary hits look right.
- **Hostile word push** — every non-phrase, non-special, non-Jessyka-targeted word gets shoved outward from the player by 160 px (112 px for idle zone words) with a 20 px upward bias. Feels like a shockwave of love.
- **Projectile scour** — every un-deflected boss projectile is marked `deflected = true` and spliced, with a 6-particle pink burst at each. The air is cleared.
- **i-frames + micro-shake** — 1.2 s of i-frames after the shield so the player can't be double-tapped the same frame, and a capped 6-magnitude, 220 ms screen-shake (skipped if reduce-motion is on).
- **Announcement** — `JESSYKA'S GRACE` floats in the boss-announcement slot, newly given an optional `color` field so the banner renders in pink (`#ff9ecc`) instead of the default boss red.
- **Damage-text `VEILED` popup** over the player so the trigger is legible even in visual chaos.
- **One per spawn, reset on refresh.** `JessykaCompanion.graceUsed` is set `true` at use. A chained JESSYKA word that refreshes an already-present Jessyka resets `graceUsed` back to `false` — a new blessing, a new shield.
- **Parity with other Jessyka modes.** Works identically whether she was summoned via the JESSYKA heart word OR the Q estus summon — both initialise `graceUsed: false`.

### New SFX — 8 dedicated sounds for recent features

All additions use the existing procedural Web Audio graph (envelope + oscillators + shared reverb bus). Jessyka's sounds deliberately use major-key tonality to contrast the Bloodborne-dissonant palette elsewhere.

- **`sfxJessykaGrace`** — the heartwarming chord for the grace shield. Sub-bass impact → ascending C major arpeggio (C-E-G-C-E) with inharmonic shimmer partials → breathy high bandpass → low sine drone tail. ~2 s total.
- **`sfxJessykaSummon`** — Q-summon cue. Staggered F-A-C major triad (60 ms offsets) + mid bandpass noise + sub thud. Replaces the generic `sfxFireball` that was there.
- **`sfxJessykaKissImpact`** — soft heart-chime for kiss arrivals (both word kisses and boss-projectile intercepts). Triangle 880 Hz + sine 1175 Hz (major third up) + brief highpass sizzle.
- **`sfxBossSummonChanter`** — low sawtooth growl rising from 82→196 Hz + dissonant high whisper + sub thud. Plays on the boss `summoner` pattern.
- **`sfxBossSummonCaster`** — metallic crackle + sawtooth 147→330 Hz + square 440→880 Hz + sub thud. Plays on the boss `caster` pattern.
- **`sfxLichSplit`** — crystalline high-shatter + dissonant minor-chord body + sub impact. Plays on lich death, layering with the existing `sfxShatter` from `completeWord`.
- **`sfxEstusGodmode`** — bright golden bell ring when the 4 s post-chug window opens. Ascending G-C-high-C bell stack (major tonality) + high airy shimmer.
- **`sfxWordSwitch`** — dry non-musical "whoosh" for the rescue-switch pivot. Sits below the cast/fireball audio that follows on the same frame, so it doesn't step on them.

Also removed a redundant `sfxFireball()` call from the Jessyka projectile-chase intercept path — `spawnKissProjectileHit` now plays `sfxJessykaKissImpact` once, cleanly.

### Version badges — now legible

Version text was previously rendered at `text-amber-700/60` (or worse) — designed as subtle metadata but in practice barely visible against the black menu backgrounds. Every screen now uses a bordered gold pill with a glow shadow:

- **Menu, Pause, Game Over** — `px-3 py-1.5 border border-amber-600/80 bg-black/70 rounded-sm text-amber-300 shadow-[0_0_14px_rgba(255,180,60,0.35)]`.
- **Settings** — centered footer bar with `text-amber-300 drop-shadow-[0_0_8px_rgba(255,180,60,0.45)]` over a stronger top-border (`border-amber-700/60`), promoted from `[10px]` size to `xs`.
- **Victory** — gold-tinted pill (`border-amber-400/80 text-amber-200`) matching the victory frame's warmer palette.

All screens share the same pattern so the badge reads consistently across contexts.

### Files

- `src/game/audio.ts` — eight new SFX exports at the bottom of the file.
- `src/App.tsx` — new `tryJessykaGraceShield` helper ahead of `applyDamageToPlayer`; new imports + wiring for 8 SFX. `JessykaCompanion.graceUsed` field + init + refresh reset. `bossAnnouncementRef` now supports optional `color`. Letter rescue-switch preserves phrase `typed`; no-active-word findIndex matches on next-expected-letter; rescue SFX + kiss impact SFX + estus godmode SFX + boss-summon SFX + lich-split SFX wired.
- `src/screens/Menu.tsx`, `Pause.tsx`, `Settings.tsx`, `GameOver.tsx`, `Victory.tsx` — version badges upgraded to bordered pills with glow shadows.
- `src/version.ts`, `package.json`, `README.md` — bumped to 0.2.8.

---

## [0.2.7] — Digit projectiles, estus godmode, Jessyka polish, boss countdown

Five surgical fixes to input clarity, reward framing, companion feel, and pacing information. Projectiles and word-typing no longer share an input surface; estus now actually feels like a commitment worth making; Jessyka's kisses read as blown from her lips; the zone progress bar is now a named boss countdown.

### Input — projectiles use digits 1-5

Previously, projectiles fired letter chars that overlapped with word first-letters and active-word next-letters. Typing a letter would sometimes parry a projectile by accident and sometimes eat a miss when the player meant to type a word. The `forbidden` pool in `spawnBossAttack` tried to mask this by excluding phrase letters from the projectile pool, but casters firing words like `SORCERY` re-exposed it.

- **All projectiles (boss + caster) now fire digits from `{1, 2, 3, 4, 5}`** — a keyspace completely disjoint from A-Z.
- **`handleCharLive` split into two mutually exclusive branches**: digits route to projectile deflection ONLY, letters route to word typing ONLY. No fall-through between the two, so a typed letter can never accidentally parry and a typed digit can never accidentally start a word. Missed deflects and missed word-starts each break combo independently.
- **`projectileLetters` BossPhase field kept for schema continuity** but no longer influences gameplay — projectile chars come from the shared digit pool instead.
- **Q summon check simplified**: the old `projWantsQ` fall-through branch is dead code now (Q can never be a projectile char) — removed.

### Estus — 4 second godmode on the other side of the chug

Drinking estus left the player still feeling vulnerable immediately after the heal landed. The 1.15 s chug stopped input, heal applied, and then you were instantly exposed again — a poor reward for a commit-window.

- **4 s of post-chug i-frames** extend `iFramesUntilRef` starting at the moment the heal applies. The chug window itself remains vulnerable — this is strictly a reward for surviving the sip.
- **Visual godmode glow** — the player sprite is tagged with `.is-estus-godmode` for the window, running a 3 Hz `estusGodmodePulse` keyframe layered over `playerFloat`. Gold outer halo + cyan highlight + 1.35× brightness at the peak. It's impossible to miss.
- **CSS class auto-removed** on a timer, so the glow fades out even if the player gets hit or chains another estus. A second estus mid-window refreshes the class (via `void offsetWidth` reflow hack) so the animation restarts cleanly instead of just extending.

### Jessyka — slower, closer, spawns from her mouth

Kisses shot out of empty space 80 px to the left of her sprite at 680 ms flight — fast enough to read as teleport, offset enough to look disconnected from her.

- **`JESS_KISS_FLIGHT_MS` 680 → 1100** — kisses now have a visible, readable arc. Letter-by-letter typing on words feels like support, not autofire.
- **`JESS_ESTUS_PROJECTILE_CHASE_SPEED` 10 → 6 px/frame** for the boss-fight estus homing mode — same reason, kisses should look like projectiles, not hitscan.
- **Kiss origin now at the sprite's mouth.** New `JESS_MOUTH_DX=55` and `JESS_MOUTH_DY=-35` constants offset from the JSX anchor (`PLAYER.x + JESS_X_OFFSET`, `bottom: 4`) to roughly the upper-third of her 128×128 sprite — where her mouth actually is. All four kiss / burst / chase spawn points use these constants for consistency.

### Bug — Jessyka targeting off-screen words

Words spawned at `y: -50` (50 px above the play area) to slide into view. Jessyka's target-picker took "highest y" as "highest threat" and would lock onto these pre-spawn words, firing kisses upward into empty sky for 1+ seconds before the target drifted into view.

- **Word spawn y `-50` → `-20`** — enough lead-in for the "drops from above" feel, not enough to fire at invisible targets.
- **`tryPickJessykaTarget` filters `w.y >= 10 && w.y <= DESIGN_H - 40`** — only considers words whose glyphs are actually inside the visible play area. Also filters `w.spawnAnim` so she never targets something mid-spawn-animation.

### HUD — boss approach countdown

Previously the HUD showed a bare "Xs" label next to an unlabeled amber progress bar, and a vague "◈ The flame calls ◈" message in the final 10 s. No indication of *who* was coming or *when* until the fight actually started.

- **Zone progress bar labeled with the upcoming boss name** — "Boss in 42s — DRAGON SLAYER ORNSTEIN" for the whole run-up, so the player knows from second 1 what's coming.
- **Two-tier severity escalation**:
  - T-15 s to T-6 s: amber warning tier, label brightens.
  - T-5 s to T-0: red critical tier, bar pulses, label switches to "◈ {BOSS NAME} APPROACHES · Xs ◈" with a red drop-shadow.
- **New `HudStats.upcomingBossName` field** resolves from `zone.bossId` via the `BOSSES` lookup. `null` on the no-boss Firelink intro zone, so the warning UI stays silent there.

### Docs / misc

- README controls table updated for digits + Q + godmode.
- Menu `How to Play` block updated with the new keys.

### Files

- `src/App.tsx` — `PROJECTILE_DIGITS` + `ESTUS_GODMODE_MS` + `JESS_MOUTH_DX/DY` constants. `spawnBossAttack` pool → digits (keeps `forbidden` for word-spawn first-letter conflict avoidance). Caster fire char → digit. `handleCharLive` restructured into `isDigit` / letter branches with no cross-over. `handleTab` post-chug heal now extends `iFramesUntilRef` and toggles `is-estus-godmode` class. Jessyka kiss origins all use mouth constants. Word spawn y `-50` → `-20`. `tryPickJessykaTarget` filters by y + spawnAnim. `HudStats.upcomingBossName` plumbed from `zone.bossId`.
- `src/index.css` — `.player-sprite.is-estus-godmode` class + `estusGodmodePulse` keyframe.
- `src/hud/Hud.tsx` — `HudStats.upcomingBossName` field. Zone progress section rewritten with severity tiers, named countdown, red-tier pulse for T-5.
- `src/screens/Menu.tsx` — `How to Play` block updated with digit parry + Q summon + godmode lines.
- `src/version.ts`, `package.json` — bumped to `0.2.7`.
- `README.md` — controls table + current-version line updated.

---

## [0.2.6] — Boss rebalance, summoner/caster, Jessyka summon

Three boss-combat fixes, two new boss-attack patterns, a reworked lich death, and a brand-new Q-bind that lets you burn 1 estus to summon Jessyka in projectile-intercept mode. Docs are now emoji-free across the board.

### Boss combat overhaul

- **Wave and volley slowed ~40 %.** The Phase 2/3 bullet-hell spiral (`wave` pattern) rotated and expanded so fast it overlapped with itself between ticks. `spiralRadVel` 0.9 → 0.55, `spiralAngVel` range 0.012..0.020 → 0.008..0.013. Volley `vy` 1.9 → 1.55. Wave count scales by phase (10 in P2, 12 in P3) so late-game pressure still escalates.
- **Slower overall `patternInterval` across all bosses.** Every phase gained ~0.3-0.6 s of breathing room between attacks. Taurus P2 2.8 → 3.4 s, Ornstein P1 2.8 → 3.0 s, Gwyn P3 1.9 → 2.3 s (full table in the plan).
- **Runner-word rescue — word-switch on mismatch.** Pressing a letter that doesn't match the active word's next letter but IS the first letter of another typable word now switches the active word instead of eating a miss. Fixes the "runner boss-word untypable" bug where the player was locked onto the boss phrase and couldn't intercept a falling runner. Combo still resets as a drop penalty, so the rescue isn't free.

### Two new boss-attack patterns

- **`summoner`** — boss conjures ONE stationary chanter word at the top of the screen with a 900 ms pulse-in animation + lightning telegraph + "A CHANTER RISES" announcement. The chanter uses the existing 3.5 s minion-echo cadence (no new runtime code). Cap: ≤ 1 boss-summoned chanter alive at a time. Added to Taurus P3, Ornstein P3, Gwyn P2/P3.
- **`caster`** — boss conjures ONE stationary caster word with explicit `speed: 0` so it never drifts toward the player. Fires phase-appropriate projectile letters on the normal caster cooldown (fully parryable). Cap: ≤ 1 boss-summoned caster alive at a time. Added to Ornstein P1/P2, Gwyn P1/P2/P3.
- **Cap-retry scheduler.** If the rotated pattern is capped this tick, the scheduler advances through the rotation and retries so the boss never "skips" silently.
- **Mini boss sprite overlay.** Each boss-summoned word floats a 22 %-scaled silhouette of its parent boss above it, tinted with the boss theme colour — visually reads as "possessed by the boss's aura" without hiding the letters.

### Lich death animation

- **Parent split burst.** On lich death, a purple shockwave (maxRadius 80) + 30-particle rune-glyph burst replaces the old silent pop.
- **Children spawn AT the parent** and lerp outward to their ±40 px offset via a 900 ms ease-out with scale 0 → 1 (overshoot at 70 %). Trailing purple rune particles follow each child during flight. Letters fade in with the scale. Arrival triggers a small shockwave at each child's final position.
- New `Word.spawnAnim` schema supports both the static pulse-in used by summoner/caster and the full source→target lerp used by lich children.

### Jessyka polish

- `JESS_X_OFFSET` 130 → 80 — she stands closer to the player so it reads as "beside you" instead of "off to the side".
- `JESS_KISS_INTERVAL_MS` 550 → 750 (less spammy), `JESS_KISS_FLIGHT_MS` 420 → 680 (slower kiss — actually reads as a projectile instead of a teleport).
- `drawKissHeart` rewritten: heart size 7 → 12, gradient fill (rose → deep pink with highlight), pulsing halo at 2.5× breath-scale, two rotating sparkle arcs, tipped along travel direction. Every kiss now trails 1-2 petal particles per frame.

### New — boss-fight Jessyka summon (Q key)

- **Q bind.** During a boss fight, press Q to summon Jessyka for 15 s, costing 1 estus. Fall-through priority preserves typing: if any word on screen can currently accept a Q (active word's next letter is Q, or an idle word starts with Q) or a Q projectile is in flight, the keystroke routes to normal deflection/typing first. Only when nothing else claims Q does the summon trigger.
- **Projectile-intercept mode.** When summoned via Q, Jessyka ignores words entirely. `tryPickJessykaTarget` is bypassed — she scans `projectilesRef.current` for the nearest un-deflected boss projectile, fires a homing kiss at it, and marks the projectile `deflected = true` atomically so the player is protected during flight. Kisses home at 10 px/frame; on arrival (dist < 18 px) they splice the projectile and detonate with a pink heart burst + shockwave + `sfxFireball`.
- **Announcement.** "LOVE'S EMBRACE" flashes in the boss-announcement style. The existing lovebomb spawn-in animation replays — same visuals, different trigger.
- **Graceful failure.** No estus → HUD flashes "NO ESTUS". Already present → "ALREADY HERE". Both still consume the keystroke so a deliberate Q press never costs a combo break.
- **HUD hint.** When boss is active + ≥ 1 estus + Jessyka absent, a pulsing pink line appears under the estus counter: `[Q] JESSYKA — 1 ESTUS`. Hides the moment she's summoned, expended, or estus runs out.
- **Auto-despawn.** After 15 s of active play (16.3 s total including the 1.3 s spawn anim), she transitions straight to `leaving` → `despawning` without finishing a current word — she's an air-clearing panic button, not a typist.

### Docs cleanup

- All emojis stripped from `CHANGELOG.md` and `README.md`. Section headers that used emoji prefixes (`### :wrench: Why this matters` etc.) are now plain text.
- 0.2.6 entry itself is emoji-free.

### Files

- `src/game/config.ts` — `BossPattern` gains `'summoner' | 'caster'`; all 9 boss phases rebalanced.
- `src/graphics.ts` — `Word.isBossSummoned` + `Word.spawnAnim` (with optional source/target for lerp); new `drawBossMinionSprite` export reusing the `drawTaurus/drawOrnstein/drawGwyn` paths at reduced scale.
- `src/App.tsx` — `spawnBossAttack` signature returns boolean + accepts `phaseIdx`; two new branches; slower wave/volley. Word-switch rescue in `handleCharLive`. `JessykaKiss.chaseProjectileId`, `JessykaCompanion.summonSource/projectileTargetId/autoDespawnAt`. New `fireJessykaProjectileKiss` + `spawnKissProjectileHit`. `updateJessykaKisses` gains a projectile-chase branch + universal petal-trail. New `trySummonEstusJessyka` + Q fall-through in `handleCharLive`. Lich death rewrite to use `spawnAnim` on children. `drawKissHeart` fully rewritten. `JESS_*` constants retuned. Jessyka sprite JSX uses `JESS_X_OFFSET`. `HudStats.jessykaSummonAvailable` plumbed.
- `src/hud/Hud.tsx` — new `jessykaSummonAvailable` field + rendered hint line.
- `CHANGELOG.md`, `README.md` — emojis stripped.

---

## [0.2.5] — Physical deflection

Parries now feel like parries. Pressing a letter that matches an incoming projectile no longer teleport-despawns the projectile on the spot — instead the game marks it as *neutralised* and spawns a chase-fireball from the player that actively homes in on it until it physically connects. You see the cause, the travel, and the impact, in that order, every time.

### New mechanic — chase-fireballs

- **Stable IDs**: every projectile (boss + caster) is now stamped with a globally-unique `id` at spawn so fireballs can chase a *specific* target across frames even as other projectiles spawn and despawn around it.
- **Deflection flow**: on a matching keypress the projectile gets `deflected = true` (no longer damages the player, no longer collides) and a chase-fireball spawns from the player's chest aimed at the projectile's current position. The fireball re-aims every frame to the projectile's *live* position and seeks at 16 px/frame — fast enough that intercept is guaranteed within the 1.2 s grace window.
- **Real intercept**: when the chase-fireball closes within 20 px, it snaps to the projectile, splices it out of the array, and detonates *at the projectile's position*. Bigger explosion (14-unit burst vs 8), bigger shockwave (70 px vs 55), and a dedicated 5-mag screen-shake beat so the parry reads as an impact event — not a silent remove.
- **Graceful fallback**: if the target projectile vanishes for any reason (boss death clears the array, projectile leaves the arena, grace expires) the chase-fireball self-detonates in place instead of orphaning.
- **Ghost rendering**: deflected projectiles render at 40 % opacity with desaturated/brightened filter so players can *see* the neutralisation even before the fireball physically connects. The doomed letter drifts visibly harmlessly toward the player until the chase-fireball blows it apart.
- **Pass-through**: deflected projectiles that happen to reach the player's hitbox before intercept are silently filtered out of the contact-damage check — a parried projectile never hits, regardless of timing.

### Why this matters

The old system credited the combo tick but visually teleport-despawned the projectile and fired a cosmetic fireball that landed on empty space. Players reported parries feeling "instant but unsatisfying". Now the keystroke → travel → impact chain is physical: the parry still credits atomically on keypress (no combo risk) but the visual-audio-shake beat lands when the fireball actually connects. Cause and effect, on screen, every time.

### Files

- `src/graphics.ts` — added `Projectile.id`, `Projectile.deflected`, `Fireball.chaseProjectileId`, `Fireball.life`; `drawProjectile` now ghosts deflected projectiles.
- `src/App.tsx` — module-level projectile ID counter; IDs assigned at every projectile spawn (boss attacks + caster fire); deflection loop rewritten to mark + spawn chase-fireball instead of splice; `updateFireballs` given a chase branch with velocity-seek, life grace, graceful target-loss handling, and chase-specific impact FX; `updateProjectiles` contact check gated on `!p.deflected`.

---

## [0.2.4] — Jessyka companion

Typing JESSYKA now summons her into the fight as a support AI. She stands beside you, picks the highest-threat word on screen, and blows kiss projectiles at it while you focus on everything else. Lasts for the full 10 s *Blessed by Godess* window; finishes her current word before ascending.

### New entity — Jessyka companion

- **Spawns to the right of the player** (x = player + 130) whenever you complete a `JESSYKA` special word and the *Blessed by Godess* buff activates. A dedicated `<img>` element alternates between `/jessIDLE.png` and `/jessKISS.png` via a ref-driven sprite-switch (same pattern as the player sprite).
- **Dramatic lovebomb spawn animation** (`jessykaLovebomb` @ 1.3 s):
 - Enters from the right with translation `(60, 40) → (0, 0)`, rotation `15° → 0°`, scale `0.4 → 1.0` with a 35 %-keyframe overshoot to 1.15×
 - Brightness spike + heavy pink drop-shadow that settles into a softer idle glow
 - Blur 16 px → 0 so she materializes instead of just sliding in
 - Follows into a continuous `jessykaIdleFloat` — ±4 px vertical, subtle 1.015× scale pulse
- **Angelic despawn animation** (`jessykaAngelic` @ 1.6 s):
 - Brightens to 2.4× while floating 140 px upward
 - Drop-shadow expands from 20 px → 100 px cream-white glow
 - Opacity fades to 0 with a final 10 px blur for the dissolve
- **Soul-offering particle burst** at despawn start — 40 hearts + cream specks fountain upward from her position.

### Combat behavior

- **Target selection**: filters words that are not already Jessyka-claimed, not special / boss-phrase / boss-attack / chanter, AND have `typed.length === 0` (not already mid-progress). Sorts by `y ASC` — she always prioritizes the **highest / most-dangerous word** on screen. No target? She waits.
- **Kiss cadence**: one kiss every **550 ms** (≈ 1.8 letters/sec) — deliberately slower than a typical player typing rate so she assists without trivializing play. A 7-letter word takes her ~3.9 s.
- **Kiss projectiles** — pink heart glyphs traveling in a bezier arc from her chest to the targeted letter's position. Flight time ~420 ms with a sin-lifted arc for a blown-kiss feel. Re-homes each frame if the target word moves. Impact spawns a 10-particle pink heart burst.
- **Word damage** happens on kiss **arrival** (not fire), so you see the cause effect. Only advances `w.typed` if `typed.length === letterIdx` to stay ordered.
- **Kill reward**: when Jessyka finishes a word, score `length × 15` (50% bonus over normal), `sfxShatter`, and a 26-heart-&-spark burst at the word's position.
- **Player cannot target her word** — `findIndex` now filters out any word with `jessykaTarget === true`. No poaching, no conflict.
- **Graceful release**: if her target is destroyed by contact damage (reaches the player), she releases and picks a new one next frame. No stuck state.
- **Finish-then-leave**: when the blessed timer expires (10 s), she transitions to `'leaving'` but keeps firing kisses at her current target. Only once the target is dead (or she had no target) does she enter `'despawning'`.

### State machine

```
[null] ──(JESSYKA kill)──> [spawning]
[spawning] ──(1.3 s timer)──> [active]
[active] ──(blessed expires)──> [leaving]
[leaving] ──(target done / no target)──> [despawning]
[despawning] ──(1.6 s timer)──> [null]
```

Re-completing JESSYKA while she's already present refreshes her back to `'active'` instead of re-spawning — chained blesses extend her stay without interrupting her animations.

### Internal / data changes

- `Word.id: number` — new required field, unique across all spawns (`_wordIdCounter`). Stable across splices so Jessyka's target can survive word-list mutations. All 5 `wordsRef.current.push(...)` sites updated.
- `Word.jessykaTarget?: boolean` — flag set when she claims a word; the player's start-word `findIndex` filters these out.
- `JessykaCompanion` state object held in `jessykaRef: React.RefObject<JessykaCompanion | null>`:
 - `state` — one of `'spawning' | 'active' | 'leaving' | 'despawning'`
 - `spawnStart / despawnStart` — `performance.now()` timestamps
 - `targetId / lettersFired / nextKissAt` — targeting + pacing
 - `castingUntil` — when to show the kiss.png vs idle.png
- `JessykaKiss` projectile in `jessykaKissesRef`:
 - `(sx, sy)` spawn origin + `(tx, ty)` current target arc interpolated from `progress` with a sin-based lift
 - `wordId + letterIdx` so arrival knows which word/letter to advance
- `updateJessyka`, `tryPickJessykaTarget`, `fireJessykaKiss`, `updateJessykaKisses`, `jessykaKillTarget`, `drawKissHeart`, `spawnJessykaAngelicBurst` — all new helpers in `App.tsx`.
- `resetRunState`, `tryAgain`, `abandonRun` all clear Jessyka state so a new run starts clean.
- Contact-damage branch in `updateWords` now releases `jessykaRef.targetId` if the damaged word was hers.
- Blessed-expiry `setTimeout` now also flips Jessyka to `'leaving'` if she's present.

### Assets

- Uses `/jessIDLE.png` and `/jessKISS.png` in `public/`. Until those files exist, the sprite slot renders the `alt="Jessyka"` fallback. Drop the PNGs in and she's live — no code changes needed.

### Balance notes

- Jessyka is tuned to assist, not dominate. At ≈0.55 s / letter she's about **half** the speed of a competent player. In 10 s of blessed she completes ~2-3 words, mostly the ones highest on screen (the ones you were going to lose anyway).
- She gives bonus souls (+50 % per kill) so you're incentivized to trigger her, but you still have to do the heavy lifting.
- She never targets boss phrases or boss word-projectiles — those remain fully your responsibility.

---

## [0.2.3] — JESSYKA heart rework

Small, focused pass on the special fireball visuals.

### JESSYKA fireball revamped

- **Dedicated `drawJessykaHeart` render path.** The old fireball branch squeezed the heart through a janky bezier with `size * 6` scaling, so combo stacks produced cartoonishly huge hearts that swallowed the screen.
- **New clean heart shape** — classic two-lobe bezier with a proper top dip and bottom point. Fills with a radial gradient (`#ffe8f4 #ffb0d8 #ff5aa6 #d62a7f`) from a highlight origin at the upper-left lobe for depth.
- **Base size 26 px** (was effectively 30–60 px). Combo scaling clamped to **max 1.3× past 120 combo** (`1 + min(0.3, combo / 400)`) instead of the previous 6× runaway at SSS.
- **Gentle breathing pulse** — `0.94 + sin(time × 0.012) × 0.06` — subtle, not distracting.
- **Soft pink halo** behind the heart (`rgba(255, 150, 210, 0.55)` transparent) with `globalCompositeOperation = 'lighter'` so it blooms into the scene instead of obscuring it.
- **White shine highlight** — a small diagonal ellipse in the upper-left lobe gives the heart a wet/candy look.
- **Thin magenta rim** (`rgba(180, 20, 100, 0.85)`, 1.5 px) defines the silhouette against busy backgrounds.
- **Two orbiting sparkle specks** rotate slowly around the heart at radius `s × 1.35` — signals "special fire" without adding clutter.

### Particle trail cleaned up

- Trail particles spawned by a flying heart now **alternate hearts + small white sparkle dots** (`#ffe4f1`) instead of a single stream of pink hearts. Gives a candy-ribbon trail.
- Particle heart shape replaced with a cleaner two-arc + triangle construction (was another awkward cubic-bezier knockoff).
- Slight downward `vy` bias on the trail so the sparkles drift naturally behind the fireball's motion.

### Signature change

- `drawFireball` now takes an optional `time: number` parameter (default 0) so the new heart can read elapsed time for its pulse/sparkle animations. Other fireball branches ignore it.
- Call site in `App.tsx` updated to pass `time` from the render loop.

### No behavioral changes

All gameplay rules unchanged — JESSYKA still grants full heal, refills estus, and activates the *Blessed by Godess* buff. This was purely a visual pass.

---

## [0.2.2] — Deflection, cutscene, and clarity

### Bug fixes

- **Deflection now fires an actual fireball from the player** toward each deflected projectile — previously only particles and a shatter sound played, so the parry felt invisible. The fireball explodes at the projectile's original position.
- **Combo-reset-during-deflection fixed.** The keystroke-routing logic is now atomic: if any projectile is deflected, the keystroke is credited (combo +1, correct-letter stat) and the word-typing path is **skipped entirely**. No branch can reset combo while a parry is happening. Paired with the new letter-pool filter (below), a deflection can never collide with a wrong-word-letter path.
- **Pause no longer cheeses the boss appearance.** The zone timer used `performance.now()` deltas which kept ticking through pauses, so hitting `ESC` would fast-forward toward the boss. The zone elapsed counter is now accumulated per active frame (`realDtSec`) and cannot advance while paused.
- **Fireball knockback got a y-axis check.** Explosions no longer accidentally knock words from across the screen when a parry fireball lands near the top.

### Boss redesign

- **Intro cutscene** — entering a boss now spawns a 4.5 s reveal sequence:
 - Boss silhouette fades in from below while scaling 0.7 1.0
 - Boss name appears with letter-spacing widening 0.05 em 0.27 em
 - Boss title renders above in small tracked caps
 - Italic lore text fades in at 1 s (new `introLore` field per boss)
 - Thin sigil divider + glowing orbs extend outward as intro progresses
 - HP bar is hidden, no attacks or phrases spawn during intro (`updateBoss` early-returns while `introStart > 0`)
- **Boss can no longer be triggered early** by pausing — zone timer is pause-safe now.
- **Projectile letter pool filters out phrase letters.** Every letter currently in the active boss phrase is excluded from the projectile-letter pool, so typing a phrase character can never accidentally deflect a projectile and typing a projectile character can never progress the phrase. Cleaner cause-and-effect.
- **Fireball knockback** on boss fireballs tightened (y-proximity check) so parries don't ripple into distant words.

### Visual polish

- **Projectile letter legibility** fixed while keeping the full VFX. Both boss and caster projectiles now render:
 - A dark disc backing (`rgba(20, 6, 24, 0.85)` for caster, `rgba(20, 8, 4, 0.85)` for boss) centered on the char
 - A thin theme-colored ring around the disc
 - Bolder 22 px letter with a dark stroke outline (no shadow blur)
 - Rune rings pushed out from radius 20/12 24/18 so they don't crowd the glyph
- **Boss-phrase frame cleaned up.** The radial gradient fill (which created an opaque rectangular "box") is gone. The frame is now a thin pulsing outline with a theme-colored `shadowBlur`, four gothic corner brackets, and the `◈ BOSS PHRASE ◈` label above. The word and its frame now integrate into the scene without a visible color-gradient rectangle.

### Data / internal

- `BossDef` gained an `introLore: string` field per boss (shown during the intro overlay).
- `BossRuntime` gained `introStart: number` and a new `BOSS_INTRO_MS = 4500` constant gating attacks, phrases, and HP bar during the intro.
- `BossRenderState` carries `introStart` + `introDurationMs` so `drawBoss` can animate the silhouette's intro reveal alongside its existing death cutscene transforms.
- `updateBoss` early-returns while `introStart > 0`; automatically clears `introStart` once the duration passes.
- `spawnBossAttack` builds a filtered `pool` from `letters.split('')` minus every character of the active phrase, with fallback if the filter empties.

### Docs

- `README.md` fully rewritten with current controls, enemy behaviors, boss mechanics, HUD layout, dev console access, architecture, and accessibility notes.

---

## [0.2.1] — Polish pass

Targeted feedback response after live-testing the Abyss Overhaul. Bug fixes, boss-combat refinements, HUD de-cluttering, and new visual effects.

### Bug fixes

- **`MOUNTAINTOP` was unbeatable.** The word bank contained the literal string `"MOUNTaintop"` (mixed-case). Typing uppercase mismatched the lowercase letters in the stored word so completion was impossible. Fixed the entry + defensively `.map(w => w.toUpperCase())` the whole `GOTHIC_WORDS` array so stray casing can never break gameplay again.
- **DODGE text didn't appear during boss fights.** The contact-check branch only pushed the `DODGE` toast in zone phase; projectile dodges during boss fights were silent. Moved the push into `updateProjectiles`'s i-frame branch too, so any successful dodge (word contact OR projectile) shows clear blue `DODGE` feedback.

### Boss combat overhaul

- **Bosses moved up the screen.** `BOSS_AIM.y` shifted from `470 380`, projectile spawn point from `y=440 360`, silhouette base from `520 440`. Projectiles now spawn a full ~90 px higher so they launch from the boss's body, not beside the player.
- **Bosses tankier.** HP raised across the board: Taurus 8 14, Ornstein 12 22, Gwyn 18 32. Fights feel weighty without changing the phrase-damage formula.
- **Boss phrase is centered AND framed.** Every phrase now spawns dead-center horizontally (`x = (DESIGN_W − widthEst) / 2`). A gothic frame in the boss's theme color is drawn around it: pulsing radial glow fill, thin outline, four corner brackets, and a `◈ BOSS PHRASE ◈` label above it. The phrase tied to the boss HP bar is unmistakable.
- **Phrases vs word-projectiles separated cleanly.** New `isBossPhrase` and `isBossAttack` flags on `Word`. Boss-damage payload only attaches to completion-fireballs of phrases; word-projectiles never damage the boss but DO damage the player on contact.
- **Wave attack is now a slow-spinning bullet-hell spiral.** Twelve projectiles spawn in a ring around the boss at radius 50, rotating CW or CCW (randomized per cast) while slowly expanding outward. They sweep through the entire play area instead of only the center. Projectile `spiralOrigin / spiralAng / spiralRadius / spiralAngVel / spiralRadVel` fields drive the pattern.
- **New `word` attack pattern.** Bosses occasionally fire a FULL WORD as a projectile (`DEATH`, `DOOM`, `WITHER`, `RUIN`, `ASHES`, `CURSE`, `PYRE`, `DUSK`, `ABYSS`, `BLIGHT`). It descends at speed 0.45 with a `runner`-style streak and damages the player on contact (≈ 2-5 HP, scales with length). Typing it out destroys it without damaging the boss — a defensive type. Added to Taurus phase 3, Ornstein phase 2-3, Gwyn phase 2-3.
- **Volley spread tightened.** Was ±220 px (letters at the edges never threatened the player). Now ±140 px — every volley letter actually passes through the player zone.
- **Boss projectile spawn bounds expanded.** Projectiles are now cleaned up when they exit any screen edge (`x < -50 || x > DESIGN_W + 50 || y < -50 || y > DESIGN_H + 30`), not only when they fall off the bottom — needed for spiral patterns that can spin outward past the sides.

### Enemy clarity

- **Caster projectiles got a dramatic magic-orb redesign.** Dedicated `drawCasterProjectile` function: six-point trail of fading magenta orbs, outer halo (`rgba(255,100,255)` gradient), 5-point rotating rune ring at radius 20, counter-rotating inner 3-point ring at radius 12, white-hot core, the letter rendered on top with magenta shadow. Clearly distinct from boss projectiles (which keep their simpler amber look).
- **Caster muzzle flash.** When a caster fires, 12 magenta-pink spark particles burst from its position so you can trace the source.
- **Ghost enemies harder.** Flicker formula rewritten: two detuned sines (frequencies `0.0055` and `0.013`) combine with an asymmetric curve — peaks hold at alpha 0.25-1.0, troughs drop to 0.03 for noticeably longer intervals. Irregular rhythm means you can't predict when a letter will be readable.

### HUD & visual effects

- **HUD de-cluttered.** Estus row moved from the top-left block to its own bottom-left anchor at `bottom-8 left-8`. Flasks are now larger (`w-8 h-12`), with a proper bottle clip-path. The top-left keeps HP / stamina / souls / zone / accuracy / zone-progress / combo rank.
- **Words now pass OVER the HUD, not under it.** Fixed the stacking-context bug where the shake-wrapper's `transform` created a new stacking context, so the inner text-canvas `z-40` only competed WITHIN that wrapper — while the outer HUD (`z-30` at the container level) sat above it unconditionally. Moved the HUD + BossBar inside the shake wrapper between the action canvas (`z-10`) and text canvas (`z-40`), so enemy words visually glide across any HUD element.
- **Rank-up banner removed; rank IMAGES now animate dramatically on change.** Deleted `src/hud/RankUpBanner.tsx` entirely and removed all `rankUpEvent` plumbing from App.tsx. The rank-up SFX (`sfxRankUp`) still fires. The HUD rank image now has a new `rank-icon` class with two layered animations:
 - `rankIconReveal` (900 ms): appears blurred + scaled-down 0.3× with intense over-saturated glow, blooms to 1.45× at 35 % with high brightness, settles to 1.00× with a subtle 75 %-keyframe overshoot.
 - `rankIconIdle` (3.6 s infinite): continuous breathing — scale 1.001.04, slight +1 px lift, glow oscillates 10 px → 18 px.
 - `rank-icon-sss` variant: cyan glow instead of amber, faster 1.8 s loop with slight rotation (−2° → 3°) — gives SSS rank a distinct heartbeat.
 - `key={rankChangeKey}` on the `<img>` re-mounts it on rank change, re-triggering the reveal animation.
- **Estus drinking animation.** Multiple layered effects during the 1.15 s chug:
 - Player sprite gets an `.is-drinking` class with a green+amber drop-shadow glow + brightness 1.15 + a `playerDrink` up-down bob keyframe.
 - Canvas-drawn healing halo pulses at the player's feet (radial green gradient, sine-pulsed at 0.014 Hz).
 - An amber flask glyph rises from the player's chest, with its fluid level draining from 100 % down to 0 % as progress advances.
 - A circular progress ring sweeps around the player (clockwise, starting from 12 o'clock).
 - Green + amber ember sparks ambient-spawn at ~40 % per frame.
 - On completion: `+N` text + a 22-particle celebratory burst.
 - Estus flask icons in the HUD get an `.estus-drain` keyframe (bright flash + darken) on the specific flask being used.

### Dev panel access

- **`◇ DEV CONSOLE` button on the Pause overlay.** Dedicated emerald-styled button alongside Resume / Settings / Abandon Run.
- **`◇ DEV` button on the Game Over screen.** Small bottom-left button, fades in 200 ms after the Try Again button.
- **`◇ DEV` button on the Victory screen.** Matching placement/style.
- All three thread through a new `onOpenDev` prop wired to `setShowDevPanel(true)` in the App orchestrator.

### Internal refactors

- **`Word` type** gained `isBossAttack?: boolean` and `isBossPhrase?: boolean`.
- **`Projectile` type** gained `spiralOrigin / spiralAng / spiralRadius / spiralAngVel / spiralRadVel` (spiral pattern state) and `trail?: {x,y}[]` (dramatic caster streak).
- **`spawnFireball`** now distinguishes phrase-completion fireballs (carry boss-damage payload) from attack-word fireballs (purely visual).
- **`drawProjectile`** is now a dispatcher: `drawBossProjectile` (simple amber letter) vs `drawCasterProjectile` (elaborate magic orb + trail + rune rings + hot core).
- **`drawEstusChug`** new function rendering the estus visuals on the action canvas. Called from the game loop after particles.
- **`hexA(hex, alpha)`** small helper in App.tsx for building `rgba()` strings from `#rrggbb` boss theme colors — used by the gothic-frame render.

### Verified

- All brace / paren balance checks pass across every `.ts` / `.tsx` file.
- Vercel build path: `vite build` with `installCommand: npm install --no-audit --no-fund` in `vercel.json`.
- No residual `RankUpBanner` / `rankColor` / `rankUpEvent` references.

---

## [0.2.0] — The Abyss Overhaul

A complete reimagining of the game. What started as an endless typing trial is now a structured four-zone Soulslike with bosses, estus, dodge rolls, dramatic audio, atmospheric scenes, and a proper progression arc.

### Zones & Progression

- **Phase machine** — gameplay now flows through discrete phases: `menu zone boss bonfire (repeat) victory | gameover`. Every transition is explicit and visible to the player.
- **Four zones** with distinct palettes, word pools, weather, music, difficulty curves, and enemy mixes:
 - **Firelink Shrine** (45 s, no boss) — warm sunset, short words, calm intro
 - **Undead Burg** (75 s boss) — stormy rain, runners and casters and ghosts
 - **Anor Londo** (85 s boss) — god rays through cathedral arches, mimics, liches
 - **Kiln of the First Flame** (70 s boss) — bleached ash palette with drifting embers, chanters and long phrases
- **Zone-progress bar** on the HUD with remaining seconds, plus a "◈ The flame calls ◈" hint pulse at ≤10 s so the zone-end transition is never a surprise.
- **Bonfire interlude** between zones — full heal, estus refills, stamina refills. Animated CSS bonfire with three-layer flame plus name-of-next-zone preview.
- **Victory screen** after Gwyn falls — one-line "VICTORY ACHIEVED" title with a blur-in scale reveal animation, continuous golden pulse, animated god-ray sweep across the background.

### Bosses

- **Three fully-scripted boss encounters** with procedural silhouettes drawn on canvas:
 - **Taurus Demon** — Beast of the Ramparts — 8 HP, hulking horned silhouette with glowing red eyes
 - **Dragon Slayer Ornstein** — Captain of the Four Knights — 12 HP, slim knight with lightning-tipped spear
 - **Gwyn, Lord of Cinder** — The First Flame — 18 HP, tall crowned figure wreathed in flame
- **Phase transitions** at 66 % and 33 % HP with announcement text overlay and lightning-flash telegraph. Final phase triggers "enraged" state (boosted rim glow, red aura, intensified attack rotation).
- **Phrase-damage system** — completing a phrase fires a single damaging fireball at the boss with `ceil(letterCount / 7)` HP damage. Longer phrases hit harder.
- **Attack-pattern scheduler** with three distinct projectile patterns:
 - **`single`** — one letter fired from the boss's chest, slight aim toward player
 - **`volley`** — three simultaneous letters in a horizontal spread (telegraph lightning flickers first)
 - **`wave`** — five letters sweeping LR across the screen, staggered so they arrive in sequence
- **Per-phase pattern rotation** per boss — each phase cycles through its own pattern list at a fixed interval.
- **Rich phrase banks** — 12 easy, 12 mid, 11 hard phrases with zero overlap. Phrases are stationary at the top of the screen (y=130-160), one at a time, horizontally spread to fit without clipping.

### Boss death cutscene

A full 3.2-second dramatic sequence triggered when any boss hits 0 HP:

- **Beat 1 (0-800ms)** — `sfxBossScream` (dual detuned sawtooth voices, minor-2nd apart, gliding 42060 Hz with a closing lowpass and breath noise). Boss silhouette violently jitters (±14 px), 60-particle crimson/theme-color burst, big shockwave, lightning strobe, screen shake mag 18. Projectiles cleared, typing frozen, `+NNNN SOULS` in amber floats up, "**NAME FELLED**" announcement.
- **Beat 2 (900ms)** — `sfxBossCollapse` (sub-bass rumble + secondary thud). Silhouette sinks ~40 px, jitter calms, rim glow intensifies, cracks deepen, second shockwave, second lightning flash.
- **Beat 3 (2400ms)** — `sfxBossFinale` (resolving minor-to-major chord + sub thud + warm noise). Final shockwave (max radius 380 px, gold-cream), brightest lightning.
- **Beat 4 (3200ms)** — transition to bonfire interlude.
- Throughout: continuous random particle bursts (~55 % of frames, 4 per burst, mixed crimson + theme color), silhouette fade from α=10 in final phase, invulnerability on the player for the full cutscene. Boss HP bar hidden once defeated.

### Player mechanics

- **Estus flask** (`TAB`) — 3 charges, 1.15 s chug during which typing is locked, heals 4 HP. Refills at bonfires. HUD estus-slots row shows remaining charges.
- **Dodge roll** (`SPACE`) — 200 ms of i-frames over a 360 ms slide animation. Costs 35 stamina (regens over ~2 s). Direction-randomized slide animation with drop-shadow flash. Contact hits during i-frames spawn a blue "DODGE" toast instead of damage. Projectiles are also dodgeable.
- **Pause** (`ESC`) — full overlay menu (resume / settings / abandon run).
- **Mobile support** — hidden input relay auto-focused on tap; virtual keyboard opens; onChange routes characters to the game.
- **Damage feedback overhaul**: six-layer hit response when the player is struck — screen shake, red-radial screen flash overlay, sprite filter brightness-pop, floating `-N` damage number, red shockwave ring, 28+5×dmg blood-burst particles.

### Enemy variety (seven kinds)

All enemies respect first-letter uniqueness across every spawn path — no two on-screen words ever share a starting letter, even across caster words and lich-child spawns.

- **Normal** — standard falling echo
- **Ghost** — letters flicker in and out (alpha oscillates via sine)
- **Tank** — long 10-14 letter armored word with stroke outline on untyped letters
- **Runner** — fast 3-4 letter word with directional motion-streak (gradient trail points away from the player, follows homing vector)
- **Lich** — on death spawns 2 short minion echoes from its position, with first-letter dedup against living words
- **Phantom** (was Mimic) — pure-visual ghost double-image on letters; completion grants **+50 % bonus souls** with `+N` floating text and pink particle burst. No scrambling, no keystroke punishment.
- **Summoner** (was Chanter) — stationary at top; every 4-5 s spawns a 3-5 letter minion echo that homes toward the player. Killing the summoner stops spawns. **No more keystroke mis-registration** — your inputs always do what you told them.
- **Caster** — fires single-letter projectiles that home at the player. Typing the projectile's letter deflects all in-flight projectiles with that char. Deflection does **not** accidentally start a new word.

### Fireballs, projectiles, combat feel

- **Projectile deflection rules revamped** — typing a letter that matches an incoming projectile destroys all in-flight projectiles with that letter first. If you had no active word, the keystroke is consumed by the parry (does not auto-start a new word). If you had an active word and the letter only matches the projectile (not the word's next letter), it's neutral — parry succeeds, no miss penalty, combo stays.
- **Caster-projectile spawn rates** tuned so parries feel fair rather than overwhelming.
- **Boss projectiles** spawn from the boss's body (y≈440) not near the player; travel at vy 1.5-1.8 (was 2.2-3.4) for readable timing.

### Graphics & atmosphere

- **Three HiDPI canvases** — background, action, text — plus a screen-flash overlay div and a shake-wrapper DOM layer.
- **Per-zone scenes** dispatched via `drawBackground` by `BgState.zoneId`:
 - **Firelink Shrine** — amber sunset sky, setting sun clipped by the horizon line (no more awkward black box), dual-layer bezier hills with depth, stone shrine silhouette with warm arched-doorway glow, sword-in-bonfire iconography, background broken archway for compositional depth
 - **Undead Burg** — stormy overcast sky, distant city rooftop silhouette, two broken towers with arrow-slit glows, foreground crumbling archway with swaying chain, rubble framing
 - **Anor Londo** — majestic cathedral with twin bell towers, flying buttresses, pulsing rose window with 6 stone tracery spokes, distant jagged mountain range, moon with halo and crossing cloud, stars with per-star twinkle phase
 - **Kiln of the First Flame** — bleached ash sky into burning orange horizon, massive throbbing First-Flame sphere (440 px halo + 90 px white-hot core pulsing on two sines), ring of six tilted broken pillars with flame-facing rim lighting, heat-shimmer bands
- **Weather per zone** — rain, ash, god-rays, ember storm — each with its own renderer and particle pool.
- **Universal atmospheric fauna**: crows drift across the sky (~once per ~25 s), pairs of red eyes blink in the fog (~rare), impact decals scorch the ground and fade, bonfire warmth pulses at the player's feet.
- **Lightning flashes** with double-strobe intensity curve, triggered at phase transitions, boss death beats, and naturally every 15-35 s.
- **Dynamic vignette** — pulses red when HP ≤ 3.
- **Depth-of-field** subtle top-gradient softness on the bg canvas for cinematic framing.

### UI/UX

- **Menu redesign** — animated ember rain, gothic sigil divider, pulsing title, kbd hints (TAB/SPACE/ESC), `◇ DEV` button now clearly visible in the bottom-left (password-gated).
- **Rank-up toast** — replaced the giant screen-sweep with a compact 240×40 toast that slides in under the HUD combo block; rank-colored accent bar, "Rank X" label + bold rank name, slide-in blur fade. Never blocks gameplay.
- **Boss HP bar** — large name + title banner at top center with phase-tick marks at 66 %/33 %, theme-colored glow, phase announcement text on phase changes.
- **HUD** — HP bar with blessed/low-HP variants, estus flask row with clip-path bottle shape, dodge stamina bar, souls (padded), zone name + difficulty, accuracy %, zone-progress bar + countdown, flame-calls hint, combo rank image, combo counter with pulse.
- **Pause overlay** — full centered menu with resume / settings / abandon run.
- **Settings panel** — volume sliders (master / music / effects), accessibility toggles (reduce motion / high contrast / colorblind), font-scale picker (0.8×/1.0×/1.2×), reset-to-defaults. Live updates to React and the game loop via a pub/sub store.
- **Dev console** — password-gated (`developer`) jump panel for testing: zone 1-4, boss 1-3, victory screen, full heal, refill estus, +20/+100 combo, despawn words, trigger lightning. Accessible via the visible `◇ DEV` button on the menu or the `` ` `` backtick shortcut.
- **Rich end-screen stats** — souls, max combo + rank image, accuracy, WPM, time survived, zone reached, bosses felled, words banished, projectiles parried, dodges, estus drunk, deadliest letter. Combo-over-time mini-graph on a canvas.
- **YOU DIED reveal** — authentic Dark-Souls-style horizontal-squash reveal with widening letter-spacing, blur-in, blood-smoke horizontal streak behind the text, closing red vignette, then a slow pulsing glow that loops forever.
- **Highscores persistence** in `localStorage`; Hall of Records panel on game-over.

### Accessibility

- **Reduce motion** — disables screen shake, screen flash, rank-up sweep, YOU DIED reveal animation, and player idle float. Ember/rain animations slow drastically.
- **High contrast** — brightens UI text, disables background blur.
- **Colorblind mode** — swaps red danger cues for blue.
- **Font scale** — 0.8× / 1.0× / 1.2× adjusts enemy word glyph rendering via the cached char-width map.
- All new animations use `cubic-bezier` easing appropriate for their purpose (reveals, settles, fades).

### Audio — Bloodborne-inspired procedural system

Everything is synthesized via Web Audio API on demand. **No audio asset files.** (The smooch.mp3 easter-egg audio is unrelated.)

- **Cathedral reverb bus** — shared ConvolverNode with a 3.5 s exponential-decay impulse response, fed by most wet SFX.
- **Sub-bass body primitive** (`subThud`) — sine oscillator gliding from 2.2× down to root with exponential envelope. The Bloodborne gut-punch feel.
- **Dissonant music drones** per zone — three voices (root + detuned root + third voice at a dissonant interval: minor 3rd for Burg, tritone for Kiln/boss, perfect 5th elsewhere), low-pass filter with slow LFO on the cutoff, zone-specific base pitch + cutoff.
- **SFX catalog:**
 - `sfxCast` — breathy bandpass exhale per correct keystroke (dry)
 - `sfxMiss` — dry metallic flinch on wrong input
 - `sfxFireball` — dark airy rush + sub tone
 - `sfxImpact` — sub-bass thud + lowpass noise + dissonant harmonic ping (for spears)
 - `sfxShatter` — highpass noise + minor-2nd dissonant harmonic (ethereal word-banished)
 - `sfxRankUp` — **inharmonic cathedral bell** — 5 partials at `1 · 2 · 2.76 · 4.2 · 5.4` ratios, the classic Bloodborne bell timbre
 - `sfxComboBreak` — funeral gong with sub thud + dissonant cluster
 - `sfxPlayerHit` — wet organic flesh thud
 - `sfxBonfire` — soft crackle + warm mystic drone (root + perfect fifth, restful)
 - `sfxEstus` — three low-pass gulp bursts + final exhale
 - `sfxDodge` — cloth swish (dry)
 - `sfxBossAppear` — tritone saw drone with sweeping lowpass
 - `sfxBossDefeated` — minor chord with top voice gliding up 20 cents to resolve (relief after horror)
 - `sfxBossScream` — dual detuned sawtooth voices gliding from high to sub-bass with closing lowpass and breath grit
 - `sfxBossCollapse` — sub-bass rumble + secondary thud for the boss body falling
 - `sfxBossFinale` — resolving minor-to-major chord + sub thud for the cutscene climax
 - `sfxDeath` — descending dissonant wail (two detuned saws minor-2nd apart, gliding from 330 55 Hz)
 - `sfxHeartbeat` — double sub-thump, auto-throttled to ~0.9 s cadence when HP ≤ 3

### Architecture

- Code reorganized into focused modules:
 - `src/App.tsx` — orchestrator + game loop + phase machine
 - `src/graphics.ts` — all canvas rendering (scenes, entities, bosses, weather)
 - `src/game/audio.ts` — Web Audio SFX + music drones
 - `src/game/config.ts` — zones + enemy kinds + boss defs + phrases
 - `src/game/settings.ts` — persisted settings with pub/sub
 - `src/game/stats.ts` — per-run stats tracking
 - `src/hud/{Hud,BossBar,RankUpBanner}.tsx` — HUD overlays
 - `src/screens/{Menu,Settings,Pause,BonfireInterlude,GameOver,Victory,SecretScreens,DevPanel}.tsx` — full-screen states
- **Game state lives in refs.** The HUD re-renders at a fixed 10 Hz off a single tick; per-keystroke changes never re-render React.
- **HiDPI-aware canvas setup** — DPR up to 2×, CSS size preserved, transform matrix set once.
- **Character-width cache** — pre-measured Cinzel glyph widths built once when fonts load, used for accurate text-aura sizing.
- **Particle cap** of 600 enforced via oldest-drop; enemy kind, boss runtime, damage-text, projectile, shockwave pools all managed independently.
- **Phase-ref mirror** updated synchronously with React state so the next rAF frame never runs with stale phase info.

### Bug fixes

- JESSYKA no longer shows the same pink color for typed and untyped letters — untyped is now dim magenta `#c85098`, typed is bright pearl pink `#ffe4f1`.
- JESSYKA completion now **also refills estus charges** (was: only HP + blessed).
- First-letter uniqueness enforced across all spawn paths (zone, caster, lich children, summoner minions, JESSYKA swap).
- Runner visual glitch fixed — the flat lighter-blend rectangle is replaced by a directional trapezoidal trail following the homing vector.
- Caster projectile / same-letter word collision fixed — typing a deflection letter no longer auto-starts an unrelated word.
- Hit detection uses `HIT_RADIUS` constant (55 px); the hit point (`PLAYER.x, PLAYER.y`) and sprite anchor share the same x, with a `SPRITE_X_NUDGE` (14 px) exposed at the top of App.tsx for fine art-alignment.
- Reverse-iteration when splicing particles/fireballs/words during updates (the classic "skip next index" bug after `forEach + splice`).
- Zero-distance guard on word homing math.
- Blessed-timeout properly cleared on unmount.
- Boss phrases are fully stationary at the top of the screen — can no longer drift into the player.
- Boss HP bar hides during the death cutscene (was: stuck at 0 HP awkwardly).
- Boss cannot be damaged twice via rapid fireball impacts after reaching 0 HP (`defeated` flag guard).
- Removed the Chanter "15 % keystroke mis-register" penalty — no more unfair stochastic punishment of correct input.
- Removed the Mimic mid-word text scramble — unfair and confusing; replaced with pure visual variation + soul bonus.
- Whispers feature removed entirely (audio, settings, UI, call sites — all gone).

### Tooling / dependencies

- Removed unused deps: `@google/genai`, `express`, `dotenv`, `lucide-react`, `motion`, `autoprefixer`, `tsx`, `@types/express`.
- Added `@types/react` and `@types/react-dom` (were missing).
- `package.json` pinned to Node `>=20.11 <23` via `engines`.
- `vite.config.ts` cleaned of the ESM-incompatible `__dirname` reference and of the unused `GEMINI_API_KEY` define.
- Added `vercel.json` explicitly setting `buildCommand`, `outputDirectory`, `installCommand` for deterministic Vercel builds. `installCommand` is `npm install --no-audit --no-fund` — uses install rather than `ci` so a fresh lockfile is generated on each deploy if the committed one is stale.
- Root-level duplicate `S-removebg-preview.png` and stale `.env.example` deleted.
- **Stale `package-lock.json` removed** — the original file referenced the old project name `react-example`, version `0.0.0`, and included the 8 removed deps (including `@google/genai` with its troublesome `@modelcontextprotocol/sdk` peer). Vercel's deployment was failing because `npm install` with that lockfile tried to install packages not listed in `package.json`. Solution: delete the stale lockfile. `vercel.json`'s `installCommand` uses plain `npm install` which generates a fresh lockfile from `package.json` on each build.

### Vercel deployment checklist (for future changes)

When adding or removing dependencies:
1. Update `package.json`.
2. **Delete `package-lock.json`** if you don't have Node installed locally, OR run `npm install` locally and commit the regenerated lockfile.
3. Verify `vite.config.ts` stays ESM-compatible (no `__dirname`, no `require()`).
4. Never import from packages not in `package.json` — Vite's dev server falls back to node_modules, but the Vercel build won't have un-declared packages.
5. Keep `vercel.json`'s `installCommand` as `npm install …` (not `npm ci`) for tolerance of minor lockfile drift.

---

## [0.1.0] — Initial refactor

- Split the original monolithic `App.tsx` into `App.tsx` (orchestration) + `graphics.ts` (pure canvas rendering).
- Three HiDPI canvases (bg / action / text).
- Game state moved from React state to refs; HUD tick set to 10 Hz.
- Cached character widths for Cinzel 24 px.
- Particle cap at 600, drop-oldest on overflow.
- Preloaded smooch audio for the easter egg.
- Initial atmospheric scene — cathedral silhouette, fog, rising embers, low-HP red vignette, word auras, fireball halos, shockwave rings, screen shake.
- CSS: player idle float, ember rain on menu/death screens.
- YOU DIED reveal animation (Dark-Souls style horizontal-squash + blur-in).

---

## [0.0.0] — Genesis

The original Cursed Echoes prototype: endless typing, one scene, one font, four combo ranks.
