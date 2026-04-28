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
  drawProjectile, drawDecals, addImpactDecal, drawBoss, triggerLightning,
  type Word, type Fireball, type Particle, type Shockwave, type Projectile,
  type BgState, type Rank, type BossRenderState,
} from './graphics';

import {ZONES, BOSSES, ENEMY_KINDS, CASTER_WORDS, GHOST_MESSAGES, type EnemyKind, type BossDef} from './game/config';
import {useSettings, getSettings} from './game/settings';
import {createStats, registerWrong, sampleCombo, deriveStats, type RunStats} from './game/stats';
import {
  initAudio, resumeAudio, playMusic, stopMusic,
  sfxCast, sfxMiss, sfxFireball, sfxImpact, sfxShatter, sfxRankUp, sfxComboBreak,
  sfxPlayerHit, sfxBonfire, sfxEstus, sfxDodge, sfxBossAppear, sfxBossDefeated,
  sfxDeath, sfxHeartbeat,
} from './game/audio';

import {Hud, type HudStats} from './hud/Hud';
import {BossBar, type BossBarStats} from './hud/BossBar';
import {RankUpBanner, rankColor, type RankUpEvent} from './hud/RankUpBanner';

import {MenuScreen} from './screens/Menu';
import {SettingsScreen} from './screens/Settings';
import {PauseScreen} from './screens/Pause';
import {BonfireInterlude, type BonfireReason} from './screens/BonfireInterlude';
import {GameOverScreen, type HighScore} from './screens/GameOver';
import {VictoryScreen} from './screens/Victory';
import {SecretAskScreen, SecretLoveScreen, type SecretHeart} from './screens/SecretScreens';

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
const BOSS_AIM = {x: DESIGN_W / 2, y: 470};

type Phase = 'menu' | 'zone' | 'boss' | 'bonfire' | 'victory' | 'gameover';

