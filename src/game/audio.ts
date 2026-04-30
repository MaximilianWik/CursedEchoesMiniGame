/**
 * Procedural audio system — Bloodborne-inspired.
 *
 * Everything is synthesized via Web Audio (oscillators + noise buffers +
 * biquad filters + a shared convolution "cathedral" reverb). No audio assets.
 *
 * Aesthetic targets:
 *   • sub-bass rumbles instead of game-y "pew"s
 *   • detuned dissonant intervals (tritone, minor 2nd) for menace
 *   • long decaying tails via the cathedral reverb bus
 *   • dry filtered noise textures for wet-organic impacts
 *   • minor-key tonality throughout
 */

import {getSettings, subscribeSettings} from './settings';

type MusicLayer = {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc3: OscillatorNode;      // dissonant third voice
  lfo: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let reverbBus: ConvolverNode | null = null;       // cathedral-length IR
let reverbReturn: GainNode | null = null;         // wet return to master
let noiseBuffer: AudioBuffer | null = null;
let activeMusic: MusicLayer | null = null;
let currentMusicId: string | null = null;
let lastHeartbeatAt = 0;

/** Lazy-init the audio graph on first user gesture. */
export function initAudio(): void {
  if (ctx) return;
  try {
    const AC = (window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext);
    ctx = new AC();
    masterGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.35;
    reverbBus = ctx.createConvolver();
    reverbBus.buffer = makeReverbImpulse(ctx, 3.5, 2.2);
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    sfxGain.connect(reverbBus);
    reverbBus.connect(reverbReturn);
    reverbReturn.connect(masterGain);
    masterGain.connect(ctx.destination);
    applyVolumes();
    // 2-second white-noise buffer reused for all noise-based SFX.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
  } catch {
    ctx = null;
  }
  subscribeSettings(applyVolumes);
}

/** Build a cathedral-like reverb IR: exponential decay, slight diffusion. */
function makeReverbImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

function applyVolumes(): void {
  if (!ctx || !masterGain || !musicGain || !sfxGain) return;
  const s = getSettings();
  const now = ctx.currentTime;
  masterGain.gain.setTargetAtTime(s.volumeMaster, now, 0.05);
  musicGain.gain.setTargetAtTime(s.volumeMusic, now, 0.3);
  sfxGain.gain.setTargetAtTime(s.volumeSfx, now, 0.05);
}

export function resumeAudio(): void {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

// ─────────────────────────────────────────────────────────────
// Synth primitives
// ─────────────────────────────────────────────────────────────

type SynthTarget = 'sfx' | 'dry';   // dry = no reverb send (for dry rustles)

function destFor(target: SynthTarget): GainNode | null {
  return target === 'dry' ? masterGain : sfxGain;
}

/** Attack/decay/sustain/release envelope gain node — short-form. */
function env(a: number, d: number, s: number, r: number, peak: number): GainNode {
  if (!ctx) throw new Error('audio not initialized');
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.linearRampToValueAtTime(peak * s, t + a + d);
  g.gain.linearRampToValueAtTime(0, t + a + d + r);
  return g;
}

/** Exponential decay envelope — useful for bells, gongs, heavy impacts. */
function expDecay(duration: number, peak: number): GainNode {
  if (!ctx) throw new Error('audio not initialized');
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  return g;
}

function noise(duration: number, filter: BiquadFilterType, freq: number, q: number, peak: number, target: SynthTarget = 'sfx'): void {
  if (!ctx || !noiseBuffer) return;
  const dst = destFor(target); if (!dst) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = expDecay(duration, peak);
  src.connect(f).connect(g).connect(dst);
  src.start();
  src.stop(ctx.currentTime + duration + 0.05);
}

function tone(freq: number, duration: number, type: OscillatorType, peak: number, target: SynthTarget = 'sfx', glideTo?: number): OscillatorNode | null {
  if (!ctx) return null;
  const dst = destFor(target); if (!dst) return null;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), ctx.currentTime + duration);
  const g = expDecay(duration, peak);
  osc.connect(g).connect(dst);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.05);
  return osc;
}

/** Sub-bass body thud — the Bloodborne heartbeat. */
function subThud(freq: number, duration: number, peak: number): void {
  if (!ctx || !sfxGain) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 2.2, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + duration * 0.8);
  const g = expDecay(duration, peak);
  osc.connect(g).connect(sfxGain);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.05);
}

