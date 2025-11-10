import { GAME_DURATION_REAL_MS, FRAME_TARGET, PLAYER_CONSTANTS, DAMAGE_VALUES, ECONOMY, WEAPON_DEFS, HOSTAGE_SEQUENCE, PROFILE_DECK, CEO_PROFILE, EFFECTS, BOSS_AURAS, LS } from './constants.js';
import { getFloorDef, SPECIAL_FLOOR } from './floors.js';
import { generateGuardSpawnsInitial, generateGuardSpawnsRefill } from './spawn.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const hudEl = document.getElementById('hud');
const hudFloor = document.getElementById('hudFloor');
const clockLabel = document.getElementById('clockLabel');
const barHp = document.getElementById('barHp');
const barSavings = document.getElementById('barSavings');
const barLoan = document.getElementById('barLoan');
const hpLabel = document.getElementById('hpLabel');
const savingsLabel = document.getElementById('savingsLabel');
const loanLabel = document.getElementById('loanLabel');
const weaponName = document.getElementById('weaponName');
const weaponAmmo = document.getElementById('weaponAmmo');
const weaponNodes = [...document.querySelectorAll('.hud__weapon')];
const ammoPistol = document.getElementById('ammoPistol');
const ammoSilenced = document.getElementById('ammoSilenced');
const ammoFlame = document.getElementById('ammoFlame');
const ammoGrenade = document.getElementById('ammoGrenade');
const ammoMachine = document.getElementById('ammoMachine');
const featherStatus = document.getElementById('featherStatus');
const featherTimerEl = document.getElementById('featherTimer');
const miniBossLabel = document.getElementById('miniBossLabel');
const hostageLabel = document.getElementById('hostageLabel');
const btnMap = document.getElementById('btnMap');
const btnFiles = document.getElementById('btnFiles');
const mapPanel = document.getElementById('mapPanel');
const filesPanel = document.getElementById('filesPanel');
const btnMute = document.getElementById('btnMute');
const toastEl = document.getElementById('toast');
const bannerEl = document.getElementById('banner');

const menuEl = document.getElementById('menu');
const nameInput = document.getElementById('playerName');
const rememberCheckbox = document.getElementById('rememberName');
const startBtn = document.getElementById('btnStart');
const boardBtn = document.getElementById('btnBoard');
const boardPanel = document.getElementById('boardPanel');
const boardEmpty = document.getElementById('boardEmpty');
const boardTbody = boardPanel.querySelector('tbody');
const boardClose = document.getElementById('btnCloseBoard');
const nameWarn = document.getElementById('nameWarn');

const audioState = { muted:false };
btnMute.addEventListener('click', ()=>{
  audioState.muted = !audioState.muted;
  btnMute.textContent = audioState.muted ? '🔇' : '🔈';
});

function playSound(id){
  if(audioState.muted) return;
  // placeholder beep
  if(!window.AudioContext) return;
  if(!playSound.ctx){ playSound.ctx = new AudioContext(); }
  const ctxA = playSound.ctx;
  const osc = ctxA.createOscillator();
  const gain = ctxA.createGain();
  const now = ctxA.currentTime;
  let freq = 440;
  if(id==='shoot_pistol') freq=660;
  else if(id==='shoot_silenced') freq=540;
  else if(id==='flame') freq=320;
  else if(id==='melee') freq=200;
  else if(id==='grenade') freq=120;
  else if(id==='saber') freq=900;
  else if(id==='shoot_auto') freq=760;
  else if(id==='jump') freq=500;
  else if(id==='hit') freq=180;
  osc.frequency.value = freq;
  osc.type = 'square';
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(gain); gain.connect(ctxA.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

function toast(msg, dur=2000){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(()=>toastEl.classList.remove('show'), dur);
}

function showBanner(text, dur=4000){
  bannerEl.textContent = text;
  bannerEl.classList.remove('hidden');
  clearTimeout(bannerEl._timer);
  bannerEl._timer = setTimeout(()=>bannerEl.classList.add('hidden'), dur);
}

function fmtMoney(v){
  const sign = v < 0 ? '-' : '';
  const n = Math.abs(Math.round(v));
  return `${sign}$${n.toLocaleString()}`;
}

function fmtTime(ms){
  const total = Math.max(0, Math.round(ms/1000));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  const s = total%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }

class Input {
  constructor(){
    this.state = new Map();
    this.pressed = new Map();
    this.alias = {
      left: ['ArrowLeft','a'],
      right:['ArrowRight','d'],
      up: ['ArrowUp','w'],
      down:['ArrowDown','s','x'],
      jump:[' ','Space','ArrowUp','w'],
      shoot:['j','e'],
      drop:['ArrowDown','s','x'],
    };
    window.addEventListener('keydown', e=>this._onDown(e));
    window.addEventListener('keyup', e=>this._onUp(e));
  }
  _onDown(e){
    const key = e.key.length===1 ? e.key.toLowerCase() : e.key;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)){ e.preventDefault(); }
    if(!this.state.get(key)){
      this.pressed.set(key, true);
    }
    this.state.set(key, true);
  }
  _onUp(e){
    const key = e.key.length===1 ? e.key.toLowerCase() : e.key;
    this.state.set(key, false);
  }
  isDown(key){
    const keys = this.alias[key] || [key];
    return keys.some(k=>this.state.get(k));
  }
  justPressed(key){
    const keys = this.alias[key] || [key];
    const match = keys.find(k=>this.pressed.get(k));
    if(match){ this.pressed.delete(match); return true; }
    return false;
  }
  consume(key){ this.pressed.delete(key); }
  endFrame(){ this.pressed.clear(); }
}

