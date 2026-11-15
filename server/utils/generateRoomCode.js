/**
 * utils/generateRoomCode.js
 *
 * Generates a random alphanumeric room code.
 * Uses unambiguous characters (avoids 0, O, 1, I) to prevent user confusion.
 */

const CONSTANTS = require('../config/constants');

function generateRoomCode(existingCodes = new Set()) {
  const chars = CONSTANTS.ROOM.CODE_CHARS;
  const length = CONSTANTS.ROOM.CODE_LENGTH;
  let code = '';
  let attempts = 0;

  do {
    code = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      code += chars[randomIndex];
    }
    attempts++;
    if (attempts > 1000) {
      throw new Error('Unable to generate unique room code');
    }
  } while (existingCodes.has(code));

  return code;
}

module.exports = { generateRoomCode };
