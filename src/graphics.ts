/**
 * Cursed Echoes — low-level canvas rendering + atmosphere layer.
 * Pure functions + a small bg-particle pool. No React here.
 */

export const DESIGN_W = 1024;
export const DESIGN_H = 768;
export const PARTICLE_CAP = 600;
export const BG_EMBER_CAP = 140;

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

export function rankForCombo(combo: number): Rank {
  for (let i = COMBO_RANKS.length - 1; i >= 0; i--) {
    if (combo >= COMBO_RANKS[i].count) return COMBO_RANKS[i];
  }
  return COMBO_RANKS[0];
}

export type Word = {
  text: string;
  x: number;
  y: number;
  speed: number;
  typed: string;
  isSpecial: boolean;
};

export type Fireball = {
  x: number; y: number;
  tx: number; ty: number;
  progress: number;
  isSpecial: boolean;
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

// ─────────────────────────────────────────────────────────────
// Background scene state — seeded once, mutated in-place each frame.
// ─────────────────────────────────────────────────────────────

export type Star = {x: number; y: number; size: number; twinkle: number};
export type Torch = {x: number; y: number; seed: number};
export type Chain = {x: number; yTop: number; yBot: number; swaySeed: number};
export type BonfireEmber = {x: number; y: number; vx: number; vy: number; life: number; maxLife: number};

export type BgState = {
  embers: Ember[];
  stars: Star[];
  torches: Torch[];
  chains: Chain[];
  bonfireEmbers: BonfireEmber[];
  lightningStart: number;      // time the current flash began (0 = none active)
  nextLightningAt: number;     // time we should trigger the next flash
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
  // Torches placed on spire peaks — positions hand-picked to match the spire row.
  const torches: Torch[] = [
    {x: 150, y: 395, seed: 0.17},
    {x: 300, y: 360, seed: 0.53},
    {x: 395, y: 395, seed: 0.29},
    {x: 620, y: 405, seed: 0.71},
    {x: 790, y: 395, seed: 0.42},
    {x: 930, y: 395, seed: 0.88},
  ];
  const chains: Chain[] = [
    {x: 90,  yTop: 0, yBot: 180, swaySeed: 0.21},
    {x: 940, yTop: 0, yBot: 200, swaySeed: 0.67},
    {x: 180, yTop: 0, yBot: 120, swaySeed: 0.43},
  ];
  return {
    embers: seedEmbers(BG_EMBER_CAP),
    stars,
    torches,
    chains,
    bonfireEmbers: [],
    lightningStart: 0,
    nextLightningAt: 6000 + Math.random() * 12000,
  };
}

function seedEmbers(count: number): Ember[] {
  const out: Ember[] = [];
  for (let i = 0; i < count; i++) {
    out.push(makeEmber(Math.random() * DESIGN_H));
  }
  return out;
}

function makeEmber(yOverride?: number): Ember {
  const maxLife = 240 + Math.random() * 240;
  return {
    x: Math.random() * DESIGN_W,
    y: yOverride ?? DESIGN_H + 20,
    vx: (Math.random() - 0.5) * 0.2,
    vy: -0.3 - Math.random() * 0.9,
    life: maxLife,
    maxLife,
    size: 0.8 + Math.random() * 1.8,
    hue: 18 + Math.random() * 22,
    flicker: Math.random() * Math.PI * 2,
  };
}

// ─────────────────────────────────────────────────────────────
// Canvas setup + typography
// ─────────────────────────────────────────────────────────────

export function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function buildCharWidthCache(
  ctx: CanvasRenderingContext2D,
): Record<string, number> {
  ctx.font = '24px "Cinzel", serif';
  const cache: Record<string, number> = {};
  for (let c = 65; c <= 90; c++) {
    const ch = String.fromCharCode(c);
    cache[ch] = ctx.measureText(ch).width;
  }
  return cache;
}

// ─────────────────────────────────────────────────────────────
// Background scene — Dark-Souls-inspired.
// Layers from back to front: sky → stars → moon → mountains →
// cathedral → mid spires → torches → chains → fog → fg pillars →
// bonfire → embers → lightning → vignette.
// ─────────────────────────────────────────────────────────────

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: BgState,
  time: number,
  dt: number,
  lowHp: boolean,
): void {
  drawSky(ctx);
  drawStars(ctx, bg.stars, time);
  drawMoon(ctx, time);
  drawCloudBand(ctx, time);
  drawMountains(ctx);
  drawCathedral(ctx, time);
  drawMidSpires(ctx);
  drawTorches(ctx, bg.torches, time);
  drawChains(ctx, bg.chains, time);
  drawFog(ctx, time);
  drawForegroundPillars(ctx);
  drawBonfire(ctx, bg, time, dt);
  drawEmbers(ctx, bg.embers, dt);
  updateLightning(bg, time);
  drawLightningFlash(ctx, bg, time);
  drawVignette(ctx, time, lowHp);
}

