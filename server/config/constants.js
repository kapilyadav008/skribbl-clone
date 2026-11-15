/**
 * constants.js
 * 
 * Central place for all game-wide configuration values.
 * Changing a value here affects the entire application.
 * This avoids "magic numbers" scattered across the codebase.
 */

const CONSTANTS = {
  // ─── Room Settings Boundaries ────────────────────────────────────────────
  ROOM: {
    CODE_LENGTH: 6,           // Length of the generated room code (e.g., "ABC123")
    MIN_PLAYERS: 2,           // Minimum players required to start a game
    MAX_PLAYERS: 20,          // Maximum players allowed in one room
    CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // No ambiguous chars (I,O,0,1)
  },

  // ─── Game Settings Boundaries (host-configurable) ────────────────────────
  GAME: {
    MIN_ROUNDS: 2,
    MAX_ROUNDS: 10,
    DEFAULT_ROUNDS: 3,

    MIN_DRAW_TIME: 15,        // seconds
    MAX_DRAW_TIME: 240,       // seconds
    DEFAULT_DRAW_TIME: 80,    // seconds

    MIN_WORD_COUNT: 1,        // number of word choices given to drawer
    MAX_WORD_COUNT: 5,
    DEFAULT_WORD_COUNT: 3,

    MIN_HINTS: 0,
    MAX_HINTS: 5,
    DEFAULT_HINTS: 2,

    WORD_MODES: ['normal', 'hidden'],  // 'combination' is a future Nice-to-Have
    DEFAULT_WORD_MODE: 'normal',

    // After word_chosen, how long does the drawer have before drawing phase ends?
    // This is controlled by settings.drawTime
    WORD_SELECT_TIMEOUT: 30,  // seconds for drawer to pick a word before auto-pick

    // How long to show round_end screen before next round starts
    ROUND_END_DELAY: 5,       // seconds

    // Timer tick interval (how often server broadcasts timeLeft)
    TIMER_TICK_MS: 1000,      // 1 second
  },

  // ─── Scoring Formula (documented design decision) ─────────────────────────
  // Points are based on how much time is LEFT when the player guesses correctly.
  // This rewards fast guessers.
  //
  // First correct guesser:  timeLeft * 10 points
  // Second correct guesser: timeLeft * 8 points
  // Third+ correct guesser: timeLeft * 6 points
  // Drawer bonus:           50 points × (number of players who guessed correctly)
  //
  // If nobody guesses: 0 points for everyone (including drawer)
  SCORING: {
    MULTIPLIERS: [10, 8, 6],  // index 0 = first guesser, 1 = second, 2+ = third
    DRAWER_BONUS_PER_GUESSER: 50,
  },

  // ─── Drawing Configuration ────────────────────────────────────────────────
  DRAWING: {
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600,
    MIN_BRUSH_SIZE: 1,
    MAX_BRUSH_SIZE: 50,
    DEFAULT_BRUSH_SIZE: 4,
    DEFAULT_COLOR: '#000000',
    MAX_POINTS_PER_STROKE: 2000,
    MAX_STROKES_PER_ROUND: 500,
    TOOLS: ['brush', 'eraser'],
    PALETTE: [
      '#000000', '#ffffff', '#7e7e7e', '#464646',
      '#d32f2f', '#f57c00', '#fbc02d', '#388e3c',
      '#1976d2', '#7b1fa2', '#c2185b', '#795548',
      '#00bcd4', '#8bc34a', '#ff9800', '#9c27b0'
    ],
  },

  // ─── Reconnection ─────────────────────────────────────────────────────────
  RECONNECT: {
    // How long (ms) a player's slot is held open after disconnect
    // before they are considered permanently gone
    TIMEOUT_MS: 30000,  // 30 seconds
  },

  // ─── Socket Rooms ─────────────────────────────────────────────────────────
  // When a player joins, they join a Socket.IO "room" named by roomCode.
  // We also create a special room for just the drawer: `${roomCode}:drawer`
  // This allows us to emit word_options ONLY to the drawer.
};

module.exports = CONSTANTS;
