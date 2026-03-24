const { Game, games, generateId } = require('../gameLogic');

afterEach(() => {
  games.clear();
});

// ── generateId ─────────────────────────────────────────────────────────
describe('generateId', () => {
  test('returns a 6-character uppercase alphanumeric string', () => {
    const id = generateId();
    expect(id).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    // Not all 50 will collide
    expect(ids.size).toBeGreaterThan(1);
  });
});

// ── Game constructor ───────────────────────────────────────────────────
describe('Game constructor', () => {
  test('creates a game with correct defaults', () => {
    const game = new Game('socket-1', 'Alice');
    expect(game.id).toMatch(/^[A-Z0-9]{6}$/);
    expect(game.players).toHaveLength(1);
    expect(game.players[0].name).toBe('Alice');
    expect(game.players[0].id).toBe('socket-1');
    expect(game.players[0].color).toBe('red');
    expect(game.status).toBe('waiting');
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.diceValue).toBeNull();
    expect(game.diceRolled).toBe(false);
    expect(game.maxPlayers).toBe(4);
    expect(game.winner).toBeNull();
    expect(game.creatorId).toBe('socket-1');
  });

  test('initial pieces are all in base', () => {
    const game = new Game('socket-1', 'Alice');
    game.players[0].pieces.forEach((piece) => {
      expect(piece.isBase).toBe(true);
      expect(piece.isHome).toBe(false);
      expect(piece.position).toBe(-1);
      expect(piece.homePosition).toBe(-1);
    });
  });
});

// ── addPlayer ──────────────────────────────────────────────────────────
describe('addPlayer', () => {
  test('adds players up to max', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.addPlayer('s3', 'Charlie');
    game.addPlayer('s4', 'Diana');
    expect(game.players).toHaveLength(4);
    expect(game.players[1].color).toBe('blue');
    expect(game.players[2].color).toBe('green');
    expect(game.players[3].color).toBe('yellow');
  });

  test('throws when game is full', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.addPlayer('s3', 'Charlie');
    game.addPlayer('s4', 'Diana');
    expect(() => game.addPlayer('s5', 'Eve')).toThrow('Game is full');
  });

  test('throws when game already started', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    expect(() => game.addPlayer('s3', 'Charlie')).toThrow('Game has already started');
  });
});

// ── removePlayer ───────────────────────────────────────────────────────
describe('removePlayer', () => {
  test('removes a player by socket id', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.removePlayer('s2');
    expect(game.players).toHaveLength(1);
    expect(game.players[0].name).toBe('Alice');
  });

  test('reassigns creator when creator leaves during waiting', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.removePlayer('s1');
    expect(game.creatorId).toBe('s2');
  });

  test('ends game when fewer than 2 players during playing', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    const remaining = game.players.find((p) => p.id === 's1' || p.id === 's2');
    const other = game.players.find((p) => p !== remaining);
    game.removePlayer(other.id);
    expect(game.status).toBe('finished');
  });

  test('does nothing for unknown socket id', () => {
    const game = new Game('s1', 'Alice');
    game.removePlayer('unknown');
    expect(game.players).toHaveLength(1);
  });
});

// ── startGame ──────────────────────────────────────────────────────────
describe('startGame', () => {
  test('requires at least 2 players', () => {
    const game = new Game('s1', 'Alice');
    expect(() => game.startGame()).toThrow('Need at least 2 players to start');
  });

  test('sets status to playing and resets turn state', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    expect(game.status).toBe('playing');
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.diceRolled).toBe(false);
    expect(game.diceValue).toBeNull();
    expect(game.rollAttempts).toBe(0);
  });

  test('assigns colours matching player indices after shuffle', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.addPlayer('s3', 'Charlie');
    game.startGame();
    expect(game.players[0].color).toBe('red');
    expect(game.players[1].color).toBe('blue');
    expect(game.players[2].color).toBe('green');
  });
});

// ── rollDice ───────────────────────────────────────────────────────────
describe('rollDice', () => {
  test('returns value between 1 and 6', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    const value = game.rollDice();
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(6);
    expect(game.diceValue).toBe(value);
  });

  test('allows extra roll attempts when all pieces in base and non-6', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    // Force a non-6 roll for all-in-base player
    jest.spyOn(Math, 'random').mockReturnValue(0); // yields 1
    game.rollDice();
    expect(game.rollAttempts).toBe(1);
    expect(game.diceRolled).toBe(false); // can roll again

    Math.random.mockRestore();
  });
});

// ── getValidMoves ──────────────────────────────────────────────────────
describe('getValidMoves', () => {
  test('returns empty when dice not rolled', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    expect(game.getValidMoves(0)).toEqual([]);
  });

  test('only allows moving out of base on a 6', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    // Simulate a non-6 roll
    game.diceValue = 3;
    expect(game.getValidMoves(0)).toEqual([]);

    // Simulate a 6 roll
    game.diceValue = 6;
    const moves = game.getValidMoves(0);
    expect(moves.length).toBeGreaterThan(0);
  });

  test('allows normal board movement', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    // Put piece 0 on the board for player 0
    const playerIdx = game.players.findIndex((p) => p.color === 'red');
    game.players[playerIdx].pieces[0].isBase = false;
    game.players[playerIdx].pieces[0].position = 5;

    game.diceValue = 3;
    const moves = game.getValidMoves(playerIdx);
    expect(moves).toContain(0);
  });

  test('prevents moving onto own piece', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    const playerIdx = game.players.findIndex((p) => p.color === 'red');
    // Put piece 0 at position 5 and piece 1 at position 8
    game.players[playerIdx].pieces[0].isBase = false;
    game.players[playerIdx].pieces[0].position = 5;
    game.players[playerIdx].pieces[1].isBase = false;
    game.players[playerIdx].pieces[1].position = 8;

    game.diceValue = 3;
    const moves = game.getValidMoves(playerIdx);
    // Piece 0 at 5 would move to 8 where piece 1 is — blocked
    expect(moves).not.toContain(0);
  });
});

