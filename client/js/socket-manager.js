'use strict';

const SocketManager = (() => {
  let socket = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const GAME_INFO_KEY = 'currentGame';

  const safeParseJSON = (value, fallback = null) => {
    if (!value) return fallback;

    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  };

  const readGameInfo = () => {
    try {
      const raw = localStorage.getItem(GAME_INFO_KEY);
      const parsed = safeParseJSON(raw, null);
      if (raw && !parsed) {
        localStorage.removeItem(GAME_INFO_KEY);
      }
      return parsed;
    } catch (_error) {
      return null;
    }
  };

  const writeGameInfo = (gameInfo) => {
    try {
      localStorage.setItem(GAME_INFO_KEY, JSON.stringify(gameInfo));
    } catch (_error) {
      // Ignore storage failures; the live socket session still works for the current page.
    }
  };

  const clearStoredGameInfo = () => {
    try {
      localStorage.removeItem(GAME_INFO_KEY);
    } catch (_error) {
      // Ignore storage failures.
    }
  };

  const showInlineError = (message) => {
    const errorBox = document.getElementById('error-message');
    if (!errorBox) return;

    errorBox.textContent = message;
    errorBox.classList.add('visible');
  };

  /**
   * Create one shared Socket.io connection and restore active sessions after reconnects.
   */
  const connect = () => {
    if (socket && socket.connected) return socket;

    socket = io({
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
      reconnectAttempts = 0;

      // Auto-reconnect only on game/waiting pages (not lobby)
      const page = window.location.pathname;
      const isGamePage = page.includes('game.html') || page.includes('waiting.html');
      if (isGamePage) {
        const savedGame = readGameInfo();
        if (savedGame?.gameId && savedGame?.playerId && savedGame?.reconnectToken) {
          socket.emit(
            'reconnect-game',
            {
              gameId: savedGame.gameId,
              playerId: savedGame.playerId,
              reconnectToken: savedGame.reconnectToken,
            },
            (response) => {
              if (!response?.ok) {
                return;
              }

              writeGameInfo({
                gameId: response.gameId,
                playerId: response.playerId,
                reconnectToken: response.reconnectToken,
              });
            }
          );
        }
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });

    socket.on('reconnect_attempt', (attempt) => {
      reconnectAttempts = attempt;
      console.log(`Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);
    });

    socket.on('reconnect_failed', () => {
      console.log('Reconnect failed after max attempts');
    });

    socket.on('error', (data) => {
      console.error('Server error:', data.message);
    });

    socket.on('room-full', () => {
      showInlineError('Der Raum ist voll.');
    });

    return socket;
  };

  const getSocket = () => {
    if (!socket) return connect();
    return socket;
  };

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  /**
   * Store the active game context locally so waiting/game pages can recover it after reloads.
   */
  const saveGameInfo = (gameId, playerId, reconnectToken) => {
    writeGameInfo({ gameId, playerId, reconnectToken });
  };

  const clearGameInfo = () => {
    clearStoredGameInfo();
  };

  const getGameInfo = () => readGameInfo();

  return { connect, getSocket, disconnect, saveGameInfo, clearGameInfo, getGameInfo };
})();
