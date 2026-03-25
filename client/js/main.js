'use strict';

const ThemeManager = (() => {
  const THEME_KEY = 'maedn-theme';

  const getTheme = () => 'dark';

  const setTheme = (theme = 'dark') => {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    updateToggleButton(nextTheme);
  };

  const toggle = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
  };

  const updateToggleButton = (theme) => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    btn.textContent = theme === 'dark' ? '☀' : '☾';
    btn.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'
    );
  };

  const init = () => {
    setTheme(getTheme());

    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggle);
    }
  };

  return { init, toggle, getTheme, setTheme };
})();

const PlayerInfo = (() => {
  const KEY = 'maedn-player';

  const getName = () => localStorage.getItem(KEY) || '';
  const setName = (name) => localStorage.setItem(KEY, name);

  return { getName, setName };
})();

const Utils = (() => {
  let errorTimer = null;

  const showError = (containerId, message) => {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.textContent = message;
    el.classList.add('visible');

    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => el.classList.remove('visible'), 5000);
  };

  const showStatus = (containerId, message) => {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = message;
    }
  };

  const formatPlayerColor = (color) => {
    const colors = {
      green: 'Grün',
      red: 'Rot',
      blue: 'Blau',
      yellow: 'Gelb'
    };
    return colors[color] || color;
  };

  return { showError, showStatus, formatPlayerColor };
})();

document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
});
