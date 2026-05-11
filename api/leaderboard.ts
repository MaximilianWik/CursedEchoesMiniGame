/**
 * GET /api/leaderboard — global top 10 by souls.
 *
 * Cached for 10s at the edge so the board doesn't hammer Neon when many
 * players land on the game-over screen at once.
 */

import {neon} from '@neondatabase/serverless';

export const config = {runtime: 'nodejs'};

export default async function handler(_req: Request) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      select name, souls, max_combo
      from scores
      order by souls desc, created_at asc
      limit 10
    `;
    return new Response(JSON.stringify(rows), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    console.error('leaderboard error', err);
    return new Response(JSON.stringify({error: 'internal'}), {
      status: 500,
      headers: {'content-type': 'application/json'},
    });
  }
}
