/**
 * Cursed Echoes — low-level canvas rendering + atmosphere layer.
 * Pure functions + small particle pools. No React, no audio, no DOM.
 */

import type {EnemyKind} from './game/config';

export const DESIGN_W = 1024;
export const DESIGN_H = 768;
export const PARTICLE_CAP = 600;
const BG_EMBER_CAP = 140;

export const COMBO_RANKS = [
  {count: 0,   label: 'Dismal',               id: 'D'},
  {count: 20,  label: 'Crazy',                id: 'C'},
  {count: 40,  label: 'Badass',               id: 'B'},
  {count: 60,  label: 'Apocalyptic',          id: 'A'},
  {count: 80,  label: 'Savage!',              id: 'S'},
  {count: 100, label: 'Sick Skills!!',        id: 'SS'},
  {count: 120, label: "Smokin' Sexy Style!!", id: 'SSS'},
] as const;

export type Rank = (typeof COMBO_RANKS)[number];
export type RankId = Rank['id'];

export function rankForCombo(combo: number): Rank {
  for (let i = COMBO_RANKS.length - 1; i >= 0; i--) {
    if (combo >= COMBO_RANKS[i].count) return COMBO_RANKS[i];
  }
  return COMBO_RANKS[0];
}

// ─────────────────────────────────────────────────────────────
// Entity types
// ─────────────────────────────────────────────────────────────

export type Word = {
  id: number;                         // unique — stable identifier across splices
  text: string;
  x: number;
  y: number;
  speed: number;
  typed: string;
  kind: EnemyKind;
  isSpecial: boolean;                 // JESSYKA heart word
  hp: number;                         // tank armor ticks (cosmetic)
  fireCooldown: number;               // caster: seconds until next projectile
  ghostPhase: number;                 // 0..1 — alpha flicker state
  scrambled: boolean;                 // reserved (unused — kept for schema stability)
  stationaryX: number;                // chanter: fixed x; words keep their own
  spawnTime: number;
  isBossAttack?: boolean;             // word-projectile fired by a boss
  isBossPhrase?: boolean;             // stationary phrase that damages the boss when completed
  isBossSummoned?: boolean;           // summoner/caster spawned by a boss pattern
  // 0.3.0 — AfroMan "munchie" word. Doesn't damage HP on contact; instead
  // applies a stack of the ZOOTED debuff. Renders with a greenish haze.
  isMunchie?: boolean;
  jessykaTarget?: boolean;            // claimed by the Jessyka companion; player cannot start typing this
  // New in 0.2.10 — Jessyka grace shield push. While `graceUntil > time` the
  // word skips its normal homing-toward-player movement and instead drifts
  // along (graceVx, graceVy) which decays each frame. Creates the "swept
  // outward by the love wave" visual.
  graceUntil?: number;
  graceVx?: number;
  graceVy?: number;
  // Spawn animation for boss-summoned minions and lich children. While active,
  // the word is untypable and rendered scaled/lerped from source→target. Source/target
  // are optional (omitted for static spawners like summoner/caster).
  spawnAnim?: {
    start: number;
    duration: number;
    sourceX?: number;
    sourceY?: number;
    targetX?: number;
    targetY?: number;
  };
};

export type Fireball = {
  x: number; y: number;
  tx: number; ty: number;
  progress: number;
  isSpecial: boolean;
  targetBoss: boolean;
  bossDamage?: number;                // amount to deduct from boss HP on impact
  chaseProjectileId?: number;         // if set, fireball homes on this projectile until intercept
  life?: number;                      // seconds of grace for chase fireballs before they self-detonate
  // 0.3.0 — AfroMan perfect-parry. Set when the chase fireball was spawned
  // by a parry within the PERFECT window of a detected beat. On intercept
  // it returns PERFECT_PARRY_BOSS_DMG to the AfroMan boss.
  perfectParryBonus?: boolean;
};

export type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  isHeart?: boolean;
};

export type Shockwave = {
  x: number; y: number;
  radius: number;
  maxRadius: number;
  color: string;
};

export type Ember = {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  flicker: number;
};

/** Single-letter projectile fired by caster words OR by bosses. Homes downward. */
export type Projectile = {
  id: number;                        // stable unique id so fireballs can chase across frames
  x: number; y: number;
  vx: number; vy: number;
  char: string;
  fromBoss: boolean;
  life: number;                      // seconds
  deflected?: boolean;               // player parried — no longer damages; waits for chase-fireball intercept
  // 0.3.0 — AfroMan tall-can projectile marker. Renders a silhouette of a
  // tall can behind the digit glyph (amber rectangle with ridged stripes).
  isTallCan?: boolean;
  // 0.3.0 — true if the projectile was spawned ON a detected beat. Used for
  // perfect-parry scoring — a parry during the tiny window after its spawn
  // grants 2× damage + PERFECT popup.
  onBeat?: boolean;
  spawnedAt?: number;                // performance.now at spawn; used with onBeat
  // Spiral-pattern fields — when set, position is computed from origin/ang/radius
  // each frame instead of from linear vx/vy. Used by the "wave" bullet-hell attack.
  spiralOrigin?: {x: number; y: number};
  spiralAng?: number;
  spiralRadius?: number;
  spiralAngVel?: number;
  spiralRadVel?: number;
  // Trail points for dramatic caster projectiles.
  trail?: {x: number; y: number}[];
};

export type ImpactDecal = {
  x: number; y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
};

export type Crow = {
  x: number; y: number;
  vx: number;
  wingPhase: number;
  life: number;
};

export type EyePair = {
  x: number; y: number;
  life: number;
  maxLife: number;
};

// ─────────────────────────────────────────────────────────────
// Background scene state
// ─────────────────────────────────────────────────────────────

export type Star = {x: number; y: number; size: number; twinkle: number};
export type Torch = {x: number; y: number; seed: number};
export type Chain = {x: number; yTop: number; yBot: number; swaySeed: number};
export type BonfireEmber = {x: number; y: number; vx: number; vy: number; life: number; maxLife: number};
export type RainDrop = {x: number; y: number; vy: number};
export type AshFlake = {x: number; y: number; vx: number; vy: number; life: number; rotation: number; rotSpeed: number};
export type EmberFall = {x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number};

export type BgState = {
  embers: Ember[];
  stars: Star[];
  torches: Torch[];
  chains: Chain[];
  bonfireEmbers: BonfireEmber[];
  rainDrops: RainDrop[];
  ashFlakes: AshFlake[];
  emberFall: EmberFall[];
  crows: Crow[];
  eyes: EyePair[];
  decals: ImpactDecal[];
  lightningStart: number;
  nextLightningAt: number;
  weather: 'none' | 'rain' | 'ash' | 'godrays' | 'emberstorm';
  tintColor: string;
  zoomScale: number;
  zoneId: 'firelink' | 'burg' | 'anorlondo' | 'kiln';
};

