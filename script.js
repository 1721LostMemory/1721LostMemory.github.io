const COLS = 10;
const ROWS = 14;
const TOTAL_CELLS = COLS * ROWS;
const PAIR_COUNT = TOTAL_CELLS / 2;
const DRAG_START_THRESHOLD = 8;
const AUTO_CLEAR_FLASH_MS = 220;
const HINT_SHOW_MS = 1100;
const TYPE_DANCE_MS = 420;
const BATTLE_COUNTDOWN_MS = 3000;
const MODE_ENDLESS = "endless";
const MODE_BATTLE = "battle";

const TILE_TYPES = [
  "🍎", "🍊", "🍋", "🍉", "🍇", "🍓", "🍑", "🥝",
  "🍍", "🥭", "🍒", "🍐", "🥥", "🥕", "🌽", "🍅",
  "🍆", "🍔", "🍕", "🍩", "🍪", "🧃", "🍵", "🧊"
];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("statusText");
const hintBtn = document.getElementById("hintBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const restartBtn = document.getElementById("restartBtn");
const musicBtn = document.getElementById("musicBtn");
const resultModalEl = document.getElementById("resultModal");
const resultTitleEl = document.getElementById("resultTitle");
const resultBodyEl = document.getElementById("resultBody");
const resultActionBtn = document.getElementById("resultActionBtn");
const homeScreenEl = document.getElementById("homeScreen");
const gameScreenEl = document.getElementById("gameScreen");
const homeEndlessBtn = document.getElementById("homeEndlessBtn");
const homeBattleBtn = document.getElementById("homeBattleBtn");
const backHomeBtn = document.getElementById("backHomeBtn");
const battlePanelEl = document.getElementById("battlePanel");
const createBattleBtn = document.getElementById("createBattleBtn");
const shareBattleBtn = document.getElementById("shareBattleBtn");
const copyBattleLinkBtn = document.getElementById("copyBattleLinkBtn");
const startBattleBtn = document.getElementById("startBattleBtn");
const battleLinkInput = document.getElementById("battleLinkInput");
const battleStatusEl = document.getElementById("battleStatusText");
const battleTimerEl = document.getElementById("battleTimer");
const launchParams = new URLSearchParams(window.location.search);
const launchMode = launchParams.get("mode");
const launchHostId = launchParams.get("host");
const launchSeed = launchParams.get("seed");

let nextTileId = 1;
let cachedCellSizePx = 0;
let renderScheduled = false;
let pendingFullRender = true;
const tileElementById = new Map();

class BackgroundMusic {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.loopTimeout = null;
    this.isRunning = false;
    this.step = 0;
    this.rootProgression = [220.0, 246.94, 196.0, 174.61];
    this.melodyPattern = [0, 3, 5, 7, 5, 3, 2, 0];
  }

  ensureContext() {
    if (this.ctx) {
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);
  }

  start() {
    this.ensureContext();
    if (!this.ctx || this.isRunning) {
      return;
    }
    this.ctx.resume();
    this.isRunning = true;
    this.scheduleNextBar(0);
  }

  scheduleNextBar(delayMs) {
    if (!this.isRunning) {
      return;
    }
    this.loopTimeout = setTimeout(() => {
      if (!this.isRunning) {
        return;
      }
      this.playBar();
      this.scheduleNextBar(1450);
    }, delayMs);
  }

  playBar() {
    if (!this.ctx || !this.master) {
      return;
    }
    const now = this.ctx.currentTime + 0.02;
    const root = this.rootProgression[this.step % this.rootProgression.length];
    const melodyOffset = this.melodyPattern[this.step % this.melodyPattern.length];
    const melody = root * Math.pow(2, melodyOffset / 12);

    this.playTone(now, root, 1.18, "sine", 0.04, 0.2);
    this.playTone(now + 0.03, root * 1.4983, 1.05, "triangle", 0.03, 0.18);
    this.playTone(now + 0.34, melody, 0.26, "triangle", 0.04, 0.09);
    if (this.step % 2 === 0) {
      this.playTone(now + 0.84, melody * 1.122, 0.22, "sine", 0.03, 0.08);
    }
    this.step += 1;
  }

  stop() {
    this.isRunning = false;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
  }

  playClickFx() {
    this.ensureContext();
    if (!this.ctx || !this.master) {
      return;
    }
    this.ctx.resume();
    const now = this.ctx.currentTime + 0.01;
    this.playTone(now, 520, 0.075, "sine", 0.08, 0.05);
    this.playTone(now + 0.06, 660, 0.08, "triangle", 0.065, 0.05);
  }

  playEliminateFx() {
    this.ensureContext();
    if (!this.ctx || !this.master) {
      return;
    }
    this.ctx.resume();
    const now = this.ctx.currentTime + 0.01;
    this.playTone(now, 392, 0.09, "triangle", 0.1, 0.06);
    this.playTone(now + 0.1, 523.25, 0.12, "sine", 0.085, 0.08);
  }

  playPickupFx(extraCount = 1) {
    this.ensureContext();
    if (!this.ctx || !this.master) {
      return;
    }
    this.ctx.resume();
    const count = Math.max(1, Math.min(extraCount, 4));
    const now = this.ctx.currentTime + 0.01;
    for (let i = 0; i < count; i += 1) {
      this.playTone(now + i * 0.04, 760 + i * 95, 0.055, "sine", 0.06, 0.04);
    }
  }

  playTone(startAt, frequency, duration, type, peakGain, release = 0.1) {
    if (!this.ctx || !this.master) {
      return;
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration + release);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(startAt);
    osc.stop(startAt + duration + release + 0.03);
  }
}

const state = {
  board: createEmptyBoard(),
  view: "home",
  mode: MODE_ENDLESS,
  drag: null,
  snapback: null,
  busy: false,
  boardLocked: false,
  gameOver: null,
  clickedTileId: null,
  shakeType: null,
  hintIds: new Set(),
  autoRemoveIds: new Set(),
  status: "拖拽后仅当起手选中卡片可消除时才生效。",
  hintTimer: null,
  clickTimer: null,
  resultType: null,
  musicEnabled: true,
  music: new BackgroundMusic(),
  battle: {
    role: null,
    seed: null,
    peer: null,
    connection: null,
    connected: false,
    inviteLink: "",
    myResult: null,
    opponentResult: null,
    timerRunning: false,
    timerStartTs: 0,
    timerElapsedMs: 0,
    timerRaf: null,
    countdownTimer: null
  }
};

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function setStatus(message) {
  state.status = message;
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.dataset.state = state.gameOver || "play";
  }
}

