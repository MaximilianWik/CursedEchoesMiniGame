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
