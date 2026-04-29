/**
 * DevPanel — hidden testing tools, unlocked with the password 'developer'.
 * Lets you jump straight to any zone or boss, heal, fill estus, +combo, etc.
 *
 * The panel is opened via a nearly-invisible sigil in the bottom-left of the
 * menu screen. Enter 'developer' → panel shows. Password wrong → shake + reset.
 */

import {useState} from 'react';
import type {ReactNode} from 'react';

const DEV_PASSWORD = 'developer';

export type DevPanelProps = {
  onClose: () => void;
  jumpToZone: (idx: number) => void;
  jumpToBoss: (bossId: string) => void;
  jumpToVictory: () => void;
  giveEstus: () => void;
  heal: () => void;
  addCombo: (n: number) => void;
  killAllWords: () => void;
  triggerLightning: () => void;
  // 0.3.1 — AfroMan + secret-route tooling.
  resetSaveData: () => void;
  spawnJessyka: () => void;
  addZooted: () => void;
  clearZooted: () => void;
  skipBossIntro: () => void;
  openBossSelect: () => void;
};

export function DevPanel(props: DevPanelProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  if (!unlocked) {
    return (
      <div
        className="absolute top-0 left-0 w-full h-full bg-black/90 flex items-center justify-center z-[90] fade-in"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div className="bg-[#0a0608] border border-emerald-900/70 p-8 w-[360px] shadow-[0_0_40px_rgba(0,0,0,0.9)]">
          <h2 className="font-[Cinzel] text-emerald-400 text-xl tracking-[0.3em] text-center mb-4 uppercase">Dev Gate</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input === DEV_PASSWORD) {
                setUnlocked(true);
                setInput('');
              } else {
                setError(true);
                window.setTimeout(() => setError(false), 500);
                setInput('');
              }
            }}
            className="flex flex-col gap-3"
          >
            <input
              autoFocus
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={`bg-black border text-emerald-100 font-mono text-center px-4 py-2 outline-none transition-all tracking-[0.2em] w-full ${
                error ? 'border-red-500 animate-[shake_0.5s_ease-in-out]' : 'border-emerald-700/60 focus:border-emerald-400'
              }`}
              placeholder="password"
            />
            <div className="flex gap-2">
              <button type="button" onClick={props.onClose} className="flex-1 px-4 py-2 border border-emerald-900/40 text-emerald-600/70 hover:text-emerald-200 font-[Cinzel] text-xs tracking-widest uppercase">Cancel</button>
              <button type="submit" className="flex-1 px-4 py-2 border border-emerald-700 text-emerald-300 hover:bg-emerald-950 font-[Cinzel] text-xs tracking-widest uppercase">Enter</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute top-0 left-0 w-full h-full bg-black/85 flex items-center justify-center z-[90] fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div className="bg-[#060808] border border-emerald-700/70 p-6 w-[560px] max-w-[94vw] shadow-[0_0_60px_rgba(0,180,100,0.2)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-[Cinzel] text-emerald-400 text-2xl tracking-[0.3em] uppercase">Dev Console</h2>
          <button onClick={props.onClose} className="text-emerald-500 hover:text-red-400 font-[Cinzel] text-xs tracking-widest">CLOSE</button>
        </div>

        <Section title="Zones">
          <DevBtn onClick={() => props.jumpToZone(0)}>1 · Firelink Shrine</DevBtn>
          <DevBtn onClick={() => props.jumpToZone(1)}>2 · Undead Burg</DevBtn>
          <DevBtn onClick={() => props.jumpToZone(2)}>3 · Anor Londo</DevBtn>
          <DevBtn onClick={() => props.jumpToZone(3)}>4 · Kiln of the First Flame</DevBtn>
        </Section>

        <Section title="Bosses">
          <DevBtn onClick={() => props.jumpToBoss('taurus')}>Taurus Demon</DevBtn>
          <DevBtn onClick={() => props.jumpToBoss('ornstein')}>Ornstein</DevBtn>
          <DevBtn onClick={() => props.jumpToBoss('gwyn')}>Gwyn, Lord of Cinder</DevBtn>
          <DevBtn onClick={() => props.jumpToBoss('afroman')}>★ AfroMan (secret)</DevBtn>
          <DevBtn onClick={props.jumpToVictory}>→ Victory screen</DevBtn>
        </Section>

        <Section title="Cheats (during zone/boss)">
          <DevBtn onClick={props.heal}>Full Heal</DevBtn>
          <DevBtn onClick={props.giveEstus}>Refill Estus</DevBtn>
          <DevBtn onClick={() => props.addCombo(20)}>+20 Combo</DevBtn>
          <DevBtn onClick={() => props.addCombo(100)}>+100 Combo</DevBtn>
          <DevBtn onClick={props.killAllWords}>Despawn words</DevBtn>
          <DevBtn onClick={props.triggerLightning}>Lightning flash</DevBtn>
          <DevBtn onClick={props.spawnJessyka}>☽ Spawn Jessyka</DevBtn>
          <DevBtn onClick={props.skipBossIntro}>Skip boss intro</DevBtn>
        </Section>

        <Section title="AfroMan / Secret route">
          <DevBtn onClick={props.openBossSelect}>◆ Open boss-select</DevBtn>
          <DevBtn onClick={props.resetSaveData}>Reset save data</DevBtn>
          <DevBtn onClick={props.addZooted}>+1 ZOOTED</DevBtn>
          <DevBtn onClick={props.clearZooted}>Clear ZOOTED</DevBtn>
        </Section>

        <p className="text-emerald-900 text-[10px] italic mt-4 text-center tracking-widest uppercase">
          For testing only · not part of the canonical run
        </p>
      </div>
    </div>
  );
}

function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="mb-4">
      <div className="text-[10px] text-emerald-600 tracking-[0.4em] uppercase mb-1.5 border-b border-emerald-900/40 pb-1">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function DevBtn({onClick, children}: {onClick: () => void; children: ReactNode}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 border border-emerald-800/60 bg-black/40 text-emerald-300/90 hover:text-emerald-100 hover:bg-emerald-950/50 hover:border-emerald-500 font-[Cinzel] text-xs tracking-[0.15em] text-left transition-all"
    >
      {children}
    </button>
  );
}
