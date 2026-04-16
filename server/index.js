const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { Game, games } = require('./gameLogic');
const { randomIndex } = require('./random');
const { validatePlayerName, validateGameId, validateMove } = require('./validation');
const apiRouter = require('./routes/api');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Middleware ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/api', apiRouter);

// ── Socket tracking ────────────────────────────────────────────────────
// socketId -> { gameId }
const socketMap = new Map();

// Grace period timers for disconnections during page navigation
// playerId -> timeoutId
const disconnectTimers = new Map();
const botTimers = new Map();
const noMoveTimers = new Map();
const inactivityTimers = new Map();
const BOT_ACTION_DELAY_MS = 900;
const NO_MOVE_NOTICE_MS = 3000;
const GAME_INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const SOCKET_ERROR_EVENT = 'game-error';

/**
 * Find the player index for a socket inside a game.
 */
const findPlayerIndex = (game, socketId) => game.players.findIndex((p) => p.id === socketId);

const getSocketEntry = (socketId) => socketMap.get(socketId) || null;

const assertSocketCanEnterGame = (socket, targetGameId = null) => {
  const entry = getSocketEntry(socket.id);
  if (!entry) {
    return;
  }

  if (targetGameId && entry.gameId === targetGameId) {
    return;
  }

  if (!games.has(entry.gameId)) {
    socketMap.delete(socket.id);
    return;
  }

  throw new Error('This socket is already assigned to another game');
};

const getMemberGame = (socket, requestedGameId, options = {}) => {
  const { requirePlaying = false, requireActiveTurn = false } = options;
  const entry = getSocketEntry(socket.id);

  if (!entry || !requestedGameId || entry.gameId !== requestedGameId) {
    throw new Error('You are not in this game');
  }

  const gameIdResult = validateGameId(requestedGameId);
  if (!gameIdResult.valid) {
    throw new Error(gameIdResult.reason);
  }

  const game = games.get(requestedGameId);
  if (!game) {
    throw new Error('Game not found');
  }

  const playerIndex = findPlayerIndex(game, socket.id);
  if (playerIndex === -1) {
    throw new Error('You are not in this game');
  }

  if (requirePlaying && game.status !== 'playing') {
    throw new Error('Game is not in progress');
  }

  if (requireActiveTurn && playerIndex !== game.currentPlayerIndex) {
    throw new Error('It is not your turn');
  }

  return { game, playerIndex };
};

const emitSocketError = (socket, err) => {
  socket.emit(SOCKET_ERROR_EVENT, { message: err.message });
};

const clearBotTimer = (gameId) => {
  const timer = botTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(gameId);
  }
};

const clearNoMoveTimer = (gameId) => {
  const timer = noMoveTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    noMoveTimers.delete(gameId);
  }
};

const clearInactivityTimer = (gameId) => {
  const timer = inactivityTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    inactivityTimers.delete(gameId);
  }
};

const clearGameTimers = (gameId) => {
  clearBotTimer(gameId);
  clearNoMoveTimer(gameId);
  clearInactivityTimer(gameId);
};

/**
 * Abort an active game after prolonged inactivity and notify every connected client.
 */
const abortGameForInactivity = (gameId) => {
  const game = games.get(gameId);
  if (!game) {
    clearGameTimers(gameId);
    return;
  }

  clearGameTimers(gameId);
  io.to(game.id).emit('game-aborted', {
    reason: 'timeout',
    message: 'Das Spiel wurde nach einer Stunde ohne Aktivität beendet.',
  });

  game.players.forEach((player) => {
    socketMap.delete(player.id);
  });

  games.delete(game.id);
};

const scheduleGameInactivityTimeout = (game) => {
  if (!game || game.status !== 'playing') {
    return;
  }

  clearInactivityTimer(game.id);
  const timer = setTimeout(() => {
    inactivityTimers.delete(game.id);
    abortGameForInactivity(game.id);
  }, GAME_INACTIVITY_LIMIT_MS);

  inactivityTimers.set(game.id, timer);
};

/**
 * Refresh the activity timestamp whenever a real game action succeeds.
 */
const markGameActivity = (game) => {
  if (!game || game.status !== 'playing') {
    return;
  }

  game.lastActionAt = Date.now();
  scheduleGameInactivityTimeout(game);
};

