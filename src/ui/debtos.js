const TEMPLATE = `
<div id="debtosOverlay" class="debtos-overlay hidden" role="dialog" aria-modal="true">
  <div class="debtos-shell">
    <div class="debtos-screen debtos-login" data-screen="login">
      <div class="debtos-card">
        <h2>DebtOS Login</h2>
        <label class="debtos-field">Username<input id="debtosUser" type="text" placeholder="User" /></label>
        <label class="debtos-field">Password<input id="debtosPass" type="password" placeholder="********" /></label>
        <button id="debtosLoginBtn" class="debtos-btn">Log In</button>
        <p class="debtos-foot">Any credentials will work. Logging in accepts the terms of the system.</p>
      </div>
    </div>
    <div class="debtos-screen debtos-loading hidden" data-screen="loading">
      <div class="debtos-card">
        <h3>Loading DebtOS…</h3>
        <p id="debtosLoadingMsg" class="debtos-sub">Retrieving financial data…</p>
        <div class="debtos-bar"><div id="debtosBarFill"></div></div>
      </div>
    </div>
    <div class="debtos-screen debtos-os hidden" data-screen="os">
      <div class="debtos-top">
          <div class="debtos-row"><span id="debtosAvatar" class="debtos-avatar">🙂</span><div>
          <div class="debtos-title">DebtOS v6 — "You Cannot Log Out"</div>
          <div class="debtos-sub">Level 27 mission terminal</div>
        </div></div>
        <div class="debtos-row debtos-gap">
          <span class="debtos-pill">Clock <span id="debtosClock">08:00</span></span>
          <button id="debtosLogout" class="debtos-btn muted">Log out</button>
        </div>
      </div>
      <div class="debtos-body">
        <aside class="debtos-side">
          <div class="debtos-panel">
            <div class="debtos-label">Debt linked to Loan Tower</div>
            <div id="debtosDebt" class="debtos-big">$-120,000</div>
            <div class="debtos-note" id="debtosSyncStatus">Synced</div>
          </div>
          <div class="debtos-panel">
            <div class="debtos-label">Mental load</div>
            <div class="debtos-meter"><span>Money anxiety</span><div class="debtos-meter-track"><div id="debtosAnxiety"></div></div></div>
            <div class="debtos-meter"><span>Depression</span><div class="debtos-meter-track"><div id="debtosDepression"></div></div></div>
            <div class="debtos-meter"><span>Family / social strain</span><div class="debtos-meter-track"><div id="debtosSocial"></div></div></div>
          </div>
        </aside>
        <main class="debtos-main">
          <div class="debtos-panel">
            <div class="debtos-label">Prompt</div>
            <p id="debtosPrompt" class="debtos-sub">Pay down whatever you can before the battery dies.</p>
            <div class="debtos-actions">
              <button class="debtos-btn primary" data-action="pay" data-amount="500">Pay $500</button>
              <button class="debtos-btn" data-action="pay" data-amount="250">Pay $250</button>
              <button class="debtos-btn" data-action="message">Send hardship message</button>
              <button class="debtos-btn" data-action="refi">Request refinance</button>
            </div>
          </div>
          <div class="debtos-grid" id="debtosGrid">
            <div class="debtos-card" data-action="clickable">Read servicer email</div>
            <div class="debtos-card" data-action="clickable">Toggle anxiety tracker</div>
            <div class="debtos-card" data-action="clickable">Click through disclosures</div>
            <div class="debtos-card" data-action="clickable">Submit monthly report</div>
          </div>
          <div class="debtos-log" id="debtosLog" aria-live="polite"></div>
        </main>
      </div>
    </div>
    <div id="debtosLowBattery" class="debtos-popup hidden" role="alertdialog" aria-modal="true">
      <div class="debtos-card">
        <h3>Low battery</h3>
        <p id="debtosBatteryMsg">Battery at 5%. Save whatever you can.</p>
      </div>
    </div>
    <div id="debtosPowerdown" class="debtos-popup hidden" role="alert">
      <div class="debtos-card center">
        <h2>Powering down…</h2>
        <p>DebtOS slips into darkness.</p>
      </div>
    </div>
  </div>
</div>`;

