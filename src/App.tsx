/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useEffect, useRef, useState, useCallback, memo} from 'react';
import {GOTHIC_WORDS} from './constants';
import {
  DESIGN_W, DESIGN_H, PARTICLE_CAP, COMBO_RANKS,
  rankForCombo, setupHiDPICanvas, buildCharWidthCache, createBgState,
  drawBackground, drawWordAura, drawFireball, drawShockwave, drawParticle,
  type Word, type Fireball, type Particle, type Shockwave, type BgState, type Rank,
} from './graphics';

type HighScore = {souls: number; maxCombo: number};

// Where words target and fireballs launch from — the player's collision center.
// This should visually coincide with the character body inside the sprite PNG.
const PLAYER = {x: 512, y: 700};

// Sprite box sits centered at PLAYER.x + this nudge. Positive values push the
// sprite RIGHT to compensate for asymmetry in the PNG artwork (the character
// inside idle1/casting2 is drawn slightly left of the PNG's center).
const SPRITE_X_NUDGE = 14;

// Vertical contact radius around PLAYER where a word deals damage.
const HIT_RADIUS = 55;

// ─────────────────────────────────────────────────────────────
// HUD — a memoized subcomponent driven by a low-frequency tick,
// reading game values via a shared ref bag. Re-renders ~10×/s
// instead of on every keystroke.
// ─────────────────────────────────────────────────────────────

type HudStats = {
  score: number;
  health: number;
  combo: number;
  maxCombo: number;
  difficulty: number;
  accuracy: number;
  isBlessed: boolean;
  currentRank: Rank;
};

