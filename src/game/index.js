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
    checkingHudMax: 200,
    savingsHudMax: 2000,
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
const LEVEL_WIDTH = 3 * W;
const GUARD_SAFE_DISTANCE = LEVEL_WIDTH * 0.25;
const GUARD_SEPARATION = 160;
const GUARD_SPAWN_MARGIN = 80;
const PLAYER_BULLET_DAMAGE = GAME_PARAMS.player.damages.bullet;
const PLAYER_FLAME_DAMAGE = GAME_PARAMS.player.damages.flame;
const PLAYER_MELEE_DAMAGE = GAME_PARAMS.player.damages.melee;
const STOMP_DAMAGE = GAME_PARAMS.player.damages.stomp;
const initialSpawnX = GAME_PARAMS.player.spawnX;
const RUN_LOAN_START = GAME_PARAMS.economy.startingLoanBalance;
const GUARD_BASE_DAMAGE = GAME_PARAMS.enemies.guardBaseDamage;
const CHECKING_HUD_MAX = Math.max(1, GAME_PARAMS.player.checkingHudMax);
const SAVINGS_HUD_MAX = Math.max(1, GAME_PARAMS.player.savingsHudMax);

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

function computePaletteForFloor(floor){
  const hueShift = ((floor-1) * PALETTE_HUE_STEP) % 360;
  const shift = hex => shiftHue(hex, hueShift);
  return {
    hueShift,
    background: shift(BASE_ENV_COLORS.background),
    wall: shift(BASE_ENV_COLORS.wall),
    platform: shift(BASE_ENV_COLORS.platform),
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

// ===== Board & CEO Codex =====
const PROFILE_DECK = [
  {
    floor: 4,  card:'Ace of Spades',  name:'Marla Quill',  title:'The Auditor',
    bio:'The tower’s numbers whisper her name; she can balance any debt ledger blindfolded. Beneath the calm veneer lies a black-suit reaper of accounts.',
    power:'Ledger Shield – Reflects bullets for 2 s / 6 s cooldown.',
    specials:['Tax Sweep (coin fan – $5 drain)','Overdraft Pop (grenade detonation)'],
    hp:60, portrait:'portraits/ace_spades.png',
    debtEffects:[
      { id:'HI',  radius:420, desc:'High Interest – The compounding monster. Your balance drains $1 per second; when you’re broke it starts eating your health instead.' },
      { id:'CAP', radius:420, desc:'Interest Capitalization – Interest grows the longer you linger. Each few seconds in range increases how fast High Interest drains your money.' },
      { id:'MIN', radius:360, desc:'Minimum Payment – You can only afford the bare minimum—fire rate slowed 20%.' }
    ]
  },
  {
    floor: 8,  card:'King of Clubs',  name:'Gideon Pike', title:'The Enforcer',
    bio:'A muscle in a suit. He treats risk like a contact sport.',
    power:'Credit Snare – Slow 40%.',
    specials:['Charge-Off Volley (3×10 dmg)','Margin Call (knockback)'],
    hp:70, portrait:'portraits/king_clubs.png',
    debtEffects:[
      { id:'WG', radius:380, desc:'Wage Garnish – Every hit costs an extra $5 from your account.' },
      { id:'RS', radius:320, desc:'Repayment Shock – A wave pulses from the floor, dealing 10 damage and sliding you.' }
    ]
  },
  {
    floor:12,  card:'Queen of Diamonds', name:'Selene Hart', title:'The Litigator',
    bio:'Glamorous and deadly, she signs settlements in blood-red ink. Her diamonds sparkle like legal daggers.',
    power:'Injunction Beam – 0.9 s stun (cancels Feather).',
    specials:['Discovery Drones (8 dmg)'],
    hp:80, portrait:'portraits/queen_diamonds.png',
    debtEffects:[
      { id:'HOLD', radius:360, desc:'Loan Servicer Hold – “Your call is very important to us…” Inputs stutter randomly for a moment.' },
      { id:'FP',   radius:340, desc:'Fine Print – Legalese catches you—grenade and saber specials disabled while in range.' }
    ]
  },
  {
    floor:16,  card:'Jack of Hearts', name:'Orson Vale', title:'The Engineer',
    bio:'Blue-collar romantic of corporate machinery. Fixes everything but his own conscience.',
    power:'Vacuum Dash – Invuln dash + suction wake.',
    specials:['Tool Rain (10 dmg)','Conveyor Shift (reversed friction)'],
    hp:90, portrait:'portraits/jack_hearts.png',
    debtEffects:[
      { id:'RS',  radius:320, desc:'Repayment Shock – A wave pulses from the floor, dealing 10 damage and sliding you.' },
      { id:'MIN', radius:360, desc:'Minimum Payment – Fire rate reduced by 20% while in range.' }
    ]
  },
  {
    floor:20,  card:'Ten of Spades', name:'Dara Flint', title:'The Marketer',
    bio:'Sells despair as self-care; debt as destiny. Every campaign ends with a signature and a smile.',
    power:'Hype Mirage – 2 clones.',
    specials:['Viral Spray (8×10 dmg)','Rebrand Flash (hue hide)'],
    hp:100, portrait:'portraits/ten_spades.png',
    debtEffects:[
      { id:'REPR', radius:380, desc:'Reprice – Random penalties like Minimum Payment or Wage Garnish flicker on for short bursts.' },
      { id:'DP',   radius:360, desc:'Delinquency Ping – Floating debt notices home in; contact drains $3 (or 1 HP if broke).' }
    ]
  },
  {
    floor:24,  card:'Nine of Clubs', name:'Ilya Crown', title:'The Coder',
    bio:'Wrote the algorithm that predicts failure before it happens. Now she’s debugging the world.',
    power:'Firewall Dome – Halves incoming bullet speed.',
    specials:['Packet Lance (15 dmg)','Patch Cycle (heal 5 hp/5 s)'],
    hp:110, portrait:'portraits/nine_clubs.png',
    debtEffects:[
      { id:'HI',    radius:400, desc:'High Interest – Your balance drains $1 per second; when broke it drains health instead.' },
      { id:'CLAMP', radius:360, desc:'Credit Clamp – Critical hits halved and weapon spread widened by 10%.' }
    ]
  },
  {
    floor:28,  card:'Eight of Diamonds', name:'Rhea Stone', title:'The HR Gardener',
    bio:'Cuts personnel like topiary; calls it “creative pruning.”',
    power:'Severance Wave – Ground shock 10 dmg.',
    specials:['Exit Interview (tether 1 s)','Paperstorm (20×5 dmg)'],
    hp:115, portrait:'portraits/eight_diamonds.png',
    debtEffects:[
      { id:'COLL', radius:420, desc:'Collections Call – Spotlights detect you twice as fast; on full alert, more guards spawn and the elevator relocks briefly.' },
      { id:'HOLD', radius:360, desc:'Loan Servicer Hold – Inputs stutter briefly at intervals.' }
    ]
  },
  {
    floor:32,  card:'Seven of Hearts', name:'Victor Kade', title:'The Strategist',
    bio:'Loves games with other people’s lives as chips. Plays every floor like poker night.',
    power:'Arb Slide – Rail dash + rapid fire.',
    specials:['Hedge Ring (orbit bullets)','Golden Parachute (heal 20 once @ 50% HP)'],
    hp:120, portrait:'portraits/seven_hearts.png',
    debtEffects:[
      { id:'WG',  radius:380, desc:'Wage Garnish – Each hit takes an extra $5.' },
      { id:'MIN', radius:360, desc:'Minimum Payment – Fire rate −20% while nearby.' },
      { id:'REPR',radius:380, desc:'Reprice – Randomly imposes Minimum Payment or Wage Garnish for short durations.' }
    ]
  }
];

const CEO_PROFILE = {
  floor:36, card:'Ace of Aces', name:'Helena Voss', title:'The CEO',
  bio:'The architect of the tower; believes gravity should accrue interest.',
  power:'Capital Storm – Cluster fire: inner 10 dmg / outer 20 dmg.',
  specials:['Buyback Shield (absorb 30 → 10×10 blast)','Hostile Takeover (3 board powers for 8 s)','Final Phase (ninja summons, faster patterns)'],
  hp:220, portrait:'portraits/ace_aces.png',
  debtEffects:[
    { id:'HI',   radius:480, desc:'High Interest – Drains $1 per second; if broke, drains health instead.' },
    { id:'CAP',  radius:480, desc:'Interest Capitalization – Staying close ramps the High Interest drain faster over time.' },
    { id:'COLL', radius:460, desc:'Collections Call – Detection accelerates, extra guards spawn, and the elevator relocks briefly.' },
    { id:'WG',   radius:420, desc:'Wage Garnish – Every hit costs an extra $5.' }
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

const EFFECTS = {
  NJ:   { name:'Night Job',            color:'#5F66FF', icon:'NJ', kind:'pulse',   tick_ms:6000, params:{sleep_ms:1000} },
  SJ:   { name:'Second Job',           color:'#8A9FBF', icon:'SJ', kind:'continuous', params:{move_mult:0.75, jump_mult:0.80} },
  HI:   { name:'High Interest',        color:'#B455FF', icon:'HI', kind:'drain',   tick_ms:250,  params:{dollars_per_sec:1.0} },
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
  4:  [{id:'HI',radius:420},{id:'CAP',radius:420},{id:'MIN',radius:360}],
  8:  [{id:'WG',radius:380},{id:'RS',radius:320}],
  12: [{id:'HOLD',radius:360},{id:'FP',radius:340}],
  16: [{id:'RS',radius:320},{id:'MIN',radius:360}],
  20: [{id:'REPR',radius:380},{id:'DP',radius:360}],
  24: [{id:'HI',radius:400},{id:'CLAMP',radius:360}],
  28: [{id:'COLL',radius:420},{id:'HOLD',radius:360}],
  32: [{id:'WG',radius:380},{id:'MIN',radius:360},{id:'REPR',radius:380}],
  36: [{id:'HI',radius:480},{id:'CAP',radius:480},{id:'COLL',radius:460},{id:'WG',radius:420}]
};

// ===== Input fixes =====
const block = new Set([' ', 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','PageUp','PageDown']);
window.addEventListener('keydown',(e)=>{ if(block.has(e.key) || block.has(e.code)) e.preventDefault(); },{passive:false});
const canvas=document.getElementById('game'); const ctx=canvas.getContext('2d'); canvas.focus();
window.addEventListener('click', ()=>{ canvas.focus(); getAC(); });

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

// Camera
let camX=0, seenDoor=false;

// Player
const player = {
  x:initialSpawnX, y: 0, w:GAME_PARAMS.player.width, h:GAME_PARAMS.player.height,
  vx:0, vy:0, onGround:false, facing:1, crouch:false, crouchOffset:0,
  sprint:false, climbing:false, inVent:false, hidden:false, spotted:false,
  checking:GAME_PARAMS.player.checkingStart, savings:GAME_PARAMS.player.savingsStart,
  hasScrew:false, hasCharges:true,
  hasFeather:false, featherEnergy:0, featherMax:100, featherRecharge:12, lastFlap:10, flapCooldown:120,
  files:0, intel:0, specialFiles:0,
  codexUnlocked:false,
  weapon:'pistol',
  pistol:{ammo:GAME_PARAMS.player.pistol.magazine, reserve:GAME_PARAMS.player.pistol.reserve, cooldown:GAME_PARAMS.player.pistol.cooldownMs, last:0, muzzleUntil:0},
  flame:{fuel:GAME_PARAMS.player.flame.fuel, cooldown:GAME_PARAMS.player.flame.cooldownMs, last:0}, // "ammo" for flamethrower
  melee:{cooldown:GAME_PARAMS.player.meleeCooldownMs, last:0},
  hurtUntil:0,
  speedBoostUntil:0,
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
  dropThroughFloor: null
};

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
let walls=[], floorSlab=null, windowsArr=[], ladders=[], vents=[], servers=[], panels=[], cameras=[], guards=[], desks=[], plants=[], waterCoolers=[], spotlights=[], door=null, pickups=[], movingPlatforms=[], workers=[];
let coffeeMachines=[], vendingMachines=[], printers=[], serverTerminals=[], deskDrawers=[], hazards=[], stealthZones=[], backgroundFX=[], floatingPapers=[], billboardScreens=[], boardTables=[], merchants=[], sprinklers=[];
let destroyedOnFloor=0, totalServersOnFloor=0;
let alarm=false, alarmUntil=0;
let inSub=false; // vent sub-level
let sub = null;
let entryVentWorld = null;
let lightingCondition='normal', lightingPulse=0, lightingPhase=0;
let floorTheme=null, boardRoomActive=false, ninjaRound=false, serverObjective=false, inflationActive=false, bonusFloorActive=false;
let evacuationActive=false, evacuationUntil=0, powerSurgeUntil=0, sprinklersActiveUntil=0;
let spotlightDetection=0, elevatorLockedUntil=0;
let interestDrainTimer=0;
let scheduledBonusFloor=null;
let blackMarketOffer=null;
let activeHack=null;
let ambientInterval=null, ambientCurrent=null;
let managerCheckFloor=null, managerDefeated=false;
let minimapUnlocked=false, minimapVisible=false;
let floorBannerTimeout=null;

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
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const cashVal = document.getElementById('cashVal');
const weaponNameEl = document.getElementById('weaponName');
const weaponAmmoEl = document.getElementById('weaponAmmo');
const featherTimerEl = document.getElementById('featherTimer');
const floorLabelEl = document.getElementById('floorLabel');
const miniBossEl = document.getElementById('miniBossCount');
const mapBtn = document.getElementById('mapBtn');
const minimapOverlay = document.getElementById('minimapOverlay');
const minimapTower = document.getElementById('minimapTower');
const floorBannerEl = document.getElementById('floorBanner');
const floorBannerText = document.getElementById('floorBannerText');
const minimapCells = [];

// Buttons
const btnTest=document.getElementById('btnTest');
const btnNormal=document.getElementById('btnNormal');
const btnP=document.getElementById('btnPistol');
const btnF=document.getElementById('btnFlame');
const btnM=document.getElementById('btnMelee');

function setMode(m){
  testMode = (m==='test');
  btnTest.classList.toggle('active', testMode);
  btnNormal.classList.toggle('active', !testMode);
  notify(testMode? "TEST mode: revive on death." : "NORMAL mode: restart on death.");
}
btnTest.onclick=()=>setMode('test');
btnNormal.onclick=()=>setMode('normal');
function setWeapon(w){
  if(ninjaRound && w!=='melee'){
    centerNote('Investor ninjas demand melee only.', 1400);
    notify('Melee-only round active.');
    return;
  }
  player.weapon=w;
  btnP.classList.toggle('active', w==='pistol');
  btnF.classList.toggle('active', w==='flame');
  btnM.classList.toggle('active', w==='melee');
  beep({freq: w==='pistol'?600:w==='flame'?500:440,dur:0.06});
}
btnP.onclick=()=>setWeapon('pistol');
btnF.onclick=()=>setWeapon('flame');
btnM.onclick=()=>setWeapon('melee');

const boardFloorOrder = [...BOARD_FLOORS].sort((a,b)=>a-b);

function boardRoomLetter(floor){
  const idx = boardFloorOrder.indexOf(floor);
  return idx >= 0 ? String.fromCharCode('A'.charCodeAt(0) + idx) : '';
}

function formatFloorLabel(floor){
  if(!Number.isFinite(floor)) return 'LEVEL —';
  if(isBoardFloor(floor)){
    const letter = boardRoomLetter(floor);
    return `LEVEL ${floor} – BOARD ROOM ${letter || ''}`.trim();
  }
  return `LEVEL ${floor}`;
}

function formatFloorSecondaryLabel(floor){
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

if(mapBtn){
  mapBtn.addEventListener('click', ()=>{
    if(minimapVisible){ toggleMinimap(false); return; }
    if(!minimapUnlocked){
      centerNote('Clear a vent to access the map.', 1400);
      lockedBuzz();
      return;
    }
    toggleMinimap(true);
  });
}

if(minimapOverlay){
  minimapOverlay.addEventListener('click', (event)=>{
    if(event.target === minimapOverlay){ toggleMinimap(false); }
  });
  const inner = minimapOverlay.querySelector('.minimap');
  if(inner){ inner.addEventListener('click', (event)=>event.stopPropagation()); }
}

if(minimapTower){
  minimapTower.addEventListener('click', (event)=>{
    const cell = event.target.closest('.minimap-cell');
    if(!cell) return;
    const floor = Number(cell.dataset.floor);
    if(!Number.isFinite(floor)) return;
    centerNote(formatFloorLabel(floor), 1100);
  });
}

updateMapButtonState();
toggleMinimap(false);
hideFloorBanner();

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
function centerNote(text,ms=1600){ const m=document.getElementById('msg'); m.textContent=text; m.style.display='block'; setTimeout(()=>m.style.display='none',ms); }
function notify(text){ noteEl.textContent = text; }

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

function updateMapButtonState(){
  if(!mapBtn) return;
  mapBtn.classList.toggle('locked', !minimapUnlocked);
  mapBtn.disabled = !minimapUnlocked;
  if(!minimapUnlocked){ mapBtn.classList.remove('active'); }
}

function updateMinimapHighlight(){
  if(minimapCells.length===0) return;
  for(const cell of minimapCells){
    const floor = Number(cell.dataset.floor);
    cell.classList.toggle('active', floor === currentFloor);
  }
}

function toggleMinimap(force){
  if(!minimapOverlay) return;
  const target = force !== undefined ? force : !minimapVisible;
  if(target && !minimapUnlocked){
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
  player.checking=GAME_PARAMS.player.checkingStart;
  player.savings=GAME_PARAMS.player.savingsStart;
  player.hasScrew=false; player.hasCharges=true;
  player.hasFeather=false; player.featherEnergy=0; player.featherMax=100; player.featherRecharge=12; player.lastFlap=0; player.flapCooldown=120;
  player.files=0; player.intel=0; player.specialFiles=0; player.codexUnlocked=false; player.weapon='pistol';
  player.pistol.ammo=GAME_PARAMS.player.pistol.magazine;
  player.pistol.reserve=GAME_PARAMS.player.pistol.reserve;
  player.pistol.cooldown=GAME_PARAMS.player.pistol.cooldownMs;
  player.pistol.last=0; player.pistol.muzzleUntil=0;
  player.flame.fuel=GAME_PARAMS.player.flame.fuel;
  player.flame.cooldown=GAME_PARAMS.player.flame.cooldownMs;
  player.flame.last=0;
  player.melee.cooldown=GAME_PARAMS.player.meleeCooldownMs;
  player.melee.last=0;
  player.hurtUntil=0;
  player.speedBoostUntil=0;
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
  updateSpecialFileUI();
}

function ensureLoop(){ if(!loopStarted){ loopStarted=true; requestAnimationFrame(loop); } }

function startNewRun(name){
  if(runActive) return;
  currentPlayerName = name || 'Player';
  currentFloor = 1;
  runStats = makeRunStats();
  runStats.start = performance.now();
  runStats.kills = 0; runStats.deaths = 0; runStats.refinances = 0;
  runActive = true;
  pause = false;
  startClock = performance.now();
  last = performance.now();
  attackHeld = false;
  camX = 0; seenDoor=false;
  scheduledBonusFloor = BONUS_FLOOR_MIN + Math.floor(Math.random()*(BONUS_FLOOR_MAX-BONUS_FLOOR_MIN+1));
  scheduleManagerFloor();
  resetPlayerState();
  bullets.length = 0;
  setMode(testMode? 'test' : 'normal');
  setWeapon('pistol');
  toggleCodex(false);
  minimapUnlocked=false;
  minimapVisible=false;
  updateMapButtonState();
  toggleMinimap(false);
  makeLevel(currentFloor);
  player.y = floorSlab.y - player.h;
  player.prevBottom = player.y + player.h;
  player.prevVy = 0;
  notify("Evening infiltration. New intel & loot on each floor.");
  centerNote("Infiltration begins.", 1600);
  showFloorBanner(currentFloor);
  if(floorLabelEl) floorLabelEl.textContent = formatFloorLabel(currentFloor);
  if(timeEl) timeEl.textContent= `${fmtClock(TOTAL_TIME_MS)} ➜ ${fmtClock(0)}`;
  updateMinimapHighlight();
  ensureLoop();
  canvas.focus();
}

function finishRun(outcome, { message=null, note=null }={}){
  if(!runActive) return;
  toggleCodex(false);
  toggleMinimap(false);
  hideFloorBanner();
  runActive=false;
  pause=true;
  setAmbient(null);
  if(outcome==='death') runStats.deaths = (runStats.deaths||0) + 1;
  const endTime = performance.now();
  const elapsed = runStats.start ? Math.max(0, endTime - runStats.start) : 0;
  const loanRemaining = Math.round(RUN_LOAN_START - player.score * 25);
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
    notify("Checking drained. Run failed.");
    finishRun('death', { message:"You ran out of Checking." });
  }
}
function damage(){
  const t=now();
  player.checking = Math.max(0, player.checking - GUARD_BASE_DAMAGE);
  player.hurtUntil = t+120;
  if(player.checking===0){ handleDeath(); }
}
function addChecking(n){ player.checking = clamp(player.checking+n,0,9999); }
function addAmmo(n){ player.pistol.reserve = clamp(player.pistol.reserve+n, 0, 999); }
function addFuel(n){ player.flame.fuel = clamp(player.flame.fuel+n, 0, 200); }
function grantWeaponUpgrade(){
  player.weaponUpgrades = (player.weaponUpgrades||0) + 1;
  player.pistol.cooldown = Math.max(70, Math.round(player.pistol.cooldown * 0.92));
  player.flame.cooldown = Math.max(40, Math.round(player.flame.cooldown * 0.94));
  player.melee.cooldown = Math.max(80, Math.round(player.melee.cooldown * 0.9));
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
  }
  return true;
}

// Input
const keys={};
let attackHeld=false;
window.addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  if(activeHack){
    e.preventDefault();
    handleHackInput(k);
    return;
  }
  if(k==='0'){
    if(!runActive){ return; }
    e.preventDefault();
    if(minimapVisible){ toggleMinimap(false); }
    else if(minimapUnlocked){ toggleMinimap(true); }
    else { centerNote('Clear a vent to access the map.', 1400); lockedBuzz(); }
    return;
  }
  if(k==='escape' && minimapVisible){
    e.preventDefault();
    toggleMinimap(false);
    return;
  }
  keys[k]=true;
  if(k==='r'){ // reload pistol
    if(player.weapon==='pistol'){
      const need = 9 - player.pistol.ammo;
      const take = Math.min(need, player.pistol.reserve);
      if(take>0){ player.pistol.ammo += take; player.pistol.reserve -= take; }
    }
  }
  if(k==='1') setWeapon('pistol');
  if(k==='2') setWeapon('flame');
  if(k==='3') setWeapon('melee');
  if(k==='e'){ attackHeld=true; attack(); }
  if(k===' '){ interact(); }
},{passive:false});
window.addEventListener('keyup', e=>{
  const k=e.key.toLowerCase();
  keys[k] = false;
  if(k==='e'){ attackHeld=false; }
}, {passive:false});

// mouse
window.addEventListener('mousedown', ()=>{ attackHeld=true; attack(); });
window.addEventListener('mouseup', ()=>{ attackHeld=false; });
window.addEventListener('blur', ()=>{ attackHeld=false; });

// ==== Level generation ====
function guardArchetypeForFloor(i){
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
  const hp = Math.round(baseHp * hpMultiplier);
  const speed = Math.max(0.35, baseSpeed * speedMultiplier);
  const guard = new Agent({
    x,
    y,
    w:20,
    h:42,
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
  for(let attempt=0; attempt<80; attempt++){
    const spawnX = margin + Math.random() * (LEVEL_WIDTH - 2 * margin);
    if(Math.abs(spawnX - player.x) < GUARD_SAFE_DISTANCE) continue;
    if(Math.abs(spawnX - initialSpawnX) < GUARD_SAFE_DISTANCE) continue;
    if(door && Math.abs((spawnX + 10) - (door.x + door.w/2)) < avoidDoorRadius) continue;
    if(existing.some(pos => Math.abs(pos - spawnX) < GUARD_SEPARATION)) continue;
    return spawnX;
  }
  return player.x < LEVEL_WIDTH / 2 ? LEVEL_WIDTH - margin : margin;
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

function makeLevel(i){
  walls=[]; windowsArr=[]; ladders=[]; vents=[]; servers=[]; panels=[]; cameras=[]; guards=[];
  workers=[]; coffeeMachines=[]; vendingMachines=[]; printers=[]; serverTerminals=[];
  deskDrawers=[]; hazards=[]; stealthZones=[]; backgroundFX=[]; floatingPapers=[];
  billboardScreens=[]; boardTables=[]; merchants=[]; sprinklers=[];
  door=null; alarm=false; alarmUntil=0; destroyedOnFloor=0; totalServersOnFloor=0;
  inSub=false; sub=null; entryVentWorld=null; smokeActive=false; seenDoor=false;
  player.screenFlashUntil = Math.min(player.screenFlashUntil, now());
  player.lawsuitSlowUntil = 0;
  setAmbientForFloor(i);
  sprinklersActiveUntil = 0;

  floorTheme = getFloorTheme(i);
  boardRoomActive = isBoardFloor(i);
  ninjaRound = (i===21);
  serverObjective = isServerFloor(i);
  inflationActive = isInflationFloor(i);
  bonusFloorActive = !!(scheduledBonusFloor && scheduledBonusFloor===i && !boardRoomActive && i < FLOORS);
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

  walls.push({x:0,y:0,w:3*W,h:H});
  const windowRows = boardRoomActive ? 2 : 3;
  const cols=18;
  const spacingX=(3*W-200)/cols;
  const startX=80;
  for(let r=0;r<windowRows;r++){
    for(let c=0;c<cols;c++){
      const wx=startX+c*spacingX, wy=60+r*48;
      windowsArr.push({x:wx,y:wy,w:36,h:24});
    }
  }

  floorSlab={x:0,y:yBase,w:3*W,h:16};

  if(boardRoomActive){
    makeBoardRoomLevel(i, yBase);
    totalServersOnFloor = servers.length;
    camX = clamp(player.x - W*0.45, 0, 3*W - W);
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
        const wx = 0.2*W + s*((3*W-0.4*W)/(segments+1));
        walls.push({x:wx, y:ly, w:segW, h:10, isPlatform:true});
        if(Math.random()<0.35){
          movingPlatforms.push({x:wx+segW+30, y:ly-32, w:90, h:10, vx:(Math.random()<0.5?-1:1)*1.05, range:130, cx:0});
        }
      }
    }
  }

  if(Math.random()<0.45 && !bonusFloorActive){
    const featherY = yBase - 320;
    walls.push({x:1.5*W-70, y:featherY, w:140, h:10, isPlatform:true, featherOnly:true});
    if(Math.random()<0.6){
      pickups.push({type:'feather', x:1.5*W-20, y:featherY-24, w:20, h:20});
    } else {
      pickups.push({type:'intel', x:1.5*W-20, y:featherY-24, w:20, h:20});
    }
  }

  const deskCount = 6 + Math.floor(i/4) + (floorTheme && floorTheme.guard && floorTheme.guard.countMod ? Math.max(0, Math.round(-floorTheme.guard.countMod)) : 0);
  for(let d=0; d<deskCount; d++){
    const x=120 + d* ( (3*W-240)/Math.max(1, deskCount) );
    const w=70,h=38; const y=yBase - h;
    desks.push({x,y,w,h});
    deskDrawers.push({x:x+10,y:y+6,w:14,h:12, used:false});
    stealthZones.push({x,y,w,h});
  }

  const plantCount = 3 + Math.floor(Math.random()*4);
  for(let p=0;p<plantCount;p++){
    const x=200 + p* ( (3*W-400)/Math.max(1,plantCount-1) );
    const y=yBase-30;
    plants.push({x,y,w:24,h:30});
  }

  waterCoolers.push({x: 1.2*W, y: yBase-60, w:28,h:60});

  coffeeMachines.push({x:0.25*W, y:yBase-60, w:32, h:58, used:false});
  vendingMachines.push({x:2.45*W, y:yBase-70, w:36, h:68, broken:false});
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
    if(!bonusFloorActive && Math.random()<0.12) ptypePool.push('feather');
    const type = ptypePool[Math.floor(Math.random()*ptypePool.length)];
    const onPlatform = layerYs.length>0 && Math.random()<0.6;
    const platformY = layerYs.length>0 ? layerYs[Math.floor(Math.random()*layerYs.length)] : yBase;
    const y = onPlatform ? (platformY - 22) : (yBase - 24);
    const x = 120 + Math.random()*(3*W-240);
    let amount = undefined;
    if(type==='cash'){
      const base = bonusFloorActive ? (40 + Math.random()*80) : (10 + Math.random()*20);
      amount = Math.max(5, Math.round(base * (player.cashMultiplier||1)));
    }
    if(type==='ammo'){ amount = bonusFloorActive ? 24 : 18; }
    pickups.push({type, x, y, w:18, h:18, amount});
  }
  if(i%2===1 && !player.hasScrew){ pickups.push({type:'screw', x: 0.35*W, y: yBase-24, w:18, h:18}); }

  const serverPool=[];
  if(!bonusFloorActive){
    const serverBaseCount = serverObjective ? 5 : 3;
    const scount = serverBaseCount + (layerYs.length>1 ? 1 : 0);
    for(let s=0;s<scount;s++){
      const layerIndex = layerYs.length>0 ? (s % layerYs.length) : -1;
      const sy = layerIndex>=0 ? layerYs[layerIndex]-26 : (yBase-36);
      const sx = 160 + Math.random()*(3*W-320);
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
    for(let p=0;p<12;p++){ floatingPapers.push({x:Math.random()*3*W, y:40+Math.random()*200, sway:Math.random()*Math.PI*2}); }
  }
  if(themeVisuals.billboards){
    billboardScreens.push({x:0.5*W, y:90, w:220, h:60});
    billboardScreens.push({x:2.1*W, y:160, w:220, h:60});
  }
  if(themeVisuals.tickers){
    backgroundFX.push({type:'ticker', y:46});
  }
  if(themeVisuals.sparks){
    hazards.push({type:'spark', x:Math.random()*3*W, y:yBase-60, w:36, h:20, t:0});
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

  door = { x: 3*W-160, y: yBase-120, w:120, h:120, unlocked: bonusFloorActive || totalServersOnFloor===0, open:false, lift:0, glowUntil:0 };

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
  workerZones.push({min: 80, max: 3*W - 198, y: yBase - 38});
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

  camX = clamp(player.x - W*0.45, 0, 3*W - W);
}

function makeBoardRoomLevel(floor, yBase){
  const tableTop = yBase - 150;
  floorSlab.x = 0;
  floorSlab.y = tableTop;
  floorSlab.w = 3*W;
  floorSlab.h = 22;

  backgroundFX.length = 0;
  backgroundFX.push({type:'boardCharts'});

  const tableX = 0.2*W;
  const tableWidth = 3*W - 0.4*W;
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
  deskDrawers.push({x: tableX + tableWidth/2 - 24, y: tableTop - 32, w:48, h:18, used:false});

  coffeeMachines.push({x: tableX + 48, y: tableTop - 58, w:32, h:58, used:false});
  vendingMachines.push({x: tableX + tableWidth - 84, y: tableTop - 68, w:36, h:68, broken:false});

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
  const span = 3*W - 160;
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
  const p={x:player.x, y:player.y, w:player.w, h:player.h};

  if(!inSub){
    // Pickups
    for(const it of pickups){
      if(it.type && rect(p,it)){
        if(it.type==='screw'){ player.hasScrew=true; it.type=null; centerNote("Picked up screwdriver."); chime(); notify("Screwdriver acquired."); }
        if(it.type==='ammo'){ addAmmo(it.amount||18); it.type=null; centerNote("Ammo +"+(it.amount||18)); beep({freq:520}); notify("Ammo restocked."); }
        if(it.type==='cash'){ addChecking(it.amount||15); it.type=null; centerNote("Checking +$"+(it.amount||15)); beep({freq:600}); notify("Found cash."); }
        if(it.type==='file'){ player.files++; it.type=null; centerNote("Collected file."); beep({freq:700}); notify("File collected."); }
        if(it.type==='intel'){ player.intel++; it.type=null; centerNote("Collected intel."); beep({freq:820}); notify("Intel collected."); }
        if(it.type==='feather'){ player.hasFeather=true; player.featherEnergy=player.featherMax; it.type=null; centerNote("Feather acquired — air flaps!"); chime(); notify("Feather lets you flap midair."); }
        if(it.type==='special'){
          player.specialFiles = (player.specialFiles||0) + 1;
          it.type=null;
          centerNote('Special File secured.');
          chime();
          notify('Violet dossier recovered.');
          updateSpecialFileUI();
        }
      }
    }
    // Coffee machines
    for(const machine of coffeeMachines){
      if(machine && !machine.used && rect(p,{x:machine.x-8,y:machine.y-8,w:machine.w+16,h:machine.h+16})){
        machine.used=true;
        player.speedBoostUntil = Math.max(player.speedBoostUntil, now()+20000);
        centerNote('Energy Boost +10% speed', 1600);
        notify('Coffee buzz active.');
        beep({freq:740});
      }
    }
    // Vending machines
    for(const vend of vendingMachines){
      if(vend && !vend.broken && rect(p,{x:vend.x-10,y:vend.y-10,w:vend.w+20,h:vend.h+20})){
        vend.broken=true;
        const roll = Math.random();
        if(roll<0.45){
          addAmmo(24);
          centerNote('Ammo drop +24', 1200);
          notify('Vending machine spilled ammo.');
        } else if(roll<0.9){
          const base = 50 + Math.floor(Math.random()*151);
          const amt = Math.round(base * (player.cashMultiplier||1));
          addChecking(amt);
          centerNote(`Found $${amt}`, 1200);
          notify('Cash payout from vending machine.');
        } else {
          const loss = 50 + Math.floor(Math.random()*151);
          player.checking = Math.max(0, player.checking - loss);
          centerNote(`Vending trap! -$${loss}`, 1200);
          notify('Faulty vending machine drained funds.');
        }
        boom();
      }
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
        if(Math.random()<0.1){
          const reward=['intel','feather','upgrade'][Math.floor(Math.random()*3)];
          if(reward==='intel'){
            player.intel++;
            centerNote('Drawer intel +1', 1400);
            notify('Hidden intel recovered.');
            beep({freq:780});
          } else if(reward==='feather'){
            player.hasFeather=true;
            player.featherEnergy=player.featherMax;
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
      else if(!door.unlocked){ centerNote("Door locked."); lockedBuzz(); notify("Door locked."); }
      else {
        if(!door.open){
          door.open=true;
          doorOpenSFX();
          setTimeout(()=>{
            if(currentFloor >= FLOORS){
              finishRun('escape', { message:"You cleared the tower before midnight!", note:"Tower secured." });
              return;
            }
            currentFloor = Math.min(FLOORS, currentFloor+1);
            showFloorBanner(currentFloor);
            notify(`Entered floor ${currentFloor}.`);
            player.x=initialSpawnX; player.y=0; player.vx=player.vy=0;
            makeLevel(currentFloor);
            player.y = floorSlab.y - player.h;
            player.prevBottom = player.y + player.h;
            player.prevVy = 0;
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
        camX = clamp(player.x - W*0.45, 0, 3*W - W);
        player.prevBottom = player.y + player.h;
        player.prevVy = 0;
        sub=null; entryVentWorld=null;
        centerNote("Exited vents", 700); chime(); notify("Returned from vents.");
        if(floorLabelEl) floorLabelEl.textContent = formatFloorLabel(currentFloor);
      }
    }
    // loot
    for(const it of (sub?sub.loot:[])){
      if(it.type && rect(p,it)){
        if(it.type==='cash'){ addChecking(it.amount||20); it.type=null; centerNote("Found checking +"+(it.amount||20)); beep({freq:600}); notify("Cash found."); }
        if(it.type==='ammo'){ addAmmo(it.amount||18); it.type=null; centerNote("Found ammo +"+(it.amount||18)); beep({freq:520}); notify("Ammo found."); }
        if(it.type==='intel'){ player.intel++; it.type=null; centerNote("Intel +1"); beep({freq:820}); notify("Intel collected."); }
      }
    }
  }
}

// Attacks / weapons
function attack(){
  if(pause) return;
  if(ninjaRound && player.weapon!=='melee'){
    centerNote('Melee only during ninja round!', 1200);
    notify('Switch to melee.');
    beep({freq:360});
    return;
  }
  const t=now();
  if(player.weapon==='pistol'){
    if(t - player.pistol.last < player.pistol.cooldown) return;
    if(player.pistol.ammo<=0){ centerNote("Reload (R)"); beep({freq:320}); notify("Out of ammo."); return; }
    player.pistol.last=t;
    player.pistol.ammo--;
    const dir = player.facing>0 ? 1 : -1;
    const bx = player.x + (dir>0?player.w:0);
    const by = player.y + 16;
    bullets.push({type:'bullet', x:bx, y:by, vx: dir*12, vy:0, life:1000, from:'player'});
    player.pistol.muzzleUntil = t + 80;
    if(!player.hidden && !player.inVent){ alarm=true; alarmUntil=now()+4000; }
  } else if(player.weapon==='flame'){
    if(player.flame.fuel<=0) { notify("Out of fuel."); return; }
    if(t - player.flame.last < player.flame.cooldown) return;
    player.flame.last=t; player.flame.fuel = Math.max(0, player.flame.fuel-1);
    const dir = player.facing>0 ? 1 : -1;
    const bx = player.x + (dir>0?player.w:0);
    const by = player.y + 18;
    for(let i=0;i<3;i++){
      bullets.push({type:'flame', x:bx, y:by+(Math.random()*10-5), vx: dir*(6+Math.random()*2), vy:(Math.random()*2-1), life:220, from:'player'});
    }
    if(!player.hidden && !player.inVent){ alarm=true; alarmUntil=now()+3000; }
  } else if(player.weapon==='melee'){
    if(t - player.melee.last < player.melee.cooldown) return;
    player.melee.last=t;
    const range=36;
    const px = player.x + (player.facing>0 ? player.w : -range);
    const hitBox={x:px, y:player.y, w:range, h:player.h};
    let hits=0;
    const list = inSub? (sub? [...sub.guards, ...sub.bosses] : []) : guards;
    for(const g of list){
      if(g.hp <= 0) continue;
      if(rect(hitBox,g)){
        const defeated = applyGuardDamage(g, PLAYER_MELEE_DAMAGE);
        if(defeated){ g.hp = 0; }
        g.hitFlashUntil = now() + 160;
        hits++;
      }
    }
    if(!inSub){
      for(const worker of workers){
        if(!worker.alive) continue;
        if(rect(hitBox, worker)){
          if(damageWorker(worker, PLAYER_MELEE_DAMAGE)){
            hits++;
          }
        }
      }
    }
    if(hits>0) beep({freq:520}); else beep({freq:380});
  }
}

// continuous fire for flame while held
function tickContinuous(){
  if(attackHeld){ attack(); }
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
  } else if(g.type==='ninja'){
    // no ranged; close collision handled elsewhere
  }
}

// ========= Update =========
function update(dt){
  if(!runActive) return;
  lightingPhase += dt;
  if(activeHack && now()>activeHack.deadline){
    failHack('Sequence timed out.');
  }
  player.hacking = !!activeHack;
  // Track "seen door"
  if(!seenDoor && (inViewport(door.x) || Math.abs(player.x - door.x) < W*0.4)){ seenDoor=true; }

  if(timeLeftMs()<=0){
    player.savings=0;
    notify("Savings drained at midnight.");
    finishRun('timeout', { message:"Midnight hit — Savings auto-debited." });
    return;
  }

  if(player.interestRate>0 && now()-interestDrainTimer>1000){
    interestDrainTimer = now();
    const drain = Math.max(1, Math.round(player.interestRate));
    player.checking = Math.max(0, player.checking - drain);
    if(player.checking===0){ notify('Interest drained checking to zero!'); }
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
  const boost = now()<player.speedBoostUntil ? 1.1 : 1;
  const lawsuitSlow = now()<player.lawsuitSlowUntil ? 0.7 : 1;
  const maxRun = RUN*(player.sprint?SPRINT:1)*(player.crouch?0.6:1)*boost*lawsuitSlow;

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
    player.x = clamp(player.x, 0, 3*W - player.w);

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
    if(now()>elevatorLockedUntil && destroyedOnFloor===totalServersOnFloor && !door.unlocked){
      door.unlocked=true; door.glowUntil = now()+2000;
    }
    if(evacuationActive && now()>evacuationUntil){ evacuationActive=false; }
    if(powerSurgeUntil && now()>powerSurgeUntil){ powerSurgeUntil=0; }
    if(sprinklersActiveUntil && now()>sprinklersActiveUntil){ sprinklersActiveUntil=0; sprinklers.length=0; }

    // Guards
    const yGround = floorSlab.y;
    const blockReinforce = (destroyedOnFloor===totalServersOnFloor) && seenDoor;
    if(alarm && guards.length<16 && !blockReinforce){
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
      if(g.type==='ninja'){
        g.vx *= evacBoost;
      } else {
        const dir = Math.sign(g.vx)||1;
        const base = g.speed || Math.abs(g.vx) || 1;
        g.vx = dir * base * evacBoost;
      }
      g.x += g.vx;
      if(g.x<40){ g.x=40; g.vx=Math.abs(g.vx); }
      if(g.x>3*W-60){ g.x=3*W-60; g.vx=-Math.abs(g.vx); }

      const coneDir = (g.vx>=0?1:-1);
      const gx = coneDir>0 ? g.x+g.w : g.x;
      const dx = px-gx, dy=py-(g.y+10);
      const inCone = detectable && (coneDir*dx>0) && Math.abs(dy)<50 && Math.abs(dx)<FLASH_DIST;

      const overlapping = rect(player,g);
      const shielded = player.hidden && player.crouch;
      let stomped = false;
      if(overlapping && !shielded){
        const guardTop = g.y;
        const cameFromAbove = player.prevBottom <= guardTop + 6 && player.prevVy > 0.5;
        if(cameFromAbove){
          const landed = g.takeDamage(STOMP_DAMAGE);
          if(landed){ g.hp = 0; }
          g.hitFlashUntil = now() + 180;
          player.vy = -Math.max(JUMP*0.55, 7);
          player.onGround = false;
          stomped = true;
        }
      }

      if(g.hp <= 0){ continue; }

      let inflicted = false;
      if(inCone){
        alarm=true; alarmUntil=now()+7000;
        if(Math.abs(dx)<40 && Math.abs(dy)<20){
          if(!stomped){ damage(); inflicted = true; }
        } else if(g.type!=='ninja') {
          guardFire(g);
        }
      }
      if(g.type==='ninja' && !inflicted){
        const close = Math.abs(px - (g.x+g.w/2))<90 && Math.abs(py - (g.y+g.h/2))<40;
        if(close && overlapping && !stomped && !shielded){ damage(); inflicted = true; }
      }
      if(overlapping && !stomped && !inflicted && !shielded){
        damage();
      }
    }
    // kills + reward
    for(let i=guards.length-1;i>=0;i--){
      const defeated = guards[i];
      if(defeated.hp<=0){
        guards.splice(i,1);
        runStats.kills += 1;
        addChecking(10);
        notify('+$10 (guard)');
        if(defeated.manager){
          managerDefeated=true;
          const bonus=120;
          addChecking(bonus);
          grantWeaponUpgrade();
          centerNote('Manager defeated! Bonus secured.', 1800);
          notify(`Manager routed! +$${bonus} and weapon upgrade.`);
        }
      }
    }

    // Servers armed -> destroyed
    for(const s of servers){
      if(!s.destroyed && s.armed && now()>s.armTime){
        s.destroyed=true; addChecking(10); notify("+$10 (server bonus)");
      }
    }
    destroyedOnFloor = servers.filter(x=>x.destroyed).length;
    if(destroyedOnFloor===totalServersOnFloor && !door.unlocked){
      door.unlocked=true; door.glowUntil = now()+2000; chime(); notify("All servers down. Elevator unlocked.");
      smokeActive=true;
    }
    if(serverObjective && destroyedOnFloor===totalServersOnFloor){
      player.interestRate = Math.max(0, player.interestRate-1);
      serverObjective=false;
      notify('Server takedown reduced interest pressure.');
    }

    // Door anim & camera
    if(door.open){ door.lift = Math.min(1, door.lift + 0.06); }
    else { door.lift = Math.max(0, door.lift - 0.04); }
    camX = clamp(player.x - W*0.45, 0, 3*W - W);

  } else {
    // Sublevel physics
    player.x = clamp(player.x, 80, W-80 - player.w);
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
            const fell = m.takeDamage(STOMP_DAMAGE);
            if(fell){ m.hp = 0; }
          } else if(typeof m.hp === 'number'){
            m.hp = Math.max(0, m.hp - STOMP_DAMAGE);
          }
          if('hitFlashUntil' in m){ m.hitFlashUntil = now() + 180; }
          player.vy = -Math.max(JUMP*0.55, 7);
          player.onGround = false;
        } else {
          damage();
        }
      }
    }
    // removals
    for(let i=sub.guards.length-1;i>=0;i--){
      if(sub.guards[i].hp<=0){ sub.guards.splice(i,1); runStats.kills += 1; addChecking(10); notify("+$10 (vent guard)"); checkVentForMinimapUnlock(); }
    }
    for(let i=sub.bosses.length-1;i>=0;i--){
      if(sub.bosses[i].hp<=0){ sub.bosses.splice(i,1); runStats.kills += 1; addChecking(10); notify("+$10 (boss)"); checkVentForMinimapUnlock(); }
    }
  }

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
    } else {
      b.x += b.vx; b.y += b.vy; b.life -= 16;
    }
    if(!inSub){
      if(b.x<0 || b.x>3*W || b.life<=0) b.life=0;
      if(b.from==='player'){
        for(const g of guards){
          const box={x:g.x,y:g.y,w:g.w,h:g.h};
          if(rect2(b.x-3,b.y-3,6,6,box)){
            if(g.hp > 0){
              const dmgBase = b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE;
              const fell = applyGuardDamage(g, dmgBase);
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
              damageWorker(worker, b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE);
              b.life=0;
              break;
            }
          }
        }
        for(const s of servers){
          const box={x:s.x,y:s.y,w:s.w,h:s.h};
          if(rect2(b.x-3,b.y-3,6,6,box)){ s.hp-= (b.type==='flame'? 3 : 2); if(s.hp<=0){ s.destroyed=true; } b.life=0; break; }
        }
      } else {
        const pbox={x:player.x,y:player.y,w:player.w,h:player.h};
        if(b.type==='policy'){
          if(rect2(b.x-4,b.y-4,8,8,pbox)){
            const loss = 40;
            player.checking = Math.max(0, player.checking - loss);
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
            if(g.hp > 0){
              const dmgBase = b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE;
              const fell = applyGuardDamage(g, dmgBase);
              if(fell){ g.hp = 0; }
              g.hitFlashUntil = now() + 140;
            }
            b.life=0;
          }
        }
        for(const boss of sub.bosses){
          const box={x:boss.x,y:boss.y,w:boss.w,h:boss.h};
          if(rect2(b.x-3,b.y-3,6,6,box)){
            if(boss.hp > 0){
              const dmg = b.type==='flame' ? PLAYER_FLAME_DAMAGE : PLAYER_BULLET_DAMAGE;
              boss.hp = Math.max(0, boss.hp - dmg);
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

  // HUD update
  if(timeEl) timeEl.textContent= `${fmtClock(timeLeftMs())} ➜ ${fmtClock(0)}`;
  if(serversEl) serversEl.textContent=`Servers: ${destroyedOnFloor}/${totalServersOnFloor}`;
  if(alarmsEl) alarmsEl.textContent= alarm? 'Alarms: ACTIVE' : 'Alarms: OK';
  const inv=[]; if(player.hasScrew) inv.push('Screwdriver'); if(player.hasCharges) inv.push('Charges');
  if(player.hasFeather) inv.push('Feather');
  if(invEl) invEl.textContent=`Inv: ${inv.join(', ')||'—'}`;
  const hpRatio = Math.min(1, Math.max(0, player.checking / CHECKING_HUD_MAX));
  if(hpFill) hpFill.style.width = `${hpRatio*100}%`;
  if(hpText) hpText.textContent = Math.max(0, Math.round(player.checking));
  if(cashVal) cashVal.textContent = `$${Math.max(0, Math.round(player.savings)).toLocaleString()}`;
  const weaponOrder = ['pistol','flame','melee'];
  const weaponNames = { pistol:'Pistol', flame:'Flamethrower', melee:'Melee' };
  const weaponIdx = weaponOrder.indexOf(player.weapon);
  if(weaponNameEl){
    const label = weaponNames[player.weapon] || player.weapon;
    const prefix = weaponIdx>=0 ? `${weaponIdx+1} • ` : '';
    weaponNameEl.textContent = `${prefix}${label}`;
  }
  if(weaponAmmoEl){
    let ammoText = '';
    if(player.weapon==='pistol') ammoText = `Ammo ${player.pistol.ammo}/${player.pistol.reserve}`;
    else if(player.weapon==='flame') ammoText = `Fuel ${player.flame.fuel}`;
    else ammoText = `Melee ready${now()-player.melee.last<player.melee.cooldown?' (cooling)':''}`;
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
  updateSpecialFileUI();
  updateMinimapHighlight();
}

// ========= Draw =========
function draw(){
  ctx.fillStyle = activePalette.background; ctx.fillRect(0,0,W,H);

  if(!inSub){
    const ox = -camX;

    // back wall
    for(const wall of walls){
      ctx.fillStyle = wall.isPlatform? activePalette.platform : activePalette.wall;
      ctx.fillRect(wall.x+ox, wall.y, wall.w, wall.h);
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
        ctx.fillRect(80+ox, fx.y, 3*W-160, 8);
      } else if(fx.type==='cubiclesParallax'){
        const offset = (camX*0.25)%160;
        for(let x=-offset;x<3*W;x+=160){
          ctx.fillStyle='rgba(200,200,210,0.18)';
          ctx.fillRect(x+ox, floorSlab.y-200, 120, 90);
          ctx.fillStyle='rgba(180,180,190,0.12)';
          ctx.fillRect(x+ox+20, floorSlab.y-160, 80, 60);
        }
      } else if(fx.type==='serverParallax'){
        const offset = (camX*0.3)%200;
        for(let x=-offset;x<3*W;x+=200){
          ctx.fillStyle='rgba(80,110,160,0.2)';
          ctx.fillRect(x+ox, floorSlab.y-240, 140, 160);
          ctx.fillStyle='rgba(140,200,255,0.1)';
          for(let row=0; row<5; row++){
            ctx.fillRect(x+ox+12, floorSlab.y-220+row*26, 116, 8);
          }
        }
      } else if(fx.type==='skylineParallax'){
        const offset = (camX*0.15)%260;
        for(let x=-offset;x<3*W;x+=260){
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
        ctx.fillRect(ox, 40, 3*W, H-160);
      } else if(fx.type==='boardCharts'){
        const offset = (camX*0.12)%200;
        for(let x=-offset; x<3*W; x+=200){
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
    ctx.fillStyle = activePalette.platform; ctx.fillRect(floorSlab.x+ox,floorSlab.y,floorSlab.w,floorSlab.h);

    // desks
    for(const d of desks){
      ctx.fillStyle = activePalette.desk; ctx.fillRect(d.x+ox,d.y,d.w,d.h);
      ctx.fillStyle = activePalette.deskEdge; ctx.fillRect(d.x+6+ox,d.y+d.h-10,d.w-12,8);
      ctx.fillStyle = activePalette.deskLeg; ctx.fillRect(d.x+4+ox,d.y+d.h,6,10); ctx.fillRect(d.x+d.w-10+ox,d.y+d.h,6,10);
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
      ctx.fillStyle=vend.broken?'#3a3a3a':'#4c64aa';
      ctx.fillRect(vend.x+ox, vend.y, vend.w, vend.h);
      ctx.fillStyle='rgba(255,255,255,0.25)';
      ctx.fillRect(vend.x+4+ox, vend.y+8, vend.w-8, vend.h-24);
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
      ctx.fillStyle = activePalette.movingPlatform;
      ctx.fillRect(m.x+ox,m.y,m.w,m.h);
      ctx.fillStyle = activePalette.movingPlatformHighlight; ctx.fillRect(m.x+4+ox,m.y+2,m.w-8,2);
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

    for(const hz of hazards){
      if(hz.type==='electric'){
        ctx.fillStyle='rgba(80,140,220,0.5)';
        ctx.fillRect(hz.x+ox, hz.y, hz.w, hz.h);
      } else if(hz.type==='steam'){
        ctx.fillStyle='rgba(200,200,200,0.25)';
        ctx.fillRect(hz.x+ox, hz.y, hz.w, hz.h);
      } else if(hz.type==='fall'){
        ctx.fillStyle=hz.open ? 'rgba(30,30,30,0.6)' : activePalette.platform;
        ctx.fillRect(hz.x+ox, hz.y, hz.w, hz.h);
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
      if(!worker.alive) continue;
      const appearance = worker.appearance || createWorkerAppearance();
      const wobble = Math.sin(worker.bob || 0) * 1.2;
      const walkSwing = Math.sin((worker.bob || 0) * 1.1);
      const facing = worker.facing || 1;
      const width = worker.w;
      const bodyX = worker.x + ox;
      const bodyY = worker.y + wobble;
      const headHeight = 9;
      const hairHeight = 3;
      const torsoHeight = 16;
      const legHeight = Math.max(8, worker.h - headHeight - torsoHeight);
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
        ctx.fillRect(bodyX-2, bodyY - hairHeight - 4, width+4, worker.h + hairHeight + 6);
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

    // guards with flashlight cone
    for(const g of guards){
      ctx.fillStyle = activePalette.flashlightCone;
      const coneDir = (g.vx>=0?1:-1);
      ctx.beginPath();
      ctx.moveTo(g.x + (coneDir>0?g.w:0)+ox, g.y+10);
      ctx.lineTo(g.x + (coneDir>0?g.w+FLASH_DIST:-FLASH_DIST)+ox, g.y-10 + Math.sin(g.t)*20);
      ctx.lineTo(g.x + (coneDir>0?g.w+FLASH_DIST:-FLASH_DIST)+ox, g.y+30 + Math.cos(g.t)*20);
      ctx.closePath(); ctx.fill();
      const flashing = g.hitFlashUntil && g.hitFlashUntil > now();
      let tint = '#2f6fa2';
      if(g.type==='auto') tint='#3c8a3c';
      if(g.type==='launcher') tint='#8a3c3c';
      if(g.type==='ninja') tint='#2f2f2f';
      ctx.fillStyle = flashing ? '#ff9c9c' : tint;
      ctx.fillRect(g.x+2+ox,g.y+10,g.w-4,22);
      ctx.fillStyle='#1d1d1d'; ctx.fillRect(g.x+3+ox,g.y+32,6,10); ctx.fillRect(g.x+g.w-9+ox,g.y+32,6,10);
      ctx.fillStyle='#1d3b56'; ctx.fillRect(g.x+4+ox,g.y, g.w-8, 10);
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
      if(it.type==='cash'){ ctx.fillStyle='#6fff6f'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='file'){ ctx.fillStyle='#9ec7ff'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='intel'){ ctx.fillStyle='#c89eff'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='feather'){ ctx.fillStyle='#fff7a8'; ctx.fillRect(x,y,it.w,it.h); }
      if(it.type==='special'){ ctx.fillStyle='#B455FF'; ctx.fillRect(x,y,it.w,it.h); }
    }

    // player
    const px=player.x+ox, py=player.y + player.crouchOffset;
    if(now()<player.hurtUntil){ ctx.fillStyle='rgba(255,120,120,0.8)'; ctx.fillRect(px-2,py-2,player.w+4,player.h+4); }
    ctx.fillStyle='#f0D2b6'; ctx.fillRect(px+6, py+2, 10, 10);
    ctx.fillStyle='#d14d4d'; ctx.fillRect(px+4, py+12, player.w-8, player.crouch?18:22);
    ctx.fillStyle='#3a3a3a'; if(!player.crouch){ ctx.fillRect(px+4, py+34, 6, 12); ctx.fillRect(px+player.w-10, py+34, 6, 12); } else { ctx.fillRect(px+5, py+30, 12, 8); }
    if(now() < player.pistol.muzzleUntil && player.weapon==='pistol'){
      ctx.fillStyle='rgba(255,220,120,0.9)';
      const mx = px + (player.facing>0 ? player.w+2 : -8);
      ctx.fillRect(mx, py+16, 8, 4);
    }
    if(player.weapon==='flame' && attackHeld){
      ctx.fillStyle='rgba(255,160,60,0.15)';
      const dir = player.facing>0?1:-1;
      ctx.beginPath();
      ctx.moveTo(px + (dir>0?player.w:0), py+18);
      ctx.lineTo(px + (dir>0?player.w+90:-90), py+4);
      ctx.lineTo(px + (dir>0?player.w+90:-90), py+32);
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
    const px=player.x, py=player.y + player.crouchOffset;
    if(now()<player.hurtUntil){ ctx.fillStyle='rgba(255,120,120,0.8)'; ctx.fillRect(px-2,py-2,player.w+4,player.h+4); }
    ctx.fillStyle='#f0d2b6'; ctx.fillRect(px+6, py+2, 10, 10);
    ctx.fillStyle='#d14d4d'; ctx.fillRect(px+4, py+12, player.w-8, player.crouch?18:22);
    ctx.fillStyle='#3a3a3a'; if(!player.crouch){ ctx.fillRect(px+4, py+34, 6, 12); ctx.fillRect(px+player.w-10, py+34, 6, 12); } else { ctx.fillRect(px+5, py+30, 12, 8); }
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
