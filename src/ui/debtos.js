const OVERLAY_HTML = `
<div id="debtosOverlay" class="debtos-overlay hidden" role="dialog" aria-modal="true">
  <div class="debtos-frame">
    <iframe id="debtosFrame" title="DebtOS mission" src="" allow="autoplay"></iframe>
    <div class="debtos-frame-actions">
      <button id="debtosCloseBtn" class="debtos-close">Return to tower</button>
    </div>
  </div>
</div>`;

const OVERLAY_STYLE = `
#debtosOverlay { position:fixed; inset:0; background:rgba(2,6,23,0.9); backdrop-filter:blur(8px); z-index:120; display:flex; align-items:center; justify-content:center; padding:16px; }
#debtosOverlay.hidden { display:none; }
.debtos-frame { position:relative; width: min(1200px, 98vw); height: min(900px, 96vh); background:#000; border:1px solid #1f2937; border-radius:12px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.65); display:flex; flex-direction:column; }
.debtos-frame iframe { flex:1 1 auto; border:none; width:100%; height:100%; background:#020617; }
.debtos-frame-actions { display:flex; justify-content:flex-end; padding:8px; background:rgba(2,6,23,0.8); border-top:1px solid #111827; }
.debtos-close { padding:8px 12px; border-radius:8px; border:1px solid #4b5563; background:#0b1120; color:#f9fafb; cursor:pointer; font-size:12px; }
.debtos-close:hover { border-color:#cbd5e1; }
`;

let overlay;
let frameEl;
let onComplete = () => {};
let frameVersion = 0;

function ensureOverlay(){
  if(overlay) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = OVERLAY_HTML;
  overlay = wrapper.firstElementChild;
  document.body.appendChild(overlay);
  const style = document.createElement('style');
  style.textContent = OVERLAY_STYLE;
  document.head.appendChild(style);
  frameEl = overlay.querySelector('#debtosFrame');
  overlay.querySelector('#debtosCloseBtn')?.addEventListener('click', () => finishMission('closed'));
  window.addEventListener('message', handleMessageFromFrame);
}

function handleMessageFromFrame(ev){
  if(!ev?.data || typeof ev.data !== 'object') return;
  if(ev.data.type === 'debtosComplete'){
    finishMission(ev.data.reason || 'complete');
  }
}

function resetFrame(){
  if(!frameEl) return;
  frameVersion += 1;
  const src = `src/ui/debtos_full.html?v=${frameVersion}`;
  frameEl.src = src;
}

function finishMission(reason){
  if(!overlay) return;
  overlay.classList.add('hidden');
  onComplete?.(reason || 'complete', { frameVersion });
}

export function startDebtOSMission(options={}){
  ensureOverlay();
  onComplete = typeof options.onComplete === 'function' ? options.onComplete : () => {};
  resetFrame();
  overlay.classList.remove('hidden');
  frameEl?.focus();
}

export function getDebtOSState(){
  return {
    visible: overlay ? !overlay.classList.contains('hidden') : false,
    frameVersion
  };
}