// ─────────────────────────────────────────────────────────────
// SFX catalog — reworked for dark/eerie Bloodborne vibes.
// ─────────────────────────────────────────────────────────────

/** Keystroke cast — a breathy, spectral exhale. Tiny, non-musical. */
export function sfxCast(combo: number): void {
  if (!ctx) return;
  // Short airy noise burst, slight upward bandpass sweep as combo grows.
  const freq = 520 + Math.min(combo, 180) * 2.2;
  noise(0.07, 'bandpass', freq, 6, 0.18, 'dry');
}

/** Missed keystroke — dry metallic flinch, no reverb. */
export function sfxMiss(): void {
  if (!ctx) return;
  noise(0.09, 'highpass', 3600, 0.8, 0.12, 'dry');
  tone(180, 0.05, 'square', 0.08, 'dry', 90);
}

/** Fireball launch — dark exhaling rush, wet. */
export function sfxFireball(): void {
  noise(0.25, 'bandpass', 620, 3, 0.22);
  tone(110, 0.18, 'sine', 0.2, 'sfx', 60);
}

/** Impact — sub thud + low noise body + detuned harmonic. */
export function sfxImpact(big: boolean): void {
  subThud(big ? 48 : 72, big ? 0.35 : 0.2, big ? 0.85 : 0.55);
  noise(big ? 0.28 : 0.18, 'lowpass', big ? 420 : 620, 1.2, big ? 0.32 : 0.22);
  // Dissonant harmonic ping.
  if (big) tone(116, 0.22, 'triangle', 0.18);
}

/** Word banished — glass-like shatter with echoing reverb tail. */
export function sfxShatter(): void {
  noise(0.28, 'highpass', 3400, 0.6, 0.22);
  tone(780, 0.12, 'triangle', 0.14, 'sfx', 1560);
  tone(932, 0.18, 'triangle', 0.10);   // minor 2nd harmonic for dissonance
}

/** Rank-up — deep church bell struck once, rich harmonic stack. */
export function sfxRankUp(rankIdx: number): void {
  if (!ctx || !sfxGain) return;
  const base = 164 * Math.pow(1.12, rankIdx);   // low, heavy
  // Harmonic series with inharmonic bell ratios.
  const ratios = [1.0, 2.0, 2.76, 4.2, 5.4];
  const amps   = [0.35, 0.2,  0.14, 0.09, 0.05];
  for (let i = 0; i < ratios.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * ratios[i];
    const g = expDecay(2.2 + i * 0.1, amps[i]);
    osc.connect(g).connect(sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 2.6);
  }
}

/** Combo break — funeral gong, thick and crushing. */
export function sfxComboBreak(): void {
  if (!ctx || !sfxGain) return;
  subThud(44, 0.6, 0.8);
  // Cluster of dissonant tones.
  [78, 83, 112].forEach((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = expDecay(0.9 + i * 0.1, 0.2);
    osc.connect(g).connect(sfxGain!);
    osc.start();
    osc.stop(ctx!.currentTime + 1.2);
  });
  noise(0.35, 'lowpass', 280, 1, 0.22);
}

/** Player hit — wet organic flesh thud. */
export function sfxPlayerHit(): void {
  subThud(58, 0.28, 0.75);
  noise(0.22, 'lowpass', 480, 1.6, 0.35);
  noise(0.12, 'bandpass', 1400, 2, 0.15);  // wet top
}

/** Bonfire lit — soft crackle + warm distant hum. No bright chime. */
export function sfxBonfire(): void {
  if (!ctx || !sfxGain) return;
  noise(1.4, 'bandpass', 900, 8, 0.08);     // crackle
  // Warm mystic drone — root + perfect fifth (restful).
  [98, 147].forEach(f => {
    const osc = ctx!.createOscillator();
    osc.type = 'sine'; osc.frequency.value = f;
    const g = expDecay(2.0, 0.14);
    osc.connect(g).connect(sfxGain!);
    osc.start(); osc.stop(ctx!.currentTime + 2.3);
  });
}

