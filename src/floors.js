/* floors.js — modular floor definitions for Loan Tower */

function mkRNG(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
const clamp01 = x => Math.max(0, Math.min(1, x));
const choice = (rng, arr) => arr[(rng()*arr.length) | 0];
function hsl(h, s=60, l=55){ return `hsl(${(h%360+360)%360} ${s}% ${l}%)`; }

const THEMES = {
  INTERN:      { name:'Intern Office',     baseHue: 210, accents:[0,20],  light:'fluoro' },
  HR:          { name:'HR Zone',           baseHue: 340, accents:[-10,15],light:'soft' },
  FINANCE:     { name:'Finance Wing',      baseHue: 45,  accents:[-10,10], light:'gold' },
  DATA:        { name:'Data Center',       baseHue: 200, accents:[-20,10], light:'neon' },
  RND:         { name:'R&D Lab',           baseHue: 170, accents:[-10,10], light:'lab' },
  INVESTOR:    { name:'Investor Lounge',   baseHue: 350, accents:[-15,5],  light:'dim' },
  MARKETING:   { name:'Marketing Dept.',   baseHue: 300, accents:[-20,20], light:'saturated' },
  LEGAL:       { name:'Legal Floor',       baseHue: 25,  accents:[-5,5],   light:'mahogany' },
  EXEC:        { name:'Executive Suites',  baseHue: 220, accents:[-15,5],  light:'executive' },
  PENTHOUSE:   { name:'CEO Penthouse',     baseHue: 260, accents:[-5,5],   light:'storm' }
};

const BOARD_FLOORS = {
  4:  { label:'Board Room A', card:'Ace of Spades' },
  8:  { label:'Board Room B', card:'King of Clubs' },
  12: { label:'Board Room C', card:'Queen of Diamonds' },
  16: { label:'Board Room D', card:'Jack of Hearts' },
  20: { label:'Board Room E', card:'Ten of Spades' },
  24: { label:'Board Room F', card:'Nine of Clubs' },
  28: { label:'Board Room G', card:'Eight of Diamonds' },
  32: { label:'Board Room H', card:'Seven of Hearts' }
};

export const SPECIAL_FLOOR = {
  SERVER: 7,
  NINJA:  21,
  ECO:    30,
  CEO:    36
};

function themeForFloor(n) {
  if (n === SPECIAL_FLOOR.CEO) return THEMES.PENTHOUSE;
  if (n >= 33)                  return THEMES.EXEC;
  if (n >= 29)                  return THEMES.LEGAL;
  if (n >= 25)                  return THEMES.MARKETING;
  if (n >= 21)                  return THEMES.INVESTOR;
  if (n >= 17)                  return THEMES.RND;
  if (n >= 13)                  return THEMES.DATA;
  if (n >= 9)                   return THEMES.FINANCE;
  if (n >= 5)                   return THEMES.HR;
  return THEMES.INTERN;
}

const DEFAULT_SPAWNS = {
  guards: { normal: 0.6, ranged: 0.25, elite: 0.1, miniboss: 0.05 },
  workers: { min: 3, max: 7 },
  guardCap: floor => floor < 10 ? 25 : Infinity,
  spawnSpreadMin: 120,
  neverSpawnLeftOfPlayer: true
};

const DEFAULT_LOOT = {
  cashMult: 1.0,
  ammoMult: 1.0,
  intelChance: 0.20,
  fileChance: 0.15,
  specialFileChance: f => (f >= 18 ? 0.30 : 0.20),
  featherOnFloor: true
};

function cloneSpawnsDefaults(){
  return {
    guards: { ...DEFAULT_SPAWNS.guards },
    workers: { ...DEFAULT_SPAWNS.workers },
    guardCap: DEFAULT_SPAWNS.guardCap,
    spawnSpreadMin: DEFAULT_SPAWNS.spawnSpreadMin,
    neverSpawnLeftOfPlayer: DEFAULT_SPAWNS.neverSpawnLeftOfPlayer
  };
}

function cloneLootDefaults(){
  return {
    cashMult: DEFAULT_LOOT.cashMult,
    ammoMult: DEFAULT_LOOT.ammoMult,
    intelChance: DEFAULT_LOOT.intelChance,
    fileChance: DEFAULT_LOOT.fileChance,
    specialFileChance: DEFAULT_LOOT.specialFileChance,
    featherOnFloor: DEFAULT_LOOT.featherOnFloor
  };
}

const HAZARDS = {
  cables:   { kind:'cable',  dmg:10, arcMs:1400 },
  steam:    { kind:'steam',  dmg:0,  blindMs:2000 },
  falling:  { kind:'fallingTiles', dmg:0 },
  sparks:   { kind:'serverSparks', dmg:8, stunMs:200 },
  carts:    { kind:'rollingCart', dmg:0, push:1.0 }
};

const EVENTS = {
  evacuation: { id:'evac',  desc:'Sprinklers + panic', guardsSpeedMult:1.1, workersStampede:true },
  surge:      { id:'surge', desc:'Power surge; elevators disabled briefly' },
  blackout:   { id:'blackout', desc:'Lights flicker; stealth easier; guard aim −25%' },
  bonus:      { id:'bonus', desc:'Bonus cash floor; few/no guards' },
  manager:    { id:'manager', desc:'Random mid-floor miniboss arrives' }
};

function lightingPreset(theme) {
  switch (theme.light) {
    case 'fluoro':    return { type:'flat',   intensity:1.0 };
    case 'soft':      return { type:'soft',   intensity:0.9 };
    case 'gold':      return { type:'warm',   intensity:1.0 };
    case 'neon':      return { type:'cool',   intensity:1.1 };
    case 'lab':       return { type:'white',  intensity:1.0 };
    case 'dim':       return { type:'dim',    intensity:0.7 };
    case 'saturated': return { type:'color',  intensity:1.1 };
    case 'mahogany':  return { type:'warm',   intensity:0.8 };
    case 'executive': return { type:'cool',   intensity:0.9 };
    case 'storm':     return { type:'storm',  intensity:1.2 };
  }
}

function musicLayersForFloor(n){
  if (n <= 4)  return [1,0,1,0];
  if (n <= 12) return [1,1,1,0];
  if (n <= 24) return [1,1,1,1];
  if (n <= 32) return [1,1,1,1];
  return [1,1,1,1];
}

function platformsFor(theme, floor, rng) {
  const baseY = 520;
  const rows = [];
  rows.push({ y: baseY, x: 40, w: 880, h: 16, semisolid:false });
  const p1 = { y: 380 + (rng() < 0.5 ? 0 : -20), x: 80 + (rng()*100|0), w: 300 + (rng()*120|0), h:12, semisolid:true };
  rows.push(p1);
  if (rng() < 0.7) {
    const p2 = { y: 280 + (rng() < 0.5 ? 0 : 20), x: 520 + (rng()*120|0), w: 280 + (rng()*120|0), h:12, semisolid:true };
    rows.push(p2);
  }
  if (rng() < 0.6) {
    rows.push({ y: 140, x: 680 + (rng()*140|0), w: 120, h:10, semisolid:true, featherLedge:true });
  }
  return rows;
}

function isBoardFloor(n){ return !!BOARD_FLOORS[n]; }

function specialOverridesFor(floor, rng) {
  const o = {};
  if (floor === SPECIAL_FLOOR.SERVER) {
    o.special = { kind:'serverStealth', servers:2, extraSpotlights:true, desksHide:true };
    o.hazards = ['sparks','steam'];
    o.events  = [{...EVENTS.blackout}];
  }
  if (floor === SPECIAL_FLOOR.NINJA) {
    o.special = { kind:'ninjaRound', meleeOnly:true, ninjaDoubleJump:true };
    o.spawns = { guards:{ normal:0.0, ranged:0.0, elite:0.0, miniboss:0.0, ninja:1.0 }, workers:{min:0,max:2} };
  }
  if (floor === SPECIAL_FLOOR.ECO) {
    o.special = { kind:'ecoBoss', hostages:true, chairs: Math.min(6, (globalThis?.hostageState?.taken?.length||0)) || 3 };
    o.hazards = ['steam','cables','sparks'];
    o.events  = [{...EVENTS.surge}];
    o.loot    = { cashMult:1.1, intelChance:0.25, fileChance:0.2 };
  }
  if (floor === SPECIAL_FLOOR.CEO) {
    o.special = { kind:'ceo', arena:'penthouse' };
    o.hazards = [];
    o.events  = [];
    o.loot    = { featherOnFloor:false };
    o.platforms = [
      { y: 520, x: 60,  w: 840, h:18, semisolid:false },
      { y: 340, x: 140, w: 280, h:12, semisolid:true },
      { y: 340, x: 580, w: 280, h:12, semisolid:true }
    ];
  }
  if (isBoardFloor(floor)) {
    o.special = { kind:'boardBoss', label: BOARD_FLOORS[floor].label, card: BOARD_FLOORS[floor].card };
    o.platforms = [
      { y: 520, x: 60,  w: 840, h:18, semisolid:false },
      { y: 420, x: 140, w: 240, h:12, semisolid:true, desk:true },
      { y: 420, x: 560, w: 240, h:12, semisolid:true, desk:true }
    ];
    o.hazards = [];
    o.events  = [];
    o.loot    = { cashMult:1.0, intelChance:0.30, fileChance:0.25 };
    o.spawns  = { guards:{ normal:0.0, ranged:0.0, elite:0.0, miniboss:0.0 }, workers:{min:0,max:0} };
  }
  return o;
}

export function getFloorDef(floor, runSeed=1337) {
  const rng = mkRNG((runSeed|0) + floor*1337);
  const theme = themeForFloor(floor);
  const hue = theme.baseHue + ((floor % 4) * 12);
  const colors = {
    bg:   hsl(hue, 35, 10),
    mid:  hsl(hue + choice(rng, theme.accents), 45, 25),
    fg:   hsl(hue + choice(rng, theme.accents), 55, 65),
    ui:   hsl(hue + 180, 40, 60)
  };

  const spawns = cloneSpawnsDefaults();
  const loot   = cloneLootDefaults();
  const hazards = [];
  const events  = [];

  if (floor >= 5 && floor <= 8) hazards.push('steam');
  if (floor >= 9 && floor <= 12) hazards.push('cables');
  if (floor >= 13 && floor <= 16) hazards.push('sparks');
  if (floor >= 17 && floor <= 20) hazards.push('falling');
  if (floor >= 25 && floor <= 28) hazards.push('carts');

  if (rng() < 0.10) events.push(EVENTS.evacuation);
  if (rng() < 0.06) events.push(EVENTS.blackout);
  if (rng() < 0.06) events.push(EVENTS.manager);
  if (rng() < 0.04) events.push(EVENTS.bonus);

  let platforms = platformsFor(theme, floor, rng);

  const o = specialOverridesFor(floor, rng);
  if (o.platforms) platforms = o.platforms;
  if (o.hazards)   o.hazards.forEach(h=>hazards.push(h));
  if (o.events)    o.events.forEach(e=>events.push(e));
  if (o.spawns)    Object.assign(spawns, o.spawns);
  if (o.loot)      Object.assign(loot, o.loot);

  const isBossish = isBoardFloor(floor) || floor === SPECIAL_FLOOR.CEO || floor === SPECIAL_FLOOR.NINJA;
  const workers = isBossish ? {min:0,max:0} : spawns.workers;

  const spotlightCount =
    (floor === SPECIAL_FLOOR.SERVER ? 6 :
     isBoardFloor(floor)             ? 4 :
     floor >= 29                     ? 4 : 2 + ((floor/8)|0));

  const music = musicLayersForFloor(floor);

  const label = isBoardFloor(floor)
    ? `LEVEL ${floor} – ${BOARD_FLOORS[floor].label}`
    : (floor === SPECIAL_FLOOR.CEO
      ? `LEVEL 36 – CEO PENTHOUSE`
      : `LEVEL ${floor}`);

  const startSpawnRule = (floor === 1) ? { spawnRightOnly:true, initialGuards:10 } : null;

  return {
    floor,
    label,
    theme: theme.name,
    colors,
    lighting: lightingPreset(theme),
    musicLayers: music,
    platforms,
    hazards: hazards.map(k => HAZARDS[k]),
    events,
    spawns,
    workers,
    loot,
    special: o.special || null,
    spotlights: spotlightCount,
    rules: {
      neverSpawnLeftOfPlayer: DEFAULT_SPAWNS.neverSpawnLeftOfPlayer,
      spawnSpreadMin: DEFAULT_SPAWNS.spawnSpreadMin,
      guardCap: spawns.guardCap(floor),
      startSpawnRule
    }
  };
}

if (typeof window !== 'undefined') {
  window.getFloorDef = getFloorDef;
}
