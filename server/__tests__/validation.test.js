const { validatePlayerName, validateGameId, validateMove } = require('../validation');
const { Game } = require('../gameLogic');

// ── validatePlayerName ─────────────────────────────────────────────────
describe('validatePlayerName', () => {
  test('accepts valid names', () => {
    expect(validatePlayerName('Alice')).toBe('Alice');
    expect(validatePlayerName('Bob123')).toBe('Bob123');
    expect(validatePlayerName('Ünter Öster')).toBe('Ünter Öster');
  });

  test('trims whitespace', () => {
    expect(validatePlayerName('  Alice  ')).toBe('Alice');
  });

  test('rejects non-string input', () => {
    expect(() => validatePlayerName(123)).toThrow('Player name must be a string');
    expect(() => validatePlayerName(null)).toThrow('Player name must be a string');
    expect(() => validatePlayerName(undefined)).toThrow('Player name must be a string');
  });

  test('rejects HTML characters', () => {
    expect(() => validatePlayerName('<script>')).toThrow('HTML');
    expect(() => validatePlayerName('a>b')).toThrow('HTML');
  });

  test('rejects empty names', () => {
    expect(() => validatePlayerName('')).toThrow('empty');
    expect(() => validatePlayerName('   ')).toThrow('empty');
  });

  test('rejects names longer than 20 characters', () => {
    const longName = 'A'.repeat(21);
    expect(() => validatePlayerName(longName)).toThrow('at most 20');
  });

  test('rejects special characters', () => {
    expect(() => validatePlayerName('Alice@!')).toThrow('letters, numbers');
  });
});

// ── validateGameId ─────────────────────────────────────────────────────
describe('validateGameId', () => {
  test('accepts valid 6-char uppercase alphanumeric IDs', () => {
    expect(validateGameId('ABC123')).toBe(true);
    expect(validateGameId('ZZZZZ0')).toBe(true);
  });

  test('rejects lowercase', () => {
    expect(validateGameId('abc123')).toBe(false);
  });

  test('rejects wrong length', () => {
    expect(validateGameId('ABC')).toBe(false);
    expect(validateGameId('ABCDEFG')).toBe(false);
  });

  test('rejects special characters', () => {
    expect(validateGameId('ABC-12')).toBe(false);
  });

  test('rejects non-string input', () => {
    expect(validateGameId(123456)).toBe(false);
    expect(validateGameId(null)).toBe(false);
  });
});

// ── validateMove ───────────────────────────────────────────────────────
describe('validateMove', () => {
  let game;

  beforeEach(() => {
    game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    // Ensure deterministic player order for tests
    // After shuffle, find who's who
  });

  test('rejects wrong player turn', () => {
    const currentPlayer = game.players[game.currentPlayerIndex];
    const otherId = currentPlayer.id === 's1' ? 's2' : 's1';
    game.diceValue = 6;
    const result = validateMove(game, otherId, 0, 6);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not your turn/i);
  });

  test('rejects invalid piece index', () => {
    const currentPlayer = game.players[game.currentPlayerIndex];
    game.diceValue = 6;
    const result = validateMove(game, currentPlayer.id, 5, 6);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Invalid piece index/);
  });

  test('rejects mismatched dice value', () => {
    const currentPlayer = game.players[game.currentPlayerIndex];
    game.diceValue = 6;
    const result = validateMove(game, currentPlayer.id, 0, 3);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });

  test('accepts valid move', () => {
    const playerIdx = game.currentPlayerIndex;
    const currentPlayer = game.players[playerIdx];
    game.diceValue = 6;

    // Ensure piece 0 can move out of base with a 6
    const validMoves = game.getValidMoves(playerIdx);
    if (validMoves.includes(0)) {
      const result = validateMove(game, currentPlayer.id, 0, 6);
      expect(result.valid).toBe(true);
      expect(result.targetPosition).toBe(playerIdx * 10);
    }
  });

  test('rejects piece that cannot move', () => {
    const playerIdx = game.currentPlayerIndex;
    const currentPlayer = game.players[playerIdx];
    game.diceValue = 3; // Can't leave base with 3
    const result = validateMove(game, currentPlayer.id, 0, 3);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/cannot move/);
  });
});
