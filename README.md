# Cursed Echoes

A gothic typing trial. Four zones. Three bosses. Banish the echoes before they reach you.

**Live:** https://cursedechoes.vercel.app/

https://github.com/user-attachments/assets/cc4d2332-4475-4e61-bd31-d33734f54dab

## Development

```bash
npm install
npm run dev     # vite, port 3000
npm run lint    # tsc --noEmit
npm run build   # production bundle
```

## Controls

| Key | Action |
|:--:|:--|
| `A–Z` | type to banish falling words and deflect projectiles |
| `TAB` | chug an estus flask — heals 4 HP, 1.15 s vulnerability window |
| `SPACE` | dodge roll with 200 ms of i-frames — costs stamina |
| `ESC` | pause / resume |

## Progression

1. **Firelink Shrine** — tutorial; short words, slow pace, warm amber light
2. **Undead Burg** — rain, runners, tanks, ghosts, casters → **Taurus Demon**
3. **Anor Londo** — god-rays, mimics, liches → **Dragon Slayer Ornstein**
4. **Kiln of the First Flame** — ember storm, chanters, long phrases → **Gwyn, Lord of Cinder**

Each zone ends with a bonfire: full heal, estus refills, brief pause for breath.

## Enemy types

| Kind | Behavior |
|:---|:---|
| **Normal** | falls and homes toward the player |
| **Ghost** | letters flicker in and out |
| **Tank** | long word, slow, armored outline |
| **Runner** | short word, fast, motion-blur streak |
| **Lich** | spawns 2 child echoes on death |
| **Mimic** | letters scramble at 50 % typed |
| **Chanter** | stationary; causes 15 % of your keystrokes to mis-register |
| **Caster** | fires single-letter projectiles that home at you — type the letter to deflect |

Boss fights freeze normal spawns. Instead, multi-word phrases drift in from the top; completing a phrase deals 1 damage to the boss. The boss continually fires projectile letters — type them or take 2 HP.

## Architecture

```
src/
  App.tsx                  orchestrator + game loop + phase machine
  main.tsx                 react root
  constants.ts             word bank
  graphics.ts              all canvas rendering (bg, entities, bosses, weather)
  index.css                tailwind + gothic keyframes
  game/
    audio.ts               procedural Web Audio SFX + drone music + speech whispers
    config.ts              zones, enemy kinds, bosses, phrases, ghost messages
    settings.ts            persisted volume + accessibility settings with pub/sub
    stats.ts               per-run stats tracking
  hud/
    Hud.tsx                HP, estus, stamina, rank, souls
    BossBar.tsx            boss HP bar + phase ticks
    RankUpBanner.tsx       "SAVAGE!" center-screen announcement
  screens/
    Menu.tsx
    Settings.tsx           volumes + accessibility toggles
    Pause.tsx              resume / settings / abandon
    BonfireInterlude.tsx   between-zone rest
    GameOver.tsx           "YOU DIED" + rich stats + combo graph
    Victory.tsx            after Gwyn falls
    SecretScreens.tsx      Jessyka easter egg
```

## Design notes

- **Three HiDPI canvases** (background, action, text) plus a red screen-flash div and a shake-wrapper DOM layer for damage feedback.
- **Game state lives in refs.** The HUD re-renders at 10 Hz off a single ref-driven tick; per-keystroke state changes never re-render React.
- **Audio is procedural.** Every SFX is synthesized on the fly via oscillators, biquad filters, and noise buffers — no audio assets needed. The ambient music is a two-detuned-saw drone through a filter with a slow LFO; per-zone pitch and cutoff make each area feel distinct. Whispers use Web Speech.
- **All animations respect `reduce-motion`.** Shake, screen flash, rank-up sweep, player float, and the YOU DIED reveal collapse to static or brief fades when the setting is on.
- **Settings persist** in `localStorage` under `abyss_settings_v1` and apply live to both React and the game loop via a pub/sub store.
