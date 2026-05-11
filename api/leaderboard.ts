/**
 * GET /api/leaderboard — global top 10 by souls.
 *
 * Cached for 10s at the edge so the board doesn't hammer Neon when many
 * players land on the game-over screen at once.
 */

import {neon} from '@neondatabase/serverless';
import type {IncomingMessage, ServerResponse} from 'node:http';

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      select name, souls, max_combo
      from scores
      order by souls desc, created_at asc
      limit 10
    `;
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'public, s-maxage=10, stale-while-revalidate=30');
    res.end(JSON.stringify(rows));
  } catch (err) {
    console.error('leaderboard error', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({error: 'internal'}));
  }
}