// ── Sky ───────────────────────────────────────────────────────
function drawSky(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
  g.addColorStop(0.00, '#0a0614');   // deep indigo
  g.addColorStop(0.35, '#140817');   // smoky purple-black
  g.addColorStop(0.60, '#1a0808');   // dying burgundy (horizon)
  g.addColorStop(0.80, '#0c0404');   // blood-black
  g.addColorStop(1.00, '#030202');   // near-black floor
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // Horizon glow — suggests a dying sun behind the cathedral.
  const h = ctx.createRadialGradient(
    DESIGN_W / 2, DESIGN_H * 0.55, 60,
    DESIGN_W / 2, DESIGN_H * 0.55, 520,
  );
  h.addColorStop(0,   'rgba(160, 50, 15, 0.45)');
  h.addColorStop(0.4, 'rgba(90, 25, 10, 0.22)');
  h.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
}

// ── Stars ─────────────────────────────────────────────────────
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

// ── Moon ──────────────────────────────────────────────────────
function drawMoon(ctx: CanvasRenderingContext2D, time: number): void {
  const cx = 820, cy = 130, r = 38;
  const pulse = 0.85 + Math.sin(time * 0.0006) * 0.15;

  // Outer halo.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
  halo.addColorStop(0,   'rgba(230, 210, 170, ' + (0.35 * pulse).toFixed(3) + ')');
  halo.addColorStop(0.3, 'rgba(200, 150, 110, ' + (0.15 * pulse).toFixed(3) + ')');
  halo.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 180, cy - 180, 360, 360);
  ctx.restore();

  // Disc.
  ctx.fillStyle = '#ddcba0';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Subtle cratering — darker overlay on the right edge.
  ctx.fillStyle = 'rgba(60, 40, 20, 0.25)';
  ctx.beginPath();
  ctx.arc(cx + 6, cy + 4, r * 0.9, 0, Math.PI * 2);
  ctx.fill();

  // Thin horizontal cloud crossing the moon.
  ctx.save();
  const cloudX = ((time * 0.005) % (DESIGN_W + 300)) - 150;
  ctx.fillStyle = 'rgba(10, 5, 15, 0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - 20 + cloudX * 0.02, cy + 2, 60, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Drifting cloud band near horizon ──────────────────────────
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

// ── Distant mountains ─────────────────────────────────────────
function drawMountains(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = '#0e0a14';
  ctx.beginPath();
  const baseY = DESIGN_H * 0.55;
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, baseY);
  // Jagged silhouette.
  const peaks = [
    [60, 40], [130, 75], [200, 30], [280, 95], [360, 50],
    [430, 90], [510, 25], [590, 80], [670, 45], [750, 95],
    [830, 40], [910, 85], [990, 55],
  ];
  for (const [px, ph] of peaks) {
    ctx.lineTo(px - 30, baseY);
    ctx.lineTo(px, baseY - ph);
    ctx.lineTo(px + 30, baseY);
  }
  ctx.lineTo(DESIGN_W, baseY);
  ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath();
  ctx.fill();

  // Thin rim light on peaks — backlit by horizon glow.
  ctx.strokeStyle = 'rgba(140, 60, 30, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (const [px, ph] of peaks) {
    ctx.lineTo(px - 30, baseY);
    ctx.lineTo(px, baseY - ph);
    ctx.lineTo(px + 30, baseY);
  }
  ctx.lineTo(DESIGN_W, baseY);
  ctx.stroke();
  ctx.restore();
}