/** Estus chug — gulping + breath exhale. */
export function sfxEstus(): void {
  if (!ctx) return;
  for (let i = 0; i < 3; i++) {
    window.setTimeout(() => {
      noise(0.12, 'lowpass', 380 + i * 40, 3, 0.22, 'dry');
      tone(110 + i * 18, 0.12, 'sine', 0.25, 'dry', 70);
    }, i * 230);
  }
  // Exhale at end.
  window.setTimeout(() => noise(0.22, 'bandpass', 700, 2, 0.12, 'dry'), 700);
}

/** Dodge — cloth/cloak swish. */
export function sfxDodge(): void {
  noise(0.18, 'bandpass', 1800, 4, 0.2, 'dry');
  tone(320, 0.1, 'sine', 0.08, 'dry', 110);
}

/** Boss appears — deep evil horn + tritone drone. */
export function sfxBossAppear(): void {
  if (!ctx || !sfxGain) return;
  // Tritone — root + #4 (the Devil's interval).
  const root = 55;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sawtooth'; osc2.type = 'sawtooth';
  osc1.frequency.value = root; osc2.frequency.value = root * 1.414;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(220, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 1.2);
  filter.Q.value = 6;
  const g = env(0.25, 0.5, 0.5, 1.6, 0.55);
  osc1.connect(filter); osc2.connect(filter);
  filter.connect(g).connect(sfxGain);
  osc1.start(); osc2.start();
  const stopAt = ctx.currentTime + 2.5;
  osc1.stop(stopAt); osc2.stop(stopAt);
  // Low hit underneath.
  subThud(36, 1.2, 0.7);
}

/** Boss defeated — dissonant chord resolving inward, long tail. */
export function sfxBossDefeated(): void {
  if (!ctx || !sfxGain) return;
  // Minor chord with sliding top to major third — relief after horror.
  const chord = [110, 131, 156];
  chord.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    if (i === 2) {
      // Top note glides up 20 cents at the end — resolution.
      osc.frequency.setValueAtTime(f, ctx!.currentTime + 0.2);
      osc.frequency.linearRampToValueAtTime(f * 1.012, ctx!.currentTime + 1.2);
    }
    const g = expDecay(3.0 + i * 0.1, 0.28);
    osc.connect(g).connect(sfxGain!);
    osc.start(); osc.stop(ctx!.currentTime + 3.4);
  });
  subThud(52, 1.2, 0.5);
}

/** Death — descending dissonant wail, long bleed. */
export function sfxDeath(): void {
  if (!ctx || !sfxGain) return;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sawtooth'; osc2.type = 'sawtooth';
  osc1.frequency.setValueAtTime(330, ctx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 2.2);
  osc2.frequency.setValueAtTime(330 * 1.059, ctx.currentTime);     // minor 2nd above
  osc2.frequency.exponentialRampToValueAtTime(55 * 1.059, ctx.currentTime + 2.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 2.2);
  const g = expDecay(2.4, 0.45);
  osc1.connect(filter); osc2.connect(filter);
  filter.connect(g).connect(sfxGain);
  osc1.start(); osc2.start();
  osc1.stop(ctx.currentTime + 2.6); osc2.stop(ctx.currentTime + 2.6);
  noise(1.5, 'lowpass', 280, 1, 0.22);
}

/** Boss scream — guttural descending wail with two detuned voices + heavy reverb.
 * Played at the moment a boss HP hits 0. ~2.5s long. */
export function sfxBossScream(): void {
  if (!ctx || !sfxGain) return;
  const start = ctx.currentTime;
  // Two detuned sawtooth voices gliding from mid-high down to sub-bass.
  const v1 = ctx.createOscillator();
  const v2 = ctx.createOscillator();
  v1.type = 'sawtooth'; v2.type = 'sawtooth';
  v1.frequency.setValueAtTime(420, start);
  v1.frequency.exponentialRampToValueAtTime(60, start + 2.0);
  // Detuned voice — creates a beating, anguished dissonance.
  v2.frequency.setValueAtTime(420 * 0.946, start);         // minor-2nd below
  v2.frequency.exponentialRampToValueAtTime(60 * 0.946, start + 2.0);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, start);
  filter.frequency.exponentialRampToValueAtTime(320, start + 2.0);
  filter.Q.value = 4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(0.6, start + 0.15);
  g.gain.linearRampToValueAtTime(0.55, start + 1.8);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 2.5);
  v1.connect(filter); v2.connect(filter);
  filter.connect(g).connect(sfxGain);
  v1.start(); v2.start();
  v1.stop(start + 2.6); v2.stop(start + 2.6);
  // Breathy noise layered on top for grit.
  noise(1.5, 'bandpass', 900, 1.5, 0.3);
}

