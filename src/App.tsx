/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cursed Echoes — a gothic typing trial.
 *
 * App.tsx is the orchestrator: it holds the React component tree, the game-loop
 * useEffect, the phase machine, and the key-event router. All heavy lifting
 * (rendering, audio, data) lives in dedicated modules under src/game/,
 * src/graphics.ts, src/hud/, and src/screens/.
 */

import React, {useEffect, useRef, useState, useCallback} from 'react';
import {GOTHIC_WORDS} from './constants';

import {
  DESIGN_W, DESIGN_H, PARTICLE_CAP, COMBO_RANKS,
  rankForCombo, setupHiDPICanvas, buildCharWidthCache, createBgState, setZoneStyling,
  drawBackground, drawWordAura, drawWordText, drawFireball, drawShockwave, drawParticle,
  drawProjectile, drawDecals, addImpactDecal, drawBoss, drawBossMinionSprite, triggerLightning,
  type Word, type Fireball, type Particle, type Shockwave, type Projectile,
  type BgState, type Rank, type BossRenderState,
} from './graphics';

import {ZONES, BOSSES, ENEMY_KINDS, CASTER_WORDS, GHOST_MESSAGES, AFROMAN_MUNCHIES, type EnemyKind, type BossDef, type BossPattern} from './game/config';
import {useSettings, getSettings, getRememberedBossChoice, persistBossChoice, resetBossSelectGate, resetHighscores, type BossSelectChoice} from './game/settings';
import {createStats, registerWrong, sampleCombo, deriveStats, type RunStats} from './game/stats';
import {
  initAudio, resumeAudio, playMusic, stopMusic,
  playMusicSample, stopMusicSample, setMusicSampleVolume, subscribeBeat,
  sfxCast, sfxMiss, sfxFireball, sfxImpact, sfxShatter, sfxRankUp, sfxComboBreak,
  sfxPlayerHit, sfxBonfire, sfxEstus, sfxDodge, sfxBossAppear, sfxBossDefeated,
  sfxBossScream, sfxBossCollapse, sfxBossFinale,
  sfxDeath, sfxHeartbeat,
  sfxJessykaGrace, sfxBossSummonChanter, sfxBossSummonCaster,
  sfxLichSplit, sfxEstusGodmode, sfxWordSwitch,
  sfxJessykaKissImpact, sfxJessykaSummon,
  sfxTaurusCharge, sfxTaurusStomp,
} from './game/audio';

import {Hud, type HudStats} from './hud/Hud';
import {BossBar, type BossBarStats} from './hud/BossBar';

import {MenuScreen} from './screens/Menu';
import {SettingsScreen} from './screens/Settings';
import {PauseScreen} from './screens/Pause';
import {BonfireInterlude, type BonfireReason} from './screens/BonfireInterlude';
import {GameOverScreen, type HighScore} from './screens/GameOver';
import {VictoryScreen} from './screens/Victory';
import {SecretAskScreen, SecretLoveScreen, type SecretHeart} from './screens/SecretScreens';
import {DevPanel} from './screens/DevPanel';
import {BossSelect} from './screens/BossSelect';
import {AfromanIntro} from './screens/AfromanIntro';
import {AfromanArena} from './screens/AfromanArena';
import {TaurusIntro} from './screens/TaurusIntro';
import {TaurusArena} from './screens/TaurusArena';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const PLAYER = {x: 512, y: 700};
const SPRITE_X_NUDGE = 14;
const HIT_RADIUS = 55;
const MAX_HEALTH = 10;
const MAX_ESTUS = 3;
const MAX_STAMINA = 100;
const DODGE_STAMINA_COST = 35;
const DODGE_DURATION = 360;            // ms
const DODGE_IFRAME_DURATION = 200;
const ESTUS_CHUG_MS = 1150;
const ESTUS_HEAL = 4;
const BOSS_AIM = {x: DESIGN_W / 2, y: 380};

// Monotonic counter yielding unique Word.id values for stable cross-splice lookup.
let _wordIdCounter = 1;
const nextWordId = (): number => _wordIdCounter++;

// Same idea for projectiles — chase fireballs look these up to home in on a
// still-alive projectile even as it moves across frames.
let _projectileIdCounter = 1;
const nextProjectileId = (): number => _projectileIdCounter++;

// ─────────────────────────────────────────────────────────────
// Jessyka support companion — spawns on blessed activation, targets
// high-up words with kiss projectiles, finishes its word before leaving.
// ─────────────────────────────────────────────────────────────

const JESS_SPAWN_MS = 1300;
const JESS_DESPAWN_MS = 1600;
const JESS_KISS_INTERVAL_MS = 450;       // 0.2.12: 40% faster (was 750)
const JESS_KISS_FLIGHT_MS = 660;         // 0.2.12: 40% faster (was 1100)
const JESS_X_OFFSET = 80;                // how far right of the player she stands (was 130 — closer)
const JESS_ESTUS_ACTIVE_MS = 25000;      // boss-fight estus summon active duration (0.2.9: was 15s)
const JESS_ESTUS_PROJECTILE_CHASE_SPEED = 10;  // 0.2.12: 40% faster (was 6) — matches the faster kiss flight

/** Offset from the Jessyka sprite's JSX anchor (PLAYER.x + JESS_X_OFFSET, with
 *  `bottom: 4` in a 768-tall play area) to her visual mouth. Kisses emanate
 *  from here so they read as blown from her lips, not from empty space next
 *  to the player. The sprite is 128×128 (`w-32 h-32`) — mouth sits roughly
 *  (+55, -35) from that anchor in play-area coordinates. */
const JESS_MOUTH_DX = 55;
const JESS_MOUTH_DY = -35;

/** Projectile chars — digits 2-6. Deliberately disjoint from A-Z so typing a
 *  letter can never accidentally parry a projectile (and vice versa). `1` is
 *  deliberately excluded — its lowercase-l / capital-I lookalike reads as a
 *  letter in the Cinzel font at projectile-size, causing hesitation reads. */
const PROJECTILE_DIGITS = ['2', '3', '4', '5', '6'];
const ESTUS_GODMODE_MS = 4000;            // post-chug i-frames to reward the vulnerable sip window

type JessykaState = 'spawning' | 'active' | 'leaving' | 'despawning';

type JessykaCompanion = {
  state: JessykaState;
  spawnStart: number;       // performance.now at spawn start
  despawnStart: number;     // performance.now at despawn start (0 otherwise)
  targetId: number | null;  // Word.id she's firing at
  lettersFired: number;     // how many kisses she has fired at the target
  nextKissAt: number;       // performance.now when she fires her next kiss
  castingUntil: number;     // sprite swap to kiss.png while time < this
  // New in 0.2.6 — boss-fight estus summon variant (zone-extended in 0.3.1).
  // The summonSource distinguishes spawn lifecycle (blessed-timer vs. auto-
  // despawn) but targeting is unified now: she always prioritises shielding
  // the player from projectiles before typing words (0.3.9).
  summonSource: 'jessyka-word' | 'estus';
  projectileTargetId: number | null;  // Projectile.id currently being chased
  autoDespawnAt: number;              // performance.now at which to force 'leaving' (0 = no auto-despawn)
  // Grace veil (0.2.8 + 0.3.9). The "stored" veil — consumed once per spawn
  // when incoming damage is about to land. A fresh spawn or chained JESSYKA
  // refresh sets graceUsed back to false. Separate from spawnVeilFired: the
  // initial veil on spawn is always free and doesn't touch this flag.
  graceUsed: boolean;
  // 0.3.9 — whether this companion has already cast her free "hello" veil.
  // Fires once on the spawning→active transition, NOT on a chained refresh.
  spawnVeilFired: boolean;
};

type JessykaKiss = {
  x: number; y: number;
  sx: number; sy: number;               // spawn origin (for bezier curve)
  tx: number; ty: number;                // current target position
  progress: number;                      // 0..1
  wordId: number;
  letterIdx: number;                     // which letter this kiss represents
  // Boss-projectile homing branch — when set, kiss re-aims to the projectile's
  // live position every frame at 10 px/frame instead of following a bezier arc.
  chaseProjectileId?: number;
};


/** Small helper — convert a #rrggbb color + alpha into an rgba() string. */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
}

type Phase = 'menu' | 'zone' | 'boss-select' | 'boss-intro-afroman' | 'boss-intro-taurus' | 'boss' | 'bonfire' | 'victory' | 'gameover';

type BossRuntime = {
  def: BossDef;
  currentHp: number;
  phaseIdx: number;
  nextAttackAt: number;
  nextPhraseAt: number;
  patternRotationIdx: number;
  enraged: boolean;
  attackWindupT: number;
  defeated: boolean;
  deathStart: number;
  introStart: number;          // performance.now at intro start; 0 once intro finishes
  // 0.3.14 — Taurus-only final spectacle. When HP drops below the
  // threshold, flip finisherActive=true and spawn the meteor word. Normal
  // phrase + attack spawning is suppressed while the finisher plays out —
  // the meteor is the only threat on the field. Resolves either by the
  // player typing it (→ defeatBoss with bonus explosion) or by the meteor
  // touching the player (→ triggerDeath).
  finisherActive: boolean;
  finisherStart: number;
  // Cooldowns for the expensive summoner/caster patterns — prevents them from
  // back-to-back spawning whenever they come up in the rotation. A pattern
  // that's on cooldown is skipped (scheduler advances) just like a capped one.
  summonerCooldownUntil: number;
  casterCooldownUntil: number;
  // Rolling list of the last few phrases used in this fight, so the phrase
  // picker can avoid repeating the same line back-to-back (even across
  // phase transitions). Length is capped at BOSS_PHRASE_MEMORY in the picker.
  recentPhrases: string[];
};

const BOSS_PHRASE_MEMORY = 3;

const BOSS_INTRO_MS = 4500;
/** How long after spawning a summoner/caster before the boss may spawn another
 *  of the same type. Keeps these pattern-interrupt moments meaningful instead
 *  of continuous. */
const BOSS_SUMMONER_COOLDOWN_MS = 18000;
const BOSS_CASTER_COOLDOWN_MS = 18000;
/** AfroMan — perfect-parry acceptance window around a detected beat (ms).
 *  Parry keystrokes within this window of the most recent beat grant the
 *  PERFECT popup, +2 combo, and 1 HP of direct boss damage. */
const PERFECT_PARRY_WINDOW_MS = 150;
/** AfroMan — HP damage dealt to the boss on a perfect parry. */
const PERFECT_PARRY_BOSS_DMG = 1;
/** AfroMan — time between automatic ZOOTED stack increments. The arena
 *  slowly fills with smoke regardless of player action; +1 stack per
 *  interval up to ZOOTED_CAP. Stacks are permanent — no decay. */
const ZOOTED_TICK_INTERVAL_SEC = 10;
/** Max ZOOTED stacks. Once at 3 the timer stops incrementing. */
const ZOOTED_CAP = 3;

type BonfireInfo = {
  reason: BonfireReason;
  nextZoneIdx: number;
  defeatedBossName?: string;
};

// ─────────────────────────────────────────────────────────────
// Boss-select persistence — the Undead Burg fork in the road.
// Actual storage helpers live in src/game/settings.ts so a single
// file owns every localStorage key we read/write. The gate is
// cleared from Settings → Reset save data (resetBossSelectGate).
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────

