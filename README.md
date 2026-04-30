# Cursed Echoes

A gothic typing trial. Four zones. Three bosses. Banish the echoes, parry the spells, type the phrases, kindle the fading flame.

**Live:** https://cursedechoes.vercel.app/
**Current version:** `0.3.8` — ZOOTED level 3 wobble no longer shrinks the playfield (was clobbering the viewport-fit scale transform). See [CHANGELOG.md](./CHANGELOG.md) for full history. Version is shown in-game on the menu, pause, settings, game-over and victory screens.

https://github.com/user-attachments/assets/cc4d2332-4475-4e61-bd31-d33734f54dab

## Quick start

```powershell
npm install
npm run dev       # vite, port 3000
npm run lint      # tsc --noEmit
npm run build     # production bundle
```

Vercel auto-deploys from `main`. `vercel.json` pins the install + build commands. After any `package.json` dependency change, either delete `package-lock.json` locally (Vercel will regenerate) or run `npm install` and commit the new lockfile.

## Controls

| Key | Action |
|:--:|:--|
| `A–Z` | type to banish words |
| `2`–`6` | parry incoming projectiles — every projectile carries a digit, press the matching key to deflect (`1` is skipped — its lookalike shape reads too close to a letter) |
| `TAB` | estus — heal 4 HP over a 1.15 s chug (vulnerable during), then 4 s of godmode with a gold/cyan glow |
| `SPACE` | dodge roll — 200 ms i-frames, costs 35 stamina |
| `Q` | boss-fight only — burn 1 estus to summon Jessyka in projectile-intercept mode for 25 s |
| `ESC` | pause / resume |
| `` ` `` | open the dev gate (password-protected) on the menu |

Mobile: tap the play area to open the soft keyboard. Taps relay characters into the game via a hidden input.

## Progression

Linear for now — four zones, beat each to advance:

1. **Firelink Shrine** (45 s, no boss) — warm amber sunset, short words, calm intro. A stone shrine stands against a sinking sun, the first bonfire flickering beside it.
2. **Undead Burg** (75 s) → **Taurus Demon** *or* a hidden secret boss — stormy rain, ruined city silhouette, two crumbling towers, chains swaying from a broken archway. The first time you clear the Burg, the game offers **CHOOSE THY FOE** — a fork in the trial. Your choice is remembered per save file; clear save data in Settings to see the fork again.
3. **Anor Londo** (85 s) → **Dragon Slayer Ornstein** — the iconic cathedral with a glowing rose window, god rays, twin bell towers, distant mountains.
4. **Kiln of the First Flame** (70 s) → **Gwyn, Lord of Cinder** — bleached ash, ember storm, a ring of tilted pillars circling the throbbing First Flame.

Every combat zone ends with a boss, every boss is preceded by a **3-second intro cutscene** where the silhouette fades in from below while the name, title, and lore text reveal. The cutscene suppresses all attacks so the reveal is clean. Bonfires between zones restore HP, estus charges, and stamina.

## Enemy kinds

First-letter uniqueness is enforced on spawn — no two on-screen words share a starting letter.

| Kind | Behavior |
|:---|:---|
| **Normal** | falls and homes toward the player |
| **Ghost** | letters flicker at an irregular rhythm, holding near-invisibility for up to half a second |
| **Tank** | long 10-14 letter word with an armored outline stroke on untyped letters |
| **Runner** | short 3-4 letter word, fast, with a directional motion-streak along its homing vector |
| **Lich** | on death spawns 2 short child echoes from its position |
| **Phantom** (mimic kind) | pure-visual ghost double-image; completion grants **+50 % bonus souls** with a pink celebration burst |
| **Summoner** (chanter kind) | stationary near the top; every 4-5 s spawns a 3-5 letter minion that descends toward the player. Kill the summoner to stop spawns |
| **Caster** | glowing magenta word that periodically fires single-letter projectile orbs at you. Type the projectile letter to parry it + send a fireball back |

## Boss mechanics

- **One phrase at a time**, pinned dead-center at the top inside a gothic frame with `◈ BOSS PHRASE ◈` label. Completing it fires a damage-payload fireball at the boss — `ceil(letterCount / 7)` HP per phrase.
- **Three attack patterns** that rotate per-phase:
  - **`single`** — one letter from the boss's chest, gently aimed at the player
  - **`volley`** — three simultaneous letters in a `±140 px` horizontal spread with a lightning-flicker telegraph
  - **`wave`** — a **slow spinning spiral** of 12 letters around the boss, rotating CW/CCW while expanding outward across the whole play area
  - **`word`** (phase 2/3) — a FULL WORD like `DEATH`, `DOOM`, `WITHER` falls as a runner-style attack. Type it to defuse defensively (no boss damage); if it reaches you, heavy hit
- **Projectile letters are filtered** to exclude every letter in the active phrase, so no typing ambiguity — each keystroke is either a phrase letter OR a deflect, never both.
- **Phases transition** at 66 % and 33 % HP with an announcement overlay and a lightning flash. Final phase triggers `enraged` state (boosted rim glow, red aura, faster pattern rotation).
- **Death cutscene** — 3.2 s: violent jitter + scream SFX → sink + collapse rumble → final flash + resolving chord → bonfire. Invulnerable for the whole cutscene.

| Boss | HP | Phrases | Attacks |
|:---|:--:|:--:|:---|
| Taurus Demon — *Beast of the Ramparts* | 14 | short (5–8 letters) | single → volley → wave + word |
| Dragon Slayer Ornstein — *Captain of the Four Knights* | 22 | medium (10–18) | single → volley/single → wave/word |
| Gwyn, Lord of Cinder — *The First Flame* | 32 | long phrases (18–32) | single+volley → wave+word → all four |

## Parry system

Typing a letter that matches an in-flight projectile:

1. Spawns a **real fireball from the player** toward the projectile's position.
2. **Destroys the projectile** with a parry spark.
3. **Always credits the keystroke** — correct-letter stat, +1 combo. Can never reset your combo (it's atomic).

Projectile deflection takes precedence over starting a new word — if your keystroke parries something, it doesn't accidentally start typing an unrelated word on screen.

## HUD

- **Top-left**: HP bar → stamina bar → souls → zone name + difficulty → accuracy → zone-progress bar with seconds remaining → "◈ The flame calls ◈" hint at ≤10 s → combo rank image with dramatic reveal animation on change.
- **Bottom-left**: estus flask row (3 slots), `ESTUS N/3` label. Individual flasks flash + drain-darken when consumed.
- **Top-right**: pause button.
- **Center-top during boss**: name + title + HP bar with phase-tick marks at 66 % / 33 %.
- **Words render OVER the HUD** (text canvas sits above HUD in the stacking order) so descending echoes glide across HUD elements instead of hiding behind them.
- **Rank-up feedback** is now handled entirely by the rank image itself — dramatic scale/blur/glow reveal on rank change + continuous subtle breathing animation. SSS has its own cyan pulsing variant. No more full-screen toast.

## Dev console

Password-gated testing panel. Open via:
- `◇ DEV` button bottom-left on the menu
- `◇ DEV CONSOLE` button on the pause overlay
- `◇ DEV` button on the game-over / victory screens
- `` ` `` keyboard shortcut on the menu