type BossRuntime = {
  def: BossDef;
  currentHp: number;
  phaseIdx: number;
  nextProjectileAt: number;      // performance.now time
  phraseSpawnCooldown: number;   // seconds
  enraged: boolean;
  attackWindupT: number;
  defeated: boolean;             // prevents double-trigger after HP=0
};

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
  const [rankUpEvent, setRankUpEvent] = useState<RankUpEvent | null>(null);
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
  const damageTextsRef = useRef<{x: number; y: number; value: string; life: number; maxLife: number; color: string}[]>([]);
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

  const triggerRankUp = useCallback((rank: Rank) => {
    setRankUpEvent({
      id: Date.now() + Math.random(),
      rankId: rank.id,
      label: rank.label.toUpperCase().replace(/!+$/, '!'),
      color: rankColor(rank.id),
      timestamp: Date.now(),
    });
    const idx = COMBO_RANKS.findIndex(r => r.id === rank.id);
    sfxRankUp(Math.max(0, idx));
    window.setTimeout(() => setRankUpEvent(null), 1600);
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
  }, []);

  const enterZone = useCallback((idx: number) => {
    zoneIdxRef.current = idx;
    const zone = ZONES[idx];
    setZoneStyling(bgStateRef.current, zone.weather, zone.tintColor);
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
    bossRef.current = {
      def,
      currentHp: def.maxHp,
      phaseIdx: 0,
      nextProjectileAt: performance.now() + def.phases[0].projectileRate * 1000,
      phraseSpawnCooldown: 0,
      enraged: false,
      attackWindupT: 0,
      defeated: false,
    };
    wordsRef.current = [];
    activeWordRef.current = null;
    projectilesRef.current = [];
    bossAnnouncementRef.current = {text: def.name, life: 180};
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
    phaseRef.current = 'menu';
    setPhase('menu');
  }, []);

  const tryAgain = useCallback(() => {
    setFinalSnapshot(null);
    setBonfireInfo(null);
    setRankUpEvent(null);
    setBossBarStats(null);
    setShowSecretAsk(false);
    setYesChecked(false); setNoHoverPos(null);
    setKissPos(null);
    stopMusic(0.2);
    phaseRef.current = 'menu';
    setPhase('menu');
  }, []);

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
      // Small green pop up.
      pushDamageText('+' + ESTUS_HEAL, PLAYER.x, PLAYER.y - 50, '#6dffaa');
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
    yesChecked, setYesChecked, noHoverPos, runAway,
    secretHearts, setSecretHearts, kissPos, setKissPos,
    secretPassword, setSecretPassword, passwordError, setPasswordError,
    hudStats, bossBarStats, rankUpEvent, bonfireInfo, finalSnapshot,
    highscores, isMobileFocused,
    bgCanvasRef, canvasRef, textCanvasRef, playerImgRef, shakeRef, screenFlashRef, mobileInputRef,
    smoochAudioRef,
    startRun, abandonRun, tryAgain, advanceFromBonfire,
    handleChar, setIsMobileFocused, setPaused,
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
  damageTextsRef: React.RefObject<{x: number; y: number; value: string; life: number; maxLife: number; color: string}[]>;
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

    const dt = Math.min((time - lastTime) / (1000 / 60), 3);
    lastTime = time;

    updateSprites(d, time);
    updateZoneTimer(d, time);

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

    // ── Hit flash overlay ─────────────────────────────────────
    updateHitFlash(d, time, s.reduceMotion);

    // ── HUD tick (10 Hz) ──────────────────────────────────────
    if (time - lastHudBump > 100) {
      lastHudBump = time;
      pushHudStats(d);
      if (d.phaseRef.current === 'boss' && d.bossRef.current) {
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
  // Stamina regen.
  const staminaRegen = 0.6;
  if (d.staminaRef.current < MAX_STAMINA) {
    d.staminaRef.current = Math.min(MAX_STAMINA, d.staminaRef.current + staminaRegen);
  }
}

function updateZoneTimer(d: LoopDeps, time: number): void {
  if (d.phaseRef.current !== 'zone') return;
  const elapsed = (time - d.zoneStartTimeRef.current) / 1000;
  d.zoneElapsedRef.current = elapsed;
  const zone = ZONES[d.zoneIdxRef.current];
  if (elapsed >= zone.duration) {
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
  if (!b || b.currentHp <= 0) return;

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
  }

  const phase = b.def.phases[b.phaseIdx];

  // Phrase spawn — keep up to phase.maxSimultaneousPhrases.
  b.phraseSpawnCooldown -= dt / 60;
  const liveCount = d.wordsRef.current.length;
  if (liveCount < phase.maxSimultaneousPhrases && b.phraseSpawnCooldown <= 0) {
    const pool = phase.phraseBank;
    const text = pool[Math.floor(Math.random() * pool.length)];
    if (!d.wordsRef.current.some(w => w.text === text)) {
      d.wordsRef.current.push({
        text, x: 80 + Math.random() * (DESIGN_W - 300), y: 150 + Math.random() * 80,
        speed: 0.03,
        typed: '', kind: 'normal', isSpecial: false,
        hp: 1, fireCooldown: 0, ghostPhase: 0,
        scrambled: false, stationaryX: 0, spawnTime: time,
      });
      b.phraseSpawnCooldown = 4;
    }
  }

  // Boss projectiles.
  if (time >= b.nextProjectileAt) {
    const letter = phase.projectileLetters[Math.floor(Math.random() * phase.projectileLetters.length)];
    d.projectilesRef.current.push({
      x: BOSS_AIM.x + (Math.random() - 0.5) * 120,
      y: BOSS_AIM.y - 40,
      vx: (PLAYER.x - BOSS_AIM.x) * 0.002 + (Math.random() - 0.5) * 0.5,
      vy: phase.projectileSpeed,
      char: letter,
      fromBoss: true,
      life: 400,
    });
    b.nextProjectileAt = time + phase.projectileRate * 1000;
  }
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
  };
  drawBoss(bgCtx, state, time);
}