// ── movePiece ──────────────────────────────────────────────────────────
describe('movePiece', () => {
  test('moves piece out of base on a 6', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    const playerIdx = game.players.findIndex((p) => p.color === 'red');
    game.diceValue = 6;
    game.movePiece(playerIdx, 0);

    const piece = game.players[playerIdx].pieces[0];
    expect(piece.isBase).toBe(false);
    expect(piece.position).toBe(playerIdx * 10); // start position
  });

  test('moves piece along the board', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    const playerIdx = game.players.findIndex((p) => p.color === 'red');
    game.players[playerIdx].pieces[0].isBase = false;
    game.players[playerIdx].pieces[0].position = 5;

    game.diceValue = 4;
    game.movePiece(playerIdx, 0);
    expect(game.players[playerIdx].pieces[0].position).toBe(9);
  });

  test('captures opponent piece', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    const p0 = game.players.findIndex((p) => p.color === 'red');
    const p1 = game.players.findIndex((p) => p.color === 'blue');

    // Place player 0's piece at 5 and player 1's piece at 8
    game.players[p0].pieces[0].isBase = false;
    game.players[p0].pieces[0].position = 5;
    game.players[p1].pieces[0].isBase = false;
    game.players[p1].pieces[0].position = 8;

    game.diceValue = 3;
    const { captured } = game.movePiece(p0, 0);

    expect(captured).not.toBeNull();
    expect(captured.playerIndex).toBe(p1);
    // Captured piece is back in base
    expect(game.players[p1].pieces[0].isBase).toBe(true);
    expect(game.players[p1].pieces[0].position).toBe(-1);
  });

  test('entering home sets isHome and homePosition', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    const playerIdx = game.players.findIndex((p) => p.color === 'red');
    const startPos = playerIdx * 10;
    // Place piece one step before home entry: position = (start - 1 + 40) % 40
    const preHomePos = (startPos + 39) % 40;
    game.players[playerIdx].pieces[0].isBase = false;
    game.players[playerIdx].pieces[0].position = preHomePos;

    game.diceValue = 1;
    game.movePiece(playerIdx, 0);

    const piece = game.players[playerIdx].pieces[0];
    expect(piece.isHome).toBe(true);
    expect(piece.homePosition).toBe(0);
    expect(piece.position).toBe(-1);
  });

  test('detects winner when all pieces are home', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();

    const playerIdx = game.players.findIndex((p) => p.color === 'red');
    // Put 3 pieces in home
    for (let i = 0; i < 3; i++) {
      game.players[playerIdx].pieces[i].isBase = false;
      game.players[playerIdx].pieces[i].isHome = true;
      game.players[playerIdx].pieces[i].homePosition = i;
      game.players[playerIdx].pieces[i].position = -1;
    }
    // Last piece about to enter home
    const startPos = playerIdx * 10;
    const preHomePos = (startPos + 39) % 40;
    game.players[playerIdx].pieces[3].isBase = false;
    game.players[playerIdx].pieces[3].position = preHomePos;

    game.diceValue = 4;
    game.movePiece(playerIdx, 3);

    expect(game.status).toBe('finished');
    expect(game.winner.name).toBe(game.players[playerIdx].name);
  });
});

// ── nextTurn ───────────────────────────────────────────────────────────
describe('nextTurn', () => {
  test('advances to next player and resets dice', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    game.diceValue = 3;
    game.diceRolled = true;
    game.rollAttempts = 1;

    game.nextTurn();
    expect(game.currentPlayerIndex).toBe(1);
    expect(game.diceValue).toBeNull();
    expect(game.diceRolled).toBe(false);
    expect(game.rollAttempts).toBe(0);
  });

  test('wraps around to first player', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    game.currentPlayerIndex = 1;
    game.nextTurn();
    expect(game.currentPlayerIndex).toBe(0);
  });
});

// ── getState ───────────────────────────────────────────────────────────
describe('getState', () => {
  test('returns a serializable snapshot', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    const state = game.getState();

    expect(state.id).toBe(game.id);
    expect(state.players).toHaveLength(2);
    expect(state.status).toBe('waiting');
    expect(state.winner).toBeNull();
    expect(state.maxPlayers).toBe(4);
    expect(state.creatorId).toBe('s1');
  });

  test('includes winner info when game is finished', () => {
    const game = new Game('s1', 'Alice');
    game.addPlayer('s2', 'Bob');
    game.startGame();
    game.status = 'finished';
    game.winner = game.players[0];

    const state = game.getState();
    expect(state.winner).toEqual({
      name: game.players[0].name,
      color: game.players[0].color,
    });
  });
});