function showResultModal(type) {
  if (!resultModalEl || !resultTitleEl || !resultBodyEl || !resultActionBtn) {
    return;
  }
  state.resultType = type;
  if (type === "win") {
    resultTitleEl.textContent = "闯关成功";
    resultBodyEl.textContent = "本局卡片已全部清空，太棒了。";
    resultActionBtn.textContent = "再来一局";
  } else {
    resultTitleEl.textContent = "闯关失败";
    resultBodyEl.textContent = "当前已无可执行消除操作，本局结束。";
    resultActionBtn.textContent = "知道了";
  }
  resultModalEl.classList.add("show");
}

function hideResultModal() {
  state.resultType = null;
  if (resultModalEl) {
    resultModalEl.classList.remove("show");
  }
}

function inBounds(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

function shuffleArray(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSeed(input) {
  const text = String(input ?? "seed");
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function createSeededRandom(seedText) {
  let seed = hashSeed(seedText);
  return function seededRandom() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createShortId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function formatBattleMs(ms) {
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function setBattleStatus(message) {
  if (battleStatusEl) {
    battleStatusEl.textContent = message;
  }
}

function setBattleTimerText(ms = 0) {
  if (battleTimerEl) {
    battleTimerEl.textContent = formatBattleMs(ms);
  }
}

function stopBattleTimer() {
  const battle = state.battle;
  battle.timerRunning = false;
  if (battle.timerRaf) {
    cancelAnimationFrame(battle.timerRaf);
    battle.timerRaf = null;
  }
}

function tickBattleTimer() {
  const battle = state.battle;
  if (!battle.timerRunning) {
    return;
  }
  battle.timerElapsedMs = performance.now() - battle.timerStartTs;
  setBattleTimerText(battle.timerElapsedMs);
  battle.timerRaf = requestAnimationFrame(tickBattleTimer);
}

function startBattleTimer() {
  const battle = state.battle;
  stopBattleTimer();
  battle.timerRunning = true;
  battle.timerStartTs = performance.now();
  battle.timerElapsedMs = 0;
  setBattleTimerText(0);
  tickBattleTimer();
}

function clearBattleCountdown() {
  if (state.battle.countdownTimer) {
    clearTimeout(state.battle.countdownTimer);
    state.battle.countdownTimer = null;
  }
}

function resetBattleRoundData() {
  const battle = state.battle;
  clearBattleCountdown();
  stopBattleTimer();
  battle.myResult = null;
  battle.opponentResult = null;
  battle.timerElapsedMs = 0;
  setBattleTimerText(0);
}

function updateViewUi() {
  if (homeScreenEl) {
    homeScreenEl.hidden = state.view !== "home";
  }
  if (gameScreenEl) {
    gameScreenEl.hidden = state.view !== "game";
  }
}

function setView(view) {
  state.view = view;
  updateViewUi();
}

function updateModeUi() {
  const isBattle = state.mode === MODE_BATTLE;
  if (gameScreenEl) {
    gameScreenEl.classList.toggle("battle-mode", isBattle);
  }
  if (battlePanelEl) {
    battlePanelEl.hidden = !isBattle;
  }
}

function copyToClipboard(text) {
  if (!text) {
    return Promise.reject(new Error("empty"));
  }
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  if (!battleLinkInput) {
    return Promise.reject(new Error("no-input"));
  }
  battleLinkInput.value = text;
  battleLinkInput.select();
  const ok = document.execCommand("copy");
  battleLinkInput.setSelectionRange(0, 0);
  return ok ? Promise.resolve() : Promise.reject(new Error("copy-failed"));
}

function refreshBoardMetrics() {
  const rect = boardEl.getBoundingClientRect();
  cachedCellSizePx = rect.width / COLS;
}

function getCellSizePx() {
  if (!cachedCellSizePx) {
    refreshBoardMetrics();
  }
  return cachedCellSizePx;
}

function clearInteractionEffects() {
  if (state.hintTimer) {
    clearTimeout(state.hintTimer);
    state.hintTimer = null;
  }
  if (state.clickTimer) {
    clearTimeout(state.clickTimer);
    state.clickTimer = null;
  }
  state.hintIds.clear();
  state.autoRemoveIds.clear();
  state.clickedTileId = null;
  state.shakeType = null;
}

function syncControlAvailability() {
  const lockedByLose = state.gameOver === "lose";
  const battleLocked = state.mode === MODE_BATTLE;
  hintBtn.disabled = lockedByLose || battleLocked;
  shuffleBtn.disabled = lockedByLose || battleLocked;
  restartBtn.disabled = lockedByLose || battleLocked;
}

function makeTile(type) {
  return { id: nextTileId++, type };
}

function generateFilledBoard(rng = Math.random) {
  const tiles = [];
  for (let i = 0; i < PAIR_COUNT; i += 1) {
    const type = TILE_TYPES[Math.floor(rng() * TILE_TYPES.length)];
    tiles.push(makeTile(type));
    tiles.push(makeTile(type));
  }
  shuffleArray(tiles, rng);
  const board = createEmptyBoard();
  let index = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      board[row][col] = tiles[index++];
    }
  }
  return board;
}

function initializeBoard(seedText = null) {
  nextTileId = 1;
  const rng = seedText ? createSeededRandom(seedText) : Math.random;
  const board = generateFilledBoard(rng);
  if (findAnyRemovablePair(board)) {
    return board;
  }
  return forceAtLeastOnePair(board, gatherRemainingTiles(board));
}

function generateGuaranteedBoard() {
  const board = createEmptyBoard();
  const tiles = [];
  for (let i = 0; i < PAIR_COUNT; i += 1) {
    const type = TILE_TYPES[i % TILE_TYPES.length];
    tiles.push(makeTile(type));
    tiles.push(makeTile(type));
  }
  shuffleArray(tiles);
  let index = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      board[row][col] = tiles[index++];
    }
  }
  return forceAtLeastOnePair(board, tiles);
}

function collectTilesByType(board = state.board) {
  const byType = new Map();
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = board[row][col];
      if (!tile) {
        continue;
      }
      if (!byType.has(tile.type)) {
        byType.set(tile.type, []);
      }
      byType.get(tile.type).push({ row, col, tile });
    }
  }
  return byType;
}

