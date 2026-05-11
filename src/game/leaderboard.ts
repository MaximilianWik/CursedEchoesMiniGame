/**
 * Global leaderboard client — talks to /api/scores and /api/leaderboard.
 *
 * The HMAC secret is read from `import.meta.env.VITE_SCORE_HMAC_SECRET`.
 * It's bundled into the client (a determined attacker can extract it); see
 * the plan's "Light tradeoff" note. It exists to stop casual `curl` abuse.
 */

import {APP_VERSION} from '../version';

export type LeaderboardRow = {
  name: string;
  souls: number;
  max_combo: number;
};

const HMAC_SECRET: string = (import.meta.env.VITE_SCORE_HMAC_SECRET as string | undefined) ?? '';

/** HMAC-SHA256 over `message` using the shared secret, hex-encoded. */
async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(HMAC_SECRET),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Submit a score to the global leaderboard.
 * Throws on non-2xx with the server's error text — caller decides how to surface.
 */
export async function submitScore(
  name: string,
  souls: number,
  maxCombo: number,
): Promise<void> {
  const gameVersion = APP_VERSION;
  const sig = await hmacHex(`${souls}|${maxCombo}|${gameVersion}`);
  const r = await fetch('/api/scores', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({name, souls, maxCombo, gameVersion, sig}),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new Error(text || `submit failed (${r.status})`);
  }
}

/** Fetch the current global top 10. */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const r = await fetch('/api/leaderboard');
  if (!r.ok) throw new Error(`leaderboard fetch failed (${r.status})`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error('leaderboard: bad shape');
  return data as LeaderboardRow[];
}

const LAST_NAME_KEY = 'abyss_global_name';

/** Persist last-used name so returning players don't retype. */
export function loadLastName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastName(name: string): void {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
