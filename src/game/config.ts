/**
 * Static game-design data: enemy kinds, zone definitions, boss definitions,
 * damage phrases. Pure data — no React or DOM.
 */

export type EnemyKind =
  | 'normal'
  | 'ghost'
  | 'tank'
  | 'runner'
  | 'lich'
  | 'mimic'
  | 'chanter'
  | 'caster'; // caster = projectile-firing word (SORCERY, PYROMANCY, …)

export type EnemyKindDef = {
  id: EnemyKind;
  speedMul: number;
  lengthRange: [number, number] | null;  // null = use zone default
  spawnWeight: number;                   // relative weight within a zone
  color: string;                         // base untyped glyph color
  auraColor: string;                     // bg aura color
  description: string;
};

export const ENEMY_KINDS: Record<EnemyKind, EnemyKindDef> = {
  normal:  {id: 'normal',  speedMul: 1.0, lengthRange: null,    spawnWeight: 100, color: '#e6dcc5', auraColor: 'rgba(80,30,90,0.32)',  description: 'standard echo'},
  ghost:   {id: 'ghost',   speedMul: 0.9, lengthRange: [4, 7],  spawnWeight: 0,   color: '#cfd8e0', auraColor: 'rgba(100,140,180,0.3)', description: 'letters flicker in and out'},
  tank:    {id: 'tank',    speedMul: 0.55,lengthRange: [10, 14],spawnWeight: 0,   color: '#e8c89a', auraColor: 'rgba(120,70,30,0.35)',  description: 'armored echo, long word'},
  runner:  {id: 'runner',  speedMul: 1.9, lengthRange: [3, 4],  spawnWeight: 0,   color: '#ffb0a0', auraColor: 'rgba(200,60,30,0.4)',   description: 'fast, short'},
  lich:    {id: 'lich',    speedMul: 0.85,lengthRange: [5, 8],  spawnWeight: 0,   color: '#d0aaff', auraColor: 'rgba(130,40,200,0.4)',  description: 'spawns children on death'},
  mimic:   {id: 'mimic',   speedMul: 0.95,lengthRange: [6, 9],  spawnWeight: 0,   color: '#f0e0c0', auraColor: 'rgba(180,130,30,0.35)', description: 'phantom — banishing it grants bonus souls'},
  chanter: {id: 'chanter', speedMul: 0,   lengthRange: [5, 7],  spawnWeight: 0,   color: '#a0e0ff', auraColor: 'rgba(40,140,200,0.4)',  description: 'summoner — stationary; periodically spawns minion echoes'},
  caster:  {id: 'caster',  speedMul: 0.8, lengthRange: [7, 10], spawnWeight: 0,   color: '#ffaaff', auraColor: 'rgba(200,60,180,0.4)',  description: 'fires projectile letters'},
};

/** Special word texts that are guaranteed-caster when they spawn as caster kind. */
export const CASTER_WORDS = ['SORCERY', 'PYROMANCY', 'LIGHTNING', 'MIRACLE', 'DARKMOON', 'CHAOS'];

/**
 * Phrase banks — one per boss, so each fight's damage phrases reflect that
 * boss's canonical lore (Bed of Chaos for Taurus, Four Knights / lightning
 * for Ornstein, First Flame / cinder for Gwyn). Every phrase is typed with
 * spaces auto-skipped; damage = ceil(typedLetters / 7) per completion.
 *
 * Gothic-evocative and distinct vocabulary across the three banks so the
 * fights stop feeling repetitive between phases.
 */

/** Taurus Demon — chaos-born, bone-carved, ramparts of the Undead Burg. */
export const BOSS_PHRASES_TAURUS = [
  'CARVED FROM THE FALLEN',
  'BONE BECOMES A WEAPON',
  'CHAOS BIRTHED ME',
  'IZALITHS BROKEN CHILD',
  'THE WITCHS FAILURE',
  'THE RAMPART IS MINE',
  'FLED THE SILVER PURGE',
  'NO LIGHTNING HERE',
  'BEAT THE FLESH TO PULP',
  'LESSER BY NAME',
  'THE BURG REMEMBERS FIRE',
  'DEMONSPAWN UNGODLY',
  'GREATAXE OF BROTHERS BONE',
  'THE BED OF CHAOS COILS',
];