/** Boss collapse — deep rumble + crumbling debris. Played mid-cutscene. */
export function sfxBossCollapse(): void {
  if (!ctx) return;
  // Deep sub-bass rumble.
  subThud(38, 1.2, 0.85);
  // Layered crumble noise.
  noise(1.2, 'lowpass', 240, 0.8, 0.38);
  noise(0.6, 'bandpass', 1600, 0.6, 0.18);
  // Secondary thud after 300ms.
  window.setTimeout(() => { subThud(30, 0.9, 0.7); noise(0.8, 'lowpass', 180, 1, 0.25); }, 320);
}

/** Final cutscene boom — the last exhale when the boss vanishes. */
export function sfxBossFinale(): void {
  if (!ctx || !sfxGain) return;
  subThud(28, 1.4, 0.9);
  noise(1.6, 'lowpass', 320, 1, 0.4);
  // Brief rising chord — the light returning.
  [82, 110, 164].forEach((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = expDecay(2.0, 0.18);
    osc.connect(g).connect(sfxGain!);
    osc.start(); osc.stop(ctx!.currentTime + 2.2);
  });
}

/** Heartbeat — double sub-thump; self-throttled. Call each frame. */
export function sfxHeartbeat(now: number): void {
  if (!ctx) return;
  if (now - lastHeartbeatAt < 900) return;
  lastHeartbeatAt = now;
  subThud(50, 0.14, 0.6);
  window.setTimeout(() => subThud(50, 0.14, 0.5), 180);
}

// ─────────────────────────────────────────────────────────────
// 0.2.8 additions — dedicated sounds for Jessyka grace, boss
// summons, lich split, estus godmode, word-switch, kiss impact.
// Warm / major-key tonality reserved for Jessyka (contrasts the
// Bloodborne dissonance elsewhere) so her moments land as relief.
// ─────────────────────────────────────────────────────────────

/** Jessyka's grace shield — the heartwarming love-explosion. Major chord
 *  arpeggio (C major) with a sub-bass impact underneath and a shimmering
 *  bell stack on top. Long tail so the aftermath lingers. */
export function sfxJessykaGrace(): void {
  if (!ctx || !sfxGain) return;
  // Sub impact — the "WHOOMPH" of the explosion.
  subThud(52, 0.9, 0.95);
  // Major chord arpeggio (C E G C) — ascending, ringing.
  const notes = [262, 330, 392, 523, 659];       // C4 E4 G4 C5 E5
  notes.forEach((f, i) => {
    window.setTimeout(() => {
      if (!ctx || !sfxGain) return;
      // Bell-ish body — sine + inharmonic partial.
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine'; osc2.type = 'triangle';
      osc1.frequency.value = f;
      osc2.frequency.value = f * 2.01;              // slightly inharmonic shimmer
      const g = expDecay(2.0 + i * 0.15, 0.28);
      osc1.connect(g); osc2.connect(g);
      g.connect(sfxGain);
      osc1.start(); osc2.start();
      const stopAt = ctx.currentTime + 2.4;
      osc1.stop(stopAt); osc2.stop(stopAt);
    }, i * 75);
  });
  // High shimmer — breathy noise in a narrow bandpass, pitched up.
  noise(1.4, 'bandpass', 3200, 8, 0.14);
  // Warm low drone for the last 1.5s — fills the space after the chord.
  window.setTimeout(() => {
    if (!ctx || !sfxGain) return;
    const drone = ctx.createOscillator();
    drone.type = 'sine'; drone.frequency.value = 131;   // C3
    const g = expDecay(1.2, 0.18);
    drone.connect(g).connect(sfxGain);
    drone.start(); drone.stop(ctx.currentTime + 1.5);
  }, 260);
}