function isPathClear(posA, posB, board = state.board) {
  if (posA.row === posB.row) {
    const row = posA.row;
    const start = Math.min(posA.col, posB.col) + 1;
    const end = Math.max(posA.col, posB.col) - 1;
    for (let col = start; col <= end; col += 1) {
      if (board[row][col]) {
        return false;
      }
    }
    return true;
  }
  if (posA.col === posB.col) {
    const col = posA.col;
    const start = Math.min(posA.row, posB.row) + 1;
    const end = Math.max(posA.row, posB.row) - 1;
    for (let row = start; row <= end; row += 1) {
      if (board[row][col]) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function findAnyRemovablePair(board = state.board) {
  const byType = collectTilesByType(board);
  for (const positions of byType.values()) {
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i];
        const b = positions[j];
        if ((a.row === b.row || a.col === b.col) && isPathClear(a, b, board)) {
          return { a, b };
        }
      }
    }
  }
  return null;
}

function collectDragBlock(board, startRow, startCol, direction, sign) {
  const { dr, dc } = getDirectionVector(direction, sign);
  const block = [];
  let row = startRow;
  let col = startCol;

  while (inBounds(row, col) && board[row][col]) {
    block.push({
      row,
      col,
      id: board[row][col].id
    });
    row += dr;
    col += dc;
  }

  let maxStep = 0;
  while (inBounds(row, col) && !board[row][col]) {
    maxStep += 1;
    row += dr;
    col += dc;
  }

  return { block, maxStep };
}

function findDisjointRemovablePairs(board = state.board) {
  const byType = collectTilesByType(board);
  const used = new Set();
  const pairs = [];
  for (const positions of byType.values()) {
    for (let i = 0; i < positions.length; i += 1) {
      const a = positions[i];
      if (used.has(a.tile.id)) {
        continue;
      }
      for (let j = i + 1; j < positions.length; j += 1) {
        const b = positions[j];
        if (used.has(b.tile.id)) {
          continue;
        }
        if ((a.row === b.row || a.col === b.col) && isPathClear(a, b, board)) {
          pairs.push({ a, b });
          used.add(a.tile.id);
          used.add(b.tile.id);
          break;
        }
      }
    }
  }
  return pairs;
}

function findPairForTileId(board, tileId) {
  let selected = null;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = board[row][col];
      if (tile && tile.id === tileId) {
        selected = { row, col, tile };
        break;
      }
    }
    if (selected) {
      break;
    }
  }
  if (!selected) {
    return null;
  }

  const sameType = collectTilesByType(board).get(selected.tile.type) || [];
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of sameType) {
    if (candidate.tile.id === tileId) {
      continue;
    }
    if (!(candidate.row === selected.row || candidate.col === selected.col)) {
      continue;
    }
    if (!isPathClear(selected, candidate, board)) {
      continue;
    }
    const distance = Math.abs(candidate.row - selected.row) + Math.abs(candidate.col - selected.col);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { a: selected, b: candidate };
    }
  }
  return best;
}

function findAnyActionableMove(board = state.board) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = board[row][col];
      if (!tile) {
        continue;
      }
      const dirs = [
        { direction: "h", sign: 1 },
        { direction: "h", sign: -1 },
        { direction: "v", sign: 1 },
        { direction: "v", sign: -1 }
      ];

      for (const dir of dirs) {
        const info = collectDragBlock(board, row, col, dir.direction, dir.sign);
        if (!info.block.length || info.maxStep < 1) {
          continue;
        }
        const probe = {
          block: info.block,
          direction: dir.direction,
          sign: dir.sign
        };
        for (let step = 1; step <= info.maxStep; step += 1) {
          const nextBoard = getBoardAfterMove(probe, step, board);
          const pair = findPairForTileId(nextBoard, tile.id);
          if (pair) {
            return {
              selectedTileId: tile.id,
              partnerTileId: pair.b.tile.id,
              step,
              direction: dir.direction,
              sign: dir.sign
            };
          }
        }
      }
    }
  }
  return null;
}

function hasAnyLegalAction(board = state.board) {
  if (findAnyRemovablePair(board)) {
    return true;
  }
  return Boolean(findAnyActionableMove(board));
}

function findClickableMatchForTile(row, col, board = state.board) {
  const tile = board[row]?.[col];
  if (!tile) {
    return null;
  }

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let c = 0; c < COLS; c += 1) {
    if (c === col) {
      continue;
    }
    const candidate = board[row][c];
    if (!candidate || candidate.type !== tile.type) {
      continue;
    }
    const posA = { row, col };
    const posB = { row, col: c };
    if (!isPathClear(posA, posB, board)) {
      continue;
    }
    const distance = Math.abs(c - col);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { row, col: c, tile: candidate };
    }
  }

  for (let r = 0; r < ROWS; r += 1) {
    if (r === row) {
      continue;
    }
    const candidate = board[r][col];
    if (!candidate || candidate.type !== tile.type) {
      continue;
    }
    const posA = { row, col };
    const posB = { row: r, col };
    if (!isPathClear(posA, posB, board)) {
      continue;
    }
    const distance = Math.abs(r - row);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { row: r, col, tile: candidate };
    }
  }

  return best;
}

function evaluateGameState() {
  let remaining = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (state.board[row][col]) {
        remaining += 1;
      }
    }
  }

  if (remaining === 0) {
    state.gameOver = "win";
    setStatus("全部消除，胜利！");
    syncControlAvailability();
    if (state.mode === MODE_BATTLE) {
      handleLocalBattleRoundEnd("win");
      return;
    }
    showResultModal("win");
    return;
  }

  if (!hasAnyLegalAction(state.board)) {
    state.gameOver = "lose";
    setStatus("当前已无可执行消除操作，失败。");
    syncControlAvailability();
    if (state.mode === MODE_BATTLE) {
      handleLocalBattleRoundEnd("lose");
      return;
    }
    showResultModal("lose");
    return;
  }

  hideResultModal();
  state.gameOver = null;
  syncControlAvailability();
  if (!state.busy && state.mode === MODE_ENDLESS) {
    setStatus("拖拽后仅当起手选中卡片可消除时才生效。");
  }
}

function checkGameOverSoon(delay = 220) {
  setTimeout(() => {
    if (state.busy || state.drag || state.boardLocked) {
      return;
    }
    evaluateGameState();
    renderBoard(false);
  }, delay);
}