const Hud = memo(function Hud({stats}: {stats: HudStats}) {
  const hpPct = (stats.health / 10) * 100;
  const lowHp = stats.health <= 3;
  return (
    <div className="absolute top-8 left-8 flex flex-col gap-2 z-30 pointer-events-none select-none">
      {stats.isBlessed && (
        <div className="text-xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest animate-pulse drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] mb-1">
          BLESSED BY GODESS
        </div>
      )}
      <div className={`relative h-4 w-[300px] border transition-all duration-300 ${
        stats.isBlessed
          ? 'bg-[#1a000d] border-[#ff80cc] shadow-[0_0_20px_rgba(255,128,204,0.8)]'
          : lowHp
            ? 'bg-[#1a0a0a] border-[#ff3030] shadow-[0_0_18px_rgba(255,30,30,0.7)] animate-pulse'
            : 'bg-[#1a0a0a] border-[#3d1a1a]'
      }`}>
        <div
          className={`h-full transition-all duration-300 ${
            stats.isBlessed
              ? 'bg-linear-to-r from-[#ff0080] to-[#ff80cc]'
              : 'bg-linear-to-r from-[#8b0000] to-[#ff0000]'
          }`}
          style={{width: `${hpPct}%`}}
        />
        {/* Ember tick marks on the HP bar */}
        <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(90deg,transparent_0,transparent_28px,rgba(0,0,0,0.35)_28px,rgba(0,0,0,0.35)_30px)]" />
      </div>
      <div className="text-xl opacity-70 font-[Cinzel] hud-glow">Souls: {stats.score.toString().padStart(6, '0')}</div>
      <div className="text-xl opacity-60 font-[Cinzel]">Difficulty: {stats.difficulty}</div>
      <div className="text-sm opacity-60 font-[Cinzel]">Accuracy: {stats.accuracy}%</div>
      <div className="flex flex-col items-start gap-1 mt-2">
        <img
          src={`/${stats.currentRank.id}-removebg-preview.png`}
          alt={stats.currentRank.label}
          className={`h-18 object-contain ${stats.currentRank.id === 'SSS' ? 'animate-shake' : ''}`}
          draggable={false}
        />
        <div className={`text-xl font-[Cinzel] hud-glow ${stats.combo > 0 ? 'opacity-80' : 'opacity-50'}`}>
          x{stats.combo}
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────

export default function App() {
  // Screen & session state — drives React layout, not the game loop.
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [scale, setScale] = useState(1);
  const [isMobileFocused, setIsMobileFocused] = useState(false);
  const [highscores, setHighscores] = useState<HighScore[]>([]);
  const [finalStats, setFinalStats] = useState<{score: number; maxCombo: number; accuracy: number; topRank: Rank} | null>(null);

  // Hidden-romance side-screen state.
  const [secretPassword, setSecretPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showSecretScreen, setShowSecretScreen] = useState(false);
  const [yesChecked, setYesChecked] = useState(false);
  const [noHoverPos, setNoHoverPos] = useState<{x: number; y: number} | null>(null);
  const [secretHearts, setSecretHearts] = useState<{id: number; x: number; y: number; scale: number}[]>([]);
  const [kissPos, setKissPos] = useState<{x: number; y: number} | null>(null);

  // Canvas refs.
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerImgRef = useRef<HTMLImageElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Game-state refs (mutated inside the rAF loop, never cause re-renders).
  const scoreRef = useRef(0);
  const healthRef = useRef(10);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const correctKeyRef = useRef(0);
  const totalKeyRef = useRef(0);
  const difficultyRef = useRef(0);
  const isBlessedRef = useRef(false);
  const gameOverRef = useRef(false);
  const pausedRef = useRef(false);

  const wordsRef = useRef<Word[]>([]);
  const fireballsRef = useRef<Fireball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const bgStateRef = useRef<BgState>(createBgState());
  const activeWordRef = useRef<number | null>(null);
  const lastWordsRef = useRef<string[]>([]);
  const totalWordsSpawnedRef = useRef(0);

  const shakeUntilRef = useRef(0);
  const shakeMagRef = useRef(0);
  const castingUntilRef = useRef(0);
  const hitFlashUntilRef = useRef(0);
  const damageTextsRef = useRef<{x: number; y: number; value: string; life: number; maxLife: number}[]>([]);
  const screenFlashRef = useRef<HTMLDivElement>(null);
  const blessedTimeoutRef = useRef<number | null>(null);

  const startTimeRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const lastPauseAtRef = useRef(0);
  const charWidthsRef = useRef<Record<string, number>>({});

  // Preloaded audio for the smooch easter egg.
  const smoochAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const a = new Audio('/smooch.mp3');
    a.preload = 'auto';
    smoochAudioRef.current = a;
  }, []);

  // Low-frequency tick that drives the HUD re-render.
  const [hudStats, setHudStats] = useState<HudStats>({
    score: 0, health: 10, combo: 0, maxCombo: 0, difficulty: 0,
    accuracy: 100, isBlessed: false, currentRank: COMBO_RANKS[0],
  });

  // Load highscores on mount.
  useEffect(() => {
    const stored = localStorage.getItem('abyss_highscores');
    if (stored) {
      try { setHighscores(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  // Persist highscore once when the game ends — uses the frozen finalStats snapshot.
  useEffect(() => {
    if (!gameOver || !finalStats) return;
    const stored = localStorage.getItem('abyss_highscores');
    let current: HighScore[] = [];
    if (stored) { try { current = JSON.parse(stored); } catch { current = []; } }
    if (finalStats.score > 0) {
      current.push({souls: finalStats.score, maxCombo: finalStats.maxCombo});
      current.sort((a, b) => b.souls - a.souls);
      current = current.slice(0, 5);
      localStorage.setItem('abyss_highscores', JSON.stringify(current));
    }
    setHighscores(current);
  }, [gameOver, finalStats]);

  // Scale container to fit viewport.
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

  // Track paused state in ref + accumulate paused duration.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      lastPauseAtRef.current = Date.now();
    } else if (lastPauseAtRef.current > 0) {
      totalPausedMsRef.current += Date.now() - lastPauseAtRef.current;
      lastPauseAtRef.current = 0;
    }
  }, [paused]);

  // Clear blessed timeout on unmount.
  useEffect(() => {
    return () => {
      if (blessedTimeoutRef.current !== null) window.clearTimeout(blessedTimeoutRef.current);
    };
  }, []);

  // Keydown handler — stable reference, reads/writes refs only.
  const handleChar = useCallback((rawChar: string) => {
    if (gameOverRef.current || pausedRef.current || !started) return;
    const char = rawChar.toUpperCase();
    if (char.length !== 1 || char < 'A' || char > 'Z') return;

    totalKeyRef.current += 1;

    // Trigger casting sprite swap (no React state).
    const img = playerImgRef.current;
    if (img) {
      castingUntilRef.current = performance.now() + 180;
      if (img.dataset.state !== 'casting') {
        img.src = '/casting2.png';
        img.dataset.state = 'casting';
      }
    }

    const words = wordsRef.current;
    if (activeWordRef.current !== null) {
      const word = words[activeWordRef.current];
      if (word && word.text[word.typed.length] === char) {
        word.typed += char;
        correctKeyRef.current += 1;
        comboRef.current += 1;
        fireballsRef.current.push({
          x: PLAYER.x, y: PLAYER.y, tx: word.x, ty: word.y, progress: 0, isSpecial: word.isSpecial,
        });
        if (word.typed === word.text) {
          // Special word → heart-burst + full heal + blessed aura.
          if (word.isSpecial) {
            for (let i = 0; i < 80; i++) {
              const ang = Math.random() * Math.PI * 2;
              const spd = Math.random() * 6 + 2;
              particlesRef.current.push({
                x: word.x, y: word.y,
                vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                life: 40, maxLife: 40,
                size: 3, color: '#ff80cc', isHeart: true,
              });
            }
            healthRef.current = 10;
            isBlessedRef.current = true;
            if (blessedTimeoutRef.current !== null) window.clearTimeout(blessedTimeoutRef.current);
            blessedTimeoutRef.current = window.setTimeout(() => {
              isBlessedRef.current = false;
              blessedTimeoutRef.current = null;
            }, 10000);
          }
          words.splice(activeWordRef.current, 1);
          activeWordRef.current = null;
          scoreRef.current += word.text.length * 10;
          comboRef.current += 5;
          if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;
        }
      } else {
        comboRef.current = 0;
      }
    } else {
      const idx = words.findIndex(w => w.text.startsWith(char));
      if (idx !== -1) {
        words[idx].typed = char;
        correctKeyRef.current += 1;
        comboRef.current += 1;
        activeWordRef.current = idx;
        fireballsRef.current.push({
          x: PLAYER.x, y: PLAYER.y, tx: words[idx].x, ty: words[idx].y, progress: 0, isSpecial: words[idx].isSpecial,
        });
      } else {
        comboRef.current = 0;
      }
    }
    if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;
  }, [started]);

  // Main game loop.
  useEffect(() => {
    if (!started || gameOver) return;

    const bg = bgCanvasRef.current;
    const canvas = canvasRef.current;
    const textCanvas = textCanvasRef.current;
    if (!bg || !canvas || !textCanvas) return;

    const bgCtx = setupHiDPICanvas(bg, DESIGN_W, DESIGN_H);
    const ctx = setupHiDPICanvas(canvas, DESIGN_W, DESIGN_H);
    const textCtx = setupHiDPICanvas(textCanvas, DESIGN_W, DESIGN_H);

    // Build char-width cache once fonts are loaded — Cinzel is an @import.
    const buildWidths = () => {
      charWidthsRef.current = buildCharWidthCache(textCtx);
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(buildWidths);
    }
    buildWidths(); // fallback — uses whatever is loaded now.

    if (startTimeRef.current === 0) startTimeRef.current = Date.now();

    const keyListener = (e: KeyboardEvent) => {
      if (e.key.length === 1) handleChar(e.key);
    };
    window.addEventListener('keydown', keyListener);

    let rafId = 0;
    let lastTime = performance.now();
    let lastHudBump = 0;

    const loop = (time: number) => {
      if (gameOverRef.current) return;
      rafId = requestAnimationFrame(loop);

      if (pausedRef.current) { lastTime = time; return; }

      const dt = Math.min((time - lastTime) / (1000 / 60), 3);
      lastTime = time;

      // Restore idle sprite when casting window expires.
      if (castingUntilRef.current > 0 && time > castingUntilRef.current) {
        castingUntilRef.current = 0;
        const img = playerImgRef.current;
        if (img && img.dataset.state !== 'idle') {
          img.src = '/idle1.png';
          img.dataset.state = 'idle';
        }
      }

      const elapsed = (Date.now() - startTimeRef.current - totalPausedMsRef.current) / 1000;
      const diff = Math.min(elapsed / 210, 5);
      difficultyRef.current = Math.round(diff * 10);

      const spawnChance = (0.017 + diff * 0.007) * dt;
      const speedMod = 1 + diff * 0.4;

      // Background layer.
      const lowHp = healthRef.current <= 3;
      drawBackground(bgCtx, bgStateRef.current, time, dt, lowHp);

      // Camera shake (applied to the game + text canvases via CSS transform on the wrapper).
      let shakeX = 0, shakeY = 0;
      if (time < shakeUntilRef.current) {
        const mag = shakeMagRef.current;
        shakeX = (Math.random() - 0.5) * mag;
        shakeY = (Math.random() - 0.5) * mag;
      }
      if (shakeRef.current) {
        shakeRef.current.style.transform = `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px)`;
      }

      // Clear action + text layers.
      ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
      textCtx.clearRect(0, 0, DESIGN_W, DESIGN_H);

      // Spawn a new word?
      if (Math.random() < spawnChance) {
        const minLength = Math.min(Math.floor(3 + diff * 1.5), 12);
        const available = GOTHIC_WORDS.filter(w =>
          w.length >= minLength &&
          !wordsRef.current.some(existing => existing.text[0] === w[0]) &&
          !lastWordsRef.current.includes(w),
        );
        if (available.length > 0) {
          totalWordsSpawnedRef.current++;
          let newText = available[Math.floor(Math.random() * available.length)];
          let isSpecial = false;
          if (totalWordsSpawnedRef.current === 5 || (totalWordsSpawnedRef.current > 5 && Math.random() < 0.1)) {
            newText = 'JESSYKA';
            isSpecial = true;
          }
          const newX = Math.random() * (DESIGN_W - 200);
          if (!wordsRef.current.some(e => Math.abs(e.x - newX) < 150 && Math.abs(e.y - -50) < 100)) {
            wordsRef.current.push({
              text: newText, x: newX, y: -50,
              speed: (0.15 + Math.random() * 0.3) * speedMod,
              typed: '', isSpecial,
            });
            lastWordsRef.current.push(newText);
            if (lastWordsRef.current.length > 20) lastWordsRef.current.shift();
          }
        }
      }

      // Hoist current rank once per frame.
      const curRank = rankForCombo(comboRef.current);
      const curRankId = curRank.id;

      // ── Fireballs (reverse iteration so splice is safe).
      for (let i = fireballsRef.current.length - 1; i >= 0; i--) {
        const fb = fireballsRef.current[i];
        fb.progress += (fb.isSpecial ? 0.02 : 0.04) * dt;
        fb.x = PLAYER.x + (fb.tx - PLAYER.x) * fb.progress;
        fb.y = PLAYER.y + (fb.ty - PLAYER.y) * fb.progress;

        const color = drawFireball(ctx, fb, comboRef.current, curRankId);

        // Trailing sparks — throttled + capped.
        const isSpear = curRankId === 'S' || curRankId === 'SS' || curRankId === 'SSS';
        const trailCount = fb.isSpecial ? 2 : isSpear ? 4 : Math.min(3, Math.floor(comboRef.current / 30) + 1);
        for (let k = 0; k < trailCount; k++) {
          if (particlesRef.current.length >= PARTICLE_CAP) break;
          particlesRef.current.push({
            x: fb.x, y: fb.y,
            vx: (Math.random() - 0.5) * (isSpear ? 5 : 3),
            vy: (Math.random() - 0.5) * (isSpear ? 5 : 3),
            life: isSpear ? 14 : 8,
            maxLife: isSpear ? 14 : 8,
            size: 3,
            color: fb.isSpecial ? '#ff80cc' : color,
            isHeart: fb.isSpecial,
          });
        }

        if (fb.progress >= 1) {
          // Impact.
          const explosion = 8 + Math.floor(comboRef.current / 60);
          for (let j = 0; j < explosion * 4; j++) {
            if (particlesRef.current.length >= PARTICLE_CAP) break;
            particlesRef.current.push({
              x: fb.tx, y: fb.ty,
              vx: Math.random() * 8 - 4,
              vy: Math.random() * 8 - 4,
              life: 20, maxLife: 20, size: 3,
              color: fb.isSpecial ? '#ff80cc' : color,
              isHeart: fb.isSpecial,
            });
          }
          // Shockwave ring.
          shockwavesRef.current.push({
            x: fb.tx, y: fb.ty, radius: 4, maxRadius: isSpear ? 90 : 55,
            color: fb.isSpecial
              ? 'rgba(255,128,204,ALPHA)'
              : isSpear
                ? 'rgba(180,230,255,ALPHA)'
                : 'rgba(255,160,60,ALPHA)',
          });
          // Screen shake on impact — stronger for spears/specials.
          const mag = fb.isSpecial ? 8 : isSpear ? 6 : 3;
          shakeMagRef.current = Math.max(shakeMagRef.current, mag);
          shakeUntilRef.current = Math.max(shakeUntilRef.current, time + 140);

          // Knockback on nearby word.
          const wIdx = wordsRef.current.findIndex(w => Math.abs(w.x - fb.tx) < 70);
          if (wIdx !== -1) {
            const w = wordsRef.current[wIdx];
            const resistance = Math.min(w.typed.length / w.text.length, 0.9);
            const scl = 1 + comboRef.current / 150;
            w.y -= 5 * (1 - resistance) * scl;
          }
          fireballsRef.current.splice(i, 1);
        }
      }

      // ── Shockwaves.
      for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        const sw = shockwavesRef.current[i];
        sw.radius += 3.5 * dt;
        drawShockwave(ctx, sw);
        if (sw.radius >= sw.maxRadius) shockwavesRef.current.splice(i, 1);
      }

      // Decay shake magnitude once the window ends.
      if (time > shakeUntilRef.current) shakeMagRef.current = 0;

      // ── Particles.
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }
        drawParticle(ctx, p);
      }
      // Cap by dropping oldest if overflowed.
      if (particlesRef.current.length > PARTICLE_CAP) {
        particlesRef.current.splice(0, particlesRef.current.length - PARTICLE_CAP);
      }

      // ── Damage numbers — float up and fade.
      if (damageTextsRef.current.length > 0) {
        textCtx.font = 'bold 28px "Cinzel", serif';
        textCtx.textAlign = 'center';
        for (let i = damageTextsRef.current.length - 1; i >= 0; i--) {
          const d = damageTextsRef.current[i];
          d.y -= 1.2 * dt;
          d.life -= dt;
          if (d.life <= 0) {
            damageTextsRef.current.splice(i, 1);
            continue;
          }
          const alpha = Math.min(1, d.life / 30);
          textCtx.fillStyle = 'rgba(255, 60, 60, ' + alpha.toFixed(3) + ')';
          textCtx.shadowBlur = 14;
          textCtx.shadowColor = 'rgba(255, 0, 0, ' + (alpha * 0.9).toFixed(3) + ')';
          textCtx.fillText(d.value, d.x, d.y);
        }
        textCtx.textAlign = 'start';
        textCtx.shadowBlur = 0;
      }

      // ── Hit flash — drive the overlay's opacity imperatively.
      if (screenFlashRef.current) {
        if (time < hitFlashUntilRef.current) {
          const remaining = hitFlashUntilRef.current - time;
          // Fast spike, slow fall: ease-out cube.
          const t = Math.min(1, remaining / 320);
          screenFlashRef.current.style.opacity = (t * t * 0.85).toFixed(3);
        } else if (screenFlashRef.current.style.opacity !== '0') {
          screenFlashRef.current.style.opacity = '0';
        }
      }

      // ── Words: homing movement + aura + text rendering.
      const widths = charWidthsRef.current;
      textCtx.font = '24px "Cinzel", serif';
      textCtx.textBaseline = 'alphabetic';

      for (let i = wordsRef.current.length - 1; i >= 0; i--) {
        const w = wordsRef.current[i];
        const dx = PLAYER.x - w.x;
        const dy = PLAYER.y - w.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.001) {
          const v = (w.speed * 2 * dt) / dist;
          w.x += dx * v;
          w.y += dy * v;
        }

        // Compute total word width for aura sizing.
        let wordW = 0;
        for (let k = 0; k < w.text.length; k++) {
          wordW += widths[w.text[k]] ?? 14;
        }
        drawWordAura(ctx, w, wordW, time);

        // Render text letter-by-letter with cached widths.
        let cx = w.x;
        for (let k = 0; k < w.text.length; k++) {
          const ch = w.text[k];
          const typed = k < w.typed.length;
          textCtx.fillStyle = typed ? (w.isSpecial ? '#ff80cc' : '#ff6a20') : '#e6dcc5';
          if (typed) {
            textCtx.shadowBlur = 12;
            textCtx.shadowColor = w.isSpecial ? '#ff80cc' : '#ff4500';
          } else {
            textCtx.shadowBlur = 4;
            textCtx.shadowColor = 'rgba(0,0,0,0.9)';
          }
          textCtx.fillText(ch, cx, w.y);
          cx += widths[ch] ?? 14;
        }
        textCtx.shadowBlur = 0;

        // Contact damage — scales with difficulty (0→5) and word length.
        if (dist < HIT_RADIUS) {
          wordsRef.current.splice(i, 1);
          if (activeWordRef.current !== null) {
            if (activeWordRef.current === i) activeWordRef.current = null;
            else if (activeWordRef.current > i) activeWordRef.current -= 1;
          }
          const dmg = Math.ceil(1.5 + diff * 0.4 + w.text.length * 0.1);
          healthRef.current = Math.max(0, healthRef.current - dmg);

          // 1. Screen shake — magnitude scales with hit.
          const shake = 8 + Math.min(dmg, 10);
          shakeMagRef.current = Math.max(shakeMagRef.current, shake);
          shakeUntilRef.current = Math.max(shakeUntilRef.current, time + 260);

          // 2. Full-screen red flash overlay.
          hitFlashUntilRef.current = time + 320;

          // 3. Sprite hit flash (inline filter for an instant brightness pop).
          const img = playerImgRef.current;
          if (img) {
            img.style.filter = 'brightness(3.2) saturate(0) drop-shadow(0 0 24px rgba(255,60,60,0.9))';
            window.setTimeout(() => {
              if (playerImgRef.current) playerImgRef.current.style.filter = '';
            }, 140);
          }

          // 4. Floating damage number.
          damageTextsRef.current.push({
            x: PLAYER.x + (Math.random() - 0.5) * 20,
            y: PLAYER.y - 40,
            value: '-' + dmg,
            life: 55,
            maxLife: 55,
          });

          // 5. Shockwave ring at the impact point.
          shockwavesRef.current.push({
            x: PLAYER.x, y: PLAYER.y - 8,
            radius: 6, maxRadius: 120,
            color: 'rgba(255, 40, 40, ALPHA)',
          });

          // 6. Red blood burst — more particles, larger spread.
          const burstCount = 28 + dmg * 5;
          for (let j = 0; j < burstCount; j++) {
            if (particlesRef.current.length >= PARTICLE_CAP) break;
            const ang = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 7;
            particlesRef.current.push({
              x: PLAYER.x, y: PLAYER.y,
              vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2,
              life: 28, maxLife: 28, size: 3 + Math.random() * 2,
              color: Math.random() < 0.2 ? '#ff3030' : '#9b0000',
            });
          }
          if (healthRef.current === 0) {
            gameOverRef.current = true;
            // Freeze final stats then unblock React.
            const accuracy = totalKeyRef.current > 0
              ? Math.round((correctKeyRef.current / totalKeyRef.current) * 100) : 100;
            const top = rankForCombo(maxComboRef.current);
            setFinalStats({
              score: scoreRef.current,
              maxCombo: maxComboRef.current,
              accuracy,
              topRank: top,
            });
            setGameOver(true);
          }
        }
      }

      // ── HUD tick — 10 Hz is plenty for a counter.
      if (time - lastHudBump > 100) {
        lastHudBump = time;
        const accuracy = totalKeyRef.current > 0
          ? Math.round((correctKeyRef.current / totalKeyRef.current) * 100) : 100;
        setHudStats({
          score: scoreRef.current,
          health: healthRef.current,
          combo: comboRef.current,
          maxCombo: maxComboRef.current,
          difficulty: difficultyRef.current,
          accuracy,
          isBlessed: isBlessedRef.current,
          currentRank: rankForCombo(comboRef.current),
        });
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', keyListener);
    };
  }, [started, gameOver, handleChar]);

  // ── Side screen: romance easter egg.
  const runAway = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const maxX = DESIGN_W - 200;
    const maxY = DESIGN_H - 100;
    setNoHoverPos({
      x: Math.max(50, Math.floor(Math.random() * maxX)),
      y: Math.max(50, Math.floor(Math.random() * maxY)),
    });
  };

  // UI render — everything below is pure layout.
  return (
    <div
      className="w-full h-[100dvh] bg-black flex items-center justify-center font-serif text-[#d1c7b7] overflow-hidden"
      onClick={() => {
        if (started && !gameOver && !paused && mobileInputRef.current) {
          mobileInputRef.current.focus();
          setIsMobileFocused(true);
        }
      }}
    >
      {/* Hidden input for mobile keyboard triggering */}
      <input
        ref={mobileInputRef}
        type="text"
        className="absolute top-[-100px] left-0 opacity-0"
        value=""
        onBlur={() => setIsMobileFocused(false)}
        onChange={(e) => {
          const val = e.target.value;
          if (val.length > 0) handleChar(val[val.length - 1]);
        }}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <div
        className="relative shrink-0 w-[1024px] h-[768px] bg-black border-4 border-[#1c1c1c] shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden ce-frame"
        style={{transform: `scale(${scale})`, transformOrigin: 'center center'}}
      >
        {/* Shake wrapper — only wraps the canvases + player sprite so UI doesn't jitter. */}
        <div ref={shakeRef} className="absolute top-0 left-0 w-full h-full will-change-transform">
          <canvas ref={bgCanvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-0" />
          <canvas ref={canvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-10" />
          <canvas ref={textCanvasRef} width={DESIGN_W} height={DESIGN_H} className="absolute top-0 left-0 z-40 pointer-events-none" />
          <img
            ref={playerImgRef}
            src="/idle1.png"
            data-state="idle"
            alt="Manus"
            className="absolute bottom-4 w-32 h-32 object-contain z-20 player-sprite"
            style={{left: (PLAYER.x + SPRITE_X_NUDGE) + 'px'}}
            draggable={false}
          />
          {/* Red screen flash overlay — opacity driven imperatively from the game loop. */}
          <div
            ref={screenFlashRef}
            aria-hidden
            className="absolute inset-0 z-[25] pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 50% 90%, rgba(220,20,20,0.75) 0%, rgba(120,0,0,0.4) 40%, rgba(0,0,0,0) 80%)',
              opacity: 0,
              willChange: 'opacity',
            }}
          />
        </div>

        {!started && <MenuScreen onStart={() => setStarted(true)} />}

        {gameOver && !showSecretScreen && finalStats && (
          <GameOverScreen
            finalStats={finalStats}
            highscores={highscores}
            secretPassword={secretPassword}
            passwordError={passwordError}
            setSecretPassword={setSecretPassword}
            setPasswordError={setPasswordError}
            onUnlock={() => setShowSecretScreen(true)}
          />
        )}

        {showSecretScreen && !yesChecked && (
          <SecretAskScreen
            yesChecked={yesChecked}
            setYesChecked={setYesChecked}
            noHoverPos={noHoverPos}
            runAway={runAway}
            onBack={() => setShowSecretScreen(false)}
          />
        )}

        {showSecretScreen && yesChecked && (
          <SecretLoveScreen
            secretHearts={secretHearts}
            setSecretHearts={setSecretHearts}
            setKissPos={setKissPos}
            smoochAudio={smoochAudioRef.current}
            onBack={() => { setYesChecked(false); setNoHoverPos(null); }}
          />
        )}

        {started && !gameOver && (
          <>
            <button
              onClick={() => setPaused(p => !p)}
              className="absolute top-8 right-8 z-50 px-4 py-2 border border-amber-900 text-amber-600 font-[Cinzel] hover:bg-amber-900/20 tracking-widest"
            >
              {paused ? 'RESUME' : 'PAUSE'}
            </button>
            <Hud stats={hudStats} />
          </>
        )}

        {started && !gameOver && !paused && !isMobileFocused && (
          <div className="absolute top-[80%] left-1/2 -translate-x-1/2 z-[60] bg-black/60 px-6 py-2 border border-amber-900/40 animate-pulse pointer-events-none md:hidden">
            <span className="font-[Cinzel] tracking-[0.2em] text-amber-600/80 uppercase">Tap screen to type</span>
          </div>
        )}
      </div>

      {kissPos && (
        <img
          src="/kiss-removebg-preview.png"
          alt="Kiss Cursor"
          className="fixed pointer-events-none z-[9999] w-24 h-24 object-contain -translate-x-1/2 -translate-y-1/2"
          style={{left: kissPos.x, top: kissPos.y}}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screens — pulled out so App's render stays focused on layout.
// ─────────────────────────────────────────────────────────────

function MenuScreen({onStart}: {onStart: () => void}) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black/90 flex flex-col items-center justify-center z-50 p-8 text-center ce-menu-bg">
      <div className="ce-menu-embers" aria-hidden />
      <h1 className="relative font-[Cinzel] text-5xl md:text-6xl text-amber-700 mb-2 tracking-[0.3em] drop-shadow-[0_0_25px_rgba(180,83,9,0.6)] ce-title">
        CURSED ECHOES
      </h1>
      <div className="ce-sigil mb-8" aria-hidden />
      <div className="relative max-w-md bg-amber-950/20 border border-amber-900/40 p-6 rounded mb-12 backdrop-blur-sm shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        <h2 className="font-[Cinzel] text-amber-600 text-xl mb-4 tracking-widest uppercase border-b border-amber-900/30 pb-2">How to Play</h2>
        <ul className="text-amber-100/70 text-sm space-y-3 font-serif tracking-wide text-left list-none">
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Type the echoes appearing from the darkness to banish them with fire.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Do not let the echoes reach your position, or your life will wither.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Maintain your combo to ascend through the ranks of the Abyss.</span></li>
        </ul>
      </div>
      <button
        onClick={onStart}
        className="relative group px-16 py-6 overflow-hidden border border-amber-900 bg-black text-amber-600 font-[Cinzel] text-2xl tracking-[0.3em] transition-all hover:text-amber-300 hover:border-amber-500 shadow-[0_0_20px_rgba(127,29,29,0.3)] ce-start-btn"
      >
        <div className="absolute inset-0 w-0 bg-amber-900/20 transition-all duration-300 ease-out group-hover:w-full"></div>
        <span className="relative z-10 animate-pulse">CHALLENGE THE ABYSS</span>
      </button>
      <p className="mt-8 text-amber-900/40 font-serif text-xs tracking-widest uppercase">The darkness waits for no one</p>
    </div>
  );
}

function GameOverScreen({
  finalStats, highscores, secretPassword, passwordError, setSecretPassword, setPasswordError, onUnlock,
}: {
  finalStats: {score: number; maxCombo: number; accuracy: number; topRank: Rank};
  highscores: HighScore[];
  secretPassword: string;
  passwordError: boolean;
  setSecretPassword: (v: string) => void;
  setPasswordError: (v: boolean) => void;
  onUnlock: () => void;
}) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black z-50 flex flex-col items-center justify-center fade-in ce-death-bg">
      <div className="ce-death-embers" aria-hidden />
      <div className="ce-died-vignette" aria-hidden />
      <div className="relative flex items-center justify-center">
        <div className="ce-died-smoke" aria-hidden />
        <div className="ce-died">YOU DIED</div>
      </div>
      <div className="mt-8 text-2xl opacity-0 font-[Cinzel] slide-in" style={{animationDelay: '2200ms'}}>Souls Harvested: {finalStats.score}</div>
      <div className="mt-2 text-2xl opacity-0 font-[Cinzel] slide-in flex items-center" style={{animationDelay: '2400ms'}}>
        Max Combo: {finalStats.maxCombo}
        <img src={`/${finalStats.topRank.id}-removebg-preview.png`} alt={finalStats.topRank.label} className="h-10 object-contain mx-2" />
      </div>
      <div className="mt-2 text-2xl opacity-0 font-[Cinzel] slide-in" style={{animationDelay: '2600ms'}}>Accuracy: {finalStats.accuracy}%</div>

      <div className="mt-12 flex flex-col items-center opacity-0 fade-in" style={{animationDelay: '2900ms'}}>
        <p className="text-lg text-[#ff4444] font-bold mb-4 font-[Cinzel] tracking-[0.5em] uppercase drop-shadow-[0_0_15px_rgba(255,0,0,0.8)] animate-pulse">Secret Password</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (secretPassword.toUpperCase() === 'ILOVEMYGF') {
            onUnlock();
          } else {
            setPasswordError(true);
            window.setTimeout(() => setPasswordError(false), 500);
            setSecretPassword('');
          }
        }} className="flex">
          <input
            type="password"
            value={secretPassword}
            onChange={(e) => setSecretPassword(e.target.value)}
            className={`bg-[#0a0000] border ${passwordError ? 'border-red-500 shadow-[0_0_20px_rgba(255,0,0,0.6)]' : 'border-[#ff4444]/60 shadow-[0_0_20px_rgba(255,0,0,0.3)]'} text-red-100 font-serif text-center px-6 py-3 outline-none focus:border-[#ff4444] focus:shadow-[0_0_25px_rgba(255,0,0,0.5)] transition-all tracking-[0.4em] placeholder:text-[#ff4444]/30 w-64 ${passwordError ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
            placeholder="..."
          />
        </form>
      </div>

      <button onClick={() => location.reload()} className="mt-12 px-8 py-2 border border-amber-900/40 hover:bg-amber-900/10 transition-colors uppercase text-lg tracking-widest font-[Cinzel] opacity-0 fade-in" style={{animationDelay: '3200ms'}}>Try Again</button>

      <div className="absolute right-8 bottom-8 flex flex-col items-center z-[60] opacity-0 fade-in w-48" style={{animationDelay: '3000ms'}}>
        <h2 className="text-[#8b0000] font-[Cinzel] tracking-widest text-[1rem] leading-none mb-3 border-b border-[#8b0000]/50 pb-1 drop-shadow-[0_0_10px_rgba(139,0,0,0.8)] uppercase">Hall of Records</h2>
        {highscores.length === 0 ? (
          <div className="text-amber-700/50 font-[Cinzel] italic text-xs">No legendary souls yet...</div>
        ) : highscores.map((hs, i) => (
          <div key={i} className="flex flex-col w-full mb-2 bg-black/60 px-3 py-2 rounded-sm border border-amber-900/40 hover:bg-amber-900/10 transition-colors shadow-lg">
            <div className="flex justify-between items-end mb-1">
              <span className="text-amber-700/80 font-[Cinzel] text-xs tracking-widest">Rank {i + 1}</span>
              <span className="text-[#8b0000] font-[Cinzel] text-xl drop-shadow-[0_0_8px_rgba(139,0,0,0.6)] font-bold">{hs.souls.toString().padStart(6, '0')}</span>
            </div>
            <div className="flex justify-between border-t border-amber-900/30 pt-1 mt-1">
              <span className="text-[#a19787] font-[Cinzel] text-[9px] uppercase tracking-widest">Max Combo</span>
              <span className="text-amber-500 font-[Cinzel] text-xs font-bold">{hs.maxCombo}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecretAskScreen({
  yesChecked, setYesChecked, noHoverPos, runAway, onBack,
}: {
  yesChecked: boolean;
  setYesChecked: (v: boolean) => void;
  noHoverPos: {x: number; y: number} | null;
  runAway: (e?: React.MouseEvent | React.TouchEvent) => void;
  onBack: () => void;
}) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-[#050002] z-[100] flex flex-col items-center justify-center fade-in">
      <button onClick={onBack} className="absolute top-8 left-8 z-[120] text-[#ff80cc]/60 hover:text-[#ff80cc] font-[Cinzel] tracking-widest transition-all drop-shadow-[0_0_10px_rgba(255,128,204,0.3)] hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)]">← BACK</button>
      <img src="/Jessyka.gif" alt="Jessyka" className="w-auto h-[350px] object-cover rounded-2xl mb-8" />
      <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center mb-12">
        Får jag chans på dig? &lt;3
      </h1>
      <div className="flex gap-16 w-full justify-center">
        <label className="flex items-center gap-2 cursor-pointer group">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={yesChecked}
              onChange={(e) => setYesChecked(e.target.checked)}
              className="peer appearance-none w-4 h-4 border border-[#ff80cc]/50 rounded-[2px] bg-black/50 checked:bg-[#ff80cc] checked:border-[#ff80cc] transition-all cursor-pointer shadow-[0_0_10px_rgba(255,128,204,0.2)]"
            />
            <svg className="absolute w-2.5 h-2.5 text-[#050002] pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <span className="text-xl text-[#ff80cc]/70 font-[Cinzel] tracking-widest group-hover:text-[#ff80cc] group-hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] transition-all">JA OMG</span>
        </label>
        <label
          className={`flex items-center gap-2 cursor-pointer group ${noHoverPos ? 'absolute' : ''} transition-all duration-100 z-[110]`}
          style={noHoverPos ? {left: `${noHoverPos.x}px`, top: `${noHoverPos.y}px`} : {}}
          onMouseEnter={runAway}
          onClick={runAway}
          onTouchStart={runAway}
        >
          <div className="relative flex items-center justify-center pointer-events-none">
            <input type="checkbox" checked={false} onChange={() => {}} className="peer appearance-none w-4 h-4 border border-[#ff80cc]/50 rounded-[2px] bg-black/50 transition-all shadow-[0_0_10px_rgba(255,128,204,0.2)]" tabIndex={-1} />
            <svg className="absolute w-2.5 h-2.5 text-[#050002] opacity-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <span className="text-xl text-[#ff80cc]/70 font-[Cinzel] tracking-widest group-hover:text-[#ff80cc] group-hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)] transition-all pointer-events-none">NEJ USCHH</span>
        </label>
      </div>
    </div>
  );
}

function SecretLoveScreen({
  secretHearts, setSecretHearts, setKissPos, smoochAudio, onBack,
}: {
  secretHearts: {id: number; x: number; y: number; scale: number}[];
  setSecretHearts: React.Dispatch<React.SetStateAction<{id: number; x: number; y: number; scale: number}[]>>;
  setKissPos: (p: {x: number; y: number} | null) => void;
  smoochAudio: HTMLAudioElement | null;
  onBack: () => void;
}) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-[#050002] z-[100] flex flex-col items-center justify-center fade-in">
      <button onClick={onBack} className="absolute top-8 left-8 z-[120] text-[#ff80cc]/60 hover:text-[#ff80cc] font-[Cinzel] tracking-widest transition-all drop-shadow-[0_0_10px_rgba(255,128,204,0.3)] hover:drop-shadow-[0_0_15px_rgba(255,128,204,0.8)]">← BACK</button>
      <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center mb-8">CLICK ME!!!!</h1>
      <img
        src="/placeholder.jpg"
        alt="Placeholder"
        className="w-auto h-[350px] object-cover rounded-2xl mb-8 hover:shadow-[0_0_30px_rgba(255,128,204,0.6)] transition-all active:scale-95 cursor-none"
        onMouseEnter={(e) => setKissPos({x: e.clientX, y: e.clientY})}
        onMouseMove={(e) => setKissPos({x: e.clientX, y: e.clientY})}
        onMouseLeave={() => setKissPos(null)}
        onClick={() => {
          if (smoochAudio) {
            try {
              smoochAudio.currentTime = 0;
              void smoochAudio.play();
            } catch { /* ignore */ }
          }
          const numHearts = 15;
          const newHearts = Array.from({length: numHearts}).map((_, i) => ({
            id: Date.now() + i + Math.random(),
            x: Math.random() * DESIGN_W,
            y: Math.random() * DESIGN_H,
            scale: Math.random() * 0.8 + 0.5,
          }));
          setSecretHearts(prev => [...prev, ...newHearts]);
          window.setTimeout(() => {
            setSecretHearts(prev => prev.filter(h => !newHearts.find(n => n.id === h.id)));
          }, 2000);
        }}
      />
      <h1 className="text-4xl md:text-5xl text-[#ff80cc] font-[Cinzel] font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,128,204,0.9)] animate-pulse text-center">
        Jag älskar dig baby &lt;333
      </h1>
      {secretHearts.map(heart => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-[120] animate-float-heart"
          style={{left: heart.x, top: heart.y, ['--scale' as any]: heart.scale}}
        >
          <span className="text-6xl drop-shadow-[0_0_10px_rgba(255,128,204,0.8)]">❤️</span>
        </div>
      ))}
    </div>
  );
}
