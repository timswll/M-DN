const express = require('express');
const { games } = require('../gameLogic');
const { Game } = require('../gameLogic');
const {
  nameValidationMiddleware,
  gameIdValidationMiddleware,
} = require('../validation');

const router = express.Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeGames: games.size,
  });
});

// Create a new game
router.post('/games', nameValidationMiddleware, (req, res) => {
  const { playerName } = req.body;
  const game = new Game(null, playerName); // No socketId from REST; socket join later
  games.set(game.id, game);
  res.status(201).json({ gameId: game.id, playerId: game.players[0].id });
});

// List joinable games
router.get('/games', (_req, res) => {
  const joinable = [];
  for (const game of games.values()) {
    if (game.status === 'waiting') {
      joinable.push({
        gameId: game.id,
        playerCount: game.players.length,
        maxPlayers: game.maxPlayers,
        creatorName: game.players[0]?.name ?? 'Unknown',
      });
    }
  }
  res.json(joinable);
});

// Get game info
router.get('/games/:gameId', gameIdValidationMiddleware, (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json({
    gameId: game.id,
    playerCount: game.players.length,
    maxPlayers: game.maxPlayers,
    status: game.status,
    players: game.players.map((p) => ({ name: p.name, color: p.color })),
  });
});

module.exports = router;
