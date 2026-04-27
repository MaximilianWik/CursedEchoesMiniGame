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
  // Walk backwards — faster than slice().reverse().find each frame.
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

/** Size a canvas to CSS pixels but back it with device-pixel-ratio resolution. */
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

/** Pre-compute glyph widths for the uppercase alphabet at 24px Cinzel. */
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

/** Seed an ember pool for the background layer. */
export function seedEmbers(count: number): Ember[] {
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

/** Render the atmospheric background: gradient, fog, cathedral, embers, vignette. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  embers: Ember[],
  time: number,
  dt: number,
  lowHp: boolean,
): void {
  // Base vertical gradient — midnight → ember black.
  const grad = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
  grad.addColorStop(0, '#0a0612');
  grad.addColorStop(0.45, '#120808');
  grad.addColorStop(1, '#050303');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // Central radial glow — a dim fire on the horizon.
  const glow = ctx.createRadialGradient(
    DESIGN_W / 2, DESIGN_H * 0.62, 30,
    DESIGN_W / 2, DESIGN_H * 0.62, 420,
  );
  glow.addColorStop(0, 'rgba(130, 50, 10, 0.35)');
  glow.addColorStop(0.5, 'rgba(60, 20, 5, 0.15)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // Drifting fog bands.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let b = 0; b < 3; b++) {
    const yBand = 200 + b * 160 + Math.sin(time * 0.0004 + b) * 25;
    const alpha = 0.03 + b * 0.01;
    const fog = ctx.createLinearGradient(0, yBand - 70, 0, yBand + 70);
    fog.addColorStop(0, 'rgba(30, 20, 60, 0)');
    fog.addColorStop(0.5, 'rgba(60, 40, 90, ' + alpha + ')');
    fog.addColorStop(1, 'rgba(30, 20, 60, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, yBand - 80, DESIGN_W, 160);
  }
  ctx.restore();

  // Distant cathedral silhouette.
  drawCathedral(ctx);

  // Embers.
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

  // Vignette — darker when low HP (pulsing red).
  if (lowHp) {
    const pulse = 0.45 + Math.sin(time * 0.008) * 0.2;
    const vg = ctx.createRadialGradient(
      DESIGN_W / 2, DESIGN_H / 2, 240,
      DESIGN_W / 2, DESIGN_H / 2, 620,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(120, 0, 0, ' + pulse.toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  } else {
    const vg = ctx.createRadialGradient(
      DESIGN_W / 2, DESIGN_H / 2, 280,
      DESIGN_W / 2, DESIGN_H / 2, 640,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }
}

function drawCathedral(ctx: CanvasRenderingContext2D): void {
  const baseY = DESIGN_H * 0.68;
  ctx.save();
  ctx.fillStyle = '#040306';
  ctx.strokeStyle = 'rgba(40, 30, 50, 0.8)';
  ctx.lineWidth = 1;

  // Left spire cluster.
  const spires = [
    {x: 90,  h: 160, w: 40},
    {x: 150, h: 220, w: 55},
    {x: 220, h: 185, w: 45},
    {x: 300, h: 260, w: 70},  // tallest
    {x: 395, h: 200, w: 50},
    {x: 470, h: 150, w: 38},
    {x: 540, h: 230, w: 60},  // center
    {x: 620, h: 180, w: 45},
    {x: 700, h: 255, w: 65},
    {x: 790, h: 195, w: 48},
    {x: 860, h: 170, w: 42},
    {x: 930, h: 210, w: 52},
  ];

  ctx.beginPath();
  ctx.moveTo(0, DESIGN_H);
  ctx.lineTo(0, baseY);
  for (const s of spires) {
    const left = s.x - s.w / 2;
    const right = s.x + s.w / 2;
    // Body.
    ctx.lineTo(left, baseY);
    ctx.lineTo(left, baseY - s.h * 0.6);
    // Pointed arch roof.
    ctx.quadraticCurveTo(s.x, baseY - s.h - 30, right, baseY - s.h * 0.6);
    ctx.lineTo(right, baseY);
  }
  ctx.lineTo(DESIGN_W, baseY);
  ctx.lineTo(DESIGN_W, DESIGN_H);
  ctx.closePath();
  ctx.fill();

  // Rim highlight — faintly catch the horizon glow.
  ctx.strokeStyle = 'rgba(120, 55, 20, 0.28)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (const s of spires) {
    const left = s.x - s.w / 2;
    const right = s.x + s.w / 2;
    ctx.lineTo(left, baseY);
    ctx.lineTo(left, baseY - s.h * 0.6);
    ctx.quadraticCurveTo(s.x, baseY - s.h - 30, right, baseY - s.h * 0.6);
    ctx.lineTo(right, baseY);
  }
  ctx.lineTo(DESIGN_W, baseY);
  ctx.stroke();
  ctx.restore();
}

/** Draw the aura behind an enemy word — pulsing soft radial. */
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

/** Draw a fireball or spear. Returns the color used (for trailing particles). */
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

  // White-hot core for SSS.
  if (isSSS && !fb.isSpecial) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(fb.x, fb.y, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return color;
}

/** Draw an expanding shockwave ring. */
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

/** Draw a single particle (square spark or small heart). */
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