const STYLE = `
.debtos-overlay { position:fixed; inset:0; background:rgba(2,6,23,0.92); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:120; }
.debtos-overlay.hidden { display:none; }
.debtos-shell { width:min(1200px, 96vw); height:min(700px, 92vh); background:#020617; color:#e5e7eb; border:1px solid #1f2937; border-radius:12px; box-shadow:0 24px 80px rgba(0,0,0,0.65); overflow:hidden; position:relative; font-family:system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.debtos-screen { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:20px; }
.debtos-screen.hidden { display:none; }
.debtos-card { background:#0b1120; border:1px solid #1f2937; border-radius:10px; padding:16px 18px; box-shadow:0 16px 32px rgba(0,0,0,0.45); width:100%; max-width:420px; }
.debtos-card.center { text-align:center; max-width:520px; }
.debtos-card h2, .debtos-card h3 { margin:0 0 8px; }
.debtos-field { display:flex; flex-direction:column; gap:4px; margin-bottom:8px; font-size:12px; color:#9ca3af; }
.debtos-field input { padding:8px 10px; border-radius:6px; border:1px solid #374151; background:#111827; color:#e5e7eb; }
.debtos-btn { padding:8px 12px; border-radius:6px; border:1px solid #4b5563; background:#0f172a; color:#f9fafb; cursor:pointer; font-size:12px; }
.debtos-btn:hover { border-color:#cbd5e1; }
.debtos-btn.primary { background:#1d4ed8; border-color:#93c5fd; }
.debtos-btn.muted { background:#111827; border-color:#374151; }
.debtos-foot { font-size:11px; color:#6b7280; margin:8px 0 0; }
.debtos-loading .debtos-card { max-width:360px; text-align:center; }
.debtos-bar { width:100%; height:14px; border:1px solid #374151; border-radius:999px; overflow:hidden; background:#020617; }
#debtosBarFill { height:100%; width:0; background:linear-gradient(90deg, #22c55e, #3b82f6, #a855f7); transition:width 0.08s linear; }
.debtos-os { flex-direction:column; align-items:stretch; }
.debtos-top { padding:16px; display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid #111827; }
.debtos-row { display:flex; gap:10px; align-items:center; }
.debtos-gap { gap:8px; }
.debtos-avatar { width:40px; height:40px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; background:#1d4ed8; font-size:20px; }
.debtos-title { font-weight:700; }
.debtos-sub { font-size:12px; color:#9ca3af; margin:4px 0; }
.debtos-pill { padding:6px 10px; background:#0b1120; border:1px solid #1f2937; border-radius:999px; font-size:12px; }
.debtos-body { display:grid; grid-template-columns:260px 1fr; height:100%; min-height:0; }
.debtos-side { padding:16px; border-right:1px solid #111827; display:flex; flex-direction:column; gap:12px; background:#0b1120; }
.debtos-main { padding:16px; overflow:auto; display:flex; flex-direction:column; gap:12px; }
.debtos-panel { background:#0b1120; border:1px solid #1f2937; border-radius:10px; padding:12px; }
.debtos-label { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:#9ca3af; }
.debtos-big { font-size:26px; font-weight:700; margin-top:6px; }
.debtos-note { font-size:11px; color:#6b7280; margin-top:4px; }
.debtos-meter { display:flex; flex-direction:column; gap:4px; margin-top:8px; font-size:11px; }
.debtos-meter-track { width:100%; height:8px; border-radius:999px; background:#111827; overflow:hidden; border:1px solid #1f2937; }
.debtos-meter-track div { height:100%; width:30%; background:linear-gradient(90deg,#22c55e,#f97316,#ef4444); transition:width 0.2s ease; }
.debtos-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.debtos-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; }
.debtos-card[data-action] { padding:10px; border-radius:8px; border:1px solid #1f2937; background:#0f172a; cursor:pointer; transition:background 0.15s ease, border-color 0.15s ease; }
.debtos-card[data-action]:hover { background:#111827; border-color:#2c3a50; }
.debtos-log { background:#020617; border:1px solid #111827; border-radius:10px; padding:10px; min-height:120px; max-height:200px; overflow-y:auto; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:12px; }
.debtos-log-line { margin-bottom:4px; }
.debtos-log-line.good { color:#bbf7d0; }
.debtos-log-line.bad { color:#fecaca; }
.debtos-popup { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.72); z-index:5; }
.debtos-popup.hidden { display:none; }
@media(max-width: 960px){ .debtos-body { grid-template-columns:1fr; } .debtos-shell { height:90vh; } }
`;

