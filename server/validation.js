/**
 * Input validation helpers and Express middleware for the MÄDN game server.
 */

const NamePolicy = require('../client/js/name-policy');

const GAME_ID_PATTERN = /^[A-Z0-9]{6}$/;
const NAME_PATTERN = /^[0-9A-Za-zÀ-ÖØ-öø-ÿ\s]+$/u;
const MIN_PLAYER_NAME_LENGTH = 2;

/**
 * Reject strings containing HTML-like characters.
 */
const containsHtml = (str) => /[<>]/.test(str);

/**
 * Validate and sanitize a player name and return a structured result object.
 */
const validatePlayerName = (name) => {
  if (typeof name !== 'string') {
    return { valid: false, reason: 'Player name must be a string' };
  }

  if (containsHtml(name)) {
    return { valid: false, reason: 'Player name must not contain HTML characters' };
  }

  const sanitized = name.trim();

  if (sanitized.length === 0) {
    return { valid: false, reason: 'Player name cannot be empty' };
  }

  if (sanitized.length < MIN_PLAYER_NAME_LENGTH) {
    return {
      valid: false,
      reason: `Player name must be at least ${MIN_PLAYER_NAME_LENGTH} characters`,
    };
  }

  if (sanitized.length > 20) {
    return { valid: false, reason: 'Player name must be at most 20 characters' };
  }

  if (!NAME_PATTERN.test(sanitized)) {
    return {
      valid: false,
      reason: 'Player name may only contain letters, numbers, spaces, and umlauts',
    };
  }

  const policyResult = NamePolicy.validateName(sanitized);
  if (!policyResult.valid) {
    return policyResult;
  }

  return { valid: true, sanitized };
};

/**
 * Check whether a game ID matches the expected format (6 uppercase alphanumeric).
 */
const validateGameId = (id) => {
  if (typeof id !== 'string') {
    return { valid: false, reason: 'Game ID must be a string' };
  }

  if (!GAME_ID_PATTERN.test(id)) {
    return { valid: false, reason: 'Invalid game ID format' };
  }

  return { valid: true };
};

/**
 * Validate a move against the current game state.
 * @returns {{ valid: boolean, reason?: string }}
 */
const validateMove = (gameState, playerId, pieceIndex, diceValue) => {
  // Verify it's the player's turn
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return { valid: false, reason: 'It is not your turn' };
  }

  // Verify piece index
  if (typeof pieceIndex !== 'number' || pieceIndex < 0 || pieceIndex > 3) {
    return { valid: false, reason: 'Invalid piece index (must be 0-3)' };
  }

  // Verify dice value matches the game's current roll
  if (diceValue !== gameState.diceValue) {
    return { valid: false, reason: 'Dice value does not match the current roll' };
  }

  // Get valid moves from the game engine
  const validMoves = gameState.getValidMoves(gameState.currentPlayerIndex);
  if (!validMoves.includes(pieceIndex)) {
    return { valid: false, reason: 'This piece cannot move with the current dice value' };
  }

  return { valid: true };
};

/**
 * Express middleware: validate playerName in request body.
 */
const nameValidationMiddleware = (req, res, next) => {
  const result = validatePlayerName(req.body.playerName);
  if (!result.valid) {
    res.status(400).json({ error: result.reason });
    return;
  }

  req.body.playerName = result.sanitized;
  next();
};

/**
 * Express middleware: validate gameId in request params.
 */
const gameIdValidationMiddleware = (req, res, next) => {
  const result = validateGameId(req.params.gameId);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }
  next();
};

module.exports = {
  validatePlayerName,
  validateGameId,
  validateMove,
  nameValidationMiddleware,
  gameIdValidationMiddleware,
};
