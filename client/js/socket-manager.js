'use strict';

const SocketManager = (() => {
  let socket = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;

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
        const savedGame = JSON.parse(localStorage.getItem('currentGame') || 'null');
        if (savedGame) {
          socket.emit('reconnect-game', {
            gameId: savedGame.gameId,
            playerId: savedGame.playerId,
          });
          // Update stored playerId to new socket id after reconnect
          savedGame.playerId = socket.id;
          localStorage.setItem('currentGame', JSON.stringify(savedGame));
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
      const errorMessage = document.createElement('div');
      errorMessage.textContent = '❌ Der Raum ist voll!';
      errorMessage.style.color = 'red';
      errorMessage.style.fontWeight = 'bold';
      errorMessage.style.marginTop = '10px';
      errorMessage.style.textAlign = 'center';

      const joinButton = document.getElementById('join-game-btn');
      if (joinButton) {
        joinButton.parentElement.appendChild(errorMessage);
      }
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
  const saveGameInfo = (gameId, playerId) => {
    localStorage.setItem('currentGame', JSON.stringify({ gameId, playerId }));
  };

  const clearGameInfo = () => {
    localStorage.removeItem('currentGame');
  };

  const getGameInfo = () => {
    return JSON.parse(localStorage.getItem('currentGame') || 'null');
  };

  return { connect, getSocket, disconnect, saveGameInfo, clearGameInfo, getGameInfo };
})();