Password: `developer`. Panel offers:
- Jump to any zone (1–4) or boss (Taurus / Ornstein / Gwyn)
- Jump to the victory screen with fake stats
- Full heal, refill estus, +20/+100 combo
- Despawn all words, trigger lightning flash

## Architecture

```
src/
  App.tsx                  orchestrator + game loop + phase machine
  main.tsx                 react root
  constants.ts             word bank (auto-uppercased)
  graphics.ts              all canvas rendering (scenes, entities, bosses, weather)
  index.css                tailwind + gothic keyframes
  game/
    audio.ts               procedural Web Audio SFX + drone music + cathedral reverb
    config.ts              zones, enemy kinds, bosses, phrases, lore, ghost messages
    settings.ts            persisted settings store with pub/sub
    stats.ts               per-run stats tracking
  hud/
    Hud.tsx                HP + stamina + combo (top-left) & estus (bottom-left)
    BossBar.tsx            boss HP banner with phase ticks (hidden during intro)
  screens/
    Menu.tsx
    Settings.tsx           volume + accessibility toggles
    Pause.tsx              resume / settings / dev console / abandon
    BonfireInterlude.tsx   between-zone rest with animated bonfire sprite
    GameOver.tsx           YOU DIED reveal + rich stats + combo graph + dev button
    Victory.tsx            post-Gwyn screen with animated reveal
    SecretScreens.tsx      Jessyka easter egg
    DevPanel.tsx           password-gated jump panel
```

## Design notes

- **Three HiDPI canvases** (background, action, text) plus a red screen-flash div and a shake-wrapper DOM layer for damage feedback. The HUD sits between the action and text canvases so words render over it.
- **Game state lives in refs.** The HUD re-renders at 10 Hz off a single ref-driven tick; per-keystroke state changes never re-render React.
- **Audio is procedural.** Every SFX is synthesized via Web Audio on demand — no audio assets. Cathedral reverb bus, sub-bass thud primitive, dissonant tritone drones per zone, inharmonic bell partials for rank-up.
- **Pause-safe timers.** Zone elapsed time is accumulated per active frame (using real-seconds `dt`), so pausing cannot advance the timer. Boss attack schedules use absolute `performance.now()` timestamps and are also gated by the intro cutscene.
- **All animations respect `reduce-motion`.** Shake, screen flash, player float, and the YOU DIED reveal all collapse to static fades when the setting is on.
- **Settings persist** in `localStorage` under `abyss_settings_v1` and apply live to React and the game loop via a pub/sub store.

## Accessibility

- **Reduce motion** — disables shake, screen flash, rank-up animation, YOU DIED reveal, player float.
- **High contrast** — brightens UI text, disables background blur.
- **Colorblind mode** — swaps red danger cues for blue.
- **Font scale** — 0.8× / 1.0× / 1.2× for enemy word glyph rendering.

## Out of scope (for now)

- Real sprite-sheet enemy art
- Tier 5 features from the original deep-dive (daily challenge, classes, unlockables, replays)
- Mobile gesture overhaul (touch scrolling, gesture dodge)
- Server-side highscore sync
