/**
 * Core game engine for Mensch Ärgere Dich Nicht.
 *
 * Board layout:
 *  - 40 shared positions (0-39) in a clockwise circle
 *  - Each player has 4 base slots and 4 home slots
 *  - Start positions: P0=0, P1=10, P2=20, P3=30
 */

const COLORS = ['green', 'red', 'blue', 'yellow'];
const BOARD_SIZE = 40;
const PIECES_PER_PLAYER = 4;

/** Map of gameId -> Game */
const games = new Map();

/**
 * Generate a 6-character uppercase alphanumeric ID.
 */
const generateId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

/**
 * Create the initial pieces array for one player (all in base).
 */
const createPieces = () =>
  Array.from({ length: PIECES_PER_PLAYER }, () => ({
    position: -1,   // -1 means "in base"
    isHome: false,
    isBase: true,
    homePosition: -1,
  }));

class Game {
  constructor(creatorId, creatorName) {
    this.id = generateId();
    this.players = [
      {
        id: creatorId,
        name: creatorName,
        color: COLORS[0],
        pieces: createPieces(),
      },
    ];
    this.currentPlayerIndex = 0;
    this.diceValue = null;
    this.diceRolled = false;
    this.status = 'waiting';
    this.winner = null;
    this.maxPlayers = 4;
    this.rollAttempts = 0;
    this.creatorId = creatorId;
  }

  /* ------------------------------------------------------------------ */
  /*  Player management                                                  */
  /* ------------------------------------------------------------------ */

