/**
 * Core game engine for Mensch Ärgere Dich Nicht.
 *
 * Board layout:
 *  - 40 shared positions (0-39)
 *  - Each player has 4 base slots and 4 home slots
 *  - Main path now runs clockwise on the rendered board
 */

const COLORS = ['green', 'red', 'blue', 'yellow'];
const COLOR_START_POSITIONS = {
  green: 0,
  yellow: 10,
  blue: 20,
  red: 30,
};
const BOARD_SIZE = 40;
const PIECES_PER_PLAYER = 4;

const SUPER_FIELDS = [
  {
    type: 'extra_roll',
    position: 3,
    title: 'Extra Wurf-Feld',
    description: 'Bei Landung bekommst du sofort einen weiteren Wurf.',
  },
  {
    type: 'swap',
    position: 13,
    title: 'Tausch-Feld',
    description:
      'Bei Landung darfst du deine aktive Figur mit einer gegnerischen Brettfigur tauschen.',
  },
  {
    type: 'shield',
    position: 23,
    title: 'Schutzfeld',
    description: 'Figuren auf diesem Feld können nicht geschmissen werden.',
  },
  {
    type: 'risk',
    position: 33,
    title: 'Risiko-Feld',
    description: 'Würfle einmal zusätzlich: 1 zurück ins Haus, 2-3 Felder zurück, 4-6 Felder vor.',
  },
];

const SUPER_FIELD_BY_POSITION = new Map(SUPER_FIELDS.map((field) => [field.position, field]));

/** Map of gameId -> Game */
const games = new Map();

const generateId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

const createPieces = () =>
  Array.from({ length: PIECES_PER_PLAYER }, () => ({
    position: -1,
    isHome: false,
    isBase: true,
    homePosition: -1,
  }));

const createPlayer = (id, name, color, isBot = false) => ({
  id,
  name,
  color,
  isBot,
  pieces: createPieces(),
});

class Game {
  constructor(creatorId, creatorName) {
    this.id = generateId();
    this.players = [createPlayer(creatorId, creatorName, COLORS[0], false)];
    this.currentPlayerIndex = 0;
    this.diceValue = null;
    this.diceRolled = false;
    this.status = 'waiting';
    this.winner = null;
    this.maxPlayers = 4;
    this.rollAttempts = 0;
    this.creatorId = creatorId;
    this.startedAt = null;
    this.pendingAction = null;
    this.botCount = 0;
    this.lastActionAt = null;
  }

  /**
   * Add a human player while the room is still waiting for the match to start.
   */
  addPlayer(socketId, name) {
    if (this.players.length >= this.maxPlayers) {
      throw new Error('Game is full');
    }
    if (this.status !== 'waiting') {
      throw new Error('Game has already started');
    }

    const player = createPlayer(socketId, name, COLORS[this.players.length], false);
    this.players.push(player);
    return player;
  }

  /**
   * Fill the waiting room with numbered bots up to the requested seat count.
   */
  addBotPlayers(targetCount = this.maxPlayers) {
    if (this.status !== 'waiting') {
      throw new Error('Bots can only be added before the game starts');
    }

    while (this.players.length < this.maxPlayers && this.players.length < targetCount) {
      this.botCount += 1;
      const botId = `bot:${this.id}:${this.botCount}`;
      const botName = `Bot${this.botCount}`;
      this.players.push(createPlayer(botId, botName, COLORS[this.players.length], true));
    }
  }

  /**
   * Remove a player and normalize creator/turn state so the game can continue safely.
   */
  removePlayer(socketId) {
    const idx = this.players.findIndex((player) => player.id === socketId);
    if (idx === -1) return;

    this.players.splice(idx, 1);
    this.pendingAction = null;

    if (this.status === 'playing') {
      if (this.players.length < 2) {
        this.status = 'finished';
        this.winner = this.players[0] || null;
        return;
      }

      if (idx < this.currentPlayerIndex) {
        this.currentPlayerIndex--;
      } else if (idx === this.currentPlayerIndex) {
        this.currentPlayerIndex = this.currentPlayerIndex % this.players.length;
        this.diceRolled = false;
        this.diceValue = null;
        this.rollAttempts = 0;
      }
    }

    if (this.status === 'waiting' && this.players.length > 0) {
      this.creatorId = this.players[0].id;
    }
  }

