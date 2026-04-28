# Changelog

All notable changes to Cursed Echoes. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [0.2.1] — Polish pass

Targeted feedback response after live-testing the Abyss Overhaul. Bug fixes, boss-combat refinements, HUD de-cluttering, and new visual effects.

### 🐛 Bug fixes

- **`MOUNTAINTOP` was unbeatable.** The word bank contained the literal string `"MOUNTaintop"` (mixed-case). Typing uppercase mismatched the lowercase letters in the stored word so completion was impossible. Fixed the entry + defensively `.map(w => w.toUpperCase())` the whole `GOTHIC_WORDS` array so stray casing can never break gameplay again.
- **DODGE text didn't appear during boss fights.** The contact-check branch only pushed the `DODGE` toast in zone phase; projectile dodges during boss fights were silent. Moved the push into `updateProjectiles`'s i-frame branch too, so any successful dodge (word contact OR projectile) shows clear blue `DODGE` feedback.

### 👹 Boss combat overhaul

- **Bosses moved up the screen.** `BOSS_AIM.y` shifted from `470 → 380`, projectile spawn point from `y=440 → 360`, silhouette base from `520 → 440`. Projectiles now spawn a full ~90 px higher so they launch from the boss's body, not beside the player.
- **Bosses tankier.** HP raised across the board: Taurus 8 → 14, Ornstein 12 → 22, Gwyn 18 → 32. Fights feel weighty without changing the phrase-damage formula.
- **Boss phrase is centered AND framed.** Every phrase now spawns dead-center horizontally (`x = (DESIGN_W − widthEst) / 2`). A gothic frame in the boss's theme color is drawn around it: pulsing radial glow fill, thin outline, four corner brackets, and a `◈ BOSS PHRASE ◈` label above it. The phrase tied to the boss HP bar is unmistakable.
- **Phrases vs word-projectiles separated cleanly.** New `isBossPhrase` and `isBossAttack` flags on `Word`. Boss-damage payload only attaches to completion-fireballs of phrases; word-projectiles never damage the boss but DO damage the player on contact.
- **Wave attack is now a slow-spinning bullet-hell spiral.** Twelve projectiles spawn in a ring around the boss at radius 50, rotating CW or CCW (randomized per cast) while slowly expanding outward. They sweep through the entire play area instead of only the center. Projectile `spiralOrigin / spiralAng / spiralRadius / spiralAngVel / spiralRadVel` fields drive the pattern.
- **New `word` attack pattern.** Bosses occasionally fire a FULL WORD as a projectile (`DEATH`, `DOOM`, `WITHER`, `RUIN`, `ASHES`, `CURSE`, `PYRE`, `DUSK`, `ABYSS`, `BLIGHT`). It descends at speed 0.45 with a `runner`-style streak and damages the player on contact (≈ 2-5 HP, scales with length). Typing it out destroys it without damaging the boss — a defensive type. Added to Taurus phase 3, Ornstein phase 2-3, Gwyn phase 2-3.
- **Volley spread tightened.** Was ±220 px (letters at the edges never threatened the player). Now ±140 px — every volley letter actually passes through the player zone.
- **Boss projectile spawn bounds expanded.** Projectiles are now cleaned up when they exit any screen edge (`x < -50 || x > DESIGN_W + 50 || y < -50 || y > DESIGN_H + 30`), not only when they fall off the bottom — needed for spiral patterns that can spin outward past the sides.

### 🎭 Enemy clarity

- **Caster projectiles got a dramatic magic-orb redesign.** Dedicated `drawCasterProjectile` function: six-point trail of fading magenta orbs, outer halo (`rgba(255,100,255)` gradient), 5-point rotating rune ring at radius 20, counter-rotating inner 3-point ring at radius 12, white-hot core, the letter rendered on top with magenta shadow. Clearly distinct from boss projectiles (which keep their simpler amber look).
- **Caster muzzle flash.** When a caster fires, 12 magenta-pink spark particles burst from its position so you can trace the source.
- **Ghost enemies harder.** Flicker formula rewritten: two detuned sines (frequencies `0.0055` and `0.013`) combine with an asymmetric curve — peaks hold at alpha 0.25-1.0, troughs drop to 0.03 for noticeably longer intervals. Irregular rhythm means you can't predict when a letter will be readable.

### 🎨 HUD & visual effects

