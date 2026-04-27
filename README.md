# Cursed Echoes

A gothic typing trial. Banish the echoes before they reach you.

**Live:** https://cursedechoes.vercel.app/

https://github.com/user-attachments/assets/cc4d2332-4475-4e61-bd31-d33734f54dab

## Development

```bash
npm install
npm run dev     # vite, port 3000
npm run lint    # tsc --noEmit
npm run build   # production bundle
```

## Architecture

- **`src/App.tsx`** — React component tree, game-loop orchestration, screens.
- **`src/graphics.ts`** — pure canvas drawing: background atmosphere, fireballs, word auras, shockwaves, particles. No React here.
- **`src/constants.ts`** — word bank + theme tokens.
- **`src/index.css`** — Tailwind v4 + gothic keyframes (ember rise, player float, title pulse, death throb).

The game runs on three layered canvases: a background layer for atmosphere, an action layer for effects, and a text layer for the falling words. All three are HiDPI-aware and mutable state lives in refs so the HUD re-renders at 10 Hz instead of on every keystroke.
