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
  deathStart: number;            // performance.now at moment of defeat (0 while alive)
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
    bossRef.current = {
      def,
      currentHp: def.maxHp,
      phaseIdx: 0,
      nextAttackAt: performance.now() + 1800,
      nextPhraseAt: performance.now() + 600,
      patternRotationIdx: 0,
      enraged: false,
      attackWindupT: 0,
      defeated: false,
      deathStart: 0,
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
    setBossBarStats(null);
    setShowSecretAsk(false);
    setYesChecked(false); setNoHoverPos(null);
    setKissPos(null);
    stopMusic(0.2);
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

    // ── Hit flash overlay ─────────────────────────────────────
    updateHitFlash(d, time, s.reduceMotion);

    // ── HUD tick (10 Hz) ──────────────────────────────────────
    if (time - lastHudBump > 100) {
      lastHudBump = time;
      pushHudStats(d);
      if (d.phaseRef.current === 'boss' && d.bossRef.current && !d.bossRef.current.defeated) {
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
    const pat = phase.patterns[b.patternRotationIdx % phase.patterns.length];
    b.patternRotationIdx += 1;
    spawnBossAttack(d, pat, phase.projectileLetters, time);
    b.nextAttackAt = time + phase.patternInterval * 1000;
  }
}

/** Spawn a wave of boss projectiles following the given pattern. */
function spawnBossAttack(d: LoopDeps, pattern: BossPattern, letters: string, time: number): void {
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  // Boss body position — projectiles spawn here (moved up so they don't
  // appear right next to the player).
  const BOSS_BODY_Y = 360;

  if (pattern === 'single') {
    // One letter, launched from boss center, slight aim toward player.
    d.projectilesRef.current.push({
      x: BOSS_AIM.x + (Math.random() - 0.5) * 40,
      y: BOSS_BODY_Y,
      vx: (PLAYER.x - BOSS_AIM.x) * 0.0012 + (Math.random() - 0.5) * 0.3,
      vy: 1.6,
      char: pick(),
      fromBoss: true,
      life: 520,
    });
  } else if (pattern === 'volley') {
    // Three simultaneous drops spread across the middle third of the screen —
    // chord-like. Drop at positions the player actually occupies horizontally.
    const xs = [BOSS_AIM.x - 140, BOSS_AIM.x, BOSS_AIM.x + 140];
    for (const x of xs) {
      d.projectilesRef.current.push({
        x, y: BOSS_BODY_Y + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 1.9,
        char: pick(),
        fromBoss: true,
        life: 500,
      });
    }
    // Small telegraph — quick screen flicker.
    triggerLightning(d.bgStateRef.current, time);
  } else if (pattern === 'wave') {
    // Slow-spinning bullet-hell spiral. 12 projectiles arranged around the boss,
    // rotating slowly while expanding outward. Passes through the player zone.
    const count = 12;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const angVel = direction * (0.012 + Math.random() * 0.008);
    const radVel = 0.9;
    for (let i = 0; i < count; i++) {
      const startAng = (i / count) * Math.PI * 2;
      d.projectilesRef.current.push({
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
  } else if (pattern === 'word') {
    // Fire a multi-letter WORD as a single falling projectile. Damages player
    // on contact; typing it destroys it (but doesn't damage the boss).
    const pool = ['DEATH', 'DOOM', 'WITHER', 'RUIN', 'ASHES', 'CURSE', 'PYRE', 'DUSK', 'ABYSS', 'BLIGHT'];
    const existingFirstLetters = new Set(d.wordsRef.current.map(w => w.text[0]));
    const available = pool.filter(w => !existingFirstLetters.has(w[0]));
    if (available.length === 0) return;
    const text = available[Math.floor(Math.random() * available.length)];
    // Spawn from boss center, drifting toward player.
    d.wordsRef.current.push({
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
    deathStart: b.deathStart,
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

    // Contact with player.
    const dxp = PLAYER.x - p.x, dyp = PLAYER.y - p.y;
    const distP = Math.sqrt(dxp * dxp + dyp * dyp);
    if (distP < 45) {
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

    // Caster: fire projectiles on cooldown. Fires a char that's visibly muzzle-
    // flashed at the caster's location so the player sees where it came from.
    if (w.kind === 'caster') {
      w.fireCooldown -= dt / 60;
      if (w.fireCooldown <= 0) {
        w.fireCooldown = 2.4 + Math.random() * 0.8;
        const spawnX = w.x + 40, spawnY = w.y + 10;
        d.projectilesRef.current.push({
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
    if (w.kind === 'chanter') {
      w.fireCooldown -= dt / 60;
      if (w.fireCooldown <= 0) {
        w.fireCooldown = 4.0 + Math.random() * 1.2;
        // Only spawn if there's a free first-letter to pick.
        const used = new Set(d.wordsRef.current.map(ww => ww.text[0]));
        const candidates = GOTHIC_WORDS.filter(x => x.length >= 3 && x.length <= 5 && !used.has(x[0]));
        if (candidates.length > 0) {
          const minionText = candidates[Math.floor(Math.random() * candidates.length)];
          d.wordsRef.current.push({
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

    // Aura on main canvas (action layer).
    drawWordAura(ctx, w, wordW, time, ENEMY_KINDS[w.kind].auraColor);

    // Boss-phrase gothic frame: clearly marks the word tied to the boss HP bar.
    if (w.isBossPhrase && d.bossRef.current) {
      const color = d.bossRef.current.def.themeColor;
      const padX = 18, padY = 14;
      const fx = w.x - padX, fy = w.y - 28 - padY;
      const fw = wordW + padX * 2, fh = 30 + padY * 2;
      const pulse = 0.55 + Math.sin(time * 0.004) * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Soft radial glow fill behind the frame.
      const g = ctx.createRadialGradient(fx + fw / 2, fy + fh / 2, 20, fx + fw / 2, fy + fh / 2, Math.max(fw, fh));
      g.addColorStop(0, hexA(color, 0.22 * pulse));
      g.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(fx - 40, fy - 40, fw + 80, fh + 80);
      ctx.restore();
      // Frame lines.
      ctx.save();
      ctx.strokeStyle = hexA(color, 0.85);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(fx, fy, fw, fh);
      ctx.stroke();
      // Gothic corner brackets.
      ctx.lineWidth = 2;
      const c = 10;
      const corners: [number, number][] = [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]];
      for (const [cx2, cy2] of corners) {
        const sx = cx2 === fx ? 1 : -1;
        const sy = cy2 === fy ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx2, cy2 + sy * c);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(cx2 + sx * c, cy2);
        ctx.stroke();
      }
      // Central banner label below the frame.
      ctx.fillStyle = hexA(color, 0.75);
      ctx.font = 'bold 10px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillText('◈ BOSS PHRASE ◈', fx + fw / 2, fy - 8);
      ctx.restore();
    }

    // Glyphs on text canvas (front layer).
    drawWordText(textCtx, w, widths, time, fontScale);

    // Contact with player — in zone phase for non-chanter enemies, OR during
    // boss fights for boss-attack word-projectiles.
    const canHitPlayer = (d.phaseRef.current === 'zone' && w.kind !== 'chanter')
                       || (d.phaseRef.current === 'boss' && w.isBossAttack);
    if (canHitPlayer) {
      const dx = PLAYER.x - w.x, dy = PLAYER.y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < HIT_RADIUS) {
        d.wordsRef.current.splice(i, 1);
        if (d.activeWordRef.current !== null) {
          if (d.activeWordRef.current === i) d.activeWordRef.current = null;
          else if (d.activeWordRef.current > i) d.activeWordRef.current -= 1;
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
