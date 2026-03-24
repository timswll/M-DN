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
      startBtn.addEventListener('click', handleStartGame);
      startBtn.style.display = 'none';
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

    // Request current game state
    socket.emit('reconnect-game', {
      gameId: gameInfo.gameId,
      playerId: gameInfo.playerId
    });
  };

  const handleGameState = (state) => {
    if (!state || !state.players) return;

    // Determine if current user is the creator (first player)
    const myId = socket.id;
    const myStoredId = gameInfo.playerId;
    const firstPlayer = state.players[0];
    isCreator = firstPlayer &&
      (firstPlayer.id === myId || firstPlayer.id === myStoredId);

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
      listEl.appendChild(li);
    });
  };

  const updateStartButton = (playerCount) => {
    const startBtn = document.getElementById('start-game-btn');
    if (!startBtn) return;

    if (isCreator) {
      startBtn.style.display = '';
      startBtn.disabled = playerCount < 2;
      startBtn.title = playerCount < 2
        ? 'Mindestens 2 Spieler benötigt'
        : 'Spiel starten';
    } else {
      startBtn.style.display = 'none';
    }
  };

  const updateStatus = (playerCount) => {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;

    if (playerCount < 2) {
      statusEl.textContent = 'Warte auf weitere Spieler…';
    } else if (isCreator) {
      statusEl.textContent = `${playerCount} Spieler bereit. Du kannst das Spiel starten!`;
    } else {
      statusEl.textContent = `${playerCount} Spieler bereit. Warte auf Spielstart…`;
    }
  };

  const handlePlayerJoined = (data) => {
    const name = (data.player && data.player.name) || 'Ein Spieler';
    Utils.showStatus('status-message', `${name} ist beigetreten!`);
    // Request updated state
    socket.emit('reconnect-game', {
      gameId: gameInfo.gameId,
      playerId: gameInfo.playerId
    });
  };

  const handlePlayerLeft = (data) => {
    Utils.showStatus('status-message', 'Ein Spieler hat das Spiel verlassen.');
    // Use the state included in the event to refresh the list
    if (data.state) {
      handleGameState(data.state);
    } else {
      socket.emit('reconnect-game', {
        gameId: gameInfo.gameId,
        playerId: gameInfo.playerId
      });
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

  const handleStartGame = () => {
    if (!gameInfo) return;
    socket.emit('start-game', { gameId: gameInfo.gameId });
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
