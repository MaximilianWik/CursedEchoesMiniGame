/**
 * Main menu — new journey, settings, hall of records.
 * The background canvas keeps rendering embers behind this overlay.
 */

import {APP_VERSION} from '../version';

export type MenuScreenProps = {
  onStart: () => void;
  onOpenSettings: () => void;
  onOpenDev: () => void;
};

export function MenuScreen({onStart, onOpenSettings, onOpenDev}: MenuScreenProps) {
  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black/70 flex flex-col items-center justify-center z-50 p-8 text-center ce-menu-bg">
      <div className="ce-menu-embers" aria-hidden />

      {/* Dev console access — also reachable via the `` ` `` shortcut. */}
      <button
        onClick={onOpenDev}
        className="absolute bottom-4 left-4 px-4 py-2 border border-emerald-700/70 bg-black/60 text-emerald-300 hover:text-emerald-100 hover:border-emerald-400 hover:bg-emerald-950/50 font-[Cinzel] text-xs tracking-[0.4em] uppercase shadow-[0_0_18px_rgba(0,180,100,0.2)] transition-all"
        title="Dev console (password-gated) — shortcut: `"
      >
        ◇ Dev
      </button>

      {/* Version badge — bottom-right corner. Pill with a gold outline + glow
          so the text is clearly legible against the dark menu background. */}
      <div className="absolute bottom-4 right-4 px-3 py-1.5 border border-amber-600/80 bg-black/70 rounded-sm font-[Cinzel] text-xs tracking-[0.4em] uppercase text-amber-300 shadow-[0_0_14px_rgba(255,180,60,0.35)] select-none">
        v{APP_VERSION}
      </div>

      <h1 className="relative font-[Cinzel] text-5xl md:text-6xl text-amber-700 mb-2 tracking-[0.3em] drop-shadow-[0_0_25px_rgba(180,83,9,0.6)] ce-title">
        CURSED ECHOES
      </h1>
      <div className="ce-sigil mb-6" aria-hidden />
      <p className="text-amber-200/50 text-xs tracking-[0.5em] uppercase mb-10">A gothic typing trial</p>

      <div className="relative max-w-md bg-amber-950/20 border border-amber-900/40 p-6 rounded mb-10 backdrop-blur-sm shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        <h2 className="font-[Cinzel] text-amber-600 text-xl mb-4 tracking-widest uppercase border-b border-amber-900/30 pb-2">How to Play</h2>
        <ul className="text-amber-100/70 text-sm space-y-3 font-serif tracking-wide text-left list-none">
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Type the echoes (letters) to banish them with fire.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Parry incoming projectiles with the matching digit — <kbd className="px-1.5 py-0.5 mx-1 border border-amber-600 text-amber-300 text-xs">2</kbd>–<kbd className="px-1.5 py-0.5 mx-1 border border-amber-600 text-amber-300 text-xs">6</kbd>.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Drink estus with <kbd className="px-1.5 py-0.5 mx-1 border border-amber-600 text-amber-300 text-xs">TAB</kbd> — heals, then grants 4 s of godmode.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Dodge with <kbd className="px-1.5 py-0.5 mx-1 border border-amber-600 text-amber-300 text-xs">SPACE</kbd> — grants brief i-frames.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Press <kbd className="px-1.5 py-0.5 mx-1 border border-amber-600 text-amber-300 text-xs">Q</kbd> to burn 1 estus and summon Jessyka for 25 s — she targets words in zones and parries projectiles in boss fights.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Pause with <kbd className="px-1.5 py-0.5 mx-1 border border-amber-600 text-amber-300 text-xs">ESC</kbd>.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-600 mt-1">◈</span><span>Four zones await. Three bosses stand in your way.</span></li>
        </ul>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onStart}
          className="relative group px-16 py-5 overflow-hidden border border-amber-900 bg-black text-amber-500 font-[Cinzel] text-xl tracking-[0.3em] transition-all hover:text-amber-300 hover:border-amber-500 shadow-[0_0_20px_rgba(127,29,29,0.3)] ce-start-btn"
        >
          <div className="absolute inset-0 w-0 bg-amber-900/20 transition-all duration-300 ease-out group-hover:w-full"></div>
          <span className="relative z-10 animate-pulse">CHALLENGE THE ABYSS</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="mt-3 px-10 py-2 border border-amber-900/60 bg-black/40 text-amber-600/80 font-[Cinzel] text-sm tracking-[0.3em] transition-all hover:text-amber-300 hover:border-amber-500"
        >
          SETTINGS
        </button>
      </div>

      <p className="mt-10 text-amber-900/40 font-serif text-xs tracking-widest uppercase">The darkness waits for no one</p>
    </div>
  );
}