export default function App() {
  // ─── React state ─────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('menu');
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSecretAsk, setShowSecretAsk] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [yesChecked, setYesChecked] = useState(false);
  const [noHoverPos, setNoHoverPos] = useState<{x: number; y: number} | null>(null);
  const [secretHearts, setSecretHearts] = useState<SecretHeart[]>([]);
  const [kissPos, setKissPos] = useState<{x: number; y: number} | null>(null);
  const [secretPassword, setSecretPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [scale, setScale] = useState(1);
  const [isMobileFocused, setIsMobileFocused] = useState(false);
  const [highscores, setHighscores] = useState<HighScore[]>([]);

  const [hudStats, setHudStats] = useState<HudStats>(() => initialHudStats());
  const [bossBarStats, setBossBarStats] = useState<BossBarStats | null>(null);
  const [bonfireInfo, setBonfireInfo] = useState<BonfireInfo | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<FinalSnapshot | null>(null);

  const [settings] = useSettings();

  // ─── DOM refs ────────────────────────────────────────────────
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerImgRef = useRef<HTMLImageElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const screenFlashRef = useRef<HTMLDivElement>(null);

  // ─── Mirror of phase/paused in refs for fast in-loop checks ──
  const phaseRef = useRef<Phase>('menu');
  const pausedRef = useRef(false);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // ─── Game-state refs ────────────────────────────────────────
  const scoreRef = useRef(0);
  const healthRef = useRef(MAX_HEALTH);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const correctKeyRef = useRef(0);
  const totalKeyRef = useRef(0);
  const isBlessedRef = useRef(false);
  const blessedTimeoutRef = useRef<number | null>(null);
  const lastRankIdxRef = useRef(0);

  const wordsRef = useRef<Word[]>([]);
  const fireballsRef = useRef<Fireball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const bgStateRef = useRef<BgState>(createBgState());
  const activeWordRef = useRef<number | null>(null);
  const lastWordsRef = useRef<string[]>([]);
  const totalWordsSpawnedRef = useRef(0);
  const charWidthsRef = useRef<Record<string, number>>({});

  const shakeUntilRef = useRef(0);
  const shakeMagRef = useRef(0);
  const castingUntilRef = useRef(0);
  const hitFlashUntilRef = useRef(0);
  const damageTextsRef = useRef<{x: number; y: number; value: string; life: number; maxLife: number; color: string; big?: boolean}[]>([]);
  const ghostMessageRef = useRef<{text: string; x: number; y: number; life: number} | null>(null);

  // Dodge + stamina
  const dodgeUntilRef = useRef(0);
  const iFramesUntilRef = useRef(0);
  const dodgeDirectionRef = useRef<1 | -1>(1);
  const staminaRef = useRef(MAX_STAMINA);

  // Estus
  const estusChargesRef = useRef(MAX_ESTUS);
  const estusActiveUntilRef = useRef(0);
  // Post-chug godmode window. Set AT Tab press (not inside the chug timeout)
  // so there's zero delay between the heal moment and i-frames kicking in —
  // setTimeout can drift when the tab is throttled or the event loop is busy,
  // which produced the "godmode doesn't always start immediately" bug.
  // Godmode is live when: estusActiveUntilRef <= time < estusGodmodeUntilRef.
  const estusGodmodeUntilRef = useRef(0);

  // Zone / boss
  const zoneIdxRef = useRef(0);
  const zoneStartTimeRef = useRef(0);
  const zoneElapsedRef = useRef(0);
  const bossRef = useRef<BossRuntime | null>(null);
  const bossAnnouncementRef = useRef<{text: string; life: number; color?: string} | null>(null);

  // ─── AfroMan secret fight — beat detection + ZOOTED debuff ───
  const zootedStacksRef = useRef(0);          // 0..3 — ZOOTED intensity
  const zootedDecayAtRef = useRef(0);         // performance.now at which next stack decays
  const lastBeatNowRef = useRef(0);           // performance.now of most recent detected beat
  const beatPulseRef = useRef(0);             // 0..1 visual pulse (gold ring breathe)
  // React state mirrors — only used for CSS class wiring on the shake wrapper
  // and the zooted leaf icons. Updated at most ~15 Hz to avoid thrash.
  const [zootedLevel, setZootedLevel] = useState<0 | 1 | 2 | 3>(0);
  const [afromanBossPhase, setAfromanBossPhase] = useState<'hidden' | 'idle' | 'attack' | 'dying'>('hidden');
  const [afromanBossHit, setAfromanBossHit] = useState(false);
  const [afromanGrooving, setAfromanGrooving] = useState(false);
  // Taurus uses the same DOM-sprite pattern as AfroMan: a single <img>
  // that swaps through three source files (IDLE / ATTACK / DEAD). 'hidden'
  // during non-Taurus phases, 'idle' for the base breathing state,
  // 'attack' for 1.2 s bursts when spawnBossAttack fires, 'dying' during
  // the death cutscene (swap to TaurusDEAD.png + slump animation).
  const [taurusBossPhase, setTaurusBossPhase] = useState<'hidden' | 'idle' | 'attack' | 'dying'>('hidden');
  const [taurusBossHit, setTaurusBossHit] = useState(false);

  // Jessyka companion + kisses.
  const jessykaRef = useRef<JessykaCompanion | null>(null);
  const jessykaKissesRef = useRef<JessykaKiss[]>([]);
  const jessykaImgRef = useRef<HTMLImageElement | null>(null);
  const [jessykaVisible, setJessykaVisible] = useState(false);
  const [jessykaDespawning, setJessykaDespawning] = useState(false);

  // Stats
  const statsRef = useRef<RunStats>(createStats());

  // Stable audio handle for the smooch easter egg.
  const smoochAudioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Init: load highscores, preload smooch, audio on mount ──
  useEffect(() => {
    const stored = localStorage.getItem('abyss_highscores');
    if (stored) { try { setHighscores(JSON.parse(stored)); } catch { /* ignore */ } }
    const a = new Audio('/smooch.mp3');
    a.preload = 'auto';
    smoochAudioRef.current = a;
    return () => { if (blessedTimeoutRef.current !== null) window.clearTimeout(blessedTimeoutRef.current); };
  }, []);

  // Viewport-fit scale.
  useEffect(() => {
    const onResize = () => {
      const sx = window.innerWidth / DESIGN_W;
      const sy = window.innerHeight / DESIGN_H;
      setScale(Math.min(sx, sy) * 0.98);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Menu music on menu phase; stop all when unmounting.
  useEffect(() => {
    if (phase === 'menu') playMusic('menu');
    return () => { /* each phase switch triggers its own playMusic */ };
  }, [phase]);

  // ─── Beat subscription ───────────────────────────────────────
  // Feeds lastBeatNowRef each time the audio analyser fires. The AfroMan
  // fight reads this from the game loop to time perfect-parry windows and
  // the boss sprite head-bop. Cheap no-op when no sample is playing.
  useEffect(() => {
    return subscribeBeat((t) => {
      lastBeatNowRef.current = t;
      beatPulseRef.current = 1;
      // Quickly toggle the grooving class so the boss sprite bops.
      setAfromanGrooving(true);
      window.setTimeout(() => setAfromanGrooving(false), 240);
    });
  }, []);

  // ─── Helpers to mutate game state ────────────────────────────

  const pushDamageText = useCallback((value: string, x: number, y: number, color: string) => {
    damageTextsRef.current.push({x, y, value, life: 55, maxLife: 55, color});
  }, []);

  // On rank change we just play the bell — the HUD's rank-icon animation
  // provides the visual. No more full-screen toast.
  const triggerRankUp = useCallback((rank: Rank) => {
    const idx = COMBO_RANKS.findIndex(r => r.id === rank.id);
    sfxRankUp(Math.max(0, idx));
  }, []);

  const resetRunState = useCallback(() => {
    scoreRef.current = 0;
    healthRef.current = MAX_HEALTH;
    comboRef.current = 0;
    maxComboRef.current = 0;
    correctKeyRef.current = 0;
    totalKeyRef.current = 0;
    isBlessedRef.current = false;
    lastRankIdxRef.current = 0;
    wordsRef.current = [];
    fireballsRef.current = [];
    particlesRef.current = [];
    shockwavesRef.current = [];
    projectilesRef.current = [];
    activeWordRef.current = null;
    lastWordsRef.current = [];
    totalWordsSpawnedRef.current = 0;
    damageTextsRef.current = [];
    ghostMessageRef.current = null;
    dodgeUntilRef.current = 0;
    iFramesUntilRef.current = 0;
    staminaRef.current = MAX_STAMINA;
    estusChargesRef.current = MAX_ESTUS;
    estusActiveUntilRef.current = 0;
    estusGodmodeUntilRef.current = 0;
    zoneIdxRef.current = 0;
    bossRef.current = null;
    statsRef.current = createStats();
    statsRef.current.startTime = Date.now();
    bgStateRef.current = createBgState();
    jessykaRef.current = null;
    jessykaKissesRef.current = [];
    setJessykaVisible(false);
    setJessykaDespawning(false);
    // 0.3.0 — AfroMan fight state reset.
    zootedStacksRef.current = 0;
    zootedDecayAtRef.current = 0;
    lastBeatNowRef.current = 0;
    beatPulseRef.current = 0;
    setZootedLevel(0);
    setAfromanBossPhase('hidden');
    setAfromanBossHit(false);
    setAfromanGrooving(false);
    // 0.3.12 — Taurus fight state reset.
    setTaurusBossPhase('hidden');
    setTaurusBossHit(false);
    stopMusicSample(200);
  }, []);

  const enterZone = useCallback((idx: number) => {
    zoneIdxRef.current = idx;
    const zone = ZONES[idx];
    setZoneStyling(bgStateRef.current, zone.weather, zone.tintColor, zone.id as BgState['zoneId']);
    zoneStartTimeRef.current = performance.now();
    zoneElapsedRef.current = 0;
    statsRef.current.zoneReached = idx;
    playMusic(zone.musicId);
    // Ghost message occasionally on zone entry.
    if (Math.random() < 0.5) {
      const msg = GHOST_MESSAGES[Math.floor(Math.random() * GHOST_MESSAGES.length)];
      ghostMessageRef.current = {text: msg, x: 200 + Math.random() * 600, y: 680, life: 480};
    }
    phaseRef.current = 'zone';
    setPhase('zone');
  }, []);

  const beginBonfire = useCallback((reason: BonfireReason, nextZoneIdx: number, defeatedBossName?: string) => {
    // Refill HP, estus, stamina.
    healthRef.current = MAX_HEALTH;
    estusChargesRef.current = MAX_ESTUS;
    staminaRef.current = MAX_STAMINA;
    wordsRef.current = [];
    projectilesRef.current = [];
    activeWordRef.current = null;
    bossRef.current = null;
    setBossBarStats(null);
    // Clear any AfroMan-specific state so the next fight is fresh.
    zootedStacksRef.current = 0;
    zootedDecayAtRef.current = 0;
    setZootedLevel(0);
    setAfromanBossPhase('hidden');
    setAfromanBossHit(false);
    setAfromanGrooving(false);
    setTaurusBossPhase('hidden');
    setTaurusBossHit(false);
    stopMusicSample(600);
    sfxBonfire();
    setBonfireInfo({reason, nextZoneIdx, defeatedBossName});
    phaseRef.current = 'bonfire';
    setPhase('bonfire');
  }, []);

  const advanceFromBonfire = useCallback(() => {
    if (!bonfireInfo) return;
    if (bonfireInfo.nextZoneIdx >= ZONES.length) {
      // Cleared all zones after a final-boss defeat → victory.
      statsRef.current.endTime = Date.now();
      setFinalSnapshot(snapshot());
      phaseRef.current = 'victory';
      setPhase('victory');
      playMusic('victory');
      return;
    }
    enterZone(bonfireInfo.nextZoneIdx);
  }, [bonfireInfo, enterZone]);

  const enterBoss = useCallback((bossId: string) => {
    const def = BOSSES[bossId];
    if (!def) { beginBonfire('zone-cleared', zoneIdxRef.current + 1); return; }
    const nowMs = performance.now();
    // Bosses that own an audio sample (afroman, taurus) skip the short
    // 4.5 s canvas silhouette intro that ships with the other bosses —
    // their dedicated 20 s cutscene phase has already handled the reveal
    // and started the music sample. Other bosses still run the classic
    // short silhouette rise + name flourish via `introStart`.
    const hasSample = !!def.sampleId;
    bossRef.current = {
      def,
      currentHp: def.maxHp,
      phaseIdx: 0,
      nextAttackAt: nowMs + (hasSample ? 800 : BOSS_INTRO_MS + 1200),
      nextPhraseAt: nowMs + (hasSample ? 400 : BOSS_INTRO_MS + 400),
      patternRotationIdx: 0,
      enraged: false,
      attackWindupT: 0,
      defeated: false,
      deathStart: 0,
      introStart: hasSample ? 0 : nowMs,
      summonerCooldownUntil: 0,
      casterCooldownUntil: 0,
      recentPhrases: [],
    };
    wordsRef.current = [];
    activeWordRef.current = null;
    projectilesRef.current = [];
    zootedStacksRef.current = 0;
    zootedDecayAtRef.current = 0;
    // Sync the DOM-sprite state for each sample-backed boss. The sprite
    // <img> is wired in the render tree to show/hide off this state.
    if (def.id === 'afroman') {
      setAfromanBossPhase('idle');
      setTaurusBossPhase('hidden');
    } else if (def.id === 'taurus') {
      setTaurusBossPhase('idle');
      setAfromanBossPhase('hidden');
    } else {
      setAfromanBossPhase('hidden');
      setTaurusBossPhase('hidden');
    }
    if (hasSample) {
      // The dedicated intro phase already started the sample — just ramp
      // it to full volume for the fight proper.
      setMusicSampleVolume(1.0, 400);
    } else {
      sfxBossAppear();
      playMusic('boss');
    }
    phaseRef.current = 'boss';
    setPhase('boss');
  }, [beginBonfire]);

  /** Pick a boss for the Undead Burg fork. Called from updateZoneTimer
   *  when the burg timer elapses (intercepts zone.bossId = 'taurus').
   *
   *  0.3.2: the fork screen ALWAYS appears. The last pick is still
   *  remembered, but only to pre-focus the matching panel — the player
   *  gets to commit fresh every run. */
  const startBossEntryFlow = useCallback((bossIdFromZone: string) => {
    // Later bosses (ornstein, gwyn) go straight through — no fork there.
    if (bossIdFromZone !== 'taurus') {
      enterBoss(bossIdFromZone);
      return;
    }
    // Clear the arena, then surface the fork overlay.
    wordsRef.current = [];
    projectilesRef.current = [];
    activeWordRef.current = null;
    phaseRef.current = 'boss-select';
    setPhase('boss-select');
  }, [enterBoss]);

  const commitBossChoice = useCallback((choice: BossSelectChoice) => {
    persistBossChoice(choice);
    statsRef.current.secretBossChosen = choice === 'afroman';
    // Both choices now route through a dedicated 20 s cutscene phase — the
    // AfromanIntro (pink/psychedelic) and the TaurusIntro (dark/eerie).
    // Each component owns its audio sample playback and calls enterBoss
    // for the correct boss on completion.
    wordsRef.current = [];
    projectilesRef.current = [];
    activeWordRef.current = null;
    if (choice === 'afroman') {
      phaseRef.current = 'boss-intro-afroman';
      setPhase('boss-intro-afroman');
    } else {
      phaseRef.current = 'boss-intro-taurus';
      setPhase('boss-intro-taurus');
    }
  }, []);

  const triggerDeath = useCallback(() => {
    if (phaseRef.current === 'gameover' || phaseRef.current === 'victory') return;
    statsRef.current.endTime = Date.now();
    sfxDeath();
    stopMusic(0.4);
    stopMusicSample(400);
    setFinalSnapshot(snapshot());
    phaseRef.current = 'gameover';
    setPhase('gameover');
    // Persist highscore.
    try {
      const stored = localStorage.getItem('abyss_highscores');
      let list: HighScore[] = stored ? JSON.parse(stored) : [];
      if (scoreRef.current > 0) {
        list.push({souls: scoreRef.current, maxCombo: maxComboRef.current});
        list.sort((a, b) => b.souls - a.souls);
        list = list.slice(0, 5);
        localStorage.setItem('abyss_highscores', JSON.stringify(list));
        setHighscores(list);
      }
    } catch { /* ignore */ }
  }, []);

  function snapshot(): FinalSnapshot {
    return {
      score: scoreRef.current,
      maxCombo: maxComboRef.current,
      topRank: rankForCombo(maxComboRef.current),
      stats: {...statsRef.current, comboOverTime: [...statsRef.current.comboOverTime]},
      zoneName: ZONES[zoneIdxRef.current]?.name ?? ZONES[0].name,
    };
  }

  // ─── Start/abandon helpers (called from screens) ─────────────
  const startRun = useCallback(() => {
    initAudio(); resumeAudio();
    resetRunState();
    enterZone(0);
  }, [enterZone, resetRunState]);

  const abandonRun = useCallback(() => {
    stopMusic(0.2);
    stopMusicSample(200);
    setPaused(false);
    jessykaRef.current = null;
    jessykaKissesRef.current = [];
    setJessykaVisible(false);
    setJessykaDespawning(false);
    setAfromanBossPhase('hidden');
    setZootedLevel(0);
    setTaurusBossPhase('hidden');
    phaseRef.current = 'menu';
    setPhase('menu');
  }, []);

  const tryAgain = useCallback(() => {
    setFinalSnapshot(null);
    setBonfireInfo(null);
    setBossBarStats(null);
    setShowSecretAsk(false);
    setYesChecked(false); setNoHoverPos(null);
    setKissPos(null);
    stopMusic(0.2);
    stopMusicSample(200);
    jessykaRef.current = null;
    jessykaKissesRef.current = [];
    setJessykaVisible(false);
    setJessykaDespawning(false);
    setAfromanBossPhase('hidden');
    setZootedLevel(0);
    setTaurusBossPhase('hidden');
    phaseRef.current = 'menu';
    setPhase('menu');
  }, []);

  // ─── Dev-mode actions ────────────────────────────────────────
  const devJumpToZone = useCallback((idx: number) => {
    initAudio(); resumeAudio();
    resetRunState();
    setShowDevPanel(false);
    enterZone(idx);
  }, [enterZone, resetRunState]);

  const devJumpToBoss = useCallback((bossId: string) => {
    initAudio(); resumeAudio();
    resetRunState();
    // AfroMan is the secret fork of the burg boss — treat him as a burg fight
    // for HUD/zone purposes (the zone def has bossId = 'taurus', not 'afroman').
    const lookupId = bossId === 'afroman' ? 'taurus' : bossId;
    const zoneIdx = Math.max(0, ZONES.findIndex(z => z.bossId === lookupId));
    zoneIdxRef.current = zoneIdx;
    setZoneStyling(bgStateRef.current, ZONES[zoneIdx].weather, ZONES[zoneIdx].tintColor, ZONES[zoneIdx].id as BgState['zoneId']);
    statsRef.current.zoneReached = zoneIdx;
    setShowDevPanel(false);
    if (bossId === 'afroman') {
      statsRef.current.secretBossChosen = true;
      phaseRef.current = 'boss-intro-afroman';
      setPhase('boss-intro-afroman');
    } else if (bossId === 'taurus') {
      // 0.3.12 — taurus now owns a dedicated intro cutscene (TaurusIntro)
      // that starts the taurus soundtrack. Dev jump routes through it so
      // the dev can QA the reveal end-to-end.
      phaseRef.current = 'boss-intro-taurus';
      setPhase('boss-intro-taurus');
    } else {
      enterBoss(bossId);
    }
  }, [enterBoss, resetRunState]);

  const devJumpToVictory = useCallback(() => {
    resetRunState();
    statsRef.current.endTime = Date.now();
    statsRef.current.bossesDefeated = 3;
    scoreRef.current = 99999;
    maxComboRef.current = 150;
    zoneIdxRef.current = ZONES.length - 1;
    setFinalSnapshot(snapshotFromRefs());
    setShowDevPanel(false);
    phaseRef.current = 'victory';
    setPhase('victory');
    playMusic('victory');
  }, [resetRunState]);

  const devHeal = useCallback(() => { healthRef.current = MAX_HEALTH; }, []);
  const devGiveEstus = useCallback(() => { estusChargesRef.current = MAX_ESTUS; }, []);
  const devAddCombo = useCallback((n: number) => {
    comboRef.current += n;
    if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;
  }, []);
  const devKillAllWords = useCallback(() => {
    wordsRef.current = [];
    projectilesRef.current = [];
    activeWordRef.current = null;
  }, []);
  const devTriggerLightning = useCallback(() => {
    triggerLightning(bgStateRef.current, performance.now());
  }, []);
  // ─── 0.3.1 dev actions ───────────────────────────────────────
  /** Wipe the boss-select gate + highscores. Surfaces the fork again on
   *  the next burg clear. Does NOT touch audio/accessibility settings. */
  const devResetSaveData = useCallback(() => {
    resetBossSelectGate();
    resetHighscores();
    setHighscores([]);
  }, []);
  /** Force-spawn Jessyka RIGHT NOW (no estus cost). Mirrors the Q-summon
   *  path but bypasses the charge / intro / already-here guards so the
   *  dev can test her presence in any phase. */
  const devSpawnJessyka = useCallback(() => {
    const phase = phaseRef.current;
    if (phase !== 'zone' && phase !== 'boss') return;
    // If she's already here, clean-slate her first.
    if (jessykaRef.current) {
      jessykaRef.current = null;
      setJessykaVisible(false);
      setJessykaDespawning(false);
    }
    const now = performance.now();
    jessykaRef.current = {
      state: 'spawning',
      spawnStart: now,
      despawnStart: 0,
      targetId: null,
      lettersFired: 0,
      nextKissAt: now + JESS_SPAWN_MS + 300,
      castingUntil: 0,
      summonSource: 'estus',
      projectileTargetId: null,
      autoDespawnAt: now + JESS_SPAWN_MS + JESS_ESTUS_ACTIVE_MS
        * (ZONES[zoneIdxRef.current]?.id === 'kiln' ? 2 : 1),
      graceUsed: false,
      spawnVeilFired: false,
    };
    setJessykaVisible(true);
    setJessykaDespawning(false);
    bossAnnouncementRef.current = {text: 'DEV · LOVE SUMMONED', life: 120, color: '#ffb8d8'};
    sfxJessykaSummon();
  }, []);
  /** Nudge ZOOTED +1. Caps at ZOOTED_CAP. The timer reschedules so the next
   *  passive tick follows the dev bump by the full ZOOTED_TICK_INTERVAL_SEC. */
  const devAddZooted = useCallback(() => {
    const next = Math.min(ZOOTED_CAP, zootedStacksRef.current + 1);
    zootedStacksRef.current = next;
    zootedDecayAtRef.current = next >= ZOOTED_CAP
      ? 0
      : performance.now() + ZOOTED_TICK_INTERVAL_SEC * 1000;
    setZootedLevel(next as 0 | 1 | 2 | 3);
  }, []);
  /** Clear ZOOTED → 0. Resets the timer so the next passive tick is a full
   *  interval away (you get a fresh clean window). */
  const devClearZooted = useCallback(() => {
    zootedStacksRef.current = 0;
    zootedDecayAtRef.current = 0;
    setZootedLevel(0);
  }, []);
  /** Instant-skip the current boss intro cutscene so attacks + phrases can
   *  start immediately. Works on every boss; AfroMan's 20 s React overlay
   *  skips itself from SKIP_ALLOWED_AFTER_MS — this only affects the
   *  canvas-driven silhouette intros of the three canonical bosses. */
  const devSkipBossIntro = useCallback(() => {
    const b = bossRef.current;
    if (!b || b.introStart === 0) return;
    b.introStart = 0;
    b.nextAttackAt = performance.now() + 400;
    b.nextPhraseAt = performance.now() + 200;
  }, []);
  /** Open the boss-select fork overlay right now — for QA of the choice UX
   *  without having to clear the gate + replay Undead Burg. Resets the
   *  persisted choice so the commit has the canonical effect. */
  const devOpenBossSelect = useCallback(() => {
    initAudio(); resumeAudio();
    resetRunState();
    resetBossSelectGate();
    // Position the run state as if we just finished the Burg — same zone
    // index the real fork uses, so the taurus/afroman path routes correctly.
    zoneIdxRef.current = Math.max(0, ZONES.findIndex(z => z.bossId === 'taurus'));
    statsRef.current.zoneReached = zoneIdxRef.current;
    setShowDevPanel(false);
    phaseRef.current = 'boss-select';
    setPhase('boss-select');
  }, [resetRunState]);

  // Keyboard shortcut: backtick (`) opens the dev gate from the menu.
  useEffect(() => {
    if (phase !== 'menu') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') { e.preventDefault(); setShowDevPanel(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  // snapshot helper that reads from refs (for dev victory jump)
  function snapshotFromRefs(): FinalSnapshot {
    return {
      score: scoreRef.current,
      maxCombo: maxComboRef.current,
      topRank: rankForCombo(maxComboRef.current),
      stats: {...statsRef.current, comboOverTime: [...statsRef.current.comboOverTime]},
      zoneName: ZONES[zoneIdxRef.current]?.name ?? ZONES[0].name,
    };
  }

  const runAway = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const maxX = DESIGN_W - 200, maxY = DESIGN_H - 100;
    setNoHoverPos({
      x: Math.max(50, Math.floor(Math.random() * maxX)),
      y: Math.max(50, Math.floor(Math.random() * maxY)),
    });
  };

  // ─── Key handlers ────────────────────────────────────────────
  const handleChar = useCallback((rawChar: string) => {
    // GAME_LOOP_HANDLE_CHAR_PLACEHOLDER — implemented by loop setup below.
    handleCharImpl.current(rawChar);
  }, []);
  const handleCharImpl = useRef<(c: string) => void>(() => {});

  const handleTab = useCallback(() => {
    if (phaseRef.current !== 'zone' && phaseRef.current !== 'boss') return;
    if (pausedRef.current) return;
    const now = performance.now();
    if (estusActiveUntilRef.current > now) return;      // already drinking — silent no-op (input is still draining)
    // Surface-level feedback so the player knows the keystroke DID register
    // even when it can't actually heal. Silent failures got misread as
    // "Tab didn't work" when the real reason was full HP or no estus.
    if (estusChargesRef.current <= 0) {
      bossAnnouncementRef.current = {text: 'NO ESTUS', life: 60, color: '#ff8080'};
      return;
    }
    if (healthRef.current >= MAX_HEALTH) {
      bossAnnouncementRef.current = {text: 'ALREADY FULL', life: 60, color: '#9dff7a'};
      return;
    }
    estusChargesRef.current -= 1;
    estusActiveUntilRef.current = now + ESTUS_CHUG_MS;
    // Grant the post-chug i-frame window AT PRESS TIME, not inside the heal
    // setTimeout. This makes the godmode window frame-perfect: exactly at
    // `now + ESTUS_CHUG_MS` the isInvulnerable helper starts returning true,
    // regardless of setTimeout drift (browser throttling, main-thread jank).
    // The window is (chug-end, chug-end + ESTUS_GODMODE_MS * kilnMul) —
    // vulnerability during the chug itself is preserved because
    // isInvulnerable requires `time >= estusActiveUntilRef.current` to
    // consider godmode active. Kiln doubles the godmode window as a
    // final-zone survival buff (0.2.12).
    const kilnMul = ZONES[zoneIdxRef.current]?.id === 'kiln' ? 2 : 1;
    estusGodmodeUntilRef.current = now + ESTUS_CHUG_MS + ESTUS_GODMODE_MS * kilnMul;
    statsRef.current.estusDrunk += 1;
    sfxEstus();
    // Heal + FX at end of chug. The setTimeout drives ONLY the visuals and
    // particles — i-frames above are already scheduled, so this timeout
    // firing a few frames late (throttled tab, GC pause) cannot cause
    // invulnerability gaps anymore.
    window.setTimeout(() => {
      if (phaseRef.current === 'gameover' || phaseRef.current === 'victory') return;
      healthRef.current = Math.min(MAX_HEALTH, healthRef.current + ESTUS_HEAL);
      sfxEstusGodmode();
      const img = playerImgRef.current;
      if (img) {
        // Reflow + re-add so the @keyframes pulse animation visibly restarts
        // on chained drinks. The class REMOVAL is handled per-frame by
        // updateEstusGodmodeVisual, which polls estusGodmodeUntilRef — that
        // way the glow ends exactly when the invulnerability window ends,
        // even when Kiln doubles the window (no stale setTimeout unmounting
        // the class at the fixed 4 s mark while godmode is still active).
        img.classList.remove('is-estus-godmode');
        void img.offsetWidth;
        img.classList.add('is-estus-godmode');
      }
      // Small green pop up + celebratory particle burst.
      pushDamageText('+' + ESTUS_HEAL, PLAYER.x, PLAYER.y - 50, '#6dffaa');
      for (let i = 0; i < 22; i++) {
        if (particlesRef.current.length >= PARTICLE_CAP) break;
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * 3;
        particlesRef.current.push({
          x: PLAYER.x + (Math.random() - 0.5) * 30,
          y: PLAYER.y + (Math.random() - 0.5) * 20,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
          life: 25, maxLife: 25, size: 2 + Math.random() * 2,
          color: Math.random() < 0.5 ? '#9dff7a' : '#ffd060',
        });
      }
    }, ESTUS_CHUG_MS);
  }, [pushDamageText]);

  const handleSpace = useCallback(() => {
    if (phaseRef.current !== 'zone' && phaseRef.current !== 'boss') return;
    if (pausedRef.current) return;
    const now = performance.now();
    if (dodgeUntilRef.current > now) return;           // already dodging
    if (estusActiveUntilRef.current > now) return;     // can't dodge while drinking
    if (staminaRef.current < DODGE_STAMINA_COST) return;
    staminaRef.current -= DODGE_STAMINA_COST;
    dodgeUntilRef.current = now + DODGE_DURATION;
    iFramesUntilRef.current = now + DODGE_IFRAME_DURATION;
    dodgeDirectionRef.current = Math.random() > 0.5 ? 1 : -1;
    sfxDodge();
    const img = playerImgRef.current;
    if (img) {
      img.classList.remove('is-dodging-left', 'is-dodging-right');
      // Force reflow for the animation to restart.
      void img.offsetWidth;
      img.classList.add(dodgeDirectionRef.current === 1 ? 'is-dodging-right' : 'is-dodging-left');
      window.setTimeout(() => {
        if (playerImgRef.current) {
          playerImgRef.current.classList.remove('is-dodging-left', 'is-dodging-right');
        }
      }, DODGE_DURATION);
    }
  }, []);

  const handleEsc = useCallback(() => {
    if (phaseRef.current !== 'zone' && phaseRef.current !== 'boss') return;
    setPaused(p => !p);
  }, []);

  // Global keydown router. Registered in the CAPTURE phase with explicit
  // preventDefault on the game-control keys so the browser can't steal focus
  // (Tab) or scroll (Space) before our handlers see them. Tab is also checked
  // FIRST — even before the isOtherInput guard — because heal-on-Tab is a
  // reflex action during combat and must not fail just because focus drifted
  // into a stray input element.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isMobileRelay = target?.dataset?.gameRelay !== undefined;
      const isOtherInput = !isMobileRelay && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      // ── Tab: absolute priority during gameplay. preventDefault runs before
      //    the isOtherInput guard so the browser's focus-change never fires
      //    during a zone or boss. stopPropagation too, so any sub-widget's
      //    own keydown can't eat it. Outside gameplay the normal guard still
      //    applies (the dev password input needs Tab to leave the field).
      if (e.code === 'Tab' || e.key === 'Tab') {
        const inCombat = phaseRef.current === 'zone' || phaseRef.current === 'boss';
        if (inCombat) {
          e.preventDefault();
          e.stopPropagation();
          handleTab();
          return;
        }
        if (isOtherInput) return;    // let the browser handle Tab normally in other inputs
        e.preventDefault();
        handleTab();
        return;
      }
      if (isOtherInput) return;
      if (e.code === 'Space') { e.preventDefault(); handleSpace(); return; }
      if (e.key === 'Escape') { e.preventDefault(); handleEsc(); return; }
      if (isMobileRelay) return;           // onChange handles letters for the mobile input
      if (e.key.length === 1) handleChar(e.key);
    };
    // capture: true — runs before any bubble-phase listener could consume it.
    window.addEventListener('keydown', onKey, {capture: true});
    return () => window.removeEventListener('keydown', onKey, {capture: true});
  }, [handleChar, handleTab, handleSpace, handleEsc]);

  // ─── Game loop ───────────────────────────────────────────────
  useEffect(() => {
    const active = phase === 'zone' || phase === 'boss';
    if (!active) return;
    // GAME_LOOP_PLACEHOLDER
    return runGameLoop({
      bgCanvasRef, canvasRef, textCanvasRef, playerImgRef, shakeRef, screenFlashRef,
      phaseRef, pausedRef,
      scoreRef, healthRef, comboRef, maxComboRef, correctKeyRef, totalKeyRef,
      isBlessedRef, blessedTimeoutRef, lastRankIdxRef,
      wordsRef, fireballsRef, particlesRef, shockwavesRef, projectilesRef,
      bgStateRef, activeWordRef, lastWordsRef, totalWordsSpawnedRef, charWidthsRef,
      shakeUntilRef, shakeMagRef, castingUntilRef, hitFlashUntilRef, damageTextsRef, ghostMessageRef,
      dodgeUntilRef, iFramesUntilRef, dodgeDirectionRef, staminaRef,
      estusChargesRef, estusActiveUntilRef, estusGodmodeUntilRef,
      zoneIdxRef, zoneStartTimeRef, zoneElapsedRef, bossRef, bossAnnouncementRef,
      zootedStacksRef, zootedDecayAtRef, lastBeatNowRef, beatPulseRef,
      setZootedLevel, setAfromanBossPhase, setAfromanBossHit,
      setTaurusBossPhase, setTaurusBossHit,
      statsRef,
      jessykaRef, jessykaKissesRef, jessykaImgRef,
      setJessykaVisible, setJessykaDespawning,
      setHudStats, setBossBarStats, triggerRankUp, enterBoss, startBossEntryFlow, beginBonfire, triggerDeath,
      handleCharImpl,
    });
  }, [phase, enterBoss, startBossEntryFlow, beginBonfire, triggerDeath, triggerRankUp]);

  const afromanIntroEnd = useCallback(() => enterBoss('afroman'), [enterBoss]);
  const taurusIntroEnd = useCallback(() => enterBoss('taurus'), [enterBoss]);

  // ─── Render ──────────────────────────────────────────────────
  // RENDER_PLACEHOLDER
  return renderAppTree({
    phase, paused, scale, settings,
    showSettings, setShowSettings,
    showSecretAsk, setShowSecretAsk,
    showDevPanel, setShowDevPanel,
    yesChecked, setYesChecked, noHoverPos, runAway,
    secretHearts, setSecretHearts, kissPos, setKissPos,
    secretPassword, setSecretPassword, passwordError, setPasswordError,
    hudStats, bossBarStats, bonfireInfo, finalSnapshot,
    jessykaVisible, jessykaDespawning, jessykaImgRef,
    highscores, isMobileFocused,
    bgCanvasRef, canvasRef, textCanvasRef, playerImgRef, shakeRef, screenFlashRef, mobileInputRef,
    smoochAudioRef,
    startRun, abandonRun, tryAgain, advanceFromBonfire,
    handleChar, setIsMobileFocused, setPaused,
    devJumpToZone, devJumpToBoss, devJumpToVictory,
    devHeal, devGiveEstus, devAddCombo, devKillAllWords, devTriggerLightning,
    devResetSaveData, devSpawnJessyka, devAddZooted, devClearZooted, devSkipBossIntro, devOpenBossSelect,
    commitBossChoice,
    onAfromanIntroEnd: afromanIntroEnd,
    onTaurusIntroEnd: taurusIntroEnd,
    zootedLevel,
    afromanBossPhase,
    afromanBossHit,
    afromanGrooving,
    taurusBossPhase,
    taurusBossHit,
  });
}

// ─────────────────────────────────────────────────────────────
// Types used by inner helpers (loop + render)
// ─────────────────────────────────────────────────────────────

type FinalSnapshot = {
  score: number;
  maxCombo: number;
  topRank: Rank;
  stats: RunStats;
  zoneName: string;
};

function initialHudStats(): HudStats {
  return {
    score: 0, health: MAX_HEALTH, maxHealth: MAX_HEALTH,
    combo: 0, maxCombo: 0, difficulty: 0, accuracy: 100,
    isBlessed: false, currentRank: COMBO_RANKS[0],
    estusCharges: MAX_ESTUS, estusMax: MAX_ESTUS, estusActive: false,
    stamina: MAX_STAMINA, maxStamina: MAX_STAMINA,
    zoneName: ZONES[0].name, zoneSubtitle: ZONES[0].subtitle,
    zoneTimeLeft: ZONES[0].duration, zoneDuration: ZONES[0].duration, bossActive: false,
    upcomingBossName: null,
    jessykaSummonAvailable: false,
  };
}

// ─────────────────────────────────────────────────────────────
// runGameLoop — started when entering zone/boss, stopped on phase exit.
// Mutates refs; dispatches setState only for HUD tick + boss bar tick.
// ─────────────────────────────────────────────────────────────

type LoopDeps = {
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  playerImgRef: React.RefObject<HTMLImageElement | null>;
  shakeRef: React.RefObject<HTMLDivElement | null>;
  screenFlashRef: React.RefObject<HTMLDivElement | null>;
  phaseRef: React.RefObject<Phase>;
  pausedRef: React.RefObject<boolean>;
  scoreRef: React.RefObject<number>;
  healthRef: React.RefObject<number>;
  comboRef: React.RefObject<number>;
  maxComboRef: React.RefObject<number>;
  correctKeyRef: React.RefObject<number>;
  totalKeyRef: React.RefObject<number>;
  isBlessedRef: React.RefObject<boolean>;
  blessedTimeoutRef: React.RefObject<number | null>;
  lastRankIdxRef: React.RefObject<number>;
  wordsRef: React.RefObject<Word[]>;
  fireballsRef: React.RefObject<Fireball[]>;
  particlesRef: React.RefObject<Particle[]>;
  shockwavesRef: React.RefObject<Shockwave[]>;
  projectilesRef: React.RefObject<Projectile[]>;
  bgStateRef: React.RefObject<BgState>;
  activeWordRef: React.RefObject<number | null>;
  lastWordsRef: React.RefObject<string[]>;
  totalWordsSpawnedRef: React.RefObject<number>;
  charWidthsRef: React.RefObject<Record<string, number>>;
  shakeUntilRef: React.RefObject<number>;
  shakeMagRef: React.RefObject<number>;
  castingUntilRef: React.RefObject<number>;
  hitFlashUntilRef: React.RefObject<number>;
  damageTextsRef: React.RefObject<{x: number; y: number; value: string; life: number; maxLife: number; color: string; big?: boolean}[]>;
  ghostMessageRef: React.RefObject<{text: string; x: number; y: number; life: number} | null>;
  dodgeUntilRef: React.RefObject<number>;
  iFramesUntilRef: React.RefObject<number>;
  dodgeDirectionRef: React.RefObject<1 | -1>;
  staminaRef: React.RefObject<number>;
  estusChargesRef: React.RefObject<number>;
  estusActiveUntilRef: React.RefObject<number>;
  estusGodmodeUntilRef: React.RefObject<number>;
  zoneIdxRef: React.RefObject<number>;
  zoneStartTimeRef: React.RefObject<number>;
  zoneElapsedRef: React.RefObject<number>;
  bossRef: React.RefObject<BossRuntime | null>;
  bossAnnouncementRef: React.RefObject<{text: string; life: number; color?: string} | null>;
  // 0.3.0 — AfroMan fight refs.
  zootedStacksRef: React.RefObject<number>;
  zootedDecayAtRef: React.RefObject<number>;
  lastBeatNowRef: React.RefObject<number>;
  beatPulseRef: React.RefObject<number>;
  setZootedLevel: (v: 0 | 1 | 2 | 3) => void;
  setAfromanBossPhase: (p: 'hidden' | 'idle' | 'attack' | 'dying') => void;
  setAfromanBossHit: (v: boolean) => void;
  setTaurusBossPhase: (p: 'hidden' | 'idle' | 'attack' | 'dying') => void;
  setTaurusBossHit: (v: boolean) => void;
  statsRef: React.RefObject<RunStats>;
  jessykaRef: React.RefObject<JessykaCompanion | null>;
  jessykaKissesRef: React.RefObject<JessykaKiss[]>;
  jessykaImgRef: React.RefObject<HTMLImageElement | null>;
  setJessykaVisible: (v: boolean) => void;
  setJessykaDespawning: (v: boolean) => void;
  setHudStats: (s: HudStats) => void;
  setBossBarStats: (s: BossBarStats | null) => void;
  triggerRankUp: (rank: Rank) => void;
  enterBoss: (id: string) => void;
  startBossEntryFlow: (bossIdFromZone: string) => void;
  beginBonfire: (reason: BonfireReason, nextZoneIdx: number, defeatedBossName?: string) => void;
  triggerDeath: () => void;
  handleCharImpl: React.RefObject<(c: string) => void>;
};

function runGameLoop(d: LoopDeps): () => void {
  const bg = d.bgCanvasRef.current;
  const canvas = d.canvasRef.current;
  const textCanvas = d.textCanvasRef.current;
  if (!bg || !canvas || !textCanvas) return () => {};

  const bgCtx = setupHiDPICanvas(bg, DESIGN_W, DESIGN_H);
  const ctx = setupHiDPICanvas(canvas, DESIGN_W, DESIGN_H);
  const textCtx = setupHiDPICanvas(textCanvas, DESIGN_W, DESIGN_H);

  const buildWidths = () => { d.charWidthsRef.current = buildCharWidthCache(textCtx); };
  if (document.fonts?.ready) document.fonts.ready.then(buildWidths);
  buildWidths();

  let rafId = 0;
  let lastTime = performance.now();
  let lastHudBump = 0;
  let lastComboSample = 0;

  // Install the live handleChar implementation — closure over the same refs.
  d.handleCharImpl.current = (rawChar: string) => handleCharLive(d, rawChar);

  const loop = (time: number) => {
    if (d.phaseRef.current !== 'zone' && d.phaseRef.current !== 'boss') return;
    rafId = requestAnimationFrame(loop);
    if (d.pausedRef.current) { lastTime = time; return; }

    const realDtSec = Math.min((time - lastTime) / 1000, 0.1);  // cap to 100ms jumps
    const dt = Math.min(realDtSec * 60, 3);                     // 60fps-normalized
    lastTime = time;

    updateSprites(d, time);
    updateZoneTimer(d, realDtSec);

    // ── Background ─────────────
    const s = getSettings();
    const lowHp = d.healthRef.current <= 3;
    drawBackground(bgCtx, d.bgStateRef.current, time, dt, lowHp, !s.highContrast);
    drawDecals(bgCtx, d.bgStateRef.current, dt);
    // Low HP heartbeat.
    if (lowHp && (d.phaseRef.current === 'zone' || d.phaseRef.current === 'boss')) {
      sfxHeartbeat(time);
    }

    // Shake transform on the wrapper.
    applyShake(d, time, s.reduceMotion);

    ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
    textCtx.clearRect(0, 0, DESIGN_W, DESIGN_H);

    // ── Phase-specific spawning ───────────────────────────────
    if (d.phaseRef.current === 'zone') {
      updateZoneSpawn(d, time, dt);
    } else if (d.phaseRef.current === 'boss') {
      updateBoss(d, time, dt);
      drawBossToBg(bgCtx, d, time);
    }

    // ── Universal systems (fireballs, projectiles, particles) ─
    const curRank = rankForCombo(d.comboRef.current);
    updateFireballs(d, ctx, time, dt, curRank.id);
    updateProjectiles(d, ctx, time, dt);
    updateShockwaves(d, ctx, dt);
    updateParticles(d, ctx, dt);
    updateJessyka(d, ctx, time);
    drawEstusChug(d, ctx, time);
    // AfroMan beat-pulse ring around the player — breathes with each bass kick.
    drawBeatPulseRing(d, ctx, time, dt);

    // ── Words (enemy update + draw + contact check) ───────────
    updateWords(d, ctx, textCtx, time, dt, s.fontScale);

    // ── Damage texts ──────────────────────────────────────────
    drawDamageTexts(d, textCtx, dt);

    // ── Ghost message ─────────────────────────────────────────
    if (d.ghostMessageRef.current) {
      const g = d.ghostMessageRef.current;
      g.life -= dt;
      if (g.life <= 0) d.ghostMessageRef.current = null;
      else {
        textCtx.save();
        textCtx.font = 'italic 14px "EB Garamond", serif';
        textCtx.textAlign = 'center';
        const alpha = Math.min(1, g.life / 60);
        textCtx.fillStyle = 'rgba(255, 200, 120, ' + (alpha * 0.55).toFixed(3) + ')';
        textCtx.shadowBlur = 8;
        textCtx.shadowColor = 'rgba(255, 180, 100, ' + (alpha * 0.5).toFixed(3) + ')';
        textCtx.fillText(g.text, g.x, g.y);
        textCtx.restore();
      }
    }

    // ── Boss / ability announcement banner ────────────────────
    if (d.bossAnnouncementRef.current) {
      const a = d.bossAnnouncementRef.current;
      a.life -= dt;
      if (a.life <= 0) d.bossAnnouncementRef.current = null;
      else {
        textCtx.save();
        textCtx.font = 'bold 42px "Cinzel", serif';
        textCtx.textAlign = 'center';
        const t = a.life / 180;
        // Parse "#rgb" or "#rrggbb" colour into rgba with life-alpha.
        const color = a.color ?? '#ff3c1e';
        const r = parseInt(color.length === 4 ? color[1] + color[1] : color.slice(1, 3), 16);
        const g = parseInt(color.length === 4 ? color[2] + color[2] : color.slice(3, 5), 16);
        const b = parseInt(color.length === 4 ? color[3] + color[3] : color.slice(5, 7), 16);
        textCtx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + t.toFixed(3) + ')';
        textCtx.shadowBlur = 24; textCtx.shadowColor = color;
        textCtx.fillText(a.text, DESIGN_W / 2, 280);
        textCtx.restore();
      }
    }

    // ── Boss intro cutscene overlay (name + title + lore text) ───
    if (d.bossRef.current && d.bossRef.current.introStart > 0) {
      drawBossIntroOverlay(d, textCtx, time);
    }

    // ── Hit flash overlay ────────────────────────────────────────
    updateHitFlash(d, time, s.reduceMotion);
    updateEstusGodmodeVisual(d, time);

    // ── HUD tick (10 Hz) ──────────────────────────────────────
    if (time - lastHudBump > 100) {
      lastHudBump = time;
      pushHudStats(d);
      if (d.phaseRef.current === 'boss' && d.bossRef.current && !d.bossRef.current.defeated && d.bossRef.current.introStart === 0) {
        const b = d.bossRef.current;
        d.setBossBarStats({
          name: b.def.name,
          title: b.def.title,
          hpPct: b.currentHp / b.def.maxHp,
          themeColor: b.def.themeColor,
          phaseIdx: b.phaseIdx,
          skin: b.def.id === 'afroman' ? 'afroman' : 'default',
        });
      } else {
        d.setBossBarStats(null);
      }
    }

    // ── Combo sampling for end-screen graph (every 2s) ────────
    if (time - lastComboSample > 2000) {
      lastComboSample = time;
      sampleCombo(d.statsRef.current, time, d.comboRef.current);
    }
  };

  rafId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(rafId); };
}

