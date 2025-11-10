(() => {
  const LS = {
    name: 'loanTower.nickname',
    board: 'loanTower.leaderboard'
  };

  const Leaderboard = {
    maxRows: 100,
    tbody: null,
    emptyEl: null,
    panel: null,
    _load() {
      try {
        const raw = localStorage.getItem(LS.board);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn('Failed to load leaderboard', err);
        return [];
      }
    },
    _save(rows) {
      try {
        localStorage.setItem(LS.board, JSON.stringify(rows.slice(0, this.maxRows)));
      } catch (err) {
        console.warn('Failed to save leaderboard', err);
      }
    },
    init(panel) {
      this.panel = panel;
      this.tbody = panel.querySelector('tbody');
      this.emptyEl = document.getElementById('boardEmpty');
      this.render();
    },
    addRun({ name, timeMs, loanRemaining, kills, deaths, refinances }) {
      const rows = this._load();
      rows.push({
        name,
        timeMs: Number.isFinite(timeMs) ? timeMs : 0,
        loanRemaining: Number.isFinite(loanRemaining) ? loanRemaining : 0,
        kills: Number.isFinite(kills) ? kills : 0,
        deaths: Number.isFinite(deaths) ? deaths : 0,
        refinances: Number.isFinite(refinances) ? refinances : 0,
        ts: Date.now()
      });
      rows.sort((a, b) => {
        if (a.loanRemaining !== b.loanRemaining) return a.loanRemaining - b.loanRemaining;
        if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
        if (a.kills !== b.kills) return b.kills - a.kills;
        if (a.deaths !== b.deaths) return a.deaths - b.deaths;
        return a.refinances - b.refinances;
      });
      this._save(rows);
      this.render();
    },
    render() {
      if (!this.tbody) return;
      const rows = this._load();
      if (this.emptyEl) {
        this.emptyEl.style.display = rows.length ? 'none' : 'block';
      }
      this.tbody.textContent = '';
      rows.slice(0, this.maxRows).forEach((row, idx) => {
        const tr = document.createElement('tr');
        const cells = [
          idx + 1,
          row.name || 'Player',
          fmtTime(row.timeMs || 0),
          fmtMoney(row.loanRemaining || 0),
          row.kills ?? 0,
          row.deaths ?? 0,
          row.refinances ?? 0
        ];
        cells.forEach((val, i) => {
          const td = document.createElement('td');
          if (i === 1) td.classList.add('nm');
          td.textContent = String(val);
          tr.appendChild(td);
        });
        this.tbody.appendChild(tr);
      });
    }
  };

  function fmtTime(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function fmtMoney(value) {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(Math.round(value));
    return `${sign}$${abs.toLocaleString()}`;
  }

  function setupMenu() {
    const menu = document.getElementById('menu');
    const gameShell = document.getElementById('gameShell');
    const boardPanel = document.getElementById('boardPanel');
    if (!menu || !gameShell || !boardPanel) return;

    const nameInput = document.getElementById('playerName');
    const rememberBox = document.getElementById('rememberName');
    const startBtn = document.getElementById('btnStart');
    const boardBtn = document.getElementById('btnBoard');
    const closeBoardBtn = document.getElementById('btnBoardClose');
    const warn = document.getElementById('nameWarn');

    Leaderboard.init(boardPanel);

    const savedName = localStorage.getItem(LS.name) || '';
    if (savedName) {
      nameInput.value = savedName;
      startBtn.disabled = false;
      rememberBox.checked = true;
    }

    function menuVisible() {
      return !menu.classList.contains('hidden');
    }

    function showMenu() {
      menu.classList.remove('hidden');
      gameShell.classList.add('hidden');
      boardPanel.classList.add('hidden');
    }

    function hideMenu() {
      menu.classList.add('hidden');
      gameShell.classList.remove('hidden');
      boardPanel.classList.add('hidden');
    }

    function toggleBoard() {
      if (!menuVisible()) return;
      const hidden = boardPanel.classList.contains('hidden');
      if (hidden) {
        Leaderboard.render();
        boardPanel.classList.remove('hidden');
      } else {
        boardPanel.classList.add('hidden');
      }
    }

    function validate() {
      const name = nameInput.value.trim();
      const ok = name.length > 0;
      startBtn.disabled = !ok;
      warn.textContent = ok ? '' : 'Enter a nickname to begin.';
      return ok;
    }

    function startGame() {
      if (!validate()) return;
      const trimmed = nameInput.value.trim();
      if (rememberBox.checked) {
        localStorage.setItem(LS.name, trimmed);
      } else {
        localStorage.removeItem(LS.name);
      }
      if (window.LoanTowerBridge && typeof window.LoanTowerBridge.startRun === 'function') {
        hideMenu();
        window.LoanTowerBridge.startRun(trimmed);
      }
    }

    nameInput.addEventListener('input', validate);
    startBtn.addEventListener('click', startGame);
    boardBtn.addEventListener('click', toggleBoard);
    closeBoardBtn.addEventListener('click', toggleBoard);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && menuVisible() && !startBtn.disabled) {
        event.preventDefault();
        startGame();
      }
      if (event.key && event.key.toLowerCase() === 'l' && menuVisible()) {
        event.preventDefault();
        toggleBoard();
      }
      if (event.key === 'Escape' && !boardPanel.classList.contains('hidden')) {
        boardPanel.classList.add('hidden');
      }
    });

    window.addEventListener('loanTower:end', (ev) => {
      const detail = ev.detail || {};
      const runnerName = detail.name || nameInput.value.trim() || savedName || 'Player';
      Leaderboard.addRun({
        name: runnerName,
        timeMs: detail.timeMs ?? 0,
        loanRemaining: detail.loanRemaining ?? 0,
        kills: detail.kills ?? 0,
        deaths: detail.deaths ?? 0,
        refinances: detail.refinances ?? 0
      });
      showMenu();
      validate();
    });

    // Initial state
    showMenu();
    validate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMenu);
  } else {
    setupMenu();
  }
})();
