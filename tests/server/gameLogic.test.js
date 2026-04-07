'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SUPER_FIELDS } = require('../../server/gameLogic');
const {
  createWaitingGame,
  createStartedGame,
  putPieceInBase,
  putPieceOnBoard,
  resetSharedGames,
  withMockedRandom,
} = require('./helpers/gameTestUtils');

test.beforeEach(() => {
  resetSharedGames();
});

test('addBotPlayers fills the waiting room with numbered bots up to four players', () => {
  const game = createWaitingGame(['Creator', 'Guest']);

  game.addBotPlayers();

  assert.equal(game.players.length, 4);
  assert.equal(game.players[2].name, 'Bot1');
  assert.equal(game.players[3].name, 'Bot2');
  assert.equal(game.players[2].isBot, true);
  assert.equal(game.players[3].isBot, true);
});

test('a six can move a base piece onto the start field and capture an opponent there', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 1;
  game.diceValue = 6;
  game.diceRolled = true;

  putPieceOnBoard(game, 0, 0, 30);
  putPieceInBase(game, 1, 0);

  const result = game.movePiece(1, 0);

  assert.equal(game.players[1].pieces[0].position, 30);
  assert.equal(game.players[1].pieces[0].isBase, false);
  assert.equal(game.players[0].pieces[0].isBase, true);
  assert.equal(game.players[0].pieces[0].position, -1);
  assert.equal(result.captures.length, 1);
  assert.equal(result.captures[0].playerName, 'Green');
});

test('shield fields block captures and therefore block the move', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 1;
  game.diceValue = 3;
  game.diceRolled = true;

  putPieceOnBoard(game, 1, 0, 20);
  putPieceOnBoard(game, 0, 0, 23);

  const validMoves = game.getValidMoves(1);

  assert.deepEqual(validMoves, []);
});

test('landing on the extra-roll field grants another turn', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 0;
  game.diceValue = 1;
  game.diceRolled = true;

  putPieceOnBoard(game, 0, 0, 2);

  const result = game.movePiece(0, 0);

  assert.equal(game.players[0].pieces[0].position, 3);
  assert.equal(result.extraTurn, true);
  assert.match(result.effects[0].message, /Extra Wurf-Feld/);
});

test('landing on the swap field creates a pending swap that can be completed', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 0;
  game.diceValue = 1;
  game.diceRolled = true;

  putPieceOnBoard(game, 0, 0, 12);
  putPieceOnBoard(game, 1, 0, 5);

  const moveResult = game.movePiece(0, 0);
  const swapResult = game.completeSwap(0, game.players[1].id, 0);

  assert.equal(moveResult.pendingAction.type, 'swap');
  assert.equal(game.players[0].pieces[0].position, 5);
  assert.equal(game.players[1].pieces[0].position, 13);
  assert.equal(game.pendingAction, null);
  assert.equal(swapResult.targetPlayerName, 'Red');
});

test('risk fields wait for a second roll and send the piece back to base on a one', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 0;
  game.diceValue = 1;
  game.diceRolled = true;

  putPieceOnBoard(game, 0, 0, 32);

  const moveResult = game.movePiece(0, 0);

  assert.equal(game.players[0].pieces[0].position, 33);
  assert.equal(moveResult.pendingAction.type, 'risk_roll');
  assert.equal(game.pendingAction.type, 'risk_roll');

  const riskResult = withMockedRandom(0, () => game.resolveRiskRoll(0));

  assert.equal(riskResult.roll, 1);
  assert.equal(game.players[0].pieces[0].isBase, true);
  assert.equal(game.players[0].pieces[0].position, -1);
  assert.equal(game.pendingAction, null);
  assert.match(riskResult.effects[1].message, /zurück ins Haus/);
});

test('risk field metadata exposes the configured super fields for the board', () => {
  assert.deepEqual(
    SUPER_FIELDS.map((field) => field.type),
    ['extra_roll', 'swap', 'shield', 'risk']
  );
});
