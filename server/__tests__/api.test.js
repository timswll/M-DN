const express = require('express');
const request = require('supertest');
const { games, Game } = require('../gameLogic');
const apiRouter = require('../routes/api');

// Create a minimal Express app for testing the API routes
const app = express();
app.use(express.json());
app.use('/api', apiRouter);

afterEach(() => {
  games.clear();
});

// ── GET /api/health ────────────────────────────────────────────────────
describe('GET /api/health', () => {
  test('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('activeGames');
  });

  test('includes active game count', async () => {
    const game = new Game('s1', 'Alice');
    games.set(game.id, game);

    const res = await request(app).get('/api/health');
    expect(res.body.activeGames).toBe(1);
  });
});

// ── POST /api/games ────────────────────────────────────────────────────
describe('POST /api/games', () => {
  test('creates a game with valid name', async () => {
    const res = await request(app)
      .post('/api/games')
      .send({ playerName: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('gameId');
    expect(res.body.gameId).toMatch(/^[A-Z0-9]{6}$/);
    expect(games.size).toBe(1);
  });

  test('rejects empty name', async () => {
    const res = await request(app)
      .post('/api/games')
      .send({ playerName: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('rejects missing name', async () => {
    const res = await request(app)
      .post('/api/games')
      .send({});

    expect(res.status).toBe(400);
  });

  test('rejects HTML in name', async () => {
    const res = await request(app)
      .post('/api/games')
      .send({ playerName: '<script>alert(1)</script>' });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/games ─────────────────────────────────────────────────────
describe('GET /api/games', () => {
  test('returns empty list when no games', async () => {
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('lists only waiting games', async () => {
    const game1 = new Game('s1', 'Alice');
    games.set(game1.id, game1);

    const game2 = new Game('s2', 'Bob');
    game2.addPlayer('s3', 'Charlie');
    game2.startGame();
    games.set(game2.id, game2);

    const res = await request(app).get('/api/games');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].gameId).toBe(game1.id);
    expect(res.body[0].creatorName).toBe('Alice');
  });
});

// ── GET /api/games/:gameId ─────────────────────────────────────────────
describe('GET /api/games/:gameId', () => {
  test('returns game info for valid ID', async () => {
    const game = new Game('s1', 'Alice');
    games.set(game.id, game);

    const res = await request(app).get(`/api/games/${game.id}`);
    expect(res.status).toBe(200);
    expect(res.body.gameId).toBe(game.id);
    expect(res.body.playerCount).toBe(1);
    expect(res.body.status).toBe('waiting');
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].name).toBe('Alice');
  });

  test('returns 400 for invalid ID format', async () => {
    const res = await request(app).get('/api/games/bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid game ID/);
  });

  test('returns 404 for non-existent game', async () => {
    const res = await request(app).get('/api/games/AAAAAA');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