/** Boss summons a chanter — dissonant whisper rising into a snarl. */
export function sfxBossSummonChanter(): void {
  if (!ctx || !sfxGain) return;
  noise(0.7, 'bandpass', 1200, 4, 0.18);
  // Low growl that rises in pitch (summoning gesture).
  tone(82, 0.7, 'sawtooth', 0.22, 'sfx', 196);
  // Dissonant high whisper.
  tone(620, 0.35, 'triangle', 0.08, 'sfx', 880);
  subThud(44, 0.5, 0.5);
}

/** Boss summons a caster — sharper, more metallic, with a crackle. */
export function sfxBossSummonCaster(): void {
  if (!ctx || !sfxGain) return;
  noise(0.35, 'highpass', 2600, 1.2, 0.16);
  noise(0.5,  'bandpass', 1400, 6, 0.2);
  tone(147, 0.4, 'sawtooth', 0.25, 'sfx', 330);
  tone(440, 0.25, 'square', 0.08, 'sfx', 880);
  subThud(58, 0.3, 0.45);
}

/** Lich split on death — crystalline purple shatter with a reverb-heavy body. */
export function sfxLichSplit(): void {
  if (!ctx || !sfxGain) return;
  // Bright shatter noise.
  noise(0.45, 'highpass', 3800, 0.6, 0.26);
  // Dissonant minor-chord body.
  [196, 233, 294].forEach((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = expDecay(0.9 + i * 0.1, 0.16);
    osc.connect(g).connect(sfxGain!);
    osc.start(); osc.stop(ctx!.currentTime + 1.2);
  });
  subThud(66, 0.35, 0.55);
}

/** Estus godmode starts — bright golden bell ring announcing the i-frame window. */
export function sfxEstusGodmode(): void {
  if (!ctx || !sfxGain) return;
  // Ascending perfect-fourth bell (G → C) — hopeful, major tonality.
  const pairs: [number, number][] = [[392, 1.0], [523, 2.01], [784, 3.04]];
  pairs.forEach(([f, ratio], i) => {
    const osc1 = ctx!.createOscillator();
    const osc2 = ctx!.createOscillator();
    osc1.type = 'sine'; osc2.type = 'triangle';
    osc1.frequency.value = f;
    osc2.frequency.value = f * ratio;
    const g = expDecay(1.8 - i * 0.2, 0.18);
    osc1.connect(g); osc2.connect(g);
    g.connect(sfxGain!);
    osc1.start(); osc2.start();
    const stopAt = ctx!.currentTime + 2.0;
    osc1.stop(stopAt); osc2.stop(stopAt);
  });
  // Airy shimmer over the top.
  noise(0.8, 'bandpass', 4200, 10, 0.08);
}

/** Word-switch rescue — quick "whoosh" cue that the target pivoted. Dry,
 *  non-musical, so it doesn't step on the cast/fireball audio that follows. */
export function sfxWordSwitch(): void {
  if (!ctx) return;
  noise(0.14, 'bandpass', 2200, 6, 0.16, 'dry');
  tone(520, 0.08, 'triangle', 0.08, 'dry', 880);
}

/** Kiss connects on a projectile or word — soft heart-chime. */
export function sfxJessykaKissImpact(): void {
  if (!ctx) return;
  tone(880, 0.12, 'triangle', 0.14);
  tone(1175, 0.18, 'sine', 0.08);         // major third up
  noise(0.08, 'highpass', 4000, 1.2, 0.08, 'dry');
}

/** Jessyka Q-summon — celebratory chord swell (heart chord). */
export function sfxJessykaSummon(): void {
  if (!ctx || !sfxGain) return;
  // Major triad rising (F A C) — warm summon.
  [349, 440, 523].forEach((f, i) => {
    window.setTimeout(() => {
      if (!ctx || !sfxGain) return;
      const osc = ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = f;
      const g = expDecay(1.4, 0.22);
      osc.connect(g).connect(sfxGain);
      osc.start(); osc.stop(ctx.currentTime + 1.8);
    }, i * 60);
  });
  noise(0.45, 'bandpass', 1600, 4, 0.14);
  subThud(88, 0.28, 0.3);
}

// ─────────────────────────────────────────────────────────────
// Music — dark dissonant drone per zone.
// Three detuned saws: root + flat-5th + octave, low-pass + slow LFO on cutoff.
// ─────────────────────────────────────────────────────────────

