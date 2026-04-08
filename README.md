# Online Multiplayer

Server-seitige Spiellogik, Würfelberechnung und Zugvalidierung verhindern Cheating. Mehrere Spielräume ermöglichen parallele Partien mit 2–4 Spielern.

## Inhaltsverzeichnis

- [Features](#features)
- [Technologie-Stack](#technologie-stack)
- [Installation & Start](#installation--start)
- [Projektstruktur](#projektstruktur)
- [HTTP API-Spezifikation](#http-api-spezifikation)
- [WebSocket Events (Socket.io)](#websocket-events-socketio)
- [Cheat Prevention](#cheat-prevention)
- [Tests](#tests)
- [Spielregeln](#spielregeln)

## Features

- **Echtzeit-Multiplayer**: 2–4 Spieler pro Raum über Socket.io
- **Bot-Spieler**: Beim Spielstart können fehlende Plätze automatisch mit KI-Bots aufgefüllt werden. Bots würfeln, ziehen und tauschen selbstständig mit einer kurzen Verzögerung, sodass auch mit nur einem menschlichen Spieler eine vollständige 4-Spieler-Partie möglich ist.
- **Superfelder**: Vier besondere Felder auf dem Spielbrett sorgen für zusätzliche Taktik:
  - 🎲 **Extra-Wurf-Feld** (Position 3) – Bei Landung erhält man sofort einen weiteren Wurf.
  - 🔄 **Tausch-Feld** (Position 13) – Die eigene Figur darf mit einer beliebigen gegnerischen Brettfigur getauscht werden.
  - 🛡️ **Schutzfeld** (Position 23) – Figuren auf diesem Feld können nicht geschlagen werden.
  - ⚠️ **Risiko-Feld** (Position 33) – Ein Zusatzwurf entscheidet: 1 = zurück ins Haus, 2–3 = Felder zurück, 4–6 = Felder vor.
- **Responsive Design**: Spielbar auf Desktop, Tablet und Smartphone (Touch-fähig)
- **Dark/Light Theme**: Umschaltbares Design, Auswahl wird in `localStorage` gespeichert
- **Cheat Prevention**: Würfel und Zugvalidierung ausschließlich server-seitig
- **Reconnect-Management**: Automatische Wiederverbindung bei Verbindungsabbrüchen
- **Moderne CSS-Techniken**: Container Queries, `clamp()`, Custom Properties
- **Saubere Architektur**: Strikte Trennung von Client und Server

## Technologie-Stack

| Bereich    | Technologie                                    |
| ---------- | ---------------------------------------------- |
| Frontend   | HTML5, CSS3 (Container Queries, clamp()), ES6+ |
| Backend    | Node.js, Express.js                            |
| Echtzeit   | Socket.io                                      |
| Tests      | Jest, Supertest                                 |
| Persistenz | localStorage (Client-seitig)                   |

## Installation & Start

### Voraussetzungen

- [Node.js](https://nodejs.org/) (Version 18 oder höher)
- npm (wird mit Node.js mitgeliefert)

### Schritte

```bash
# 1. Repository klonen
git clone https://github.com/timswll/MenschAergerDichNicht.git
cd MenschAergerDichNicht

# 2. Server-Abhängigkeiten installieren
cd server
npm install

# 3. Server starten
npm start
```

Die Anwendung ist dann unter [http://localhost:8300](http://localhost:8300) erreichbar.

### Entwicklungsmodus

```bash
cd server
npm run dev   # Startet den Server mit --watch (Auto-Restart bei Dateiänderungen)
```

### Deployment

Für das Deployment wird der `client/`-Ordner vom Server als statisches Verzeichnis bereitgestellt. Host und Port können über Umgebungsvariablen konfiguriert werden:

```bash
HOST=0.0.0.0 PORT=8300 npm start
```

#### Deployment auf dem Uni-Server (141.72.136.155, Ports 8300–8399)

```bash
# 1. Per SSH auf den Server verbinden
ssh <benutzername>@141.72.136.155

# 2. Repository klonen (falls noch nicht geschehen)
git clone https://github.com/timswll/MenschAergerDichNicht.git
cd MenschAergerDichNicht

# 3. Server-Abhängigkeiten installieren
cd server
npm install
cd ..

# 4. Optional: .env-Datei anlegen (Standard-Port ist bereits 8300)
cp .env.example .env
# Bei Bedarf Port in .env anpassen (erlaubt: 8300–8399)

# 5. Server starten
npm start
# → Server läuft auf http://141.72.136.155:8300

# 6. Server im Hintergrund starten (läuft weiter nach Logout)
nohup npm start > server.log 2>&1 &
```

Das Spiel ist dann unter `http://141.72.136.155:8300` erreichbar.

## Projektstruktur

```
├── server/
│   ├── index.js           # Express + Socket.io Server (Einstiegspunkt)
│   ├── gameLogic.js       # Spiellogik: Board, Züge, Validierung, Gewinnbedingung
│   ├── validation.js      # Eingabevalidierung, Middleware, Cheat Prevention
│   ├── routes/
│   │   └── api.js         # REST API Routen
│   └── package.json       # Server-Abhängigkeiten
├── client/
│   ├── index.html         # Startseite
│   ├── lobby.html         # Spiel erstellen / beitreten
│   ├── waiting.html       # Warteraum vor Spielbeginn
│   ├── game.html          # Spielbrett + Spielablauf
│   ├── about.html         # Regeln & Über uns
│   ├── css/
│   │   └── style.css      # Alle Styles (Theming, Responsive, Board)
│   └── js/
│       ├── main.js        # Theme-Toggle, Player-Info, Utilities
│       ├── socket-manager.js  # Socket.io Verbindungsmanagement + Reconnect
│       ├── lobby.js       # Lobby-Logik (Erstellen/Beitreten)
│       ├── waiting.js     # Warteraum-Logik (Spielerliste, Start)
│       └── game.js        # Spielbrett-Rendering, Würfel, Züge
├── tests/
│   └── server/
│       ├── gameLogic.test.js  # Tests für Spiellogik, Bots und Superfelder
│       └── validation.test.js # Tests für Eingabevalidierung
├── package.json           # Root-Scripts
├── .gitignore
└── README.md
```

## Tests

Das Projekt verwendet **Jest** als Test-Framework und **Supertest** für HTTP-Integrationstests. Die Tests decken Spiellogik, Eingabevalidierung und Superfeld-Mechaniken ab.

### Tests ausführen

```bash
npm test
```

### Testbereiche

- **Spiellogik** (`tests/server/gameLogic.test.js`): Bot-Auffüllung, Schlagen auf dem Startfeld, Schutzfelder, Extra-Wurf-Feld, Tausch-Feld, Risiko-Feld und Superfeld-Metadaten
- **Validierung** (`tests/server/validation.test.js`): Spielernamen-Validierung (inkl. Umlaute), HTML-Injection-Schutz, Spiel-ID-Format, Zugvalidierung (legale/illegale Züge, falsche Spieler)

## HTTP API-Spezifikation

Basis-URL: `http://<host>:<port>/api` (z.B. `http://141.72.136.155:8300/api`)

### `GET /api/health`

Health-Check des Servers.

**Response** `200 OK`:

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "activeGames": 2
}
```

### `POST /api/games`

Erstellt ein neues Spiel.

**Request Body**:

```json
{ "playerName": "Max" }
```

**Response** `201 Created`:

```json
{ "gameId": "ABC123", "playerId": null }
```

**Response** `400 Bad Request`:

```json
{ "error": "Player name cannot be empty" }
```

### `GET /api/games`

Listet alle beitretbaren Spiele auf.

**Response** `200 OK`:

```json
[
  {
    "gameId": "ABC123",
    "playerCount": 2,
    "maxPlayers": 4,
    "creatorName": "Max"
  }
]
```

### `GET /api/games/:gameId`

Gibt Informationen zu einem bestimmten Spiel zurück.

**Response** `200 OK`:

```json
{
  "gameId": "ABC123",
  "playerCount": 3,
  "maxPlayers": 4,
  "status": "waiting",
  "players": [
    { "name": "Max", "color": "red" },
    { "name": "Anna", "color": "blue" }
  ]
}
```

**Response** `400 Bad Request`:

```json
{ "error": "Invalid game ID format" }
```

**Response** `404 Not Found`:

```json
{ "error": "Game not found" }
```

## WebSocket Events (Socket.io)

### Client → Server

| Event            | Payload                  | Beschreibung                             |
| ---------------- | ------------------------ | ---------------------------------------- |
| `create-game`    | `{ playerName }`         | Neues Spiel erstellen                    |
| `join-game`      | `{ gameId, playerName }` | Bestehendem Spiel beitreten              |
| `start-game`     | `{ gameId, fillWithBots? }` | Spiel starten (nur Game Master, optional mit Bots auffüllen) |
| `roll-dice`      | `{ gameId }`             | Würfeln (nur aktueller Spieler)          |
| `move-piece`     | `{ gameId, pieceIndex }` | Figur bewegen (0–3)                      |
| `leave-game`     | `{ gameId }`             | Spiel verlassen                          |
| `reconnect-game` | `{ gameId, playerId }`   | Nach Verbindungsabbruch erneut verbinden |

### Server → Client

| Event           | Payload                                        | Beschreibung                |
| --------------- | ---------------------------------------------- | --------------------------- |
| `game-created`  | `{ gameId, playerId, players }`                | Spiel wurde erstellt        |
| `game-joined`   | `{ gameId, playerId, players }`                | Erfolgreich beigetreten     |
| `player-joined` | `{ player, players }`                          | Ein Spieler ist beigetreten |
| `player-left`   | `{ playerId, state }`                          | Ein Spieler hat verlassen   |
| `game-started`  | `{ ...fullGameState }`                         | Spiel wurde gestartet       |
| `game-state`    | `{ ...fullGameState }`                         | Aktueller Spielzustand      |
| `dice-rolled`   | `{ value, validMoves, playerId }`              | Würfelergebnis              |
| `piece-moved`   | `{ playerIndex, pieceIndex, captured, state }` | Figur wurde bewegt          |
| `turn-changed`  | `{ ...fullGameState }`                         | Nächster Spieler ist dran   |
| `game-over`     | `{ winner, state }`                            | Spiel beendet               |
| `error`         | `{ message }`                                  | Fehlermeldung               |

## Cheat Prevention

Die Cheat-Prevention-Strategie folgt dem Prinzip **„Never trust the client"**:

### 1. Server-seitige Würfelberechnung

Der Würfel wird **ausschließlich auf dem Server** berechnet (`Math.random()` in `gameLogic.js`). Der Client sendet lediglich die Anfrage zum Würfeln – der Würfelwert wird nie vom Client übermittelt.

### 2. Zugvalidierung

Jeder Zug wird vor der Ausführung vom Server validiert:

- **Spielerreihenfolge**: Nur der aktuelle Spieler darf agieren
- **Würfelpflicht**: Ein Spieler muss zuerst würfeln, bevor er ziehen kann
- **Legale Züge**: Die `getValidMoves()`-Funktion berechnet alle erlaubten Züge basierend auf dem aktuellen Spielzustand
- **Figuren-Index**: Nur gültige Figuren-Indizes (0–3) werden akzeptiert

### 3. Eingabevalidierung (Middleware)

- **Spielernamen**: Maximal 20 Zeichen, nur Buchstaben/Zahlen/Leerzeichen/Umlaute erlaubt
- **HTML-Injection**: Zeichen `<` und `>` werden abgelehnt
- **Spiel-IDs**: Müssen dem Format `[A-Z0-9]{6}` entsprechen
- **Express-Middleware**: `nameValidationMiddleware` und `gameIdValidationMiddleware` für REST-Endpunkte

### 4. Spielzustand-Integrität

- Der gesamte Spielzustand lebt auf dem Server (`gameLogic.js`)
- Clients erhalten nur eine serialisierte Kopie via `getState()`
- Ungültige Socket-Events werden mit `error`-Events beantwortet
- Doppeltes Würfeln pro Zug wird verhindert (`diceRolled`-Flag)

### 5. Verbindungsmanagement

- Disconnects werden mit einer 5-Sekunden-Grace-Period behandelt (für Seitennavigation)
- Nach Ablauf wird der Spieler aus dem Spiel entfernt
- Reconnect via `reconnect-game` Event mit Player-ID-Validierung

## Spielregeln

### Ziel

Alle vier eigenen Figuren über das Spielfeld in die Zielfelder bringen.

### Ablauf

1. Spieler würfeln reihum
2. Eine **6** bringt eine Figur aus der Basis aufs Startfeld
3. Solange alle Figuren in der Basis: bis zu **3 Würfelversuche**
4. Die Augenzahl bestimmt, wie viele Felder eine Figur vorrückt
5. Landet man auf einer gegnerischen Figur, wird diese geschlagen (zurück in die Basis)
6. Bei einer **6**: nach dem Zug nochmal würfeln
7. Im Zielbereich darf nicht übersprungen werden
8. Wer alle 4 Figuren im Ziel hat, gewinnt