// ── Main cathedral with rose window ───────────────────────────
function drawCathedral(ctx: CanvasRenderingContext2D, time: number): void {
  const baseY = DESIGN_H * 0.68;
  const cx = DESIGN_W / 2;

  // Backlight glow behind the cathedral (so the silhouette pops).
  const glow = ctx.createRadialGradient(cx, baseY - 80, 20, cx, baseY - 80, 300);
  glow.addColorStop(0,   'rgba(180, 80, 30, 0.25)');
  glow.addColorStop(0.5, 'rgba(120, 40, 15, 0.12)');
  glow.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 300, baseY - 380, 600, 460);

  ctx.save();
  ctx.fillStyle = '#050308';

  // Main cathedral body — central nave + two massive bell towers.
  ctx.beginPath();

  // Left bell tower.
  const towerL = {x: 420, w: 70, h: 360};
  ctx.moveTo(towerL.x, baseY);
  ctx.lineTo(towerL.x, baseY - towerL.h);
  // Tower steeple — pointed arch roof.
  ctx.lineTo(towerL.x - 4, baseY - towerL.h - 8);
  ctx.lineTo(towerL.x + towerL.w / 2, baseY - towerL.h - 48);
  ctx.lineTo(towerL.x + towerL.w + 4, baseY - towerL.h - 8);
  ctx.lineTo(towerL.x + towerL.w, baseY - towerL.h);
  ctx.lineTo(towerL.x + towerL.w, baseY - 240); // drop down to nave roof
  // Central nave — pointed arch.
  ctx.lineTo(430, baseY - 240);
  ctx.lineTo(430, baseY - 260);
  ctx.quadraticCurveTo(cx, baseY - 320, 594, baseY - 260);
  ctx.lineTo(594, baseY - 240);
  ctx.lineTo(594, baseY - 240);
  // Right bell tower.
  const towerR = {x: 534, w: 70, h: 360};
  ctx.lineTo(towerR.x, baseY - 240);
  ctx.lineTo(towerR.x, baseY - towerR.h);
  ctx.lineTo(towerR.x - 4, baseY - towerR.h - 8);
  ctx.lineTo(towerR.x + towerR.w / 2, baseY - towerR.h - 48);
  ctx.lineTo(towerR.x + towerR.w + 4, baseY - towerR.h - 8);
  ctx.lineTo(towerR.x + towerR.w, baseY - towerR.h);
  ctx.lineTo(towerR.x + towerR.w, baseY);
  ctx.closePath();
  ctx.fill();

  // Flying buttresses (simple angled silhouettes on each side).
  ctx.beginPath();
  ctx.moveTo(340, baseY);
  ctx.lineTo(340, baseY - 80);
  ctx.lineTo(420, baseY - 160);
  ctx.lineTo(420, baseY - 140);
  ctx.lineTo(360, baseY - 70);
  ctx.lineTo(360, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(684, baseY);
  ctx.lineTo(684, baseY - 80);
  ctx.lineTo(604, baseY - 160);
  ctx.lineTo(604, baseY - 140);
  ctx.lineTo(664, baseY - 70);
  ctx.lineTo(664, baseY);
  ctx.closePath();
  ctx.fill();

  // Rose window — glowing circle on the nave.
  const roseX = cx;
  const roseY = baseY - 185;
  const roseR = 34;
  const rosePulse = 0.7 + Math.sin(time * 0.002) * 0.3;

  // Outer halo.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rhalo = ctx.createRadialGradient(roseX, roseY, 0, roseX, roseY, 120);
  rhalo.addColorStop(0,   'rgba(255, 120, 40, ' + (0.5 * rosePulse).toFixed(3) + ')');
  rhalo.addColorStop(0.4, 'rgba(200, 60, 20, ' + (0.25 * rosePulse).toFixed(3) + ')');
  rhalo.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rhalo;
  ctx.fillRect(roseX - 120, roseY - 120, 240, 240);
  ctx.restore();

  // Rose window disc.
  ctx.fillStyle = '#ff6a20';
  ctx.beginPath();
  ctx.arc(roseX, roseY, roseR, 0, Math.PI * 2);
  ctx.fill();

  // Tracery — 6 radial spokes + inner circle (stained glass).
  ctx.strokeStyle = '#05030899';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(roseX, roseY);
    ctx.lineTo(roseX + Math.cos(ang) * roseR, roseY + Math.sin(ang) * roseR);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(roseX, roseY, roseR * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  // Small arched windows on the towers — dim gold flickers.
  const winPulse = 0.6 + Math.sin(time * 0.003) * 0.3;
  ctx.fillStyle = 'rgba(210, 120, 50, ' + (0.55 * winPulse).toFixed(3) + ')';
  for (const tx of [towerL.x + 20, towerL.x + 44, towerR.x + 20, towerR.x + 44]) {
    ctx.fillRect(tx - 3, baseY - 280, 6, 14);
    ctx.fillRect(tx - 3, baseY - 200, 6, 14);
  }

  ctx.restore();
}

// ── Mid-ground spires (old cathedral silhouette, pushed lower) ─
function drawMidSpires(ctx: CanvasRenderingContext2D): void {
  const baseY = DESIGN_H * 0.72;
  ctx.save();
  ctx.fillStyle = '#030206';
  const spires = [
    {x: 60,  h: 130, w: 40},
    {x: 150, h: 180, w: 52},
    {x: 230, h: 140, w: 42},
    {x: 300, h: 190, w: 56},
    {x: 395, h: 170, w: 48},
    // center gap for cathedral
    {x: 620, h: 175, w: 50},
    {x: 710, h: 210, w: 58},
    {x: 790, h: 170, w: 46},
    {x: 870, h: 145, w: 40},
    {x: 960, h: 175, w: 48},
  ];
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, baseY);
  for (const s of spires) {
    const left = s.x - s.w / 2;
    const right = s.x + s.w / 2;
    ctx.lineTo(left, baseY);
    ctx.lineTo(left, baseY - s.h * 0.6);
    ctx.quadraticCurveTo(s.x, baseY - s.h - 25, right, baseY - s.h * 0.6);
    ctx.lineTo(right, baseY);
  }
  ctx.lineTo(DESIGN_W, baseY);
  ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Torches ───────────────────────────────────────────────────
function drawTorches(ctx: CanvasRenderingContext2D, torches: Torch[], time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of torches) {
    // Flicker via layered sines.
    const flick = 0.65 + Math.sin(time * 0.012 + t.seed * 20) * 0.2
                       + Math.sin(time * 0.031 + t.seed * 13) * 0.15;
    const r = 28 + flick * 6;
    const halo = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
    halo.addColorStop(0,   'rgba(255, 170, 70, ' + (0.9 * flick).toFixed(3) + ')');
    halo.addColorStop(0.4, 'rgba(220, 90, 30, ' + (0.4 * flick).toFixed(3) + ')');
    halo.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2);

    // Hot core.
    ctx.fillStyle = 'rgba(255, 220, 150, ' + (0.9 * flick).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 2 + flick * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Hanging chains ────────────────────────────────────────────
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
    // Orb at the bottom.
    ctx.beginPath();
    ctx.arc(bottomX, c.yBot, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Volumetric fog ────────────────────────────────────────────
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
    ctx.fillStyle = fog;
    ctx.fillRect(0, yBand - 90, DESIGN_W, 180);
  }
  // Low mist near the ground.
  const lowFog = ctx.createLinearGradient(0, DESIGN_H - 180, 0, DESIGN_H);
  lowFog.addColorStop(0, 'rgba(80, 60, 90, 0)');
  lowFog.addColorStop(1, 'rgba(80, 60, 90, 0.15)');
  ctx.fillStyle = lowFog;
  ctx.fillRect(0, DESIGN_H - 180, DESIGN_W, 180);
  ctx.restore();
}

