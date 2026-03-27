'use strict';
//Neuer Stand: 2024-06-01
const Game = (() => {
  const PATH_COORDS = [
    [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
    [4, 3], [4, 2], [4, 1], [4, 0], [5, 0],
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4],
    [7, 4], [8, 4], [9, 4], [10, 4], [10, 5],
    [10, 6], [9, 6], [8, 6], [7, 6], [6, 6],
    [6, 7], [6, 8], [6, 9], [6, 10], [5, 10],
    [4, 10], [4, 9], [4, 8], [4, 7], [4, 6],
    [3, 6], [2, 6], [1, 6], [0, 6], [0, 5]
  ];

  const START_POSITIONS = {
    green: 0,
    red: 10,
    blue: 20,
    yellow: 30
  };

  const BASE_COORDS = {
    green: [[0, 0], [0, 1], [1, 0], [1, 1]],
    red: [[9, 0], [10, 0], [9, 1], [10, 1]],
    blue: [[9, 9], [10, 9], [9, 10], [10, 10]],
    yellow: [[0, 9], [0, 10], [1, 9], [1, 10]]
  };

  const HOME_COORDS = {
    green: [[1, 5], [2, 5], [3, 5], [4, 5]],
    red: [[5, 1], [5, 2], [5, 3], [5, 4]],
    blue: [[9, 5], [8, 5], [7, 5], [6, 5]],
    yellow: [[5, 9], [5, 8], [5, 7], [5, 6]]
  };

  const COLORS = ['green', 'red', 'blue', 'yellow'];
  const COLOR_HEX = {
    green: '#00e676',
    red: '#ff1744',
    blue: '#2979ff',
    yellow: '#ffd600'
  };
  const MAX_LOG_ENTRIES = 16;

  let socket = null;
  let gameInfo = null;
  let gameState = null;
  let validMoves = [];
  let diceAnimTimer = null;
  let winnerCountdownTimer = null;

  const cellLookup = new Map();

  const buildCellLookup = () => {
    cellLookup.clear();

    PATH_COORDS.forEach(([row, col], index) => {
      cellLookup.set(`${row},${col}`, { type: 'path', index });
    });

    Object.entries(START_POSITIONS).forEach(([color, index]) => {
      const [row, col] = PATH_COORDS[index];
      cellLookup.set(`${row},${col}`, {
        type: `start-${color}`,
        entry: color,
        index
      });
    });

    COLORS.forEach((color) => {
      BASE_COORDS[color].forEach(([row, col], index) => {
        cellLookup.set(`${row},${col}`, { type: `home-${color}`, color, index });
      });

      HOME_COORDS[color].forEach(([row, col], index) => {
        cellLookup.set(`${row},${col}`, { type: `finish-${color}`, color, index });
      });
    });

    cellLookup.set('5,5', { type: 'center' });
  };

  const buildBoard = () => {
    const board = document.getElementById('game-board');
    if (!board) return;

    board.innerHTML = '';

    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 11; col++) {
        const info = cellLookup.get(`${row},${col}`);
        const cell = document.createElement('div');

        cell.className = `cell ${info ? info.type : 'empty'}`;
        if (info && info.entry) {
          cell.classList.add('entry', `entry-${info.entry}`);
        }

        cell.dataset.row = row;
        cell.dataset.col = col;

        if (info && info.type === 'center') {
          cell.innerHTML = '<span class="center-star">&#9733;</span>';
        }

        board.appendChild(cell);
      }
    }
  };

  const renderGameState = (state) => {
    if (!state) return;

    gameState = state;
    clearPieces();
    renderPieces();
    renderPlayerPanels();
    renderTurnStatus();
    renderDice();
  };

  const clearPieces = () => {
    document.querySelectorAll('.token').forEach((piece) => piece.remove());
  };

  const renderPieces = () => {
    if (!gameState?.players) return;

    const isMyTurn = checkIsMyTurn();

    gameState.players.forEach((player) => {
      player.pieces.forEach((piece, pieceIndex) => {
        const cell = getCellForPiece(player, piece);
        if (!cell) return;

        const token = document.createElement('div');
        token.className = `token token-${player.color}`;
        token.textContent = `${pieceIndex + 1}`;
        token.dataset.playerColor = player.color;
        token.dataset.pieceIndex = pieceIndex;

        const isSelectable =
          isMyTurn &&
          Boolean(gameState.diceRolled) &&
          validMoves.includes(pieceIndex) &&
          isCurrentPlayer(player);

        if (isSelectable) {
          token.classList.add('selectable');
          token.setAttribute('tabindex', '0');
          token.setAttribute(
            'aria-label',
            `Figur ${pieceIndex + 1} von ${Utils.formatPlayerColor(player.color)} bewegen`
          );
          token.addEventListener('click', () => handleMovePiece(pieceIndex));
          token.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleMovePiece(pieceIndex);
            }
          });
        }

        cell.appendChild(token);
      });
    });
  };

  const getCellForPiece = (player, piece) => {
    let coords = null;

    if (piece.isBase) {
      const baseIndex = getBaseSlotIndex(player, piece);
      coords = BASE_COORDS[player.color][baseIndex];
    } else if (piece.isHome) {
      coords = HOME_COORDS[player.color][piece.homePosition];
    } else if (piece.position >= 0 && piece.position < PATH_COORDS.length) {
      coords = PATH_COORDS[piece.position];
    }

    if (!coords) return null;

    return document.querySelector(
      `.cell[data-row="${coords[0]}"][data-col="${coords[1]}"]`
    );
  };

  const getBaseSlotIndex = (player, targetPiece) => {
    let slotIndex = 0;

    for (const piece of player.pieces) {
      if (piece === targetPiece) return slotIndex;
      if (piece.isBase) slotIndex++;
    }

    return 0;
  };

  const renderPlayerPanels = () => {
    const list = document.getElementById('player-info-list');
    if (!list || !gameState?.players) return;

    list.innerHTML = '';

    gameState.players.forEach((player, index) => {
      const panel = document.createElement('div');
      panel.className = `player-panel ${player.color}`;
      if (index === gameState.currentPlayerIndex) {
        panel.classList.add('active');
      }

      const dot = document.createElement('div');
      dot.className = 'player-color';
      panel.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = isCurrentPlayer(player) ? `${player.name} (Du)` : player.name;
      panel.appendChild(name);

      const score = document.createElement('span');
      score.className = 'player-score';
      score.textContent = `${player.pieces.filter((piece) => piece.isHome).length}/4`;
      panel.appendChild(score);

      list.appendChild(panel);
    });
  };

  const renderTurnStatus = () => {
    const label = document.getElementById('turn-indicator');
    const dot = document.getElementById('turn-dot');
    const info = document.getElementById('status-info');
    if (!label || !dot || !info || !gameState?.players) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return;

    const accent = COLOR_HEX[currentPlayer.color] || COLOR_HEX.green;
    dot.style.background = accent;
    dot.style.boxShadow = `0 0 8px ${accent}`;

    if (isCurrentPlayer(currentPlayer)) {
      label.textContent = 'Du bist dran';

      if (gameState.diceRolled) {
        info.textContent = `Wähle eine Figur (${gameState.diceValue})`;
      } else if (gameState.rollAttempts > 0) {
        info.textContent = `Würfle erneut (${3 - gameState.rollAttempts} Versuch${gameState.rollAttempts === 2 ? '' : 'e'} übrig)`;
      } else {
        info.textContent = 'Würfle, um deinen Zug zu starten';
      }
    } else {
      label.textContent = `${currentPlayer.name} ist dran`;
      info.textContent = `Warte auf ${currentPlayer.name}`;
    }
  };

  const renderDice = () => {
    const dice = document.getElementById('dice');
    const valueText = document.getElementById('dice-value-text');
    const rollButton = document.getElementById('roll-dice-btn');
    if (!dice || !rollButton) return;

    renderDiceFace(gameState?.diceValue || 1);

    if (valueText) {
      valueText.textContent = gameState?.diceValue
        ? `Gewürfelt: ${gameState.diceValue}`
        : 'Bereit zum Würfeln';
    }

    const canRoll = checkIsMyTurn() && gameState && !gameState.diceRolled;
    rollButton.disabled = !canRoll;
    dice.classList.toggle('clickable', canRoll);
  };

  const renderDiceFace = (value) => {
    const dice = document.getElementById('dice');
    if (!dice) return;

    const pipCount = Math.max(1, Math.min(6, value));
    let markup = `<div class="dice-face" data-value="${pipCount}">`;

    for (let i = 0; i < pipCount; i++) {
      markup += '<div class="pip"></div>';
    }

    markup += '</div>';
    dice.innerHTML = markup;
  };

  const animateDice = (finalValue) => {
    const dice = document.getElementById('dice');
    if (!dice) return;

    dice.classList.add('rolling');

    if (diceAnimTimer) {
      clearInterval(diceAnimTimer);
      diceAnimTimer = null;
    }

    let ticks = 0;
    diceAnimTimer = setInterval(() => {
      ticks++;
      renderDiceFace(Math.floor(Math.random() * 6) + 1);

      if (ticks >= 8) {
        clearInterval(diceAnimTimer);
        diceAnimTimer = null;
        dice.classList.remove('rolling');
        renderDiceFace(finalValue);
      }
    }, 60);
  };

  const addLogEntry = (message) => {
    const list = document.getElementById('game-log-list');
    if (!list) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = message;
    list.appendChild(entry);

    while (list.children.length > MAX_LOG_ENTRIES) {
      list.removeChild(list.firstChild);
    }

    const scroller = list.closest('.game-log');
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  };

  const checkIsMyTurn = () => {
    if (!gameState?.players) return false;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    return Boolean(currentPlayer && isCurrentPlayer(currentPlayer));
  };

  const isCurrentPlayer = (player) => {
    if (!player || !gameInfo) return false;
    return player.id === socket.id || player.id === gameInfo.playerId;
  };

  const handleRollDice = () => {
    if (!gameInfo || !checkIsMyTurn() || (gameState && gameState.diceRolled)) return;
    socket.emit('roll-dice', { gameId: gameInfo.gameId });
  };

  const handleMovePiece = (pieceIndex) => {
    if (!gameInfo || !validMoves.includes(pieceIndex)) return;

    socket.emit('move-piece', {
      gameId: gameInfo.gameId,
      pieceIndex
    });

    validMoves = [];
    clearPieces();
    renderPieces();
  };

  const onGameState = (state) => {
    validMoves = [];
    renderGameState(state);
  };

  const onDiceRolled = (data) => {
    const {
      value,
      playerId,
      validMoves: moves = [],
      canRollAgain = false,
      rollAttempts = 0,
      state
    } = data;

    if (state) {
      gameState = state;
    } else if (gameState) {
      gameState.diceValue = value;
      gameState.diceRolled = !canRollAgain;
      gameState.rollAttempts = rollAttempts;
    }

    const roller = gameState?.players?.find((player) => player.id === playerId);
    const rollerName = roller ? roller.name : 'Ein Spieler';

    addLogEntry(`${rollerName} würfelt ${value}`);
    animateDice(value);

    if (playerId === socket.id || playerId === gameInfo?.playerId) {
      validMoves = moves;
      if (moves.length === 0 && canRollAgain) {
        addLogEntry(`${rollerName} hat keinen Zug und darf erneut würfeln`);
      } else if (moves.length === 0) {
        addLogEntry('Kein gültiger Zug möglich');
      }
    } else {
      validMoves = [];
      if (canRollAgain) {
        addLogEntry(`${rollerName} darf erneut würfeln`);
      }
    }

    window.setTimeout(() => {
      renderGameState(gameState);
    }, 560);
  };

  const onPieceMoved = (data) => {
    validMoves = [];

    if (data.state) {
      renderGameState(data.state);
    }

    const mover = data.state?.players?.[data.playerIndex];
    const moverName = mover ? mover.name : 'Ein Spieler';
    addLogEntry(`${moverName} bewegt eine Figur`);

    if (data.captured?.playerName) {
      addLogEntry(`${moverName} schlägt ${data.captured.playerName}`);
    }
  };

  const onTurnChanged = (state) => {
    validMoves = [];
    renderGameState(state);

    const currentPlayer = state?.players?.[state.currentPlayerIndex];
    if (currentPlayer) {
      addLogEntry(`${currentPlayer.name} ist am Zug`);
    }
  };

  const onGameOver = (data) => {
    const overlay = document.getElementById('winner-overlay');
    const winnerName = document.getElementById('winner-name');
    const countdown = document.getElementById('winner-countdown');
    const backLink = overlay?.querySelector('a.btn');
    if (!overlay || !winnerName || !countdown) return;

    const name = data?.winner?.name || 'Unbekannt';
    winnerName.textContent = name;
    countdown.textContent = 'Weiterleitung in 60s';
    overlay.classList.add('visible');
    addLogEntry(`${name} hat das Spiel gewonnen`);

    if (winnerCountdownTimer) {
      clearInterval(winnerCountdownTimer);
    }

    let remaining = 60;
    winnerCountdownTimer = setInterval(() => {
      remaining--;
      countdown.textContent = `Weiterleitung in ${remaining}s`;

      if (remaining <= 0) {
        clearInterval(winnerCountdownTimer);
        winnerCountdownTimer = null;
        SocketManager.clearGameInfo();
        window.location.href = 'index.html';
      }
    }, 1000);

    if (backLink) {
      backLink.onclick = (event) => {
        event.preventDefault();
        if (winnerCountdownTimer) {
          clearInterval(winnerCountdownTimer);
          winnerCountdownTimer = null;
        }
        SocketManager.clearGameInfo();
        window.location.href = 'index.html';
      };
    }
  };

  const onPlayerLeft = (data) => {
    const name = data.playerName || 'Ein Spieler';
    addLogEntry(`${name} hat das Spiel verlassen`);

    if (data.state) {
      renderGameState(data.state);
      if (data.state.status === 'finished' && data.state.winner) {
        onGameOver({ winner: data.state.winner });
      }
    }
  };

  const onError = (data) => {
    addLogEntry(`Fehler: ${data.message}`);
  };

  const init = () => {
    gameInfo = SocketManager.getGameInfo();
    if (!gameInfo) {
      window.location.href = 'lobby.html';
      return;
    }

    socket = SocketManager.connect();
    buildCellLookup();
    buildBoard();

    const rollButton = document.getElementById('roll-dice-btn');
    const dice = document.getElementById('dice');

    if (rollButton) {
      rollButton.addEventListener('click', handleRollDice);
    }

    if (dice) {
      dice.addEventListener('click', handleRollDice);
    }

    socket.on('game-state', onGameState);
    socket.on('dice-rolled', onDiceRolled);
    socket.on('piece-moved', onPieceMoved);
    socket.on('turn-changed', onTurnChanged);
    socket.on('game-over', onGameOver);
    socket.on('player-left', onPlayerLeft);
    socket.on('error', onError);

    gameInfo = SocketManager.getGameInfo();
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
