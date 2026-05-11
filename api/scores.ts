/**
 * POST /api/scores — submit a global leaderboard entry.
 *
 * Body: { name, souls, maxCombo, gameVersion, sig }
 *   sig = HMAC-SHA256(secret, `${souls}|${maxCombo}|${gameVersion}`) hex
 *
 * Defenses (light, by design — see plan):
 *   • Shape + range validation
 *   • HMAC signature with shared secret (stops `curl` abuse, not source-readers)
 *   • Per-IP rate limit: 10 submissions / hour
 *   • Name sanitization (control chars stripped, trimmed, ≤20 chars)
 */

import {neon} from '@neondatabase/serverless';
import {createHmac, timingSafeEqual} from 'node:crypto';

export const config = {runtime: 'nodejs'};

const MAX_SOULS = 10_000_000;
const MAX_COMBO = 100_000;
const RATE_LIMIT_PER_HOUR = 10;

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('method not allowed', {status: 405});
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return bad('json');

  const {name, souls, maxCombo, gameVersion, sig} = body as Record<string, unknown>;

  // Shape + range validation
  if (typeof name !== 'string' || name.length < 1 || name.length > 40) return bad('name');
  if (!Number.isInteger(souls) || (souls as number) < 0 || (souls as number) > MAX_SOULS) return bad('souls');
  if (!Number.isInteger(maxCombo) || (maxCombo as number) < 0 || (maxCombo as number) > MAX_COMBO) return bad('combo');
  if (typeof gameVersion !== 'string' || gameVersion.length === 0 || gameVersion.length > 32) return bad('version');
  if (typeof sig !== 'string') return bad('sig');

  // HMAC verification
  const secret = process.env.SCORE_HMAC_SECRET;
  if (!secret) {
    console.error('SCORE_HMAC_SECRET not set');
    return new Response(JSON.stringify({error: 'misconfigured'}), {status: 500});
  }
  const expected = createHmac('sha256', secret)
    .update(`${souls}|${maxCombo}|${gameVersion}`)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return new Response(JSON.stringify({error: 'bad sig'}), {status: 403});
  }

  // Per-IP rate limit
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()) || '0.0.0.0';
  const sql = neon(process.env.DATABASE_URL!);
  try {
    const rateRows = await sql`
      select count(*)::int as count from scores
      where client_ip = ${ip}::inet and created_at > now() - interval '1 hour'
    ` as Array<{count: number}>;
    if (rateRows[0] && rateRows[0].count >= RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({error: 'rate limited'}), {status: 429});
    }

    // Sanitize name: strip control chars, trim, clamp to 20
    const cleanName = (name as string).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 20);
    if (!cleanName) return bad('name');

    await sql`
      insert into scores (name, souls, max_combo, game_version, client_ip)
      values (${cleanName}, ${souls as number}, ${maxCombo as number}, ${gameVersion as string}, ${ip}::inet)
    `;
    return new Response(JSON.stringify({ok: true}), {
      headers: {'content-type': 'application/json'},
    });
  } catch (err) {
    console.error('scores insert error', err);
    return new Response(JSON.stringify({error: 'internal'}), {status: 500});
  }
}

function bad(field: string) {
  return new Response(JSON.stringify({error: `invalid ${field}`}), {
    status: 400,
    headers: {'content-type': 'application/json'},
  });
}