// ─────────────────────────────────────────────────────────────
// Loop sub-routines
// ─────────────────────────────────────────────────────────────

function updateSprites(d: LoopDeps, time: number): void {
  // Restore idle sprite after casting window.
  if (d.castingUntilRef.current > 0 && time > d.castingUntilRef.current) {
    d.castingUntilRef.current = 0;
    const img = d.playerImgRef.current;
    if (img && img.dataset.state !== 'idle') {
      img.src = '/idle1.png';
      img.dataset.state = 'idle';
    }
  }
  // Toggle the drinking CSS class based on estus activity.
  const img = d.playerImgRef.current;
  if (img) {
    const drinking = time < d.estusActiveUntilRef.current;
    const hasClass = img.classList.contains('is-drinking');
    if (drinking && !hasClass) img.classList.add('is-drinking');
    else if (!drinking && hasClass) img.classList.remove('is-drinking');

    // 0.3.9 — pink "veil stored" glow on the player sprite. Active whenever
    // Jessyka is live (post-spawn) AND her grace has not yet been spent.
    // Renders as an animated pink drop-shadow layered over the normal
    // orange glow (see `.player-sprite.has-veil` in index.css). Consumed
    // when tryJessykaGraceShield flips graceUsed → true.
    const j = d.jessykaRef.current;
    const veilStored = j !== null && j.state === 'active' && !j.graceUsed;
    const hasVeilClass = img.classList.contains('has-veil');
    if (veilStored && !hasVeilClass) img.classList.add('has-veil');
    else if (!veilStored && hasVeilClass) img.classList.remove('has-veil');
  }
  // Stamina regen.
  const staminaRegen = 0.6;
  if (d.staminaRef.current < MAX_STAMINA) {
    d.staminaRef.current = Math.min(MAX_STAMINA, d.staminaRef.current + staminaRegen);
  }
}

function updateZoneTimer(d: LoopDeps, realDtSec: number): void {
  if (d.phaseRef.current !== 'zone') return;
  // Accumulate per-frame seconds. Since this function only runs on active
  // (un-paused) frames, pausing the game can't advance the timer.
  d.zoneElapsedRef.current += realDtSec;
  const zone = ZONES[d.zoneIdxRef.current];
  if (d.zoneElapsedRef.current >= zone.duration) {
    // End of zone: either go to boss or straight to bonfire. For the burg
    // fork, startBossEntryFlow decides boss-select vs. direct entry based on
    // the saved localStorage choice.
    if (zone.bossId) {
      d.startBossEntryFlow(zone.bossId);
    } else {
      d.beginBonfire('zone-cleared', d.zoneIdxRef.current + 1);
    }
  }
}

function applyShake(d: LoopDeps, time: number, reduceMotion: boolean): void {
  let shakeX = 0, shakeY = 0;
  if (!reduceMotion && time < d.shakeUntilRef.current) {
    const mag = d.shakeMagRef.current;
    shakeX = (Math.random() - 0.5) * mag;
    shakeY = (Math.random() - 0.5) * mag;
  }
  if (time > d.shakeUntilRef.current) d.shakeMagRef.current = 0;
  if (d.shakeRef.current) {
    d.shakeRef.current.style.transform = `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px)`;
  }
}

function updateZoneSpawn(d: LoopDeps, time: number, dt: number): void {
  const zone = ZONES[d.zoneIdxRef.current];
  const diffT = Math.min(d.zoneElapsedRef.current / zone.duration, 1);
  const spawnChance = (0.017 + diffT * 0.012) * zone.spawnRateMul * dt;
  const speedMod = zone.speedMul * (1 + diffT * 0.6);

  if (Math.random() >= spawnChance) return;

  // Pick a kind by weight.
  const weights = zone.kindWeights;
  const entries = Object.entries(weights) as [EnemyKind, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  let kind: EnemyKind = 'normal';
  for (const [k, w] of entries) { r -= w; if (r <= 0) { kind = k; break; } }

  const kdef = ENEMY_KINDS[kind];
  const [minL, maxL] = kdef.lengthRange ?? zone.wordLength;

  // Choose the word text. Enforce: no two words on screen may share a first letter.
  const usedFirstLetters = new Set(d.wordsRef.current.map(w => w.text[0]));

  let text: string;
  if (kind === 'caster') {
    const casters = CASTER_WORDS.filter(w =>
      !d.wordsRef.current.some(ex => ex.text === w) &&
      !usedFirstLetters.has(w[0]),
    );
    if (casters.length === 0) return;
    text = casters[Math.floor(Math.random() * casters.length)];
  } else {
    text = pickWord(minL, maxL, d.wordsRef.current, d.lastWordsRef.current);
    if (!text) return;
  }

  d.totalWordsSpawnedRef.current += 1;
  let isSpecial = false;
  if (d.totalWordsSpawnedRef.current === 5 || (d.totalWordsSpawnedRef.current > 5 && Math.random() < 0.08)) {
    // Only swap to JESSYKA if 'J' isn't already taken by another word.
    if (!usedFirstLetters.has('J')) {
      text = 'JESSYKA';
      isSpecial = true;
      kind = 'normal';
    }
  }

  const newX = Math.random() * (DESIGN_W - 200);
  // Spawn y kept just barely above the play area so words slide into view
  // immediately. -20 gives a ~12-frame lead before the first letter is drawn
  // at the current fall speed — enough to *see* the spawn, not so far above
  // that Jessyka picks an invisible target off-screen. (Was -50.)
  const newY = -20;
  if (d.wordsRef.current.some(e => Math.abs(e.x - newX) < 150 && Math.abs(e.y - newY) < 100)) return;

  d.wordsRef.current.push({
    id: nextWordId(),
    text, x: newX, y: newY,
    speed: (0.15 + Math.random() * 0.3) * speedMod * kdef.speedMul,
    typed: '', kind, isSpecial,
    hp: kind === 'tank' ? 3 : 1,
    fireCooldown: kind === 'caster' ? 2.5 : 0,
    ghostPhase: Math.random(),
    scrambled: false,
    stationaryX: newX,
    spawnTime: time,
  });
  d.lastWordsRef.current.push(text);
  if (d.lastWordsRef.current.length > 20) d.lastWordsRef.current.shift();

  // Chanter sits stationary near top.
  if (kind === 'chanter') {
    const last = d.wordsRef.current[d.wordsRef.current.length - 1];
    last.y = 80 + Math.random() * 40;
    last.speed = 0;
  }
}

function pickWord(minL: number, maxL: number, existing: Word[], last: string[]): string {
  const available = GOTHIC_WORDS.filter(w =>
    w.length >= minL && w.length <= maxL &&
    !existing.some(ex => ex.text[0] === w[0]) &&
    !last.includes(w),
  );
  if (available.length === 0) return '';
  return available[Math.floor(Math.random() * available.length)];
}

function updateBoss(d: LoopDeps, time: number, dt: number): void {
  const b = d.bossRef.current;
  if (!b) return;

  // ── Death cutscene — spawn ongoing bursts while the boss disintegrates.
  if (b.defeated) {
    const elapsed = time - b.deathStart;
    if (elapsed >= 0 && elapsed < 2200 && Math.random() < 0.55) {
      for (let i = 0; i < 4; i++) {
        if (d.particlesRef.current.length >= PARTICLE_CAP) break;
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * 6;
        d.particlesRef.current.push({
          x: BOSS_AIM.x + (Math.random() - 0.5) * 80,
          y: BOSS_AIM.y + (Math.random() - 0.5) * 90,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 2,
          life: 35, maxLife: 35, size: 2.5 + Math.random() * 2,
          color: Math.random() < 0.4 ? '#a00000' : b.def.themeColor,
        });
      }
    }
    return;     // skip phase/attack logic while dying
  }

  if (b.currentHp <= 0) return;

  // Intro cutscene active — suppress phase/attack logic until it ends.
  if (b.introStart > 0) {
    if (time - b.introStart >= BOSS_INTRO_MS) b.introStart = 0;
    else return;
  }

  // Phase transition based on HP.
  const hpPct = b.currentHp / b.def.maxHp;
  let newPhase = 0;
  for (let i = 0; i < b.def.phases.length; i++) {
    if (hpPct <= b.def.phases[i].hpPctThreshold) newPhase = i;
  }
  if (newPhase > b.phaseIdx) {
    b.phaseIdx = newPhase;
    b.enraged = newPhase >= 1;
    const announce = b.def.phases[newPhase].announcement;
    if (announce) d.bossAnnouncementRef.current = {text: announce, life: 180};
    triggerLightning(d.bgStateRef.current, time);
    b.patternRotationIdx = 0;
    // Small grace period after phase shift.
    b.nextAttackAt = time + 1200;
  }

  const phase = b.def.phases[b.phaseIdx];

  // ── Phrase spawning: always exactly ONE visible phrase at a time, centered
  //    at the top of the screen with a gothic frame (see updateWords render).
  //    The player never has to parse multiple phrases in parallel — focus stays
  //    singular, and attack-words (isBossAttack) don't count toward phraseExists.
  const phraseExists = d.wordsRef.current.some(w => w.isBossPhrase);
  if (!phraseExists && time >= b.nextPhraseAt) {
    // Anti-repeat: filter the pool against the last few phrases used in this
    // fight. Keeps the three bosses' lore-specific banks from feeling like a
    // 3-line loop when the player gets stuck on a phase for a while.
    const pool = phase.phraseBank;
    const availablePool = pool.filter(p => !b.recentPhrases.includes(p));
    const pickFrom = availablePool.length > 0 ? availablePool : pool;
    const text = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    b.recentPhrases.push(text);
    if (b.recentPhrases.length > BOSS_PHRASE_MEMORY) b.recentPhrases.shift();
    const widthEst = text.length * 14;
    const xPos = (DESIGN_W - widthEst) / 2;     // dead center
    d.wordsRef.current.push({
      id: nextWordId(),
      text, x: xPos, y: 150,
      speed: 0,
      typed: '', kind: 'normal', isSpecial: false,
      hp: 1, fireCooldown: 0, ghostPhase: 0,
      scrambled: false, stationaryX: xPos, spawnTime: time,
      isBossPhrase: true,
    });
  }

  // ── Attack pattern scheduler.
  if (time >= b.nextAttackAt) {
    // Try up to patterns.length rotations — if the selected pattern is
    // capped (e.g. a summoner is already alive), advance and retry so the
    // boss never "skips" a turn silently.
    let spawned = false;
    for (let tries = 0; tries < phase.patterns.length && !spawned; tries++) {
      const pat = phase.patterns[b.patternRotationIdx % phase.patterns.length];
      b.patternRotationIdx += 1;
      spawned = spawnBossAttack(d, pat, phase.projectileLetters, time, b.phaseIdx);
    }
    b.nextAttackAt = time + phase.patternInterval * 1000;
  }

  // AfroMan — tick the passive ZOOTED timer. 10 s per stack, capped at 3,
  // no decay. This runs even when the player is perfectly safe — the smoke
  // is the environment, not a consequence of contact.
  if (b.def.id === 'afroman') {
    tickZooted(d, time);
  }
}

/** Spawn a wave of boss projectiles following the given pattern. Returns
 *  true if the pattern actually produced a threat this tick, false when a
 *  cap/pre-condition blocked it (so the scheduler can advance). */
function spawnBossAttack(d: LoopDeps, pattern: BossPattern, _letters: string, time: number, phaseIdx: number): boolean {
  // Projectile chars are digits 1-5 (not letters). This prevents any ambiguity
  // between word-typing and projectile-parrying: A-Z goes to words, 1-5 goes
  // to projectiles, never both. The `letters` parameter is kept for schema
  // continuity with config.ts but no longer influences projectile chars.
  const pick = () => PROJECTILE_DIGITS[Math.floor(Math.random() * PROJECTILE_DIGITS.length)];
  // AfroMan-specific: projectiles render as tall-can silhouettes instead of
  // floating digit motes. Pure cosmetic flag — mechanics are unchanged except
  // for the beat-volley path which also sets onBeat for perfect-parry scoring.
  const isAfroman = d.bossRef.current?.def.id === 'afroman';
  const isTaurus = d.bossRef.current?.def.id === 'taurus';
  // Flash the AfroMan sprite to its attack pose briefly whenever he spawns
  // anything — matches Jessyka's idle↔kiss swap for the other bosses.
  // 0.3.3: held for ~1.2 s (was 420 ms) so the attack pose actually reads on
  // screen instead of being a one-frame flicker.
  if (isAfroman) {
    d.setAfromanBossPhase('attack');
    window.setTimeout(() => {
      if (d.bossRef.current && !d.bossRef.current.defeated && d.bossRef.current.def.id === 'afroman') {
        d.setAfromanBossPhase('idle');
      }
    }, 1200);
  }
  // 0.3.12 — same pattern for Taurus. TaurusATTACK.png held for ~1.2 s
  // during every attack spawn so the pose reads as a clear telegraph.
  if (isTaurus) {
    d.setTaurusBossPhase('attack');
    window.setTimeout(() => {
      if (d.bossRef.current && !d.bossRef.current.defeated && d.bossRef.current.def.id === 'taurus') {
        d.setTaurusBossPhase('idle');
      }
    }, 1200);
  }
  // Track letters present in the current boss phrase so summoner/caster word
  // spawns don't pick a first letter that conflicts with what the player is
  // currently typing.
  const activePhrase = d.wordsRef.current.find(w => w.isBossPhrase);
  const forbidden = new Set<string>();
  if (activePhrase) {
    for (const ch of activePhrase.text.toUpperCase()) {
      if (ch >= 'A' && ch <= 'Z') forbidden.add(ch);
    }
  }
  // Boss body position — projectiles spawn here (moved up so they don't
  // appear right next to the player).
  const BOSS_BODY_Y = 360;

  if (pattern === 'single') {
    // One letter, launched from boss center, slight aim toward player.
    d.projectilesRef.current.push({
      id: nextProjectileId(),
      x: BOSS_AIM.x + (Math.random() - 0.5) * 40,
      y: BOSS_BODY_Y,
      vx: (PLAYER.x - BOSS_AIM.x) * 0.0012 + (Math.random() - 0.5) * 0.3,
      vy: isAfroman ? 0.9 : 1.15,   // afroman: slower for chill pacing
      char: pick(),
      fromBoss: true,
      life: 520,
      isTallCan: isAfroman || undefined,
      spawnedAt: performance.now(),
    });
    return true;
  } else if (pattern === 'volley') {
    // Three simultaneous drops spread across the middle third of the screen —
    // chord-like. Slower vy than 0.2.5 so the volley reads as a telegraph
    // instead of an instant kill.
    const xs = [BOSS_AIM.x - 140, BOSS_AIM.x, BOSS_AIM.x + 140];
    for (const x of xs) {
      d.projectilesRef.current.push({
        id: nextProjectileId(),
        x, y: BOSS_BODY_Y + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: isAfroman ? 0.9 : 1.15,
        char: pick(),
        fromBoss: true,
        life: 500,
        isTallCan: isAfroman || undefined,
        spawnedAt: performance.now(),
      });
    }
    // Small telegraph — quick screen flicker.
    triggerLightning(d.bgStateRef.current, time);
    return true;
  } else if (pattern === 'wave') {
    // Slow-spinning bullet-hell spiral. Count varies by phase (10 in P2,
    // 12 in P3) so the wave pressure grows through the fight. Angular and
    // radial velocities are ~40% slower than 0.2.5 to make the pattern
    // readable — waves no longer overlap each other.
    const count = phaseIdx >= 2 ? 12 : 10;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const angVel = direction * (0.006 + Math.random() * 0.004);  // slowed again for 0.2.9
    const radVel = 0.42;                                          // slowed for 0.2.9 (was 0.55)
    for (let i = 0; i < count; i++) {
      const startAng = (i / count) * Math.PI * 2;
      d.projectilesRef.current.push({
        id: nextProjectileId(),
        x: BOSS_AIM.x + Math.cos(startAng) * 50,
        y: BOSS_BODY_Y + Math.sin(startAng) * 50,
        vx: 0, vy: 0,
        char: pick(),
        fromBoss: true,
        life: 900,
        spiralOrigin: {x: BOSS_AIM.x, y: BOSS_BODY_Y},
        spiralAng: startAng,
        spiralRadius: 50,
        spiralAngVel: angVel,
        spiralRadVel: radVel,
      });
    }
    return true;
  } else if (pattern === 'word') {
    // Fire a multi-letter WORD as a single falling projectile. Damages player
    // on contact; typing it destroys it (but doesn't damage the boss).
    // AfroMan never uses this pattern in his phase config — but if a dev
    // cheat or future config change routes it here, we fall back to his
    // munchie pool so the generic gothic wordPool can never spawn in a
    // rhythm fight and break the thematic vocabulary.
    const isAfromanFallback = d.bossRef.current?.def.id === 'afroman';
    const genericPool = ['DEATH', 'DOOM', 'WITHER', 'RUIN', 'ASHES', 'CURSE', 'PYRE', 'DUSK', 'ABYSS', 'BLIGHT'];
    const wordPool = isAfromanFallback ? AFROMAN_MUNCHIES : genericPool;
    const existingFirstLetters = new Set(d.wordsRef.current.map(w => w.text[0]));
    const available = wordPool.filter(w => !existingFirstLetters.has(w[0]));
    if (available.length === 0) return false;
    const text = available[Math.floor(Math.random() * available.length)];
    // Spawn from boss center, drifting toward player.
    d.wordsRef.current.push({
      id: nextWordId(),
      text,
      x: BOSS_AIM.x - text.length * 7,       // roughly centered on boss x
      y: BOSS_BODY_Y + 10,
      speed: 0.45,
      typed: '', kind: 'runner', isSpecial: false,
      hp: 1, fireCooldown: 0, ghostPhase: 0,
      scrambled: false, stationaryX: 0, spawnTime: time,
      isBossAttack: true,
      isMunchie: isAfromanFallback || undefined,
    });
    // Telegraph.
    triggerLightning(d.bgStateRef.current, time);
    return true;
  } else if (pattern === 'summoner') {
    // Spawn ONE stationary chanter word as the boss's conjured minion. Cap:
    // ≤ 1 boss-summoned chanter alive at a time. A hard post-spawn cooldown
    // (BOSS_SUMMONER_COOLDOWN_MS) also prevents back-to-back summons even
    // after the previous chanter is killed, so the pattern stays a rare
    // interrupt instead of constant pressure.
    const b = d.bossRef.current;
    if (b && time < b.summonerCooldownUntil) return false;
    const alreadySummoned = d.wordsRef.current.some(w => w.isBossSummoned && w.kind === 'chanter');
    if (alreadySummoned) return false;
    const firstLettersUsed = new Set(d.wordsRef.current.map(w => w.text[0]));
    const candidates = GOTHIC_WORDS.filter(x =>
      x.length >= 5 && x.length <= 7 && !firstLettersUsed.has(x[0]) && !forbidden.has(x[0]),
    );
    if (candidates.length === 0) return false;
    const text = candidates[Math.floor(Math.random() * candidates.length)];
    // Position: center-biased, comfortably below the top-left HUD block.
    // The old spawn bounds (margin=DESIGN_W/6 ≈ 170, y=100-140) collided with
    // the HUD's HP/stamina/souls/zone-progress panel which extends to ~x=370
    // and y~240. Summoned words drew behind that panel and were unreadable.
    // New bounds: x centered around DESIGN_W/2 with ±120 px jitter, y=170-210.
    const wordW = text.length * 14;
    const xPos = (DESIGN_W - wordW) / 2 + (Math.random() - 0.5) * 240;
    const yPos = 170 + Math.random() * 40;
    d.wordsRef.current.push({
      id: nextWordId(),
      text, x: xPos, y: yPos,
      speed: 0,
      typed: '', kind: 'chanter', isSpecial: false,
      hp: 1, fireCooldown: 0, ghostPhase: 0,
      scrambled: false, stationaryX: xPos, spawnTime: time,
      isBossSummoned: true,
      spawnAnim: {start: time, duration: 900},
    });
    if (b) b.summonerCooldownUntil = time + BOSS_SUMMONER_COOLDOWN_MS;
    d.bossAnnouncementRef.current = {text: 'A CHANTER RISES', life: 140};
    sfxBossSummonChanter();
    triggerLightning(d.bgStateRef.current, time);
    return true;
  } else if (pattern === 'caster') {
    // Spawn ONE stationary caster word from the boss's repertoire. Cap:
    // ≤ 1 boss-summoned caster alive at a time + BOSS_CASTER_COOLDOWN_MS
    // post-spawn cooldown so the boss doesn't chain caster after caster.
    const b = d.bossRef.current;
    if (b && time < b.casterCooldownUntil) return false;
    const alreadySummoned = d.wordsRef.current.some(w => w.isBossSummoned && w.kind === 'caster');
    if (alreadySummoned) return false;
    const onScreen = new Set(d.wordsRef.current.map(w => w.text));
    const firstLettersUsed = new Set(d.wordsRef.current.map(w => w.text[0]));
    const casterPool = CASTER_WORDS.filter(w =>
      !onScreen.has(w) && !firstLettersUsed.has(w[0]) && !forbidden.has(w[0]),
    );
    if (casterPool.length === 0) return false;
    const text = casterPool[Math.floor(Math.random() * casterPool.length)];
    // Center-biased spawn, below the HUD — same reasoning as the summoner
    // branch above. Casters are slightly lower (y=180-210) so a stacked
    // summoner+caster pair doesn't overlap.
    const wordW = text.length * 14;
    const xPos = (DESIGN_W - wordW) / 2 + (Math.random() - 0.5) * 240;
    const yPos = 180 + Math.random() * 30;
    d.wordsRef.current.push({
      id: nextWordId(),
      text, x: xPos, y: yPos,
      speed: 0,                                  // explicitly stationary — never drifts toward player
      typed: '', kind: 'caster', isSpecial: false,
      hp: 1,
      fireCooldown: 2.5,                         // matches normal caster initial delay
      ghostPhase: 0,
      scrambled: false, stationaryX: xPos, spawnTime: time,
      isBossSummoned: true,
      spawnAnim: {start: time, duration: 900},
    });
    if (b) b.casterCooldownUntil = time + BOSS_CASTER_COOLDOWN_MS;
    d.bossAnnouncementRef.current = {text: 'A CASTER EMERGES', life: 140};
    sfxBossSummonCaster();
    triggerLightning(d.bgStateRef.current, time);
    return true;
  } else if (pattern === 'charge') {
    // TAURUS — horizontal sweep. Taurus rears up and five projectiles
    // tear across the screen at a fixed y-line. Telegraphed with a
    // screen-wide lightning flash so the player can pre-position / pre-
    // parry. Direction alternates per cast (stored via patternRotationIdx
    // parity) so consecutive charges don't come from the same side.
    // 0.3.13 — deep horn blast + sweeping noise SFX, plus a fire-spark
    // burst at each projectile spawn so the sweep visibly ignites the air.
    triggerLightning(d.bgStateRef.current, time);
    sfxTaurusCharge();
    const leftToRight = ((b?.patternRotationIdx ?? 0) & 1) === 0;
    const sweepY = 380 + (Math.random() - 0.5) * 60;
    const count = 5;
    const dir = leftToRight ? 1 : -1;
    const startX = leftToRight ? -40 : DESIGN_W + 40;
    for (let i = 0; i < count; i++) {
      const spacing = 90;
      const px = startX - dir * spacing * i;
      const py = sweepY + (Math.random() - 0.5) * 20;
      d.projectilesRef.current.push({
        id: nextProjectileId(),
        x: px, y: py,
        vx: dir * 6.5,
        vy: 0.2,
        char: pick(),
        fromBoss: true,
        life: 220,
        spawnedAt: performance.now(),
      });
      // Ember spark burst at the projectile spawn — 6 small red/orange
      // particles fanning out backward so the sweep trails flame.
      for (let k = 0; k < 6; k++) {
        if (d.particlesRef.current.length >= PARTICLE_CAP) break;
        const ang = Math.PI + (Math.random() - 0.5) * 1.4;
        const spd = 1.2 + Math.random() * 2.8;
        d.particlesRef.current.push({
          x: px, y: py,
          vx: dir * (Math.cos(ang) * spd),
          vy: Math.sin(ang) * spd - 0.4,
          life: 22, maxLife: 22, size: 2 + Math.random() * 1.5,
          color: Math.random() < 0.4 ? '#ffcc40' : Math.random() < 0.7 ? '#ff5818' : '#c01408',
        });
      }
    }
    return true;
  } else if (pattern === 'stomp') {
    // TAURUS — vertical hammer. Five projectiles cluster on the player's
    // current x position and rain down, staggered 80 ms apart so they read
    // as a "column of doom" rather than an instant volley. Each can still
    // be parried individually — chaining five matching digits in quick
    // succession is the skill check.
    // 0.3.13 — thud + debris SFX at windup, and each falling projectile
    // drops a short ember trail at spawn so the column visibly burns.
    sfxTaurusStomp();
    const targetX = PLAYER.x + (Math.random() - 0.5) * 30;
    d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 8);
    d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 260);
    // Initial ground-ash burst at the windup.
    for (let k = 0; k < 18; k++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const spd = 1.5 + Math.random() * 3.5;
      d.particlesRef.current.push({
        x: targetX + (Math.random() - 0.5) * 80,
        y: DESIGN_H - 40,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 34, maxLife: 34, size: 2 + Math.random() * 1.5,
        color: Math.random() < 0.5 ? '#ffa040' : '#c01408',
      });
    }
    for (let i = 0; i < 5; i++) {
      const spawnAt = time + i * 80;
      window.setTimeout(() => {
        if (!d.bossRef.current || d.bossRef.current.defeated || d.bossRef.current.def.id !== 'taurus') return;
        const px = targetX + (Math.random() - 0.5) * 40;
        const py = BOSS_BODY_Y - 20;
        d.projectilesRef.current.push({
          id: nextProjectileId(),
          x: px, y: py,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 1.4,
          char: pick(),
          fromBoss: true,
          life: 500,
          spawnedAt: performance.now(),
        });
        // Fire trail puff at each drop.
        for (let k = 0; k < 5; k++) {
          if (d.particlesRef.current.length >= PARTICLE_CAP) break;
          const ang = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
          const spd = 0.6 + Math.random() * 1.4;
          d.particlesRef.current.push({
            x: px, y: py,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 0.4,
            life: 18, maxLife: 18, size: 1.8 + Math.random() * 1.4,
            color: Math.random() < 0.5 ? '#ffaa28' : '#c82010',
          });
        }
      }, spawnAt - time);
    }
    return true;
  } else if (pattern === 'munchie') {
    // AfroMan — drop one slow "munchie" word from the top. Contact with the
    // player doesn't damage HP; it applies a stack of the ZOOTED debuff
    // (handled in updateWords contact check). Words move 30% slower than
    // baseline to give the player time to read them in the chaos.
    const firstLettersUsed = new Set(d.wordsRef.current.map(w => w.text[0]));
    const available = AFROMAN_MUNCHIES.filter(x => !firstLettersUsed.has(x[0]));
    if (available.length === 0) return false;
    const text = available[Math.floor(Math.random() * available.length)];
    const xPos = 60 + Math.random() * (DESIGN_W - 160);
    d.wordsRef.current.push({
      id: nextWordId(),
      text, x: xPos, y: -20,
      speed: 0.22,                              // ~30% slower than a normal runner word
      typed: '', kind: 'normal', isSpecial: false,
      hp: 1, fireCooldown: 0, ghostPhase: 0,
      scrambled: false, stationaryX: xPos, spawnTime: time,
      isBossAttack: true,
      isMunchie: true,
    });
    return true;
  } else if (pattern === 'beat-volley') {
    // AfroMan — four tall-can projectiles spawned on a 4-on-the-floor rhythm
    // (150 ms apart). Each one is flagged onBeat so the player gets the
    // perfect-parry window at its spawn time. Vertical velocity is slower
    // than the default so the rhythm reads clearly on screen.
    const bossY = 340;
    const xs = [BOSS_AIM.x - 160, BOSS_AIM.x - 50, BOSS_AIM.x + 60, BOSS_AIM.x + 170];
    for (let i = 0; i < xs.length; i++) {
      const spawnAt = time + i * 150;
      // Defer pushes so each arrives ON a future frame — matches the audible
      // 4-kick. We rely on setTimeout; projectiles enter the live array at
      // staggered moments and each carries onBeat=true for perfect parry.
      window.setTimeout(() => {
        if (!d.bossRef.current || d.bossRef.current.defeated) return;
        d.projectilesRef.current.push({
          id: nextProjectileId(),
          x: xs[i], y: bossY,
          vx: (PLAYER.x - xs[i]) * 0.0005,
          vy: 0.9,                               // slower fall than standard volleys
          char: PROJECTILE_DIGITS[Math.floor(Math.random() * PROJECTILE_DIGITS.length)],
          fromBoss: true,
          life: 560,
          isTallCan: true,
          onBeat: true,
          spawnedAt: performance.now(),
        });
      }, spawnAt - time);
    }
    return true;
  }
  return false;
}