- **HUD de-cluttered.** Estus row moved from the top-left block to its own bottom-left anchor at `bottom-8 left-8`. Flasks are now larger (`w-8 h-12`), with a proper bottle clip-path. The top-left keeps HP / stamina / souls / zone / accuracy / zone-progress / combo rank.
- **Words now pass OVER the HUD, not under it.** Fixed the stacking-context bug where the shake-wrapper's `transform` created a new stacking context, so the inner text-canvas `z-40` only competed WITHIN that wrapper — while the outer HUD (`z-30` at the container level) sat above it unconditionally. Moved the HUD + BossBar inside the shake wrapper between the action canvas (`z-10`) and text canvas (`z-40`), so enemy words visually glide across any HUD element.
- **Rank-up banner removed; rank IMAGES now animate dramatically on change.** Deleted `src/hud/RankUpBanner.tsx` entirely and removed all `rankUpEvent` plumbing from App.tsx. The rank-up SFX (`sfxRankUp`) still fires. The HUD rank image now has a new `rank-icon` class with two layered animations:
  - `rankIconReveal` (900 ms): appears blurred + scaled-down 0.3× with intense over-saturated glow, blooms to 1.45× at 35 % with high brightness, settles to 1.00× with a subtle 75 %-keyframe overshoot.
  - `rankIconIdle` (3.6 s infinite): continuous breathing — scale 1.00↔1.04, slight +1 px lift, glow oscillates 10 px ↔ 18 px.
  - `rank-icon-sss` variant: cyan glow instead of amber, faster 1.8 s loop with slight rotation (−2° ↔ 3°) — gives SSS rank a distinct heartbeat.
  - `key={rankChangeKey}` on the `<img>` re-mounts it on rank change, re-triggering the reveal animation.