type DroneConfig = {root: number; interval: number; cutoff: number; lfoRate: number; detune: number};
const DRONES: Record<string, DroneConfig> = {
  menu:      {root: 58,  interval: 1.498, cutoff: 520, lfoRate: 0.05, detune: 6},
  firelink:  {root: 55,  interval: 1.498, cutoff: 520, lfoRate: 0.06, detune: 7},
  burg:      {root: 62,  interval: 1.189, cutoff: 620, lfoRate: 0.09, detune: 12},   // minor 3rd: grim
  anorlondo: {root: 82,  interval: 1.498, cutoff: 900, lfoRate: 0.05, detune: 4},    // majestic
  kiln:      {root: 46,  interval: 1.414, cutoff: 420, lfoRate: 0.12, detune: 18},   // tritone: horror
  boss:      {root: 41,  interval: 1.414, cutoff: 520, lfoRate: 0.22, detune: 22},   // tritone: dread
  victory:   {root: 98,  interval: 1.498, cutoff: 1100, lfoRate: 0.05, detune: 2},
};

export function playMusic(id: keyof typeof DRONES): void {
  if (!ctx || !musicGain) { initAudio(); if (!ctx || !musicGain) return; }
  if (currentMusicId === id) return;
  stopMusic(1.2);
  const cfg = DRONES[id];
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const osc3 = ctx.createOscillator();
  osc1.type = 'sawtooth'; osc2.type = 'sawtooth'; osc3.type = 'triangle';
  osc1.frequency.value = cfg.root;
  osc2.frequency.value = cfg.root;
  osc2.detune.value = cfg.detune;
  osc3.frequency.value = cfg.root * cfg.interval;     // dissonant third voice
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cfg.cutoff;
  filter.Q.value = 3.5;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = cfg.lfoRate;
  lfoGain.gain.value = cfg.cutoff * 0.35;
  lfo.connect(lfoGain).connect(filter.frequency);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.38, ctx.currentTime + 2.2);
  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(gain).connect(musicGain);
  osc1.start(); osc2.start(); osc3.start(); lfo.start();
  activeMusic = {osc1, osc2, osc3, lfo, filter, gain};
  currentMusicId = id;
}

export function stopMusic(fade: number = 0.8): void {
  if (!ctx || !activeMusic) return;
  const m = activeMusic;
  const now = ctx.currentTime;
  m.gain.gain.cancelScheduledValues(now);
  m.gain.gain.setValueAtTime(m.gain.gain.value, now);
  m.gain.gain.linearRampToValueAtTime(0, now + fade);
  const stopAt = now + fade + 0.05;
  m.osc1.stop(stopAt); m.osc2.stop(stopAt); m.osc3.stop(stopAt); m.lfo.stop(stopAt);
  activeMusic = null;
  currentMusicId = null;
}

// ─────────────────────────────────────────────────────────────
// Music samples — real audio files (MP3) routed through the master
// chain with an AnalyserNode for beat detection. Used only by the
// secret AfroMan boss fight for now.
// ─────────────────────────────────────────────────────────────

export type MusicSampleId = 'afroman' | 'taurus';

type SampleHandle = {
  id: MusicSampleId;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
};

const SAMPLE_SRC: Record<MusicSampleId, string> = {
  afroman: '/TallCans.mp3',
  taurus: '/taurusSOUNDTRACK.mp3',
};

let activeSample: SampleHandle | null = null;
let sampleFadeTimer: number | null = null;

/** Subscribers for per-frame beat events. Called from playMusicSample's
 *  loop when the low-band energy exceeds the rolling average by a
 *  configurable threshold. */
type BeatSubscriber = (now: number) => void;
const beatSubscribers = new Set<BeatSubscriber>();

export function subscribeBeat(fn: BeatSubscriber): () => void {
  beatSubscribers.add(fn);
  return () => { beatSubscribers.delete(fn); };
}

/** Begin sample playback with fade-in. Idempotent — calling with the same
 *  id while the sample is already playing returns the existing handle. */
