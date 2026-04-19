const COLS = 10;
const ROWS = 14;
const TOTAL_CELLS = COLS * ROWS;
const PAIR_COUNT = TOTAL_CELLS / 2;
const DRAG_START_THRESHOLD = 8;
const AUTO_CLEAR_FLASH_MS = 220;
const HINT_SHOW_MS = 1100;
const TYPE_DANCE_MS = 420;

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

let nextTileId = 1;

class BackgroundMusic {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.loopTimer = null;
    this.step = 0;
    this.notes = [261.63, 329.63, 392.0, 493.88, 440.0, 392.0, 329.63, 349.23];
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
    this.master.gain.value = 0.05;
    this.master.connect(this.ctx.destination);
  }

  start() {
    this.ensureContext();
    if (!this.ctx || this.loopTimer) {
      return;
    }
    this.ctx.resume();
    this.loopTimer = setInterval(() => this.playTick(), 320);
  }

  playTick() {
    if (!this.ctx || !this.master) {
      return;
    }
    const now = this.ctx.currentTime;
    const note = this.notes[this.step % this.notes.length];
    this.step += 1;

    this.playOneShot(now, note, 0.18, "triangle", 0.075);
    if (this.step % 2 === 0) {
      this.playOneShot(now + 0.05, note * 2, 0.11, "sine", 0.04);
    }
  }

  stop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  playClickFx() {
    this.ensureContext();
    if (!this.ctx || !this.master) {
      return;
    }
    this.ctx.resume();
    const now = this.ctx.currentTime;
    this.playOneShot(now, 640, 0.08, "square", 0.12);
    this.playOneShot(now + 0.07, 780, 0.09, "triangle", 0.1);
  }

  playEliminateFx() {
    this.ensureContext();
    if (!this.ctx || !this.master) {
      return;
    }
    this.ctx.resume();
    const now = this.ctx.currentTime;
    this.playOneShot(now, 420, 0.11, "triangle", 0.14);
    this.playOneShot(now + 0.09, 540, 0.12, "triangle", 0.12);
  }

  playPickupFx(extraCount = 1) {
    this.ensureContext();
    if (!this.ctx || !this.master) {
      return;
    }
    this.ctx.resume();
    const count = Math.max(1, Math.min(extraCount, 4));
    const now = this.ctx.currentTime;
    for (let i = 0; i < count; i += 1) {
      this.playOneShot(now + i * 0.042, 1180 + i * 120, 0.06, "square", 0.11);
    }
  }

  playOneShot(startAt, frequency, duration, type, peakGain) {
    if (!this.ctx || !this.master) {
      return;
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  }
}

const state = {
  board: createEmptyBoard(),
  drag: null,
  snapback: null,
  busy: false,
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
  music: new BackgroundMusic()
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

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCellSizePx() {
  const rect = boardEl.getBoundingClientRect();
  return rect.width / COLS;
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
  hintBtn.disabled = lockedByLose;
  shuffleBtn.disabled = lockedByLose;
  restartBtn.disabled = lockedByLose;
}

function makeTile(type) {
  return { id: nextTileId++, type };
}

function generateFilledBoard() {
  const tiles = [];
  for (let i = 0; i < PAIR_COUNT; i += 1) {
    const type = TILE_TYPES[Math.floor(Math.random() * TILE_TYPES.length)];
    tiles.push(makeTile(type));
    tiles.push(makeTile(type));
  }
  shuffleArray(tiles);
  const board = createEmptyBoard();
  let index = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      board[row][col] = tiles[index++];
    }
  }
  return board;
}

function initializeBoard() {
  nextTileId = 1;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const board = generateFilledBoard();
    if (findAnyRemovablePair(board)) {
      return board;
    }
  }
  return generateGuaranteedBoard();
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
    showResultModal("win");
    return;
  }

  if (!hasAnyLegalAction(state.board)) {
    state.gameOver = "lose";
    setStatus("当前已无可执行消除操作，失败。");
    syncControlAvailability();
    showResultModal("lose");
    return;
  }

  hideResultModal();
  state.gameOver = null;
  syncControlAvailability();
  if (!state.busy) {
    setStatus("拖拽后仅当起手选中卡片可消除时才生效。");
  }
}