- **Estus drinking animation.** Multiple layered effects during the 1.15 s chug:
  - Player sprite gets an `.is-drinking` class with a green+amber drop-shadow glow + brightness 1.15 + a `playerDrink` up-down bob keyframe.
  - Canvas-drawn healing halo pulses at the player's feet (radial green gradient, sine-pulsed at 0.014 Hz).
  - An amber flask glyph rises from the player's chest, with its fluid level draining from 100 % down to 0 % as progress advances.
  - A circular progress ring sweeps around the player (clockwise, starting from 12 o'clock).
  - Green + amber ember sparks ambient-spawn at ~40 % per frame.
  - On completion: `+N` text + a 22-particle celebratory burst.
  - Estus flask icons in the HUD get an `.estus-drain` keyframe (bright flash + darken) on the specific flask being used.

### 🛠️ Dev panel access

- **`◇ DEV CONSOLE` button on the Pause overlay.** Dedicated emerald-styled button alongside Resume / Settings / Abandon Run.
- **`◇ DEV` button on the Game Over screen.** Small bottom-left button, fades in 200 ms after the Try Again button.
- **`◇ DEV` button on the Victory screen.** Matching placement/style.
- All three thread through a new `onOpenDev` prop wired to `setShowDevPanel(true)` in the App orchestrator.

### 🔧 Internal refactors

- **`Word` type** gained `isBossAttack?: boolean` and `isBossPhrase?: boolean`.
- **`Projectile` type** gained `spiralOrigin / spiralAng / spiralRadius / spiralAngVel / spiralRadVel` (spiral pattern state) and `trail?: {x,y}[]` (dramatic caster streak).
- **`spawnFireball`** now distinguishes phrase-completion fireballs (carry boss-damage payload) from attack-word fireballs (purely visual).
- **`drawProjectile`** is now a dispatcher: `drawBossProjectile` (simple amber letter) vs `drawCasterProjectile` (elaborate magic orb + trail + rune rings + hot core).
- **`drawEstusChug`** new function rendering the estus visuals on the action canvas. Called from the game loop after particles.
- **`hexA(hex, alpha)`** small helper in App.tsx for building `rgba()` strings from `#rrggbb` boss theme colors — used by the gothic-frame render.

### ✅ Verified

- All brace / paren balance checks pass across every `.ts` / `.tsx` file.
- Vercel build path: `vite build` with `installCommand: npm install --no-audit --no-fund` in `vercel.json`.
- No residual `RankUpBanner` / `rankColor` / `rankUpEvent` references.

---

## [0.2.0] — The Abyss Overhaul

A complete reimagining of the game. What started as an endless typing trial is now a structured four-zone Soulslike with bosses, estus, dodge rolls, dramatic audio, atmospheric scenes, and a proper progression arc.

### 🗺️ Zones & Progression

- **Phase machine** — gameplay now flows through discrete phases: `menu → zone → boss → bonfire → (repeat) → victory | gameover`. Every transition is explicit and visible to the player.
- **Four zones** with distinct palettes, word pools, weather, music, difficulty curves, and enemy mixes:
  - **Firelink Shrine** (45 s, no boss) — warm sunset, short words, calm intro
  - **Undead Burg** (75 s → boss) — stormy rain, runners and casters and ghosts
  - **Anor Londo** (85 s → boss) — god rays through cathedral arches, mimics, liches
  - **Kiln of the First Flame** (70 s → boss) — bleached ash palette with drifting embers, chanters and long phrases
- **Zone-progress bar** on the HUD with remaining seconds, plus a "◈ The flame calls ◈" hint pulse at ≤10 s so the zone-end transition is never a surprise.
- **Bonfire interlude** between zones — full heal, estus refills, stamina refills. Animated CSS bonfire with three-layer flame plus name-of-next-zone preview.
- **Victory screen** after Gwyn falls — one-line "VICTORY ACHIEVED" title with a blur-in scale reveal animation, continuous golden pulse, animated god-ray sweep across the background.

### 👹 Bosses

- **Three fully-scripted boss encounters** with procedural silhouettes drawn on canvas:
  - **Taurus Demon** — Beast of the Ramparts — 8 HP, hulking horned silhouette with glowing red eyes
  - **Dragon Slayer Ornstein** — Captain of the Four Knights — 12 HP, slim knight with lightning-tipped spear
  - **Gwyn, Lord of Cinder** — The First Flame — 18 HP, tall crowned figure wreathed in flame
- **Phase transitions** at 66 % and 33 % HP with announcement text overlay and lightning-flash telegraph. Final phase triggers "enraged" state (boosted rim glow, red aura, intensified attack rotation).
- **Phrase-damage system** — completing a phrase fires a single damaging fireball at the boss with `ceil(letterCount / 7)` HP damage. Longer phrases hit harder.
- **Attack-pattern scheduler** with three distinct projectile patterns:
  - **`single`** — one letter fired from the boss's chest, slight aim toward player
  - **`volley`** — three simultaneous letters in a horizontal spread (telegraph lightning flickers first)
  - **`wave`** — five letters sweeping L→R across the screen, staggered so they arrive in sequence
- **Per-phase pattern rotation** per boss — each phase cycles through its own pattern list at a fixed interval.
- **Rich phrase banks** — 12 easy, 12 mid, 11 hard phrases with zero overlap. Phrases are stationary at the top of the screen (y=130-160), one at a time, horizontally spread to fit without clipping.

### 💀 Boss death cutscene

A full 3.2-second dramatic sequence triggered when any boss hits 0 HP:

- **Beat 1 (0-800ms)** — `sfxBossScream` (dual detuned sawtooth voices, minor-2nd apart, gliding 420→60 Hz with a closing lowpass and breath noise). Boss silhouette violently jitters (±14 px), 60-particle crimson/theme-color burst, big shockwave, lightning strobe, screen shake mag 18. Projectiles cleared, typing frozen, `+NNNN SOULS` in amber floats up, "**NAME FELLED**" announcement.
- **Beat 2 (900ms)** — `sfxBossCollapse` (sub-bass rumble + secondary thud). Silhouette sinks ~40 px, jitter calms, rim glow intensifies, cracks deepen, second shockwave, second lightning flash.
- **Beat 3 (2400ms)** — `sfxBossFinale` (resolving minor-to-major chord + sub thud + warm noise). Final shockwave (max radius 380 px, gold-cream), brightest lightning.
- **Beat 4 (3200ms)** — transition to bonfire interlude.
- Throughout: continuous random particle bursts (~55 % of frames, 4 per burst, mixed crimson + theme color), silhouette fade from α=1→0 in final phase, invulnerability on the player for the full cutscene. Boss HP bar hidden once defeated.

### ⚔️ Player mechanics

- **Estus flask** (`TAB`) — 3 charges, 1.15 s chug during which typing is locked, heals 4 HP. Refills at bonfires. HUD estus-slots row shows remaining charges.
- **Dodge roll** (`SPACE`) — 200 ms of i-frames over a 360 ms slide animation. Costs 35 stamina (regens over ~2 s). Direction-randomized slide animation with drop-shadow flash. Contact hits during i-frames spawn a blue "DODGE" toast instead of damage. Projectiles are also dodgeable.
- **Pause** (`ESC`) — full overlay menu (resume / settings / abandon run).
- **Mobile support** — hidden input relay auto-focused on tap; virtual keyboard opens; onChange routes characters to the game.
- **Damage feedback overhaul**: six-layer hit response when the player is struck — screen shake, red-radial screen flash overlay, sprite filter brightness-pop, floating `-N` damage number, red shockwave ring, 28+5×dmg blood-burst particles.

### 👻 Enemy variety (seven kinds)

All enemies respect first-letter uniqueness across every spawn path — no two on-screen words ever share a starting letter, even across caster words and lich-child spawns.

- **Normal** — standard falling echo
- **Ghost** — letters flicker in and out (alpha oscillates via sine)
- **Tank** — long 10-14 letter armored word with stroke outline on untyped letters
- **Runner** — fast 3-4 letter word with directional motion-streak (gradient trail points away from the player, follows homing vector)
- **Lich** — on death spawns 2 short minion echoes from its position, with first-letter dedup against living words
- **Phantom** (was Mimic) — pure-visual ghost double-image on letters; completion grants **+50 % bonus souls** with `+N` floating text and pink particle burst. No scrambling, no keystroke punishment.
- **Summoner** (was Chanter) — stationary at top; every 4-5 s spawns a 3-5 letter minion echo that homes toward the player. Killing the summoner stops spawns. **No more keystroke mis-registration** — your inputs always do what you told them.
- **Caster** — fires single-letter projectiles that home at the player. Typing the projectile's letter deflects all in-flight projectiles with that char. Deflection does **not** accidentally start a new word.

### 🎯 Fireballs, projectiles, combat feel

- **Projectile deflection rules revamped** — typing a letter that matches an incoming projectile destroys all in-flight projectiles with that letter first. If you had no active word, the keystroke is consumed by the parry (does not auto-start a new word). If you had an active word and the letter only matches the projectile (not the word's next letter), it's neutral — parry succeeds, no miss penalty, combo stays.
- **Caster-projectile spawn rates** tuned so parries feel fair rather than overwhelming.
- **Boss projectiles** spawn from the boss's body (y≈440) not near the player; travel at vy 1.5-1.8 (was 2.2-3.4) for readable timing.

### 🎭 Graphics & atmosphere

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

### 🎨 UI/UX

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

### ♿ Accessibility

- **Reduce motion** — disables screen shake, screen flash, rank-up sweep, YOU DIED reveal animation, and player idle float. Ember/rain animations slow drastically.
- **High contrast** — brightens UI text, disables background blur.
- **Colorblind mode** — swaps red danger cues for blue.
- **Font scale** — 0.8× / 1.0× / 1.2× adjusts enemy word glyph rendering via the cached char-width map.
- All new animations use `cubic-bezier` easing appropriate for their purpose (reveals, settles, fades).

### 🎵 Audio — Bloodborne-inspired procedural system

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
  - `sfxDeath` — descending dissonant wail (two detuned saws minor-2nd apart, gliding from 330 → 55 Hz)
  - `sfxHeartbeat` — double sub-thump, auto-throttled to ~0.9 s cadence when HP ≤ 3

### 🧠 Architecture

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

### 🐛 Bug fixes

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

### 📦 Tooling / dependencies

- Removed unused deps: `@google/genai`, `express`, `dotenv`, `lucide-react`, `motion`, `autoprefixer`, `tsx`, `@types/express`.
- Added `@types/react` and `@types/react-dom` (were missing).
- `package.json` pinned to Node `>=20.11 <23` via `engines`.
- `vite.config.ts` cleaned of the ESM-incompatible `__dirname` reference and of the unused `GEMINI_API_KEY` define.
- Added `vercel.json` explicitly setting `buildCommand`, `outputDirectory`, `installCommand` for deterministic Vercel builds. `installCommand` is `npm install --no-audit --no-fund` — uses install rather than `ci` so a fresh lockfile is generated on each deploy if the committed one is stale.
- Root-level duplicate `S-removebg-preview.png` and stale `.env.example` deleted.
- **Stale `package-lock.json` removed** — the original file referenced the old project name `react-example`, version `0.0.0`, and included the 8 removed deps (including `@google/genai` with its troublesome `@modelcontextprotocol/sdk` peer). Vercel's deployment was failing because `npm install` with that lockfile tried to install packages not listed in `package.json`. Solution: delete the stale lockfile. `vercel.json`'s `installCommand` uses plain `npm install` which generates a fresh lockfile from `package.json` on each build.

### ⚠️ Vercel deployment checklist (for future changes)

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