/**
 * Delay the turn change briefly so the client can show "no move possible" feedback.
 */
const scheduleNoMoveTurnTransition = (game, delay = NO_MOVE_NOTICE_MS) => {
  if (!game || game.status !== 'playing') {
    return;
  }

  clearNoMoveTimer(game.id);
  const expectedPlayerId = game.players[game.currentPlayerIndex]?.id || null;

  const timer = setTimeout(() => {
    noMoveTimers.delete(game.id);

    const activeGame = games.get(game.id);
    if (!activeGame || activeGame.status !== 'playing') {
      return;
    }

    const currentPlayer = activeGame.players[activeGame.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== expectedPlayerId) {
      return;
    }

    activeGame.nextTurn();
    io.to(activeGame.id).emit('turn-changed', activeGame.getState());
    maybeScheduleBotTurn(activeGame);
  }, delay);

  noMoveTimers.set(game.id, timer);
};

const emitGameOver = (game) => {
  clearGameTimers(game.id);
  io.to(game.id).emit('game-over', {
    winner: { name: game.winner.name, color: game.winner.color },
    state: game.getState(),
  });
};

const maybeScheduleBotTurn = (game, delay = BOT_ACTION_DELAY_MS) => {
  clearBotTimer(game.id);

  if (!game || game.status !== 'playing') {
    return;
  }

  const currentPlayer = game.players[game.currentPlayerIndex];
  if (!currentPlayer || !currentPlayer.isBot) {
    return;
  }

  const timer = setTimeout(() => {
    botTimers.delete(game.id);
    runBotTurn(game.id);
  }, delay);

  botTimers.set(game.id, timer);
};

const resetForExtraTurn = (game) => {
  game.diceRolled = false;
  game.diceValue = null;
  game.rollAttempts = 0;
};

/**
 * Decide whether the same player continues or the turn advances after a completed action.
 */
const applyTurnTransition = (game, extraTurn = false) => {
  clearNoMoveTimer(game.id);

  if (game.status === 'finished') {
    emitGameOver(game);
    return;
  }

  if (game.diceValue === 6 || extraTurn) {
    resetForExtraTurn(game);
    io.to(game.id).emit('game-state', game.getState());
  } else {
    game.nextTurn();
    io.to(game.id).emit('turn-changed', game.getState());
  }

  maybeScheduleBotTurn(game);
};

/**
 * Let a bot resolve a pending swap by selecting one valid enemy target at random.
 */
const resolveBotSwap = (game) => {
  const playerIndex = game.currentPlayerIndex;
  const botPlayer = game.players[playerIndex];
  const candidates = game.getSwapCandidates(playerIndex);

  if (candidates.length === 0) {
    game.pendingAction = null;
    applyTurnTransition(game);
    return;
  }

  const target = candidates[randomIndex(candidates.length)];
  const swapResult = game.completeSwap(playerIndex, target.playerId, target.pieceIndex);

  io.to(game.id).emit('swap-completed', {
    ...swapResult,
    state: game.getState(),
  });

  applyTurnTransition(game, false);
  console.log(`Bot ${botPlayer.name} completed a swap in game ${game.id}`);
};

/**
 * Drive the full bot turn loop, including dice rolls, delayed feedback and pending special actions.
 */