  addPlayer(socketId, name) {
    if (this.players.length >= this.maxPlayers) {
      throw new Error('Game is full');
    }
    if (this.status !== 'waiting') {
      throw new Error('Game has already started');
    }

    const player = {
      id: socketId,
      name,
      color: COLORS[this.players.length],
      pieces: createPieces(),
    };
    this.players.push(player);
    return player;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex((p) => p.id === socketId);
    if (idx === -1) return;

    this.players.splice(idx, 1);

    if (this.status === 'playing') {
      if (this.players.length < 2) {
        this.status = 'finished';
        this.winner = this.players[0] || null;
        return;
      }
      // Adjust currentPlayerIndex after removal
      if (idx < this.currentPlayerIndex) {
        this.currentPlayerIndex--;
      } else if (idx === this.currentPlayerIndex) {
        this.currentPlayerIndex = this.currentPlayerIndex % this.players.length;
        this.diceRolled = false;
        this.diceValue = null;
        this.rollAttempts = 0;
      }
    }

    // If creator left while waiting, assign new creator
    if (this.status === 'waiting' && this.players.length > 0) {
      this.creatorId = this.players[0].id;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Game flow                                                          */
  /* ------------------------------------------------------------------ */

  startGame() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    // Keep colour-to-board mapping stable and only randomise the starting player.
    this.players.forEach((p, i) => {
      p.color = COLORS[i];
    });
    this.status = 'playing';
    this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
    this.diceRolled = false;
    this.diceValue = null;
    this.rollAttempts = 0;
  }

  rollDice() {
    const value = Math.floor(Math.random() * 6) + 1;
    this.diceValue = value;
    this.diceRolled = true;

    const allInBase = this.allPiecesInBase(this.currentPlayerIndex);

    if (allInBase) {
      this.rollAttempts++;
      if (value !== 6 && this.rollAttempts < 3) {
        // Allow another roll attempt
        this.diceRolled = false;
      }
    }

    return value;
  }

  /* ------------------------------------------------------------------ */
  /*  Move helpers                                                       */
  /* ------------------------------------------------------------------ */

  allPiecesInBase(playerIndex) {
    return this.players[playerIndex].pieces.every((p) => p.isBase);
  }

  _allPiecesInBaseOrHome(playerIndex) {
    return this.players[playerIndex].pieces.every((p) => p.isBase || p.isHome);
  }

  _startPosition(playerIndex) {
    return playerIndex * 10;
  }

  /**
   * How many steps has a piece taken from its start position?
   */
  _stepsFromStart(playerIndex, boardPosition) {
    const start = this._startPosition(playerIndex);
    return (boardPosition - start + BOARD_SIZE) % BOARD_SIZE;
  }

  /**
   * Return the list of piece indices that may legally move with the current dice.
   */
  getValidMoves(playerIndex) {
    const player = this.players[playerIndex];
    const dice = this.diceValue;
    if (dice === null) return [];

    const moves = [];

    for (let i = 0; i < PIECES_PER_PLAYER; i++) {
      const piece = player.pieces[i];

      if (piece.isBase) {
        // Can only leave base with a 6
        if (dice === 6) {
          const startPos = this._startPosition(playerIndex);
          // Check own piece not already on start
          if (!this._ownPieceAt(playerIndex, startPos)) {
            moves.push(i);
          }
        }
        continue;
      }

      if (piece.isHome) {
        // Can move forward inside home if target slot is free, in range, and path clear
        const newHome = piece.homePosition + dice;
        if (
          newHome < PIECES_PER_PLAYER &&
          !this._ownPieceInHome(playerIndex, newHome) &&
          !this._homePathBlocked(playerIndex, piece.homePosition, newHome)
        ) {
          moves.push(i);
        }
        continue;
      }

      // Piece is on the main board
      const stepsFromStart = this._stepsFromStart(playerIndex, piece.position);
      const newSteps = stepsFromStart + dice;

      if (newSteps >= BOARD_SIZE) {
        // Entering home
        const homeSlot = newSteps - BOARD_SIZE;
        if (homeSlot < PIECES_PER_PLAYER && !this._ownPieceInHome(playerIndex, homeSlot)) {
          // Verify no own pieces blocking home path
          if (!this._homePathBlocked(playerIndex, -1, homeSlot)) {
            moves.push(i);
          }
        }
      } else {
        // Normal board move
        const target = (piece.position + dice) % BOARD_SIZE;
        if (!this._ownPieceAt(playerIndex, target)) {
          moves.push(i);
        }
      }
    }

    if (dice === 6) {
      const hasBasePiece = player.pieces.some((piece) => piece.isBase);
      const startPos = this._startPosition(playerIndex);
      const movableStartPiece = moves.filter((moveIndex) => {
        const piece = player.pieces[moveIndex];
        return !piece.isBase && !piece.isHome && piece.position === startPos;
      });

      if (hasBasePiece && !this._ownPieceAt(playerIndex, startPos)) {
        return moves.filter((moveIndex) => player.pieces[moveIndex].isBase);
      }

      if (hasBasePiece && movableStartPiece.length > 0) {
        return movableStartPiece;
      }
    }

    return moves;
  }

  _ownPieceAt(playerIndex, boardPos) {
    return this.players[playerIndex].pieces.some(
      (p) => !p.isBase && !p.isHome && p.position === boardPos
    );
  }

  _ownPieceInHome(playerIndex, homeSlot) {
    return this.players[playerIndex].pieces.some(
      (p) => p.isHome && p.homePosition === homeSlot
    );
  }

  /**
   * Check whether any own piece blocks the home corridor between current
   * home position and target home position (exclusive of current, inclusive of target).
   */
  _homePathBlocked(playerIndex, fromSlot, targetSlot) {
    for (let h = fromSlot + 1; h <= targetSlot; h++) {
      if (this._ownPieceInHome(playerIndex, h)) {
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /*  Execute move                                                       */
  /* ------------------------------------------------------------------ */

  movePiece(playerIndex, pieceIndex) {
    const player = this.players[playerIndex];
    const piece = player.pieces[pieceIndex];
    const dice = this.diceValue;
    let captured = null;

    if (piece.isBase && dice === 6) {
      // Move out of base to start position
      const startPos = this._startPosition(playerIndex);
      piece.isBase = false;
      piece.position = startPos;
      captured = this._captureAt(playerIndex, startPos);
    } else if (piece.isHome) {
      // Move within home
      piece.homePosition += dice;
    } else {
      // Piece on main board
      const stepsFromStart = this._stepsFromStart(playerIndex, piece.position);
      const newSteps = stepsFromStart + dice;

      if (newSteps >= BOARD_SIZE) {
        // Enter home
        piece.isHome = true;
        piece.homePosition = newSteps - BOARD_SIZE;
        piece.position = -1;
      } else {
        piece.position = (piece.position + dice) % BOARD_SIZE;
        captured = this._captureAt(playerIndex, piece.position);
      }
    }

    // Check for win
    if (player.pieces.every((p) => p.isHome)) {
      this.status = 'finished';
      this.winner = player;
    }

    return { captured };
  }

  /**
   * If an opponent piece is at `boardPos`, send it back to base.
   * @returns captured player info or null
   */
  _captureAt(movingPlayerIndex, boardPos) {
    for (let pi = 0; pi < this.players.length; pi++) {
      if (pi === movingPlayerIndex) continue;
      for (const p of this.players[pi].pieces) {
        if (!p.isBase && !p.isHome && p.position === boardPos) {
          p.isBase = true;
          p.position = -1;
          return { playerIndex: pi, playerName: this.players[pi].name };
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /*  Turn management                                                    */
  /* ------------------------------------------------------------------ */

  nextTurn() {
    this.diceRolled = false;
    this.diceValue = null;
    this.rollAttempts = 0;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  /* ------------------------------------------------------------------ */
  /*  Serialisation                                                      */
  /* ------------------------------------------------------------------ */

  getState() {
    return {
      id: this.id,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        pieces: p.pieces.map((pc) => ({ ...pc })),
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      diceValue: this.diceValue,
      diceRolled: this.diceRolled,
      status: this.status,
      winner: this.winner ? { name: this.winner.name, color: this.winner.color } : null,
      maxPlayers: this.maxPlayers,
      rollAttempts: this.rollAttempts,
      creatorId: this.creatorId,
    };
  }
}

module.exports = { Game, games, generateId };
