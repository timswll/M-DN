'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateGameId, validateMove, validatePlayerName } = require('../../server/validation');
const { createStartedGame, putPieceOnBoard, resetSharedGames } = require('./helpers/gameTestUtils');

test.beforeEach(() => {
  resetSharedGames();
});

test('validatePlayerName trims valid names and keeps umlauts', () => {
  const result = validatePlayerName('  Jörg  ');

  assert.deepEqual(result, {
    valid: true,
    sanitized: 'Jörg',
  });
});

test('validatePlayerName rejects HTML-like input', () => {
  assert.deepEqual(validatePlayerName('<script>'), {
    valid: false,
    reason: 'Player name must not contain HTML characters',
  });
});

test('validatePlayerName enforces a minimum length of two characters', () => {
  assert.deepEqual(validatePlayerName('x'), {
    valid: false,
    reason: 'Player name must be at least 2 characters',
  });
});

test('validatePlayerName rejects blocked and offensive names', () => {
  assert.deepEqual(validatePlayerName('Hitler'), {
    valid: false,
    reason: 'Dieser Name ist unerwünscht. Bitte wähle einen anderen.',
  });

  assert.deepEqual(validatePlayerName('H1tl3r'), {
    valid: false,
    reason: 'Dieser Name ist unerwünscht. Bitte wähle einen anderen.',
  });

  assert.deepEqual(validatePlayerName('Sex'), {
    valid: false,
    reason: 'Dieser Name ist unerwünscht. Bitte wähle einen anderen.',
  });
});

test('validateGameId accepts six uppercase alphanumeric characters', () => {
  assert.deepEqual(validateGameId('AB12CD'), { valid: true });
  assert.deepEqual(validateGameId('ab12cd'), {
    valid: false,
    reason: 'Invalid game ID format',
  });
  assert.deepEqual(validateGameId('ABCDE'), {
    valid: false,
    reason: 'Invalid game ID format',
  });
});

test('validateMove approves bringing a piece out of base on a six', () => {
  const game = createStartedGame(['Green', 'Red']);
  game.currentPlayerIndex = 0;
  game.diceValue = 6;
  game.diceRolled = true;

  const result = validateMove(game, game.players[0].id, 0, 6);

  assert.deepEqual(result, { valid: true });
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