const runBotTurn = (gameId) => {
  try {
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') {
      clearBotTimer(gameId);
      return;
    }

    const playerIndex = game.currentPlayerIndex;
    const botPlayer = game.players[playerIndex];
    if (!botPlayer || !botPlayer.isBot) {
      return;
    }

    if (game.pendingAction?.type === 'swap') {
      resolveBotSwap(game);
      markGameActivity(game);
      return;
    }

    if (game.pendingAction?.type === 'risk_roll') {
      const riskOutcome = game.resolveRiskRoll(playerIndex);
      markGameActivity(game);

      io.to(game.id).emit('risk-roll-resolved', {
        playerIndex,
        pieceIndex: riskOutcome.pieceIndex,
        roll: riskOutcome.roll,
        captures: riskOutcome.captures,
        effects: riskOutcome.effects,
        state: game.getState(),
      });

      applyTurnTransition(game, false);
      return;
    }

    if (!game.diceRolled) {
      const value = game.rollDice();
      markGameActivity(game);
      const validMoves = game.getValidMoves(playerIndex);

      io.to(game.id).emit('dice-rolled', {
        value,
        validMoves,
        playerId: botPlayer.publicId,
        rollAttempts: game.rollAttempts,
        canRollAgain: !game.diceRolled,
        state: game.getState(),
      });

      const allInBase = game.allPiecesInBase(playerIndex);
      const noMoves = validMoves.length === 0;

      if (noMoves) {
        if (allInBase && value !== 6 && game.rollAttempts < 3) {
          maybeScheduleBotTurn(game);
        } else {
          scheduleNoMoveTurnTransition(game);
        }
        return;
      }

      maybeScheduleBotTurn(game);
      return;
    }

    const validMoves = game.getValidMoves(playerIndex);
    if (validMoves.length === 0) {
      game.nextTurn();
      io.to(game.id).emit('turn-changed', game.getState());
      maybeScheduleBotTurn(game);
      return;
    }

    const pieceIndex = validMoves[randomIndex(validMoves.length)];
    const moveOutcome = game.movePiece(playerIndex, pieceIndex);
    markGameActivity(game);

    io.to(game.id).emit('piece-moved', {
      playerIndex,
      pieceIndex,
      captures: moveOutcome.captures,
      effects: moveOutcome.effects,
      pendingAction: moveOutcome.pendingAction,
      state: game.getState(),
    });

    if (game.status === 'finished') {
      emitGameOver(game);
      return;
    }

    if (moveOutcome.pendingAction) {
      maybeScheduleBotTurn(game);
      return;
    }

    applyTurnTransition(game, moveOutcome.extraTurn);
  } catch (err) {
    console.error(`Bot turn failed in game ${gameId}:`, err);
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') {
      return;
    }

    clearNoMoveTimer(game.id);
    game.pendingAction = null;
    game.nextTurn();
    io.to(game.id).emit('turn-changed', game.getState());
    maybeScheduleBotTurn(game);
  }
};