// ── Foreground broken pillars framing the scene ───────────────
function drawForegroundPillars(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = '#020104';

  // Left pillar (tall, broken top).
  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, 180);
  ctx.lineTo(22, 160);
  ctx.lineTo(18, 200);
  ctx.lineTo(30, 240);
  ctx.lineTo(40, 300);
  ctx.lineTo(36, 380);
  ctx.lineTo(44, 460);
  ctx.lineTo(38, DESIGN_H);
  ctx.closePath();
  ctx.fill();

  // Right pillar.
  ctx.beginPath();
  ctx.moveTo(DESIGN_W, DESIGN_H);
  ctx.lineTo(DESIGN_W, 200);
  ctx.lineTo(DESIGN_W - 28, 170);
  ctx.lineTo(DESIGN_W - 20, 220);
  ctx.lineTo(DESIGN_W - 36, 280);
  ctx.lineTo(DESIGN_W - 26, 360);
  ctx.lineTo(DESIGN_W - 44, 440);
  ctx.lineTo(DESIGN_W - 34, DESIGN_H);
  ctx.closePath();
  ctx.fill();

  // Rim-light highlights — backlit from the horizon glow.
  ctx.strokeStyle = 'rgba(120, 50, 20, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(38, 420); ctx.lineTo(44, 460); ctx.lineTo(38, 540);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(DESIGN_W - 38, 420); ctx.lineTo(DESIGN_W - 44, 460); ctx.lineTo(DESIGN_W - 38, 540);
  ctx.stroke();
  ctx.restore();
}