function checkGameOverSoon(delay = 220) {
  setTimeout(() => {
    if (state.busy || state.drag) {
      return;
    }
    evaluateGameState();
    renderBoard();
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
  renderBoard();
  requestAnimationFrame(() => {
    if (!state.snapback) {
      return;
    }
    state.snapback.offsetPx = 0;
    renderBoard();
  });
  setTimeout(() => {
    state.snapback = null;
    renderBoard();
  }, 200);
}

async function resolveMoveElimination(selectedTileId) {
  state.busy = true;
  const pair = findPairForTileId(state.board, selectedTileId);
  if (!pair) {
    state.busy = false;
    evaluateGameState();
    renderBoard();
    return;
  }

  state.autoRemoveIds.clear();
  state.autoRemoveIds.add(pair.a.tile.id);
  state.autoRemoveIds.add(pair.b.tile.id);
  playEliminateSfx();
  renderBoard();
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
  if (!tile || state.busy) {
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
    renderBoard();
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
  renderBoard();
  await sleep(TYPE_DANCE_MS);

  state.clickedTileId = null;
  state.shakeType = null;
  state.busy = false;
  setStatus("该点击不会触发消除，操作已取消。");
  renderBoard();
  checkGameOverSoon(30);
}

function clearHintSoon() {
  if (state.hintTimer) {
    clearTimeout(state.hintTimer);
  }
  state.hintTimer = setTimeout(() => {
    state.hintIds.clear();
    renderBoard();
  }, HINT_SHOW_MS);
}

function handleHint() {
  if (state.busy) {
    return;
  }
  unlockAudio();
  const directPair = findAnyRemovablePair(state.board);
  const moveHint = directPair ? null : findAnyActionableMove(state.board);
  state.hintIds.clear();
  if (!directPair && !moveHint) {
    setStatus("当前无可执行操作。");
    checkGameOverSoon(30);
    renderBoard();
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
  renderBoard();
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

function handleShuffle() {
  if (state.busy || state.gameOver === "lose") {
    return;
  }
  hideResultModal();
  unlockAudio();
  const tiles = gatherRemainingTiles();
  if (tiles.length < 2) {
    evaluateGameState();
    renderBoard();
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

function restartGame() {
  if (state.gameOver === "lose") {
    return;
  }
  clearInteractionEffects();
  hideResultModal();
  state.snapback = null;
  state.drag = null;
  state.busy = false;
  state.gameOver = null;
  state.board = initializeBoard();
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

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.classList.toggle("hint-focus", state.hintIds.size > 0);
  const widthPct = 100 / COLS;
  const heightPct = 100 / ROWS;

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

      if (state.clickedTileId === tile.id) {
        tileEl.classList.add("clicked");
      }
      if (state.shakeType === tile.type) {
        tileEl.classList.add("shake");
      }
      if (state.hintIds.has(tile.id)) {
        tileEl.classList.add("hint");
      }
      if (state.autoRemoveIds.has(tile.id)) {
        tileEl.classList.add("removing");
      }

      const offset = getOffsetForTile(tile.id);
      if (offset.className) {
        tileEl.classList.add(offset.className);
      }
      tileEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
      boardEl.appendChild(tileEl);
    }
  }

  if (statusEl) {
    statusEl.textContent = state.status;
    statusEl.dataset.state = state.gameOver || "play";
  }
  musicBtn.textContent = `音乐：${state.musicEnabled ? "开" : "关"}`;
}

function onPointerDown(event) {
  if (state.busy) {
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
  renderBoard();
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
  renderBoard();
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
if (resultActionBtn) {
  resultActionBtn.addEventListener("click", () => {
    if (state.resultType === "win") {
      restartGame();
      return;
    }
    hideResultModal();
  });
}
window.addEventListener("resize", renderBoard);

restartGame();
