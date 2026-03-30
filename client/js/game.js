'use strict';

const Game = (() => {
  const BOARD_SIZE = 40;
  const PIECES_PER_PLAYER = 4;
  const MAX_LOG_ENTRIES = 18;
  const COLORS = ['green', 'red', 'blue', 'yellow'];

  const PATH_COORDS = [
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6],
    [4, 7], [4, 8], [4, 9], [4, 10], [5, 10],
    [6, 10], [6, 9], [6, 8], [6, 7], [6, 6],
    [7, 6], [8, 6], [9, 6], [10, 6], [10, 5],
    [10, 4], [9, 4], [8, 4], [7, 4], [6, 4],
    [6, 3], [6, 2], [6, 1], [6, 0], [5, 0],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
    [3, 4], [2, 4], [1, 4], [0, 4], [0, 5]
  ];

  const START_POSITIONS = {
    green: 0,
    yellow: 10,
    blue: 20,
    red: 30
  };

  const BASE_COORDS = {
    red: [[0, 0], [0, 1], [1, 0], [1, 1]],
    green: [[0, 9], [0, 10], [1, 9], [1, 10]],
    blue: [[9, 0], [9, 1], [10, 0], [10, 1]],
    yellow: [[9, 9], [9, 10], [10, 9], [10, 10]]
  };

  const HOME_COORDS = {
    green: [[1, 5], [2, 5], [3, 5], [4, 5]],
    red: [[5, 1], [5, 2], [5, 3], [5, 4]],
    blue: [[9, 5], [8, 5], [7, 5], [6, 5]],
    yellow: [[5, 9], [5, 8], [5, 7], [5, 6]]
  };

  const COLOR_HEX = {
    green: '#00e676',
    red: '#ff1744',
    blue: '#2979ff',
    yellow: '#ffd600'
  };

  const SUPER_FIELDS = new Map([
    [3, {
      type: 'extra_roll',
      title: 'Extra Wurf-Feld',
      badge: '+1',
      description: 'Bei Landung bekommst du sofort einen weiteren Wurf.'
    }],
    [13, {
      type: 'swap',
      title: 'Tausch-Feld',
      badge: '⇄',
      description: 'Wähle danach eine gegnerische Brettfigur und tausche die Position.'
    }],
    [23, {
      type: 'shield',
      title: 'Schutzfeld',
      badge: 'S',
      description: 'Auf diesem Feld kann deine Figur nicht geschmissen werden.'
    }],
    [33, {
      type: 'risk',
      title: 'Risiko-Feld',
      badge: '?',
      description: 'Du würfelst erneut: 1 ins Haus, 2-3 Felder zurück, 4-6 Felder vor.'
    }]
  ]);

  const DICE_PIP_LAYOUTS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };

  let socket = null;
  let gameInfo = null;
  let gameState = null;
  let validMoves = [];
  let diceAnimTimer = null;
  let elapsedTimer = null;
  let winnerCountdownTimer = null;

  const cellLookup = new Map();

  const buildCellLookup = () => {
    cellLookup.clear();

    PATH_COORDS.forEach(([row, col], index) => {
      cellLookup.set(`${row},${col}`, {
        type: 'path',
        index,
        startColor: null,
        superField: SUPER_FIELDS.get(index) || null
      });
    });

    Object.entries(START_POSITIONS).forEach(([color, index]) => {
      const [row, col] = PATH_COORDS[index];
      const key = `${row},${col}`;
      const info = cellLookup.get(key);
      cellLookup.set(key, {
        ...info,
        startColor: color
      });
    });

    COLORS.forEach((color) => {
      BASE_COORDS[color].forEach(([row, col], index) => {
        cellLookup.set(`${row},${col}`, { type: 'base', color, index });
      });

      HOME_COORDS[color].forEach(([row, col], index) => {
        cellLookup.set(`${row},${col}`, { type: 'finish', color, index });
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
        const classes = ['cell'];

        if (!info) {
          classes.push('empty');
        } else if (info.type === 'path') {
          classes.push('path');
          if (info.startColor) {
            classes.push(`start-${info.startColor}`, 'entry', `entry-${info.startColor}`);
          }
          if (info.superField) {
            classes.push('super-field', `super-${info.superField.type}`);
          }
        } else if (info.type === 'base') {
          classes.push(`home-${info.color}`);
        } else if (info.type === 'finish') {
          classes.push(`finish-${info.color}`);
        } else {
          classes.push(info.type);
        }

        cell.className = classes.join(' ');
        cell.dataset.row = row;
        cell.dataset.col = col;

        if (info?.type === 'center') {
          cell.innerHTML = '<span class="center-star">&#9733;</span>';
        }

        if (info?.superField) {
          const badge = document.createElement('div');
          badge.className = 'super-badge';
          badge.textContent = info.superField.badge;

          const tooltip = document.createElement('div');
          tooltip.className = 'cell-tooltip';
          tooltip.innerHTML = `<strong>${info.superField.title}</strong>${info.superField.description}`;

          cell.appendChild(badge);
          cell.appendChild(tooltip);
          cell.setAttribute('aria-label', `${info.superField.title}: ${info.superField.description}`);
        }

        board.appendChild(cell);
      }
    }
  };

  const renderGameState = (state) => {
    if (!state) return;

    gameState = state;
    syncValidMoves();
    syncElapsedTimer();
    clearPieces();
    renderPieces();
    renderPlayerPanels();
    renderTurnStatus();
    renderDice();

    if (gameState.status === 'finished' && gameState.winner) {
      onGameOver({ winner: gameState.winner, state: gameState });
    }
  };

  const syncValidMoves = () => {
    if (
      !gameState ||
      !checkIsMyTurn() ||
      !gameState.diceRolled ||
      gameState.pendingAction
    ) {
      validMoves = [];
      return;
    }

    validMoves = computeValidMoves(gameState, gameState.currentPlayerIndex);
  };

  const clearPieces = () => {
    document.querySelectorAll('.token').forEach((piece) => piece.remove());
  };

  const renderPieces = () => {
    if (!gameState?.players) return;

    const pendingSwap = gameState.pendingAction;
    const isSwapSelectionTurn =
      pendingSwap?.type === 'swap' &&
      pendingSwap.playerId &&
      pendingSwap.playerId === getCurrentPlayerId();

    gameState.players.forEach((player) => {
      player.pieces.forEach((piece, pieceIndex) => {
        const cell = getCellForPiece(player, piece);
        if (!cell) return;

        const token = document.createElement('div');
        token.className = `token token-${player.color}`;
        token.textContent = `${pieceIndex + 1}`;
        token.dataset.playerId = player.id;
        token.dataset.playerColor = player.color;
        token.dataset.pieceIndex = `${pieceIndex}`;

        const isMoveSelectable =
          checkIsMyTurn() &&
          Boolean(gameState.diceRolled) &&
          !gameState.pendingAction &&
          validMoves.includes(pieceIndex) &&
          isCurrentPlayer(player);

        const isSwapTarget =
          isSwapSelectionTurn &&
          !isCurrentPlayer(player) &&
          !piece.isBase &&
          !piece.isHome;

        if (isMoveSelectable) {
          makeTokenInteractive(
            token,
            `Figur ${pieceIndex + 1} von ${Utils.formatPlayerColor(player.color)} bewegen`,
            () => handleMovePiece(pieceIndex)
          );
        } else if (isSwapTarget) {
          token.classList.add('swap-target', 'selectable');
          makeTokenInteractive(
            token,
            `Mit Figur ${pieceIndex + 1} von ${player.name} tauschen`,
            () => handleSwapTarget(player.id, pieceIndex)
          );
        }

        cell.appendChild(token);
      });
    });
  };

  const makeTokenInteractive = (token, label, handler) => {
    token.classList.add('selectable');
    token.setAttribute('tabindex', '0');
    token.setAttribute('role', 'button');
    token.setAttribute('aria-label', label);
    token.addEventListener('click', handler);
    token.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler();
      }
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

    const pendingSwap = gameState.pendingAction;
    const isSwapSelectionTurn =
      pendingSwap?.type === 'swap' &&
      pendingSwap.playerId &&
      pendingSwap.playerId === getCurrentPlayerId();

    if (isSwapSelectionTurn) {
      label.textContent = 'Tauschziel wählen';
      info.textContent = 'Wähle rechts oder direkt auf dem Brett eine gegnerische Figur zum Tauschen.';
      return;
    }

    if (isCurrentPlayer(currentPlayer)) {
      label.textContent = 'Du bist dran';

      if (gameState.diceRolled) {
        info.textContent = `Wähle eine Figur für ${gameState.diceValue} Augen`;
      } else if (gameState.rollAttempts > 0) {
        const attemptsLeft = Math.max(0, 3 - gameState.rollAttempts);
        info.textContent = `Würfle erneut (${attemptsLeft} Versuch${attemptsLeft === 1 ? '' : 'e'} übrig)`;
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
      if (gameState?.pendingAction?.type === 'swap') {
        valueText.textContent = 'Tauschziel auswählen';
      } else if (gameState?.diceValue) {
        valueText.textContent = `Gewürfelt: ${gameState.diceValue}`;
      } else {
        valueText.textContent = 'Bereit zum Würfeln';
      }
    }

    const canRoll =
      checkIsMyTurn() &&
      Boolean(gameState) &&
      gameState.status === 'playing' &&
      !gameState.diceRolled &&
      !gameState.pendingAction;

    rollButton.disabled = !canRoll;
    dice.classList.toggle('clickable', canRoll);
  };

  const renderDiceFace = (value) => {
    const dice = document.getElementById('dice');
    if (!dice) return;

    const pipCount = Math.max(1, Math.min(6, value));
    const activeSlots = new Set(DICE_PIP_LAYOUTS[pipCount] || DICE_PIP_LAYOUTS[1]);
    let markup = `<div class="dice-face" data-value="${pipCount}">`;

    for (let slot = 1; slot <= 9; slot++) {
      markup += '<div class="pip-slot">';
      if (activeSlots.has(slot)) {
        markup += '<div class="pip"></div>';
      }
      markup += '</div>';
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

  const syncElapsedTimer = () => {
    const timer = document.getElementById('game-elapsed-time');
    if (!timer) return;

    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }

    if (!gameState?.startedAt) {
      timer.textContent = '00:00';
      return;
    }

    const update = () => {
      timer.textContent = formatElapsed(Date.now() - gameState.startedAt);
    };

    update();
    elapsedTimer = setInterval(update, 1000);
  };

  const formatElapsed = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => `${value}`.padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const addLogEntry = (message, timestamp = null) => {
    const list = document.getElementById('game-log-list');
    if (!list) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = timestamp || getLogTimestamp();

    const text = document.createElement('span');
    text.className = 'log-message';
    text.textContent = message;

    entry.appendChild(time);
    entry.appendChild(text);
    list.appendChild(entry);

    while (list.children.length > MAX_LOG_ENTRIES) {
      list.removeChild(list.firstChild);
    }

    const scroller = list.closest('.game-log');
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  };

  const getLogTimestamp = () => {
    if (!gameState?.startedAt) {
      return '00:00';
    }
    return formatElapsed(Date.now() - gameState.startedAt);
  };

  const getCurrentPlayerId = () => socket?.id || gameInfo?.playerId || null;

  const checkIsMyTurn = () => {
    if (!gameState?.players) return false;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    return Boolean(currentPlayer && isCurrentPlayer(currentPlayer));
  };

  const isCurrentPlayer = (player) => {
    if (!player) return false;
    const currentId = getCurrentPlayerId();
    return Boolean(currentId && player.id === currentId);
  };

  const handleRollDice = () => {
    if (
      !gameInfo ||
      !checkIsMyTurn() ||
      !gameState ||
      gameState.diceRolled ||
      gameState.pendingAction
    ) {
      return;
    }

    socket.emit('roll-dice', { gameId: gameInfo.gameId });
  };

  const handleMovePiece = (pieceIndex) => {
    if (!gameInfo || !validMoves.includes(pieceIndex) || !gameState || gameState.pendingAction) {
      return;
    }

    socket.emit('move-piece', {
      gameId: gameInfo.gameId,
      pieceIndex
    });

    validMoves = [];
    clearPieces();
    renderPieces();
  };

  const handleSwapTarget = (targetPlayerId, targetPieceIndex) => {
    if (!gameInfo || gameState?.pendingAction?.type !== 'swap') return;

    socket.emit('select-swap-target', {
      gameId: gameInfo.gameId,
      targetPlayerId,
      targetPieceIndex
    });
  };

  const onGameState = (state) => {
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

    if (playerId === getCurrentPlayerId()) {
      validMoves = moves.length > 0 ? moves : computeValidMoves(gameState, gameState.currentPlayerIndex);

      if (validMoves.length === 0 && canRollAgain) {
        addLogEntry(`${rollerName} hat keinen Zug und darf erneut würfeln`);
      } else if (validMoves.length === 0) {
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
    let riskRoll = null;

    if (data.state) {
      renderGameState(data.state);
    }

    const mover = data.state?.players?.[data.playerIndex];
    const moverName = mover ? mover.name : 'Ein Spieler';
    addLogEntry(`${moverName} bewegt Figur ${data.pieceIndex + 1}`);

    (data.captures || []).forEach((capture) => {
      addLogEntry(`${moverName} schlägt ${capture.playerName}`);
    });

    (data.effects || []).forEach((effect) => {
      if (effect.type === 'risk_roll') {
        riskRoll = effect.roll;
      }

      if (effect.message) {
        addLogEntry(effect.message);
      }
    });

    if (riskRoll) {
      const valueText = document.getElementById('dice-value-text');
      animateDice(riskRoll);
      if (valueText) {
        valueText.textContent = `Risiko-Wurf: ${riskRoll}`;
      }
    }
  };

  const onSwapCompleted = (data) => {
    validMoves = [];

    if (data.state) {
      renderGameState(data.state);
    }

    addLogEntry(
      `${data.sourcePlayerName} tauscht Figur ${data.sourcePieceIndex + 1} mit Figur ${data.targetPieceIndex + 1} von ${data.targetPlayerName}`
    );
  };

  const onTurnChanged = (state) => {
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

    const wasVisible = overlay.classList.contains('visible');
    const name = data?.winner?.name || 'Unbekannt';

    if (data.state) {
      gameState = data.state;
    }

    winnerName.textContent = name;
    countdown.textContent = 'Weiterleitung in 60s';
    overlay.classList.add('visible');

    if (!wasVisible) {
      addLogEntry(`${name} hat das Spiel gewonnen`);
    }

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
        onGameOver({ winner: data.state.winner, state: data.state });
      }
    }
  };

  const onError = (data) => {
    addLogEntry(`Fehler: ${data.message}`);
  };

  const computeValidMoves = (state, playerIndex) => {
    const player = state?.players?.[playerIndex];
    const dice = state?.diceValue;

    if (!player || dice === null || state.pendingAction) {
      return [];
    }

    const moves = [];

    for (let pieceIndex = 0; pieceIndex < PIECES_PER_PLAYER; pieceIndex++) {
      const piece = player.pieces[pieceIndex];

      if (piece.isBase) {
        if (dice === 6) {
          const startPosition = START_POSITIONS[player.color];
          if (!isBoardDestinationBlocked(state, playerIndex, startPosition)) {
            moves.push(pieceIndex);
          }
        }
        continue;
      }

      if (piece.isHome) {
        const newHome = piece.homePosition + dice;
        if (
          newHome < PIECES_PER_PLAYER &&
          !ownPieceInHome(player, newHome) &&
          !homePathBlocked(player, piece.homePosition, newHome)
        ) {
          moves.push(pieceIndex);
        }
        continue;
      }

      const stepsFromStart = getStepsFromStart(player.color, piece.position);
      const newSteps = stepsFromStart + dice;

      if (newSteps >= BOARD_SIZE) {
        const homeSlot = newSteps - BOARD_SIZE;
        if (
          homeSlot < PIECES_PER_PLAYER &&
          !ownPieceInHome(player, homeSlot) &&
          !homePathBlocked(player, -1, homeSlot)
        ) {
          moves.push(pieceIndex);
        }
        continue;
      }

      const target = (piece.position + dice) % BOARD_SIZE;
      if (!isBoardDestinationBlocked(state, playerIndex, target)) {
        moves.push(pieceIndex);
      }
    }

    if (dice === 6) {
      const hasBasePiece = player.pieces.some((piece) => piece.isBase);
      const startPosition = START_POSITIONS[player.color];
      const movableStartPieces = moves.filter((moveIndex) => {
        const piece = player.pieces[moveIndex];
        return !piece.isBase && !piece.isHome && piece.position === startPosition;
      });

      if (hasBasePiece && !findBoardPiece(state, startPosition)) {
        return moves.filter((moveIndex) => player.pieces[moveIndex].isBase);
      }

      if (hasBasePiece && movableStartPieces.length > 0) {
        return movableStartPieces;
      }
    }

    return moves;
  };

  const getStepsFromStart = (playerColor, boardPosition) => {
    const start = START_POSITIONS[playerColor];
    return (boardPosition - start + BOARD_SIZE) % BOARD_SIZE;
  };

  const ownPieceInHome = (player, homeSlot) =>
    player.pieces.some((piece) => piece.isHome && piece.homePosition === homeSlot);

  const homePathBlocked = (player, fromSlot, targetSlot) => {
    for (let slot = fromSlot + 1; slot <= targetSlot; slot++) {
      if (ownPieceInHome(player, slot)) {
        return true;
      }
    }
    return false;
  };

  const getFieldAt = (boardPosition) => SUPER_FIELDS.get(boardPosition) || null;

  const isShieldField = (boardPosition) => getFieldAt(boardPosition)?.type === 'shield';

  const findBoardPiece = (state, boardPosition) => {
    for (let playerIndex = 0; playerIndex < state.players.length; playerIndex++) {
      const player = state.players[playerIndex];
      for (let pieceIndex = 0; pieceIndex < player.pieces.length; pieceIndex++) {
        const piece = player.pieces[pieceIndex];
        if (!piece.isBase && !piece.isHome && piece.position === boardPosition) {
          return { playerIndex, pieceIndex, piece, player };
        }
      }
    }
    return null;
  };

  const isBoardDestinationBlocked = (state, playerIndex, boardPosition) => {
    const occupant = findBoardPiece(state, boardPosition);
    if (!occupant) return false;
    if (occupant.playerIndex === playerIndex) return true;
    return isShieldField(boardPosition);
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

    const logList = document.getElementById('game-log-list');
    if (logList) {
      logList.innerHTML = '';
    }

    const rollButton = document.getElementById('roll-dice-btn');
    const dice = document.getElementById('dice');

    if (rollButton) {
      rollButton.addEventListener('click', handleRollDice);
    }

    if (dice) {
      dice.addEventListener('click', handleRollDice);
    }

    socket.on('connect', () => {
      gameInfo = SocketManager.getGameInfo() || gameInfo;
    });

    socket.on('game-state', onGameState);
    socket.on('dice-rolled', onDiceRolled);
    socket.on('piece-moved', onPieceMoved);
    socket.on('swap-completed', onSwapCompleted);
    socket.on('turn-changed', onTurnChanged);
    socket.on('game-over', onGameOver);
    socket.on('player-left', onPlayerLeft);
    socket.on('error', onError);

    socket.emit('get-game-state', { gameId: gameInfo.gameId }, (state) => {
      if (state) {
        renderGameState(state);
      }
    });
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
