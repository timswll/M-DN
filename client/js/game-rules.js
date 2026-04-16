'use strict';

(function (global) {
  const SHARED_CONFIG = global.GameConfig || {};
  const BOARD_SIZE = SHARED_CONFIG.BOARD_SIZE || 40;
  const PIECES_PER_PLAYER = SHARED_CONFIG.PIECES_PER_PLAYER || 4;
  const START_POSITIONS = SHARED_CONFIG.COLOR_START_POSITIONS || {
    green: 0,
    yellow: 10,
    blue: 20,
    red: 30,
  };
  const SUPER_FIELDS = new Map(
    (SHARED_CONFIG.SUPER_FIELDS || []).map((field) => [field.position, field])
  );

  const getStepsFromStart = (playerColor, boardPosition) => {
    const start = START_POSITIONS[playerColor];
    return (boardPosition - start + BOARD_SIZE) % BOARD_SIZE;
  };

  const ownPieceInHome = (player, homeSlot) =>
    player.pieces.some((piece) => piece.isHome && piece.homePosition === homeSlot);

  const homePathBlocked = (player, fromSlot, targetSlot) => {
    for (let slot = fromSlot + 1; slot <= targetSlot; slot++) {
      if (ownPieceInHome(player, slot)) {
        return true;
      }
    }

    return false;
  };

  const getFieldAt = (boardPosition) => SUPER_FIELDS.get(boardPosition) || null;

  const isShieldField = (boardPosition) => getFieldAt(boardPosition)?.type === 'shield';

  const findBoardPiece = (state, boardPosition) => {
    for (let playerIndex = 0; playerIndex < state.players.length; playerIndex++) {
      const player = state.players[playerIndex];

      for (let pieceIndex = 0; pieceIndex < player.pieces.length; pieceIndex++) {
        const piece = player.pieces[pieceIndex];
        if (!piece.isBase && !piece.isHome && piece.position === boardPosition) {
          return { playerIndex, pieceIndex, piece, player };
        }
      }
    }

    return null;
  };

  const isBoardDestinationBlocked = (state, playerIndex, boardPosition) => {
    const occupant = findBoardPiece(state, boardPosition);
    if (!occupant) return false;
    if (occupant.playerIndex === playerIndex) return true;
    return isShieldField(boardPosition);
  };

  const computeValidMoves = (state, playerIndex) => {
    const player = state?.players?.[playerIndex];
    const dice = state?.diceValue;

    if (!player || dice === null || state.pendingAction) {
      return [];
    }

    const moves = [];

    for (let pieceIndex = 0; pieceIndex < PIECES_PER_PLAYER; pieceIndex++) {
      const piece = player.pieces[pieceIndex];

      if (piece.isBase) {
        if (dice === 6) {
          const startPosition = START_POSITIONS[player.color];
          if (!isBoardDestinationBlocked(state, playerIndex, startPosition)) {
            moves.push(pieceIndex);
          }
        }
        continue;
      }

      if (piece.isHome) {
        const newHome = piece.homePosition + dice;
        if (
          newHome < PIECES_PER_PLAYER &&
          !ownPieceInHome(player, newHome) &&
          !homePathBlocked(player, piece.homePosition, newHome)
        ) {
          moves.push(pieceIndex);
        }
        continue;
      }

      const stepsFromStart = getStepsFromStart(player.color, piece.position);
      const newSteps = stepsFromStart + dice;

      if (newSteps >= BOARD_SIZE) {
        const homeSlot = newSteps - BOARD_SIZE;
        if (
          homeSlot < PIECES_PER_PLAYER &&
          !ownPieceInHome(player, homeSlot) &&
          !homePathBlocked(player, -1, homeSlot)
        ) {
          moves.push(pieceIndex);
        }
        continue;
      }

      const target = (piece.position + dice) % BOARD_SIZE;
      if (!isBoardDestinationBlocked(state, playerIndex, target)) {
        moves.push(pieceIndex);
      }
    }

    if (dice === 6) {
      const hasBasePiece = player.pieces.some((piece) => piece.isBase);
      const startPosition = START_POSITIONS[player.color];
      const movableStartPieces = moves.filter((moveIndex) => {
        const currentPiece = player.pieces[moveIndex];
        return (
          !currentPiece.isBase && !currentPiece.isHome && currentPiece.position === startPosition
        );
      });

      if (hasBasePiece && !findBoardPiece(state, startPosition)) {
        return moves.filter((moveIndex) => player.pieces[moveIndex].isBase);
      }

      if (hasBasePiece && movableStartPieces.length > 0) {
        return movableStartPieces;
      }
    }

    return moves;
  };

  global.GameRules = {
    computeValidMoves,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
