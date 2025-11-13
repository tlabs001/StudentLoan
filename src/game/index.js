import { Agent } from './agent.js';

// === Editable Parameter Sections ==========================================
// -- Canvas & Display --
const GAME_PARAMS = {
  canvas: {
    width: 1180,
    height: 660
  },
  // -- Timing & Run Length --
  timing: {
    detectionTimeScale: 2,        // Guards advance patterns faster at higher values
    totalRunMinutes: 12,          // Real-time minutes allotted for the full tower run
    startHour24: 19,              // In-game clock start hour (24h format)
    endHour24: 24                 // In-game clock end hour (wraps past midnight if <= start)
  },
  // -- Tower Structure --
  tower: {
    totalFloors: 36
  },
  // -- Player Defaults --
  player: {
    spawnX: 120,
    width: 20,
    height: 46,
    gravity: 0.7,
    friction: 0.86,
    runSpeed: 4.1,
    jumpStrength: 13,
    sprintMultiplier: 1.35,
    flashlightRange: 240,
    checkingStart: 100,
    savingsStart: 1200,
    checkingHudMax: 250,
    checkingMax: 250,
    savingsHudMax: 1200,
    savingsMax: 1200,
    pistol: {
      magazine: 9,
      reserve: 60,
      cooldownMs: 140
    },
    flame: {
      fuel: 90,
      cooldownMs: 60
    },
    meleeCooldownMs: 240,
    damages: {
      bullet: 10,
      flame: 6,
      melee: 20,
      stomp: 10
    }
  },
  // -- Economy & Difficulty --
  economy: {
    startingLoanBalance: 120000
  },
  // -- Enemy Defaults --
  enemies: {
    guardBaseDamage: 10
  }
};

// Expose parameters for live tweaking via the browser console
window.GAME_PARAMS = GAME_PARAMS;

// --- Derived constants (auto-updated when parameters above change) ---
const TIME_SCALE = GAME_PARAMS.timing.detectionTimeScale;
const TOTAL_TIME_MS = GAME_PARAMS.timing.totalRunMinutes * 60 * 1000;
const RUN_START_HOUR = GAME_PARAMS.timing.startHour24;
const RUN_END_HOUR = GAME_PARAMS.timing.endHour24;
const _durationHours = (RUN_END_HOUR + (RUN_END_HOUR <= RUN_START_HOUR ? 24 : 0)) - RUN_START_HOUR;
const RUN_DURATION_HOURS = _durationHours > 0 ? _durationHours : 1;
const W = GAME_PARAMS.canvas.width;
const H = GAME_PARAMS.canvas.height;
const FLOORS = GAME_PARAMS.tower.totalFloors;
const GRAV = GAME_PARAMS.player.gravity;
const FRICTION = GAME_PARAMS.player.friction;
const RUN = GAME_PARAMS.player.runSpeed;
const JUMP = GAME_PARAMS.player.jumpStrength;
const SPRINT = GAME_PARAMS.player.sprintMultiplier;
const FLASH_DIST = GAME_PARAMS.player.flashlightRange;
const BASE_LEVEL_WIDTH = 3 * W;
let activeLevelWidth = BASE_LEVEL_WIDTH;
function levelWidth(){ return activeLevelWidth; }
function setLevelWidth(width){ activeLevelWidth = Math.max(W, width || BASE_LEVEL_WIDTH); }
function guardSafeDistance(){ return levelWidth() * 0.25; }
const GUARD_SEPARATION = 160;
const GUARD_SPAWN_MARGIN = 80;
const PLAYER_BULLET_DAMAGE = GAME_PARAMS.player.damages.bullet;
const PLAYER_FLAME_DAMAGE = GAME_PARAMS.player.damages.flame;
const PLAYER_MELEE_DAMAGE = GAME_PARAMS.player.damages.melee;
const STOMP_DAMAGE = GAME_PARAMS.player.damages.stomp;
const GRENADE_BASE_DAMAGE = 250;
const SABER_BASE_DAMAGE = 250;
const FLAMETHROWER_MAX_HEAT_MS = 10000;
const GRENADE_MAG_CAPACITY = 12;
const GRENADE_RESERVE_MAX = 120;
const GUARD_WIDTH = 20;
const GUARD_HEIGHT = 42;
const initialSpawnX = GAME_PARAMS.player.spawnX;
const RUN_LOAN_START = GAME_PARAMS.economy.startingLoanBalance;
const GUARD_BASE_DAMAGE = GAME_PARAMS.enemies.guardBaseDamage;
const CHECKING_MAX = Math.max(1, GAME_PARAMS.player.checkingMax || GAME_PARAMS.player.checkingHudMax);
const SAVINGS_MAX = Math.max(1, GAME_PARAMS.player.savingsMax || GAME_PARAMS.player.savingsHudMax);
const LOAN_CAP = 999999999;
const GUARD_CONTACT_DELAY_MS = 500;
const OUTSIDE_FLOOR = 0;
const OUTSIDE_KILL_TARGET = 20;
const OUTSIDE_MAX_ACTIVE_GUARDS = 6;
const OUTSIDE_SCOPE_RADIUS = Math.floor(Math.min(W, H) * 0.36);
const JUMP_IN_RATES_DURATION_MS = 30 * 1000;
const ITS_ONLY_MONEY_TOTAL_MS = 25 * 60 * 1000;
const ITS_ONLY_MONEY_ALLY_JOIN_MS = 5 * 60 * 1000;
const ITS_ONLY_MONEY_GORE_MS = 20 * 60 * 1000;
const ITS_ONLY_MONEY_POLITICIAN_MS = 22 * 60 * 1000;
const WARZONE_MAX_ACTIVE_ENEMIES = 100;
const OUTSIDE_BUILDING = (()=>{
  const width = 520;
  const x = Math.floor((W - width) / 2);
  const y = Math.max(60, Math.floor(H * 0.22));
  const height = 360;
  return { x, y, width, height, roofY: y, groundY: y + height };
})();
const OUTSIDE_FRONT_WALK = OUTSIDE_BUILDING.groundY + 42;
const OUTSIDE_PLATFORM_SPANS = [
  { x: OUTSIDE_BUILDING.x + 50, y: OUTSIDE_BUILDING.y + 110, w: OUTSIDE_BUILDING.width - 100 },
  { x: OUTSIDE_BUILDING.x + 80, y: OUTSIDE_BUILDING.y + 170, w: OUTSIDE_BUILDING.width - 160 },
  { x: OUTSIDE_BUILDING.x + 60, y: OUTSIDE_BUILDING.y + 230, w: OUTSIDE_BUILDING.width - 120 },
  { x: OUTSIDE_BUILDING.x + 80, y: OUTSIDE_BUILDING.y + 290, w: OUTSIDE_BUILDING.width - 160 }
];
const OUTSIDE_GUARD_SLOTS = [
  { id:'ground-west', x: OUTSIDE_BUILDING.x - 70, y: OUTSIDE_FRONT_WALK, swing: 18, bob: 3 },
  { id:'ground-entry-left', x: OUTSIDE_BUILDING.x + 80, y: OUTSIDE_FRONT_WALK, swing: 20, bob: 4 },
  { id:'ground-entry-mid', x: OUTSIDE_BUILDING.x + OUTSIDE_BUILDING.width/2 - 40, y: OUTSIDE_FRONT_WALK, swing: 22, bob: 4 },
  { id:'ground-entry-right', x: OUTSIDE_BUILDING.x + OUTSIDE_BUILDING.width - 120, y: OUTSIDE_FRONT_WALK, swing: 20, bob: 4 },
  { id:'ground-east', x: OUTSIDE_BUILDING.x + OUTSIDE_BUILDING.width + 70, y: OUTSIDE_FRONT_WALK, swing: 18, bob: 3 },
  { id:'ground-west-car', x: OUTSIDE_BUILDING.x - 150, y: OUTSIDE_FRONT_WALK, swing: 14, bob: 3 },
  { id:'ground-east-car', x: OUTSIDE_BUILDING.x + OUTSIDE_BUILDING.width + 150, y: OUTSIDE_FRONT_WALK, swing: 14, bob: 3 }
];
const OUTSIDE_WORKER_COUNT = 15;
const OUTSIDE_WINDOW_LAYOUT = (()=>{
  const winCols = 6;
  const winRows = 6;
  const winWidth = 30;
  const winHeight = 36;
  const winGapX = (OUTSIDE_BUILDING.width - winCols * winWidth) / (winCols + 1);
  const winGapY = (OUTSIDE_BUILDING.height - 140 - winRows * winHeight) / (winRows + 1);
  const positions = [];
  for(let r=0; r<winRows; r++){
    for(let c=0; c<winCols; c++){
      const winX = OUTSIDE_BUILDING.x + winGapX + c * (winWidth + winGapX);
      const winY = OUTSIDE_BUILDING.y + 46 + winGapY + r * (winHeight + winGapY);
      positions.push({ x: winX, y: winY, w: winWidth, h: winHeight, row:r, col:c });
    }
  }
  return { cols: winCols, rows: winRows, width: winWidth, height: winHeight, gapX: winGapX, gapY: winGapY, positions };
})();
const OUTSIDE_WINDOW_GUARD_SLOTS = [
  { row: 1, col: 1, id: 'window-nw' },
  { row: 2, col: 3, id: 'window-mid' },
  { row: 3, col: 4, id: 'window-se' }
];

const ARCADE_BEATDOWN_FLOORS = new Set([13, 14, 23]);
const CORPORATE_HELLSCAPE_FLOORS = new Set([17, 25, 29]);
const HELL_WAVE_GOALS = {
  17: Infinity,
  25: Infinity,
  29: Infinity
};
const HELL_OPTIONAL_KILL_TARGET = 100;
const HELL_PRESET_WAVE_TARGETS = [25, 50, 75, 100, 200, 400, 600, 800, 1000];
const HELL_SPAWN_INTERVAL_BASE = 30 / 45;
const ZOMBIE_SPAWN_RATE_MULTIPLIER = 0.55; // 45% faster spawn cadence
const VENT_DUNGEON_FLOORS = new Set([9, 34]);
const VENT_DUNGEON_CONFIG = {
  9: {
    name: 'Ventilation Maze',
    noteValue: 1000,
    noteLabel: '$1,000 Note',
    internCount: 6,
    requiredBoxes: 9,
    weaponUnlocks: ['grenade', 'saber'],
    speed: 180,
    cols: 9,
    rows: 6,
    cellWidth: 160,
    cellHeight: 120,
    loops: 0.28,
    secretPhotos: [
      'CEO in a coconut bra',
      'CEO napping on a pool float',
      'CEO karaoke with seagulls',
      'CEO tangled in seaweed'
    ]
  },
  34: {
    name: 'Executive Vent Vault',
    noteValue: 10000,
    noteLabel: '$10,000 Note',
    internCount: 8,
    requiredBoxes: 9,
    weaponUnlocks: ['saber', 'machineGun'],
    speed: 195,
    cols: 10,
    rows: 7,
    cellWidth: 176,
    cellHeight: 128,
    loops: 0.34,
    secretPhotos: [
      'CEO in a gold lame wetsuit',
      'CEO serenading dolphins',
      'CEO slipping on a yacht deck',
      'CEO eating instant noodles in disguise'
    ]
  }
};
const TOP_DOWN_FLOORS = new Set();
const TOP_DOWN_FLOOR_CONFIG = VENT_DUNGEON_CONFIG;
const ARCADE_RAMPAGE_TARGET_DEFAULT = 26;

const DRONE_MISSION_CONFIG = {
  10: {
    id: 'corporate-mansions',
    name: 'Drone Strike on Corporate Mansions',
    hackType: 'tetris',
    hackWinsRequired: 3,
    hackLinesPerMatch: 6,
    drone: {
      controlMode: 'bombardier',
      terrain: 'mansion',
      totalTargets: 36,
      maxActiveTargets: 5,
      missionText: 'Hack complete. Eliminate all 16 estates.',
      enemyLabel: 'Estate Guard',
      bombardierSpeedMultiplier: 0.55,
      bombardierSpacingMultiplier: 2
    }
  },
  35: {
    id: 'mega-yacht-elimination',
    name: 'Mega-Yacht Elimination',
    hackType: 'chess',
    hackWinsRequired: 3,
    hackMaxGames: 20,
    drone: {
      controlMode: 'bombardier',
      terrain: 'yacht',
      totalTargets: 20,
      maxActiveTargets: 4,
      missionText: 'Target yachts destroyed',
      enemyLabel: 'Deck Guard',
      bombardierSpeedMultiplier: 0.55,
      bombardierSpacingMultiplier: 2
    }
  }
};

const ADVANCED_VENDING_FLOORS = new Set([2, 3, 7, 9, 13, 14, 15, 17, 28, 29, 31, 33, 34]);

(()=>{
// ===== Color utilities & palettes =====
function clamp01(v){ return Math.min(1, Math.max(0, v)); }
function hexToRgb(hex){
  if(!hex) return {r:0,g:0,b:0};
  let n = hex.replace('#','');
  if(n.length===3){ n = n.split('').map(ch=>ch+ch).join(''); }
  const int = parseInt(n,16);
  return { r:(int>>16)&255, g:(int>>8)&255, b:int&255 };
}
function rgbToHex(r,g,b){
  const toHex = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0, s=0;
  const l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      default: h = (r-g)/d + 4; break;
    }
    h *= 60;
  }
  return {h, s, l};
}
function hslToRgb(h,s,l){
  const C = (1 - Math.abs(2*l - 1)) * s;
  const hh = (h % 360) / 60;
  const X = C * (1 - Math.abs((hh % 2) - 1));
  let r1=0,g1=0,b1=0;
  if(hh>=0 && hh<1){ r1=C; g1=X; }
  else if(hh<2){ r1=X; g1=C; }
  else if(hh<3){ g1=C; b1=X; }
  else if(hh<4){ g1=X; b1=C; }
  else if(hh<5){ r1=X; b1=C; }
  else { r1=C; b1=X; }
  const m = l - C/2;
  return { r:(r1+m)*255, g:(g1+m)*255, b:(b1+m)*255 };
}
function shiftHue(hex, shiftDeg){
  if(!hex) return hex;
  const {r,g,b}=hexToRgb(hex);
  let {h,s,l}=rgbToHsl(r,g,b);
  h = (h + shiftDeg) % 360; if(h<0) h+=360;
  s = clamp01(s + 0.08);
  if(l < 0.18) l = clamp01(l + 0.05);
  const rgb = hslToRgb(h,s,l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}
function adjustLightness(hex, delta){
  if(!hex) return hex;
  const {r,g,b}=hexToRgb(hex);
  let {h,s,l}=rgbToHsl(r,g,b);
  l = clamp01(l + delta);
  const rgb = hslToRgb(h,s,l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}
function toRgba(hex, alpha){
  const {r,g,b}=hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

const BASE_ENV_COLORS = {
  background:'#0e0f13',
  wall:'#14161b',
  platform:'#2b2e36',
  platformTop:'#3f4658',
  platformShadow:'#1a1e27',
  platformOutline:'#9bb7ff',
  desk:'#5a4634',
  deskEdge:'#3e2f23',
  deskLeg:'#3a2a1f',
  plantLeaf:'#2f7a3a',
  plantPot:'#6b4e31',
  waterCooler:'#9ec7ff',
  waterGlass:'#cfe3ff',
  ladder:'#6c6c6c',
  movingPlatform:'#444444',
  movingPlatformHighlight:'#777777',
  ventOpen:'#6c6c6c',
  ventClosed:'#4b4b4b',
  windowBase:'#78a0dc',
  windowHighlight:'#c8dcff',
  alarmDisabled:'#2b4b2b',
  alarmActive:'#6b2222',
  doorFrame:'#2a2a2a',
  doorPanel:'#4a2a2a',
  serverActive:'#3e6cff',
  serverDestroyed:'#333333'
};
const WORKER_STYLES = [
  { suit:'#2f3f6a', shirt:'#e1e6f0', tie:'#d13c3c', accent:'#1f2a44' },
  { suit:'#3a2f6b', shirt:'#f3f2f7', tie:'#3c8bd1', accent:'#221b3a' },
  { suit:'#2f5a46', shirt:'#f1f7f0', tie:'#d1863c', accent:'#1e3428' },
  { suit:'#5a2f3f', shirt:'#f7f1f0', tie:'#3c6bd1', accent:'#2b1a26' }
];
const WORKER_SKIN_TONES = ['#f7cfa3','#f0b887','#e0a36b'];
const WORKER_HAIR_TONES = ['#2f2a1d','#46311f','#1f1f1f','#6b4222'];
const PALETTE_HUE_STEP = 18;

// ===== Floor theming & special rules =====
const FLOOR_THEME_CONFIG = [
  { range:[1,4], id:'intern', name:'Intern Office', lighting:'bright',
    guard:{countMod:-2, speedMod:-0.05, hpMod:-0.1},
    visuals:{floatingPapers:true},
    notes:'Workers panic and run; entry tutorial vibes.' },
  { range:[5,8], id:'hr', name:'HR Zone', lighting:'muted',
    guard:{preferred:['policy'], speedMod:-0.02},
    visuals:{posters:true, colorTint:'#c48ca9'},
    notes:'Policy binder projectiles drain finances.' },
  { range:[9,12], id:'finance', name:'Finance Wing', lighting:'golden',
    guard:{preferred:['shield'], hpMod:0.25},
    visuals:{tickers:true},
    notes:'Cash rush and armored guards.' },
  { range:[13,16], id:'data', name:'Data Center', lighting:'neon',
    guard:{preferred:['auto','launcher'], speedMod:0.05},
    visuals:{sparks:true, serverGlow:true},
    notes:'Electrical feedback hazards.' },
  { range:[17,20], id:'rnd', name:'R&D Lab', lighting:'flicker',
    guard:{preferred:['launcher','experimental'], hpMod:0.15},
    visuals:{labGear:true},
    notes:'Experimental weapons with risk/reward loot.' },
  { range:[21,24], id:'investor', name:'Investor Lounge', lighting:'minimal',
    guard:{preferred:['ninja'], speedMod:0.18},
    visuals:{redAccent:true},
    notes:'Quiet floors with stealth emphasis.' },
  { range:[25,28], id:'marketing', name:'Marketing Dept.', lighting:'glow',
    guard:{preferred:['ad'], speedMod:0.08},
    visuals:{billboards:true},
    notes:'Screen-flood grenades disrupt vision.' },
  { range:[29,32], id:'legal', name:'Legal Floor', lighting:'dim',
    guard:{preferred:['lawsuit','shield'], hpMod:0.2},
    visuals:{mahogany:true},
    notes:'Homing lawsuits pursue intruders.' },
  { range:[33,35], id:'executive', name:'Executive Suites', lighting:'storm',
    guard:{preferred:['heavy','launcher'], hpMod:0.35, speedMod:-0.04},
    visuals:{sleek:true},
    notes:'Tight corridors with armored security.' },
  { range:[36,36], id:'ceo', name:'CEO Penthouse', lighting:'storm',
    guard:{preferred:['heavy','launcher'], hpMod:0.45, speedMod:0.1},
    visuals:{skyline:true, lightning:true},
    notes:'Final confrontation backdrop.' }
];

const BOARD_FLOORS = new Set([4,8,12,16,20,24,28,32]);
const SERVER_FLOORS = new Set([7,14,21,28]);
const INFLATION_FLOORS = new Set([6,13,19,26,33]);
const PAYDAY_INTERVAL = 5;
const BONUS_FLOOR_MIN = 3;
const BONUS_FLOOR_MAX = 30;
const HACK_KEY_POOL = ['q','w','e','a','s','d'];

function getFloorTheme(floor){
  for(const config of FLOOR_THEME_CONFIG){
    const [lo,hi] = config.range;
    if(floor>=lo && floor<=hi) return config;
  }
  return FLOOR_THEME_CONFIG[FLOOR_THEME_CONFIG.length-1];
}

function isBoardFloor(floor){ return BOARD_FLOORS.has(floor); }
function isServerFloor(floor){ return SERVER_FLOORS.has(floor); }
function isInflationFloor(floor){ return INFLATION_FLOORS.has(floor); }
function isArcadeBeatdownFloor(floor){ return ARCADE_BEATDOWN_FLOORS.has(floor); }

function computePaletteForFloor(floor){
  const hueShift = ((floor-1) * PALETTE_HUE_STEP) % 360;
  const shift = hex => shiftHue(hex, hueShift);
  return {
    hueShift,
    background: shift(BASE_ENV_COLORS.background),
    wall: shift(BASE_ENV_COLORS.wall),
    platform: shift(BASE_ENV_COLORS.platform),
    platformTop: shift(BASE_ENV_COLORS.platformTop),
    platformShadow: shift(BASE_ENV_COLORS.platformShadow),
    platformOutline: shift(BASE_ENV_COLORS.platformOutline),
    platformGlow: toRgba(shift(BASE_ENV_COLORS.platformOutline), 0.22),
    desk: shift(BASE_ENV_COLORS.desk),
    deskEdge: shift(BASE_ENV_COLORS.deskEdge),
    deskLeg: shift(BASE_ENV_COLORS.deskLeg),
    plantLeaf: shift(BASE_ENV_COLORS.plantLeaf),
    plantPot: shift(BASE_ENV_COLORS.plantPot),
    waterCooler: shift(BASE_ENV_COLORS.waterCooler),
    waterGlass: shift(BASE_ENV_COLORS.waterGlass),
    ladder: shift(BASE_ENV_COLORS.ladder),
    movingPlatform: shift(BASE_ENV_COLORS.movingPlatform),
    movingPlatformHighlight: shift(BASE_ENV_COLORS.movingPlatformHighlight),
    ventOpen: shift(BASE_ENV_COLORS.ventOpen),
    ventClosed: shift(BASE_ENV_COLORS.ventClosed),
    windowBase: toRgba(shift(BASE_ENV_COLORS.windowBase), 0.22),
    windowHighlight: toRgba(shift(BASE_ENV_COLORS.windowHighlight), 0.07),
    alarmDisabled: shift(BASE_ENV_COLORS.alarmDisabled),
    alarmActive: shift(BASE_ENV_COLORS.alarmActive),
    doorFrame: shift(BASE_ENV_COLORS.doorFrame),
    doorPanel: shift(BASE_ENV_COLORS.doorPanel),
    doorGlow: toRgba(shift('#78ffb0'), 0.22),
    flashlightCone: toRgba(shift('#fff19a'), 0.10),
    serverActive: shift(BASE_ENV_COLORS.serverActive),
    serverDestroyed: shift(BASE_ENV_COLORS.serverDestroyed)
  };
}

let activePalette = computePaletteForFloor(1);

function createWorkerAppearance(){
  const hueShift = activePalette ? activePalette.hueShift : 0;
  const shift = hex => shiftHue(hex, hueShift);
  const style = WORKER_STYLES[Math.floor(Math.random()*WORKER_STYLES.length)];
  const skinBase = WORKER_SKIN_TONES[Math.floor(Math.random()*WORKER_SKIN_TONES.length)];
  const hairBase = WORKER_HAIR_TONES[Math.floor(Math.random()*WORKER_HAIR_TONES.length)];
  const suit = shift(style.suit);
  const shirt = shift(style.shirt);
  const tie = style.tie ? shift(style.tie) : null;
  const accent = style.accent ? shift(style.accent) : adjustLightness(suit, -0.12);
  const hair = shift(hairBase);
  const skin = shift(skinBase);
  const pants = adjustLightness(suit, -0.06);
  return {
    suit,
    suitShadow: adjustLightness(suit, -0.12),
    shirt,
    tie,
    tieKnot: tie ? adjustLightness(tie, -0.1) : null,
    accent,
    hair,
    hairShadow: adjustLightness(hair, -0.12),
    skin,
    skinShadow: adjustLightness(skin, -0.07),
    pants,
    shoes: adjustLightness(pants, -0.18),
    badge: adjustLightness(shirt, -0.35),
    cuffs: adjustLightness(shirt, -0.1),
    clipboard: shift('#c8c1a7'),
    clipboardPaper: shift('#f9f6e8'),
    glasses: shift('#dbe3f0'),
    mouth: adjustLightness(skin, -0.2)
  };
}

// ===== Audio =====
let ac;
function getAC(){ if(!ac){ ac=new (window.AudioContext||window.webkitAudioContext)(); } return ac; }
function beep({freq=660,dur=0.12,type='sine',gain=0.08}={}){
  try{
    const ctx=getAC(); const o=ctx.createOscillator(); const g=ctx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.value=gain; o.connect(g); g.connect(ctx.destination);
    const t=ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.start(t); o.stop(t+dur+0.05);
  }catch(e){}
}
function motor({startFreq=120,endFreq=70,dur=0.6,gain=0.09}={}){
  try{
    const ctx=getAC(); const o=ctx.createOscillator(); const g=ctx.createGain();
    o.type='sawtooth'; o.frequency.value=startFreq;
    g.gain.value=gain; o.connect(g); g.connect(ctx.destination);
    const t=ctx.currentTime;
    o.frequency.setValueAtTime(startFreq, t);
    o.frequency.exponentialRampToValueAtTime(endFreq, t+dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t+0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.start(t); o.stop(t+dur+0.1);
  }catch(e){}
}

const NOTE_INDEX = {
  'C':-9, 'C#':-8, 'DB':-8,
  'D':-7, 'D#':-6, 'EB':-6,
  'E':-5,
  'F':-4, 'F#':-3, 'GB':-3,
  'G':-2, 'G#':-1, 'AB':-1,
  'A':0, 'A#':1, 'BB':1,
  'B':2
};

function noteToFrequency(note){
  if(!note && note!==0) return 0;
  if(typeof note === 'number') return note;
  const text = `${note}`.trim();
  const match = text.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if(!match) return 0;
  const letter = match[1].toUpperCase();
  const accidental = match[2] ? match[2].toUpperCase() : '';
  const octave = parseInt(match[3], 10);
  const key = `${letter}${accidental}`;
  const offset = NOTE_INDEX[key];
  if(offset===undefined || !Number.isFinite(octave)) return 0;
  const semitone = offset + (octave - 4) * 12;
  return 440 * Math.pow(2, semitone/12);
}

const MUSIC_TRACKS = {
  outsideSpy: {
    tempo: 118,
    voices: [
      {
        wave: 'square',
        gain: 0.1,
        release: 0.24,
        sequence: [
          { note: 'E4', beats: 0.5 },
          { note: 'G4', beats: 0.5 },
          { note: 'B4', beats: 0.5 },
          { note: 'D5', beats: 0.5 },
          { note: 'C5', beats: 0.5 },
          { note: 'A4', beats: 0.5 },
          { note: 'G4', beats: 0.5 },
          { rest: true, beats: 0.5 },
          { note: 'F#4', beats: 0.5 },
          { note: 'A4', beats: 0.5 },
          { note: 'C5', beats: 0.5 },
          { note: 'E5', beats: 0.5 },
          { note: 'D5', beats: 1 }
        ]
      },
      {
        wave: 'triangle',
        gain: 0.08,
        release: 0.4,
        sequence: [
          { note: 'E2', beats: 1 },
          { note: 'B2', beats: 1 },
          { note: 'D3', beats: 1 },
          { note: 'C3', beats: 1 },
          { note: 'A2', beats: 1 },
          { note: 'E2', beats: 1 },
          { note: 'F#2', beats: 1 },
          { note: 'C3', beats: 1 }
        ]
      },
      {
        wave: 'square',
        gain: 0.05,
        release: 0.18,
        sequence: [
          { note: 'E5', beats: 0.25 },
          { note: 'F#5', beats: 0.25 },
          { note: 'G5', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'D5', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'C5', beats: 0.25 },
          { rest: true, beats: 0.25 }
        ]
      }
    ]
  },
  level: {
    tempo: 128,
    voices: [
      {
        wave: 'square',
        gain: 0.12,
        release: 0.22,
        sequence: [
          { note: 'A4', beats: 0.5 },
          { note: 'C5', beats: 0.5 },
          { note: 'E5', beats: 0.5 },
          { note: 'C5', beats: 0.5 },
          { note: 'D5', beats: 0.5 },
          { note: 'F5', beats: 0.5 },
          { note: 'E5', beats: 1 },
          { note: 'B4', beats: 0.5 },
          { note: 'D5', beats: 0.5 },
          { note: 'F5', beats: 0.5 },
          { note: 'D5', beats: 0.5 },
          { note: 'C5', beats: 1 }
        ]
      },
      {
        wave: 'triangle',
        gain: 0.09,
        release: 0.35,
        sequence: [
          { note: 'A2', beats: 1 },
          { note: 'E3', beats: 1 },
          { note: 'F2', beats: 1 },
          { note: 'C3', beats: 1 },
          { note: 'D2', beats: 1 },
          { note: 'E3', beats: 1 },
          { note: 'C2', beats: 1 },
          { note: 'G2', beats: 1 }
        ]
      },
      {
        wave: 'square',
        gain: 0.05,
        release: 0.12,
        sequence: [
          { note: 'E5', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'E5', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'G5', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'A5', beats: 0.25 },
          { rest: true, beats: 0.25 }
        ]
      }
    ]
  },
  vent: {
    tempo: 92,
    voices: [
      {
        wave: 'square',
        gain: 0.11,
        release: 0.45,
        sequence: [
          { note: 'D4', beats: 1 },
          { note: 'F4', beats: 1 },
          { note: 'A4', beats: 1 },
          { note: 'C5', beats: 1 },
          { note: 'Bb4', beats: 2 },
          { note: 'A4', beats: 2 }
        ]
      },
      {
        wave: 'triangle',
        gain: 0.08,
        release: 0.55,
        sequence: [
          { note: 'D2', beats: 2 },
          { note: 'A1', beats: 2 },
          { note: 'C2', beats: 2 },
          { note: 'G1', beats: 2 }
        ]
      },
      {
        wave: 'square',
        gain: 0.04,
        release: 0.2,
        sequence: [
          { note: 'A5', beats: 0.5 },
          { rest: true, beats: 0.5 },
          { note: 'G5', beats: 0.5 },
          { rest: true, beats: 0.5 },
          { note: 'F5', beats: 0.5 },
          { rest: true, beats: 0.5 },
          { note: 'D5', beats: 0.5 },
          { rest: true, beats: 0.5 }
        ]
      }
    ]
  },
  boss: {
    tempo: 152,
    voices: [
      {
        wave: 'square',
        gain: 0.14,
        release: 0.18,
        sequence: [
          { note: 'E5', beats: 0.5 },
          { note: 'F5', beats: 0.5 },
          { note: 'G5', beats: 0.5 },
          { note: 'B5', beats: 0.5 },
          { note: 'A5', beats: 0.5 },
          { note: 'G5', beats: 0.5 },
          { note: 'E5', beats: 0.5 },
          { note: 'D5', beats: 0.5 }
        ]
      },
      {
        wave: 'square',
        gain: 0.11,
        release: 0.16,
        sequence: [
          { note: 'E4', beats: 0.25 },
          { note: 'G4', beats: 0.25 },
          { note: 'A4', beats: 0.25 },
          { note: 'C5', beats: 0.25 },
          { note: 'B4', beats: 0.25 },
          { note: 'A4', beats: 0.25 },
          { note: 'G4', beats: 0.25 },
          { note: 'E4', beats: 0.25 }
        ]
      },
      {
        wave: 'triangle',
        gain: 0.1,
        release: 0.28,
        sequence: [
          { note: 'E2', beats: 1 },
          { note: 'B1', beats: 1 },
          { note: 'D2', beats: 1 },
          { note: 'A1', beats: 1 },
          { note: 'C2', beats: 1 },
          { note: 'B1', beats: 1 },
          { note: 'G1', beats: 1 },
          { note: 'A1', beats: 1 }
        ]
      },
      {
        wave: 'sawtooth',
        gain: 0.05,
        release: 0.12,
        sequence: [
          { note: 'E6', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'E6', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'G6', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'B6', beats: 0.25 },
          { rest: true, beats: 0.25 }
        ]
      }
    ]
  },
  vent: {
    tempo: 122,
    voices: [
      {
        wave: 'triangle',
        gain: 0.09,
        release: 0.24,
        sequence: [
          { note: 'C4', beats: 0.5 },
          { note: 'E4', beats: 0.5 },
          { rest: true, beats: 0.25 },
          { note: 'G4', beats: 0.25 },
          { note: 'A4', beats: 0.5 },
          { note: 'E4', beats: 0.5 },
          { rest: true, beats: 0.25 },
          { note: 'D4', beats: 0.25 }
        ]
      },
      {
        wave: 'sine',
        gain: 0.06,
        release: 0.28,
        sequence: [
          { note: 'A3', beats: 1 },
          { rest: true, beats: 0.5 },
          { note: 'F3', beats: 0.5 },
          { note: 'G3', beats: 1 },
          { rest: true, beats: 0.5 },
          { note: 'E3', beats: 0.5 }
        ]
      }
    ]
  },
  boss: {
    tempo: 136,
    voices: [
      {
        wave: 'square',
        gain: 0.15,
        release: 0.18,
        sequence: [
          { note: 'D5', beats: 0.5 },
          { note: 'F5', beats: 0.5 },
          { note: 'G5', beats: 0.5 },
          { note: 'A5', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'F5', beats: 0.5 },
          { note: 'E5', beats: 0.5 },
          { note: 'C5', beats: 0.5 }
        ]
      },
      {
        wave: 'sawtooth',
        gain: 0.08,
        release: 0.22,
        sequence: [
          { note: 'D3', beats: 1 },
          { note: 'C3', beats: 1 },
          { note: 'Bb2', beats: 1 },
          { note: 'F3', beats: 1 }
        ]
      },
      {
        wave: 'triangle',
        gain: 0.07,
        release: 0.16,
        sequence: [
          { note: 'A4', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'G4', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'F4', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'E4', beats: 0.25 },
          { rest: true, beats: 0.25 }
        ]
      }
    ]
  },
  warzone: {
    tempo: 148,
    voices: [
      {
        wave: 'sawtooth',
        gain: 0.14,
        release: 0.2,
        sequence: [
          { note: 'E4', beats: 0.25 },
          { note: 'G4', beats: 0.25 },
          { note: 'A4', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'B4', beats: 0.25 },
          { rest: true, beats: 0.25 },
          { note: 'A4', beats: 0.25 },
          { rest: true, beats: 0.25 }
        ]
      },
      {
        wave: 'triangle',
        gain: 0.1,
        release: 0.3,
        sequence: [
          { note: 'E2', beats: 1 },
          { note: 'D2', beats: 1 },
          { note: 'C2', beats: 1 },
          { note: 'B1', beats: 1 }
        ]
      },
      {
        wave: 'square',
        gain: 0.06,
        release: 0.14,
        sequence: [
          { note: 'E5', beats: 0.5 },
          { rest: true, beats: 0.25 },
          { note: 'G5', beats: 0.25 },
          { note: 'A5', beats: 0.5 },
          { rest: true, beats: 0.25 },
          { note: 'G5', beats: 0.25 }
        ]
      }
    ]
  }
};

const musicState = { current:null, stopFns:[], requested:null };
const MUSIC_MUTE_KEY = 'loanTower.musicMuted';
let musicMuted = false;
try {
  musicMuted = localStorage.getItem(MUSIC_MUTE_KEY) === '1';
} catch (e) {
  musicMuted = false;
}
const HUD_COMPACT_KEY = 'loanTower.hudCompact';
let hudCompact = false;
try {
  hudCompact = localStorage.getItem(HUD_COMPACT_KEY) === '1';
} catch (e) {
  hudCompact = false;
}
let hudBoxEl = null;
let hudToggleBtn = null;
let musicToggleBtn = null;

function stopMusic(){
  if(musicState.stopFns){
    for(const stop of musicState.stopFns){
      try{ if(typeof stop==='function') stop(); }catch(e){}
    }
  }
  musicState.stopFns = [];
  musicState.current = null;
}

function startVoiceLoop(ctx, voice, tempo){
  const sequence = voice && voice.sequence;
  if(!sequence || !sequence.length) return null;
  let cancelled=false;
  const activeNodes = new Set();
  const secsPerBeat = 60 / (voice.tempo || tempo || 120);
  let step=0;
  let timerId=null;

  const scheduleNext = ()=>{
    if(cancelled) return;
    const stepData = sequence[step % sequence.length];
    step++;
    const beats = stepData && Number.isFinite(stepData.beats) ? Math.max(0.125, stepData.beats) : 1;
    const duration = Math.max(0.05, beats * secsPerBeat);
    if(stepData && !stepData.rest){
      const freq = stepData.freq || noteToFrequency(stepData.note);
      if(freq > 0){
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const wave = stepData.wave || voice.wave || 'square';
        const gainValue = Math.max(0.0001, stepData.gain ?? voice.gain ?? 0.1);
        const attack = Math.max(0.002, stepData.attack ?? voice.attack ?? 0.01);
        const release = Math.max(0.02, stepData.release ?? voice.release ?? Math.min(0.3, duration*0.6));
        const startTime = ctx.currentTime + (stepData.offset ?? voice.offset ?? 0.02);
        osc.type = wave;
        try{ osc.frequency.setValueAtTime(freq, startTime); }catch(e){ osc.frequency.value = freq; }
        if(Number.isFinite(stepData.detune)){ osc.detune.setValueAtTime(stepData.detune, startTime); }
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(gainValue, startTime + attack);
        gain.gain.setTargetAtTime(0.0001, startTime + duration - release, release);
        osc.connect(gain);
        gain.connect(ctx.destination);
        const node = { osc, gain };
        activeNodes.add(node);
        osc.onended = ()=>{
          try{ gain.disconnect(); }catch(e){}
          activeNodes.delete(node);
        };
        try{ osc.start(startTime); }catch(e){ osc.start(); }
        try{ osc.stop(startTime + duration + release + 0.05); }catch(e){ osc.stop(ctx.currentTime + duration + release + 0.05); }
      }
    }
    timerId = setTimeout(scheduleNext, duration * 1000);
  };

  scheduleNext();

  return ()=>{
    cancelled=true;
    if(timerId) clearTimeout(timerId);
    for(const node of activeNodes){
      try{ node.osc.stop(); }catch(e){}
      try{ node.gain.disconnect(); }catch(e){}
    }
    activeNodes.clear();
  };
}

async function startMusic(type){
  musicState.requested = type || null;
  if(musicMuted || !type){
    if(musicState.current){
      stopMusic();
    }
    return;
  }
  if(musicState.current === type) return;
  stopMusic();
  const track = MUSIC_TRACKS[type];
  if(!track) return;
  try{
    const ctx = getAC();
    if(ctx.state === 'suspended' && ctx.resume){
      try{ await ctx.resume(); }catch(e){}
    }
    const tempo = track.tempo || 120;
    const stops=[];
    for(const voice of track.voices || []){
      const stop = startVoiceLoop(ctx, voice, tempo);
      if(stop) stops.push(stop);
    }
    musicState.stopFns = stops;
    musicState.current = type;
  }catch(e){
    musicState.stopFns = [];
    musicState.current = null;
  }
}

function stopAmbientLoop(){
  if(ambientInterval){
    clearInterval(ambientInterval);
    ambientInterval=null;
  }
}

function setAmbient(type){
  if(ambientCurrent===type) return;
  ambientCurrent=type;
  stopAmbientLoop();
  if(!type) return;
  const invoke = ()=>{
    if(type==='printer'){
      motor({startFreq:240,endFreq:160,dur:0.9,gain:0.04});
    } else if(type==='server'){
      motor({startFreq:150,endFreq:110,dur:1.4,gain:0.05});
    } else if(type==='wind'){
      beep({freq:220,dur:0.3,type:'triangle',gain:0.03});
    }
  };
  invoke();
  ambientInterval = setInterval(invoke, type==='server'?1800:type==='printer'?1600:1400);
}

function setAmbientForFloor(floor){
  if(floor<=12){
    setAmbient('printer');
  } else if(floor<=24){
    setAmbient('server');
  } else {
    setAmbient('wind');
  }
}
function chime(){ beep({freq:740,dur:0.08}); setTimeout(()=>beep({freq:1100,dur:0.1}),70); }
function lockedBuzz(){ motor({startFreq:160,endFreq:80,dur:0.2,gain:0.06}); }
function doorOpenSFX(){ motor({startFreq:220,endFreq:90,dur:0.8,gain:0.08}); }
function boom(){ motor({startFreq:80,endFreq:40,dur:0.4,gain:0.12}); }

function playGunshot(kind='pistol'){
  try{
    const ctx = getAC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const cfg = {
      pistol:{ start:620, end:240, dur:0.12, gain:0.1, type:'square' },
      silenced:{ start:420, end:180, dur:0.16, gain:0.05, type:'sine' },
      machineGun:{ start:760, end:320, dur:0.08, gain:0.08, type:'sawtooth' },
      grenade:{ start:340, end:120, dur:0.22, gain:0.08, type:'triangle' },
      outside:{ start:600, end:220, dur:0.1, gain:0.07, type:'square' }
    };
    const opts = cfg[kind] || cfg.pistol;
    const nowT = ctx.currentTime;
    osc.type = opts.type;
    gain.gain.setValueAtTime(0.0001, nowT);
    gain.gain.linearRampToValueAtTime(opts.gain, nowT + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, nowT + opts.dur);
    osc.frequency.setValueAtTime(opts.start, nowT);
    osc.frequency.exponentialRampToValueAtTime(opts.end, nowT + opts.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(nowT);
    osc.stop(nowT + opts.dur + 0.06);
  }catch(e){}
}

function playServerExplosion(){
  boom();
  try{
    const ctx = getAC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const nowT = ctx.currentTime;
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.0001, nowT);
    gain.gain.linearRampToValueAtTime(0.14, nowT + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, nowT + 0.42);
    osc.frequency.setValueAtTime(260, nowT);
    osc.frequency.exponentialRampToValueAtTime(60, nowT + 0.36);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(nowT);
    osc.stop(nowT + 0.5);
  }catch(e){}
}

function playGoonDeath(){
  try{
    const ctx = getAC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const nowT = ctx.currentTime;
    const start = 240 + Math.random()*90;
    const end = 110 + Math.random()*40;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.0001, nowT);
    gain.gain.linearRampToValueAtTime(0.12, nowT + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, nowT + 0.34);
    osc.frequency.setValueAtTime(start, nowT);
    osc.frequency.exponentialRampToValueAtTime(end, nowT + 0.28);
    const rasp = ctx.createOscillator();
    const raspGain = ctx.createGain();
    rasp.type = 'square';
    rasp.frequency.setValueAtTime(start*0.5, nowT);
    raspGain.gain.setValueAtTime(0.0001, nowT);
    raspGain.gain.linearRampToValueAtTime(0.05, nowT + 0.02);
    raspGain.gain.exponentialRampToValueAtTime(0.0001, nowT + 0.22);
    osc.connect(gain);
    rasp.connect(raspGain);
    gain.connect(ctx.destination);
    raspGain.connect(ctx.destination);
    osc.start(nowT);
    osc.stop(nowT + 0.4);
    rasp.start(nowT);
    rasp.stop(nowT + 0.3);
  }catch(e){}
}

// ===== Board & CEO Codex =====
const PROFILE_DECK = [
  {
    floor: 4,  card:'Ace of Spades',  name:'Marla Quill',  title:'The Auditor',
    bio:'The tower’s numbers whisper her name; she can balance any debt ledger blindfolded. Beneath the calm veneer lies a black-suit reaper of accounts.',
    power:'Ledger Shield – Reflects bullets for 2 s / 6 s cooldown.',
    specials:['Tax Sweep (coin fan – $5 drain)','Overdraft Pop (grenade detonation)'],
    hp:69, portrait:'portraits/ace_spades.png',
    debtEffects:[
      { id:'HI',  radius:483, desc:'High Interest – The compounding monster. Your balance drains $1 per second; when you’re broke it starts eating your health instead.' },
      { id:'CAP', radius:483, desc:'Interest Capitalization – Interest grows the longer you linger. Each few seconds in range increases how fast High Interest drains your money.' },
      { id:'MIN', radius:414, desc:'Minimum Payment – You can only afford the bare minimum—fire rate slowed 20%.' }
    ]
  },
  {
    floor: 8,  card:'King of Clubs',  name:'Gideon Pike', title:'The Enforcer',
    bio:'A muscle in a suit. He treats risk like a contact sport.',
    power:'Credit Snare – Slow 40%.',
    specials:['Charge-Off Volley (3×10 dmg)','Margin Call (knockback)'],
    hp:81, portrait:'portraits/king_clubs.png',
    debtEffects:[
      { id:'WG', radius:437, desc:'Wage Garnish – Every hit costs an extra $5 from your account.' },
      { id:'RS', radius:368, desc:'Repayment Shock – A wave pulses from the floor, dealing 10 damage and sliding you.' }
    ]
  },
  {
    floor:12,  card:'Queen of Diamonds', name:'Selene Hart', title:'The Litigator',
    bio:'Glamorous and deadly, she signs settlements in blood-red ink. Her diamonds sparkle like legal daggers.',
    power:'Injunction Beam – 0.9 s stun (cancels Feather).',
    specials:['Discovery Drones (8 dmg)'],
    hp:92, portrait:'portraits/queen_diamonds.png',
    debtEffects:[
      { id:'HOLD', radius:414, desc:'Loan Servicer Hold – “Your call is very important to us…” Inputs stutter randomly for a moment.' },
      { id:'FP',   radius:391, desc:'Fine Print – Legalese catches you—grenade and saber specials disabled while in range.' }
    ]
  },
  {
    floor:16,  card:'Jack of Hearts', name:'Orson Vale', title:'The Engineer',
    bio:'Blue-collar romantic of corporate machinery. Fixes everything but his own conscience.',
    power:'Vacuum Dash – Invuln dash + suction wake.',
    specials:['Tool Rain (10 dmg)','Conveyor Shift (reversed friction)'],
    hp:104, portrait:'portraits/jack_hearts.png',
    debtEffects:[
      { id:'RS',  radius:368, desc:'Repayment Shock – A wave pulses from the floor, dealing 10 damage and sliding you.' },
      { id:'MIN', radius:414, desc:'Minimum Payment – Fire rate reduced by 20% while in range.' }
    ]
  },
  {
    floor:20,  card:'Ten of Spades', name:'Dara Flint', title:'The Marketer',
    bio:'Sells despair as self-care; debt as destiny. Every campaign ends with a signature and a smile.',
    power:'Hype Mirage – 2 clones.',
    specials:['Viral Spray (8×10 dmg)','Rebrand Flash (hue hide)'],
    hp:115, portrait:'portraits/ten_spades.png',
    debtEffects:[
      { id:'REPR', radius:437, desc:'Reprice – Random penalties like Minimum Payment or Wage Garnish flicker on for short bursts.' },
      { id:'DP',   radius:414, desc:'Delinquency Ping – Floating debt notices home in; contact drains $3 (or 1 HP if broke).' }
    ]
  },
  {
    floor:24,  card:'Nine of Clubs', name:'Ilya Crown', title:'The Coder',
    bio:'Wrote the algorithm that predicts failure before it happens. Now she’s debugging the world.',
    power:'Firewall Dome – Halves incoming bullet speed.',
    specials:['Packet Lance (15 dmg)','Patch Cycle (heal 5 hp/5 s)'],
    hp:127, portrait:'portraits/nine_clubs.png',
    debtEffects:[
      { id:'HI',    radius:460, desc:'High Interest – Your balance drains $1 per second; when broke it drains health instead.' },
      { id:'CLAMP', radius:414, desc:'Credit Clamp – Critical hits halved and weapon spread widened by 10%.' }
    ]
  },
  {
    floor:28,  card:'Eight of Diamonds', name:'Rhea Stone', title:'The HR Gardener',
    bio:'Cuts personnel like topiary; calls it “creative pruning.”',
    power:'Severance Wave – Ground shock 10 dmg.',
    specials:['Exit Interview (tether 1 s)','Paperstorm (20×5 dmg)'],
    hp:132, portrait:'portraits/eight_diamonds.png',
    debtEffects:[
      { id:'COLL', radius:483, desc:'Collections Call – Spotlights detect you twice as fast; on full alert, more guards spawn and the elevator relocks briefly.' },
      { id:'HOLD', radius:414, desc:'Loan Servicer Hold – Inputs stutter briefly at intervals.' }
    ]
  },
  {
    floor:32,  card:'Seven of Hearts', name:'Victor Kade', title:'The Strategist',
    bio:'Loves games with other people’s lives as chips. Plays every floor like poker night.',
    power:'Arb Slide – Rail dash + rapid fire.',
    specials:['Hedge Ring (orbit bullets)','Golden Parachute (heal 20 once @ 50% HP)'],
    hp:138, portrait:'portraits/seven_hearts.png',
    debtEffects:[
      { id:'WG',  radius:437, desc:'Wage Garnish – Each hit takes an extra $5.' },
      { id:'MIN', radius:414, desc:'Minimum Payment – Fire rate −20% while nearby.' },
      { id:'REPR',radius:437, desc:'Reprice – Randomly imposes Minimum Payment or Wage Garnish for short durations.' }
    ]
  }
];

const CEO_PROFILE = {
  floor:36, card:'Ace of Aces', name:'Helena Voss', title:'The CEO',
  bio:'The architect of the tower; believes gravity should accrue interest.',
  power:'Capital Storm – Cluster fire: inner 10 dmg / outer 20 dmg.',
  specials:['Buyback Shield (absorb 30 → 10×10 blast)','Hostile Takeover (3 board powers for 8 s)','Final Phase (ninja summons, faster patterns)'],
  hp:253, portrait:'portraits/ace_aces.png',
  debtEffects:[
    { id:'HI',   radius:552, desc:'High Interest – Drains $1 per second; if broke, drains health instead.' },
    { id:'CAP',  radius:552, desc:'Interest Capitalization – Staying close ramps the High Interest drain faster over time.' },
    { id:'COLL', radius:529, desc:'Collections Call – Detection accelerates, extra guards spawn, and the elevator relocks briefly.' },
    { id:'WG',   radius:483, desc:'Wage Garnish – Every hit costs an extra $5.' }
  ]
};

const PLAYER_PROFILE = {
  card:'Field Dossier',
  name:'Tower Operative',
  title:'Infiltration Specialist',
  bio:'Student debtor turned saboteur. Every sprint is paid for with borrowed time, restless nights, and a stubborn refusal to default.',
  power:'Multi-Tool Loadout – Swap between pistol, flamethrower, and baton to answer any threat.',
  hp:'Checking balance (functions as health)',
  specials:[
    'Sidearm: 9-round magazine, 10 damage per shot.',
    'Flamethrower: Cone stream with ember ticks that deal 6 damage.',
    'Shock Baton: 20 damage melee arc that pairs with stomp knockdowns.',
    'Feather Harness: Grants midair flaps when recovered from special pickups.'
  ],
  debtEffects:[
    { id:'CHK', desc:'Checking drains when hurt; at $0 the run immediately fails.' },
    { id:'SAV', desc:'Savings record your success and vanish at midnight if the tower stands.' }
  ],
  effectsLabel:'Field Notes'
};

const GUARD_PROFILES = [
  {
    card:'Guard: Pistol',
    name:'Security Officer',
    title:'Baseline Patrol',
    bio:'Standard corporate security assigned to roam the open-plan floors. Predictable routes, but relentless once they radio an alarm.',
    power:'Service Pistol – Fires 10 damage rounds roughly every 0.7 s once you cross their cone.',
    hp:20,
    specials:[
      'Detection Cone: raises the floor alarm and flags reinforcements.',
      'Contact Hit: 10 damage on collision if you stay grounded.'
    ],
    debtEffects:[
      { id:'ALERT', desc:'Feeds the Collections alert meter when line-of-sight is maintained.' }
    ],
    effectsLabel:'Intel'
  },
  {
    card:'Guard: Auto',
    name:'Suppressor',
    title:'Auto Rifle Specialist',
    bio:'Carries a modified carbine and sweeps hallways with suppressing fire to pin debtors in place.',
    power:'Auto Carbine – Streams bursts of bullets with slight spread when locked in.',
    hp:20,
    specials:[
      'Burst Fire: sustained volleys chew through broken cover.',
      'Alarm Booster: escalates reinforcement chances while alarms are active.'
    ],
    debtEffects:[
      { id:'SUP', desc:'Suppressive bursts push you out of cover and punish long standoffs.' }
    ],
    effectsLabel:'Intel'
  },
  {
    card:'Guard: Ninja',
    name:'Shadow Contractor',
    title:'Close Quarters',
    bio:'Black-suited specialists hired for silent takedowns. No firearms—only ruthless momentum.',
    power:'Shadow Dash – Closes gaps quickly, then slashes for heavy damage.',
    hp:30,
    specials:[
      'Acrobatic Pursuit: leaps between platforms without ladders.',
      'Blade Rush: combos stack 10 damage strikes if you stay on the floor.'
    ],
    debtEffects:[
      { id:'MELEE', desc:'Forces you airborne—staying grounded lets them chain contact damage.' }
    ],
    effectsLabel:'Intel'
  },
  {
    card:'Guard: Launcher',
    name:'Siege Specialist',
    title:'Explosive Ordnance',
    bio:'Lugs a slow-moving launcher that watches vault doors and server wings.',
    power:'Grenade Launcher – Fires rockets every 1.4 s that explode in a 60 px blast.',
    hp:40,
    specials:[
      'Splash Damage: rockets detonate even when they miss directly.',
      'Knockback: blasts shove you from ladders or ledges toward patrol routes.'
    ],
    debtEffects:[
      { id:'BLAST', desc:'Treat every rocket as 10 damage plus knockback even through partial cover.' }
    ],
    effectsLabel:'Intel'
  }
];

const VENT_BOSS_PROFILES = [
  {
    card:'Vault Boss: Auto',
    name:'Vault Enforcer',
    title:'Sub-Level Sentry',
    bio:'Guarding the server vault vents with belt-fed rifles and corporate zeal.',
    power:'Cycling Auto Turret – Marches forward while spraying suppressive fire.',
    hp:30,
    specials:[
      'Bullet Storm: repeated volleys saturate the cramped vent corridors.',
      'Support Calls: pairs with pistol guards who reinforce the vault.'
    ],
    debtEffects:[
      { id:'VENT', desc:'Defeating them opens safer routes through the vault network.' }
    ],
    effectsLabel:'Intel'
  },
  {
    card:'Vault Boss: Launcher',
    name:'Vault Artillery',
    title:'Explosive Overseer',
    bio:'Heavier ordnance reserved for sub-level breaches in the finance wing.',
    power:'Cluster Launcher – Arcing rockets with punishing splash damage.',
    hp:40,
    specials:[
      'Arcing Rockets: shots bounce around cover and explode on impact.',
      'Area Denial: blast radius makes safe footing scarce in the vents.'
    ],
    debtEffects:[
      { id:'BLAST', desc:'Staying mobile mid-air is the safest way to survive the blast radius.' }
    ],
    effectsLabel:'Intel'
  }
];

const CODEX_SECTIONS = [
  { title:'Main Player', entries:[PLAYER_PROFILE] },
  { title:'Tower Guards', entries:GUARD_PROFILES },
  { title:'Vent Bosses', entries:VENT_BOSS_PROFILES },
  { title:'Board Members', entries:PROFILE_DECK },
  { title:'CEO', entries:[CEO_PROFILE] }
];

const BOARD_DECK_PROFILES = [...PROFILE_DECK, CEO_PROFILE].sort((a,b)=>{
  const af = Number.isFinite(a.floor) ? a.floor : 0;
  const bf = Number.isFinite(b.floor) ? b.floor : 0;
  return af - bf;
});
const BOARD_DECK_MAP = new Map(BOARD_DECK_PROFILES.map(profile => [profile.floor, profile]));

const deckPortraitCache = new Map();

function hashSeed(str){
  let h = 2166136261 >>> 0;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeSeededRandom(seedStr){
  let state = hashSeed(seedStr || 'deck');
  return function(){
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    t ^= t >>> 14;
    return (t >>> 0) / 4294967296;
  };
}

function generateDeckPortrait(profile){
  const key = `${profile && (profile.card || profile.name || profile.floor) || 'board'}`;
  if(deckPortraitCache.has(key)) return deckPortraitCache.get(key);
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = makeSeededRandom(key);
  const palette = ['#0a1122','#192745','#2d4170','#4f6fa8','#7ea7ff','#f0f5ff'];
  const half = Math.ceil(size / 2);
  for(let y=0; y<size; y++){
    for(let x=0; x<half; x++){
      const color = palette[Math.floor(rand()*palette.length)];
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(size - 1 - x, y, 1, 1);
    }
  }
  const eyeY = 10 + Math.floor(rand()*6);
  const eyeX = 9 + Math.floor(rand()*5);
  ctx.fillStyle = '#f8fbff';
  ctx.fillRect(eyeX, eyeY, 2, 2);
  ctx.fillRect(size - eyeX - 2, eyeY, 2, 2);
  const browY = Math.max(eyeY - 3, 2);
  ctx.fillStyle = '#1c2236';
  ctx.fillRect(eyeX - 1, browY, 4, 1);
  ctx.fillRect(size - eyeX - 3, browY, 4, 1);
  const accentY = 14 + Math.floor(rand()*4);
  ctx.fillStyle = '#253356';
  ctx.fillRect(eyeX - 2, accentY, 4, 2);
  ctx.fillRect(size - eyeX - 2, accentY, 4, 2);
  const mouthY = 20 + Math.floor(rand()*4);
  const mouthWidth = 6 + Math.floor(rand()*3);
  ctx.fillStyle = '#ff8fb3';
  ctx.fillRect(Math.floor(size/2 - mouthWidth/2), mouthY, mouthWidth, 2);
  const collarY = 24 + Math.floor(rand()*4);
  ctx.fillStyle = '#1d2842';
  ctx.fillRect(size/2 - 6, collarY, 12, size - collarY);
  ctx.fillStyle = '#2a3b66';
  ctx.fillRect(size/2 - 2, collarY, 4, size - collarY);
  const dataUrl = canvas.toDataURL();
  deckPortraitCache.set(key, dataUrl);
  return dataUrl;
}

const EFFECTS = {
  NJ:   { name:'Night Job',            color:'#5F66FF', icon:'NJ', kind:'pulse',   tick_ms:6000, params:{sleep_ms:1000} },
  SJ:   { name:'Second Job',           color:'#8A9FBF', icon:'SJ', kind:'continuous', params:{move_mult:0.75, jump_mult:0.80} },
  HI:   { name:'High Interest',        color:'#B455FF', icon:'HI', kind:'drain',   tick_ms:250,  params:{dollars_per_sec:10.0} },
  WG:   { name:'Wage Garnish',         color:'#FF7A7A', icon:'WG', kind:'on_hit',  params:{extra_dollars:5} },
  COLL: { name:'Collections',          color:'#FFB84D', icon:'C',  kind:'alert',   tick_ms:300,  params:{mult:2.0, spawn_cd_ms:12000, lock_ms:5000} },
  FF:   { name:'Forbearance Freeze',   color:'#77E3FF', icon:'F',  kind:'feather', params:{block:true, accel_mult:2.0} },
  MIN:  { name:'Minimum Payment',      color:'#F7D154', icon:'M',  kind:'rate',    params:{firerate_mult:0.80} },
  HOLD: { name:'Loan Servicer Hold',   color:'#999999', icon:'H',  kind:'pulse',   tick_ms:7000, params:{stutter_ms:300} },
  CAP:  { name:'Interest Capitalization', color:'#A65CFF', icon:'CAP', kind:'stack', tick_ms:1000, params:{add_per_5s:0.2, max_add:1.0, decay_per_s:0.4} },
  FP:   { name:'Fine Print',           color:'#E53935', icon:'FP', kind:'lockout', params:{disable:['grenade','saber_special']} },
  RS:   { name:'Repayment Shock',      color:'#E59E5E', icon:'RS', kind:'shock',   tick_ms:4000, params:{dmg:10, radius:180, slide:0.8} },
  CLAMP:{ name:'Credit Clamp',         color:'#80CBC4', icon:'CL', kind:'aim',     params:{crit_mult:0.5, spread_add:0.10} },
  REPR: { name:'Reprice',              color:'#FFD1E0', icon:'R',  kind:'toggle',  tick_ms:10000, params:{pool:['MIN','WG'], dur_ms:5000} },
  DP:   { name:'Delinquency Ping',     color:'#C0F',    icon:'DP', kind:'minion',  tick_ms:5000, params:{loss:3, hp_fallback:1, speed:120} }
};

const BOSS_AURAS = {
  4:  [{id:'HI',radius:483},{id:'CAP',radius:483},{id:'MIN',radius:414}],
  8:  [{id:'WG',radius:437},{id:'RS',radius:368}],
  12: [{id:'HOLD',radius:414},{id:'FP',radius:391}],
  16: [{id:'RS',radius:368},{id:'MIN',radius:414}],
  20: [{id:'REPR',radius:437},{id:'DP',radius:414}],
  24: [{id:'HI',radius:460},{id:'CLAMP',radius:414}],
  28: [{id:'COLL',radius:483},{id:'HOLD',radius:414}],
  32: [{id:'WG',radius:437},{id:'MIN',radius:414},{id:'REPR',radius:437}],
  36: [{id:'HI',radius:552},{id:'CAP',radius:552},{id:'COLL',radius:529},{id:'WG',radius:483}]
};

// ===== Input fixes =====
const block = new Set([' ', 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','PageUp','PageDown']);
window.addEventListener('keydown',(e)=>{ if(block.has(e.key) || block.has(e.code)) e.preventDefault(); },{passive:false});
const canvas=document.getElementById('game'); const ctx=canvas.getContext('2d'); canvas.focus();
window.addEventListener('click', ()=>{ canvas.focus(); getAC(); });
function updateCanvasAimFromEvent(event){
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width ? canvas.width / rect.width : 1;
  const scaleY = rect.height ? canvas.height / rect.height : 1;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  if(outsideMode){
    outsideAim.x = Math.max(0, Math.min(W, x));
    outsideAim.y = Math.max(0, Math.min(H, y));
  } else if(arcadeRampage && arcadeRampage.active){
    clampArcadeAim(x, y);
  } else if(warzoneMissionState && warzoneMissionState.phase==='gun'){
    warzoneMissionState.aimX = clamp(x / W, 0, 1);
  }
}
canvas.addEventListener('mousemove', updateCanvasAimFromEvent);
canvas.addEventListener('mousedown', updateCanvasAimFromEvent);

// ===== Canvas & Timing =====
let last=performance.now();

// ===== Game State =====
let currentFloor=1;
let pause=true;
let testMode=false;
let loopStarted=false;
let runActive=false;
let currentPlayerName='Player';
let lastResult=null;
function makeRunStats(){ return { kills:0, deaths:0, refinances:0, start:0 }; }
let runStats = makeRunStats();
const codexState = { open:false };
let outsideMode = false;
let outsideKillCount = 0;
let outsideGuards = [];
let outsideWorkers = [];
let outsideWindowGuards = [];
let outsideCounterSnipers = [];
let outsideNextCounterSniperAt = 0;
let outsideScope = { x: W/2, y: H/2, radius: OUTSIDE_SCOPE_RADIUS };
let outsideAim = { x: W/2, y: H/2 };
let outsideLastShot = 0;
let outsideCrosshairFlashUntil = 0;
let outsideShotPulseUntil = 0;
let outsideSpawnTimer = 0;
const outsideOccupiedSlots = new Set();

// Camera
let camX=0, camY=0, seenDoor=false;

// Player
const player = {
  x:initialSpawnX, y: 0, w:GAME_PARAMS.player.width, h:GAME_PARAMS.player.height,
  vx:0, vy:0, onGround:false, facing:1, crouch:false, crouchOffset:0,
  sprint:false, climbing:false, inVent:false, hidden:false, spotted:false,
  checking:GAME_PARAMS.player.checkingStart, savings:GAME_PARAMS.player.savingsStart,
  loanBalance: RUN_LOAN_START,
  checkingMax: CHECKING_MAX,
  savingsMax: SAVINGS_MAX,
  hpMax: CHECKING_MAX,
  hasScrew:false, hasCharges:true,
  hasFeather:false, featherEnergy:0, featherMax:100, featherRecharge:12, lastFlap:10, flapCooldown:120,
  files:0, intel:0, specialFiles:0,
  codexUnlocked:false,
  weapon:'pistol',
  weaponsUnlocked:{ pistol:true, silenced:true, flame:true, melee:true, grenade:false, saber:false, machineGun:false },
  pistol:{ammo:GAME_PARAMS.player.pistol.magazine, reserve:GAME_PARAMS.player.pistol.reserve, cooldown:GAME_PARAMS.player.pistol.cooldownMs, last:0, muzzleUntil:0, mag:GAME_PARAMS.player.pistol.magazine},
  silenced:{ammo:GAME_PARAMS.player.pistol.magazine, cooldown:Math.round(GAME_PARAMS.player.pistol.cooldownMs*0.9), last:0, muzzleUntil:0, mag:GAME_PARAMS.player.pistol.magazine},
  flame:{cooldown:GAME_PARAMS.player.flame.cooldownMs, last:0, heat:0, maxHeat:FLAMETHROWER_MAX_HEAT_MS, lockedUntil:0, lastHeatTick:0, overheated:false, cooldownNoticeUntil:0, overheatNotifiedUntil:0},
  melee:{cooldown:GAME_PARAMS.player.meleeCooldownMs, last:0},
  grenade:{ammo:GRENADE_MAG_CAPACITY, reserve:GRENADE_RESERVE_MAX, cooldown:520, last:0, mag:GRENADE_MAG_CAPACITY, maxReserve:GRENADE_RESERVE_MAX},
  saber:{cooldown:Math.max(140, Math.round(GAME_PARAMS.player.meleeCooldownMs*0.75)), last:0},
  machineGun:{ammo:900, reserve:3600, cooldown:20, last:0, muzzleUntil:0, mag:900, maxReserve:3600},
  damageMultiplier:1,
  hurtUntil:0,
  speedBoostUntil:0,
  speedBoostAmount:0,
  screenFlashUntil:0,
  lawsuitSlowUntil:0,
  stealthGraceUntil:0,
  alarmLockUntil:0,
  cashMultiplier:1,
  interestRate:0,
  printerJams:0,
  prevBottom: GAME_PARAMS.player.height,
  prevVy: 0,
  dropThroughUntil: 0,
  dropThroughFloor: null,
  contactDamagePending:false,
  contactDamageApplyAt:0,
  contactInterferenceStart:0,
  contactInterferenceUntil:0,
  contactInterferencePhase:0,
  stepPhase:0,
  stepStride:0,
  hopeBuffUntil:0,
  punchAnimUntil:0,
  punchCombo:0,
  punchAnimSide:1
};

const HOSTAGE_SEQUENCE = ['Grandpa','Mom','Dad','Grandma','Brother','Sister',
  '1st Cousin','2nd Cousin','3rd Cousin','4th Cousin','5th Cousin','6th Cousin'];

const hostageState = {
  taken: [],
  rescued: [],
  lost: [],
  nextIndex: 0
};

const ECO_BOSS_FLOOR = 30;
let ecoBossActive = false;
let ecoBoss = null;
let ecoProjectiles = [];
let hostagesInRoom = [];
let finalHostages = [];
let hellscapeState = null;
let collectionsPressure = 1;
let ceoQTEAttempted = false;

const state = {
  ceoPassive: false,
  playerWeaponsDisabled: false,
  midnightRage: false,
  midnightRageSince: 0,
  midnightRageUntil: 0,
  midnightRageTriggered: false,
  midnightMachineGunLocked: false,
  midnightDebtLastApplied: 0
};

const CEO_ARENA_WAVES = [
  { id:'guards', label:'Wave 1 — Upgraded Guards', type:'heavy', count:15, hpMult:1.35, speedMult:1.1, damageMult:1.1, spawnInterval:0.45 },
  { id:'ninjas', label:'Wave 2 — Elite Ninjas', type:'ninja', count:10, hpMult:1.3, speedMult:1.25, damageMult:1.15, spawnInterval:0.5 },
  { id:'soldiers', label:'Wave 3 — US Soldiers', type:'soldier', count:20, hpMult:1.2, speedMult:1.05, damageMult:1.2, spawnInterval:0.35 },
  { id:'ceo', label:'Wave 4 — CEO Showdown', boss:true, spawnDelay:1.4 }
];

const ceoArenaState = {
  bounds:null,
  triggerX:0,
  spawnPoint:null,
  triggered:false,
  active:false,
  spawning:false,
  waveIndex:-1,
  currentWave:null,
  currentBoss:null,
  pendingSpawns:0,
  spawnTimer:0,
  betweenWaves:false,
  nextWaveAt:0,
  completed:false,
  ceoActive:false,
  lockAnnounced:false,
  introShown:false,
  shockwaves:[],
  lastSupplyWave:-1,
  initialSupplyDelivered:false
};

let topDownState = null;
let ventDungeonState = null;
let droneMissionState = null;
let rooftopMissionState = null;
let warzoneMissionState = null;

// Time helpers (driven by GAME_PARAMS.timing)
let startClock = 0;
function timeLeftMs(){
  if(!runActive || !startClock) return TOTAL_TIME_MS;
  return Math.max(0, TOTAL_TIME_MS - (performance.now() - startClock));
}
function fmtClock(ms){
  const clamped = Math.max(0, Math.min(TOTAL_TIME_MS, ms));
  const frac = 1 - (clamped / TOTAL_TIME_MS);
  const minutesFromStart = Math.floor(frac * RUN_DURATION_HOURS * 60);
  let hour = RUN_START_HOUR + Math.floor(minutesFromStart/60);
  let mins = minutesFromStart % 60;
  while (hour >= 24) hour -= 24;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  let dispH = hour % 12; if (dispH === 0) dispH = 12;
  return `${dispH}:${mins.toString().padStart(2,'0')} ${ampm}`;
}

// Level arrays
let walls=[], floorSlab=null, windowsArr=[], ladders=[], vents=[], servers=[], panels=[], cameras=[], guards=[], desks=[], plants=[], waterCoolers=[], spotlights=[], door=null, pickups=[], movingPlatforms=[], workers=[], arcadeStations=[];
let coffeeMachines=[], vendingMachines=[], printers=[], serverTerminals=[], deskDrawers=[], hazards=[], stealthZones=[], backgroundFX=[], floatingPapers=[], billboardScreens=[], boardTables=[], merchants=[], sprinklers=[], boardMembers=[];
let destroyedOnFloor=0, totalServersOnFloor=0;
let alarm=false, alarmUntil=0;
let inSub=false; // vent sub-level
let sub = null;
let entryVentWorld = null;
let lightingCondition='normal', lightingPulse=0, lightingPhase=0;
let floorTheme=null, boardRoomActive=false, ninjaRound=false, serverObjective=false, inflationActive=false, bonusFloorActive=false;
let boardMemberDefeated=false;
let arcadeBeatdownActive=false, arcadePixelOverlay=false, arcadeRampage=null;
let arcadeAim={x:W/2,y:H*0.55};
let evacuationActive=false, evacuationUntil=0, powerSurgeUntil=0, sprinklersActiveUntil=0;
let spotlightDetection=0, elevatorLockedUntil=0;
let interestDrainTimer=0;
let scheduledBonusFloor=null;
let blackMarketOffer=null;
let activeHack=null;
let ambientInterval=null, ambientCurrent=null;
let managerCheckFloor=null, managerDefeated=false;
let minimapUnlocked=false, minimapVisible=false;
let deckVisible=false;
let vendingMenuVisible=false;
let activeVendingMachine=null;
let vendingMenuWasPaused=false;
const unlockedDeckFloors = new Set();
let floorBannerTimeout=null;
const FEATHER_RESPAWN_DELAY_MS = 1500;
let featherRespawnPickup=null;
let featherRespawnLocation=null;
let featherRespawnAt=0;

function setFeatherRespawnSource(source){
  if(source && typeof source.x === 'number' && typeof source.y === 'number'){
    if(source.type !== undefined){
      featherRespawnPickup = source;
    } else {
      featherRespawnPickup = null;
    }
    featherRespawnLocation = { x: source.x, y: source.y };
  } else if(player){
    const span = levelWidth();
    const x = clamp(player.x + player.w/2 - 10, 40, span - 40);
    const y = player.y - 24;
    featherRespawnPickup = null;
    featherRespawnLocation = { x, y };
  } else {
    featherRespawnPickup = null;
    featherRespawnLocation = null;
  }
}

function clampArcadeAim(x, y){
  const minX = W * 0.08;
  const maxX = W * 0.92;
  const minY = H * 0.2;
  const maxY = H * 0.88;
  arcadeAim.x = clamp(x, minX, maxX);
  arcadeAim.y = clamp(y, minY, maxY);
}

function placeFloorFeather(layerYs, yBase){
  const candidates = [];
  candidates.push({y:yBase, type:'base'});
  if(layerYs && layerYs.length>0){ candidates.push({y:layerYs[0], type:'platform'}); }
  if(layerYs && layerYs.length>1){ candidates.push({y:layerYs[1], type:'platform'}); }
  const choice = candidates[Math.floor(Math.random()*candidates.length)];
  const targetY = choice.type==='base' ? yBase : choice.y;
  let targetX = 1.5*W - 20;
  if(choice.type==='platform'){
    const platform = walls.find(w=>w.isPlatform && Math.abs((w.y||0) - targetY) < 1);
    if(platform){ targetX = platform.x + platform.w/2 - 10; }
  }
  targetX = clamp(targetX, 60, levelWidth() - 80);
  const pickup = {type:'feather', x:targetX, y:targetY-24, w:20, h:20};
  pickups.push(pickup);
  setFeatherRespawnSource(pickup);
}

function clearFeather(reason){
  if(!player || !player.hasFeather) return false;
  player.hasFeather = false;
  player.featherEnergy = 0;
  player.lastFlap = now();
  if(featherTimerEl) featherTimerEl.textContent = 'Feather —';
  if(featherPill) featherPill.textContent = 'Feather: —';
  if(reason==='damage'){
    centerNote('Feather lost!', 1100);
    notify('A hit knocked away your feather.');
  } else if(reason==='elevator'){
    notify('Feather winds fade between floors.');
  }
  if(reason==='damage' && (featherRespawnPickup || featherRespawnLocation) && !featherRespawnAt){
    featherRespawnAt = now() + FEATHER_RESPAWN_DELAY_MS;
  }
  return true;
}

function markServerDestroyed(server, { reward=0, message=null }={}){
  if(!server || server.destroyed) return false;
  server.destroyed = true;
  playServerExplosion();
  if(Number.isFinite(reward) && reward !== 0){
    addChecking(reward);
    if(message){ notify(message); }
  } else if(message){
    notify(message);
  }
  return true;
}

function desiredMusicMode(){
  if(warzoneMissionState) return 'warzone';
  if(inSub) return 'vent';
  if(boardRoomActive) return 'boss';
  return 'level';
}

function updateMusicForState(){
  const desired = desiredMusicMode();
  startMusic(desired);
}

// Projectiles
const bullets=[];

// Smoke overlay
let smokeActive=false, smokeT=0;

// HUD helpers
const noteEl = document.getElementById('note');
const timeEl = document.getElementById('time');
const serversEl = document.getElementById('servers');
const alarmsEl = document.getElementById('alarms');
const invEl = document.getElementById('inv');
const filesPill = document.getElementById('filesPill');
const intelPill = document.getElementById('intelPill');
const featherPill = document.getElementById('featherPill');
const specialFilesPill = document.getElementById('specialFilesPill');
const codexPanel = document.getElementById('codexPanel');
const codexGrid = document.getElementById('codexGrid');
const codexProgress = document.getElementById('codexProgress');
const codexCloseBtn = document.getElementById('codexClose');
const killStatsEl = document.getElementById('killStats');
const deathStatsEl = document.getElementById('deathStats');
const refinanceStatsEl = document.getElementById('refinanceStats');
const collectionsStatEl = document.getElementById('collectionsStat');
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const savingsFill = document.getElementById('savingsFill');
const savingsText = document.getElementById('savingsText');
const loanFill = document.getElementById('loanFill');
const loanText = document.getElementById('loanText');
const hostageInfo = document.getElementById('hostageInfo');
const weaponNameEl = document.getElementById('weaponName');
const weaponAmmoEl = document.getElementById('weaponAmmo');
const featherTimerEl = document.getElementById('featherTimer');
const floorLabelEl = document.getElementById('floorLabel');
const miniBossEl = document.getElementById('miniBossCount');
const mapBtn = document.getElementById('mapBtn');
const minimapOverlay = document.getElementById('minimapOverlay');
const minimapTower = document.getElementById('minimapTower');
const deckBtn = document.getElementById('deckBtn');
const deckOverlay = document.getElementById('deckOverlay');
const deckGrid = document.getElementById('deckGrid');
const deckProgress = document.getElementById('deckProgress');
const vendingOverlay = document.getElementById('vendingOverlay');
const vendingPanel = vendingOverlay ? vendingOverlay.querySelector('.vending-panel') : null;
const vendingTitle = document.getElementById('vendingTitle');
const vendingSubtitle = document.getElementById('vendingSubtitle');
const vendingGrid = document.getElementById('vendingGrid');
const vendingHint = document.getElementById('vendingHint');
const floorBannerEl = document.getElementById('floorBanner');
const floorBannerText = document.getElementById('floorBannerText');
const minimapPanel = minimapOverlay ? minimapOverlay.querySelector('.minimap') : null;
const minimapCells = [];
const MINIMAP_MISSIONS = [
  { id:'badDeal', label:'A BAD DEAL', subtitle:'Ground mission' },
  { id:'itsOnlyMoney', label:'ITS ONLY MONEY', subtitle:'Warzone' },
  { id:'bombardier10', label:'BOMBING DRILL – LEVEL 10', subtitle:'Mansions practice' },
  { id:'bombardier35', label:'BOMBING DRILL – LEVEL 35', subtitle:'Mega-yachts practice' }
];
const minimapMissionButtons = new Map();
hudBoxEl = document.getElementById('hudBox');
hudToggleBtn = document.getElementById('hudToggle');
musicToggleBtn = document.getElementById('musicToggle');

// Buttons
const btnTest=document.getElementById('btnTest');
const btnNormal=document.getElementById('btnNormal');
const btnP=document.getElementById('btnPistol');
const btnSilenced=document.getElementById('btnSilenced');
const btnF=document.getElementById('btnFlame');
const btnM=document.getElementById('btnMelee');
const btnGrenade=document.getElementById('btnGrenade');
const btnSaber=document.getElementById('btnSaber');
const btnMachine=document.getElementById('btnMachine');
const rageModal=document.getElementById('rageModal');
const rageContinue=document.getElementById('rageContinue');
const rageMessage=document.getElementById('rageMessage');
const weaponButtons = {
  pistol: btnP,
  silenced: btnSilenced,
  flame: btnF,
  melee: btnM,
  grenade: btnGrenade,
  saber: btnSaber,
  machineGun: btnMachine
};
const weaponRequirements = {
  grenade: { type:'intel', amount:20, label:'Intel 20' },
  saber: { type:'files', amount:25, label:'Files 25' },
  machineGun: { type:'intel', amount:40, label:'Intel 40' }
};

function setMode(m){
  testMode = (m==='test');
  btnTest.classList.toggle('active', testMode);
  btnNormal.classList.toggle('active', !testMode);
  notify(testMode? "TEST mode: revive on death." : "NORMAL mode: restart on death.");
  updateMapButtonState();
}
btnTest.onclick=()=>setMode('test');
btnNormal.onclick=()=>setMode('normal');
function weaponIsUnlocked(w){
  return !!(player.weaponsUnlocked && player.weaponsUnlocked[w]);
}
function updateWeaponButtons(){
  for(const [weapon, btn] of Object.entries(weaponButtons)){
    if(!btn) continue;
    const unlocked = weaponIsUnlocked(weapon);
    btn.classList.toggle('locked', !unlocked);
    if(unlocked){
      btn.removeAttribute('data-lock');
    } else {
      if(weapon === 'machineGun' && state.midnightMachineGunLocked){
        btn.setAttribute('data-lock', 'Seized after midnight');
      } else {
        const req = weaponRequirements[weapon];
        if(req){
          const current = req.type==='intel' ? player.intel : req.type==='files' ? player.files : 0;
          const remaining = Math.max(0, req.amount - current);
          const label = remaining>0 ? `${req.label} (${remaining})` : req.label;
          btn.setAttribute('data-lock', label);
        }
      }
    }
    btn.classList.toggle('active', player.weapon===weapon);
  }
}
function unlockWeapon(weapon, reason){
  if(weapon === 'machineGun' && state.midnightMachineGunLocked){
    return;
  }
  if(!player.weaponsUnlocked) player.weaponsUnlocked={};
  if(player.weaponsUnlocked[weapon]) return;
  player.weaponsUnlocked[weapon]=true;
  updateWeaponButtons();
  evaluateWeaponUnlocks();
  if(reason){
    notify(`${reason} unlocked.`);
    centerNote(`${reason} ready!`, 1400);
  }
}
function evaluateWeaponUnlocks(){
  if(player.intel>=20) unlockWeapon('grenade','Grenade launcher');
  if(player.files>=25) unlockWeapon('saber','Saber');
  if(player.intel>=40) unlockWeapon('machineGun','Machine gun');
  updateWeaponButtons();
}

function unlockAllWeapons(){
  if(!player.weaponsUnlocked) player.weaponsUnlocked = {};
  const knownWeapons = new Set([
    ...Object.keys(weaponButtons || {}),
    ...Object.keys(player.weaponsUnlocked)
  ]);
  let unlockedAny = false;
  for(const weapon of knownWeapons){
    if(!player.weaponsUnlocked[weapon]){
      player.weaponsUnlocked[weapon] = true;
      unlockedAny = true;
    }
  }
  updateWeaponButtons();
  evaluateWeaponUnlocks();
  return unlockedAny;
}
function showRageModal(message){
  if(rageMessage && message){ rageMessage.textContent = message; }
  if(rageModal){
    rageModal.classList.remove('hidden');
  }
  pause = true;
}
function hideRageModal(){
  if(rageModal){
    rageModal.classList.add('hidden');
  }
  if(runActive){
    pause = false;
    canvas.focus();
  }
}
function activateMidnightRage(){
  if(state.midnightRage) return;
  state.midnightRage = true;
  state.midnightRageTriggered = true;
  const triggeredAt = now();
  state.midnightRageSince = triggeredAt;
  state.midnightRageUntil = triggeredAt + 10 * 60 * 1000;
  state.midnightMachineGunLocked = false;
  state.midnightDebtLastApplied = triggeredAt;
  player.savings = 0;
  notify('Savings drained at midnight.');
  centerNote('Midnight rage awakened!', 1800);
  const boostedLoan = clampLoanBalance(player.loanBalance * 1000);
  player.loanBalance = boostedLoan;
  player.damageMultiplier = 1.5;
  unlockWeapon('machineGun');
  evaluateWeaponUnlocks();
  player.machineGun.ammo = Math.max(player.machineGun.ammo, player.machineGun.mag || player.machineGun.ammo);
  player.machineGun.reserve = Math.max(player.machineGun.reserve, (player.machineGun.mag || 90) * 4);
  setWeapon('machineGun');
  showRageModal('Savings wiped at midnight. Loan balance inflated and rage boosts your damage by 50%. Machine gun only.');
}

function concludeMidnightRage(){
  if(!state.midnightRage) return;
  state.midnightRage = false;
  state.midnightRageSince = 0;
  state.midnightRageUntil = 0;
  state.midnightMachineGunLocked = true;
  player.damageMultiplier = 1;
  if(player.weaponsUnlocked){
    player.weaponsUnlocked.machineGun = false;
  }
  updateWeaponButtons();
  if(player.weapon === 'machineGun'){
    setWeapon('pistol');
  }
  notify('Midnight rage faded. Machine gun seized for safety.');
  centerNote('Midnight rage subsided — arsenal unlocked.', 2000);
}

function applyMidnightDebtGrowth(nowMs){
  if(!state.midnightRageTriggered) return;
  const interval = 60 * 1000;
  const lastApplied = state.midnightDebtLastApplied || state.midnightRageSince || nowMs;
  if(nowMs <= lastApplied) return;
  const elapsed = nowMs - lastApplied;
  if(elapsed < interval) return;
  const increments = Math.floor(elapsed / interval);
  state.midnightDebtLastApplied = lastApplied + increments * interval;
  if(player.loanBalance > 0 && increments > 0){
    const previousBalance = player.loanBalance;
    const factor = Math.pow(1.01, increments);
    player.loanBalance = clampLoanBalance(Math.ceil(previousBalance * factor));
    const percentLabel = increments === 1 ? '1%' : `${increments}%`;
    notify(`Midnight penalty: loan balance grew by ${percentLabel}.`);
    updateHudCommon();
  }
}
function reloadWeapon(){
  if(player.weapon==='pistol' || player.weapon==='silenced'){
    const stats = player.weapon==='pistol' ? player.pistol : player.silenced;
    const mag = stats.mag || player.pistol.mag || GAME_PARAMS.player.pistol.magazine;
    const need = mag - stats.ammo;
    if(need<=0) return false;
    const take = Math.min(need, player.pistol.reserve);
    if(take<=0) return false;
    stats.ammo += take;
    player.pistol.reserve -= take;
    beep({freq:420});
    return true;
  }
  if(player.weapon==='machineGun'){
    const stats = player.machineGun;
    const mag = stats.mag || 90;
    const need = mag - stats.ammo;
    if(need<=0) return false;
    const take = Math.min(need, stats.reserve||0);
    if(take<=0) return false;
    stats.ammo += take;
    stats.reserve -= take;
    beep({freq:360});
    return true;
  }
  if(player.weapon==='grenade'){
    const stats = player.grenade;
    const mag = stats.mag || GRENADE_MAG_CAPACITY;
    if(stats.ammo >= mag) return false;
    const reserve = stats.reserve || 0;
    if(reserve<=0) return false;
    const need = mag - stats.ammo;
    const take = Math.min(need, reserve);
    stats.ammo += take;
    stats.reserve -= take;
    beep({freq:300});
    return true;
  }
  return false;
}
function detonateGrenade(grenade){
  if(!grenade || grenade.detonated) return;
  grenade.detonated = true;
  const blast = {x:grenade.x-50, y:grenade.y-40, w:100, h:100};
  const dmg = scaledPlayerDamage(GRENADE_BASE_DAMAGE);
  if(!inSub){
    for(const guard of guards){
      if(!guard || guard.hp<=0) continue;
      const box={x:guard.x,y:guard.y,w:guard.w,h:guard.h};
      if(rect2(blast.x,blast.y,blast.w,blast.h,box)){
        const fell = applyGuardDamage(guard, dmg);
        if(fell){ guard.hp=0; }
        guard.hitFlashUntil = now()+200;
      }
    }
    for(const worker of workers){
      if(!worker || !worker.alive) continue;
      const box={x:worker.x,y:worker.y,w:worker.w,h:worker.h};
      if(rect2(blast.x,blast.y,blast.w,blast.h,box)){
        damageWorker(worker, dmg);
      }
    }
    if(ecoBossActive && ecoBoss && ecoBoss.hp>0){
      const bossBox={x:ecoBoss.x,y:ecoBoss.y,w:ecoBoss.w,h:ecoBoss.h};
      if(rect2(blast.x,blast.y,blast.w,blast.h,bossBox)){
        ecoBoss.hp = Math.max(0, ecoBoss.hp - Math.round(dmg*0.8));
        ecoBoss.hitFlashUntil = now()+220;
      }
    }
  } else if(sub){
    for(const guard of sub.guards){
      if(!guard || guard.hp<=0) continue;
      const box={x:guard.x,y:guard.y,w:guard.w,h:guard.h};
      if(rect2(blast.x,blast.y,blast.w,blast.h,box)){
        const fell = applyGuardDamage(guard, dmg);
        if(fell){ guard.hp=0; }
        guard.hitFlashUntil = now()+200;
      }
    }
    for(const boss of sub.bosses){
      if(!boss || boss.hp<=0) continue;
      const box={x:boss.x,y:boss.y,w:boss.w,h:boss.h};
      if(rect2(blast.x,blast.y,blast.w,blast.h,box)){
        boss.hp = Math.max(0, boss.hp - dmg);
        boss.hitFlashUntil = now()+200;
      }
    }
  }
  boom();
  grenade.life = 0;
}
function setWeapon(w){
  if(ninjaRound && w!=='melee'){
    centerNote('Investor ninjas demand melee only.', 1400);
    notify('Melee-only round active.');
    return;
  }
  if(state.midnightRage && w!=='machineGun'){
    centerNote('Midnight rage demands the machine gun.', 1400);
    notify('Rage keeps you locked to the machine gun.');
    return;
  }
  if(state.midnightMachineGunLocked && w==='machineGun'){
    centerNote('Machine gun seized after midnight.', 1600);
    notify('Machine gun access revoked.');
    return;
  }
  if(!weaponIsUnlocked(w)){
    const req = weaponRequirements[w];
    const msg = req ? `${req.label} required.` : 'Weapon locked.';
    centerNote(msg, 1400);
    notify('Weapon not yet unlocked.');
    return;
  }
  player.weapon=w;
  updateWeaponButtons();
  let freq=520;
  if(w==='pistol' || w==='silenced') freq=600;
  else if(w==='flame') freq=500;
  else if(w==='melee' || w==='saber') freq=440;
  else if(w==='grenade') freq=420;
  else if(w==='machineGun') freq=660;
  beep({freq,dur:0.06});
}
btnP.onclick=()=>setWeapon('pistol');
btnSilenced.onclick=()=>setWeapon('silenced');
btnF.onclick=()=>setWeapon('flame');
btnM.onclick=()=>setWeapon('melee');
btnGrenade.onclick=()=>setWeapon('grenade');
btnSaber.onclick=()=>setWeapon('saber');
btnMachine.onclick=()=>setWeapon('machineGun');
if(rageContinue){ rageContinue.onclick=()=>hideRageModal(); }

const boardFloorOrder = [...BOARD_FLOORS].sort((a,b)=>a-b);

function boardRoomLetter(floor){
  const idx = boardFloorOrder.indexOf(floor);
  return idx >= 0 ? String.fromCharCode('A'.charCodeAt(0) + idx) : '';
}

function formatFloorLabel(floor){
  if(!Number.isFinite(floor)) return 'LEVEL —';
  if(floor === OUTSIDE_FLOOR) return 'MISSION – A BAD DEAL (GROUND INFILTRATION)';
  if(floor === FLOORS) return `LEVEL ${floor} – CEO PENTHOUSE`;
  if(isBoardFloor(floor)){
    const letter = boardRoomLetter(floor);
    return `LEVEL ${floor} – BOARD ROOM ${letter || ''}`.trim();
  }
  return `LEVEL ${floor}`;
}

function formatFloorSecondaryLabel(floor){
  if(floor === OUTSIDE_FLOOR) return 'ABD';
  if(floor === FLOORS) return 'PH';
  if(isBoardFloor(floor)){
    const letter = boardRoomLetter(floor);
    return letter ? `BR ${letter}` : 'BOARD';
  }
  return `F${String(floor).padStart(2,'0')}`;
}

if(minimapTower){
  for(let f=FLOORS; f>=1; f--){
    const cell=document.createElement('button');
    cell.type='button';
    cell.className='minimap-cell';
    cell.dataset.floor=String(f);
    cell.innerHTML = `<span>${formatFloorLabel(f)}</span><span>${formatFloorSecondaryLabel(f)}</span>`;
    minimapTower.appendChild(cell);
    minimapCells.push(cell);
  }
}

if(minimapPanel){
  const missionSection = document.createElement('div');
  missionSection.className = 'minimap-missions';
  const heading = document.createElement('h4');
  heading.textContent = 'MISSIONS';
  missionSection.appendChild(heading);
  for(const mission of MINIMAP_MISSIONS){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'minimap-cell mission';
    btn.dataset.mission = mission.id;
    const subtitle = mission.subtitle ? `<span>${mission.subtitle}</span>` : '<span></span>';
    btn.innerHTML = `<span>${mission.label}</span>${subtitle}`;
    btn.addEventListener('click', ()=>{
      if(!testMode || !runActive){
        centerNote('Test mode required to warp to missions.', 1200);
        lockedBuzz();
        return;
      }
      const changed = startMinimapMission(mission.id);
      if(changed){
        toggleMinimap(false);
      }
    });
    missionSection.appendChild(btn);
    minimapMissionButtons.set(mission.id, btn);
  }
  minimapPanel.appendChild(missionSection);
}

if(mapBtn){
  mapBtn.addEventListener('click', ()=>{
    if(minimapVisible){ toggleMinimap(false); return; }
    if(!canAccessMinimap()){
      centerNote('Clear a vent to access the map.', 1400);
      lockedBuzz();
      return;
    }
    toggleMinimap(true);
  });
}

if(deckBtn){
  deckBtn.addEventListener('click', ()=>{
    if(deckVisible){ toggleDeck(false); }
    else { toggleDeck(true); }
  });
}

if(deckOverlay){
  deckOverlay.addEventListener('click', (event)=>{
    if(event.target === deckOverlay){ toggleDeck(false); }
  });
  const panel = deckOverlay.querySelector('.deck-panel');
  if(panel){ panel.addEventListener('click', (event)=>event.stopPropagation()); }
}

if(minimapOverlay){
  minimapOverlay.addEventListener('click', (event)=>{
    if(event.target === minimapOverlay){ toggleMinimap(false); }
  });
  const inner = minimapOverlay.querySelector('.minimap');
  if(inner){ inner.addEventListener('click', (event)=>event.stopPropagation()); }
}

if(vendingOverlay){
  vendingOverlay.addEventListener('click', (event)=>{
    if(event.target === vendingOverlay){ closeVendingMenu(); }
  });
}
if(vendingPanel){
  vendingPanel.addEventListener('click', (event)=>event.stopPropagation());
}

if(minimapTower){
  minimapTower.addEventListener('click', (event)=>{
    const cell = event.target.closest('.minimap-cell');
    if(!cell) return;
    const floor = Number(cell.dataset.floor);
    if(!Number.isFinite(floor)) return;
    if(testMode && runActive){
      const changed = jumpToFloor(floor);
      if(changed){
        toggleMinimap(false);
      } else {
        centerNote(formatFloorLabel(floor), 1100);
      }
    } else {
      centerNote(formatFloorLabel(floor), 1100);
    }
  });
}

updateMapButtonState();
resetDeckState();
toggleMinimap(false);
hideFloorBanner();

if(hudBoxEl){
  setHudCompactState(hudCompact);
}
if(hudToggleBtn){
  hudToggleBtn.addEventListener('click', ()=>toggleHudCompact());
  updateHudToggleButton();
}
if(musicToggleBtn){
  musicToggleBtn.addEventListener('click', ()=>toggleMusicMuted());
  updateMusicToggleButton();
}

if(specialFilesPill){
  specialFilesPill.addEventListener('click', ()=>{
    if(!player.codexUnlocked){
      notify('Collect 10 Special Files to unlock the tower dossiers.');
      return;
    }
    toggleCodex();
  });
}
if(codexCloseBtn){
  codexCloseBtn.addEventListener('click', ()=>toggleCodex(false));
}
document.addEventListener('keydown', (event)=>{
  if(event.key === '9'){
    if(!player.codexUnlocked){
      notify('Collect 10 Special Files to unlock the codex.');
      return;
    }
    toggleCodex();
  }
  if(event.key === 'Escape' && codexState.open){
    toggleCodex(false);
  }
});

// Helpers
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const now=()=>performance.now();
function rect(a,b){ return !(a.x+a.w<b.x || a.x>b.x+b.w || a.y+a.h<b.y || a.y>b.y+b.h); }
function rect2(x,y,w,h,b){ return !(x+w<b.x || x>b.x+b.w || y+h<b.y || y>b.y+b.h); }
const fmtCurrency = (value)=>Math.round(Math.max(0, Math.abs(value))).toLocaleString();
function shuffleArray(array, rng=Math.random){
  for(let i=array.length-1; i>0; i--){
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
function centerNote(text,ms=1600){ const m=document.getElementById('msg'); m.textContent=text; m.style.display='block'; setTimeout(()=>m.style.display='none',ms); }
function notify(text){ noteEl.textContent = text; }

const ui = {
  confirm: (msg) => window.confirm(msg),
  toast: (msg) => notify(msg),
  banner: (msg, duration=4000) => centerNote(msg, duration)
};

const unlockedAchievements = new Set();
function unlockAchievement(id, title, description){
  if(!id || unlockedAchievements.has(id)) return;
  unlockedAchievements.add(id);
  const detail = description ? `${title}: ${description}` : title;
  notify(`Achievement unlocked — ${detail}`);
  centerNote(`Achievement Unlocked: ${title}`, 1800);
  chime();
}

const audio = {
  play(id){
    if(id==='hallelujah'){
      beep({freq:620,dur:0.3});
      setTimeout(()=>beep({freq:740,dur:0.3}), 180);
      setTimeout(()=>beep({freq:880,dur:0.45}), 360);
    }
  }
};

const qte = {
  run({rounds=5, required=4, windowMs=900}={}){
    if(typeof window.prompt !== 'function') return false;
    let success = 0;
    const pool = 'asdfqwe';
    for(let i=0;i<rounds;i++){
      let seq='';
      const length = 3;
      for(let j=0;j<length;j++){
        seq += pool[Math.floor(Math.random()*pool.length)];
      }
      const start = performance.now();
      const input = window.prompt(`Refinance QTE (${i+1}/${rounds}): Type "${seq.toUpperCase()}" within ${(windowMs/1000).toFixed(1)}s`);
      if(typeof input !== 'string') continue;
      const elapsed = performance.now() - start;
      if(elapsed <= windowMs && input.trim().toLowerCase() === seq){
        success++;
      }
    }
    return success >= required;
  }
};

function jitterPrice(base, variance=0){
  const rounded = Math.round(base || 0);
  if(!variance) return Math.max(1, rounded);
  const delta = Math.round((Math.random()*2 - 1) * variance);
  return Math.max(1, rounded + delta);
}

function createAdvancedVendingInventory(){
  const items = [];
  items.push({
    id:'ammo',
    name:'Ammo Pack',
    description:'10 pistol rounds paid in health.',
    cost:{ type:'checking', amount:jitterPrice(10, 2) },
    sold:false
  });
  items.push({
    id:'speed',
    name:'Debt Sprint',
    description:'25% speed boost for 45 seconds.',
    cost:{ type:'debt', amount:jitterPrice(100000, 12000) },
    sold:false
  });
  items.push({
    id:'maxhp',
    name:'Health Extension',
    description:'Raise health cap to 300.',
    cost:{ type:'debt', amount:jitterPrice(1000000, 60000) },
    sold:false
  });
  items.push({
    id:'launcher',
    name:'Rocket Launcher',
    description:'Trade printer jams for heavy firepower.',
    cost:{ type:'jams', amount:10 },
    sold:false
  });
  items.push({
    id:'intel',
    name:'Intel Swap',
    description:'Convert files into intel.',
    cost:{ type:'files', amount:2 },
    sold:false
  });
  items.push({
    id:'file',
    name:'File Swap',
    description:'Convert intel into files.',
    cost:{ type:'intel', amount:2 },
    sold:false
  });
  items.push({
    id:'secret',
    name:'Secret File',
    description:'Exchange 5 files for a secret dossier.',
    cost:{ type:'files', amount:5 },
    sold:false
  });
  items.push({
    id:'mystery',
    name:'Mystery Capsule',
    description:'Random corporate perk. No refunds.',
    cost:{ type:'debt', amount:jitterPrice(75000, 15000) },
    sold:false
  });
  items.push({
    id:'leave',
    name:'Step Away',
    description:'Close the vending interface.',
    type:'close',
    sold:false
  });
  return items;
}

function createVendingMachine(x, y, w, h, floor){
  const machine = { x, y, w, h, broken:false, floor, menu:null, depleted:false };
  if(ADVANCED_VENDING_FLOORS.has(floor)){
    machine.menu = { items: createAdvancedVendingInventory() };
    machine.depleted = vendingMachineSoldOut(machine);
  }
  return machine;
}

function vendingMachineSoldOut(machine){
  if(!machine || !machine.menu) return false;
  return machine.menu.items.filter(item => item.type !== 'close').every(item => item.sold);
}

function formatVendingCost(cost){
  if(!cost) return '';
  if(cost.type === 'checking') return `${cost.amount} health`;
  if(cost.type === 'debt') return `+$${fmtCurrency(cost.amount)} debt`;
  if(cost.type === 'files') return `${cost.amount} files`;
  if(cost.type === 'intel') return `${cost.amount} intel`;
  if(cost.type === 'jams') return `${cost.amount} printer jams`;
  return '';
}

function canAffordVending(cost){
  if(!cost) return { ok:true };
  switch(cost.type){
    case 'checking':
      return player.checking > cost.amount ? { ok:true } : { ok:false, message:'Not enough health to spend.' };
    case 'debt': {
      const projected = player.loanBalance + cost.amount;
      const clamped = clampLoanBalance(projected);
      return clamped === projected ? { ok:true } : { ok:false, message:'Debt ceiling reached.' };
    }
    case 'files':
      return player.files >= cost.amount ? { ok:true } : { ok:false, message:'Need more files.' };
    case 'intel':
      return player.intel >= cost.amount ? { ok:true } : { ok:false, message:'Need more intel.' };
    case 'jams':
      return (player.printerJams || 0) >= cost.amount ? { ok:true } : { ok:false, message:'Insufficient printer jams.' };
    default:
      return { ok:false };
  }
}

function applyVendingCost(cost){
  if(!cost) return;
  switch(cost.type){
    case 'checking':
      player.checking = Math.max(0, player.checking - cost.amount);
      break;
    case 'debt':
      player.loanBalance = clampLoanBalance(player.loanBalance + cost.amount);
      break;
    case 'files':
      player.files = Math.max(0, player.files - cost.amount);
      break;
    case 'intel':
      player.intel = Math.max(0, player.intel - cost.amount);
      break;
    case 'jams':
      player.printerJams = Math.max(0, (player.printerJams||0) - cost.amount);
      break;
  }
}

function handleVendingReward(item){
  switch(item.id){
    case 'ammo':
      addAmmo(10);
      centerNote('Ammo +10 (health spent)', 1500);
      notify('Vending machine dispensed ammo.');
      break;
    case 'speed':
      applySpeedBoost(0.25, 45000);
      centerNote('Speed boost +25%', 1600);
      notify('Debt-fueled sprint engaged.');
      break;
    case 'maxhp':
      player.checkingMax = Math.max(player.checkingMax || CHECKING_MAX, 300);
      player.hpMax = player.checkingMax;
      player.checking = Math.min(player.checking, player.checkingMax);
      centerNote('Health bar extended to 300.', 1700);
      notify('Corporate insurance upgraded your health.');
      break;
    case 'launcher': {
      const wasUnlocked = player.weaponsUnlocked && player.weaponsUnlocked.grenade;
      unlockWeapon('grenade', 'Grenade launcher');
      player.grenade.reserve = Math.min(player.grenade.maxReserve || GRENADE_RESERVE_MAX, (player.grenade.reserve||0) + 4);
      centerNote(wasUnlocked ? 'Rocket ammo secured.' : 'Rocket launcher unlocked!', 1700);
      notify('Rocket launcher stocked via vending machine.');
      break;
    }
    case 'intel':
      player.intel += 1;
      evaluateWeaponUnlocks();
      centerNote('Intel +1', 1500);
      notify('Converted files into intel.');
      break;
    case 'file':
      player.files += 1;
      centerNote('Files +1', 1500);
      notify('Converted intel into files.');
      break;
    case 'secret':
      player.specialFiles = (player.specialFiles || 0) + 1;
      updateSpecialFileUI();
      centerNote('Secret file acquired!', 1600);
      notify('Shadow dossier secured.');
      break;
    case 'mystery': {
      const rewards = [
        ()=>{ addAmmo(18); centerNote('Mystery reward: ammo cache', 1500); notify('Mystery capsule spilled ammo.'); },
        ()=>{ addChecking(40); centerNote('Mystery reward: health +40', 1500); notify('Mystery capsule restored health.'); },
        ()=>{ applyLoanPayment(5000); centerNote('Mystery reward: debt -$5,000', 1500); notify('Mystery capsule eased your loan.'); },
        ()=>{ player.intel += 2; evaluateWeaponUnlocks(); centerNote('Mystery reward: intel +2', 1500); notify('Mystery capsule delivered intel.'); },
        ()=>{ player.files += 3; centerNote('Mystery reward: files +3', 1500); notify('Mystery capsule supplied files.'); },
        ()=>{ applySpeedBoost(0.18, 35000); centerNote('Mystery reward: speed rush', 1500); notify('Mystery capsule juiced your sprint.'); },
        ()=>{ player.specialFiles = (player.specialFiles || 0) + 1; updateSpecialFileUI(); centerNote('Mystery reward: secret file', 1600); notify('Mystery capsule hid a secret file.'); }
      ];
      const pick = rewards[Math.floor(Math.random()*rewards.length)];
      pick();
      break;
    }
    default:
      break;
  }
}

function openVendingMenu(machine){
  if(!machine || !machine.menu || !vendingOverlay) return;
  activeVendingMachine = machine;
  vendingMenuVisible = true;
  vendingMenuWasPaused = pause;
  pause = true;
  vendingOverlay.classList.remove('hidden');
  renderVendingMenu();
}

function closeVendingMenu(options={}){
  if(!vendingMenuVisible) return;
  vendingOverlay && vendingOverlay.classList.add('hidden');
  vendingMenuVisible = false;
  activeVendingMachine = null;
  if(!options.keepPaused){
    pause = vendingMenuWasPaused;
    if(!pause && runActive){ canvas.focus(); }
  }
  vendingMenuWasPaused = false;
}

function renderVendingMenu(){
  if(!vendingMenuVisible || !activeVendingMachine || !vendingGrid) return;
  const machine = activeVendingMachine;
  if(vendingTitle) vendingTitle.textContent = 'Executive Vending Machine';
  const soldOut = vendingMachineSoldOut(machine);
  if(vendingSubtitle){
    vendingSubtitle.textContent = soldOut ? 'Sold out — corporate greed wins again.' : 'Select an upgrade. Purchases are final.';
  }
  vendingGrid.textContent = '';
  for(const item of machine.menu.items){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vending-item';
    if(item.sold) button.classList.add('sold');
    const affordability = item.type === 'close' ? { ok:true } : canAffordVending(item.cost);
    if(!item.sold && item.type !== 'close' && !affordability.ok){
      button.classList.add('disabled');
    }
    const label = document.createElement('strong');
    label.textContent = item.name;
    button.appendChild(label);
    if(item.description){
      const desc = document.createElement('span');
      desc.textContent = item.description;
      button.appendChild(desc);
    }
    if(item.type !== 'close'){
      const costEl = document.createElement('small');
      costEl.textContent = item.sold ? 'Sold out' : formatVendingCost(item.cost);
      button.appendChild(costEl);
    }
    button.addEventListener('click', ()=>attemptVendingPurchase(machine, item));
    vendingGrid.appendChild(button);
  }
  if(vendingHint){
    vendingHint.textContent = 'Press ESC to cancel';
  }
}

function attemptVendingPurchase(machine, item){
  if(!machine || !item) return;
  if(item.type === 'close'){
    closeVendingMenu();
    return;
  }
  if(item.sold){
    lockedBuzz();
    notify('That item is already sold out.');
    return;
  }
  const affordability = canAffordVending(item.cost);
  if(!affordability.ok){
    lockedBuzz();
    if(affordability.message){
      centerNote(affordability.message, 1400);
    }
    return;
  }
  applyVendingCost(item.cost);
  handleVendingReward(item);
  item.sold = true;
  machine.depleted = vendingMachineSoldOut(machine);
  chime();
  updateHudCommon();
  renderVendingMenu();
}

function hideFloorBanner(){
  if(!floorBannerEl) return;
  floorBannerEl.classList.remove('visible');
  floorBannerEl.classList.add('hidden');
  if(floorBannerTimeout){
    clearTimeout(floorBannerTimeout);
    floorBannerTimeout=null;
  }
}

function showFloorBanner(floor){
  if(!floorBannerEl || !floorBannerText) return;
  floorBannerText.textContent = formatFloorLabel(floor);
  floorBannerEl.classList.remove('hidden');
  requestAnimationFrame(()=>floorBannerEl.classList.add('visible'));
  if(floorBannerTimeout){ clearTimeout(floorBannerTimeout); }
  floorBannerTimeout = setTimeout(()=>{
    floorBannerEl.classList.remove('visible');
    floorBannerTimeout = setTimeout(()=>{ floorBannerEl.classList.add('hidden'); floorBannerTimeout=null; }, 260);
  }, 2200);
}

function canAccessMinimap(){
  return minimapUnlocked || (testMode && runActive);
}

function updateMapButtonState(){
  if(!mapBtn) return;
  const accessible = canAccessMinimap();
  mapBtn.classList.toggle('locked', !accessible);
  mapBtn.disabled = !accessible;
  if(!accessible){ mapBtn.classList.remove('active'); }
}

function updateMinimapHighlight(){
  if(minimapCells.length===0) return;
  for(const cell of minimapCells){
    const floor = Number(cell.dataset.floor);
    cell.classList.toggle('active', floor === currentFloor);
  }
  for(const [missionId, btn] of minimapMissionButtons.entries()){
    const active = (missionId === 'badDeal' && outsideMode) || (missionId === 'itsOnlyMoney' && !!warzoneMissionState);
    btn.classList.toggle('active', active);
  }
}

function toggleMinimap(force){
  if(!minimapOverlay) return;
  const target = force !== undefined ? force : !minimapVisible;
  if(target && !canAccessMinimap()){
    centerNote('Clear a vent to access the map.', 1400);
    lockedBuzz();
    return;
  }
  minimapVisible = target;
  if(target){
    minimapOverlay.classList.remove('hidden');
    updateMinimapHighlight();
  } else {
    minimapOverlay.classList.add('hidden');
  }
  if(mapBtn){ mapBtn.classList.toggle('active', target); }
}

function updateMusicToggleButton(){
  if(!musicToggleBtn) return;
  musicToggleBtn.textContent = musicMuted ? 'Unmute Music' : 'Mute Music';
  musicToggleBtn.setAttribute('aria-pressed', musicMuted ? 'true' : 'false');
  musicToggleBtn.classList.toggle('muted', musicMuted);
  const label = musicMuted ? 'Unmute music' : 'Mute music';
  musicToggleBtn.setAttribute('aria-label', label);
  musicToggleBtn.title = label;
}

function setMusicMuted(muted){
  musicMuted = !!muted;
  updateMusicToggleButton();
  try { localStorage.setItem(MUSIC_MUTE_KEY, musicMuted ? '1' : '0'); } catch (e) {}
  if(musicMuted){
    stopMusic();
  } else if(runActive && musicState.requested){
    startMusic(musicState.requested);
  }
}

function toggleMusicMuted(){
  setMusicMuted(!musicMuted);
}

function updateHudToggleButton(){
  if(!hudToggleBtn) return;
  const label = hudCompact ? 'Expand HUD (K)' : 'Compact HUD (K)';
  hudToggleBtn.setAttribute('aria-expanded', (!hudCompact).toString());
  hudToggleBtn.setAttribute('aria-label', label);
  hudToggleBtn.title = label;
}

function setHudCompactState(compact){
  hudCompact = !!compact;
  if(hudBoxEl){
    hudBoxEl.classList.toggle('compact', hudCompact);
  }
  updateHudToggleButton();
  try { localStorage.setItem(HUD_COMPACT_KEY, hudCompact ? '1' : '0'); } catch (e) {}
}

function toggleHudCompact(force){
  const target = force !== undefined ? !!force : !hudCompact;
  setHudCompactState(target);
}

function jumpToFloor(targetFloor){
  if(!runActive) return false;
  if(!Number.isFinite(targetFloor)) return false;
  const floor = Math.min(Math.max(1, Math.round(targetFloor)), FLOORS);
  return enterFloor(floor, { viaTest:true });
}

function startMinimapMission(id){
  if(id === 'badDeal'){
    return warpToBadDealMission();
  }
  if(id === 'itsOnlyMoney'){
    return warpToItsOnlyMoneyMission();
  }
  if(id === 'bombardier10'){
    return warpToDroneBombingPractice(10);
  }
  if(id === 'bombardier35'){
    return warpToDroneBombingPractice(35);
  }
  return false;
}

function warpToBadDealMission(){
  if(!runActive) return false;
  rooftopMissionState = null;
  warzoneMissionState = null;
  topDownState = null;
  ventDungeonState = null;
  outsideMode = false;
  currentFloor = OUTSIDE_FLOOR;
  camX = 0;
  camY = 0;
  player.x = initialSpawnX;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  initOutsideRound();
  notify('Test warp ➜ MISSION – A BAD DEAL.');
  updateMinimapHighlight();
  return true;
}

function warpToItsOnlyMoneyMission(){
  if(!runActive) return false;
  outsideMode = false;
  topDownState = null;
  ventDungeonState = null;
  rooftopMissionState = null;
  warzoneMissionState = null;
  droneMissionState = null;
  camX = 0;
  camY = 0;
  guards.length = 0;
  player.x = initialSpawnX;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  startWarzoneMission();
  notify('Test warp ➜ ITS ONLY MONEY.');
  updateMinimapHighlight();
  return true;
}

function warpToDroneBombingPractice(floor){
  if(!runActive) return false;
  const config = DRONE_MISSION_CONFIG[floor];
  if(!config) return false;
  outsideMode = false;
  topDownState = null;
  ventDungeonState = null;
  rooftopMissionState = null;
  warzoneMissionState = null;
  droneMissionState = null;
  camX = 0;
  camY = 0;
  guards.length = 0;
  player.x = initialSpawnX;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  startDroneMissionLevel(floor);
  if(!droneMissionState) return false;
  droneMissionState.practice = true;
  droneMissionState.hackWins = droneMissionState.config.hackWinsRequired || 3;
  droneMissionState.hackProgress = 1;
  droneMissionState.pendingDrone = false;
  droneMissionState.pendingDroneDelay = 0;
  initializeDronePhase(droneMissionState);
  if(droneMissionState.phase === 'drone'){
    droneMissionState.hackMessage = 'Practice bombing run initialized.';
  }
  notify(`Test warp ➜ BOMBING PRACTICE – ${config.name}.`);
  centerNote(`Practice Bombing Run – Level ${floor}`, 2000);
  updateMinimapHighlight();
  return true;
}

function updateDeckProgress(){
  if(deckProgress){
    deckProgress.textContent = `Unlocked ${unlockedDeckFloors.size}/${BOARD_DECK_PROFILES.length}`;
  }
}

function updateDeckButton(){
  if(!deckBtn) return;
  deckBtn.textContent = `Board Deck (P) ${unlockedDeckFloors.size}/${BOARD_DECK_PROFILES.length}`;
}

function renderDeck(){
  if(!deckGrid) return;
  updateDeckProgress();
  deckGrid.textContent = '';
  for(const profile of BOARD_DECK_PROFILES){
    const unlocked = unlockedDeckFloors.has(profile.floor);
    const cardEl = document.createElement('div');
    cardEl.className = `deck-card ${unlocked ? 'unlocked' : 'locked'}`;
    const portrait = document.createElement('div');
    portrait.className = 'deck-portrait';
    if(unlocked){
      const portraitTexture = generateDeckPortrait(profile);
      if(portraitTexture){
        portrait.style.backgroundImage = `url(${portraitTexture})`;
      }
    }
    cardEl.appendChild(portrait);
    const info = document.createElement('div');
    info.className = 'deck-info';
    const title = document.createElement('div');
    title.className = 'deck-title';
    title.textContent = unlocked ? `${profile.card} — ${profile.name}` : '???';
    info.appendChild(title);
    const subtitle = document.createElement('div');
    subtitle.className = 'deck-subtitle';
    const floorLabel = Number.isFinite(profile.floor) ? formatFloorLabel(profile.floor) : '';
    if(unlocked){
      const parts = [];
      if(floorLabel) parts.push(floorLabel);
      if(profile.title) parts.push(profile.title);
      if(Number.isFinite(profile.hp)) parts.push(`HP ${profile.hp}`);
      subtitle.textContent = parts.join(' • ');
    } else {
      subtitle.textContent = floorLabel ? `${floorLabel} — Intel Locked` : 'Eliminate to reveal dossier';
    }
    info.appendChild(subtitle);
    if(unlocked){
      if(profile.bio){
        const bio = document.createElement('div');
        bio.className = 'deck-bio';
        bio.textContent = profile.bio;
        info.appendChild(bio);
      }
      if(profile.power){
        const power = document.createElement('div');
        power.className = 'deck-power';
        const strong = document.createElement('strong');
        strong.textContent = 'Power:';
        power.appendChild(strong);
        power.appendChild(document.createTextNode(` ${profile.power}`));
        info.appendChild(power);
      }
      if(Array.isArray(profile.specials) && profile.specials.length){
        const specialsLabel = document.createElement('div');
        specialsLabel.className = 'deck-effects';
        specialsLabel.textContent = 'Special Abilities:';
        info.appendChild(specialsLabel);
        const specialsList = document.createElement('ul');
        specialsList.className = 'deck-list';
        for(const spec of profile.specials){
          const li = document.createElement('li');
          li.textContent = spec;
          specialsList.appendChild(li);
        }
        info.appendChild(specialsList);
      }
      if(Array.isArray(profile.debtEffects) && profile.debtEffects.length){
        const effectsLabel = document.createElement('div');
        effectsLabel.className = 'deck-effects';
        effectsLabel.textContent = `${profile.effectsLabel || 'Debt Effects'}:`;
        info.appendChild(effectsLabel);
        const effectsList = document.createElement('ul');
        effectsList.className = 'deck-list';
        for(const eff of profile.debtEffects){
          if(!eff) continue;
          const li = document.createElement('li');
          const prefix = eff.id ? `${eff.id}: ` : '';
          li.textContent = `${prefix}${eff.desc || ''}`.trim();
          effectsList.appendChild(li);
        }
        info.appendChild(effectsList);
      }
    } else {
      const teaser = document.createElement('div');
      teaser.className = 'deck-bio';
      teaser.textContent = 'Defeat this board member to reveal their dossier.';
      info.appendChild(teaser);
    }
    cardEl.appendChild(info);
    deckGrid.appendChild(cardEl);
  }
}

function toggleDeck(force){
  if(!deckOverlay) return;
  const target = force !== undefined ? force : !deckVisible;
  if(target && minimapVisible){ toggleMinimap(false); }
  deckVisible = target;
  if(target){
    deckOverlay.classList.remove('hidden');
    renderDeck();
  } else {
    deckOverlay.classList.add('hidden');
  }
  if(deckBtn){ deckBtn.classList.toggle('active', target); }
}

function unlockDeckCardForFloor(floor){
  const profile = BOARD_DECK_MAP.get(floor);
  if(!profile) return;
  if(unlockedDeckFloors.has(profile.floor)) return;
  unlockedDeckFloors.add(profile.floor);
  updateDeckButton();
  updateDeckProgress();
  renderDeck();
  chime();
  const nameLine = profile.name ? `${profile.card} – ${profile.name}` : profile.card;
  notify(`${nameLine} dossier unlocked.`);
  centerNote(`${profile.card} dossier unlocked!`, 1500);
}

function resetDeckState(){
  unlockedDeckFloors.clear();
  deckVisible=false;
  if(deckOverlay){ deckOverlay.classList.add('hidden'); }
  if(deckBtn){ deckBtn.classList.remove('active'); }
  updateDeckButton();
  updateDeckProgress();
  renderDeck();
}

function unlockMinimap(){
  if(minimapUnlocked) return;
  minimapUnlocked = true;
  updateMapButtonState();
  centerNote('Minimap unlocked!', 1600);
  notify('Skyscraper schematics recovered. Map access granted.');
}

function checkVentForMinimapUnlock(){
  if(minimapUnlocked || !inSub || !sub) return;
  const guardsAlive = (sub.guards||[]).some(g=>g && g.hp>0);
  const bossesAlive = (sub.bosses||[]).some(b=>b && b.hp>0);
  if(!guardsAlive && !bossesAlive){ unlockMinimap(); }
}

function specialFilesRequired(){ return 10; }

function updateSpecialFileUI(){
  if(!specialFilesPill) return;
  const required = specialFilesRequired();
  const current = player.specialFiles || 0;
  specialFilesPill.textContent = `Special Files: ${current}/${required}`;
  const unlocked = current >= required;
  player.codexUnlocked = unlocked;
  specialFilesPill.classList.toggle('locked', !unlocked);
  if(unlocked){
    specialFilesPill.title = 'Press 9 to view tower dossiers';
  } else {
    specialFilesPill.title = 'Collect more violet files to unlock dossiers';
  }
  if(codexProgress){
    codexProgress.textContent = `Special Files: ${current}/${required}`;
  }
  if(codexState.open){
    renderCodex();
  }
}

function renderCodex(){
  if(!codexGrid) return;
  const required = specialFilesRequired();
  const unlocked = (player.specialFiles||0) >= required;
  codexGrid.textContent = '';
  CODEX_SECTIONS.forEach((section) => {
    if(!section || !section.entries || section.entries.length===0) return;
    const heading = document.createElement('div');
    heading.className = 'codex-heading';
    heading.textContent = section.title;
    codexGrid.appendChild(heading);
    section.entries.forEach((profile) => {
      const card = document.createElement('div');
      card.className = 'codex-card';
      if(!unlocked){
        card.classList.add('locked');
        card.innerHTML = `
          <h3>${profile.card}</h3>
          <div class="title">CONFIDENTIAL</div>
          <div class="bio">Access denied. Collect more Special Files.</div>
        `;
      } else {
        const name = profile.name || profile.card;
        const subtitle = profile.title ? `${name} — ${profile.title}` : name;
        const powerLine = profile.power ? `<div><strong>Power:</strong> ${profile.power}</div>` : '';
        const hpLine = profile.hp !== undefined ? `<div><strong>HP:</strong> ${profile.hp}</div>` : '';
        const specialsList = Array.isArray(profile.specials) && profile.specials.length
          ? `<div><strong>Specials:</strong></div><ul>${profile.specials.map((sp) => `<li>${sp}</li>`).join('')}</ul>`
          : '';
        const effectsList = Array.isArray(profile.debtEffects) && profile.debtEffects.length
          ? `<div class="effects"><strong>${profile.effectsLabel || 'Debt Effects'}:</strong></div><ul>${profile.debtEffects.map((eff) => `<li><strong>${eff.id}</strong>: ${eff.desc}</li>`).join('')}</ul>`
          : '';
        const bio = profile.bio ? `<div class="bio">${profile.bio}</div>` : '';
        card.innerHTML = `
          <h3>${profile.card}</h3>
          <div class="title">${subtitle}</div>
          ${bio}
          ${powerLine}
          ${hpLine}
          ${specialsList}
          ${effectsList}
        `;
      }
      codexGrid.appendChild(card);
    });
  });
}

function toggleCodex(force){
  if(!codexPanel) return;
  const show = force!==undefined ? force : codexPanel.classList.contains('hidden');
  if(show){
    renderCodex();
    codexPanel.classList.remove('hidden');
  } else {
    codexPanel.classList.add('hidden');
  }
  codexState.open = show;
}

function resetPlayerState(){
  player.x=initialSpawnX; player.y=0; player.vx=0; player.vy=0;
  player.onGround=false; player.facing=1; player.crouch=false; player.crouchOffset=0;
  player.sprint=false; player.climbing=false; player.hidden=false; player.spotted=false;
  player.inVent=false;
  player.checkingMax = CHECKING_MAX;
  player.savingsMax = SAVINGS_MAX;
  player.hpMax = CHECKING_MAX;
  player.loanBalance = RUN_LOAN_START;
  player.checking=GAME_PARAMS.player.checkingStart;
  player.savings=Math.min(player.savingsMax, GAME_PARAMS.player.savingsStart);
  player.hasScrew=false; player.hasCharges=true;
  player.hasFeather=false; player.featherEnergy=0; player.featherMax=100; player.featherRecharge=12; player.lastFlap=0; player.flapCooldown=120;
  featherRespawnPickup=null; featherRespawnLocation=null; featherRespawnAt=0;
  player.files=0; player.intel=0; player.specialFiles=0; player.codexUnlocked=false; player.weapon='pistol';
  player.weaponsUnlocked = { pistol:true, silenced:true, flame:true, melee:true, grenade:false, saber:false, machineGun:false };
  player.pistol.mag=GAME_PARAMS.player.pistol.magazine;
  player.pistol.ammo=GAME_PARAMS.player.pistol.magazine;
  player.pistol.reserve=GAME_PARAMS.player.pistol.reserve;
  player.pistol.cooldown=GAME_PARAMS.player.pistol.cooldownMs;
  player.pistol.last=0; player.pistol.muzzleUntil=0;
  player.silenced.mag=GAME_PARAMS.player.pistol.magazine;
  player.silenced.ammo=GAME_PARAMS.player.pistol.magazine;
  player.silenced.cooldown=Math.round(GAME_PARAMS.player.pistol.cooldownMs*0.9);
  player.silenced.last=0; player.silenced.muzzleUntil=0;
  player.flame.cooldown=GAME_PARAMS.player.flame.cooldownMs;
  player.flame.last=0;
  player.flame.heat=0;
  player.flame.maxHeat=FLAMETHROWER_MAX_HEAT_MS;
  player.flame.lockedUntil=0;
  player.flame.lastHeatTick=0;
  player.flame.overheated=false;
  player.flame.cooldownNoticeUntil=0;
  player.flame.overheatNotifiedUntil=0;
  player.melee.cooldown=GAME_PARAMS.player.meleeCooldownMs;
  player.melee.last=0;
  player.grenade.mag=GRENADE_MAG_CAPACITY;
  player.grenade.maxReserve=GRENADE_RESERVE_MAX;
  player.grenade.ammo=GRENADE_MAG_CAPACITY;
  player.grenade.reserve=GRENADE_RESERVE_MAX;
  player.grenade.last=0;
  player.grenade.cooldown=520;
  player.saber.cooldown=Math.max(140, Math.round(GAME_PARAMS.player.meleeCooldownMs*0.75));
  player.saber.last=0;
  player.machineGun.mag=900;
  player.machineGun.maxReserve=3600;
  player.machineGun.ammo=900;
  player.machineGun.reserve=3600;
  player.machineGun.cooldown=20;
  player.machineGun.last=0;
  player.machineGun.muzzleUntil=0;
  player.damageMultiplier=1;
  player.hurtUntil=0;
  player.speedBoostUntil=0;
  player.speedBoostAmount=0;
  player.hopeBuffUntil=0;
  player.screenFlashUntil=0;
  player.lawsuitSlowUntil=0;
  player.stealthGraceUntil=0;
  player.alarmLockUntil=0;
  player.cashMultiplier=1;
  player.interestRate=0;
  player.printerJams=0;
  player.score=0;
  player.weaponUpgrades=0;
  player.hacking=false;
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  player.dropThroughUntil = 0;
  player.dropThroughFloor = null;
  player.contactDamagePending = false;
  player.contactDamageApplyAt = 0;
  player.contactInterferenceStart = 0;
  player.contactInterferenceUntil = 0;
  player.contactInterferencePhase = 0;
  player.stepPhase = 0;
  player.stepStride = 0;
  updateSpecialFileUI();
  state.midnightRage = false;
  state.midnightRageTriggered = false;
  state.midnightRageSince = 0;
  state.midnightRageUntil = 0;
  state.midnightMachineGunLocked = false;
  state.midnightDebtLastApplied = 0;
}

function scaledPlayerDamage(base){
  const mult = player && Number.isFinite(player.damageMultiplier) ? player.damageMultiplier : 1;
  return Math.max(1, Math.round(base * mult));
}

function resetHostageState(){
  hostageState.taken.length = 0;
  hostageState.rescued.length = 0;
  hostageState.lost.length = 0;
  hostageState.nextIndex = 0;
  updateHostageHud();
}

function ordinalSuffix(n){
  const mod100 = n % 100;
  if(mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch(n % 10){
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function nextHostageName(){
  const idx = hostageState.nextIndex;
  hostageState.nextIndex++;
  if(idx < HOSTAGE_SEQUENCE.length){
    return HOSTAGE_SEQUENCE[idx];
  }
  const extra = idx - HOSTAGE_SEQUENCE.length + 1;
  return `${ordinalSuffix(extra)} Cousin`;
}

function getActiveHostages(){
  return hostageState.taken.filter((name)=>{
    return !hostageState.lost.includes(name) && !hostageState.rescued.includes(name);
  });
}

function updateHostageHud(){
  if(!hostageInfo) return;
  const activeNames = getActiveHostages();
  const active = activeNames.length;
  const rescued = hostageState.rescued.length;
  const lost = hostageState.lost.length;
  hostageInfo.textContent = `Hostages: ${active}`;
  const sections = [];
  if(active){ sections.push(`Captured: ${activeNames.join(', ')}`); }
  if(rescued){ sections.push(`Rescued: ${hostageState.rescued.join(', ')}`); }
  if(lost){ sections.push(`Lost: ${hostageState.lost.join(', ')}`); }
  hostageInfo.title = sections.length ? sections.join('\n') : 'No hostages captured.';
}

function ensureLoop(){ if(!loopStarted){ loopStarted=true; requestAnimationFrame(loop); } }

function updateHudForOutside(){
  if(timeEl) timeEl.textContent = `${fmtClock(timeLeftMs())} ➜ ${fmtClock(0)}`;
  if(serversEl) serversEl.textContent = 'Servers: —';
  if(alarmsEl) alarmsEl.textContent = 'Alarms: —';
  if(invEl) invEl.textContent = 'Inv: —';
  const hpRatio = Math.min(1, Math.max(0, player.checking / (player.checkingMax || CHECKING_MAX)));
  if(hpFill) hpFill.style.width = `${hpRatio*100}%`;
  if(hpText) hpText.textContent = Math.max(0, Math.round(player.checking));
  if(savingsFill){
    const savingsRatio = Math.min(1, Math.max(0, player.savings / (player.savingsMax || SAVINGS_MAX)));
    savingsFill.style.width = `${savingsRatio*100}%`;
  }
  if(savingsText) savingsText.textContent = `$${fmtCurrency(player.savings)}`;
  if(loanFill){
    const debt = player.loanBalance;
    const progress = RUN_LOAN_START>0 ? Math.min(1, Math.max(0, 1 - Math.max(0, debt) / RUN_LOAN_START)) : 1;
    loanFill.style.width = `${progress*100}%`;
  }
  if(loanText){
    const debt = player.loanBalance;
    loanText.textContent = debt > 0
      ? `-$${fmtCurrency(debt)}`
      : debt < 0
        ? `+$${fmtCurrency(Math.abs(debt))}`
        : '$0';
  }
  if(weaponNameEl) weaponNameEl.textContent = 'Sniper Rifle';
  if(weaponAmmoEl) weaponAmmoEl.textContent = 'Ammo ∞';
  if(miniBossEl) miniBossEl.textContent = 'Mini-Bosses: 0';
  if(filesPill) filesPill.textContent = `Files: ${player.files}`;
  if(intelPill) intelPill.textContent = `Intel: ${player.intel}`;
  if(featherPill) featherPill.textContent = 'Feather: —';
  if(featherTimerEl) featherTimerEl.textContent = 'Feather —';
}

function spawnOutsideGuard(){
  const available = OUTSIDE_GUARD_SLOTS.filter(slot => !outsideOccupiedSlots.has(slot.id));
  if(available.length===0) return;
  const slot = available[Math.floor(Math.random()*available.length)];
  outsideOccupiedSlots.add(slot.id);
  const width = 24;
  const height = 42;
  outsideGuards.push({
    slot: slot.id,
    baseX: slot.x,
    baseY: slot.y,
    renderX: slot.x,
    renderY: slot.y,
    width,
    height,
    swing: slot.swing ?? 18,
    bob: slot.bob ?? 6,
    phase: Math.random()*Math.PI*2,
    speed: 0.8 + Math.random()*0.9,
    dead: false,
    removeAt: 0,
    hitUntil: 0
  });
}

function initOutsideWorkers(){
  outsideWorkers.length = 0;
  const workerWidth = 18;
  const walkwayMin = Math.max(60, OUTSIDE_BUILDING.x - 160);
  const walkwayMax = Math.min(W - 60, OUTSIDE_BUILDING.x + OUTSIDE_BUILDING.width + 160) - workerWidth;
  const range = Math.max(0, walkwayMax - walkwayMin);
  const step = OUTSIDE_WORKER_COUNT>1 ? range / (OUTSIDE_WORKER_COUNT - 1) : 0;
  for(let i=0; i<OUTSIDE_WORKER_COUNT; i++){
    const base = walkwayMin + step * i;
    const jitter = (Math.random() - 0.5) * 16;
    const x = Math.max(walkwayMin, Math.min(walkwayMax, base + jitter));
    const appearance = createWorkerAppearance();
    const showTie = !!appearance.tie && Math.random()<0.8;
    outsideWorkers.push({
      x,
      y: OUTSIDE_FRONT_WALK - 38,
      w: workerWidth,
      h: 38,
      alive: true,
      baseX: x,
      minX: walkwayMin,
      maxX: walkwayMax,
      bob: Math.random() * Math.PI * 2,
      walkPhase: Math.random() * Math.PI * 2,
      walkSpeed: 0.6 + Math.random() * 0.6,
      walkAmplitude: 10 + Math.random() * 16,
      facing: Math.random() < 0.5 ? 1 : -1,
      appearance,
      showTie,
      hasBadge: Math.random() < 0.4,
      hasClipboard: Math.random() < 0.22,
      clipboardSide: Math.random() < 0.5 ? -1 : 1,
      glasses: Math.random() < 0.22,
      hitFlashUntil: 0
    });
  }
}

function initOutsideWindowGuards(){
  outsideWindowGuards = OUTSIDE_WINDOW_GUARD_SLOTS.map(slot => {
    const windowRect = OUTSIDE_WINDOW_LAYOUT.positions.find(pos => pos.row === slot.row && pos.col === slot.col);
    if(!windowRect) return null;
    return {
      id: slot.id,
      window: windowRect,
      x: windowRect.x + windowRect.w/2,
      width: 20,
      height: 34,
      paddingBottom: 6,
      popPhase: Math.random() * Math.PI * 2,
      speed: 0.9 + Math.random() * 0.6,
      popAmount: 0,
      facing: Math.random() < 0.5 ? 1 : -1,
      dead: false,
      hitUntil: 0,
      respawnAt: 0
    };
  }).filter(Boolean);
}

function spawnOutsideCounterSniper(){
  const windows = OUTSIDE_WINDOW_LAYOUT.positions;
  if(!windows || !windows.length) return;
  const slot = windows[Math.floor(Math.random() * windows.length)];
  const sniperWidth = Math.max(14, slot.w * 0.6);
  const sniperHeight = Math.max(22, slot.h * 0.85);
  const baseBottom = slot.y + slot.h - 4;
  const nowTs = now();
  outsideCounterSnipers.push({
    window: slot,
    x: slot.x + slot.w/2 - sniperWidth/2,
    y: baseBottom - sniperHeight,
    w: sniperWidth,
    h: sniperHeight,
    spawnAt: nowTs,
    fireAt: nowTs + 2000,
    dead: false,
    fired: false,
    removeAt: 0,
    hitUntil: 0
  });
}

function initOutsideRound(){
  outsideMode = true;
  outsideKillCount = 0;
  outsideGuards.length = 0;
  outsideWorkers.length = 0;
  outsideWindowGuards.length = 0;
  outsideCounterSnipers.length = 0;
  outsideOccupiedSlots.clear();
  outsideSpawnTimer = 0;
  outsideLastShot = 0;
  outsideCrosshairFlashUntil = 0;
  outsideShotPulseUntil = 0;
  outsideScope = { x: W/2, y: H/2, radius: OUTSIDE_SCOPE_RADIUS };
  outsideAim = { x: W/2, y: H/2 };
  outsideNextCounterSniperAt = now() + 10000;
  initOutsideWorkers();
  initOutsideWindowGuards();
  const initialGuards = Math.min(OUTSIDE_MAX_ACTIVE_GUARDS, 4);
  for(let i=0; i<initialGuards; i++){ spawnOutsideGuard(); }
  if(floorLabelEl) floorLabelEl.textContent = formatFloorLabel(OUTSIDE_FLOOR);
  showFloorBanner(OUTSIDE_FLOOR);
  updateMinimapHighlight();
  notify('Mission A BAD DEAL: Counter snipers fire every 10s. Aim with mouse or arrows and eliminate 20 guards. Workers award +$10.');
  centerNote('A BAD DEAL — Counter snipers in the Loan Tower! Aim with mouse or arrows.', 2400);
  updateHudForOutside();
  startMusic('outsideSpy');
}

function fireOutsideShot(){
  const t = now();
  if(t - outsideLastShot < 140) return;
  outsideLastShot = t;
  outsideCrosshairFlashUntil = t + 140;
  outsideShotPulseUntil = t + 200;
  playGunshot('outside');
  const aimX = outsideScope.x;
  const aimY = outsideScope.y;
  let hit = false;
  let workerBonus = false;
  let goonDown = false;
  for(const sniper of outsideCounterSnipers){
    if(!sniper || sniper.dead) continue;
    const left = sniper.x;
    const right = left + sniper.w;
    const top = sniper.y;
    const bottom = top + sniper.h;
    if(aimX >= left && aimX <= right && aimY >= top && aimY <= bottom){
      sniper.dead = true;
      sniper.hitUntil = t + 160;
      sniper.removeAt = t + 1200;
      outsideKillCount = Math.min(OUTSIDE_KILL_TARGET, outsideKillCount + 1);
      hit = true;
      goonDown = true;
      break;
    }
  }
  if(hit){
    // fall through for sound handling below
  } else {
    for(const guard of outsideGuards){
      if(guard.dead) continue;
      const halfW = (guard.width || 24) / 2;
      const top = guard.renderY - (guard.height || 42);
      if(aimX >= guard.renderX - halfW && aimX <= guard.renderX + halfW && aimY >= top && aimY <= guard.renderY){
        guard.dead = true;
        guard.hitUntil = t + 160;
        guard.removeAt = t + 260;
        outsideKillCount = Math.min(OUTSIDE_KILL_TARGET, outsideKillCount + 1);
        hit = true;
        goonDown = true;
        break;
      }
    }
  }
  if(!hit){
    for(const guard of outsideWindowGuards){
      if(!guard || guard.dead) continue;
      const progress = guard.popAmount ?? 0;
      if(progress <= 0.25) continue;
      const windowRect = guard.window;
      if(!windowRect) continue;
      const guardWidth = guard.width || 20;
      const guardHeight = guard.height || 34;
      const guardBottom = windowRect.y + windowRect.h - (guard.paddingBottom || 0);
      const guardTopFull = guardBottom - guardHeight;
      const hiddenOffset = guardHeight * (1 - progress);
      const guardTop = guardTopFull + hiddenOffset;
      const guardLeft = guard.x - guardWidth/2;
      const guardRight = guardLeft + guardWidth;
      if(aimX >= guardLeft && aimX <= guardRight && aimY >= guardTop && aimY <= guardBottom){
        guard.dead = true;
        guard.popAmount = Math.max(0, progress - 0.4);
        guard.hitUntil = t + 160;
        guard.respawnAt = t + 1800;
        outsideKillCount = Math.min(OUTSIDE_KILL_TARGET, outsideKillCount + 1);
        hit = true;
        goonDown = true;
        break;
      }
    }
  }
  if(!hit){
    for(const worker of outsideWorkers){
      if(!worker || !worker.alive) continue;
      const width = worker.w || 18;
      const left = worker.x;
      const right = left + width;
      const top = worker.y - 6;
      const bottom = worker.y + (worker.h || 38);
      if(aimX >= left && aimX <= right && aimY >= top && aimY <= bottom){
        worker.alive = false;
        worker.hitFlashUntil = t + 160;
        addChecking(10);
        centerNote('Worker payout! +$10', 1200);
        notify('Collected $10 from the worker.');
        hit = true;
        workerBonus = true;
        break;
      }
    }
  }
  if(hit){
    if(goonDown){
      playGoonDeath();
    }
    const freq = workerBonus ? 540 : 720;
    const dur = workerBonus ? 0.07 : 0.08;
    beep({freq, dur});
  } else {
    beep({freq:260,dur:0.05});
  }
}

function updateOutside(dt){
  const aimInputX = (keys['arrowleft'] ? -1 : 0) + (keys['arrowright'] ? 1 : 0);
  const aimInputY = (keys['arrowup'] ? -1 : 0) + (keys['arrowdown'] ? 1 : 0);
  if(aimInputX !== 0 || aimInputY !== 0){
    const length = Math.hypot(aimInputX, aimInputY) || 1;
    const aimSpeed = 380;
    outsideAim.x = clamp(outsideAim.x + (aimInputX / length) * aimSpeed * dt, 0, W);
    outsideAim.y = clamp(outsideAim.y + (aimInputY / length) * aimSpeed * dt, 0, H);
  }
  outsideScope.x += (outsideAim.x - outsideScope.x) * 0.2;
  outsideScope.y += (outsideAim.y - outsideScope.y) * 0.2;
  outsideSpawnTimer += dt;
  const desired = Math.min(OUTSIDE_MAX_ACTIVE_GUARDS, 3 + Math.floor(outsideKillCount/4));
  if(outsideGuards.length < desired && outsideSpawnTimer > 0.25){
    spawnOutsideGuard();
    outsideSpawnTimer = 0;
  }
  const t = now();
  if(outsideNextCounterSniperAt && t >= outsideNextCounterSniperAt){
    spawnOutsideCounterSniper();
    outsideNextCounterSniperAt = t + 10000;
  }
  for(let i=outsideGuards.length-1; i>=0; i--){
    const guard = outsideGuards[i];
    guard.phase += dt * guard.speed;
    guard.renderX = guard.baseX + Math.sin(guard.phase) * guard.swing;
    guard.renderY = guard.baseY + Math.cos(guard.phase * 0.9) * guard.bob;
    if(guard.hitUntil && t > guard.hitUntil){ guard.hitUntil = 0; }
    if(guard.dead && t > guard.removeAt){
      outsideOccupiedSlots.delete(guard.slot);
      outsideGuards.splice(i,1);
      outsideSpawnTimer = 0;
    }
  }
  for(let i=outsideCounterSnipers.length-1; i>=0; i--){
    const sniper = outsideCounterSnipers[i];
    if(sniper.hitUntil && t > sniper.hitUntil){ sniper.hitUntil = 0; }
    if(sniper.dead){
      if(!sniper.removeAt){ sniper.removeAt = t + 900; }
      if(t >= sniper.removeAt){ outsideCounterSnipers.splice(i,1); }
      continue;
    }
    if(!sniper.fired && t >= sniper.fireAt){
      loseChecking(10);
      clearFeather('damage');
      player.hurtUntil = Math.max(player.hurtUntil||0, t + 160);
      notify('Counter sniper shot you! -$10');
      centerNote('Counter sniper hit! -$10', 1400);
      sniper.fired = true;
      sniper.dead = true;
      sniper.removeAt = t + 1500;
    }
  }
  for(const worker of outsideWorkers){
    if(!worker.alive) continue;
    worker.walkPhase = (worker.walkPhase || 0) + dt * (worker.walkSpeed || 0.8);
    const offset = Math.sin(worker.walkPhase) * (worker.walkAmplitude || 12);
    const targetX = (worker.baseX || worker.x) + offset;
    worker.x = Math.max(worker.minX ?? 0, Math.min(worker.maxX ?? W, targetX));
    worker.facing = Math.cos(worker.walkPhase) >= 0 ? 1 : -1;
    worker.bob = (worker.bob || 0) + dt * (2.1 + Math.abs(Math.sin(worker.walkPhase))*1.2);
  }
  for(const guard of outsideWindowGuards){
    if(!guard) continue;
    if(guard.dead){
      guard.popAmount = Math.max(0, (guard.popAmount || 0) - dt * 3.2);
      if(t > guard.respawnAt){
        guard.dead = false;
        guard.hitUntil = 0;
        guard.popPhase = Math.random() * Math.PI * 2;
      }
      continue;
    }
    guard.popPhase = (guard.popPhase || 0) + dt * (guard.speed || 1);
    const raw = 0.5 + 0.5*Math.sin(guard.popPhase);
    guard.popAmount = Math.max(0, Math.min(1, raw));
    if(guard.hitUntil && t > guard.hitUntil){ guard.hitUntil = 0; }
  }
  if(outsideKillCount >= OUTSIDE_KILL_TARGET && outsideMode){
    completeOutsideRound();
    return;
  }
  updateHudForOutside();
}

function completeOutsideRound(){
  if(!outsideMode) return;
  outsideMode = false;
  outsideGuards.length = 0;
  outsideWorkers.length = 0;
  outsideWindowGuards.length = 0;
  outsideCounterSnipers.length = 0;
  outsideOccupiedSlots.clear();
  outsideSpawnTimer = 0;
  outsideLastShot = 0;
  outsideCrosshairFlashUntil = 0;
  outsideShotPulseUntil = 0;
  outsideNextCounterSniperAt = 0;
  enterFloor(1, { fromOutside:true });
}

function enterFloor(targetFloor, options={}){
  if(!Number.isFinite(targetFloor)) return false;
  const floor = Math.min(Math.max(1, Math.round(targetFloor)), FLOORS);
  const previous = currentFloor;
  outsideMode = false;
  outsideGuards.length = 0;
  outsideCounterSnipers.length = 0;
  outsideOccupiedSlots.clear();
  outsideSpawnTimer = 0;
  outsideLastShot = 0;
  outsideCrosshairFlashUntil = 0;
  outsideShotPulseUntil = 0;
  outsideKillCount = 0;
  outsideNextCounterSniperAt = 0;
  currentFloor = floor;
  camX = 0;
  camY = 0;
  seenDoor = false;
  closeVendingMenu({ keepPaused:true });
  player.x = initialSpawnX;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  makeLevel(currentFloor);
  handleFloorStart(currentFloor);
  if(topDownState){
    player.prevBottom = player.y + player.h;
    player.prevVy = 0;
  } else if(ventDungeonState){
    player.prevBottom = player.y + player.h;
    player.prevVy = 0;
  } else {
    player.y = floorSlab.y - player.h;
    player.prevBottom = player.y + player.h;
    player.prevVy = 0;
  }
  if(floorLabelEl) floorLabelEl.textContent = formatFloorLabel(currentFloor);
  updateMinimapHighlight();
  if(options.showBanner !== false){
    showFloorBanner(currentFloor);
  }
  if(options.fromOutside){
    setWeapon('pistol');
  }
  if(options.viaTest){
    notify(`Test warp ➜ ${formatFloorLabel(currentFloor)}.`);
    centerNote(`Test ➜ ${formatFloorLabel(currentFloor)}`, 1400);
  } else if(options.fromOutside){
    notify('Outside perimeter cleared. Level 1 ready.');
    centerNote('Level 1 — Breach the lobby.', 1600);
  }
  return previous !== currentFloor;
}

function startNewRun(name){
  if(runActive) return;
  currentPlayerName = name || 'Player';
  currentFloor = OUTSIDE_FLOOR;
  rooftopMissionState = null;
  warzoneMissionState = null;
  runStats = makeRunStats();
  runStats.start = performance.now();
  runStats.kills = 0; runStats.deaths = 0; runStats.refinances = 0;
  collectionsPressure = 1;
  ceoQTEAttempted = false;
  state.ceoPassive = false;
  state.playerWeaponsDisabled = false;
  resetHostageState();
  hellscapeState = null;
  updateCollectionsPressure();
  runActive = true;
  pause = false;
  startClock = performance.now();
  last = performance.now();
  attackHeld = false;
  camX = 0; camY = 0; seenDoor=false;
  scheduledBonusFloor = BONUS_FLOOR_MIN + Math.floor(Math.random()*(BONUS_FLOOR_MAX-BONUS_FLOOR_MIN+1));
  scheduleManagerFloor();
  resetPlayerState();
  bullets.length = 0;
  updateWeaponButtons();
  setMode(testMode? 'test' : 'normal');
  setWeapon('pistol');
  toggleCodex(false);
  resetDeckState();
  minimapUnlocked=false;
  minimapVisible=false;
  updateMapButtonState();
  toggleMinimap(false);
  initOutsideRound();
  if(timeEl) timeEl.textContent= `${fmtClock(TOTAL_TIME_MS)} ➜ ${fmtClock(0)}`;
  ensureLoop();
  canvas.focus();
}

function finishRun(outcome, { message=null, note=null }={}){
  if(!runActive) return;
  toggleCodex(false);
  toggleMinimap(false);
  toggleDeck(false);
  closeVendingMenu({ keepPaused:true });
  hideFloorBanner();
  outsideMode = false;
  outsideGuards.length = 0;
  outsideWorkers.length = 0;
  outsideWindowGuards.length = 0;
  outsideOccupiedSlots.clear();
  rooftopMissionState = null;
  warzoneMissionState = null;
  runActive=false;
  pause=true;
  stopMusic();
  setAmbient(null);
  if(outcome==='death') runStats.deaths = (runStats.deaths||0) + 1;
  const endTime = performance.now();
  const elapsed = runStats.start ? Math.max(0, endTime - runStats.start) : 0;
  const loanRemaining = Math.round(player.loanBalance);
  const detail = {
    outcome,
    name: currentPlayerName,
    timeMs: Math.round(elapsed),
    loanRemaining,
    kills: runStats.kills || 0,
    deaths: runStats.deaths || 0,
    refinances: runStats.refinances || 0,
    score: player.score || 0,
    floor: currentFloor
  };
  lastResult = detail;
  if(note) notify(note);
  if(message) centerNote(message, 2400);
  window.dispatchEvent(new CustomEvent('loanTower:end', { detail }));
  updateMapButtonState();
}
function reviveAfterRefinance(){
  player.checking = player.checkingMax || CHECKING_MAX;
  player.hurtUntil = now() + 400;
  player.x = initialSpawnX; player.y = 0; player.vx = 0; player.vy = 0;
  makeLevel(currentFloor);
  handleFloorStart(currentFloor);
  player.y = floorSlab.y - player.h;
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  state.ceoPassive = false;
  state.playerWeaponsDisabled = false;
  ceoQTEAttempted = false;
  pause = false;
  notify('Cosigner bail-out: run continues.');
  centerNote('Refinanced — debt doubled.', 1400);
}

function offerRefinanceOnDeath(){
  const chooseRefi = ui.confirm(
    'Refinance with a cosigner?\nDebt will DOUBLE and a family member is taken hostage.'
  );
  if(chooseRefi){
    runStats.refinances = (runStats.refinances||0) + 1;
    player.loanBalance = clampLoanBalance(player.loanBalance * 2);
    const name = nextHostageName();
    hostageState.taken.push(name);
    updateHostageHud();
    ui.toast(`Cosigner added: ${name}. Debt doubled to $${fmtCurrency(player.loanBalance)}.`);
    updateCollectionsPressure();
    reviveAfterRefinance();
    return true;
  }
  return false;
}

function tryPeacefulEnding(){
  const hpRequirement = player.hpMax || CHECKING_MAX;
  const savingsRequirement = player.savingsMax || SAVINGS_MAX;
  if(player.loanBalance <= 0 && player.checking >= hpRequirement && player.savings >= savingsRequirement){
    state.ceoPassive = true;
    state.playerWeaponsDisabled = true;
    pause = true;
    ui.banner('YOU BEAT STUDENT LOANS', 10000);
    audio.play('hallelujah');
    setTimeout(()=> endGame('peaceful'), 10000);
    return true;
  }
  return false;
}

function attemptRefinanceQTE(){
  if(ceoQTEAttempted) return false;
  ceoQTEAttempted = true;
  const wasPaused = pause;
  pause = true;
  const ok = qte.run({rounds:5, required:4, windowMs:900});
  pause = wasPaused;
  if(ok){
    player.loanBalance = clampLoanBalance(Math.ceil(player.loanBalance * 0.5));
    ui.toast(`Refinance success! Debt now $${fmtCurrency(player.loanBalance)}.`);
    endGame('refinance');
    return true;
  }
  ui.toast('Refinance attempt failed.');
  return false;
}

function endGame(mode){
  if(!runActive) return;
  if(mode==='peaceful'){
    finishRun('peaceful', { message:'YOU BEAT STUDENT LOANS', note:'Peaceful payoff ending secured.' });
  } else if(mode==='refinance'){
    finishRun('refinance', { message:'Refinance reprieve!', note:'Debt cut in half. You live to fight another day.' });
  } else {
    finishRun(mode || 'victory', { message:'CEO defeated!', note:'Combat victory.' });
  }
}

function handleFloorStart(floor){
  clearFeather();
  state.ceoPassive = false;
  state.playerWeaponsDisabled = false;
  if(floor === ECO_BOSS_FLOOR && getActiveHostages().length){
    ui.toast('Hostages detected ahead. Free them to reduce the loan!');
  }
  if(floor === FLOORS){
    if(tryPeacefulEnding()) return;
    if(player.loanBalance > 0){
      setTimeout(()=>{
        if(runActive && !state.ceoPassive){
          if(!attemptRefinanceQTE()){
            notify('Refinance failed. CEO engages in combat!');
          }
        }
      }, 1200);
    }
  }
}
function handleDeath(){
  if(!runActive && !testMode) return;
  pause=true;
  if(testMode){
    centerNote("Revived (TEST mode).");
    setTimeout(()=>{
      pause=false;
      player.checking=GAME_PARAMS.player.checkingStart;
      player.x=initialSpawnX; player.y=0; player.vx=player.vy=0;
      player.y = floorSlab.y - player.h;
      player.prevBottom = player.y + player.h;
      player.prevVy = 0;
      notify("Revived on same floor.");
    }, 700);
  } else {
    if(offerRefinanceOnDeath()) return;
    notify("Checking drained. Run failed.");
    finishRun('death', { message:"You ran out of Checking." });
  }
}
function damage(){
  const t=now();
  loseChecking(GUARD_BASE_DAMAGE);
  clearFeather('damage');
  player.hurtUntil = t+120;
}

function scheduleGuardContactDamage(){
  const t = now();
  if(player.contactDamagePending){
    return true;
  }
  player.contactDamagePending = true;
  player.contactDamageApplyAt = t + GUARD_CONTACT_DELAY_MS;
  player.contactInterferenceStart = t;
  player.contactInterferenceUntil = player.contactDamageApplyAt;
  player.contactInterferencePhase = (player.contactInterferencePhase || 0) + 1;
  return true;
}
function clampLoanBalance(value){
  return Math.max(-LOAN_CAP, Math.min(LOAN_CAP, value));
}
function applyLoanPayment(amount){
  if(amount<=0) return;
  player.loanBalance = clampLoanBalance(player.loanBalance - amount);
}
function applyCash(amount){
  let remaining = amount;
  if(remaining<=0) return;
  if(player.savings < player.savingsMax){
    const take = Math.min(remaining, player.savingsMax - player.savings);
    player.savings += take;
    remaining -= take;
  }
  if(remaining>0){
    applyLoanPayment(remaining);
  }
}
function reduceLoanByPercent(percent){
  const clamped = Math.max(0, Math.min(1, percent));
  if(player.loanBalance > 0){
    const reduction = Math.ceil(player.loanBalance * clamped);
    applyLoanPayment(reduction);
  } else {
    player.loanBalance = clampLoanBalance(player.loanBalance);
  }
}
function applyHopeBuff(){
  player.hopeBuffUntil = Math.max(player.hopeBuffUntil, now() + 10000);
  notify('Hope momentum surges!');
}
function updateCollectionsPressure(){
  const refinances = runStats && Number.isFinite(runStats.refinances) ? runStats.refinances : 0;
  collectionsPressure = 1 + 0.1 * Math.max(0, refinances - 2);
}
function loseChecking(amount){
  if(amount<=0) return 0;
  const max = player.checkingMax || CHECKING_MAX;
  const scaled = Math.max(0, Math.round(amount * collectionsPressure));
  const prev = player.checking;
  player.checking = Math.max(0, Math.min(max, prev - scaled));
  if(player.checking===0 && prev>0){ handleDeath(); }
  return scaled;
}
function addChecking(n){
  if(!Number.isFinite(n) || n===0){
    return;
  }
  const max = player.checkingMax || CHECKING_MAX;
  if(n > 0){
    const space = Math.max(0, max - player.checking);
    const use = Math.min(space, n);
    player.checking = clamp(player.checking + use, 0, max);
    const overflow = n - use;
    if(overflow > 0){
      applyCash(overflow);
    }
  } else {
    player.checking = clamp(player.checking + n, 0, max);
  }
}
function addAmmo(n){
  if(!Number.isFinite(n) || n<=0) return;
  player.pistol.reserve = clamp(player.pistol.reserve+n, 0, 999);
  if(player.weaponsUnlocked && player.weaponsUnlocked.machineGun){
    const mgGain = Math.max(0, Math.round(n*2));
    const mgMax = player.machineGun.maxReserve || 3600;
    player.machineGun.reserve = clamp((player.machineGun.reserve||0) + mgGain, 0, mgMax);
  }
  if(player.weaponsUnlocked && player.weaponsUnlocked.grenade){
    const grenadeGain = Math.max(0, Math.floor(n/6));
    const maxReserve = player.grenade.maxReserve || GRENADE_RESERVE_MAX;
    if(grenadeGain>0){ player.grenade.reserve = clamp((player.grenade.reserve||0) + grenadeGain, 0, maxReserve); }
    else if(player.grenade.ammo===0 && player.grenade.reserve===0){
      player.grenade.reserve = clamp((player.grenade.reserve||0) + 1, 0, maxReserve);
    }
  }
}

function applySpeedBoost(amount, durationMs){
  if(!player) return;
  const nowTs = now();
  const duration = Math.max(0, durationMs || 0);
  const targetAmount = Math.max(0, amount || 0);
  const active = nowTs < player.speedBoostUntil;
  const currentAmount = player.speedBoostAmount || 0;
  const newUntil = nowTs + duration;
  if(!active || targetAmount >= currentAmount){
    player.speedBoostAmount = targetAmount;
    player.speedBoostUntil = newUntil;
  } else {
    player.speedBoostUntil = Math.max(player.speedBoostUntil, newUntil);
  }
}
function addFuel(n){
  if(!Number.isFinite(n) || n<=0) return;
  const stats = player.flame;
  if(!stats) return;
  const reduction = Math.max(0, n*40);
  stats.heat = Math.max(0, (stats.heat||0) - reduction);
  const current = now();
  if(stats.lockedUntil && current < stats.lockedUntil){
    stats.lockedUntil = Math.max(current, stats.lockedUntil - reduction);
    if(stats.lockedUntil <= current){
      stats.lockedUntil = 0;
      stats.overheated = false;
      stats.overheatNotifiedUntil = 0;
      stats.cooldownNoticeUntil = 0;
    }
  }
}
function grantWeaponUpgrade(){
  player.weaponUpgrades = (player.weaponUpgrades||0) + 1;
  player.pistol.cooldown = Math.max(70, Math.round(player.pistol.cooldown * 0.92));
  player.silenced.cooldown = Math.max(60, Math.round(player.silenced.cooldown * 0.9));
  player.flame.cooldown = Math.max(40, Math.round(player.flame.cooldown * 0.94));
  player.melee.cooldown = Math.max(80, Math.round(player.melee.cooldown * 0.9));
  player.saber.cooldown = Math.max(100, Math.round(player.saber.cooldown * 0.9));
  player.machineGun.cooldown = Math.max(10, Math.round(player.machineGun.cooldown * 0.94));
}

function rewardWorker(worker){
  if(!worker || worker.rewardClaimed) return;
  worker.rewardClaimed = true;
  addChecking(10);
  notify('+10 health (worker)');
}

function damageWorker(worker, amount){
  if(!worker || !worker.alive) return false;
  const dmg = Number.isFinite(amount) ? amount : 0;
  if(dmg <= 0) return false;
  const maxHp = Number.isFinite(worker.maxHp) ? worker.maxHp : 10;
  const prevHp = Number.isFinite(worker.hp) ? worker.hp : maxHp;
  const nextHp = Math.max(0, Math.min(maxHp, prevHp - dmg));
  if(nextHp === prevHp) return false;
  worker.hp = nextHp;
  worker.hitFlashUntil = now() + 160;
  if(worker.hp === 0){
    worker.alive = false;
    rewardWorker(worker);
    if(worker.isIntern && ventDungeonState){
      ventDungeonState.internsKilled = Math.min(ventDungeonState.internTotal || 0, (ventDungeonState.internsKilled || 0) + 1);
      if(worker.internName){
        notify(`${worker.internName} neutralized.`);
      }
      updateHudCommon();
    }
  }
  return true;
}

// Input
const keys={};
let attackHeld=false;
window.addEventListener('keydown', e=>{
  if(droneMissionState && handleDroneMissionKeyDown(e)) return;
  const k=e.key.toLowerCase();
  if(rooftopMissionState && handleRooftopKeyDown(k, e)) return;
  if(warzoneMissionState && handleWarzoneKeyDown(k, e)) return;
  if(vendingMenuVisible){
    if(k==='escape' || k===' '){
      e.preventDefault();
      closeVendingMenu();
    }
    return;
  }
  if(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')){
    return;
  }
  if(activeHack){
    e.preventDefault();
    handleHackInput(k);
    return;
  }
  if(k==='0'){
    if(!runActive){ return; }
    e.preventDefault();
    if(minimapVisible){
      toggleMinimap(false);
    } else if(minimapUnlocked){
      if(deckVisible){ toggleDeck(false); }
      toggleMinimap(true);
    } else {
      centerNote('Clear a vent to access the map.', 1400);
      lockedBuzz();
    }
    return;
  }
  if(k==='p'){
    if(!runActive){ return; }
    e.preventDefault();
    if(deckVisible){ toggleDeck(false); }
    else { toggleDeck(true); }
    return;
  }
  if(k==='k'){
    e.preventDefault();
    toggleHudCompact();
    return;
  }
  if(k==='escape'){
    if(minimapVisible){
      e.preventDefault();
      toggleMinimap(false);
      return;
    }
    if(deckVisible){
      e.preventDefault();
      toggleDeck(false);
      return;
    }
  }
  const wasDown = !!keys[k];
  keys[k]=true;
  if(k==='r'){
    const couldReload = reloadWeapon();
    if(!couldReload){
      if(player.weapon==='machineGun'){ centerNote('No reserve rounds for the machine gun.', 1400); beep({freq:280}); }
      else if(player.weapon==='grenade'){ centerNote('No grenades in reserve.', 1400); beep({freq:260}); }
      else if(player.weapon==='pistol' || player.weapon==='silenced'){ centerNote('No spare ammo.', 1200); beep({freq:300}); }
    }
  }
  if(k==='1') setWeapon('pistol');
  if(k==='2') setWeapon('silenced');
  if(k==='3') setWeapon('flame');
  if(k==='4') setWeapon('melee');
  if(k==='5') setWeapon('grenade');
  if(k==='6') setWeapon('saber');
  if(k==='7') setWeapon('machineGun');
  if(k==='e' && !wasDown){ attackHeld=true; attack(); }
  if(k===' '){ interact(); }
},{passive:false});
window.addEventListener('keyup', e=>{
  if(droneMissionState && handleDroneMissionKeyUp(e)) return;
  const k=e.key.toLowerCase();
  if(vendingMenuVisible){
    if(k==='escape' || k===' '){
      e.preventDefault();
    }
    return;
  }
  keys[k] = false;
  if(k==='e'){ attackHeld=false; }
}, {passive:false});

// mouse
window.addEventListener('mousedown', e=>{ if(droneMissionState && handleDroneMissionMouseDown(e)) return; attackHeld=true; attack(); });
window.addEventListener('mouseup', ()=>{ attackHeld=false; });
window.addEventListener('blur', ()=>{ attackHeld=false; });

// ==== Level generation ====
function guardArchetypeForFloor(i){
  if(isArcadeBeatdownFloor(i)) return 'thug';
  const theme = getFloorTheme(i);
  const basePool = ['pistol'];
  if(i>=5) basePool.push('policy');
  if(i>=6) basePool.push('auto');
  if(i>=9) basePool.push('shield');
  if(i>=12) basePool.push('ninja');
  if(i>=17) basePool.push('experimental');
  if(i>=18) basePool.push('launcher');
  if(i>=25) basePool.push('ad');
  if(i>=29) basePool.push('lawsuit');
  if(i>=33) basePool.push('heavy');
  const preferred = theme && theme.guard && Array.isArray(theme.guard.preferred) ? theme.guard.preferred : [];
  const weighted = [...basePool];
  for(const pref of preferred){
    if(basePool.includes(pref)){
      weighted.push(pref);
      weighted.push(pref);
    }
  }
  if(ninjaRound && i>=21 && i<=24){ return 'ninja'; }
  return weighted[Math.floor(Math.random()*weighted.length)];
}
function makeGuard(x,y,i){
  const type = guardArchetypeForFloor(i);
  const theme = getFloorTheme(i);
  const tier = Math.max(0, Math.floor((i-1)/3));
  const themeHpMod = theme && theme.guard && theme.guard.hpMod ? theme.guard.hpMod : 0;
  const themeSpeedMod = theme && theme.guard && theme.guard.speedMod ? theme.guard.speedMod : 0;
  const hpMultiplier = Math.max(0.4, 1 + tier*0.18 + themeHpMod);
  const speedMultiplier = Math.max(0.3, 1 + tier*0.06 + themeSpeedMod);
  const fireRateMultiplier = Math.max(0.55, 1 - Math.min(0.4, tier*0.04));
  const direction = x < W ? 1 : -1;
  let baseHp = 20;
  let baseSpeed = 0.9;
  if(type==='launcher') baseHp=40, baseSpeed=0.75;
  if(type==='ninja') baseHp=30, baseSpeed=1.6;
  if(type==='auto') baseHp=24, baseSpeed=1.0;
  if(type==='policy') baseHp=22, baseSpeed=0.8;
  if(type==='shield') baseHp=34, baseSpeed=0.7;
  if(type==='experimental') baseHp=28, baseSpeed=1.1;
  if(type==='ad') baseHp=26, baseSpeed=1.05;
  if(type==='lawsuit') baseHp=28, baseSpeed=0.9;
  if(type==='heavy') baseHp=48, baseSpeed=0.65;
  if(type==='thug') baseHp=32, baseSpeed=0.95;
  const hp = Math.round(baseHp * hpMultiplier);
  const speed = Math.max(0.35, baseSpeed * speedMultiplier);
  const guard = new Agent({
    x,
    y,
    w:GUARD_WIDTH,
    h:GUARD_HEIGHT,
    vx: direction > 0 ? Math.abs(speed) : -Math.abs(speed),
    hp,
    maxHp: hp,
    dmg: GUARD_BASE_DAMAGE,
    type,
    weapon: type,
    shotInterval: (type==='launcher' ? 1600 : type==='auto' ? 220 : type==='ninja' ? 0 : type==='policy' ? 900 : type==='ad' ? 780 : type==='lawsuit' ? 980 : type==='heavy' ? 660 : 700) * fireRateMultiplier,
    attackInterval: type==='launcher' ? 1500 : type==='auto' ? 600 : type==='ninja' ? 680 : type==='heavy' ? 780 : 900,
    speed: Math.abs(speed),
    direction
  });
  if(type==='ninja'){ guard.shoot = false; guard.doubleJump = (ninjaRound && i===21); }
  if(type==='shield'){ guard.damageReduction = 0.35; }
  if(type==='heavy'){ guard.damageReduction = 0.25; }
  if(type==='experimental'){ guard.explosiveShots = true; }
  if(type==='policy'){ guard.policyBinder = true; }
  if(type==='ad'){ guard.adCaster = true; }
  if(type==='lawsuit'){ guard.homing = true; }
  if(type==='thug'){
    guard.weapon = 'melee';
    guard.shoot = false;
    guard.attackInterval = 520;
    guard.flashlight = false;
    guard.speed = Math.max(0.55, guard.speed);
    guard.vx = guard.direction > 0 ? Math.abs(guard.speed) : -Math.abs(guard.speed);
    guard.w = 24;
    guard.h = 48;
    guard.dmg = Math.round(GUARD_BASE_DAMAGE * 1.2);
    guard.puncher = true;
  }
  if(type==='ninja'){
    guard.vy = 0;
    guard.onGround = true;
    guard.jumpCount = 0;
    guard.jumpCooldown = 0;
    guard.airControl = 1.15;
  }
  guard.spawnOrigin = x;
  guard.accuracy = 1 + tier*0.15 + (type==='shield'?0.4:0) + (type==='lawsuit'?0.6:0);
  return guard;
}

function createArenaGuard(type, x, y, config={}){
  const { hpMult=1, speedMult=1, damageMult=1 } = config;
  const tier = Math.max(0, Math.floor((currentFloor-1)/3));
  const hpScale = 1 + tier * 0.18;
  const speedScale = 1 + tier * 0.06;
  let baseHp = 20;
  let baseSpeed = 0.9;
  let shotInterval = 700;
  let attackInterval = 900;
  if(type==='heavy'){ baseHp=48; baseSpeed=0.7; shotInterval=320; attackInterval=760; }
  if(type==='ninja'){ baseHp=32; baseSpeed=1.55; shotInterval=0; attackInterval=680; }
  if(type==='auto'){ baseHp=24; baseSpeed=1.0; shotInterval=220; attackInterval=600; }
  if(type==='soldier'){ baseHp=34; baseSpeed=1.05; shotInterval=240; attackInterval=760; }
  const hp = Math.round(baseHp * hpScale * hpMult);
  const speed = Math.max(0.3, baseSpeed * speedScale * speedMult);
  const guard = new Agent({
    x,
    y,
    w:GUARD_WIDTH,
    h:GUARD_HEIGHT,
    vx: Math.abs(speed),
    hp,
    maxHp: hp,
    dmg: Math.round(GUARD_BASE_DAMAGE * damageMult),
    type,
    weapon: type,
    shotInterval,
    attackInterval,
    speed,
    direction:1
  });
  if(type==='ninja'){
    guard.shoot = false;
    guard.vy = 0;
    guard.onGround = true;
    guard.jumpCount = 0;
    guard.jumpCooldown = 0;
    guard.airControl = 1.15;
  }
  if(type==='heavy'){ guard.damageReduction = Math.max(0.25, guard.damageReduction||0.25); }
  if(type==='soldier'){ guard.weapon = 'soldier'; }
  guard.spawnOrigin = x;
  guard.arena = true;
  return guard;
}

function applyGuardDamage(guard, amount){
  if(!guard || guard.hp<=0) return false;
  let dmg = amount;
  if(guard.damageReduction){
    dmg = Math.max(1, Math.round(dmg * (1 - guard.damageReduction)));
  }
  if(typeof guard.takeDamage === 'function'){
    return guard.takeDamage(dmg);
  }
  guard.hp = Math.max(0, guard.hp - dmg);
  return guard.hp===0;
}

function pickGuardSpawn(existing = []){
  const margin = GUARD_SPAWN_MARGIN;
  const avoidDoorRadius = 260;
  const span = levelWidth();
  const safeDistance = guardSafeDistance();
  for(let attempt=0; attempt<80; attempt++){
    const spawnX = margin + Math.random() * Math.max(0, span - 2 * margin);
    if(Math.abs(spawnX - player.x) < safeDistance) continue;
    if(Math.abs(spawnX - initialSpawnX) < safeDistance) continue;
    if(door && Math.abs((spawnX + 10) - (door.x + door.w/2)) < avoidDoorRadius) continue;
    if(existing.some(pos => Math.abs(pos - spawnX) < GUARD_SEPARATION)) continue;
    return spawnX;
  }
  return player.x < span / 2 ? span - margin : margin;
}


function scheduleManagerFloor(){
  const options=[];
  for(let f=6; f<=Math.min(FLOORS-1, 32); f++){
    if(f===scheduledBonusFloor) continue;
    if(!BOARD_FLOORS.has(f)) options.push(f);
  }
  managerCheckFloor = options.length ? options[Math.floor(Math.random()*options.length)] : null;
  managerDefeated=false;
}

function makeCeoPenthouseArena(yBase){
  backgroundFX.length = 0;
  windowsArr.length = 0;
  desks.length = 0;
  deskDrawers.length = 0;
  stealthZones.length = 0;
  hazards.length = 0;
  waterCoolers.length = 0;
  coffeeMachines.length = 0;
  vendingMachines.length = 0;
  printers.length = 0;
  ladders.length = 0;
  vents.length = 0;
  panels.length = 0;
  movingPlatforms.length = 0;
  plants.length = 0;
  workers.length = 0;
  pickups.length = 0;
  spotlights.length = 0;
  servers.length = 0;
  serverTerminals.length = 0;
  merchants.length = 0;
  sprinklers.length = 0;
  boardTables.length = 0;
  boardMembers.length = 0;

  floorSlab = { x:0, y:yBase, w:levelWidth(), h:22 };

  const arenaLeft = 0.68 * W;
  const arenaRight = levelWidth() - 180;
  const arenaWidth = Math.max(320, arenaRight - arenaLeft);
  backgroundFX.push({ type:'coliseumBackdrop', x:0.4*W, y:70, w:2.2*W, h:240 });
  backgroundFX.push({ type:'coliseumFloor', x:arenaLeft-40, y:yBase-72, w:arenaWidth+80, h:72 });
  backgroundFX.push({ type:'coliseumMosaic', x:arenaLeft-30, y:yBase-132, w:arenaWidth+60, h:56 });
  for(let c=0;c<6;c++){
    const t = c/5;
    const colX = arenaLeft + 60 + t * Math.max(120, arenaWidth-120);
    backgroundFX.push({ type:'coliseumColumn', x:colX, y:yBase-250, h:220 });
  }
  backgroundFX.push({ type:'coliseumBanner', x:arenaLeft + arenaWidth/2 - 200, y:yBase-230, w:400, h:56 });
  backgroundFX.push({ type:'coliseumStatue', x:arenaLeft-140, y:yBase-160, h:160 });
  backgroundFX.push({ type:'coliseumStatue', x:arenaRight+20, y:yBase-160, h:160, flip:true });
  backgroundFX.push({ type:'coliseumHero', x:arenaLeft + arenaWidth/2 - 240, y:yBase-210, h:190 });
  backgroundFX.push({ type:'coliseumHero', x:arenaLeft + arenaWidth/2 + 120, y:yBase-210, h:190, flip:true });
  backgroundFX.push({ type:'coliseumFountain', x:arenaLeft + arenaWidth/2 - 90, y:yBase-116, w:180, h:110 });
  for(let t=0;t<4;t++){
    const tx = arenaLeft + 80 + t * ((arenaWidth-120)/3);
    backgroundFX.push({ type:'coliseumTorch', x:tx, y:yBase-128, h:110 });
  }

  door = { x: 0.24*W, y: yBase-210, w:130, h:210, unlocked:false, open:false, lift:0, glowUntil:0 };

  ceoArenaState.bounds = {
    left: door.x + door.w - 20,
    right: arenaRight
  };
  ceoArenaState.triggerX = arenaLeft - 100;
  ceoArenaState.spawnPoint = { x: door.x + door.w - GUARD_WIDTH + 2, y: yBase - GUARD_HEIGHT };
  ceoArenaState.triggered = false;
  ceoArenaState.active = false;
  ceoArenaState.spawning = false;
  ceoArenaState.waveIndex = -1;
  ceoArenaState.currentWave = null;
  ceoArenaState.pendingSpawns = 0;
  ceoArenaState.spawnTimer = 0;
  ceoArenaState.betweenWaves = false;
  ceoArenaState.nextWaveAt = 0;
  ceoArenaState.completed = false;
  ceoArenaState.ceoActive = false;
  ceoArenaState.lockAnnounced = false;
  ceoArenaState.introShown = true;
  ceoArenaState.shockwaves = [];
  ceoArenaState.lastSupplyWave = -1;
  ceoArenaState.initialSupplyDelivered = false;

  finalHostages = [];
  const captiveNames = getActiveHostages();
  if(captiveNames.length){
    const spacing = 48;
    const anchor = arenaRight - 80;
    const startX = Math.max(arenaLeft + 120, anchor - (captiveNames.length - 1) * spacing);
    const groundY = yBase;
    captiveNames.forEach((name, index)=>{
      finalHostages.push({
        name,
        x: startX + index * spacing,
        y: groundY,
        w: 24,
        h: 44,
        freed:false,
        safe:false,
        removed:false,
        vx:0,
        vy:0,
        speed:1.85,
        escapeDir:1,
        hitFlashUntil:0
      });
    });
  }

  notify('The penthouse reveals a marble coliseum. Step into the arena to begin the gauntlet.');
  centerNote('CEO Coliseum — enter the arena.', 2000);
}

function resetCeoArenaState(){
  ceoArenaState.bounds = null;
  ceoArenaState.triggerX = 0;
  ceoArenaState.spawnPoint = null;
  ceoArenaState.triggered = false;
  ceoArenaState.active = false;
  ceoArenaState.spawning = false;
  ceoArenaState.waveIndex = -1;
  ceoArenaState.currentWave = null;
  ceoArenaState.pendingSpawns = 0;
  ceoArenaState.spawnTimer = 0;
  ceoArenaState.betweenWaves = false;
  ceoArenaState.nextWaveAt = 0;
  ceoArenaState.completed = false;
  ceoArenaState.ceoActive = false;
  ceoArenaState.lockAnnounced = false;
  ceoArenaState.introShown = false;
  ceoArenaState.shockwaves = [];
  ceoArenaState.currentBoss = null;
  ceoArenaState.lastSupplyWave = -1;
  ceoArenaState.initialSupplyDelivered = false;
}

function spawnCeoBoss(){
  const ceoWidth = Math.round(GUARD_WIDTH * 5);
  const ceoHeight = Math.round(GUARD_HEIGHT * 4.5);
  const bounds = ceoArenaState.bounds || { left:80, right:levelWidth()-120 };
  const center = (bounds.left + bounds.right) / 2;
  const spawnX = clamp(center - ceoWidth/2, 80, levelWidth() - ceoWidth - 80);
  const spawnY = (floorSlab ? floorSlab.y : (H-50)) - ceoHeight;
  const ceo = new Agent({
    x: spawnX,
    y: spawnY,
    w: ceoWidth,
    h: ceoHeight,
    vx: 0,
    hp: 720,
    maxHp: 720,
    dmg: Math.round(GUARD_BASE_DAMAGE * 2.2),
    type: 'ceo',
    weapon: 'melee',
    shotInterval: 0,
    attackInterval: 0,
    speed: 0.55,
    direction: -1
  });
  ceo.spawnOrigin = spawnX;
  ceo.boss = true;
  ceo.damageReduction = 0.45;
  ceo.ceo = true;
  ceo.trackPlayer = true;
  ceo.smashPhase = 'idle';
  ceo.smashTimer = 2.6;
  ceo.smashWindup = 0.85;
  ceo.smashRadius = 220;
  guards.push(ceo);
  ceoArenaState.ceoActive = true;
  ceoArenaState.currentBoss = ceo;
  notify('The CEO strides into the arena! Jump to evade ground smashes.');
}

function spawnCeoArenaEnemy(){
  if(!ceoArenaState.currentWave) return;
  if(ceoArenaState.currentWave.boss){
    spawnCeoBoss();
    ceoArenaState.pendingSpawns = 0;
    ceoArenaState.spawning = false;
    ceoArenaState.spawnTimer = 0;
    return;
  }
  const spawnBase = ceoArenaState.spawnPoint || { x: initialSpawnX, y: (floorSlab ? floorSlab.y : (H-50)) - GUARD_HEIGHT };
  const guard = createArenaGuard(ceoArenaState.currentWave.type, spawnBase.x, spawnBase.y, ceoArenaState.currentWave);
  guard.x = spawnBase.x;
  guard.y = (floorSlab ? floorSlab.y : (H-50)) - guard.h;
  guard.spawnOrigin = guard.x;
  guard.direction = 1;
  guard.vx = Math.abs(guard.speed || guard.vx || 0.9);
  guard.wave = ceoArenaState.waveIndex;
  guards.push(guard);
}

function spawnCeoArenaSupplyDrop(options={}){
  if(!floorSlab || !ceoArenaState.bounds) return;
  const { initial=false, final=false, showNote=true } = options;
  const groundY = floorSlab.y;
  const centerX = (ceoArenaState.bounds.left + ceoArenaState.bounds.right) / 2;
  const baseY = groundY - 30;
  const spacing = 46;
  const drops = [
    { type:'medkit', amount:250 },
    { type:'medkit', amount:250 },
    { type:'medkit', amount:250 },
    { type:'ammo', amount:120 },
    { type:'ammo', amount:120 },
    { type:'unlockAll' }
  ];
  const startX = centerX - spacing * ((drops.length - 1) / 2);
  drops.forEach((drop, index)=>{
    const x = Math.round(startX + index * spacing) - 12;
    pickups.push({ type: drop.type, x, y: baseY, w:24, h:24, amount: drop.amount });
  });
  const noteText = initial ? 'Initial supply drop ready!' : final ? 'Final supply drop delivered!' : 'Supply drop delivered.';
  if(showNote){
    centerNote(noteText, 1600);
  }
  const notifyText = initial
    ? 'Arena kickoff cache: 3 medkits, 2 ammo crates, and an arsenal dossier.'
    : final
      ? 'Final arena cache: 3 medkits, 2 ammo crates, and an arsenal dossier.'
      : 'Arena resupply: 3 medkits, 2 ammo crates, and an arsenal dossier available.';
  notify(notifyText);
}

function beginCeoArenaWave(index){
  const wave = CEO_ARENA_WAVES[index];
  if(!wave) return;
  ceoArenaState.active = true;
  ceoArenaState.currentWave = wave;
  ceoArenaState.waveIndex = index;
  ceoArenaState.pendingSpawns = wave.boss ? 1 : Math.max(0, wave.count || 0);
  ceoArenaState.spawnTimer = 0;
  ceoArenaState.spawning = ceoArenaState.pendingSpawns > 0;
  ceoArenaState.betweenWaves = false;
  ceoArenaState.nextWaveAt = 0;
  ceoArenaState.ceoActive = false;
  const label = wave.label || `Wave ${index+1}`;
  centerNote(label, 1800);
  notify(`${label} incoming!`);
}

function updateCeoBoss(ceo, dt, playerCenterX){
  if(!ceo) return false;
  const bounds = ceoArenaState.bounds || { left:40, right:levelWidth()-120 };
  const speed = Math.max(0.3, ceo.speed || 0.5);
  const center = ceo.x + ceo.w/2;
  if(ceo.smashPhase !== 'windup' && ceo.smashPhase !== 'slam'){
    const dir = playerCenterX >= center ? 1 : -1;
    ceo.vx = dir * speed;
    ceo.direction = dir;
  } else {
    ceo.vx *= 0.6;
  }
  ceo.x = clamp(ceo.x, bounds.left, bounds.right - ceo.w);
  ceo.y = (floorSlab ? floorSlab.y : (H-50)) - ceo.h;
  ceo.smashTimer = (ceo.smashTimer || 0) - dt;
  let inflicted = false;
  if(ceo.smashPhase === 'idle'){
    if(ceo.smashTimer <= 0){
      ceo.smashPhase = 'windup';
      ceo.smashProgress = 0;
      ceo.smashTimer = 0;
      ceo.smashWarningUntil = now() + Math.round((ceo.smashWindup || 0.85) * 1000);
      if(!ceo.lastCallout || now() - ceo.lastCallout > 1400){
        centerNote('CEO preparing a ground smash — jump!', 1800);
        ceo.lastCallout = now();
      }
    }
  } else if(ceo.smashPhase === 'windup'){
    ceo.smashProgress = (ceo.smashProgress || 0) + dt;
    if(ceo.smashProgress >= (ceo.smashWindup || 0.9)){
      ceo.smashPhase = 'slam';
      ceo.smashRecover = 0.6;
      ceo.smashProgress = 0;
      ceo.smashFlashUntil = now() + 240;
      const radius = ceo.smashRadius || 220;
      const dx = Math.abs(playerCenterX - center);
      if(dx <= radius){
        if(player.onGround && !player.inVent){
          loseChecking(Math.round(GUARD_BASE_DAMAGE * 1.8));
          player.hurtUntil = now() + 500;
          player.vy = -Math.max(JUMP*0.55, 7);
          player.onGround = false;
          player.screenFlashUntil = Math.max(player.screenFlashUntil, now()+220);
          inflicted = true;
        }
      }
      ceoArenaState.shockwaves.push({ x:center, y:(floorSlab ? floorSlab.y : (H-50)), radius:80, life:0.55, grow:360 });
    }
  } else if(ceo.smashPhase === 'slam'){
    ceo.smashRecover -= dt;
    if(ceo.smashRecover <= 0){
      ceo.smashPhase = 'idle';
      ceo.smashTimer = 2.4;
    }
  }
  return inflicted;
}

function updateCeoArena(dt){
  if(currentFloor !== FLOORS || !ceoArenaState.bounds) return;
  if(!ceoArenaState.triggered){
    const triggerX = ceoArenaState.triggerX || 0;
    if(player.x + player.w/2 >= triggerX){
      ceoArenaState.triggered = true;
      door.unlocked = false;
      door.open = false;
      door.lift = 0;
      door.glowUntil = 0;
      alarm = false;
      alarmUntil = 0;
      notify('Arena lockdown engaged. Survive the CEO\'s gauntlet!');
      centerNote('Arena locked — Wave 1 incoming!', 2000);
      if(!ceoArenaState.initialSupplyDelivered){
        spawnCeoArenaSupplyDrop({ initial:true, showNote:false });
        ceoArenaState.initialSupplyDelivered = true;
      }
      beginCeoArenaWave(0);
    }
    return;
  }

  if(ceoArenaState.spawning && ceoArenaState.pendingSpawns > 0){
    ceoArenaState.spawnTimer += dt;
    const wave = ceoArenaState.currentWave;
    if(wave && wave.boss){
      const delay = wave.spawnDelay || 1.2;
      if(ceoArenaState.spawnTimer >= delay){
        spawnCeoArenaEnemy();
      }
    } else {
      const interval = wave && wave.spawnInterval ? wave.spawnInterval : 0.45;
      if(ceoArenaState.spawnTimer >= interval){
        ceoArenaState.spawnTimer = 0;
        spawnCeoArenaEnemy();
        ceoArenaState.pendingSpawns = Math.max(0, ceoArenaState.pendingSpawns - 1);
        if(ceoArenaState.pendingSpawns === 0){
          ceoArenaState.spawning = false;
        }
      }
    }
  }

  if(ceoArenaState.shockwaves.length){
    for(const wave of ceoArenaState.shockwaves){
      wave.life -= dt;
      wave.radius += (wave.grow || 320) * dt;
    }
    ceoArenaState.shockwaves = ceoArenaState.shockwaves.filter(w => w.life > 0);
  }

  if(!ceoArenaState.spawning && ceoArenaState.pendingSpawns <= 0){
    const wave = ceoArenaState.currentWave;
    const bossWave = wave && wave.boss;
    const alive = guards.some(g => g.hp>0 && (!bossWave || g.type==='ceo'));
    if(!alive){
      if(ceoArenaState.waveIndex >= CEO_ARENA_WAVES.length-1){
        if(!ceoArenaState.completed){
          ceoArenaState.completed = true;
          ceoArenaState.active = false;
          ceoArenaState.ceoActive = false;
          if(door){
            door.unlocked = true;
            door.open = false;
            door.lift = 0;
            door.glowUntil = now()+4000;
          }
          if(runActive){
            spawnCeoArenaSupplyDrop({ final:true, showNote:false });
            notify('CEO defeated! Elevator unlocked — escape to finish the mission.');
            centerNote('CEO defeated — reach the elevator!', 2400);
          }
        }
      } else if(!ceoArenaState.betweenWaves){
        ceoArenaState.betweenWaves = true;
        ceoArenaState.nextWaveAt = now() + 1500;
        notify('Wave cleared! Ready for the next assault.');
        if(ceoArenaState.lastSupplyWave !== ceoArenaState.waveIndex){
          spawnCeoArenaSupplyDrop();
          ceoArenaState.lastSupplyWave = ceoArenaState.waveIndex;
        }
      }
    }
  }

  if(ceoArenaState.betweenWaves && now() >= ceoArenaState.nextWaveAt){
    ceoArenaState.betweenWaves = false;
    beginCeoArenaWave(ceoArenaState.waveIndex + 1);
  }
}

function hellscapeSpawnX(){
  if(!hellscapeState) return initialSpawnX;
  const pool = (hellscapeState.spawnPoints && hellscapeState.spawnPoints.length)
    ? hellscapeState.spawnPoints
    : [initialSpawnX, levelWidth() - 180];
  const choice = pool[Math.floor(Math.random()*pool.length)] || initialSpawnX;
  const jitter = (Math.random()*160) - 80;
  const minX = 60;
  const maxX = Math.max(minX+40, levelWidth() - 140);
  return Math.max(minX, Math.min(maxX, choice + jitter));
}

function hellscapeWaveTarget(wave){
  if(!Number.isFinite(wave) || wave <= 0){
    return HELL_PRESET_WAVE_TARGETS[0];
  }
  const index = Math.floor(wave) - 1;
  if(index < HELL_PRESET_WAVE_TARGETS.length){
    return HELL_PRESET_WAVE_TARGETS[index];
  }
  const overflow = index - (HELL_PRESET_WAVE_TARGETS.length - 1);
  return HELL_PRESET_WAVE_TARGETS[HELL_PRESET_WAVE_TARGETS.length - 1] + overflow * 100;
}

function hellscapeTotalKillTarget(goalWave){
  if(!Number.isFinite(goalWave)){ return HELL_OPTIONAL_KILL_TARGET; }
  const n = Math.max(1, goalWave);
  return Math.round(10 * (n * (n + 1)) / 2);
}

function hellscapeStrengthForWave(wave){
  const index = Math.max(0, (wave||1) - 1);
  const growth = 1 + index * 0.025;
  return {
    hp: Math.min(3, growth),
    speed: Math.min(2.5, growth)
  };
}

function resolveHellscapeSpawnX(rawX){
  if(!hellscapeState){
    return rawX;
  }
  const minX = 60;
  const maxX = Math.max(minX + 40, levelWidth() - 140);
  const playerCenter = player.x + player.w/2;
  const viewStart = camX;
  const viewEnd = camX + W;
  let spawnX = Number.isFinite(rawX) ? rawX : hellscapeSpawnX();
  const minPlayerDistance = W * 0.25;
  if(Math.abs(spawnX - playerCenter) < minPlayerDistance){
    const dir = spawnX < playerCenter ? -1 : 1;
    spawnX = playerCenter + dir * minPlayerDistance;
  }
  if(spawnX > viewStart - 40 && spawnX < viewEnd + 40){
    const dir = spawnX < playerCenter ? -1 : 1;
    spawnX = dir > 0 ? viewEnd + 80 : viewStart - 80;
  }
  if(spawnX < minX){ spawnX = minX; }
  if(spawnX > maxX){ spawnX = maxX; }
  return spawnX;
}

function spawnHellscapeZombie(spawnX, options={}){
  if(!hellscapeState) return null;
  const minX = 60;
  const maxX = Math.max(minX + 40, levelWidth() - 140);
  const x = options.forcePosition
    ? Math.max(minX, Math.min(maxX, Number.isFinite(spawnX) ? spawnX : hellscapeSpawnX()))
    : resolveHellscapeSpawnX(spawnX);
  const groundY = floorSlab ? floorSlab.y : (H - GUARD_HEIGHT - 40);
  const zombieHeight = 48;
  const baseSpeed = (hellscapeState && hellscapeState.zombieSpeed) ? hellscapeState.zombieSpeed : 0.48;
  const baseHp = (hellscapeState && hellscapeState.zombieHp) ? hellscapeState.zombieHp : 32;
  const wave = (hellscapeState && hellscapeState.wave) ? hellscapeState.wave : 1;
  const strength = hellscapeStrengthForWave(wave);
  const hpRoll = strength.hp <= 1 ? 1 : (1 + Math.random() * (strength.hp - 1));
  const speedRoll = strength.speed <= 1 ? 1 : (1 + Math.random() * (strength.speed - 1));
  const zombieHp = Math.round(baseHp * hpRoll);
  const zombieSpeed = baseSpeed * speedRoll;
  const zombie = new Agent({
    x,
    y: groundY - zombieHeight,
    w: 24,
    h: zombieHeight,
    vx: 0,
    hp: zombieHp,
    maxHp: zombieHp,
    dmg: Math.round(GUARD_BASE_DAMAGE * 0.9),
    type: 'zombie',
    weapon: 'melee',
    attackInterval: 1400,
    shotInterval: 0,
    speed: zombieSpeed,
    direction: Math.random()<0.5 ? -1 : 1,
    aggressive: true,
    chaser: true
  });
  zombie.flashlight = false;
  zombie.spawnOrigin = x;
  zombie.hellscape = true;
  zombie.wave = wave;
  guards.push(zombie);
  return zombie;
}

function spawnHellscapeCommando(spawnX){
  if(!hellscapeState) return null;
  const x = Number.isFinite(spawnX) ? spawnX : hellscapeSpawnX();
  const groundY = floorSlab ? floorSlab.y : (H - GUARD_HEIGHT - 40);
  const commando = new Agent({
    x,
    y: groundY - GUARD_HEIGHT,
    w: GUARD_WIDTH,
    h: GUARD_HEIGHT,
    vx: 0,
    hp: 36,
    maxHp: 36,
    dmg: Math.round(GUARD_BASE_DAMAGE * 1.2),
    type: 'commando',
    weapon: 'auto',
    attackInterval: 520,
    shotInterval: 170,
    speed: 1.32,
    direction: Math.random()<0.5 ? -1 : 1,
    aggressive: true,
    chaser: true
  });
  commando.flashlight = false;
  commando.spawnOrigin = x;
  commando.hellscape = true;
  guards.push(commando);
  return commando;
}

function completeHellscapeGoal(){
  if(!hellscapeState || hellscapeState.goalComplete) return;
  const state = hellscapeState;
  state.goalComplete = true;
  state.awaitingNextWave = false;
  state.nextWaveAt = 0;
  state.spawnTimer = 0;
  state.commandCooldown = 0;
  state.waveKills = state.waveTarget || state.waveKills || 0;
  state.waveSpawns = state.waveTarget || state.waveSpawns || 0;
  unlockHellscapeExit({ silent:true });
  centerNote('All zombie waves cleared — Exit Break Room unlocked!', 2400);
  notify('All zombie waves neutralized. Elevator unlocked.');
}

function unlockHellscapeExit(options={}){
  if(!hellscapeState) return;
  const state = hellscapeState;
  const { silent=false } = options;
  if(!state.exitUnlocked){
    state.exitUnlocked = true;
    if(door){
      door.unlocked = true;
      door.glowUntil = now() + 4000;
    }
    if(!silent && !state.exitNoticeShown){
      state.exitNoticeShown = true;
      notify('Optional evac unlocked — the Exit Break Room is open.');
      centerNote('Optional evac unlocked — exit when ready.', 2400);
    }
  } else if(door){
    door.unlocked = true;
  }
  if(silent && !state.exitNoticeShown){
    state.exitNoticeShown = true;
  }
}

function advanceHellscapeWave(nextWaveIndex){
  if(!hellscapeState) return;
  const state = hellscapeState;
  const current = state.wave || 1;
  const nextWave = Number.isFinite(nextWaveIndex) ? nextWaveIndex : current + 1;
  if(state.goalWave && nextWave > state.goalWave){
    completeHellscapeGoal();
    return;
  }
  state.wave = Math.max(1, nextWave);
  state.waveKills = 0;
  state.waveSpawns = 0;
  state.waveTarget = hellscapeWaveTarget(state.wave);
  state.awaitingNextWave = false;
  state.waveClearedAt = 0;
  state.nextWaveAt = 0;
  const baseInterval = state.spawnInterval || HELL_SPAWN_INTERVAL_BASE;
  state.spawnTimer = Math.max(0, baseInterval * 0.9 * ZOMBIE_SPAWN_RATE_MULTIPLIER);
  state.zombieSpawnCycle = 0;
  notify(`Wave ${state.wave} incoming — ${state.waveTarget} zombies detected.`);
  centerNote(`Wave ${state.wave} incoming!`, 2000);
}

function recordHellscapeZombieKill(){
  if(!hellscapeState) return { waveCleared:false, goalCompleted:false };
  const state = hellscapeState;
  const previousTotal = state.zombiesKilled || 0;
  state.zombiesKilled = previousTotal + 1;
  state.waveKills = (state.waveKills || 0) + 1;
  const waveTarget = state.waveTarget || hellscapeWaveTarget(state.wave || 1);
  let waveCleared = false;
  let goalCompleted = false;
  const optionalTarget = state.optionalKillTarget || state.killTarget || HELL_OPTIONAL_KILL_TARGET;
  if(optionalTarget && state.zombiesKilled >= optionalTarget){
    unlockHellscapeExit();
  }
  if(state.waveKills >= waveTarget){
    state.waveKills = waveTarget;
    waveCleared = true;
    state.waveClearedAt = now();
    const currentWave = state.wave || 1;
    if(state.goalWave && currentWave >= state.goalWave){
      completeHellscapeGoal();
      goalCompleted = true;
    }
    if(!goalCompleted){
      notify(`Wave ${currentWave} cleared — next wave surging.`);
      centerNote(`Wave ${currentWave} cleared!`, 1600);
      advanceHellscapeWave(currentWave + 1);
    }
  }
  return { waveCleared, goalCompleted };
}

function damageHellscapeHostage(hostage, damage){
  if(!hellscapeState || !hostage || hostage.removed || hostage.safe) return false;
  const dmg = Math.max(0, damage || 0);
  if(dmg <= 0) return false;
  hostage.hp = Math.max(0, (hostage.hp || 0) - dmg);
  hostage.hitFlashUntil = now() + 220;
  if(hostage.hp <= 0){
    convertHostageToZombie(hostage);
    return true;
  }
  return false;
}

function convertHostageToZombie(hostage){
  if(!hellscapeState || !hostage) return;
  hostage.removed = true;
  hellscapeState.hostagesLost = (hellscapeState.hostagesLost || 0) + 1;
  notify('A freed hostage was devoured and turned.');
  centerNote('Hostage devoured — new zombie rising!', 1800);
  const zombie = spawnHellscapeZombie(hostage.x, { forcePosition:true });
  if(zombie){
    zombie.y = (floorSlab ? floorSlab.y : (H - GUARD_HEIGHT - 40)) - zombie.h;
  }
}

function updateHellscapeHostages(dt){
  if(!hellscapeState || !hellscapeState.hostages) return;
  const groundY = floorSlab ? floorSlab.y : (H - 60);
  for(const hostage of hellscapeState.hostages){
    if(!hostage || hostage.removed) continue;
    if(!hostage.maxHp){
      hostage.maxHp = 300;
    }
    if(typeof hostage.hp !== 'number'){ hostage.hp = hostage.maxHp; }
    if(hostage.freed){
      hostage.vy = (hostage.vy || 0) + GRAV * 0.8;
      hostage.y += hostage.vy;
      if(hostage.y >= groundY){
        hostage.y = groundY;
        hostage.vy = 0;
        hostage.onGround = true;
      } else {
        hostage.onGround = false;
      }
      if(hostage.onGround){
        const dir = hostage.escapeDir || -1;
        const speed = hostage.speed || 1.4;
        hostage.escapeDir = dir;
        hostage.vx = dir * speed;
        hostage.x += hostage.vx;
        const safeThreshold = 36;
        if((dir < 0 && hostage.x <= safeThreshold) || (dir > 0 && hostage.x >= levelWidth() - safeThreshold)){
          hostage.safe = true;
          hostage.removed = true;
          hellscapeState.hostagesRescued = (hellscapeState.hostagesRescued || 0) + 1;
          notify('A freed hostage escaped the horde.');
        }
      }
    } else {
      hostage.idlePhase = (hostage.idlePhase || 0) + dt * 2.2;
    }
  }
  hellscapeState.hostages = hellscapeState.hostages.filter(h=>h && !h.removed);
}

function updateHellscape(dt){
  if(!hellscapeState) return;
  const state = hellscapeState;
  updateHellscapeHostages(dt);
  const nowTs = now();
  const activeZombies = guards.filter(g=>g && g.hp>0 && g.type==='zombie').length;
  if(state.goalComplete){
    state.spawnTimer = 0;
    state.commandCooldown = 0;
    return;
  }
  const difficulty = Math.max(0, (state.wave || 1) - 1);
  const maxZombies = Math.min(60, 12 + (state.wave || 1) * 4);
  const remainingSpawns = Math.max(0, (state.waveTarget || 0) - (state.waveSpawns || 0));
  state.spawnTimer = (state.spawnTimer || 0) + dt;
  const baseInterval = state.spawnInterval || HELL_SPAWN_INTERVAL_BASE;
  const adjustedBase = Math.max(0, baseInterval - difficulty * 0.12);
  const interval = Math.max(0.3, adjustedBase * ZOMBIE_SPAWN_RATE_MULTIPLIER);
  if(remainingSpawns > 0 && state.spawnTimer >= interval){
    if(activeZombies < maxZombies){
      const spawnNearPlayer = ((state.zombieSpawnCycle || 0) % 2) === 1;
      let spawnX = null;
      if(spawnNearPlayer){
        const px = player.x + player.w/2;
        const jitter = (Math.random()*110) - 55;
        const minX = 60;
        const maxX = Math.max(minX + 40, levelWidth() - 140);
        spawnX = Math.max(minX, Math.min(maxX, px + jitter));
      } else if(state.cemeterySpawnPoints && state.cemeterySpawnPoints.length){
        const idx = state.cemeteryIndex || 0;
        spawnX = state.cemeterySpawnPoints[idx % state.cemeterySpawnPoints.length];
        state.cemeteryIndex = (idx + 1) % state.cemeterySpawnPoints.length;
      }
      if(state.waveSpawns < state.waveTarget){
        const spawned = spawnHellscapeZombie(spawnX);
        if(spawned){
          state.waveSpawns = (state.waveSpawns || 0) + 1;
        }
      }
      if(state.waveSpawns < state.waveTarget && Math.random() < 0.32 + difficulty * 0.06 && activeZombies + 1 < maxZombies){
        let extraSpawnX = null;
        if(spawnNearPlayer && state.cemeterySpawnPoints && state.cemeterySpawnPoints.length){
          const rand = Math.floor(Math.random() * state.cemeterySpawnPoints.length);
          extraSpawnX = state.cemeterySpawnPoints[rand];
        }
        const spawnedExtra = spawnHellscapeZombie(extraSpawnX);
        if(spawnedExtra){
          state.waveSpawns = (state.waveSpawns || 0) + 1;
        }
      }
    }
    state.spawnTimer = 0;
    state.zombieSpawnCycle = (state.zombieSpawnCycle || 0) + 1;
  }
  state.commandCooldown = Math.max(0, (state.commandCooldown || 0) - dt);
  const activeCommandos = guards.filter(g=>g && g.hp>0 && g.type==='commando').length;
  const desiredCommandos = Math.min(6, 1 + Math.floor((state.wave || 1) / 2));
  if(state.commandCooldown <= 0 && activeCommandos < desiredCommandos){
    spawnHellscapeCommando();
    state.commandCooldown = Math.max(3, 5.6 - difficulty * 0.45);
  }
}

function makeCorporateHellscapeLevel(i){
  const goalWave = HELL_WAVE_GOALS[i] ?? Infinity;
  hellscapeState = {
    floor: i,
    goalWave,
    wave: 1,
    waveTarget: hellscapeWaveTarget(1),
    waveSpawns: 0,
    waveKills: 0,
    killTarget: HELL_OPTIONAL_KILL_TARGET,
    optionalKillTarget: HELL_OPTIONAL_KILL_TARGET,
    zombiesKilled: 0,
    commandosKilled: 0,
    spawnTimer: HELL_SPAWN_INTERVAL_BASE * 0.9,
    spawnInterval: HELL_SPAWN_INTERVAL_BASE,
    commandCooldown: 4.6,
    disableFeather: true,
    hostages: [],
    hostagesRescued: 0,
    hostagesLost: 0,
    spawnPoints: [],
    fieldSpawnPoints: [],
    cemeterySpawnPoints: [],
    cemeteryIndex: 0,
    zombieSpawnCycle: 0,
    zombieSpeed: 0.48 * 1.1,
    zombieHp: 32,
    snackFound: false,
    buffUntil: 0,
    goalComplete: false,
    awaitingNextWave: false,
    nextWaveAt: 0,
    exitUnlocked: false,
    exitNoticeShown: false
  };
  serverObjective = false;
  inflationActive = false;
  bonusFloorActive = false;
  activePalette = computePaletteForFloor(i);
  lightingCondition = 'storm';
  setLevelWidth(BASE_LEVEL_WIDTH * 6);
  const span = levelWidth();
  const yBase = H - 60;
  walls.push({x:0,y:0,w:span,h:H});
  floorSlab = {x:0, y:yBase, w:span, h:24};
  backgroundFX.push({type:'hellscapeSky'});

  const baseBuildingCount = 9;
  const buildingCount = Math.max(baseBuildingCount, Math.round(baseBuildingCount * 1.75));
  const clusterSizes = [12, 7, 3, 1];
  const clusterPlan = [];
  let remainingBuildings = buildingCount;
  while(remainingBuildings > 0){
    const options = clusterSizes.filter(size=>size <= remainingBuildings);
    const size = options[Math.floor(Math.random()*options.length)] || 1;
    clusterPlan.push(size);
    remainingBuildings -= size;
  }
  const clusterSpacing = span / (clusterPlan.length + 1);
  const hostages = hellscapeState.hostages;
  const fieldZones = [];
  let previousEdge = 80;
  clusterPlan.forEach((clusterSize, idx)=>{
    const clusterCenter = 120 + (idx+1) * clusterSpacing;
    const avgWidth = 120 + Math.random()*110;
    const gap = 30 + Math.random()*28;
    const totalWidth = clusterSize * avgWidth + (clusterSize-1) * gap;
    let start = clusterCenter - totalWidth/2;
    start = Math.max(60, Math.min(span - totalWidth - 160, start));
    if(start - previousEdge > 140){
      fieldZones.push({ x: previousEdge, w: start - previousEdge });
    }
    let cursor = start;
    for(let n=0; n<clusterSize; n++){
      const width = Math.max(90, avgWidth * (0.8 + Math.random()*0.5));
      const roofY = yBase - (150 + Math.random()*130);
      const midY = roofY + 58 + Math.random()*28;
      const lowerY = Math.min(yBase - 76, midY + 48 + Math.random()*30);
      const catwalkY = roofY + 28 + Math.random()*26;
      const buildingStart = Math.max(80, Math.min(span - width - 140, cursor));
      const roofPlatform = {x:buildingStart, y:roofY, w:width, h:12, isPlatform:true};
      const midPlatform = {x:buildingStart + 18, y:midY, w:width - 36, h:12, isPlatform:true};
      const lowerPlatform = {x:buildingStart + 26, y:lowerY, w:width - 52, h:12, isPlatform:true};
      const catwalkPlatform = {x:buildingStart + 34, y:catwalkY, w:width - 68, h:10, isPlatform:true};
      walls.push(roofPlatform, catwalkPlatform, midPlatform, lowerPlatform);
      const ladderCenter = buildingStart + width/2 - 10;
      ladders.push({x:ladderCenter, y:roofY, w:20, h:lowerY - roofY + 12});
      ladders.push({x:buildingStart + 32, y:catwalkY, w:18, h:midY - catwalkY + 12});
      ladders.push({x:buildingStart + width - 52, y:midY, w:18, h:lowerY - midY + 12});
      const centerX = buildingStart + width/2;
      hellscapeState.spawnPoints.push(centerX);
      hellscapeState.spawnPoints.push(centerX + 40 * (Math.random()<0.5?-1:1));
      hellscapeState.spawnPoints.push(centerX + 64 * (Math.random()<0.5?-1:1));
      backgroundFX.push({type:'hellscapeBuilding', x:buildingStart - 12, y:roofY-66, w:width + 24, h:yBase - (roofY-66)});
      if(Math.random() < 0.7){
        backgroundFX.push({type:'hellscapeFire', x:centerX, y:roofY + 12, h:94 + Math.random()*22});
      }
      if(Math.random() < 0.6){
        backgroundFX.push({type:'hellscapeFire', x:centerX + 32 * (Math.random()<0.5?-1:1), y:midY + 4, h:70 + Math.random()*18});
      }
      if(Math.random() < 0.8){
        backgroundFX.push({type:'hellscapeSmoke', x:buildingStart - 36, y:roofY + 18, w:32, h:120 + Math.random()*40, drift:0.3 + Math.random()*0.35});
      }
      if(Math.random() < 0.75){
        backgroundFX.push({type:'hellscapeSmoke', x:buildingStart + width + 18, y:midY + 12, w:28, h:110 + Math.random()*40, drift:0.25 + Math.random()*0.3});
      }
      const lootMidY = midY - 28;
      const lootLowerY = lowerY - 36;
      if((idx + n) % 2 === 0){
        pickups.push({type:'ammo', x:centerX - 10, y:lootMidY, w:20, h:20, amount:36});
        pickups.push({type:'intel', x:centerX - 58, y:lootLowerY, w:20, h:20, amount:3});
      } else {
        pickups.push({type:'medkit', x:centerX - 10, y:lootMidY, w:20, h:20, amount:65});
        pickups.push({type:'cash', x:centerX + 46, y:lootLowerY, w:22, h:22, amount:420, noteLabel:'Hazard Pay'});
      }
      const shouldPlaceHostage = hostages.length < 1 && (
        Math.random() < 0.55 || (idx === clusterPlan.length - 1 && n === clusterSize - 1)
      );
      if(shouldPlaceHostage){
        hostages.push({
          x: centerX,
          y: midY + 42,
          h: 42,
          freed: false,
          hp: 300,
          maxHp: 300,
          escapeDir: Math.random()<0.5 ? -1 : 1,
          speed: 1.2 + Math.random()*0.5
        });
      }
      cursor = buildingStart + width + gap;
    }
    previousEdge = Math.max(previousEdge, cursor + 80);
  });
  if(span - previousEdge > 160){
    fieldZones.push({ x: previousEdge, w: span - previousEdge - 120 });
  }

  for(const field of fieldZones){
    if(field.w <= 0) continue;
    backgroundFX.push({type:'hellscapeField', x:field.x, y:yBase, w:field.w, h:60});
    hellscapeState.fieldSpawnPoints.push(field.x + field.w/2);
    const trees = Math.max(5, Math.round(field.w / 40));
    for(let t=0; t<trees; t++){
      const tx = field.x + 20 + Math.random()*Math.max(20, field.w - 40);
      const height = 70 + Math.random()*90;
      backgroundFX.push({type:'hellscapeTree', x:tx, base:yBase, h:height});
      if(Math.random() < 0.35){
        backgroundFX.push({type:'hellscapeSmoke', x:tx + (Math.random()<0.5?-30:30), y:yBase - height + 20, w:24, h:90 + Math.random()*40, drift:0.2 + Math.random()*0.25});
      }
      if(Math.random() < 0.4){
        hellscapeState.spawnPoints.push(tx);
      }
    }
  }

  const turretWidth = 160;
  const turretHeight = 120;
  const turretX = Math.max(160, Math.min(span - turretWidth - 160, span/2 - turretWidth/2));
  const turretY = yBase - turretHeight - 18;
  const turretStation = { x: turretX, y: turretY, w: turretWidth, h: turretHeight, used:false, promptShown:false, theme:'hellscape' };
  arcadeStations.push(turretStation);
  backgroundFX.push({type:'hellscapeGunMount', x:turretX, y:turretY, w:turretWidth, h:turretHeight});

  const graveyardCount = 5;
  for(let g=0; g<graveyardCount; g++){
    const gx = 120 + g * (span/(graveyardCount+1));
    backgroundFX.push({type:'hellscapeGraveyard', x:gx, y:yBase, w:180});
    const spawnX = gx + 90;
    hellscapeState.spawnPoints.push(spawnX);
    hellscapeState.cemeterySpawnPoints.push(spawnX);
  }

  for(let t=0; t<22; t++){
    const tx = 40 + Math.random()*(span-80);
    const height = 60 + Math.random()*50;
    backgroundFX.push({type:'hellscapeTree', x:tx, base:yBase, h:height});
  }

  const gasStationX = span*0.45;
  const gasStationY = yBase - 90;
  backgroundFX.push({type:'hellscapeGasStation', x:gasStationX, y:gasStationY, w:200, h:90});
  backgroundFX.push({type:'hellscapeCar', x:gasStationX + 46, y:yBase - 28, w:72, h:28});
  backgroundFX.push({type:'hellscapeFire', x:gasStationX + 140, y:gasStationY + 20, h:90});

  const cabinX = 120;
  const cabinY = yBase - 80;
  backgroundFX.push({type:'hellscapeCabin', x:cabinX, y:cabinY, w:160, h:80});

  const breakRoomX = span - 420;
  const breakRoomY = yBase - 120;
  backgroundFX.push({type:'hellscapeCabin', x:breakRoomX, y:breakRoomY, w:220, h:120, breakroom:true});
  walls.push({x:breakRoomX + 30, y:breakRoomY + 40, w:160, h:12, isPlatform:true});
  ladders.push({x:breakRoomX + 60, y:breakRoomY, w:22, h: yBase - breakRoomY});

  const anecdotePickup = { type:'zombieAnecdote', x:gasStationX + 24, y:gasStationY - 18, w:20, h:20 };
  pickups.push(anecdotePickup);
  hellscapeState.anecdotePickup = anecdotePickup;

  const snackPickup = { type:'snack', x:breakRoomX + 96, y:breakRoomY + 10, w:18, h:18 };
  pickups.push(snackPickup);
  hellscapeState.snackPickup = snackPickup;

  const rooftopX = Math.min(span - 360, span * 0.72);
  const rooftopY = yBase - 220;
  walls.push({x:rooftopX - 80, y:rooftopY, w:180, h:12, isPlatform:true});
  const towerCenterX = rooftopX + 14;
  const towerBaseY = rooftopY;
  const towerHeight = 200;
  const towerTopY = towerBaseY - towerHeight;
  const towerPlatformY = towerTopY - 12;
  ladders.push({x:towerCenterX - 10, y:towerPlatformY, w:20, h:yBase - towerPlatformY});
  walls.push({x:towerCenterX - 36, y:towerPlatformY, w:72, h:12, isPlatform:true});
  backgroundFX.push({ type:'hellscapeRadioTower', x:towerCenterX, base:towerBaseY + 12, h:towerHeight + 36 });
  const optionalServer = { x: towerCenterX - 14, y: towerPlatformY - 26, w:28, h:26, hp: 28, destroyed:false, armed:false, optional:true };
  servers.push(optionalServer);
  totalServersOnFloor = servers.length;
  hellscapeState.serverOptional = optionalServer;

  panels.length = 0;
  spotlights.length = 0;
  workers.length = 0;
  merchants.length = 0;
  floatingPapers.length = 0;
  billboardScreens.length = 0;

  door = { x: span - 260, y: yBase - 240, w: 160, h: 220, unlocked:false, open:false, lift:0, glowUntil:0, label:'EXIT BREAK ROOM' };

  featherRespawnAt = 0;
  featherRespawnLocation = null;

  notify('Corporate Hellscape breach — endless zombie waves inbound. Optional evac unlocks after 100 kills.');
  centerNote('Objective: Endure endless zombie waves, rescue the hostage, grab the snack (optional), then reach the Exit Break Room. Optional evac unlocks after 100 kills.', 3600);
}

function makeLevel(i){
  walls=[]; windowsArr=[]; ladders=[]; vents=[]; servers=[]; panels=[]; cameras=[]; guards=[];
  workers=[]; coffeeMachines=[]; vendingMachines=[]; printers=[]; serverTerminals=[];
  deskDrawers=[]; hazards=[]; stealthZones=[]; backgroundFX=[]; floatingPapers=[];
  billboardScreens=[]; boardTables=[]; merchants=[]; sprinklers=[];
  boardMembers=[];
  boardMemberDefeated=false;
  door=null; alarm=false; alarmUntil=0; destroyedOnFloor=0; totalServersOnFloor=0;
  inSub=false; sub=null; entryVentWorld=null; smokeActive=false; seenDoor=false;
  ecoBossActive=false; ecoBoss=null; ecoProjectiles=[]; hostagesInRoom=[];
  finalHostages=[];
  hellscapeState=null;
  plants=[]; waterCoolers=[]; spotlights=[]; movingPlatforms=[]; pickups=[]; arcadeStations=[];
  topDownState = null;
  ventDungeonState = null;
  droneMissionState = null;
  player.screenFlashUntil = Math.min(player.screenFlashUntil, now());
  player.lawsuitSlowUntil = 0;
  player.punchAnimUntil = 0;
  player.punchCombo = 0;
  player.punchAnimSide = 1;
  arcadeBeatdownActive = false;
  arcadePixelOverlay = false;
  arcadeRampage = null;
  arcadeAim = {x:W/2, y:H*0.55};
  setAmbientForFloor(i);
  sprinklersActiveUntil = 0;
  resetCeoArenaState();

  const doubleWidth = isArcadeBeatdownFloor(i);
  setLevelWidth(doubleWidth ? BASE_LEVEL_WIDTH * 2 : BASE_LEVEL_WIDTH);

  if(CORPORATE_HELLSCAPE_FLOORS.has(i)){
    makeCorporateHellscapeLevel(i);
    camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
    camY = 0;
    return;
  }

  if(DRONE_MISSION_CONFIG[i]){
    startDroneMissionLevel(i);
    camX = 0;
    camY = 0;
    return;
  }

  if(VENT_DUNGEON_FLOORS.has(i)){
    makeVentDungeonLevel(i);
    camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
    camY = computeVentCameraTarget(ventDungeonState);
    return;
  }

  if(TOP_DOWN_FLOORS.has(i)){
    makeTopDownMazeLevel(i);
    camX = 0;
    camY = 0;
    return;
  }

  floorTheme = getFloorTheme(i);
  const levelSpan = levelWidth();
  boardRoomActive = isBoardFloor(i);
  ninjaRound = (i===21);
  if(i === ECO_BOSS_FLOOR){
    spawnEcoBossRoom(i);
    camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
    camY = 0;
    return;
  }
  serverObjective = isServerFloor(i);
  inflationActive = isInflationFloor(i);
  bonusFloorActive = !!(scheduledBonusFloor && scheduledBonusFloor===i && !boardRoomActive && i < FLOORS);
  updateMusicForState();
  evacuationActive=false; evacuationUntil=0;
  powerSurgeUntil=0;
  spotlightDetection=0; elevatorLockedUntil=0;
  interestDrainTimer = now();
  blackMarketOffer=null;
  lightingPulse=0; lightingPhase=0;

  activePalette = computePaletteForFloor(i);
  const baseParallax = i<=12 ? 'cubiclesParallax' : i<=24 ? 'serverParallax' : 'skylineParallax';
  backgroundFX.push({type: baseParallax});

  const baseLighting = floorTheme && floorTheme.lighting ? floorTheme.lighting : 'normal';
  const randomLighting = ['normal','emergency','dim','strobe'];
  lightingCondition = baseLighting;
  if(lightingCondition==='bright') lightingCondition='normal';
  if(lightingCondition==='muted') lightingCondition='dim';
  if(lightingCondition==='glow') lightingCondition='neon';
  if(!boardRoomActive && Math.random()<0.35){
    lightingCondition = randomLighting[Math.floor(Math.random()*randomLighting.length)];
  }
  if(baseLighting==='storm') lightingCondition='storm';
  if(baseLighting==='minimal' && lightingCondition==='normal') lightingCondition='dim';
  if(baseLighting==='neon') lightingCondition='neon';

  if(i % PAYDAY_INTERVAL === 0 && i!==0){
    const pay = 500 + Math.floor(Math.random()*501);
    addChecking(pay);
    notify(`Payday deposit +$${pay}.`);
    centerNote('Payday!', 1400);
  }

  if(inflationActive){
    player.cashMultiplier = 0.6;
    player.interestRate = 2;
    centerNote('Inflation Floor – cash worth less & interest doubled!', 1600);
    notify('Inflation floor active: earnings shrink and interest surges.');
  } else {
    player.cashMultiplier = 1;
    player.interestRate = 0;
  }

  if(serverObjective){
    notify('Server objectives active. Destroy racks to reduce interest.');
  }

  if(bonusFloorActive){
    notify('Bonus floor discovered. Grab the cash!');
    centerNote('Bonus Floor', 1500);
  }

  const yBase = H-50;

  walls.push({x:0,y:0,w:levelSpan,h:H});
  floorSlab={x:0,y:yBase,w:levelSpan,h:16};

  if(i === FLOORS){
    makeCeoPenthouseArena(yBase);
    totalServersOnFloor = servers.length;
    camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
    camY = 0;
    return;
  }

  if(isArcadeBeatdownFloor(i)){
    makeArcadeBeatdownLevel(i, yBase);
    camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
    camY = 0;
    return;
  }

  const windowRows = boardRoomActive ? 2 : 3;
  const cols=18;
  const spacingX=(levelSpan-200)/cols;
  const startX=80;
  for(let r=0;r<windowRows;r++){
    for(let c=0;c<cols;c++){
      const wx=startX+c*spacingX, wy=60+r*48;
      windowsArr.push({x:wx,y:wy,w:36,h:24});
    }
  }

  if(boardRoomActive){
    makeBoardRoomLevel(i, yBase);
    totalServersOnFloor = servers.length;
    camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
    camY = 0;
    return;
  }

  const layerYs = [];
  if(i===7){
    const lower = yBase - 140;
    const upper = yBase - 240;
    layerYs.push(lower, upper);
    walls.push({x:0.2*W, y:lower, w:2.6*W, h:12, isPlatform:true});
    walls.push({x:0.2*W, y:upper, w:2.6*W, h:12, isPlatform:true});
    spotlights.push({x:0.25*W, y:upper-48, w:140, h:20, range:320, t:0, speed:1.1, server:true});
    spotlights.push({x:1.5*W, y:upper-48, w:140, h:20, range:320, t:Math.PI, speed:0.9, server:true});
    lightingCondition = 'dim';
  } else {
    const upperCount = 1 + Math.floor(Math.random()*2);
    for(let L=0; L<upperCount; L++){
      const ly = yBase - 120 - L*110;
      layerYs.push(ly);
      const segments = 2 + Math.floor(Math.random()*2);
      for(let s=0;s<segments;s++){
        const segW = 0.5*W;
        const wx = 0.2*W + s*((levelSpan-0.4*W)/(segments+1));
        walls.push({x:wx, y:ly, w:segW, h:10, isPlatform:true});
        if(Math.random()<0.35){
          movingPlatforms.push({x:wx+segW+30, y:ly-32, w:90, h:10, vx:(Math.random()<0.5?-1:1)*1.05, range:130, cx:0});
        }
      }
    }
  }

  const deskCount = 6 + Math.floor(i/4) + (floorTheme && floorTheme.guard && floorTheme.guard.countMod ? Math.max(0, Math.round(-floorTheme.guard.countMod)) : 0);
  for(let d=0; d<deskCount; d++){
    const x=120 + d* ( (levelSpan-240)/Math.max(1, deskCount) );
    const w=70,h=38; const y=yBase - h;
    desks.push({x,y,w,h});
    deskDrawers.push({x:x+10,y:y+6,w:14,h:12, used:false});
    stealthZones.push({x,y,w,h});
  }

  const plantCount = 3 + Math.floor(Math.random()*4);
  for(let p=0;p<plantCount;p++){
    const x=200 + p* ( (levelSpan-400)/Math.max(1,plantCount-1) );
    const y=yBase-30;
    plants.push({x,y,w:24,h:30});
  }

  waterCoolers.push({x: 1.2*W, y: yBase-60, w:28,h:60});

  coffeeMachines.push({x:0.25*W, y:yBase-60, w:32, h:58, used:false});
  vendingMachines.push(createVendingMachine(2.45*W, yBase-70, 36, 68, i));
  printers.push({x:0.9*W, y:yBase-56, w:34, h:40, jammed:false});
  if(layerYs.length>0){
    printers.push({x:1.6*W, y:layerYs[0]-40, w:34, h:40, jammed:false});
    coffeeMachines.push({x:2*W, y:layerYs[0]-50, w:32, h:50, used:false});
  }

  const ladderHeight = layerYs.length>0 ? (yBase - Math.min(...layerYs) + 40) : 160;
  ladders.push({x: 0.8*W, y: yBase- ladderHeight, w:20, h:ladderHeight});
  ladders.push({x: 1.8*W, y: yBase- ladderHeight, w:20, h:ladderHeight});

  const ventBaseY = layerYs.length>0 ? layerYs[0]-24 : (yBase-120);
  vents.push({x: 0.6*W+40, y: ventBaseY, w:26,h:20, needScrew:true, open:false, id:'A'});
  vents.push({x: 2.1*W, y: yBase-46, w:26,h:20, needScrew:true, open:false, id:'B'});

  const pickCount = bonusFloorActive ? 20 : 14;
  for(let k=0;k<pickCount;k++){
    const ptypePool = bonusFloorActive ? ['cash'] : ['file','intel','ammo','cash','cash','ammo'];
    const type = ptypePool[Math.floor(Math.random()*ptypePool.length)];
    const onPlatform = layerYs.length>0 && Math.random()<0.6;
    const platformY = layerYs.length>0 ? layerYs[Math.floor(Math.random()*layerYs.length)] : yBase;
    const y = onPlatform ? (platformY - 22) : (yBase - 24);
    const x = 120 + Math.random()*(levelSpan-240);
    let amount = undefined;
    if(type==='cash'){
      const base = bonusFloorActive ? (40 + Math.random()*80) : (10 + Math.random()*20);
      amount = Math.max(5, Math.round(base * (player.cashMultiplier||1)));
    }
    if(type==='ammo'){ amount = bonusFloorActive ? 24 : 18; }
    pickups.push({type, x, y, w:18, h:18, amount});
  }
  placeFloorFeather(layerYs, yBase);
  if(i%2===1 && !player.hasScrew){ pickups.push({type:'screw', x: 0.35*W, y: yBase-24, w:18, h:18}); }

  const serverPool=[];
  if(!bonusFloorActive){
    const serverBaseCount = serverObjective ? 5 : 3;
    const scount = serverBaseCount + (layerYs.length>1 ? 1 : 0);
    for(let s=0;s<scount;s++){
      const layerIndex = layerYs.length>0 ? (s % layerYs.length) : -1;
      const sy = layerIndex>=0 ? layerYs[layerIndex]-26 : (yBase-36);
      const sx = 160 + Math.random()*(levelSpan-320);
      serverPool.push({x:sx, y:sy, w:28, h:26, hp: 12 + Math.floor(i/4), destroyed:false, armed:false, armTime:0});
    }
  }
  servers.push(...serverPool);
  totalServersOnFloor = servers.length;
  if(serverObjective && !bonusFloorActive){
    serverTerminals.push({x:0.5*W, y:(layerYs[0]|| (yBase-120))-32, w:26, h:32, hacked:false});
  }

  panels.push({x: 2.5*W, y: yBase-60, w:28,h:24, disabled:false});

  if(i!==7){
    spotlights.push({x:0.45*W, y:yBase-110, w:80,h:18, range:200, t:0, speed:1.0});
  }

  if(Math.random()<0.28 && i>4){
    hazards.push({type:'electric', x:1.1*W, y:yBase-8, w:180, h:6, pulse:0});
  }
  if(Math.random()<0.22 && i>10){
    hazards.push({type:'steam', x:1.6*W, y:yBase-140, w:80, h:120, t:0});
  }
  if(Math.random()<0.18 && i>20){
    hazards.push({type:'fall', x:2.3*W, y:yBase-16, w:120, h:16, t:0, open:false});
  }

  const themeVisuals = floorTheme && floorTheme.visuals ? floorTheme.visuals : {};
  if(themeVisuals.floatingPapers){
    for(let p=0;p<12;p++){ floatingPapers.push({x:Math.random()*levelSpan, y:40+Math.random()*200, sway:Math.random()*Math.PI*2}); }
  }
  if(themeVisuals.billboards){
    billboardScreens.push({x:0.5*W, y:90, w:220, h:60});
    billboardScreens.push({x:2.1*W, y:160, w:220, h:60});
  }
  if(themeVisuals.tickers){
    backgroundFX.push({type:'ticker', y:46});
  }
  if(themeVisuals.sparks){
    hazards.push({type:'spark', x:Math.random()*levelSpan, y:yBase-60, w:36, h:20, t:0});
  }
  if(themeVisuals.redAccent){
    lightingCondition = 'minimal';
  }
  if(themeVisuals.skyline){
    backgroundFX.push({type:'skyline'});
  }
  if(themeVisuals.posters){
    backgroundFX.push({type:'poster', x:0.4*W, y:yBase-180});
    backgroundFX.push({type:'poster', x:2.2*W, y:yBase-200});
  }

  const blackMarketChance = (!bonusFloorActive && !serverObjective && i>4 && Math.random()<0.18);
  if(blackMarketChance){
    const templates=[
      {type:'ammo', currency:'cash', min:150, max:260},
      {type:'upgrade', currency:'cash', min:200, max:320},
      {type:'fuel', currency:'intel', cost:1},
      {type:'weapon', currency:'intel', cost:2}
    ];
    const choice = templates[Math.floor(Math.random()*templates.length)];
    blackMarketOffer = {...choice};
    if('min' in blackMarketOffer){
      const max = blackMarketOffer.max ?? blackMarketOffer.min;
      const cost = blackMarketOffer.min + Math.floor(Math.random()*((max||blackMarketOffer.min) - blackMarketOffer.min + 1));
      blackMarketOffer.cost = cost;
      delete blackMarketOffer.min;
      delete blackMarketOffer.max;
    }
    merchants.push({x:1.4*W, y:yBase-70, w:40, h:60, offer:blackMarketOffer, opened:false});
    notify('Black market contact spotted on this floor.');
  }

  door = { x: levelSpan-160, y: yBase-120, w:120, h:120, unlocked: bonusFloorActive || totalServersOnFloor===0, open:false, lift:0, glowUntil:0 };

  let gcount = bonusFloorActive ? 0 : (7 + Math.min(6, Math.floor(i/3)));
  if(floorTheme && floorTheme.guard && typeof floorTheme.guard.countMod==='number'){
    gcount += Math.round(floorTheme.guard.countMod);
  }
  if(serverObjective) gcount += 2;
  if(ninjaRound) gcount = Math.max(4, gcount);
  gcount = Math.max(0, gcount);

  const initialSpawns = [];
  for(let g=0; g<gcount; g++){
    const gx = pickGuardSpawn([...initialSpawns]);
    initialSpawns.push(gx);
    guards.push(makeGuard(gx, yBase-42, i));
  }

  if(!managerDefeated && managerCheckFloor && i===managerCheckFloor){
    const manager = makeGuard(1.5*W, yBase-46, Math.min(FLOORS, i+2));
    manager.manager=true;
    manager.type='manager';
    manager.maxHp = Math.round(manager.maxHp * 2.2);
    manager.hp = manager.maxHp;
    manager.damageReduction = Math.min(0.6, (manager.damageReduction||0) + 0.25);
    manager.speed = (manager.speed||1) * 1.15;
    manager.vx = (Math.sign(manager.vx)||1) * manager.speed;
    manager.lastShot=0;
    guards.push(manager);
    notify('Manager check-in! Miniboss deployed.');
    centerNote('Manager Check-in!', 1600);
  }

  const workerZones = [];
  for(const platform of walls){
    if(platform.isPlatform){
      const min = platform.x;
      const max = platform.x + platform.w - 18;
      if(max > min){
        workerZones.push({min, max, y: platform.y - 38});
      }
    }
  }
  workerZones.push({min: 80, max: levelSpan - 198, y: yBase - 38});
  const workerCount = bonusFloorActive ? 0 : Math.max(4, Math.min(8, workerZones.length ? workerZones.length * 2 : 4));
  for(let w=0; w<workerCount; w++){
    const zone = workerZones[w % workerZones.length];
    const min = zone.min;
    const max = zone.max;
    if(max <= min) continue;
    const startX = min + Math.random() * (max - min);
    const speed = 0.45 + Math.random() * 0.35;
    const vx = (Math.random()<0.5 ? -speed : speed);
    const appearance = createWorkerAppearance();
    const showTie = !!appearance.tie && Math.random()<0.85;
    workers.push({
      x:startX,
      y:zone.y,
      w:18,
      h:38,
      vx,
      minX:min,
      maxX:max,
      bob: Math.random() * Math.PI * 2,
      alive:true,
      hp:10,
      maxHp:10,
      rewardClaimed:false,
      hitFlashUntil:0,
      facing: vx>=0?1:-1,
      appearance,
      showTie,
      hasBadge: Math.random()<0.6,
      hasClipboard: Math.random()<0.28,
      clipboardSide: Math.random()<0.5 ? -1 : 1,
      glasses: Math.random()<0.24
    });
  }

  if(evacuationActive && now()<evacuationUntil){
    for(const worker of workers){ worker.vx *= 1.6; }
    if(sprinklers.length===0){ activateSprinklers(yBase, evacuationUntil); }
    sprinklersActiveUntil = Math.max(sprinklersActiveUntil, evacuationUntil);
    notify('Evacuation underway! Workers stampede.');
  }

  if(!boardRoomActive){
    if(Math.random()<0.12 && i>3){
      evacuationActive=true; evacuationUntil = now()+15000;
      for(const worker of workers){ worker.vx *= 1.4; }
      activateSprinklers(yBase, evacuationUntil);
      notify('Evacuation event triggered!');
    }
    if(Math.random()<0.08 && i>6){
      powerSurgeUntil = now()+30000;
      elevatorLockedUntil = Math.max(elevatorLockedUntil, powerSurgeUntil);
      notify('Power surge! Elevators offline briefly.');
    }
  }

  camX = clamp(player.x - W*0.45, 0, levelSpan - W);
}

function generateDungeonMazeGraph(cols, rows, extraLoopRatio=0.3, rng=Math.random){
  const key = (r,c)=>`${r}:${c}`;
  const adjacency = new Map();
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      adjacency.set(key(r,c), new Set());
    }
  }
  const stack=[[0,0]];
  const visited=new Set([key(0,0)]);
  const dirs=[{dr:0,dc:1},{dr:1,dc:0},{dr:0,dc:-1},{dr:-1,dc:0}];
  while(stack.length){
    const current=stack[stack.length-1];
    const [r,c]=current;
    const options=[];
    for(const dir of dirs){
      const nr=r+dir.dr;
      const nc=c+dir.dc;
      if(nr<0||nr>=rows||nc<0||nc>=cols) continue;
      const k=key(nr,nc);
      if(!visited.has(k)) options.push({nr,nc});
    }
    if(!options.length){
      stack.pop();
      continue;
    }
    shuffleArray(options, rng);
    const next=options[0];
    const nextKey=key(next.nr,next.nc);
    const curKey=key(r,c);
    adjacency.get(curKey).add(nextKey);
    adjacency.get(nextKey).add(curKey);
    visited.add(nextKey);
    stack.push([next.nr,next.nc]);
  }
  const extra = Math.round(Math.max(0, cols*rows * (extraLoopRatio||0)));
  for(let i=0;i<extra;i++){
    const r=Math.floor(rng()*rows);
    const c=Math.floor(rng()*cols);
    shuffleArray([...dirs], rng).some(dir=>{
      const nr=r+dir.dr;
      const nc=c+dir.dc;
      if(nr<0||nr>=rows||nc<0||nc>=cols) return false;
      const a=adjacency.get(key(r,c));
      const b=adjacency.get(key(nr,nc));
      const neighKey=key(nr,nc);
      if(a.has(neighKey)) return false;
      a.add(neighKey);
      b.add(key(r,c));
      return true;
    });
  }
  return adjacency;
}

function makeVentDungeonLevel(floor){
  const config = VENT_DUNGEON_CONFIG[floor] || VENT_DUNGEON_CONFIG[9];
  floorTheme = getFloorTheme(floor);
  activePalette = computePaletteForFloor(floor);
  lightingCondition = 'dim';
  backgroundFX.length = 0;
  boardRoomActive = false;
  ninjaRound = false;
  serverObjective = false;
  inflationActive = false;
  bonusFloorActive = false;
  evacuationActive = false;
  evacuationUntil = 0;
  powerSurgeUntil = 0;
  elevatorLockedUntil = 0;
  alarm = false;
  state.playerWeaponsDisabled = false;

  const rows = Math.max(3, config.rows || 6);
  const cols = Math.max(3, config.cols || 9);
  const cellWidth = Math.max(120, config.cellWidth || 160);
  const cellHeight = Math.max(96, config.cellHeight || 120);
  const rng = makeSeededRandom(`vent-dungeon-${floor}-${Math.floor(now())}`);
  const hasOptionalHellscape = (floor === 9 || floor === 34);
  const optionalZoneWidth = hasOptionalHellscape ? 260 : 0;
  const optionalZoneGap = hasOptionalHellscape ? 140 : 0;

  const optionalSpanBonus = hasOptionalHellscape ? 2 * (optionalZoneWidth + optionalZoneGap) : 0;
  setLevelWidth(Math.max(BASE_LEVEL_WIDTH * 2, cols * cellWidth + 260 + optionalSpanBonus));
  const levelSpan = levelWidth();
  const yBase = H - 50;
  const walkwayHeight = 12;
  const walkwayMargin = 18;
  const startX = Math.max(80, Math.floor((levelSpan - cols * cellWidth) / 2));
  const walkwayY = row => yBase - row * cellHeight - walkwayHeight;

  walls.push({x:0,y:0,w:levelSpan,h:H});
  floorSlab = {x:0, y:yBase, w:levelSpan, h:16};

  const adjacency = generateDungeonMazeGraph(cols, rows, config.loops || 0.3, rng);
  const walkwayMap = new Map();
  for(let row=0; row<rows; row++){
    for(let col=0; col<cols; col++){
      const wx = startX + col * cellWidth + walkwayMargin;
      const wy = walkwayY(row);
      const ww = cellWidth - walkwayMargin * 2;
      const rect = {x:wx, y:wy, w:ww, h:walkwayHeight, row, col};
      walls.push({...rect, isPlatform:true});
      walkwayMap.set(`${row}:${col}`, rect);
    }
  }

  const boundaryThickness = Math.max(18, Math.round(cellWidth * 0.16));
  const topBoundY = walkwayY(rows-1) - cellHeight - 20;
  walls.push({x:startX - boundaryThickness, y:topBoundY, w:boundaryThickness, h:yBase - topBoundY + 120});
  walls.push({x:startX + cols*cellWidth, y:topBoundY, w:boundaryThickness, h:yBase - topBoundY + 120});
  walls.push({x:startX - boundaryThickness, y:topBoundY, w:cols*cellWidth + boundaryThickness*2, h:boundaryThickness});

  for(let row=0; row<rows; row++){
    for(let col=0; col<cols; col++){
      const key = `${row}:${col}`;
      const neighbors = adjacency.get(key) || new Set();
      if(col < cols-1){
        const eastKey = `${row}:${col+1}`;
        if(!neighbors.has(eastKey)){
          const wallX = startX + (col+1)*cellWidth - boundaryThickness/2;
          const wallY = walkwayY(row) - cellHeight + walkwayHeight;
          const wallH = cellHeight + walkwayHeight + 40;
          walls.push({x:wallX, y:wallY, w:boundaryThickness, h:wallH});
        }
      }
    }
  }

  ladders.length = 0;
  const ladderWidth = 20;
  for(let row=0; row<rows-1; row++){
    for(let col=0; col<cols; col++){
      const key = `${row}:${col}`;
      const southKey = `${row+1}:${col}`;
      const neighbors = adjacency.get(key) || new Set();
      if(neighbors.has(southKey)){
        const base = walkwayMap.get(key);
        const above = walkwayMap.get(southKey);
        if(base && above){
          const ladderX = base.x + base.w/2 - ladderWidth/2;
          const ladderTop = above.y - 10;
          const ladderBottom = base.y + base.h + 12;
          const ladderHeight = Math.max(80, ladderBottom - ladderTop);
          ladders.push({x:ladderX, y:ladderTop, w:ladderWidth, h:ladderHeight});
        }
      }
    }
  }

  const torchCount = Math.max(4, Math.round(cols * 0.8));
  for(let i=0;i<torchCount;i++){
    const col = Math.floor((i/torchCount) * cols * 1.1);
    const clampCol = Math.min(cols-1, Math.max(0, col));
    const rect = walkwayMap.get(`${rows-1}:${clampCol}`);
    if(!rect) continue;
    const tx = rect.x + rect.w/2;
    const ty = rect.y - 160;
    backgroundFX.push({type:'coliseumTorch', x:tx, y:ty, h:180});
  }

  const cells = [];
  for(let row=0; row<rows; row++){
    for(let col=0; col<cols; col++){
      cells.push({row, col});
    }
  }
  const cellKey = (cell)=>`${cell.row}:${cell.col}`;
  const startCell = {row:0, col:0};
  const exitCell = {row:rows-1, col:cols-1};
  const usedCells = new Set([cellKey(startCell), cellKey(exitCell)]);
  const freeCells = () => cells.filter(cell => !usedCells.has(cellKey(cell)));
  const takeCells = (count)=>{
    const pool = freeCells();
    if(pool.length===0) return [];
    shuffleArray(pool, rng);
    const selection = pool.slice(0, Math.min(count, pool.length));
    for(const cell of selection){ usedCells.add(cellKey(cell)); }
    return selection;
  };

  const ventState = {
    floor,
    config,
    adjacency,
    boxes:[],
    requiredBoxes: Math.max(1, config.requiredBoxes || 9),
    hotwiredCount:0,
    missionComplete:false,
    missionAnnounced:false,
    noteValue: config.noteValue || 1000,
    noteLabel: config.noteLabel || '$1,000 Note',
    internsKilled:0,
    internTotal:0,
    door:null,
    cameraBounds:null,
    cameraBaseline:0
  };

  if(hasOptionalHellscape){
    const zones = [];
    const anchorRow = 0;
    const leftAnchor = walkwayMap.get(`${anchorRow}:0`);
    const rightAnchor = walkwayMap.get(`${anchorRow}:${cols-1}`);
    const createHellscapeZone = (side, anchorRect)=>{
      if(!anchorRect || optionalZoneWidth <= 0) return null;
      const baseY = anchorRect.y;
      const zoneX = side==='left'
        ? Math.max(40, anchorRect.x - optionalZoneGap - optionalZoneWidth)
        : Math.min(levelSpan - optionalZoneWidth - 60, anchorRect.x + anchorRect.w + optionalZoneGap);
      const platform = {x:zoneX, y:baseY, w:optionalZoneWidth, h:walkwayHeight, isPlatform:true};
      walls.push(platform);
      if(side==='left'){
        const bridgeStart = zoneX + optionalZoneWidth;
        const bridgeEnd = anchorRect.x;
        if(bridgeEnd > bridgeStart){
          walls.push({x:bridgeStart, y:baseY, w:bridgeEnd - bridgeStart, h:walkwayHeight, isPlatform:true});
        }
      } else {
        const bridgeStart = anchorRect.x + anchorRect.w;
        const bridgeEnd = zoneX;
        if(bridgeEnd > bridgeStart){
          walls.push({x:bridgeStart, y:baseY, w:bridgeEnd - bridgeStart, h:walkwayHeight, isPlatform:true});
        }
      }
      const upperY = Math.max(baseY - 70, topBoundY + 60);
      const upperPlatform = {x:zoneX + 24, y:upperY, w:optionalZoneWidth - 48, h:walkwayHeight, isPlatform:true};
      walls.push(upperPlatform);
      ladders.push({x:zoneX + optionalZoneWidth/2 - ladderWidth/2, y:upperY, w:ladderWidth, h:baseY - upperY + walkwayHeight});
      const buildingTop = upperY - 120;
      const buildingHeight = (baseY + 160) - buildingTop;
      backgroundFX.push({type:'hellscapeBuilding', x:zoneX - 30, y:buildingTop, w:optionalZoneWidth + 60, h:buildingHeight});
      backgroundFX.push({type:'hellscapeFire', x:zoneX + optionalZoneWidth/2, y:upperY - 20, h:90});
      const graveX = side==='left' ? zoneX + optionalZoneWidth - 200 : zoneX + 20;
      backgroundFX.push({type:'hellscapeGraveyard', x:graveX, y:baseY + walkwayHeight + 6, w:180});
      const zone = {
        side,
        x: zoneX,
        width: optionalZoneWidth,
        platformY: baseY,
        upperY,
        spawnPoints: [],
        activated: false
      };
      zone.spawnPoints.push(zoneX + optionalZoneWidth/2);
      zone.spawnPoints.push(graveX + 90);
      const lootBaseX = zoneX + optionalZoneWidth/2;
      const lootUpperY = upperY - 34;
      const lootLowerY = baseY - 32;
      pickups.push({type:'ammo', x:lootBaseX - 12, y:lootUpperY, w:24, h:24, amount:48});
      pickups.push({type:'intel', x:lootBaseX - 70, y:lootUpperY, w:22, h:22, amount:3});
      const cashAmount = Math.round((ventState.noteValue || 1000) * 2.5);
      pickups.push({type:'cash', x:lootBaseX + 38, y:lootLowerY, w:22, h:22, amount:cashAmount, noteLabel:ventState.noteLabel});
      backgroundFX.push({type:'hellscapeFire', x:lootBaseX + (side==='left'?60:-60), y:baseY + 6, h:76});
      return zone;
    };
    const leftZone = createHellscapeZone('left', leftAnchor);
    const rightZone = createHellscapeZone('right', rightAnchor);
    if(leftZone) zones.push(leftZone);
    if(rightZone) zones.push(rightZone);
    ventState.hellscapeZones = zones;
    ventState.hellscapeShotsFired = 0;
    ventState.hellscapeCombatUnlocked = false;
    ventState.hellscapeCombatants = [];
  } else {
    ventState.hellscapeZones = [];
    ventState.hellscapeShotsFired = 0;
    ventState.hellscapeCombatUnlocked = false;
    ventState.hellscapeCombatants = [];
  }

  const cameraTop = Math.min(-40, topBoundY + 60);
  ventState.cameraBounds = { top: cameraTop, bottom: 0 };
  ventState.cameraBaseline = (floorSlab ? floorSlab.y : yBase) - player.h - 24;

  const boxCells = takeCells(ventState.requiredBoxes);
  for(const cell of boxCells){
    const rect = walkwayMap.get(cellKey(cell));
    if(!rect) continue;
    const width = 38;
    const height = 46;
    const bx = rect.x + rect.w/2 - width/2;
    const by = rect.y - height + 6;
    ventState.boxes.push({x:bx, y:by, w:width, h:height, activated:false, glowUntil:0});
  }
  if(ventState.boxes.length < ventState.requiredBoxes){
    ventState.requiredBoxes = ventState.boxes.length;
  }
  const placePickup = (cell, pickup)=>{
    const rect = walkwayMap.get(cellKey(cell));
    if(!rect) return;
    const size = pickup.size || 20;
    const px = rect.x + rect.w/2 - size/2;
    const py = rect.y - size - 6;
    pickups.push({x:px, y:py, w:size, h:size, ...pickup});
  };

  const cashCells = takeCells(5);
  for(const cell of cashCells){
    placePickup(cell, {type:'cash', amount: ventState.noteValue, noteLabel: ventState.noteLabel, size:22});
  }

  const intelCells = takeCells(6);
  for(const cell of intelCells){
    placePickup(cell, {type:'intel', amount:2});
  }

  const fileCells = takeCells(6);
  for(const cell of fileCells){
    placePickup(cell, {type:'file', amount:2});
  }

  const cacheCells = takeCells(4);
  for(const cell of cacheCells){
    placePickup(cell, {type:'cache', intel:2, files:2, size:22});
  }

  const weaponUnlocks = Array.isArray(config.weaponUnlocks) ? [...config.weaponUnlocks] : [];
  for(const weapon of weaponUnlocks){
    const cellsForWeapon = takeCells(1);
    if(!cellsForWeapon.length) break;
    const cell = cellsForWeapon[0];
    placePickup(cell, {type:'weapon', weapon, label:`${weapon} unlock schematic`, size:24});
  }

  const secretPhotos = Array.isArray(config.secretPhotos) ? config.secretPhotos : [];
  const secretCells = takeCells(secretPhotos.length);
  secretPhotos.forEach((photo, idx)=>{
    const cell = secretCells[idx];
    if(!cell) return;
    placePickup(cell, {type:'secret', photo, size:24});
  });

  const internNames = shuffleArray(['Avery','Sam','Jordan','Sky','Mika','Quinn','Riley','Dakota','Toni','Emery','Kai','Devon','Harper','Rowan','Indy','Shiloh','Alex','Robin','Hayden','Sloane'], rng);
  const internCells = takeCells(Math.max(0, config.internCount || 0));
  for(let idx=0; idx<internCells.length; idx++){
    const cell = internCells[idx];
    const rect = walkwayMap.get(cellKey(cell));
    if(!rect) continue;
    const minX = rect.x + 6;
    const maxX = rect.x + rect.w - 24;
    const speed = 0.35 + rng()*0.2;
    const vx = rng()<0.5 ? speed : -speed;
    const appearance = createWorkerAppearance();
    const worker = {
      x: minX + (rect.w-24)/2,
      y: rect.y - 38,
      w:18,
      h:38,
      vx,
      minX,
      maxX,
      bob: rng()*Math.PI*2,
      alive:true,
      hp:8,
      maxHp:8,
      rewardClaimed:false,
      hitFlashUntil:0,
      facing: vx>=0?1:-1,
      appearance,
      showTie:false,
      hasBadge:false,
      hasClipboard:false,
      clipboardSide:1,
      glasses:rng()<0.25,
      isIntern:true,
      internName:`${internNames[idx % internNames.length]} the Intern`
    };
    workers.push(worker);
  }
  ventState.internTotal = workers.filter(w=>w.isIntern).length;

  sprinklers.length = 0;
  movingPlatforms.length = 0;
  vents.length = 0;
  servers.length = 0;
  panels.length = 0;
  cameras.length = 0;
  guards.length = 0;
  plants.length = 0;
  waterCoolers.length = 0;
  spotlights.length = 0;
  printers.length = 0;
  coffeeMachines.length = 0;
  vendingMachines.length = 0;
  serverTerminals.length = 0;

  const exitRect = walkwayMap.get(cellKey(exitCell));
  const doorWidth = 120;
  const doorHeight = 140;
  const doorX = exitRect ? exitRect.x + exitRect.w - doorWidth + 12 : levelSpan - doorWidth - 60;
  const doorY = exitRect ? exitRect.y - doorHeight + exitRect.h + 4 : yBase - doorHeight;
  door = { x:doorX, y:doorY, w:doorWidth, h:doorHeight, unlocked:false, open:false, lift:0, glowUntil:0 };
  ventState.door = door;
  totalServersOnFloor = -1;
  destroyedOnFloor = 0;
  if(ventState.requiredBoxes <= 0){
    ventState.missionComplete = true;
    door.unlocked = true;
  }

  const startRect = walkwayMap.get(cellKey(startCell));
  if(startRect){
    player.x = startRect.x + startRect.w/2 - player.w/2;
    player.y = startRect.y - player.h;
  } else {
    player.x = startX + player.w;
    player.y = yBase - player.h - 20;
  }
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  player.crouch = false;
  player.climbing = false;

  ventDungeonState = ventState;
  resetVentCamera(ventState);
  notify(`${config.name}: Hotwire ${ventState.requiredBoxes} electrical boxes hidden in the vents.`);
  if(ventState.hellscapeZones && ventState.hellscapeZones.length){
    notify('Optional hellscape caches spotted along the far edges. Combatants stay dormant until you fire 3 bullets.');
  }
  centerNote(`Level ${floor} – ${config.name}`, 1800);
  setAmbient('wind');
  updateMusicForState();
  updateHudCommon();
}

function computeVentCameraTarget(state){
  if(!state) return 0;
  const bounds = state.cameraBounds || {};
  const top = Number.isFinite(bounds.top) ? bounds.top : -H;
  const bottom = Number.isFinite(bounds.bottom) ? bounds.bottom : 0;
  const baseline = Number.isFinite(state.cameraBaseline)
    ? state.cameraBaseline
    : ((floorSlab ? floorSlab.y : H) - player.h - 24);
  const target = player.y - baseline;
  return clamp(target, top, bottom);
}

function resetVentCamera(state){
  camY = computeVentCameraTarget(state);
}

function activateVentHellscapeCombatants(){
  if(!ventDungeonState || !Array.isArray(ventDungeonState.hellscapeZones)) return;
  if(ventDungeonState.hellscapeCombatUnlocked) return;
  const zones = ventDungeonState.hellscapeZones;
  if(!zones.length) return;
  ventDungeonState.hellscapeCombatUnlocked = true;
  const zombieSpeed = 0.48 * 1.25;
  for(const zone of zones){
    if(!zone) continue;
    zone.activated = true;
    const baseY = zone.platformY || (floorSlab ? floorSlab.y : H - GUARD_HEIGHT - 40);
    for(const spawnX of zone.spawnPoints || []){
      const agent = new Agent({
        x: spawnX,
        y: baseY - GUARD_HEIGHT,
        w: 24,
        h: GUARD_HEIGHT,
        vx: 0,
        hp: 32,
        maxHp: 32,
        dmg: Math.round(GUARD_BASE_DAMAGE * 0.9),
        type: 'zombie',
        weapon: 'melee',
        attackInterval: 1400,
        shotInterval: 0,
        speed: zombieSpeed,
        direction: Math.random()<0.5 ? -1 : 1,
        aggressive: true,
        chaser: true
      });
      agent.flashlight = false;
      agent.hellscape = true;
      guards.push(agent);
      ventDungeonState.hellscapeCombatants.push(agent);
    }
  }
  notify('Hellscape combatants emerge from the optional zones.');
  centerNote('Hellscape foes engaged!', 1500);
}

function makeTopDownMazeLevel(floor){
  floorTheme = getFloorTheme(floor);
  activePalette = computePaletteForFloor(floor);
  lightingCondition = 'dim';
  backgroundFX.length = 0;
  floorSlab = { x:0, y:H-20, w:W, h:20 };

  const config = TOP_DOWN_FLOOR_CONFIG[floor] || TOP_DOWN_FLOOR_CONFIG[9];
  const baseCols = 29;
  const baseRows = 21;
  const tileSize = Math.max(22, Math.floor(Math.min((W-140)/baseCols, (H-160)/baseRows)));
  const offsetX = Math.floor((W - tileSize * baseCols) / 2);
  const offsetY = Math.floor((H - tileSize * baseRows) / 2);
  const rng = makeSeededRandom(`vent-${floor}-${Math.floor(now())}`);

  const grid = generateTopDownMaze(baseCols, baseRows, rng);
  grid[Math.max(1, baseRows-2)][Math.max(1, baseCols-2)] = 0;
  if(baseCols > 2) grid[Math.max(1, baseRows-2)][baseCols-3] = 0;
  if(baseRows > 2) grid[baseRows-3][Math.max(1, baseCols-2)] = 0;

  const walkableCells = [];
  for(let row=0; row<baseRows; row++){
    for(let col=0; col<baseCols; col++){
      if(grid[row][col] === 0){
        walkableCells.push({ row, col });
      }
    }
  }

  const startCell = { row:1, col:1 };
  const exitCell = { row: Math.max(1, baseRows-2), col: Math.max(1, baseCols-2) };
  const cellKey = (cell)=>`${cell.row}:${cell.col}`;
  const reserved = new Set([cellKey(startCell), cellKey(exitCell)]);
  const takeCells = (count)=>{
    const pool = walkableCells.filter(cell => !reserved.has(cellKey(cell)));
    if(pool.length === 0) return [];
    const shuffled = shuffleArray([...pool], rng);
    const selection = shuffled.slice(0, Math.min(count, shuffled.length));
    for(const cell of selection){ reserved.add(cellKey(cell)); }
    return selection;
  };

  const topDown = {
    floor,
    config,
    cols: baseCols,
    rows: baseRows,
    tileSize,
    offsetX,
    offsetY,
    grid,
    startCell,
    exitCell,
    door:null,
    boxes:[],
    loot:[],
    gaps:[],
    ladders:[],
    interns:[],
    internsKilled:0,
    requiredBoxes: config && Number.isFinite(config.requiredBoxes) ? config.requiredBoxes : 9,
    hotwiredCount:0,
    missionComplete:false,
    missionAnnounced:false,
    exiting:false,
    speed: config && config.speed ? config.speed : 180,
    noteLabel: config && config.noteLabel ? config.noteLabel : '$1,000 Note',
    noteValue: config && Number.isFinite(config.noteValue) ? config.noteValue : 1000,
    secretPhotos: Array.isArray(config && config.secretPhotos) ? config.secretPhotos.slice() : [],
    originalSize:{ w: player.w, h: player.h },
    prevWeaponsDisabled: state.playerWeaponsDisabled
  };

  const startCenter = topDownCellCenter(topDown, startCell.col, startCell.row);
  const exitCenter = topDownCellCenter(topDown, exitCell.col, exitCell.row);
  topDown.door = { x: exitCenter.x, y: exitCenter.y, radius: tileSize * 0.7, open:false, glowUntil:0 };

  const boxCells = takeCells(topDown.requiredBoxes);
  if(boxCells.length < topDown.requiredBoxes){
    topDown.requiredBoxes = boxCells.length;
  }
  if(topDown.requiredBoxes <= 0){
    topDown.requiredBoxes = boxCells.length;
  }
  for(const cell of boxCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.boxes.push({ col:cell.col, row:cell.row, x:center.x, y:center.y, activated:false, glowUntil:0 });
  }

  const gapCells = takeCells(10);
  for(const cell of gapCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.gaps.push({ col:cell.col, row:cell.row, x:center.x, y:center.y, triggered:false });
  }

  const ladderCells = takeCells(10);
  for(const cell of ladderCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.ladders.push({ col:cell.col, row:cell.row, x:center.x, y:center.y, triggered:false });
  }

  const weaponLabels = {
    grenade:'Grenade Launcher',
    saber:'Saber',
    machineGun:'Machine Gun',
    flame:'Flamethrower'
  };
  const weaponCells = takeCells(config.weaponUnlocks.length);
  config.weaponUnlocks.forEach((weapon, idx)=>{
    const cell = weaponCells[idx];
    if(!cell) return;
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.loot.push({ type:'weapon', weapon, label: weaponLabels[weapon] || weapon, x:center.x, y:center.y, collected:false });
  });

  const intelCells = takeCells(10);
  for(const cell of intelCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    const amount = 1 + Math.floor(rng()*2);
    topDown.loot.push({ type:'intel', amount, x:center.x, y:center.y, collected:false });
  }

  const fileCells = takeCells(10);
  for(const cell of fileCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    const amount = 1 + Math.floor(rng()*2);
    topDown.loot.push({ type:'file', amount, x:center.x, y:center.y, collected:false });
  }

  const cashCells = takeCells(8);
  for(const cell of cashCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.loot.push({
      type:'cash',
      amount: topDown.noteValue,
      noteLabel: topDown.noteLabel,
      x:center.x,
      y:center.y,
      collected:false
    });
  }

  const secretCells = takeCells(topDown.secretPhotos.length);
  topDown.secretPhotos.forEach((photo, idx)=>{
    const cell = secretCells[idx];
    if(!cell) return;
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.loot.push({ type:'secret', photo, x:center.x, y:center.y, collected:false });
  });

  const cacheCells = takeCells(6);
  for(const cell of cacheCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.loot.push({ type:'cache', intel:2, files:2, x:center.x, y:center.y, collected:false });
  }

  const upgradeCells = takeCells(3);
  for(const cell of upgradeCells){
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    topDown.loot.push({ type:'upgrade', x:center.x, y:center.y, collected:false });
  }

  const internNames = shuffleArray(['Avery','Sam','Jordan','Sky','Mika','Quinn','Riley','Dakota','Toni','Emery','Kai','Devon','Harper','Rowan','Indy','Shiloh'], rng);
  const internCells = takeCells(Math.max(0, config.internCount || 0));
  internCells.forEach((cell, idx)=>{
    const center = topDownCellCenter(topDown, cell.col, cell.row);
    const name = `${internNames[idx % internNames.length]} the Intern`;
    topDown.interns.push({ name, col:cell.col, row:cell.row, x:center.x, y:center.y, alive:true, hitFlashUntil:0 });
  });

  player.w = 24;
  player.h = 24;
  player.x = startCenter.x - player.w/2;
  player.y = startCenter.y - player.h/2;
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.climbing = false;
  player.crouch = false;
  player.sprint = false;
  player.facing = 1;

  door = { x: exitCenter.x - tileSize/2, y: exitCenter.y - tileSize/2, w: tileSize, h: tileSize, unlocked:false, open:false, lift:0, glowUntil:0 };
  totalServersOnFloor = 0;
  sprinklersActiveUntil = 0;

  topDownState = topDown;
  state.playerWeaponsDisabled = true;
  camX = 0;
  camY = 0;
  notify(`${config.name}: Hotwire ${topDown.requiredBoxes} electrical boxes hidden in the vents.`);
  centerNote(`Level ${floor} – ${config.name}`, 1800);
  updateMusicForState();
  updateHudCommon();
}

function generateTopDownMaze(cols, rows, rng=Math.random){
  const grid = Array.from({length: rows}, ()=>Array(cols).fill(1));
  const stack = [];
  const start = { row:1, col:1 };
  const dirs = [
    { dr:0, dc:2 },
    { dr:0, dc:-2 },
    { dr:2, dc:0 },
    { dr:-2, dc:0 }
  ];
  grid[start.row][start.col] = 0;
  stack.push(start);
  while(stack.length){
    const current = stack[stack.length-1];
    const neighbors = [];
    for(const dir of dirs){
      const nr = current.row + dir.dr;
      const nc = current.col + dir.dc;
      if(nr <= 0 || nr >= rows || nc <= 0 || nc >= cols) continue;
      if(grid[nr][nc] === 1){
        neighbors.push({ row:nr, col:nc, dir });
      }
    }
    if(neighbors.length === 0){
      stack.pop();
      continue;
    }
    shuffleArray(neighbors, rng);
    const next = neighbors[0];
    const midRow = current.row + next.dir.dr/2;
    const midCol = current.col + next.dir.dc/2;
    grid[midRow][midCol] = 0;
    grid[next.row][next.col] = 0;
    stack.push({ row: next.row, col: next.col });
  }
  const extraBreaks = Math.floor(cols * rows * 0.08);
  for(let i=0; i<extraBreaks; i++){
    const row = 1 + Math.floor(rng() * (rows - 2));
    const col = 1 + Math.floor(rng() * (cols - 2));
    if(grid[row][col] === 1){
      grid[row][col] = 0;
    }
  }
  return grid;
}

function topDownCellCenter(state, col, row){
  return {
    x: state.offsetX + col * state.tileSize + state.tileSize/2,
    y: state.offsetY + row * state.tileSize + state.tileSize/2
  };
}

function topDownWalkablePoint(state, x, y){
  const col = Math.floor((x - state.offsetX) / state.tileSize);
  const row = Math.floor((y - state.offsetY) / state.tileSize);
  if(row < 0 || col < 0 || row >= state.rows || col >= state.cols) return false;
  const rowData = state.grid[row];
  if(!rowData) return false;
  return rowData[col] === 0;
}

function topDownWalkableRect(state, x, y, w, h){
  const pad = Math.min(6, Math.floor(state.tileSize * 0.18));
  const points = [
    { x: x + pad, y: y + pad },
    { x: x + w - pad, y: y + pad },
    { x: x + pad, y: y + h - pad },
    { x: x + w - pad, y: y + h - pad }
  ];
  return points.every(pt => topDownWalkablePoint(state, pt.x, pt.y));
}

function movePlayerTopDown(state, moveX, moveY){
  if(moveX){
    const steps = Math.max(1, Math.ceil(Math.abs(moveX) / Math.max(1, state.tileSize * 0.45)));
    const stepX = moveX / steps;
    for(let i=0; i<steps; i++){
      const nextX = player.x + stepX;
      if(topDownWalkableRect(state, nextX, player.y, player.w, player.h)){
        player.x = nextX;
      } else {
        break;
      }
    }
  }
  if(moveY){
    const steps = Math.max(1, Math.ceil(Math.abs(moveY) / Math.max(1, state.tileSize * 0.45)));
    const stepY = moveY / steps;
    for(let i=0; i<steps; i++){
      const nextY = player.y + stepY;
      if(topDownWalkableRect(state, player.x, nextY, player.w, player.h)){
        player.y = nextY;
      } else {
        break;
      }
    }
  }
}

function updateTopDown(dt){
  if(!topDownState) return;
  const td = topDownState;
  const speed = td.speed || 180;
  let inputX = 0;
  let inputY = 0;
  if(keys['a'] || keys['arrowleft']) inputX -= 1;
  if(keys['d'] || keys['arrowright']) inputX += 1;
  if(keys['w'] || keys['arrowup']) inputY -= 1;
  if(keys['s'] || keys['arrowdown']) inputY += 1;
  const sprinting = keys['shift'];
  if(inputX || inputY){
    const length = Math.hypot(inputX, inputY) || 1;
    const moveSpeed = speed * (sprinting ? 1.3 : 1);
    const moveX = (inputX / length) * moveSpeed * dt;
    const moveY = (inputY / length) * moveSpeed * dt;
    movePlayerTopDown(td, moveX, moveY);
    if(inputX > 0) player.facing = 1;
    else if(inputX < 0) player.facing = -1;
  }
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  player.onGround = true;
  player.vx = 0;
  player.vy = 0;
  player.crouch = false;
  player.climbing = false;
  player.sprint = sprinting;

  const centerX = player.x + player.w/2;
  const centerY = player.y + player.h/2;
  const range = td.tileSize * 0.7;
  for(const gap of td.gaps){
    if(gap.triggered) continue;
    if(Math.hypot(centerX - gap.x, centerY - gap.y) <= range){
      gap.triggered = true;
      notify('You vault across a rattling vent gap.');
      centerNote('Vent gap cleared', 900);
    }
  }
  for(const ladder of td.ladders){
    if(ladder.triggered) continue;
    if(Math.hypot(centerX - ladder.x, centerY - ladder.y) <= range){
      ladder.triggered = true;
      notify('Ladder climbed deeper into the vents.');
    }
  }
  if(td.door && Math.hypot(centerX - td.door.x, centerY - td.door.y) <= range){
    td.door.glowUntil = now() + 200;
  }
  updateHudCommon();
}

function interactTopDown(){
  if(!topDownState) return;
  const td = topDownState;
  const px = player.x + player.w/2;
  const py = player.y + player.h/2;
  const range = td.tileSize * 0.75;

  for(const box of td.boxes){
    if(box.activated) continue;
    if(Math.hypot(px - box.x, py - box.y) <= range){
      box.activated = true;
      box.glowUntil = now() + 600;
      td.hotwiredCount = Math.min(td.boxes.length, td.hotwiredCount + 1);
      notify('Electrical box rerouted.');
      centerNote('Electrical box hotwired', 1200);
      chime();
      if(td.hotwiredCount >= td.requiredBoxes && !td.missionComplete){
        td.missionComplete = true;
        if(!td.missionAnnounced){
          td.missionAnnounced = true;
          notify('All boxes hotwired! Return to the elevator.');
          centerNote('All boxes hotwired!', 1600);
          chime();
        }
      }
      updateHudCommon();
      return;
    }
  }

  for(const loot of td.loot){
    if(loot.collected) continue;
    if(Math.hypot(px - loot.x, py - loot.y) > range) continue;
    loot.collected = true;
    if(loot.type === 'cash'){
      const amount = Math.round(loot.amount || td.noteValue || 1000);
      addChecking(amount);
      const noteLabel = loot.noteLabel || td.noteLabel || null;
      if(noteLabel){
        centerNote(`${noteLabel} +$${fmtCurrency(amount)}`, 1400);
        notify(`${noteLabel} recovered.`);
      } else {
        centerNote(`Checking +$${fmtCurrency(amount)}`, 1200);
        notify('Found cash.');
      }
      beep({freq:600});
    } else if(loot.type === 'intel'){
      const amount = Math.max(1, loot.amount || 1);
      player.intel += amount;
      evaluateWeaponUnlocks();
      centerNote(`Intel +${amount}`, 1200);
      notify('Intel cache secured.');
      beep({freq:760});
    } else if(loot.type === 'file'){
      const amount = Math.max(1, loot.amount || 1);
      player.files += amount;
      evaluateWeaponUnlocks();
      centerNote(`Files +${amount}`, 1200);
      notify('File archive captured.');
      beep({freq:720});
    } else if(loot.type === 'cache'){
      const intelGain = Math.max(1, loot.intel || 1);
      const fileGain = Math.max(1, loot.files || 1);
      player.intel += intelGain;
      player.files += fileGain;
      evaluateWeaponUnlocks();
      centerNote(`Intel +${intelGain} / Files +${fileGain}`, 1400);
      notify('Combined intel cache recovered.');
      chime();
    } else if(loot.type === 'weapon'){
      const label = loot.label || (loot.weapon || 'Weapon');
      unlockWeapon(loot.weapon, label);
    } else if(loot.type === 'secret'){
      player.specialFiles = (player.specialFiles || 0) + 1;
      updateSpecialFileUI();
      centerNote('Secret file uncovered!', 1600);
      notify(`Embarrassing photo: ${loot.photo} (Dr. Jeffstein’s Island).`);
      chime();
    } else if(loot.type === 'upgrade'){
      grantWeaponUpgrade();
      centerNote('Weapon upgrade installed', 1400);
      notify('Vents yielded a weapon mod.');
      chime();
    }
    updateHudCommon();
    return;
  }

  if(td.door && td.missionComplete && Math.hypot(px - td.door.x, py - td.door.y) <= range){
    td.door.open = true;
    notify('Elevator engaged. Vent infiltration complete.');
    centerNote('Elevator unlocked', 1500);
    chime();
    completeTopDownLevel();
    return;
  }

  notify('Nothing here to interact with.');
}

function interactVentDungeon(){
  if(!ventDungeonState) return false;
  const state = ventDungeonState;
  const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
  for(const box of state.boxes){
    if(box.activated) continue;
    const interactBox = { x: box.x - 14, y: box.y - 14, w: box.w + 28, h: box.h + 28 };
    if(rect(playerBox, interactBox)){
      box.activated = true;
      box.glowUntil = now() + 600;
      state.hotwiredCount = Math.min(state.requiredBoxes, state.hotwiredCount + 1);
      notify('Electrical box rerouted.');
      centerNote('Electrical box hotwired', 1200);
      chime();
      if(state.hotwiredCount >= state.requiredBoxes && !state.missionComplete){
        state.missionComplete = true;
        if(state.door){
          state.door.unlocked = true;
          state.door.glowUntil = now() + 2200;
        }
        if(!state.missionAnnounced){
          state.missionAnnounced = true;
          notify('All boxes hotwired! Return to the elevator.');
          centerNote('All boxes hotwired!', 1600);
          chime();
        }
      }
      updateHudCommon();
      return true;
    }
  }
  return false;
}

function handleTopDownAttack(){
  if(!topDownState) return;
  const td = topDownState;
  const px = player.x + player.w/2;
  const py = player.y + player.h/2;
  const range = td.tileSize * 0.75;
  let any=false;
  for(const intern of td.interns){
    if(!intern.alive) continue;
    if(Math.hypot(px - intern.x, py - intern.y) <= range){
      intern.alive = false;
      intern.hitFlashUntil = now() + 220;
      td.internsKilled += 1;
      notify(`${intern.name} neutralized.`);
      centerNote(`${intern.name} eliminated`, 1200);
      any = true;
    }
  }
  if(!any){
    notify('Your strike slices only vent dust.');
  }
  updateHudCommon();
}

function restorePlayerFromTopDown(tdState){
  if(!tdState) return;
  if(tdState.originalSize){
    player.w = tdState.originalSize.w;
    player.h = tdState.originalSize.h;
  }
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.crouch = false;
  player.climbing = false;
  state.playerWeaponsDisabled = !!tdState.prevWeaponsDisabled;
}

function completeTopDownLevel(){
  if(!topDownState || topDownState.exiting) return;
  const td = topDownState;
  td.exiting = true;
  const totalInterns = td.interns.length;
  const killed = td.internsKilled;
  const floor = td.floor;
  if(totalInterns > 0){
    if(killed === 0){
      unlockAchievement(`vent-pacifist-${floor}`, floor === 9 ? 'Vent Mercy I' : `Vent Mercy ${floor}`, 'Cleared the vents without harming interns');
    } else if(killed === totalInterns){
      unlockAchievement(`vent-menace-${floor}`, floor === 9 ? 'Intern Hunter I' : `Intern Hunter ${floor}`, 'Eliminated every intern in the vents');
    }
  }
  const nextFloor = Math.min(FLOORS, currentFloor + 1);
  restorePlayerFromTopDown(td);
  topDownState = null;
  setTimeout(()=>enterFloor(nextFloor, {}), 600);
}

function completeVentDungeonLevel(){
  if(!ventDungeonState) return;
  const state = ventDungeonState;
  const total = state.internTotal || 0;
  const killed = state.internsKilled || 0;
  const floor = state.floor || currentFloor;
  if(total > 0){
    if(killed === 0){
      unlockAchievement(`vent-pacifist-${floor}`, floor === 9 ? 'Vent Mercy I' : `Vent Mercy ${floor}`, 'Cleared the vents without harming interns');
    } else if(killed === total){
      unlockAchievement(`vent-menace-${floor}`, floor === 9 ? 'Intern Hunter I' : `Intern Hunter ${floor}`, 'Eliminated every intern in the vents');
    }
  }
  ventDungeonState = null;
}

// ==== Drone strike missions ====

const TETRIS_PIECES = [
  { name:'I', color:'#66d2ff', rotations:[
    [{x:-1,y:0},{x:0,y:0},{x:1,y:0},{x:2,y:0}],
    [{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:1,y:2}]
  ]},
  { name:'L', color:'#ffb347', rotations:[
    [{x:-1,y:0},{x:0,y:0},{x:1,y:0},{x:1,y:-1}],
    [{x:0,y:-1},{x:0,y:0},{x:0,y:1},{x:1,y:1}],
    [{x:-1,y:0},{x:0,y:0},{x:1,y:0},{x:-1,y:1}],
    [{x:-1,y:-1},{x:0,y:-1},{x:0,y:0},{x:0,y:1}]
  ]},
  { name:'J', color:'#6fa3ff', rotations:[
    [{x:-1,y:0},{x:0,y:0},{x:1,y:0},{x:-1,y:-1}],
    [{x:0,y:-1},{x:0,y:0},{x:0,y:1},{x:1,y:-1}],
    [{x:-1,y:0},{x:0,y:0},{x:1,y:0},{x:1,y:1}],
    [{x:-1,y:1},{x:0,y:-1},{x:0,y:0},{x:0,y:1}]
  ]},
  { name:'T', color:'#c68cff', rotations:[
    [{x:-1,y:0},{x:0,y:0},{x:1,y:0},{x:0,y:-1}],
    [{x:0,y:-1},{x:0,y:0},{x:0,y:1},{x:1,y:0}],
    [{x:-1,y:0},{x:0,y:0},{x:1,y:0},{x:0,y:1}],
    [{x:-1,y:0},{x:0,y:-1},{x:0,y:0},{x:0,y:1}]
  ]},
  { name:'S', color:'#7adf8a', rotations:[
    [{x:-1,y:0},{x:0,y:0},{x:0,y:-1},{x:1,y:-1}],
    [{x:0,y:-1},{x:0,y:0},{x:1,y:0},{x:1,y:1}]
  ]},
  { name:'Z', color:'#ff6f6f', rotations:[
    [{x:-1,y:-1},{x:0,y:-1},{x:0,y:0},{x:1,y:0}],
    [{x:1,y:-1},{x:1,y:0},{x:0,y:0},{x:0,y:1}]
  ]},
  { name:'O', color:'#f7e56f', rotations:[
    [{x:0,y:0},{x:1,y:0},{x:0,y:-1},{x:1,y:-1}]
  ]}
];

const CHESS_LAYOUTS = [
  {
    cursor:{x:2,y:4},
    pieces:[
      {type:'king', color:'player', x:2, y:5},
      {type:'queen', color:'player', x:1, y:4},
      {type:'rook', color:'player', x:4, y:5},
      {type:'king', color:'ai', x:3, y:0},
      {type:'rook', color:'ai', x:0, y:1},
      {type:'knight', color:'ai', x:5, y:2}
    ]
  },
  {
    cursor:{x:3,y:5},
    pieces:[
      {type:'king', color:'player', x:3, y:5},
      {type:'rook', color:'player', x:0, y:4},
      {type:'queen', color:'player', x:5, y:4},
      {type:'king', color:'ai', x:2, y:0},
      {type:'rook', color:'ai', x:4, y:1},
      {type:'knight', color:'ai', x:1, y:2}
    ]
  },
  {
    cursor:{x:1,y:5},
    pieces:[
      {type:'king', color:'player', x:1, y:5},
      {type:'queen', color:'player', x:2, y:4},
      {type:'rook', color:'player', x:4, y:4},
      {type:'king', color:'ai', x:4, y:0},
      {type:'rook', color:'ai', x:2, y:1},
      {type:'knight', color:'ai', x:0, y:2}
    ]
  }
];

function startDroneMissionLevel(floor){
  const config = DRONE_MISSION_CONFIG[floor];
  if(!config) return;
  floorSlab = { x:0, y:H-20, w:W, h:20 };
  droneMissionState = {
    floor,
    config,
    phase:'hack',
    hackWins:0,
    hackGames:0,
    hackProgress:0,
    hackMessage:'',
    hackCooldown:0,
    hackOverrideNotified:false,
    pendingDrone:false,
    pendingDroneDelay:0,
    tetris:null,
    chess:null,
    drone:null,
    bombs:[],
    explosions:[],
    enemies:[],
    enemyShots:[],
    targets:[],
    destroyedTargets:0,
    spawnedTargets:0,
    loanSaved:0,
    camera:{x:0,y:0},
    input:{left:false,right:false,up:false,down:false},
    missionText: config.drone && config.drone.missionText ? config.drone.missionText : '',
    overlay:null,
    transitioning:false
  };
  state.playerWeaponsDisabled = true;
  player.hacking = false;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  setAmbient('wind');
  updateMusicForState();
  notify(`${config.name}: Breach security protocols.`);
  centerNote(`Level ${floor} – ${config.name}`, 2000);
  if(config.hackType === 'tetris'){
    initializeTetrisHack(droneMissionState);
    droneMissionState.hackMessage = 'Align code blocks to penetrate the firewall.';
  } else if(config.hackType === 'chess'){
    initializeChessHack(droneMissionState);
    droneMissionState.hackMessage = 'Checkmate the firewall AI three times to breach access.';
  }
  updateHudCommon();
}

function initializeTetrisHack(mission){
  const linesPerMatch = mission.config && Number.isFinite(mission.config.hackLinesPerMatch) ? mission.config.hackLinesPerMatch : 6;
  mission.tetris = {
    rows: 18,
    cols: 10,
    grid: Array.from({length:18}, ()=>Array(10).fill(null)),
    piece:null,
    nextPiece: pickRandomTetrisPiece(),
    dropTimer:0,
    dropInterval:0.8,
    fastDrop:false,
    linesCleared:0,
    linesRequired: Math.max(3, linesPerMatch),
    failedSpawn:false
  };
  spawnTetrisPiece(mission.tetris);
}

function pickRandomTetrisPiece(){
  return TETRIS_PIECES[Math.floor(Math.random()*TETRIS_PIECES.length)];
}

function spawnTetrisPiece(state){
  const piece = state.nextPiece || pickRandomTetrisPiece();
  state.nextPiece = pickRandomTetrisPiece();
  state.piece = { def: piece, rotation:0, x: Math.floor(state.cols/2), y: -2 };
  if(checkTetrisCollision(state, state.piece, 0, 0)){
    state.failedSpawn = true;
  }
}

function getTetrisCells(piece, rotation){
  const rots = piece.def.rotations;
  const rot = rots[(rotation || 0) % rots.length];
  return rot;
}

function checkTetrisCollision(state, piece, offsetX, offsetY, rotation){
  const rotIndex = rotation !== undefined ? rotation : piece.rotation;
  const cells = getTetrisCells(piece, rotIndex);
  for(const cell of cells){
    const cx = piece.x + cell.x + offsetX;
    const cy = piece.y + cell.y + offsetY;
    if(cx < 0 || cx >= state.cols) return true;
    if(cy >= state.rows){
      return true;
    }
    if(cy >= 0){
      if(state.grid[cy][cx]) return true;
    }
  }
  return false;
}

function moveTetrisPiece(state, dx, dy){
  if(!state.piece) return false;
  if(checkTetrisCollision(state, state.piece, dx, dy)){
    if(dy>0) return false;
    return dx!==0;
  }
  state.piece.x += dx;
  state.piece.y += dy;
  return true;
}

function rotateTetrisPiece(state, dir){
  if(!state.piece) return;
  const def = state.piece.def;
  const total = def.rotations.length;
  if(total<=1) return;
  const nextRot = (state.piece.rotation + dir + total) % total;
  if(!checkTetrisCollision(state, state.piece, 0, 0, nextRot)){
    state.piece.rotation = nextRot;
  }
}

function lockTetrisPiece(mission){
  const state = mission.tetris;
  if(!state || !state.piece) return;
  const cells = getTetrisCells(state.piece, state.piece.rotation);
  let blockedTop=false;
  for(const cell of cells){
    const cx = state.piece.x + cell.x;
    const cy = state.piece.y + cell.y;
    if(cy < 0){
      blockedTop = true;
      continue;
    }
    if(cy >= 0 && cy < state.rows && cx>=0 && cx<state.cols){
      state.grid[cy][cx] = state.piece.def.color;
    }
  }
  state.piece = null;
  if(blockedTop){
    concludeDroneHackMatch(mission, false, 'Hack failed — stack overflow.');
    return;
  }
  const cleared = clearTetrisLines(state);
  state.linesCleared += cleared;
  if(state.linesCleared >= state.linesRequired){
    concludeDroneHackMatch(mission, true, `Hack progress ${Math.round(Math.min(1, state.linesCleared/state.linesRequired)*100)}%.`);
    return;
  }
  spawnTetrisPiece(state);
}

function clearTetrisLines(state){
  let cleared = 0;
  for(let row=state.rows-1; row>=0; row--){
    if(state.grid[row].every(cell=>!!cell)){
      cleared++;
      for(let r=row; r>0; r--){
        state.grid[r] = state.grid[r-1].slice();
      }
      state.grid[0] = Array(state.cols).fill(null);
      row++;
    }
  }
  return cleared;
}

function initializeChessHack(mission){
  const layout = CHESS_LAYOUTS[Math.floor(Math.random()*CHESS_LAYOUTS.length)];
  const pieces = layout.pieces.map(p=>({...p}));
  mission.chess = {
    size:6,
    pieces,
    cursor:{...layout.cursor},
    selected:null,
    selectedPiece:null,
    availableMoves:[],
    turn:'player',
    result:null,
    hints:false,
    recommended:null,
    moveDelay:0
  };
}

function chessPieceAt(state, x, y){
  return state.pieces.find(p=>p.x===x && p.y===y && !p.captured);
}

function chessPieceValue(type){
  if(type==='king') return 100;
  if(type==='queen') return 9;
  if(type==='rook') return 5;
  if(type==='knight') return 3;
  return 1;
}

function chessGenerateMoves(state, piece){
  const moves=[];
  const size = state.size;
  const occupied = (x,y)=>state.pieces.find(p=>p.x===x && p.y===y && !p.captured);
  const pushMove=(x,y)=>{
    if(x<0||x>=size||y<0||y>=size) return false;
    const other = occupied(x,y);
    if(other && other.color===piece.color) return false;
    moves.push({x,y,capture:other||null});
    return !other;
  };
  if(piece.type==='rook' || piece.type==='queen'){
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs){
      let x=piece.x+dx, y=piece.y+dy;
      while(x>=0&&x<size&&y>=0&&y<size){
        const cont = pushMove(x,y);
        if(!cont) break;
        x+=dx; y+=dy;
      }
    }
  }
  if(piece.type==='queen' || piece.type==='bishop'){
    const dirs=[[1,1],[-1,-1],[1,-1],[-1,1]];
    for(const [dx,dy] of dirs){
      let x=piece.x+dx, y=piece.y+dy;
      while(x>=0&&x<size&&y>=0&&y<size){
        const cont = pushMove(x,y);
        if(!cont) break;
        x+=dx; y+=dy;
      }
    }
  }
  if(piece.type==='king'){
    for(let dx=-1; dx<=1; dx++){
      for(let dy=-1; dy<=1; dy++){
        if(dx===0 && dy===0) continue;
        pushMove(piece.x+dx, piece.y+dy);
      }
    }
  }
  if(piece.type==='knight'){
    const jumps=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    for(const [dx,dy] of jumps){
      pushMove(piece.x+dx, piece.y+dy);
    }
  }
  return moves;
}

function chessApplyMove(state, piece, move){
  const capture = move.capture;
  if(capture){ capture.captured = true; }
  piece.x = move.x;
  piece.y = move.y;
}

function concludeDroneHackMatch(mission, success, message){
  if(mission.phase!=='hack') return;
  mission.hackGames += 1;
  mission.hackMessage = message || (success ? 'Hack progress increased.' : 'Hack failed — rebooting attempt.');
  mission.hackCooldown = 1.1;
  if(success){
    mission.hackWins += 1;
    mission.hackProgress = Math.min(1, mission.hackWins / (mission.config.hackWinsRequired || 3));
    chime();
    mission.hackMessage = `Hack progress ${Math.round(mission.hackProgress*100)}%.`;
    if(mission.hackWins >= (mission.config.hackWinsRequired || 3)){
      mission.pendingDrone = true;
      mission.pendingDroneDelay = 0.8;
      mission.hackMessage = 'Access granted — initializing drone control.';
    }
  } else {
    lockedBuzz();
  }
  mission.tetris = null;
  mission.chess = null;
  if(mission.config.hackMaxGames && mission.hackGames >= mission.config.hackMaxGames && mission.hackWins < (mission.config.hackWinsRequired || 3)){
    if(!mission.hackOverrideNotified){
      mission.hackOverrideNotified = true;
      mission.pendingDrone = true;
      mission.pendingDroneDelay = 0.8;
      mission.hackMessage = 'Firewall overloaded — proceeding under stealth.';
      notify('Firewall overloaded — proceeding under stealth.');
      centerNote('Firewall overloaded — proceeding under stealth.', 2200);
    }
  }
  updateHudCommon();
}

function isBombardierMission(mission){
  return !!(mission && mission.config && mission.config.drone && mission.config.drone.controlMode === 'bombardier');
}

function initializeDronePhase(mission){
  mission.phase = 'drone';
  mission.bombs = [];
  mission.explosions = [];
  mission.enemies = [];
  mission.enemyShots = [];
  mission.targets = [];
  mission.destroyedTargets = 0;
  mission.spawnedTargets = 0;
  mission.hackMessage = '';
  mission.bombardier = null;
  mission.drone = null;

  if(isBombardierMission(mission)){
    initializeBombardierPhase(mission);
  } else {
    mission.targets = mission.targets.filter(t=>!t.destroyed || t.destructionTimer>0);
    mission.areaSize = mission.config.drone && mission.config.drone.terrain === 'yacht' ? 5200 : 4200;
    mission.drone = {
      x: mission.areaSize/2,
      y: mission.areaSize/2,
      heading: -Math.PI/2,
      speed: 240,
      baseSpeed: 240,
      health: 120,
      maxHealth: 120,
      dropCooldown:0,
      damageFlash:0
    };
    mission.camera.x = mission.drone.x - W/2;
    mission.camera.y = mission.drone.y - H/2;
    const maxActive = mission.config.drone && mission.config.drone.maxActiveTargets ? mission.config.drone.maxActiveTargets : 4;
    for(let i=0; i<maxActive; i++){
      spawnDroneTarget(mission);
    }
  }

  notify('Hack complete. Drone uplink acquired.');
  centerNote('Hack complete — drone strike authorized.', 2200);
  updateHudCommon();
}

function initializeBombardierPhase(mission){
  const config = mission.config.drone || {};
  const viewSize = Math.floor(Math.min(W, H) * 0.72);
  const viewX = Math.floor((W - viewSize) / 2);
  const viewY = Math.floor((H - viewSize) / 2);
  const speedMult = config.bombardierSpeedMultiplier || 1;
  const baseScroll = (config.terrain === 'yacht' ? 260 : 220);
  mission.bombardier = {
    viewSize,
    viewX,
    viewY,
    centerX: viewX + viewSize / 2,
    centerY: viewY + viewSize / 2,
    aimX: viewX + viewSize / 2,
    aimY: viewY + viewSize / 2,
    aimSpeed: 240,
    aimRange: viewSize * 0.3,
    scrollSpeed: baseScroll * speedMult,
    dropCooldown: 0,
    spawnTimer: 0,
    spawnInterval: 1.25,
    groundOffset: 0
  };
  mission.camera.x = 0;
  mission.camera.y = 0;
  const maxActive = Math.max(1, (config.maxActiveTargets || 3));
  for(let i=0; i<maxActive; i++){
    spawnBombardierTarget(mission);
  }
}

function spawnBombardierTarget(mission){
  const config = mission.config.drone || {};
  const view = mission.bombardier;
  if(!view) return null;
  if(mission.destroyedTargets >= (config.totalTargets || 12)) return null;
  const size = view.viewSize;
  const margin = size * 0.08;
  const width = (config.terrain === 'yacht' ? size * (0.46 + Math.random()*0.12) : size * (0.35 + Math.random()*0.16));
  const height = (config.terrain === 'yacht' ? width * (0.34 + Math.random()*0.08) : width * (0.46 + Math.random()*0.1));
  const spacingMult = config.bombardierSpacingMultiplier || 1;
  const candidate = () => view.viewX + margin + Math.random() * Math.max(0, size - width - margin*2);
  let x = candidate();
  if(spacingMult > 1 && mission.targets && mission.targets.length){
    const attempts = 20;
    let fallbackX = null;
    let fallbackScore = -Infinity;
    for(let attempt=0; attempt<attempts; attempt++){
      const candidateX = candidate();
      const candidateCenter = candidateX + width/2;
      let ok = true;
      let minRatio = Infinity;
      for(const existing of mission.targets){
        if(!existing || existing.removed) continue;
        const existingWidth = existing.width || 0;
        if(existingWidth <= 0) continue;
        const existingCenter = existing.x + existingWidth/2;
        const requiredGap = spacingMult * Math.max(width, existingWidth);
        const gap = Math.abs(candidateCenter - existingCenter);
        const ratio = requiredGap > 0 ? gap / requiredGap : 1;
        minRatio = Math.min(minRatio, ratio);
        if(gap < requiredGap){
          ok = false;
        }
      }
      if(ok){
        x = candidateX;
        fallbackX = candidateX;
        break;
      }
      if(minRatio > fallbackScore){
        fallbackScore = minRatio;
        fallbackX = candidateX;
      }
    }
    if(fallbackX !== null){
      x = fallbackX;
    }
  }
  const y = view.viewY - height - 60 - Math.random()*60;
  const hp = config.terrain === 'yacht' ? 3 : 2;
  const peopleCount = config.terrain === 'yacht' ? 8 : 10;
  const people = [];
  for(let i=0;i<peopleCount;i++){
    people.push({
      ox: width * (0.18 + Math.random()*0.64),
      oy: height * (0.15 + Math.random()*0.7),
      alive:true,
      fade:0
    });
  }
  const target = {
    id:`target-${Date.now()}-${Math.random().toString(16).slice(2,6)}`,
    type: config.terrain || 'mansion',
    x,
    y,
    width,
    height,
    speed: view.scrollSpeed * (0.92 + Math.random()*0.16),
    hp,
    maxHp: hp,
    destroyed:false,
    hitFlash:0,
    smokeTimer:0,
    people,
    removed:false
  };
  mission.targets.push(target);
  return target;
}

function spawnDroneTarget(mission){
  const config = mission.config.drone || {};
  const total = config.totalTargets || 12;
  if(mission.spawnedTargets >= total) return null;
  const area = mission.areaSize || 4200;
  const radiusBase = config.terrain === 'yacht' ? 120 : 140;
  const radius = radiusBase * (0.7 + Math.random()*0.4);
  const x = 240 + Math.random() * Math.max(200, area - 480);
  const y = 240 + Math.random() * Math.max(200, area - 480);
  const hp = config.terrain === 'yacht' ? 3 : 2;
  const target = {
    id:`target-${mission.spawnedTargets+1}`,
    x,y,
    radius,
    hp,
    maxHp:hp,
    type:config.terrain||'mansion',
    destroyed:false,
    destructionTimer:0
  };
  mission.spawnedTargets += 1;
  mission.targets.push(target);
  spawnDroneGuards(mission, target);
  return target;
}

function spawnDroneGuards(mission, target){
  const config = mission.config.drone || {};
  const guardCount = config.terrain === 'yacht' ? 3 : 2 + Math.floor(Math.random()*2);
  for(let i=0;i<guardCount;i++){
    const angle = Math.random() * Math.PI * 2;
    const distance = target.radius + 70 + Math.random()*40;
    mission.enemies.push({
      x: target.x + Math.cos(angle)*distance,
      y: target.y + Math.sin(angle)*distance,
      angle,
      radius:distance,
      orbitSpeed:0.3 + Math.random()*0.25,
      hp:1,
      target,
      cooldown:0.4 + Math.random()*0.4
    });
  }
}

function dropDroneBomb(mission){
  if(isBombardierMission(mission)){
    return dropBombardierBomb(mission);
  }
  if(!mission || !mission.drone) return false;
  if(mission.drone.dropCooldown>0) return false;
  mission.bombs.push({ x: mission.drone.x, y: mission.drone.y, timer:0, travelTime:0.65 + Math.random()*0.1 });
  mission.drone.dropCooldown = 0.4;
  return true;
}

function dropBombardierBomb(mission){
  const view = mission && mission.bombardier;
  if(!view) return false;
  if(view.dropCooldown > 0) return false;
  const config = mission.config.drone || {};
  const bomb = {
    x: view.aimX,
    y: view.viewY + 16,
    vy: 60,
    gravity: 900,
    exploded:false,
    done:false,
    maxRadius: (config.terrain === 'yacht' ? view.viewSize * 0.21 : view.viewSize * 0.17)
  };
  mission.bombs.push(bomb);
  view.dropCooldown = 0.5;
  return true;
}

function triggerDroneExplosion(mission, bomb){
  const config = mission.config.drone || {};
  const maxRadius = config.terrain === 'yacht' ? 170 : 150;
  const explosion = { x:bomb.x, y:bomb.y, radius:20, maxRadius, life:0.5 };
  mission.explosions.push(explosion);
  boom();
  applyExplosionDamage(mission, explosion);
}

function applyExplosionDamage(mission, explosion){
  const config = mission.config.drone || {};
  const maxRadius = explosion.maxRadius || 140;
  for(const target of mission.targets){
    if(!target || target.destroyed) continue;
    const dist = Math.hypot(target.x - explosion.x, target.y - explosion.y);
    if(dist <= maxRadius + target.radius*0.5){
      target.hp = Math.max(0, target.hp - 1);
      if(target.hp === 0){
        target.destroyed = true;
        target.destructionTimer = 0.8;
        mission.destroyedTargets += 1;
        notify(`${config.terrain === 'yacht' ? 'Yacht' : 'Estate'} destroyed.`);
        if(config.terrain === 'yacht'){
          centerNote('Board member eliminated.', 1600);
        }
        if(mission.destroyedTargets >= (config.totalTargets || 12)){
          mission.phase = 'complete';
          mission.overlay = { title:'Mission Complete', timer:1.6 };
          centerNote('Mission Complete', 2000);
          notify('Mission complete. Returning to the tower.');
        } else if(mission.spawnedTargets < (config.totalTargets || 12)){
          spawnDroneTarget(mission);
        }
      }
    }
  }
  for(const enemy of mission.enemies){
    if(!enemy || enemy.hp<=0) continue;
    const dist = Math.hypot(enemy.x - explosion.x, enemy.y - explosion.y);
    if(dist <= maxRadius){
      enemy.hp = 0;
      applyLoanPayment(100);
      mission.loanSaved += 100;
      ui.toast(`Loan reduced $100 – ${mission.config.drone.enemyLabel || 'Guard'} eliminated.`);
    }
  }
  mission.enemies = mission.enemies.filter(e=>e.hp>0);
  updateHudCommon();
}

function damageDrone(mission, amount){
  if(!mission || !mission.drone) return;
  mission.drone.health = Math.max(0, mission.drone.health - amount);
  mission.drone.damageFlash = 0.2;
  if(mission.drone.health <= 0){
    notify('Drone compromised — rebuilding control link.');
    centerNote('Drone destroyed — rebooting controls.', 2000);
    respawnDrone(mission);
  }
}

function respawnDrone(mission){
  const config = mission.config.drone || {};
  mission.drone = {
    x: mission.areaSize/2,
    y: mission.areaSize/2,
    heading: -Math.PI/2,
    speed: 200,
    baseSpeed: 220,
    health: 120,
    maxHealth: 120,
    dropCooldown:0,
    damageFlash:0
  };
  mission.enemyShots = [];
  mission.bombs = [];
  mission.explosions = [];
  mission.input = {left:false,right:false,up:false,down:false};
  for(const target of mission.targets){
    if(target && target.destroyed){
      target.destructionTimer = Math.max(0, target.destructionTimer - 0.2);
    }
  }
  if(mission.enemies.length === 0){
    const activeTargets = mission.targets.filter(t=>t && !t.destroyed);
    for(const target of activeTargets){
      spawnDroneGuards(mission, target);
    }
  }
}

function completeDroneMissionLevel(){
  const mission = droneMissionState;
  if(!mission || mission.transitioning) return;
  const missionFloor = Number.isFinite(mission.floor) ? mission.floor : currentFloor;
  const nextFloor = Math.min(FLOORS, missionFloor + 1);
  mission.transitioning = true;
  state.playerWeaponsDisabled = false;
  currentFloor = missionFloor;
  setTimeout(()=>{
    droneMissionState = null;
    enterFloor(nextFloor, {});
  }, 600);
  updateHudCommon();
}

function updateDroneMission(dt){
  const mission = droneMissionState;
  if(!mission) return;
  if(mission.phase === 'complete'){
    if(mission.overlay){
      mission.overlay.timer -= dt;
      if(mission.overlay.timer <= 0){
        mission.overlay = null;
        completeDroneMissionLevel();
      }
    } else {
      completeDroneMissionLevel();
    }
    return;
  }
  if(mission.pendingDrone){
    mission.pendingDroneDelay = Math.max(0, mission.pendingDroneDelay - dt);
    if(mission.pendingDroneDelay <= 0){
      mission.pendingDrone = false;
      initializeDronePhase(mission);
    }
    return;
  }
  if(mission.phase === 'hack'){
    if(mission.hackCooldown > 0){
      mission.hackCooldown = Math.max(0, mission.hackCooldown - dt);
      if(mission.hackCooldown <= 0 && !mission.pendingDrone){
        if(mission.config.hackType === 'tetris') initializeTetrisHack(mission);
        else if(mission.config.hackType === 'chess') initializeChessHack(mission);
      }
      return;
    }
    if(mission.config.hackType === 'tetris'){
      updateTetrisHackState(mission, dt);
    } else if(mission.config.hackType === 'chess'){
      updateChessHackState(mission, dt);
    }
    return;
  }
  if(mission.phase === 'drone'){
    updateDronePhase(mission, dt);
    return;
  }
}

function updateTetrisHackState(mission, dt){
  const state = mission.tetris;
  if(!state) return;
  if(state.failedSpawn){
    concludeDroneHackMatch(mission, false, 'Hack failed — connection collapsed.');
    return;
  }
  const speedBonus = Math.min(0.3, (mission.hackWins||0) * 0.08);
  const interval = state.fastDrop ? 0.08 : Math.max(0.22, state.dropInterval - speedBonus);
  state.dropTimer += dt;
  if(state.dropTimer >= interval){
    state.dropTimer = 0;
    if(!moveTetrisPiece(state, 0, 1)){
      lockTetrisPiece(mission);
    }
  }
}

function updateChessHackState(mission, dt){
  const chess = mission.chess;
  if(!chess) return;
  if(chess.moveDelay > 0){
    chess.moveDelay = Math.max(0, chess.moveDelay - dt);
  }
  if(chess.turn === 'ai' && chess.moveDelay <= 0){
    const aiMove = chooseAiMove(chess);
    if(aiMove){
      chessApplyMove(chess, aiMove.piece, aiMove.move);
      chess.selected = null;
      chess.selectedPiece = null;
      chess.availableMoves = [];
      if(aiMove.move.capture && aiMove.move.capture.type === 'king' && aiMove.move.capture.color === 'player'){
        chess.result = 'ai';
        concludeDroneHackMatch(mission, false, 'Firewall AI countered your move.');
        return;
      }
      const playerKingAlive = chess.pieces.some(p=>p.type==='king' && p.color==='player' && !p.captured);
      const aiKingAlive = chess.pieces.some(p=>p.type==='king' && p.color==='ai' && !p.captured);
      if(!playerKingAlive){
        chess.result = 'ai';
        concludeDroneHackMatch(mission, false, 'Firewall AI seized the board.');
        return;
      }
      if(!aiKingAlive){
        chess.result = 'player';
        concludeDroneHackMatch(mission, true, 'Firewall defeated in chess skirmish.');
        return;
      }
      chess.turn = 'player';
      chess.moveDelay = 0.2;
    } else {
      concludeDroneHackMatch(mission, true, 'Firewall stalemated — breach achieved.');
      return;
    }
  }
  if(chess.turn === 'player' && chess.hints){
    chess.recommended = computeRecommendedPlayerMove(chess);
  } else {
    chess.recommended = null;
  }
}

function chooseAiMove(chess){
  const moves = [];
  for(const piece of chess.pieces){
    if(piece.captured || piece.color !== 'ai') continue;
    const options = chessGenerateMoves(chess, piece);
    for(const move of options){
      moves.push({ piece, move, score: scoreChessMove(chess, piece, move, 'ai') });
    }
  }
  if(!moves.length) return null;
  moves.sort((a,b)=>b.score - a.score);
  const topScore = moves[0].score;
  const best = moves.filter(m=>m.score >= topScore - 0.01);
  return best[Math.floor(Math.random()*best.length)];
}

function scoreChessMove(chess, piece, move, side){
  let score = 0;
  if(move.capture){
    score += chessPieceValue(move.capture.type) * 12;
    if(move.capture.type === 'king') score += 500;
  }
  const opponentKing = chess.pieces.find(p=>p.type==='king' && p.color !== side && !p.captured);
  if(opponentKing){
    const targetX = (move.x !== undefined) ? move.x : piece.x;
    const targetY = (move.y !== undefined) ? move.y : piece.y;
    const dist = Math.hypot(targetX - opponentKing.x, targetY - opponentKing.y);
    score += Math.max(0, 40 - dist*6);
  }
  if(piece.type==='king') score -= 4; // discourage reckless king moves
  if(piece.type==='queen') score += 3;
  return score;
}

function computeRecommendedPlayerMove(chess){
  let best=null;
  for(const piece of chess.pieces){
    if(piece.captured || piece.color!=='player') continue;
    const options = chessGenerateMoves(chess, piece);
    for(const move of options){
      const score = scoreChessMove(chess, piece, move, 'player');
      if(!best || score > best.score){
        best = { piece, move, score };
      }
    }
  }
  return best;
}

function updateDronePhase(mission, dt){
  if(isBombardierMission(mission)){
    updateBombardierPhase(mission, dt);
    updateHudCommon();
    return;
  }
  const drone = mission.drone;
  if(!drone) return;
  if(mission.input.left) drone.heading -= dt * 1.6;
  if(mission.input.right) drone.heading += dt * 1.6;
  const desired = mission.input.up ? drone.baseSpeed + 120 : mission.input.down ? drone.baseSpeed * 0.6 : drone.baseSpeed;
  drone.speed += (desired - drone.speed) * 0.12;
  drone.x += Math.cos(drone.heading) * drone.speed * dt;
  drone.y += Math.sin(drone.heading) * drone.speed * dt;
  const area = mission.areaSize || 4200;
  const margin = 160;
  drone.x = clamp(drone.x, margin, area - margin);
  drone.y = clamp(drone.y, margin, area - margin);
  mission.camera.x += ((drone.x - W/2) - mission.camera.x) * 0.14;
  mission.camera.y += ((drone.y - H/2) - mission.camera.y) * 0.14;
  drone.dropCooldown = Math.max(0, drone.dropCooldown - dt);
  drone.damageFlash = Math.max(0, drone.damageFlash - dt);

  for(const bomb of mission.bombs){
    bomb.timer += dt;
  }
  const finished = mission.bombs.filter(b=>b.timer >= b.travelTime);
  if(finished.length){
    for(const bomb of finished){
      triggerDroneExplosion(mission, bomb);
    }
  }
  mission.bombs = mission.bombs.filter(b=>b.timer < b.travelTime);

  for(const explosion of mission.explosions){
    explosion.life -= dt;
    explosion.radius = Math.min(explosion.maxRadius || 140, explosion.radius + dt * 280);
  }
  mission.explosions = mission.explosions.filter(e=>e.life>0);

  for(const enemy of mission.enemies){
    const target = enemy.target && !enemy.target.destroyed ? enemy.target : null;
    if(target){
      enemy.angle += enemy.orbitSpeed * dt;
      enemy.x = target.x + Math.cos(enemy.angle) * enemy.radius;
      enemy.y = target.y + Math.sin(enemy.angle) * enemy.radius;
    }
    enemy.cooldown -= dt;
    if(enemy.cooldown <= 0){
      enemy.cooldown = 1.1 + Math.random()*0.7;
      const angle = Math.atan2(drone.y - enemy.y, drone.x - enemy.x);
      const speed = 420;
      mission.enemyShots.push({ x:enemy.x, y:enemy.y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, life:2.4 });
    }
  }
  mission.enemies = mission.enemies.filter(e=>e.hp>0);

  for(const shot of mission.enemyShots){
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    const dist = Math.hypot(shot.x - drone.x, shot.y - drone.y);
    if(dist < 32){
      shot.life = 0;
      damageDrone(mission, 18);
    }
  }
  mission.enemyShots = mission.enemyShots.filter(s=>s.life>0);

  for(const target of mission.targets){
    if(target.destroyed){
      target.destructionTimer = Math.max(0, target.destructionTimer - dt);
    }
  }
  mission.targets = mission.targets.filter(t=>!t.destroyed || t.destructionTimer>0);
  updateHudCommon();
}

function updateBombardierPhase(mission, dt){
  const config = mission.config.drone || {};
  const required = config.totalTargets || 12;
  const view = mission.bombardier;
  if(!view) return;

  view.dropCooldown = Math.max(0, view.dropCooldown - dt);
  const aimSpeed = view.aimSpeed;
  if(mission.input.left) view.aimX -= aimSpeed * dt;
  if(mission.input.right) view.aimX += aimSpeed * dt;
  if(mission.input.up) view.aimY -= aimSpeed * dt * 0.75;
  if(mission.input.down) view.aimY += aimSpeed * dt * 0.75;
  const range = view.aimRange;
  view.aimX = clamp(view.aimX, view.centerX - range, view.centerX + range);
  view.aimY = clamp(view.aimY, view.centerY - range, view.centerY + range);
  view.groundOffset = (view.groundOffset + view.scrollSpeed * dt) % view.viewSize;

  const maxActive = Math.max(1, (config.maxActiveTargets || 3));
  while(mission.targets.length < maxActive && mission.destroyedTargets < required){
    spawnBombardierTarget(mission);
  }

  for(const target of mission.targets){
    target.y += target.speed * dt;
    target.hitFlash = Math.max(0, target.hitFlash - dt);
    if(target.destroyed){
      target.smokeTimer += dt;
    }
    for(const person of target.people){
      if(!person.alive){
        person.fade = Math.max(0, person.fade - dt*1.2);
      }
    }
    if(target.y - target.height > view.viewY + view.viewSize + 40){
      target.removed = true;
    }
  }
  mission.targets = mission.targets.filter(t=>!t.removed);

  for(const bomb of mission.bombs){
    bomb.vy += bomb.gravity * dt;
    bomb.y += bomb.vy * dt;
    if(!bomb.exploded){
      let hitTarget = null;
      for(const target of mission.targets){
        if(target.destroyed) continue;
        if(bomb.x >= target.x && bomb.x <= target.x + target.width && bomb.y >= target.y && bomb.y <= target.y + target.height){
          hitTarget = target;
          break;
        }
      }
      if(hitTarget){
        triggerBombardierExplosion(mission, bomb.x, bomb.y, bomb.maxRadius);
        bomb.exploded = true;
        bomb.done = true;
        continue;
      }
      if(bomb.y >= view.viewY + view.viewSize - 6){
        triggerBombardierExplosion(mission, bomb.x, bomb.y, bomb.maxRadius);
        bomb.exploded = true;
        bomb.done = true;
        continue;
      }
    }
    if(bomb.y > view.viewY + view.viewSize + 60){
      bomb.done = true;
    }
  }
  mission.bombs = mission.bombs.filter(b=>!b.done);

  for(const explosion of mission.explosions){
    explosion.life -= dt;
    explosion.radius = Math.min(explosion.maxRadius, explosion.radius + explosion.expansion * dt);
  }
  mission.explosions = mission.explosions.filter(e=>e.life>0);

  if(mission.destroyedTargets >= required && mission.phase !== 'complete'){
    mission.phase = 'complete';
    mission.overlay = { title:'Mission Complete', timer:1.6 };
    centerNote('Mission Complete', 2000);
    notify('Mission complete. Returning to the tower.');
  }
}

function triggerBombardierExplosion(mission, x, y, radiusOverride){
  const config = mission.config.drone || {};
  const view = mission.bombardier;
  if(!view) return;
  const maxRadius = radiusOverride || (config.terrain === 'yacht' ? view.viewSize * 0.22 : view.viewSize * 0.18);
  const explosion = {
    x,
    y,
    radius: Math.max(18, maxRadius * 0.25),
    maxRadius,
    life:0.55,
    expansion: maxRadius * 2.8
  };
  mission.explosions.push(explosion);
  boom();
  applyBombardierExplosion(mission, explosion);
}

function applyBombardierExplosion(mission, explosion){
  for(const target of mission.targets){
    if(!target || target.removed) continue;
    if(!circleIntersectsRect(explosion.x, explosion.y, explosion.maxRadius, target.x, target.y, target.width, target.height)){
      continue;
    }
    if(!target.destroyed){
      target.hp = Math.max(0, target.hp - 1);
      target.hitFlash = 0.3;
      if(target.hp <= 0){
        target.destroyed = true;
        target.smokeTimer = 0;
        mission.destroyedTargets += 1;
        applyLoanPayment(100);
        mission.loanSaved += 100;
        notify(`${target.type === 'yacht' ? 'Yacht' : 'Mansion'} destroyed.`);
      }
    }
    for(const person of target.people){
      if(!person.alive){
        continue;
      }
      const px = target.x + person.ox;
      const py = target.y + person.oy;
      if(Math.hypot(px - explosion.x, py - explosion.y) <= explosion.maxRadius * 0.85){
        person.alive = false;
        person.fade = 0.35;
      }
    }
  }
}

function circleIntersectsRect(cx, cy, radius, rx, ry, rw, rh){
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx*dx + dy*dy <= radius*radius;
}

function drawDroneMission(){
  const mission = droneMissionState;
  if(!mission) return;
  if(mission.phase === 'hack'){
    if(mission.config.hackType === 'tetris') drawTetrisHack(mission);
    else if(mission.config.hackType === 'chess') drawChessHack(mission);
    return;
  }
  drawDronePhase(mission);
}

// ==== Rooftop: Jump in Rates ====
function startRooftopMission(){
  const rain = [];
  for(let i=0; i<120; i++){
    rain.push({ x: Math.random()*W, y: Math.random()*H, speed: 240 + Math.random()*220, drift: -60 + Math.random()*120 });
  }
  const skyline = [];
  const baseLine = H * 0.72;
  for(let i=0; i<14; i++){
    const width = 50 + Math.random()*110;
    const height = 160 + Math.random()*240;
    const x = Math.random()*(W - width);
    const lightRows = 4 + Math.floor(Math.random()*6);
    skyline.push({ x, width, height, rows: lightRows, cols: 4 + Math.floor(Math.random()*4) });
  }
  rooftopMissionState = {
    phase:'awaitHarness',
    startedAt: now(),
    playerX: W*0.5,
    playerY: H*0.36,
    duration: JUMP_IN_RATES_DURATION_MS,
    zipStart: 0,
    nextBulletAt: 0,
    bullets: [],
    rain,
    skyline,
    sway: 0,
    hitFlashUntil: 0,
    completed:false
  };
  warzoneMissionState = null;
  state.playerWeaponsDisabled = true;
  player.vx = 0;
  player.vy = 0;
  camX = 0;
  camY = 0;
  attackHeld = false;
  notify('Elevator breach complete — New mission unlocked: Jump in Rates.');
  centerNote('Press SPACE to clip into the zip line.', 2200);
  updateMusicForState();
}

function handleRooftopKeyDown(key, event){
  const mission = rooftopMissionState;
  if(!mission) return false;
  if(key === ' '){
    if(mission.phase === 'awaitHarness'){
      mission.phase = 'zipline';
      mission.zipStart = now();
      mission.nextBulletAt = mission.zipStart + 500;
      chime();
      centerNote('Harness locked — ride the Jump in Rates zip line!', 2200);
      notify('Zip line engaged. Dodge the hail of bullets!');
      if(event){ event.preventDefault(); }
      return true;
    }
  }
  return false;
}

function updateRooftopMission(dt){
  const mission = rooftopMissionState;
  if(!mission || mission.completed) return;
  const nowTs = now();
  mission.sway += dt * 0.8;
  const input = (keys['arrowleft']||keys['a'] ? -1 : 0) + (keys['arrowright']||keys['d'] ? 1 : 0);
  const moveSpeed = mission.phase === 'zipline' ? 260 : 140;
  mission.playerX = clamp(mission.playerX + input * moveSpeed * dt, W*0.18, W*0.82);
  for(const drop of mission.rain){
    drop.x += drop.drift * dt;
    drop.y += drop.speed * dt;
    if(drop.y > H){
      drop.y = -Math.random()*40;
      drop.x = Math.random()*W;
    }
    if(drop.x < -40){ drop.x = W + Math.random()*20; }
    if(drop.x > W + 40){ drop.x = -Math.random()*20; }
  }
  if(mission.phase === 'zipline'){
    mission.elapsed = nowTs - mission.zipStart;
    if(!mission.nextBulletAt){ mission.nextBulletAt = nowTs + 400; }
    if(nowTs >= mission.nextBulletAt){
      const spread = 70 + Math.random()*60;
      mission.bullets.push({
        x: mission.playerX + (Math.random()-0.5)*spread,
        y: H + 40,
        vx: (Math.random()-0.5)*120,
        vy: - (220 + Math.random()*140)
      });
      mission.nextBulletAt = nowTs + 240 + Math.random()*420;
    }
  } else {
    mission.elapsed = 0;
  }
  for(let i=mission.bullets.length-1; i>=0; i--){
    const bullet = mission.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if(bullet.y < -60 || bullet.x < -80 || bullet.x > W + 80){
      mission.bullets.splice(i,1);
      continue;
    }
    if(mission.phase === 'zipline'){
      const px = mission.playerX;
      const py = mission.playerY;
      if(Math.abs(bullet.x - px) < 20 && bullet.y < py + 14 && bullet.y > py - 38){
        mission.bullets.splice(i,1);
        mission.hitFlashUntil = nowTs + 240;
        loseChecking(6);
        player.hurtUntil = Math.max(player.hurtUntil||0, nowTs + 260);
        notify('Incoming fire grazed you on the zip line! -$6');
        beep({freq:320});
        continue;
      }
    }
  }
  if(mission.phase === 'zipline' && mission.elapsed >= mission.duration){
    completeRooftopMission();
  }
}

function completeRooftopMission(){
  const mission = rooftopMissionState;
  if(!mission || mission.completed) return;
  mission.completed = true;
  notify('Zip line landing successful — prepare for ITS ONLY MONEY.');
  centerNote('Landing zone secured. Advance to the streets.', 2200);
  rooftopMissionState = null;
  startWarzoneMission();
}

function drawRooftopMission(){
  const mission = rooftopMissionState;
  ctx.textAlign = 'left';
  const gradient = ctx.createLinearGradient(0,0,0,H);
  gradient.addColorStop(0,'#050a16');
  gradient.addColorStop(1,'#0b1324');
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,W,H);
  const baseLine = H*0.72;
  if(mission && mission.skyline){
    for(const building of mission.skyline){
      ctx.fillStyle = '#121c30';
      ctx.fillRect(building.x, baseLine - building.height, building.width, building.height);
      ctx.fillStyle = 'rgba(40,60,90,0.6)';
      ctx.fillRect(building.x+4, baseLine - building.height + 4, Math.max(0, building.width-8), Math.max(0, building.height-12));
      ctx.fillStyle = 'rgba(255,225,140,0.22)';
      const rowH = (building.height-40)/Math.max(1,building.rows);
      const colW = (building.width-16)/Math.max(1,building.cols);
      for(let r=0; r<building.rows; r++){
        for(let c=0; c<building.cols; c++){
          if(Math.random()<0.35) continue;
          const winX = building.x + 8 + c*colW;
          const winY = baseLine - building.height + 12 + r*rowH;
          ctx.fillRect(winX, winY, Math.max(3, colW-6), Math.max(6, rowH-10));
        }
      }
    }
  }
  ctx.strokeStyle = 'rgba(200,220,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W*0.12, H*0.18);
  ctx.lineTo(W*0.88, H*0.46);
  ctx.stroke();
  if(mission){
    ctx.strokeStyle = 'rgba(130,160,220,0.38)';
    ctx.lineWidth = 1.1;
    for(const drop of mission.rain){
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.drift*0.04, drop.y + 16);
      ctx.stroke();
    }
    const px = mission.playerX;
    const py = mission.playerY;
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = '#1f2f4a';
    ctx.fillRect(-12, -6, 24, 32);
    ctx.fillStyle = '#0d182d';
    ctx.fillRect(-10, 26, 20, 32);
    ctx.fillStyle = '#24395d';
    ctx.fillRect(-14, 18, 28, 10);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,240,180,0.7)';
    ctx.beginPath();
    ctx.moveTo(px, py-4);
    ctx.lineTo(px - W*0.38, H*0.18);
    ctx.stroke();
    ctx.fillStyle = '#ff644a';
    for(const bullet of mission.bullets){
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI*2);
      ctx.fill();
    }
    if(mission.hitFlashUntil && mission.hitFlashUntil > now()){
      ctx.fillStyle = 'rgba(255,80,60,0.22)';
      ctx.fillRect(0,0,W,H);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign='center';
    ctx.font = '26px monospace';
    ctx.fillText('JUMP IN RATES', W/2, 46);
    ctx.textAlign='left';
    ctx.font = '15px monospace';
    ctx.fillText('Objective: Survive the rooftop zip line barrage.', 24, 76);
    if(mission.phase === 'awaitHarness'){
      ctx.textAlign='center';
      ctx.font = '18px monospace';
      ctx.fillText('SPACE: Attach Safety Harness', W/2, H-80);
      ctx.textAlign='left';
    }
    if(mission.phase === 'zipline'){
      const progress = Math.max(0, Math.min(1, (mission.elapsed||0) / mission.duration));
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(W/2-180, H-64, 360, 20);
      ctx.fillStyle = '#4ec6ff';
      ctx.fillRect(W/2-180, H-64, 360*progress, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '14px monospace';
      ctx.textAlign='center';
      ctx.fillText('Zip line remaining', W/2, H-72);
      ctx.textAlign='left';
    }
  }
}

// ==== Warzone: ITS ONLY MONEY ====
function startWarzoneMission(){
  const rain = [];
  for(let i=0; i<160; i++){
    rain.push({ x: Math.random()*W, y: Math.random()*H, speed: 280 + Math.random()*240, drift: -80 + Math.random()*140 });
  }
  const skyline = [];
  for(let i=0; i<16; i++){
    const width = 70 + Math.random()*130;
    const height = 180 + Math.random()*220;
    skyline.push({ x: Math.random()*(W-width), width, height, tint: 0.3 + Math.random()*0.4 });
  }
  warzoneMissionState = {
    phase:'sneak',
    startedAt: now(),
    distance: 0,
    coverIndex: 0,
    coverPositions: [140, 280, 420],
    gunDistance: 560,
    awaitingCover:false,
    awaitingGun:false,
    aimX:0.5,
    fireCooldown:0,
    muzzleFlashUntil:0,
    enemies:[],
    bloodBursts:[],
    killCount:0,
    enemyShotCounter:0,
    totalEnemyShots:0,
    playerHitFlashUntil:0,
    alliesJoined:false,
    goreUnlocked:false,
    politician:null,
    allyFireTimer:0,
    elapsedMs:0,
    rain,
    skyline,
    patrols: Array.from({ length: 6 }, () => ({
      lane: -0.7 + Math.random()*1.4,
      depth: 0.25 + Math.random()*0.45,
      dir: Math.random()<0.5 ? -1 : 1,
      speed: 0.4 + Math.random()*0.4,
      bob: Math.random()*Math.PI*2
    })),
    completed:false
  };
  rooftopMissionState = null;
  state.playerWeaponsDisabled = true;
  attackHeld = false;
  player.weapon = 'machineGun';
  notify('Mission Update: ITS ONLY MONEY. Sneak behind the cars and reach the mounted M60.');
  centerNote('Move forward — sneak behind the cars.', 2400);
  updateMusicForState();
}

function handleWarzoneKeyDown(key, event){
  const mission = warzoneMissionState;
  if(!mission) return false;
  if(key === ' '){
    if(mission.phase === 'sneak' && mission.awaitingCover){
      mission.awaitingCover = false;
      mission.coverIndex++;
      chime();
      centerNote('Cover secured — keep advancing.', 1800);
      notify('Slipped behind the car safely.');
      if(event){ event.preventDefault(); }
      return true;
    }
    if(mission.phase === 'gunPrep' && mission.awaitingGun){
      mission.phase = 'gun';
      mission.awaitingGun = false;
      mission.phaseStart = now();
      mission.elapsedMs = 0;
      mission.fireCooldown = 0;
      mission.enemies.length = 0;
      for(let i=0; i<WARZONE_MAX_ACTIVE_ENEMIES; i++){
        mission.enemies.push(spawnWarzoneEnemy());
      }
      chime();
      centerNote('Machine gun mounted — hold the line!', 2200);
      notify('ITS ONLY MONEY has begun. Hold fire and track incoming soldiers.');
      if(event){ event.preventDefault(); }
      return true;
    }
  }
  return false;
}

function handleWarzoneFire(){
  const mission = warzoneMissionState;
  if(!mission || mission.phase !== 'gun') return;
  const nowTs = now();
  if(mission.fireCooldown > 0) return;
  mission.fireCooldown = 0.065;
  mission.muzzleFlashUntil = nowTs + 180;
  playGunshot('machineGun');
  let targetIndex = -1;
  let targetEnemy = null;
  for(let i=0; i<mission.enemies.length; i++){
    const enemy = mission.enemies[i];
    const width = enemy.kind === 'specialOps' ? 0.14 : 0.11;
    if(Math.abs(enemy.x - mission.aimX) <= width){
      if(!targetEnemy || enemy.distance < targetEnemy.distance){
        targetEnemy = enemy;
        targetIndex = i;
      }
    }
  }
  if(targetEnemy){
    targetEnemy.hp -= 1;
    if(targetEnemy.hp <= 0){
      playGoonDeath();
      mission.enemies.splice(targetIndex,1);
      mission.killCount++;
      runStats.kills = (runStats.kills||0) + 1;
      if(mission.goreUnlocked){
        mission.bloodBursts.push({ x: targetEnemy.x, distance: targetEnemy.distance, life: 0.9 });
      }
    }
  } else if(mission.politician){
    const boss = mission.politician;
    if(Math.abs(mission.aimX - boss.x) <= 0.2){
      boss.hp = Math.max(boss.maxHp * 0.12, boss.hp - 40);
      boss.lastHitAt = nowTs;
    }
  }
}

function spawnWarzoneEnemy(){
  const kinds = ['soldier','specialOps','greenBeret','redBeret'];
  const kind = kinds[Math.floor(Math.random()*kinds.length)];
  const enemy = {
    kind,
    x: Math.random(),
    distance: 0.9 + Math.random()*0.9,
    speed: 0.02 + Math.random()*0.025,
    hp: 1,
    fireInterval: 1.6 + Math.random()*1.6,
    fireTimer: Math.random()*1.2
  };
  if(kind === 'specialOps'){
    enemy.hp = 3;
    enemy.speed = 0.028 + Math.random()*0.02;
    enemy.fireInterval = 1.2 + Math.random()*1.2;
  } else if(kind === 'greenBeret' || kind === 'redBeret'){
    enemy.hp = 1;
    enemy.speed = 0.024 + Math.random()*0.02;
  }
  return enemy;
}

function updateWarzoneMission(dt){
  const mission = warzoneMissionState;
  if(!mission || mission.completed) return;
  const nowTs = now();
  if(mission.rain){
    for(const drop of mission.rain){
      drop.x += drop.drift * dt;
      drop.y += drop.speed * dt;
      if(drop.y > H){ drop.y = -Math.random()*60; drop.x = Math.random()*W; }
      if(drop.x < -40){ drop.x = W + Math.random()*30; }
      if(drop.x > W + 40){ drop.x = -Math.random()*30; }
    }
  }
  if(mission.patrols){
    for(const patrol of mission.patrols){
      patrol.lane += patrol.dir * patrol.speed * dt * (mission.phase === 'gun' ? 0.18 : 0.35);
      if(patrol.lane < -0.85 || patrol.lane > 0.85){
        patrol.dir *= -1;
        patrol.lane = clamp(patrol.lane, -0.85, 0.85);
      }
      patrol.bob = (patrol.bob || 0) + dt * 5.5;
    }
  }
  if(mission.phase === 'sneak'){
    const forward = (keys['w']||keys['arrowup']) ? 1 : 0;
    if(!mission.awaitingCover){
      mission.distance = Math.min(mission.gunDistance, mission.distance + forward * 90 * dt);
    }
    const nextCover = mission.coverPositions[mission.coverIndex];
    if(typeof nextCover === 'number' && mission.distance >= nextCover && !mission.awaitingCover){
      mission.distance = nextCover;
      mission.awaitingCover = true;
      notify('Car ahead — press SPACE to duck behind it.');
      centerNote('Press SPACE to duck behind the car.', 1800);
    }
    if(mission.coverIndex >= mission.coverPositions.length && mission.distance >= mission.gunDistance){
      mission.phase = 'gunPrep';
      mission.awaitingGun = true;
      notify('Mounted M60 in sight. Press SPACE to deploy.');
      centerNote('Press SPACE to mount the M60.', 2000);
    }
    return;
  }
  if(mission.phase === 'gunPrep'){
    return;
  }
  if(mission.phase !== 'gun') return;
  mission.elapsedMs = Math.max(0, nowTs - (mission.phaseStart || nowTs));
  mission.fireCooldown = Math.max(0, mission.fireCooldown - dt);
  const aimAdjust = (keys['arrowleft']||keys['a'] ? -1 : 0) + (keys['arrowright']||keys['d'] ? 1 : 0);
  if(aimAdjust){
    mission.aimX = clamp(mission.aimX + aimAdjust * dt * 0.8, 0.02, 0.98);
  }
  if(attackHeld && mission.fireCooldown <= 0){
    handleWarzoneFire();
  }
  while(mission.enemies.length < WARZONE_MAX_ACTIVE_ENEMIES){
    mission.enemies.push(spawnWarzoneEnemy());
  }
  for(let i=mission.enemies.length-1; i>=0; i--){
    const enemy = mission.enemies[i];
    enemy.distance = Math.max(0, enemy.distance - enemy.speed * dt);
    enemy.fireTimer += dt;
    if(enemy.fireTimer >= enemy.fireInterval){
      enemy.fireTimer = 0;
      mission.totalEnemyShots++;
      if(mission.totalEnemyShots % 200 === 0){
        loseChecking(8);
        mission.playerHitFlashUntil = nowTs + 240;
        player.hurtUntil = Math.max(player.hurtUntil||0, nowTs + 320);
        notify('A stray bullet clips you through the storm! -$8');
        beep({freq:260});
      }
    }
    if(enemy.distance <= 0){
      mission.enemies.splice(i,1);
      loseChecking(12);
      mission.playerHitFlashUntil = nowTs + 260;
      notify('A soldier breaches the barricade! -$12');
      beep({freq:320});
      continue;
    }
  }
  for(let i=mission.bloodBursts.length-1; i>=0; i--){
    mission.bloodBursts[i].life -= dt * 0.6;
    if(mission.bloodBursts[i].life <= 0){ mission.bloodBursts.splice(i,1); }
  }
  if(!mission.alliesJoined && mission.elapsedMs >= ITS_ONLY_MONEY_ALLY_JOIN_MS){
    mission.alliesJoined = true;
    notify('Reinforcements arrived! Fellow students have mounted the line.');
    centerNote('"Thanks for liberating our loans, we are here to join the fight"', 2800);
    chime();
  }
  if(mission.alliesJoined){
    mission.allyFireTimer += dt;
    if(mission.allyFireTimer >= 1.3){
      mission.allyFireTimer = 0;
      if(mission.enemies.length){
        const index = Math.floor(Math.random()*mission.enemies.length);
        const enemy = mission.enemies.splice(index,1)[0];
        playGoonDeath();
        mission.killCount++;
        runStats.kills = (runStats.kills||0) + 1;
        if(mission.goreUnlocked){
          mission.bloodBursts.push({ x: enemy.x, distance: enemy.distance, life: 0.9 });
        }
      }
    }
  }
  if(!mission.goreUnlocked && mission.elapsedMs >= ITS_ONLY_MONEY_GORE_MS){
    mission.goreUnlocked = true;
    notify('Intensity escalates — gore floods the street.');
    centerNote('INTENSE GORE UNLOCKED', 2200);
  }
  if(!mission.politician && mission.elapsedMs >= ITS_ONLY_MONEY_POLITICIAN_MS){
    mission.politician = { spawnAt: nowTs, hp: 900, maxHp: 900, x: 0.5, progress: 0, lastHitAt: 0 };
    notify('A towering politician lumbers onto the battlefield.');
    centerNote('An enormous politician joins the fight!', 2400);
  }
  if(mission.politician){
    const spanMs = ITS_ONLY_MONEY_TOTAL_MS - ITS_ONLY_MONEY_POLITICIAN_MS;
    const progressMs = Math.max(0, mission.elapsedMs - ITS_ONLY_MONEY_POLITICIAN_MS);
    mission.politician.progress = spanMs > 0 ? Math.min(0.75, (progressMs / spanMs) * 0.75) : 0.75;
    mission.politician.hp = Math.min(mission.politician.maxHp, mission.politician.hp + 18 * dt);
  }
  if(mission.elapsedMs >= ITS_ONLY_MONEY_TOTAL_MS){
    completeWarzoneMission();
  }
}

function drawWarzoneMission(){
  const mission = warzoneMissionState;
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0,0,W,H);
  if(!mission) return;
  if(mission.skyline){
    const baseY = H*0.72;
    for(const building of mission.skyline){
      ctx.fillStyle = `rgba(18,28,48,${0.55 + building.tint*0.3})`;
      ctx.fillRect(building.x, baseY - building.height, building.width, building.height);
      ctx.fillStyle = 'rgba(255,215,130,0.18)';
      for(let r=0; r<4; r++){
        const winY = baseY - building.height + 16 + r*(building.height/5);
        ctx.fillRect(building.x + 6, winY, Math.max(0, building.width-12), 6);
      }
    }
  }
  if(mission.rain){
    ctx.strokeStyle = 'rgba(120,150,220,0.35)';
    ctx.lineWidth = 1.1;
    for(const drop of mission.rain){
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.drift*0.04, drop.y + 16);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign='center';
  ctx.font = '26px monospace';
  ctx.fillText('ITS ONLY MONEY', W/2, 42);
  ctx.textAlign='left';
  ctx.font = '18px monospace';
  ctx.fillText(`Kill Count: ${mission.killCount}`, 24, 44);
  if(mission.phase === 'sneak' || mission.phase === 'gunPrep'){
    const roadTop = H*0.44;
    const laneTopHalf = W*0.18;
    const laneBottomHalf = W*0.52;
    ctx.fillStyle = '#0a111c';
    ctx.beginPath();
    ctx.moveTo(W/2 - laneTopHalf - 60, roadTop-40);
    ctx.lineTo(W/2 + laneTopHalf + 60, roadTop-40);
    ctx.lineTo(W/2 + laneBottomHalf + 120, H);
    ctx.lineTo(W/2 - laneBottomHalf - 120, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111b29';
    ctx.beginPath();
    ctx.moveTo(W/2 - laneTopHalf, roadTop);
    ctx.lineTo(W/2 + laneTopHalf, roadTop);
    ctx.lineTo(W/2 + laneBottomHalf, H);
    ctx.lineTo(W/2 - laneBottomHalf, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#182333';
    ctx.beginPath();
    ctx.moveTo(W/2 - laneTopHalf - 12, roadTop);
    ctx.lineTo(W/2 - laneTopHalf - 90, H);
    ctx.lineTo(W/2 - laneBottomHalf - 90, H);
    ctx.lineTo(W/2 - laneTopHalf + 6, roadTop);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W/2 + laneTopHalf + 12, roadTop);
    ctx.lineTo(W/2 + laneTopHalf + 90, H);
    ctx.lineTo(W/2 + laneBottomHalf + 90, H);
    ctx.lineTo(W/2 + laneTopHalf - 6, roadTop);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(90,130,180,0.2)';
    for(let stripe=0; stripe<7; stripe++){
      const t = stripe/7;
      const stripeY = roadTop + t*(H-roadTop) + 20;
      const stripeHeight = 14 + t*30;
      const stripeWidth = 16 + t*40;
      ctx.save();
      ctx.translate(W/2, stripeY);
      ctx.scale(1, 1.1);
      ctx.fillRect(-stripeWidth/2, -stripeHeight/2, stripeWidth, stripeHeight);
      ctx.restore();
    }
    if(mission.patrols){
      for(const patrol of mission.patrols){
        const depth = clamp(patrol.depth || 0.4, 0.1, 0.95);
        const laneHalf = laneTopHalf*0.6 + (laneBottomHalf - laneTopHalf*0.6) * depth;
        const px = W/2 + patrol.lane * laneHalf;
        const py = roadTop + depth * (H-roadTop) - 70;
        const bob = Math.sin(patrol.bob||0) * 6 * (1-depth);
        const scale = 0.45 + (1-depth)*0.5;
        const bodyH = 56 * scale;
        const bodyW = 20 * scale;
        ctx.fillStyle = 'rgba(18,28,40,0.78)';
        ctx.fillRect(px - bodyW/2, py - bodyH + bob, bodyW, bodyH*0.65);
        ctx.fillStyle = 'rgba(12,20,32,0.85)';
        ctx.fillRect(px - bodyW*0.35, py - bodyH*0.42 + bob, bodyW*0.7, bodyH*0.35);
        ctx.beginPath();
        ctx.arc(px, py - bodyH + bob - bodyW*0.2, bodyW*0.45, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(10,16,24,0.6)';
        ctx.fillRect(px + bodyW*0.32, py - bodyH*0.25 + bob, bodyW*0.9, bodyW*0.22);
      }
    }
    const progress = mission.gunDistance > 0 ? mission.distance / mission.gunDistance : 0;
    ctx.fillStyle = '#4ec6ff';
    ctx.fillRect(24, H-34, Math.max(0, Math.min(W-48, (W-48)*progress)), 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(24, H-34, W-48, 8);
    for(const cover of mission.coverPositions){
      if(cover < mission.distance) continue;
      const relative = cover - mission.distance;
      const normalized = Math.max(0, Math.min(1, relative / mission.gunDistance));
      const depth = 1 - normalized;
      const idx = mission.coverPositions.indexOf(cover);
      const laneBias = idx % 2 === 0 ? -1 : 1;
      const laneShift = laneTopHalf*0.3 + (laneBottomHalf*0.55) * depth;
      const cx = W/2 + laneBias * laneShift;
      const baseY = roadTop + 90 + normalized * (H-roadTop-180);
      const carLength = 220 - normalized*90;
      const carHeight = 58 - normalized*18;
      const cabinHeight = carHeight * 0.48;
      const wheelRadius = 14 - normalized*5;
      ctx.fillStyle = idx % 2 === 0 ? '#203143' : '#1a2b3c';
      ctx.beginPath();
      ctx.moveTo(cx - carLength/2, baseY);
      ctx.lineTo(cx + carLength/2, baseY);
      ctx.lineTo(cx + carLength/2 - 70*depth, baseY - carHeight);
      ctx.lineTo(cx - carLength/2 + 70*depth, baseY - carHeight);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(82,118,154,0.45)';
      ctx.beginPath();
      ctx.moveTo(cx - carLength/2 + 52*depth, baseY - carHeight + cabinHeight);
      ctx.lineTo(cx + carLength/2 - 48*depth, baseY - carHeight + cabinHeight);
      ctx.lineTo(cx + carLength/2 - 96*depth, baseY - carHeight + cabinHeight*0.15);
      ctx.lineTo(cx - carLength/2 + 92*depth, baseY - carHeight + cabinHeight*0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0a1019';
      ctx.beginPath();
      ctx.ellipse(cx - carLength*0.28, baseY + wheelRadius*0.4, wheelRadius, wheelRadius*0.65, 0, 0, Math.PI*2);
      ctx.ellipse(cx + carLength*0.28, baseY + wheelRadius*0.4, wheelRadius, wheelRadius*0.65, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#131c28';
      ctx.fillRect(cx - carLength/2 + 16, baseY - carHeight*0.36, carLength - 32, carHeight*0.18);
    }
    if(mission.phase === 'gunPrep'){
      const nestY = roadTop + 70;
      const nestWidth = 160;
      const nestHeight = 34;
      ctx.fillStyle = '#1d2939';
      ctx.fillRect(W/2 - nestWidth/2, nestY, nestWidth, nestHeight);
      ctx.fillStyle = '#27374c';
      ctx.fillRect(W/2 - nestWidth/2 + 12, nestY - 28, nestWidth - 24, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(W/2 - 6, nestY - 36, 12, 40);
      ctx.fillStyle = '#121a27';
      ctx.fillRect(W/2 - nestWidth/2 - 40, nestY + nestHeight - 6, nestWidth + 80, 24);
      if(mission.awaitingGun){
        ctx.strokeStyle = 'rgba(110,200,255,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeRect(W/2 - nestWidth/2 - 4, nestY - 32, nestWidth + 8, nestHeight + 40);
      }
    }
    ctx.fillStyle = '#f1f5ff';
    ctx.font = '16px monospace';
    ctx.fillText('Advance to the mounted M60 without being spotted.', 24, 76);
    if(mission.awaitingCover){
      ctx.textAlign='center';
      ctx.font = '20px monospace';
      ctx.fillText('SPACE: Duck behind the car', W/2, H*0.82);
      ctx.textAlign='left';
    } else if(mission.phase === 'gunPrep' && mission.awaitingGun){
      ctx.textAlign='center';
      ctx.font = '20px monospace';
      ctx.fillText('SPACE: Mount the M60', W/2, H*0.82);
      ctx.textAlign='left';
    }
    return;
  }
  if(mission.phase !== 'gun') return;
  const horizonY = H*0.32;
  const groundY = H*0.74;
  const laneTopHalf = W*0.2;
  const laneBottomHalf = W*0.62;
  const projectWarzone = (xNorm, dist)=>{
    const maxDist = 1.6;
    const d = clamp(dist || 0, 0, maxDist);
    const progress = 1 - d / maxDist;
    const laneHalf = laneTopHalf*0.7 + (laneBottomHalf - laneTopHalf*0.7) * progress;
    const px = W/2 + (xNorm - 0.5) * laneHalf * 2.2;
    const py = horizonY + progress * (groundY - horizonY);
    return { x: px, y: py, progress };
  };
  ctx.fillStyle = '#0a111c';
  ctx.beginPath();
  ctx.moveTo(W/2 - laneTopHalf - 90, horizonY - 28);
  ctx.lineTo(W/2 + laneTopHalf + 90, horizonY - 28);
  ctx.lineTo(W/2 + laneBottomHalf + 180, H);
  ctx.lineTo(W/2 - laneBottomHalf - 180, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111a28';
  ctx.beginPath();
  ctx.moveTo(W/2 - laneTopHalf, horizonY);
  ctx.lineTo(W/2 + laneTopHalf, horizonY);
  ctx.lineTo(W/2 + laneBottomHalf, groundY + 36);
  ctx.lineTo(W/2 - laneBottomHalf, groundY + 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#182233';
  ctx.beginPath();
  ctx.moveTo(W/2 - laneTopHalf - 12, horizonY);
  ctx.lineTo(W/2 - laneTopHalf - 92, groundY + 72);
  ctx.lineTo(W/2 - laneBottomHalf - 92, groundY + 122);
  ctx.lineTo(W/2 - laneBottomHalf + 6, horizonY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W/2 + laneTopHalf + 12, horizonY);
  ctx.lineTo(W/2 + laneTopHalf + 92, groundY + 72);
  ctx.lineTo(W/2 + laneBottomHalf + 92, groundY + 122);
  ctx.lineTo(W/2 + laneBottomHalf - 6, horizonY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(118,160,214,0.2)';
  for(let stripe=0; stripe<8; stripe++){
    const t = stripe/8;
    const stripeY = horizonY + t * (groundY - horizonY) + 30;
    const stripeHeight = 16 + t*36;
    const stripeWidth = 18 + t*54;
    ctx.save();
    ctx.translate(W/2, stripeY);
    ctx.scale(1, 1.08);
    ctx.fillRect(-stripeWidth/2, -stripeHeight/2, stripeWidth, stripeHeight);
    ctx.restore();
  }
  if(mission.goreUnlocked){
    const goreLevel = Math.max(0, Math.min(1, (mission.elapsedMs - ITS_ONLY_MONEY_GORE_MS) / (3 * 60 * 1000)));
    ctx.fillStyle = `rgba(120,18,28,${0.22 + goreLevel*0.4})`;
    ctx.beginPath();
    ctx.moveTo(W/2 - laneTopHalf + 4, horizonY + 18);
    ctx.lineTo(W/2 + laneTopHalf - 4, horizonY + 18);
    ctx.lineTo(W/2 + laneBottomHalf - 16, groundY + 28);
    ctx.lineTo(W/2 - laneBottomHalf + 16, groundY + 28);
    ctx.closePath();
    ctx.fill();
    for(const burst of mission.bloodBursts){
      const pos = projectWarzone(burst.x || 0.5, Math.max(0, burst.distance || 0));
      const size = 18 + pos.progress * 72;
      const height = 10 + pos.progress * 36;
      ctx.fillStyle = `rgba(220,32,48,${Math.max(0, burst.life)})`;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 12, size, height, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }
  const orderedEnemies = [...mission.enemies].sort((a,b)=> (b.distance||0) - (a.distance||0));
  for(const enemy of orderedEnemies){
    const pos = projectWarzone(enemy.x, enemy.distance);
    const scale = 0.6 + pos.progress * 2.8;
    const footY = pos.y + 10;
    const torsoH = 48 * scale;
    const legH = 30 * scale;
    const width = 22 * scale;
    const baseColor = enemy.kind === 'specialOps' ? '#151a26' : enemy.kind === 'redBeret' ? '#3a1f1f' : enemy.kind === 'greenBeret' ? '#23382a' : '#2a362d';
    const accent = enemy.kind === 'redBeret' ? '#9c2626' : enemy.kind === 'greenBeret' ? '#1f5a2c' : '#161f26';
    ctx.fillStyle = baseColor;
    ctx.fillRect(pos.x - width/2, footY - torsoH - legH, width, torsoH);
    ctx.fillStyle = accent;
    ctx.fillRect(pos.x - width*0.58, footY - torsoH - legH - width*0.6, width*1.16, width*0.32);
    ctx.fillStyle = '#d9c59a';
    if(enemy.kind === 'specialOps'){
      ctx.fillStyle = '#0f121a';
      ctx.fillRect(pos.x - width*0.5, footY - torsoH - legH - width*0.7, width, width*0.7);
      ctx.fillStyle = '#1f2a3a';
      ctx.fillRect(pos.x - width*0.36, footY - torsoH - legH - width*0.32, width*0.72, width*0.24);
    } else {
      ctx.beginPath();
      ctx.arc(pos.x, footY - torsoH - legH - width*0.35, width*0.4, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.fillStyle = '#1a2532';
    ctx.fillRect(pos.x - width*0.5, footY - legH, width*0.32, legH);
    ctx.fillRect(pos.x + width*0.18, footY - legH, width*0.32, legH);
    ctx.fillStyle = '#0c121b';
    ctx.fillRect(pos.x - width*0.54, footY - 6, width*0.36, 8);
    ctx.fillRect(pos.x + width*0.18, footY - 6, width*0.36, 8);
    ctx.fillStyle = '#111926';
    ctx.fillRect(pos.x - width*0.7, footY - torsoH*0.55, width*1.4, width*0.18);
    if(enemy.kind === 'specialOps'){
      ctx.fillStyle = '#3fffc1';
      ctx.fillRect(pos.x - width*0.38, footY - torsoH - legH - width*0.28, width*0.76, width*0.14);
    }
  }
  if(mission.politician){
    const boss = mission.politician;
    const bossDist = clamp(1.1 - (boss.progress||0) * 0.8, 0.24, 1.1);
    const pos = projectWarzone(boss.x || 0.5, bossDist);
    const footY = pos.y + 14;
    const width = 240 + (boss.progress||0) * 240;
    const height = 260 + (boss.progress||0) * 220;
    const left = pos.x - width/2;
    const top = footY - height;
    ctx.fillStyle = '#f5a142';
    ctx.fillRect(left, top, width, height);
    ctx.fillStyle = '#f2d15f';
    ctx.fillRect(pos.x - width*0.34, top - 32, width*0.68, 36);
    ctx.fillStyle = '#1d3f7c';
    ctx.fillRect(pos.x - width*0.38, top + height*0.55, width*0.76, height*0.45);
    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(pos.x - width*0.24, top - 26, width*0.48, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign='center';
    ctx.font = '18px monospace';
    ctx.fillText('POLITICIAN', pos.x, top - 44);
    const ratio = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 1;
    ctx.fillStyle = 'rgba(40,50,70,0.8)';
    ctx.fillRect(W/2-160, 72, 320, 18);
    ctx.fillStyle = '#ff7043';
    ctx.fillRect(W/2-160, 72, 320*ratio, 18);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeRect(W/2-160, 72, 320, 18);
    if(boss.lastHitAt && boss.lastHitAt + 200 > now()){
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(left, top, width, height);
    }
  }
  ctx.textAlign='left';
  ctx.font = '15px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText('Hold the line for twenty-five minutes. 100 enemies approach at all times.', 24, 74);
  if(mission.alliesJoined){
    ctx.textAlign='right';
    ctx.fillText('Allied students provide suppressive fire.', W-24, 74);
    ctx.textAlign='left';
  }
  const cross = projectWarzone(mission.aimX, 0.66);
  const crossX = cross.x;
  const crossY = cross.y - 46;
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(crossX-24, crossY);
  ctx.lineTo(crossX+24, crossY);
  ctx.moveTo(crossX, crossY-24);
  ctx.lineTo(crossX, crossY+24);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(crossX, crossY, 9, 0, Math.PI*2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = '#212d3f';
  ctx.beginPath();
  ctx.moveTo(W/2 - laneBottomHalf - 40, groundY + 12);
  ctx.lineTo(W/2 + laneBottomHalf + 40, groundY + 12);
  ctx.lineTo(W/2 + laneBottomHalf + 120, H);
  ctx.lineTo(W/2 - laneBottomHalf - 120, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#273446';
  ctx.fillRect(W/2 - 220, groundY - 18, 440, 42);
  ctx.fillStyle = '#111a26';
  ctx.fillRect(W/2 - 240, groundY + 18, 480, 30);
  const gunPivotX = W/2;
  const gunPivotY = groundY - 48;
  const aimAngle = (mission.aimX - 0.5) * 0.38;
  ctx.fillStyle = '#1b2534';
  ctx.fillRect(W/2 - 90, groundY - 42, 180, 30);
  ctx.fillStyle = '#101722';
  ctx.fillRect(W/2 - 120, groundY - 18, 240, 24);
  ctx.save();
  ctx.translate(gunPivotX, gunPivotY);
  ctx.rotate(aimAngle);
  ctx.fillStyle = '#182434';
  ctx.fillRect(-26, -32, 52, 96);
  ctx.fillStyle = '#303f56';
  ctx.fillRect(-10, -170, 20, 170);
  ctx.fillStyle = '#455b78';
  ctx.fillRect(-6, -220, 12, 54);
  if(mission.muzzleFlashUntil && mission.muzzleFlashUntil > now()){
    ctx.fillStyle = 'rgba(255,220,160,0.45)';
    ctx.beginPath();
    ctx.moveTo(0, -220);
    ctx.lineTo(32, -264);
    ctx.lineTo(-32, -264);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#0d141e';
  ctx.fillRect(W/2 - 46, groundY - 70, 92, 34);
  ctx.fillStyle = '#222f42';
  ctx.fillRect(W/2 - 64, groundY - 52, 128, 22);
  if(mission.alliesJoined){
    const sideOffset = laneBottomHalf * 0.8;
    for(const side of [-1,1]){
      const baseX = W/2 + side * sideOffset;
      ctx.fillStyle = '#202b3d';
      ctx.fillRect(baseX - 44, groundY - 26, 88, 28);
      ctx.fillStyle = '#131c28';
      ctx.fillRect(baseX - 56, groundY - 10, 112, 22);
      ctx.save();
      ctx.translate(baseX, groundY - 44);
      ctx.rotate(side * -0.12);
      ctx.fillStyle = '#253549';
      ctx.fillRect(-14, -78, 28, 78);
      ctx.fillStyle = '#3a516a';
      ctx.fillRect(-8, -126, 16, 82);
      ctx.restore();
    }
  }
  if(mission.playerHitFlashUntil && mission.playerHitFlashUntil > now()){
    ctx.fillStyle = 'rgba(255,80,80,0.25)';
    ctx.fillRect(0,0,W,H);
  }
}

function completeWarzoneMission(){
  const mission = warzoneMissionState;
  if(!mission || mission.completed) return;
  mission.completed = true;
  notify('ITS ONLY MONEY complete — the plaza is yours.');
  centerNote('Mission complete. The politicians retreat in fear.', 2600);
  warzoneMissionState = null;
  rooftopMissionState = null;
  finishRun('victory', {
    message:'ITS ONLY MONEY COMPLETE',
    note:'Jump in Rates cleared and the warzone held for twenty-five minutes.'
  });
}

function drawTetrisHack(mission){
  const state = mission.tetris;
  ctx.fillStyle = '#05090f';
  ctx.fillRect(0,0,W,H);
  const cols = state ? state.cols : 10;
  const rows = state ? state.rows : 18;
  const cell = 26;
  const boardW = cols * cell;
  const boardH = rows * cell;
  const originX = Math.floor(W/2 - boardW/2);
  const originY = Math.floor(H/2 - boardH/2);
  ctx.fillStyle = 'rgba(22,36,54,0.9)';
  ctx.fillRect(originX-10, originY-10, boardW+20, boardH+20);
  if(state){
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x = originX + c*cell;
        const y = originY + r*cell;
        ctx.fillStyle = state.grid[r][c] || 'rgba(12,20,32,0.6)';
        ctx.fillRect(x+2,y+2,cell-4,cell-4);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.strokeRect(x+1,y+1,cell-2,cell-2);
      }
    }
    if(state.piece){
      const cells = getTetrisCells(state.piece, state.piece.rotation);
      for(const cellPos of cells){
        const px = state.piece.x + cellPos.x;
        const py = state.piece.y + cellPos.y;
        if(py < 0 || py >= rows || px < 0 || px >= cols) continue;
        const x = originX + px*cell;
        const y = originY + py*cell;
        ctx.fillStyle = state.piece.def.color;
        ctx.fillRect(x+2,y+2,cell-4,cell-4);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeRect(x+1,y+1,cell-2,cell-2);
      }
    }
    if(state.nextPiece){
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '14px monospace';
      ctx.fillText('Next', originX + boardW + 30, originY + 30);
      const preview = getTetrisCells({ def: state.nextPiece }, 0);
      for(const cellPos of preview){
        const x = originX + boardW + 30 + cellPos.x * (cell-6);
        const y = originY + 50 + cellPos.y * (cell-6);
        ctx.fillStyle = state.nextPiece.color;
        ctx.fillRect(x, y, cell-8, cell-8);
      }
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '20px monospace';
  ctx.fillText('Mainframe Hack — Align the data stream', W/2, originY - 40);
  ctx.textAlign = 'center';
  ctx.fillText(`Wins: ${mission.hackWins}/${mission.config.hackWinsRequired || 3}  •  Games: ${mission.hackGames}`, W/2, originY - 16);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(80,140,255,0.8)';
  ctx.fillRect(originX, originY + boardH + 30, boardW, 12);
  ctx.fillStyle = 'rgba(120,220,160,0.95)';
  ctx.fillRect(originX, originY + boardH + 30, boardW * Math.min(1, mission.hackProgress || 0), 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(originX, originY + boardH + 30, boardW, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '14px monospace';
  ctx.fillText(mission.hackMessage || 'Win three matches to unlock the drone.', originX, originY + boardH + 54);
}

function drawChessHack(mission){
  const chess = mission.chess;
  const size = chess ? chess.size : 6;
  const square = 72;
  const boardW = size * square;
  const boardH = size * square;
  const originX = Math.floor(W/2 - boardW/2);
  const originY = Math.floor(H/2 - boardH/2);
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(18,28,46,0.95)';
  ctx.fillRect(originX-14, originY-14, boardW+28, boardH+28);
  for(let r=0;r<size;r++){
    for(let c=0;c<size;c++){
      const light = (r+c)%2===0;
      ctx.fillStyle = light ? '#3a4d72' : '#1f2b44';
      const x = originX + c*square;
      const y = originY + r*square;
      ctx.fillRect(x,y,square,square);
    }
  }
  if(chess){
    if(chess.recommended){
      ctx.fillStyle = 'rgba(120,220,180,0.35)';
      const move = chess.recommended.move;
      ctx.fillRect(originX + move.x*square, originY + move.y*square, square, square);
    }
    if(chess.selected){
      ctx.fillStyle = 'rgba(255,220,120,0.35)';
      ctx.fillRect(originX + chess.selected.x*square, originY + chess.selected.y*square, square, square);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for(const move of chess.availableMoves){
        ctx.fillRect(originX + move.x*square + square/3, originY + move.y*square + square/3, square/3, square/3);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(originX + chess.cursor.x*square + 3, originY + chess.cursor.y*square + 3, square-6, square-6);
    ctx.lineWidth = 1;
    for(const piece of chess.pieces){
      if(piece.captured) continue;
      const x = originX + piece.x*square + square/2;
      const y = originY + piece.y*square + square/2;
      ctx.fillStyle = piece.color==='player' ? '#d6f4ff' : '#f4b8b8';
      ctx.beginPath();
      ctx.arc(x, y, square*0.32, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#0c1422';
      ctx.font = '20px monospace';
      const letter = piece.type.charAt(0).toUpperCase();
      ctx.fillText(letter, x-8, y+8);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign='center';
  ctx.font = '22px monospace';
  ctx.fillText('Strategic Breach — Chess Minigame', W/2, originY - 40);
  ctx.font = '16px monospace';
  ctx.fillText(`Wins: ${mission.hackWins}/${mission.config.hackWinsRequired || 3} • Games: ${mission.hackGames}${mission.config.hackMaxGames ? ` / ${mission.config.hackMaxGames}` : ''}`, W/2, originY - 16);
  ctx.textAlign='left';
  ctx.font = '14px monospace';
  ctx.fillText(mission.hackMessage || 'Win three games against the firewall AI.', originX, originY + boardH + 30);
  ctx.fillText('Arrow keys move cursor • Enter to move • H toggles hints', originX, originY + boardH + 50);
  ctx.textAlign='left';
}

function drawDronePhase(mission){
  const config = mission.config.drone || {};
  if(isBombardierMission(mission)){
    drawBombardierPhase(mission);
    return;
  }
  const terrain = config.terrain || 'mansion';
  const ox = -mission.camera.x;
  const oy = -mission.camera.y;
  ctx.fillStyle = terrain==='yacht' ? '#053349' : '#08170f';
  ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.translate(ox, oy);
  for(const target of mission.targets){
    if(target.destroyed){
      ctx.fillStyle = 'rgba(255,160,90,0.35)';
      const alpha = Math.max(0, target.destructionTimer/0.8);
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.radius + 80*(1-alpha), 0, Math.PI*2);
      ctx.fill();
      continue;
    }
    if(terrain === 'yacht'){
      ctx.fillStyle = '#d0f0ff';
      ctx.beginPath();
      ctx.ellipse(target.x, target.y, target.radius*1.4, target.radius*0.55, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#85b9cc';
      ctx.beginPath();
      ctx.ellipse(target.x, target.y, target.radius, target.radius*0.36, 0, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#2f4030';
      ctx.fillRect(target.x-target.radius, target.y-target.radius*0.6, target.radius*2, target.radius*1.2);
      ctx.fillStyle = '#47604a';
      ctx.fillRect(target.x-target.radius*0.85, target.y-target.radius*0.45, target.radius*1.7, target.radius*0.9);
    }
  }
  for(const enemy of mission.enemies){
    ctx.fillStyle = '#ff6c6c';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 14, 0, Math.PI*2);
    ctx.fill();
  }
  for(const bomb of mission.bombs){
    ctx.fillStyle = '#ffd27c';
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, 8, 0, Math.PI*2);
    ctx.fill();
  }
  for(const shot of mission.enemyShots){
    ctx.fillStyle = '#ff4a4a';
    ctx.fillRect(shot.x-3, shot.y-3, 6, 6);
  }
  for(const explosion of mission.explosions){
    ctx.fillStyle = 'rgba(255,200,120,0.25)';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI*2);
    ctx.fill();
  }
  if(mission.drone){
    const drone = mission.drone;
    ctx.save();
    ctx.translate(drone.x, drone.y);
    ctx.rotate(drone.heading);
    ctx.fillStyle = 'rgba(180,220,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(24,0);
    ctx.lineTo(-18,-16);
    ctx.lineTo(-18,16);
    ctx.closePath();
    ctx.fill();
    if(drone.damageFlash>0){
      ctx.fillStyle = 'rgba(255,120,120,0.55)';
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '20px monospace';
  ctx.fillText(config.missionText || 'Eliminate all targets.', 24, 32);
  ctx.font = '16px monospace';
  const total = config.totalTargets || 12;
  ctx.fillText(`Targets destroyed: ${mission.destroyedTargets}/${total}`, 24, 56);
  ctx.fillText(`Loan reduced: $${fmtCurrency(mission.loanSaved || 0)}`, 24, 78);
  if(mission.drone){
    const healthRatio = mission.drone.health / mission.drone.maxHealth;
    ctx.fillStyle = 'rgba(40,60,80,0.8)';
    ctx.fillRect(24, H-48, 220, 18);
    ctx.fillStyle = '#76e1ff';
    ctx.fillRect(24, H-48, 220 * Math.max(0, Math.min(1, healthRatio)), 18);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(24, H-48, 220, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '14px monospace';
    ctx.fillText('Drone Integrity', 24, H-58);
  }
  if(mission.overlay){
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '28px monospace';
    ctx.textAlign='center';
    ctx.fillText(mission.overlay.title || 'Mission Complete', W/2, H/2);
    ctx.textAlign='left';
  }
}

function drawBombardierPhase(mission){
  const config = mission.config.drone || {};
  const view = mission.bombardier;
  if(!view) return;
  const sightSize = view.viewSize;
  const rectX = view.viewX;
  const rectY = view.viewY;
  ctx.fillStyle = config.terrain === 'yacht' ? '#021b2b' : '#0b160d';
  ctx.fillRect(0,0,W,H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rectX, rectY, sightSize, sightSize);
  ctx.clip();

  const gradient = ctx.createLinearGradient(0, rectY, 0, rectY + sightSize);
  if(config.terrain === 'yacht'){
    gradient.addColorStop(0, '#08314a');
    gradient.addColorStop(1, '#0d1e29');
  } else {
    gradient.addColorStop(0, '#1a2b18');
    gradient.addColorStop(1, '#0f1610');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(rectX, rectY, sightSize, sightSize);

  ctx.strokeStyle = config.terrain === 'yacht' ? 'rgba(120,180,210,0.12)' : 'rgba(120,160,120,0.12)';
  ctx.lineWidth = 1;
  const stripeSpacing = sightSize * 0.14;
  const offset = view.groundOffset % stripeSpacing;
  ctx.beginPath();
  for(let y = rectY - stripeSpacing + offset; y < rectY + sightSize + stripeSpacing; y += stripeSpacing){
    ctx.moveTo(rectX - 20, y);
    ctx.lineTo(rectX + sightSize + 20, y + stripeSpacing*0.35);
  }
  ctx.stroke();

  for(const target of mission.targets){
    const x = target.x;
    const y = target.y;
    const w = target.width;
    const h = target.height;
    if(target.type === 'yacht'){
      ctx.fillStyle = target.destroyed ? '#4a1f1f' : '#d7ecf8';
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h*0.5, w/2, h/2.6, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = target.destroyed ? 'rgba(255,140,100,0.3)' : '#7baac1';
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h*0.42, w/2.4, h/3.4, 0, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = target.destroyed ? '#402222' : '#32442d';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = target.destroyed ? 'rgba(255,140,90,0.32)' : '#496045';
      ctx.fillRect(x + w*0.08, y + h*0.08, w*0.84, h*0.84);
    }
    if(target.hitFlash>0){
      ctx.fillStyle = `rgba(255,200,140,${Math.min(0.45, target.hitFlash*2)})`;
      ctx.fillRect(x-4, y-4, w+8, h+8);
    }
    if(target.destroyed){
      ctx.fillStyle = 'rgba(255,120,80,0.28)';
      ctx.beginPath();
      ctx.arc(x + w/2, y + h/2, Math.min(w, h)*0.6, 0, Math.PI*2);
      ctx.fill();
    }
    for(const person of target.people){
      const px = x + person.ox;
      const py = y + person.oy;
      const alpha = person.alive ? 0.85 : Math.max(0, person.fade*2.4);
      if(alpha <= 0) continue;
      ctx.fillStyle = `rgba(255,90,90,${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, sightSize * 0.01, 0, Math.PI*2);
      ctx.fill();
    }
  }

  for(const bomb of mission.bombs){
    ctx.fillStyle = '#ffe6a4';
    ctx.fillRect(bomb.x-3, bomb.y-8, 6, 16);
  }
  for(const explosion of mission.explosions){
    ctx.fillStyle = 'rgba(255,200,120,0.22)';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();

  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, rectY);
  ctx.fillRect(0, rectY + sightSize, W, H - (rectY + sightSize));
  ctx.fillRect(0, rectY, rectX, sightSize);
  ctx.fillRect(rectX + sightSize, rectY, W - (rectX + sightSize), sightSize);

  ctx.strokeStyle = 'rgba(120,200,220,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(rectX, rectY, sightSize, sightSize);

  ctx.strokeStyle = 'rgba(180,240,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(view.aimX - sightSize*0.08, view.aimY);
  ctx.lineTo(view.aimX + sightSize*0.08, view.aimY);
  ctx.moveTo(view.aimX, view.aimY - sightSize*0.08);
  ctx.lineTo(view.aimX, view.aimY + sightSize*0.08);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(180,240,255,0.25)';
  ctx.setLineDash([8,6]);
  ctx.strokeRect(rectX + sightSize*0.22, rectY + sightSize*0.22, sightSize*0.56, sightSize*0.56);
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '20px monospace';
  ctx.fillText(config.missionText || 'Eliminate all targets.', 24, 32);
  ctx.font = '16px monospace';
  const total = config.totalTargets || 12;
  ctx.fillText(`Targets destroyed: ${mission.destroyedTargets}/${total}`, 24, 56);
  ctx.fillText(`Loan reduced: $${fmtCurrency(mission.loanSaved || 0)}`, 24, 78);
  ctx.fillText('Press E to drop bombs • Arrow keys to adjust scope', 24, 102);

  if(mission.overlay){
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '28px monospace';
    ctx.textAlign='center';
    ctx.fillText(mission.overlay.title || 'Mission Complete', W/2, H/2);
    ctx.textAlign='left';
  }
}

function handleDroneMissionKeyDown(event){
  if(!droneMissionState) return false;
  const mission = droneMissionState;
  const key = event.key.toLowerCase();
  if(mission.phase === 'hack'){
    if(mission.config.hackType === 'tetris' && mission.tetris){
      if(key==='arrowleft' || key==='a'){ moveTetrisPiece(mission.tetris, -1, 0); event.preventDefault(); return true; }
      if(key==='arrowright' || key==='d'){ moveTetrisPiece(mission.tetris, 1, 0); event.preventDefault(); return true; }
      if(key==='arrowdown' || key==='s'){ mission.tetris.fastDrop = true; event.preventDefault(); return true; }
      if(key==='arrowup' || key==='w'){ rotateTetrisPiece(mission.tetris, 1); event.preventDefault(); return true; }
      if(key==='q'){ rotateTetrisPiece(mission.tetris, -1); event.preventDefault(); return true; }
      if(key===' '){
        if(mission.tetris){
          while(moveTetrisPiece(mission.tetris, 0, 1)){}
          lockTetrisPiece(mission);
        }
        event.preventDefault();
        return true;
      }
    } else if(mission.config.hackType === 'chess' && mission.chess){
      const chess = mission.chess;
      if(key==='arrowleft' || key==='a'){ chess.cursor.x = Math.max(0, chess.cursor.x-1); event.preventDefault(); return true; }
      if(key==='arrowright' || key==='d'){ chess.cursor.x = Math.min(chess.size-1, chess.cursor.x+1); event.preventDefault(); return true; }
      if(key==='arrowup' || key==='w'){ chess.cursor.y = Math.max(0, chess.cursor.y-1); event.preventDefault(); return true; }
      if(key==='arrowdown' || key==='s'){ chess.cursor.y = Math.min(chess.size-1, chess.cursor.y+1); event.preventDefault(); return true; }
      if(key==='h'){ chess.hints = !chess.hints; event.preventDefault(); return true; }
      if((key==='enter' || key===' ') && chess.turn==='player'){
        const piece = chessPieceAt(chess, chess.cursor.x, chess.cursor.y);
        if(chess.selectedPiece){
          const move = chess.availableMoves.find(m=>m.x===chess.cursor.x && m.y===chess.cursor.y);
          if(move){
            chessApplyMove(chess, chess.selectedPiece, move);
            event.preventDefault();
            if(move.capture && move.capture.type==='king' && move.capture.color==='ai'){
              concludeDroneHackMatch(mission, true, 'Firewall king eliminated.');
              return true;
            }
            chess.turn = 'ai';
            chess.moveDelay = 0.25;
            chess.selectedPiece = null;
            chess.selected = null;
            chess.availableMoves = [];
          } else {
            chess.selectedPiece = null;
            chess.selected = null;
            chess.availableMoves = [];
            event.preventDefault();
          }
          return true;
        } else if(piece && piece.color==='player'){
          chess.selectedPiece = piece;
          chess.selected = { x: piece.x, y: piece.y };
          chess.availableMoves = chessGenerateMoves(chess, piece);
          event.preventDefault();
          return true;
        }
      }
      if(key==='escape'){ chess.selectedPiece = null; chess.selected = null; chess.availableMoves = []; event.preventDefault(); return true; }
    }
  } else if(mission.phase === 'drone'){
    const bombardier = isBombardierMission(mission);
    if(key==='arrowleft' || key==='a'){ mission.input.left = true; event.preventDefault(); return true; }
    if(key==='arrowright' || key==='d'){ mission.input.right = true; event.preventDefault(); return true; }
    if(key==='arrowup' || key==='w'){ mission.input.up = true; event.preventDefault(); return true; }
    if(key==='arrowdown' || key==='s'){ mission.input.down = true; event.preventDefault(); return true; }
    if(!bombardier && key===' '){
      dropDroneBomb(mission);
      event.preventDefault();
      return true;
    }
    if(bombardier && (key==='e' || key==='enter')){
      dropDroneBomb(mission);
      event.preventDefault();
      return true;
    }
  }
  return false;
}

function handleDroneMissionKeyUp(event){
  if(!droneMissionState) return false;
  const mission = droneMissionState;
  const key = event.key.toLowerCase();
  if(mission.phase === 'hack' && mission.config.hackType === 'tetris' && mission.tetris){
    if(key==='arrowdown' || key==='s'){ mission.tetris.fastDrop = false; return true; }
  }
  if(mission.phase === 'drone'){
    if(key==='arrowleft' || key==='a'){ mission.input.left = false; return true; }
    if(key==='arrowright' || key==='d'){ mission.input.right = false; return true; }
    if(key==='arrowup' || key==='w'){ mission.input.up = false; return true; }
    if(key==='arrowdown' || key==='s'){ mission.input.down = false; return true; }
  }
  return false;
}

function handleDroneMissionMouseDown(event){
  if(!droneMissionState) return false;
  if(droneMissionState.phase === 'drone' && !isBombardierMission(droneMissionState)){
    dropDroneBomb(droneMissionState);
    event.preventDefault();
    return true;
  }
  return false;
}

function drawTopDown(){
  ctx.fillStyle = activePalette && activePalette.background ? activePalette.background : '#0b121c';
  ctx.fillRect(0,0,W,H);
  if(!topDownState) return;
  const td = topDownState;
  const tile = td.tileSize;
  for(let row=0; row<td.rows; row++){
    for(let col=0; col<td.cols; col++){
      const x = td.offsetX + col * tile;
      const y = td.offsetY + row * tile;
      if(td.grid[row][col] === 0){
        ctx.fillStyle = 'rgba(44,64,88,0.92)';
        ctx.fillRect(x, y, tile, tile);
        ctx.fillStyle = 'rgba(120,160,200,0.22)';
        ctx.fillRect(x+2, y+2, tile-4, tile-4);
      } else {
        ctx.fillStyle = 'rgba(8,12,18,0.96)';
        ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  ctx.save();
  ctx.fillStyle = 'rgba(150,110,60,0.35)';
  for(const gap of td.gaps){
    ctx.fillRect(gap.x - tile*0.45, gap.y - tile*0.45, tile*0.9, tile*0.9);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(220,210,120,0.85)';
  ctx.lineWidth = 2;
  for(const ladder of td.ladders){
    const x = ladder.x;
    const y = ladder.y;
    ctx.beginPath();
    ctx.moveTo(x - tile*0.28, y - tile*0.4);
    ctx.lineTo(x - tile*0.28, y + tile*0.4);
    ctx.moveTo(x + tile*0.28, y - tile*0.4);
    ctx.lineTo(x + tile*0.28, y + tile*0.4);
    for(let r=-2; r<=2; r++){
      const stepY = y + r * tile*0.18;
      ctx.moveTo(x - tile*0.28, stepY);
      ctx.lineTo(x + tile*0.28, stepY);
    }
    ctx.stroke();
  }
  ctx.restore();

  for(const box of td.boxes){
    const size = tile*0.7;
    const bx = box.x - size/2;
    const by = box.y - size/2;
    ctx.fillStyle = box.activated ? 'rgba(120,255,180,0.85)' : 'rgba(255,220,140,0.85)';
    ctx.fillRect(bx, by, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, size, size);
  }

  for(const loot of td.loot){
    if(loot.collected) continue;
    const lx = loot.x;
    const ly = loot.y;
    if(loot.type === 'cash'){
      ctx.fillStyle = 'rgba(90,220,150,0.85)';
      ctx.beginPath();
      ctx.arc(lx, ly, tile*0.26, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#0c2a18';
      ctx.font = `${Math.max(10, Math.floor(tile*0.3))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', lx, ly);
    } else if(loot.type === 'intel'){
      ctx.fillStyle = 'rgba(120,200,255,0.85)';
      ctx.fillRect(lx - tile*0.3, ly - tile*0.22, tile*0.6, tile*0.44);
    } else if(loot.type === 'file' || loot.type === 'cache'){
      ctx.fillStyle = 'rgba(255,190,140,0.85)';
      ctx.beginPath();
      ctx.moveTo(lx - tile*0.32, ly - tile*0.26);
      ctx.lineTo(lx + tile*0.34, ly - tile*0.26);
      ctx.lineTo(lx + tile*0.26, ly + tile*0.28);
      ctx.lineTo(lx - tile*0.4, ly + tile*0.28);
      ctx.closePath();
      ctx.fill();
    } else if(loot.type === 'weapon'){
      ctx.fillStyle = 'rgba(200,130,240,0.85)';
      ctx.fillRect(lx - tile*0.25, ly - tile*0.25, tile*0.5, tile*0.5);
    } else if(loot.type === 'secret'){
      ctx.fillStyle = 'rgba(255,120,200,0.9)';
      ctx.beginPath();
      ctx.arc(lx, ly, tile*0.28, 0, Math.PI*2);
      ctx.fill();
    } else if(loot.type === 'upgrade'){
      ctx.fillStyle = 'rgba(255,255,140,0.85)';
      ctx.beginPath();
      ctx.moveTo(lx, ly - tile*0.32);
      ctx.lineTo(lx + tile*0.28, ly + tile*0.32);
      ctx.lineTo(lx - tile*0.28, ly + tile*0.32);
      ctx.closePath();
      ctx.fill();
    }
  }

  if(td.door){
    const glow = td.door.glowUntil && td.door.glowUntil > now();
    ctx.strokeStyle = glow || td.missionComplete ? 'rgba(120,255,180,0.9)' : 'rgba(255,220,140,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(td.door.x - tile*0.4, td.door.y - tile*0.4, tile*0.8, tile*0.8);
    ctx.fillStyle = 'rgba(40,60,90,0.55)';
    ctx.fillRect(td.door.x - tile*0.4, td.door.y - tile*0.4, tile*0.8, tile*0.8);
  }

  for(const intern of td.interns){
    ctx.fillStyle = intern.alive ? 'rgba(220,220,255,0.85)' : 'rgba(120,20,40,0.6)';
    ctx.beginPath();
    ctx.arc(intern.x, intern.y, tile*0.24, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#0b1420';
    ctx.font = `${Math.max(9, Math.floor(tile*0.22))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('i', intern.x, intern.y);
  }

  ctx.fillStyle = '#88f6ff';
  ctx.beginPath();
  ctx.arc(player.x + player.w/2, player.y + player.h/2, Math.max(player.w, player.h)/2, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = '#0a1f2c';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '16px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Electrical Boxes: ${td.hotwiredCount}/${td.requiredBoxes}`, 24, 20);
  ctx.fillText(`Interns pacified: ${td.internsKilled}/${td.interns.length}`, 24, 40);
  if(td.secretPhotos && td.secretPhotos.length){
    const collected = td.loot.filter(l => l.type==='secret' && l.collected).length;
    ctx.fillText(`Secret Files: ${collected}/${td.secretPhotos.length}`, 24, 60);
  }
  if(td.missionComplete){
    ctx.fillStyle = 'rgba(120,255,180,0.85)';
    ctx.fillText('Return to the elevator!', 24, 80);
  }
}

function makeArcadeBeatdownLevel(floor, yBase){
  const levelSpan = levelWidth();
  arcadeBeatdownActive = true;
  arcadePixelOverlay = true;
  lightingCondition = 'neon';
  backgroundFX.length = 0;
  backgroundFX.push({type:'arcadeBackdrop'});
  backgroundFX.push({type:'arcadeGrid'});

  const cubicleBands = 9;
  const cubicleWidth = (levelSpan - 180) / cubicleBands;
  for(let i=0;i<cubicleBands;i++){
    const cx = 90 + i * cubicleWidth;
    backgroundFX.push({type:'arcadeCubicle', x:cx, y:yBase-150, w:cubicleWidth-24, h:92});
  }

  const chartCount = 4;
  for(let i=0;i<chartCount;i++){
    const ratio = chartCount===1 ? 0.5 : i/Math.max(1, chartCount-1);
    const chartX = 160 + ratio * (levelSpan - 320);
    backgroundFX.push({type:'arcadeChart', x:chartX, y:120, w:140, h:88, flip:i%2===0});
  }

  const deskCount = 9;
  const deskWidth = 96;
  const deskHeight = 38;
  const laneStart = 100;
  const laneEnd = levelSpan - 320;
  for(let d=0; d<deskCount; d++){
    const t = deskCount===1 ? 0.5 : d/Math.max(1, deskCount-1);
    const dx = laneStart + t * (laneEnd - laneStart);
    const desk = { x: dx, y: yBase - deskHeight, w: deskWidth, h: deskHeight };
    desks.push(desk);
    stealthZones.push({ ...desk });
    deskDrawers.push({ x: desk.x + 12, y: desk.y + 8, w: 18, h: 16, used:false });
    if(d % 2 === 1){
      pickups.push({ type:'cash', x: desk.x + desk.w/2 - 10, y: desk.y - 24, w:20, h:20, amount: 24 + Math.round(Math.random()*12) });
    }
  }

  const plantSlots = [0.18*W, 1.4*W, 2.6*W];
  for(const px of plantSlots){ plants.push({x:px, y:yBase-32, w:28, h:32}); }

  waterCoolers.push({x:0.5*W, y:yBase-62, w:32, h:62});
  vendingMachines.push(createVendingMachine(0.95*W, yBase-70, 38, 70, floor));
  coffeeMachines.push({x:1.65*W, y:yBase-62, w:34, h:60, used:false});
  printers.push({x:2.0*W, y:yBase-56, w:36, h:44, jammed:false});

  const stationWidth = 150;
  const stationHeight = 116;
  const stationX = 2.35*W;
  const stationY = yBase - stationHeight - 12;
  const station = { x: stationX, y: stationY, w: stationWidth, h: stationHeight, used:false, promptShown:false };
  arcadeStations.push(station);
  backgroundFX.push({type:'arcadeGunMount', x: stationX, y: stationY, w: stationWidth, h: stationHeight});
  pickups.push({type:'intel', x: stationX + stationWidth/2 - 10, y: stationY - 26, w:20, h:20});

  windowsArr.length = 0;
  const windowRows = 2;
  const windowCols = 10;
  const winWidth = 46;
  const winHeight = 26;
  const winStartX = 80;
  const winGap = (levelSpan - winStartX*2 - winWidth) / Math.max(1, windowCols-1);
  for(let r=0;r<windowRows;r++){
    for(let c=0;c<windowCols;c++){
      const wx = winStartX + c * winGap;
      const wy = 80 + r * 44;
      windowsArr.push({x:wx, y:wy, w:winWidth, h:winHeight});
    }
  }

  const thugCount = 6 + Math.floor(floor/4);
  for(let g=0; g<thugCount; g++){
    const spread = thugCount<=1 ? 0.5 : g/Math.max(1, thugCount-1);
    const gx = laneStart + spread * (laneEnd - laneStart) + 60;
    const guard = makeGuard(gx, yBase-42, floor);
    guard.x = gx;
    guard.y = yBase - guard.h;
    guard.vx = (Math.random()<0.5?-1:1) * Math.max(0.55, guard.speed||0.8);
    guard.spawnOrigin = guard.x;
    guards.push(guard);
  }

  const workerRows = 3;
  for(let w=0; w<workerRows; w++){
    const zoneDesk = desks[w*2] || desks[0];
    if(!zoneDesk) break;
    const appearance = createWorkerAppearance();
    workers.push({
      x: zoneDesk.x + zoneDesk.w/2 - 9,
      y: yBase - 38,
      w: 18,
      h: 38,
      vx: (Math.random()<0.5?-1:1) * 0.35,
      minX: zoneDesk.x - 24,
      maxX: zoneDesk.x + zoneDesk.w + 24,
      bob: Math.random() * Math.PI * 2,
      alive:true,
      hp:10,
      maxHp:10,
      rewardClaimed:false,
      hitFlashUntil:0,
      facing:1,
      appearance,
      showTie:Math.random()<0.85,
      hasBadge:Math.random()<0.4,
      hasClipboard:false,
      clipboardSide:1,
      glasses:Math.random()<0.3
    });
  }

  spotlights.push({x:0.6*W, y:yBase-150, w:90, h:18, range:240, t:0, speed:0.8});
  spotlights.push({x:1.6*W, y:yBase-150, w:90, h:18, range:240, t:Math.PI/2, speed:0.7});

  floorSlab = {x:0, y:yBase, w:levelSpan, h:18};
  door = { x: levelSpan-160, y: yBase-120, w:120, h:120, unlocked:false, open:false, lift:0, glowUntil:0 };
  totalServersOnFloor = -1;
  destroyedOnFloor = 0;
}

function startArcadeRampage(station, options={}){
  const theme = options.theme || (station && station.theme) || 'office';
  if(theme !== 'hellscape' && !isArcadeBeatdownFloor(currentFloor)) return;
  if(arcadeRampage && arcadeRampage.active) return;
  if(station) station.used = true;
  let target;
  let maxSimultaneous;
  let cooldown = 90;
  if(theme === 'hellscape'){
    const remaining = hellscapeState ? Math.max(0, (hellscapeState.waveTarget || 0) - (hellscapeState.waveKills || 0)) : ARCADE_RAMPAGE_TARGET_DEFAULT;
    if(remaining <= 0){
      if(station){ station.used = false; }
      centerNote('Perimeter gun idle — wave already cleared.', 1600);
      notify('No zombies in range — save the ammunition.');
      return;
    }
    target = Math.max(1, remaining || 10);
    const wave = hellscapeState ? hellscapeState.wave || 1 : 1;
    maxSimultaneous = Math.min(10, 4 + Math.floor(wave / 2));
    cooldown = 70;
  } else {
    target = currentFloor >= 23 ? ARCADE_RAMPAGE_TARGET_DEFAULT + 12 : currentFloor >= 14 ? ARCADE_RAMPAGE_TARGET_DEFAULT + 6 : ARCADE_RAMPAGE_TARGET_DEFAULT;
    maxSimultaneous = currentFloor >= 23 ? 7 : currentFloor >= 14 ? 6 : 5;
  }
  arcadeRampage = {
    active:true,
    station,
    theme,
    kills:0,
    target,
    targets:[],
    spawnTimer:0,
    nextSpawn:0.5,
    lastShot:0,
    cooldown,
    muzzleFlashUntil:0,
    screenShake:0,
    bgScroll:0,
    maxSimultaneous,
    completed:false
  };
  attackHeld = false;
  clampArcadeAim(W/2, H*0.55);
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.hidden = false;
  player.crouch = false;
  if(theme === 'hellscape'){
    centerNote('Perimeter gun online! Aim with mouse or arrows and hold E or mouse to fire.', 2400);
    notify('Mounted the perimeter gun — zombies closing in!');
  } else {
    centerNote('Machine gun nest engaged! Aim with mouse or arrows and hold E or mouse to fire.', 2400);
    notify('Mounted the machine gun — office thugs approaching!');
  }
}

function spawnArcadeRampageTarget(){
  if(!arcadeRampage || arcadeRampage.completed) return;
  const theme = arcadeRampage.theme || 'office';
  if(theme === 'hellscape'){
    const wave = hellscapeState ? hellscapeState.wave || 1 : 1;
    const laneOptions = [-1, -0.5, 0, 0.5, 1];
    const lane = laneOptions[Math.floor(Math.random()*laneOptions.length)];
    const baseHp = 2 + Math.random()*2 + (wave-1)*0.4;
    const hp = Math.max(2, Math.round(baseHp));
    const speed = 0.34 + Math.random()*0.16 + Math.min(0.22, (wave-1)*0.02);
    arcadeRampage.targets.push({ lane, distance: 1.5 + Math.random()*0.4, speed, hp, maxHp:hp, wobble:Math.random()*Math.PI*2 });
  } else {
    const laneOptions = [-1, 0, 1];
    const lane = laneOptions[Math.floor(Math.random()*laneOptions.length)];
    const difficulty = arcadeRampage.kills || 0;
    const hp = 3;
    const speed = 0.32 + Math.random()*0.12 + Math.min(0.18, difficulty*0.01);
    arcadeRampage.targets.push({ lane, distance: 1.4 + Math.random()*0.35, speed, hp, maxHp:hp, wobble:Math.random()*Math.PI*2 });
  }
}

function arcadeTargetScreenRect(target){
  const progress = clamp(1 - (target.distance || 1), 0, 1);
  const scale = 0.6 + progress * 3.1;
  const width = 42 * scale;
  const height = 78 * scale;
  const wobble = Math.sin(target.wobble||0) * (12 * (1-progress));
  const laneOffset = (target.lane || 0) * 140 * (1 - progress * 0.4);
  const x = W/2 + laneOffset + wobble - width/2;
  const y = H - 160 - height + progress * 50;
  return { x, y, w: width, h: height, progress };
}

function fireArcadeRampage(){
  if(!arcadeRampage || !arcadeRampage.active) return;
  const t = now();
  const cooldown = arcadeRampage.cooldown || 90;
  if(arcadeRampage.lastShot && t - arcadeRampage.lastShot < cooldown) return;
  arcadeRampage.lastShot = t;
  arcadeRampage.muzzleFlashUntil = t + 90;
  arcadeRampage.screenShake = Math.min(0.65, (arcadeRampage.screenShake||0) + 0.18);
  if(!arcadeRampage.targets.length) return;
  const sorted = [...arcadeRampage.targets].sort((a,b)=> (a.distance||0) - (b.distance||0));
  const aim = arcadeAim;
  const tolerance = 14;
  let target = null;
  for(const candidate of sorted){
    const rect = arcadeTargetScreenRect(candidate);
    if(aim.x >= rect.x - tolerance && aim.x <= rect.x + rect.w + tolerance && aim.y >= rect.y - tolerance && aim.y <= rect.y + rect.h + tolerance){
      target = candidate;
      break;
    }
  }
  if(!target) return;
  target.hp -= 1;
  if(target.hp <= 0){
    const index = arcadeRampage.targets.indexOf(target);
    if(index>=0){ arcadeRampage.targets.splice(index,1); }
    arcadeRampage.kills++;
    if(arcadeRampage.theme === 'hellscape'){
      recordHellscapeZombieKill();
      addChecking(5);
      notify('+$5 (zombie)');
    }
    if(arcadeRampage.kills >= arcadeRampage.target){
      completeArcadeRampage();
    }
  }
}

function updateArcadeRampage(dt){
  if(!arcadeRampage || !arcadeRampage.active) return;
  const aimInputX = (keys['arrowleft'] ? -1 : 0) + (keys['arrowright'] ? 1 : 0) + (keys['a'] ? -1 : 0) + (keys['d'] ? 1 : 0);
  const aimInputY = (keys['arrowup'] ? -1 : 0) + (keys['arrowdown'] ? 1 : 0) + (keys['w'] ? -1 : 0) + (keys['s'] ? 1 : 0);
  if(aimInputX !== 0 || aimInputY !== 0){
    const length = Math.hypot(aimInputX, aimInputY) || 1;
    const aimSpeed = 420;
    const nextX = arcadeAim.x + (aimInputX / length) * aimSpeed * dt;
    const nextY = arcadeAim.y + (aimInputY / length) * aimSpeed * dt;
    clampArcadeAim(nextX, nextY);
  }
  arcadeRampage.bgScroll = (arcadeRampage.bgScroll || 0) + dt * 120;
  arcadeRampage.spawnTimer += dt;
  if(arcadeRampage.spawnTimer >= (arcadeRampage.nextSpawn || 0.6)){
    arcadeRampage.spawnTimer = 0;
    arcadeRampage.nextSpawn = Math.max(0.35, 0.55 - Math.min(0.2, (arcadeRampage.kills||0)*0.01)) + Math.random()*0.15;
    if(arcadeRampage.targets.length < (arcadeRampage.maxSimultaneous || 5)){
      spawnArcadeRampageTarget();
    }
  }
  const nowTs = now();
  for(const target of arcadeRampage.targets){
    target.distance -= dt * target.speed;
    target.wobble = (target.wobble || 0) + dt * 4.2;
    if(target.distance <= 0){
      damage();
      player.screenFlashUntil = Math.max(player.screenFlashUntil, nowTs + 240);
      arcadeRampage.screenShake = Math.max(arcadeRampage.screenShake||0, 0.45);
      target.distance = 0;
      target.reached = true;
    }
  }
  arcadeRampage.targets = arcadeRampage.targets.filter(t=>!t.reached && t.hp>0);
  if(arcadeRampage.muzzleFlashUntil && nowTs > arcadeRampage.muzzleFlashUntil){
    arcadeRampage.muzzleFlashUntil = 0;
  }
  if(arcadeRampage.screenShake){
    arcadeRampage.screenShake = Math.max(0, arcadeRampage.screenShake - dt*1.6);
  }
}

function completeArcadeRampage(){
  if(!arcadeRampage || arcadeRampage.completed) return;
  arcadeRampage.completed = true;
  arcadeRampage.active = false;
  arcadeRampage.targets = [];
  arcadeRampage.muzzleFlashUntil = 0;
  arcadeRampage.screenShake = 0;
  const theme = arcadeRampage.theme || 'office';
  if(theme === 'hellscape'){
    if(arcadeRampage.station){
      arcadeRampage.station.used = false;
      arcadeRampage.station.promptShown = false;
    }
    attackHeld = false;
    centerNote('Perimeter gun disengaged.', 1600);
    notify('Perimeter gun cools down — stay on the move.');
    arcadeRampage = null;
    return;
  }
  destroyedOnFloor = 0;
  totalServersOnFloor = 0;
  if(door){
    door.unlocked = true;
    door.glowUntil = now() + 4000;
  }
  if(arcadeRampage.station){
    arcadeRampage.station.completed = true;
  }
  pickups.push({type:'ammo', x: floorSlab.x + floorSlab.w - 220, y: floorSlab.y-28, w:20, h:20, amount:36});
  pickups.push({type:'cash', x: floorSlab.x + floorSlab.w - 260, y: floorSlab.y-28, w:20, h:20, amount:80});
  centerNote('Office horde repelled! Elevator unlocked.', 2200);
  notify('Machine gun nest cleared the office thugs. Elevator is open.');
  attackHeld = false;
}

function spawnEcoBossRoom(floor){
  ecoBossActive = true;
  ecoProjectiles = [];
  hostagesInRoom = [];
  backgroundFX.push({type:'serverParallax'});
  const yBase = H - 70;
  const upperPlatform = yBase - 140;
  const levelSpan = levelWidth();
  walls.push({x:0,y:0,w:levelSpan,h:H});
  floorSlab = {x:0,y:yBase,w:levelSpan,h:18};
  walls.push({x:0.35*W, y:upperPlatform, w:0.5*W, h:12, isPlatform:true});
  walls.push({x:1.25*W, y:upperPlatform-60, w:0.6*W, h:12, isPlatform:true});
  walls.push({x:2.15*W, y:upperPlatform, w:0.5*W, h:12, isPlatform:true});
  plants.push({x:0.48*W, y:yBase-32, w:24, h:32});
  plants.push({x:2.32*W, y:yBase-32, w:24, h:32});
  door = { x: levelSpan-200, y: yBase-200, w:160, h:200, unlocked:false, open:false, lift:0, glowUntil:0 };
  ecoBoss = {
    x: 1.5*W - 90,
    y: upperPlatform - 220,
    baseY: upperPlatform - 220,
    w: 180,
    h: 220,
    hp: 520,
    maxHp: 520,
    hitFlashUntil: 0,
    attackTimer: 2.6,
    pattern: 0,
    bob: 0,
    defeated: false
  };
  const slots = [
    { x: 0.55*W, y: yBase-60 },
    { x: 0.9*W, y: yBase-88 },
    { x: 1.25*W, y: yBase-54 },
    { x: 1.65*W, y: yBase-86 },
    { x: 2.0*W, y: yBase-58 },
    { x: 2.35*W, y: yBase-78 }
  ];
  const available = getActiveHostages();
  const toSeat = Math.min(available.length, slots.length);
  for(let i=0;i<toSeat;i++){
    hostagesInRoom.push(spawnHostageChair(available[i], slots[i]));
  }
  player.x = initialSpawnX;
  player.y = yBase - player.h;
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  notify('Eco Boss: Green Overseer has staged hostages. Rescue them!');
  centerNote('Green Overseer', 1600);
  updateHostageHud();
}

function rescueCosignerHostage(name, { showCenter=false }={}){
  hostageState.taken = hostageState.taken.filter((n)=>n!==name);
  if(!hostageState.rescued.includes(name)) hostageState.rescued.push(name);
  reduceLoanByPercent(0.10);
  applyHopeBuff();
  const balanceText = `$${fmtCurrency(player.loanBalance)}`;
  ui.toast(`Freed ${name}! Loan reduced to ${balanceText}.`);
  if(showCenter){
    centerNote(`${name} freed!`, 1600);
  }
  updateHostageHud();
  return balanceText;
}

function freeFinalHostage(hostage){
  if(!hostage || hostage.freed || hostage.removed) return false;
  hostage.freed = true;
  hostage.safe = false;
  hostage.onGround = false;
  hostage.vx = 0;
  hostage.vy = -6.5;
  const rightExit = levelWidth() + 80;
  const leftExit = -80;
  const exitHint = door ? (door.x + door.w + 120) : rightExit;
  const runDir = Math.sign(exitHint - hostage.x) || 1;
  hostage.escapeDir = runDir;
  hostage.escapeTarget = runDir >= 0 ? rightExit : leftExit;
  hostage.escapeCelebrated = false;
  rescueCosignerHostage(hostage.name, { showCenter:true });
  notify(`${hostage.name} freed — guide them to the exit!`);
  return true;
}

function spawnHostageChair(name, slot){
  const chair = {
    name,
    x: slot.x,
    y: slot.y,
    w: 36,
    h: 44,
    timerMs: 20000,
    freed:false,
    lost:false,
    removed:false
  };
  chair.free = ()=>{
    if(chair.freed || chair.lost) return;
    chair.freed = true;
    chair.removed = true;
    rescueCosignerHostage(name);
  };
  chair.fail = ()=>{
    if(chair.freed || chair.lost) return;
    chair.lost = true;
    chair.removed = true;
    if(!hostageState.lost.includes(name)) hostageState.lost.push(name);
    ui.toast(`${name} was taken away…`);
    updateHostageHud();
  };
  return chair;
}

function updateHostageChairs(dt){
  if(!ecoBossActive || !hostagesInRoom.length) return;
  const dtMs = dt * 1000;
  for(const chair of hostagesInRoom){
    if(!chair || chair.removed || chair.freed || chair.lost) continue;
    chair.timerMs -= dtMs;
    if(chair.timerMs <= 0){
      chair.fail();
    }
  }
  hostagesInRoom = hostagesInRoom.filter((chair)=>chair && !chair.removed);
}

function updateFinalHostages(dt){
  if(!finalHostages.length) return;
  const groundY = floorSlab ? floorSlab.y : (H - 50);
  const rightExit = levelWidth() + 80;
  const leftExit = -80;
  let frameScale = dt ? dt * 60 : 0;
  if(!Number.isFinite(frameScale) || frameScale < 0){
    frameScale = 0;
  }
  for(const hostage of finalHostages){
    if(!hostage || hostage.removed) continue;
    if(hostage.freed){
      if(frameScale <= 0){
        hostage.onGround = hostage.y >= groundY;
        continue;
      }
      let remaining = frameScale;
      while(remaining > 0 && !hostage.removed){
        const step = Math.min(1, remaining);
        hostage.vy = (hostage.vy || 0) + GRAV * 0.85 * step;
        hostage.y += hostage.vy * step;
        if(hostage.y >= groundY){
          hostage.y = groundY;
          hostage.vy = 0;
          hostage.onGround = true;
        } else if(hostage.y < groundY){
          hostage.onGround = false;
        }
        if(hostage.onGround){
          const dir = hostage.escapeDir || 1;
          const speed = (hostage.speed || 1.8) * step;
          hostage.x += dir * speed;
          const exitTarget = typeof hostage.escapeTarget === 'number'
            ? hostage.escapeTarget
            : (dir >= 0 ? rightExit : leftExit);
          const escaped = dir >= 0 ? (hostage.x >= exitTarget) : (hostage.x <= exitTarget);
          if(escaped && !hostage.safe){
            hostage.safe = true;
            hostage.removed = true;
            notify(`${hostage.name} escaped the penthouse!`);
          }
        }
        remaining -= step;
      }
    } else {
      hostage.idlePhase = (hostage.idlePhase || 0) + dt * 2.2;
    }
  }
  finalHostages = finalHostages.filter(h=>h && !h.removed);
}

function spawnRootSnare(){
  const px = player.x + player.w/2;
  const py = player.y + player.h;
  ecoProjectiles.push({ type:'root', x:px-36, y:py-12, w:72, h:42, life:0.9, triggered:false });
}

function spawnSporeCloud(){
  const center = ecoBoss ? ecoBoss.x + ecoBoss.w/2 : player.x + player.w/2;
  for(let i=0;i<3;i++){
    const offset = (i-1) * 90;
    ecoProjectiles.push({ type:'spore', x:center + offset, y:(ecoBoss?ecoBoss.y:player.y) - 20, vx:(Math.random()*2-1)*40, vy:30 + Math.random()*20, radius:26, life:4.5 });
  }
}

function spawnSolarFlare(){
  const startX = player.x + player.w/2 - 14;
  ecoProjectiles.push({ type:'flare', x:startX, y:80, w:28, h:floorSlab ? (floorSlab.y-80) : (H-120), life:1.2, flashed:false });
}

function updateEcoProjectiles(dt){
  if(!ecoProjectiles.length) return;
  const playerBox = { x:player.x, y:player.y, w:player.w, h:player.h };
  for(const proj of ecoProjectiles){
    proj.life -= dt;
    if(proj.type==='root'){
      if(!proj.triggered && rect(playerBox, {x:proj.x, y:proj.y, w:proj.w, h:proj.h})){
        loseChecking(15);
        player.vx *= 0.2;
        proj.triggered = true;
      }
    } else if(proj.type==='spore'){
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      const dx = (player.x + player.w/2) - proj.x;
      const dy = (player.y + player.h/2) - proj.y;
      if(Math.hypot(dx, dy) < (proj.radius||24)){
        loseChecking(6);
        player.screenFlashUntil = Math.max(player.screenFlashUntil, now()+700);
        proj.life -= 0.6;
      }
    } else if(proj.type==='flare'){
      if(!proj.flashed){
        player.screenFlashUntil = Math.max(player.screenFlashUntil, now()+900);
        proj.flashed = true;
      }
      if(rect(playerBox, {x:proj.x, y:proj.y, w:proj.w, h:proj.h})){
        loseChecking(18);
        proj.life -= 0.4;
      }
    }
  }
  ecoProjectiles = ecoProjectiles.filter((proj)=>proj.life>0);
}

function updateEcoBoss(dt){
  if(!ecoBossActive || !ecoBoss || ecoBoss.defeated) return;
  ecoBoss.bob = (ecoBoss.bob || 0) + dt * 1.4;
  const wander = Math.sin(ecoBoss.bob * 0.6) * 60;
  const center = 1.5*W;
  ecoBoss.x = clamp(center + wander - ecoBoss.w/2, 0.9*W, 2.1*W - ecoBoss.w);
  ecoBoss.y = ecoBoss.baseY + Math.sin(ecoBoss.bob) * 24;
  ecoBoss.attackTimer -= dt;
  if(ecoBoss.attackTimer <= 0){
    const pattern = ecoBoss.pattern || 0;
    if(pattern % 3 === 0) spawnRootSnare();
    else if(pattern % 3 === 1) spawnSporeCloud();
    else spawnSolarFlare();
    ecoBoss.pattern = pattern + 1;
    ecoBoss.attackTimer = 2.6 + Math.random()*1.8;
  }
}

function onEcoBossDeath(){
  if(!ecoBoss || ecoBoss.defeated) return;
  ecoBoss.defeated = true;
  for(const chair of hostagesInRoom){
    if(!chair || chair.removed) continue;
    if(!chair.freed && !chair.lost){
      chair.freed = true;
      hostageState.taken = hostageState.taken.filter((n)=>n!==chair.name);
      if(!hostageState.rescued.includes(chair.name)) hostageState.rescued.push(chair.name);
      reduceLoanByPercent(0.10);
      applyHopeBuff();
      ui.toast(`Auto-freed ${chair.name}. Loan now $${fmtCurrency(player.loanBalance)}.`);
    }
  }
  hostagesInRoom = [];
  updateHostageHud();
  if(door){
    door.unlocked = true;
    door.glowUntil = now()+4000;
  }
  ecoProjectiles = [];
  ecoBossActive = false;
  notify('Eco Boss defeated — hostages released.');
  centerNote('Green Overseer Fallen', 1800);
}

function makeBoardRoomLevel(floor, yBase){
  const levelSpan = levelWidth();
  const tableTop = yBase - 150;
  floorSlab.x = 0;
  floorSlab.y = tableTop;
  floorSlab.w = levelSpan;
  floorSlab.h = 22;

  backgroundFX.length = 0;
  backgroundFX.push({type:'boardCharts'});

  const tableX = 0.2*W;
  const tableWidth = levelSpan - 0.4*W;
  const tableHeight = 26;
  const legs = [
    {x: tableX + 42, y: tableTop, w:28, h:96},
    {x: tableX + tableWidth - 70, y: tableTop, w:28, h:96}
  ];
  boardTables.push({
    x: tableX,
    y: tableTop - tableHeight,
    w: tableWidth,
    h: tableHeight,
    legs,
    runner: {x: tableX + 30, y: tableTop - tableHeight + 6, w: tableWidth - 60, h:10}
  });
  const boardSeats = Math.min(8, 5 + Math.floor(Math.max(0, floor-8)/8));
  const seatSpacing = boardSeats>1 ? (tableWidth - 120) / (boardSeats - 1) : 0;
  for(let s=0; s<boardSeats; s++){
    const seatX = tableX + 60 + seatSpacing * s;
    boardMembers.push({
      x: seatX - 16,
      y: tableTop - tableHeight - 48,
      w: 32,
      h: 46,
      facing: 1,
      focus: player.x + player.w/2,
      tracker: 0.5,
      bob: Math.random() * Math.PI * 2,
      blink: Math.random() * Math.PI * 2,
      seed: Math.random() * Math.PI * 2,
      seatX
    });
  }
  deskDrawers.push({x: tableX + tableWidth/2 - 24, y: tableTop - 32, w:48, h:18, used:false});

  coffeeMachines.push({x: tableX + 48, y: tableTop - 58, w:32, h:58, used:false});
  vendingMachines.push(createVendingMachine(tableX + tableWidth - 84, tableTop - 68, 36, 68, floor));

  const serverCount = serverObjective ? 4 : 2;
  for(let s=0;s<serverCount;s++){
    const t = serverCount===1 ? 0.5 : (serverCount===0 ? 0 : s/Math.max(1, serverCount-1));
    const sx = tableX + 120 + t*(tableWidth - 240);
    servers.push({x:sx, y:tableTop - 30, w:32, h:30, hp:18 + Math.floor(floor/3), destroyed:false, armed:false, armTime:0});
  }

  panels.push({x: tableX + tableWidth - 150, y: tableTop - 90, w:32,h:28, disabled:false});
  spotlights.push({x: tableX + 120, y: tableTop - 200, w:160, h:20, range:240, t:0, speed:0.8});
  spotlights.push({x: tableX + tableWidth - 280, y: tableTop - 200, w:160, h:20, range:240, t:Math.PI, speed:0.8});

  const bossGuard = makeGuard(tableX + tableWidth/2, tableTop - 42, Math.min(FLOORS, floor+4));
  const originalBossWidth = bossGuard.w;
  bossGuard.maxHp = Math.round(bossGuard.maxHp * 1.45);
  bossGuard.hp = bossGuard.maxHp;
  bossGuard.damageReduction = Math.min(0.55, (bossGuard.damageReduction||0) + 0.2);
  bossGuard.boss = true;
  bossGuard.w = Math.round(bossGuard.w * 2);
  bossGuard.h = Math.round(bossGuard.h * 2);
  bossGuard.x -= Math.round((bossGuard.w - originalBossWidth)/2);
  bossGuard.x = clamp(bossGuard.x, tableX + 40, tableX + tableWidth - bossGuard.w - 40);
  bossGuard.y = tableTop - bossGuard.h;
  guards.push(bossGuard);
  if(floor >= 16){
    const aide = makeGuard(tableX + tableWidth/2 - 200, tableTop - 42, Math.min(FLOORS, floor+2));
    aide.y = tableTop - aide.h;
    guards.push(aide);
  }

  pickups.push({type:'special', x:tableX+tableWidth/2-20, y:tableTop-52, w:24, h:24});
  pickups.push({type:'cash', x:tableX+100, y:tableTop-40, w:20, h:20, amount:120});
  pickups.push({type:'intel', x:tableX+tableWidth-180, y:tableTop-40, w:20, h:20});
  pickups.push({type:'feather', x:tableX + tableWidth/2 - 10, y:tableTop - 90, w:20, h:20});

  door = { x: tableX+tableWidth+60, y: tableTop-180, w:140, h:180, unlocked:false, open:false, lift:0, glowUntil:0 };

  if(serverObjective){
    serverTerminals.push({x:tableX+tableWidth/2-20, y:tableTop-36, w:36, h:36, hacked:false});
  }

  player.x = clamp(player.x, tableX + 60, tableX + tableWidth - 120);
}

function updateNinjaMovement(guard, dt, playerCenterX, playerCenterY, groundY){
  if(guard.type!=='ninja') return;
  if(typeof guard.vy !== 'number') guard.vy = 0;
  if(typeof guard.jumpCount !== 'number') guard.jumpCount = 0;
  if(typeof guard.jumpCooldown !== 'number') guard.jumpCooldown = 0;

  guard.jumpCooldown = Math.max(0, guard.jumpCooldown - dt);

  const prevBottom = guard.y + guard.h;
  guard.vy = Math.min(14, guard.vy + GRAV * 0.9);
  guard.y += guard.vy;
  const nextBottom = guard.y + guard.h;

  let landed = false;
  if(guard.vy >= 0){
    for(const plat of movingPlatforms){
      if(!plat) continue;
      if(prevBottom <= plat.y && nextBottom >= plat.y && guard.x + guard.w > plat.x && guard.x < plat.x + plat.w){
        guard.y = plat.y - guard.h;
        guard.vy = plat.vy || 0;
        landed = true;
        break;
      }
    }
  }
  if(!landed && guard.vy >= 0){
    for(const wall of walls){
      if(!wall.isPlatform) continue;
      if(prevBottom <= wall.y && nextBottom >= wall.y && guard.x + guard.w > wall.x && guard.x < wall.x + wall.w){
        guard.y = wall.y - guard.h;
        guard.vy = 0;
        landed = true;
        break;
      }
    }
  }
  if(!landed && guard.vy >= 0 && prevBottom <= groundY && nextBottom >= groundY){
    guard.y = groundY - guard.h;
    guard.vy = 0;
    landed = true;
  }

  if(landed){
    if(!guard.onGround){ guard.jumpCount = 0; }
    guard.onGround = true;
  } else {
    guard.onGround = false;
  }

  const centerX = guard.x + guard.w / 2;
  const dir = playerCenterX > centerX ? 1 : -1;
  const baseSpeed = guard.speed || Math.abs(guard.vx) || 1;
  const airFactor = guard.onGround ? 1 : 0.75;
  guard.vx = dir * baseSpeed * (guard.airControl || 1) * airFactor;
  guard.face(dir);

  const maxJumps = guard.doubleJump ? 2 : 1;
  const horizontalClose = Math.abs(playerCenterX - centerX) < 200;
  const playerAbove = playerCenterY < guard.y - 12;

  if(horizontalClose){
    const launchStrength = JUMP * 0.76;
    const doubleStrength = JUMP * 0.62;
    if(guard.onGround && guard.jumpCooldown<=0 && (playerAbove || Math.abs(playerCenterX - centerX) > 140)){
      guard.vy = -launchStrength;
      guard.onGround = false;
      guard.jumpCount = 1;
      guard.jumpCooldown = 0.32;
    } else if(!guard.onGround && guard.jumpCooldown<=0 && guard.jumpCount < maxJumps && playerAbove){
      guard.vy = -doubleStrength;
      guard.jumpCount += 1;
      guard.jumpCooldown = 0.38;
    }
  }
}



// === Vent sub-levels per vent id ===
function makeSubLevel(fromVent){
  inSub=true;
  entryVentWorld = {x:fromVent.x, y:fromVent.y};
  updateMusicForState();

  const twoBosses = Math.random() < 0.5;
  sub = {
    id: fromVent.id,
    floor:{x:80,y:H-120,w:W-160,h:12},
    walls:[{x:80,y:80,w:W-160,h:H-200}],
    vents:[{x:100,y:H-160,w:26,h:20, exit:true}],
    loot:[],
    bosses:[],
    guards:[]
  };
  const seedShift = fromVent.id==='A' ? 0 : 120;
  sub.loot.push({type:'cash', x: 200+seedShift, y: H-140, w:16, h:12, amount:40});
  sub.loot.push({type:'ammo', x: 260+seedShift, y: H-140, w:16, h:12, amount:30});
  if(Math.random()<0.3) sub.loot.push({type:'intel', x: 320+seedShift, y:H-140, w:16, h:12});

  sub.bosses.push({x: W-260, y: H-162, w:24, h:46, vx:-0.9, hp:30, maxHp:30, suit:true, lastShot:0, type:'auto', hitFlashUntil:0});
  if(twoBosses){
    sub.bosses.push({x: W-380, y: H-162, w:24, h:46, vx:0.8, hp:40, maxHp:40, suit:true, lastShot:0, type:'launcher', hitFlashUntil:0});
  }

  sub.guards.push({x: 420, y:H-162, w:20, h:42, vx:0.7, hp:20, maxHp:20, lastShot:0, type:'pistol', hitFlashUntil:0});
  sub.guards.push({x: 520, y:H-162, w:20, h:42, vx:-0.6, hp:30, maxHp:30, lastShot:0, type:'ninja', hitFlashUntil:0});

  player.x = 120; player.y = sub.floor.y - player.h; player.vx=player.vy=0;
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  centerNote(`Vent ${fromVent.id}: server vault`, 900);
  notify(twoBosses ? "Two bosses detected in vents." : "Boss detected in vents.");
}

// Interact
function inViewport(x){ return x>=camX && x<=camX+W; }
function nearDoor(){
  return !inSub && Math.abs((player.x+player.w/2) - (door.x+door.w/2)) < 70 && Math.abs((player.y+player.h) - (door.y+door.h)) < 140;
}

function makeHackSequence(){
  const len = 3 + Math.floor(Math.random()*3);
  const seq=[];
  for(let i=0;i<len;i++){
    seq.push(HACK_KEY_POOL[Math.floor(Math.random()*HACK_KEY_POOL.length)]);
  }
  return seq;
}

function startHackMinigame(terminal){
  if(activeHack) return;
  const sequence = makeHackSequence();
  activeHack = {
    terminal,
    sequence,
    index:0,
    stepWindow:900,
    deadline: now()+900
  };
  player.hacking=true;
  centerNote('Hack initiated', 900);
  notify('Enter the sequence to override.');
}

function failHack(reason='Hack failed.'){
  if(!activeHack) return;
  notify(reason);
  centerNote('Hack failed', 1100);
  beep({freq:320});
  if(activeHack.terminal){ activeHack.terminal.hacked=false; }
  activeHack=null;
  player.hacking=false;
}

function completeHack(){
  if(!activeHack) return;
  const terminal = activeHack.terminal;
  activeHack=null;
  player.hacking=false;
  if(terminal) terminal.hacked=true;
  if(Math.random()<0.5){
    lightingCondition='dim';
    centerNote('Lights disabled', 1600);
    notify('Hack plunged the floor into darkness.');
  } else {
    alarm=false; alarmUntil=0;
    centerNote('Alarms offline', 1600);
    notify('Hack suppressed active alarms.');
  }
  chime();
}

function handleHackInput(key){
  if(!activeHack) return false;
  if(key==='escape'){
    failHack('Hack aborted.');
    return true;
  }
  const expected = activeHack.sequence[activeHack.index];
  if(key===expected){
    activeHack.index++;
    beep({freq:740,dur:0.05});
    if(activeHack.index>=activeHack.sequence.length){
      completeHack();
    } else {
      activeHack.deadline = now() + activeHack.stepWindow;
    }
  } else if(HACK_KEY_POOL.includes(key)){
    failHack('Incorrect input.');
  }
  return true;
}

function activateSprinklers(yBase, until){
  sprinklers.length = 0;
  const count = 8;
  const span = levelWidth() - 160;
  for(let i=0;i<count;i++){
    const x = 80 + (count===1? span/2 : (i/(count-1))*span);
    sprinklers.push({
      x,
      y: 60 + Math.random()*40,
      length: Math.max(80, yBase - 100),
      phase: Math.random()*Math.PI*2
    });
  }
  sprinklersActiveUntil = until;
}

function interact(){
  if(activeHack) return;
  if(pause) return;
  if(topDownState){
    interactTopDown();
    return;
  }
  if(ventDungeonState && interactVentDungeon()){
    return;
  }
  const p={x:player.x, y:player.y, w:player.w, h:player.h};
  if(arcadeRampage && arcadeRampage.active) return;

  if(!inSub){
    if(ecoBossActive){
      for(const chair of hostagesInRoom){
        if(!chair || chair.removed || chair.freed || chair.lost) continue;
        const interactBox = {x:chair.x-24, y:chair.y-52, w:48, h:60};
        if(rect(p, interactBox)){
          chair.free();
        }
      }
    }
    if(hellscapeState){
      for(const hostage of hellscapeState.hostages){
        if(!hostage || hostage.freed) continue;
        const height = hostage.h || 42;
        const bounds = { x: hostage.x - 18, y: (hostage.y || 0) - height - 12, w: 36, h: height + 16 };
        if(rect(p, bounds)){
          if(!hostage.maxHp){ hostage.maxHp = 300; }
          if(typeof hostage.hp !== 'number'){ hostage.hp = hostage.maxHp; }
          hostage.freed = true;
          const edgeDir = hostage.escapeDir || (hostage.x > levelWidth()/2 ? 1 : -1);
          hostage.escapeDir = edgeDir;
          hostage.vy = -7.5;
          hostage.onGround = false;
          addChecking(30);
          centerNote('Hostage freed!', 1600);
          notify('Hostage freed — protect their escape route!');
          beep({freq:720});
        }
      }
    }
    if(finalHostages.length){
      for(const hostage of finalHostages){
        if(!hostage || hostage.freed || hostage.removed) continue;
        const height = hostage.h || 44;
        const bounds = { x: hostage.x - 18, y: (hostage.y || 0) - height - 12, w: 36, h: height + 18 };
        if(rect(p, bounds)){
          if(freeFinalHostage(hostage)){
            beep({freq:780});
          }
        }
      }
    }
    // Pickups
    for(const station of arcadeStations){
      if(station && !station.used){
        const bounds = { x: station.x-20, y: station.y-20, w: station.w+40, h: station.h+40 };
        if(rect(p, bounds)){
          startArcadeRampage(station, { theme: station.theme });
          return;
        }
      }
    }

    for(const it of pickups){
      if(it.type && rect(p,it)){
        if(it.type==='screw'){ player.hasScrew=true; it.type=null; centerNote("Picked up screwdriver."); chime(); notify("Screwdriver acquired."); }
        if(it.type==='ammo'){ const amount = Math.round(it.amount || 18); addAmmo(amount); it.type=null; centerNote(`Ammo +${amount}`); beep({freq:520}); notify("Ammo restocked."); }
        if(it.type==='medkit'){ const amount = Math.round(it.amount || 40); addChecking(amount); it.type=null; centerNote(`Medkit +${amount} health`); chime(); notify('Medkit restored health.'); }
        if(it.type==='cash'){
          const amount = Math.round(it.amount || 15);
          addChecking(amount);
          it.type=null;
          const noteLabel = it.noteLabel || (ventDungeonState && ventDungeonState.noteLabel) || null;
          if(noteLabel){
            centerNote(`${noteLabel} +$${fmtCurrency(amount)}`, 1400);
            notify(`${noteLabel} recovered.`);
          } else {
            centerNote(`Checking +$${fmtCurrency(amount)}`, 1200);
            notify('Found cash.');
          }
          beep({freq:600});
        }
        if(it.type==='file'){ const gain = Math.max(1, Math.round(it.amount || 1)); player.files += gain; it.type=null; centerNote(`Files +${gain}`); beep({freq:700}); notify('File collected.'); evaluateWeaponUnlocks(); }
        if(it.type==='intel'){ const gain = Math.max(1, Math.round(it.amount || 1)); player.intel += gain; it.type=null; centerNote(`Intel +${gain}`); beep({freq:820}); notify('Intel collected.'); evaluateWeaponUnlocks(); }
        if(it.type==='feather'){ player.hasFeather=true; player.featherEnergy=player.featherMax; it.type=null; setFeatherRespawnSource(it); featherRespawnAt=0; centerNote("Feather acquired — air flaps!"); chime(); notify("Feather lets you flap midair."); }
        if(it.type==='snack'){
          if(hellscapeState){ hellscapeState.snackFound = true; }
          addChecking(20);
          it.type=null;
          centerNote('Snack recovered — hunger subdued.', 1600);
          notify('Optional snack secured from the break room.');
          beep({freq:680});
        }
        if(it.type==='zombieAnecdote'){
          const expire = now() + 25000;
          if(hellscapeState){ hellscapeState.buffUntil = Math.max(hellscapeState.buffUntil||0, expire); }
          it.type=null;
          centerNote('Zombie Anecdote active — zombie bites negated for 25s.', 2000);
          notify('Zombie Anecdote coursing through your veins.');
          chime();
        }
        if(it.type==='special'){
          player.specialFiles = (player.specialFiles||0) + 1;
          it.type=null;
          centerNote('Special File secured.');
          chime();
          notify('Violet dossier recovered.');
          updateSpecialFileUI();
        }
        if(it.type==='unlockAll'){
          const unlocked = unlockAllWeapons();
          it.type=null;
          if(unlocked){
            centerNote('All weapons unlocked!', 1800);
            notify('Arsenal dossier grants access to every weapon.');
          } else {
            centerNote('Arsenal dossier recovered.', 1400);
            notify('All weapons already unlocked, dossier secured.');
          }
          chime();
        }
        if(it.type==='cache'){
          const intelGain = Math.max(1, Math.round(it.intel || it.amount || 1));
          const fileGain = Math.max(1, Math.round(it.files || it.alt || 1));
          player.intel += intelGain;
          player.files += fileGain;
          it.type=null;
          centerNote(`Intel +${intelGain} / Files +${fileGain}`, 1400);
          notify('Combined intel cache recovered.');
          evaluateWeaponUnlocks();
          chime();
        }
        if(it.type==='weapon'){
          const label = it.label || `Unlocked ${it.weapon}`;
          unlockWeapon(it.weapon, label);
          it.type=null;
          chime();
        }
        if(it.type==='secret'){
          player.specialFiles = (player.specialFiles || 0) + 1;
          updateSpecialFileUI();
          it.type=null;
          centerNote('Secret file uncovered!', 1600);
          notify(it.photo ? `Embarrassing photo recovered: ${it.photo} (Dr. Jeffstein’s Island).` : 'Secret file recovered.');
          chime();
        }
      }
    }
    // Coffee machines
    for(const machine of coffeeMachines){
      if(machine && !machine.used && rect(p,{x:machine.x-8,y:machine.y-8,w:machine.w+16,h:machine.h+16})){
        machine.used=true;
        applySpeedBoost(0.1, 20000);
        centerNote('Energy Boost +10% speed', 1600);
        notify('Coffee buzz active.');
        beep({freq:740});
      }
    }
    // Vending machines
    for(const vend of vendingMachines){
      if(!vend) continue;
      const bounds = { x: vend.x-12, y: vend.y-12, w: vend.w+24, h: vend.h+24 };
      if(!rect(p, bounds)) continue;
      if(vend.menu){
        if(vend.depleted){
          lockedBuzz();
          centerNote('This vending machine is sold out.', 1400);
        } else {
          openVendingMenu(vend);
        }
      } else if(!vend.broken){
        vend.broken = true;
        const roll = Math.random();
        if(roll < 0.45){
          addAmmo(24);
          centerNote('Ammo drop +24', 1200);
          notify('Vending machine spilled ammo.');
        } else if(roll < 0.9){
          const base = 50 + Math.floor(Math.random()*151);
          const amt = Math.round(base * (player.cashMultiplier||1));
          addChecking(amt);
          centerNote(`Found $${amt}`, 1200);
          notify('Cash payout from vending machine.');
        } else {
          const loss = 50 + Math.floor(Math.random()*151);
          loseChecking(loss);
          centerNote(`Vending trap! -$${loss}`, 1200);
          notify('Faulty vending machine drained funds.');
        }
        boom();
        updateHudCommon();
      } else {
        lockedBuzz();
        notify('Empty vending machine.');
      }
      return;
    }
    // Printers
    for(const printer of printers){
      if(printer && !printer.jammed && rect(p,{x:printer.x-10,y:printer.y-10,w:printer.w+20,h:printer.h+20})){
        printer.jammed=true;
        player.printerJams = (player.printerJams||0) + 1;
        centerNote('Collected Printer Jam', 1400);
        notify('Printer jam secured for achievements.');
        beep({freq:900});
      }
    }
    // Server terminals
    for(const terminal of serverTerminals){
      if(terminal && !terminal.hacked && rect(p,{x:terminal.x-12,y:terminal.y-12,w:terminal.w+24,h:terminal.h+24})){
        startHackMinigame(terminal);
      }
    }
    // Desk drawers
    for(const drawer of deskDrawers){
      if(drawer && !drawer.used && rect(p,{x:drawer.x-6,y:drawer.y-6,w:drawer.w+12,h:drawer.h+12})){
        drawer.used=true;
        const roll = Math.random();
        if(roll < 0.001){
          player.loanBalance = 0;
          centerNote('Loan record shredded! Debt wiped clean.', 2000);
          notify('You destroyed your loan record — debt forgiven.');
          ui.toast('Debt wiped clean. Keep going!');
          chime();
          updateHudCommon();
        } else if(roll < 0.101){
          const reward=['intel','feather','upgrade'][Math.floor(Math.random()*3)];
          if(reward==='intel'){
            player.intel++;
            centerNote('Drawer intel +1', 1400);
            notify('Hidden intel recovered.');
            beep({freq:780});
            evaluateWeaponUnlocks();
          } else if(reward==='feather'){
            player.hasFeather=true;
            player.featherEnergy=player.featherMax;
            setFeatherRespawnSource(null);
            featherRespawnAt=0;
            centerNote('Feather stashed in drawer!', 1400);
            notify('Feather recovered — air mobility boosted.');
            chime();
          } else {
            grantWeaponUpgrade();
            centerNote('Weapon upgrade installed', 1500);
            notify('Drawer held a weapon mod.');
            chime();
          }
        } else {
          centerNote('Drawer empty.', 900);
          notify('Just paperwork inside.');
          beep({freq:520,dur:0.04});
        }
      }
    }
    // Merchants
    for(const merchant of merchants){
      if(!merchant) continue;
      const bounds={x:merchant.x-12,y:merchant.y-12,w:merchant.w+24,h:merchant.h+24};
      if(rect(p,bounds) && !merchant.opened){
        const offer = merchant.offer || blackMarketOffer;
        if(!offer) continue;
        const currency = offer.currency || (offer.type==='ammo' || offer.type==='upgrade' ? 'cash' : 'intel');
        const cost = offer.cost || (currency==='intel' ? 1 : 0);
        if(currency==='cash'){
          if(player.checking >= cost){
            player.checking -= cost;
            if(offer.type==='ammo'){
              addAmmo(36);
              centerNote('Ammo cache purchased.', 1400);
              notify('Black market ammo obtained.');
            } else if(offer.type==='upgrade'){
              grantWeaponUpgrade();
              centerNote('Weapon mod installed.', 1500);
              notify('Black market upgrade acquired.');
            } else {
              addChecking(20);
            }
            merchant.opened=true; blackMarketOffer=null;
            chime();
          } else {
            centerNote('Need more cash for trade.', 1200);
            notify('Insufficient funds.');
          }
        } else {
          if(player.intel >= cost){
            player.intel -= cost;
            if(offer.type==='fuel'){
              addFuel(40);
              centerNote('Fuel upgrade acquired.', 1400);
              notify('Intel traded for upgrades.');
            } else if(offer.type==='weapon'){
              addFuel(60);
              setWeapon('flame');
              centerNote('Weapon shortcut unlocked!', 1500);
              notify('Black market unlocked your flamethrower.');
            }
            merchant.opened=true; blackMarketOffer=null;
            chime();
          } else {
            centerNote('Need intel to barter.', 1200);
            notify('Collect intel before trading.');
          }
        }
      }
    }
    // Vents → sub-level
    for(const v of vents){
      if(rect(p,{x:v.x-10,y:v.y-10,w:v.w+20,h:v.h+20})){
        if(v.needScrew && !player.hasScrew){ centerNote("Vent screwed shut. Need screwdriver."); lockedBuzz(); notify("Vent locked—find screwdriver."); }
        else { v.open=true; makeSubLevel(v); chime(); }
      }
    }
    // Servers: plant explosive
    for(const s of servers){
      if(!s.destroyed && rect(p,{x:s.x-14,y:s.y-8,w:s.w+28,h:s.h+16})){
        if(!s.armed){ s.armed=true; s.armTime=now()+900; centerNote("Charge planted!"); beep({freq:880}); notify("Explosives armed."); }
      }
    }
    // Alarm panel
    for(const a of panels){
      if(!a.disabled && rect(p,{x:a.x-18,y:a.y-18,w:a.w+36,h:a.h+36})){
        a.disabled=true; alarm=false; alarmUntil=0; centerNote("Alarm disabled."); chime(); notify("Alarms disabled.");
      }
    }
    // Door → next level
    if(nearDoor()){
      if(now() < elevatorLockedUntil){ centerNote('Elevator locked — security sweep.', 1400); lockedBuzz(); notify('Elevator temporarily offline.'); }
      else if(!door.unlocked){
        if(currentFloor === FLOORS && ceoArenaState && !ceoArenaState.completed){
          centerNote('Defeat the CEO to unlock the elevator.', 1600);
          lockedBuzz();
          notify('CEO still active.');
        } else if(boardRoomActive && (!boardMemberDefeated || guards.some(g=>g && g.hp>0))){
          centerNote('Clear the board room before using the elevator.', 1600);
          lockedBuzz();
          notify('Board room still contested.');
        } else if(ventDungeonState && !ventDungeonState.missionComplete){
          centerNote('Hotwire every electrical box to power the elevator.', 1600);
          lockedBuzz();
          notify('Electrical boxes still active.');
        } else if(totalServersOnFloor > 0 && destroyedOnFloor < totalServersOnFloor){
          centerNote('Destroy remaining servers to unlock the elevator.', 1600);
          lockedBuzz();
          notify('Server objective incomplete.');
        } else {
          centerNote('Door locked.');
          lockedBuzz();
          notify('Door locked.');
        }
      }
      else {
        if(!door.open){
          clearFeather('elevator');
          door.open=true;
          doorOpenSFX();
          setTimeout(()=>{
            if(ventDungeonState){
              completeVentDungeonLevel();
            }
            if(currentFloor >= FLOORS){
              if(!rooftopMissionState && !warzoneMissionState){
                startRooftopMission();
              }
              return;
            }
            currentFloor = Math.min(FLOORS, currentFloor+1);
            showFloorBanner(currentFloor);
            notify(`Entered floor ${currentFloor}.`);
            player.x=initialSpawnX; player.y=0; player.vx=player.vy=0;
            makeLevel(currentFloor);
            handleFloorStart(currentFloor);
            if(topDownState){
              player.prevBottom = player.y + player.h;
              player.prevVy = 0;
            } else if(ventDungeonState){
              player.prevBottom = player.y + player.h;
              player.prevVy = 0;
            } else {
              player.y = floorSlab.y - player.h;
              player.prevBottom = player.y + player.h;
              player.prevVy = 0;
            }
            if(floorLabelEl) floorLabelEl.textContent = formatFloorLabel(currentFloor);
          }, 700);
        }
      }
    }
  } else {
    // Sub-level exit vent (same vent back)
    for(const v of sub.vents){
      if(v.exit && rect(p,{x:v.x-10,y:v.y-10,w:v.w+20,h:v.h+20})){
        inSub=false;
        player.vx=player.vy=0;
        const targetX = (entryVentWorld? entryVentWorld.x : 0.6*W+40);
        const targetY = (entryVentWorld? entryVentWorld.y : floorSlab.y-160);
        player.x = targetX; player.y = targetY - player.h;
        camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
        camY = ventDungeonState ? computeVentCameraTarget(ventDungeonState) : 0;
        player.prevBottom = player.y + player.h;
        player.prevVy = 0;
        sub=null; entryVentWorld=null;
        updateMusicForState();
        centerNote("Exited vents", 700); chime(); notify("Returned from vents.");
        if(floorLabelEl) floorLabelEl.textContent = formatFloorLabel(currentFloor);
      }
    }
    // loot
    for(const it of (sub?sub.loot:[])){
      if(it.type && rect(p,it)){
        if(it.type==='cash'){ addChecking(it.amount||20); it.type=null; centerNote("Found checking +"+(it.amount||20)); beep({freq:600}); notify("Cash found."); }
        if(it.type==='ammo'){ addAmmo(it.amount||18); it.type=null; centerNote("Found ammo +"+(it.amount||18)); beep({freq:520}); notify("Ammo found."); }
        if(it.type==='intel'){ player.intel++; it.type=null; centerNote("Intel +1"); beep({freq:820}); notify("Intel collected."); evaluateWeaponUnlocks(); }
      }
    }
  }
}

// Attacks / weapons
function handlePlayerBulletFired(projectileType){
  if(projectileType !== 'bullet') return;
  if(!ventDungeonState || !Array.isArray(ventDungeonState.hellscapeZones)) return;
  if(!ventDungeonState.hellscapeZones.length) return;
  ventDungeonState.hellscapeShotsFired = (ventDungeonState.hellscapeShotsFired || 0) + 1;
  if(!ventDungeonState.hellscapeCombatUnlocked && ventDungeonState.hellscapeShotsFired >= 3){
    activateVentHellscapeCombatants();
  }
}

function attack(){
  if(pause) return;
  if(rooftopMissionState) return;
  if(warzoneMissionState){
    handleWarzoneFire();
    return;
  }
  if(topDownState){
    handleTopDownAttack();
    return;
  }
  if(outsideMode){
    fireOutsideShot();
    return;
  }
  if(state.playerWeaponsDisabled) return;
  if(arcadeRampage && arcadeRampage.active){
    fireArcadeRampage();
    return;
  }
  if(ninjaRound && !['melee','saber'].includes(player.weapon)){
    centerNote('Melee only during ninja round!', 1200);
    notify('Switch to melee.');
    beep({freq:360});
    return;
  }
  const t=now();
  if(player.weapon==='pistol' || player.weapon==='silenced'){
    const stats = player.weapon==='pistol' ? player.pistol : player.silenced;
    const baseCooldown = stats.cooldown || player.pistol.cooldown;
    const weaponCooldown = now()<player.hopeBuffUntil ? Math.max(40, Math.round(baseCooldown * 0.85)) : baseCooldown;
    if(t - (stats.last||0) < weaponCooldown) return;
    if(stats.ammo<=0){ centerNote('Reload (R)'); beep({freq:320}); notify('Out of ammo.'); return; }
    stats.last=t;
    stats.ammo--;
    const dir = player.facing>0 ? 1 : -1;
    const bx = player.x + (dir>0?player.w:0);
    const by = player.y + 16;
    const speed = player.weapon==='silenced' ? 11 : 12;
    const bullet = {type:'bullet', x:bx, y:by, vx: dir*speed, vy:0, life:1000, from:'player'};
    if(player.weapon==='silenced'){ bullet.silent=true; }
    bullets.push(bullet);
    handlePlayerBulletFired('bullet');
    stats.muzzleUntil = t + 80;
    playGunshot(player.weapon==='silenced' ? 'silenced' : 'pistol');
    if(player.weapon==='pistol' && !player.hidden && !player.inVent){ alarm=true; alarmUntil=now()+4000; }
  } else if(player.weapon==='flame'){
    const stats = player.flame;
    if(stats.lockedUntil && t < stats.lockedUntil){
      if(!stats.cooldownNoticeUntil || t >= stats.cooldownNoticeUntil){
        centerNote('Flamethrower cooling down!', 1400);
        notify('Flamethrower overheated — wait for cooldown.');
        lockedBuzz();
        stats.cooldownNoticeUntil = t + 900;
      }
      return;
    }
    const flameCooldown = now()<player.hopeBuffUntil ? Math.max(30, Math.round(player.flame.cooldown * 0.85)) : player.flame.cooldown;
    if(t - stats.last < flameCooldown) return;
    stats.last = t;
    stats.lastFiredAt = t;
    const dir = player.facing>0 ? 1 : -1;
    const bx = player.x + (dir>0?player.w:0);
    const by = player.y + 18;
    for(let i=0;i<3;i++){
      bullets.push({type:'flame', x:bx, y:by+(Math.random()*10-5), vx: dir*(6+Math.random()*2), vy:(Math.random()*2-1), life:440, from:'player'});
    }
    if(!player.hidden && !player.inVent){ alarm=true; alarmUntil=now()+3000; }
  } else if(player.weapon==='machineGun'){
    const stats = player.machineGun;
    const baseCooldown = stats.cooldown || 80;
    const weaponCooldown = now()<player.hopeBuffUntil ? Math.max(24, Math.round(baseCooldown * 0.85)) : baseCooldown;
    if(t - (stats.last||0) < weaponCooldown) return;
    if(stats.ammo<=0){ centerNote('Machine gun empty — reload (R)'); beep({freq:300}); notify('Reload the machine gun.'); return; }
    stats.last=t;
    stats.ammo--;
    const dir = player.facing>0 ? 1 : -1;
    const bx = player.x + (dir>0?player.w:0);
    const by = player.y + 18;
    bullets.push({type:'bullet', x:bx, y:by, vx: dir*14, vy:0, life:900, from:'player', rapid:true});
    handlePlayerBulletFired('bullet');
    stats.muzzleUntil = t + 110;
    playGunshot('machineGun');
    if(!player.hidden && !player.inVent){ alarm=true; alarmUntil=now()+5000; }
  } else if(player.weapon==='grenade'){
    const stats = player.grenade;
    const baseCooldown = stats.cooldown || 520;
    if(t - (stats.last||0) < baseCooldown) return;
    if(stats.ammo<=0){ centerNote('No grenades — restock needed.', 1400); beep({freq:280}); notify('Grenade launcher empty.'); return; }
    stats.last=t;
    stats.ammo--;
    const dir = player.facing>0 ? 1 : -1;
    const bx = player.x + (dir>0?player.w:0);
    const by = player.y + 12;
    bullets.push({type:'grenade', x:bx, y:by, vx: dir*6, vy:-3, life:1100, from:'player'});
    playGunshot('grenade');
    if(!player.hidden && !player.inVent){ alarm=true; alarmUntil=now()+6000; }
  } else if(player.weapon==='melee' || player.weapon==='saber'){
    const stats = player.weapon==='saber' ? player.saber : player.melee;
    if(t - (stats.last||0) < stats.cooldown) return;
    stats.last=t;
    const range = player.weapon==='saber' ? 48 : 36;
    const dmgValue = player.weapon==='saber' ? scaledPlayerDamage(SABER_BASE_DAMAGE) : scaledPlayerDamage(PLAYER_MELEE_DAMAGE);
    const px = player.x + (player.facing>0 ? player.w : -range);
    const hitBox={x:px, y:player.y, w:range, h:player.h};
    let hits=0;
    const list = inSub? (sub? [...sub.guards, ...sub.bosses] : []) : guards;
    for(const g of list){
      if(g.hp <= 0) continue;
      if(rect(hitBox,g)){
        const defeated = applyGuardDamage(g, dmgValue);
        if(defeated){ g.hp = 0; }
        g.hitFlashUntil = now() + 160;
        hits++;
      }
    }
    if(!inSub){
      for(const worker of workers){
        if(!worker.alive) continue;
        if(rect(hitBox, worker)){
          if(damageWorker(worker, dmgValue)){
            hits++;
          }
        }
      }
    }
    if(ecoBossActive && ecoBoss && ecoBoss.hp>0){
      const bossBox = {x:ecoBoss.x, y:ecoBoss.y, w:ecoBoss.w, h:ecoBoss.h};
      if(rect(hitBox, bossBox)){
        ecoBoss.hp = Math.max(0, ecoBoss.hp - dmgValue);
        ecoBoss.hitFlashUntil = now() + 160;
        hits++;
      }
    }
    if(hits){
      player.hopeBuffUntil = Math.max(player.hopeBuffUntil, now()+1000);
      beep({freq: player.weapon==='saber'?520:480});
      if(arcadeBeatdownActive || isArcadeBeatdownFloor(currentFloor)){
        player.punchAnimUntil = now()+260;
        player.punchAnimSide = player.facing>=0 ? 1 : -1;
        player.punchCombo = (player.punchCombo||0) + hits;
      }
    }
  }
}

// continuous fire for flame while held
function tickContinuous(){
  if(attackHeld && !outsideMode){ attack(); }
  setTimeout(tickContinuous, 80);
}
tickContinuous();

// Guards fire by type
function guardFire(g){
  const t=now();
  if(g.type==='pistol' || g.type==='shield'){
    if(t - g.lastShot < 700) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'enemy', x:g.x + (dir>0?g.w:0), y:g.y+18, vx: dir*9, vy:0, life:900, from:'guard'});
  } else if(g.type==='auto'){
    if(t - g.lastShot < 120) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'enemy', x:g.x + (dir>0?g.w:0), y:g.y+14+Math.random()*8, vx: dir*(9+Math.random()*2), vy:(Math.random()*1-0.5), life:700, from:'guard'});
  } else if(g.type==='commando'){
    if(t - g.lastShot < 180) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    const spray = 9.5 + Math.random()*2.5;
    bullets.push({type:'enemy', x:g.x + (dir>0?g.w:0), y:g.y+16+Math.random()*6, vx: dir*spray, vy:(Math.random()*0.8-0.4), life:820, from:'guard'});
  } else if(g.type==='launcher'){
    if(t - g.lastShot < 1400) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'rocket', x:g.x + (dir>0?g.w:0), y:g.y+16, vx: dir*5, vy:0, life:1200, from:'guard', blast: true});
  } else if(g.type==='experimental'){
    if(t - g.lastShot < 1000) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'rocket', x:g.x + (dir>0?g.w:0), y:g.y+14, vx: dir*6, vy:(Math.random()*2-1), life:1100, from:'guard', blast:true, experimental:true});
  } else if(g.type==='manager'){
    if(t - g.lastShot < 520) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    for(let burst=0; burst<2; burst++){
      bullets.push({type:'enemy', x:g.x + (dir>0?g.w:0), y:g.y+14+burst*4, vx: dir*(9+burst*1.5), vy:0, life:900, from:'guard'});
    }
  } else if(g.type==='policy'){
    if(t - g.lastShot < 900) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'policy', x:g.x + (dir>0?g.w:0), y:g.y+16, vx: dir*4, vy:0, life:1200, from:'guard'});
  } else if(g.type==='ad'){
    if(t - g.lastShot < 780) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'ad', x:g.x + (dir>0?g.w:0), y:g.y+12, vx: dir*5, vy:-1, life:900, from:'guard'});
  } else if(g.type==='lawsuit'){
    if(t - g.lastShot < 980) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'lawsuit', x:g.x + (dir>0?g.w:0), y:g.y+14, vx: dir*4, vy:0, life:1600, from:'guard'});
  } else if(g.type==='heavy'){
    if(t - g.lastShot < 200) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    bullets.push({type:'enemy', x:g.x + (dir>0?g.w:0), y:g.y+12, vx: dir*(7+Math.random()*1.5), vy:(Math.random()*0.8-0.4), life:800, from:'guard'});
  } else if(g.type==='soldier'){
    if(t - g.lastShot < 260) return;
    g.lastShot = t;
    const dir = (player.x > g.x ? 1 : -1);
    for(let burst=0; burst<3; burst++){
      bullets.push({type:'enemy', x:g.x + (dir>0?g.w:0), y:g.y+12+burst*2, vx: dir*(9+burst*0.6), vy:(Math.random()*0.6-0.3), life:820, from:'guard'});
    }
  } else if(g.type==='ceo'){
    return;
  } else if(g.type==='ninja'){
    // no ranged; close collision handled elsewhere
  }
}

function manageFlamethrowerHeat(frameTime){
  const stats = player.flame;
  if(!stats) return;
  if(!Number.isFinite(stats.maxHeat) || stats.maxHeat <= 0){
    stats.maxHeat = FLAMETHROWER_MAX_HEAT_MS;
  }
  if(!stats.lastHeatTick){
    stats.lastHeatTick = frameTime;
    return;
  }
  let delta = frameTime - stats.lastHeatTick;
  stats.lastHeatTick = frameTime;
  if(!Number.isFinite(delta) || delta <= 0){
    return;
  }
  if(stats.lockedUntil && frameTime >= stats.lockedUntil){
    stats.lockedUntil = 0;
    stats.heat = 0;
    stats.overheated = false;
    stats.overheatNotifiedUntil = 0;
    stats.cooldownNoticeUntil = 0;
  }
  if(stats.lockedUntil && frameTime < stats.lockedUntil){
    stats.heat = stats.maxHeat;
    return;
  }
  const firing = (player.weapon==='flame' && attackHeld && !pause && !state.playerWeaponsDisabled && stats.last && frameTime - stats.last <= Math.max(120, (stats.cooldown||60)*2));
  if(firing){
    stats.heat = Math.min(stats.maxHeat, (stats.heat||0) + delta);
    if(stats.heat >= stats.maxHeat){
      stats.heat = stats.maxHeat;
      if(!stats.overheated){
        stats.lockedUntil = frameTime + stats.maxHeat;
        centerNote('Flamethrower overheated! Cooling for 10s.', 1800);
        notify('Flamethrower overheated — wait for cooldown.');
        lockedBuzz();
        stats.overheatNotifiedUntil = frameTime + 1500;
      }
      stats.overheated = true;
      return;
    }
    stats.overheated = false;
  } else {
    stats.heat = Math.max(0, (stats.heat||0) - delta);
    if(stats.heat <= 0){
      stats.heat = 0;
      stats.overheated = false;
    }
  }
}

function canUnlockElevator(){
  if(!door) return false;
  if(hellscapeState){
    return (hellscapeState.zombiesKilled || 0) >= (hellscapeState.killTarget || 0);
  }
  if(currentFloor === FLOORS){
    return !!(ceoArenaState && ceoArenaState.completed);
  }
  const serversCleared = totalServersOnFloor <= 0 || destroyedOnFloor >= totalServersOnFloor;
  if(boardRoomActive){
    const guardsRemaining = guards.some(g => g && g.hp>0);
    if(guardsRemaining) return false;
    if(!boardMemberDefeated) return false;
    return serversCleared;
  }
  if(totalServersOnFloor < 0){
    return false;
  }
  return serversCleared;
}

// ========= Update =========
function maybeRespawnFeather(){
  if(hellscapeState && hellscapeState.disableFeather){
    featherRespawnAt = 0;
    return;
  }
  if(!featherRespawnAt) return;
  const nowTs = now();
  if(nowTs < featherRespawnAt) return;
  if(player && player.hasFeather){ featherRespawnAt = 0; return; }
  if(pickups.some(p=>p && p.type==='feather')){ featherRespawnAt = 0; return; }
  if(!featherRespawnLocation){ featherRespawnAt = 0; return; }
  if(featherRespawnPickup){
    featherRespawnPickup.type = 'feather';
    featherRespawnPickup.x = featherRespawnLocation.x;
    featherRespawnPickup.y = featherRespawnLocation.y;
  } else {
    const pickup = { type:'feather', x: featherRespawnLocation.x, y: featherRespawnLocation.y, w:20, h:20 };
    pickups.push(pickup);
    featherRespawnPickup = pickup;
  }
  setFeatherRespawnSource(featherRespawnPickup || featherRespawnLocation);
  featherRespawnAt = 0;
  notify('Feather drifts back within reach.');
}

function update(dt){
  if(!runActive) return;
  if(rooftopMissionState){
    updateRooftopMission(dt);
    return;
  }
  if(warzoneMissionState){
    updateWarzoneMission(dt);
    return;
  }
  const frameNow = now();
  manageFlamethrowerHeat(frameNow);
  maybeRespawnFeather();
  if(hellscapeState){
    updateHellscape(dt);
  }
  if(outsideMode){
    updateOutside(dt);
    return;
  }
  if(droneMissionState){
    updateDroneMission(dt);
    return;
  }
  if((!arcadeRampage || !arcadeRampage.active) && arcadeStations.length){
    const promptRangeX = 140;
    const promptRangeY = 120;
    for(const station of arcadeStations){
      if(!station || station.used || station.promptShown) continue;
      const sx = station.x + station.w/2;
      const sy = station.y + station.h/2;
      const dx = Math.abs((player.x + player.w/2) - sx);
      const dy = Math.abs((player.y + player.h/2) - sy);
      if(dx <= promptRangeX && dy <= promptRangeY){
        station.promptShown = true;
        const prompt = station.theme==='hellscape' ? 'Press SPACE to control the perimeter gun.' : 'Press SPACE to mount the machine gun.';
        notify(prompt);
        centerNote(prompt, 1400);
      }
    }
  }
  if(arcadeRampage && arcadeRampage.active){
    updateArcadeRampage(dt);
    return;
  }
  if(player.contactDamagePending && now() >= player.contactDamageApplyAt){
    player.contactDamagePending = false;
    player.contactDamageApplyAt = 0;
    player.contactInterferenceStart = 0;
    player.contactInterferenceUntil = 0;
    damage();
  }
  if(player.punchAnimUntil && now() > player.punchAnimUntil + 240){
    player.punchCombo = 0;
  }
  lightingPhase += dt;
  if(activeHack && now()>activeHack.deadline){
    failHack('Sequence timed out.');
  }
  player.hacking = !!activeHack;
  // Track "seen door"
  if(!seenDoor && (inViewport(door.x) || Math.abs(player.x - door.x) < W*0.4)){ seenDoor=true; }

  if(timeLeftMs()<=0){
    if(!state.midnightRageTriggered){
      activateMidnightRage();
      return;
    }
    const nowMs = now();
    if(state.midnightRage && state.midnightRageUntil && nowMs >= state.midnightRageUntil){
      concludeMidnightRage();
    }
    applyMidnightDebtGrowth(nowMs);
  }

  if(topDownState){
    updateTopDown(dt);
    return;
  }

  if(player.interestRate>0 && now()-interestDrainTimer>1000){
    interestDrainTimer = now();
    const drain = Math.max(1, Math.round(player.interestRate));
    player.checking = Math.max(0, player.checking - drain);
    if(player.checking===0){ notify('Interest drained checking to zero!'); }
  }

  if(currentFloor === FLOORS && ceoArenaState.bounds){
    updateCeoArena(dt);
  }

  // Inputs
  const wasOnGround = player.onGround;
  const dropCombo = (keys['w'] && keys['z']) || (keys['arrowup'] && keys['arrowdown']);
  const hacking = !!activeHack;
  const jumpPressed = !dropCombo && !hacking && (keys['w']||keys['arrowup']);
  if(player.dropThroughUntil && now() > player.dropThroughUntil){
    player.dropThroughUntil = 0;
    player.dropThroughFloor = null;
  }
  player.crouch = hacking ? false : (keys['s'] || keys['arrowdown'] || keys['x']);
  player.sprint = !hacking && keys['shift'];
  let ax=0;
  if(keys['a']||keys['arrowleft']) { ax-=1; player.facing=-1; }
  if(keys['d']||keys['arrowright']) { ax+=1; player.facing= 1; }
  if(hacking){ ax=0; }
  const boostActive = now()<player.speedBoostUntil;
  const boostValue = player.speedBoostAmount || 0;
  const boost = boostActive ? 1 + boostValue : 1;
  const lawsuitSlow = now()<player.lawsuitSlowUntil ? 0.7 : 1;
  const hopeBoost = now()<player.hopeBuffUntil ? 1.1 : 1;
  const maxRun = RUN*(player.sprint?SPRINT:1)*(player.crouch?0.6:1)*boost*hopeBoost*lawsuitSlow;

  let dropTargetY = null;
  if(wasOnGround && !inSub){
    const footRect = { x: player.x + 2, y: player.y + player.h - 1, w: player.w - 4, h: 4 };
    for(const w of walls){
      if(!w.isPlatform) continue;
      if(rect2(footRect.x, footRect.y, footRect.w, footRect.h, w)){ dropTargetY = w.y; break; }
    }
    if(dropTargetY===null){
      for(const m of movingPlatforms){
        if(rect2(footRect.x, footRect.y, footRect.w, footRect.h, m)){ dropTargetY = m.y; break; }
      }
    }
  }
  if(dropCombo && wasOnGround && dropTargetY!==null){
    const tDrop = now();
    player.dropThroughUntil = tDrop + 220;
    player.dropThroughFloor = dropTargetY;
    player.onGround = false;
    player.vy = Math.max(player.vy, 1.5);
    player.y += 4;
  }

  // Crouch offset
  const targetOffset = player.crouch? 8 : 0;
  player.crouchOffset += (targetOffset - player.crouchOffset)*0.25;

  // Feather energy recharge
  if(player.hasFeather){
    player.featherEnergy = clamp(player.featherEnergy + player.featherRecharge*dt*60*(player.onGround?1.6:0.8), 0, player.featherMax);
  }

  // Ladder climbing
  let onLadder=false;
  if(!inSub){ onLadder = ladders.some(l=>rect(player,l)); }
  const tryingClimb = (keys['w']||keys['arrowup']||keys['s']||keys['arrowdown']);
  player.climbing = onLadder && tryingClimb;
  if(player.climbing){
    player.vy = (keys['w']||keys['arrowup'])? -3 : (keys['s']||keys['arrowdown'])? 3 : 0;
  } else {
    // Ground jump
    if(jumpPressed && player.onGround){ player.vy = -JUMP; player.onGround=false; }
    // Air flap if feather
    if(jumpPressed && !player.onGround && player.hasFeather && (now()-player.lastFlap>player.flapCooldown) && player.featherEnergy>0){
      player.vy = Math.min(player.vy, -9);
      player.lastFlap = now();
      player.featherEnergy = Math.max(0, player.featherEnergy - 12);
      beep({freq:900,dur:0.05});
    }
  }

  const previousBottom = player.y + player.h;

  // Movement
  player.vx += ax*0.8;
  if(hacking){ player.vx *= 0.6; }
  player.vx *= player.onGround?FRICTION:0.99;
  player.vx = clamp(player.vx, -maxRun, maxRun);
  if(!player.climbing) player.vy += GRAV*(player.hasFeather?0.92:1);
  const vyBeforeMove = player.vy;

  // Apply
  player.x += player.vx; player.y += player.vy;
  player.onGround=false;
  player.prevBottom = previousBottom;
  player.prevVy = vyBeforeMove;

  if(!inSub){
    // Bounds
    player.x = clamp(player.x, 0, levelWidth() - player.w);

    // Floor & platforms
    let dropActive = false;
    let dropIgnoreY = -Infinity;
    if(player.dropThroughUntil){
      const dropNow = now();
      if(dropNow < player.dropThroughUntil){
        dropActive = true;
        dropIgnoreY = player.dropThroughFloor ?? -Infinity;
      } else {
        player.dropThroughUntil = 0;
        player.dropThroughFloor = null;
      }
    }
    if(rect(player, floorSlab)){
      if(player.vy>0 && player.y+player.h - floorSlab.y < 28){
        player.y = floorSlab.y - player.h; player.vy=0; player.onGround=true;
        player.dropThroughUntil = 0;
        player.dropThroughFloor = null;
        dropActive=false; dropIgnoreY=-Infinity;
      }
    }
    for(const w of walls){
      if(!w.isPlatform) continue;
      if(rect(player,w) && player.vy>0 && player.y+player.h - w.y < 24){
        if(!(dropActive && w.y <= dropIgnoreY + 1)){
          player.y = w.y - player.h; player.vy=0; player.onGround=true;
          player.dropThroughUntil = 0;
          player.dropThroughFloor = null;
          dropActive=false; dropIgnoreY=-Infinity;
        }
      }
    }
    for(const m of movingPlatforms){
      m.cx = (m.cx||0) + m.vx;
      if(Math.abs(m.cx)>m.range){ m.vx*=-1; }
      m.x += m.vx;
      if(rect(player, {x:m.x,y:m.y,w:m.w,h:m.h}) && player.vy>0 && player.y+player.h - m.y < 20){
        if(!(dropActive && m.y <= dropIgnoreY + 1)){
          player.y = m.y - player.h; player.vy=0; player.onGround=true;
          player.dropThroughUntil = 0;
          player.dropThroughFloor = null;
          dropActive=false; dropIgnoreY=-Infinity;
          player.x += m.vx;
        }
      }
    }

    // Hidden under desk when crouched
    player.hidden=false;
    for(const d of desks){
      const zone={x:d.x, y:d.y, w:d.w, h:d.h};
      if(player.crouch && rect(player, zone)){ player.hidden=true; break; }
    }

    // Workers
    for(const worker of workers){
      if(!worker.alive) continue;
      worker.x += worker.vx;
      if(worker.x <= worker.minX){ worker.x = worker.minX; worker.vx = Math.abs(worker.vx); }
      if(worker.x >= worker.maxX){ worker.x = worker.maxX; worker.vx = -Math.abs(worker.vx); }
      worker.facing = worker.vx >= 0 ? 1 : -1;
      worker.bob = (worker.bob || 0) + dt * (2.2 + Math.abs(worker.vx)*3.2);
      if(rect(player, worker)){
        const cameFromAbove = player.prevBottom <= worker.y + 6 && player.prevVy > 0.5;
        if(cameFromAbove){
          if(damageWorker(worker, STOMP_DAMAGE)){
            player.vy = -Math.max(JUMP*0.45, 6);
            player.onGround = false;
          }
        }
      }
    }

    for(const hz of hazards){
      if(hz.type==='electric'){
        hz.pulse = (hz.pulse||0) + dt*4;
        if(rect(player,{x:hz.x,y:hz.y,w:hz.w,h:hz.h+6})){
          damage();
          player.vx *= 0.6;
          player.screenFlashUntil = Math.max(player.screenFlashUntil, now()+400);
        }
      } else if(hz.type==='steam'){
        hz.t = (hz.t||0) + dt*2.5;
        if(Math.sin(hz.t) > 0.1 && rect(player,{x:hz.x,y:hz.y,w:hz.w,h:hz.h})){
          player.screenFlashUntil = Math.max(player.screenFlashUntil, now()+900);
        }
      } else if(hz.type==='fall'){
        hz.t = (hz.t||0) + dt;
        if(!hz.open && hz.t>4){ hz.open=true; hz.t=0; }
        if(hz.open && rect(player,{x:hz.x,y:hz.y,w:hz.w,h:hz.h}) && player.onGround){
          player.dropThroughUntil = now()+200;
          player.dropThroughFloor = hz.y;
          player.onGround=false;
          player.vy = Math.max(player.vy, 1.5);
          player.y += 12;
        }
        if(hz.open && hz.t>2){ hz.open=false; hz.t=0; }
      } else if(hz.type==='spark'){
        hz.t = (hz.t||0) + dt*3;
        if(Math.sin(hz.t)>0.5 && rect(player,{x:hz.x-6,y:hz.y-6,w:hz.w+12,h:hz.h+12})){
          alarm=true; alarmUntil=now()+5000;
          player.screenFlashUntil = Math.max(player.screenFlashUntil, now()+600);
        }
      }
    }

    // Spotlights add alarm if touched
    const detectable = !(player.hidden || player.inVent);
    let spotlightHit=false;
    for(const s of spotlights){
      s.t += dt*s.speed;
      const sx = s.x + Math.sin(s.t)*s.range;
      const bar={x:sx-120, y:s.y, w:240, h:s.h};
      if(detectable && rect(player, bar)){
        spotlightHit=true;
        if(s.server){
          if(!s.cooldownUntil || now()>s.cooldownUntil){
            spotlightDetection += dt;
            if(spotlightDetection>0.6){
              spotlightDetection = 0;
              s.cooldownUntil = now()+8000;
              alarm=true; alarmUntil=now()+8000;
              elevatorLockedUntil = Math.max(elevatorLockedUntil, now()+10000);
              door.unlocked=false;
              notify('Server sweep detected — elevator locked!');
              lockedBuzz();
              const existingSpawns = guards.filter(g=>g && g.hp>0).map(g=>g.spawnOrigin ?? g.x);
              for(let extra=0; extra<4; extra++){
                const spawnX = pickGuardSpawn(existingSpawns);
                existingSpawns.push(spawnX);
                guards.push(makeGuard(spawnX, floorSlab.y-42, currentFloor));
              }
            }
          }
        } else {
          alarm=true; alarmUntil=now()+6000;
        }
      }
    }
    if(!spotlightHit){ spotlightDetection = Math.max(0, spotlightDetection - dt*0.5); }
    if(now()>alarmUntil) alarm=false;
    const arenaElevatorLocked = (currentFloor === FLOORS && ceoArenaState && !ceoArenaState.completed);
    if(now()>elevatorLockedUntil && !door.unlocked && !arenaElevatorLocked && canUnlockElevator()){
      door.unlocked=true; door.glowUntil = now()+2000;
    }
    if(evacuationActive && now()>evacuationUntil){ evacuationActive=false; }
    if(powerSurgeUntil && now()>powerSurgeUntil){ powerSurgeUntil=0; }
    if(sprinklersActiveUntil && now()>sprinklersActiveUntil){ sprinklersActiveUntil=0; sprinklers.length=0; }

    if(boardMembers.length){
      const table = boardTables && boardTables.length ? boardTables[0] : null;
      const playerCenterX = player.x + player.w/2;
      const normalized = table ? clamp((playerCenterX - table.x) / Math.max(1, table.w), 0, 1) : 0.5;
      for(const member of boardMembers){
        member.bob = (member.bob || 0) + dt * 2.2;
        const focus = member.focus ?? playerCenterX;
        const nextFocus = focus + (playerCenterX - focus) * 0.18;
        member.focus = nextFocus;
        const center = member.x + (member.w || 0) / 2;
        member.facing = nextFocus >= center ? 1 : -1;
        const tracker = member.tracker ?? normalized;
        member.tracker = tracker + (normalized - tracker) * 0.25;
        member.blink = (member.blink || 0) + dt * 1.6;
        if(member.blink > Math.PI * 4){ member.blink -= Math.PI * 4; }
      }
    }

    // Guards
    const yGround = floorSlab.y;
    const blockReinforce = (destroyedOnFloor===totalServersOnFloor) && seenDoor;
    const arenaLocked = (currentFloor === FLOORS && ceoArenaState.triggered);
    if(alarm && guards.length<16 && !blockReinforce && !arenaLocked && !hellscapeState){
      if(Math.random()<0.05){
        const existingSpawns = guards.filter(g=>g && g.hp>0).map(g=>g.spawnOrigin ?? g.x);
        const spawnX = pickGuardSpawn(existingSpawns);
        guards.push(makeGuard(spawnX, yGround-42, currentFloor));
      }
    }
    const px = player.x + player.w/2;
    const py = player.y + player.h/2;
    for(const g of guards){
      if(g.hp <= 0) continue;
      updateNinjaMovement(g, dt, px, py, yGround);
      g.t += dt*TIME_SCALE;
      const evacBoost = (evacuationActive && now()<evacuationUntil) ? 1.25 : 1;
      if(hellscapeState && g.type==='zombie'){
        const hostages = hellscapeState.hostages || [];
        let targetHostage = null;
        let best = Infinity;
        for(const hostage of hostages){
          if(!hostage || !hostage.freed || hostage.safe || hostage.removed || hostage.hp<=0) continue;
          const hHeight = hostage.h || 42;
          const hx = hostage.x;
          const hy = (hostage.y || 0) - hHeight/2;
          const dxHost = hx - (g.x + g.w/2);
          const dyHost = hy - (g.y + g.h/2);
          const dist = Math.abs(dxHost) + Math.abs(dyHost)*0.45;
          if(dist < best){
            best = dist;
            targetHostage = hostage;
          }
        }
        const targetX = targetHostage ? targetHostage.x : px;
        const chaseDir = targetX > g.x ? 1 : -1;
        const chaseSpeed = Math.max(0.22, g.speed || 0.48);
        g.vx = chaseDir * chaseSpeed;
        g.direction = chaseDir;
        g.flashlight = false;
        g.huntingHostage = !!targetHostage;
      } else if(hellscapeState && g.type==='commando'){
        const chaseDir = px > g.x ? 1 : -1;
        const chaseSpeed = Math.max(0.7, g.speed || 1.2);
        g.vx = chaseDir * chaseSpeed;
        g.direction = chaseDir;
      }
      if(g.type==='ninja'){
        g.vx *= evacBoost;
      } else {
        const dir = Math.sign(g.vx)||1;
        const base = g.speed || Math.abs(g.vx) || 1;
        g.vx = dir * base * evacBoost;
      }
      g.x += g.vx;
      const arenaBounds = (currentFloor === FLOORS && ceoArenaState.triggered && ceoArenaState.bounds) ? ceoArenaState.bounds : null;
      const guardLeftBound = arenaBounds ? arenaBounds.left : 40;
      const guardRightBound = arenaBounds ? arenaBounds.right - (g.w || 20) : levelWidth() - (g.w || 20) - 40;
      const baseMove = Math.max(0.1, g.speed || Math.abs(g.vx) || 0.6);
      if(g.x < guardLeftBound){
        g.x = guardLeftBound;
        g.vx = Math.abs(baseMove);
      }
      if(g.x > guardRightBound){
        g.x = guardRightBound;
        g.vx = -Math.abs(baseMove);
      }

      const coneDir = (g.vx>=0?1:-1);
      const gx = coneDir>0 ? g.x+g.w : g.x;
      const dx = px-gx, dy=py-(g.y+10);
      let inCone = detectable && (coneDir*dx>0) && Math.abs(dy)<50 && Math.abs(dx)<FLASH_DIST;
      if(hellscapeState && g.type==='commando'){
        const centerX = g.x + g.w/2;
        const centerY = g.y + g.h/2;
        if(Math.abs(px - centerX) < 420 && Math.abs(py - centerY) < 160){
          inCone = true;
        }
      }

      const overlapping = rect(player,g);
      const shielded = player.hidden && player.crouch;
      let stomped = false;
      const nowMs = now();
      const zombieImmune = !!(hellscapeState && g.type==='zombie' && hellscapeState.buffUntil && hellscapeState.buffUntil > nowMs);
      if(hellscapeState && g.type==='zombie'){
        const hostages = hellscapeState.hostages || [];
        for(const hostage of hostages){
          if(!hostage || !hostage.freed || hostage.safe || hostage.removed || hostage.hp<=0) continue;
          const hHeight = hostage.h || 42;
          const bounds = { x: hostage.x - 12, y: (hostage.y || 0) - hHeight, w: 24, h: hHeight };
          if(rect(bounds, g)){
            if(!hostage.lastHitAt || nowMs - hostage.lastHitAt >= 800){
              hostage.lastHitAt = nowMs;
              damageHellscapeHostage(hostage, g.dmg || Math.round(GUARD_BASE_DAMAGE * 0.9));
            }
          }
        }
      }
      if(overlapping && !shielded){
        const guardTop = g.y;
        const cameFromAbove = player.prevBottom <= guardTop + 6 && player.prevVy > 0.5;
        if(cameFromAbove){
          const landed = g.takeDamage(scaledPlayerDamage(STOMP_DAMAGE));
          if(landed){ g.hp = 0; }
          g.hitFlashUntil = now() + 180;
          player.vy = -Math.max(JUMP*0.55, 7);
          player.onGround = false;
          stomped = true;
        }
      }

      if(g.hp <= 0){ continue; }

      let inflicted = false;
      if(g.type==='ceo'){
        if(updateCeoBoss(g, dt, px) && !inflicted){ inflicted = true; }
      } else if(inCone){
        alarm=true; alarmUntil=now()+7000;
        if(Math.abs(dx)<40 && Math.abs(dy)<20){
          if(!stomped){
            if(!zombieImmune && scheduleGuardContactDamage()){ inflicted = true; }
          }
        } else if(g.type!=='ninja' && g.type!=='ceo') {
          guardFire(g);
        }
      }
      if(g.type==='ninja' && !inflicted){
        const close = Math.abs(px - (g.x+g.w/2))<90 && Math.abs(py - (g.y+g.h/2))<40;
        if(close && overlapping && !stomped && !shielded){
          if(!zombieImmune && scheduleGuardContactDamage()){ inflicted = true; }
        }
      }
      if(g.type==='thug' && !inflicted){
        const centerX = g.x + g.w/2;
        const horizontal = px - centerX;
        const vertical = Math.abs(py - (g.y + g.h/2));
        const chaseDir = Math.sign(horizontal);
        if(chaseDir !== 0){
          const chaseSpeed = Math.max(0.6, g.speed || Math.abs(g.vx) || 0.8);
          g.vx = chaseDir * chaseSpeed;
        }
        if(Math.abs(horizontal) < 42 && vertical < 36){
          if(g.readyToAttack(now())){
            if(!zombieImmune && scheduleGuardContactDamage()){ inflicted = true; }
            g.markAttack(now());
            g.punchWindupUntil = now() + 220;
          }
        }
      }
      if(overlapping && !stomped && !inflicted && !shielded){
        if(!zombieImmune && scheduleGuardContactDamage()){ inflicted = true; }
      }
    }
    // kills + reward
    for(let i=guards.length-1;i>=0;i--){
      const defeated = guards[i];
      if(defeated.hp<=0){
        playGoonDeath();
        guards.splice(i,1);
        runStats.kills += 1;
        let rewardHandled = false;
        if(hellscapeState){
          const dropX = defeated.x + (defeated.w||20)/2 - 10;
          const dropY = defeated.y + (defeated.h||40) - 24;
          if(defeated.type==='zombie'){
            recordHellscapeZombieKill();
            addChecking(5);
            notify('+$5 (zombie)');
            if(Math.random() < 0.28){
              const dropType = Math.random()<0.55 ? 'ammo' : 'medkit';
              const pickup = { type: dropType, x: dropX, y: dropY, w:20, h:20 };
              if(dropType==='ammo'){ pickup.amount = 30; }
              if(dropType==='medkit'){ pickup.amount = 45; }
              pickups.push(pickup);
            }
            rewardHandled = true;
          } else if(defeated.type==='commando'){
            hellscapeState.commandosKilled = (hellscapeState.commandosKilled||0) + 1;
            addChecking(12);
            notify('+$12 (commando)');
            if(Math.random() < 0.4){
              pickups.push({ type:'ammo', x: dropX, y: dropY, w:20, h:20, amount:40 });
            }
            rewardHandled = true;
          }
        }
        if(!rewardHandled){
          addChecking(10);
          notify('+$10 (guard)');
        }
        if(defeated.manager){
          managerDefeated=true;
          const bonus=120;
          addChecking(bonus);
          grantWeaponUpgrade();
          centerNote('Manager defeated! Bonus secured.', 1800);
          notify(`Manager routed! +$${bonus} and weapon upgrade.`);
        }
        if(defeated.boss){
          unlockDeckCardForFloor(currentFloor);
          if(boardRoomActive){
            boardMemberDefeated = true;
            notify('Board member neutralized.');
            centerNote('Board member defeated!', 2000);
          }
        }
      }
    }

    if(ecoBossActive){
      updateEcoBoss(dt);
      updateHostageChairs(dt);
      updateEcoProjectiles(dt);
      if(ecoBoss && ecoBoss.hp <= 0 && !ecoBoss.defeated){
        ecoBoss.hp = 0;
        onEcoBossDeath();
      }
    }

    updateFinalHostages(dt);

    // Servers armed -> destroyed
    for(const s of servers){
      if(!s.destroyed && s.armed && now()>s.armTime){
        markServerDestroyed(s, { reward:10, message:"+$10 (server bonus)" });
      }
    }
    destroyedOnFloor = servers.filter(x=>x.destroyed).length;
    if(!door.unlocked && canUnlockElevator()){
      door.unlocked=true;
      door.glowUntil = now()+2000;
      chime();
      if(boardRoomActive){
        centerNote('Board room cleared! Elevator unlocked.', 2000);
        notify('Board room secure — elevator unlocked.');
      } else if(totalServersOnFloor > 0){
        centerNote('All servers down. Elevator unlocked.', 1800);
        notify('All servers down. Elevator unlocked.');
      } else {
        centerNote('Elevator unlocked.', 1600);
        notify('Elevator unlocked.');
      }
      if(serverObjective && destroyedOnFloor===totalServersOnFloor){
        smokeActive=true;
      }
    }
    if(serverObjective && destroyedOnFloor===totalServersOnFloor){
      player.interestRate = Math.max(0, player.interestRate-1);
      serverObjective=false;
      notify('Server takedown reduced interest pressure.');
    }

    // Door anim & camera
    if(door.open){ door.lift = Math.min(1, door.lift + 0.06); }
    else { door.lift = Math.max(0, door.lift - 0.04); }
    camX = clamp(player.x - W*0.45, 0, levelWidth() - W);
    if(ventDungeonState){
      const targetCamY = computeVentCameraTarget(ventDungeonState);
      camY += (targetCamY - camY) * 0.25;
    } else {
      camY += (0 - camY) * 0.25;
      if(Math.abs(camY) < 0.1) camY = 0;
    }

  } else {
    // Sublevel physics
    player.x = clamp(player.x, 80, W-80 - player.w);
    camY += (0 - camY) * 0.3;
    if(Math.abs(camY) < 0.1) camY = 0;
    if(rect(player, sub.floor)){
      if(player.vy>0 && player.y+player.h - sub.floor.y < 28){
        player.y = sub.floor.y - player.h; player.vy=0; player.onGround=true;
      }
    }
    const mobs = [...sub.guards, ...sub.bosses];
    for(const m of mobs){
      if(m.hp <= 0) continue;
      m.x += (m.vx||0);
      if(m.x<120 || m.x>W-200) m.vx*=-1;
      if(Math.random()<0.02){ guardFire(m); }
        if(rect(player,m)){
          const cameFromAbove = player.prevBottom <= m.y + 6 && player.prevVy > 0.5;
          if(cameFromAbove){
            if(typeof m.takeDamage === 'function'){
              const fell = m.takeDamage(scaledPlayerDamage(STOMP_DAMAGE));
              if(fell){ m.hp = 0; }
            } else if(typeof m.hp === 'number'){
              m.hp = Math.max(0, m.hp - scaledPlayerDamage(STOMP_DAMAGE));
            }
            if('hitFlashUntil' in m){ m.hitFlashUntil = now() + 180; }
            player.vy = -Math.max(JUMP*0.55, 7);
            player.onGround = false;
          } else {
          scheduleGuardContactDamage();
          }
        }
    }
    // removals
    for(let i=sub.guards.length-1;i>=0;i--){
      if(sub.guards[i].hp<=0){
        playGoonDeath();
        sub.guards.splice(i,1);
        runStats.kills += 1;
        addChecking(10);
        notify("+$10 (vent guard)");
        checkVentForMinimapUnlock();
      }
    }
    for(let i=sub.bosses.length-1;i>=0;i--){
      if(sub.bosses[i].hp<=0){
        playGoonDeath();
        sub.bosses.splice(i,1);
        runStats.kills += 1;
        addChecking(10);
        notify("+$10 (boss)");
        checkVentForMinimapUnlock();
      }
    }
  }

  const moveSpeed = Math.abs(player.vx);
  const desiredStride = clamp(moveSpeed / Math.max(1, RUN * 1.2), 0, 1);
  player.stepStride = (player.stepStride || 0) + (desiredStride - (player.stepStride || 0)) * 0.2;
  player.stepPhase = (player.stepPhase || 0) + dt * (4 + moveSpeed * 0.7 + (player.sprint ? 2.2 : 0));
  if(player.stepPhase > Math.PI * 2){ player.stepPhase -= Math.PI * 2; }

  // Projectiles
  for(const b of bullets){
    if(b.type==='flame'){
      b.x += b.vx; b.y += b.vy; b.life -= 30;
    } else if(b.type==='rocket'){
      b.x += b.vx; b.y += b.vy; b.life -= 12;
      // explode on player or time out
      const pbox={x:player.x,y:player.y,w:player.w,h:player.h};
      if(rect2(b.x-3,b.y-3,6,6,pbox) || b.life<=0){
        // blast
        const blast = {x:b.x-30,y:b.y-20,w:60,h:40};
        if(rect2(player.x, player.y, player.w, player.h, blast)) damage();
        boom();
        b.life=0;
      }
    } else if(b.type==='policy'){
      b.x += b.vx; b.y += b.vy; b.life -= 14;
    } else if(b.type==='ad'){
      b.x += b.vx; b.y += b.vy; b.vy += 0.18; b.life -= 12;
    } else if(b.type==='lawsuit'){
      const targetX = player.x + player.w/2;
      const targetY = player.y + player.h/2;
      const dx = targetX - b.x;
      const dy = targetY - b.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      const speed = 4.2;
      b.vx = (dx/len)*speed;
      b.vy = (dy/len)*speed;
      b.x += b.vx; b.y += b.vy; b.life -= 10;
    } else if(b.type==='grenade'){
      b.x += b.vx; b.y += b.vy; b.vy += 0.28; b.life -= 12;
      const groundY = inSub ? ((sub && sub.floor) ? sub.floor.y : H-120) : (floorSlab ? floorSlab.y : H-60);
      if(b.y >= groundY || b.life<=0){ detonateGrenade(b); }
    } else {
      b.x += b.vx; b.y += b.vy; b.life -= 16;
    }
    if(!inSub){
      if(b.x<0 || b.x>levelWidth() || b.life<=0) b.life=0;
      if(b.from==='player'){
        for(const g of guards){
          const box={x:g.x,y:g.y,w:g.w,h:g.h};
          if(rect2(b.x-3,b.y-3,6,6,box)){
            if(b.type==='grenade'){ detonateGrenade(b); break; }
            if(g.hp > 0){
              const dmgBase = b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE;
              const fell = applyGuardDamage(g, scaledPlayerDamage(dmgBase));
              if(fell){ g.hp = 0; }
              g.hitFlashUntil = now() + 140;
            }
            b.life=0;
            break;
          }
        }
        if(b.life>0){
          for(const worker of workers){
            if(!worker.alive) continue;
            const box={x:worker.x,y:worker.y,w:worker.w,h:worker.h};
            if(rect2(b.x-3,b.y-3,6,6,box)){
              if(b.type==='grenade'){ detonateGrenade(b); break; }
              damageWorker(worker, scaledPlayerDamage(b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE));
              b.life=0;
              break;
            }
          }
        }
        for(const s of servers){
          const box={x:s.x,y:s.y,w:s.w,h:s.h};
          if(rect2(b.x-3,b.y-3,6,6,box)){
            if(b.type==='grenade'){ detonateGrenade(b); break; }
            const serverDamage = b.type==='flame' ? scaledPlayerDamage(3) : scaledPlayerDamage(2);
            s.hp -= Math.max(1, Math.round(serverDamage));
            if(s.hp<=0){ markServerDestroyed(s); }
            b.life=0;
            break;
          }
        }
        if(b.life>0 && ecoBossActive && ecoBoss && ecoBoss.hp>0){
          const bossBox = {x:ecoBoss.x, y:ecoBoss.y, w:ecoBoss.w, h:ecoBoss.h};
          if(rect2(b.x-3, b.y-3, 6, 6, bossBox)){
            if(b.type==='grenade'){
              detonateGrenade(b);
            } else {
              const dmgBase = b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE;
              ecoBoss.hp = Math.max(0, ecoBoss.hp - scaledPlayerDamage(dmgBase));
              ecoBoss.hitFlashUntil = now() + 160;
              b.life = 0;
            }
          }
        }
      } else {
        const pbox={x:player.x,y:player.y,w:player.w,h:player.h};
        if(b.type==='policy'){
          if(rect2(b.x-4,b.y-4,8,8,pbox)){
            const loss = 40;
            loseChecking(loss);
            player.hurtUntil = now()+200;
            notify('Policy binder drained funds!');
            b.life=0;
          }
        } else if(b.type==='ad'){
          if(rect2(b.x-6,b.y-6,12,12,pbox)){
            player.screenFlashUntil = Math.max(player.screenFlashUntil, now()+1500);
            notify('Ad grenade blinded you!');
            b.life=0;
          }
        } else if(b.type==='lawsuit'){
          if(rect2(b.x-6,b.y-6,12,12,pbox)){
            player.lawsuitSlowUntil = now()+2000;
            notify('Caught in a lawsuit! Movement slowed.');
            b.life=0;
          }
        } else if(b.type!=='rocket' && rect2(b.x-2,b.y-2,4,4,pbox)){ damage(); b.life=0; }
      }
    } else {
      if(b.x<80 || b.x>W-80 || b.life<=0) b.life=0;
      if(b.from==='player'){
        for(const g of sub.guards){
          const box={x:g.x,y:g.y,w:g.w,h:g.h};
          if(rect2(b.x-3,b.y-3,6,6,box)){
            if(b.type==='grenade'){ detonateGrenade(b); break; }
            if(g.hp > 0){
              const dmgBase = b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE;
              const fell = applyGuardDamage(g, scaledPlayerDamage(dmgBase));
              if(fell){ g.hp = 0; }
              g.hitFlashUntil = now() + 140;
            }
            b.life=0;
          }
        }
        for(const boss of sub.bosses){
          const box={x:boss.x,y:boss.y,w:boss.w,h:boss.h};
          if(rect2(b.x-3,b.y-3,6,6,box)){
            if(b.type==='grenade'){ detonateGrenade(b); break; }
            if(boss.hp > 0){
              const dmg = b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE;
              boss.hp = Math.max(0, boss.hp - scaledPlayerDamage(dmg));
              boss.hitFlashUntil = now() + 140;
            }
            b.life=0;
          }
        }
      } else {
        const pbox={x:player.x,y:player.y,w:player.w,h:player.h};
        if(b.type!=='rocket' && rect2(b.x-2,b.y-2,4,4,pbox)){ damage(); b.life=0; }
      }
    }
  }
  for(let i=bullets.length-1;i>=0;i--) if(bullets[i].life<=0) bullets.splice(i,1);

  updateHudCommon();
}

function updateHudCommon(){
  if(timeEl) timeEl.textContent = `${fmtClock(timeLeftMs())} ➜ ${fmtClock(0)}`;
  if(serversEl){
    if(topDownState){
      serversEl.textContent = `Electrical Boxes: ${topDownState.hotwiredCount}/${topDownState.requiredBoxes}`;
    } else if(ventDungeonState){
      serversEl.textContent = `Electrical Boxes: ${ventDungeonState.hotwiredCount}/${ventDungeonState.requiredBoxes}`;
    } else if(droneMissionState){
      if(droneMissionState.phase === 'drone'){
        const total = (droneMissionState.config && droneMissionState.config.drone && droneMissionState.config.drone.totalTargets) || 12;
        serversEl.textContent = `Targets: ${droneMissionState.destroyedTargets}/${total}`;
      } else {
        serversEl.textContent = `Hack Progress: ${Math.round((droneMissionState.hackProgress || 0) * 100)}%`;
      }
    } else {
      serversEl.textContent = `Servers: ${destroyedOnFloor}/${totalServersOnFloor}`;
    }
  }
  if(alarmsEl) alarmsEl.textContent = (topDownState || ventDungeonState || droneMissionState) ? 'Alarms: —' : (alarm ? 'Alarms: ACTIVE' : 'Alarms: OK');
  const inv=[]; if(player.hasScrew) inv.push('Screwdriver'); if(player.hasCharges) inv.push('Charges'); if(player.hasFeather) inv.push('Feather');
  if(invEl) invEl.textContent = `Inv: ${inv.join(', ')||'—'}`;
  const hpRatio = Math.min(1, Math.max(0, player.checking / (player.checkingMax || CHECKING_MAX)));
  if(hpFill) hpFill.style.width = `${hpRatio*100}%`;
  if(hpText) hpText.textContent = Math.max(0, Math.round(player.checking));
  if(savingsFill){
    const savingsRatio = Math.min(1, Math.max(0, player.savings / (player.savingsMax || SAVINGS_MAX)));
    savingsFill.style.width = `${savingsRatio*100}%`;
  }
  if(savingsText) savingsText.textContent = `$${fmtCurrency(player.savings)}`;
  if(loanFill){
    const debt = player.loanBalance;
    const progress = RUN_LOAN_START>0 ? Math.min(1, Math.max(0, 1 - Math.max(0, debt) / RUN_LOAN_START)) : 1;
    loanFill.style.width = `${progress*100}%`;
  }
  if(loanText){
    const debt = player.loanBalance;
    loanText.textContent = debt > 0
      ? `-$${fmtCurrency(debt)}`
      : debt < 0
        ? `+$${fmtCurrency(Math.abs(debt))}`
        : '$0';
  }
  const weaponOrder = ['pistol','silenced','flame','melee','grenade','saber','machineGun'];
  const weaponNames = {
    pistol:'Pistol',
    silenced:'Silenced Pistol',
    flame:'Flamethrower',
    melee:'Melee',
    grenade:'Grenade Launcher',
    saber:'Saber',
    machineGun:'Machine Gun'
  };
  const weaponIdx = weaponOrder.indexOf(player.weapon);
  if(weaponNameEl){
    const label = weaponNames[player.weapon] || player.weapon;
    const prefix = weaponIdx>=0 ? `${weaponIdx+1} • ` : '';
    weaponNameEl.textContent = `${prefix}${label}`;
  }
  if(weaponAmmoEl){
    const hudNow = now();
    let ammoText = '';
    if(player.weapon==='pistol'){
      ammoText = `Ammo ${player.pistol.ammo}/${player.pistol.reserve}`;
    } else if(player.weapon==='silenced'){
      ammoText = `Ammo ${player.silenced.ammo}/${player.pistol.reserve}`;
    } else if(player.weapon==='flame'){
      if(player.flame.lockedUntil && hudNow < player.flame.lockedUntil){
        const remaining = Math.max(0, Math.ceil((player.flame.lockedUntil - hudNow)/1000));
        ammoText = `Cooling ${remaining}s`;
      } else {
        const percent = player.flame.maxHeat ? Math.round(((player.flame.heat||0) / player.flame.maxHeat) * 100) : 0;
        ammoText = `Heat ${Math.max(0, Math.min(100, percent))}%`;
      }
    } else if(player.weapon==='machineGun'){
      ammoText = `Ammo ${player.machineGun.ammo}/${player.machineGun.reserve}`;
    } else if(player.weapon==='grenade'){
      ammoText = `Grenades ${player.grenade.ammo}/${player.grenade.reserve}`;
    } else if(player.weapon==='saber'){
      const cooling = hudNow-player.saber.last < player.saber.cooldown;
      ammoText = `Saber ready${cooling?' (cooling)':''}`;
    } else {
      const cooling = hudNow-player.melee.last < player.melee.cooldown;
      ammoText = `Melee ready${cooling?' (cooling)':''}`;
    }
    weaponAmmoEl.textContent = ammoText;
  }
  if(featherTimerEl) featherTimerEl.textContent = player.hasFeather ? `Feather ${Math.round(player.featherEnergy)}` : 'Feather —';
  if(floorLabelEl){
    if(inSub && sub) floorLabelEl.textContent = `VENT ${sub.id}`;
    else floorLabelEl.textContent = formatFloorLabel(currentFloor);
  }
  if(miniBossEl){
    const bossCount = inSub && sub
      ? (sub.bosses||[]).filter(b=>b && b.hp>0).length
      : guards.filter(g=>g && g.boss && g.hp>0).length;
    miniBossEl.textContent = `Mini-Bosses: ${bossCount}`;
  }
  if(filesPill) filesPill.textContent = `Files: ${player.files}`;
  if(intelPill) intelPill.textContent = `Intel: ${player.intel}`;
  if(featherPill) featherPill.textContent = player.hasFeather ? `Feather: ${Math.round(player.featherEnergy)}` : 'Feather: —';
  if(killStatsEl) killStatsEl.textContent = `Kills: ${runStats.kills || 0}`;
  if(deathStatsEl) deathStatsEl.textContent = `Deaths: ${runStats.deaths || 0}`;
  if(refinanceStatsEl) refinanceStatsEl.textContent = `Refinances: ${runStats.refinances || 0}`;
  if(collectionsStatEl){
    const pressure = Number.isFinite(collectionsPressure) ? Math.max(0, collectionsPressure) : 1;
    collectionsStatEl.textContent = `Collections Pressure ×${pressure.toFixed(2)}`;
  }
  updateSpecialFileUI();
  updateMinimapHighlight();
}

// ========= Draw =========
function drawNinjaPlayer(ctx, px, py, state){
  if(!state) return;
  const width = state.w;
  const height = state.h;
  const facing = state.facing >= 0 ? 1 : -1;
  const crouch = !!state.crouch;
  const stride = clamp(state.stepStride || 0, 0, 1);
  const phase = state.stepPhase || 0;
  const swing = Math.sin(phase) * stride;
  const top = 2;
  const hoodHeight = 12;
  const torsoHeight = crouch ? 16 : 18;
  const legBase = top + hoodHeight + torsoHeight;
  const rawLegHeight = height - (legBase - top) - 2;
  const legHeight = Math.max(6, rawLegHeight - (crouch ? 4 : 0));
  const leftLift = Math.max(0, swing) * (crouch ? 1.8 : 4.2);
  const rightLift = Math.max(0, -swing) * (crouch ? 1.8 : 4.2);
  const hoodColor = '#1b2c46';
  const armorColor = '#233552';
  const trimColor = '#3b4f7c';
  const clothColor = '#152133';
  const accentColor = '#ff4d6a';
  const beltColor = '#1c2438';
  const gloveColor = '#ff7f7f';
  const strapColor = '#2e3f65';
  const bladeColor = '#e2ecff';
  const eyeGlow = '#9ef7ff';
  const baseY = py - height;
  const shadowY = py - 3;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px + 3, shadowY, Math.max(6, width-6), 3);

  ctx.save();
  ctx.translate(px + width/2, baseY);
  ctx.scale(facing, 1);
  ctx.translate(-width/2, 0);

  const t = performance.now();
  const scarfWave = Math.sin(phase * 2 + t / 180);
  ctx.fillStyle = accentColor;
  ctx.fillRect(width - 7, top + 5 + scarfWave, 6, 3);
  ctx.fillRect(width - 9, top + 7 + scarfWave, 5, 3);

  ctx.fillStyle = strapColor;
  ctx.fillRect(width - 7, top + 6, 3, torsoHeight + 6);
  ctx.fillStyle = bladeColor;
  ctx.fillRect(width - 6, top + 2, 2, 16);

  const leftLegX = 4 + (crouch ? -1 : 0);
  const rightLegX = width - 10 + (crouch ? 1 : 0);
  ctx.fillStyle = armorColor;
  ctx.fillRect(leftLegX, legBase, 6, Math.max(3, legHeight - leftLift));
  ctx.fillRect(rightLegX, legBase, 6, Math.max(3, legHeight - rightLift));
  ctx.fillStyle = '#0a0f18';
  ctx.fillRect(leftLegX, legBase + Math.max(0, legHeight - leftLift), 6, 2);
  ctx.fillRect(rightLegX, legBase + Math.max(0, legHeight - rightLift), 6, 2);

  ctx.fillStyle = armorColor;
  ctx.fillRect(3, top + hoodHeight, width - 6, torsoHeight);
  ctx.fillStyle = trimColor;
  ctx.fillRect(3, top + hoodHeight, 4, torsoHeight);
  ctx.fillRect(width - 7, top + hoodHeight, 4, torsoHeight);
  ctx.fillStyle = clothColor;
  ctx.fillRect(6, top + hoodHeight + 2, width - 12, torsoHeight - 4);
  ctx.fillStyle = accentColor;
  ctx.fillRect(4, top + hoodHeight + torsoHeight - 7, width - 8, 4);
  ctx.fillStyle = beltColor;
  ctx.fillRect(4, top + hoodHeight + torsoHeight - 3, width - 8, 3);

  const armSwing = swing * (crouch ? 1.4 : 2.4);
  const armTop = top + hoodHeight + 3 - (crouch ? 1 : 0);
  const armHeight = torsoHeight - 3;
  ctx.fillStyle = armorColor;
  ctx.fillRect(-1 - armSwing, armTop, 4, armHeight);
  ctx.fillRect(width - 3 + armSwing, armTop, 4, armHeight);
  ctx.fillStyle = gloveColor;
  ctx.fillRect(-1 - armSwing, armTop + armHeight - 2, 4, 3);
  ctx.fillRect(width - 3 + armSwing, armTop + armHeight - 2, 4, 3);
  if(state.punchAnimUntil && now() < state.punchAnimUntil){
    const punchDir = state.punchAnimSide >= 0 ? 1 : -1;
    const reach = crouch ? 12 : 18 + Math.min(12, (state.punchCombo||0)*2);
    const fistY = armTop + armHeight - 3;
    ctx.fillStyle = gloveColor;
    if(punchDir > 0){
      ctx.fillRect(width - 3 + armSwing, fistY-1, reach, 4);
      ctx.fillStyle = '#ffd2a8';
      ctx.fillRect(width - 3 + armSwing + reach, fistY-3, 6, 6);
      ctx.fillStyle = 'rgba(255,140,140,0.35)';
      ctx.fillRect(width + armSwing + reach + 4, fistY-4, 4, 8);
      ctx.fillRect(width + armSwing + reach + 10, fistY-3, 3, 6);
    } else {
      ctx.fillRect(-1 - armSwing - reach, fistY-1, reach, 4);
      ctx.fillStyle = '#ffd2a8';
      ctx.fillRect(-1 - armSwing - reach - 6, fistY-3, 6, 6);
      ctx.fillStyle = 'rgba(255,140,140,0.35)';
      ctx.fillRect(-armSwing - reach - 18, fistY-4, 4, 8);
      ctx.fillRect(-armSwing - reach - 24, fistY-3, 3, 6);
    }
  }

  ctx.fillStyle = hoodColor;
  ctx.fillRect(3, top, width - 6, hoodHeight);
  ctx.fillStyle = trimColor;
  ctx.fillRect(4, top + 1, width - 8, hoodHeight - 2);
  const maskY = top + 4;
  ctx.fillStyle = clothColor;
  ctx.fillRect(5, maskY, width - 10, 5);
  ctx.fillStyle = accentColor;
  ctx.fillRect(5, maskY + 3, width - 10, 2);
  ctx.fillStyle = '#05070c';
  ctx.fillRect(5, maskY - 1, width - 10, 1);
  ctx.fillStyle = eyeGlow;
  ctx.fillRect(7, maskY + 1, 3, 1);
  ctx.fillRect(width - 10, maskY + 1, 3, 1);
  ctx.fillStyle = '#07101a';
  ctx.fillRect(7, maskY + 1, 1, 1);
  ctx.fillRect(width - 10, maskY + 1, 1, 1);

  ctx.fillStyle = strapColor;
  ctx.fillRect(8, top + hoodHeight + 3, 3, torsoHeight - 6);
  ctx.fillRect(width - 11, top + hoodHeight + 3, 3, torsoHeight - 6);

  ctx.restore();
}

function drawPlatformBlock(ctx, x, y, width, height, palette){
  if(!ctx || !palette || width<=0 || height<=0) return;
  ctx.save();
  const baseColor = palette.platform || '#2b2e36';
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, width, height);
  const topHeight = Math.min(height, Math.max(2, Math.round(height*0.25)));
  if(topHeight>0){
    ctx.fillStyle = palette.platformTop || baseColor;
    ctx.fillRect(x, y, width, topHeight);
  }
  const shadowHeight = Math.min(height, Math.max(2, Math.round(height*0.2)));
  if(shadowHeight>0){
    ctx.fillStyle = palette.platformShadow || baseColor;
    ctx.fillRect(x, y + height - shadowHeight, width, shadowHeight);
  }
  if(palette.platformGlow){
    const glowHeight = Math.min(topHeight, 3);
    if(glowHeight>0){
      const glowY = Math.max(0, y - glowHeight + 1);
      ctx.fillStyle = palette.platformGlow;
      ctx.fillRect(x, glowY, width, glowHeight);
    }
  }
  if(palette.platformOutline && width>2 && height>2){
    ctx.strokeStyle = palette.platformOutline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, width - 1.5, height - 1.5);
  }
  ctx.restore();
}

function drawArcadeRampage(){
  const state = arcadeRampage || {};
  const theme = state.theme || 'office';
  const nowTs = now();
  const shake = state.screenShake || 0;
  const shakeX = shake ? (Math.random()-0.5) * 12 * shake : 0;
  const shakeY = shake ? (Math.random()-0.5) * 6 * shake : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  if(theme === 'hellscape'){
    const gradient = ctx.createLinearGradient(0,0,0,H);
    gradient.addColorStop(0, '#320909');
    gradient.addColorStop(0.4, '#4a0f12');
    gradient.addColorStop(1, '#120203');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,W,H);
    const scroll = state.bgScroll || 0;
    for(let band=0; band<3; band++){
      const bandHeight = 80;
      const y = H - 240 - band * bandHeight;
      ctx.fillStyle = `rgba(40,18,18,${0.35 - band*0.08})`;
      ctx.fillRect(0, y, W, bandHeight);
      const offset = (scroll * (0.25 + band*0.1)) % 240;
      for(let x=-offset; x<W+240; x+=240){
        ctx.fillStyle = 'rgba(120,40,32,0.25)';
        ctx.fillRect(x, y+12, 180, bandHeight-24);
        ctx.fillStyle = 'rgba(240,120,60,0.2)';
        ctx.fillRect(x+8, y+bandHeight-32, 180, 6);
      }
    }
    ctx.fillStyle = '#150405';
    ctx.fillRect(0, H-140, W, 160);
    ctx.fillStyle = '#2a0f10';
    ctx.fillRect(0, H-156, W, 16);
  } else {
    const gradient = ctx.createLinearGradient(0,0,0,H);
    gradient.addColorStop(0, '#10192f');
    gradient.addColorStop(1, '#05070f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,W,H);
    const scroll = state.bgScroll || 0;
    for(let band=0; band<3; band++){
      const bandHeight = 70;
      const y = H - 220 - band * bandHeight;
      const depth = 0.35 - band * 0.08;
      ctx.fillStyle = `rgba(38,52,92,${depth})`;
      ctx.fillRect(0, y, W, bandHeight);
      const offset = (scroll * (0.4 + band*0.12)) % 200;
      for(let x=-offset; x<W+200; x+=200){
        ctx.fillStyle = 'rgba(60,84,140,0.28)';
        ctx.fillRect(x, y+10, 160, bandHeight-20);
        ctx.fillStyle = 'rgba(24,36,70,0.35)';
        ctx.fillRect(x+10, y+16, 140, bandHeight-32);
        ctx.fillStyle = 'rgba(110,150,220,0.2)';
        ctx.fillRect(x+10, y+16, 2, bandHeight-32);
        ctx.fillRect(x+30, y+16, 2, bandHeight-32);
        ctx.fillRect(x+120, y+16, 2, bandHeight-32);
      }
    }
    for(let i=0;i<3;i++){
      const chartX = 120 + i * 240;
      ctx.fillStyle = 'rgba(255,210,120,0.24)';
      ctx.fillRect(chartX, 86, 120, 90);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.strokeRect(chartX, 86, 120, 90);
      ctx.beginPath();
      ctx.moveTo(chartX+12, 160);
      ctx.lineTo(chartX+40, 130);
      ctx.lineTo(chartX+72, 148);
      ctx.lineTo(chartX+108, 112);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,80,80,0.4)';
      ctx.fillRect(chartX+40, 130, 6, 30);
      ctx.fillStyle = 'rgba(90,200,255,0.35)';
      ctx.fillRect(chartX+70, 148, 6, 12);
    }
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(0, H-120, W, 140);
    ctx.fillStyle = '#1a2438';
    ctx.fillRect(0, H-138, W, 18);
  }

  const targetsToDraw = [...(state.targets || [])].sort((a,b)=> (b.distance||0) - (a.distance||0));
  for(const target of targetsToDraw){
    const progress = clamp(1 - (target.distance || 1), 0, 1);
    const scale = 0.6 + progress * 3.1;
    const width = 42 * scale;
    const height = 78 * scale;
    const wobble = Math.sin((target.wobble||0)) * (12 * (1-progress));
    const laneOffset = (target.lane || 0) * 140 * (1 - progress * 0.4);
    const x = W/2 + laneOffset + wobble - width/2;
    const y = H - 160 - height + progress * 50;
    if(theme === 'hellscape'){
      ctx.fillStyle = '#22331f';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#3d5c2e';
      ctx.fillRect(x+width*0.28, y+height*0.2, width*0.24, height*0.36);
      ctx.fillStyle = '#6bb65a';
      ctx.fillRect(x+width*0.34, y+height*0.08, width*0.16, height*0.18);
      ctx.fillStyle = '#1b2414';
      ctx.fillRect(x- width*0.14, y+height*0.32, width*0.18, height*0.34);
      ctx.fillRect(x+width- width*0.04, y+height*0.32, width*0.18, height*0.34);
      ctx.fillStyle = '#5a1b1b';
      ctx.fillRect(x- width*0.12, y+height*0.62, width*0.14, height*0.16);
      ctx.fillRect(x+width- width*0.02, y+height*0.62, width*0.14, height*0.16);
      if(target.hp && target.maxHp){
        const ratio = Math.max(0, Math.min(1, target.hp / target.maxHp));
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y-10, width, 4);
        ctx.fillStyle = '#88ff6e';
        ctx.fillRect(x, y-10, width*ratio, 4);
      }
    } else {
      ctx.fillStyle = '#3c2924';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#7a4338';
      ctx.fillRect(x+width/2 - width*0.18, y+height*0.2, width*0.36, height*0.4);
      ctx.fillStyle = '#f3cda8';
      ctx.fillRect(x+width/2 - width*0.12, y+height*0.08, width*0.24, height*0.22);
      ctx.fillStyle = '#2b1c18';
      ctx.fillRect(x+width/2 - width*0.15, y+height*0.05, width*0.3, height*0.04);
      ctx.fillStyle = '#7a4338';
      ctx.fillRect(x- width*0.18, y+height*0.28, width*0.2, height*0.32);
      ctx.fillRect(x+width- width*0.02, y+height*0.28, width*0.2, height*0.32);
      ctx.fillStyle = '#f3cda8';
      ctx.fillRect(x- width*0.18, y+height*0.55, width*0.18, height*0.12);
      ctx.fillRect(x+width, y+height*0.55, width*0.18, height*0.12);
      if(target.hp && target.maxHp){
        const ratio = Math.max(0, Math.min(1, target.hp / target.maxHp));
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y-10, width, 4);
        ctx.fillStyle = '#ff5656';
        ctx.fillRect(x, y-10, width*ratio, 4);
      }
    }
  }

  if(state.muzzleFlashUntil && nowTs < state.muzzleFlashUntil){
    ctx.fillStyle = 'rgba(255,230,180,0.45)';
    ctx.fillRect(W/2-160, H-200, 320, 160);
  }

  const aimOffsetX = clamp((arcadeAim.x - W/2) * 0.28, -80, 80);
  const aimOffsetY = clamp((arcadeAim.y - H*0.6) * 0.24, -60, 40);
  ctx.fillStyle = '#1c232f';
  ctx.fillRect(W/2-32 + aimOffsetX*0.25, H-150 + aimOffsetY*0.15, 64, 90);
  ctx.fillStyle = '#0f141e';
  ctx.fillRect(W/2-16 + aimOffsetX*0.45, H-220 + aimOffsetY*0.3, 32, 90);
  ctx.fillStyle = '#3c4c66';
  ctx.fillRect(W/2-6 + aimOffsetX*0.58, H-220 + aimOffsetY*0.3, 12, 60);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(arcadeAim.x-40, arcadeAim.y);
  ctx.lineTo(arcadeAim.x+40, arcadeAim.y);
  ctx.moveTo(arcadeAim.x, arcadeAim.y-40);
  ctx.lineTo(arcadeAim.x, arcadeAim.y+40);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(arcadeAim.x, arcadeAim.y, 8, 0, Math.PI*2);
  ctx.stroke();

  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f0f6ff';
  ctx.font = '20px monospace';
  if(theme === 'hellscape'){
    ctx.fillText(`Zombies neutralized: ${state.kills||0}/${state.target||0}`, 24, 36);
    ctx.font = '14px monospace';
    ctx.fillText('Move mouse or arrow keys to adjust aim', 24, 60);
    ctx.fillText('Hold E or mouse to fire the perimeter gun', 24, 76);
  } else {
    ctx.fillText(`Thugs down: ${state.kills||0}/${state.target||ARCADE_RAMPAGE_TARGET_DEFAULT}`, 24, 36);
    ctx.font = '14px monospace';
    ctx.fillText('Move mouse or arrow keys to aim the gun', 24, 60);
    ctx.fillText('Hold E or mouse to fire the machine gun', 24, 76);
    ctx.fillText('Press SPACE to dismount after the horde is clear', 24, 92);
  }
  if(state.completed && theme!=='hellscape'){
    ctx.fillStyle = '#9ef7ff';
    ctx.font = '18px monospace';
    ctx.fillText('Horde cleared! Elevator unlocked.', W/2 - 160, H - 40);
  }

  if(theme !== 'hellscape'){
    drawArcadePixelOverlay(ctx);
  }
}


function drawBoardMembers(ctx, ox){
  if(!boardMembers.length) return;
  const table = boardTables && boardTables.length ? boardTables[0] : null;
  const tableTop = table ? table.y : 0;
  const tableWidth = table ? table.w : 1;
  const playerCenter = player.x + player.w/2;
  const normalized = table ? clamp((playerCenter - table.x) / Math.max(1, tableWidth), 0, 1) : 0.5;
  const t = performance.now();
  for(const member of boardMembers){
    const width = member.w || 28;
    const height = member.h || 44;
    const baseX = member.x + ox;
    const baseY = member.y + Math.sin(member.bob || 0) * 1.2;
    const facing = member.facing >= 0 ? 1 : -1;
    const tracker = clamp(member.tracker ?? normalized, 0, 1);
    const glow = 0.35 + 0.25*Math.sin((member.seed||0) + t/420);
    if(table){
      const worldTrack = table.x + tracker * tableWidth;
      ctx.strokeStyle = `rgba(120,200,255,${0.18 + glow*0.4})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseX + width/2, baseY + height - 18);
      ctx.lineTo(worldTrack + ox, player.y + player.h/2);
      ctx.stroke();
      ctx.fillStyle = `rgba(110,200,255,${0.16 + glow*0.3})`;
      ctx.fillRect(worldTrack + ox - 3, tableTop - 10, 6, 10);
      ctx.fillRect(worldTrack + ox - 1, tableTop - 42, 2, 32);
    }
    ctx.save();
    ctx.translate(baseX + width/2, baseY);
    ctx.scale(facing, 1);
    ctx.translate(-width/2, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(4, height-6, width-8, 4);
    ctx.fillStyle = '#1c2534';
    ctx.fillRect(3, 10, width-6, 24);
    ctx.fillStyle = '#273247';
    ctx.fillRect(5, 12, width-10, 12);
    ctx.fillStyle = '#141a28';
    ctx.fillRect(4, 30, width-8, 14);
    ctx.fillStyle = '#101622';
    ctx.fillRect(5, 0, width-10, 12);
    ctx.fillStyle = '#070a11';
    ctx.fillRect(5, 8, width-10, 4);
    const blink = (member.blink || 0) % (Math.PI*4);
    if(blink > 0.3 && blink < Math.PI*0.9){
      ctx.fillStyle = '#e6f2ff';
      ctx.fillRect(8, 6, 4, 1);
      ctx.fillRect(width-12, 6, 4, 1);
    }
    ctx.fillStyle = `rgba(100,180,255,${0.25 + glow*0.3})`;
    ctx.fillRect(6, 18, width-12, 2);
    ctx.restore();
  }
}

function drawContactInterference(ctx){
  if(!player.contactInterferenceUntil || now() >= player.contactInterferenceUntil) return;
  const end = player.contactDamageApplyAt || player.contactInterferenceUntil;
  const start = player.contactInterferenceStart || (end ? end - GUARD_CONTACT_DELAY_MS : now());
  const total = Math.max(1, end - start);
  const elapsed = now() - start;
  const progress = clamp(elapsed / total, 0, 1);
  const baseAlpha = 0.28 + 0.25 * Math.sin(progress * Math.PI);
  ctx.save();
  ctx.fillStyle = `rgba(16,18,32,${baseAlpha})`;
  ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation = 'lighter';
  const lineAlpha = 0.12 + 0.08*Math.sin(now()/40 + (player.contactInterferencePhase||0));
  ctx.fillStyle = `rgba(120,200,255,${lineAlpha})`;
  const offset = Math.floor((now()/22 + (player.contactInterferencePhase||0)*13) % 5);
  for(let y=offset; y<H; y+=5){ ctx.fillRect(0,y,W,2); }
  ctx.globalAlpha = 0.16 + 0.1*Math.sin(now()/70 + (player.contactInterferencePhase||0));
  for(let i=0;i<36;i++){
    const nx = (i*73 + Math.floor(now()/18)) % W;
    const ny = (i*97 + Math.floor(now()/14)) % H;
    ctx.fillRect(nx, ny, 2, 2);
  }
  ctx.restore();
}

function drawArcadePixelOverlay(ctx){
  if(!arcadePixelOverlay) return;
  ctx.save();
  ctx.fillStyle = 'rgba(20,24,40,0.08)';
  for(let y=0; y<H; y+=6){ ctx.fillRect(0, y, W, 2); }
  ctx.fillStyle = 'rgba(36,52,92,0.06)';
  for(let x=0; x<W; x+=6){ ctx.fillRect(x, 0, 2, H); }
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for(let y=0; y<H; y+=14){ ctx.fillRect(0, y, W, 1); }
  ctx.restore();
}

function drawWorkerSprite(ctx, worker, offsetX=0){
  if(!worker || !worker.alive) return;
  const appearance = worker.appearance || (worker.appearance = createWorkerAppearance());
  const wobble = Math.sin(worker.bob || 0) * 1.2;
  const walkSwing = Math.sin((worker.bob || 0) * 1.1);
  const facing = worker.facing || 1;
  const width = worker.w || 18;
  const height = worker.h || 38;
  const bodyX = worker.x + offsetX;
  const bodyY = worker.y + wobble;
  const headHeight = 9;
  const hairHeight = 3;
  const torsoHeight = 16;
  const legHeight = Math.max(8, height - headHeight - torsoHeight);
  const headWidth = width - 4;
  const headX = bodyX + 2;
  const hairY = bodyY - hairHeight;
  const faceY = hairY + hairHeight;
  const torsoY = bodyY + headHeight;
  const legY = torsoY + torsoHeight;
  const armSwing = walkSwing * 1.6;
  const flashing = worker.hitFlashUntil && worker.hitFlashUntil > now();
  if(flashing){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,150,150,0.35)';
    ctx.fillRect(bodyX-2, bodyY - hairHeight - 4, width+4, height + hairHeight + 6);
    ctx.restore();
  }

  const legWidth = Math.floor((width-6)/2);
  const stepLift = Math.sin((worker.bob || 0) * 0.9);
  const leftLift = Math.max(0, stepLift) * 2.4;
  const rightLift = Math.max(0, -stepLift) * 2.4;
  const leftLegX = bodyX + 2;
  const rightLegX = bodyX + width - 2 - legWidth;
  ctx.fillStyle = appearance.pants;
  ctx.fillRect(leftLegX, legY, legWidth, legHeight - leftLift);
  ctx.fillRect(rightLegX, legY, legWidth, legHeight - rightLift);
  ctx.fillStyle = appearance.shoes;
  ctx.fillRect(leftLegX, legY + legHeight - leftLift, legWidth, 2);
  ctx.fillRect(rightLegX, legY + legHeight - rightLift, legWidth, 2);

  ctx.fillStyle = appearance.shirt;
  ctx.fillRect(bodyX+3, torsoY, width-6, 6);
  ctx.fillStyle = appearance.suit;
  ctx.fillRect(bodyX+1, torsoY+4, width-2, torsoHeight-4);
  ctx.fillStyle = appearance.suitShadow;
  ctx.fillRect(bodyX+1, torsoY+4, 3, torsoHeight-4);
  ctx.fillRect(bodyX+width-4, torsoY+4, 3, torsoHeight-4);
  ctx.fillStyle = appearance.accent;
  ctx.fillRect(bodyX+2, torsoY+4, 2, torsoHeight-6);
  ctx.fillRect(bodyX+width-4, torsoY+4, 2, torsoHeight-6);

  const leftArmX = bodyX - 1 + (facing>0 ? -armSwing : armSwing);
  const rightArmX = bodyX + width - 2 + (facing>0 ? armSwing : -armSwing);
  ctx.fillStyle = appearance.suit;
  ctx.fillRect(leftArmX, torsoY+4, 3, torsoHeight-4);
  ctx.fillRect(rightArmX, torsoY+4, 3, torsoHeight-4);
  ctx.fillStyle = appearance.cuffs;
  ctx.fillRect(leftArmX, torsoY+torsoHeight-4, 3, 2);
  ctx.fillRect(rightArmX, torsoY+torsoHeight-4, 3, 2);
  ctx.fillStyle = appearance.skin;
  ctx.fillRect(leftArmX, torsoY+torsoHeight-2, 3, 3);
  ctx.fillRect(rightArmX, torsoY+torsoHeight-2, 3, 3);

  if(worker.hasClipboard){
    const useLeft = worker.clipboardSide === -1;
    const handX = useLeft ? leftArmX : rightArmX;
    const boardX = handX + (useLeft ? -5 : 3);
    const boardY = torsoY + torsoHeight - 3;
    ctx.fillStyle = appearance.clipboard;
    ctx.fillRect(boardX, boardY-6, 5, 8);
    ctx.fillStyle = appearance.clipboardPaper;
    ctx.fillRect(boardX+1, boardY-5, 3, 4);
  }

  if(worker.showTie){
    const tieX = Math.floor(bodyX + width/2) - 1;
    if(appearance.tieKnot){ ctx.fillStyle = appearance.tieKnot; ctx.fillRect(tieX, torsoY+2, 2, 3); }
    ctx.fillStyle = appearance.tie || appearance.accent;
    ctx.fillRect(tieX, torsoY+5, 2, torsoHeight-6);
    ctx.fillRect(tieX-1, torsoY+torsoHeight-3, 4, 3);
  }
  if(worker.hasBadge){
    const badgeX = facing>0 ? bodyX+width-6 : bodyX+2;
    ctx.fillStyle = appearance.badge;
    ctx.fillRect(badgeX, torsoY+6, 3, 3);
  }

  ctx.fillStyle = appearance.hairShadow;
  ctx.fillRect(headX, hairY-1, headWidth, 2);
  ctx.fillStyle = appearance.hair;
  ctx.fillRect(headX, hairY, headWidth, hairHeight);
  ctx.fillStyle = appearance.skin;
  ctx.fillRect(headX, faceY, headWidth, headHeight - hairHeight);
  ctx.fillStyle = appearance.skinShadow;
  ctx.fillRect(headX + Math.floor(headWidth/2)-1, faceY+3, 2, 2);
  const eyeY = faceY + 3;
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(headX+2, eyeY, 2, 1);
  ctx.fillRect(headX+headWidth-4, eyeY, 2, 1);
  if(worker.glasses){
    ctx.fillStyle = appearance.glasses;
    ctx.fillRect(headX+1, eyeY-1, headWidth-2, 2);
    ctx.fillRect(headX+1, eyeY-1, 1, 3);
    ctx.fillRect(headX+headWidth-2, eyeY-1, 1, 3);
  }
  ctx.fillStyle = appearance.mouth;
  ctx.fillRect(headX+3, faceY + headHeight - 3, headWidth-6, 1);
}

function drawArcadeThug(ctx, guard, offsetX=0){
  const baseX = guard.x + offsetX;
  const baseY = guard.y;
  const width = guard.w || 24;
  const height = guard.h || 48;
  const flashing = guard.hitFlashUntil && guard.hitFlashUntil > now();
  const punching = guard.punchWindupUntil && guard.punchWindupUntil > now();
  const dir = guard.vx >= 0 ? 1 : -1;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(baseX + 4, baseY + height - 6, Math.max(6, width-8), 4);

  ctx.fillStyle = flashing ? '#ff9c9c' : '#4a2f2a';
  ctx.fillRect(baseX+2, baseY+10, width-4, height-16);
  ctx.fillStyle = '#2d1d18';
  ctx.fillRect(baseX+4, baseY+height-12, width-8, 10);

  ctx.fillStyle = '#7a4338';
  ctx.fillRect(baseX+4, baseY+2, width-8, 16);
  ctx.fillStyle = '#1f1412';
  ctx.fillRect(baseX+4, baseY+2, width-8, 4);

  ctx.fillStyle = '#f4c7a2';
  ctx.fillRect(baseX+6, baseY-4, width-12, 10);
  ctx.fillStyle = '#2a1b18';
  ctx.fillRect(baseX+6, baseY-4, width-12, 2);
  ctx.fillRect(baseX+8, baseY, width-16, 2);

  ctx.fillStyle = '#d44a4a';
  ctx.fillRect(baseX+width/2-2, baseY+16, 4, 18);

  ctx.fillStyle = '#7a4338';
  ctx.fillRect(baseX-2, baseY+18, 6, 20);
  ctx.fillRect(baseX+width-4, baseY+18, 6, 20);
  ctx.fillStyle = '#f4c7a2';
  ctx.fillRect(baseX-2, baseY+36, 6, 6);
  ctx.fillRect(baseX+width-4, baseY+36, 6, 6);

  if(punching){
    const extend = 16;
    const armY = baseY + 24;
    ctx.fillStyle = '#7a4338';
    if(dir>0){
      ctx.fillRect(baseX+width-4, armY, extend, 6);
      ctx.fillStyle = flashing ? '#ffd5b0' : '#f3cda8';
      ctx.fillRect(baseX+width-4+extend, armY-2, 6, 8);
    } else {
      ctx.fillRect(baseX-extend-2, armY, extend, 6);
      ctx.fillStyle = flashing ? '#ffd5b0' : '#f3cda8';
      ctx.fillRect(baseX-extend-8, armY-2, 6, 8);
    }
    ctx.fillStyle = 'rgba(255,140,140,0.35)';
    for(let s=0;s<3;s++){
      const offset = s*4;
      const streakX = dir>0 ? baseX+width+4+offset : baseX-16-offset;
      ctx.fillRect(streakX, armY-6 + s*3, 3, 3);
    }
  }

  if(guard.maxHp){
    const ratio = Math.max(0, Math.min(1, guard.hp / guard.maxHp));
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.fillRect(baseX, baseY-8, width, 4);
    ctx.fillStyle=flashing ? '#ff6b6b' : '#ff4444';
    ctx.fillRect(baseX, baseY-8, width*ratio, 4);
  }
}


function drawWindowGuard(ctx, guard, nowTs){
  if(!guard || !guard.window) return;
  const progress = guard.popAmount ?? 0;
  const flashing = guard.hitUntil && guard.hitUntil > nowTs;
  if(progress <= 0.05 && !flashing) return;
  const width = guard.width || 20;
  const height = guard.height || 34;
  const rect = guard.window;
  const guardBottom = rect.y + rect.h - (guard.paddingBottom || 0);
  const guardTopFull = guardBottom - height;
  const hiddenOffset = height * (1 - progress);
  const spriteY = guardTopFull + hiddenOffset;
  const left = guard.x - width/2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(left + 4, guardBottom - 6, width - 8, 4);
  const bodyColor = flashing ? '#ff9c9c' : '#2f6fa2';
  ctx.fillStyle = bodyColor;
  ctx.fillRect(left+2, spriteY+10, width-4, 22);
  ctx.fillStyle = '#1d1d1d';
  ctx.fillRect(left+3, guardBottom-10, 6, 10);
  ctx.fillRect(left+width-9, guardBottom-10, 6, 10);
  ctx.fillStyle = '#1d3b56';
  ctx.fillRect(left+4, spriteY, width-8, 10);
  ctx.fillStyle = '#fbeede';
  ctx.fillRect(left+6, spriteY+4, width-12, 3);
  ctx.restore();
}

function drawOutside(){
  const building = OUTSIDE_BUILDING;
  const nowTs = now();
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#050910');
  sky.addColorStop(0.4,'#0a1424');
  sky.addColorStop(1,'#070910');
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,W,H);

  const skylinePositions = [40, 180, 320, 460, 620, 780, 940, 1100];
  skylinePositions.forEach((sx, idx)=>{
    const width = 90 + (idx%3)*34;
    const height = 220 + (idx%2)*70;
    const baseY = building.roofY + 20;
    ctx.fillStyle = 'rgba(20,32,54,0.55)';
    ctx.fillRect(sx, baseY - height, width, height);
    ctx.fillStyle = 'rgba(40,60,90,0.32)';
    ctx.fillRect(sx+8, baseY - height + 20, width-16, height-32);
  });

  ctx.fillStyle = '#1b2639';
  ctx.fillRect(building.x, building.y, building.width, building.height);
  ctx.fillStyle = '#23324a';
  ctx.fillRect(building.x+8, building.y+12, building.width-16, building.height-16);
  ctx.fillStyle = '#0f1828';
  ctx.fillRect(building.x-12, building.y+building.height-12, building.width+24, 12);
  ctx.fillRect(building.x, building.y-6, building.width, 6);

  for(const rect of OUTSIDE_WINDOW_LAYOUT.positions){
    ctx.fillStyle = 'rgba(90,140,220,0.38)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  for(const guard of outsideWindowGuards){
    drawWindowGuard(ctx, guard, nowTs);
  }

  for(const sniper of outsideCounterSnipers){
    if(!sniper) continue;
    const flash = sniper.hitUntil && sniper.hitUntil > nowTs;
    const baseColor = sniper.dead ? 'rgba(120,20,20,0.7)' : flash ? '#ffb2b2' : '#1b2538';
    ctx.fillStyle = baseColor;
    ctx.fillRect(sniper.x, sniper.y, sniper.w, sniper.h);
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(sniper.x + sniper.w/2 - 4, sniper.y + sniper.h*0.3, 8, sniper.h*0.4);
    ctx.fillStyle = 'rgba(255,80,60,0.8)';
    ctx.fillRect(sniper.x + sniper.w/2 - 3, sniper.y + sniper.h*0.12, 6, 6);
  }

  ctx.fillStyle = '#2b3a55';
  for(const span of OUTSIDE_PLATFORM_SPANS){
    ctx.fillRect(span.x, span.y, span.w, 6);
    ctx.fillStyle = 'rgba(80,110,170,0.35)';
    ctx.fillRect(span.x, span.y-2, span.w, 2);
    ctx.fillStyle = '#2b3a55';
  }

  const doorWidth = 120;
  const doorHeight = 86;
  const doorX = building.x + building.width/2 - doorWidth/2;
  const doorY = building.groundY - doorHeight;
  ctx.fillStyle = '#0a121f';
  ctx.fillRect(doorX, doorY, doorWidth, doorHeight);
  ctx.fillStyle = '#1c2b43';
  ctx.fillRect(doorX+8, doorY+8, doorWidth-16, doorHeight-16);
  ctx.fillStyle = 'rgba(120,180,255,0.35)';
  ctx.fillRect(doorX+16, doorY+18, doorWidth-32, doorHeight-34);
  ctx.fillStyle = '#22324c';
  ctx.fillRect(doorX + doorWidth/2 - 4, doorY + doorHeight - 26, 8, 26);

  ctx.save();
  ctx.fillStyle = 'rgba(240,248,255,0.92)';
  ctx.font = '24px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Loan Tower', doorX + doorWidth/2, doorY - 18);
  ctx.restore();

  ctx.fillStyle = '#101821';
  ctx.fillRect(0, OUTSIDE_FRONT_WALK - 10, W, 10);
  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, OUTSIDE_FRONT_WALK, W, H - OUTSIDE_FRONT_WALK);
  const carBaseY = OUTSIDE_FRONT_WALK - 14;
  const carHeight = 22;
  const cars = [
    { x: building.x - 150, color:'#3b4f7c' },
    { x: building.x + building.width + 40, color:'#65385f' }
  ];
  for(const car of cars){
    const carWidth = 110;
    ctx.fillStyle = car.color;
    ctx.fillRect(car.x, carBaseY, carWidth, carHeight);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(car.x+12, carBaseY+4, carWidth-24, 8);
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(car.x+8, carBaseY+carHeight-6, carWidth-16, 6);
    ctx.fillStyle = '#c7cad9';
    ctx.fillRect(car.x+10, carBaseY+carHeight-4, 8, 4);
    ctx.fillRect(car.x+carWidth-18, carBaseY+carHeight-4, 8, 4);
  }

  for(const worker of outsideWorkers){
    drawWorkerSprite(ctx, worker, 0);
  }

  for(const guard of outsideGuards){
    const width = guard.width || 24;
    const height = guard.height || 42;
    const gx = guard.renderX - width/2;
    const gy = guard.renderY - height;
    const flashing = guard.hitUntil && guard.hitUntil > nowTs;
    const bodyWidth = Math.max(12, width-4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(guard.renderX - bodyWidth/2, guard.renderY - 6, bodyWidth, 4);
    const bodyColor = flashing ? '#ff9c9c' : '#2f6fa2';
    ctx.fillStyle = bodyColor;
    ctx.fillRect(gx+2, gy+10, width-4, 22);
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(gx+3, gy+32, 6, 10);
    ctx.fillRect(gx+width-9, gy+32, 6, 10);
    ctx.fillStyle = '#1d3b56';
    ctx.fillRect(gx+4, gy, width-8, 10);
    ctx.fillStyle = '#fbeede';
    ctx.fillRect(gx+6, gy+4, width-12, 3);
  }

  for(const rect of OUTSIDE_WINDOW_LAYOUT.positions){
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(rect.x+4, rect.y+4, rect.w-8, 10);
  }

  const skirtWidth = Math.max(42, outsideScope.radius * 0.18);

  // Apply a soft vignette so the city remains visible instead of a hard black mask.
  ctx.save();
  const vignetteRadius = Math.max(outsideScope.radius + skirtWidth, Math.hypot(W, H));
  const vignette = ctx.createRadialGradient(
    outsideScope.x,
    outsideScope.y,
    outsideScope.radius * 0.9,
    outsideScope.x,
    outsideScope.y,
    vignetteRadius
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.55, 'rgba(0,0,0,0.18)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.arc(outsideScope.x, outsideScope.y, outsideScope.radius + skirtWidth, 0, Math.PI*2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(outsideScope.x, outsideScope.y, outsideScope.radius, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(220,228,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(outsideScope.x, outsideScope.y, outsideScope.radius+1.5, 0, Math.PI*2);
  ctx.stroke();

  const crossStyle = (outsideCrosshairFlashUntil > nowTs) ? 'rgba(255,240,150,0.9)' : 'rgba(240,248,255,0.9)';
  ctx.strokeStyle = crossStyle;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(outsideScope.x - outsideScope.radius + 16, outsideScope.y);
  ctx.lineTo(outsideScope.x + outsideScope.radius - 16, outsideScope.y);
  ctx.moveTo(outsideScope.x, outsideScope.y - outsideScope.radius + 16);
  ctx.lineTo(outsideScope.x, outsideScope.y + outsideScope.radius - 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(outsideScope.x, outsideScope.y, 8, 0, Math.PI*2);
  ctx.stroke();

  if(outsideShotPulseUntil > nowTs){
    const elapsed = 1 - Math.min(1, Math.max(0, (outsideShotPulseUntil - nowTs) / 200));
    const radius = 10 + elapsed * 24;
    ctx.strokeStyle = `rgba(255,240,180,${Math.max(0, 1 - elapsed)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(outsideScope.x, outsideScope.y, radius, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.fillStyle = '#f1f4ff';
  ctx.font = '16px monospace';
  ctx.fillText(`Outside Kills: ${outsideKillCount}/${OUTSIDE_KILL_TARGET}`, 24, 32);
  ctx.font = '13px monospace';
  ctx.fillText('Eliminate 20 guards to breach the lobby.', 24, 52);
}

function draw(){
  if(rooftopMissionState){
    drawRooftopMission();
    return;
  }
  if(warzoneMissionState){
    drawWarzoneMission();
    return;
  }
  if(droneMissionState){
    drawDroneMission();
    return;
  }
  if(topDownState){
    drawTopDown();
    return;
  }
  if(outsideMode){
    drawOutside();
    return;
  }
  if(arcadeRampage && arcadeRampage.active){
    drawArcadeRampage();
    return;
  }
  ctx.fillStyle = activePalette.background; ctx.fillRect(0,0,W,H);

  if(!inSub){
    const ox = -camX;
    const oy = -camY;
    ctx.save();
    ctx.translate(0, oy);

    // back wall
    for(const wall of walls){
      const wx = wall.x + ox;
      if(wall.isPlatform){
        drawPlatformBlock(ctx, wx, wall.y, wall.w, wall.h, activePalette);
      } else {
        ctx.fillStyle = activePalette.wall;
        ctx.fillRect(wx, wall.y, wall.w, wall.h);
      }
    }
    // windows
    for(const wdw of windowsArr){
      ctx.fillStyle = activePalette.windowBase;
      ctx.fillRect(wdw.x+ox,wdw.y,wdw.w,wdw.h);
      ctx.fillStyle = activePalette.windowHighlight;
      ctx.fillRect(wdw.x+3+ox,wdw.y+3,wdw.w-6,wdw.h-6);
    }
    for(const fx of backgroundFX){
      if(fx.type==='ticker'){
        ctx.fillStyle='rgba(255,215,90,0.35)';
        ctx.fillRect(80+ox, fx.y, levelWidth()-160, 8);
      } else if(fx.type==='arcadeBackdrop'){
        ctx.fillStyle='rgba(16,24,38,0.92)';
        ctx.fillRect(0,0,W,H);
      } else if(fx.type==='arcadeGrid'){
        const offset = (camX*0.3)%140;
        ctx.fillStyle='rgba(40,60,100,0.18)';
        for(let x=-offset; x<levelWidth(); x+=140){
          ctx.fillRect(x+ox, 60, 2, floorSlab.y-120);
        }
      } else if(fx.type==='arcadeCubicle'){
        ctx.fillStyle='rgba(52,68,108,0.32)';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.fillStyle='rgba(82,104,158,0.28)';
        ctx.fillRect(fx.x+6+ox, fx.y+6, Math.max(0, fx.w-12), Math.max(0, fx.h-12));
      } else if(fx.type==='arcadeChart'){
        ctx.fillStyle='rgba(255,214,140,0.25)';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.strokeStyle='rgba(255,255,255,0.2)';
        ctx.strokeRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.beginPath();
        ctx.moveTo(fx.x+12+ox, fx.y+fx.h-18);
        ctx.lineTo(fx.x+fx.w/2+ox, fx.y+16);
        ctx.lineTo(fx.x+fx.w-12+ox, fx.y+fx.h-24);
        ctx.stroke();
      } else if(fx.type==='arcadeGunMount'){
        ctx.fillStyle='#202638';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.fillStyle='#151b28';
        ctx.fillRect(fx.x+12+ox, fx.y+fx.h-36, fx.w-24, 30);
        ctx.fillStyle='#3e4c6a';
        ctx.fillRect(fx.x+20+ox, fx.y+8, fx.w-40, fx.h-52);
      } else if(fx.type==='hellscapeGunMount'){
        ctx.fillStyle = '#1f1412';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.fillStyle = '#3a2520';
        ctx.fillRect(fx.x+12+ox, fx.y+fx.h-32, fx.w-24, 28);
        ctx.fillStyle = '#5c3a2e';
        ctx.fillRect(fx.x+18+ox, fx.y+12, fx.w-36, fx.h-60);
        ctx.fillStyle = 'rgba(255,140,40,0.25)';
        ctx.fillRect(fx.x+18+ox, fx.y+12, fx.w-36, 6);
      } else if(fx.type==='hellscapeRadioTower'){
        const centerX = (fx.x || 0) + ox;
        const baseY = fx.base !== undefined ? fx.base : (floorSlab ? floorSlab.y : H - 60);
        const height = fx.h || 220;
        const width = fx.w || 52;
        const topY = baseY - height;
        ctx.fillStyle = 'rgba(62,70,92,0.78)';
        ctx.beginPath();
        ctx.moveTo(centerX - width/2, baseY);
        ctx.lineTo(centerX, topY);
        ctx.lineTo(centerX + width/2, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,200,255,0.42)';
        ctx.lineWidth = 2;
        const rungs = 6;
        for(let r=1; r<rungs; r++){
          const ry = baseY - (height / rungs) * r;
          ctx.beginPath();
          ctx.moveTo(centerX - width/2 + 6, ry);
          ctx.lineTo(centerX + width/2 - 6, ry);
          ctx.stroke();
        }
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(centerX, topY);
        ctx.lineTo(centerX, topY - 20);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,150,90,0.82)';
        ctx.beginPath();
        ctx.arc(centerX, topY - 26, 7, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,210,150,0.35)';
        ctx.beginPath();
        ctx.arc(centerX, topY - 26, 14, 0, Math.PI*2);
        ctx.fill();
      } else if(fx.type==='hellscapeSky'){
        const gradient = ctx.createLinearGradient(0,0,0,H);
        gradient.addColorStop(0,'#14090c');
        gradient.addColorStop(0.4,'#1d0e12');
        gradient.addColorStop(1,'#241214');
        ctx.fillStyle = gradient;
        ctx.fillRect(ox, 0, levelWidth(), H);
      } else if(fx.type==='hellscapeBuilding'){
        const fxX = fx.x + ox;
        ctx.fillStyle='rgba(40,30,38,0.7)';
        ctx.fillRect(fxX, fx.y, fx.w||180, fx.h||240);
        ctx.fillStyle='rgba(110,60,60,0.28)';
        ctx.fillRect(fxX+8, fx.y+12, Math.max(0,(fx.w||180)-16), Math.max(0,(fx.h||240)-24));
        ctx.fillStyle='rgba(255,140,80,0.3)';
        for(let row=0; row<5; row++){
          const wy = fx.y + 24 + row*36;
          ctx.fillRect(fxX+12, wy, Math.max(0,(fx.w||180)-24), 8);
        }
      } else if(fx.type==='hellscapeField'){
        const baseY = fx.y || floorSlab.y;
        const width = fx.w || 200;
        const height = fx.h || 60;
        ctx.fillStyle = 'rgba(42,30,20,0.65)';
        ctx.fillRect(fx.x+ox, baseY - height, width, height);
        ctx.fillStyle = 'rgba(76,46,24,0.45)';
        for(let row=0; row<5; row++){
          const ry = baseY - height + 10 + row * ((height-20)/4);
          ctx.fillRect(fx.x+ox, ry, width, 4);
        }
      } else if(fx.type==='hellscapeFire'){
        const baseY = (fx.y || floorSlab.y-60) + (fx.h || 80);
        const flicker = Math.sin(performance.now()/180 + fx.x*0.02) * 6;
        ctx.fillStyle='rgba(255,100,40,0.45)';
        ctx.beginPath();
        ctx.moveTo(fx.x+ox, baseY);
        ctx.quadraticCurveTo(fx.x-20+ox, (fx.y||baseY-80) + 20 - flicker, fx.x+ox, (fx.y||baseY-80) - 6);
        ctx.quadraticCurveTo(fx.x+20+ox, (fx.y||baseY-80) + 20 + flicker, fx.x+ox, baseY);
        ctx.fill();
        ctx.fillStyle='rgba(255,200,120,0.35)';
        ctx.beginPath();
        ctx.moveTo(fx.x+ox, baseY);
        ctx.quadraticCurveTo(fx.x-10+ox, (fx.y||baseY-80) + 18 - flicker*0.5, fx.x+ox, (fx.y||baseY-80) + 4);
        ctx.quadraticCurveTo(fx.x+10+ox, (fx.y||baseY-80) + 22 + flicker*0.5, fx.x+ox, baseY);
        ctx.fill();
      } else if(fx.type==='hellscapeSmoke'){
        const height = fx.h || 100;
        const baseY = fx.y || (floorSlab ? floorSlab.y - height : H - height - 80);
        const drift = fx.drift || 0.3;
        const sway = Math.sin(performance.now()/900 * drift + (fx.x||0)*0.01) * 12;
        ctx.fillStyle = 'rgba(180,180,180,0.18)';
        ctx.beginPath();
        ctx.moveTo(fx.x+ox + sway*0.3, baseY);
        ctx.bezierCurveTo(fx.x+ox - 20 + sway*0.6, baseY - height*0.4, fx.x+ox + 20 - sway*0.2, baseY - height*0.7, fx.x+ox + sway*0.4, baseY - height);
        ctx.quadraticCurveTo(fx.x+ox + 12, baseY - height*1.1, fx.x+ox + 6, baseY - height*1.25);
        ctx.quadraticCurveTo(fx.x+ox - 18, baseY - height*0.8, fx.x+ox + sway*0.2, baseY - height*0.4);
        ctx.closePath();
        ctx.fill();
      } else if(fx.type==='hellscapeTree'){
        const baseY = fx.base || floorSlab.y;
        ctx.fillStyle='rgba(30,20,26,0.7)';
        ctx.fillRect(fx.x-6+ox, baseY - (fx.h||80), 12, fx.h||80);
        ctx.fillStyle='rgba(80,40,40,0.45)';
        ctx.beginPath();
        const topY = baseY - (fx.h||80) - 30;
        ctx.moveTo(fx.x+ox, topY);
        ctx.lineTo(fx.x-36+ox, baseY-18);
        ctx.lineTo(fx.x+36+ox, baseY-18);
        ctx.closePath();
        ctx.fill();
      } else if(fx.type==='hellscapeGraveyard'){
        const baseY = fx.y || floorSlab.y;
        const width = fx.w || 180;
        ctx.fillStyle='rgba(60,50,50,0.4)';
        ctx.fillRect(fx.x+ox, baseY-6, width, 6);
        ctx.fillStyle='rgba(110,90,90,0.5)';
        const graves = Math.max(3, Math.floor(width/32));
        for(let g=0; g<graves; g++){
          const gx = fx.x + 12 + g*((width-24)/Math.max(1,graves-1));
          ctx.fillRect(gx+ox, baseY-26, 10, 20);
          ctx.fillRect(gx-4+ox, baseY-20, 18, 6);
        }
      } else if(fx.type==='hellscapeGasStation'){
        const width = fx.w || 200;
        const height = fx.h || 90;
        ctx.fillStyle='rgba(40,32,32,0.8)';
        ctx.fillRect(fx.x+ox, fx.y, width, height);
        ctx.fillStyle='rgba(200,120,80,0.4)';
        ctx.fillRect(fx.x+12+ox, fx.y+12, width-24, height-24);
        ctx.fillStyle='rgba(255,180,120,0.4)';
        ctx.fillRect(fx.x-30+ox, fx.y+height-16, width+60, 10);
      } else if(fx.type==='hellscapeCar'){
        const width = fx.w || 70;
        const height = fx.h || 24;
        ctx.fillStyle='rgba(120,40,40,0.7)';
        ctx.fillRect(fx.x+ox, fx.y, width, height);
        ctx.fillStyle='rgba(255,230,200,0.4)';
        ctx.fillRect(fx.x+6+ox, fx.y+4, width-12, height/2);
        ctx.fillStyle='#0f0f0f';
        ctx.fillRect(fx.x+4+ox, fx.y+height-6, width-8, 6);
      } else if(fx.type==='hellscapeCabin'){
        const width = fx.w || 160;
        const height = fx.h || 80;
        ctx.fillStyle = fx.breakroom ? 'rgba(80,40,50,0.75)' : 'rgba(60,34,34,0.7)';
        ctx.fillRect(fx.x+ox, fx.y, width, height);
        ctx.fillStyle='rgba(120,80,60,0.4)';
        ctx.fillRect(fx.x+10+ox, fx.y+10, width-20, height-20);
        ctx.fillStyle='rgba(255,180,140,0.45)';
        ctx.fillRect(fx.x+ox, fx.y-18, width, 18);
      } else if(fx.type==='cubiclesParallax'){
        const offset = (camX*0.25)%160;
        for(let x=-offset;x<levelWidth();x+=160){
          ctx.fillStyle='rgba(200,200,210,0.18)';
          ctx.fillRect(x+ox, floorSlab.y-200, 120, 90);
          ctx.fillStyle='rgba(180,180,190,0.12)';
          ctx.fillRect(x+ox+20, floorSlab.y-160, 80, 60);
        }
      } else if(fx.type==='serverParallax'){
        const offset = (camX*0.3)%200;
        for(let x=-offset;x<levelWidth();x+=200){
          ctx.fillStyle='rgba(80,110,160,0.2)';
          ctx.fillRect(x+ox, floorSlab.y-240, 140, 160);
          ctx.fillStyle='rgba(140,200,255,0.1)';
          for(let row=0; row<5; row++){
            ctx.fillRect(x+ox+12, floorSlab.y-220+row*26, 116, 8);
          }
        }
      } else if(fx.type==='skylineParallax'){
        const offset = (camX*0.15)%260;
        for(let x=-offset;x<levelWidth();x+=260){
          ctx.fillStyle='rgba(60,80,120,0.25)';
          ctx.fillRect(x+ox, 40, 200, H-180);
          ctx.fillStyle='rgba(100,130,180,0.18)';
          ctx.fillRect(x+ox+40, 60, 160, H-200);
        }
      } else if(fx.type==='poster'){
        ctx.fillStyle='rgba(220,120,180,0.45)';
        ctx.fillRect(fx.x+ox, fx.y, 60, 90);
      } else if(fx.type==='skyline'){
        ctx.fillStyle='rgba(60,80,120,0.25)';
        ctx.fillRect(ox, 40, levelWidth(), H-160);
      } else if(fx.type==='boardCharts'){
        const offset = (camX*0.12)%200;
        for(let x=-offset; x<levelWidth(); x+=200){
          const panelX = x+ox+80;
          ctx.fillStyle='rgba(12,20,34,0.72)';
          ctx.fillRect(panelX-8, 78, 154, 186);
          ctx.fillStyle='rgba(40,70,120,0.48)';
          ctx.fillRect(panelX, 86, 138, 168);
          ctx.lineWidth=2;
          ctx.strokeStyle='rgba(90,190,120,0.75)';
          ctx.beginPath();
          ctx.moveTo(panelX+6, 232);
          ctx.lineTo(panelX+40, 192);
          ctx.lineTo(panelX+78, 214);
          ctx.lineTo(panelX+118, 168);
          ctx.stroke();
          ctx.strokeStyle='rgba(220,100,100,0.75)';
          ctx.beginPath();
          ctx.moveTo(panelX+6, 132);
          ctx.lineTo(panelX+38, 152);
          ctx.lineTo(panelX+78, 118);
          ctx.lineTo(panelX+118, 140);
          ctx.stroke();
          ctx.lineWidth=1;
        }
      } else if(fx.type==='coliseumBackdrop'){
        ctx.fillStyle='rgba(240,232,210,0.28)';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.strokeStyle='rgba(255,255,255,0.12)';
        ctx.lineWidth = 6;
        ctx.strokeRect(fx.x+ox+12, fx.y+12, fx.w-24, fx.h-24);
      } else if(fx.type==='coliseumFloor'){
        ctx.fillStyle='rgba(240,224,190,0.25)';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.strokeStyle='rgba(200,180,150,0.4)';
        ctx.lineWidth=4;
        ctx.strokeRect(fx.x+ox+6, fx.y+6, fx.w-12, fx.h-12);
      } else if(fx.type==='coliseumMosaic'){
        ctx.fillStyle='rgba(205,190,150,0.32)';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.strokeStyle='rgba(255,255,255,0.18)';
        ctx.lineWidth = 3;
        ctx.strokeRect(fx.x+ox+8, fx.y+8, fx.w-16, fx.h-16);
        const tile = (fx.w-32)/6;
        for(let r=0;r<2;r++){
          for(let c=0;c<6;c++){
            const tx = fx.x + 16 + c*tile + ox;
            const ty = fx.y + 12 + r*(fx.h/2 - 6);
            ctx.fillStyle = (r+c)%2===0 ? 'rgba(255,232,180,0.45)' : 'rgba(220,200,160,0.4)';
            ctx.fillRect(tx, ty, tile-6, fx.h/2 - 14);
          }
        }
      } else if(fx.type==='coliseumColumn'){
        ctx.fillStyle='rgba(235,228,210,0.6)';
        ctx.fillRect(fx.x-20+ox, fx.y, 40, fx.h);
        ctx.fillStyle='rgba(210,200,180,0.4)';
        ctx.fillRect(fx.x-14+ox, fx.y+10, 28, fx.h-20);
      } else if(fx.type==='coliseumBanner'){
        ctx.fillStyle='rgba(200,40,40,0.6)';
        ctx.fillRect(fx.x+ox, fx.y, fx.w, fx.h);
        ctx.fillStyle='rgba(255,255,255,0.4)';
        ctx.fillRect(fx.x+ox+12, fx.y+12, fx.w-24, fx.h-24);
      } else if(fx.type==='coliseumStatue'){
        const width = 48;
        const flip = fx.flip ? -1 : 1;
        ctx.save();
        ctx.translate(fx.x+ox + (flip<0?width:0), fx.y);
        ctx.scale(flip, 1);
        ctx.fillStyle='rgba(210,210,220,0.55)';
        ctx.fillRect(0, 0, width, fx.h);
        ctx.fillStyle='rgba(170,170,180,0.4)';
        ctx.fillRect(6, 10, width-12, fx.h-20);
        ctx.restore();
      } else if(fx.type==='coliseumHero'){
        const width = 36;
        const flip = fx.flip ? -1 : 1;
        ctx.save();
        ctx.translate(fx.x+ox + (flip<0?width:0), fx.y);
        ctx.scale(flip, 1);
        ctx.fillStyle='rgba(205,205,218,0.58)';
        ctx.fillRect(6, fx.h-26, width-12, 26);
        ctx.fillStyle='rgba(180,180,195,0.45)';
        ctx.fillRect(0, 0, width, fx.h-20);
        ctx.fillStyle='rgba(150,150,168,0.35)';
        ctx.fillRect(8, 12, width-16, fx.h-48);
        ctx.fillStyle='rgba(235,235,245,0.4)';
        ctx.fillRect(width/2 - 8, 16, 16, 20);
        ctx.fillRect(width/2 - 4, 34, 8, fx.h-68);
        ctx.restore();
      } else if(fx.type==='coliseumFountain'){
        ctx.fillStyle='rgba(190,200,220,0.4)';
        ctx.fillRect(fx.x+ox, fx.y+fx.h-24, fx.w, 24);
        ctx.fillStyle='rgba(160,170,190,0.45)';
        ctx.fillRect(fx.x+12+ox, fx.y+fx.h-44, fx.w-24, 20);
        ctx.fillStyle='rgba(120,180,220,0.35)';
        ctx.beginPath();
        ctx.ellipse(fx.x+fx.w/2+ox, fx.y+fx.h-46, fx.w/2-28, 16, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle='rgba(150,200,240,0.28)';
        ctx.beginPath();
        ctx.ellipse(fx.x+fx.w/2+ox, fx.y+fx.h-72, fx.w/2-44, 12, 0, 0, Math.PI*2);
        ctx.fill();
        const ripple = Math.sin(performance.now()/400) * 4;
        ctx.strokeStyle='rgba(220,240,255,0.4)';
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.ellipse(fx.x+fx.w/2+ox, fx.y+fx.h-48, fx.w/2-36 + ripple*0.3, 10 + ripple*0.2, 0, 0, Math.PI*2);
        ctx.stroke();
      } else if(fx.type==='coliseumTorch'){
        ctx.fillStyle='rgba(170,120,60,0.8)';
        ctx.fillRect(fx.x-8+ox, fx.y+fx.h-32, 16, 32);
        ctx.fillStyle='rgba(120,80,40,0.7)';
        ctx.fillRect(fx.x-4+ox, fx.y+fx.h-48, 8, 16);
        const flameBaseY = fx.y + 24;
        const flamePulse = Math.sin(performance.now()/200 + fx.x*0.01) * 6;
        ctx.fillStyle='rgba(255,200,120,0.55)';
        ctx.beginPath();
        ctx.moveTo(fx.x+ox, flameBaseY-20-flamePulse);
        ctx.quadraticCurveTo(fx.x-14+ox, flameBaseY-4, fx.x+ox, flameBaseY+8);
        ctx.quadraticCurveTo(fx.x+14+ox, flameBaseY-4, fx.x+ox, flameBaseY-20-flamePulse);
        ctx.fill();
        ctx.fillStyle='rgba(255,240,180,0.35)';
        ctx.beginPath();
        ctx.moveTo(fx.x+ox, flameBaseY-14-flamePulse*0.6);
        ctx.quadraticCurveTo(fx.x-9+ox, flameBaseY-2, fx.x+ox, flameBaseY+4);
        ctx.quadraticCurveTo(fx.x+9+ox, flameBaseY-2, fx.x+ox, flameBaseY-14-flamePulse*0.6);
        ctx.fill();
      }
    }
    for(const screen of billboardScreens){
      ctx.fillStyle='rgba(255,120,180,0.35)';
      ctx.fillRect(screen.x+ox, screen.y, screen.w, screen.h);
      ctx.fillStyle='rgba(255,255,255,0.15)';
      ctx.fillRect(screen.x+10+ox, screen.y+10, screen.w-20, screen.h-20);
    }
    for(const paper of floatingPapers){
      const sway = Math.sin((paper.sway||0) + performance.now()/600) * 20;
      ctx.fillStyle='rgba(255,255,255,0.2)';
      ctx.fillRect(paper.x + sway + ox, paper.y + Math.sin(performance.now()/900+paper.sway)*12, 12, 6);
    }
    // floor
    drawPlatformBlock(ctx, floorSlab.x+ox, floorSlab.y, floorSlab.w, floorSlab.h, activePalette);

    if(currentFloor === FLOORS && ceoArenaState.shockwaves && ceoArenaState.shockwaves.length){
      ctx.save();
      for(const wave of ceoArenaState.shockwaves){
        const alpha = Math.max(0, Math.min(0.45, wave.life * 0.9));
        if(alpha <= 0) continue;
        ctx.strokeStyle = `rgba(255,210,150,${alpha})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(wave.x + ox, wave.y, Math.max(0, wave.radius), 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // desks
    for(const d of desks){
      ctx.fillStyle = activePalette.desk; ctx.fillRect(d.x+ox,d.y,d.w,d.h);
      ctx.fillStyle = activePalette.deskEdge; ctx.fillRect(d.x+6+ox,d.y+d.h-10,d.w-12,8);
      ctx.fillStyle = activePalette.deskLeg; ctx.fillRect(d.x+4+ox,d.y+d.h,6,10); ctx.fillRect(d.x+d.w-10+ox,d.y+d.h,6,10);
    }
    for(const station of arcadeStations){
      if(!station) continue;
      ctx.fillStyle = '#242a3a';
      ctx.fillRect(station.x+ox, station.y, station.w, station.h);
      ctx.fillStyle = '#1a1f2b';
      ctx.fillRect(station.x+10+ox, station.y+station.h-28, station.w-20, 24);
      ctx.fillStyle = '#373f56';
      ctx.fillRect(station.x+20+ox, station.y+8, station.w-40, station.h-48);
      ctx.fillStyle = '#0f141c';
      ctx.fillRect(station.x+station.w/2-12+ox, station.y-24, 24, 24);
      if(!station.used){
        ctx.fillStyle='rgba(255,255,255,0.85)';
        ctx.font='14px monospace';
        ctx.fillText('SPACE: Machine Gun', station.x+ox-12, station.y-8);
      }
    }
    // plants
    for(const p of plants){
      ctx.fillStyle = activePalette.plantLeaf; ctx.fillRect(p.x+4+ox,p.y,16,22);
      ctx.fillStyle = activePalette.plantPot; ctx.fillRect(p.x+ox,p.y+22,24,8);
    }
    // water cooler
    for(const wc of waterCoolers){
      ctx.fillStyle = activePalette.waterCooler; ctx.fillRect(wc.x+ox,wc.y, wc.w, wc.h);
      ctx.fillStyle = activePalette.waterGlass; ctx.fillRect(wc.x+4+ox,wc.y+6, wc.w-8, wc.h-12);
    }
    if(sprinklersActiveUntil && now()<sprinklersActiveUntil){
      const t = performance.now();
      for(const spray of sprinklers){
        const baseX = spray.x + ox;
        const seg = spray.length/4;
        for(let d=0; d<4; d++){
          const sway = Math.sin((t/220) + spray.phase + d*0.8) * 10;
          ctx.fillStyle='rgba(150,190,255,0.22)';
          ctx.fillRect(baseX + sway, spray.y + d*seg, 2, seg);
        }
      }
    }
    for(const machine of coffeeMachines){
      ctx.fillStyle='#553'; ctx.fillRect(machine.x+ox, machine.y, machine.w, machine.h);
      ctx.fillStyle=machine.used ? 'rgba(120,120,120,0.4)' : '#d5a253';
      ctx.fillRect(machine.x+6+ox, machine.y+6, machine.w-12, machine.h-16);
    }
    for(const vend of vendingMachines){
      if(!vend) continue;
      const hasMenu = !!vend.menu;
      const soldOut = hasMenu && (vend.depleted || vendingMachineSoldOut(vend));
      let bodyColor = '#4c64aa';
      let panelColor = 'rgba(255,255,255,0.25)';
      if(hasMenu){
        bodyColor = soldOut ? '#4b1d1d' : '#cf2d2d';
        panelColor = soldOut ? 'rgba(255,210,210,0.2)' : 'rgba(255,255,255,0.42)';
      } else if(vend.broken){
        bodyColor = '#3a3a3a';
      }
      ctx.fillStyle = bodyColor;
      ctx.fillRect(vend.x+ox, vend.y, vend.w, vend.h);
      ctx.fillStyle = panelColor;
      ctx.fillRect(vend.x+4+ox, vend.y+8, vend.w-8, vend.h-24);
      if(hasMenu && !soldOut){
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(vend.x+6+ox, vend.y+10, vend.w-12, 6);
      }
    }
    for(const printer of printers){
      ctx.fillStyle=printer.jammed?'#555':'#8a8a8a';
      ctx.fillRect(printer.x+ox, printer.y, printer.w, printer.h);
      ctx.fillStyle='#222';
      ctx.fillRect(printer.x+4+ox, printer.y+6, printer.w-8, printer.h-16);
    }

    // ladders
    for(const l of ladders){
      ctx.fillStyle = activePalette.ladder; ctx.fillRect(l.x+ox,l.y,l.w,l.h);
      ctx.strokeStyle='rgba(255,255,255,0.2)';
      for(let yy=0; yy<l.h; yy+=10){ ctx.beginPath(); ctx.moveTo(l.x+2+ox, l.y+yy); ctx.lineTo(l.x+l.w-2+ox, l.y+yy); ctx.stroke(); }
    }

    // moving platforms
    for(const m of movingPlatforms){
      const mpPalette = {
        platform: activePalette.movingPlatform || activePalette.platform,
        platformTop: activePalette.movingPlatformHighlight || activePalette.platformTop,
        platformShadow: activePalette.platformShadow || activePalette.movingPlatform,
        platformOutline: activePalette.platformOutline,
        platformGlow: activePalette.platformGlow
      };
      drawPlatformBlock(ctx, m.x+ox, m.y, m.w, m.h, mpPalette);
      if(activePalette.movingPlatformHighlight){
        ctx.fillStyle = activePalette.movingPlatformHighlight;
        ctx.fillRect(m.x+4+ox, m.y+2, Math.max(0, m.w-8), 2);
      }
    }

    for(const table of boardTables){
      if(table.legs){
        ctx.fillStyle='#24170d';
        for(const leg of table.legs){
          ctx.fillRect(leg.x+ox, leg.y, leg.w, leg.h);
          ctx.fillStyle='#1a120a';
          ctx.fillRect(leg.x+4+ox, leg.y, Math.max(4, leg.w-8), leg.h-6);
          ctx.fillStyle='#24170d';
        }
      }
      ctx.fillStyle='#3b2b1a';
      ctx.fillRect(table.x+ox, table.y, table.w, table.h);
      ctx.fillStyle='rgba(255,255,255,0.1)';
      ctx.fillRect(table.x+8+ox, table.y+4, table.w-16, Math.max(0, table.h-10));
      if(table.runner){
        ctx.fillStyle='rgba(220,180,120,0.22)';
        ctx.fillRect(table.runner.x+ox, table.runner.y, table.runner.w, table.runner.h);
      }
    }

    drawBoardMembers(ctx, ox);

    for(const hz of hazards){
      if(hz.type==='electric'){
        ctx.fillStyle='rgba(80,140,220,0.5)';
        ctx.fillRect(hz.x+ox, hz.y, hz.w, hz.h);
      } else if(hz.type==='steam'){
        ctx.fillStyle='rgba(200,200,200,0.25)';
        ctx.fillRect(hz.x+ox, hz.y, hz.w, hz.h);
      } else if(hz.type==='fall'){
        if(hz.open){
          ctx.fillStyle='rgba(30,30,30,0.6)';
          ctx.fillRect(hz.x+ox, hz.y, hz.w, hz.h);
        } else {
          drawPlatformBlock(ctx, hz.x+ox, hz.y, hz.w, hz.h, activePalette);
        }
      } else if(hz.type==='spark'){
        ctx.fillStyle='rgba(80,200,255,0.4)';
        ctx.fillRect(hz.x-6+ox, hz.y, hz.w+12, hz.h);
      }
    }

    for(const terminal of serverTerminals){
      ctx.fillStyle=terminal.hacked? '#224a22':'#2d4f8a';
      ctx.fillRect(terminal.x+ox, terminal.y, terminal.w, terminal.h);
      ctx.fillStyle='rgba(255,255,255,0.2)';
      ctx.fillRect(terminal.x+4+ox, terminal.y+6, terminal.w-8, terminal.h-12);
    }

    // vents
    for(const v of vents){
      ctx.fillStyle = v.open? activePalette.ventOpen : activePalette.ventClosed;
      ctx.fillRect(v.x+ox,v.y,v.w,v.h);
      ctx.strokeStyle='rgba(255,255,255,0.15)';
      for(let i=2;i<v.w-2;i+=4){ ctx.beginPath(); ctx.moveTo(v.x+i+ox,v.y+2); ctx.lineTo(v.x+i+ox,v.y+v.h-2); ctx.stroke(); }
    }

    // workers
    for(const worker of workers){
      drawWorkerSprite(ctx, worker, ox);
    }
    if(hellscapeState){
      const nowTs = now();
      for(const hostage of hellscapeState.hostages){
        if(!hostage) continue;
        const hx = hostage.x + ox;
        const baseY = hostage.y || 0;
        const freed = !!hostage.freed;
        const escaped = !!hostage.safe;
        const fallen = (!!hostage.removed && !escaped) || (hostage.hp!==undefined && hostage.hp<=0);
        const height = hostage.h || 42;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(hx-12, baseY-6, 24, 6);
        let bodyColor = 'rgba(255,210,160,0.85)';
        if(fallen){ bodyColor = 'rgba(200,80,80,0.75)'; }
        else if(freed){ bodyColor = 'rgba(120,255,180,0.85)'; }
        ctx.fillStyle = bodyColor;
        ctx.fillRect(hx-10, baseY-height+6, 20, height-6);
        if(hostage.hitFlashUntil && hostage.hitFlashUntil > nowTs){
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(hx-10, baseY-height+6, 20, height-6);
        }
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(hx-10, baseY-height+6, 20, 6);
        ctx.fillStyle = freed ? 'rgba(160,255,200,0.85)' : 'rgba(255,255,255,0.8)';
        ctx.font = '11px monospace';
        let label = 'HELP';
        if(fallen){ label = 'TURNED'; }
        else if(escaped){ label = 'ESCAPE'; }
        else if(freed){ label = 'RUN!'; }
        ctx.fillText(label, hx-18, baseY-height-2);
        if(freed && !fallen && !escaped){
          const hp = Math.max(0, hostage.hp || 0);
          const maxHp = Math.max(1, hostage.maxHp || 300);
          const ratio = Math.max(0, Math.min(1, hp / maxHp));
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(hx-16, baseY-height-10, 32, 4);
          ctx.fillStyle = '#6bff94';
          ctx.fillRect(hx-16, baseY-height-10, 32 * ratio, 4);
        }
      }
    }

    if(finalHostages.length){
      for(const hostage of finalHostages){
        if(!hostage || hostage.removed) continue;
        const hx = hostage.x + ox;
        const baseY = hostage.y || (floorSlab ? floorSlab.y : H-50);
        const height = hostage.h || 44;
        const bob = hostage.freed ? 0 : Math.sin(hostage.idlePhase || 0) * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(hx-14, baseY-6, 28, 6);
        const bodyColour = hostage.freed ? 'rgba(180,255,210,0.9)' : 'rgba(255,230,190,0.9)';
        ctx.fillStyle = bodyColour;
        ctx.fillRect(hx-11, baseY-height+bob+4, 22, height-8);
        ctx.fillStyle = 'rgba(58,44,32,0.86)';
        ctx.fillRect(hx-9, baseY-height-6+bob, 18, 12);
        if(!hostage.freed){
          ctx.strokeStyle = 'rgba(188,120,80,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(hx-12, baseY-height/2+bob);
          ctx.lineTo(hx+12, baseY-height/2+bob);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(hx-8, baseY-height+bob+6, 16, 4);
        }
        ctx.save();
        ctx.fillStyle = 'rgba(10,16,24,0.7)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(hostage.name || 'Hostage', hx, baseY-height-10);
        ctx.restore();
      }
    }

    if(ecoBossActive){
      for(const chair of hostagesInRoom){
        if(!chair || chair.removed) continue;
        const hx = chair.x + ox;
        const hy = chair.y;
        ctx.fillStyle = 'rgba(40,60,80,0.8)';
        ctx.fillRect(hx-18, hy-6, 36, 10);
        ctx.fillRect(hx-12, hy-44, 24, 38);
        if(!chair.lost){
          ctx.fillStyle = chair.freed ? 'rgba(120,255,180,0.9)' : 'rgba(255,220,160,0.9)';
          ctx.fillRect(hx-9, hy-50, 18, 32);
          ctx.fillStyle = '#10201a';
          ctx.fillRect(hx-9, hy-50, 18, 4);
        }
        if(!chair.freed && !chair.lost){
          const ratio = Math.max(0, Math.min(1, chair.timerMs / 20000));
          ctx.fillStyle = 'rgba(255,90,90,0.85)';
          ctx.fillRect(hx-18, hy-18, 36*ratio, 4);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.strokeRect(hx-18, hy-18, 36, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.font = '10px monospace';
          ctx.fillText(chair.name, hx-18, hy-24);
        } else if(chair.lost){
          ctx.fillStyle = 'rgba(200,80,80,0.6)';
          ctx.font = '10px monospace';
          ctx.fillText(`${chair.name} ✖`, hx-18, hy-24);
        } else if(chair.freed){
          ctx.fillStyle = 'rgba(120,255,180,0.75)';
          ctx.font = '10px monospace';
          ctx.fillText(`${chair.name} ✓`, hx-18, hy-24);
        }
      }
      if(ecoBoss){
        const bx = ecoBoss.x + ox;
        ctx.fillStyle = '#1f3b2f';
        ctx.fillRect(bx, ecoBoss.y, ecoBoss.w, ecoBoss.h);
        ctx.fillStyle = '#29503c';
        ctx.fillRect(bx+12, ecoBoss.y+20, ecoBoss.w-24, ecoBoss.h-40);
        if(ecoBoss.hitFlashUntil && ecoBoss.hitFlashUntil > now()){
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(bx, ecoBoss.y, ecoBoss.w, ecoBoss.h);
        }
        const hpRatio = ecoBoss.maxHp>0 ? Math.max(0, Math.min(1, ecoBoss.hp / ecoBoss.maxHp)) : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, ecoBoss.y-18, ecoBoss.w, 6);
        ctx.fillStyle = '#6bff94';
        ctx.fillRect(bx, ecoBoss.y-18, ecoBoss.w * hpRatio, 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.strokeRect(bx, ecoBoss.y-18, ecoBoss.w, 6);
      }
      for(const proj of ecoProjectiles){
        if(!proj) continue;
        if(proj.type==='root'){
          ctx.fillStyle = 'rgba(90,140,90,0.6)';
          ctx.fillRect(proj.x + ox, proj.y, proj.w, proj.h);
        } else if(proj.type==='spore'){
          ctx.fillStyle = 'rgba(120,220,160,0.35)';
          ctx.beginPath();
          ctx.arc(proj.x + ox, proj.y, proj.radius || 24, 0, Math.PI*2);
          ctx.fill();
        } else if(proj.type==='flare'){
          ctx.fillStyle = 'rgba(255,240,120,0.35)';
          ctx.fillRect(proj.x + ox, proj.y, proj.w, proj.h);
        }
      }
    }

    // servers
    for(const s of servers){
      ctx.fillStyle = s.destroyed? activePalette.serverDestroyed : activePalette.serverActive;
      ctx.fillRect(s.x+ox,s.y,s.w,s.h);
      if(!s.destroyed){
        ctx.fillStyle = s.armed? '#ffd54d' : (Math.random()<0.5?'#ff4545':'#45ff59');
        ctx.fillRect(s.x+s.w-6+ox,s.y+4,4,4);
      }
    }

    // alarm panel
    for(const a of panels){
      ctx.fillStyle = a.disabled ? activePalette.alarmDisabled : activePalette.alarmActive;
      ctx.fillRect(a.x+ox,a.y,a.w,a.h);
    }

    if(ventDungeonState){
      for(const box of ventDungeonState.boxes){
        const bx = box.x + ox;
        const glow = box.glowUntil && box.glowUntil > now();
        if(glow){
          const pulse = 0.35 + 0.2 * Math.sin(performance.now()/140 + bx*0.01);
          ctx.fillStyle = `rgba(255,240,180,${pulse})`;
          ctx.fillRect(bx-6, box.y-6, box.w+12, box.h+12);
        }
        ctx.fillStyle = box.activated ? 'rgba(130,255,190,0.85)' : 'rgba(255,220,150,0.85)';
        ctx.fillRect(bx, box.y, box.w, box.h);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(bx+6, box.y+6, box.w-12, box.h-12);
      }
    }

    // guards with flashlight cone
    for(const g of guards){
      const isCEO = g.type==='ceo' || g.ceo;
      if(!isCEO && g.flashlight !== false){
        ctx.fillStyle = activePalette.flashlightCone;
        const coneDir = (g.vx>=0?1:-1);
        ctx.beginPath();
        ctx.moveTo(g.x + (coneDir>0?g.w:0)+ox, g.y+10);
        ctx.lineTo(g.x + (coneDir>0?g.w+FLASH_DIST:-FLASH_DIST)+ox, g.y-10 + Math.sin(g.t)*20);
        ctx.lineTo(g.x + (coneDir>0?g.w+FLASH_DIST:-FLASH_DIST)+ox, g.y+30 + Math.cos(g.t)*20);
        ctx.closePath();
        ctx.fill();
      }
      const flashing = g.hitFlashUntil && g.hitFlashUntil > now();
      if(isCEO){
        const baseX = g.x + ox;
        const baseY = g.y;
        const width = g.w;
        const height = g.h;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(baseX + width*0.18, baseY + height - 10, width*0.64, 8);
        ctx.fillStyle = flashing ? '#ffe0b5' : '#1c283c';
        ctx.fillRect(baseX, baseY, width, height);
        ctx.fillStyle = '#0f1726';
        ctx.fillRect(baseX + width*0.12, baseY + height*0.22, width*0.76, height*0.72);
        ctx.fillStyle = '#e9efff';
        ctx.fillRect(baseX + width/2 - 12, baseY + height*0.24, 24, height*0.32);
        ctx.fillStyle = '#0a111e';
        ctx.fillRect(baseX + width/2 - 24, baseY + 12, 48, 30);
        ctx.fillStyle = '#141b2b';
        ctx.fillRect(baseX + width*0.22, baseY + height*0.82, width*0.2, height*0.12);
        ctx.fillRect(baseX + width*0.58, baseY + height*0.82, width*0.2, height*0.12);
        ctx.fillStyle = '#f8d9b4';
        ctx.fillRect(baseX + width/2 - 20, baseY - 2, 40, 34);
        ctx.fillStyle = '#0d141f';
        ctx.fillRect(baseX + width/2 - 18, baseY + 18, 36, 6);
        ctx.fillStyle = flashing ? 'rgba(255,220,160,0.6)' : 'rgba(120,200,255,0.25)';
        ctx.fillRect(baseX - 8, baseY + 8, width + 16, height - 16);
        if(g.maxHp){
          const ratio = Math.max(0, Math.min(1, g.hp / g.maxHp));
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(baseX, baseY - 14, width, 6);
          ctx.fillStyle = flashing ? '#ff9f80' : '#ff4f4f';
          ctx.fillRect(baseX, baseY - 14, width * ratio, 6);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.strokeRect(baseX, baseY - 14, width, 6);
        }
        continue;
      }
      if(g.type==='thug'){
        drawArcadeThug(ctx, g, ox);
        continue;
      }
      if(g.type==='zombie'){
        const flashing = g.hitFlashUntil && g.hitFlashUntil > now();
        const zx = g.x + ox;
        const zy = g.y;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(zx+3, zy+34, g.w-6, 12);
        ctx.fillStyle = flashing ? '#ffb8b8' : '#3f6b3f';
        ctx.fillRect(zx+2, zy+12, g.w-4, 24);
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(zx+4, zy, g.w-8, 14);
        ctx.fillStyle = '#88c47c';
        ctx.fillRect(zx+6, zy+6, g.w-12, 6);
        if(g.maxHp){
          const ratio = Math.max(0, Math.min(1, g.hp / g.maxHp));
          ctx.fillStyle='rgba(20,20,20,0.7)';
          ctx.fillRect(zx, zy-6, g.w, 3);
          ctx.fillStyle=flashing ? '#ff6b6b' : '#9cff8a';
          ctx.fillRect(zx, zy-6, g.w * ratio, 3);
        }
        continue;
      }
      let tint = '#2f6fa2';
      if(g.type==='auto') tint='#3c8a3c';
      if(g.type==='launcher') tint='#8a3c3c';
      if(g.type==='ninja') tint='#2f2f2f';
      if(g.type==='soldier') tint='#3d5f9a';
      if(g.type==='commando') tint='#4d5a8f';
      if(g.type==='ceo'){
        const centerX = g.x + g.w/2 + ox;
        const groundY = g.y + g.h;
        const radius = g.smashRadius || 220;
        if(g.smashPhase==='windup'){
          ctx.save();
          ctx.strokeStyle = 'rgba(255,220,140,0.45)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(centerX, groundY, radius, 0, Math.PI*2);
          ctx.stroke();
          ctx.restore();
        }
        if(g.smashFlashUntil && g.smashFlashUntil > now()){
          ctx.save();
          ctx.strokeStyle = 'rgba(255,150,100,0.5)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(centerX, groundY, radius + 24, 0, Math.PI*2);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.fillStyle = flashing ? '#ff9c9c' : tint;
      ctx.fillRect(g.x+2+ox,g.y+10,g.w-4,22);
      ctx.fillStyle='#1d1d1d';
      ctx.fillRect(g.x+3+ox,g.y+32,6,10);
      ctx.fillRect(g.x+g.w-9+ox,g.y+32,6,10);
      ctx.fillStyle='#1d3b56';
      ctx.fillRect(g.x+4+ox,g.y, g.w-8, 10);
      if(g.maxHp){
        const ratio = Math.max(0, Math.min(1, g.hp / g.maxHp));
        ctx.fillStyle='rgba(20,20,20,0.7)';
        ctx.fillRect(g.x+ox, g.y-6, g.w, 3);
        ctx.fillStyle=flashing ? '#ff6b6b' : '#ff4444';
        ctx.fillRect(g.x+ox, g.y-6, g.w * ratio, 3);
      }
    }

    for(const merchant of merchants){
      ctx.fillStyle='#2a2a2a';
      ctx.fillRect(merchant.x+ox, merchant.y, merchant.w, merchant.h);
      ctx.fillStyle='rgba(200,200,200,0.3)';
      ctx.fillRect(merchant.x+4+ox, merchant.y+8, merchant.w-8, merchant.h-16);
      if(blackMarketOffer && !merchant.opened){
        ctx.fillStyle='rgba(255,255,255,0.9)';
        ctx.font='12px monospace';
        ctx.fillText('Trade', merchant.x+ox, merchant.y-6);
      }
    }

    // Elevator Door
    ctx.fillStyle = activePalette.doorFrame; ctx.fillRect(door.x+ox, door.y, door.w, door.h);
    const panelH = door.h-20;
    const liftPx = door.lift * (panelH);
    ctx.fillStyle = activePalette.doorPanel; ctx.fillRect(door.x+8+ox, door.y+door.h-panelH - liftPx, door.w-16, panelH);
    if(now()<door.glowUntil){
      ctx.fillStyle = activePalette.doorGlow;
      ctx.fillRect(door.x-6+ox, door.y-6, door.w+12, door.h+12);
    }
    if(door.label){
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.font='12px monospace';
      ctx.fillText(door.label, door.x+12+ox, door.y-24);
    }
    if(nearDoor() && door.unlocked && !door.open){
      ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='14px monospace';
      ctx.fillText('Press SPACE to Enter', door.x+16+ox, door.y-8);
    }

    // bullets & flames & rockets
    for(const b of bullets){
      if(b.type==='flame'){
        ctx.fillStyle='rgba(255,180,80,0.9)';
        ctx.fillRect(b.x-3+ox,b.y-3,6,6);
      } else if(b.type==='rocket'){
        ctx.fillStyle='rgba(255,120,120,0.9)';
        ctx.fillRect(b.x-3+ox,b.y-2,8,4);
      } else if(b.type==='policy'){
        ctx.fillStyle='rgba(160,80,40,0.8)';
        ctx.fillRect(b.x-4+ox,b.y-4,8,8);
      } else if(b.type==='ad'){
        ctx.fillStyle='rgba(255,200,40,0.75)';
        ctx.beginPath();
        ctx.arc(b.x+ox, b.y, 6, 0, Math.PI*2);
        ctx.fill();
      } else if(b.type==='lawsuit'){
        ctx.fillStyle='rgba(200,240,255,0.8)';
        ctx.fillRect(b.x-3+ox,b.y-3,6,6);
      } else {
        ctx.fillStyle = b.from==='player' ? '#9cf' : '#f88';
        ctx.fillRect(b.x-2+ox,b.y-2,4,4);
      }
    }

    // pickups visuals
    for(const it of pickups){
      if(!it.type) continue;
      const x=it.x+ox, y=it.y;
      if(it.type==='screw'){ ctx.fillStyle='#d9d9d9'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='ammo'){ ctx.fillStyle='#ffd24a'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='medkit'){
        ctx.fillStyle='#ff6f6f';
        ctx.fillRect(x,y,it.w,it.h);
        ctx.fillStyle='rgba(255,255,255,0.85)';
        ctx.fillRect(x + it.w/2 - 2, y + 4, 4, it.h-8);
        ctx.fillRect(x + 4, y + it.h/2 - 2, it.w-8, 4);
      }
      if(it.type==='cash'){ ctx.fillStyle='#6fff6f'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='file'){ ctx.fillStyle='#9ec7ff'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='intel'){ ctx.fillStyle='#c89eff'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='feather'){ ctx.fillStyle='#fff7a8'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='special'){ ctx.fillStyle='#B455FF'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='unlockAll'){
        ctx.fillStyle='#ffe28c';
        ctx.fillRect(x,y,it.w,it.h);
        ctx.fillStyle='#2b1d55';
        ctx.fillRect(x+4,y+4,it.w-8,it.h-8);
        ctx.fillStyle='#ffecc0';
        ctx.fillRect(x+6,y+6,it.w-12,it.h-12);
      }
      if(it.type==='snack'){
        ctx.fillStyle='#f7c26a';
        ctx.fillRect(x,y,it.w,it.h);
        ctx.fillStyle='#4f2d1a';
        ctx.fillRect(x+3,y+4,it.w-6,4);
      }
      if(it.type==='zombieAnecdote'){
        ctx.fillStyle='#8cf2ff';
        ctx.fillRect(x,y,it.w,it.h);
        ctx.fillStyle='#2a4b5a';
        ctx.fillRect(x+4,y+4,it.w-8,it.h-8);
      }
      if(it.type==='cache'){
        ctx.fillStyle='#9fe7ff';
        ctx.fillRect(x,y,it.w,it.h);
        ctx.fillStyle='rgba(40,60,90,0.5)';
        ctx.fillRect(x+4,y+4,it.w-8,it.h-8);
      }
      if(it.type==='weapon'){
        ctx.fillStyle='#c07bff';
        ctx.fillRect(x,y,it.w,it.h);
        ctx.fillStyle='rgba(30,16,60,0.6)';
        ctx.fillRect(x+3,y+3,it.w-6,it.h-6);
        ctx.fillStyle='rgba(255,255,255,0.8)';
        ctx.font='10px monospace';
        ctx.fillText('W', x+3, y+it.h-4);
      }
      if(it.type==='secret'){
        ctx.fillStyle='#ff7acb';
        ctx.fillRect(x,y,it.w,it.h);
        ctx.fillStyle='rgba(255,255,255,0.4)';
        ctx.fillRect(x+4,y+4,it.w-8,it.h-8);
      }
    }

    // player
    const spriteTop = player.y + player.crouchOffset;
    const px=player.x+ox, py=spriteTop + player.h;
    if(now()<player.hurtUntil){ ctx.fillStyle='rgba(255,120,120,0.8)'; ctx.fillRect(px-2,spriteTop-2,player.w+4,player.h+4); }
    drawNinjaPlayer(ctx, px, py, player);
    if(now() < player.pistol.muzzleUntil && player.weapon==='pistol'){
      ctx.fillStyle='rgba(255,220,120,0.9)';
      const mx = px + (player.facing>0 ? player.w+2 : -8);
      ctx.fillRect(mx, spriteTop + 24, 8, 4);
    }
    if(now() < player.machineGun.muzzleUntil && player.weapon==='machineGun'){
      const dir = player.facing>0 ? 1 : -1;
      const baseX = px + (dir>0 ? player.w + 6 : -16);
      const baseY = spriteTop + 22;
      ctx.fillStyle = 'rgba(255,240,160,0.85)';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + dir * 20, baseY - 5);
      ctx.lineTo(baseX + dir * 20, baseY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,120,0.45)';
      ctx.beginPath();
      ctx.arc(baseX + dir * 18, baseY, 6, 0, Math.PI*2);
      ctx.fill();
    }
    if(player.weapon==='flame' && attackHeld){
      ctx.fillStyle='rgba(255,160,60,0.18)';
      const dir = player.facing>0?1:-1;
      ctx.beginPath();
      ctx.moveTo(px + (dir>0?player.w-2:2), spriteTop+22);
      ctx.lineTo(px + (dir>0?player.w+100:-100), spriteTop+10);
      ctx.lineTo(px + (dir>0?player.w+100:-100), spriteTop+36);
      ctx.closePath(); ctx.fill();
    }

    // Smoke overlay when servers down
    if(smokeActive){
      smokeT += 0.01;
      for(let i=0;i<6;i++){
        const a = 0.06 + 0.02*Math.sin(smokeT + i);
        ctx.fillStyle = `rgba(200,200,220,${a})`;
        const sx = (i*260 + (Math.sin(smokeT*0.7+i)*120)) + ox;
        ctx.fillRect(sx, floorSlab.y-140 + Math.sin(smokeT+i)*8, 240, 120);
      }
    }

    ctx.restore();

    if(arcadePixelOverlay){
      drawArcadePixelOverlay(ctx);
    }

    if(lightingCondition==='dim'){
      ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(0,0,W,H);
    } else if(lightingCondition==='emergency'){
      const pulse = 0.25 + 0.15*Math.sin(lightingPhase*4);
      ctx.fillStyle=`rgba(150,40,40,${pulse})`;
      ctx.fillRect(0,0,W,H);
    } else if(lightingCondition==='strobe'){
      if(Math.sin(lightingPhase*12)>0.4){ ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.fillRect(0,0,W,H); }
    } else if(lightingCondition==='neon'){
      ctx.fillStyle='rgba(40,120,200,0.18)'; ctx.fillRect(0,0,W,H);
    } else if(lightingCondition==='storm'){
      ctx.fillStyle='rgba(30,30,50,0.3)'; ctx.fillRect(0,0,W,H);
      if(Math.sin(lightingPhase*3)>0.92){ ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.fillRect(0,0,W,H); }
    } else if(lightingCondition==='minimal'){
      ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(0,0,W,H);
    }

    if(powerSurgeUntil && now()<powerSurgeUntil){
      const flicker = 0.18 + 0.18*Math.abs(Math.sin(performance.now()/70));
      ctx.fillStyle=`rgba(255,255,255,${flicker})`;
      ctx.fillRect(0,0,W,H);
    }

    if(now()<player.screenFlashUntil){
      ctx.fillStyle='rgba(255,255,255,0.25)';
      ctx.fillRect(0,0,W,H);
    }

  } else {
    // Sub-level draw
    for(const w of sub.walls){
      ctx.fillStyle='#171920'; ctx.fillRect(w.x,w.y,w.w,w.h);
    }
    ctx.fillStyle='#343844'; ctx.fillRect(sub.floor.x, sub.floor.y, sub.floor.w, sub.floor.h);
    for(const v of sub.vents){
      ctx.fillStyle='#6c6c6c'; ctx.fillRect(v.x,v.y,v.w,v.h);
      ctx.strokeStyle='rgba(255,255,255,0.15)';
      for(let i=2;i<v.w-2;i+=4){ ctx.beginPath(); ctx.moveTo(v.x+i,v.y+2); ctx.lineTo(v.x+i,v.y+v.h-2); ctx.stroke(); }
    }
    for(const it of sub.loot){
      if(!it.type) continue;
      if(it.type==='cash'){ ctx.fillStyle='#6fff6f'; ctx.fillRect(it.x,it.y,it.w,it.h); }
      if(it.type==='ammo'){ ctx.fillStyle='#ffd24a'; ctx.fillRect(it.x,it.y,it.w,it.h); }
      if(it.type==='intel'){ ctx.fillStyle='#c89eff'; ctx.fillRect(it.x,it.y,it.w,it.h); }
    }
    for(const g of sub.guards){
      const flashing = g.hitFlashUntil && g.hitFlashUntil > now();
      let tint = '#2f6fa2'; if(g.type==='ninja') tint='#2f2f2f';
      ctx.fillStyle=flashing ? '#ff9c9c' : tint;
      ctx.fillRect(g.x+2,g.y+10,g.w-4,22);
      ctx.fillStyle='#1d1d1d'; ctx.fillRect(g.x+3,g.y+32,6,10); ctx.fillRect(g.x+g.w-9,g.y+32,6,10);
      ctx.fillStyle='#1d3b56'; ctx.fillRect(g.x+4,g.y, g.w-8, 10);
      if(g.maxHp){
        const ratio = Math.max(0, Math.min(1, g.hp / g.maxHp));
        ctx.fillStyle='rgba(20,20,20,0.7)';
        ctx.fillRect(g.x, g.y-6, g.w, 3);
        ctx.fillStyle=flashing ? '#ff6b6b' : '#ff4444';
        ctx.fillRect(g.x, g.y-6, g.w * ratio, 3);
      }
    }
    for(const b of sub.bosses){
      const flashing = b.hitFlashUntil && b.hitFlashUntil > now();
      let tint = '#3c8a3c';
      if(b.type==='launcher') tint='#8a3c3c';
      ctx.fillStyle=flashing ? '#ff9c9c' : tint;
      ctx.fillRect(b.x+2,b.y+10,b.w-4,22);
      ctx.fillStyle='#1d1d1d'; ctx.fillRect(b.x+3,b.y+32,6,10); ctx.fillRect(b.x+b.w-9,b.y+32,6,10);
      ctx.fillStyle='#3a3a3a'; ctx.fillRect(b.x+4,b.y, b.w-8, 10);
      if(b.maxHp){
        const ratio = Math.max(0, Math.min(1, b.hp / b.maxHp));
        ctx.fillStyle='rgba(20,20,20,0.7)';
        ctx.fillRect(b.x, b.y-6, b.w, 3);
        ctx.fillStyle=flashing ? '#ff6b6b' : '#ff4444';
        ctx.fillRect(b.x, b.y-6, b.w * ratio, 3);
      }
    }
    for(const b of bullets){
      if(b.type==='flame'){
        ctx.fillStyle='rgba(255,180,80,0.9)';
        ctx.fillRect(b.x-3,b.y-3,6,6);
      } else if(b.type==='rocket'){
        ctx.fillStyle='rgba(255,120,120,0.9)';
        ctx.fillRect(b.x-3,b.y-2,8,4);
      } else {
        ctx.fillStyle = b.from==='player' ? '#9cf' : '#f88';
        ctx.fillRect(b.x-2,b.y-2,4,4);
      }
    }
    const spriteTop = player.y + player.crouchOffset;
    const px=player.x, py=spriteTop + player.h;
    if(now()<player.hurtUntil){ ctx.fillStyle='rgba(255,120,120,0.8)'; ctx.fillRect(px-2,spriteTop-2,player.w+4,player.h+4); }
    drawNinjaPlayer(ctx, px, py, player);
    if(now() < player.pistol.muzzleUntil && player.weapon==='pistol'){
      ctx.fillStyle='rgba(255,220,120,0.9)';
      const mx = px + (player.facing>0 ? player.w+2 : -8);
      ctx.fillRect(mx, spriteTop + 24, 8, 4);
    }
    if(now() < player.machineGun.muzzleUntil && player.weapon==='machineGun'){
      const dir = player.facing>0 ? 1 : -1;
      const baseX = px + (dir>0 ? player.w + 6 : -16);
      const baseY = spriteTop + 22;
      ctx.fillStyle = 'rgba(255,240,160,0.85)';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + dir * 20, baseY - 5);
      ctx.lineTo(baseX + dir * 20, baseY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,120,0.45)';
      ctx.beginPath();
      ctx.arc(baseX + dir * 18, baseY, 6, 0, Math.PI*2);
      ctx.fill();
    }
    if(player.weapon==='flame' && attackHeld){
      ctx.fillStyle='rgba(255,160,60,0.18)';
      const dir = player.facing>0?1:-1;
      ctx.beginPath();
      ctx.moveTo(px + (dir>0?player.w-2:2), spriteTop+22);
      ctx.lineTo(px + (dir>0?player.w+100:-100), spriteTop+10);
      ctx.lineTo(px + (dir>0?player.w+100:-100), spriteTop+36);
      ctx.closePath(); ctx.fill();
    }
  }
  if(ventDungeonState){
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.textAlign='left';
    ctx.font='16px monospace';
    ctx.fillText(`Electrical Boxes: ${ventDungeonState.hotwiredCount}/${ventDungeonState.requiredBoxes}`, 24, 36);
    ctx.font='13px monospace';
    ctx.fillText(`Interns pacified: ${ventDungeonState.internsKilled}/${ventDungeonState.internTotal}`, 24, 56);
    if(!ventDungeonState.missionComplete){
      ctx.font='12px monospace';
      ctx.fillText('Find and hotwire every electrical box to unlock the elevator.', 24, 74);
    }
  }
  if(hellscapeState){
    const nowTs = now();
    const wave = hellscapeState.wave || 1;
    const goalWave = Number.isFinite(hellscapeState.goalWave) ? hellscapeState.goalWave : null;
    const waveKills = hellscapeState.waveKills || 0;
    const waveTarget = hellscapeState.waveTarget || hellscapeWaveTarget(wave);
    const waveLabel = goalWave ? `Wave ${wave}/${goalWave}` : `Wave ${wave}`;
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.textAlign='left';
    ctx.font='16px monospace';
    ctx.fillText(`${waveLabel}: ${waveKills}/${waveTarget} zombies`, 24, 32);
    ctx.font='13px monospace';
    let statusY = 52;
    const totalEliminated = hellscapeState.zombiesKilled || 0;
    const optionalTarget = hellscapeState.optionalKillTarget || hellscapeState.killTarget || HELL_OPTIONAL_KILL_TARGET;
    const optionalSuffix = optionalTarget ? ` (Optional evac at ${optionalTarget})` : '';
    ctx.fillText(`Total eliminated: ${totalEliminated}${optionalSuffix}`, 24, statusY);
    statusY += 18;
    const exitText = hellscapeState.exitUnlocked
      ? 'Exit Break Room unlocked — evac optional.'
      : 'Exit Break Room locked — keep fighting.';
    ctx.fillText(exitText, 24, statusY);
    statusY += 18;
    if(hellscapeState.snackFound){
      ctx.fillText('Optional snack recovered ✓', 24, statusY);
    } else {
      ctx.fillText('Optional: Locate the break room snack.', 24, statusY);
    }
    statusY += 16;
    if((hellscapeState.hostages && hellscapeState.hostages.length) || hellscapeState.hostagesRescued || hellscapeState.hostagesLost){
      const freedNow = hellscapeState.hostages ? hellscapeState.hostages.filter(h=>h && h.freed).length : 0;
      const totalFreed = freedNow + (hellscapeState.hostagesRescued || 0);
      const totalHostages = (hellscapeState.hostages ? hellscapeState.hostages.length : 0) + (hellscapeState.hostagesRescued || 0) + (hellscapeState.hostagesLost || 0);
      const freedLabel = totalHostages === 1 ? 'Hostage freed' : 'Hostages freed';
      ctx.fillText(`${freedLabel}: ${totalFreed}/${totalHostages}`, 24, statusY);
      statusY += 16;
      if(hellscapeState.hostagesLost){
        const lostLabel = hellscapeState.hostagesLost === 1 ? 'Hostage turned' : 'Hostages turned';
        ctx.fillText(`${lostLabel}: ${hellscapeState.hostagesLost}`, 24, statusY);
        statusY += 16;
      }
    }
    if(hellscapeState.buffUntil && hellscapeState.buffUntil > nowTs){
      const remaining = Math.max(0, Math.ceil((hellscapeState.buffUntil - nowTs)/1000));
      ctx.fillText(`Zombie Anecdote immunity: ${remaining}s`, 24, statusY);
    }
  }
  if(activeHack){
    const hack = activeHack;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.65)';
    ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';
    ctx.fillStyle='#44ffaa';
    ctx.font='22px monospace';
    ctx.fillText('HACK SEQUENCE', W/2, H/2-80);
    const display = hack.sequence.map((key, idx)=> idx < hack.index ? '✓' : key.toUpperCase());
    ctx.font='20px monospace';
    ctx.fillText(display.join(' '), W/2, H/2-24);
    const windowMs = hack.stepWindow || 900;
    const remaining = hack.deadline ? Math.max(0, Math.min(1, (hack.deadline - now()) / windowMs)) : 0;
    ctx.strokeStyle='rgba(255,255,255,0.3)';
    ctx.strokeRect(W/2-150, H/2+4, 300, 18);
    ctx.fillStyle='#44ffaa';
    ctx.fillRect(W/2-150, H/2+4, 300*remaining, 18);
    ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.font='12px monospace';
    ctx.fillText('Press keys in order • ESC to abort', W/2, H/2+38);
    ctx.restore();
    ctx.textAlign='left';
  }

  drawContactInterference(ctx);
}

// ===== Loop =====
function loop(ts){
  const dt=Math.min(1/30,(ts-last)/1000); last=ts;
  if(!pause){
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);
}

window.LoanTowerBridge = {
  startRun: startNewRun,
  isRunning: () => runActive,
  getLastResult: () => lastResult
};
pause = true;
runActive = false;
window.dispatchEvent(new Event('loanTowerReady'));
})();