function getDirectionVector(direction, sign) {
  if (direction === "h") {
    return { dr: 0, dc: sign };
  }
  return { dr: sign, dc: 0 };
}

function setupDragBlock(drag) {
  const info = collectDragBlock(state.board, drag.startRow, drag.startCol, drag.direction, drag.sign);
  drag.block = info.block;
  drag.maxStep = info.maxStep;
  if (info.block.length > 1) {
    playPickupSfx(info.block.length - 1);
  }
}

function applyBlockMove(drag, step) {
  const { dr, dc } = getDirectionVector(drag.direction, drag.sign);
  const movingTiles = drag.block.map((pos) => ({
    tile: state.board[pos.row][pos.col],
    fromRow: pos.row,
    fromCol: pos.col
  }));

  for (const item of movingTiles) {
    state.board[item.fromRow][item.fromCol] = null;
  }
  for (const item of movingTiles) {
    const targetRow = item.fromRow + dr * step;
    const targetCol = item.fromCol + dc * step;
    state.board[targetRow][targetCol] = item.tile;
  }
}

function cloneBoard(board = state.board) {
  return board.map((line) => line.slice());
}

function getBoardAfterMove(drag, step, sourceBoard = state.board) {
  const board = cloneBoard(sourceBoard);
  const { dr, dc } = getDirectionVector(drag.direction, drag.sign);
  const movingTiles = drag.block.map((pos) => ({
    tile: board[pos.row][pos.col],
    fromRow: pos.row,
    fromCol: pos.col
  }));

  for (const item of movingTiles) {
    board[item.fromRow][item.fromCol] = null;
  }
  for (const item of movingTiles) {
    const targetRow = item.fromRow + dr * step;
    const targetCol = item.fromCol + dc * step;
    board[targetRow][targetCol] = item.tile;
  }
  return board;
}

function moveCanEliminate(drag, step) {
  const nextBoard = getBoardAfterMove(drag, step, state.board);
  return Boolean(findPairForTileId(nextBoard, drag.selectedTileId));
}

function chooseSnapStep(drag) {
  const cell = getCellSizePx();
  const desired = Math.min(drag.maxStep, Math.max(0, Math.round(drag.deltaPx / cell)));
  if (desired <= 0) {
    return 0;
  }
  if (moveCanEliminate(drag, desired)) {
    return desired;
  }

  for (let offset = 1; offset <= drag.maxStep; offset += 1) {
    const left = desired - offset;
    const right = desired + offset;
    if (left >= 1 && moveCanEliminate(drag, left)) {
      return left;
    }
    if (right <= drag.maxStep && moveCanEliminate(drag, right)) {
      return right;
    }
  }
  return 0;
}

function startSnapback(drag) {
  state.snapback = {
    block: drag.block,
    direction: drag.direction,
    sign: drag.sign,
    offsetPx: drag.deltaPx
  };
  renderBoard(false);
  requestAnimationFrame(() => {
    if (!state.snapback) {
      return;
    }
    state.snapback.offsetPx = 0;
    renderBoard(false);
  });
  setTimeout(() => {
    state.snapback = null;
    renderBoard(false);
  }, 200);
}

async function resolveMoveElimination(selectedTileId) {
  state.busy = true;
  const pair = findPairForTileId(state.board, selectedTileId);
  if (!pair) {
    state.busy = false;
    evaluateGameState();
    renderBoard(false);
    return;
  }

  state.autoRemoveIds.clear();
  state.autoRemoveIds.add(pair.a.tile.id);
  state.autoRemoveIds.add(pair.b.tile.id);
  playEliminateSfx();
  renderBoard(false);
  await sleep(AUTO_CLEAR_FLASH_MS);

  state.board[pair.a.row][pair.a.col] = null;
  state.board[pair.b.row][pair.b.col] = null;
  state.autoRemoveIds.clear();
  state.busy = false;
  evaluateGameState();
  renderBoard();
}

function unlockAudio() {
  if (!state.musicEnabled) {
    return;
  }
  state.music.start();
}

function playClickSfx() {
  if (!state.musicEnabled) {
    return;
  }
  state.music.playClickFx();
}

function playEliminateSfx() {
  if (!state.musicEnabled) {
    return;
  }
  state.music.playEliminateFx();
}

function playPickupSfx(extraCount) {
  if (!state.musicEnabled) {
    return;
  }
  state.music.playPickupFx(extraCount);
}

async function handleCardClick(row, col) {
  const tile = state.board[row][col];
  if (!tile || state.busy || state.boardLocked) {
    return;
  }

  const match = findClickableMatchForTile(row, col, state.board);
  if (match) {
    clearInteractionEffects();
    state.busy = true;
    state.autoRemoveIds.add(tile.id);
    state.autoRemoveIds.add(match.tile.id);
    playEliminateSfx();
    setStatus(`已点击消除 ${tile.type}。`);
    renderBoard(false);
    await sleep(AUTO_CLEAR_FLASH_MS);

    state.board[row][col] = null;
    state.board[match.row][match.col] = null;
    state.autoRemoveIds.clear();
    state.busy = false;
    evaluateGameState();
    renderBoard();
    return;
  }

  clearInteractionEffects();
  state.busy = true;
  state.clickedTileId = tile.id;
  state.shakeType = tile.type;
  playClickSfx();
  setStatus(`已选中 ${tile.type}，同类卡片正在旋转走动。`);
  renderBoard(false);
  await sleep(TYPE_DANCE_MS);

  state.clickedTileId = null;
  state.shakeType = null;
  state.busy = false;
  setStatus("该点击不会触发消除，操作已取消。");
  renderBoard(false);
  checkGameOverSoon(30);
}

function clearHintSoon() {
  if (state.hintTimer) {
    clearTimeout(state.hintTimer);
  }
  state.hintTimer = setTimeout(() => {
    state.hintIds.clear();
    renderBoard(false);
  }, HINT_SHOW_MS);
}

function handleHint() {
  if (state.busy || state.mode === MODE_BATTLE) {
    return;
  }
  unlockAudio();
  const directPair = findAnyRemovablePair(state.board);
  const moveHint = directPair ? null : findAnyActionableMove(state.board);
  state.hintIds.clear();
  if (!directPair && !moveHint) {
    setStatus("当前无可执行操作。");
    checkGameOverSoon(30);
    renderBoard(false);
    return;
  }

  if (directPair) {
    state.hintIds.add(directPair.a.tile.id);
    state.hintIds.add(directPair.b.tile.id);
    setStatus("提示：这两张现在就能直接消除。");
  } else if (moveHint) {
    state.hintIds.add(moveHint.selectedTileId);
    state.hintIds.add(moveHint.partnerTileId);
    setStatus("提示：高亮两张通过一步操作可消除的卡片。");
  }
  clearHintSoon();
  renderBoard(false);
}

