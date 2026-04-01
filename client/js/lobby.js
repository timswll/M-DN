'use strict';

const Lobby = (() => {
  let socket = null;

  /**
   * Initialize the lobby form, restore saved data and attach the socket flow.
   */
  const init = () => {
    socket = SocketManager.connect();

    const nameInput = document.getElementById('player-name');
    const createBtn = document.getElementById('create-game-btn');
    const joinBtn = document.getElementById('join-game-btn');
    const gameIdInput = document.getElementById('game-id-input');

    // Pre-fill saved player name
    const savedName = PlayerInfo.getName();
    if (savedName && nameInput) {
      nameInput.value = savedName;
    }

    // Direct event listeners (no delegation)
    if (createBtn) {
      createBtn.addEventListener('click', handleCreateGame);
    }
    if (joinBtn) {
      joinBtn.addEventListener('click', handleJoinGame);
    }
    if (gameIdInput) {
      gameIdInput.addEventListener('input', () => {
        gameIdInput.value = gameIdInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      });
    }

    // Socket event listeners
    socket.on('game-created', (data) => {
      SocketManager.saveGameInfo(data.gameId, socket.id);
      window.location.href = 'waiting.html';
    });

    socket.on('game-joined', (data) => {
      SocketManager.saveGameInfo(data.gameId, socket.id);
      window.location.href = 'waiting.html';
    });

    socket.on('error', (data) => {
      Utils.showError('error-message', data.message || 'Ein Fehler ist aufgetreten.');
    });
  };

  const getPlayerName = () => {
    const input = document.getElementById('player-name');
    return input ? input.value.trim() : '';
  };

  /**
   * Validate and persist the player name before room actions are sent to the server.
   */
  const validatePlayerName = () => {
    const name = getPlayerName();
    if (!name) {
      Utils.showError('error-message', 'Bitte gib einen Spielernamen ein.');
      return false;
    }
    PlayerInfo.setName(name);
    return true;
  };

  /**
   * Create a fresh game and redirect into the waiting room.
   */
  const handleCreateGame = () => {
    if (!validatePlayerName()) return;

    const playerName = getPlayerName();
    socket.emit('create-game', { playerName });
  };

  /**
   * Join an existing game by the six-character room code.
   */
  const handleJoinGame = () => {
    if (!validatePlayerName()) return;

    const gameIdInput = document.getElementById('game-id-input');
    const gameId = gameIdInput ? gameIdInput.value.trim().toUpperCase() : '';

    if (!gameId || gameId.length !== 6) {
      Utils.showError('error-message', 'Bitte gib einen gültigen 6-stelligen Spielcode ein.');
      return;
    }

    const playerName = getPlayerName();
    socket.emit('join-game', { gameId, playerName });
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Lobby.init();
});
