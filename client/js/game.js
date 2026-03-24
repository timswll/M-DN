'use strict';

const Game = (() => {
  // ── Board coordinate mappings ─────────────────────────────────────────

  // 40 path positions going clockwise
  const PATH_COORDS = [
    [0, 4],   // 0  – Red start
    [1, 4],   // 1
    [2, 4],   // 2
    [3, 4],   // 3
    [4, 4],   // 4
    [4, 3],   // 5
    [4, 2],   // 6
    [4, 1],   // 7
    [4, 0],   // 8
    [5, 0],   // 9
    [6, 0],   // 10 – Yellow start
    [6, 1],   // 11
    [6, 2],   // 12
    [6, 3],   // 13
    [6, 4],   // 14
    [7, 4],   // 15
    [8, 4],   // 16
    [9, 4],   // 17
    [10, 4],  // 18
    [10, 5],  // 19
    [10, 6],  // 20 – Green start
    [9, 6],   // 21
    [8, 6],   // 22
    [7, 6],   // 23
    [6, 6],   // 24
    [6, 7],   // 25
    [6, 8],   // 26
    [6, 9],   // 27
    [6, 10],  // 28
    [5, 10],  // 29
    [4, 10],  // 30 – Blue start
    [4, 9],   // 31
    [4, 8],   // 32
    [4, 7],   // 33
    [4, 6],   // 34
    [3, 6],   // 35
    [2, 6],   // 36
    [1, 6],   // 37
    [0, 6],   // 38
    [0, 5],   // 39
  ];

  // Start positions per color
  const START_POSITIONS = { red: 0, yellow: 10, green: 20, blue: 30 };

  // 2×2 base grids in the four corners
  const BASE_COORDS = {
    red:    [[0, 0], [0, 1], [1, 0], [1, 1]],
    blue:   [[0, 9], [0, 10], [1, 9], [1, 10]],
    green:  [[9, 9], [9, 10], [10, 9], [10, 10]],
    yellow: [[9, 0], [9, 1], [10, 0], [10, 1]],
  };

  // 4 home cells leading toward the center
  const HOME_COORDS = {
    red:    [[1, 5], [2, 5], [3, 5], [4, 5]],
    blue:   [[5, 9], [5, 8], [5, 7], [5, 6]],
    green:  [[9, 5], [8, 5], [7, 5], [6, 5]],
    yellow: [[5, 1], [5, 2], [5, 3], [5, 4]],
  };

  const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const COLORS = ['red', 'blue', 'green', 'yellow'];
  const MAX_LOG_ENTRIES = 10;

  // ── State ─────────────────────────────────────────────────────────────

  let socket = null;
  let gameInfo = null;
  let gameState = null;
  let validMoves = [];
  let diceAnimTimer = null;

  // ── Lookup tables built once ──────────────────────────────────────────

  // key "row,col" → { type, ... }
  const cellLookup = new Map();

  const buildCellLookup = () => {
    cellLookup.clear();

    PATH_COORDS.forEach(([r, c], idx) => {
      const key = `${r},${c}`;
      const entry = { type: 'path', index: idx };
      // Mark start positions
      for (const [color, startIdx] of Object.entries(START_POSITIONS)) {
        if (idx === startIdx) entry.startColor = color;
      }
      cellLookup.set(key, entry);
    });

    for (const color of COLORS) {
      BASE_COORDS[color].forEach(([r, c], idx) => {
        cellLookup.set(`${r},${c}`, { type: 'base', color, index: idx });
      });
      HOME_COORDS[color].forEach(([r, c], idx) => {
        cellLookup.set(`${r},${c}`, { type: 'home', color, index: idx });
      });
    }

    // Center cell
    cellLookup.set('5,5', { type: 'center' });
  };

  // ── Board construction ────────────────────────────────────────────────

  const buildBoard = () => {
    const board = document.getElementById('game-board');
    if (!board) return;
    board.innerHTML = '';

    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 11; col++) {
        const cell = document.createElement('div');
        cell.className = 'board-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        const info = cellLookup.get(`${row},${col}`);

        if (!info) {
          cell.classList.add('empty');
        } else if (info.type === 'path') {
          cell.classList.add('path');
          cell.dataset.pathPos = info.index;
          if (info.startColor) {
            cell.classList.add(`start-${info.startColor}`);
            cell.dataset.start = info.startColor;
          }
        } else if (info.type === 'base') {
          cell.classList.add(`base-${info.color}`);
          cell.dataset.baseColor = info.color;
          cell.dataset.baseIndex = info.index;
        } else if (info.type === 'home') {
          cell.classList.add(`home-${info.color}`);
          cell.dataset.homeColor = info.color;
          cell.dataset.homeIndex = info.index;
        } else if (info.type === 'center') {
          cell.classList.add('center');
          cell.textContent = '🎲';
        }

        board.appendChild(cell);
      }
    }
  };

  // ── Rendering game state ──────────────────────────────────────────────

  const renderGameState = (state) => {
    gameState = state;
    clearPieces();
    renderPieces();
    renderPlayerPanel();
    renderTurnIndicator();
    renderDice();
  };

  const clearPieces = () => {
    const board = document.getElementById('game-board');
    if (!board) return;
    board.querySelectorAll('.piece').forEach((p) => p.remove());
  };

  const renderPieces = () => {
    if (!gameState || !gameState.players) return;

    const isMyTurn = checkIsMyTurn();
    const diceRolled = gameState.diceRolled;

    gameState.players.forEach((player) => {
      player.pieces.forEach((piece, pieceIdx) => {
        const cell = getCellForPiece(player, piece);
        if (!cell) return;

        const pieceEl = document.createElement('div');
        pieceEl.className = `piece ${player.color}`;
        pieceEl.dataset.playerColor = player.color;
        pieceEl.dataset.pieceIndex = pieceIdx;

        // Determine if this piece is clickable
        const isClickable = isMyTurn && diceRolled && validMoves.includes(pieceIdx) &&
          isCurrentPlayer(player);

        if (isClickable) {
          pieceEl.classList.add('clickable');
          pieceEl.setAttribute('tabindex', '0');
          pieceEl.setAttribute('role', 'button');
          pieceEl.setAttribute('aria-label',
            `Figur ${pieceIdx + 1} von ${Utils.formatPlayerColor(player.color)} bewegen`);

          // Direct listener per piece – NO event delegation
          const idx = pieceIdx;
          pieceEl.addEventListener('click', () => {
            handleMovePiece(idx);
          });
          pieceEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleMovePiece(idx);
            }
          });
        }

        cell.appendChild(pieceEl);
      });
    });
  };

  const getCellForPiece = (player, piece) => {
    let row, col;

    if (piece.isBase) {
      const baseIdx = getNextFreeBaseSlot(player, piece);
      const coords = BASE_COORDS[player.color][baseIdx];
      if (!coords) return null;
      [row, col] = coords;
    } else if (piece.isHome) {
      const homeIdx = piece.homePosition;
      if (homeIdx < 0 || homeIdx > 3) return null;
      const coords = HOME_COORDS[player.color][homeIdx];
      if (!coords) return null;
      [row, col] = coords;
    } else {
      if (piece.position < 0 || piece.position > 39) return null;
      [row, col] = PATH_COORDS[piece.position];
    }

    return document.querySelector(
      `.board-cell[data-row="${row}"][data-col="${col}"]`
    );
  };

  // Find the correct visual base slot for a given piece.
  // Pieces in base are distributed across the 4 base cells.
  const getNextFreeBaseSlot = (player, targetPiece) => {
    let slotIdx = 0;
    for (const p of player.pieces) {
      if (p === targetPiece) return slotIdx;
      if (p.isBase) slotIdx++;
    }
    return 0;
  };

  // ── Player panel ──────────────────────────────────────────────────────

  const renderPlayerPanel = () => {
    const list = document.getElementById('player-info-list');
    if (!list || !gameState) return;
    list.innerHTML = '';

    gameState.players.forEach((player, idx) => {
      const div = document.createElement('div');
      div.className = 'player-info-entry';
      if (idx === gameState.currentPlayerIndex) {
        div.classList.add('active-player');
      }

      const dot = document.createElement('span');
      dot.className = `player-color-dot ${player.color}`;
      div.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'player-info-name';
      name.textContent = player.name;
      if (isCurrentPlayer(player)) {
        name.classList.add('is-self');
        name.textContent += ' (Du)';
      }
      div.appendChild(name);

      // Pieces at home counter
      const homeCount = player.pieces.filter((p) => p.isHome).length;
      if (homeCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'home-badge';
        badge.textContent = `🏠 ${homeCount}/4`;
        div.appendChild(badge);
      }

      list.appendChild(div);
    });
  };

  // ── Turn indicator ────────────────────────────────────────────────────

  const renderTurnIndicator = () => {
    const el = document.getElementById('turn-indicator');
    if (!el || !gameState) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return;

    if (isCurrentPlayer(currentPlayer)) {
      el.textContent = 'Du bist am Zug!';
      el.className = 'turn-indicator turn-self';
    } else {
      el.textContent = `${currentPlayer.name} (${Utils.formatPlayerColor(currentPlayer.color)}) ist am Zug`;
      el.className = 'turn-indicator';
    }
  };

  // ── Dice ──────────────────────────────────────────────────────────────

  const renderDice = () => {
    const diceEl = document.getElementById('dice');
    const valueText = document.getElementById('dice-value-text');
    const rollBtn = document.getElementById('roll-dice-btn');
    if (!diceEl || !rollBtn) return;

    const isMyTurn = checkIsMyTurn();

    // Show dice value
    if (gameState && gameState.diceValue) {
      diceEl.textContent = DICE_FACES[gameState.diceValue - 1];
      diceEl.classList.add('rolled');
      if (valueText) valueText.textContent = gameState.diceValue;
    } else {
      diceEl.textContent = '🎲';
      diceEl.classList.remove('rolled');
      if (valueText) valueText.textContent = '';
    }

    // Enable roll button only if it's our turn and dice not yet rolled
    if (isMyTurn && gameState && !gameState.diceRolled) {
      rollBtn.disabled = false;
      rollBtn.classList.add('pulse');
    } else {
      rollBtn.disabled = true;
      rollBtn.classList.remove('pulse');
    }
  };

  const animateDice = (finalValue) => {
    const diceEl = document.getElementById('dice');
    if (!diceEl) return;

    let ticks = 0;
    const totalTicks = 10;

    if (diceAnimTimer) clearInterval(diceAnimTimer);

    diceAnimTimer = setInterval(() => {
      ticks++;
      const randomFace = DICE_FACES[Math.floor(Math.random() * 6)];
      diceEl.textContent = randomFace;
      diceEl.classList.add('dice-spin');

      if (ticks >= totalTicks) {
        clearInterval(diceAnimTimer);
        diceAnimTimer = null;
        diceEl.textContent = DICE_FACES[finalValue - 1];
        diceEl.classList.remove('dice-spin');
        diceEl.classList.add('rolled');
        const valueText = document.getElementById('dice-value-text');
        if (valueText) valueText.textContent = finalValue;
      }
    }, 80);
  };

  // ── Game log ──────────────────────────────────────────────────────────

  const addLogEntry = (message) => {
    const list = document.getElementById('game-log-list');
    if (!list) return;

    const li = document.createElement('li');
    li.textContent = message;
    list.prepend(li);

    // Keep only MAX_LOG_ENTRIES
    while (list.children.length > MAX_LOG_ENTRIES) {
      list.removeChild(list.lastChild);
    }
  };

  // ── Identity helpers ──────────────────────────────────────────────────

  const checkIsMyTurn = () => {
    if (!gameState) return false;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    return currentPlayer && isCurrentPlayer(currentPlayer);
  };

  const isCurrentPlayer = (player) => {
    if (!player || !gameInfo) return false;
    return player.id === socket.id || player.id === gameInfo.playerId;
  };

  const getMyPlayer = () => {
    if (!gameState) return null;
    return gameState.players.find((p) => isCurrentPlayer(p)) || null;
  };

  // ── Event handlers ────────────────────────────────────────────────────

  const handleRollDice = () => {
    if (!gameInfo) return;
    socket.emit('roll-dice', { gameId: gameInfo.gameId });
  };

  const handleMovePiece = (pieceIndex) => {
    if (!gameInfo) return;
    socket.emit('move-piece', {
      gameId: gameInfo.gameId,
      pieceIndex
    });
    // Disable further clicks while server processes
    validMoves = [];
    clearPieces();
    renderPieces();
  };

  // ── Socket event handlers ─────────────────────────────────────────────

  const onGameState = (state) => {
    validMoves = [];
    renderGameState(state);
  };

  const onDiceRolled = (data) => {
    const { value, playerId } = data;
    const moves = data.validMoves || [];

    // Find the player who rolled
    const roller = gameState
      ? gameState.players.find((p) => p.id === playerId)
      : null;
    const rollerName = roller ? roller.name : 'Ein Spieler';

    addLogEntry(`${rollerName} hat eine ${value} gewürfelt`);
    animateDice(value);

    // Update local state
    if (gameState) {
      gameState.diceValue = value;
      gameState.diceRolled = true;
    }

    // Store valid moves if it's our turn
    if (playerId === socket.id || playerId === gameInfo.playerId) {
      validMoves = moves;
      if (moves.length === 0) {
        addLogEntry('Keine gültigen Züge');
      }
    } else {
      validMoves = [];
    }

    // Re-render after animation
    setTimeout(() => {
      renderPieces();
      renderDice();
    }, totalAnimTime());
  };

  const totalAnimTime = () => 10 * 80 + 50; // ticks * interval + buffer

  const onPieceMoved = (data) => {
    validMoves = [];
    if (data.state) {
      renderGameState(data.state);
    }
    const moverPlayer = data.state && data.state.players
      ? data.state.players[data.playerIndex]
      : null;
    const mover = moverPlayer ? moverPlayer.name : 'Ein Spieler';
    addLogEntry(`${mover} hat eine Figur bewegt`);

    if (data.captured) {
      const capturedName = data.captured.playerName || 'einen Spieler';
      addLogEntry(`${mover} hat ${capturedName} geschlagen!`);
    }
  };

  const onTurnChanged = (data) => {
    validMoves = [];
    // Server sends full game state for turn-changed
    if (data && data.players) {
      gameState = data;
    } else if (gameState && data.currentPlayerIndex !== undefined) {
      gameState.currentPlayerIndex = data.currentPlayerIndex;
      gameState.diceValue = null;
      gameState.diceRolled = false;
    }
    if (gameState) {
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      if (currentPlayer) {
        addLogEntry(`${currentPlayer.name} ist am Zug`);
      }
    }
    renderTurnIndicator();
    renderDice();
    clearPieces();
    renderPieces();
  };

  const onGameOver = (data) => {
    const overlay = document.getElementById('winner-overlay');
    const nameEl = document.getElementById('winner-name');
    const countdownEl = document.getElementById('winner-countdown');
    if (!overlay || !nameEl) return;

    const winnerName = (data.winner && data.winner.name) || 'Unbekannt';
    const winnerColor = (data.winner && data.winner.color) || '';
    nameEl.textContent = winnerName;
    overlay.classList.add('visible');

    addLogEntry(`🏆 ${winnerName} hat das Spiel gewonnen!`);

    // 60-second countdown
    let remaining = 60;
    if (countdownEl) {
      countdownEl.textContent = `Weiterleitung in ${remaining}s…`;
    }

    const countdownTimer = setInterval(() => {
      remaining--;
      if (countdownEl) {
        countdownEl.textContent = `Weiterleitung in ${remaining}s…`;
      }
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        SocketManager.clearGameInfo();
        window.location.href = 'index.html';
      }
    }, 1000);

    // The "Zurück" link in HTML already points to index.html;
    // make sure we clear game info when it's clicked
    const backLink = overlay.querySelector('a.btn');
    if (backLink) {
      backLink.addEventListener('click', (e) => {
        e.preventDefault();
        clearInterval(countdownTimer);
        SocketManager.clearGameInfo();
        window.location.href = 'index.html';
      });
    }
  };

  const onPlayerLeft = (data) => {
    const name = data.playerName || 'Ein Spieler';
    addLogEntry(`${name} hat das Spiel verlassen`);
    if (data.state) {
      renderGameState(data.state);
    }
  };

  const onError = (data) => {
    addLogEntry(`Fehler: ${data.message}`);
  };

  // ── Initialization ────────────────────────────────────────────────────

  const init = () => {
    gameInfo = SocketManager.getGameInfo();
    if (!gameInfo) {
      window.location.href = 'lobby.html';
      return;
    }

    socket = SocketManager.connect();
    buildCellLookup();
    buildBoard();

    // Direct listener on dice button (no delegation)
    const rollBtn = document.getElementById('roll-dice-btn');
    if (rollBtn) {
      rollBtn.addEventListener('click', handleRollDice);
    }

    // Socket events
    socket.on('game-state', onGameState);
    socket.on('dice-rolled', onDiceRolled);
    socket.on('piece-moved', onPieceMoved);
    socket.on('turn-changed', onTurnChanged);
    socket.on('game-over', onGameOver);
    socket.on('player-left', onPlayerLeft);
    socket.on('error', onError);

    // Request current state
    socket.emit('reconnect-game', {
      gameId: gameInfo.gameId,
      playerId: gameInfo.playerId
    });
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