function gatherRemainingTiles(board = state.board) {
  const tiles = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (board[row][col]) {
        tiles.push(board[row][col]);
      }
    }
  }
  return tiles;
}

function fillBoardFromTiles(tiles) {
  const board = createEmptyBoard();
  const allCoords = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      allCoords.push({ row, col });
    }
  }
  shuffleArray(allCoords);
  for (let i = 0; i < tiles.length; i += 1) {
    const coord = allCoords[i];
    board[coord.row][coord.col] = tiles[i];
  }
  return board;
}

function forceAtLeastOnePair(board, tiles) {
  const byType = new Map();
  for (const tile of tiles) {
    if (!byType.has(tile.type)) {
      byType.set(tile.type, []);
    }
    byType.get(tile.type).push(tile);
  }

  let pairTiles = null;
  for (const list of byType.values()) {
    if (list.length >= 2) {
      pairTiles = [list[0], list[1]];
      break;
    }
  }
  if (!pairTiles) {
    return board;
  }

  const locate = (id) => {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (board[row][col]?.id === id) {
          return { row, col };
        }
      }
    }
    return null;
  };

  const posA = locate(pairTiles[0].id);
  const posB = locate(pairTiles[1].id);
  if (!posA || !posB) {
    return board;
  }

  const swap = (p1, p2) => {
    [board[p1.row][p1.col], board[p2.row][p2.col]] = [board[p2.row][p2.col], board[p1.row][p1.col]];
  };
  swap(posA, { row: 0, col: 0 });

  const updatedPosB = board[0][0]?.id === pairTiles[1].id ? posA : posB;
  swap(updatedPosB, { row: 0, col: 1 });

  return board;
}

function canUsePeerBattle() {
  return typeof window.Peer === "function";
}

function buildBattleInviteLink(hostId, seed) {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", MODE_BATTLE);
  url.searchParams.set("host", hostId);
  url.searchParams.set("seed", seed);
  return url.toString();
}

function clearUrlParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("mode");
  url.searchParams.delete("host");
  url.searchParams.delete("seed");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function buildInviteShareText(link) {
  return `来和我 PK 果味连线消除，点开链接就能直接开局：${link}`;
}

function closeBattleConnection() {
  const conn = state.battle.connection;
  if (conn) {
    conn.close();
  }
  state.battle.connection = null;
  state.battle.connected = false;
}

function closeBattlePeer() {
  const peer = state.battle.peer;
  if (peer) {
    peer.destroy();
  }
  state.battle.peer = null;
}

function teardownBattleNetwork() {
  closeBattleConnection();
  closeBattlePeer();
  state.battle.role = null;
  state.battle.connected = false;
  if (startBattleBtn) {
    startBattleBtn.disabled = true;
  }
  if (shareBattleBtn) {
    shareBattleBtn.disabled = true;
  }
  if (copyBattleLinkBtn) {
    copyBattleLinkBtn.disabled = true;
  }
}

function updateBattleActionButtons() {
  const isBattle = state.mode === MODE_BATTLE;
  const isHost = state.battle.role === "host";
  const isGuest = state.battle.role === "guest";
  const hasInvite = Boolean(state.battle.inviteLink);
  if (createBattleBtn) {
    createBattleBtn.disabled = !isBattle || isGuest;
  }
  if (shareBattleBtn) {
    shareBattleBtn.disabled = !isBattle || !isHost || !hasInvite;
  }
  if (copyBattleLinkBtn) {
    copyBattleLinkBtn.disabled = !isBattle || !isHost || !hasInvite;
  }
  if (startBattleBtn) {
    startBattleBtn.disabled = !isBattle || !isHost || !state.battle.connected;
  }
}

async function shareBattleInvite() {
  const link = battleLinkInput?.value || state.battle.inviteLink;
  if (!link) {
    setBattleStatus("请先创建房间。");
    return;
  }
  const text = buildInviteShareText(link);
  if (navigator.share) {
    try {
      await navigator.share({
        title: "果味连线消除好友对战",
        text,
        url: link
      });
      setBattleStatus("分享面板已打开，发送给好友即可。");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        setBattleStatus("已取消分享，可再次点击“一键邀请好友”。");
        return;
      }
    }
  }
  try {
    await copyToClipboard(link);
    setBattleStatus("已自动复制邀请链接，直接粘贴发给好友。");
  } catch {
    setBattleStatus("分享失败，请手动复制链接。");
  }
}

function sendBattleMessage(payload) {
  const conn = state.battle.connection;
  if (!conn || !state.battle.connected) {
    return false;
  }
  conn.send(payload);
  return true;
}

function compareBattleResult(a, b) {
  const aWin = a?.result === "win";
  const bWin = b?.result === "win";
  if (aWin && !bWin) {
    return -1;
  }
  if (!aWin && bWin) {
    return 1;
  }
  return (a?.elapsedMs ?? Number.POSITIVE_INFINITY) - (b?.elapsedMs ?? Number.POSITIVE_INFINITY);
}

function buildBattleSummary(hostResult, guestResult) {
  const cmp = compareBattleResult(hostResult, guestResult);
  if (cmp < 0) {
    return { winner: "host", hostResult, guestResult };
  }
  if (cmp > 0) {
    return { winner: "guest", hostResult, guestResult };
  }
  return { winner: "draw", hostResult, guestResult };
}

