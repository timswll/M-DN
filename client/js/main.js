'use strict';

const ThemeManager = (() => {
  const THEME_KEY = 'maedn-theme';

  /**
   * Resolve the last chosen theme and gracefully fall back if storage is unavailable.
   */
  const getTheme = () => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch (_error) {
      // Ignore storage access issues and fall back to the document/default theme.
    }

    const documentTheme = document.documentElement.getAttribute('data-theme');
    return documentTheme === 'light' ? 'light' : 'dark';
  };

  const setTheme = (theme = 'dark') => {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (_error) {
      // Ignore storage access issues and still apply the theme for the current page.
    }
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
    btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
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

document.documentElement.setAttribute('data-theme', ThemeManager.getTheme());

const PlayerInfo = (() => {
  const KEY = 'maedn-player';

  /**
   * Store the preferred player name so it can be restored across pages.
   */
  const getName = () => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch (_error) {
      return '';
    }
  };

  const setName = (name) => {
    try {
      localStorage.setItem(KEY, name);
    } catch (_error) {
      // Ignore storage failures; the page can still continue without persistence.
    }
  };

  return { getName, setName };
})();

const Utils = (() => {
  const errorTimers = new Map();

  /**
   * Show a temporary inline error message inside the requested container.
   */
  const showError = (containerId, message) => {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.textContent = message;
    el.classList.add('visible');

    const existingTimer = errorTimers.get(containerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      el.classList.remove('visible');
      errorTimers.delete(containerId);
    }, 5000);

    errorTimers.set(containerId, timer);
  };

  const showStatus = (containerId, message) => {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = message;
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    }
  };

  const formatPlayerColor = (color) => {
    const colors = {
      green: 'Grün',
      red: 'Rot',
      blue: 'Blau',
      yellow: 'Gelb',
    };
    return colors[color] || color;
  };

  return { showError, showStatus, formatPlayerColor, copyText };
})();

const handleLegacyHashRedirect = () => {
  if (window.location.pathname.endsWith('/about.html') && window.location.hash === '#rules') {
    window.location.replace('rules.html');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  handleLegacyHashRedirect();
  ThemeManager.init();
});