function drawBossToBg(bgCtx: CanvasRenderingContext2D, d: LoopDeps, time: number): void {
  const b = d.bossRef.current;
  if (!b) return;
  const state: BossRenderState = {
    silhouette: b.def.silhouette,
    themeColor: b.def.themeColor,
    currentHp: b.currentHp,
    maxHp: b.def.maxHp,
    phaseIdx: b.phaseIdx,
    attackWindupT: b.attackWindupT,
    enraged: b.enraged,
    deathStart: b.deathStart,
    introStart: b.introStart,
    introDurationMs: BOSS_INTRO_MS,
  };
  drawBoss(bgCtx, state, time);
}

function updateFireballs(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number, dt: number, rankId: string): void {
  for (let i = d.fireballsRef.current.length - 1; i >= 0; i--) {
    const fb = d.fireballsRef.current[i];

    // ── Chase mode: fireball is homing on a deflected projectile. Re-aim
    //    every frame to the projectile's CURRENT position and move at a fixed
    //    speed (faster than the projectile so intercept is guaranteed within
    //    its life grace). Impact when distance < 20 OR when life runs out OR
    //    when the target projectile has already vanished for any reason.
    let detonate = false;
    if (fb.chaseProjectileId !== undefined) {
      const target = d.projectilesRef.current.find(pp => pp.id === fb.chaseProjectileId);
      fb.life = (fb.life ?? 72) - dt;   // frame-units — matches projectile lifetime
      if (target) {
        fb.tx = target.x;
        fb.ty = target.y;
        const dx = target.x - fb.x, dy = target.y - fb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 16 * dt;   // px per frame-unit — beats projectile fall (~6 px) easily
        if (dist <= Math.max(20, speed)) {
          // Intercept: destroy the projectile and detonate here at its position.
          fb.x = target.x;
          fb.y = target.y;
          const pIdx = d.projectilesRef.current.findIndex(pp => pp.id === target.id);
          if (pIdx !== -1) d.projectilesRef.current.splice(pIdx, 1);
          // fb.tx/ty already = target.x/y → impact FX lands on the projectile.
          detonate = true;
        } else {
          fb.x += (dx / dist) * speed;
          fb.y += (dy / dist) * speed;
        }
      } else {
        // Target gone (e.g. left the arena, cleared on boss death). Self-detonate in place.
        fb.tx = fb.x;
        fb.ty = fb.y;
        detonate = true;
      }
      if (!detonate && (fb.life ?? 0) <= 0) {
        // Grace expired without intercept — detonate at current position.
        fb.tx = fb.x;
        fb.ty = fb.y;
        detonate = true;
      }
      fb.progress = detonate ? 1 : 0.99;   // keep drawFireball happy; render full-bright
    } else {
      // ── Normal mode: classic 0..1 lerp from player to tx/ty.
      fb.progress += (fb.isSpecial ? 0.02 : 0.04) * dt;
      fb.x = PLAYER.x + (fb.tx - PLAYER.x) * fb.progress;
      fb.y = PLAYER.y + (fb.ty - PLAYER.y) * fb.progress;
    }

    const color = drawFireball(ctx, fb, d.comboRef.current, rankId, time);
    const isSpear = rankId === 'S' || rankId === 'SS' || rankId === 'SSS';
    const isChase = fb.chaseProjectileId !== undefined;
    const trailCount = fb.isSpecial ? 3 : isChase ? 3 : isSpear ? 4 : Math.min(3, Math.floor(d.comboRef.current / 30) + 1);
    for (let k = 0; k < trailCount; k++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      if (fb.isSpecial) {
        // Alternate hearts with small white sparkle specks for a candy-trail.
        const isSparkle = k > 0;
        d.particlesRef.current.push({
          x: fb.x + (Math.random() - 0.5) * 12,
          y: fb.y + (Math.random() - 0.5) * 12,
          vx: (Math.random() - 0.5) * 2.5,
          vy: (Math.random() - 0.5) * 2.5 + 0.6,
          life: isSparkle ? 18 : 14,
          maxLife: isSparkle ? 18 : 14,
          size: isSparkle ? 2 : 3,
          color: isSparkle ? '#ffe4f1' : '#ff78bd',
          isHeart: !isSparkle,
        });
      } else {
        d.particlesRef.current.push({
          x: fb.x, y: fb.y,
          vx: (Math.random() - 0.5) * (isSpear ? 5 : 3),
          vy: (Math.random() - 0.5) * (isSpear ? 5 : 3),
          life: isSpear ? 14 : 8, maxLife: isSpear ? 14 : 8,
          size: 3, color,
        });
      }
    }
    if (fb.progress >= 1 || detonate) {
      const explosion = isChase ? 14 : 8 + Math.floor(d.comboRef.current / 60);
      for (let j = 0; j < explosion * 4; j++) {
        if (d.particlesRef.current.length >= PARTICLE_CAP) break;
        d.particlesRef.current.push({
          x: fb.tx, y: fb.ty,
          vx: Math.random() * 8 - 4, vy: Math.random() * 8 - 4,
          life: 20, maxLife: 20, size: 3,
          color: fb.isSpecial ? '#ff80cc' : color,
          isHeart: fb.isSpecial,
        });
      }
      d.shockwavesRef.current.push({
        x: fb.tx, y: fb.ty, radius: 4, maxRadius: isSpear ? 90 : isChase ? 70 : 55,
        color: fb.isSpecial ? 'rgba(255,128,204,ALPHA)' : isSpear ? 'rgba(180,230,255,ALPHA)' : 'rgba(255,160,60,ALPHA)',
      });
      const mag = fb.isSpecial ? 8 : isSpear ? 6 : isChase ? 5 : 3;
      d.shakeMagRef.current = Math.max(d.shakeMagRef.current, mag);
      d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 140);
      sfxImpact(isSpear);
      if (!isChase) addImpactDecal(d.bgStateRef.current, fb.tx, fb.ty, isSpear);
      // AfroMan perfect-parry — chase fireball carrying perfectParryBonus
      // detonates on the projectile, and also deals HP damage to the boss.
      // Regular parries still just destroy the projectile (no boss damage).
      if (isChase && fb.perfectParryBonus && d.bossRef.current && !d.bossRef.current.defeated
          && d.bossRef.current.def.id === 'afroman') {
        const dmg = PERFECT_PARRY_BOSS_DMG;
        d.bossRef.current.currentHp = Math.max(0, d.bossRef.current.currentHp - dmg);
        d.damageTextsRef.current.push({
          x: BOSS_AIM.x + (Math.random() - 0.5) * 24, y: BOSS_AIM.y - 80,
          value: '-' + dmg, life: 55, maxLife: 55,
          color: '#ffe28a',
        });
        d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 8);
        d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 180);
        d.setAfromanBossHit(true);
        window.setTimeout(() => d.setAfromanBossHit(false), 520);
        if (d.bossRef.current.currentHp <= 0) defeatBoss(d, time);
      }
      // Hit a word (normal case) or damage boss. Chase fireballs never target
      // words or bosses — they exist only to physically neutralise a projectile.
      if (!isChase && fb.targetBoss && d.bossRef.current && !d.bossRef.current.defeated) {
        const dmg = fb.bossDamage ?? 0;
        if (dmg > 0) {
          d.bossRef.current.currentHp = Math.max(0, d.bossRef.current.currentHp - dmg);
          d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 10 + dmg * 2);
          d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 260);
          // 0.3.12 — Taurus sprite flinches on phrase damage too, same
          // pattern AfroMan uses for perfect parries. The hit class fades
          // out after 520 ms and the sprite resumes its idle sway.
          if (d.bossRef.current.def.id === 'taurus') {
            d.setTaurusBossHit(true);
            window.setTimeout(() => d.setTaurusBossHit(false), 520);
          }
          // Big impact burst at the boss.
          for (let j = 0; j < 24 + dmg * 8; j++) {
            if (d.particlesRef.current.length >= PARTICLE_CAP) break;
            const ang = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 7;
            d.particlesRef.current.push({
              x: BOSS_AIM.x, y: BOSS_AIM.y,
              vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2,
              life: 30, maxLife: 30, size: 3,
              color: d.bossRef.current.def.themeColor,
            });
          }
          // Floating damage number above the boss.
          d.damageTextsRef.current.push({
            x: BOSS_AIM.x + (Math.random() - 0.5) * 30, y: BOSS_AIM.y - 100,
            value: '-' + dmg, life: 60, maxLife: 60,
            color: d.bossRef.current.def.themeColor,
          });
        }
        if (d.bossRef.current.currentHp <= 0) defeatBoss(d, time);
      } else if (!isChase && !fb.targetBoss) {
        const wIdx = d.wordsRef.current.findIndex(w => Math.abs(w.x - fb.tx) < 70 && Math.abs(w.y - fb.ty) < 80);
        if (wIdx !== -1) {
          const w = d.wordsRef.current[wIdx];
          const resistance = Math.min(w.typed.length / w.text.length, 0.9);
          const scl = 1 + d.comboRef.current / 150;
          w.y -= 5 * (1 - resistance) * scl;
        }
      }
      d.fireballsRef.current.splice(i, 1);
    }
  }
}

function defeatBoss(d: LoopDeps, time: number): void {
  const b = d.bossRef.current;
  if (!b || b.defeated) return;
  b.defeated = true;
  b.deathStart = time;
  d.scoreRef.current += b.def.soulsReward;
  d.statsRef.current.bossesDefeated += 1;
  // 0.3.0 — secret-route marker + sprite death transition for AfroMan.
  // 0.3.12 — Taurus gets the same sprite swap + music duck.
  const isSecret = b.def.id === 'afroman';
  const isTaurus = b.def.id === 'taurus';
  if (isSecret) {
    d.statsRef.current.secretBossDefeated = true;
    d.setAfromanBossPhase('dying');
    setMusicSampleVolume(0.15, 1000);
  } else if (isTaurus) {
    d.setTaurusBossPhase('dying');
    setMusicSampleVolume(0.15, 1000);
  }

  // Moment-of-death: guttural scream + first massive burst.
  sfxBossScream();
  triggerLightning(d.bgStateRef.current, time);
  d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 18);
  d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 900);
  for (let i = 0; i < 60; i++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 3 + Math.random() * 9;
    d.particlesRef.current.push({
      x: BOSS_AIM.x, y: BOSS_AIM.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 3,
      life: 45, maxLife: 45, size: 3 + Math.random() * 2,
      color: Math.random() < 0.45 ? '#9b0000' : b.def.themeColor,
    });
  }
  d.shockwavesRef.current.push({x: BOSS_AIM.x, y: BOSS_AIM.y, radius: 8, maxRadius: 240, color: 'rgba(255, 60, 40, ALPHA)'});

  // Clear all incoming threats + active phrase so the player just watches.
  d.projectilesRef.current = [];
  d.wordsRef.current = [];
  d.activeWordRef.current = null;
  // Invulnerability covers the full cutscene — longer for Taurus (6.5 s
  // extended beats) than the canonical 3.2 s cadence.
  d.iFramesUntilRef.current = time + (isTaurus ? 6800 : 3200);
  d.bossAnnouncementRef.current = {
    text: isSecret ? 'THE SET IS OVER' : isTaurus ? 'THE RAMPART IS YOURS' : b.def.name + ' FELLED',
    life: 180,
    color: isSecret ? '#ffd6ec' : isTaurus ? '#ffa870' : undefined,
  };

  // Floating "souls earned" text — flies up from the boss's chest.
  d.damageTextsRef.current.push({
    x: BOSS_AIM.x, y: BOSS_AIM.y - 60,
    value: '+' + b.def.soulsReward.toLocaleString() + ' SOULS',
    life: 180, maxLife: 180,
    color: '#ffe28a',
    big: true,
  });

  // Mid-cutscene: deep collapse rumble + second big shockwave.
  window.setTimeout(() => {
    if (!d.bossRef.current || !d.bossRef.current.defeated) return;
    sfxBossCollapse();
    triggerLightning(d.bgStateRef.current, performance.now());
    d.shockwavesRef.current.push({x: BOSS_AIM.x, y: BOSS_AIM.y, radius: 10, maxRadius: 300, color: 'rgba(180, 40, 20, ALPHA)'});
    d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 14);
    d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, performance.now() + 600);
  }, 900);

  if (isTaurus) {
    // 0.3.13 — extended Taurus death cutscene. Three extra staged beats
    // stretch the moment from the canonical 3.2 s cadence out to 6.5 s,
    // giving the fallen rampart-beast room to breathe.

    // Beat 1 (1.8 s) — sustained ember pour from the corpse + flavour line.
    window.setTimeout(() => {
      if (!d.bossRef.current || !d.bossRef.current.defeated) return;
      d.bossAnnouncementRef.current = {text: 'SILENCE SETTLES', life: 180, color: '#ffb878'};
      for (let i = 0; i < 48; i++) {
        if (d.particlesRef.current.length >= PARTICLE_CAP) break;
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const spd = 1.2 + Math.random() * 3.5;
        d.particlesRef.current.push({
          x: BOSS_AIM.x + (Math.random() - 0.5) * 140,
          y: BOSS_AIM.y + (Math.random() - 0.5) * 50,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 70, maxLife: 70, size: 2 + Math.random() * 2,
          color: Math.random() < 0.4 ? '#ffa040' : '#d02018',
        });
      }
    }, 1800);

    // Beat 2 (3.2 s) — second heavy collapse + ground-crack flare.
    window.setTimeout(() => {
      if (!d.bossRef.current || !d.bossRef.current.defeated) return;
      sfxBossCollapse();
      triggerLightning(d.bgStateRef.current, performance.now());
      d.shockwavesRef.current.push({x: BOSS_AIM.x, y: BOSS_AIM.y, radius: 14, maxRadius: 360, color: 'rgba(220, 70, 30, ALPHA)'});
      d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 12);
      d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, performance.now() + 500);
      // Pulse the arena crack (reuse the hit flash).
      d.setTaurusBossHit(true);
      window.setTimeout(() => d.setTaurusBossHit(false), 600);
    }, 3200);

    // Beat 3 (4.6 s) — resolved flavour line, embers still rising.
    window.setTimeout(() => {
      if (!d.bossRef.current || !d.bossRef.current.defeated) return;
      d.bossAnnouncementRef.current = {text: 'THE BURG CAN BREATHE', life: 180, color: '#ffd08a'};
    }, 4600);

    // Beat 4 (5.6 s) — final brightest flash + resolving chord.
    window.setTimeout(() => {
      if (!d.bossRef.current || !d.bossRef.current.defeated) return;
      sfxBossFinale();
      sfxBossDefeated();
      triggerLightning(d.bgStateRef.current, performance.now());
      d.shockwavesRef.current.push({x: BOSS_AIM.x, y: BOSS_AIM.y, radius: 16, maxRadius: 420, color: 'rgba(255, 220, 140, ALPHA)'});
    }, 5600);

    // Hand-off (6.5 s).
    window.setTimeout(() => {
      if (!d.bossRef.current || !d.bossRef.current.defeated) return;
      d.beginBonfire('boss-defeated', d.zoneIdxRef.current + 1, b.def.name);
    }, 6500);
  } else {
    // Canonical cadence for Ornstein / Gwyn / AfroMan — 3.2 s to bonfire.
    window.setTimeout(() => {
      if (!d.bossRef.current || !d.bossRef.current.defeated) return;
      sfxBossFinale();
      sfxBossDefeated();
      triggerLightning(d.bgStateRef.current, performance.now());
      d.shockwavesRef.current.push({x: BOSS_AIM.x, y: BOSS_AIM.y, radius: 12, maxRadius: 380, color: 'rgba(255, 220, 140, ALPHA)'});
    }, 2400);

    window.setTimeout(() => {
      if (!d.bossRef.current || !d.bossRef.current.defeated) return;
      d.beginBonfire('boss-defeated', d.zoneIdxRef.current + 1, b.def.name);
    }, 3200);
  }
}