function applyBattleSummary(summary) {
  const isHost = state.battle.role === "host";
  const myResult = isHost ? summary.hostResult : summary.guestResult;
  const opponentResult = isHost ? summary.guestResult : summary.hostResult;
  const myWin = (summary.winner === "host" && isHost) || (summary.winner === "guest" && !isHost);

  let finalText = "平局";
  if (summary.winner !== "draw") {
    finalText = myWin ? "你赢了" : "你输了";
  }
  const myTimeText = `你 ${myResult.result === "win" ? "通关" : "失败"} 用时 ${formatBattleMs(myResult.elapsedMs)}`;
  const oppTimeText = `好友 ${opponentResult.result === "win" ? "通关" : "失败"} 用时 ${formatBattleMs(opponentResult.elapsedMs)}`;
  setStatus(`对战结算：${finalText}。`);
  setBattleStatus(`${myTimeText}；${oppTimeText}。${finalText}`);
  const modalType = summary.winner === "draw" ? "win" : (myWin ? "win" : "lose");
  showResultModal(modalType);
  if (resultTitleEl) {
    resultTitleEl.textContent = "好友对战结果";
  }
  if (resultBodyEl) {
    resultBodyEl.textContent = `${myTimeText}；${oppTimeText}；${finalText}`;
  }
  if (resultActionBtn) {
    resultActionBtn.textContent = "知道了";
  }
  state.resultType = "battle";
}

function finalizeBattleSummaryIfHost() {
  if (state.battle.role !== "host") {
    return;
  }
  if (!state.battle.myResult || !state.battle.opponentResult) {
    return;
  }
  const summary = buildBattleSummary(state.battle.myResult, state.battle.opponentResult);
  applyBattleSummary(summary);
  sendBattleMessage({ type: "summary", summary });
}

function handleLocalBattleRoundEnd(result) {
  if (state.mode !== MODE_BATTLE || state.battle.myResult) {
    return;
  }
  stopBattleTimer();
  state.boardLocked = true;
  state.battle.timerElapsedMs = Math.floor(state.battle.timerElapsedMs);
  state.battle.myResult = {
    result,
    elapsedMs: state.battle.timerElapsedMs
  };
  setStatus(`你已${result === "win" ? "通关" : "结束本局"}，等待好友结果。`);
  sendBattleMessage({ type: "finish", result: state.battle.myResult });
  if (state.battle.role === "host") {
    finalizeBattleSummaryIfHost();
  } else {
    setBattleStatus("已提交成绩，等待好友完成。");
  }
}

function onBattleMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "join" && state.battle.role === "host") {
    setBattleStatus("好友已加入，点击“开始对战”。");
    updateBattleActionButtons();
    return;
  }
  if (message.type === "host-ready" && state.battle.role === "guest") {
    state.battle.seed = message.seed || state.battle.seed;
    setBattleStatus("已连接房主，等待开始。");
    updateBattleActionButtons();
    return;
  }
  if (message.type === "start") {
    const seed = message.seed || state.battle.seed || createShortId();
    beginBattleRound(seed, message.countdownMs || BATTLE_COUNTDOWN_MS);
    return;
  }
  if (message.type === "finish") {
    state.battle.opponentResult = message.result;
    if (state.battle.role === "host") {
      finalizeBattleSummaryIfHost();
    } else if (!state.battle.myResult) {
      setBattleStatus("好友已完成，继续加油。");
    }
    return;
  }
  if (message.type === "summary") {
    applyBattleSummary(message.summary);
  }
}

function attachBattleConnection(connection) {
  if (!connection) {
    return;
  }
  if (state.battle.connection && state.battle.connection !== connection) {
    state.battle.connection.close();
  }
  state.battle.connection = connection;
  connection.on("open", () => {
    state.battle.connected = true;
    if (state.battle.role === "guest") {
      setBattleStatus("已连接房主，等待开始。");
      sendBattleMessage({ type: "join" });
    } else {
      setBattleStatus("好友已加入，点击“开始对战”。");
      sendBattleMessage({ type: "host-ready", seed: state.battle.seed });
    }
    updateBattleActionButtons();
  });
  connection.on("data", onBattleMessage);
  connection.on("close", () => {
    state.battle.connected = false;
    updateBattleActionButtons();
    setBattleStatus("对战连接已断开。");
  });
  connection.on("error", () => {
    setBattleStatus("连接异常，请重新创建对战链接。");
  });
}

function createPeer(role) {
  return new Promise((resolve, reject) => {
    if (!canUsePeerBattle()) {
      reject(new Error("peer-unavailable"));
      return;
    }
    const peer = new window.Peer();
    state.battle.peer = peer;
    state.battle.role = role;
    updateBattleActionButtons();

    peer.on("open", () => resolve(peer));
    peer.on("connection", (incoming) => {
      if (state.battle.role !== "host") {
        incoming.close();
        return;
      }
      attachBattleConnection(incoming);
    });
    peer.on("error", (err) => {
      setBattleStatus(`连接失败：${err?.type || "未知错误"}`);
      updateBattleActionButtons();
      reject(err);
    });
  });
}

function prepareBoardForBattle(seed) {
  clearInteractionEffects();
  hideResultModal();
  state.snapback = null;
  state.drag = null;
  state.busy = false;
  state.gameOver = null;
  state.board = initializeBoard(seed);
  evaluateGameState();
  renderBoard();
}

function beginBattleRound(seed, countdownMs = BATTLE_COUNTDOWN_MS) {
  state.battle.seed = seed;
  resetBattleRoundData();
  prepareBoardForBattle(seed);
  state.boardLocked = true;
  updateBattleActionButtons();

  const seconds = Math.ceil(countdownMs / 1000);
  setBattleStatus(`对战倒计时 ${seconds} 秒...`);
  setStatus(`好友对战即将开始，倒计时 ${seconds} 秒。`);
  clearBattleCountdown();
  state.battle.countdownTimer = setTimeout(() => {
    state.boardLocked = false;
    setStatus("好友对战进行中，先清空棋盘者获胜。");
    setBattleStatus("对战已开始，冲刺吧。");
    startBattleTimer();
    renderBoard(false);
  }, countdownMs);
}

function switchMode(mode) {
  state.mode = mode;
  updateModeUi();
  syncControlAvailability();
  updateBattleActionButtons();
  renderBoard(false);
}

function enterHome() {
  hideResultModal();
  clearInteractionEffects();
  state.drag = null;
  state.snapback = null;
  state.busy = false;
  state.gameOver = null;
  state.boardLocked = true;
  resetBattleRoundData();
  teardownBattleNetwork();
  state.battle.seed = null;
  state.battle.inviteLink = "";
  if (battleLinkInput) {
    battleLinkInput.value = "";
  }
  setBattleStatus("点击“创建房间”，然后一键邀请好友。");
  clearUrlParams();
  switchMode(MODE_ENDLESS);
  setView("home");
  setStatus("选择模式开始游戏。");
}

