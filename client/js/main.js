'use strict';

// Theme management
const ThemeManager = (() => {
  const THEME_KEY = 'maedn-theme';

  const getTheme = () => localStorage.getItem(THEME_KEY) || 'light';

  const setTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    updateToggleButton(theme);
  };

  const toggle = () => {
    const current = getTheme();
    setTheme(current === 'light' ? 'dark' : 'light');
  };

  const updateToggleButton = (theme) => {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = theme === 'light' ? '🌙' : '☀️';
      btn.setAttribute('aria-label', theme === 'light' ? 'Dark mode' : 'Light mode');
    }
  };

  const init = () => {
    const theme = getTheme();
    setTheme(theme);

    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggle);
    }
  };

  return { init, toggle, getTheme, setTheme };
})();

// Player info management
const PlayerInfo = (() => {
  const KEY = 'maedn-player';

  const getName = () => localStorage.getItem(KEY) || '';
  const setName = (name) => localStorage.setItem(KEY, name);

  return { getName, setName };
})();

// Utility functions
const Utils = (() => {
  const showError = (containerId, message) => {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = message;
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), 5000);
    }
  };

  const showStatus = (containerId, message) => {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = message;
    }
  };

  const formatPlayerColor = (color) => {
    const colors = { red: 'Rot', blue: 'Blau', green: 'Grün', yellow: 'Gelb' };
    return colors[color] || color;
  };

  return { showError, showStatus, formatPlayerColor };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
});