export function playMusicSample(id: MusicSampleId, volume: number = 1, fadeInMs: number = 1500): SampleHandle | null {
  if (!ctx) { initAudio(); if (!ctx) return null; }
  if (!musicGain) return null;
  if (activeSample && activeSample.id === id) return activeSample;
  stopMusicSample(200);   // replace any currently-playing sample
  // Stop the procedural drone — the sample is the music now.
  stopMusic(0.6);

  const audio = new Audio(SAMPLE_SRC[id]);
  audio.loop = true;
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  const source = ctx.createMediaElementSource(audio);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(gain);
  gain.connect(analyser);
  analyser.connect(musicGain);

  const handle: SampleHandle = {id, audio, source, gain, analyser};
  activeSample = handle;

  // Fade gain in via setTargetAtTime.
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + fadeInMs / 1000);

  void audio.play().catch(() => { /* autoplay block — user gesture will retry */ });

  startBeatLoop();
  return handle;
}

/** Override/re-ramp the active sample's gain value. Lets the intro cutscene
 *  gradually climb the music volume over the 20 s buildup. */
export function setMusicSampleVolume(vol: number, rampMs: number = 250): void {
  if (!ctx || !activeSample) return;
  const now = ctx.currentTime;
  activeSample.gain.gain.cancelScheduledValues(now);
  activeSample.gain.gain.setValueAtTime(activeSample.gain.gain.value, now);
  activeSample.gain.gain.linearRampToValueAtTime(Math.max(0, vol), now + rampMs / 1000);
}

/** Stop the current sample with a short fade, then release nodes. */
export function stopMusicSample(fadeMs: number = 400): void {
  if (!ctx || !activeSample) return;
  const handle = activeSample;
  activeSample = null;
  stopBeatLoop();
  const now = ctx.currentTime;
  handle.gain.gain.cancelScheduledValues(now);
  handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
  handle.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
  if (sampleFadeTimer !== null) window.clearTimeout(sampleFadeTimer);
  sampleFadeTimer = window.setTimeout(() => {
    try {
      handle.audio.pause();
      handle.audio.src = '';
      handle.source.disconnect();
      handle.gain.disconnect();
      handle.analyser.disconnect();
    } catch { /* ignore */ }
    sampleFadeTimer = null;
  }, fadeMs + 60);
}

// ── Beat detection loop ──────────────────────────────────────
// bins ~1-8 of the frequency spectrum (≈60-250 Hz) drive the bass energy.
// A rolling 1s average is kept; when instantaneous energy > avg * threshold
// AND at least MIN_BEAT_GAP has elapsed, we call onBeat for all subscribers.

const BEAT_MIN_GAP_MS = 200;
const BEAT_THRESHOLD_MUL = 1.35;
const BEAT_HISTORY_MS = 1000;
let beatRaf = 0;
let beatHistory: {t: number; energy: number}[] = [];
let lastBeatAt = 0;

function startBeatLoop(): void {
  if (beatRaf !== 0) return;
  beatHistory = [];
  lastBeatAt = 0;
  const buf = new Uint8Array(64);
  const loop = () => {
    if (!activeSample || !ctx) { beatRaf = 0; return; }
    const now = performance.now();
    activeSample.analyser.getByteFrequencyData(buf);
    let bassSum = 0;
    for (let i = 1; i <= 8; i++) bassSum += buf[i];
    const energy = bassSum / 8;
    beatHistory.push({t: now, energy});
    // Trim history older than BEAT_HISTORY_MS.
    while (beatHistory.length > 0 && now - beatHistory[0].t > BEAT_HISTORY_MS) {
      beatHistory.shift();
    }
    const avg = beatHistory.reduce((s, e) => s + e.energy, 0) / Math.max(1, beatHistory.length);
    if (energy > avg * BEAT_THRESHOLD_MUL && energy > 80 && (now - lastBeatAt) > BEAT_MIN_GAP_MS) {
      lastBeatAt = now;
      for (const fn of beatSubscribers) {
        try { fn(now); } catch { /* ignore */ }
      }
    }
    beatRaf = requestAnimationFrame(loop);
  };
  beatRaf = requestAnimationFrame(loop);
}

function stopBeatLoop(): void {
  if (beatRaf !== 0) cancelAnimationFrame(beatRaf);
  beatRaf = 0;
  beatHistory = [];
}

/** Exposed for the HUD BPM ticker — timestamp of the most recently fired beat. */
export function getLastBeatAt(): number {
  return lastBeatAt;
}