export function createBgState(): BgState {
  const stars: Star[] = [];
  for (let i = 0; i < 45; i++) {
    stars.push({
      x: Math.random() * DESIGN_W,
      y: Math.random() * 280,
      size: Math.random() < 0.15 ? 1.6 : 0.9,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  const torches: Torch[] = [
    {x: 150, y: 395, seed: 0.17}, {x: 300, y: 360, seed: 0.53},
    {x: 395, y: 395, seed: 0.29}, {x: 620, y: 405, seed: 0.71},
    {x: 790, y: 395, seed: 0.42}, {x: 930, y: 395, seed: 0.88},
  ];
  const chains: Chain[] = [
    {x: 90,  yTop: 0, yBot: 180, swaySeed: 0.21},
    {x: 940, yTop: 0, yBot: 200, swaySeed: 0.67},
    {x: 180, yTop: 0, yBot: 120, swaySeed: 0.43},
  ];
  return {
    embers: seedEmbers(BG_EMBER_CAP),
    stars, torches, chains,
    bonfireEmbers: [],
    rainDrops: [],
    ashFlakes: [],
    emberFall: [],
    crows: [],
    eyes: [],
    decals: [],
    lightningStart: 0,
    nextLightningAt: 6000 + Math.random() * 12000,
    weather: 'none',
    tintColor: 'rgba(0,0,0,0)',
    zoomScale: 1,
    zoneId: 'firelink',
  };
}

export function setZoneStyling(bg: BgState, weather: BgState['weather'], tint: string, zoneId: BgState['zoneId']): void {
  bg.weather = weather;
  bg.tintColor = tint;
  bg.zoneId = zoneId;
}

function seedEmbers(count: number): Ember[] {
  const out: Ember[] = [];
  for (let i = 0; i < count; i++) out.push(makeEmber(Math.random() * DESIGN_H));
  return out;
}

function makeEmber(yOverride?: number): Ember {
  const maxLife = 240 + Math.random() * 240;
  return {
    x: Math.random() * DESIGN_W,
    y: yOverride ?? DESIGN_H + 20,
    vx: (Math.random() - 0.5) * 0.2,
    vy: -0.3 - Math.random() * 0.9,
    life: maxLife, maxLife,
    size: 0.8 + Math.random() * 1.8,
    hue: 18 + Math.random() * 22,
    flicker: Math.random() * Math.PI * 2,
  };
}

// ─────────────────────────────────────────────────────────────
// Canvas setup + typography
// ─────────────────────────────────────────────────────────────

export function setupHiDPICanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function buildCharWidthCache(ctx: CanvasRenderingContext2D): Record<string, number> {
  ctx.font = '24px "Cinzel", serif';
  const cache: Record<string, number> = {};
  for (let c = 65; c <= 90; c++) {
    const ch = String.fromCharCode(c);
    cache[ch] = ctx.measureText(ch).width;
  }
  cache[' '] = ctx.measureText(' ').width;
  return cache;
}

// ─────────────────────────────────────────────────────────────
// Background scene — Dark-Souls-inspired.
// ─────────────────────────────────────────────────────────────

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: BgState,
  time: number,
  dt: number,
  lowHp: boolean,
  dof: boolean,
): void {
  // 1. Zone-specific scene: sky + distant + mid-ground silhouettes + torches/chains.
  switch (bg.zoneId) {
    case 'firelink':  drawSceneFirelink(ctx, bg, time);  break;
    case 'burg':      drawSceneBurg(ctx, bg, time);      break;
    case 'anorlondo': drawSceneAnorLondo(ctx, bg, time); break;
    case 'kiln':      drawSceneKiln(ctx, bg, time);      break;
  }
  // 2. Universal atmosphere (weather, fauna, bonfire glow, embers).
  if (bg.weather === 'godrays') drawGodRays(ctx, time);
  drawFog(ctx, time);
  drawEyes(ctx, bg, dt);
  drawCrows(ctx, bg, dt);
  drawBonfire(ctx, bg, time, dt);
  drawEmbers(ctx, bg.embers, dt);
  drawWeather(ctx, bg, dt);
  updateLightning(bg, time);
  drawLightningFlash(ctx, bg, time);
  drawVignette(ctx, time, lowHp);
  if (bg.tintColor !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = bg.tintColor;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }
  if (dof) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, DESIGN_H * 0.5);
    g.addColorStop(0, 'rgba(10,8,12,0.18)');
    g.addColorStop(1, 'rgba(10,8,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H * 0.5);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// Scene 1 — Firelink Shrine: calm amber sunset, small stone shrine,
// the iconic sword-in-bonfire in the distance, a single crow on a post.
// ─────────────────────────────────────────────────────────────

function drawSceneFirelink(ctx: CanvasRenderingContext2D, bg: BgState, time: number): void {
  // Warm sunset sky.
  const sky = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
  sky.addColorStop(0.00, '#1a0e1c');
  sky.addColorStop(0.35, '#3a1410');
  sky.addColorStop(0.62, '#8a3614');
  sky.addColorStop(0.78, '#4a170a');
  sky.addColorStop(0.92, '#1a0806');
  sky.addColorStop(1.00, '#050202');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // Setting sun — half-sunk below the horizon. The horizon line (y=540) cuts it.
  const sunX = 540, sunY = 520, sunR = 68;
  const sunPulse = 0.9 + Math.sin(time * 0.0008) * 0.1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 420);
  halo.addColorStop(0,   'rgba(255, 180, 90, ' + (0.55 * sunPulse).toFixed(3) + ')');
  halo.addColorStop(0.3, 'rgba(255, 120, 40, ' + (0.3 * sunPulse).toFixed(3) + ')');
  halo.addColorStop(0.7, 'rgba(150, 50, 20, ' + (0.12 * sunPulse).toFixed(3) + ')');
  halo.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 420, sunY - 420, 840, 840);
  ctx.restore();
  // Disc — clipped so only the portion above the horizon shows.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, DESIGN_W, 540);       // horizon clip
  ctx.clip();
  ctx.fillStyle = '#ffd48a';
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
  // Subtle warmer core.
  const core = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  core.addColorStop(0, 'rgba(255, 230, 180, 0.9)');
  core.addColorStop(0.6, 'rgba(255, 180, 90, 0.5)');
  core.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  ctx.restore();

  // Horizon mist — soft yellow-orange blend that fades the sun's bottom into land.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const mist = ctx.createLinearGradient(0, 510, 0, 570);
  mist.addColorStop(0, 'rgba(255, 150, 70, 0)');
  mist.addColorStop(0.5, 'rgba(255, 130, 60, 0.28)');
  mist.addColorStop(1, 'rgba(120, 40, 20, 0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, 500, DESIGN_W, 80);
  ctx.restore();

  // Distant rolling hills — continuous, no awkward gaps.
  ctx.save();
  ctx.fillStyle = '#0c0508';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, 555);
  ctx.bezierCurveTo(120, 540, 220, 560, 340, 548);
  ctx.bezierCurveTo(440, 540, 500, 552, 560, 545);
  ctx.bezierCurveTo(640, 538, 720, 560, 820, 552);
  ctx.bezierCurveTo(900, 546, 970, 562, DESIGN_W, 555);
  ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath(); ctx.fill();
  // Nearer hills — one layer on top, slightly lighter for depth.
  ctx.fillStyle = '#050203';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, 610);
  ctx.bezierCurveTo(150, 585, 280, 620, 420, 608);
  ctx.bezierCurveTo(560, 596, 700, 625, 820, 615);
  ctx.bezierCurveTo(900, 608, 970, 620, DESIGN_W, 612);
  ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // The shrine — moved to the left, scaled down, perched on the nearer hill.
  drawFirelinkShrine(ctx, 220, 610, time);

  // Sword in the bonfire — iconic, right of center, on the nearer hill.
  drawSwordInBonfire(ctx, 720, 612, time);

  // A single broken archway silhouette deep in the background (behind the sun).
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(10, 5, 8, 0.85)';
  ctx.beginPath();
  ctx.moveTo(860, 555);
  ctx.lineTo(860, 420);
  ctx.lineTo(880, 400);
  ctx.lineTo(890, 430);
  // chunk missing
  ctx.lineTo(905, 420);
  ctx.lineTo(920, 435);
  ctx.lineTo(930, 420);
  ctx.lineTo(930, 555);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Foreground rocks / broken stones framing.
  ctx.save();
  ctx.fillStyle = '#040103';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, 680);
  ctx.lineTo(50, 672);
  ctx.lineTo(90, 690);
  ctx.lineTo(130, 700);
  ctx.lineTo(140, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(DESIGN_W, DESIGN_H);
  ctx.lineTo(DESIGN_W, 680);
  ctx.lineTo(DESIGN_W - 70, 690);
  ctx.lineTo(DESIGN_W - 130, 705);
  ctx.lineTo(DESIGN_W - 170, 715);
  ctx.lineTo(DESIGN_W - 170, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawFirelinkShrine(ctx: CanvasRenderingContext2D, cx: number, baseY: number, time: number): void {
  // Stone body.
  ctx.fillStyle = '#060405';
  ctx.beginPath();
  ctx.moveTo(cx - 70, baseY);
  ctx.lineTo(cx - 70, baseY - 100);
  ctx.lineTo(cx - 40, baseY - 140);
  ctx.lineTo(cx - 30, baseY - 160);       // roof peak left
  ctx.lineTo(cx,       baseY - 175);
  ctx.lineTo(cx + 30, baseY - 160);
  ctx.lineTo(cx + 40, baseY - 140);
  ctx.lineTo(cx + 70, baseY - 100);
  ctx.lineTo(cx + 70, baseY);
  ctx.closePath(); ctx.fill();
  // Arched doorway with warm inner glow.
  const doorGlow = 0.6 + Math.sin(time * 0.003) * 0.25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const ga = ctx.createRadialGradient(cx, baseY - 30, 0, cx, baseY - 30, 80);
  ga.addColorStop(0, 'rgba(255, 170, 80, ' + (0.7 * doorGlow).toFixed(3) + ')');
  ga.addColorStop(0.5, 'rgba(220, 90, 30, ' + (0.35 * doorGlow).toFixed(3) + ')');
  ga.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ga;
  ctx.fillRect(cx - 80, baseY - 110, 160, 130);
  ctx.restore();
  // Arched opening.
  ctx.fillStyle = '#1a0804';
  ctx.beginPath();
  ctx.moveTo(cx - 20, baseY);
  ctx.lineTo(cx - 20, baseY - 40);
  ctx.quadraticCurveTo(cx, baseY - 70, cx + 20, baseY - 40);
  ctx.lineTo(cx + 20, baseY);
  ctx.closePath(); ctx.fill();
  // Small side window glowing faintly.
  const winPulse = 0.5 + Math.sin(time * 0.004) * 0.3;
  ctx.fillStyle = 'rgba(230, 140, 60, ' + (0.55 * winPulse).toFixed(3) + ')';
  ctx.fillRect(cx - 55, baseY - 70, 6, 14);
  ctx.fillRect(cx + 49, baseY - 70, 6, 14);
}

function drawSwordInBonfire(ctx: CanvasRenderingContext2D, cx: number, baseY: number, time: number): void {
  // Ember glow under the sword.
  const flick = 0.75 + Math.sin(time * 0.018) * 0.15 + Math.sin(time * 0.043) * 0.1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, 90 * flick);
  g.addColorStop(0, 'rgba(255, 170, 80, ' + (0.7 * flick).toFixed(3) + ')');
  g.addColorStop(0.4, 'rgba(220, 90, 30, ' + (0.35 * flick).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 100, baseY - 100, 200, 140);
  ctx.restore();
  // The sword silhouette stabbed into the ground.
  ctx.save();
  ctx.strokeStyle = '#1e1014';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, baseY + 8);
  ctx.lineTo(cx, baseY - 60);
  ctx.stroke();
  // Crossguard.
  ctx.beginPath();
  ctx.moveTo(cx - 10, baseY - 56);
  ctx.lineTo(cx + 10, baseY - 56);
  ctx.stroke();
  // Pommel.
  ctx.fillStyle = '#1e1014';
  ctx.beginPath();
  ctx.arc(cx, baseY - 64, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// Scene 2 — Undead Burg: overcast ruined city, rain, crumbling towers.
// ─────────────────────────────────────────────────────────────

function drawSceneBurg(ctx: CanvasRenderingContext2D, bg: BgState, time: number): void {
  // Stormy overcast sky.
  const sky = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
  sky.addColorStop(0.00, '#0a0812');
  sky.addColorStop(0.45, '#161524');
  sky.addColorStop(0.75, '#1c1820');
  sky.addColorStop(1.00, '#050406');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // Distant dim orange spot — a single faraway fire.
  const fireX = 780, fireY = 440;
  const fFlick = 0.8 + Math.sin(time * 0.014) * 0.12;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fh = ctx.createRadialGradient(fireX, fireY, 0, fireX, fireY, 180);
  fh.addColorStop(0, 'rgba(220, 100, 40, ' + (0.35 * fFlick).toFixed(3) + ')');
  fh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fh;
  ctx.fillRect(fireX - 180, fireY - 180, 360, 360);
  ctx.restore();

  // Distant jagged silhouette — broken city skyline.
  ctx.save();
  ctx.fillStyle = '#080610';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, 480);
  // Ragged rooftops.
  const roofs: Array<[number, number]> = [
    [70, 450], [130, 475], [190, 440], [240, 475],
    [310, 420], [360, 460], [420, 430], [470, 470],
    [540, 435], [600, 480], [660, 445], [720, 470],
    [790, 425], [860, 470], [930, 450], [990, 480],
  ];
  for (const [rx, ry] of roofs) {
    ctx.lineTo(rx - 10, ry);
    ctx.lineTo(rx, ry - 10);
    ctx.lineTo(rx + 10, ry);
  }
  ctx.lineTo(DESIGN_W, 480);
  ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Mid-ground: broken tower, left of center.
  drawBurgTower(ctx, 230, 620, time, true);
  // Smaller intact tower, right.
  drawBurgTower(ctx, 760, 620, time, false);
  // Crumbling archway foreground, center.
  drawBurgArchway(ctx, 512, 660, time);

  // Foreground rubble / debris.
  ctx.save();
  ctx.fillStyle = '#020104';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H); ctx.lineTo(0, 680);
  ctx.lineTo(90, 700); ctx.lineTo(60, 720); ctx.lineTo(140, 710);
  ctx.lineTo(200, 730); ctx.lineTo(170, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(DESIGN_W, DESIGN_H); ctx.lineTo(DESIGN_W, 690);
  ctx.lineTo(DESIGN_W - 100, 705); ctx.lineTo(DESIGN_W - 60, 720);
  ctx.lineTo(DESIGN_W - 160, 735); ctx.lineTo(DESIGN_W - 190, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Flickering torches on the surviving walls.
  drawZoneTorches(ctx, [
    {x: 200, y: 550, seed: 0.23},
    {x: 760, y: 540, seed: 0.61},
    {x: 512, y: 590, seed: 0.37},
  ], time);
}

function drawBurgTower(ctx: CanvasRenderingContext2D, cx: number, baseY: number, time: number, broken: boolean): void {
  ctx.save();
  ctx.fillStyle = '#060508';
  ctx.beginPath();
  const h = broken ? 230 : 290;
  const w = 60;
  ctx.moveTo(cx - w, baseY);
  ctx.lineTo(cx - w, baseY - h);
  if (broken) {
    // Jagged broken top.
    ctx.lineTo(cx - w + 6,  baseY - h - 12);
    ctx.lineTo(cx - 8, baseY - h + 6);
    ctx.lineTo(cx + 4, baseY - h - 20);
    ctx.lineTo(cx + 20, baseY - h + 14);
    ctx.lineTo(cx + w - 6, baseY - h - 6);
  } else {
    // Crenellated top.
    for (let k = 0; k <= 6; k++) {
      const x = cx - w + (k * w * 2 / 6);
      ctx.lineTo(x, baseY - h - (k % 2 === 0 ? 12 : 0));
      ctx.lineTo(x + w / 3, baseY - h - (k % 2 === 0 ? 12 : 0));
    }
  }
  ctx.lineTo(cx + w, baseY - h);
  ctx.lineTo(cx + w, baseY);
  ctx.closePath(); ctx.fill();
  // Arrowslit glow.
  const slitGlow = 0.5 + Math.sin(time * 0.004 + cx) * 0.3;
  ctx.fillStyle = 'rgba(220, 130, 50, ' + (0.6 * slitGlow).toFixed(3) + ')';
  ctx.fillRect(cx - 2, baseY - h * 0.55, 4, 14);
  if (!broken) ctx.fillRect(cx - 2, baseY - h * 0.3, 4, 14);
  ctx.restore();
}

function drawBurgArchway(ctx: CanvasRenderingContext2D, cx: number, baseY: number, time: number): void {
  ctx.save();
  ctx.fillStyle = '#040308';
  // Left pillar of archway.
  ctx.fillRect(cx - 90, baseY - 180, 28, 180);
  // Right pillar.
  ctx.fillRect(cx + 62, baseY - 180, 28, 180);
  // Arch top — partially crumbled.
  ctx.beginPath();
  ctx.moveTo(cx - 90, baseY - 180);
  ctx.quadraticCurveTo(cx - 60, baseY - 220, cx - 20, baseY - 215);
  ctx.lineTo(cx - 10, baseY - 205);  // broken chunk missing
  ctx.lineTo(cx + 30, baseY - 218);
  ctx.quadraticCurveTo(cx + 70, baseY - 212, cx + 90, baseY - 180);
  ctx.lineTo(cx + 62, baseY - 180);
  ctx.quadraticCurveTo(cx, baseY - 198, cx - 62, baseY - 180);
  ctx.closePath(); ctx.fill();
  // Hanging chain from archway.
  const sway = Math.sin(time * 0.001) * 3;
  ctx.strokeStyle = 'rgba(15, 10, 12, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - 205);
  ctx.quadraticCurveTo(cx + sway * 0.5, baseY - 160, cx + sway, baseY - 110);
  ctx.stroke();
  ctx.fillStyle = 'rgba(15, 10, 12, 0.95)';
  ctx.beginPath(); ctx.arc(cx + sway, baseY - 108, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawZoneTorches(ctx: CanvasRenderingContext2D, torches: Torch[], time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of torches) {
    const flick = 0.65 + Math.sin(time * 0.012 + t.seed * 20) * 0.2 + Math.sin(time * 0.031 + t.seed * 13) * 0.15;
    const r = 28 + flick * 6;
    const halo = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
    halo.addColorStop(0, 'rgba(255, 170, 70, ' + (0.9 * flick).toFixed(3) + ')');
    halo.addColorStop(0.4, 'rgba(220, 90, 30, ' + (0.4 * flick).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(255, 220, 150, ' + (0.9 * flick).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(t.x, t.y, 2 + flick * 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// Scene 3 — Anor Londo: majestic golden cathedral with rose window.
// This is the existing scene, kept + polished.
// ─────────────────────────────────────────────────────────────

function drawSceneAnorLondo(ctx: CanvasRenderingContext2D, bg: BgState, time: number): void {
  drawSky(ctx);
  drawStars(ctx, bg.stars, time);
  drawMoon(ctx, time);
  drawCloudBand(ctx, time);
  drawMountains(ctx);
  drawCathedral(ctx, time);
  drawMidSpires(ctx);
  drawZoneTorches(ctx, bg.torches, time);
  drawChains(ctx, bg.chains, time);
  drawForegroundPillars(ctx);
}

// ─────────────────────────────────────────────────────────────
// Scene 4 — Kiln of the First Flame: ancient ash, circle of pillars,
// the First Flame itself throbbing at the center-back.
// ─────────────────────────────────────────────────────────────

function drawSceneKiln(ctx: CanvasRenderingContext2D, bg: BgState, time: number): void {
  // Bleached-ash sky — smoky greys + hot orange horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
  sky.addColorStop(0.00, '#2a1612');
  sky.addColorStop(0.35, '#4a2014');
  sky.addColorStop(0.60, '#7a2e10');
  sky.addColorStop(0.80, '#3a1808');
  sky.addColorStop(1.00, '#180806');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // The First Flame — massive throbbing orange sphere behind the pillars.
  const fx = 512, fy = 480;
  const pulse = 0.85 + Math.sin(time * 0.0018) * 0.15 + Math.sin(time * 0.0051) * 0.05;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(fx, fy, 0, fx, fy, 440);
  halo.addColorStop(0, 'rgba(255, 200, 100, ' + (0.7 * pulse).toFixed(3) + ')');
  halo.addColorStop(0.25, 'rgba(255, 120, 40, ' + (0.45 * pulse).toFixed(3) + ')');
  halo.addColorStop(0.6, 'rgba(180, 40, 10, ' + (0.2 * pulse).toFixed(3) + ')');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(fx - 440, fy - 440, 880, 880);
  // Hot core.
  const core = ctx.createRadialGradient(fx, fy, 0, fx, fy, 90);
  core.addColorStop(0, 'rgba(255, 250, 220, ' + (0.9 * pulse).toFixed(3) + ')');
  core.addColorStop(0.5, 'rgba(255, 180, 80, ' + (0.6 * pulse).toFixed(3) + ')');
  core.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = core;
  ctx.fillRect(fx - 90, fy - 90, 180, 180);
  ctx.restore();

  // Distant bleached rubble line (a ring of ancient ruins).
  ctx.save();
  ctx.fillStyle = '#1a1210';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H); ctx.lineTo(0, 550);
  ctx.lineTo(120, 540); ctx.lineTo(220, 555); ctx.lineTo(320, 545);
  ctx.lineTo(440, 560); ctx.lineTo(580, 550); ctx.lineTo(700, 558);
  ctx.lineTo(820, 548); ctx.lineTo(920, 560); ctx.lineTo(DESIGN_W, 552);
  ctx.lineTo(DESIGN_W, DESIGN_H); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Ring of tilted pillars.
  drawKilnPillars(ctx, time);

  // Heat shimmer over the horizon — subtle undulation.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const yBand = 500 + i * 40 + Math.sin(time * 0.002 + i) * 6;
    const g = ctx.createLinearGradient(0, yBand - 20, 0, yBand + 20);
    g.addColorStop(0, 'rgba(255, 140, 60, 0)');
    g.addColorStop(0.5, 'rgba(255, 140, 60, ' + (0.08 - i * 0.02).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, yBand - 20, DESIGN_W, 40);
  }
  ctx.restore();

  // Foreground shattered stones.
  ctx.save();
  ctx.fillStyle = '#0c0604';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H); ctx.lineTo(0, 660);
  ctx.lineTo(70, 650); ctx.lineTo(110, 680); ctx.lineTo(160, 695);
  ctx.lineTo(200, DESIGN_H); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(DESIGN_W, DESIGN_H); ctx.lineTo(DESIGN_W, 660);
  ctx.lineTo(DESIGN_W - 80, 675); ctx.lineTo(DESIGN_W - 140, 695);
  ctx.lineTo(DESIGN_W - 210, DESIGN_H); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawKilnPillars(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.fillStyle = '#0a0608';
  // Pillars tilted slightly outward, arranged as if circling the flame.
  const pillars = [
    {x: 180,  h: 380, tilt:  0.08, w: 44},
    {x: 290,  h: 420, tilt:  0.05, w: 46},
    {x: 400,  h: 460, tilt:  0.03, w: 48},
    {x: 620,  h: 470, tilt: -0.03, w: 48},
    {x: 730,  h: 420, tilt: -0.05, w: 46},
    {x: 840,  h: 380, tilt: -0.08, w: 44},
  ];
  for (const p of pillars) {
    const baseY = 700;
    const topY = baseY - p.h;
    const topOffset = p.h * p.tilt;
    ctx.beginPath();
    ctx.moveTo(p.x - p.w / 2, baseY);
    ctx.lineTo(p.x - p.w / 2 + topOffset, topY);
    // Broken jagged top.
    ctx.lineTo(p.x - p.w / 4 + topOffset, topY - 10);
    ctx.lineTo(p.x + topOffset, topY + 4);
    ctx.lineTo(p.x + p.w / 4 + topOffset, topY - 8);
    ctx.lineTo(p.x + p.w / 2 + topOffset, topY);
    ctx.lineTo(p.x + p.w / 2, baseY);
    ctx.closePath(); ctx.fill();
    // Rim light facing the flame.
    ctx.strokeStyle = 'rgba(255, 120, 40, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const rimSide = p.x < 512 ? 1 : -1;
    ctx.moveTo(p.x + rimSide * p.w / 2 * 0.9, baseY);
    ctx.lineTo(p.x + topOffset + rimSide * p.w / 2 * 0.9, topY);
    ctx.stroke();
    // Slight ember flicker along the top.
    const flick = 0.4 + Math.sin(time * 0.01 + p.x) * 0.2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 150, 60, ' + (0.25 * flick).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(p.x + topOffset, topY - 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}



// ── Sky + fixtures (unchanged structure, kept concise) ─────────
function drawSky(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
  g.addColorStop(0.00, '#0a0614');
  g.addColorStop(0.35, '#140817');
  g.addColorStop(0.60, '#1a0808');
  g.addColorStop(0.80, '#0c0404');
  g.addColorStop(1.00, '#030202');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  const h = ctx.createRadialGradient(DESIGN_W/2, DESIGN_H*0.55, 60, DESIGN_W/2, DESIGN_H*0.55, 520);
  h.addColorStop(0, 'rgba(160, 50, 15, 0.45)');
  h.addColorStop(0.4, 'rgba(90, 25, 10, 0.22)');
  h.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of stars) {
    const a = 0.3 + Math.sin(time * 0.001 + s.twinkle) * 0.25;
    ctx.fillStyle = 'rgba(230, 220, 200, ' + Math.max(0.05, a).toFixed(3) + ')';
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.restore();
}

function drawMoon(ctx: CanvasRenderingContext2D, time: number): void {
  const cx = 820, cy = 130, r = 38;
  const pulse = 0.85 + Math.sin(time * 0.0006) * 0.15;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
  halo.addColorStop(0, 'rgba(230, 210, 170, ' + (0.35 * pulse).toFixed(3) + ')');
  halo.addColorStop(0.3, 'rgba(200, 150, 110, ' + (0.15 * pulse).toFixed(3) + ')');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 180, cy - 180, 360, 360);
  ctx.restore();
  ctx.fillStyle = '#ddcba0';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(60, 40, 20, 0.25)';
  ctx.beginPath(); ctx.arc(cx + 6, cy + 4, r * 0.9, 0, Math.PI * 2); ctx.fill();
  const cloudX = ((time * 0.005) % (DESIGN_W + 300)) - 150;
  ctx.fillStyle = 'rgba(10, 5, 15, 0.55)';
  ctx.beginPath(); ctx.ellipse(cx - 20 + cloudX * 0.02, cy + 2, 60, 4, 0, 0, Math.PI * 2); ctx.fill();
}

function drawCloudBand(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 4; i++) {
    const yBase = 180 + i * 35;
    const offset = (time * (0.01 + i * 0.004)) % (DESIGN_W + 400);
    const x = (-200 + offset) - 200;
    const alpha = 0.05 + i * 0.015;
    const g = ctx.createLinearGradient(x, yBase - 25, x, yBase + 25);
    g.addColorStop(0, 'rgba(60, 25, 40, 0)');
    g.addColorStop(0.5, 'rgba(90, 35, 50, ' + alpha + ')');
    g.addColorStop(1, 'rgba(60, 25, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, yBase - 30, 700, 60);
  }
  ctx.restore();
}

function drawMountains(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = '#0e0a14';
  ctx.beginPath();
  const baseY = DESIGN_H * 0.55;
  ctx.moveTo(0, DESIGN_H); ctx.lineTo(0, baseY);
  const peaks: [number, number][] = [
    [60,40],[130,75],[200,30],[280,95],[360,50],[430,90],[510,25],[590,80],
    [670,45],[750,95],[830,40],[910,85],[990,55],
  ];
  for (const [px, ph] of peaks) {
    ctx.lineTo(px - 30, baseY); ctx.lineTo(px, baseY - ph); ctx.lineTo(px + 30, baseY);
  }
  ctx.lineTo(DESIGN_W, baseY); ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(140, 60, 30, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, baseY);
  for (const [px, ph] of peaks) { ctx.lineTo(px - 30, baseY); ctx.lineTo(px, baseY - ph); ctx.lineTo(px + 30, baseY); }
  ctx.lineTo(DESIGN_W, baseY); ctx.stroke();
  ctx.restore();
}

function drawCathedral(ctx: CanvasRenderingContext2D, time: number): void {
  const baseY = DESIGN_H * 0.68;
  const cx = DESIGN_W / 2;
  const glow = ctx.createRadialGradient(cx, baseY - 80, 20, cx, baseY - 80, 300);
  glow.addColorStop(0, 'rgba(180, 80, 30, 0.25)');
  glow.addColorStop(0.5, 'rgba(120, 40, 15, 0.12)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow; ctx.fillRect(cx - 300, baseY - 380, 600, 460);
  ctx.save();
  ctx.fillStyle = '#050308';
  ctx.beginPath();
  const tL = {x: 420, w: 70, h: 360};
  ctx.moveTo(tL.x, baseY);
  ctx.lineTo(tL.x, baseY - tL.h);
  ctx.lineTo(tL.x - 4, baseY - tL.h - 8);
  ctx.lineTo(tL.x + tL.w / 2, baseY - tL.h - 48);
  ctx.lineTo(tL.x + tL.w + 4, baseY - tL.h - 8);
  ctx.lineTo(tL.x + tL.w, baseY - tL.h);
  ctx.lineTo(tL.x + tL.w, baseY - 240);
  ctx.lineTo(430, baseY - 240); ctx.lineTo(430, baseY - 260);
  ctx.quadraticCurveTo(cx, baseY - 320, 594, baseY - 260);
  ctx.lineTo(594, baseY - 240);
  const tR = {x: 534, w: 70, h: 360};
  ctx.lineTo(tR.x, baseY - 240);
  ctx.lineTo(tR.x, baseY - tR.h);
  ctx.lineTo(tR.x - 4, baseY - tR.h - 8);
  ctx.lineTo(tR.x + tR.w / 2, baseY - tR.h - 48);
  ctx.lineTo(tR.x + tR.w + 4, baseY - tR.h - 8);
  ctx.lineTo(tR.x + tR.w, baseY - tR.h);
  ctx.lineTo(tR.x + tR.w, baseY);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(340, baseY); ctx.lineTo(340, baseY - 80); ctx.lineTo(420, baseY - 160);
  ctx.lineTo(420, baseY - 140); ctx.lineTo(360, baseY - 70); ctx.lineTo(360, baseY);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(684, baseY); ctx.lineTo(684, baseY - 80); ctx.lineTo(604, baseY - 160);
  ctx.lineTo(604, baseY - 140); ctx.lineTo(664, baseY - 70); ctx.lineTo(664, baseY);
  ctx.closePath(); ctx.fill();
  const roseX = cx, roseY = baseY - 185, roseR = 34;
  const rp = 0.7 + Math.sin(time * 0.002) * 0.3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rh = ctx.createRadialGradient(roseX, roseY, 0, roseX, roseY, 120);
  rh.addColorStop(0, 'rgba(255, 120, 40, ' + (0.5 * rp).toFixed(3) + ')');
  rh.addColorStop(0.4, 'rgba(200, 60, 20, ' + (0.25 * rp).toFixed(3) + ')');
  rh.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rh; ctx.fillRect(roseX - 120, roseY - 120, 240, 240);
  ctx.restore();
  ctx.fillStyle = '#ff6a20';
  ctx.beginPath(); ctx.arc(roseX, roseY, roseR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#05030899'; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(roseX, roseY);
    ctx.lineTo(roseX + Math.cos(ang) * roseR, roseY + Math.sin(ang) * roseR); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(roseX, roseY, roseR * 0.45, 0, Math.PI * 2); ctx.stroke();
  const wp = 0.6 + Math.sin(time * 0.003) * 0.3;
  ctx.fillStyle = 'rgba(210, 120, 50, ' + (0.55 * wp).toFixed(3) + ')';
  for (const x of [tL.x + 20, tL.x + 44, tR.x + 20, tR.x + 44]) {
    ctx.fillRect(x - 3, baseY - 280, 6, 14);
    ctx.fillRect(x - 3, baseY - 200, 6, 14);
  }
  ctx.restore();
}

function drawMidSpires(ctx: CanvasRenderingContext2D): void {
  const baseY = DESIGN_H * 0.72;
  ctx.save();
  ctx.fillStyle = '#030206';
  const spires = [
    {x:60,h:130,w:40},{x:150,h:180,w:52},{x:230,h:140,w:42},{x:300,h:190,w:56},
    {x:395,h:170,w:48},{x:620,h:175,w:50},{x:710,h:210,w:58},{x:790,h:170,w:46},
    {x:870,h:145,w:40},{x:960,h:175,w:48},
  ];
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H); ctx.lineTo(0, baseY);
  for (const s of spires) {
    const left = s.x - s.w / 2, right = s.x + s.w / 2;
    ctx.lineTo(left, baseY); ctx.lineTo(left, baseY - s.h * 0.6);
    ctx.quadraticCurveTo(s.x, baseY - s.h - 25, right, baseY - s.h * 0.6);
    ctx.lineTo(right, baseY);
  }
  ctx.lineTo(DESIGN_W, baseY); ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawTorches(ctx: CanvasRenderingContext2D, torches: Torch[], time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of torches) {
    const flick = 0.65 + Math.sin(time * 0.012 + t.seed * 20) * 0.2 + Math.sin(time * 0.031 + t.seed * 13) * 0.15;
    const r = 28 + flick * 6;
    const halo = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
    halo.addColorStop(0, 'rgba(255, 170, 70, ' + (0.9 * flick).toFixed(3) + ')');
    halo.addColorStop(0.4, 'rgba(220, 90, 30, ' + (0.4 * flick).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo; ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(255, 220, 150, ' + (0.9 * flick).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(t.x, t.y, 2 + flick * 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawChains(ctx: CanvasRenderingContext2D, chains: Chain[], time: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 10, 12, 0.9)';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(15, 10, 12, 0.95)';
  for (const c of chains) {
    const sway = Math.sin(time * 0.0008 + c.swaySeed * 10) * 4;
    const bottomX = c.x + sway;
    ctx.beginPath();
    ctx.moveTo(c.x, c.yTop);
    ctx.quadraticCurveTo((c.x + bottomX) / 2, (c.yTop + c.yBot) / 2 + 8, bottomX, c.yBot);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(bottomX, c.yBot, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFog(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let b = 0; b < 4; b++) {
    const yBand = 420 + b * 70 + Math.sin(time * 0.0005 + b) * 20;
    const alpha = 0.04 + b * 0.012;
    const fog = ctx.createLinearGradient(0, yBand - 80, 0, yBand + 80);
    fog.addColorStop(0, 'rgba(40, 30, 60, 0)');
    fog.addColorStop(0.5, 'rgba(70, 50, 85, ' + alpha + ')');
    fog.addColorStop(1, 'rgba(40, 30, 60, 0)');
    ctx.fillStyle = fog; ctx.fillRect(0, yBand - 90, DESIGN_W, 180);
  }
  const lowFog = ctx.createLinearGradient(0, DESIGN_H - 180, 0, DESIGN_H);
  lowFog.addColorStop(0, 'rgba(80, 60, 90, 0)');
  lowFog.addColorStop(1, 'rgba(80, 60, 90, 0.15)');
  ctx.fillStyle = lowFog; ctx.fillRect(0, DESIGN_H - 180, DESIGN_W, 180);
  ctx.restore();
}

function drawForegroundPillars(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = '#020104';
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H); ctx.lineTo(0, 180); ctx.lineTo(22, 160);
  ctx.lineTo(18, 200); ctx.lineTo(30, 240); ctx.lineTo(40, 300);
  ctx.lineTo(36, 380); ctx.lineTo(44, 460); ctx.lineTo(38, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(DESIGN_W, DESIGN_H); ctx.lineTo(DESIGN_W, 200); ctx.lineTo(DESIGN_W - 28, 170);
  ctx.lineTo(DESIGN_W - 20, 220); ctx.lineTo(DESIGN_W - 36, 280); ctx.lineTo(DESIGN_W - 26, 360);
  ctx.lineTo(DESIGN_W - 44, 440); ctx.lineTo(DESIGN_W - 34, DESIGN_H);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(120, 50, 20, 0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(38, 420); ctx.lineTo(44, 460); ctx.lineTo(38, 540); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(DESIGN_W - 38, 420); ctx.lineTo(DESIGN_W - 44, 460); ctx.lineTo(DESIGN_W - 38, 540); ctx.stroke();
  ctx.restore();
}

function drawBonfire(ctx: CanvasRenderingContext2D, bg: BgState, time: number, dt: number): void {
  const cx = 512, cy = 730;
  const flick = 0.75 + Math.sin(time * 0.015) * 0.15 + Math.sin(time * 0.037) * 0.1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 180 * flick;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, 'rgba(255, 160, 70, ' + (0.55 * flick).toFixed(3) + ')');
  glow.addColorStop(0.3, 'rgba(220, 90, 30, ' + (0.3 * flick).toFixed(3) + ')');
  glow.addColorStop(0.7, 'rgba(120, 30, 10, 0.1)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  if (bg.bonfireEmbers.length < 30 && Math.random() < 0.4 * dt) {
    const maxLife = 40 + Math.random() * 30;
    bg.bonfireEmbers.push({
      x: cx + (Math.random() - 0.5) * 30, y: cy - 4,
      vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random() * 1.2,
      life: maxLife, maxLife,
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = bg.bonfireEmbers.length - 1; i >= 0; i--) {
    const e = bg.bonfireEmbers[i];
    e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
    if (e.life <= 0) { bg.bonfireEmbers.splice(i, 1); continue; }
    const t = e.life / e.maxLife;
    ctx.fillStyle = 'rgba(255, 180, 80, ' + (t * 0.9).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(e.x, e.y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawEmbers(ctx: CanvasRenderingContext2D, embers: Ember[], dt: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt; e.flicker += 0.08 * dt;
    if (e.life <= 0 || e.y < -10) { embers[i] = makeEmber(); continue; }
    const lifeT = e.life / e.maxLife;
    const pulse = 0.55 + Math.sin(e.flicker) * 0.35;
    const alpha = Math.min(1, lifeT * 1.4) * pulse;
    ctx.fillStyle = 'hsla(' + e.hue + ', 95%, 55%, ' + alpha.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function updateLightning(bg: BgState, time: number): void {
  if (bg.lightningStart === 0 && time >= bg.nextLightningAt) {
    bg.lightningStart = time;
    bg.nextLightningAt = time + 15000 + Math.random() * 20000;
  }
  if (bg.lightningStart > 0 && time - bg.lightningStart > 420) bg.lightningStart = 0;
}

export function triggerLightning(bg: BgState, time: number): void {
  bg.lightningStart = time;
}

function drawLightningFlash(ctx: CanvasRenderingContext2D, bg: BgState, time: number): void {
  if (bg.lightningStart === 0) return;
  const t = time - bg.lightningStart;
  let intensity = 0;
  if (t < 80) intensity = t / 80;
  else if (t < 160) intensity = 1 - (t - 80) / 80 * 0.6;
  else if (t < 240) intensity = 0.4 + (t - 160) / 80 * 0.5;
  else intensity = Math.max(0, 0.9 - (t - 240) / 180);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(160, 180, 220, ' + (intensity * 0.55).toFixed(3) + ')';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, time: number, lowHp: boolean): void {
  if (lowHp) {
    const pulse = 0.45 + Math.sin(time * 0.008) * 0.2;
    const vg = ctx.createRadialGradient(DESIGN_W/2, DESIGN_H/2, 240, DESIGN_W/2, DESIGN_H/2, 620);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(140, 0, 0, ' + pulse.toFixed(3) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  } else {
    const vg = ctx.createRadialGradient(DESIGN_W/2, DESIGN_H/2, 300, DESIGN_W/2, DESIGN_H/2, 680);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }
}

// ─────────────────────────────────────────────────────────────
// Weather: rain, ash, godrays, emberstorm
// ─────────────────────────────────────────────────────────────

function drawWeather(ctx: CanvasRenderingContext2D, bg: BgState, dt: number): void {
  if (bg.weather === 'rain') drawRain(ctx, bg, dt);
  else if (bg.weather === 'ash') drawAsh(ctx, bg, dt);
  else if (bg.weather === 'emberstorm') drawEmberStorm(ctx, bg, dt);
  // godrays are drawn before fog in the main scene order
}

function drawRain(ctx: CanvasRenderingContext2D, bg: BgState, dt: number): void {
  // Top up drops.
  while (bg.rainDrops.length < 120) {
    bg.rainDrops.push({
      x: Math.random() * DESIGN_W,
      y: Math.random() * DESIGN_H * 0.8,
      vy: 10 + Math.random() * 6,
    });
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 160, 200, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const r of bg.rainDrops) {
    r.y += r.vy * dt;
    if (r.y > DESIGN_H) { r.y = -10; r.x = Math.random() * DESIGN_W; }
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x - 2, r.y + 12);
  }
  ctx.stroke();
  ctx.restore();
}

function drawAsh(ctx: CanvasRenderingContext2D, bg: BgState, dt: number): void {
  while (bg.ashFlakes.length < 80) {
    bg.ashFlakes.push({
      x: Math.random() * DESIGN_W,
      y: Math.random() * DESIGN_H,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0.3 + Math.random() * 0.7,
      life: 600,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
    });
  }
  ctx.save();
  ctx.fillStyle = 'rgba(180, 180, 170, 0.65)';
  for (const a of bg.ashFlakes) {
    a.x += a.vx * dt; a.y += a.vy * dt; a.rotation += a.rotSpeed * dt; a.life -= dt;
    if (a.y > DESIGN_H || a.life <= 0) {
      a.x = Math.random() * DESIGN_W; a.y = -10;
      a.life = 600;
    }
    ctx.save();
    ctx.translate(a.x, a.y); ctx.rotate(a.rotation);
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();
  }
  ctx.restore();
}

function drawEmberStorm(ctx: CanvasRenderingContext2D, bg: BgState, dt: number): void {
  while (bg.emberFall.length < 120) {
    const maxLife = 120 + Math.random() * 80;
    bg.emberFall.push({
      x: Math.random() * DESIGN_W,
      y: Math.random() * DESIGN_H,
      vx: (Math.random() - 0.5) * 1.2,
      vy: 1.2 + Math.random() * 2.0,
      life: maxLife, maxLife,
      size: 1 + Math.random() * 2,
      hue: 15 + Math.random() * 20,
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = bg.emberFall.length - 1; i >= 0; i--) {
    const e = bg.emberFall[i];
    e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
    if (e.life <= 0 || e.y > DESIGN_H) { bg.emberFall.splice(i, 1); continue; }
    const t = e.life / e.maxLife;
    ctx.fillStyle = 'hsla(' + e.hue + ', 95%, 55%, ' + (t * 0.9).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawGodRays(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 4; i++) {
    const x = 200 + i * 180 + Math.sin(time * 0.0003 + i) * 20;
    const g = ctx.createLinearGradient(x, 0, x + 50, DESIGN_H);
    g.addColorStop(0, 'rgba(255, 220, 150, 0.18)');
    g.addColorStop(0.5, 'rgba(255, 200, 120, 0.10)');
    g.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 10, 0);
    ctx.lineTo(x + 10, 0);
    ctx.lineTo(x + 80, DESIGN_H);
    ctx.lineTo(x + 40, DESIGN_H);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// Eyes in darkness + crows (atmospheric fauna)
// ─────────────────────────────────────────────────────────────

function drawEyes(ctx: CanvasRenderingContext2D, bg: BgState, dt: number): void {
  // Occasional pair of red eyes fades in + out in the fog band.
  if (bg.eyes.length === 0 && Math.random() < 0.002 * dt) {
    bg.eyes.push({
      x: 80 + Math.random() * (DESIGN_W - 160),
      y: 440 + Math.random() * 120,
      life: 120, maxLife: 120,
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = bg.eyes.length - 1; i >= 0; i--) {
    const e = bg.eyes[i];
    e.life -= dt;
    if (e.life <= 0) { bg.eyes.splice(i, 1); continue; }
    const t = e.life / e.maxLife;
    // fade in first 20%, hold, fade out last 40%
    let alpha = 1;
    if (1 - t < 0.2) alpha = (1 - t) / 0.2;
    else if (t < 0.4) alpha = t / 0.4;
    ctx.fillStyle = 'rgba(220, 30, 30, ' + (alpha * 0.75).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(e.x - 6, e.y, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.x + 6, e.y, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawCrows(ctx: CanvasRenderingContext2D, bg: BgState, dt: number): void {
  if (bg.crows.length === 0 && Math.random() < 0.0006 * dt) {
    const fromLeft = Math.random() > 0.5;
    bg.crows.push({
      x: fromLeft ? -40 : DESIGN_W + 40,
      y: 100 + Math.random() * 180,
      vx: (fromLeft ? 1 : -1) * (1.2 + Math.random() * 0.8),
      wingPhase: 0,
      life: 1000,
    });
  }
  ctx.save();
  ctx.fillStyle = '#000';
  for (let i = bg.crows.length - 1; i >= 0; i--) {
    const c = bg.crows[i];
    c.x += c.vx * dt; c.wingPhase += 0.25 * dt; c.life -= dt;
    if (c.life <= 0 || c.x < -60 || c.x > DESIGN_W + 60) { bg.crows.splice(i, 1); continue; }
    const wing = Math.sin(c.wingPhase) * 6;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.quadraticCurveTo(c.x - 8, c.y - wing, c.x - 16, c.y);
    ctx.quadraticCurveTo(c.x - 8, c.y + 2, c.x, c.y);
    ctx.quadraticCurveTo(c.x + 8, c.y - wing, c.x + 16, c.y);
    ctx.quadraticCurveTo(c.x + 8, c.y + 2, c.x, c.y);
    ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// Entity rendering: words with kind variants, fireballs, particles, etc.
// ─────────────────────────────────────────────────────────────

export function drawWordAura(
  ctx: CanvasRenderingContext2D,
  word: Word,
  wordWidth: number,
  time: number,
  auraColor: string,
): void {
  const pulse = 0.8 + Math.sin(time * 0.004 + word.x * 0.01) * 0.2;
  const cx = word.x + wordWidth / 2;
  const cy = word.y - 8;
  const r = Math.max(60, wordWidth * 0.7) * pulse;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  if (word.jessykaTarget) {
    // Jessyka's claim — heart-pink aura overrides the per-kind colour so it's
    // unmistakably HER target at a glance, before the first letter even lands.
    g.addColorStop(0, 'rgba(255, 140, 215, 0.42)');
    g.addColorStop(0.55, 'rgba(255, 80, 180, 0.16)');
    g.addColorStop(1, 'rgba(220, 60, 160, 0)');
  } else if (word.isMunchie) {
    // AfroMan munchie — weed-green haze + amber inner core. Distinct from
    // the normal run of enemies so the player reads "this one applies ZOOTED,
    // not HP damage" without needing a legend.
    const greenPulse = 0.55 + Math.sin(time * 0.005 + word.x * 0.02) * 0.25;
    g.addColorStop(0, 'rgba(155, 230, 158, ' + (0.4 * greenPulse).toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(80, 200, 120, 0.18)');
    g.addColorStop(1, 'rgba(60, 160, 80, 0)');
  } else if (word.isSpecial) {
    g.addColorStop(0, 'rgba(255, 120, 200, 0.35)');
    g.addColorStop(0.5, 'rgba(220, 60, 160, 0.12)');
    g.addColorStop(1, 'rgba(220, 60, 160, 0)');
  } else {
    g.addColorStop(0, auraColor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  // Thin pulsing heart-pink ring around Jessyka's current target — a second
  // visual cue on top of the aura so the claim is legible even when the
  // aura overlaps other effects.
  if (word.jessykaTarget) {
    const ringPulse = 0.6 + Math.sin(time * 0.012) * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 128, 204, ' + (0.55 * ringPulse).toFixed(3) + ')';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, wordWidth * 0.65 + 6, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Render a word's letters. Handles per-kind visual effects:
 * - ghost: flickering alpha
 * - tank: armored stroke outline
 * - runner: motion blur trails
 * - mimic: phantom double-image visual (signals bonus on completion)
 * - chanter: glowing runic outline
 * - caster: pulsing pink core
 */
export function drawWordText(
  ctx: CanvasRenderingContext2D,
  word: Word,
  charWidths: Record<string, number>,
  time: number,
  fontScale: number,
): void {
  ctx.save();
  const fontSize = Math.round(24 * fontScale);
  ctx.font = fontSize + 'px "Cinzel", serif';
  ctx.textBaseline = 'alphabetic';

  // Base alpha (ghost flickers — irregular rhythm with long invisible periods).
  let baseAlpha = 1.0;
  if (word.kind === 'ghost') {
    // Two detuned sines create an irregular beat pattern.
    const a = Math.sin(time * 0.0055 + word.ghostPhase * 10);
    const b = Math.sin(time * 0.013  + word.ghostPhase * 7);
    const t = a * 0.55 + b * 0.45;
    // Asymmetric curve — peaks feel visible, troughs hold very low alpha longer.
    baseAlpha = t > 0.15 ? 0.25 + t * 0.75 : 0.03 + Math.max(0, (t + 0.4)) * 0.2;
    baseAlpha = Math.max(0.03, Math.min(1, baseAlpha));
  }

  // Runner: streak trailing AWAY from the player (behind motion direction).
  if (word.kind === 'runner') {
    const dxp = 512 - word.x, dyp = 700 - word.y;
    const dmag = Math.max(1, Math.sqrt(dxp * dxp + dyp * dyp));
    const nx = dxp / dmag, ny = dyp / dmag;
    // Gradient from word position going backwards.
    const tailX = word.x - nx * 60, tailY = word.y - ny * 60;
    const streak = ctx.createLinearGradient(word.x, word.y, tailX, tailY);
    streak.addColorStop(0, 'rgba(255, 110, 90, 0.28)');
    streak.addColorStop(0.4, 'rgba(220, 60, 40, 0.14)');
    streak.addColorStop(1, 'rgba(220, 60, 40, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = streak;
    ctx.beginPath();
    const perpX = -ny * 10, perpY = nx * 10;
    ctx.moveTo(word.x + perpX, word.y + perpY);
    ctx.lineTo(word.x - perpX, word.y - perpY);
    ctx.lineTo(tailX - perpX * 0.6, tailY - perpY * 0.6);
    ctx.lineTo(tailX + perpX * 0.6, tailY + perpY * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Chanter rune aura.
  if (word.kind === 'chanter') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + Math.sin(time * 0.006) * 0.3;
    const auraR = 80 * pulse;
    const aur = ctx.createRadialGradient(word.x + 60, word.y - 8, 0, word.x + 60, word.y - 8, auraR);
    aur.addColorStop(0, 'rgba(100, 200, 255, 0.4)');
    aur.addColorStop(1, 'rgba(100, 200, 255, 0)');
    ctx.fillStyle = aur;
    ctx.fillRect(word.x - 20, word.y - 80, 220, 160);
    ctx.restore();
  }

  let cx = word.x;
  for (let k = 0; k < word.text.length; k++) {
    const ch = word.text[k];
    if (ch === ' ') { cx += (charWidths[' '] ?? 6) * fontScale; continue; }
    const typed = k < word.typed.length;

    // Tank armor: stroke outline on untyped letters.
    if (word.kind === 'tank' && !typed) {
      ctx.strokeStyle = 'rgba(180, 120, 60, 0.5)';
      ctx.lineWidth = 3;
      ctx.strokeText(ch, cx, word.y);
    }

    // Phantom (mimic kind): ghostly double-image offset behind each letter —
    // purely visual, no gameplay impact. Signals "bonus echo" at a glance.
    if (word.kind === 'mimic' && !typed) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffcaa0';
      ctx.fillText(ch, cx + 3, word.y + 1);
      ctx.fillText(ch, cx - 3, word.y - 1);
      ctx.restore();
    }

    ctx.globalAlpha = typed ? 1 : baseAlpha;
    // Typed-letter palette differs by OWNER so player vs Jessyka is
    // immediately legible on any multi-word screen:
    //   - Jessyka's target → heart-pink fill + pink glow (matches her kisses)
    //   - JESSYKA special word (heart) → pearl-pink fill + pink glow
    //   - Player-typed everywhere else → fire-orange fill + amber glow
    const jessykaClaim = word.jessykaTarget === true && !word.isSpecial;
    ctx.fillStyle = typed
      ? (jessykaClaim ? '#ff80cc'
         : word.isSpecial ? '#ffe4f1'
         : '#ff6a20')
      : wordColor(word.kind, word.isSpecial);

    if (typed) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = jessykaClaim ? '#ff40a0'
        : word.isSpecial ? '#ff80cc'
        : '#ff4500';
    } else {
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
    }
    ctx.fillText(ch, cx, word.y);
    cx += (charWidths[ch] ?? 14) * fontScale;
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}

function wordColor(kind: EnemyKind, isSpecial: boolean): string {
  if (isSpecial) return '#c85098';   // dim magenta when untyped — claimed letters become pearl-pink
  switch (kind) {
    case 'ghost':   return '#cfd8e0';
    case 'tank':    return '#f0d4a8';
    case 'runner':  return '#ffb0a0';
    case 'lich':    return '#d0aaff';
    case 'mimic':   return '#f0e0c0';
    case 'chanter': return '#a0e0ff';
    case 'caster':  return '#ffaaff';
    default:        return '#e6dcc5';
  }
}

export function drawFireball(
  ctx: CanvasRenderingContext2D,
  fb: Fireball,
  combo: number,
  rankId: string,
  time: number = 0,
): string {
  // JESSYKA hearts render in their own dedicated path — clean pink heart
  // with a soft halo, gradient fill, and a white highlight. Combo scaling
  // is *mild* so late-game hearts don't dominate the screen.
  if (fb.isSpecial) {
    drawJessykaHeart(ctx, fb, combo, time);
    return '#ff80cc';
  }

  const isSpear = rankId === 'S' || rankId === 'SS' || rankId === 'SSS';
  const isSSS = rankId === 'SSS';
  const spearMul = isSSS ? 1.0 : rankId === 'SS' ? 0.7 : 0.4;
  const baseSize = isSpear ? 10 * spearMul : 5;
  const scale = 1 + combo / 150;
  const size = baseSize * scale;
  const color = isSpear ? (isSSS ? '#00ddff' : '#55bbff') : 'hsl(' + (20 + combo) + ', 100%, 55%)';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const haloR = size * (isSpear ? 4 : 3);
  const halo = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, haloR);
  halo.addColorStop(0, isSpear ? (isSSS ? 'rgba(0, 221, 255, 0.65)' : 'rgba(85, 187, 255, 0.55)') : 'rgba(255, 90, 20, 0.6)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(fb.x - haloR, fb.y - haloR, haloR * 2, haloR * 2);
  ctx.restore();
  ctx.save();
  ctx.shadowBlur = isSpear ? 32 : 14 + combo / 6;
  ctx.shadowColor = isSpear ? (isSSS ? '#00ffff' : '#0055ff') : '#ff4500';
  ctx.fillStyle = color;
  ctx.beginPath();
  if (isSpear) {
    const ang = Math.atan2(fb.ty - fb.y, fb.tx - fb.x);
    const len = size * 3;
    ctx.moveTo(fb.x + Math.cos(ang) * len, fb.y + Math.sin(ang) * len);
    ctx.lineTo(fb.x + Math.cos(ang + Math.PI * 0.8) * len * 0.3, fb.y + Math.sin(ang + Math.PI * 0.8) * len * 0.3);
    ctx.lineTo(fb.x - Math.cos(ang) * len * 0.5, fb.y - Math.sin(ang) * len * 0.5);
    ctx.lineTo(fb.x + Math.cos(ang - Math.PI * 0.8) * len * 0.3, fb.y + Math.sin(ang - Math.PI * 0.8) * len * 0.3);
    ctx.closePath();
  } else {
    ctx.arc(fb.x, fb.y, size, 0, Math.PI * 2);
  }
  ctx.fill();
  if (isSSS) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(fb.x, fb.y, size * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return color;
}

/** Clean, gradient-filled heart for JESSYKA fireballs.
 *  Size is ~24-32 px with only a mild combo boost so it stays readable even
 *  at SSS rank. Gentle breathing pulse via sin(time). Inner shine highlight
 *  in the top-left lobe sells the "romance-y" pink-candy look.
 */
function drawJessykaHeart(ctx: CanvasRenderingContext2D, fb: Fireball, combo: number, time: number): void {
  // Controlled scaling: 1.0x at 0 combo, max 1.3x past 120 combo.
  const comboBoost = 1 + Math.min(0.3, combo / 400);
  const pulse = 0.94 + Math.sin(time * 0.012) * 0.06;
  const s = 26 * comboBoost * pulse;           // base glyph half-extent
  const cx = fb.x, cy = fb.y;

  // ── Outer halo — soft pink radial glow.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const haloR = s * 2.4;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
  halo.addColorStop(0,   'rgba(255, 150, 210, 0.55)');
  halo.addColorStop(0.4, 'rgba(255,  80, 170, 0.28)');
  halo.addColorStop(1,   'rgba(200,  40, 140, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);
  ctx.restore();

  // ── Heart body path — classic two-lobe bezier. Built once, reused for
  //    fill and for the highlight clip.
  const pathHeart = (scale: number) => {
    const S = s * scale;
    const topDip = S * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx, cy - S * 0.15 + topDip);
    // Left lobe up and over
    ctx.bezierCurveTo(
      cx,           cy - S * 0.55,
      cx - S * 0.95, cy - S * 0.55,
      cx - S * 0.95, cy - S * 0.05,
    );
    // Left side down to bottom point
    ctx.bezierCurveTo(
      cx - S * 0.95, cy + S * 0.35,
      cx - S * 0.35, cy + S * 0.55,
      cx,           cy + S * 0.9,
    );
    // Right side up to the right lobe
    ctx.bezierCurveTo(
      cx + S * 0.35, cy + S * 0.55,
      cx + S * 0.95, cy + S * 0.35,
      cx + S * 0.95, cy - S * 0.05,
    );
    // Right lobe up and over, closing at the top dip
    ctx.bezierCurveTo(
      cx + S * 0.95, cy - S * 0.55,
      cx,           cy - S * 0.55,
      cx,           cy - S * 0.15 + topDip,
    );
    ctx.closePath();
  };

  // ── Drop shadow for depth.
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#ff0080';
  // Main fill — radial gradient from a bright center to deeper pink edges.
  const bodyGrad = ctx.createRadialGradient(
    cx - s * 0.2, cy - s * 0.15, 0,
    cx, cy + s * 0.15, s * 1.2,
  );
  bodyGrad.addColorStop(0,    '#ffe8f4');      // near-white highlight center
  bodyGrad.addColorStop(0.25, '#ffb0d8');      // bright pink
  bodyGrad.addColorStop(0.65, '#ff5aa6');      // mid pink
  bodyGrad.addColorStop(1,    '#d62a7f');      // deep edge pink
  pathHeart(1);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.shadowBlur = 0;
  // Thin edge accent — deeper magenta rim so the heart reads against the bg.
  ctx.strokeStyle = 'rgba(180, 20, 100, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ── Shine highlight — a small soft white ellipse in the top-left lobe.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const shine = ctx.createRadialGradient(
    cx - s * 0.35, cy - s * 0.25, 0,
    cx - s * 0.35, cy - s * 0.25, s * 0.35,
  );
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.32, cy - s * 0.28, s * 0.3, s * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── Sparkle points rotating around the heart (2 specks).
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const ang = time * 0.005 + i * Math.PI;
    const rx = cx + Math.cos(ang) * s * 1.35;
    const ry = cy + Math.sin(ang) * s * 1.35;
    ctx.fillStyle = 'rgba(255, 220, 240, 0.9)';
    ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawShockwave(ctx: CanvasRenderingContext2D, sw: Shockwave): void {
  const t = sw.radius / sw.maxRadius;
  const alpha = Math.max(0, 1 - t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = sw.color.replace('ALPHA', alpha.toFixed(3));
  ctx.lineWidth = Math.max(1, 3 * (1 - t));
  ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const lifeT = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = lifeT;
  ctx.fillStyle = p.color;
  if (p.isHeart) {
    // Clean mini-heart — two arcs + a bottom triangle, centered on (p.x, p.y).
    const s = p.size * 1.4;
    const halfW = s * 0.5;
    const lobeR = s * 0.32;
    const cx = p.x, cy = p.y;
    ctx.beginPath();
    ctx.arc(cx - halfW * 0.5, cy - s * 0.1, lobeR, Math.PI, 0, false);
    ctx.arc(cx + halfW * 0.5, cy - s * 0.1, lobeR, Math.PI, 0, false);
    ctx.lineTo(cx, cy + s * 0.55);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────
// Projectile rendering (caster & boss)
// ─────────────────────────────────────────────────────────────

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, time: number = 0): void {
  // Deflected projectiles render "ghosted" — lower opacity + desaturated tone —
  // so the player can see they've been neutralised even before the chase
  // fireball arrives. The projectile itself is harmless at this point.
  if (p.deflected) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.filter = 'saturate(0.25) brightness(1.3)';
  }
  if (p.fromBoss) {
    if (p.isTallCan) drawTallCanProjectile(ctx, p);
    else drawBossProjectile(ctx, p);
  } else {
    drawCasterProjectile(ctx, p, time);
  }
  if (p.deflected) {
    ctx.restore();
  }
}

/** AfroMan tall-can projectile — amber rectangle with ridged stripes, digit
 *  etched on the label. Same legibility as the default boss projectile but
 *  thematically tied to the fight. */
function drawTallCanProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const canW = 22, canH = 40;
  const x = p.x, y = p.y;
  // Hue shift subtly based on spawnedAt to vary can colours across a volley.
  const hueOffset = ((p.spawnedAt ?? 0) * 0.01) % 30;

  // Glow halo — pink-magenta for afroman vibe.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(x, y, 0, x, y, 36);
  halo.addColorStop(0, 'rgba(255, 140, 210, 0.7)');
  halo.addColorStop(0.55, 'rgba(255, 160, 90, 0.3)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - 36, y - 36, 72, 72);
  ctx.restore();

  // Can body — vertical amber gradient.
  ctx.save();
  const cx = x - canW / 2, cy = y - canH / 2;
  const body = ctx.createLinearGradient(x, cy, x, cy + canH);
  body.addColorStop(0, `hsl(${(34 + hueOffset).toFixed(0)}, 85%, 72%)`);
  body.addColorStop(0.5, `hsl(${(30 + hueOffset).toFixed(0)}, 78%, 52%)`);
  body.addColorStop(1, `hsl(${(26 + hueOffset).toFixed(0)}, 72%, 32%)`);
  ctx.fillStyle = body;
  ctx.fillRect(cx, cy, canW, canH);
  // Rim top/bottom — darker bands.
  ctx.fillStyle = 'rgba(35, 15, 10, 0.9)';
  ctx.fillRect(cx, cy, canW, 3);
  ctx.fillRect(cx, cy + canH - 3, canW, 3);
  // Ridge stripes — thin horizontals on the body.
  ctx.fillStyle = 'rgba(120, 50, 25, 0.45)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(cx, cy + 8 + i * 8, canW, 1);
  }
  // Dark label background (center).
  const labelH = 16;
  const labelY = cy + (canH - labelH) / 2;
  ctx.fillStyle = 'rgba(10, 5, 4, 0.82)';
  ctx.fillRect(cx + 2, labelY, canW - 4, labelH);
  // Thin outline.
  ctx.strokeStyle = 'rgba(50, 20, 12, 1)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx, cy, canW, canH);
  ctx.restore();

  // Digit — high-contrast on the label.
  ctx.save();
  ctx.font = 'bold 18px "Cinzel", serif';
  ctx.fillStyle = '#fff4d6';
  ctx.strokeStyle = '#0a0503';
  ctx.lineWidth = 2.4;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(p.char, x, y);
  ctx.fillText(p.char, x, y);
  ctx.restore();

  // Beat-marker — small ring around projectiles spawned ON a beat so the
  // perfect-parry window is readable. Fades to nothing over ~500 ms.
  if (p.onBeat && p.spawnedAt !== undefined) {
    const age = performance.now() - p.spawnedAt;
    if (age < 500) {
      const t = 1 - age / 500;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255, 220, 130, ${(t * 0.8).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 18 + (1 - t) * 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** Boss projectile — a burning amber letter. Heavy but simple. */
function drawBossProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  // Outer halo.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 32);
  halo.addColorStop(0, 'rgba(255, 80, 30, 0.8)');
  halo.addColorStop(0.5, 'rgba(200, 40, 20, 0.35)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(p.x - 32, p.y - 32, 64, 64);
  ctx.restore();

  // Dark disc backing for letter legibility.
  ctx.save();
  ctx.fillStyle = 'rgba(20, 8, 4, 0.85)';
  ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 140, 60, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Letter — large, bold, high-contrast, no blur so it stays readable.
  ctx.save();
  ctx.font = 'bold 22px "Cinzel", serif';
  ctx.fillStyle = '#fff4d6';
  ctx.strokeStyle = '#1a0a04';
  ctx.lineWidth = 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(p.char, p.x, p.y);
  ctx.fillText(p.char, p.x, p.y);
  ctx.restore();
}

/** Caster projectile — dramatic magenta magic orb with rune ring and trail. */
function drawCasterProjectile(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  // Trail — fading smaller orbs behind the main one.
  if (p.trail && p.trail.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < p.trail.length; i++) {
      const t = i / p.trail.length;         // 0 = oldest, 1 = newest
      const pt = p.trail[i];
      const r = 4 + t * 8;
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
      g.addColorStop(0, 'rgba(255, 130, 255, ' + (0.5 * t).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(200, 40, 200, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // Outer halo.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.8 + Math.sin(time * 0.012) * 0.2;
  const haloR = 36 * pulse;
  const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
  halo.addColorStop(0, 'rgba(255, 200, 255, 0.8)');
  halo.addColorStop(0.3, 'rgba(255, 100, 255, 0.55)');
  halo.addColorStop(0.7, 'rgba(180, 40, 200, 0.2)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(p.x - haloR, p.y - haloR, haloR * 2, haloR * 2);

  // Rotating rune ring — pushed out a bit so it doesn't crowd the letter.
  const ringAng = time * 0.004;
  for (let i = 0; i < 5; i++) {
    const ang = ringAng + (i / 5) * Math.PI * 2;
    const rx = p.x + Math.cos(ang) * 24;
    const ry = p.y + Math.sin(ang) * 24;
    ctx.fillStyle = 'rgba(255, 220, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Counter-rotating inner ring — also pushed out.
  const ring2Ang = -time * 0.006;
  for (let i = 0; i < 3; i++) {
    const ang = ring2Ang + (i / 3) * Math.PI * 2;
    const rx = p.x + Math.cos(ang) * 18;
    const ry = p.y + Math.sin(ang) * 18;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hot core — now used purely as ambient glow, clipped smaller than the disc.
  const coreGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 22);
  coreGrad.addColorStop(0, 'rgba(255, 200, 255, 0.8)');
  coreGrad.addColorStop(0.5, 'rgba(255, 100, 255, 0.35)');
  coreGrad.addColorStop(1, 'rgba(255, 80, 255, 0)');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(p.x - 22, p.y - 22, 44, 44);
  ctx.restore();

  // Dark disc backing behind the letter — this is what makes the glyph readable.
  ctx.save();
  ctx.fillStyle = 'rgba(20, 6, 24, 0.85)';
  ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 170, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Letter on top — large bold, no blur, with dark stroke for definition.
  ctx.save();
  ctx.font = 'bold 22px "Cinzel", serif';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2a0818';
  ctx.lineWidth = 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(p.char, p.x, p.y);
  ctx.fillText(p.char, p.x, p.y);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// Impact decals — lingering scorch marks at impact points.
// ─────────────────────────────────────────────────────────────

export function drawDecals(ctx: CanvasRenderingContext2D, bg: BgState, dt: number): void {
  for (let i = bg.decals.length - 1; i >= 0; i--) {
    const d = bg.decals[i];
    d.life -= dt;
    if (d.life <= 0) { bg.decals.splice(i, 1); continue; }
    const t = d.life / d.maxLife;
    ctx.save();
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.radius);
    g.addColorStop(0, d.color.replace('ALPHA', (t * 0.6).toFixed(3)));
    g.addColorStop(1, d.color.replace('ALPHA', '0'));
    ctx.fillStyle = g;
    ctx.fillRect(d.x - d.radius, d.y - d.radius, d.radius * 2, d.radius * 2);
    ctx.restore();
  }
}

export function addImpactDecal(bg: BgState, x: number, y: number, bigImpact: boolean): void {
  bg.decals.push({
    x, y,
    radius: bigImpact ? 60 : 36,
    life: bigImpact ? 60 : 40,
    maxLife: bigImpact ? 60 : 40,
    color: 'rgba(40, 10, 5, ALPHA)',
  });
}

// ─────────────────────────────────────────────────────────────
// Boss silhouette renderers
// ─────────────────────────────────────────────────────────────

export type BossRenderState = {
  silhouette: 'taurus' | 'ornstein' | 'gwyn' | 'afroman';
  themeColor: string;
  currentHp: number;
  maxHp: number;
  phaseIdx: number;
  attackWindupT: number;       // 0..1 while winding up an attack
  enraged: boolean;
  deathStart: number;          // 0 while alive; performance.now timestamp once defeated
  introStart: number;          // 0 once intro is done; performance.now at start otherwise
  introDurationMs: number;     // total intro length for progress math
};

export function drawBoss(
  ctx: CanvasRenderingContext2D,
  state: BossRenderState,
  time: number,
): void {
  // AfroMan + Taurus are rendered as DOM <img> sprites (AfroManIDLE/ATTACK
  // + TaurusIDLE/ATTACK/DEAD .png files). The canvas path here skips both
  // so the DOM layer is authoritative. Ornstein + Gwyn still draw their
  // canvas silhouettes here.
  if (state.silhouette === 'afroman' || state.silhouette === 'taurus') return;
  const cx = 512, baseY = 440;
  const breath = Math.sin(time * 0.002) * 6;
  const hpT = state.currentHp / state.maxHp;

  // ── Death cutscene transforms. Three progressive phases:
  //   0..800ms   — violent jitter
  //   800..1800  — collapse/sink
  //   1800..3000 — fade to nothing
  let deathElapsed = 0;
  let deathJitterX = 0, deathJitterY = 0;
  let deathOffsetY = 0;
  let deathAlpha = 1;
  let deathRimBoost = 0;
  if (state.deathStart > 0) {
    deathElapsed = time - state.deathStart;
    if (deathElapsed < 800) {
      const intensity = 1 - (deathElapsed / 800) * 0.3;
      deathJitterX = (Math.random() - 0.5) * 14 * intensity;
      deathJitterY = (Math.random() - 0.5) * 10 * intensity;
      deathRimBoost = Math.min(1, deathElapsed / 400);
    } else if (deathElapsed < 1800) {
      const t = (deathElapsed - 800) / 1000;    // 0..1
      deathOffsetY = t * 40;
      deathJitterX = (Math.random() - 0.5) * 3;
      deathRimBoost = 1 - t * 0.4;
    } else {
      const t = Math.min(1, (deathElapsed - 1800) / 1200);  // 0..1
      deathOffsetY = 40 + t * 80;
      deathAlpha = 1 - t;
      deathRimBoost = Math.max(0, 0.6 - t);
    }
  }

  // ── Intro cutscene transforms. Fade in, rise from below, scale from small.
  //   0..500ms   — invisible / rising
  //   500..3000  — fully visible, hanging ominously (lore overlay renders separately)
  //   3000..4500 — settle to final pose
  let introAlpha = 1;
  let introOffsetY = 0;
  let introScale = 1;
  if (state.introStart > 0) {
    const introElapsed = time - state.introStart;
    if (introElapsed < state.introDurationMs) {
      const t = Math.min(1, introElapsed / state.introDurationMs);
      introAlpha = Math.min(1, t * 1.4);                  // fade in
      introOffsetY = (1 - t) * 60;                        // rise from below
      introScale = 0.7 + t * 0.3;                         // grow into place
    }
  }

  // Rim glow — stronger when enraged, boosted during death.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, deathAlpha * introAlpha);
  const rimR = state.enraged ? 280 : 220;
  const rimA = Math.min(0.95, (state.enraged ? 0.55 : 0.32) + deathRimBoost * 0.4);
  const rim = ctx.createRadialGradient(cx, baseY - 40, 20, cx, baseY - 40, rimR + deathRimBoost * 60);
  rim.addColorStop(0, hexWithAlpha(state.themeColor, rimA));
  rim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(cx - rimR, baseY - rimR, rimR * 2, rimR * 2);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = Math.min(1, deathAlpha * introAlpha);
  ctx.translate(cx + deathJitterX, baseY + breath + deathOffsetY + deathJitterY + introOffsetY);
  ctx.scale(introScale, introScale);
  if (state.silhouette === 'taurus') drawTaurus(ctx, state, time);
  else if (state.silhouette === 'ornstein') drawOrnstein(ctx, state, time);
  else if (state.silhouette === 'gwyn') drawGwyn(ctx, state, time);
  // AfroMan has no canvas silhouette — the DOM <img> sprite layer handles him.
  ctx.restore();

  // HP low OR death: cracks on the silhouette.
  if (hpT < 0.33 || state.deathStart > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, deathAlpha * introAlpha);
    ctx.strokeStyle = hexWithAlpha(state.themeColor, 0.6 + deathRimBoost * 0.4);
    ctx.lineWidth = 2 + deathRimBoost * 2;
    for (let i = 0; i < 3; i++) {
      const x = cx + (Math.sin(i * 13 + time * 0.003) * 60);
      ctx.beginPath();
      ctx.moveTo(x + deathJitterX, baseY - 40 + deathOffsetY);
      ctx.lineTo(x + 10 + deathJitterX, baseY - 90 + deathOffsetY);
      ctx.lineTo(x - 8 + deathJitterX, baseY - 150 + deathOffsetY);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawTaurus(ctx: CanvasRenderingContext2D, state: BossRenderState, time: number): void {
  // Massive hulking silhouette, horned.
  const sway = Math.sin(time * 0.003) * 4;
  ctx.fillStyle = '#030104';
  ctx.beginPath();
  // Body (trapezoid with rounded top)
  ctx.moveTo(-100 + sway, 0);
  ctx.lineTo(-120 + sway, -140);
  ctx.quadraticCurveTo(-90 + sway, -220, -40 + sway, -235);
  // Left horn
  ctx.lineTo(-70 + sway, -290);
  ctx.lineTo(-30 + sway, -260);
  ctx.lineTo(-10 + sway, -245);
  // Head top
  ctx.quadraticCurveTo(0 + sway, -260, 10 + sway, -245);
  // Right horn
  ctx.lineTo(30 + sway, -260);
  ctx.lineTo(70 + sway, -290);
  ctx.lineTo(40 + sway, -235);
  ctx.quadraticCurveTo(90 + sway, -220, 120 + sway, -140);
  ctx.lineTo(100 + sway, 0);
  ctx.closePath();
  ctx.fill();
  // Glowing eyes
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const eyeA = state.enraged ? 0.9 : 0.55;
  ctx.fillStyle = 'rgba(255, 60, 20, ' + eyeA + ')';
  ctx.beginPath(); ctx.arc(-22 + sway, -220, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(22 + sway, -220, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawOrnstein(ctx: CanvasRenderingContext2D, state: BossRenderState, time: number): void {
  const sway = Math.sin(time * 0.004) * 3;
  ctx.fillStyle = '#050308';
  // Slim knight silhouette with spear
  ctx.beginPath();
  ctx.moveTo(-30 + sway, 0);
  ctx.lineTo(-45 + sway, -100);
  ctx.lineTo(-55 + sway, -170);
  ctx.lineTo(-45 + sway, -200);
  ctx.lineTo(-25 + sway, -225);
  // Helmet (plume)
  ctx.lineTo(-20 + sway, -260);
  ctx.lineTo(-5 + sway, -280);
  ctx.lineTo(15 + sway, -270);
  ctx.lineTo(5 + sway, -250);
  ctx.lineTo(20 + sway, -225);
  ctx.lineTo(45 + sway, -200);
  ctx.lineTo(55 + sway, -170);
  ctx.lineTo(45 + sway, -100);
  ctx.lineTo(30 + sway, 0);
  ctx.closePath();
  ctx.fill();
  // Spear (shaft)
  ctx.save();
  ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(60 + sway, -240);
  ctx.lineTo(80 + sway, 20);
  ctx.stroke();
  ctx.restore();
  // Spear tip glows (lightning)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const t = Math.abs(Math.sin(time * 0.01));
  ctx.fillStyle = 'rgba(255, 230, 130, ' + (0.5 + t * 0.5).toFixed(3) + ')';
  ctx.beginPath();
  ctx.arc(60 + sway, -250, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGwyn(ctx: CanvasRenderingContext2D, state: BossRenderState, time: number): void {
  const sway = Math.sin(time * 0.0025) * 3;
  ctx.fillStyle = '#050308';
  // Tall, thin, crown-topped
  ctx.beginPath();
  ctx.moveTo(-25 + sway, 0);
  ctx.lineTo(-40 + sway, -120);
  ctx.lineTo(-50 + sway, -210);
  ctx.lineTo(-40 + sway, -240);
  ctx.lineTo(-20 + sway, -260);
  // Crown
  ctx.lineTo(-30 + sway, -280);
  ctx.lineTo(-20 + sway, -290);
  ctx.lineTo(-10 + sway, -275);
  ctx.lineTo(0 + sway,   -295);
  ctx.lineTo(10 + sway,  -275);
  ctx.lineTo(20 + sway,  -290);
  ctx.lineTo(30 + sway,  -280);
  ctx.lineTo(20 + sway, -260);
  ctx.lineTo(40 + sway, -240);
  ctx.lineTo(50 + sway, -210);
  ctx.lineTo(40 + sway, -120);
  ctx.lineTo(25 + sway, 0);
  ctx.closePath();
  ctx.fill();
  // Flame aura around Gwyn — stronger in later phases
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const amp = state.phaseIdx >= 2 ? 1.6 : 1.0;
  for (let i = 0; i < 8; i++) {
    const flameY = -220 + Math.sin(time * 0.01 + i) * 6;
    const fx = -50 + i * 14 + Math.sin(time * 0.008 + i * 3) * 3;
    const alpha = 0.35 * amp;
    ctx.fillStyle = 'rgba(255, 110, 30, ' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(fx + sway, flameY, 3 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hexWithAlpha(hex: string, alpha: number): string {
  // #rgb or #rrggbb → rgba(...)
  const h = hex.replace('#', '');
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha.toFixed(3) + ')';
}

/** Miniature boss silhouette used as the visual overlay for boss-summoned
 *  summoner and caster words. Reuses the full drawTaurus/drawOrnstein/drawGwyn
 *  paths at a reduced scale with a theme-coloured rim glow. Position is the
 *  sprite's *foot* (bottom-center) in world space. */
export function drawBossMinionSprite(
  ctx: CanvasRenderingContext2D,
  silhouette: 'taurus' | 'ornstein' | 'gwyn' | 'afroman',
  themeColor: string,
  x: number,
  y: number,
  scale: number,
  time: number,
): void {
  // AfroMan + Taurus don't summon minions (no chanter/caster patterns in
  // their phase configs) so we never hit this branch in practice — short-
  // circuit defensively anyway so a future config tweak can't drag the
  // dead canvas silhouette into the scene.
  if (silhouette === 'afroman' || silhouette === 'taurus') return;
  // Minimal boss state just to drive the silhouette-draw helpers.
  const state: BossRenderState = {
    silhouette,
    themeColor,
    currentHp: 1, maxHp: 1, phaseIdx: 0,
    attackWindupT: 0, enraged: false,
    deathStart: 0, introStart: 0, introDurationMs: 0,
  };
  // Rim aura — smaller radius than a real boss, themeColor-tinted.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rimR = 90 * scale;
  const rim = ctx.createRadialGradient(x, y - 40 * scale, 4, x, y - 40 * scale, rimR);
  rim.addColorStop(0, hexWithAlpha(themeColor, 0.45));
  rim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(x - rimR, y - rimR, rimR * 2, rimR * 2);
  ctx.restore();
  // Silhouette body. Tint is applied via globalCompositeOperation so the
  // otherwise near-black shape takes on the boss theme colour.
  ctx.save();
  const bob = Math.sin(time * 0.004) * (2 * scale);
  ctx.translate(x, y + bob);
  ctx.scale(scale, scale);
  if (silhouette === 'taurus') drawTaurus(ctx, state, time);
  else if (silhouette === 'ornstein') drawOrnstein(ctx, state, time);
  else if (silhouette === 'gwyn') drawGwyn(ctx, state, time);
  ctx.restore();
  // Theme-colour wash over the silhouette — lighter composite gives a "possessed
  // by the boss's aura" feel without hiding the shape outline.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = themeColor;
  ctx.beginPath();
  ctx.ellipse(x, y - 140 * scale, 80 * scale, 140 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

