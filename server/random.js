'use strict';

const crypto = require('crypto');

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate a room code with stronger randomness than Math.random.
 */
const generateRoomCode = (length = 6) => {
  let code = '';

  for (let index = 0; index < length; index++) {
    code += ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)];
  }

  return code;
};

const randomIndex = (length) => {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }

  return Math.floor(Math.random() * length);
};

const rollDie = () => randomIndex(6) + 1;

module.exports = {
  generateRoomCode,
  randomIndex,
  rollDie,
};