/** Dragon Slayer Ornstein — Captain of the Four, lion-visaged, lightning-spear. */
export const BOSS_PHRASES_ORNSTEIN = [
  'LIGHTNING CLINGS TO THE SPEAR',
  'CAPTAIN OF THE FOUR KNIGHTS',
  'HIS GOLDEN LION ROARS',
  'DRAGONS FELL TO MY CROSS',
  'ANOR LONDO IS FORSAKEN',
  'I GUARD THE HOLLOW CATHEDRAL',
  'THE CROSS BURIES DEEP',
  'SWORN TO THE LORD OF SUNLIGHT',
  'THE SPEAR NEVER WEARIES',
  'LEONINE IN MAJESTY',
  'SCALES PART BEFORE LIGHTNING',
  'THE KEEPER ABIDES',
  'GWYNS OATH BINDS ME',
  'OLD WAR ECHOES STILL',
];

/** Gwyn, Lord of Cinder — First Lord, kindler of the Flame, feared the Dark. */
export const BOSS_PHRASES_GWYN = [
  'I LINKED THE FIRST FLAME',
  'LORD OF SUNLIGHT AND CINDER',
  'A THOUSAND YEARS OF FEAR',
  'I TREMBLED AT THE DARK',
  'SUNLIGHT YET FADES',
  'RAYS OF SUNLIGHT FIERCE',
  'I WAGED WAR ON DRAGONS',
  'THE AGE OF FIRE LINGERS',
  'BEQUEATHED THE WANING FLAME',
  'NITO AND IZALITH REMEMBER',
  'I FEARED THE DARK LORD',
  'THE KILN REMEMBERS ME',
  'HOLLOW AT THE FIRST FLAME',
  'THE EMBER WILL NOT DIE',
  'MY CROWN IS OF CINDER',
  'RESIST THE COURSE OF NATURE',
];

/** AfroMan — secret boss. Original goofy-gothic banter riffing on tall-can,
 *  liquor-store and dance-floor motifs. No lyric quotes: every line is
 *  newly written for this fight. Tonally in the song's neighbourhood, not
 *  derived from it. Keep it comedic, not mean. */
export const BOSS_PHRASES_AFROMAN = [
  'AFROMAN DEMANDS A FORTY',
  'THE KHAKIS SAG EVER LOWER',
  'PRAISE THE TALLBOY',
  'LIQUOR STORE IS MY CATHEDRAL',
  'NO FAME NO WEALTH NO PROBLEM',
  'DROP THE VIBE CRYSTAL',
  'WALK IT DOWN THE BOULEVARD',
  'THIRST IS A LANTERN',
  'THE BOTTLE TIPS SIDEWAYS',
  'I AM THE AFROHOLIC KING',
  'TWO ZIGZAGS AND A DREAM',
  'THE PARTY HAS NO END',
  'DANCE ALONE IF YOU MUST',
  'STAGGER TOWARD THE SUN',
];

/** Munchie word pool — single common dictionary words in the song's thematic
 *  neighbourhood. Not copyrightable individually. Spawned by the 'munchie'
 *  attack pattern as slow-falling non-damaging words that apply ZOOTED on
 *  contact instead of HP damage. */
export const AFROMAN_MUNCHIES = [
  'CHICKEN', 'FORTY', 'TALLCAN', 'LIQUOR', 'HOMIE', 'PARTY', 'KHAKIS',
  'AFROHOLIC', 'STAGGER', 'CRAVING', 'BOTTLE', 'MELLOW', 'AFRO', 'CYPHER',
  'BURGER', 'CHIPS', 'PIZZA', 'BLUNT', 'BLAZE', 'VIBES', 'DANCE', 'THIRST',
  'CRUNK', 'DIGGY', 'COLT', 'ZIGZAG',
];

// ─────────────────────────────────────────────────────────────
// Zones
// ─────────────────────────────────────────────────────────────

export type Weather = 'none' | 'rain' | 'ash' | 'godrays' | 'emberstorm';

export type ZoneDef = {
  id: string;
  name: string;
  subtitle: string;
  duration: number;                              // seconds of combat before bonfire/boss
  wordLength: [number, number];                  // min, max
  kindWeights: Partial<Record<EnemyKind, number>>;
  bossId: string | null;
  weather: Weather;
  tintColor: string;                             // screen tint overlay (hex + alpha via rgba in render)
  musicId: 'firelink' | 'burg' | 'anorlondo' | 'kiln';
  speedMul: number;                              // baseline speed modifier for the zone
  spawnRateMul: number;
};