  /**
   * Freeze the player order and switch the room from waiting to active play.
   */
  startGame() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    this.players.forEach((player, index) => {
      player.color = COLORS[index];
    });

    this.status = 'playing';
    this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
    this.diceRolled = false;
    this.diceValue = null;
    this.rollAttempts = 0;
    this.startedAt = Date.now();
    this.lastActionAt = this.startedAt;
    this.pendingAction = null;
  }

  /**
   * Roll the shared dice and handle the three-tries-in-base rule.
   */
  rollDice() {
    const value = Math.floor(Math.random() * 6) + 1;
    this.diceValue = value;
    this.diceRolled = true;

    if (this.allPiecesInBase(this.currentPlayerIndex)) {
      this.rollAttempts++;
      if (value !== 6 && this.rollAttempts < 3) {
        this.diceRolled = false;
      }
    }

    return value;
  }

  allPiecesInBase(playerIndex) {
    return this.players[playerIndex].pieces.every((piece) => piece.isBase);
  }

  _startPosition(playerIndex) {
    const color = this.players[playerIndex]?.color;
    return COLOR_START_POSITIONS[color];
  }

  _stepsFromStart(playerIndex, boardPosition) {
    const start = this._startPosition(playerIndex);
    return (boardPosition - start + BOARD_SIZE) % BOARD_SIZE;
  }

  _fieldAt(boardPosition) {
    return SUPER_FIELD_BY_POSITION.get(boardPosition) || null;
  }

  _isShieldField(boardPosition) {
    return this._fieldAt(boardPosition)?.type === 'shield';
  }

  _findBoardPiece(boardPosition) {
    for (let playerIndex = 0; playerIndex < this.players.length; playerIndex++) {
      const player = this.players[playerIndex];
      for (let pieceIndex = 0; pieceIndex < player.pieces.length; pieceIndex++) {
        const piece = player.pieces[pieceIndex];
        if (!piece.isBase && !piece.isHome && piece.position === boardPosition) {
          return { playerIndex, pieceIndex, piece };
        }
      }
    }
    return null;
  }

  _findOpponentBoardPiece(movingPlayerIndex, boardPosition) {
    for (let playerIndex = 0; playerIndex < this.players.length; playerIndex++) {
      if (playerIndex === movingPlayerIndex) continue;

      const player = this.players[playerIndex];
      for (let pieceIndex = 0; pieceIndex < player.pieces.length; pieceIndex++) {
        const piece = player.pieces[pieceIndex];
        if (!piece.isBase && !piece.isHome && piece.position === boardPosition) {
          return { playerIndex, pieceIndex, piece };
        }
      }
    }

    return null;
  }

  _isBoardDestinationBlocked(playerIndex, boardPosition) {
    const occupant = this._findBoardPiece(boardPosition);
    if (!occupant) return false;
    if (occupant.playerIndex === playerIndex) return true;
    return this._isShieldField(boardPosition);
  }

  _ownPieceInHome(playerIndex, homeSlot) {
    return this.players[playerIndex].pieces.some(
      (piece) => piece.isHome && piece.homePosition === homeSlot
    );
  }

  _homePathBlocked(playerIndex, fromSlot, targetSlot) {
    for (let slot = fromSlot + 1; slot <= targetSlot; slot++) {
      if (this._ownPieceInHome(playerIndex, slot)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Return the movable pieces for the active dice result, including base priority on a six.
   */
  getValidMoves(playerIndex) {
    const player = this.players[playerIndex];
    const dice = this.diceValue;
    if (dice === null || this.pendingAction) return [];

    const moves = [];

    for (let pieceIndex = 0; pieceIndex < PIECES_PER_PLAYER; pieceIndex++) {
      const piece = player.pieces[pieceIndex];

      if (piece.isBase) {
        if (dice === 6) {
          const startPosition = this._startPosition(playerIndex);
          if (!this._isBoardDestinationBlocked(playerIndex, startPosition)) {
            moves.push(pieceIndex);
          }
        }
        continue;
      }

      if (piece.isHome) {
        const newHome = piece.homePosition + dice;
        if (
          newHome < PIECES_PER_PLAYER &&
          !this._ownPieceInHome(playerIndex, newHome) &&
          !this._homePathBlocked(playerIndex, piece.homePosition, newHome)
        ) {
          moves.push(pieceIndex);
        }
        continue;
      }

      const stepsFromStart = this._stepsFromStart(playerIndex, piece.position);
      const newSteps = stepsFromStart + dice;

      if (newSteps >= BOARD_SIZE) {
        const homeSlot = newSteps - BOARD_SIZE;
        if (
          homeSlot < PIECES_PER_PLAYER &&
          !this._ownPieceInHome(playerIndex, homeSlot) &&
          !this._homePathBlocked(playerIndex, -1, homeSlot)
        ) {
          moves.push(pieceIndex);
        }
        continue;
      }

      const target = (piece.position + dice) % BOARD_SIZE;
      if (!this._isBoardDestinationBlocked(playerIndex, target)) {
        moves.push(pieceIndex);
      }
    }

    if (dice === 6) {
      const hasBasePiece = player.pieces.some((piece) => piece.isBase);
      const startPos = this._startPosition(playerIndex);
      const movableStartPieces = moves.filter((moveIndex) => {
        const piece = player.pieces[moveIndex];
        return !piece.isBase && !piece.isHome && piece.position === startPos;
      });

      if (hasBasePiece && !this._findBoardPiece(startPos)) {
        return moves.filter((moveIndex) => player.pieces[moveIndex].isBase);
      }

      if (hasBasePiece && movableStartPieces.length > 0) {
        return movableStartPieces;
      }
    }

    return moves;
  }

  /**
   * Remove an opposing piece from a shared board field unless the destination is protected.
   */
  _captureAt(movingPlayerIndex, boardPosition) {
    if (this._isShieldField(boardPosition)) {
      return null;
    }

    const occupant = this._findOpponentBoardPiece(movingPlayerIndex, boardPosition);
    if (!occupant) {
      return null;
    }

    occupant.piece.isBase = true;
    occupant.piece.isHome = false;
    occupant.piece.position = -1;
    occupant.piece.homePosition = -1;

    return {
      playerIndex: occupant.playerIndex,
      pieceIndex: occupant.pieceIndex,
      playerName: this.players[occupant.playerIndex].name,
      playerColor: this.players[occupant.playerIndex].color,
    };
  }

  _movePieceOnBoard(playerIndex, piece, targetPosition) {
    if (this._isBoardDestinationBlocked(playerIndex, targetPosition)) {
      return { blocked: true, captured: null };
    }

    const captured = this._captureAt(playerIndex, targetPosition);
    piece.position = targetPosition;
    return {
      blocked: false,
      captured,
    };
  }

  _swapCandidates(playerIndex) {
    const candidates = [];

    for (let otherIndex = 0; otherIndex < this.players.length; otherIndex++) {
      if (otherIndex === playerIndex) continue;

      const otherPlayer = this.players[otherIndex];
      otherPlayer.pieces.forEach((piece, pieceIndex) => {
        if (!piece.isBase && !piece.isHome) {
          candidates.push({
            playerIndex: otherIndex,
            pieceIndex,
            playerId: otherPlayer.id,
          });
        }
      });
    }

    return candidates;
  }

  getSwapCandidates(playerIndex) {
    return this._swapCandidates(playerIndex);
  }

  _resolveRiskField(playerIndex, piece, riskRoll = Math.floor(Math.random() * 6) + 1) {
    const effects = [
      {
        type: 'risk_roll',
        roll: riskRoll,
        message: `Risiko-Feld: Zusatzwurf ${riskRoll}.`,
      },
    ];

    if (riskRoll === 1) {
      piece.isBase = true;
      piece.isHome = false;
      piece.position = -1;
      piece.homePosition = -1;
      effects.push({
        type: 'risk',
        outcome: 'base',
        roll: riskRoll,
        message: 'Risiko-Feld: 1 gewürfelt, Figur geht zurück ins Haus.',
      });
      return { effects, captures: [] };
    }

    const direction = riskRoll <= 3 ? -1 : 1;
    const targetPosition = (piece.position + direction * riskRoll + BOARD_SIZE) % BOARD_SIZE;
    const relocation = this._movePieceOnBoard(playerIndex, piece, targetPosition);

    if (relocation.blocked) {
      effects.push({
        type: 'risk',
        outcome: 'blocked',
        roll: riskRoll,
        steps: riskRoll,
        message: `Risiko-Feld: ${riskRoll} gewürfelt, Sonderbewegung war blockiert.`,
      });
      return { effects, captures: [] };
    }

    effects.push({
      type: 'risk',
      outcome: direction === -1 ? 'backward' : 'forward',
      roll: riskRoll,
      steps: riskRoll,
      message:
        direction === -1
          ? `Risiko-Feld: ${riskRoll} gewürfelt, Figur zieht ${riskRoll} Felder zurück.`
          : `Risiko-Feld: ${riskRoll} gewürfelt, Figur zieht ${riskRoll} Felder vor.`,
    });

    return {
      effects,
      captures: relocation.captured ? [relocation.captured] : [],
    };
  }

  /**
   * Apply the one-off effect of a super field after a piece finishes its normal move.
   */
  _applyFieldEffects(playerIndex, pieceIndex) {
    const player = this.players[playerIndex];
    const piece = player.pieces[pieceIndex];

    if (piece.isBase || piece.isHome) {
      return { effects: [], captures: [], extraTurn: false, pendingAction: null };
    }

    const field = this._fieldAt(piece.position);
    if (!field) {
      return { effects: [], captures: [], extraTurn: false, pendingAction: null };
    }

    if (field.type === 'shield') {
      return {
        effects: [
          {
            type: 'shield',
            message: 'Schutzfeld: Diese Figur ist auf diesem Feld vor dem Schmeißen geschützt.',
          },
        ],
        captures: [],
        extraTurn: false,
        pendingAction: null,
      };
    }

    if (field.type === 'extra_roll') {
      return {
        effects: [
          {
            type: 'extra_roll',
            message: 'Extra Wurf-Feld: Du erhältst sofort einen weiteren Wurf.',
          },
        ],
        captures: [],
        extraTurn: true,
        pendingAction: null,
      };
    }

    if (field.type === 'swap') {
      const candidates = this._swapCandidates(playerIndex);
      if (candidates.length === 0) {
        return {
          effects: [
            {
              type: 'swap_unavailable',
              message: 'Tausch-Feld: Es gibt aktuell keine gegnerische Brettfigur zum Tauschen.',
            },
          ],
          captures: [],
          extraTurn: false,
          pendingAction: null,
        };
      }

      this.pendingAction = {
        type: 'swap',
        playerIndex,
        pieceIndex,
      };

      return {
        effects: [
          {
            type: 'swap',
            message: 'Tausch-Feld: Wähle eine gegnerische Figur auf dem Hauptpfad zum Tauschen.',
          },
        ],
        captures: [],
        extraTurn: false,
        pendingAction: this.pendingAction,
      };
    }

    if (field.type === 'risk') {
      return {
        effects: [
          {
            type: 'risk',
            outcome: 'pending',
            message: 'Risiko-Feld: Würfle erneut, um die Sonderaktion auszulösen.',
          },
        ],
        captures: [],
        extraTurn: false,
        pendingAction: {
          type: 'risk_roll',
          playerIndex,
          pieceIndex,
        },
      };
    }

    return { effects: [], captures: [], extraTurn: false, pendingAction: null };
  }

  /**
   * Execute one full player move, including captures, home entry, super fields and win detection.
   */
  movePiece(playerIndex, pieceIndex) {
    const player = this.players[playerIndex];
    const piece = player.pieces[pieceIndex];
    const dice = this.diceValue;
    const captures = [];
    const effects = [];
    let extraTurn = false;

    if (piece.isBase && dice === 6) {
      const startPosition = this._startPosition(playerIndex);
      const captured = this._captureAt(playerIndex, startPosition);
      piece.isBase = false;
      piece.position = startPosition;
      if (captured) captures.push(captured);
    } else if (piece.isHome) {
      piece.homePosition += dice;
    } else {
      const stepsFromStart = this._stepsFromStart(playerIndex, piece.position);
      const newSteps = stepsFromStart + dice;

      if (newSteps >= BOARD_SIZE) {
        piece.isHome = true;
        piece.homePosition = newSteps - BOARD_SIZE;
        piece.position = -1;
      } else {
        const targetPosition = (piece.position + dice) % BOARD_SIZE;
        const captured = this._captureAt(playerIndex, targetPosition);
        piece.position = targetPosition;
        if (captured) captures.push(captured);
      }
    }

    const fieldResolution = this._applyFieldEffects(playerIndex, pieceIndex);
    effects.push(...fieldResolution.effects);
    captures.push(...fieldResolution.captures);
    extraTurn = fieldResolution.extraTurn;

    if (player.pieces.every((playerPiece) => playerPiece.isHome)) {
      this.status = 'finished';
      this.winner = player;
    }

    return {
      captures,
      effects,
      extraTurn,
      pendingAction: fieldResolution.pendingAction,
    };
  }

  /**
   * Resolve the manual follow-up roll required by the risk field.
   */
  resolveRiskRoll(playerIndex) {
    if (!this.pendingAction || this.pendingAction.type !== 'risk_roll') {
      throw new Error('Kein Risiko-Wurf ist aktuell offen');
    }

    if (this.pendingAction.playerIndex !== playerIndex) {
      throw new Error('Nur der aktive Spieler darf den Risiko-Wurf ausführen');
    }

    const pieceIndex = this.pendingAction.pieceIndex;
    const player = this.players[playerIndex];
    const piece = player?.pieces?.[pieceIndex];
    if (!piece || piece.isBase || piece.isHome) {
      throw new Error('Die Risiko-Figur ist nicht mehr auf dem Hauptpfad');
    }

    const riskRoll = Math.floor(Math.random() * 6) + 1;
    const riskResult = this._resolveRiskField(playerIndex, piece, riskRoll);
    this.pendingAction = null;
    this.lastActionAt = Date.now();

    return {
      pieceIndex,
      roll: riskRoll,
      effects: riskResult.effects,
      captures: riskResult.captures,
    };
  }

  /**
   * Complete a pending swap action after the client or a bot selected the enemy target.
   */
  completeSwap(playerIndex, targetPlayerId, targetPieceIndex) {
    if (!this.pendingAction || this.pendingAction.type !== 'swap') {
      throw new Error('No swap action is pending');
    }
    if (this.pendingAction.playerIndex !== playerIndex) {
      throw new Error('Only the active player can complete the swap');
    }

    const sourcePlayer = this.players[playerIndex];
    const sourcePiece = sourcePlayer.pieces[this.pendingAction.pieceIndex];
    if (!sourcePiece || sourcePiece.isBase || sourcePiece.isHome) {
      throw new Error('The active piece can no longer be swapped');
    }

    const targetPlayerIndex = this.players.findIndex((player) => player.id === targetPlayerId);
    if (targetPlayerIndex === -1 || targetPlayerIndex === playerIndex) {
      throw new Error('Invalid swap target');
    }

    const targetPlayer = this.players[targetPlayerIndex];
    const targetPiece = targetPlayer.pieces[targetPieceIndex];
    if (!targetPiece || targetPiece.isBase || targetPiece.isHome) {
      throw new Error('The selected target cannot be swapped');
    }

    const sourcePieceIndex = this.pendingAction.pieceIndex;
    const sourcePosition = sourcePiece.position;
    sourcePiece.position = targetPiece.position;
    targetPiece.position = sourcePosition;
    this.pendingAction = null;

    return {
      sourcePlayerName: sourcePlayer.name,
      sourcePlayerColor: sourcePlayer.color,
      sourcePieceIndex,
      targetPlayerName: targetPlayer.name,
      targetPlayerColor: targetPlayer.color,
      targetPieceIndex,
    };
  }

  nextTurn() {
    this.diceRolled = false;
    this.diceValue = null;
    this.rollAttempts = 0;
    this.pendingAction = null;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  /**
   * Expose a serializable snapshot of the current game for sockets and REST endpoints.
   */
  getState() {
    const pendingAction = this.pendingAction
      ? {
          type: this.pendingAction.type,
          playerId: this.players[this.pendingAction.playerIndex]?.id || null,
          pieceIndex: this.pendingAction.pieceIndex,
        }
      : null;

    return {
      id: this.id,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        isBot: Boolean(player.isBot),
        pieces: player.pieces.map((piece) => ({ ...piece })),
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      diceValue: this.diceValue,
      diceRolled: this.diceRolled,
      status: this.status,
      winner: this.winner ? { name: this.winner.name, color: this.winner.color } : null,
      maxPlayers: this.maxPlayers,
      rollAttempts: this.rollAttempts,
      creatorId: this.creatorId,
      startedAt: this.startedAt,
      lastActionAt: this.lastActionAt,
      pendingAction,
    };
  }
}

module.exports = { Game, games, generateId, SUPER_FIELDS };
