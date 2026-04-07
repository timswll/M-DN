'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateGameId, validateMove, validatePlayerName } = require('../../server/validation');
const { createStartedGame, putPieceOnBoard, resetSharedGames } = require('./helpers/gameTestUtils');

test.beforeEach(() => {
  resetSharedGames();
});

test('validatePlayerName trims valid names and keeps umlauts', () => {
  const sanitized = validatePlayerName('  Jörg  ');

  assert.equal(sanitized, 'Jörg');
});

test('validatePlayerName rejects HTML-like input', () => {
  assert.throws(() => validatePlayerName('<script>'), /must not contain HTML/);
});

test('validateGameId accepts six uppercase alphanumeric characters', () => {
  assert.equal(validateGameId('AB12CD'), true);
  assert.equal(validateGameId('ab12cd'), false);
  assert.equal(validateGameId('ABCDE'), false);
});

test('validateMove approves bringing a piece out of base on a six', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 0;
  game.diceValue = 6;
  game.diceRolled = true;

  const result = validateMove(game, game.players[0].id, 0, 6);

  assert.deepEqual(result, {
    valid: true,
    targetPosition: 0,
  });
});

test('validateMove rejects requests from the wrong player', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 0;
  game.diceValue = 6;
  game.diceRolled = true;

  const result = validateMove(game, game.players[1].id, 0, 6);

  assert.deepEqual(result, {
    valid: false,
    reason: 'It is not your turn',
  });
});

test('validateMove rejects illegal piece moves for the current dice result', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 0;
  game.diceValue = 1;
  game.diceRolled = true;

  putPieceOnBoard(game, 0, 0, 23);

  const result = validateMove(game, game.players[0].id, 1, 1);

  assert.deepEqual(result, {
    valid: false,
    reason: 'This piece cannot move with the current dice value',
  });
});