function updateFireballs(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number, dt: number, rankId: string): void {
  for (let i = d.fireballsRef.current.length - 1; i >= 0; i--) {
    const fb = d.fireballsRef.current[i];
    fb.progress += (fb.isSpecial ? 0.02 : 0.04) * dt;
    fb.x = PLAYER.x + (fb.tx - PLAYER.x) * fb.progress;
    fb.y = PLAYER.y + (fb.ty - PLAYER.y) * fb.progress;
    const color = drawFireball(ctx, fb, d.comboRef.current, rankId);
    const isSpear = rankId === 'S' || rankId === 'SS' || rankId === 'SSS';
    const trailCount = fb.isSpecial ? 2 : isSpear ? 4 : Math.min(3, Math.floor(d.comboRef.current / 30) + 1);
    for (let k = 0; k < trailCount; k++) {
      if (d.particlesRef.current.length >= PARTICLE_CAP) break;
      d.particlesRef.current.push({
        x: fb.x, y: fb.y,
        vx: (Math.random() - 0.5) * (isSpear ? 5 : 3),
        vy: (Math.random() - 0.5) * (isSpear ? 5 : 3),
        life: isSpear ? 14 : 8, maxLife: isSpear ? 14 : 8,
        size: 3, color: fb.isSpecial ? '#ff80cc' : color,
        isHeart: fb.isSpecial,
      });
    }
    if (fb.progress >= 1) {
      const explosion = 8 + Math.floor(d.comboRef.current / 60);
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
        x: fb.tx, y: fb.ty, radius: 4, maxRadius: isSpear ? 90 : 55,
        color: fb.isSpecial ? 'rgba(255,128,204,ALPHA)' : isSpear ? 'rgba(180,230,255,ALPHA)' : 'rgba(255,160,60,ALPHA)',
      });
      const mag = fb.isSpecial ? 8 : isSpear ? 6 : 3;
      d.shakeMagRef.current = Math.max(d.shakeMagRef.current, mag);
      d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 140);
      sfxImpact(isSpear);
      addImpactDecal(d.bgStateRef.current, fb.tx, fb.ty, isSpear);
      // Hit a word (normal case) or damage boss.
      if (fb.targetBoss && d.bossRef.current && !d.bossRef.current.defeated) {
        d.bossRef.current.currentHp = Math.max(0, d.bossRef.current.currentHp - 1);
        d.shakeMagRef.current = Math.max(d.shakeMagRef.current, 10);
        d.shakeUntilRef.current = Math.max(d.shakeUntilRef.current, time + 220);
        if (d.bossRef.current.currentHp <= 0) defeatBoss(d, time);
      } else if (!fb.targetBoss) {
        const wIdx = d.wordsRef.current.findIndex(w => Math.abs(w.x - fb.tx) < 70);
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
  d.scoreRef.current += b.def.soulsReward;
  d.statsRef.current.bossesDefeated += 1;
  sfxBossDefeated();
  // Big explosion at boss position.
  for (let i = 0; i < 80; i++) {
    if (d.particlesRef.current.length >= PARTICLE_CAP) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 8;
    d.particlesRef.current.push({
      x: BOSS_AIM.x, y: BOSS_AIM.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: 40, maxLife: 40, size: 4,
      color: b.def.themeColor,
    });
  }
  d.shockwavesRef.current.push({x: BOSS_AIM.x, y: BOSS_AIM.y, radius: 8, maxRadius: 220, color: 'rgba(255,200,80,ALPHA)'});
  triggerLightning(d.bgStateRef.current, time);
  // Queue bonfire after a beat.
  window.setTimeout(() => {
    d.beginBonfire('boss-defeated', d.zoneIdxRef.current + 1, b.def.name);
  }, 900);
}