function updateProjectiles(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number, dt: number): void {
  for (let i = d.projectilesRef.current.length - 1; i >= 0; i--) {
    const p = d.projectilesRef.current[i];

    // ── Movement: spiral pattern if configured, else linear.
    if (p.spiralOrigin && p.spiralAng !== undefined && p.spiralRadius !== undefined
        && p.spiralAngVel !== undefined && p.spiralRadVel !== undefined) {
      p.spiralAng += p.spiralAngVel * dt;
      p.spiralRadius += p.spiralRadVel * dt;
      p.x = p.spiralOrigin.x + Math.cos(p.spiralAng) * p.spiralRadius;
      p.y = p.spiralOrigin.y + Math.sin(p.spiralAng) * p.spiralRadius;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.life -= dt;

    // ── Record trail for caster projectiles (dramatic magic streak).
    if (!p.fromBoss) {
      if (!p.trail) p.trail = [];
      p.trail.push({x: p.x, y: p.y});
      if (p.trail.length > 6) p.trail.shift();
    }

    drawProjectile(ctx, p, time);

    // Contact with player. Deflected projectiles pass through harmlessly —
    // they're already doomed and the chase fireball is on its way to destroy them.
    const dxp = PLAYER.x - p.x, dyp = PLAYER.y - p.y;
    const distP = Math.sqrt(dxp * dxp + dyp * dyp);
    if (distP < 45 && !p.deflected) {
      if (isInvulnerable(d, time)) {
        d.statsRef.current.dodgesSuccessful += 1;
        d.damageTextsRef.current.push({
          x: PLAYER.x, y: PLAYER.y - 40,
          value: 'DODGE', life: 50, maxLife: 50, color: '#90f0ff',
        });
      } else {
        applyDamageToPlayer(d, p.fromBoss ? 2 : 1, time);
      }
      d.projectilesRef.current.splice(i, 1);
      continue;
    }
    // Lifetime expiry OR off-screen (expanded bounds to allow spirals to leave).
    if (p.life <= 0 || p.y > DESIGN_H + 30 || p.x < -50 || p.x > DESIGN_W + 50 || p.y < -50) {
      d.projectilesRef.current.splice(i, 1);
    }
  }
}

function updateShockwaves(d: LoopDeps, ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = d.shockwavesRef.current.length - 1; i >= 0; i--) {
    const sw = d.shockwavesRef.current[i];
    sw.radius += 3.5 * dt;
    drawShockwave(ctx, sw);
    if (sw.radius >= sw.maxRadius) d.shockwavesRef.current.splice(i, 1);
  }
}

/** Estus chug visualization — green halo at feet, floating flask glyph, progress ring. */
function drawEstusChug(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number): void {
  const remaining = d.estusActiveUntilRef.current - time;
  if (remaining <= 0) return;
  const progress = 1 - remaining / 1150;        // 0..1 over the ESTUS_CHUG_MS window
  const px = PLAYER.x, py = PLAYER.y;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Warm green healing halo pulsing at the player's feet.
  const pulse = 0.7 + Math.sin(time * 0.014) * 0.3;
  const haloR = 90 * pulse;
  const halo = ctx.createRadialGradient(px, py + 20, 0, px, py + 20, haloR);
  halo.addColorStop(0, 'rgba(120, 255, 160, 0.55)');
  halo.addColorStop(0.5, 'rgba(70, 200, 120, 0.25)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(px - haloR, py + 20 - haloR, haloR * 2, haloR * 2);
  ctx.restore();

  // Flask glyph rising from the player's mouth/chest. As progress climbs, it
  // rises higher (like the player is tipping it up to drink).
  const flaskX = px, flaskY = py - 40 - progress * 30;
  ctx.save();
  // Stem/neck.
  ctx.fillStyle = 'rgba(40, 20, 8, 0.95)';
  ctx.fillRect(flaskX - 3, flaskY - 12, 6, 10);
  // Bottle body.
  ctx.beginPath();
  ctx.moveTo(flaskX - 8, flaskY - 2);
  ctx.lineTo(flaskX - 10, flaskY + 4);
  ctx.lineTo(flaskX - 10, flaskY + 12);
  ctx.lineTo(flaskX + 10, flaskY + 12);
  ctx.lineTo(flaskX + 10, flaskY + 4);
  ctx.lineTo(flaskX + 8, flaskY - 2);
  ctx.closePath();
  ctx.fill();
  // Amber glowing contents, fill height inversely proportional to progress.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fluidH = 12 * (1 - progress);
  const fluidY = flaskY + 12 - fluidH;
  const fluid = ctx.createLinearGradient(flaskX, fluidY, flaskX, flaskY + 12);
  fluid.addColorStop(0, 'rgba(255, 200, 100, 0.9)');
  fluid.addColorStop(1, 'rgba(220, 130, 40, 0.9)');
  ctx.fillStyle = fluid;
  ctx.fillRect(flaskX - 9, fluidY, 18, fluidH);
  ctx.restore();

  // Amber progress ring around the player.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 200, 100, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(px, py, 38, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Small ember sparks rising around the player.
  if (d.particlesRef.current.length < PARTICLE_CAP && Math.random() < 0.4) {
    d.particlesRef.current.push({
      x: px + (Math.random() - 0.5) * 60,
      y: py + 20,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.8 - Math.random() * 0.8,
      life: 20, maxLife: 20, size: 2,
      color: Math.random() < 0.5 ? '#9dff7a' : '#ffd060',
    });
  }
}

/** Jessyka companion driver — state machine, target selection, kiss firing,
 *  kiss flight/arrival handling, sprite switching, spawn/despawn transitions.
 *  Draws kisses directly on the action canvas. */
function updateJessyka(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number): void {
  const j = d.jessykaRef.current;

  // Drive kisses regardless of Jessyka's state — they live independently
  // (e.g., finish flying even after she despawns).
  updateJessykaKisses(d, ctx, time);

  if (!j) return;

  // Sprite switching (kiss ↔ idle) based on castingUntil window.
  const img = d.jessykaImgRef.current;
  if (img) {
    const kissing = time < j.castingUntil;
    const desired = kissing ? 'kiss' : 'idle';
    if (img.dataset.state !== desired) {
      img.src = kissing ? '/jessKISS.png' : '/jessIDLE.png';
      img.dataset.state = desired;
    }
  }

  // ── Spawn → active transition. On first transition, fire the free
  //    initial veil (doesn't consume the stored grace). spawnVeilFired
  //    blocks re-firing on chained refreshes of the same companion.
  if (j.state === 'spawning' && time - j.spawnStart >= JESS_SPAWN_MS) {
    j.state = 'active';
    if (!j.spawnVeilFired) {
      j.spawnVeilFired = true;
      fireJessykaVeil(d, time, true);
    }
  }

  // ── Active / leaving: pick and fire on targets.
  //    0.3.9 — unified targeting for both summon sources. Priority:
  //      1. Any un-deflected projectile in flight (boss OR caster) → shoot
  //         it immediately (protects the player; interrupts word typing).
  //      2. Otherwise, pick a word target and fire kisses down its letters.
  //    The JESSYKA-word variant still uses the "finish the word" exit
  //    semantics (waits for the current word to complete before leaving).
  //    The Q-summon still honours autoDespawnAt and exits instantly.
  if (j.state === 'active' || j.state === 'leaving') {
    // Priority 1: projectile shield. Fires every JESS_KISS_INTERVAL_MS if
    // there's anything un-deflected in the air.
    let projectileHandled = false;
    if (time >= j.nextKissAt) {
      const hasProjectile = d.projectilesRef.current.some(p => !p.deflected);
      if (hasProjectile) {
        const fired = fireJessykaProjectileKiss(d, j, time);
        if (fired) {
          projectileHandled = true;
          // 0.3.10 — keep targetId + lettersFired + the word's jessykaTarget
          // claim. When the projectile is dead she resumes the same word
          // from exactly where she left off (fixes abandoned half-typed
          // words when a projectile interrupts mid-word). The existing
          // validation below handles the case where the word died during
          // shielding (wIdx === -1 → repick).
        }
      }
    }

    // Priority 2: word target (only if she didn't just fire at a projectile).
    if (!projectileHandled) {
      if (j.targetId !== null) {
        // Validate current target.
        const wIdx = d.wordsRef.current.findIndex(w => w.id === j.targetId);
        if (wIdx === -1) {
          // Target is gone (contact damage, etc). Release and re-pick next frame.
          j.targetId = null;
          j.lettersFired = 0;
        } else {
          const w = d.wordsRef.current[wIdx];
          if (j.lettersFired < w.text.length && time >= j.nextKissAt) {
            fireJessykaKiss(d, j, w, time);
          }
        }
      } else if (j.state !== 'leaving') {
        // No target — pick one (unless leaving, then we fall through to
        // the despawn transition below).
        tryPickJessykaTarget(d, j);
      }
    }

    // Auto-despawn trigger (Q-summon's estus variant honours this).
    if (j.state === 'active' && j.autoDespawnAt > 0 && time >= j.autoDespawnAt) {
      j.state = 'leaving';
    }

    // Leaving → despawning transition. The Q-summon exits immediately; the
    // word-summon only exits when it has no word in flight. Either way, if
    // she's leaving AND there's no word target AND no projectile just fired,
    // commit to despawning now.
    if (j.state === 'leaving' && j.targetId === null && !projectileHandled) {
      j.state = 'despawning';
      j.despawnStart = time;
      d.setJessykaDespawning(true);
      spawnJessykaAngelicBurst(d, time);
    }
  }

  // ── Despawn → removal.
  if (j.state === 'despawning' && time - j.despawnStart >= JESS_DESPAWN_MS) {
    // Unclaim any lingering target (shouldn't be any, but defensive).
    if (j.targetId !== null) {
      const wIdx = d.wordsRef.current.findIndex(w => w.id === j.targetId);
      if (wIdx !== -1) d.wordsRef.current[wIdx].jessykaTarget = false;
    }
    d.jessykaRef.current = null;
    d.setJessykaVisible(false);
    d.setJessykaDespawning(false);
  }
}

/** Prefer a high-up, non-boss, non-special, non-chanter word. Falls back to any. */
function tryPickJessykaTarget(d: LoopDeps, j: JessykaCompanion): void {
  // 0.3.9 — expanded target pool. She now removes boss-summoned chanters +
  // casters (`isBossSummoned`), their spawned minions (`isBossAttack`), and
  // word-pattern boss attacks from the trial — anything the player would
  // otherwise have to manage alongside the boss phrase. The boss phrase
  // itself (`isBossPhrase`) is still excluded: that's the player's job.
  // JESSYKA specials (`isSpecial`) are excluded to preserve the chain-
  // summon interaction. On-screen y-range is preserved so she never fires
  // kisses upward into the void at pre-spawn words.
  const candidates = d.wordsRef.current.filter(w =>
    !w.jessykaTarget
    && !w.isSpecial
    && !w.isBossPhrase
    && w.typed.length === 0
    && !w.spawnAnim
    && w.y >= 10 && w.y <= DESIGN_H - 40,
  );
  if (candidates.length === 0) return;
  // Sort by threat: boss-summoned chanters + casters are a constant source
  // of pressure, so clear them first. Then prefer anything close to the
  // player (low on screen), then fall back to topmost for zone cleanup.
  candidates.sort((a, b) => {
    const aThreat = (a.isBossSummoned ? 2 : 0) + (a.isBossAttack ? 1 : 0);
    const bThreat = (b.isBossSummoned ? 2 : 0) + (b.isBossAttack ? 1 : 0);
    if (aThreat !== bThreat) return bThreat - aThreat;   // higher threat first
    // Same threat tier — prefer the one closest to the player.
    const aDist = Math.abs(a.y - PLAYER.y);
    const bDist = Math.abs(b.y - PLAYER.y);
    return aDist - bDist;
  });
  const target = candidates[0];
  target.jessykaTarget = true;
  j.targetId = target.id;
  j.lettersFired = 0;
  j.nextKissAt = performance.now() + 200;      // small windup delay
}

/** Fire one kiss toward the current target's current position. */
function fireJessykaKiss(d: LoopDeps, j: JessykaCompanion, w: Word, time: number): void {
  const origin = {x: PLAYER.x + JESS_X_OFFSET + JESS_MOUTH_DX, y: PLAYER.y + JESS_MOUTH_DY};
  const letterIdx = j.lettersFired;
  d.jessykaKissesRef.current.push({
    x: origin.x, y: origin.y,
    sx: origin.x, sy: origin.y,
    tx: w.x + letterIdx * 16, ty: w.y - 14,
    progress: 0,
    wordId: w.id,
    letterIdx,
  });
  j.lettersFired += 1;
  j.nextKissAt = time + JESS_KISS_INTERVAL_MS;
  j.castingUntil = time + 220;

  // Muzzle puff at her mouth.
  for (let k = 0; k < 8; k++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.8 + Math.random() * 2;
    d.particlesRef.current.push({
      x: origin.x, y: origin.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.5,
      life: 16, maxLife: 16, size: 2,
      color: Math.random() < 0.5 ? '#ff80cc' : '#ffd6ec',
    });
  }
}

/** Estus summon variant — picks the nearest undeflected boss projectile to the
 *  player and fires a homing kiss at it. The projectile is marked deflected
 *  atomically so the player is protected during flight. Never targets boss
 *  phrases, boss attack-words, or boss-summoned casters — she clears the air,
 *  not the boss itself. Returns true if a kiss was fired. */
function fireJessykaProjectileKiss(d: LoopDeps, j: JessykaCompanion, time: number): boolean {
  // Find nearest un-deflected boss projectile to the player.
  let best: Projectile | null = null;
  let bestDist = Infinity;
  for (const p of d.projectilesRef.current) {
    // 0.3.9 — drop the `fromBoss` filter so she also intercepts caster
    // projectiles (fromBoss: false, fired by summoner-spawned or zone
    // casters). Only `deflected` is excluded — those are already doomed.
    if (p.deflected) continue;
    const dx = p.x - PLAYER.x, dy = p.y - PLAYER.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { best = p; bestDist = dist; }
  }
  if (!best) return false;
  // Atomic parry — mark the projectile deflected immediately so it can't damage
  // the player even if the kiss takes a few frames to arrive.
  best.deflected = true;

  const origin = {x: PLAYER.x + JESS_X_OFFSET + JESS_MOUTH_DX, y: PLAYER.y + JESS_MOUTH_DY};
  d.jessykaKissesRef.current.push({
    x: origin.x, y: origin.y,
    sx: origin.x, sy: origin.y,
    tx: best.x, ty: best.y,
    progress: 0,
    wordId: -1, letterIdx: 0,
    chaseProjectileId: best.id,
  });
  j.projectileTargetId = best.id;
  j.nextKissAt = time + JESS_KISS_INTERVAL_MS;
  j.castingUntil = time + 220;
  // Small pink muzzle puff.
  for (let k = 0; k < 8; k++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.8 + Math.random() * 2;
    d.particlesRef.current.push({
      x: origin.x, y: origin.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.5,
      life: 16, maxLife: 16, size: 2,
      color: Math.random() < 0.5 ? '#ff80cc' : '#ffd6ec',
    });
  }
  return true;
}

/** Advance and render kisses. Has two branches:
 *  - word branch (default): follows a bezier arc to the target word's next letter.
 *    On arrival, advances w.typed and (if complete) splices the word.
 *  - projectile-chase branch (boss-fight estus summon, chaseProjectileId set):
 *    re-aims each frame to the projectile's live position at 10 px/frame. On
 *    arrival (dist<18), splices the projectile and detonates — the projectile
 *    was already marked deflected atomically at fire-time, so the player is
 *    never in danger while the kiss is in flight. If the projectile vanishes
 *    (off-screen, boss death, etc.) the kiss self-detonates in place. */
function updateJessykaKisses(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number): void {
  const kisses = d.jessykaKissesRef.current;
  for (let i = kisses.length - 1; i >= 0; i--) {
    const k = kisses[i];

    // Petal trail — 1-2 pink petals per frame behind the kiss.
    const petalCount = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let pp = 0; pp < petalCount; pp++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      d.particlesRef.current.push({
        x: k.x + (Math.random() - 0.5) * 6,
        y: k.y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.7,
        vy: 0.2 + Math.random() * 0.6,
        life: 22, maxLife: 22, size: 2 + Math.random() * 1.5,
        color: Math.random() < 0.55 ? '#ffc2e0' : '#ff85c0',
        isHeart: Math.random() < 0.25,
      });
    }

    if (k.chaseProjectileId !== undefined) {
      // ── Projectile-chase branch. Re-aim to the projectile's live position.
      const pIdx = d.projectilesRef.current.findIndex(p => p.id === k.chaseProjectileId);
      if (pIdx === -1) {
        // Target gone — detonate in place.
        spawnKissProjectileHit(d, k.x, k.y);
        kisses.splice(i, 1);
        continue;
      }
      const p = d.projectilesRef.current[pIdx];
      const dx = p.x - k.x, dy = p.y - k.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 18) {
        // Arrival — splice the projectile, burst, shockwave, sfx (kissImpact plays inside).
        d.projectilesRef.current.splice(pIdx, 1);
        spawnKissProjectileHit(d, p.x, p.y);
        d.statsRef.current.projectilesDeflected += 1;
        kisses.splice(i, 1);
        continue;
      }
      if (dist > 0.001) {
        const v = JESS_ESTUS_PROJECTILE_CHASE_SPEED / dist;
        k.x += dx * v; k.y += dy * v;
      }
      k.tx = p.x; k.ty = p.y;     // update for the heart's rotation angle
      // Render — angle along the travel direction.
      const ang = Math.atan2(dy, dx);
      drawKissHeart(ctx, k.x, k.y, 12, time, ang);
      continue;
    }

    // ── Word-bezier branch (default).
    k.progress += (1000 / 60) / JESS_KISS_FLIGHT_MS;     // normalized to 60fps frames

    // Re-home target position in case the word is still moving.
    const wIdx = d.wordsRef.current.findIndex(w => w.id === k.wordId);
    if (wIdx !== -1) {
      const w = d.wordsRef.current[wIdx];
      k.tx = w.x + k.letterIdx * 16;
      k.ty = w.y - 14;
    }

    // Arc trajectory — linear base + small parabolic rise in the middle.
    const t = Math.min(1, k.progress);
    const arcLift = Math.sin(t * Math.PI) * 30;
    k.x = k.sx + (k.tx - k.sx) * t;
    k.y = k.sy + (k.ty - k.sy) * t - arcLift;

    // Render the heart — rotated along travel direction.
    drawKissHeart(ctx, k.x, k.y, 12, time, Math.atan2(k.ty - k.sy, k.tx - k.sx));

    if (k.progress >= 1) {
      // Arrival — apply the letter to the target (if it still exists).
      if (wIdx !== -1) {
        const w = d.wordsRef.current[wIdx];
        // Only advance if the typed-length matches what this kiss was meant to add.
        if (w.typed.length === k.letterIdx) {
          w.typed += w.text[k.letterIdx] ?? '';
        }
        sfxJessykaKissImpact();
        // Impact sparkles.
        for (let p = 0; p < 10; p++) {
          if (d.particlesRef.current.length >= PARTICLE_CAP) break;
          const ang = Math.random() * Math.PI * 2;
          const spd = 0.5 + Math.random() * 2.5;
          d.particlesRef.current.push({
            x: k.x, y: k.y,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            life: 18, maxLife: 18, size: 2.5,
            color: '#ff9dd6',
            isHeart: Math.random() < 0.3,
          });
        }
        // If target complete, consume it.
        if (w.typed === w.text) jessykaKillTarget(d, w, wIdx, time);
      }
      kisses.splice(i, 1);
    }
  }
}

/** FX for a kiss hitting a deflected boss projectile — heart burst + shockwave. */
function spawnKissProjectileHit(d: LoopDeps, x: number, y: number): void {
  sfxJessykaKissImpact();
  for (let p = 0; p < 16; p++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 4.5;
    d.particlesRef.current.push({
      x, y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.5,
      life: 28, maxLife: 28, size: 3,
      color: Math.random() < 0.5 ? '#ff80cc' : '#ffd6ec',
      isHeart: Math.random() < 0.55,
    });
  }
  d.shockwavesRef.current.push({
    x, y, radius: 6, maxRadius: 60,
    color: 'rgba(255, 140, 210, ALPHA)',
  });
}

function jessykaKillTarget(d: LoopDeps, w: Word, wIdx: number, _time: number): void {
  // Score + stats.
  d.scoreRef.current += w.text.replace(/ /g, '').length * 15;
  d.statsRef.current.wordsKilled += 1;
  sfxShatter();
  // Heart burst at word position.
  for (let p = 0; p < 26; p++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 5;
    d.particlesRef.current.push({
      x: w.x + w.text.length * 6, y: w.y - 10,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1.5,
      life: 28, maxLife: 28, size: 3,
      color: Math.random() < 0.5 ? '#ff80cc' : '#ffd6ec',
      isHeart: Math.random() < 0.5,
    });
  }
  // Splice + adjust player's active index if needed.
  d.wordsRef.current.splice(wIdx, 1);
  if (d.activeWordRef.current !== null && d.activeWordRef.current > wIdx) {
    d.activeWordRef.current -= 1;
  }
  // Clear Jessyka's target so she can pick another.
  const j = d.jessykaRef.current;
  if (j && j.targetId === w.id) {
    j.targetId = null;
    j.lettersFired = 0;
  }
}

/** Draw a large gradient-filled heart at (x,y) with half-extent s. Used for
 *  kiss projectiles — includes a pulsing halo, two rotating sparkle arcs, and
 *  a rotation angle so the heart tips along its travel direction. */
function drawKissHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, time: number = 0, angle: number = 0): void {
  // Pulsing halo — breath = sin(time·0.012) gives a slow ~8Hz pulse.
  const breath = 1 + Math.sin(time * 0.012) * 0.15;
  const haloR = s * 2.5 * breath;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  halo.addColorStop(0, 'rgba(255, 150, 210, 0.65)');
  halo.addColorStop(0.5, 'rgba(255, 120, 200, 0.35)');
  halo.addColorStop(1, 'rgba(255, 150, 210, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - haloR, y - haloR, haloR * 2, haloR * 2);
  ctx.restore();

  // Two orbiting sparkle arcs — the "pucker" shimmer.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  ctx.rotate(time * 0.008);
  ctx.strokeStyle = 'rgba(255, 230, 245, 0.7)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.4, 0.2, 1.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.4, Math.PI + 0.2, Math.PI + 1.1);
  ctx.stroke();
  ctx.restore();

  // Heart glyph — gradient-filled, rotated along travel angle (clamped to 8°).
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.max(-0.14, Math.min(0.14, angle)));
  const grad = ctx.createRadialGradient(-s * 0.25, -s * 0.35, 1, 0, 0, s * 1.1);
  grad.addColorStop(0, '#ffd6ec');
  grad.addColorStop(0.35, '#ff9dd6');
  grad.addColorStop(0.75, '#ff5aa8');
  grad.addColorStop(1, '#c73e84');
  ctx.fillStyle = grad;
  const lobeR = s * 0.55;
  ctx.beginPath();
  ctx.arc(-lobeR * 0.7, -s * 0.1, lobeR, Math.PI, 0, false);
  ctx.arc(lobeR * 0.7, -s * 0.1, lobeR, Math.PI, 0, false);
  ctx.lineTo(0, s * 0.95);
  ctx.closePath();
  ctx.fill();
  // Dark outline — keeps the heart legible against bright backgrounds.
  ctx.strokeStyle = 'rgba(120, 20, 60, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Shine highlight.
  ctx.fillStyle = 'rgba(255, 240, 248, 0.85)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.38, -s * 0.3, s * 0.26, s * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Angelic ascension burst spawned when Jessyka begins despawning. */
function spawnJessykaAngelicBurst(d: LoopDeps, _time: number): void {
  const origin = {x: PLAYER.x + JESS_X_OFFSET + JESS_MOUTH_DX, y: PLAYER.y + JESS_MOUTH_DY - 8};
  for (let i = 0; i < 40; i++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const spd = 1 + Math.random() * 3.5;
    d.particlesRef.current.push({
      x: origin.x + (Math.random() - 0.5) * 30,
      y: origin.y,
      vx: Math.cos(ang) * spd * 0.4,
      vy: Math.sin(ang) * spd,
      life: 50, maxLife: 50, size: 2 + Math.random() * 2,
      color: Math.random() < 0.6 ? '#ffe6f2' : '#ffd660',
      isHeart: Math.random() < 0.4,
    });
  }
}

function updateParticles(d: LoopDeps, ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = d.particlesRef.current.length - 1; i >= 0; i--) {
    const p = d.particlesRef.current[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) { d.particlesRef.current.splice(i, 1); continue; }
    drawParticle(ctx, p);
  }
  if (d.particlesRef.current.length > PARTICLE_CAP) {
    d.particlesRef.current.splice(0, d.particlesRef.current.length - PARTICLE_CAP);
  }
}