function enterEndlessMode() {
  state.boardLocked = false;
  resetBattleRoundData();
  teardownBattleNetwork();
  state.battle.seed = null;
  state.battle.inviteLink = "";
  if (battleLinkInput) {
    battleLinkInput.value = "";
  }
  clearUrlParams();
  setView("game");
  switchMode(MODE_ENDLESS);
  setStatus("拖拽后仅当起手选中卡片可消除时才生效。");
  restartGame();
}

function enterBattleLobby() {
  setView("game");
  switchMode(MODE_BATTLE);
  resetBattleRoundData();
  state.boardLocked = true;
  teardownBattleNetwork();
  state.battle.seed = null;
  state.battle.inviteLink = "";
  if (battleLinkInput) {
    battleLinkInput.value = "";
  }
  setBattleStatus("点击“创建房间”，然后一键邀请好友。");
  setStatus("好友对战准备中。");
  updateBattleActionButtons();
}

async function createBattleInvite(autoShare = false) {
  setView("game");
  switchMode(MODE_BATTLE);
  resetBattleRoundData();
  state.boardLocked = true;
  updateBattleActionButtons();
  if (!canUsePeerBattle()) {
    setBattleStatus("当前环境不支持好友对战连接。");
    return;
  }

  teardownBattleNetwork();
  const seed = createShortId();
  state.battle.seed = seed;
  state.battle.inviteLink = "";
  if (battleLinkInput) {
    battleLinkInput.value = "";
  }
  updateBattleActionButtons();
  setBattleStatus("正在创建对战房间...");
  try {
    const peer = await createPeer("host");
    const link = buildBattleInviteLink(peer.id, seed);
    state.battle.inviteLink = link;
    if (battleLinkInput) {
      battleLinkInput.value = link;
    }
    setBattleStatus("房间已创建，点击“一键邀请好友”。");
    history.replaceState(null, "", `?mode=${MODE_BATTLE}`);
    updateBattleActionButtons();
    if (autoShare) {
      shareBattleInvite();
    }
  } catch {
    teardownBattleNetwork();
    setBattleStatus("创建失败，请稍后重试。");
    updateBattleActionButtons();
  }
}

async function joinBattleByLink(hostId, seed) {
  setView("game");
  switchMode(MODE_BATTLE);
  resetBattleRoundData();
  state.boardLocked = true;
  updateBattleActionButtons();
  if (battleLinkInput) {
    battleLinkInput.value = window.location.href;
  }
  if (!canUsePeerBattle()) {
    setBattleStatus("当前环境不支持好友对战连接。");
    return;
  }

  teardownBattleNetwork();
  state.battle.seed = seed || createShortId();
  state.battle.inviteLink = "";
  updateBattleActionButtons();
  setBattleStatus("正在连接好友房间...");
  try {
    const peer = await createPeer("guest");
    const conn = peer.connect(hostId, { reliable: true });
    attachBattleConnection(conn);
  } catch {
    teardownBattleNetwork();
    setBattleStatus("连接失败，请让好友重新分享链接。");
  }
}

function startBattleAsHost() {
  if (state.mode !== MODE_BATTLE || state.battle.role !== "host") {
    return;
  }
  if (!state.battle.connected) {
    setBattleStatus("请先等待好友加入。");
    return;
  }
  const seed = state.battle.seed || createShortId();
  sendBattleMessage({
    type: "start",
    seed,
    countdownMs: BATTLE_COUNTDOWN_MS
  });
  updateBattleActionButtons();
  beginBattleRound(seed, BATTLE_COUNTDOWN_MS);
}

function handleShuffle() {
  if (state.busy || state.gameOver === "lose" || state.mode === MODE_BATTLE) {
    return;
  }
  hideResultModal();
  unlockAudio();
  const tiles = gatherRemainingTiles();
  if (tiles.length < 2) {
    evaluateGameState();
    renderBoard(false);
    return;
  }

  let nextBoard = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const candidateTiles = shuffleArray([...tiles]);
    const board = fillBoardFromTiles(candidateTiles);
    if (findAnyRemovablePair(board)) {
      nextBoard = board;
      break;
    }
  }
  if (!nextBoard) {
    nextBoard = forceAtLeastOnePair(fillBoardFromTiles(shuffleArray([...tiles])), tiles);
  }

  state.board = nextBoard;
  state.gameOver = null;
  state.hintIds.clear();
  state.clickedTileId = null;
  state.shakeType = null;
  setStatus("已打乱并保证至少存在一组可消除。");
  evaluateGameState();
  renderBoard();
}

function restartGame(seedText = null) {
  if (state.mode === MODE_BATTLE && !seedText) {
    return;
  }
  clearInteractionEffects();
  hideResultModal();
  state.snapback = null;
  state.drag = null;
  state.busy = false;
  state.boardLocked = state.mode === MODE_BATTLE;
  state.gameOver = null;
  state.board = initializeBoard(seedText);
  evaluateGameState();
  renderBoard();
}

function getOffsetForTile(tileId) {
  if (state.drag) {
    const blockSet = state.drag.blockSet;
    if (blockSet && blockSet.has(tileId)) {
      const signed = state.drag.deltaPx * state.drag.sign;
      if (state.drag.direction === "h") {
        return { x: signed, y: 0, className: "dragging" };
      }
      return { x: 0, y: signed, className: "dragging" };
    }
  }
  if (state.snapback) {
    if (!state.snapback.blockSet) {
      state.snapback.blockSet = new Set(state.snapback.block.map((cell) => cell.id));
    }
    if (state.snapback.blockSet.has(tileId)) {
      const signed = state.snapback.offsetPx * state.snapback.sign;
      if (state.snapback.direction === "h") {
        return { x: signed, y: 0, className: "" };
      }
      return { x: 0, y: signed, className: "" };
    }
  }
  return { x: 0, y: 0, className: "" };
}

function syncTileVisualState(tileEl, tile) {
  tileEl.classList.toggle("clicked", state.clickedTileId === tile.id);
  tileEl.classList.toggle("shake", state.shakeType === tile.type);
  tileEl.classList.toggle("hint", state.hintIds.has(tile.id));
  tileEl.classList.toggle("removing", state.autoRemoveIds.has(tile.id));

  const offset = getOffsetForTile(tile.id);
  tileEl.classList.toggle("dragging", offset.className === "dragging");
  tileEl.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;
}