const defaultSession = () => ({
  username: 'User',
  clicks: 0,
  clock: 8,
  debt: -120000,
  anxiety: 40,
  depression: 30,
  social: 35,
  loggedIn: false,
  batteryLow: false,
  shutdown: false,
  batteryClocksLeft: 4,
  log: []
});

let savedSession = null;
let overlay, barFill, loadingMsg, screens, logEl, clicksEl, clockEl, debtEl, syncStatusEl, anxietyEl, depressionEl, socialEl, promptEl;
let mode = 'prologue';
let onComplete = () => {};
let getLoanBalance = () => 120000;
let setLoanBalance = () => {};
let session = defaultSession();

function ensureOverlay(){
  if(overlay) return;
  const container = document.createElement('div');
  container.innerHTML = TEMPLATE;
  overlay = container.firstElementChild;
  document.body.appendChild(overlay);
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  screens = {
    login: overlay.querySelector('[data-screen="login"]'),
    loading: overlay.querySelector('[data-screen="loading"]'),
    os: overlay.querySelector('[data-screen="os"]')
  };
  barFill = document.getElementById('debtosBarFill');
  loadingMsg = document.getElementById('debtosLoadingMsg');
  logEl = document.getElementById('debtosLog');
  clicksEl = document.getElementById('debtosClicks');
  clockEl = document.getElementById('debtosClock');
  debtEl = document.getElementById('debtosDebt');
  syncStatusEl = document.getElementById('debtosSyncStatus');
  anxietyEl = document.getElementById('debtosAnxiety');
  depressionEl = document.getElementById('debtosDepression');
  socialEl = document.getElementById('debtosSocial');
  promptEl = document.getElementById('debtosPrompt');

  overlay.querySelector('#debtosLoginBtn')?.addEventListener('click', handleLogin);
  overlay.querySelector('#debtosLogout')?.addEventListener('click', handleLogout);

  overlay.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if(!btn) return;
    const action = btn.dataset.action;
    if(action === 'pay'){
      const amount = Number(btn.dataset.amount||0) || 0;
      handlePayment(amount);
    } else if(action === 'message'){
      logLine('You send a hardship message. A bot replies with empathy macros.', 'good');
      registerClick();
    } else if(action === 'refi'){
      logLine('Refinance desk cycles through options. None change the math.', 'bad');
      registerClick();
    } else if(action === 'clickable'){
      logLine('You click through yet another prompt.', 'system');
      registerClick();
    }
  });
}

function setScreen(name){
  Object.entries(screens).forEach(([key, node]) => {
    if(node){ node.classList.toggle('hidden', key !== name); }
  });
}

function fmtMoney(v){
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(Math.round(v));
  return `${sign}$${abs.toLocaleString()}`;
}

function updateStats(){
  if(clicksEl){ clicksEl.textContent = `${session.clicks}`; }
  const hour = String(session.clock).padStart(2,'0');
  clockEl.textContent = `${hour}:00`;
  debtEl.textContent = fmtMoney(session.debt);
  syncStatusEl.textContent = 'Linked to main loan balance';
  anxietyEl.style.width = `${Math.max(0, Math.min(100, session.anxiety))}%`;
  depressionEl.style.width = `${Math.max(0, Math.min(100, session.depression))}%`;
  socialEl.style.width = `${Math.max(0, Math.min(100, session.social))}%`;
}

function updateBatteryPopup(){
  const popup = document.getElementById('debtosLowBattery');
  const msg = document.getElementById('debtosBatteryMsg');
  if(!popup || !msg) return;
  if(!session.batteryLow){
    popup.classList.add('hidden');
    return;
  }
  const ticks = session.batteryClocksLeft;
  msg.textContent = ticks > 0
    ? `Battery at 5%. ${ticks} clock${ticks===1?'':'s'} until power off.`
    : 'Battery at 5%. Powering down now.';
  popup.classList.remove('hidden');
}

function logLine(msg, type='system'){
  const div = document.createElement('div');
  div.className = `debtos-log-line ${type}`;
  div.textContent = msg;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  session.log.push({ msg, type });
}

function replayLog(){
  logEl.textContent = '';
  (session.log||[]).forEach(({msg,type}) => logLine(msg, type));
}

function syncDebtFromGame(){
  const debt = getLoanBalance ? getLoanBalance() : 120000;
  session.debt = -Math.max(0, Math.round(debt));
  updateStats();
}

function applyDebtToGame(){
  const next = Math.max(0, Math.round(Math.abs(session.debt)));
  if(setLoanBalance){ setLoanBalance(next); }
}