function updateProjectiles(d: LoopDeps, ctx: CanvasRenderingContext2D, time: number, dt: number): void {
  for (let i = d.projectilesRef.current.length - 1; i >= 0; i--) {
    const p = d.projectilesRef.current[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    drawProjectile(ctx, p);
    // Contact with player.
    const dxp = PLAYER.x - p.x, dyp = PLAYER.y - p.y;
    const distP = Math.sqrt(dxp * dxp + dyp * dyp);
    if (distP < 45) {
      if (time < d.iFramesUntilRef.current) {
        // Dodged.
        d.statsRef.current.dodgesSuccessful += 1;
      } else {
        applyDamageToPlayer(d, p.fromBoss ? 2 : 1, time);
      }
      d.projectilesRef.current.splice(i, 1);
      continue;
    }
    if (p.life <= 0 || p.y > DESIGN_H + 30) {
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

    // Movement.
    if (w.kind !== 'chanter' && w.speed > 0) {
      const dx = PLAYER.x - w.x, dy = PLAYER.y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.001) {
        const v = (w.speed * 2 * dt) / dist;
        w.x += dx * v; w.y += dy * v;
      }
    }

    // Caster: fire projectiles on cooldown.
    if (w.kind === 'caster') {
      w.fireCooldown -= dt / 60;
      if (w.fireCooldown <= 0) {
        w.fireCooldown = 2.4 + Math.random() * 0.8;
        d.projectilesRef.current.push({
          x: w.x + 40, y: w.y + 10,
          vx: (PLAYER.x - w.x) * 0.004,
          vy: 2.2 + Math.random() * 0.8,
          char: w.text[Math.min(w.typed.length, w.text.length - 1)],
          fromBoss: false, life: 280,
        });
      }
    }

    // Mimic scramble at 50%.
    if (w.kind === 'mimic' && !w.scrambled && w.typed.length >= Math.floor(w.text.length / 2)) {
      const head = w.text.slice(0, w.typed.length);
      const tailLen = w.text.length - w.typed.length;
      let tail = '';
      for (let k = 0; k < tailLen; k++) tail += String.fromCharCode(65 + Math.floor(Math.random() * 26));
      w.text = head + tail;
      w.scrambled = true;
    }

    // Visual width.
    let wordW = 0;
    for (let k = 0; k < w.text.length; k++) wordW += (widths[w.text[k]] ?? 14) * fontScale;

    // Aura on main canvas (action layer).
    drawWordAura(ctx, w, wordW, time, ENEMY_KINDS[w.kind].auraColor);
    // Glyphs on text canvas (front layer).
    drawWordText(textCtx, w, widths, time, fontScale);

    // Contact with player — only in zone phase, and only for moving words.
    if (d.phaseRef.current === 'zone' && w.kind !== 'chanter') {
      const dx = PLAYER.x - w.x, dy = PLAYER.y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < HIT_RADIUS) {
        d.wordsRef.current.splice(i, 1);
        if (d.activeWordRef.current !== null) {
          if (d.activeWordRef.current === i) d.activeWordRef.current = null;
          else if (d.activeWordRef.current > i) d.activeWordRef.current -= 1;
        }
        const zone = ZONES[d.zoneIdxRef.current];
        const diff = Math.min(d.zoneElapsedRef.current / zone.duration, 1) * 5;
        const dmg = Math.ceil(1.5 + diff * 0.4 + w.text.length * 0.1);
        if (time >= d.iFramesUntilRef.current) {
          applyDamageToPlayer(d, dmg, time);
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

function drawDamageTexts(d: LoopDeps, textCtx: CanvasRenderingContext2D, dt: number): void {
  if (d.damageTextsRef.current.length === 0) return;
  textCtx.save();
  textCtx.font = 'bold 28px "Cinzel", serif';
  textCtx.textAlign = 'center';
  for (let i = d.damageTextsRef.current.length - 1; i >= 0; i--) {
    const dmg = d.damageTextsRef.current[i];
    dmg.y -= 1.2 * dt;
    dmg.life -= dt;
    if (dmg.life <= 0) { d.damageTextsRef.current.splice(i, 1); continue; }
    const alpha = Math.min(1, dmg.life / 30);
    textCtx.fillStyle = dmg.color;
    textCtx.globalAlpha = alpha;
    textCtx.shadowBlur = 14; textCtx.shadowColor = dmg.color;
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
  });
}

// ─────────────────────────────────────────────────────────────
// handleChar — routes a typed letter to projectiles + active word.
// Called by the global keydown listener via handleCharImpl.
// ─────────────────────────────────────────────────────────────

function handleCharLive(d: LoopDeps, rawChar: string): void {
  const phase = d.phaseRef.current;
  if (phase !== 'zone' && phase !== 'boss') return;
  if (d.pausedRef.current) return;
  const now = performance.now();
  if (now < d.estusActiveUntilRef.current) return;
  const char = rawChar.toUpperCase();
  if (char.length !== 1 || char < 'A' || char > 'Z') return;

  d.totalKeyRef.current += 1;
  d.statsRef.current.totalLetters += 1;

  // Chanter debuff — roll to mis-register.
  const chanterPresent = d.wordsRef.current.some(w => w.kind === 'chanter');
  if (chanterPresent && Math.random() < 0.15) {
    registerWrong(d.statsRef.current, char);
    sfxMiss();
    d.comboRef.current = 0;
    return;
  }

  // Casting sprite swap.
  const img = d.playerImgRef.current;
  if (img) {
    d.castingUntilRef.current = now + 180;
    if (img.dataset.state !== 'casting') { img.src = '/casting2.png'; img.dataset.state = 'casting'; }
  }

  // Projectile deflection: any matching char destroys ALL in-flight projectiles with that char.
  let deflectedAny = false;
  for (let i = d.projectilesRef.current.length - 1; i >= 0; i--) {
    if (d.projectilesRef.current[i].char === char) {
      const p = d.projectilesRef.current[i];
      for (let k = 0; k < 14; k++) {
        if (d.particlesRef.current.length >= PARTICLE_CAP) break;
        d.particlesRef.current.push({
          x: p.x, y: p.y,
          vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5,
          life: 16, maxLife: 16, size: 2.5,
          color: p.fromBoss ? '#ffaa55' : '#ff88ff',
        });
      }
      d.projectilesRef.current.splice(i, 1);
      deflectedAny = true;
      d.statsRef.current.projectilesDeflected += 1;
    }
  }
  if (deflectedAny) sfxShatter();

  // Word typing.
  const words = d.wordsRef.current;
  let progressed = false;

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
      } else if (deflectedAny) {
        // Neutral: parried a projectile, active word untouched.
        d.correctKeyRef.current += 1;
        d.statsRef.current.correctLetters += 1;
        d.comboRef.current += 1;
        progressed = true;
      } else {
        registerWrong(d.statsRef.current, char);
        sfxMiss();
        d.comboRef.current = 0;
      }
    }
  } else if (!deflectedAny) {
    // Only start a new word if the keystroke wasn't consumed by a deflection.
    const idx = words.findIndex(w => w.text.startsWith(char));
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
  } else {
    // Deflection happened; count the keystroke as correct work.
    d.correctKeyRef.current += 1;
    d.statsRef.current.correctLetters += 1;
    d.comboRef.current += 1;
    progressed = true;
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
  d.fireballsRef.current.push({
    x: PLAYER.x, y: PLAYER.y,
    tx: isBoss ? BOSS_AIM.x : w.x,
    ty: isBoss ? BOSS_AIM.y : w.y,
    progress: 0,
    isSpecial: w.isSpecial,
    targetBoss: isBoss,
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
    d.isBlessedRef.current = true;
    if (d.blessedTimeoutRef.current !== null) window.clearTimeout(d.blessedTimeoutRef.current);
    d.blessedTimeoutRef.current = window.setTimeout(() => {
      d.isBlessedRef.current = false;
      d.blessedTimeoutRef.current = null;
    }, 10000);
  }

  // Lich children on death.
  if (w.kind === 'lich') {
    const used = new Set(d.wordsRef.current.map(ww => ww.text[0]));
    used.add(w.text[0]);
    for (let i = 0; i < 2; i++) {
      const candidates = GOTHIC_WORDS.filter(x => x.length >= 3 && x.length <= 5 && !used.has(x[0]));
      if (candidates.length === 0) break;
      const childText = candidates[Math.floor(Math.random() * candidates.length)];
      used.add(childText[0]);
      d.wordsRef.current.push({
        text: childText, x: w.x + (i === 0 ? -40 : 40), y: w.y + 10,
        speed: 0.3, typed: '', kind: 'normal', isSpecial: false,
        hp: 1, fireCooldown: 0, ghostPhase: 0, scrambled: false,
        stationaryX: 0, spawnTime: now,
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
  rankUpEvent: RankUpEvent | null;
  bonfireInfo: BonfireInfo | null;
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
        {/* Shake wrapper */}
        <div ref={p.shakeRef} className="absolute top-0 left-0 w-full h-full will-change-transform">
          <canvas ref={p.bgCanvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-0" />
          <canvas ref={p.canvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-10" />
          <canvas ref={p.textCanvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-40 pointer-events-none" />
          <img
            ref={p.playerImgRef}
            src="/idle1.png"
            data-state="idle"
            alt="Manus"
            className="absolute bottom-4 w-32 h-32 object-contain z-20 player-sprite"
            style={{left: (PLAYER.x + SPRITE_X_NUDGE) + 'px'}}
            draggable={false}
          />
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
        </div>

        {/* HUD / boss bar / rank-up (overlayed on top) */}
        {(p.phase === 'zone' || p.phase === 'boss') && (
          <>
            <Hud stats={p.hudStats} />
            <button
              onClick={() => p.setPaused(v => !v)}
              className="absolute top-8 right-8 z-50 px-4 py-2 border border-amber-900 text-amber-600 font-[Cinzel] hover:bg-amber-900/20 tracking-widest"
            >
              {p.paused ? 'RESUME' : 'PAUSE'}
            </button>
            {p.bossBarStats && <BossBar stats={p.bossBarStats} />}
          </>
        )}
        <RankUpBanner event={p.rankUpEvent} reduceMotion={p.settings.reduceMotion} />

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
            onAbandon={p.abandonRun}
          />
        )}

        {/* Settings overlay */}
        {p.showSettings && <SettingsScreen onClose={() => p.setShowSettings(false)} />}
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
