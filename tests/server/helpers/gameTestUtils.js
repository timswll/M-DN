'use strict';

const { Game, games } = require('../../../server/gameLogic');

const createWaitingGame = (playerNames = ['Alice', 'Bob']) => {
  if (playerNames.length < 1) {
    throw new Error('At least one player name is required for a waiting game');
  }

  const [creatorName, ...otherNames] = playerNames;
  const game = new Game('player-1', creatorName);

  otherNames.forEach((name, index) => {
    game.addPlayer(`player-${index + 2}`, name);
  });

  return game;
};

const createStartedGame = (playerNames = ['Alice', 'Bob']) => {
  if (playerNames.length < 2) {
    throw new Error('At least two player names are required for a started game');
  }

  const game = createWaitingGame(playerNames);

  game.startGame();
  game.currentPlayerIndex = 0;
  game.diceRolled = false;
  game.diceValue = null;
  game.rollAttempts = 0;
  game.pendingAction = null;

  return game;
};

const resetSharedGames = () => {
  games.clear();
};

const putPieceOnBoard = (game, playerIndex, pieceIndex, position) => {
  const piece = game.players[playerIndex].pieces[pieceIndex];
  piece.isBase = false;
  piece.isHome = false;
  piece.position = position;
  piece.homePosition = -1;
  return piece;
};

const putPieceInBase = (game, playerIndex, pieceIndex) => {
  const piece = game.players[playerIndex].pieces[pieceIndex];
  piece.isBase = true;
  piece.isHome = false;
  piece.position = -1;
  piece.homePosition = -1;
  return piece;
};

const putPieceInHome = (game, playerIndex, pieceIndex, homePosition) => {
  const piece = game.players[playerIndex].pieces[pieceIndex];
  piece.isBase = false;
  piece.isHome = true;
  piece.position = -1;
  piece.homePosition = homePosition;
  return piece;
};

const withMockedRandom = (randomValue, callback) => {
  const originalRandom = Math.random;
  Math.random = () => randomValue;

  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
};

module.exports = {
  createWaitingGame,
  createStartedGame,
  putPieceOnBoard,
  putPieceInBase,
  putPieceInHome,
  resetSharedGames,
  withMockedRandom,
};