function updateWords(d: LoopDeps, ctx: CanvasRenderingContext2D, textCtx: CanvasRenderingContext2D, time: number, dt: number, fontScale: number): void {
  const widths = d.charWidthsRef.current;
  for (let i = d.wordsRef.current.length - 1; i >= 0; i--) {
    const w = d.wordsRef.current[i];

    // ── Spawn animation pass. Boss-summoned summoner/caster words play a
    //    static pulse-in; lich children lerp from the parent position to their
    //    final offset with a purple trail. While spawnAnim is active the word
    //    skips movement, collision, caster fire, and chanter emit — and is
    //    filtered out of player targeting via the typable() predicate in
    //    handleCharLive (so the player can't start typing it yet).
    let spawnScale = 1;
    if (w.spawnAnim) {
      const elapsed = time - w.spawnAnim.start;
      const dur = w.spawnAnim.duration;
      if (elapsed >= dur) {
        // Arrival beat — small purple shockwave at the final position.
        d.shockwavesRef.current.push({
          x: w.x + w.text.length * 7, y: w.y - 8,
          radius: 4, maxRadius: w.spawnAnim.sourceX !== undefined ? 36 : 54,
          color: w.kind === 'normal' ? 'rgba(180,80,220,ALPHA)' : 'rgba(255,120,220,ALPHA)',
        });
        w.spawnAnim = undefined;
      } else {
        const t = Math.max(0, Math.min(1, elapsed / dur));
        // Lich-child branch — lerp position from parent → target along ease-out.
        if (w.spawnAnim.sourceX !== undefined && w.spawnAnim.targetX !== undefined) {
          const eased = 1 - Math.pow(1 - t, 3);
          w.x = w.spawnAnim.sourceX + (w.spawnAnim.targetX - w.spawnAnim.sourceX) * eased;
          w.y = (w.spawnAnim.sourceY ?? w.y) + ((w.spawnAnim.targetY ?? w.y) - (w.spawnAnim.sourceY ?? w.y)) * eased;
          // Trailing purple rune particles behind the flying child.
          if (Math.random() < 0.34 && d.particlesRef.current.length < PARTICLE_CAP) {
            d.particlesRef.current.push({
              x: w.x + (Math.random() - 0.5) * 14,
              y: w.y + (Math.random() - 0.5) * 14,
              vx: (Math.random() - 0.5) * 0.6,
              vy: -0.2 - Math.random() * 0.5,
              life: 22, maxLife: 22, size: 2 + Math.random() * 1.2,
              color: Math.random() < 0.5 ? '#c080ff' : '#a040e0',
            });
          }
        }
        // Scale 0 → 1 with overshoot at t=0.7 (1.15×), settling to 1.0 at t=1.
        if (t < 0.7) spawnScale = (t / 0.7) * 1.15;
        else spawnScale = 1.15 - ((t - 0.7) / 0.3) * 0.15;
        // Pulsing ring around boss-summoned static spawners.
        if (w.isBossSummoned) {
          const cx = w.x + w.text.length * 7;
          const cy = w.y - 8;
          const r = 30 + Math.sin(time * 0.02) * 6 + t * 10;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = w.kind === 'caster' ? 'rgba(255,120,220,0.5)' : 'rgba(120,220,255,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    const inSpawn = !!w.spawnAnim;
    // (drawShockwave does the ALPHA->number interpolation per frame — the
    // colour string above uses the same 'ALPHA' placeholder convention.)

    // ── Grace-push drift. While Jessyka's veil is pushing this word outward,
    //    the homing-toward-player logic below is overridden with a damped
    //    linear drift along (graceVx, graceVy). Damping ~6% per frame so the
    //    push decays over ~800ms. Chanter words obey too so the visual push
    //    reads across all kinds.
    const inGracePush = w.graceUntil !== undefined && w.graceUntil > time;
    if (inGracePush && !inSpawn) {
      const gx = w.graceVx ?? 0, gy = w.graceVy ?? 0;
      w.x += gx * dt;
      w.y += gy * dt;
      const decay = Math.pow(0.94, dt);
      w.graceVx = gx * decay;
      w.graceVy = gy * decay;
      // Clamp to arena so fast-pushed words don't escape the playfield.
      if (w.x < 20) w.x = 20;
      if (w.x > DESIGN_W - 20 - w.text.length * 14) w.x = DESIGN_W - 20 - w.text.length * 14;
      if (w.y < 20) w.y = 20;
      if (w.y > DESIGN_H - 40) w.y = DESIGN_H - 40;
    } else if (inGracePush === false && w.graceUntil !== undefined && w.graceUntil <= time) {
      // Grace expired — clear the fields so other code (e.g. chanter movement
      // suppression below) doesn't see stale values.
      w.graceUntil = undefined;
      w.graceVx = undefined;
      w.graceVy = undefined;
    }

    // Movement. Suppressed during spawn animations AND while the grace push
    // is active — position is authoritative in both cases.
    if (!inSpawn && !inGracePush && w.kind !== 'chanter' && w.speed > 0) {
      const dx = PLAYER.x - w.x, dy = PLAYER.y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.001) {
        const v = (w.speed * 2 * dt) / dist;
        w.x += dx * v; w.y += dy * v;
      }
    }

    // Caster: fire projectiles on cooldown. Fires a char that's visibly muzzle-
    // flashed at the caster's location so the player sees where it came from.
    if (!inSpawn && w.kind === 'caster') {
      w.fireCooldown -= dt / 60;
      if (w.fireCooldown <= 0) {
        w.fireCooldown = 2.4 + Math.random() * 0.8;
        const spawnX = w.x + 40, spawnY = w.y + 10;
        d.projectilesRef.current.push({
          id: nextProjectileId(),
          x: spawnX, y: spawnY,
          vx: (PLAYER.x - spawnX) * 0.004,
          vy: 1.5 + Math.random() * 0.6,   // slowed from 2.2+0.8*rand so digits are readable
          char: PROJECTILE_DIGITS[Math.floor(Math.random() * PROJECTILE_DIGITS.length)],
          fromBoss: false, life: 280,
          trail: [],
        });
        // Muzzle flash — a burst of magenta sparks at the caster.
        for (let k = 0; k < 12; k++) {
          if (d.particlesRef.current.length >= PARTICLE_CAP) break;
          const ang = Math.random() * Math.PI * 2;
          const spd = 2 + Math.random() * 4;
          d.particlesRef.current.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            life: 18, maxLife: 18, size: 2 + Math.random() * 2,
            color: Math.random() < 0.5 ? '#ff80ff' : '#ffaaff',
          });
        }
      }
    }

    // Summoner (chanter kind): stationary at top; periodically spawns a small
    // minion echo that homes toward the player. Killing the summoner stops spawns.
    if (!inSpawn && w.kind === 'chanter') {
      w.fireCooldown -= dt / 60;
      if (w.fireCooldown <= 0) {
        w.fireCooldown = 4.0 + Math.random() * 1.2;
        // Only spawn if there's a free first-letter to pick.
        const used = new Set(d.wordsRef.current.map(ww => ww.text[0]));
        const candidates = GOTHIC_WORDS.filter(x => x.length >= 3 && x.length <= 5 && !used.has(x[0]));
        if (candidates.length > 0) {
          const minionText = candidates[Math.floor(Math.random() * candidates.length)];
          d.wordsRef.current.push({
            id: nextWordId(),
            text: minionText, x: w.x + 20, y: w.y + 30,
            speed: 0.32, typed: '', kind: 'normal', isSpecial: false,
            hp: 1, fireCooldown: 0, ghostPhase: 0, scrambled: false,
            stationaryX: 0, spawnTime: time,
            // Marked as boss-attack so the contact check in the boss phase
            // actually damages the player. Without this flag the minion would
            // reach the player and silently stack — fixed in 0.2.9.
            isBossAttack: d.phaseRef.current === 'boss',
          });
        }
      }
    }

    // Visual width.
    let wordW = 0;
    for (let k = 0; k < w.text.length; k++) wordW += (widths[w.text[k]] ?? 14) * fontScale;

    // Apply a scale transform around the word's visual center during spawn
    // animation. All subsequent aura/frame/text draws inherit this transform.
    const applySpawnTransform = spawnScale !== 1;
    const sCx = w.x + wordW / 2, sCy = w.y - 8;
    if (applySpawnTransform) {
      ctx.save();
      ctx.translate(sCx, sCy);
      ctx.scale(spawnScale, spawnScale);
      ctx.translate(-sCx, -sCy);
      textCtx.save();
      textCtx.translate(sCx, sCy);
      textCtx.scale(spawnScale, spawnScale);
      textCtx.translate(-sCx, -sCy);
      // Fade glyphs during spawn — starts transparent, settles to 1.
      textCtx.globalAlpha = spawnScale / 1.15;
    }

    // Aura on main canvas (action layer).
    drawWordAura(ctx, w, wordW, time, ENEMY_KINDS[w.kind].auraColor);

    // Boss-phrase gothic frame: clearly marks the word tied to the boss HP bar.
    // Just an outline + corner brackets + label — no rectangular fill (which
    // created an ugly opaque box in an earlier revision).
    if (w.isBossPhrase && d.bossRef.current) {
      const color = d.bossRef.current.def.themeColor;
      const padX = 20, padY = 16;
      const fx = w.x - padX, fy = w.y - 28 - padY;
      const fw = wordW + padX * 2, fh = 30 + padY * 2;
      const pulse = 0.55 + Math.sin(time * 0.004) * 0.25;
      ctx.save();
      // Thin pulsing outline with a glowy shadow — no fill, no composite tricks.
      ctx.shadowBlur = 18 * pulse;
      ctx.shadowColor = color;
      ctx.strokeStyle = hexA(color, 0.7 + pulse * 0.2);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(fx, fy, fw, fh);
      ctx.stroke();
      // Gothic corner brackets — short heavier strokes at each corner.
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.2;
      const cLen = 12;
      const corners: [number, number][] = [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]];
      for (const [cx2, cy2] of corners) {
        const sx = cx2 === fx ? 1 : -1;
        const sy = cy2 === fy ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx2, cy2 + sy * cLen);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(cx2 + sx * cLen, cy2);
        ctx.stroke();
      }
      // Central banner label above the frame.
      ctx.fillStyle = hexA(color, 0.8);
      ctx.font = 'bold 10px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillText('◈ BOSS PHRASE ◈', fx + fw / 2, fy - 8);
      ctx.restore();
    }

    // Glyphs on text canvas (front layer).
    drawWordText(textCtx, w, widths, time, fontScale);

    // Boss-minion sprite overlay — floating above summoner/caster words the
    // boss has conjured. A scaled version of the boss silhouette tinted with
    // the theme colour, anchored to the word's center-top.
    if (w.isBossSummoned && d.bossRef.current) {
      const def = d.bossRef.current.def;
      const sx = w.x + wordW / 2;
      const sy = w.y - 22;       // slightly above the word — "hovers over"
      drawBossMinionSprite(ctx, def.silhouette, def.themeColor, sx, sy, 0.22, time);
    }

    if (applySpawnTransform) {
      textCtx.globalAlpha = 1;
      textCtx.restore();
      ctx.restore();
    }

    // Contact with player — in zone phase for non-chanter enemies, OR during
    // boss fights for boss-attack word-projectiles. Suppressed during spawn
    // anim so summoner/caster can't damage before they're typable.
    const canHitPlayer = !inSpawn && (
      (d.phaseRef.current === 'zone' && w.kind !== 'chanter')
      || (d.phaseRef.current === 'boss' && w.isBossAttack)
    );
    if (canHitPlayer) {
      const dx = PLAYER.x - w.x, dy = PLAYER.y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < HIT_RADIUS) {
        d.wordsRef.current.splice(i, 1);
        if (d.activeWordRef.current !== null) {
          if (d.activeWordRef.current === i) d.activeWordRef.current = null;
          else if (d.activeWordRef.current > i) d.activeWordRef.current -= 1;
        }
        // If Jessyka was targeting this word, release her target.
        const j = d.jessykaRef.current;
        if (j && j.targetId === w.id) {
          j.targetId = null;
          j.lettersFired = 0;
        }
        // 0.3.1 — munchies no longer apply ZOOTED on contact. ZOOTED is
        // purely timer-based (tickZooted in the boss loop). A munchie
        // contact just deals regular HP damage like any other boss attack
        // word — avoiding them is still valuable.
        const baseDmg = w.isBossAttack
          ? Math.ceil(1.5 + w.text.length * 0.2)       // word-projectile: punchy
          : (() => {
              const zone = ZONES[d.zoneIdxRef.current];
              const diff = Math.min(d.zoneElapsedRef.current / zone.duration, 1) * 5;
              return Math.ceil(1.5 + diff * 0.4 + w.text.length * 0.1);
            })();
        if (!isInvulnerable(d, time)) {
          applyDamageToPlayer(d, baseDmg, time);
        } else {
          d.statsRef.current.dodgesSuccessful += 1;
          d.damageTextsRef.current.push({
            x: PLAYER.x, y: PLAYER.y - 40,
            value: 'DODGE', life: 50, maxLife: 50, color: '#90f0ff',
          });
        }
      }
    }
  }
}

/** Boss intro cutscene overlay — renders the boss name, title, and lore text
 * over the scene while the silhouette fades in. Fades out toward the end of
 * the intro so the fight transition is smooth.
 */
function drawBossIntroOverlay(d: LoopDeps, textCtx: CanvasRenderingContext2D, time: number): void {
  const b = d.bossRef.current;
  if (!b || b.introStart <= 0) return;
  const elapsed = time - b.introStart;
  const total = BOSS_INTRO_MS;
  if (elapsed >= total) return;

  // Timeline: 0-800 blur-in title, 800-2600 hold, 2600-3800 lore visible, 3800-4500 fade.
  const t = elapsed / total;
  let alpha = 1;
  if (elapsed < 600) alpha = elapsed / 600;
  else if (elapsed > total - 700) alpha = (total - elapsed) / 700;
  alpha = Math.max(0, Math.min(1, alpha));

  const color = b.def.themeColor;

  textCtx.save();
  textCtx.textAlign = 'center';
  textCtx.globalAlpha = alpha * 0.18;
  textCtx.fillStyle = '#000';
  textCtx.fillRect(0, 220, DESIGN_W, 180);
  textCtx.restore();

  // ── TITLE ("Beast of the Ramparts")
  textCtx.save();
  textCtx.textAlign = 'center';
  textCtx.globalAlpha = alpha;
  textCtx.font = '12px "Cinzel", serif';
  textCtx.fillStyle = hexA(color, 0.75);
  const letterSpacing = 0.3 + t * 0.2;
  drawSpacedText(textCtx, b.def.title.toUpperCase(), DESIGN_W / 2, 250, letterSpacing);
  textCtx.restore();

  // ── NAME ("TAURUS DEMON") — big, letter-spaced, glowing
  textCtx.save();
  textCtx.textAlign = 'center';
  textCtx.globalAlpha = alpha;
  // Animate letter-spacing from tight → wide as the intro progresses
  const nameSpacing = 0.05 + Math.min(1, elapsed / 1500) * 0.22;
  textCtx.font = 'bold 52px "Cinzel", serif';
  textCtx.shadowBlur = 32;
  textCtx.shadowColor = color;
  textCtx.fillStyle = color;
  drawSpacedText(textCtx, b.def.name, DESIGN_W / 2, 308, nameSpacing);
  textCtx.restore();

  // ── LORE (italic, appears after a delay)
  if (elapsed > 1000) {
    const loreAlpha = Math.min(1, (elapsed - 1000) / 700) * alpha;
    textCtx.save();
    textCtx.textAlign = 'center';
    textCtx.globalAlpha = loreAlpha;
    textCtx.font = 'italic 18px "EB Garamond", serif';
    textCtx.fillStyle = 'rgba(230, 210, 180, 0.9)';
    textCtx.shadowBlur = 6;
    textCtx.shadowColor = 'rgba(0,0,0,0.8)';
    textCtx.fillText(b.def.introLore, DESIGN_W / 2, 360);
    textCtx.restore();
  }

  // ── Sigil divider under the name
  textCtx.save();
  textCtx.globalAlpha = alpha * 0.7;
  textCtx.strokeStyle = hexA(color, 0.8);
  textCtx.lineWidth = 1;
  const dividerY = 326;
  const dividerHalfW = 120 + Math.min(60, elapsed / 40);
  textCtx.beginPath();
  textCtx.moveTo(DESIGN_W / 2 - dividerHalfW, dividerY);
  textCtx.lineTo(DESIGN_W / 2 + dividerHalfW, dividerY);
  textCtx.stroke();
  textCtx.fillStyle = hexA(color, 1);
  textCtx.beginPath(); textCtx.arc(DESIGN_W / 2 - dividerHalfW, dividerY, 2, 0, Math.PI * 2); textCtx.fill();
  textCtx.beginPath(); textCtx.arc(DESIGN_W / 2 + dividerHalfW, dividerY, 2, 0, Math.PI * 2); textCtx.fill();
  textCtx.restore();
}

/** Draw a string with manual letter-spacing (used for the intro title/name). */
function drawSpacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, tracking: number): void {
  const fontSize = parseInt(ctx.font, 10) || 20;
  const spacePx = fontSize * tracking;
  // Measure total width including spacing, then start left of center.
  let totalW = 0;
  const widths: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const w = ctx.measureText(text[i]).width;
    widths.push(w);
    totalW += w + (i < text.length - 1 ? spacePx : 0);
  }
  let x = cx - totalW / 2;
  for (let i = 0; i < text.length; i++) {
    ctx.textAlign = 'left';
    ctx.fillText(text[i], x, cy);
    x += widths[i] + spacePx;
  }
  ctx.textAlign = 'center';  // restore
}

function drawDamageTexts(d: LoopDeps, textCtx: CanvasRenderingContext2D, dt: number): void {
  if (d.damageTextsRef.current.length === 0) return;
  textCtx.save();
  textCtx.textAlign = 'center';
  for (let i = d.damageTextsRef.current.length - 1; i >= 0; i--) {
    const dmg = d.damageTextsRef.current[i];
    dmg.y -= (dmg.big ? 0.7 : 1.2) * dt;
    dmg.life -= dt;
    if (dmg.life <= 0) { d.damageTextsRef.current.splice(i, 1); continue; }
    const alpha = Math.min(1, dmg.life / (dmg.big ? 60 : 30));
    textCtx.fillStyle = dmg.color;
    textCtx.globalAlpha = alpha;
    if (dmg.big) {
      textCtx.font = 'bold 44px "Cinzel", serif';
      textCtx.shadowBlur = 24;
    } else {
      textCtx.font = 'bold 28px "Cinzel", serif';
      textCtx.shadowBlur = 14;
    }
    textCtx.shadowColor = dmg.color;
    textCtx.fillText(dmg.value, dmg.x, dmg.y);
  }
  textCtx.globalAlpha = 1;
  textCtx.restore();
}

/** Returns true if the player should be unharmed by any incoming damage.
 *  Combines dodge/hit i-frames with the new estus post-chug godmode window.
 *  The godmode branch is only live when the chug has actually ended — during
 *  the sip itself, the player remains vulnerable. */
function isInvulnerable(d: LoopDeps, time: number): boolean {
  if (time < d.iFramesUntilRef.current) return true;
  const chugDone = time >= d.estusActiveUntilRef.current;
  if (chugDone && time < d.estusGodmodeUntilRef.current) return true;
  return false;
}

/** Jessyka grace veil — the full "wall of love" defensive burst. Fires in
 *  two contexts:
 *    1. `isInitial=true` — the free welcome veil, cast once automatically
 *       when she spawns in and transitions spawning → active. Does NOT
 *       consume the stored veil (graceUsed stays false).
 *    2. `isInitial=false` — the stored veil, consumed at most once per
 *       spawn when incoming damage is about to land. Flips graceUsed to
 *       true so it can't fire twice per companion.
 *
 *  Either way: cancels any pending hit, pushes all hostile words outward
 *  from the player, deflects in-flight projectiles, grants brief post-
 *  explosion i-frames, plays a heartwarming chord. Returns true if the
 *  veil actually fired (caller of the damage-path variant should then
 *  skip the normal damage application).
 */
