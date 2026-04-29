/**
 * Per-run statistics. Mutated inside the game loop via the exported singleton,
 * then snapshotted on game-over for the stats screen.
 */

export type RunStats = {
  startTime: number;                  // ms, 0 before run starts
  endTime: number;                    // ms, 0 while active
  zoneReached: number;                // 0-indexed
  bossesDefeated: number;
  wordsKilled: number;
  projectilesDeflected: number;
  dodgesSuccessful: number;
  estusDrunk: number;
  totalLetters: number;
  correctLetters: number;
  longestWord: string;
  damageTaken: number;
  biggestHit: number;                 // hp lost in one blow
  deadliestLetter: string;            // letter player got wrong most
  wrongPerLetter: Record<string, number>;
  comboOverTime: {t: number; combo: number}[];  // sampled by loop
  // 0.3.0 — secret boss (AfroMan) route flags. Set when the player takes the
  // fork after Undead Burg and commits to AfroMan; `Defeated` flips on kill.
  secretBossChosen: boolean;
  secretBossDefeated: boolean;
  // 0.3.0 — rhythm-parry bookkeeping for the AfroMan fight.
  perfectParries: number;
};

export function createStats(): RunStats {
  return {
    startTime: 0,
    endTime: 0,
    zoneReached: 0,
    bossesDefeated: 0,
    wordsKilled: 0,
    projectilesDeflected: 0,
    dodgesSuccessful: 0,
    estusDrunk: 0,
    totalLetters: 0,
    correctLetters: 0,
    longestWord: '',
    damageTaken: 0,
    biggestHit: 0,
    deadliestLetter: '',
    wrongPerLetter: {},
    comboOverTime: [],
    secretBossChosen: false,
    secretBossDefeated: false,
    perfectParries: 0,
  };
}

export function registerWrong(stats: RunStats, ch: string): void {
  const c = ch.toUpperCase();
  if (c < 'A' || c > 'Z') return;
  stats.wrongPerLetter[c] = (stats.wrongPerLetter[c] ?? 0) + 1;
  let worst = stats.deadliestLetter;
  let worstN = worst ? stats.wrongPerLetter[worst] ?? 0 : 0;
  const n = stats.wrongPerLetter[c];
  if (n > worstN) stats.deadliestLetter = c;
}

export function sampleCombo(stats: RunStats, t: number, combo: number): void {
  // Cap the series so it doesn't grow unbounded in an endless run.
  if (stats.comboOverTime.length >= 900) stats.comboOverTime.shift();
  stats.comboOverTime.push({t, combo});
}

/** Derived values for the end screen. */
export type DerivedStats = {
  accuracy: number;
  wpm: number;
  secondsSurvived: number;
  secondsSurvivedLabel: string;
};

export function deriveStats(stats: RunStats): DerivedStats {
  const accuracy = stats.totalLetters > 0
    ? Math.round((stats.correctLetters / stats.totalLetters) * 100)
    : 100;
  const elapsedMs = Math.max(1, (stats.endTime || Date.now()) - (stats.startTime || Date.now()));
  const secondsSurvived = Math.floor(elapsedMs / 1000);
  // Words = groups of 5 correct keystrokes, standard WPM convention.
  const minutes = elapsedMs / 60000;
  const wpm = minutes > 0 ? Math.round((stats.correctLetters / 5) / minutes) : 0;
  const mm = Math.floor(secondsSurvived / 60);
  const ss = (secondsSurvived % 60).toString().padStart(2, '0');
  return {accuracy, wpm, secondsSurvived, secondsSurvivedLabel: mm + ':' + ss};
}
