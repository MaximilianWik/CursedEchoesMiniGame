# Update Log: Cursed Echoes

## What's New

### Tier 1 — Gameplay Bets
* **Phase Machine:** `Menu` → `Zone` → `Boss` → `Bonfire` → ... → `Victory / Game Over`. Each phase features unique screens and music. Bonfires provide a full restore for **HP, Estus, and Stamina**.
* **Four Zones:** Firelink (Tutorial), Burg, Anor Londo, and Kiln. Each includes distinct palettes, weather effects, music drones, word pools, and speed modifiers.
* **Three Boss Fights:** Taurus, Ornstein, and Gwyn.
    * Hand-drawn procedural silhouettes.
    * Multi-phase HP with an **Enrage State** at 33%.
    * Shared phrase pools for damage and unique projectile-letter pools.
* **Estus Flask (TAB):** 3 charges. Each "chug" takes 1.15s (typing is locked) and heals 4 HP. Refills at bonfires.
* **Dodge Roll (SPACE):** 200ms i-frames with a 360ms animation. Costs 35 stamina. Stamina regenerates over ~2s. Displays a blue **"DODGE"** text upon a successful deflect.

---

### Tier 2 — Enemy Variety
* **7 Enemy Kinds:** Normal, Ghost, Tank, Runner, Lich, Mimic, Chanter, and Caster. 
    * Weighted spawn rates per zone.
    * Visual effects: Flicker, armored stroke, motion blur, rune aura, and post-50% scramble.
* **Caster Projectiles:** Sorcery, Pyromancy, Lightning, Miracle, Darkmoon, and Chaos types. They fire single-letter homing projectiles. Typing the letter destroys all in-flight projectiles of that character.
* **Combo Phrases:** Bosses drop multi-word phrases. Spaces are auto-skipped so you can maintain typing rhythm.

---

### Tier 3 — Sound + Atmosphere
* **Procedural Audio:** Fully synthesized via Web Audio (oscillators, noise buffers, biquad filters). Includes whooshes, impact booms, glass shatters, rank-up bells, and a low-HP heartbeat.
* **Per-Zone Drone Music:** Two detuned sawtooth oscillators. Each zone has a unique root pitch, cutoff, and LFO rate. Includes smooth cross-fades on transitions.
* **Web Speech Whispers:** Falling words whisper themselves at a low pitch/rate (limited to one every 700ms to prevent cacophony).
* **Dynamic Weather:** Rain (Burg), God-rays (Anor Londo), and Ember Storm (Kiln).
* **Environmental Detail:** Red eyes blinking in the fog, silhouette crows, impact decals, and lightning flashes during phase changes.

---

### Tier 4 — UX Polish
* **Redesigned Menu:** Animated ember rain, gothic sigil dividers, and keyboard hints.
* **Settings Panel:** * Volume sliders (Master, Music, SFX, Whispers).
    * **Accessibility:** Reduce-motion, high-contrast, colorblind mode, and font-scaling (0.8x to 1.2x).
* **Bonfire Interlude:** Animated CSS flames with zone announcements.
* **Rich End Screen:** Tracks Souls, Max Combo, Accuracy, WPM, Deadliest Letter, and a **Combo-over-time mini-graph**.

---

## Architecture

```text
src/
  App.tsx                  # Orchestrator + game loop + phase machine (1486 L)
  graphics.ts              # All canvas rendering (1174 L)
  index.css                # Tailwind + gothic keyframes (384 L)
  game/
    audio.ts               # Web Audio SFX + drone music + speech whispers
    config.ts              # Zones, enemy kinds, bosses, phrases
    settings.ts            # Persisted settings store with pub/sub
    stats.ts               # Per-run stats tracking
  hud/
    Hud.tsx                # HP bar, estus row, stamina, rank, souls
    BossBar.tsx            # Boss HP banner with phase ticks
    RankUpBanner.tsx       # Center-screen rank-up announcements
  screens/
    Menu.tsx               # Start + settings entry
    Settings.tsx           # Volume + accessibility
    Pause.tsx              # Resume / settings / abandon
    BonfireInterlude.tsx   # Between-zone rest
    GameOver.tsx           # YOU DIED reveal + rich stats + combo graph
    Victory.tsx            # Post-Gwyn celebration
    SecretScreens.tsx      # Easter eggs
```

---

## Non-Overlap Guarantees

> * **Estus Logic:** Typing and dodging are locked during the "chug" animation to prevent accidental word progression while vulnerable.
> * **I-Frames:** Dodge frames prevent both contact damage and projectile hits simultaneously.
> * **Boss Priority:** Boss phases pause normal word spawning. Damage is guarded by `targetBoss` flags to prevent double-triggering during transitions.
> * **Projectile Deflection:** This happens *before* active-word progression. Typing a letter that matches both a projectile and your current word will prioritize parrying the projectile first.
> * **State Sync:** Phase transitions update `phaseRef.current` synchronously to ensure the game loop never processes a frame with stale state.

---

## To Run

```powershell
npm install
npm run lint     # tsc --noEmit — ensures a clean build
npm run dev
```

The tension of the Estus economy combined with the rhythm of dodge-typing creates a fundamentally different experience. Don't go hollow!

