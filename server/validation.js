/**
 * Input validation helpers and Express middleware for the MÄDN game server.
 */

const GAME_ID_PATTERN = /^[A-Z0-9]{6}$/;
const NAME_PATTERN = /^[a-zA-Z0-9\s\u00C0-\u00FF]+$/;

/**
 * Strip HTML tags from a string.
 */
const sanitizeHtml = (str) => str.replace(/<[^>]*>/g, '');

/**
 * Validate and sanitize a player name.
 * Must be 1-20 characters, alphanumeric + spaces + umlauts.
 * @returns {string} sanitized name
 * @throws {Error} if invalid
 */
const validatePlayerName = (name) => {
  if (typeof name !== 'string') {
    throw new Error('Player name must be a string');
  }

  const sanitized = sanitizeHtml(name).trim();

  if (sanitized.length === 0) {
    throw new Error('Player name cannot be empty');
  }

  if (sanitized.length > 20) {
    throw new Error('Player name must be at most 20 characters');
  }

  if (!NAME_PATTERN.test(sanitized)) {
    throw new Error('Player name may only contain letters, numbers, spaces, and umlauts');
  }

  return sanitized;
};

/**
 * Check whether a game ID matches the expected format (6 uppercase alphanumeric).
 * @returns {boolean}
 */
const validateGameId = (id) => {
  if (typeof id !== 'string') return false;
  return GAME_ID_PATTERN.test(id);
};

/**
 * Validate a move against the current game state.
 * @returns {{ valid: boolean, reason?: string, targetPosition?: number }}
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

  // Calculate target position for the caller
  const piece = currentPlayer.pieces[pieceIndex];
  const startPos = gameState.currentPlayerIndex * 10;
  let targetPosition;

  if (piece.isBase && diceValue === 6) {
    targetPosition = startPos;
  } else if (!piece.isBase && !piece.isHome) {
    const stepsFromStart = (piece.position - startPos + 40) % 40;
    const newSteps = stepsFromStart + diceValue;
    if (newSteps >= 40) {
      targetPosition = `home-${newSteps - 40}`;
    } else {
      targetPosition = (piece.position + diceValue) % 40;
    }
  } else if (piece.isHome) {
    targetPosition = `home-${piece.homePosition + diceValue}`;
  }

  return { valid: true, targetPosition };
};

/**
 * Express middleware: validate playerName in request body.
 */
const nameValidationMiddleware = (req, res, next) => {
  try {
    req.body.playerName = validatePlayerName(req.body.playerName);
    next();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Express middleware: validate gameId in request params.
 */
const gameIdValidationMiddleware = (req, res, next) => {
  if (!validateGameId(req.params.gameId)) {
    return res.status(400).json({ error: 'Invalid game ID format' });
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