function fireJessykaVeil(d: LoopDeps, time: number, isInitial: boolean): boolean {
  const j = d.jessykaRef.current;
  if (!j) return false;
  if (!isInitial) {
    // Damage-path variant — gate on active state + unspent grace.
    if (j.state !== 'active' || j.graceUsed) return false;
    j.graceUsed = true;
  }
  // Initial variant: no gating. Fires unconditionally for a fresh companion.

  // 1.4 s of i-frames after the shield — the extra 200ms beyond 0.2.8 keeps
  // the player safe while the veil is still visibly expanding.
  d.iFramesUntilRef.current = Math.max(d.iFramesUntilRef.current, time + 1400);

  // ── Audio: layered chord. Primary grace chord fires now; a second shimmer
  //    layer fires at 220ms to match the outer ring reaching the arena edges.
  sfxJessykaGrace();
  window.setTimeout(() => {
    sfxJessykaKissImpact();
    sfxJessykaKissImpact();
  }, 220);
  window.setTimeout(() => sfxJessykaSummon(), 460);

  // ── Visual: FIVE expanding rings at staggered sizes. Each draws over a
  //    different lifespan (smaller maxRadius fades faster), giving a layered
  //    "wave of love rippling outward" rather than a single flat circle.
  const cx = PLAYER.x, cy = PLAYER.y - 20;
  const ringSpecs: {delay: number; maxRadius: number; color: string}[] = [
    {delay: 0,    maxRadius: 160,           color: 'rgba(255, 245, 252, ALPHA)'},  // inner white flare
    {delay: 60,   maxRadius: 340,           color: 'rgba(255, 210, 236, ALPHA)'},  // bright pink
    {delay: 140,  maxRadius: DESIGN_W * 0.55, color: 'rgba(255, 120, 205, ALPHA)'}, // main pink
    {delay: 240,  maxRadius: DESIGN_W * 0.8,  color: 'rgba(255, 150, 220, ALPHA)'}, // outer magenta
    {delay: 360,  maxRadius: DESIGN_W * 1.0,  color: 'rgba(255, 190, 235, ALPHA)'}, // full-arena haze halo
  ];
  for (const spec of ringSpecs) {
    const push = () => {
      d.shockwavesRef.current.push({
        x: cx, y: cy,
        radius: 4, maxRadius: spec.maxRadius,
        color: spec.color,
      });
    };
    if (spec.delay === 0) push();
    else window.setTimeout(push, spec.delay);
  }

  // ── Particles — 320+ across four layers.
  // Layer 1: dense fast radial burst (180 hearts/petals).
  for (let i = 0; i < 180; i++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = (i / 180) * Math.PI * 2 + Math.random() * 0.1;
    const spd = 5 + Math.random() * 11;
    d.particlesRef.current.push({
      x: cx + Math.cos(ang) * 16,
      y: cy + Math.sin(ang) * 16,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 1.5,
      life: 52, maxLife: 52, size: 3 + Math.random() * 2.5,
      color: i % 4 === 0 ? '#ffe0ee' : (i % 4 === 1 ? '#ff9dd0' : (i % 4 === 2 ? '#ff4d9e' : '#ffd6ec')),
      isHeart: Math.random() < 0.55,
    });
  }
  // Layer 2: slow drifting petals lingering ~3 s afterward.
  for (let i = 0; i < 60; i++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.6 + Math.random() * 2.2;
    d.particlesRef.current.push({
      x: cx + (Math.random() - 0.5) * 70,
      y: cy + (Math.random() - 0.5) * 45,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 0.4,
      life: 160, maxLife: 160, size: 2.5 + Math.random() * 1.8,
      color: Math.random() < 0.5 ? '#ffe0ee' : '#ffb0d4',
      isHeart: Math.random() < 0.5,
    });
  }
  // Layer 3: overhead cream-angelic flecks drifting up (the "veil" imagery).
  for (let i = 0; i < 50; i++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const spd = 2 + Math.random() * 3.5;
    d.particlesRef.current.push({
      x: cx + (Math.random() - 0.5) * 100,
      y: cy - 40,
      vx: Math.cos(ang) * spd * 0.4,
      vy: Math.sin(ang) * spd,
      life: 84, maxLife: 84, size: 2 + Math.random() * 1.8,
      color: Math.random() < 0.55 ? '#fff5e0' : '#ffe0c0',
    });
  }
  // Layer 4: large "heart rune" burst — giant pink hearts lazy-floating up.
  for (let i = 0; i < 30; i++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
    const spd = 1 + Math.random() * 2;
    d.particlesRef.current.push({
      x: cx + (Math.random() - 0.5) * 160,
      y: cy + (Math.random() - 0.5) * 30,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 180, maxLife: 180, size: 5 + Math.random() * 3,
      color: Math.random() < 0.5 ? '#ff7fbf' : '#ff4da0',
      isHeart: true,
    });
  }
  // Delayed secondary burst at 400ms — matches the 3rd ring peaking, 60 more
  // fast sparks emanate from the player position for a second "pulse" feel.
  window.setTimeout(() => {
    for (let i = 0; i < 60; i++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 7;
      d.particlesRef.current.push({
        x: cx + (Math.random() - 0.5) * 30,
        y: cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.8,
        life: 42, maxLife: 42, size: 2.5 + Math.random() * 2,
        color: '#ffc0e0',
        isHeart: Math.random() < 0.4,
      });
    }
  }, 380);

  // ── Screen flash (heart-pink), wider + longer than 0.2.8.
  d.hitFlashUntilRef.current = Math.max(d.hitFlashUntilRef.current, time + 520);
  if (d.screenFlashRef.current) {
    d.screenFlashRef.current.style.background =
      'radial-gradient(ellipse at 50% 75%, rgba(255,150,210,0.95) 0%, rgba(255,80,180,0.55) 45%, rgba(0,0,0,0) 85%)';
    window.setTimeout(() => {
      if (d.screenFlashRef.current) {
        d.screenFlashRef.current.style.background =
          'radial-gradient(ellipse at 50% 90%, rgba(220,20,20,0.75) 0%, rgba(120,0,0,0.4) 40%, rgba(0,0,0,0) 80%)';
      }
    }, 900);
  }

  // ── Push EVERY word present on screen outward from the player, synced with
  //    the veil's expanding motion. Instead of an instant teleport-style
  //    reposition, each word receives a (graceVx, graceVy) velocity and a
  //    graceUntil timestamp — the updateWords loop then drifts them outward
  //    with damping over ~800ms, so they visibly ride the wave. Even Jessyka's
  //    own target is released (she'll pick a new one) so nothing is missed.
  //    The boss phrase is the ONLY exclusion — its centered frame would look
  //    broken off-axis, and preserving phrase typing progress is important.
  const CLOSE_DIST = 24;
  let ejectAngle = 0;
  // Release Jessyka's current target so the word it's on isn't exempt from
  // the push — she'll re-pick after grace expires anyway.
  if (j.targetId !== null) {
    const targetIdx = d.wordsRef.current.findIndex(w => w.id === j.targetId);
    if (targetIdx !== -1) d.wordsRef.current[targetIdx].jessykaTarget = false;
    j.targetId = null;
    j.lettersFired = 0;
  }
  for (const w of d.wordsRef.current) {
    // Skip only the boss phrase (central frame stays legible) and any word
    // still playing its spawn-in animation.
    if (w.isBossPhrase || w.spawnAnim) continue;
    const dx = w.x - PLAYER.x, dy = w.y - PLAYER.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let ux: number, uy: number;
    if (dist < CLOSE_DIST) {
      const ang = ejectAngle;
      ejectAngle += Math.PI * 2 / 7;   // ~51° per stacked word — 7-point spread
      ux = Math.cos(ang);
      uy = Math.sin(ang);
    } else {
      ux = dx / dist;
      uy = dy / dist;
    }
    // Magnitude scales with threat — bossish words get the strongest kick so
    // they clearly ride the veil outward; idle zone words get a softer push.
    const isBossish = w.isBossAttack || w.isBossSummoned;
    const baseSpeed = isBossish ? 16 : 11;         // px/frame initial velocity
    const upwardBias = 5;                          // every word lifts a little
    w.graceVx = ux * baseSpeed;
    w.graceVy = uy * baseSpeed - upwardBias;
    w.graceUntil = time + 900;                     // ~14 frames of active drift then decay ends
  }

  // ── Projectiles: EVERY un-deflected boss projectile gets flung back (vy
  //    reversed with a bump, vx kicked radially outward from the player).
  //    Marked deflected so they pass through harmlessly. Leave them on-screen
  //    so the player SEES them ride the veil rather than vanish instantly.
  for (const p of d.projectilesRef.current) {
    if (!p.fromBoss || p.deflected) continue;
    p.deflected = true;
    const dxp = p.x - PLAYER.x;
    const absVy = Math.abs(p.vy);
    // Reverse vertical travel and give it a firm push upward.
    p.vy = -Math.max(absVy * 1.4, 2.4);
    // Horizontal kick outward (sign of dx) so projectiles fan away.
    p.vx += Math.sign(dxp || 1) * (2.5 + Math.random() * 1.5);
    // Spiral projectiles — cancel their spiral so they just fly off.
    p.spiralAngVel = 0;
    p.spiralRadVel = 0;
    // Pink trail sparks at the projectile's position so the reversal reads.
    for (let k = 0; k < 5; k++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      d.particlesRef.current.push({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 - 1,
        life: 22, maxLife: 22, size: 2,
        color: '#ffb0d4',
      });
    }
    d.statsRef.current.projectilesDeflected += 1;
  }

  // ── Announcement + damage-text popup.
  d.bossAnnouncementRef.current = {text: "JESSYKA'S GRACE", life: 180, color: '#ff9ecc'};
  d.damageTextsRef.current.push({
    x: PLAYER.x, y: PLAYER.y - 60,
    value: 'VEILED', life: 90, maxLife: 90, color: '#ffb0d4',
  });

  // ── Screen-shake beat. Bigger and longer than 0.2.8 for dramatic weight —
  //    we're simulating a wall of love displacing the whole battlefield.
  const s = getSettings();
  if (!s.reduceMotion) {
    d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 9);
    d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 420);
  }

  return true;
}

/** Thin wrapper kept for the damage-path call site in applyDamageToPlayer.
 *  Equivalent to fireJessykaVeil(d, time, false). Named after the original
 *  0.2.8 API so the damage integration reads naturally. */
function tryJessykaGraceShield(d: LoopDeps, time: number): boolean {
  return fireJessykaVeil(d, time, false);
}

/** AfroMan — advance the ZOOTED timer. Increments one stack every
 *  ZOOTED_TICK_INTERVAL_SEC seconds of fight time, capped at ZOOTED_CAP.
 *  Stacks are permanent in 0.3.1+ — the only way out of ZOOTED is ending
 *  the fight (defeat or death).
 *
 *  `d.zootedDecayAtRef` is kept as the ref name for schema stability; its
 *  semantics here are "performance.now() of the next ZOOTED tick". */
function tickZooted(d: LoopDeps, time: number): void {
  if (d.zootedStacksRef.current >= ZOOTED_CAP) return;
  // On first tick after the fight starts, seed the deadline.
  if (d.zootedDecayAtRef.current === 0) {
    d.zootedDecayAtRef.current = time + ZOOTED_TICK_INTERVAL_SEC * 1000;
    return;
  }
  if (time < d.zootedDecayAtRef.current) return;
  const next = Math.min(ZOOTED_CAP, d.zootedStacksRef.current + 1);
  d.zootedStacksRef.current = next;
  d.zootedDecayAtRef.current = next >= ZOOTED_CAP
    ? 0                                                 // halt — capped
    : time + ZOOTED_TICK_INTERVAL_SEC * 1000;
  d.setZootedLevel(next as 0 | 1 | 2 | 3);
  d.damageTextsRef.current.push({
    x: PLAYER.x, y: PLAYER.y - 60,
    value: 'ZOOTED x' + next, life: 80, maxLife: 80,
    color: '#9be69e',
  });
  d.bossAnnouncementRef.current = {text: 'ZOOTED', life: 100, color: '#9be69e'};
}

/** AfroMan — gold parry ring around the player that breathes with each beat.
 *  Intensity decays linearly between beats so it always reads as "alive" to
 *  the rhythm. Only rendered during an active AfroMan boss fight. */
function drawBeatPulseRing(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number, dt: number): void {
  const b = d.bossRef.current;
  if (!b || b.def.id !== 'afroman' || b.defeated) return;
  // Bump pulse on each new beat.
  const lastBeat = d.lastBeatNowRef.current;
  if (lastBeat > 0 && time - lastBeat < 200) {
    d.beatPulseRef.current = 1;
  } else {
    d.beatPulseRef.current = Math.max(0, d.beatPulseRef.current - 0.025 * dt);
  }
  const intensity = d.beatPulseRef.current;
  if (intensity <= 0.02) return;
  const px = PLAYER.x, py = PLAYER.y;
  const baseR = 54;
  const r = baseR + (1 - intensity) * 24;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 220, 130, ' + (intensity * 0.7).toFixed(3) + ')';
  ctx.lineWidth = 2 + intensity * 2.5;
  ctx.beginPath();
  ctx.arc(px, py - 10, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 160, 220, ' + (intensity * 0.4).toFixed(3) + ')';
  ctx.lineWidth = 1 + intensity * 1.5;
  ctx.beginPath();
  ctx.arc(px, py - 10, r + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function applyDamageToPlayer(d: LoopDeps, dmg: number, time: number): void {
  // Jessyka grace shield — once per spawn she can veil the player in her
  // grace, cancelling this incoming hit and pushing everything hostile away.
  // Returns true if grace was spent; the caller's damage numbers are dropped.
  if (tryJessykaGraceShield(d, time)) return;

  d.healthRef.current = Math.max(0, d.healthRef.current - dmg);
  d.statsRef.current.damageTaken += dmg;
  if (dmg > d.statsRef.current.biggestHit) d.statsRef.current.biggestHit = dmg;

  const s = getSettings();
  const shakeMag = 8 + Math.min(dmg, 10);
  if (!s.reduceMotion) {
    d.shakeMagRef.current = Math.max(d.shakeMagRef.current, shakeMag);
    d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 260);
  }
  d.hitFlashUntilRef.current = time + 320;
  const img = d.playerImgRef.current;
  if (img) {
    img.style.filter = 'brightness(3.2) saturate(0) drop-shadow(0 0 24px rgba(255,60,60,0.9))';
    window.setTimeout(() => { if (d.playerImgRef.current) d.playerImgRef.current.style.filter = ''; }, 140);
  }
  d.damageTextsRef.current.push({x: PLAYER.x + (Math.random() - 0.5) * 20, y: PLAYER.y - 40, value: '-' + dmg, life: 55, maxLife: 55, color: '#ff4040'});
  d.shockwavesRef.current.push({x: PLAYER.x, y: PLAYER.y - 8, radius: 6, maxRadius: 120, color: 'rgba(255,40,40,ALPHA)'});
  const burstCount = 28 + dmg * 5;
  for (let j = 0; j < burstCount; j++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 7;
    d.particlesRef.current.push({
      x: PLAYER.x, y: PLAYER.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2,
      life: 28, maxLife: 28, size: 3 + Math.random() * 2,
      color: Math.random() < 0.2 ? '#ff3030' : '#9b0000',
    });
  }
  sfxPlayerHit();
  // Combo break.
  if (d.comboRef.current > 5) sfxComboBreak();
  d.comboRef.current = 0;
  if (d.healthRef.current === 0) {
    // AfroMan flavour — "PARTY FOUL" cue before the YOU DIED reveal.
    if (d.bossRef.current?.def.id === 'afroman' && !d.bossRef.current.defeated) {
      d.bossAnnouncementRef.current = {text: 'PARTY FOUL', life: 180, color: '#ff9dd6'};
    }
    d.triggerDeath();
  }
}

function updateHitFlash(d: LoopDeps, time: number, reduceMotion: boolean): void {
  if (!d.screenFlashRef.current) return;
  if (reduceMotion) { d.screenFlashRef.current.style.opacity = '0'; return; }
  if (time < d.hitFlashUntilRef.current) {
    const remaining = d.hitFlashUntilRef.current - time;
    const t = Math.min(1, remaining / 320);
    d.screenFlashRef.current.style.opacity = (t * t * 0.85).toFixed(3);
  } else if (d.screenFlashRef.current.style.opacity !== '0') {
    d.screenFlashRef.current.style.opacity = '0';
  }
}

/** Ensure the player sprite's `.is-estus-godmode` class mirrors the actual
 *  godmode ref window each frame. The original implementation toggled the
 *  class from the chug-end setTimeout, which could drift; by polling the ref
 *  directly, the golden pulse visual is always in lockstep with the real
 *  invulnerability window, even across pause/resume or tab-throttling. */
function updateEstusGodmodeVisual(d: LoopDeps, time: number): void {
  const img = d.playerImgRef.current;
  if (!img) return;
  const chugDone = time >= d.estusActiveUntilRef.current;
  const windowActive = chugDone && time < d.estusGodmodeUntilRef.current;
  const hasClass = img.classList.contains('is-estus-godmode');
  if (windowActive && !hasClass) {
    img.classList.add('is-estus-godmode');
  } else if (!windowActive && hasClass) {
    img.classList.remove('is-estus-godmode');
  }
}

function pushHudStats(d: LoopDeps): void {
  const zone = ZONES[d.zoneIdxRef.current];
  const accuracy = d.totalKeyRef.current > 0
    ? Math.round((d.correctKeyRef.current / d.totalKeyRef.current) * 100) : 100;
  const diff = d.phaseRef.current === 'zone'
    ? Math.round(Math.min(d.zoneElapsedRef.current / zone.duration, 1) * 10)
    : 10;
  const zoneTimeLeft = d.phaseRef.current === 'zone'
    ? Math.max(0, zone.duration - d.zoneElapsedRef.current)
    : 0;
  d.setHudStats({
    score: d.scoreRef.current,
    health: d.healthRef.current,
    maxHealth: MAX_HEALTH,
    combo: d.comboRef.current,
    maxCombo: d.maxComboRef.current,
    difficulty: diff,
    accuracy,
    isBlessed: d.isBlessedRef.current,
    currentRank: rankForCombo(d.comboRef.current),
    estusCharges: d.estusChargesRef.current,
    estusMax: MAX_ESTUS,
    estusActive: performance.now() < d.estusActiveUntilRef.current,
    stamina: d.staminaRef.current,
    maxStamina: MAX_STAMINA,
    zoneName: zone.name,
    zoneSubtitle: zone.subtitle,
    zoneTimeLeft,
    zoneDuration: zone.duration,
    bossActive: d.phaseRef.current === 'boss',
    // Upcoming boss name for the zone (null on the no-boss Firelink intro).
    // Rendered in the HUD as part of the boss-approach countdown so the
    // player always knows who — and when — they're about to fight.
    upcomingBossName: zone.bossId ? (BOSSES[zone.bossId]?.name ?? null) : null,
    jessykaSummonAvailable: (() => {
      // 0.3.1 — available in both zones and boss fights. The gates are
      // phase-dependent: in boss we still need the fight to be "live" (not
      // intro, not defeated); in zones any active zone frame qualifies.
      if (d.estusChargesRef.current < 1 || d.jessykaRef.current !== null) return false;
      const phase = d.phaseRef.current;
      if (phase === 'zone') return true;
      if (phase === 'boss') {
        const b = d.bossRef.current;
        return b !== null && !b.defeated && b.currentHp > 0 && b.introStart === 0;
      }
      return false;
    })(),
  });
}

// ─────────────────────────────────────────────────────────────
// handleChar — routes a typed letter to projectiles + active word.
// Called by the global keydown listener via handleCharImpl.
// ─────────────────────────────────────────────────────────────

/** Boss-fight Q-binding — consume 1 estus to summon Jessyka in projectile-
 *  chase mode for ~15 seconds. Returns true when the Q keystroke was
 *  consumed (either a summon succeeded, or a precondition-failure message
 *  flashed). Returns false only if no boss is active. */
function trySummonEstusJessyka(d: LoopDeps, now: number): boolean {
  // 0.3.1 — Q-summon works in both zones and boss fights. Semantics:
  //   - boss fight: she chases boss projectiles (original 0.2.6 behaviour)
  //   - zone:       she auto-targets falling words the player isn't typing yet
  // The summonSource is still 'estus' in both cases — updateJessyka inspects
  // phaseRef to decide which sub-behaviour to run.
  const phase = d.phaseRef.current;
  if (phase !== 'zone' && phase !== 'boss') return false;
  // In boss fights the usual intro/defeat guards still apply — you can't burn
  // an estus on her while the boss is mid-intro or already dying.
  const b = d.bossRef.current;
  if (phase === 'boss') {
    if (!b || b.defeated || b.currentHp <= 0 || b.introStart > 0) return false;
  }
  // Already-here / no-estus flashes still consume the keystroke so the player
  // isn't punished for a deliberate Q press with a combo-break miss.
  if (d.jessykaRef.current !== null) {
    d.bossAnnouncementRef.current = {text: 'ALREADY HERE', life: 70};
    return true;
  }
  if (d.estusChargesRef.current < 1) {
    d.bossAnnouncementRef.current = {text: 'NO ESTUS', life: 70};
    return true;
  }
  // Consume one estus + spawn Jessyka in estus mode.
  d.estusChargesRef.current -= 1;
  d.jessykaRef.current = {
    state: 'spawning',
    spawnStart: now,
    despawnStart: 0,
    targetId: null,
    lettersFired: 0,
    nextKissAt: now + JESS_SPAWN_MS + 300,
    castingUntil: 0,
    summonSource: 'estus',
    projectileTargetId: null,
    // Kiln doubles the Q-summon duration as a final-zone buff (0.2.12) —
    // 50 s instead of 25 s on the standard bosses. The 2x multiplier matches
    // the estus godmode doubling in handleTab for consistency. Zones other
    // than Kiln get the baseline 25 s.
    autoDespawnAt: now + JESS_SPAWN_MS + JESS_ESTUS_ACTIVE_MS
      * (ZONES[d.zoneIdxRef.current]?.id === 'kiln' ? 2 : 1),
    graceUsed: false,
    spawnVeilFired: false,
  };
  d.setJessykaVisible(true);
  d.setJessykaDespawning(false);
  d.bossAnnouncementRef.current = {text: "LOVE'S EMBRACE", life: 140, color: '#ffb8d8'};
  sfxJessykaSummon();
  // Celebratory pink burst at her arrival spot.
  const ox = PLAYER.x + JESS_X_OFFSET + JESS_MOUTH_DX, oy = PLAYER.y + JESS_MOUTH_DY;
  for (let p = 0; p < 32; p++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 4;
    d.particlesRef.current.push({
      x: ox + (Math.random() - 0.5) * 40,
      y: oy + (Math.random() - 0.5) * 30,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
      life: 36, maxLife: 36, size: 2.5 + Math.random() * 1.5,
      color: Math.random() < 0.6 ? '#ff80cc' : '#ffd6ec',
      isHeart: Math.random() < 0.45,
    });
  }
  return true;
}

function handleCharLive(d: LoopDeps, rawChar: string): void {
  const phase = d.phaseRef.current;
  if (phase !== 'zone' && phase !== 'boss') return;
  if (d.pausedRef.current) return;
  const now = performance.now();
  if (now < d.estusActiveUntilRef.current) return;
  if (rawChar.length !== 1) return;
  const upper = rawChar.toUpperCase();
  const isLetter = upper >= 'A' && upper <= 'Z';
  const isDigit = upper >= '2' && upper <= '6';
  if (!isLetter && !isDigit) return;
  const char = upper;

  // ── Q-binding — estus-burn Jessyka summon. Fall-through priority preserves
  //    typing: if any word can currently accept a Q (active word's next
  //    letter is Q, or an idle word starts with Q) the keystroke routes to
  //    normal typing first. Projectiles use digits, so Q can never match one
  //    — the projectile fall-through check was dropped. Works in both zones
  //    and boss fights (0.3.1) — see trySummonEstusJessyka + updateJessyka
  //    for the per-phase targeting split.
  //    A failed summon (no estus / already here) still consumes the keystroke
  //    so the player doesn't eat a miss for pressing Q deliberately.
  if (char === 'Q') {
    const wordWantsQ = d.wordsRef.current.some(w =>
      !w.spawnAnim && !w.jessykaTarget && w.text.charAt(w.typed.length) === 'Q',
    );
    if (!wordWantsQ) {
      if (trySummonEstusJessyka(d, now)) return;
    }
  }

  d.totalKeyRef.current += 1;
  d.statsRef.current.totalLetters += 1;

  // Casting sprite swap.
  const img = d.playerImgRef.current;
  if (img) {
    d.castingUntilRef.current = now + 180;
    if (img.dataset.state !== 'casting') { img.src = '/casting2.png'; img.dataset.state = 'casting'; }
  }

  const words = d.wordsRef.current;
  let progressed = false;

  // ── Digit keystroke (1-5): projectile deflection ONLY. Never touches words.
  //    A press that doesn't match any projectile is a miss (combo reset).
  if (isDigit) {
    let deflectedCount = 0;
    let perfectParry = false;
    for (let i = d.projectilesRef.current.length - 1; i >= 0; i--) {
      const p = d.projectilesRef.current[i];
      if (p.deflected || p.char !== char) continue;
      p.deflected = true;
      // AfroMan perfect-parry detection — projectile spawned on the beat AND
      // the keystroke is within PERFECT_PARRY_WINDOW_MS of the most recent
      // detected beat. Stats + damage are handled by the fireball intercept.
      const nowBeatDelta = now - (d.lastBeatNowRef.current || 0);
      const isPerfect = p.onBeat === true && nowBeatDelta >= 0 && nowBeatDelta <= PERFECT_PARRY_WINDOW_MS;
      if (isPerfect) {
        perfectParry = true;
        d.statsRef.current.perfectParries += 1;
      }
      d.fireballsRef.current.push({
        x: PLAYER.x, y: PLAYER.y,
        tx: p.x, ty: p.y,
        progress: 0,
        isSpecial: false,
        targetBoss: false,
        chaseProjectileId: p.id,
        life: 72,
        // Perfect-parry: mark this chase fireball so its intercept applies
        // 2× bonus damage to the boss (AfroMan only). For non-AfroMan bosses
        // projectiles don't damage the boss anyway — harmless flag.
        perfectParryBonus: isPerfect || undefined,
      });
      for (let k = 0; k < (isPerfect ? 18 : 10); k++) {
        if (d.particlesRef.current.length >= PARTICLE_CAP) break;
        d.particlesRef.current.push({
          x: p.x, y: p.y,
          vx: (Math.random() - 0.5) * (isPerfect ? 6 : 4),
          vy: (Math.random() - 0.5) * (isPerfect ? 6 : 4),
          life: isPerfect ? 20 : 14, maxLife: isPerfect ? 20 : 14, size: 2.5,
          color: isPerfect ? '#ffe28a' : (p.fromBoss ? '#ffaa55' : '#ff88ff'),
        });
      }
      deflectedCount += 1;
      d.statsRef.current.projectilesDeflected += 1;
    }
    if (deflectedCount > 0) {
      sfxFireball();
      d.correctKeyRef.current += 1;
      d.statsRef.current.correctLetters += 1;
      d.comboRef.current += 1;
      progressed = true;
      if (perfectParry) {
        // "PERFECT" popup + combo bonus. Extra combo points on top of the
        // regular +1 make perfect-parry a meaningful skill expression.
        d.comboRef.current += 2;
        d.damageTextsRef.current.push({
          x: PLAYER.x, y: PLAYER.y - 80,
          value: 'PERFECT', life: 60, maxLife: 60,
          color: '#ffe28a',
        });
      }
    } else {
      registerWrong(d.statsRef.current, char);
      sfxMiss();
      d.comboRef.current = 0;
    }
  } else {
    // ── Letter keystroke (A-Z): word typing ONLY. Projectiles use digits so
    //    a letter press can never parry.
    // 0.3.10 — player typing now has PRIORITY over Jessyka. The pass order
    // is: (1) non-Jessyka words first — the common case, (2) fallback to
    // Jessyka-claimed words if nothing else matches, stealing her target
    // away so she re-picks next frame. Before this, pressing the first
    // letter of a Jessyka-claimed word triggered a miss + combo break.
    //
    // `skipSpawning` is always true — words mid-spawn-anim aren't typable
    // by anyone (Jessyka's tryPickJessykaTarget filters them out too).
    const canTypeNow = (w: Word) => !w.spawnAnim;
    /** Release a Jessyka claim on `w` if present. Called whenever the
     *  player steals a word she was targeting. Keeps her internal state
     *  consistent so she re-picks cleanly next frame, AND cancels any
     *  in-flight kisses already aimed at this word — otherwise a kiss for
     *  letter N would arrive and auto-advance `w.typed` while the player
     *  is typing it themselves, breaking their rhythm. */
    const stealFromJessyka = (w: Word) => {
      if (!w.jessykaTarget) return;
      w.jessykaTarget = false;
      const j = d.jessykaRef.current;
      if (j && j.targetId === w.id) {
        j.targetId = null;
        j.lettersFired = 0;
        // Tiny backoff so she doesn't immediately re-grab the same word
        // on the very next frame — gives the player a clear "handed over"
        // beat.
        j.nextKissAt = now + 200;
      }
      // Drop any kisses still in flight toward this word. drawKissHeart
      // won't render them anymore; no particles or arrival handlers fire.
      const kisses = d.jessykaKissesRef.current;
      for (let k = kisses.length - 1; k >= 0; k--) {
        if (kisses[k].wordId === w.id) kisses.splice(k, 1);
      }
    };

    if (d.activeWordRef.current !== null) {
      const w = words[d.activeWordRef.current];
      if (w) {
        // Skip auto-spaces.
        while (w.text[w.typed.length] === ' ') w.typed += ' ';
        if (w.text[w.typed.length] === char) {
          w.typed += char;
          d.correctKeyRef.current += 1;
          d.statsRef.current.correctLetters += 1;
          d.comboRef.current += 1;
          progressed = true;
          spawnFireball(d, w);
          if (w.typed === w.text) completeWord(d, w, d.activeWordRef.current, now);
        } else {
          // Word-switch rescue: if the keystroke doesn't match the active
          // word's next letter but IS the NEXT-expected letter of another
          // typable word (or its first letter if untouched), switch. Combo
          // still resets as a drop penalty so the rescue isn't free.
          //
          // For boss phrases we preserve `typed` — the phrase remains
          // resumable by typing its next letter later. Non-phrase active
          // words get reset on switch (existing behaviour).
          //
          // Two-phase lookup: prefer unclaimed words, fall back to
          // Jessyka-claimed ones (stealing the claim). Keeps player
          // momentum from dying because she got there first.
          const acceptsChar = (ww: Word) =>
            ww !== w && canTypeNow(ww) && ww.text.charAt(ww.typed.length) === char;
          let switchIdx = words.findIndex(ww => acceptsChar(ww) && !ww.jessykaTarget);
          if (switchIdx === -1) {
            switchIdx = words.findIndex(ww => acceptsChar(ww) && ww.jessykaTarget);
          }
          if (switchIdx !== -1) {
            if (!w.isBossPhrase) w.typed = '';     // preserve phrase progress for later resume
            const nw = words[switchIdx];
            stealFromJessyka(nw);
            // Only advance the target's typed if we're starting it fresh;
            // a half-typed word we're switching to gets its next letter.
            nw.typed = nw.typed + char;
            d.activeWordRef.current = switchIdx;
            d.correctKeyRef.current += 1;
            d.statsRef.current.correctLetters += 1;
            d.comboRef.current = 0;                 // drop penalty — combo resets, keystroke credits
            progressed = true;
            sfxWordSwitch();                        // distinct "pivot" cue
            spawnFireball(d, nw);
            if (nw.typed === nw.text) completeWord(d, nw, switchIdx, now);
          } else {
            registerWrong(d.statsRef.current, char);
            sfxMiss();
            d.comboRef.current = 0;
          }
        }
      }
    } else {
      // Match any word that can accept this char NEXT — not just fresh ones.
      // Same two-phase lookup as the switch path: prefer unclaimed, then
      // steal from Jessyka if nothing unclaimed matches.
      const acceptsChar = (w: Word) =>
        canTypeNow(w) && w.text.charAt(w.typed.length) === char;
      let idx = words.findIndex(w => acceptsChar(w) && !w.jessykaTarget);
      if (idx === -1) {
        idx = words.findIndex(w => acceptsChar(w) && w.jessykaTarget);
      }
      if (idx !== -1) {
        const w = words[idx];
        stealFromJessyka(w);
        w.typed = w.typed + char;
        d.correctKeyRef.current += 1;
        d.statsRef.current.correctLetters += 1;
        d.comboRef.current += 1;
        d.activeWordRef.current = idx;
        progressed = true;
        spawnFireball(d, w);
        if (w.typed === w.text) completeWord(d, w, idx, now);
      } else {
        registerWrong(d.statsRef.current, char);
        sfxMiss();
        d.comboRef.current = 0;
      }
    }
  }

  if (progressed) {
    sfxCast(d.comboRef.current);
    if (d.comboRef.current > d.maxComboRef.current) d.maxComboRef.current = d.comboRef.current;
    // 0.3.1 — ZOOTED no longer decays on correct keystrokes. It's purely a
    // timer-based buildup during the AfroMan fight (see tickZooted).
    // Rank up?
    let rankIdx = 0;
    for (let i = COMBO_RANKS.length - 1; i >= 0; i--) {
      if (d.comboRef.current >= COMBO_RANKS[i].count) { rankIdx = i; break; }
    }
    if (rankIdx > d.lastRankIdxRef.current) {
      d.lastRankIdxRef.current = rankIdx;
      // Defer via setTimeout to avoid setState during rAF loop.
      window.setTimeout(() => d.triggerRankUp(COMBO_RANKS[rankIdx]), 0);
    }
  }
}