export const ZONES: ZoneDef[] = [
  {
    id: 'firelink',
    name: 'Firelink Shrine',
    subtitle: 'where the flame still lingers',
    duration: 45,
    wordLength: [3, 5],
    kindWeights: {normal: 100},
    bossId: null,
    weather: 'none',
    tintColor: 'rgba(40, 25, 10, 0.08)',
    musicId: 'firelink',
    speedMul: 0.85,
    spawnRateMul: 0.8,
  },
  {
    id: 'burg',
    name: 'Undead Burg',
    subtitle: 'ruined streets of the hollowed',
    duration: 75,
    wordLength: [4, 7],
    kindWeights: {normal: 55, runner: 15, tank: 10, ghost: 10, caster: 10},
    bossId: 'taurus',
    weather: 'rain',
    tintColor: 'rgba(10, 15, 30, 0.18)',
    musicId: 'burg',
    speedMul: 1.0,
    spawnRateMul: 1.0,
  },
  {
    id: 'anorlondo',
    name: 'Anor Londo',
    subtitle: 'the cathedral of the gods',
    duration: 85,
    wordLength: [5, 9],
    kindWeights: {normal: 40, runner: 15, tank: 10, ghost: 10, mimic: 10, lich: 8, caster: 7},
    bossId: 'ornstein',
    weather: 'godrays',
    tintColor: 'rgba(80, 60, 25, 0.12)',
    musicId: 'anorlondo',
    speedMul: 1.15,
    spawnRateMul: 1.15,
  },
  {
    id: 'kiln',
    name: 'Kiln of the First Flame',
    subtitle: 'the heart of all flame',
    duration: 70,
    wordLength: [6, 12],
    kindWeights: {normal: 25, runner: 18, tank: 15, ghost: 10, mimic: 12, lich: 8, chanter: 6, caster: 6},
    bossId: 'gwyn',
    weather: 'emberstorm',
    tintColor: 'rgba(100, 30, 10, 0.20)',
    musicId: 'kiln',
    speedMul: 1.3,
    spawnRateMul: 1.25,
  },
];

// ─────────────────────────────────────────────────────────────
// Bosses
// ─────────────────────────────────────────────────────────────

export type BossPattern = 'single' | 'volley' | 'wave' | 'word' | 'summoner' | 'caster' | 'munchie' | 'beat-volley';

export type BossPhase = {
  hpPctThreshold: number;    // entered when currentHp/maxHp ≤ this
  phraseBank: string[];      // pool of phrases in this phase
  phraseSpawnCooldown: number; // seconds between new phrase spawns
  patterns: BossPattern[];   // rotates in order
  patternInterval: number;   // seconds between attacks
  projectileLetters: string; // pool of chars the boss fires
  announcement?: string;     // floating text shown on phase entry
};

export type BossDef = {
  id: string;
  name: string;
  title: string;
  introLore: string;         // shown during the intro cutscene
  maxHp: number;
  phases: BossPhase[];
  silhouette: 'taurus' | 'ornstein' | 'gwyn' | 'afroman';
  themeColor: string;
  soulsReward: number;
  /** Optional — marks this boss as the secret route's fight. Used to skip
   *  the canvas silhouette renderer (AfroMan is a DOM sprite) and to route
   *  to the 20 s intro cutscene + sample-playback audio path. */
  secret?: boolean;
};