function rebuildTileNodes() {
  tileElementById.clear();
  boardEl.textContent = "";
  const widthPct = 100 / COLS;
  const heightPct = 100 / ROWS;
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = state.board[row][col];
      if (!tile) {
        continue;
      }
      const tileEl = document.createElement("button");
      tileEl.type = "button";
      tileEl.className = "tile";
      tileEl.dataset.row = String(row);
      tileEl.dataset.col = String(col);
      tileEl.dataset.id = String(tile.id);
      tileEl.style.left = `${col * widthPct}%`;
      tileEl.style.top = `${row * heightPct}%`;
      tileEl.style.width = `${widthPct}%`;
      tileEl.style.height = `${heightPct}%`;
      tileEl.textContent = tile.type;
      syncTileVisualState(tileEl, tile);
      tileElementById.set(tile.id, tileEl);
      fragment.appendChild(tileEl);
    }
  }
  boardEl.appendChild(fragment);
  refreshBoardMetrics();
}

function syncTileNodesWithoutRebuild() {
  let tileCount = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = state.board[row][col];
      if (!tile) {
        continue;
      }
      tileCount += 1;
      const tileEl = tileElementById.get(tile.id);
      if (!tileEl) {
        return false;
      }
      tileEl.dataset.row = String(row);
      tileEl.dataset.col = String(col);
      syncTileVisualState(tileEl, tile);
    }
  }
  return tileCount === tileElementById.size;
}

function flushRenderQueue() {
  renderScheduled = false;
  const shouldFullRender = pendingFullRender;
  pendingFullRender = false;
  if (shouldFullRender || tileElementById.size === 0) {
    rebuildTileNodes();
  } else if (!syncTileNodesWithoutRebuild()) {
    rebuildTileNodes();
  }

  boardEl.classList.toggle("hint-focus", state.hintIds.size > 0);
  if (statusEl) {
    statusEl.textContent = state.status;
    statusEl.dataset.state = state.gameOver || "play";
  }
  musicBtn.textContent = `音乐：${state.musicEnabled ? "开" : "关"}`;
}

function renderBoard(fullRender = true) {
  pendingFullRender = pendingFullRender || fullRender;
  if (renderScheduled) {
    return;
  }
  renderScheduled = true;
  requestAnimationFrame(flushRenderQueue);
}

function onPointerDown(event) {
  if (state.busy || state.boardLocked) {
    return;
  }
  const target = event.target.closest(".tile");
  if (!target) {
    return;
  }
  unlockAudio();
  const row = Number(target.dataset.row);
  const col = Number(target.dataset.col);
  const tile = state.board[row]?.[col];
  if (!tile) {
    return;
  }

  state.drag = {
    pointerId: event.pointerId,
    selectedTileId: tile.id,
    startRow: row,
    startCol: col,
    startX: event.clientX,
    startY: event.clientY,
    direction: null,
    sign: 1,
    block: [],
    blockSet: null,
    maxStep: 0,
    deltaPx: 0
  };
  boardEl.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;

  if (!drag.direction) {
    if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD) {
      return;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      drag.direction = "h";
      drag.sign = dx >= 0 ? 1 : -1;
    } else {
      drag.direction = "v";
      drag.sign = dy >= 0 ? 1 : -1;
    }
    setupDragBlock(drag);
    drag.blockSet = new Set(drag.block.map((cell) => cell.id));
  }

  const cellSize = getCellSizePx();
  const maxPx = drag.maxStep * cellSize;
  const raw = drag.direction === "h" ? dx * drag.sign : dy * drag.sign;
  drag.deltaPx = Math.max(0, Math.min(raw, maxPx));
  renderBoard(false);
}

function endDrag(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  if (boardEl.hasPointerCapture(event.pointerId)) {
    boardEl.releasePointerCapture(event.pointerId);
  }
  state.drag = null;

  if (!drag.direction) {
    handleCardClick(drag.startRow, drag.startCol);
    return;
  }

  const step = chooseSnapStep(drag);
  if (step <= 0) {
    startSnapback(drag);
    checkGameOverSoon(250);
    return;
  }

  clearInteractionEffects();
  applyBlockMove(drag, step);
  renderBoard();
  resolveMoveElimination(drag.selectedTileId);
}

function toggleMusic() {
  state.musicEnabled = !state.musicEnabled;
  if (state.musicEnabled) {
    state.music.start();
    setStatus("背景音乐已开启。");
  } else {
    state.music.stop();
    setStatus("背景音乐已关闭。");
  }
  renderBoard(false);
}

boardEl.addEventListener("pointerdown", onPointerDown);
boardEl.addEventListener("pointermove", onPointerMove);
boardEl.addEventListener("pointerup", endDrag);
boardEl.addEventListener("pointercancel", endDrag);
boardEl.addEventListener("lostpointercapture", (event) => endDrag(event));

hintBtn.addEventListener("click", handleHint);
shuffleBtn.addEventListener("click", handleShuffle);
restartBtn.addEventListener("click", restartGame);
musicBtn.addEventListener("click", toggleMusic);
if (homeEndlessBtn) {
  homeEndlessBtn.addEventListener("click", enterEndlessMode);
}
if (homeBattleBtn) {
  homeBattleBtn.addEventListener("click", () => {
    enterBattleLobby();
    createBattleInvite(true);
  });
}
if (backHomeBtn) {
  backHomeBtn.addEventListener("click", enterHome);
}
if (createBattleBtn) {
  createBattleBtn.addEventListener("click", createBattleInvite);
}
if (shareBattleBtn) {
  shareBattleBtn.addEventListener("click", shareBattleInvite);
}
if (copyBattleLinkBtn) {
  copyBattleLinkBtn.addEventListener("click", async () => {
    const link = battleLinkInput?.value || state.battle.inviteLink;
    try {
      await copyToClipboard(link);
      setBattleStatus("已复制邀请链接，发到群里即可拉人开战。");
    } catch {
      setBattleStatus("复制失败，请手动复制链接。");
    }
  });
}
if (startBattleBtn) {
  startBattleBtn.addEventListener("click", startBattleAsHost);
}
if (resultActionBtn) {
  resultActionBtn.addEventListener("click", () => {
    if (state.resultType === "battle") {
      hideResultModal();
      return;
    }
    if (state.resultType === "win" && state.mode === MODE_ENDLESS) {
      restartGame();
      return;
    }
    hideResultModal();
  });
}
window.addEventListener("resize", () => {
  refreshBoardMetrics();
  renderBoard(false);
});

setView("game");
switchMode(MODE_ENDLESS);
restartGame();
