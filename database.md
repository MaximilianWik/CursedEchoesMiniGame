# Database Setup — Neon Postgres + Vercel

This guide walks you through wiring up the global leaderboard from scratch. By the end you'll have a Neon Postgres database, a Vercel project that talks to it, and a working `/api/leaderboard` + `/api/scores` pair.

If you're inheriting an existing setup, skip to **§7 Troubleshooting** for the gotchas we hit.

---

## What you're building

```
┌─────────────┐      HTTPS       ┌──────────────────┐    HTTPS      ┌─────────────┐
│  Browser    │ ───────────────▶ │  Vercel Function │ ────────────▶ │  Neon DB    │
│  (game)     │ ◀─────────────── │  /api/scores     │ ◀──────────── │  (Postgres) │
│             │      JSON        │  /api/leaderboard│   SQL/HTTP    │             │
└─────────────┘                  └──────────────────┘               └─────────────┘
```

- **Neon** — serverless Postgres. Free tier is plenty.
- **Vercel Functions** — Node.js handlers in the `api/` folder.
- **`@neondatabase/serverless`** — Neon's HTTP driver, ideal for serverless (no socket pool issues on cold starts).

---

## 1. Create the Neon database

1. Sign up at [neon.tech](https://neon.tech) (GitHub login works).
2. Create a new **Project**. Pick the region closest to your Vercel functions (default `arn1` = Stockholm if you're in EU).
3. Once created, you land on the dashboard. The default branch is `main` and there's a `neondb` database inside it.

That's it — no need to copy the connection string yet. The Vercel integration in §3 grabs it for you.

---

## 2. Run the schema

In the Neon dashboard → **SQL Editor** → paste this and run:

```sql
create table if not exists scores (
  id           bigserial primary key,
  name         text        not null check (length(name) between 1 and 20),
  souls        integer     not null check (souls >= 0 and souls <= 10000000),
  max_combo    integer     not null check (max_combo >= 0 and max_combo <= 100000),
  game_version text        not null,
  client_ip    inet,
  created_at   timestamptz not null default now()
);

create index if not exists scores_souls_desc on scores (souls desc, created_at asc);
```

**What this gives you:**
- A single `scores` table with hard ceilings on `souls`/`max_combo` (sanity check against forged submissions).
- An index on `(souls desc, created_at asc)` — makes "top 10 by souls, oldest first as tiebreaker" a single index scan.
- `client_ip` powers the per-IP rate limit.
- `game_version` lets you filter old-version scores out later if balance changes invalidate them.

Verify it worked:

```sql
select count(*) from scores;
```

Should return `0` (an empty table, not an error).

---

## 3. Connect Neon to Vercel

**Use the Vercel Marketplace integration — don't paste connection strings manually.** It auto-injects credentials and gives you DB branching for free.

1. Vercel project → **Storage** tab → **Create Database** → **Neon**.
2. Click **Connect to existing Neon project** → pick the project from §1.
3. Vercel adds these env vars automatically to **Production + Preview + Development**:
   - `DATABASE_URL` (pooled — use this one)
   - `DATABASE_URL_UNPOOLED`
   - `PGHOST`, `PGUSER`, `PGPASSWORD`, etc.

You only need `DATABASE_URL` for this project.

> **Bonus: DB branching for previews.** With the integration, every Vercel preview deploy gets its own copy of the production database. You can iterate on schema changes against preview without polluting the live leaderboard. Merging to `main` promotes the branch.

### Manual alternative (if you can't use the integration)

Neon dashboard → **Connection Details** → copy the **pooled** connection string (looks like `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`). Then in Vercel project → **Settings → Environment Variables**, add it as `DATABASE_URL` to Production *and* Preview.

> ⚠️ **If you ever paste the connection string into chat, a commit message, or anywhere public — rotate it immediately.** Neon dashboard → **Roles** → reset password for the `neondb_owner` role.

---

## 4. Add the HMAC secret

The leaderboard uses a shared HMAC secret to stop casual `curl` abuse of the submit endpoint. The client signs `${souls}|${maxCombo}|${gameVersion}` with this secret, and the server verifies the signature before inserting.

> **What this protects against, what it doesn't.** A determined attacker can read the secret out of the JS bundle (it has the `VITE_` prefix specifically because Vite needs to expose it to the client). This is the "light" tradeoff — it stops drive-by abuse and bots scraping the URL, not someone who reads your source. If you ever get griefed, escalate to server-side replay validation or per-session tokens.

**Generate the secret** (PowerShell):

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

Or bash:

```bash
openssl rand -hex 32
```

You get a 64-char hex string. **Use the exact same value for both env vars below.**

In Vercel → Project Settings → **Environments → Production** → scroll to **Environment Variables** → add:

| Key | Value | Why |
|---|---|---|
| `SCORE_HMAC_SECRET` | `<your hex string>` | Used by `api/scores.ts` (server-only) |
| `VITE_SCORE_HMAC_SECRET` | **same value** | Inlined into the client bundle by Vite |

Then click **Preview** in the Environments list and add the same two vars there too. Vercel doesn't share env vars between environments by default.

---

## 5. The code (already in this repo)

You don't need to write any of this — it's already here. This section is the map.

### Dependency

```bash
npm i @neondatabase/serverless
```

### `api/leaderboard.ts` — GET top 10

```ts
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
```

The `s-maxage=10` cache header means Vercel's edge caches the result for 10 seconds — protects Neon when many players land on the game-over screen at once.

### `api/scores.ts` — POST submit

Three light defenses:

1. **Shape + range validation** — name 1–20 chars, souls/combo within hard ceilings.
2. **HMAC signature** — verified with `crypto.timingSafeEqual` to avoid timing leaks.
3. **Per-IP rate limit** — 10 submissions per hour, looked up via `client_ip = ${ip}::inet AND created_at > now() - interval '1 hour'`.

Plus name sanitization: control chars stripped, trimmed, clamped to 20.

> **Important: handler signature.** Vercel's Node runtime hands you legacy `(req: IncomingMessage, res: ServerResponse)` Node objects, **not** Web API `Request`/`Response`. If you write `req.json()` you get `TypeError: req.json is not a function`. Use `req.body` (Vercel auto-parses JSON when `Content-Type: application/json`) or read the stream manually.

### `src/game/leaderboard.ts` — client module

```ts
import {APP_VERSION} from '../version';

const HMAC_SECRET: string = (import.meta.env.VITE_SCORE_HMAC_SECRET as string | undefined) ?? '';

async function hmacHex(message: string): Promise<string> {
  if (!HMAC_SECRET) {
    throw new Error('Leaderboard misconfigured: VITE_SCORE_HMAC_SECRET is not set in this build.');
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(HMAC_SECRET),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function submitScore(name: string, souls: number, maxCombo: number) {
  const sig = await hmacHex(`${souls}|${maxCombo}|${APP_VERSION}`);
  const r = await fetch('/api/scores', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({name, souls, maxCombo, gameVersion: APP_VERSION, sig}),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function fetchLeaderboard() {
  const r = await fetch('/api/leaderboard');
  if (!r.ok) throw new Error('fetch failed');
  return r.json();
}
```

Used by `src/screens/GameOver.tsx` — see the `<div className="go-global-frame">` block.

---

## 6. Deploy & verify

1. **Push** to `main`:
   ```powershell
   git push
   ```
2. **Wait** for Vercel to finish building. Watch the deployment in the dashboard.
3. **Open the deployed URL**, finish a run, click **Inscribe**.
4. **Verify the row landed:**
   ```sql
   select * from scores order by id desc limit 5;
   ```
   You should see your submission.
5. **Hit the GET endpoint directly** in the browser to confirm it returns JSON:
   ```
   https://<your-domain>.vercel.app/api/leaderboard
   ```
   Should return `[{"name":"...","souls":123,"max_combo":45}, ...]`.

---

## 7. Troubleshooting

### `HMAC key data must not be empty`

The client tried to sign a message with an empty secret. Fix:

1. Confirm `VITE_SCORE_HMAC_SECRET` exists in Vercel → Production *and* Preview env vars.
2. The `VITE_` prefix is **required** — Vite only exposes vars that start with it.
3. **Redeploy.** Env-var changes don't apply to existing deployments. Either push a new commit or click `⋯ → Redeploy` on the latest deployment.

### `FUNCTION_INVOCATION_FAILED` (500 from `/api/scores`)

Open Vercel → **Logs** (or **Observability → Runtime Logs**) and look at the last few minutes. The actual error is in `console.error('scores insert error', ...)`.

Common causes:

| Log line | Cause | Fix |
|---|---|---|
| `relation "scores" does not exist` | Schema not run | Run the SQL in §2 |
| `TypeError: req.json is not a function` | Wrong handler signature | See §5 — use `req.body`, not `req.json()` |
| `password authentication failed` | Stale `DATABASE_URL` | Rotate + reconnect via the integration |
| `SCORE_HMAC_SECRET not set` | Server env var missing | Add it in §4 and redeploy |

### `Vercel Runtime Timeout Error: Task timed out after 300 seconds`

The function is hanging — almost always because `DATABASE_URL` is unset or wrong, and the Neon driver retries forever. Check Production env vars and redeploy.

### `403 bad sig` on submit

The HMAC the server computed didn't match what the client sent. Cause: `SCORE_HMAC_SECRET` and `VITE_SCORE_HMAC_SECRET` aren't the same value. Set them to identical strings and redeploy.

### `429 rate limited`

You hit the 10-submissions-per-hour cap from your IP. By design. Either wait, or test from a different network. To raise the cap during dev, edit `RATE_LIMIT_PER_HOUR` in `api/scores.ts`.

### Empty leaderboard but DB has rows

Hard-refresh the page (Ctrl+Shift+R). The GET response is edge-cached for 10s, so a freshly inscribed score may take a moment to appear in cached responses.

---

## 8. Local development (optional)

The `@neondatabase/serverless` driver works against your real Neon DB from `localhost` too — it's HTTP, not a socket. Two options:

- **Use a Neon dev branch.** Neon dashboard → Branches → New branch from `main`. Get its connection string.
- **Use the production DB.** Fine for read-only testing; risky for writes.

Then either:

- Run `vercel dev` (requires the Vercel CLI and a linked project) — picks up env vars from your project automatically.
- Or create a `.env.local` with `DATABASE_URL=...`, `SCORE_HMAC_SECRET=...`, `VITE_SCORE_HMAC_SECRET=...`. Vite loads it for the client; for the API routes you'd need `vercel dev` since plain `vite` doesn't run them.

For most iteration on this project, pushing to a Vercel preview deploy is fast enough that local API dev isn't worth setting up.

---

## 9. Operational notes

- **Backups.** Neon takes automatic point-in-time backups on the paid tier. Free tier keeps 24h of WAL.
- **Cost ceiling.** A `select ... limit 10` query on an indexed column costs essentially nothing. The free tier covers thousands of submissions/month easily.
- **Schema changes.** Run new `alter table` / `create index` statements in the Neon SQL editor. There's no migration tool — keep the up-to-date schema in §2 of this file.
- **Wiping the board.** `truncate scores;` in the Neon SQL editor. There's no admin UI in the game — by design.