export const BOSSES: Record<string, BossDef> = {
  taurus: {
    id: 'taurus',
    name: 'TAURUS DEMON',
    title: 'Beast of the Ramparts',
    introLore: 'Long-stirred in the rubble. The stones yet remember its charge.',
    maxHp: 14,
    phases: [
      {hpPctThreshold: 1.0,  phraseBank: BOSS_PHRASES_TAURUS, phraseSpawnCooldown: 1.2, patterns: ['single'],              patternInterval: 3.2, projectileLetters: 'AEIOUNRST'},
      {hpPctThreshold: 0.66, phraseBank: BOSS_PHRASES_TAURUS, phraseSpawnCooldown: 1.0, patterns: ['single', 'volley'],    patternInterval: 3.4, projectileLetters: 'AEIOUNRSTK'},
      {hpPctThreshold: 0.33, phraseBank: BOSS_PHRASES_TAURUS, phraseSpawnCooldown: 0.9, patterns: ['volley', 'summoner', 'word'], patternInterval: 3.0, projectileLetters: 'AEIOUNRSTKD', announcement: 'RAGE AWAKENS'},
    ],
    silhouette: 'taurus',
    themeColor: '#b4501c',
    soulsReward: 1500,
  },
  ornstein: {
    id: 'ornstein',
    name: 'DRAGON SLAYER ORNSTEIN',
    title: 'Captain of the Four Knights',
    introLore: 'Lightning clings to his spear. A captain undefeated.',
    maxHp: 22,
    phases: [
      {hpPctThreshold: 1.0,  phraseBank: BOSS_PHRASES_ORNSTEIN,  phraseSpawnCooldown: 1.1, patterns: ['single', 'caster'],          patternInterval: 3.0, projectileLetters: 'LIGHTNSPEAR'},
      {hpPctThreshold: 0.66, phraseBank: BOSS_PHRASES_ORNSTEIN,  phraseSpawnCooldown: 1.0, patterns: ['volley', 'caster', 'word'],  patternInterval: 3.1, projectileLetters: 'LIGHTNSPEARFURY'},
      {hpPctThreshold: 0.33, phraseBank: BOSS_PHRASES_ORNSTEIN, phraseSpawnCooldown: 0.9, patterns: ['wave', 'volley', 'summoner', 'word'],   patternInterval: 2.6, projectileLetters: 'LIGHTNSPEARFURYKX', announcement: 'THE STORM GATHERS'},
    ],
    silhouette: 'ornstein',
    themeColor: '#ffd060',
    soulsReward: 3000,
  },
  gwyn: {
    id: 'gwyn',
    name: 'GWYN, LORD OF CINDER',
    title: 'The First Flame',
    introLore: 'He who first kindled the flame. His light wavers — do not falter.',
    maxHp: 32,
    phases: [
      {hpPctThreshold: 1.0,  phraseBank: BOSS_PHRASES_GWYN, phraseSpawnCooldown: 1.0, patterns: ['single', 'volley', 'caster'],          patternInterval: 3.0, projectileLetters: 'FIREASHCINDER'},
      {hpPctThreshold: 0.66, phraseBank: BOSS_PHRASES_GWYN, phraseSpawnCooldown: 1.0, patterns: ['wave', 'summoner', 'caster', 'word'],    patternInterval: 2.8, projectileLetters: 'FIREASHCINDERLIGHT'},
      {hpPctThreshold: 0.33, phraseBank: BOSS_PHRASES_GWYN, phraseSpawnCooldown: 0.8, patterns: ['wave', 'volley', 'summoner', 'caster', 'word'], patternInterval: 2.3, projectileLetters: 'FIREASHCINDERLIGHTDARK', announcement: 'THE LAST EMBER BURNS'},
    ],
    silhouette: 'gwyn',
    themeColor: '#ff4810',
    soulsReward: 6000,
  },
  // ─── Secret boss (AfroMan) ──────────────────────────────────────
  // Chosen from the Undead Burg fork. Big HP pool so the fight lasts through
  // the song; non-lethal munchie words (via the ZOOTED debuff) + slow tall-
  // can projectiles keep the pressure manageable despite the visual chaos.
  afroman: {
    id: 'afroman',
    name: 'AFROMAN',
    title: 'The Afroholic King',
    introLore: 'He slipped through a dimensional joint and now the Burg has a bassline.',
    maxHp: 45,
    phases: [
      {hpPctThreshold: 1.0,  phraseBank: BOSS_PHRASES_AFROMAN, phraseSpawnCooldown: 1.4, patterns: ['single', 'munchie'],                                patternInterval: 3.5, projectileLetters: '23456'},
      {hpPctThreshold: 0.66, phraseBank: BOSS_PHRASES_AFROMAN, phraseSpawnCooldown: 1.2, patterns: ['single', 'volley', 'munchie', 'beat-volley'],      patternInterval: 3.2, projectileLetters: '23456', announcement: 'CRANK IT UP'},
      {hpPctThreshold: 0.33, phraseBank: BOSS_PHRASES_AFROMAN, phraseSpawnCooldown: 1.0, patterns: ['volley', 'munchie', 'beat-volley', 'word'],         patternInterval: 2.8, projectileLetters: '23456', announcement: 'ENCORE TIME'},
    ],
    silhouette: 'afroman',
    themeColor: '#ff4fb3',
    soulsReward: 4200,
    secret: true,
  },
};

// ─────────────────────────────────────────────────────────────
// Ghost messages (Dark-Souls-style flavor text on the floor)
// ─────────────────────────────────────────────────────────────

export const GHOST_MESSAGES = [
  'amazing chest ahead', 'try tongue, but hole',
  'liar ahead', 'behind: soul',
  'praise the sun', 'time? amazing!',
  'be wary of dog', 'treasure ahead',
  'no way forward', 'seek guidance',
  'first flame fades', 'dark souls are cursed',
  'hidden path', 'cursed echo',
];