const input = new Input();

const hostageState = {
  taken: [],
  nextIndex: 0,
};
window.hostageState = hostageState;

function nextHostageName(){
  const idx = hostageState.nextIndex;
  let name = HOSTAGE_SEQUENCE[idx];
  if(!name){
    const n = idx - (HOSTAGE_SEQUENCE.length-1);
    name = `${n + HOSTAGE_SEQUENCE.length - 5}th Cousin`;
  }
  hostageState.nextIndex++;
  hostageState.taken.push(name);
  return name;
}

const Leaderboard = {
  maxRows: 100,
  open:false,
  load(){
    try { return JSON.parse(localStorage.getItem(LS.board) || '[]'); }
    catch { return []; }
  },
  save(rows){
    localStorage.setItem(LS.board, JSON.stringify(rows.slice(0, this.maxRows)));
  },
  add(row){
    const rows = this.load();
    rows.push(row);
    rows.sort((a,b)=>{
      if (a.loanRemaining !== b.loanRemaining) return a.loanRemaining - b.loanRemaining;
      if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
      if (a.kills !== b.kills) return b.kills - a.kills;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return a.refinances - b.refinances;
    });
    this.save(rows);
  },
  render(){
    const rows = this.load();
    boardEmpty.style.display = rows.length ? 'none':'block';
    boardTbody.innerHTML='';
    rows.slice(0,this.maxRows).forEach((row,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(row.name)}</td><td>${fmtTime(row.timeMs)}</td><td>${fmtMoney(row.loanRemaining)}</td><td>${row.kills|0}</td><td>${row.deaths|0}</td><td>${row.refinances|0}</td>`;
      boardTbody.appendChild(tr);
    });
  },
  toggle(){
    this.open = !this.open;
    boardPanel.classList.toggle('hidden', !this.open);
    if(this.open) this.render();
  }
};

function escapeHtml(t){ return t.replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s])); }

const Menu = {
  visible:true,
  init(){
    const saved = localStorage.getItem(LS.name) || '';
    if(saved){ nameInput.value = saved; startBtn.disabled = false; }
    nameInput.addEventListener('input', ()=>{
      const name = nameInput.value.trim();
      const ok = name.length>=1;
      startBtn.disabled = !ok;
      nameWarn.textContent = ok ? '' : 'Enter a nickname to begin.';
    });
    rememberCheckbox.checked = !!localStorage.getItem(LS.name);
    rememberCheckbox.addEventListener('change', ()=>{
      if(!rememberCheckbox.checked){ localStorage.removeItem(LS.name); }
      else if(nameInput.value.trim()){ localStorage.setItem(LS.name, nameInput.value.trim()); }
    });
    startBtn.addEventListener('click', ()=>{
      if(startBtn.disabled) return;
      Menu.hide();
      Game.start({ playerName: nameInput.value.trim() });
      if(rememberCheckbox.checked){ localStorage.setItem(LS.name, nameInput.value.trim()); }
    });
    boardBtn.addEventListener('click', ()=>Leaderboard.toggle());
    boardClose.addEventListener('click', ()=>Leaderboard.toggle());
    document.addEventListener('keydown', e=>{
      if(e.key==='Enter' && !startBtn.disabled && this.visible){ startBtn.click(); }
      if(e.key.toLowerCase()==='l' && this.visible){ Leaderboard.toggle(); }
    });
  },
  hide(){ this.visible=false; menuEl.classList.add('hidden'); hudEl.classList.remove('hidden'); canvas.focus(); },
  show(){ this.visible=true; menuEl.classList.remove('hidden'); hudEl.classList.add('hidden'); }
};

const SpecialFiles = {
  open:false,
  unlockedCount:0,
  render(state){
    filesPanel.innerHTML='';
    PROFILE_DECK.forEach(profile=>{
      const unlocked = state.player.specialFiles >= 10;
      const card = document.createElement('div');
      card.className = 'card' + (unlocked ? '' : ' locked');
      card.innerHTML = unlocked
        ? `<strong>${profile.card}</strong><span>${profile.name}</span><small>${profile.title}</small>`
        : `<strong>?</strong><span>CONFIDENTIAL</span>`;
      filesPanel.appendChild(card);
    });
    if(state.player.specialFiles >= 10){
      const ceo = document.createElement('div');
      ceo.className = 'card';
      ceo.innerHTML = `<strong>${CEO_PROFILE.card}</strong><span>${CEO_PROFILE.name}</span><small>${CEO_PROFILE.title}</small>`;
      filesPanel.appendChild(ceo);
    }
  },
  toggle(state){
    this.open=!this.open;
    filesPanel.classList.toggle('hidden', !this.open);
    if(this.open) this.render(state);
  }
};

btnFiles.addEventListener('click', ()=>SpecialFiles.toggle(Game.state));
btnMap.addEventListener('click', ()=>Game.toggleMap());

document.addEventListener('keydown', e=>{
  if(!Game.state || !Game.state.active) return;
  if(e.key==='0') Game.toggleMap();
  if(e.key==='9') SpecialFiles.toggle(Game.state);
  if(e.key==='m' || e.key==='M') btnMute.click();
});

canvas.addEventListener('mousedown', e=>{
  if(Game.state?.mapOpen){
    const rect = mapPanel.getBoundingClientRect();
    if(!(e.clientX>=rect.left && e.clientX<=rect.right && e.clientY>=rect.top && e.clientY<=rect.bottom)){
      Game.state.mapOpen=false; mapPanel.classList.add('hidden');
    }
  }
});

const Game = {
  state:null,
  lastTime:performance.now(),
  start({ playerName }){
    this.lastTime = performance.now();
    this.state = createInitialState(playerName);
    this.state.active = true;
    this.state.menuName = playerName;
    hudEl.classList.remove('hidden');
    updateHUD(this.state);
    setupFloor(this.state, this.state.floor);
    requestAnimationFrame(loop);
  },
  toggleMap(){
    if(!this.state) return;
    this.state.mapOpen = !this.state.mapOpen && this.state.mapUnlocked;
    mapPanel.classList.toggle('hidden', !this.state.mapOpen);
    if(this.state.mapOpen) renderMapPanel(this.state);
  },
  endRun(outcome){
    if(!this.state) return;
    const row = {
      name: this.state.menuName || 'Player',
      timeMs: this.state.realPlayTimeMs,
      loanRemaining: this.state.player.loanBalance,
      kills: this.state.stats.kills,
      deaths: this.state.stats.deaths,
      refinances: this.state.stats.refinances,
      ts: Date.now()
    };
    Leaderboard.add(row);
    showBanner(outcome.toUpperCase(), 4000);
    this.state.active=false;
    setTimeout(()=>{
      Menu.show();
      hudEl.classList.add('hidden');
    }, 2000);
  }
};

function createInitialState(playerName){
  return {
    menuName: playerName,
    runSeed: (Date.now() & 0xffff),
    floor: 1,
    realPlayTimeMs: 0,
    remainingMs: GAME_DURATION_REAL_MS,
    paused:false,
    lastFrameTime: performance.now(),
    player: {
      name: playerName,
      x: 120,
      y: 480,
      vx:0,
      vy:0,
      w: PLAYER_CONSTANTS.width,
      h: PLAYER_CONSTANTS.height,
      facing: 1,
      grounded:false,
      dropWindow:0,
      hp: PLAYER_CONSTANTS.startHp,
      hpMax: PLAYER_CONSTANTS.maxHp,
      savings: PLAYER_CONSTANTS.startSavings,
      savingsMax: PLAYER_CONSTANTS.maxSavings,
      loanBalance: ECONOMY.startingLoan,
      pistolAmmo: 9,
      pistolReserve: 90,
      fuel: 0,
      grenadeAmmo: 0,
      machineAmmo: 0,
      feather:false,
      featherMs:0,
      featherTimer:0,
      featherAvailable:false,
      files:0,
      intel:0,
      specialFiles:0,
      weaponSlot:1,
      lastShot:0,
      lastMelee:0,
      onPlatform:null,
      savingsLocked:false,
      hostagesFreed:0,
    },
    hostages: hostageState,
    guards: [],
    pickups: [],
    bullets: [],
    mapOpen:false,
    mapUnlocked:false,
    ecoHostages:[],
    stats:{ kills:0, deaths:0, refinances:0, miniBosses:0 },
    playerName,
    active:false,
    timerPaused:false,
    miniBossesRemaining:0,
    floorDef:null,
    mapUnlockedFloors:[],
    debug:false
  };
}

function setupFloor(state, floor){
  state.floor = floor;
  const def = getFloorDef(floor, state.runSeed);
  state.floorDef = def;
  state.guards = [];
  state.pickups = [];
  state.bullets = [];
  state.miniBossesRemaining = def.special?.kind === 'boardBoss' ? 1 : 0;
  state.player.x = 120;
  state.player.y = 480;
  state.player.vx=0;
  state.player.vy=0;
  state.player.grounded=false;
  if(def.special?.kind === 'ninjaRound'){
    toast('NINJA ROUND – ranged weapons disabled');
  }
  spawnGuards(state, def);
  spawnFloorPickups(state, def);
  setupSpecialFloor(state, def);
  buildMapPanel(def);
  updateHUD(state);
  hudFloor.textContent = def.label;
  showBanner(def.label, 2000);
  if(floor === 36){
    if(tryPeacefulEnding(state)) return;
    if(attemptRefinanceQTE(state)) return;
  }
}

function spawnGuards(state, def){
  const spawnData = generateGuardSpawnsInitial({
    platforms: def.platforms,
    playerX: state.player.x,
    count: def.rules.startSpawnRule?.initialGuards || 6,
    spawnSpreadMin: def.rules.spawnSpreadMin
  });
  for(const pos of spawnData){
    const guard = makeGuard(pos.x, pos.y-40, state.floor);
    if(def.rules.startSpawnRule?.spawnRightOnly){ guard.x = Math.max(guard.x, state.player.x + 80); }
    state.guards.push(guard);
  }
}

function spawnFloorPickups(state, def){
  state.pickups.length = 0;
  let featherPlaced = false;
  const rng = Math.random;
  const baseY = 520;
  const floorCash = 6 + Math.floor(Math.random()*6);
  for(let i=0;i<floorCash;i++){
    state.pickups.push({ type:'cash', amount: 50 + Math.floor(Math.random()*40), x: 120 + Math.random()*800, y: baseY-18, w:18, h:18 });
  }
  const ammo = 4;
  for(let i=0;i<ammo;i++){
    state.pickups.push({ type:'ammo', amount: 15, x: 100 + Math.random()*880, y: baseY-18, w:18, h:18 });
  }
  if(def.loot.featherOnFloor){
    const ledge = def.platforms.find(p=>p.featherLedge);
    if(ledge){
      state.pickups.push({ type:'feather', x: ledge.x + ledge.w/2 - 10, y: ledge.y-20, w:18, h:18 });
      featherPlaced = true;
    }
  }
  if(!featherPlaced){
    state.pickups.push({ type:'feather', x: 400, y: 480-20, w:18, h:18 });
  }
  state.pickups.push({ type:'intel', x: 320, y: 460, w:18, h:18 });
  state.pickups.push({ type:'file', x: 640, y: 420, w:18, h:18 });
  if(Math.random()<0.25){
    state.pickups.push({ type:'specialFile', x: 780, y: 480-20, w:18, h:18 });
  }
}

function setupSpecialFloor(state, def){
  state.ecoHostages = [];
  if(def.special?.kind === 'ecoBoss'){
    const chairs = Math.min(def.special.chairs || 3, state.hostages.taken.length);
    for(let i=0;i<chairs;i++){
      const name = state.hostages.taken[i];
      state.ecoHostages.push({
        name,
        x: 200 + i*120,
        y: 460,
        w: 30,
        h: 50,
        timerMs: 20000,
        freed:false
      });
    }
  }
}

function makeGuard(x,y,floor){
  const type = guardTypeForFloor(floor);
  const hp = type==='boss'?80 : type==='miniboss'?40 : 20 + Math.floor(floor/3)*4;
  const speed = type==='ninja'?140:80 + floor*2;
  return {
    x,y,
    w:24,
    h:40,
    vx: Math.random()<0.5? speed:-speed,
    vy:0,
    type,
    hp,
    bulletCooldown:0,
    attackTimer:0,
    grounded:false,
    lastShot:0,
    bigBullet: type==='boss',
  };
}

function guardTypeForFloor(floor){
  if(floor === SPECIAL_FLOOR.NINJA) return 'ninja';
  if(floor === SPECIAL_FLOOR.CEO) return 'boss';
  const board = [4,8,12,16,20,24,28,32];
  if(board.includes(floor)) return 'boss';
  if(floor >= 20) return Math.random()<0.3? 'auto' : 'pistol';
  if(floor >= 12) return Math.random()<0.25? 'launcher' : 'pistol';
  if(floor >= 6) return Math.random()<0.2? 'auto' : 'pistol';
  return 'pistol';
}

function updateHUD(state){
  const p = state.player;
  hpLabel.textContent = `${Math.round(p.hp)} / ${p.hpMax}`;
  barHp.style.width = `${(p.hp/p.hpMax)*100}%`;
  savingsLabel.textContent = `${Math.round(p.savings)} / ${p.savingsMax}`;
  barSavings.style.width = `${(p.savings/p.savingsMax)*100}%`;
  loanLabel.textContent = fmtMoney(p.loanBalance);
  const loanPct = 1 - (p.loanBalance/ECONOMY.startingLoan);
  barLoan.style.width = `${Math.max(0,loanPct*100)}%`;
  clockLabel.textContent = fmtTime(state.remainingMs);
  updateWeaponHUD(state);
  featherStatus.textContent = p.feather ? 'Feather: READY' : 'Feather: —';
  if(p.featherMs>0){
    featherTimerEl.textContent = `${(p.featherMs/1000).toFixed(1)}s`;
    featherTimerEl.classList.remove('hidden');
  } else {
    featherTimerEl.classList.add('hidden');
  }
  miniBossLabel.textContent = `Mini-bosses: ${state.miniBossesRemaining}`;
  hostageLabel.textContent = `Hostages: ${state.hostages.taken.length}`;
  mapPanel.classList.toggle('hidden', !state.mapOpen);
}

function updateWeaponHUD(state){
  const p = state.player;
  weaponNodes.forEach(node=>{
    const slot = Number(node.dataset.weapon);
    const weapon = weaponBySlot(slot);
    const unlocked = isWeaponUnlocked(state, weapon.id);
    node.classList.toggle('locked', !unlocked);
    node.classList.toggle('active', p.weaponSlot === slot);
  });
  ammoPistol.textContent = `${p.pistolAmmo} / ${p.pistolReserve}`;
  ammoSilenced.textContent = `${p.pistolAmmo} / ${p.pistolReserve}`;
  ammoFlame.textContent = `${p.fuel}`;
  ammoGrenade.textContent = `${p.grenadeAmmo}`;
  ammoMachine.textContent = `${p.machineAmmo}`;
  const weapon = weaponBySlot(p.weaponSlot);
  weaponName.textContent = weapon.name;
  if(weapon.ammoType === 'pistol'){
    weaponAmmo.textContent = `Ammo: ${p.pistolAmmo} / ${p.pistolReserve}`;
  } else if(weapon.ammoType === 'fuel'){
    weaponAmmo.textContent = `Fuel: ${p.fuel}`;
  } else if(weapon.ammoType === 'grenade'){
    weaponAmmo.textContent = `Grenades: ${p.grenadeAmmo}`;
  } else if(weapon.ammoType === 'machine'){
    weaponAmmo.textContent = `Ammo: ${p.machineAmmo}`;
  } else {
    weaponAmmo.textContent = `Ammo: ∞`;
  }
}

function weaponBySlot(slot){
  return Object.values(WEAPON_DEFS).find(w=>w.slot===slot) || WEAPON_DEFS.pistol;
}

function isWeaponUnlocked(state, id){
  const weapon = WEAPON_DEFS[id];
  if(!weapon) return false;
  return weapon.unlockCondition(state);
}

function tryEquipWeapon(state, slot){
  const weapon = weaponBySlot(slot);
  if(!weapon) return;
  if(!isWeaponUnlocked(state, weapon.id)){
    toast(`${weapon.name} locked`);
    return;
  }
  state.player.weaponSlot = slot;
  updateHUD(state);
}

weaponNodes.forEach(node=>{
  node.addEventListener('click', ()=>{
    tryEquipWeapon(Game.state, Number(node.dataset.weapon));
  });
});

document.addEventListener('keydown', e=>{
  if(!Game.state?.active) return;
  const num = Number(e.key);
  if(num>=1 && num<=7){ tryEquipWeapon(Game.state, num); }
});

function loop(){
  if(!Game.state || !Game.state.active){ return; }
  const now = performance.now();
  const dt = now - Game.lastTime;
  Game.lastTime = now;
  update(Game.state, dt);
  render(Game.state);
  requestAnimationFrame(loop);
}

function update(state, dt){
  if(state.paused){ return; }
  state.realPlayTimeMs += dt;
  if(!state.timerPaused){
    state.remainingMs = Math.max(0, state.remainingMs - dt);
    if(state.remainingMs === 0){
      Game.endRun('time_over');
      return;
    }
  }
  const p = state.player;
  const dtSec = dt / 1000;
  const prevX = p.x;
  const prevY = p.y;
  const left = input.isDown('left');
  const right = input.isDown('right');
  let ax = 0;
  if(left) ax -= 1;
  if(right) ax += 1;
  if(ax!==0) p.facing = ax>0?1:-1;
  p.vx = ax * PLAYER_CONSTANTS.moveSpeed;

  const jumpPressed = input.justPressed('jump') || input.justPressed(' ');
  if(jumpPressed){
    if(p.grounded){
      p.vy = -PLAYER_CONSTANTS.jumpSpeed;
      p.grounded = false;
      playSound('jump');
    } else if(p.featherMs>0){
      p.vy = Math.min(p.vy, -PLAYER_CONSTANTS.jumpSpeed*0.6);
    }
  }
  if(input.isDown('jump') && p.featherMs>0){
    p.vy -= 400*dtSec;
  }
  if(input.isDown('up') && input.isDown('down')){
    p.dropWindow += dt;
    if(p.dropWindow>=PLAYER_CONSTANTS.dropMs){
      if(p.onPlatform?.semisolid){
        p.y += 4;
        p.grounded=false;
        p.onPlatform=null;
      }
      p.dropWindow = 0;
    }
  } else {
    p.dropWindow = 0;
  }

  p.vy += PLAYER_CONSTANTS.gravity * dtSec;
  p.y += p.vy * dtSec;
  p.x += p.vx * dtSec;

  const platforms = state.floorDef.platforms;
  const prevPlatform = p.onPlatform;
  p.grounded = false;
  p.onPlatform = null;
  const dropThrough = input.isDown('up') && input.isDown('down');
  for(const plat of platforms){
    const height = plat.h ?? 16;
    const left = plat.x;
    const right = plat.x + plat.w;
    const top = plat.y;
    const bottom = top + height;
    if(p.x + p.w <= left || p.x >= right) continue;

    if(plat.semisolid){
      if(p.vy >= 0 && prevY + p.h <= top && p.y + p.h >= top){
        if(dropThrough && plat === prevPlatform) continue;
        p.y = top - p.h;
        p.vy = 0;
        p.grounded = true;
        p.onPlatform = plat;
      }
    } else {
      if(prevY + p.h <= top && p.y + p.h >= top){
        p.y = top - p.h;
        p.vy = 0;
        p.grounded = true;
        p.onPlatform = plat;
      } else if(prevY >= bottom && p.y <= bottom){
        p.y = bottom;
        if(p.vy < 0) p.vy = 0;
      } else if(prevX + p.w <= left && p.x + p.w >= left){
        p.x = left - p.w;
        if(p.vx > 0) p.vx = 0;
      } else if(prevX >= right && p.x <= right){
        p.x = right;
        if(p.vx < 0) p.vx = 0;
      }
    }
  }

  const groundY = 520 - p.h;
  if(p.y > groundY){
    p.y = groundY;
    p.vy = Math.min(p.vy, 0);
    p.grounded = true;
  }
  p.x = clamp(p.x, 40, 1040);

  if(p.featherMs>0){
    p.featherMs = Math.max(0, p.featherMs - dt);
    if(p.featherMs===0){
      p.feather = false;
      toast('Feather expired');
    }
  }

  handleCombat(state, dt);
  updateBullets(state, dtSec);
  updateGuards(state, dtSec);
  checkPickups(state);
  updateEcoHostages(state, dt);
  checkFeatherCancel(state);
  if(!state.mapUnlocked && state.miniBossesRemaining<=0){
    state.mapUnlocked = true;
    toast('Minimap unlocked (0)');
  }
  updateHUD(state);
  input.endFrame();
}

function rectIntersect(a,b){
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

function handleCombat(state, dt){
  const p = state.player;
  const weapon = weaponBySlot(p.weaponSlot);
  if(state.floorDef.special?.kind === 'ninjaRound' && weapon.id !== 'melee' && weapon.id !== 'saber'){
    // disable ranged
  } else {
    if(input.isDown('shoot')){
      tryShoot(state, weapon);
    }
  }
  if(input.justPressed('shoot')){
    tryShoot(state, weapon);
  }
  if(input.justPressed('d')){
    if(weapon.id!=='melee'){ attemptMelee(state); }
  }
  if(input.justPressed(' ')){
    attemptInteract(state);
  }
}

function attemptInteract(state){
  const p = state.player;
  for(const chair of state.ecoHostages){
    if(!chair.freed && rectIntersect(p, chair)){
      chair.freed = true;
      freeHostage(state, chair.name);
    }
  }
}

function freeHostage(state, name){
  toast(`Freed ${name}! Loan reduced.`);
  state.player.loanBalance = Math.max(0, Math.ceil(state.player.loanBalance * 0.90));
  state.player.hostagesFreed++;
  state.hostages.taken = state.hostages.taken.filter(n=>n!==name);
  updateHUD(state);
}

function attemptMelee(state){
  const p = state.player;
  const now = performance.now();
  if(now - p.lastMelee < PLAYER_CONSTANTS.meleeCooldownMs) return;
  p.lastMelee = now;
  const reach = 36;
  const hitBox = { x: p.facing>0 ? p.x + p.w : p.x - reach, y:p.y, w:reach, h:p.h };
  for(const guard of state.guards){
    if(guard.hp>0 && rectIntersect(hitBox, guard)){
      guard.hp -= PLAYER_CONSTANTS.meleeDamage;
      if(guard.hp<=0){
        state.stats.kills++;
        if(guard.type==='boss'){ state.miniBossesRemaining = Math.max(0, state.miniBossesRemaining-1); }
      }
    }
  }
  playSound('melee');
}

function tryShoot(state, weapon){
  const now = performance.now();
  const p = state.player;
  if(now - p.lastShot < weapon.fireCooldown) return;
  if(weapon.ammoType === 'pistol'){
    if(p.pistolAmmo<=0){
      if(p.pistolReserve>0){
        const need = weapon.magazine - p.pistolAmmo;
        const take = Math.min(need, p.pistolReserve);
        p.pistolAmmo += take;
        p.pistolReserve -= take;
      }
      if(p.pistolAmmo<=0){ toast('Reload!'); return; }
    }
    p.pistolAmmo--;
  } else if(weapon.ammoType === 'fuel'){
    if(p.fuel<=0){ toast('Out of fuel'); return; }
    p.fuel--;
  } else if(weapon.ammoType === 'grenade'){
    if(p.grenadeAmmo<=0){ toast('No grenades'); return; }
    p.grenadeAmmo--;
  } else if(weapon.ammoType === 'machine'){
    if(p.machineAmmo<=0){ toast('No ammo'); return; }
    p.machineAmmo--;
  }
  p.lastShot = now;
  shootProjectile(state, weapon);
  updateHUD(state);
}

function shootProjectile(state, weapon){
  const p = state.player;
  const dir = p.facing;
  const bullet = {
    x: p.x + p.w/2,
    y: p.y + p.h/2,
    vx: dir * weapon.projectileSpeed,
    vy: 0,
    damage: weapon.damage,
    life: 1400,
    from:'player',
    radius: weapon.id==='grenade'? 20 : 4,
    blast: weapon.id==='grenade'
  };
  if(weapon.id==='flame'){
    for(let i=0;i<3;i++){
      state.bullets.push({
        ...bullet,
        vx: dir * (weapon.projectileSpeed*0.4 + Math.random()*60),
        vy: (Math.random()*120 - 60),
        damage: weapon.damage,
        life: 500,
        radius:5
      });
    }
  } else {
    state.bullets.push(bullet);
  }
  playSound(weapon.sound);
}

function updateBullets(state, dt){
  const bullets = state.bullets;
  const p = state.player;
  for(let i=bullets.length-1;i>=0;i--){
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt*1000;
    if(b.life<=0 || b.y<0 || b.y>660 || b.x<-40 || b.x>1220){ bullets.splice(i,1); continue; }
    if(b.from==='player'){
      for(const guard of state.guards){
        if(guard.hp>0 && circleRect(b, guard)){
          guard.hp -= b.damage;
          if(guard.hp<=0){
            state.stats.kills++;
            if(guard.type==='boss'){ state.miniBossesRemaining = Math.max(0, state.miniBossesRemaining-1); }
          }
          if(b.blast){
            for(const g2 of state.guards){
              if(dist(g2.x, g2.y, b.x, b.y) < 80){ g2.hp -= b.damage; }
            }
          }
          bullets.splice(i,1);
          break;
        }
      }
    } else {
      if(circleRect(b, p)){
        const dmg = b.big ? DAMAGE_VALUES.miniBossBullet : DAMAGE_VALUES.guardBullet;
        applyDamage(state, dmg);
        applyMoneyLoss(state, dmg);
        bullets.splice(i,1);
      }
    }
  }
}

function circleRect(c, rect){
  const cx = clamp(c.x, rect.x, rect.x + rect.w);
  const cy = clamp(c.y, rect.y, rect.y + rect.h);
  const dx = c.x - cx;
  const dy = c.y - cy;
  return (dx*dx + dy*dy) <= (c.radius*c.radius);
}

function dist(x1,y1,x2,y2){ const dx=x1-x2, dy=y1-y2; return Math.sqrt(dx*dx+dy*dy); }

function applyDamage(state, amount){
  const p = state.player;
  p.hp = Math.max(0, p.hp - amount);
  if(p.featherMs>0){
    p.featherMs = 0;
    p.feather = false;
  }
  playSound('hit');
  updateHUD(state);
  if(p.hp<=0){
    onPlayerDeath(state);
  }
}

function applyMoneyLoss(state, amount){
  const p = state.player;
  const loss = amount;
  if(p.savings>0){
    p.savings = Math.max(0, p.savings - loss);
  } else {
    p.loanBalance = Math.min(999999999, p.loanBalance + loss);
  }
  updateHUD(state);
}

function onPlayerDeath(state){
  state.stats.deaths++;
  state.paused = true;
  setTimeout(()=>{
    const choice = confirm('Refinance with a cosigner?\nDebt will DOUBLE and a family member is taken hostage.');
    if(choice){
      state.stats.refinances++;
      state.player.loanBalance = Math.min(999999999, state.player.loanBalance * 2);
      const name = nextHostageName();
      toast(`Cosigner added: ${name}. Debt doubled.`);
      state.player.hp = Math.max(10, PLAYER_CONSTANTS.startHp);
      state.player.savings = 0;
      state.paused=false;
      setupFloor(state, state.floor);
    } else {
      Game.endRun('defeat');
    }
  }, 200);
}

function updateGuards(state, dt){
  const p = state.player;
  for(const guard of state.guards){
    if(guard.hp<=0) continue;
    guard.x += guard.vx * dt;
    guard.y += guard.vy * dt;
    if(guard.x<80 || guard.x>1040){ guard.vx *= -1; }
    const distX = Math.abs(guard.x - p.x);
    if(p.vy>0 && p.y + p.h <= guard.y + 10 && rectIntersect(p, guard)){
      guard.hp -= PLAYER_CONSTANTS.stompDamage;
      p.vy = -PLAYER_CONSTANTS.jumpSpeed * 0.6;
      if(guard.hp<=0){ state.stats.kills++; }
      continue;
    }
    if(guard.type==='ninja'){
      if(Math.random()<0.02){ guard.vy = -300; }
      if(distX<60 && rectIntersect(guard, p)){
        applyDamage(state, DAMAGE_VALUES.touch);
      }
    } else {
      if(distX<600){
        tryGuardShoot(state, guard);
      }
      if(rectIntersect(guard, p)){
        applyDamage(state, DAMAGE_VALUES.touch);
      }
    }
  }
}

function tryGuardShoot(state, guard){
  const now = performance.now();
  const cooldown = guard.type==='auto'?160 : guard.type==='launcher'?1200 : guard.type==='boss'?600 : 700;
  if(now - guard.lastShot < cooldown) return;
  guard.lastShot = now;
  const speed = guard.type==='launcher'? 320 : 420;
  const damage = guard.type==='boss'? DAMAGE_VALUES.miniBossBullet : DAMAGE_VALUES.guardBullet;
  state.bullets.push({
    x: guard.x + guard.w/2,
    y: guard.y + guard.h/2,
    vx: guard.x < state.player.x ? speed : -speed,
    vy: 0,
    damage,
    life: 1600,
    from: guard.type==='boss'?'mini':'guard',
    big: guard.type==='boss',
    radius:6
  });
}

function checkPickups(state){
  const p = state.player;
  for(let i=state.pickups.length-1;i>=0;i--){
    const item = state.pickups[i];
    if(rectIntersect(p,item)){
      state.pickups.splice(i,1);
      if(item.type==='cash'){
        applyCash(state, item.amount);
        toast(`+$${item.amount}`);
      }
      if(item.type==='ammo'){
        p.pistolReserve += item.amount;
      }
      if(item.type==='intel'){
        p.intel++;
        toast('Intel +1');
      }
      if(item.type==='file'){
        p.files++;
        toast('File +1');
      }
      if(item.type==='specialFile'){
        p.specialFiles = Math.min(10, p.specialFiles+1);
        toast(`Special File ${p.specialFiles}/10`);
      }
      if(item.type==='feather'){
        p.feather = true;
        p.featherMs = 10000;
        toast('Feather flight!');
      }
      updateHUD(state);
    }
  }
}

function applyCash(state, amount){
  const p = state.player;
  if(p.savings < p.savingsMax){
    const take = Math.min(amount, p.savingsMax - p.savings);
    p.savings += take;
    amount -= take;
  }
  if(amount>0){
    p.loanBalance = Math.max(0, p.loanBalance - amount);
  }
  updateHUD(state);
}

function checkFeatherCancel(state){
  const p = state.player;
  if(!p.feather) return;
  if(p.featherMs<=0) return;
  if(state.player.hp < state.player.hpMax && p.featherMs>0){
    // remains
  }
}

function updateEcoHostages(state, dt){
  if(!state.ecoHostages) return;
  for(const chair of state.ecoHostages){
    if(chair.freed) continue;
    chair.timerMs -= dt;
    if(chair.timerMs<=0){
      chair.freed = true;
      toast(`${chair.name} was taken away…`);
    }
  }
}

function render(state){
  ctx.fillStyle = state.floorDef?.colors?.bg || '#050810';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  if(!state.floorDef) return;
  ctx.fillStyle = state.floorDef.colors.mid;
  for(const plat of state.floorDef.platforms){
    ctx.fillRect(plat.x - 40, plat.y, plat.w, plat.h || 16);
  }
  const p = state.player;
  ctx.fillStyle = '#7be6ff';
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = '#ff6b81';
  for(const guard of state.guards){
    if(guard.hp>0){ ctx.fillRect(guard.x, guard.y, guard.w, guard.h); }
  }
  ctx.fillStyle = '#ffd154';
  for(const item of state.pickups){
    ctx.fillRect(item.x, item.y, item.w, item.h);
  }
  ctx.fillStyle = '#b455ff';
  for(const chair of state.ecoHostages || []){
    if(!chair) continue;
    ctx.globalAlpha = chair.freed ? 0.3 : 1;
    ctx.fillRect(chair.x, chair.y, chair.w, chair.h);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#fff';
  for(const b of state.bullets){
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
    ctx.fill();
  }
}

function buildMapPanel(def){
  mapPanel.innerHTML='';
  for(let i=36;i>=1;i--){
    const div = document.createElement('div');
    div.className = 'floor' + (Game.state.floor===i?' current':'');
    div.textContent = `Floor ${i}`;
    div.addEventListener('click', ()=>{ mapPanel.classList.add('hidden'); Game.state.mapOpen=false; });
    mapPanel.appendChild(div);
  }
}

function renderMapPanel(state){
  const children = mapPanel.querySelectorAll('.floor');
  children.forEach((node, idx)=>{
    const floor = 36-idx;
    node.classList.toggle('current', floor===state.floor);
  });
}

function tryPeacefulEnding(state){
  const p = state.player;
  if(p.loanBalance<=0 && p.hp>=p.hpMax && p.savings>=p.savingsMax){
    state.ceoPassive = true;
    state.playerWeaponsDisabled = true;
    state.paused = true;
    toast('CEO offers grad school.');
    showBanner('YOU BEAT STUDENT LOANS', 10000);
    setTimeout(()=>Game.endRun('peaceful'), 10000);
    return true;
  }
  return false;
}

function attemptRefinanceQTE(state){
  const rounds = 5;
  let success = 0;
  for(let i=0;i<rounds;i++){
    const letter = String.fromCharCode(65 + Math.floor(Math.random()*26));
    const answer = prompt(`Refinance prompt ${i+1}/${rounds}: type ${letter}`);
    if(answer && answer.trim().toUpperCase()===letter){ success++; }
  }
  if(success>=4){
    state.player.loanBalance = Math.ceil(state.player.loanBalance * 0.5);
    Game.endRun('refinance');
    return true;
  }
  return false;
}

Menu.init();

