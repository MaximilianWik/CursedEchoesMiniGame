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

import {ZONES, BOSSES, ENEMY_KINDS, CASTER_WORDS, GHOST_MESSAGES, type EnemyKind, type BossDef, type BossPattern} from './game/config';
import {useSettings, getSettings} from './game/settings';
import {createStats, registerWrong, sampleCombo, deriveStats, type RunStats} from './game/stats';
import {
  initAudio, resumeAudio, playMusic, stopMusic,
  sfxCast, sfxMiss, sfxFireball, sfxImpact, sfxShatter, sfxRankUp, sfxComboBreak,
  sfxPlayerHit, sfxBonfire, sfxEstus, sfxDodge, sfxBossAppear, sfxBossDefeated,
  sfxBossScream, sfxBossCollapse, sfxBossFinale,
  sfxDeath, sfxHeartbeat,
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
const JESS_KISS_INTERVAL_MS = 750;       // time between kiss fires (was 550 — less spammy)
const JESS_KISS_FLIGHT_MS = 680;         // how long a kiss is in-flight (was 420 — reads as projectile)
const JESS_X_OFFSET = 80;                // how far right of the player she stands (was 130 — closer)
const JESS_ESTUS_ACTIVE_MS = 15000;      // boss-fight estus summon active duration
const JESS_ESTUS_PROJECTILE_CHASE_SPEED = 10;  // px/frame homing speed in projectile-chase mode

type JessykaState = 'spawning' | 'active' | 'leaving' | 'despawning';

type JessykaCompanion = {
  state: JessykaState;
  spawnStart: number;       // performance.now at spawn start
  despawnStart: number;     // performance.now at despawn start (0 otherwise)
  targetId: number | null;  // Word.id she's firing at
  lettersFired: number;     // how many kisses she has fired at the target
  nextKissAt: number;       // performance.now when she fires her next kiss
  castingUntil: number;     // sprite swap to kiss.png while time < this
  // New in 0.2.6 — boss-fight estus summon variant. When 'estus', she ignores
  // words entirely and homes kisses onto incoming boss projectiles instead.
  summonSource: 'jessyka-word' | 'estus';
  projectileTargetId: number | null;  // Projectile.id currently being chased
  autoDespawnAt: number;              // performance.now at which to force 'leaving' (0 = no auto-despawn)
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

type Phase = 'menu' | 'zone' | 'boss' | 'bonfire' | 'victory' | 'gameover';

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
};

const BOSS_INTRO_MS = 4500;

type BonfireInfo = {
  reason: BonfireReason;
  nextZoneIdx: number;
  defeatedBossName?: string;
};

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

  // Zone / boss
  const zoneIdxRef = useRef(0);
  const zoneStartTimeRef = useRef(0);
  const zoneElapsedRef = useRef(0);
  const bossRef = useRef<BossRuntime | null>(null);
  const bossAnnouncementRef = useRef<{text: string; life: number} | null>(null);

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
    zoneIdxRef.current = 0;
    bossRef.current = null;
    statsRef.current = createStats();
    statsRef.current.startTime = Date.now();
    bgStateRef.current = createBgState();
    jessykaRef.current = null;
    jessykaKissesRef.current = [];
    setJessykaVisible(false);
    setJessykaDespawning(false);
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
    bossRef.current = {
      def,
      currentHp: def.maxHp,
      phaseIdx: 0,
      // Attacks and phrases are suppressed during the intro cutscene.
      // Schedule the first phrase + first attack *after* the intro ends.
      nextAttackAt: nowMs + BOSS_INTRO_MS + 1200,
      nextPhraseAt: nowMs + BOSS_INTRO_MS + 400,
      patternRotationIdx: 0,
      enraged: false,
      attackWindupT: 0,
      defeated: false,
      deathStart: 0,
      introStart: nowMs,
    };
    wordsRef.current = [];
    activeWordRef.current = null;
    projectilesRef.current = [];
    // No announcement here — the new intro cutscene overlay handles boss name + lore.
    sfxBossAppear();
    playMusic('boss');
    phaseRef.current = 'boss';
    setPhase('boss');
  }, [beginBonfire]);

  const triggerDeath = useCallback(() => {
    if (phaseRef.current === 'gameover' || phaseRef.current === 'victory') return;
    statsRef.current.endTime = Date.now();
    sfxDeath();
    stopMusic(0.4);
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
    setPaused(false);
    jessykaRef.current = null;
    jessykaKissesRef.current = [];
    setJessykaVisible(false);
    setJessykaDespawning(false);
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
    jessykaRef.current = null;
    jessykaKissesRef.current = [];
    setJessykaVisible(false);
    setJessykaDespawning(false);
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
    // Locate the zone this boss belongs to so HUD shows the right zone name.
    const zoneIdx = Math.max(0, ZONES.findIndex(z => z.bossId === bossId));
    zoneIdxRef.current = zoneIdx;
    setZoneStyling(bgStateRef.current, ZONES[zoneIdx].weather, ZONES[zoneIdx].tintColor, ZONES[zoneIdx].id as BgState['zoneId']);
    statsRef.current.zoneReached = zoneIdx;
    setShowDevPanel(false);
    enterBoss(bossId);
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
    if (estusActiveUntilRef.current > now) return;      // already drinking
    if (estusChargesRef.current <= 0) return;
    if (healthRef.current >= MAX_HEALTH) return;
    estusChargesRef.current -= 1;
    estusActiveUntilRef.current = now + ESTUS_CHUG_MS;
    statsRef.current.estusDrunk += 1;
    sfxEstus();
    // Heal at end of chug.
    window.setTimeout(() => {
      if (phaseRef.current === 'gameover' || phaseRef.current === 'victory') return;
      healthRef.current = Math.min(MAX_HEALTH, healthRef.current + ESTUS_HEAL);
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

  // Global keydown router.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isMobileRelay = target?.dataset?.gameRelay !== undefined;
      const isOtherInput = !isMobileRelay && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (isOtherInput) return;
      if (e.code === 'Tab') { e.preventDefault(); handleTab(); return; }
      if (e.code === 'Space') { e.preventDefault(); handleSpace(); return; }
      if (e.key === 'Escape') { e.preventDefault(); handleEsc(); return; }
      if (isMobileRelay) return;           // onChange handles letters for the mobile input
      if (e.key.length === 1) handleChar(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      estusChargesRef, estusActiveUntilRef,
      zoneIdxRef, zoneStartTimeRef, zoneElapsedRef, bossRef, bossAnnouncementRef,
      statsRef,
      jessykaRef, jessykaKissesRef, jessykaImgRef,
      setJessykaVisible, setJessykaDespawning,
      setHudStats, setBossBarStats, triggerRankUp, enterBoss, beginBonfire, triggerDeath,
      handleCharImpl,
    });
  }, [phase, enterBoss, beginBonfire, triggerDeath, triggerRankUp]);

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
  zoneIdxRef: React.RefObject<number>;
  zoneStartTimeRef: React.RefObject<number>;
  zoneElapsedRef: React.RefObject<number>;
  bossRef: React.RefObject<BossRuntime | null>;
  bossAnnouncementRef: React.RefObject<{text: string; life: number} | null>;
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

    // ── Boss announcement banner ──────────────────────────────
    if (d.bossAnnouncementRef.current) {
      const a = d.bossAnnouncementRef.current;
      a.life -= dt;
      if (a.life <= 0) d.bossAnnouncementRef.current = null;
      else {
        textCtx.save();
        textCtx.font = 'bold 42px "Cinzel", serif';
        textCtx.textAlign = 'center';
        const t = a.life / 180;
        textCtx.fillStyle = 'rgba(255, 60, 30, ' + t.toFixed(3) + ')';
        textCtx.shadowBlur = 24; textCtx.shadowColor = '#ff3020';
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
    // End of zone: either go to boss or straight to bonfire.
    if (zone.bossId) {
      d.enterBoss(zone.bossId);
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
  if (d.wordsRef.current.some(e => Math.abs(e.x - newX) < 150 && Math.abs(e.y - -50) < 100)) return;

  d.wordsRef.current.push({
    id: nextWordId(),
    text, x: newX, y: -50,
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
    const pool = phase.phraseBank;
    const text = pool[Math.floor(Math.random() * pool.length)];
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
}

/** Spawn a wave of boss projectiles following the given pattern. Returns
 *  true if the pattern actually produced a threat this tick, false when a
 *  cap/pre-condition blocked it (so the scheduler can advance). */
function spawnBossAttack(d: LoopDeps, pattern: BossPattern, letters: string, time: number, phaseIdx: number): boolean {
  // Build a projectile-letter pool that EXCLUDES every letter present in the
  // current boss phrase. This guarantees typing-ambiguity can never happen:
  // each keystroke is EITHER a phrase letter OR a projectile deflect, never
  // both. If filtering removes every letter, fall back to the raw pool.
  const activePhrase = d.wordsRef.current.find(w => w.isBossPhrase);
  const forbidden = new Set<string>();
  if (activePhrase) {
    for (const ch of activePhrase.text.toUpperCase()) {
      if (ch >= 'A' && ch <= 'Z') forbidden.add(ch);
    }
  }
  const filtered = letters.split('').filter(l => !forbidden.has(l));
  const pool = filtered.length > 0 ? filtered : letters.split('');
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
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
      vy: 1.6,
      char: pick(),
      fromBoss: true,
      life: 520,
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
        vy: 1.55,
        char: pick(),
        fromBoss: true,
        life: 500,
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
    const angVel = direction * (0.008 + Math.random() * 0.005);  // was 0.012..0.020
    const radVel = 0.55;                                          // was 0.9
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
    const wordPool = ['DEATH', 'DOOM', 'WITHER', 'RUIN', 'ASHES', 'CURSE', 'PYRE', 'DUSK', 'ABYSS', 'BLIGHT'];
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
    });
    // Telegraph.
    triggerLightning(d.bgStateRef.current, time);
    return true;
  } else if (pattern === 'summoner') {
    // Spawn ONE stationary chanter word as the boss's conjured minion. Cap:
    // ≤ 1 boss-summoned chanter alive at a time. The chanter's existing
    // "emit minion echoes every ~3.5s" logic in updateWords handles its
    // behaviour — no new runtime code, just a new spawn path with a boss
    // silhouette overlay.
    const alreadySummoned = d.wordsRef.current.some(w => w.isBossSummoned && w.kind === 'chanter');
    if (alreadySummoned) return false;
    const firstLettersUsed = new Set(d.wordsRef.current.map(w => w.text[0]));
    const candidates = GOTHIC_WORDS.filter(x =>
      x.length >= 5 && x.length <= 7 && !firstLettersUsed.has(x[0]) && !forbidden.has(x[0]),
    );
    if (candidates.length === 0) return false;
    const text = candidates[Math.floor(Math.random() * candidates.length)];
    // Stationary: middle two-thirds of the screen.
    const margin = DESIGN_W / 6;
    const xPos = margin + Math.random() * (DESIGN_W - margin * 2 - text.length * 14);
    const yPos = 100 + Math.random() * 40;
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
    d.bossAnnouncementRef.current = {text: 'A CHANTER RISES', life: 140};
    triggerLightning(d.bgStateRef.current, time);
    return true;
  } else if (pattern === 'caster') {
    // Spawn ONE stationary caster word from the boss's repertoire. Cap:
    // ≤ 1 boss-summoned caster alive at a time. It fires projectile-letters
    // via the existing caster cooldown logic in updateWords.
    const alreadySummoned = d.wordsRef.current.some(w => w.isBossSummoned && w.kind === 'caster');
    if (alreadySummoned) return false;
    const onScreen = new Set(d.wordsRef.current.map(w => w.text));
    const firstLettersUsed = new Set(d.wordsRef.current.map(w => w.text[0]));
    const casterPool = CASTER_WORDS.filter(w =>
      !onScreen.has(w) && !firstLettersUsed.has(w[0]) && !forbidden.has(w[0]),
    );
    if (casterPool.length === 0) return false;
    const text = casterPool[Math.floor(Math.random() * casterPool.length)];
    const margin = DESIGN_W / 6;
    const xPos = margin + Math.random() * (DESIGN_W - margin * 2 - text.length * 14);
    const yPos = 110 + Math.random() * 30;
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
    d.bossAnnouncementRef.current = {text: 'A CASTER EMERGES', life: 140};
    triggerLightning(d.bgStateRef.current, time);
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
      // Hit a word (normal case) or damage boss. Chase fireballs never target
      // words or bosses — they exist only to physically neutralise a projectile.
      if (!isChase && fb.targetBoss && d.bossRef.current && !d.bossRef.current.defeated) {
        const dmg = fb.bossDamage ?? 0;
        if (dmg > 0) {
          d.bossRef.current.currentHp = Math.max(0, d.bossRef.current.currentHp - dmg);
          d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 10 + dmg * 2);
          d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 260);
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
  d.iFramesUntilRef.current = time + 3200;    // invulnerability for the duration
  d.bossAnnouncementRef.current = {text: b.def.name + ' FELLED', life: 180};

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

  // Final beat: resolving chord + brightest flash + transition to bonfire.
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
      if (time < d.iFramesUntilRef.current) {
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

  // ── Spawn → active transition.
  if (j.state === 'spawning' && time - j.spawnStart >= JESS_SPAWN_MS) {
    j.state = 'active';
  }

  // ── Active / leaving: pick and fire on targets.
  if (j.state === 'active' || j.state === 'leaving') {
    if (j.summonSource === 'estus') {
      // Boss-fight variant — target boss projectiles instead of words. She
      // picks a new projectile each shot (no sticky target since projectiles
      // die on deflection). Fires as fast as JESS_KISS_INTERVAL_MS allows,
      // and waits idle when nothing's in the air.
      if (time >= j.nextKissAt) {
        const fired = fireJessykaProjectileKiss(d, j, time);
        if (!fired) {
          // Nothing to shoot — short backoff so we don't scan the array every frame.
          j.nextKissAt = time + 120;
        }
      }
      // Auto-despawn trigger.
      if (j.state === 'active' && j.autoDespawnAt > 0 && time >= j.autoDespawnAt) {
        j.state = 'leaving';
      }
      if (j.state === 'leaving') {
        // Estus summon exits immediately — no "finish the word" semantics here.
        j.state = 'despawning';
        j.despawnStart = time;
        d.setJessykaDespawning(true);
        spawnJessykaAngelicBurst(d, time);
      }
    } else if (j.targetId !== null) {
      // Validate current target.
      const wIdx = d.wordsRef.current.findIndex(w => w.id === j.targetId);
      if (wIdx === -1) {
        // Target is gone (contact damage, etc). Release and re-pick next frame.
        j.targetId = null;
        j.lettersFired = 0;
      } else {
        const w = d.wordsRef.current[wIdx];
        // Fire next kiss when due, and we still have letters to fire.
        if (j.lettersFired < w.text.length && time >= j.nextKissAt) {
          fireJessykaKiss(d, j, w, time);
        }
        // No further action until the word fully typed + splice happens in arrival handler.
      }
    } else {
      // No target — pick one, unless we're leaving (then despawn).
      if (j.state === 'leaving') {
        j.state = 'despawning';
        j.despawnStart = time;
        d.setJessykaDespawning(true);
        spawnJessykaAngelicBurst(d, time);
      } else {
        tryPickJessykaTarget(d, j);
      }
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
  const candidates = d.wordsRef.current.filter(w =>
    !w.jessykaTarget && !w.isSpecial && !w.isBossPhrase && !w.isBossAttack
    && w.kind !== 'chanter' && w.typed.length === 0,
  );
  if (candidates.length === 0) return;
  // Sort by y ASC (topmost first) — "high up" preference.
  candidates.sort((a, b) => a.y - b.y);
  const target = candidates[0];
  target.jessykaTarget = true;
  j.targetId = target.id;
  j.lettersFired = 0;
  j.nextKissAt = performance.now() + 200;      // small windup delay
}

/** Fire one kiss toward the current target's current position. */
function fireJessykaKiss(d: LoopDeps, j: JessykaCompanion, w: Word, time: number): void {
  const origin = {x: PLAYER.x + JESS_X_OFFSET, y: PLAYER.y - 12};
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
    if (!p.fromBoss || p.deflected) continue;
    const dx = p.x - PLAYER.x, dy = p.y - PLAYER.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { best = p; bestDist = dist; }
  }
  if (!best) return false;
  // Atomic parry — mark the projectile deflected immediately so it can't damage
  // the player even if the kiss takes a few frames to arrive.
  best.deflected = true;

  const origin = {x: PLAYER.x + JESS_X_OFFSET, y: PLAYER.y - 12};
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
        // Arrival — splice the projectile, burst, shockwave, sfx.
        d.projectilesRef.current.splice(pIdx, 1);
        spawnKissProjectileHit(d, p.x, p.y);
        sfxFireball();
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
  const origin = {x: PLAYER.x + JESS_X_OFFSET, y: PLAYER.y - 20};
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

    // Movement. Suppressed during spawn animations — position is authoritative.
    if (!inSpawn && w.kind !== 'chanter' && w.speed > 0) {
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
          vy: 2.2 + Math.random() * 0.8,
          char: w.text[Math.min(w.typed.length, w.text.length - 1)],
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
        const baseDmg = w.isBossAttack
          ? Math.ceil(1.5 + w.text.length * 0.2)       // word-projectile: punchy
          : (() => {
              const zone = ZONES[d.zoneIdxRef.current];
              const diff = Math.min(d.zoneElapsedRef.current / zone.duration, 1) * 5;
              return Math.ceil(1.5 + diff * 0.4 + w.text.length * 0.1);
            })();
        if (time >= d.iFramesUntilRef.current) {
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

function applyDamageToPlayer(d: LoopDeps, dmg: number, time: number): void {
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
  if (d.healthRef.current === 0) d.triggerDeath();
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
    jessykaSummonAvailable: d.phaseRef.current === 'boss'
      && d.bossRef.current !== null && !d.bossRef.current.defeated
      && d.bossRef.current.currentHp > 0 && d.bossRef.current.introStart === 0
      && d.estusChargesRef.current >= 1
      && d.jessykaRef.current === null,
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
  const b = d.bossRef.current;
  if (!b) return false;
  // Boss must be alive and out of the intro cutscene.
  if (b.defeated || b.currentHp <= 0 || b.introStart > 0) return false;
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
    autoDespawnAt: now + JESS_SPAWN_MS + JESS_ESTUS_ACTIVE_MS,
  };
  d.setJessykaVisible(true);
  d.setJessykaDespawning(false);
  d.bossAnnouncementRef.current = {text: "LOVE'S EMBRACE", life: 140};
  sfxFireball();
  // Celebratory pink burst at her arrival spot.
  const ox = PLAYER.x + JESS_X_OFFSET, oy = PLAYER.y - 20;
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
  const char = rawChar.toUpperCase();
  if (char.length !== 1 || char < 'A' || char > 'Z') return;

  // ── Q-binding — boss-fight Jessyka summon (0.2.6). Fall-through priority
  //    preserves typing: if any word can currently accept a Q (active word's
  //    next letter is Q, or an idle word starts with Q) or any in-flight
  //    projectile matches Q, the keystroke routes to normal deflection/typing
  //    first. Only when nothing else claims Q do we attempt the summon.
  //    A failed summon (no estus / already here) still consumes the keystroke
  //    so the player doesn't eat a miss for pressing Q deliberately.
  if (char === 'Q' && phase === 'boss') {
    const wordWantsQ = d.wordsRef.current.some(w =>
      !w.spawnAnim && !w.jessykaTarget && w.text.charAt(w.typed.length) === 'Q',
    );
    const projWantsQ = d.projectilesRef.current.some(p => p.char === 'Q' && !p.deflected);
    if (!wordWantsQ && !projWantsQ) {
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

  // ── Phase 1: Projectile deflection.
  //    Any in-flight projectile whose char matches is MARKED as deflected
  //    (no longer damages the player) and a chase-fireball is spawned from
  //    the player that actively homes in on it. The projectile keeps moving
  //    until the fireball physically catches up and blows it apart — which
  //    makes cause and effect visible instead of teleport-despawn. Deflection
  //    is ATOMIC: it credits the keystroke and a combo tick, and blocks any
  //    "wrong key" combo reset further down. A successful parry never punishes.
  let deflectedCount = 0;
  for (let i = d.projectilesRef.current.length - 1; i >= 0; i--) {
    const p = d.projectilesRef.current[i];
    if (p.deflected || p.char !== char) continue;
    p.deflected = true;
    // Chase fireball — tx/ty seeded to current projectile pos, but updateFireballs
    // re-aims every frame via chaseProjectileId. life grace caps it at ~1.2 s.
    d.fireballsRef.current.push({
      x: PLAYER.x, y: PLAYER.y,
      tx: p.x, ty: p.y,
      progress: 0,
      isSpecial: false,
      targetBoss: false,
      chaseProjectileId: p.id,
      life: 72,    // frame-units (~1.2 s @ 60fps); hard cap to prevent runaway chase
    });
    // Parry sparks at the projectile's current position — immediate feedback
    // that the input registered, even before the fireball actually connects.
    for (let k = 0; k < 10; k++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      d.particlesRef.current.push({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
        life: 14, maxLife: 14, size: 2.5,
        color: p.fromBoss ? '#ffaa55' : '#ff88ff',
      });
    }
    deflectedCount += 1;
    d.statsRef.current.projectilesDeflected += 1;
  }
  const deflectedAny = deflectedCount > 0;
  if (deflectedAny) {
    sfxFireball();
    d.correctKeyRef.current += 1;
    d.statsRef.current.correctLetters += 1;
    d.comboRef.current += 1;
    progressed = true;
  }

  // ── Phase 2: Word typing. Skipped entirely if the keystroke was consumed
  //    by a deflection — the player's input was for the projectile, not the
  //    word. (The new projectile-letter filter in spawnBossAttack guarantees
  //    phrase letters and projectile letters never overlap, so this rule
  //    doesn't cause double-duty loss.)
  if (!deflectedAny) {
    // Helper — skip words that can't be typed right now (claimed by Jessyka
    // or still playing a spawn-in animation).
    const typable = (w: Word) => !w.jessykaTarget && !w.spawnAnim;

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
          // Word-switch rescue (new in 0.2.6): if the keystroke doesn't match
          // the active word's next letter but IS the first letter of another
          // typable non-jessyka word on screen, switch to that word. This fixes
          // the "runner boss-word untypable" bug where the player was locked
          // onto a boss phrase and couldn't start a falling runner word. Combo
          // still resets as a drop penalty so the rescue isn't free.
          const switchIdx = words.findIndex(ww => ww !== w && typable(ww) && ww.text.startsWith(char));
          if (switchIdx !== -1) {
            w.typed = '';                           // release the old active word
            const nw = words[switchIdx];
            nw.typed = char;
            d.activeWordRef.current = switchIdx;
            d.correctKeyRef.current += 1;
            d.statsRef.current.correctLetters += 1;
            d.comboRef.current = 0;                 // drop penalty — combo resets, keystroke credits
            progressed = true;
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
      const idx = words.findIndex(w => typable(w) && w.text.startsWith(char));
      if (idx !== -1) {
        const w = words[idx];
        w.typed = char;
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
      };
      d.setJessykaVisible(true);
      d.setJessykaDespawning(false);
    } else {
      existing.state = 'active';
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
};

function renderAppTree(p: RenderProps) {
  const highContrastClass = p.settings.highContrast ? 'high-contrast' : '';
  const colorblindClass = p.settings.colorblind ? 'colorblind' : '';
  const reduceMotionClass = p.settings.reduceMotion ? 'reduce-motion' : '';

  const nextZoneIdx = p.bonfireInfo?.nextZoneIdx ?? 0;
  const nextZone = ZONES[Math.min(nextZoneIdx, ZONES.length - 1)];

  return (
    <div
      className={`w-full h-[100dvh] bg-black flex items-center justify-center font-serif text-[#d1c7b7] overflow-hidden ${highContrastClass} ${colorblindClass} ${reduceMotionClass}`}
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
