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
import type {IncomingMessage, ServerResponse} from 'node:http';

const MAX_SOULS = 10_000_000;
const MAX_COMBO = 100_000;
const RATE_LIMIT_PER_HOUR = 10;

type ReqWithBody = IncomingMessage & {body?: unknown};

export default async function handler(req: ReqWithBody, res: ServerResponse) {
  if (req.method !== 'POST') {
    return send(res, 405, {error: 'method not allowed'});
  }

  // Vercel's Node runtime auto-parses JSON when Content-Type is application/json.
  // Fall back to manual parsing if it didn't (e.g. raw stream).
  let body: any = req.body;
  if (body == null || (typeof body === 'string' && body.length > 0)) {
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return send(res, 400, {error: 'invalid json'}); }
    } else {
      body = await readJsonBody(req).catch(() => null);
    }
  }
  if (!body || typeof body !== 'object') return send(res, 400, {error: 'invalid json'});

  const {name, souls, maxCombo, gameVersion, sig} = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.length < 1 || name.length > 40) return send(res, 400, {error: 'invalid name'});
  if (!Number.isInteger(souls) || (souls as number) < 0 || (souls as number) > MAX_SOULS) return send(res, 400, {error: 'invalid souls'});
  if (!Number.isInteger(maxCombo) || (maxCombo as number) < 0 || (maxCombo as number) > MAX_COMBO) return send(res, 400, {error: 'invalid combo'});
  if (typeof gameVersion !== 'string' || gameVersion.length === 0 || gameVersion.length > 32) return send(res, 400, {error: 'invalid version'});
  if (typeof sig !== 'string') return send(res, 400, {error: 'invalid sig'});

  const secret = process.env.SCORE_HMAC_SECRET;
  if (!secret) {
    console.error('SCORE_HMAC_SECRET not set');
    return send(res, 500, {error: 'misconfigured'});
  }
  const expected = createHmac('sha256', secret)
    .update(`${souls}|${maxCombo}|${gameVersion}`)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return send(res, 403, {error: 'bad sig'});
  }

  const xff = req.headers['x-forwarded-for'];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  const ip = xffStr?.split(',')[0]?.trim() || '0.0.0.0';

  const sql = neon(process.env.DATABASE_URL!);
  try {
    const rateRows = await sql`
      select count(*)::int as count from scores
      where client_ip = ${ip}::inet and created_at > now() - interval '1 hour'
    ` as Array<{count: number}>;
    if (rateRows[0] && rateRows[0].count >= RATE_LIMIT_PER_HOUR) {
      return send(res, 429, {error: 'rate limited'});
    }

    const cleanName = (name as string).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 20);
    if (!cleanName) return send(res, 400, {error: 'invalid name'});

    await sql`
      insert into scores (name, souls, max_combo, game_version, client_ip)
      values (${cleanName}, ${souls as number}, ${maxCombo as number}, ${gameVersion as string}, ${ip}::inet)
    `;
    return send(res, 200, {ok: true});
  } catch (err) {
    console.error('scores insert error', err);
    return send(res, 500, {error: 'internal'});
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve(null);
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
