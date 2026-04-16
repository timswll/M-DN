'use strict';

const Waiting = (() => {
  let socket = null;
  let gameInfo = null;
  let isCreator = false;

  /**
   * Initialize the waiting room and keep the creator controls aligned with the live lobby state.
   */
  const init = () => {
    gameInfo = SocketManager.getGameInfo();
    if (!gameInfo) {
      window.location.href = 'lobby.html';
      return;
    }

    socket = SocketManager.connect();

    // Display the game code
    const codeEl = document.getElementById('game-code-value');
    if (codeEl) {
      codeEl.textContent = gameInfo.gameId;
    }

    // Direct event listeners on each button
    const copyBtn = document.getElementById('copy-code-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', handleCopyCode);
    }

    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => handleStartGame(false));
      startBtn.style.display = 'none';
    }

    const fillBotsBtn = document.getElementById('fill-bots-btn');
    if (fillBotsBtn) {
      fillBotsBtn.addEventListener('click', () => handleStartGame(true));
      fillBotsBtn.style.display = 'none';
    }

    const leaveBtn = document.getElementById('leave-game-btn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', handleLeaveGame);
    }

    // Socket event listeners
    socket.on('game-state', handleGameState);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('game-started', handleGameStarted);
    socket.on('game-error', handleError);

    // socket-manager already emits reconnect-game on connect for waiting/game pages
    // Re-read gameInfo in case it was updated by socket-manager
    gameInfo = SocketManager.getGameInfo();

    if (gameInfo?.gameId) {
      socket.emit(
        'get-game-state',
        {
          gameId: gameInfo.gameId,
          playerId: gameInfo.playerId,
          reconnectToken: gameInfo.reconnectToken,
        },
        (state) => {
          if (state) {
            handleGameState(state);
          }
        }
      );
    }
  };

  /**
   * Apply the latest room state and redirect once the server reports an active game.
   */
  const handleGameState = (state) => {
    if (!state || !state.players) return;

    // Determine if current user is the creator
    const myPublicId = gameInfo?.playerId || null;
    isCreator = state.creatorId === myPublicId;

    renderPlayerList(state.players, myPublicId);
    updateStartButton(state.players.length);
    updateStatus(state.players.length);

    // If the game has already started, redirect
    if (state.status === 'playing') {
      window.location.href = 'game.html';
    }
  };

  const renderPlayerList = (players, myPublicId) => {
    const listEl = document.getElementById('player-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    players.forEach((player) => {
      const li = document.createElement('li');
      li.className = 'player-list-item';

      const dot = document.createElement('span');
      dot.className = `player-color-dot ${player.color}`;
      li.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.textContent = player.name;

      const isMe = player.id === myPublicId;
      if (isMe) {
        nameSpan.classList.add('is-self');
        nameSpan.textContent += ' (Du)';
      }

      li.appendChild(nameSpan);

      if (player.isBot) {
        const tag = document.createElement('span');
        tag.className = 'player-tag';
        tag.textContent = 'Bot';
        li.appendChild(tag);
      }

      listEl.appendChild(li);
    });
  };

  /**
   * Show the creator-only start options and disable them when the lobby is not ready yet.
   */
  const updateStartButton = (playerCount) => {
    const startBtn = document.getElementById('start-game-btn');
    const fillBotsBtn = document.getElementById('fill-bots-btn');
    if (!startBtn || !fillBotsBtn) return;

    if (isCreator) {
      startBtn.style.display = 'inline-flex';
      startBtn.disabled = playerCount < 2;
      startBtn.title = playerCount < 2 ? 'Mindestens 2 Spieler benötigt' : 'Spiel starten';

      if (playerCount < 4) {
        fillBotsBtn.style.display = 'inline-flex';
        fillBotsBtn.disabled = false;
        fillBotsBtn.title = `${4 - playerCount} Bot${4 - playerCount === 1 ? '' : 's'} hinzufügen und starten`;
      } else {
        fillBotsBtn.style.display = 'none';
      }
    } else {
      startBtn.style.display = 'none';
      fillBotsBtn.style.display = 'none';
    }
  };

  const updateStatus = (playerCount) => {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;

    if (playerCount < 2) {
      statusEl.textContent = isCreator
        ? 'Warte auf weitere Spieler oder starte direkt mit Bots bis 4 Spieler.'
        : 'Warte auf weitere Spieler…';
    } else if (isCreator) {
      statusEl.textContent =
        playerCount < 4
          ? `${playerCount} Spieler bereit. Du kannst normal starten oder bis 4 Spieler mit Bots auffüllen.`
          : `${playerCount} Spieler bereit. Du kannst das Spiel starten!`;
    } else {
      statusEl.textContent = `${playerCount} Spieler bereit. Warte auf Spielstart…`;
    }
  };

  const handlePlayerJoined = (data) => {
    const name = (data.player && data.player.name) || 'Ein Spieler';
    Utils.showStatus('status-message', `${name} ist beigetreten!`);
    // Use the players list from the event directly
    if (data.players) {
      renderPlayerList(data.players, gameInfo ? gameInfo.playerId : null);
      updateStartButton(data.players.length);
      updateStatus(data.players.length);
    }
  };

  const handlePlayerLeft = (data) => {
    const name = data.playerName || 'Ein Spieler';
    Utils.showStatus('status-message', `${name} hat die Lobby verlassen.`);
    if (data.state) {
      handleGameState(data.state);
    }
  };

  const handleGameStarted = () => {
    window.location.href = 'game.html';
  };

  const handleError = (data) => {
    Utils.showStatus('status-message', data.message || 'Ein Fehler ist aufgetreten.');
  };

  const handleCopyCode = async () => {
    const code = gameInfo.gameId;
    const copyBtn = document.getElementById('copy-code-btn');

    const showSuccess = () => {
      if (!copyBtn) return;

      const original = copyBtn.textContent;
      copyBtn.textContent = '✅';
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 2000);
    };

    const copied = await Utils.copyText(code);
    if (copied) {
      showSuccess();
    }
  };

  /**
   * Ask the server to start immediately or to fill the remaining seats with bots first.
   */
  const handleStartGame = (fillWithBots = false) => {
    if (!gameInfo) return;
    socket.emit('start-game', {
      gameId: gameInfo.gameId,
      fillWithBots,
    });
  };

  const handleLeaveGame = () => {
    if (gameInfo) {
      socket.emit('leave-game', { gameId: gameInfo.gameId });
    }
    SocketManager.clearGameInfo();
    window.location.href = 'lobby.html';
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Waiting.init();
});
