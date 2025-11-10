export const GAME_DURATION_REAL_MS = 2 * 60 * 60 * 1000; // 2 real hours
export const FRAME_TARGET = 1000 / 60;

export const PLAYER_CONSTANTS = {
  width: 24,
  height: 46,
  maxHp: 250,
  startHp: 100,
  maxSavings: 1200,
  startSavings: 1200,
  moveSpeed: 180,
  jumpSpeed: 430,
  gravity: 1600,
  dropMs: 120,
  meleeCooldownMs: 250,
  meleeDamage: 15,
  stompDamage: 10,
};

export const DAMAGE_VALUES = {
  guardBullet: 10,
  miniBossBullet: 20,
  touch: 10,
};

export const ECONOMY = {
  startingLoan: 120000,
  checkingDrainPerDamage: 10,
  boardKillReward: 200,
  ceoReward: 500,
};

export const WEAPON_DEFS = {
  pistol: {
    id: 'pistol',
    slot: 1,
    name: 'Pistol',
    unlockCondition: () => true,
    ammoType: 'pistol',
    magazine: 9,
    fireCooldown: 180,
    projectileSpeed: 520,
    damage: 10,
    sound: 'shoot_pistol',
  },
  silenced: {
    id: 'silenced',
    slot: 2,
    name: 'Silenced Pistol',
    unlockCondition: state => state.player.intel >= 1,
    ammoType: 'pistol',
    magazine: 9,
    fireCooldown: 220,
    projectileSpeed: 520,
    damage: 10,
    sound: 'shoot_silenced',
  },
  flame: {
    id: 'flame',
    slot: 3,
    name: 'Flame Thrower',
    unlockCondition: state => state.player.intel >= 5,
    ammoType: 'fuel',
    magazine: 60,
    fireCooldown: 80,
    projectileSpeed: 280,
    damage: 6,
    sound: 'flame',
  },
  melee: {
    id: 'melee',
    slot: 4,
    name: 'Melee',
    unlockCondition: () => true,
    ammoType: null,
    magazine: Infinity,
    fireCooldown: PLAYER_CONSTANTS.meleeCooldownMs,
    damage: PLAYER_CONSTANTS.meleeDamage,
    sound: 'melee',
  },
  grenade: {
    id: 'grenade',
    slot: 5,
    name: 'Grenade Launcher',
    unlockCondition: state => state.player.intel >= 20,
    ammoType: 'grenade',
    magazine: 3,
    fireCooldown: 1200,
    projectileSpeed: 420,
    damage: 35,
    blastRadius: 80,
    sound: 'grenade',
  },
  saber: {
    id: 'saber',
    slot: 6,
    name: 'Saber',
    unlockCondition: state => state.player.files >= 25,
    ammoType: null,
    magazine: Infinity,
    fireCooldown: 320,
    damage: 22,
    sound: 'saber',
  },
  machine: {
    id: 'machine',
    slot: 7,
    name: 'Machine Gun',
    unlockCondition: state => state.player.intel >= 40,
    ammoType: 'machine',
    magazine: 60,
    fireCooldown: 90,
    projectileSpeed: 560,
    damage: 8,
    sound: 'shoot_auto',
  },
};

export const HOSTAGE_SEQUENCE = ['Grandpa','Mom','Dad','Grandma','Brother','Sister',
  '1st Cousin','2nd Cousin','3rd Cousin','4th Cousin','5th Cousin','6th Cousin'];

export const PROFILE_DECK = [
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

export const CEO_PROFILE = {
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

export const EFFECTS = {
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

export const BOSS_AURAS = {
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

export const LS = {
  name: 'loanTower.nickname',
  board: 'loanTower.leaderboard'
};
