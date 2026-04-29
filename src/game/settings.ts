/**
 * Persisted, globally-shared game settings.
 * Uses a tiny publish/subscribe store so React components AND the game loop
 * can react to changes without bouncing through React state.
 */

import {useEffect, useState} from 'react';

export type Settings = {
  volumeMaster: number;    // 0..1
  volumeMusic: number;     // 0..1
  volumeSfx: number;       // 0..1
  reduceMotion: boolean;   // disable shake, rank-up sweep, zoom
  highContrast: boolean;   // brighter text, no bg blur
  colorblind: boolean;     // swap red/green → red/blue
  fontScale: number;       // 0.8 | 1.0 | 1.2
};

const DEFAULTS: Settings = {
  volumeMaster: 0.7,
  volumeMusic: 0.4,
  volumeSfx: 0.8,
  reduceMotion: false,
  highContrast: false,
  colorblind: false,
  fontScale: 1.0,
};

const KEY = 'abyss_settings_v1';

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {...DEFAULTS};
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {...DEFAULTS, ...parsed};
  } catch {
    return {...DEFAULTS};
  }
}

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
}

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>): void {
  current = {...current, ...patch};
  persist();
  for (const l of listeners) l(current);
}

export function resetSettings(): void {
  current = {...DEFAULTS};
  persist();
  for (const l of listeners) l(current);
}

// ─────────────────────────────────────────────────────────────
// Save-data keys (not settings, but kept here so one file owns
// the full inventory of keys we persist into localStorage).
//
// 0.3.2: the BossSelect fork now appears on every Undead Burg clear
// (not just the first). We no longer track a "seen" flag; only the
// last pick is remembered, purely for pre-focusing the matching
// panel on the next appearance. `resetBossSelectGate` still exists
// so the dev console / Settings → Reset save data can forget the
// last pick — nothing else reads the flag anymore.
// ─────────────────────────────────────────────────────────────

const BOSS_SELECT_CHOICE_KEY = 'abyss_boss_select_choice';
const HIGHSCORES_KEY = 'abyss_highscores';

export type BossSelectChoice = 'taurus' | 'afroman';

/** Last boss picked from the fork, or null if the player has never chosen.
 *  Used to pre-focus that panel when the fork re-appears next run. */
export function getRememberedBossChoice(): BossSelectChoice | null {
  try {
    const v = localStorage.getItem(BOSS_SELECT_CHOICE_KEY);
    if (v === 'taurus' || v === 'afroman') return v;
    return null;
  } catch {
    return null;
  }
}

export function persistBossChoice(choice: BossSelectChoice): void {
  try {
    localStorage.setItem(BOSS_SELECT_CHOICE_KEY, choice);
  } catch { /* ignore */ }
}

/** Wipe the remembered pick so the next BossSelect appearance has no
 *  pre-selected panel. Does not suppress the screen — as of 0.3.2 the
 *  fork always shows on every Burg clear. */
export function resetBossSelectGate(): void {
  try {
    localStorage.removeItem(BOSS_SELECT_CHOICE_KEY);
    // Legacy 0.3.0/0.3.1 key — clear it too so upgraded saves don't leave
    // orphaned flags lying around. No current code reads it.
    localStorage.removeItem('abyss_boss_select_seen');
  } catch { /* ignore */ }
}

/** Wipe the hall of records (highscores). Settings → Reset save data. */
export function resetHighscores(): void {
  try { localStorage.removeItem(HIGHSCORES_KEY); } catch { /* ignore */ }
}

export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** React hook. Returns [settings, setPatch]. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [state, setState] = useState<Settings>(current);
  useEffect(() => subscribeSettings(setState), []);
  return [state, setSettings];
}
