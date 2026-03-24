const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Game, games } = require('./gameLogic');
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
// socketId -> { gameId, playerIndex }
const socketMap = new Map();

/**
 * Find the player index for a socket inside a game.
 */
const findPlayerIndex = (game, socketId) =>
  game.players.findIndex((p) => p.id === socketId);

// ── Socket.io handlers ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ── Create game ───────────────────────────────────────────────────
  socket.on('create-game', (data) => {
    try {
      const name = validatePlayerName(data?.playerName);
      const game = new Game(socket.id, name);
      games.set(game.id, game);

      socket.join(game.id);
      socketMap.set(socket.id, { gameId: game.id, playerIndex: 0 });

      socket.emit('game-created', {
        gameId: game.id,
        playerId: socket.id,
        players: game.getState().players,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── Join game ─────────────────────────────────────────────────────
  socket.on('join-game', (data) => {
    try {
      const name = validatePlayerName(data?.playerName);
      if (!validateGameId(data?.gameId)) {
        throw new Error('Invalid game ID');
      }

      const game = games.get(data.gameId);
      if (!game) throw new Error('Game not found');

      const player = game.addPlayer(socket.id, name);
      const playerIndex = findPlayerIndex(game, socket.id);

      socket.join(game.id);
      socketMap.set(socket.id, { gameId: game.id, playerIndex });

      io.to(game.id).emit('player-joined', {
        player: { name: player.name, color: player.color },
        players: game.getState().players,
      });

      socket.emit('game-joined', {
        gameId: game.id,
        playerId: socket.id,
        players: game.getState().players,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── Start game ────────────────────────────────────────────────────
  socket.on('start-game', (data) => {
    try {
      if (!validateGameId(data?.gameId)) throw new Error('Invalid game ID');
      const game = games.get(data.gameId);
      if (!game) throw new Error('Game not found');
      if (game.creatorId !== socket.id) throw new Error('Only the game creator can start the game');

      game.startGame();

      io.to(game.id).emit('game-started', game.getState());

      // Update socketMap indices after shuffle
      game.players.forEach((p, i) => {
        const entry = socketMap.get(p.id);
        if (entry) entry.playerIndex = i;
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── Roll dice ─────────────────────────────────────────────────────
  socket.on('roll-dice', (data) => {
    try {
      if (!validateGameId(data?.gameId)) throw new Error('Invalid game ID');
      const game = games.get(data.gameId);
      if (!game) throw new Error('Game not found');
      if (game.status !== 'playing') throw new Error('Game is not in progress');

      const playerIndex = findPlayerIndex(game, socket.id);
      if (playerIndex === -1) throw new Error('You are not in this game');
      if (playerIndex !== game.currentPlayerIndex) throw new Error('It is not your turn');
      if (game.diceRolled) throw new Error('You have already rolled the dice');

      const value = game.rollDice();
      const validMoves = game.getValidMoves(playerIndex);

      io.to(game.id).emit('dice-rolled', {
        value,
        validMoves,
        playerId: socket.id,
        rollAttempts: game.rollAttempts,
        canRollAgain: !game.diceRolled, // true when all pieces in base and player has remaining attempts
      });

      // Auto-advance if no valid moves
      const allInBase = game.allPiecesInBase(playerIndex);
      const noMoves = validMoves.length === 0;

      if (noMoves) {
        const shouldAdvance =
          (allInBase && (value === 6 || game.rollAttempts >= 3)) ||
          (!allInBase && value !== 6) ||
          (!allInBase && value === 6);

        // If there are still roll attempts left (all-in-base, non-6), don't advance yet
        if (allInBase && value !== 6 && game.rollAttempts < 3) {
          // Player still has attempts — diceRolled is already false
        } else {
          game.nextTurn();
          io.to(game.id).emit('turn-changed', game.getState());
        }
      }
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── Move piece ────────────────────────────────────────────────────
  socket.on('move-piece', (data) => {
    try {
      if (!validateGameId(data?.gameId)) throw new Error('Invalid game ID');
      const game = games.get(data.gameId);
      if (!game) throw new Error('Game not found');
      if (game.status !== 'playing') throw new Error('Game is not in progress');

      const playerIndex = findPlayerIndex(game, socket.id);
      if (playerIndex === -1) throw new Error('You are not in this game');

      const moveResult = validateMove(game, socket.id, data.pieceIndex, game.diceValue);
      if (!moveResult.valid) throw new Error(moveResult.reason);

      const { captured } = game.movePiece(playerIndex, data.pieceIndex);

      io.to(game.id).emit('piece-moved', {
        playerIndex,
        pieceIndex: data.pieceIndex,
        captured,
        state: game.getState(),
      });

      if (game.status === 'finished') {
        io.to(game.id).emit('game-over', {
          winner: { name: game.winner.name, color: game.winner.color },
          state: game.getState(),
        });
        return;
      }

      // Extra turn on 6
      if (game.diceValue === 6) {
        game.diceRolled = false;
        game.diceValue = null;
        game.rollAttempts = 0;
        io.to(game.id).emit('game-state', game.getState());
      } else {
        game.nextTurn();
        io.to(game.id).emit('turn-changed', game.getState());
      }
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── Leave game ────────────────────────────────────────────────────
  socket.on('leave-game', (data) => {
    handleLeave(socket, data?.gameId);
  });

  // ── Reconnect ─────────────────────────────────────────────────────
  socket.on('reconnect-game', (data) => {
    try {
      if (!validateGameId(data?.gameId)) throw new Error('Invalid game ID');
      const game = games.get(data.gameId);
      if (!game) throw new Error('Game not found');

      // Re-associate socket with the player
      const playerIndex = game.players.findIndex((p) => p.id === data.playerId);
      if (playerIndex === -1) throw new Error('Player not found in this game');

      // Update player socket id
      game.players[playerIndex].id = socket.id;
      if (game.creatorId === data.playerId) {
        game.creatorId = socket.id;
      }

      socket.join(game.id);
      socketMap.set(socket.id, { gameId: game.id, playerIndex });

      socket.emit('game-state', game.getState());
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const entry = socketMap.get(socket.id);
    if (entry) {
      handleLeave(socket, entry.gameId);
    }
  });
});

/**
 * Handle a player leaving a game.
 */
function handleLeave(socket, gameId) {
  if (!gameId) return;
  const game = games.get(gameId);
  if (!game) return;

  game.removePlayer(socket.id);
  socket.leave(gameId);
  socketMap.delete(socket.id);

  if (game.players.length === 0) {
    games.delete(gameId);
  } else {
    io.to(gameId).emit('player-left', {
      playerId: socket.id,
      state: game.getState(),
    });
  }
}

// ── Start server ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