function spawnFireball(d: LoopDeps, w: Word): void {
  const isBoss = d.phaseRef.current === 'boss';
  let bossDamage: number | undefined;
  // Only the phrase's completion fireball carries HP damage. Word-projectiles
  // (isBossAttack) never damage the boss — they're player-facing threats.
  if (isBoss && w.isBossPhrase && w.typed === w.text) {
    const letters = w.text.replace(/ /g, '').length;
    bossDamage = Math.max(1, Math.ceil(letters / 7));
  }
  d.fireballsRef.current.push({
    x: PLAYER.x, y: PLAYER.y,
    tx: isBoss && w.isBossPhrase ? BOSS_AIM.x : w.x,
    ty: isBoss && w.isBossPhrase ? BOSS_AIM.y : w.y,
    progress: 0,
    isSpecial: w.isSpecial,
    targetBoss: isBoss && w.isBossPhrase,
    bossDamage,
  });
  sfxFireball();
}

function completeWord(d: LoopDeps, w: Word, idx: number, now: number): void {
  // JESSYKA full heal + blessed aura.
  if (w.isSpecial) {
    for (let i = 0; i < 80; i++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 6 + 2;
      d.particlesRef.current.push({
        x: w.x, y: w.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 40, maxLife: 40, size: 3, color: '#ff80cc', isHeart: true,
      });
    }
    d.healthRef.current = MAX_HEALTH;
    d.estusChargesRef.current = MAX_ESTUS;
    d.isBlessedRef.current = true;
    if (d.blessedTimeoutRef.current !== null) window.clearTimeout(d.blessedTimeoutRef.current);
    d.blessedTimeoutRef.current = window.setTimeout(() => {
      d.isBlessedRef.current = false;
      d.blessedTimeoutRef.current = null;
      // Signal Jessyka to leave — she'll finish her current word first.
      if (d.jessykaRef.current && (d.jessykaRef.current.state === 'active' || d.jessykaRef.current.state === 'spawning')) {
        d.jessykaRef.current.state = 'leaving';
      }
    }, 10000);

    // Spawn / re-spawn the Jessyka companion. If she's already present (player
    // chained a second JESSYKA), just refresh her back to active.
    const existing = d.jessykaRef.current;
    if (!existing || existing.state === 'despawning') {
      d.jessykaRef.current = {
        state: 'spawning',
        spawnStart: now,
        despawnStart: 0,
        targetId: null,
        lettersFired: 0,
        nextKissAt: now + JESS_SPAWN_MS + 300,
        castingUntil: 0,
        summonSource: 'jessyka-word',
        projectileTargetId: null,
        autoDespawnAt: 0,
        graceUsed: false,
        spawnVeilFired: false,
      };
      d.setJessykaVisible(true);
      d.setJessykaDespawning(false);
    } else {
      existing.state = 'active';
      existing.graceUsed = false;      // chained JESSYKA refresh grants a new grace shield
      d.setJessykaDespawning(false);
    }
  }

  // Lich children on death — new in 0.2.6: parent shockwave + rune burst, then
  // children spawn at the parent's exact position and animate OUT to their
  // offset targets. Previously they silently popped in ±40px away, which made
  // players miss the connection between parent and children.
  if (w.kind === 'lich') {
    const parentX = w.x + w.text.length * 7;
    const parentY = w.y - 10;
    sfxLichSplit();
    // Parent split burst — purple shockwave.
    d.shockwavesRef.current.push({
      x: parentX, y: parentY,
      radius: 6, maxRadius: 80,
      color: 'rgba(180,80,220,ALPHA)',
    });
    // Rune-glyph radial burst — 30 purple particles fanning outward.
    for (let p = 0; p < 30; p++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      const ang = (p / 30) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 2 + Math.random() * 4;
      d.particlesRef.current.push({
        x: parentX, y: parentY,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.8,
        life: 34, maxLife: 34, size: 2.5 + Math.random() * 1.5,
        color: Math.random() < 0.55 ? '#c080ff' : '#8040d0',
      });
    }
    // Children spawn AT the parent, then lerp outward via spawnAnim.
    const used = new Set(d.wordsRef.current.map(ww => ww.text[0]));
    used.add(w.text[0]);
    for (let i = 0; i < 2; i++) {
      const candidates = GOTHIC_WORDS.filter(x => x.length >= 3 && x.length <= 5 && !used.has(x[0]));
      if (candidates.length === 0) break;
      const childText = candidates[Math.floor(Math.random() * candidates.length)];
      used.add(childText[0]);
      const dx = i === 0 ? -40 : 40;
      const targetX = w.x + dx;
      const targetY = w.y + 10;
      // Start co-located with the parent so the lerp reads as "emerging from
      // the corpse" instead of teleporting into place.
      d.wordsRef.current.push({
        id: nextWordId(),
        text: childText,
        x: w.x, y: w.y,
        speed: 0.3, typed: '', kind: 'normal', isSpecial: false,
        hp: 1, fireCooldown: 0, ghostPhase: 0, scrambled: false,
        stationaryX: 0, spawnTime: now,
        spawnAnim: {
          start: now,
          duration: 900,
          sourceX: w.x, sourceY: w.y,
          targetX, targetY,
        },
      });
    }
  }

  // Phantom (mimic kind) — bonus souls + pink celebratory burst.
  if (w.kind === 'mimic') {
    const bonusLetters = w.text.replace(/ /g, '').length;
    const bonus = Math.round(bonusLetters * 10 * 0.5);   // +50% over normal score
    d.scoreRef.current += bonus;
    d.damageTextsRef.current.push({
      x: w.x + 20, y: w.y - 20,
      value: '+' + bonus, life: 55, maxLife: 55,
      color: '#ffcaa0',
    });
    for (let i = 0; i < 30; i++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5;
      d.particlesRef.current.push({
        x: w.x + 20, y: w.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 28, maxLife: 28, size: 3,
        color: '#ffcaa0',
      });
    }
  }

  d.wordsRef.current.splice(idx, 1);
  d.activeWordRef.current = null;
  // Score: length × 10, × 3 for phrases (longer words feel like phrases).
  const score = w.text.replace(/ /g, '').length * (d.phaseRef.current === 'boss' ? 30 : 10);
  d.scoreRef.current += score;
  d.statsRef.current.wordsKilled += 1;
  if (w.text.length > d.statsRef.current.longestWord.length) d.statsRef.current.longestWord = w.text;
  d.comboRef.current += 5;
  sfxShatter();

  // Schedule the next phrase if this was a boss phrase.
  if (d.phaseRef.current === 'boss' && d.bossRef.current && !d.bossRef.current.defeated) {
    const b = d.bossRef.current;
    const phase = b.def.phases[b.phaseIdx];
    b.nextPhraseAt = performance.now() + phase.phraseSpawnCooldown * 1000;
  }
}

// ─────────────────────────────────────────────────────────────
// Render tree — built separately from the component body to keep each concern
// focused. Takes a big props bag, returns the JSX.
// ─────────────────────────────────────────────────────────────

type RenderProps = {
  phase: Phase;
  paused: boolean;
  scale: number;
  settings: ReturnType<typeof useSettings>[0];
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showSecretAsk: boolean;
  setShowSecretAsk: (v: boolean) => void;
  showDevPanel: boolean;
  setShowDevPanel: (v: boolean) => void;
  yesChecked: boolean;
  setYesChecked: (v: boolean) => void;
  noHoverPos: {x: number; y: number} | null;
  runAway: (e?: React.MouseEvent | React.TouchEvent) => void;
  secretHearts: SecretHeart[];
  setSecretHearts: React.Dispatch<React.SetStateAction<SecretHeart[]>>;
  kissPos: {x: number; y: number} | null;
  setKissPos: (p: {x: number; y: number} | null) => void;
  secretPassword: string;
  setSecretPassword: (v: string) => void;
  passwordError: boolean;
  setPasswordError: (v: boolean) => void;
  hudStats: HudStats;
  bossBarStats: BossBarStats | null;
  bonfireInfo: BonfireInfo | null;
  jessykaVisible: boolean;
  jessykaDespawning: boolean;
  jessykaImgRef: React.RefObject<HTMLImageElement | null>;
  finalSnapshot: FinalSnapshot | null;
  highscores: HighScore[];
  isMobileFocused: boolean;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  playerImgRef: React.RefObject<HTMLImageElement | null>;
  shakeRef: React.RefObject<HTMLDivElement | null>;
  screenFlashRef: React.RefObject<HTMLDivElement | null>;
  mobileInputRef: React.RefObject<HTMLInputElement | null>;
  smoochAudioRef: React.RefObject<HTMLAudioElement | null>;
  startRun: () => void;
  abandonRun: () => void;
  tryAgain: () => void;
  advanceFromBonfire: () => void;
  handleChar: (c: string) => void;
  setIsMobileFocused: (v: boolean) => void;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
  devJumpToZone: (idx: number) => void;
  devJumpToBoss: (id: string) => void;
  devJumpToVictory: () => void;
  devHeal: () => void;
  devGiveEstus: () => void;
  devAddCombo: (n: number) => void;
  devKillAllWords: () => void;
  devTriggerLightning: () => void;
  devResetSaveData: () => void;
  devSpawnJessyka: () => void;
  devAddZooted: () => void;
  devClearZooted: () => void;
  devSkipBossIntro: () => void;
  devOpenBossSelect: () => void;
  commitBossChoice: (choice: BossSelectChoice) => void;
  onAfromanIntroEnd: () => void;
  onTaurusIntroEnd: () => void;
  zootedLevel: 0 | 1 | 2 | 3;
  afromanBossPhase: 'hidden' | 'idle' | 'attack' | 'dying';
  afromanBossHit: boolean;
  afromanGrooving: boolean;
  taurusBossPhase: 'hidden' | 'idle' | 'attack' | 'dying';
  taurusBossHit: boolean;
};

function renderAppTree(p: RenderProps) {
  const highContrastClass = p.settings.highContrast ? 'high-contrast' : '';
  const colorblindClass = p.settings.colorblind ? 'colorblind' : '';
  const reduceMotionClass = p.settings.reduceMotion ? 'reduce-motion' : '';
  const zootedClass = p.zootedLevel > 0 ? `afroman-zooted-${p.zootedLevel}` : '';

  const nextZoneIdx = p.bonfireInfo?.nextZoneIdx ?? 0;
  const nextZone = ZONES[Math.min(nextZoneIdx, ZONES.length - 1)];

  return (
    <div
      className={`w-full h-[100dvh] bg-black flex items-center justify-center font-serif text-[#d1c7b7] overflow-hidden ${highContrastClass} ${colorblindClass} ${reduceMotionClass} ${zootedClass}`}
      onClick={() => {
        if ((p.phase === 'zone' || p.phase === 'boss') && !p.paused && p.mobileInputRef.current) {
          p.mobileInputRef.current.focus();
          p.setIsMobileFocused(true);
        }
      }}
    >
      <input
        ref={p.mobileInputRef}
        type="text"
        data-game-relay
        className="absolute top-[-100px] left-0 opacity-0"
        value=""
        onBlur={() => p.setIsMobileFocused(false)}
        onChange={(e) => { const v = e.target.value; if (v.length > 0) p.handleChar(v[v.length - 1]); }}
        autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
      />

      <div
        className="relative shrink-0 w-[1024px] h-[768px] bg-black border-4 border-[#1c1c1c] shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden ce-frame"
        style={{transform: `scale(${p.scale})`, transformOrigin: 'center center'}}
      >
        {/* Shake wrapper — contains bg/action/text canvases, player, screen
            flash, AND the HUD. Putting the HUD inside this stacking context
            lets the text canvas (z-40) render above the HUD (z-30) so words
            visually pass OVER HUD elements instead of behind them. */}
        <div ref={p.shakeRef} className="absolute top-0 left-0 w-full h-full will-change-transform">
          <canvas ref={p.bgCanvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-0" />
          {/* AfroMan custom arena — replaces the generic bg during his fight. */}
          {p.afromanBossPhase !== 'hidden' && (
            <div className="absolute inset-0 z-[1] pointer-events-none">
              <AfromanArena zootedLevel={p.zootedLevel} grooving={p.afromanGrooving} />
            </div>
          )}
          {/* Taurus custom arena — ruined rampart, torches, chains, cracks.
              Mounts whenever the Taurus sprite is on stage (intro→idle→
              attack→dying) so the scene is live for the whole fight. */}
          {p.taurusBossPhase !== 'hidden' && (
            <div className="absolute inset-0 z-[1] pointer-events-none">
              <TaurusArena hit={p.taurusBossHit} />
            </div>
          )}
          <canvas ref={p.canvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-10" />
          <img
            ref={p.playerImgRef}
            src="/idle1.png"
            data-state="idle"
            alt="Manus"
            className="absolute bottom-4 w-32 h-32 object-contain z-20 player-sprite"
            style={{left: (PLAYER.x + SPRITE_X_NUDGE) + 'px'}}
            draggable={false}
          />
          {p.jessykaVisible && (
            <img
              ref={p.jessykaImgRef}
              src="/jessIDLE.png"
              data-state="idle"
              alt="Jessyka"
              className={`absolute bottom-4 w-32 h-32 object-contain z-20 jessyka-sprite ${p.jessykaDespawning ? 'is-despawning' : ''}`}
              style={{left: (PLAYER.x + JESS_X_OFFSET) + 'px'}}
              draggable={false}
            />
          )}
          {/* AfroMan — DOM sprite layer during the secret boss fight.
              `afromanBossPhase` flips to 'idle' on enterBoss('afroman'), to
              'attack' briefly during spawn windows, to 'dying' on defeat.
              The 'is-grooving' class kicks the head-bop when a beat fires. */}
          {p.afromanBossPhase !== 'hidden' && (
            <img
              src={p.afromanBossPhase === 'attack' ? '/AfroManATTACK.png' : '/AfroManIDLE.png'}
              alt="AfroMan"
              className={`afroman-boss-sprite ${p.afromanGrooving ? 'is-grooving' : ''} ${p.afromanBossHit ? 'is-hit' : ''} ${p.afromanBossPhase === 'dying' ? 'is-dying' : ''}`}
              draggable={false}
            />
          )}
          {/* Taurus — DOM sprite layer for the Undead Burg boss fight.
              Swaps between TaurusIDLE.png / TaurusATTACK.png / TaurusDEAD.png
              driven by taurusBossPhase. The dying state swaps the src AND
              applies a slump + fade animation via `.is-dying`. A static
              fire-ring at his feet burns the whole time he's on stage
              (drops with `is-dying`). */}
          {p.taurusBossPhase !== 'hidden' && (
            <>
              <div className="taurus-fire-ring" aria-hidden />
              <img
                src={
                  p.taurusBossPhase === 'dying' ? '/TaurusDEAD.png'
                  : p.taurusBossPhase === 'attack' ? '/TaurusATTACK.png'
                  : '/TaurusIDLE.png'
                }
                alt="Taurus Demon"
                className={`taurus-boss-sprite ${p.taurusBossHit ? 'is-hit' : ''} ${p.taurusBossPhase === 'dying' ? 'is-dying' : ''}`}
                draggable={false}
              />
            </>
          )}
          {/* ZOOTED debuff — cannabis-leaf icons floating above the player. */}
          {p.zootedLevel > 0 && (p.phase === 'zone' || p.phase === 'boss') && (
            <div className="zooted-leaves" style={{left: PLAYER.x + 'px'}} aria-hidden>
              {Array.from({length: p.zootedLevel}).map((_, i) => (
                <span key={i} className={`zooted-leaf zooted-leaf-${i + 1}`}>✦</span>
              ))}
            </div>
          )}
          <div
            ref={p.screenFlashRef}
            aria-hidden
            className="absolute inset-0 z-[25] pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 50% 90%, rgba(220,20,20,0.75) 0%, rgba(120,0,0,0.4) 40%, rgba(0,0,0,0) 80%)',
              opacity: 0,
              willChange: 'opacity',
            }}
          />
          {/* HUD + boss bar sit BETWEEN action (z-10) and text (z-40) so words glide over them. */}
          {(p.phase === 'zone' || p.phase === 'boss') && (
            <>
              <Hud stats={p.hudStats} />
              {p.bossBarStats && <BossBar stats={p.bossBarStats} />}
            </>
          )}
          <canvas ref={p.textCanvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-40 pointer-events-none" />
        </div>

        {/* Pause button stays outside the shake wrapper so it doesn't jitter. */}
        {(p.phase === 'zone' || p.phase === 'boss') && (
          <>
            <button
              onClick={() => p.setPaused(v => !v)}
              className="absolute top-8 right-8 z-50 px-4 py-2 border border-amber-900 text-amber-600 font-[Cinzel] hover:bg-amber-900/20 tracking-widest"
            >
              {p.paused ? 'RESUME' : 'PAUSE'}
            </button>
          </>
        )}

        {/* Mobile-type hint */}
        {(p.phase === 'zone' || p.phase === 'boss') && !p.paused && !p.isMobileFocused && (
          <div className="absolute top-[82%] left-1/2 -translate-x-1/2 z-[60] bg-black/60 px-6 py-2 border border-amber-900/40 animate-pulse pointer-events-none md:hidden">
            <span className="font-[Cinzel] tracking-[0.2em] text-amber-600/80 uppercase">Tap screen to type</span>
          </div>
        )}

        {/* Menu */}
        {p.phase === 'menu' && (
          <MenuScreen
            onStart={p.startRun}
            onOpenSettings={() => p.setShowSettings(true)}
            onOpenDev={() => p.setShowDevPanel(true)}
          />
        )}

        {/* Boss-select fork (Undead Burg — always shown on clear, last pick
            pre-focused as a convenience so Enter = replay). */}
        {p.phase === 'boss-select' && (
          <BossSelect
            onPick={p.commitBossChoice}
            initialChoice={getRememberedBossChoice() ?? undefined}
          />
        )}

        {/* AfroMan 20s intro cutscene — sprite reveal + music fade-in */}
        {p.phase === 'boss-intro-afroman' && (
          <AfromanIntro onComplete={p.onAfromanIntroEnd} />
        )}

        {/* Taurus 20s intro cutscene — dark/eerie variant with fire + cracks. */}
        {p.phase === 'boss-intro-taurus' && (
          <TaurusIntro onComplete={p.onTaurusIntroEnd} />
        )}

        {/* Bonfire interlude */}
        {p.phase === 'bonfire' && p.bonfireInfo && (
          <BonfireInterlude
            reason={p.bonfireInfo.reason}
            nextZoneName={nextZone?.name ?? 'Unknown'}
            nextZoneSubtitle={nextZone?.subtitle ?? ''}
            defeatedBossName={p.bonfireInfo.defeatedBossName}
            onContinue={p.advanceFromBonfire}
          />
        )}

        {/* Game over */}
        {p.phase === 'gameover' && p.finalSnapshot && !p.showSecretAsk && (
          <GameOverScreen
            finalScore={p.finalSnapshot.score}
            maxCombo={p.finalSnapshot.maxCombo}
            topRank={p.finalSnapshot.topRank}
            stats={p.finalSnapshot.stats}
            derived={deriveStats(p.finalSnapshot.stats)}
            zoneName={p.finalSnapshot.zoneName}
            highscores={p.highscores}
            secretPassword={p.secretPassword}
            passwordError={p.passwordError}
            setSecretPassword={p.setSecretPassword}
            setPasswordError={p.setPasswordError}
            onUnlock={() => p.setShowSecretAsk(true)}
            onTryAgain={p.tryAgain}
            onOpenDev={() => p.setShowDevPanel(true)}
          />
        )}

        {/* Victory */}
        {p.phase === 'victory' && p.finalSnapshot && (
          <VictoryScreen
            finalScore={p.finalSnapshot.score}
            maxCombo={p.finalSnapshot.maxCombo}
            topRank={p.finalSnapshot.topRank}
            stats={p.finalSnapshot.stats}
            derived={deriveStats(p.finalSnapshot.stats)}
            onTryAgain={p.tryAgain}
            onOpenDev={() => p.setShowDevPanel(true)}
          />
        )}

        {/* Secret screens */}
        {p.showSecretAsk && !p.yesChecked && (
          <SecretAskScreen
            yesChecked={p.yesChecked}
            setYesChecked={p.setYesChecked}
            noHoverPos={p.noHoverPos}
            runAway={p.runAway}
            onBack={() => p.setShowSecretAsk(false)}
          />
        )}
        {p.showSecretAsk && p.yesChecked && (
          <SecretLoveScreen
            secretHearts={p.secretHearts}
            setSecretHearts={p.setSecretHearts}
            setKissPos={p.setKissPos}
            smoochAudio={p.smoochAudioRef.current}
            onBack={() => { p.setYesChecked(false); }}
          />
        )}

        {/* Pause — always on top of gameplay layers */}
        {p.paused && (p.phase === 'zone' || p.phase === 'boss') && !p.showSettings && (
          <PauseScreen
            onResume={() => p.setPaused(false)}
            onOpenSettings={() => p.setShowSettings(true)}
            onOpenDev={() => p.setShowDevPanel(true)}
            onAbandon={p.abandonRun}
          />
        )}

        {/* Settings overlay */}
        {p.showSettings && <SettingsScreen onClose={() => p.setShowSettings(false)} />}

        {/* Dev panel overlay */}
        {p.showDevPanel && (
          <DevPanel
            onClose={() => p.setShowDevPanel(false)}
            jumpToZone={p.devJumpToZone}
            jumpToBoss={p.devJumpToBoss}
            jumpToVictory={p.devJumpToVictory}
            heal={p.devHeal}
            giveEstus={p.devGiveEstus}
            addCombo={p.devAddCombo}
            killAllWords={p.devKillAllWords}
            triggerLightning={p.devTriggerLightning}
            resetSaveData={p.devResetSaveData}
            spawnJessyka={p.devSpawnJessyka}
            addZooted={p.devAddZooted}
            clearZooted={p.devClearZooted}
            skipBossIntro={p.devSkipBossIntro}
            openBossSelect={p.devOpenBossSelect}
          />
        )}
      </div>

      {p.kissPos && (
        <img
          src="/kiss-removebg-preview.png"
          alt="Kiss Cursor"
          className="fixed pointer-events-none z-[9999] w-24 h-24 object-contain -translate-x-1/2 -translate-y-1/2"
          style={{left: p.kissPos.x, top: p.kissPos.y}}
        />
      )}
    </div>
  );
}


// RENDER_FUNCTION_HERE