// ── Bonfire at the player's feet ──────────────────────────────
function drawBonfire(ctx: CanvasRenderingContext2D, bg: BgState, time: number, dt: number): void {
  const cx = 512, cy = 730;
  const flick = 0.75 + Math.sin(time * 0.015) * 0.15 + Math.sin(time * 0.037) * 0.1;

  // Warm floor glow — the one point of light in the scene.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 180 * flick;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0,   'rgba(255, 160, 70, ' + (0.55 * flick).toFixed(3) + ')');
  glow.addColorStop(0.3, 'rgba(220, 90, 30, ' + (0.3 * flick).toFixed(3) + ')');
  glow.addColorStop(0.7, 'rgba(120, 30, 10, 0.1)');
  glow.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // Spawn bonfire embers (rising).
  if (bg.bonfireEmbers.length < 30 && Math.random() < 0.4 * dt) {
    const maxLife = 40 + Math.random() * 30;
    bg.bonfireEmbers.push({
      x: cx + (Math.random() - 0.5) * 30,
      y: cy - 4,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1 - Math.random() * 1.2,
      life: maxLife,
      maxLife,
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = bg.bonfireEmbers.length - 1; i >= 0; i--) {
    const e = bg.bonfireEmbers[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.life -= dt;
    if (e.life <= 0) {
      bg.bonfireEmbers.splice(i, 1);
      continue;
    }
    const t = e.life / e.maxLife;
    ctx.fillStyle = 'rgba(255, 180, 80, ' + (t * 0.9).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Rising embers (keep existing behavior) ────────────────────
function drawEmbers(ctx: CanvasRenderingContext2D, embers: Ember[], dt: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.life -= dt;
    e.flicker += 0.08 * dt;
    if (e.life <= 0 || e.y < -10) {
      embers[i] = makeEmber();
      continue;
    }
    const lifeT = e.life / e.maxLife;
    const pulse = 0.55 + Math.sin(e.flicker) * 0.35;
    const alpha = Math.min(1, lifeT * 1.4) * pulse;
    ctx.fillStyle = 'hsla(' + e.hue + ', 95%, 55%, ' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Lightning ─────────────────────────────────────────────────
function updateLightning(bg: BgState, time: number): void {
  if (bg.lightningStart === 0 && time >= bg.nextLightningAt) {
    bg.lightningStart = time;
    bg.nextLightningAt = time + 15000 + Math.random() * 20000;
  }
  if (bg.lightningStart > 0 && time - bg.lightningStart > 420) {
    bg.lightningStart = 0;
  }
}

function drawLightningFlash(ctx: CanvasRenderingContext2D, bg: BgState, time: number): void {
  if (bg.lightningStart === 0) return;
  const t = time - bg.lightningStart;
  // Double-flash pattern: peak → dim → peak → out.
  let intensity = 0;
  if (t < 80)       intensity = t / 80;
  else if (t < 160) intensity = 1 - (t - 80) / 80 * 0.6;
  else if (t < 240) intensity = 0.4 + (t - 160) / 80 * 0.5;
  else              intensity = Math.max(0, 0.9 - (t - 240) / 180);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(160, 180, 220, ' + (intensity * 0.55).toFixed(3) + ')';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.restore();
}

// ── Vignette ──────────────────────────────────────────────────
function drawVignette(ctx: CanvasRenderingContext2D, time: number, lowHp: boolean): void {
  if (lowHp) {
    const pulse = 0.45 + Math.sin(time * 0.008) * 0.2;
    const vg = ctx.createRadialGradient(
      DESIGN_W / 2, DESIGN_H / 2, 240,
      DESIGN_W / 2, DESIGN_H / 2, 620,
    );
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(140, 0, 0, ' + pulse.toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  } else {
    const vg = ctx.createRadialGradient(
      DESIGN_W / 2, DESIGN_H / 2, 300,
      DESIGN_W / 2, DESIGN_H / 2, 680,
    );
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }
}

// ─────────────────────────────────────────────────────────────
// In-game entity rendering — words, fireballs, shockwaves, particles.
// ─────────────────────────────────────────────────────────────

export function drawWordAura(
  ctx: CanvasRenderingContext2D,
  word: Word,
  wordWidth: number,
  time: number,
): void {
  const pulse = 0.8 + Math.sin(time * 0.004 + word.x * 0.01) * 0.2;
  const cx = word.x + wordWidth / 2;
  const cy = word.y - 8;
  const r = Math.max(60, wordWidth * 0.7) * pulse;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  if (word.isSpecial) {
    g.addColorStop(0, 'rgba(255, 120, 200, 0.35)');
    g.addColorStop(0.5, 'rgba(220, 60, 160, 0.12)');
    g.addColorStop(1, 'rgba(220, 60, 160, 0)');
  } else {
    g.addColorStop(0, 'rgba(80, 30, 90, 0.32)');
    g.addColorStop(0.5, 'rgba(40, 10, 50, 0.14)');
    g.addColorStop(1, 'rgba(40, 10, 50, 0)');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

export function drawFireball(
  ctx: CanvasRenderingContext2D,
  fb: Fireball,
  combo: number,
  rankId: string,
): string {
  const isSpear = rankId === 'S' || rankId === 'SS' || rankId === 'SSS';
  const isSSS = rankId === 'SSS';
  const spearMul = isSSS ? 1.0 : rankId === 'SS' ? 0.7 : 0.4;
  const baseSize = isSpear ? 10 * spearMul : 5;
  const scale = 1 + combo / 150;
  const size = baseSize * scale;

  const color = fb.isSpecial
    ? '#ff80cc'
    : isSpear
      ? isSSS ? '#00ddff' : '#55bbff'
      : 'hsl(' + (20 + combo) + ', 100%, 55%)';

  // Outer halo.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const haloR = size * (isSpear ? 4 : 3);
  const halo = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, haloR);
  halo.addColorStop(0, fb.isSpecial
    ? 'rgba(255, 128, 204, 0.6)'
    : isSpear
      ? isSSS ? 'rgba(0, 221, 255, 0.65)' : 'rgba(85, 187, 255, 0.55)'
      : 'rgba(255, 90, 20, 0.6)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(fb.x - haloR, fb.y - haloR, haloR * 2, haloR * 2);
  ctx.restore();

  // Inner shape.
  ctx.save();
  ctx.shadowBlur = isSpear ? 32 : 14 + combo / 6;
  ctx.shadowColor = fb.isSpecial ? '#ff0099' : isSpear ? (isSSS ? '#00ffff' : '#0055ff') : '#ff4500';
  ctx.fillStyle = color;
  ctx.beginPath();

  if (fb.isSpecial) {
    const s = size * 6;
    ctx.moveTo(fb.x, fb.y + s / 4);
    ctx.bezierCurveTo(fb.x, fb.y, fb.x - s / 3, fb.y - s / 4, fb.x - s / 3, fb.y + s / 4);
    ctx.bezierCurveTo(fb.x - s / 3, fb.y + s / 2, fb.x, fb.y + s * 0.8, fb.x, fb.y + s);
    ctx.bezierCurveTo(fb.x, fb.y + s * 0.8, fb.x + s / 3, fb.y + s / 2, fb.x + s / 3, fb.y + s / 4);
    ctx.bezierCurveTo(fb.x + s / 3, fb.y - s / 4, fb.x, fb.y, fb.x, fb.y + s / 4);
  } else if (isSpear) {
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

  if (isSSS && !fb.isSpecial) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(fb.x, fb.y, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return color;
}

export function drawShockwave(
  ctx: CanvasRenderingContext2D,
  sw: Shockwave,
): void {
  const t = sw.radius / sw.maxRadius;
  const alpha = Math.max(0, 1 - t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = sw.color.replace('ALPHA', alpha.toFixed(3));
  ctx.lineWidth = Math.max(1, 3 * (1 - t));
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
): void {
  const lifeT = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = lifeT;
  ctx.fillStyle = p.color;
  if (p.isHeart) {
    const s = p.size;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + s / 4);
    ctx.bezierCurveTo(p.x, p.y, p.x - s / 2, p.y, p.x - s / 2, p.y + s / 2);
    ctx.bezierCurveTo(p.x - s / 2, p.y + s * 0.75, p.x, p.y + s, p.x, p.y + s);
    ctx.bezierCurveTo(p.x, p.y + s, p.x + s / 2, p.y + s * 0.75, p.x + s / 2, p.y + s / 2);
    ctx.bezierCurveTo(p.x + s / 2, p.y, p.x, p.y, p.x, p.y + s / 4);
    ctx.fill();
  } else {
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