function handleLogin(){
  session.username = document.getElementById('debtosUser')?.value?.trim() || session.username || 'User';
  session.loggedIn = true;
  savedSession = { ...session };
  setScreen('loading');
  runLoadingSequence();
}

function runLoadingSequence(){
  barFill.style.width = '0%';
  const messages = [
    'Retrieving financial data…',
    'Checking credit markets…',
    'Syncing with loan servicer API…',
    'Rendering dashboards…',
    'Optimizing anxiety curves…'
  ];
  let idx = 0;
  loadingMsg.textContent = messages[0];
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(100, progress + 5);
    barFill.style.width = `${progress}%`;
    if(progress % 20 === 0 && idx < messages.length-1){
      idx++;
      loadingMsg.textContent = messages[idx];
    }
    if(progress >= 100){
      clearInterval(timer);
      launchOS();
    }
  }, 80);
}

function launchOS(){
  setScreen('os');
  syncDebtFromGame();
  replayLog();
  promptEl.textContent = 'Pay down whatever you can before the battery dies.';
  logLine('DebtOS session active. Loan feed connected to Loan Tower.', 'system');
  updateStats();
  updateBatteryPopup();
}

function handlePayment(amount){
  if(amount <= 0){ return; }
  const before = Math.abs(session.debt);
  const next = Math.max(0, before - amount);
  session.debt = -next;
  applyDebtToGame();
  logLine(`Payment sent: $${amount.toLocaleString()}. Balance now ${fmtMoney(session.debt)}.`, 'good');
  registerClick();
  updateStats();
}

function registerClick(){
  session.clicks += 1;
  session.clock = Math.min(23, session.clock + 1);
  updateStats();
  savedSession = { ...session };
  const triggeredNow = (!session.batteryLow && mode === 'prologue' && session.clicks >= 10);
  if(triggeredNow){
    triggerLowBattery();
    return;
  }
  if(session.batteryLow && !session.shutdown){
    stepLowBatteryClock();
  }
}

function triggerLowBattery(){
  session.batteryLow = true;
  session.batteryClocksLeft = 4;
  updateBatteryPopup();
  savedSession = { ...session };
  logLine('Low battery warning. Device will power down soon.', 'bad');
}

function stepLowBatteryClock(){
  if(session.batteryClocksLeft > 0){
    session.batteryClocksLeft -= 1;
    updateBatteryPopup();
    savedSession = { ...session };
  }
  if(session.batteryClocksLeft <= 0){
    triggerPowerdown();
  }
}

function triggerPowerdown(){
  session.shutdown = true;
  savedSession = { ...session };
  const pd = document.getElementById('debtosPowerdown');
  pd?.classList.remove('hidden');
  logLine('DebtOS powers down.', 'bad');
  setTimeout(() => finishMission('powerdown'), 1200);
}

function handleLogout(){
  logLine('You log out. The tower elevator pings for the next floor.', 'system');
  session.loggedIn = false;
  savedSession = { ...session };
  finishMission('logout');
}

function finishMission(reason){
  document.getElementById('debtosLowBattery')?.classList.add('hidden');
  document.getElementById('debtosPowerdown')?.classList.add('hidden');
  overlay.classList.add('hidden');
  onComplete?.(reason, { session: { ...session } });
}

function restoreSession(){
  session = savedSession ? { ...defaultSession(), ...savedSession } : defaultSession();
  document.getElementById('debtosUser').value = session.username || 'User';
  document.getElementById('debtosPass').value = '';
}

export function startDebtOSMission(options={}){
  ensureOverlay();
  mode = options.mode || 'prologue';
  onComplete = typeof options.onComplete === 'function' ? options.onComplete : () => {};
  getLoanBalance = options.getLoanBalance || getLoanBalance;
  setLoanBalance = options.setLoanBalance || setLoanBalance;
  restoreSession();
  syncDebtFromGame();
  updateStats();
  updateBatteryPopup();
  overlay.classList.remove('hidden');
  setScreen('login');
  logEl.textContent = '';
  if(session.log?.length){ replayLog(); }
  if(mode === 'level27' && session.shutdown){
    logLine('System recovered from earlier shutdown. Battery replaced.', 'system');
    session.batteryLow = false;
    session.shutdown = false;
    session.batteryClocksLeft = 4;
    savedSession = { ...session };
  }
}

export function getDebtOSState(){
  return { ...session };
}
