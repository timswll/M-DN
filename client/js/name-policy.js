'use strict';

(function (global) {
  const GENERIC_REJECTION_MESSAGE = 'Dieser Name ist unerwünscht. Bitte wähle einen anderen.';

  const BLOCKED_TOKENS = new Set([
    'sex',
    'porno',
    'porn',
    'milf',
    'fotze',
    'hurensohn',
    'schlampe',
    'bitch',
    'slut',
    'spast',
    'nigger',
    'nigga',
    'faggot',
    'retard',
    'kike',
    'paki',
    'kanake',
  ]);

  const BLOCKED_COLLAPSED_TERMS = [
    'hitler',
    'heilhitler',
    '88',
    'schwul',
    'neger',
    'pornhub',
    'adolf',
    'ndp',
    'siegheil',
    'adolfhitler',
    'nazi',
    'nsdap',
    'gestapo',
    'schutzstaffel',
    'whitesupremacy',
    'whitepower',
    'kukluxklan',
    'kkk',
  ];

  const LEETSPEAK_MAP = {
    0: 'o',
    1: 'i',
    3: 'e',
    4: 'a',
    5: 's',
    7: 't',
  };

  const normalizeName = (value) => {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[013457]/g, (char) => LEETSPEAK_MAP[char] || char)
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getCollapsedName = (value) => normalizeName(value).replace(/\s+/g, '');

  const tokenizeName = (value) =>
    normalizeName(value)
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean);

  const isBlockedName = (value) => {
    const normalized = normalizeName(value);
    if (!normalized) {
      return false;
    }

    const collapsed = getCollapsedName(normalized);
    if (BLOCKED_COLLAPSED_TERMS.some((term) => collapsed.includes(term))) {
      return true;
    }

    const tokens = tokenizeName(normalized);
    return tokens.some((token) => BLOCKED_TOKENS.has(token));
  };

  const validateName = (value) => {
    if (isBlockedName(value)) {
      return {
        valid: false,
        reason: GENERIC_REJECTION_MESSAGE,
      };
    }

    return { valid: true };
  };

  const NamePolicy = {
    GENERIC_REJECTION_MESSAGE,
    normalizeName,
    isBlockedName,
    validateName,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NamePolicy;
  } else {
    global.NamePolicy = NamePolicy;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
