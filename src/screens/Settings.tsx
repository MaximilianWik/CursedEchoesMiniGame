/**
 * Settings panel — volume sliders + accessibility toggles.
 * Applies changes live via the settings store.
 */

import {useSettings, resetSettings} from '../game/settings';
import {APP_VERSION} from '../version';

export type SettingsScreenProps = {
  onClose: () => void;
};

export function SettingsScreen({onClose}: SettingsScreenProps) {
  const [settings, patch] = useSettings();
  return (
    <div
      className="absolute top-0 left-0 w-full h-full bg-black/90 flex items-center justify-center z-[60] fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-[#0a0608] border border-amber-900/60 shadow-[0_0_40px_rgba(180,83,9,0.2)] w-[520px] max-w-[94vw] p-8 ce-settings-panel">
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-amber-600/60 hover:text-amber-300 font-[Cinzel] text-sm tracking-widest"
        >
          CLOSE
        </button>
        <h2 className="font-[Cinzel] text-3xl text-amber-500 tracking-[0.3em] text-center mb-6">SETTINGS</h2>

        <section className="mb-6">
          <h3 className="font-[Cinzel] text-xs text-amber-700 tracking-[0.5em] uppercase mb-3 border-b border-amber-900/30 pb-1">Audio</h3>
          <Slider label="Master" value={settings.volumeMaster} onChange={v => patch({volumeMaster: v})} />
          <Slider label="Music" value={settings.volumeMusic} onChange={v => patch({volumeMusic: v})} />
          <Slider label="Effects" value={settings.volumeSfx} onChange={v => patch({volumeSfx: v})} />
        </section>

        <section className="mb-6">
          <h3 className="font-[Cinzel] text-xs text-amber-700 tracking-[0.5em] uppercase mb-3 border-b border-amber-900/30 pb-1">Accessibility</h3>
          <Toggle label="Reduce motion" hint="disables shake, flash, rank-up sweep" value={settings.reduceMotion} onChange={v => patch({reduceMotion: v})} />
          <Toggle label="High contrast" hint="brightens text, reduces background blur" value={settings.highContrast} onChange={v => patch({highContrast: v})} />
          <Toggle label="Colorblind mode" hint="swaps red cues for blue" value={settings.colorblind} onChange={v => patch({colorblind: v})} />
          <div className="flex items-center justify-between py-2">
            <span className="text-amber-200/80 font-[Cinzel] text-sm tracking-widest">Font scale</span>
            <div className="flex gap-1">
              {[0.8, 1.0, 1.2].map(s => (
                <button
                  key={s}
                  onClick={() => patch({fontScale: s})}
                  className={`px-3 py-1 border text-xs font-[Cinzel] tracking-widest ${
                    settings.fontScale === s
                      ? 'border-amber-400 text-amber-200 bg-amber-900/30'
                      : 'border-amber-900/60 text-amber-600/70 hover:text-amber-300'
                  }`}
                >
                  {s.toFixed(1)}×
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between">
          <button
            onClick={resetSettings}
            className="text-xs text-amber-600/50 hover:text-red-400 font-[Cinzel] tracking-widest"
          >
            RESET TO DEFAULTS
          </button>
          <button
            onClick={onClose}
            className="px-8 py-2 border border-amber-600 text-amber-300 font-[Cinzel] tracking-[0.3em] hover:bg-amber-900/20"
          >
            DONE
          </button>
        </div>

        {/* Version footer — bold, gold, centered under the DONE row. */}
        <div className="mt-6 pt-3 border-t border-amber-700/60 text-center font-[Cinzel] text-xs tracking-[0.5em] uppercase text-amber-300 drop-shadow-[0_0_8px_rgba(255,180,60,0.45)] select-none">
          Cursed Echoes · v{APP_VERSION}
        </div>
      </div>
    </div>
  );
}

function Slider({label, value, onChange}: {label: string; value: number; onChange: (v: number) => void}) {
  return (
    <div className="flex items-center justify-between py-1.5 gap-3">
      <span className="text-amber-200/80 font-[Cinzel] text-sm tracking-widest w-24">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-amber-500"
      />
      <span className="text-xs text-amber-400/70 font-mono w-10 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

function Toggle({label, hint, value, onChange}: {label: string; hint?: string; value: boolean; onChange: (v: boolean) => void}) {
  return (
    <label className="flex items-start justify-between gap-3 py-1.5 cursor-pointer group">
      <div className="flex flex-col">
        <span className="text-amber-200/80 font-[Cinzel] text-sm tracking-widest group-hover:text-amber-100">{label}</span>
        {hint && <span className="text-[10px] text-amber-700/70 font-serif italic">{hint}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-11 h-5 rounded-full transition-all border ${
          value ? 'bg-amber-700 border-amber-400' : 'bg-black border-amber-900/60'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-amber-200 transition-all ${
            value ? 'left-6' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}
