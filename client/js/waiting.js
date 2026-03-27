'use strict';

const Waiting = (() => {
  let socket = null;
  let gameInfo = null;
  let isCreator = false;

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
    socket.on('error', handleError);

    // socket-manager already emits reconnect-game on connect for waiting/game pages
    // Re-read gameInfo in case it was updated by socket-manager
    gameInfo = SocketManager.getGameInfo();
  };

  const handleGameState = (state) => {
    if (!state || !state.players) return;

    // Determine if current user is the creator
    const myId = socket.id;
    const myStoredId = gameInfo.playerId;
    isCreator = state.creatorId === myId || state.creatorId === myStoredId;

    renderPlayerList(state.players, myId, myStoredId);
    updateStartButton(state.players.length);
    updateStatus(state.players.length);

    // If the game has already started, redirect
    if (state.status === 'playing') {
      window.location.href = 'game.html';
    }
  };

  const renderPlayerList = (players, myId, myStoredId) => {
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

      const isMe = player.id === myId || player.id === myStoredId;
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

  const updateStartButton = (playerCount) => {
    const startBtn = document.getElementById('start-game-btn');
    const fillBotsBtn = document.getElementById('fill-bots-btn');
    if (!startBtn || !fillBotsBtn) return;

    if (isCreator) {
      startBtn.style.display = 'inline-flex';
      startBtn.disabled = playerCount < 2;
      startBtn.title = playerCount < 2
        ? 'Mindestens 2 Spieler benötigt'
        : 'Spiel starten';

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
      statusEl.textContent = playerCount < 4
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
      const myId = socket.id;
      const myStoredId = gameInfo ? gameInfo.playerId : null;
      renderPlayerList(data.players, myId, myStoredId);
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

    try {
      await navigator.clipboard.writeText(code);
      if (copyBtn) {
        const original = copyBtn.textContent;
        copyBtn.textContent = '✅';
        setTimeout(() => { copyBtn.textContent = original; }, 2000);
      }
    } catch {
      // Fallback for insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copyBtn) {
        const original = copyBtn.textContent;
        copyBtn.textContent = '✅';
        setTimeout(() => { copyBtn.textContent = original; }, 2000);
      }
    }
  };

  const handleStartGame = (fillWithBots = false) => {
    if (!gameInfo) return;
    socket.emit('start-game', {
      gameId: gameInfo.gameId,
      fillWithBots
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
