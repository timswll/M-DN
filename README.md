# Mensch Ärgere Dich Nicht – Online Multiplayer

Webbasierte Multiplayer-Umsetzung von „Mensch ärgere dich nicht". Server-seitige Spiellogik, Würfelberechnung und Zugvalidierung verhindern Cheating. Mehrere Spielräume ermöglichen parallele Partien mit 2–4 Spielern.

## Quick Start

```bash
cd server
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── gameLogic.js      # Game rules, state management
│   ├── validation.js     # Input validation, cheat prevention
│   ├── routes/
│   │   └── api.js        # REST API routes
│   └── package.json
├── client/
│   ├── index.html        # Home page
│   ├── lobby.html        # Create/Join game
│   ├── waiting.html      # Waiting room
│   ├── game.html         # Game board
│   ├── about.html        # Rules & About
│   ├── css/style.css     # Styles, theming, responsive
│   └── js/
│       ├── main.js       # Theme toggle, shared utilities
│       ├── lobby.js      # Lobby logic
│       ├── waiting.js    # Waiting room logic
│       ├── game.js       # Board rendering + game client
│       └── socket-manager.js  # Socket.io connection manager
├── package.json          # Root scripts
└── .gitignore
```

## Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Frontend:** Vanilla HTML5/CSS3/JavaScript (ES6+)
- **Real-time:** Socket.io for multiplayer synchronization
- **Responsive:** CSS Container Queries, `clamp()`, Custom Properties
- **Security:** Server-side dice rolls, move validation, input sanitization

## REST API

| Method | Endpoint          | Description                    |
|--------|-------------------|--------------------------------|
| GET    | `/api/health`     | Health check                   |
| POST   | `/api/games`      | Create a new game              |
| GET    | `/api/games`      | List joinable games            |
| GET    | `/api/games/:id`  | Get game info                  |

## Socket.io Events

**Client → Server:**
- `create-game` – Create a new game room
- `join-game` – Join an existing game
- `start-game` – Start the game (creator only)
- `roll-dice` – Roll the dice
- `move-piece` – Move a selected piece
- `leave-game` – Leave the game
- `reconnect-game` – Reconnect to an active game

**Server → Client:**
- `game-created` / `game-joined` – Room confirmation
- `player-joined` / `player-left` – Player updates
- `game-started` – Game begins
- `dice-rolled` – Dice result + valid moves
- `piece-moved` – Piece movement update
- `turn-changed` / `game-state` – State sync
- `game-over` – Winner announcement

## Game Rules

- 2–4 players, each with 4 pieces
- Roll a 6 to move a piece from base to start
- If all pieces are in base, get 3 roll attempts
- Landing on an opponent's piece sends it back to base
- Rolling a 6 grants an extra turn
- First player to get all 4 pieces home wins