// ── Socket.io handlers ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ── Create game ───────────────────────────────────────────────────
  socket.on('create-game', (data) => {
    try {
      assertSocketCanEnterGame(socket);
      const nameResult = validatePlayerName(data?.playerName);
      if (!nameResult.valid) {
        throw new Error(nameResult.reason);
      }

      const name = nameResult.sanitized;
      const game = new Game(socket.id, name);
      games.set(game.id, game);

      socket.join(game.id);
      socketMap.set(socket.id, { gameId: game.id });

      socket.emit('game-created', {
        gameId: game.id,
        playerId: game.players[0].publicId,
        reconnectToken: game.players[0].reconnectToken,
        players: game.getState().players,
      });
    } catch (err) {
      emitSocketError(socket, err);
    }
  });

  // ── Join game ─────────────────────────────────────────────────────
  socket.on('join-game', (data) => {
    try {
      assertSocketCanEnterGame(socket);
      const nameResult = validatePlayerName(data?.playerName);
      if (!nameResult.valid) {
        throw new Error(nameResult.reason);
      }

      const name = nameResult.sanitized;
      const gameIdResult = validateGameId(data?.gameId);
      if (!gameIdResult.valid) {
        throw new Error(gameIdResult.reason);
      }

      const game = games.get(data.gameId);
      if (!game) throw new Error('Game not found');

      const player = game.addPlayer(socket.id, name);

      socket.join(game.id);
      socketMap.set(socket.id, { gameId: game.id });

      io.to(game.id).emit('player-joined', {
        player: { name: player.name, color: player.color },
        players: game.getState().players,
      });

      socket.emit('game-joined', {
        gameId: game.id,
        playerId: player.publicId,
        reconnectToken: player.reconnectToken,
        players: game.getState().players,
      });
    } catch (err) {
      emitSocketError(socket, err);
    }
  });

  // ── Start game ────────────────────────────────────────────────────
  socket.on('start-game', (data) => {
    try {
      const { game } = getMemberGame(socket, data?.gameId);
      if (game.creatorId !== socket.id) throw new Error('Only the game creator can start the game');
      if (data?.fillWithBots) {
        game.addBotPlayers();
      }

      game.startGame();
      scheduleGameInactivityTimeout(game);

      io.to(game.id).emit('game-started', game.getState());
      maybeScheduleBotTurn(game);
    } catch (err) {
      emitSocketError(socket, err);
    }
  });

  // ── Roll dice ─────────────────────────────────────────────────────
  socket.on('roll-dice', (data) => {
    try {
      const { game, playerIndex } = getMemberGame(socket, data?.gameId, {
        requirePlaying: true,
        requireActiveTurn: true,
      });
      if (game.diceRolled) throw new Error('You have already rolled the dice');

      const value = game.rollDice();
      markGameActivity(game);
      const validMoves = game.getValidMoves(playerIndex);

      io.to(game.id).emit('dice-rolled', {
        value,
        validMoves,
        playerId: game.players[playerIndex].publicId,
        rollAttempts: game.rollAttempts,
        canRollAgain: !game.diceRolled,
        state: game.getState(),
      });

      // Auto-advance if no valid moves
      const allInBase = game.allPiecesInBase(playerIndex);
      const noMoves = validMoves.length === 0;

      if (noMoves) {
        // If there are still roll attempts left (all-in-base, non-6), don't advance yet
        if (allInBase && value !== 6 && game.rollAttempts < 3) {
          // Player still has attempts — diceRolled is already false
        } else {
          scheduleNoMoveTurnTransition(game);
        }
      }
    } catch (err) {
      emitSocketError(socket, err);
    }
  });

  // ── Roll risk dice ────────────────────────────────────────────────
  socket.on('roll-risk-dice', (data) => {
    try {
      const { game, playerIndex } = getMemberGame(socket, data?.gameId, {
        requirePlaying: true,
        requireActiveTurn: true,
      });
      if (game.pendingAction?.type !== 'risk_roll') {
        throw new Error('No risk roll is currently pending');
      }

      const riskOutcome = game.resolveRiskRoll(playerIndex);
      markGameActivity(game);

      io.to(game.id).emit('risk-roll-resolved', {
        playerIndex,
        pieceIndex: riskOutcome.pieceIndex,
        roll: riskOutcome.roll,
        captures: riskOutcome.captures,
        effects: riskOutcome.effects,
        state: game.getState(),
      });

      applyTurnTransition(game, false);
    } catch (err) {
      emitSocketError(socket, err);
    }
  });

  // ── Move piece ────────────────────────────────────────────────────
  socket.on('move-piece', (data) => {
    try {
      const { game, playerIndex } = getMemberGame(socket, data?.gameId, {
        requirePlaying: true,
      });

      const moveResult = validateMove(game, socket.id, data.pieceIndex, game.diceValue);
      if (!moveResult.valid) throw new Error(moveResult.reason);

      const moveOutcome = game.movePiece(playerIndex, data.pieceIndex);
      markGameActivity(game);

      io.to(game.id).emit('piece-moved', {
        playerIndex,
        pieceIndex: data.pieceIndex,
        captures: moveOutcome.captures,
        effects: moveOutcome.effects,
        pendingAction: moveOutcome.pendingAction,
        state: game.getState(),
      });

      if (game.status === 'finished') {
        emitGameOver(game);
        return;
      }

      if (moveOutcome.pendingAction) {
        maybeScheduleBotTurn(game);
        return;
      }

      applyTurnTransition(game, moveOutcome.extraTurn);
    } catch (err) {
      emitSocketError(socket, err);
    }
  });

  // ── Complete swap action ──────────────────────────────────────────
  socket.on('select-swap-target', (data) => {
    try {
      const { game, playerIndex } = getMemberGame(socket, data?.gameId, {
        requirePlaying: true,
        requireActiveTurn: true,
      });

      const swapResult = game.completeSwap(playerIndex, data.targetPlayerId, data.targetPieceIndex);
      markGameActivity(game);

      io.to(game.id).emit('swap-completed', {
        ...swapResult,
        state: game.getState(),
      });

      applyTurnTransition(game, false);
    } catch (err) {
      emitSocketError(socket, err);
    }
  });

  // ── Leave game ────────────────────────────────────────────────────
  socket.on('leave-game', (data) => {
    handleLeave(socket, data?.gameId);
  });

  // ── Reconnect ─────────────────────────────────────────────────────
  socket.on('reconnect-game', (data, callback) => {
    try {
      assertSocketCanEnterGame(socket, data?.gameId);
      const gameIdResult = validateGameId(data?.gameId);
      if (!gameIdResult.valid) throw new Error(gameIdResult.reason);
      const game = games.get(data.gameId);
      if (!game) throw new Error('Game not found');
      if (typeof data?.reconnectToken !== 'string' || data.reconnectToken.length === 0) {
        throw new Error('Reconnect token is missing');
      }

      // Re-associate socket with the player
      const playerIndex = game.players.findIndex(
        (player) =>
          player.publicId === data.playerId && player.reconnectToken === data.reconnectToken
      );
      if (playerIndex === -1) throw new Error('Player not found in this game');
      const previousSocketId = game.players[playerIndex].id;

      // Cancel any pending disconnect timer for the old socket
      const oldTimer = disconnectTimers.get(previousSocketId);
      if (oldTimer) {
        clearTimeout(oldTimer);
        disconnectTimers.delete(previousSocketId);
      }

      // Clean up old socket mapping
      socketMap.delete(previousSocketId);

      // Update player socket id
      game.players[playerIndex].id = socket.id;
      game.players[playerIndex].reconnectToken = crypto.randomUUID();
      if (game.creatorId === previousSocketId) {
        game.creatorId = socket.id;
      }

      socket.join(game.id);
      socketMap.set(socket.id, { gameId: game.id });

      if (typeof callback === 'function') {
        callback({
          ok: true,
          gameId: game.id,
          playerId: game.players[playerIndex].publicId,
          reconnectToken: game.players[playerIndex].reconnectToken,
        });
      }
      socket.emit('game-state', game.getState());
    } catch (err) {
      if (typeof callback === 'function') {
        callback({ ok: false, message: err.message });
      }
      emitSocketError(socket, err);
    }
  });

  // ── Get game state ────────────────────────────────────────────────
  socket.on('get-game-state', (data, callback) => {
    if (typeof callback !== 'function') return;

    const mappedGameId = getSocketEntry(socket.id)?.gameId || null;
    const gameId = data?.gameId || mappedGameId;
    const game = gameId ? games.get(gameId) : null;
    if (!game) {
      callback(null);
      return;
    }

    const isMappedMember = mappedGameId === gameId && findPlayerIndex(game, socket.id) !== -1;
    const hasReconnectProof =
      typeof data?.playerId === 'string' &&
      typeof data?.reconnectToken === 'string' &&
      game.players.some(
        (player) =>
          player.publicId === data.playerId && player.reconnectToken === data.reconnectToken
      );

    callback(isMappedMember || hasReconnectProof ? game.getState() : null);
  });

  // ── Disconnect ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const entry = socketMap.get(socket.id);
    if (entry) {
      // Grace period: wait 5 seconds before removing player
      // This allows page navigation (lobby -> waiting -> game) without losing game state
      const timer = setTimeout(() => {
        disconnectTimers.delete(socket.id);
        handleLeave(socket, entry.gameId);
      }, 5000);
      disconnectTimers.set(socket.id, timer);
    }
  });
});

/**
 * Handle a player leaving a game.
 */
function handleLeave(socket, gameId) {
  if (!gameId) return;
  const disconnectTimer = disconnectTimers.get(socket.id);
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimers.delete(socket.id);
  }

  const entry = getSocketEntry(socket.id);
  if (entry && entry.gameId !== gameId) {
    return;
  }

  const game = games.get(gameId);
  if (!game) return;

  const leavingPlayer = game.players.find((player) => player.id === socket.id) || null;
  if (!leavingPlayer) {
    socket.leave(gameId);
    socketMap.delete(socket.id);
    return;
  }

  game.removePlayer(socket.id);
  socket.leave(gameId);
  socketMap.delete(socket.id);

  if (game.players.length === 0) {
    clearGameTimers(gameId);
    games.delete(gameId);
  } else {
    io.to(gameId).emit('player-left', {
      playerId: leavingPlayer.publicId,
      playerName: leavingPlayer.name,
      state: game.getState(),
    });

    if (game.status === 'finished' && game.winner) {
      emitGameOver(game);
    } else {
      clearNoMoveTimer(gameId);
      maybeScheduleBotTurn(game);
    }
  }
}

// ── Start server ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 8300;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
