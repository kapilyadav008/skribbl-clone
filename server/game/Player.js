/**
 * game/Player.js
 *
 * Represents a single player in a room.
 *
 * WHY A CLASS?
 * A Player has both data (name, score) and behaviour (canGuess, reconnect).
 * Grouping them in a class makes the code self-documenting and prevents
 * scattered property assignments all over RoomManager.
 *
 * IDENTITY MODEL (supports reconnection):
 *   sessionId  — permanent ID stored in the browser's sessionStorage.
 *                Never changes, even when socket.id changes after reconnect.
 *   socketId   — the current live socket. Changes on every reconnect.
 *                Use socketId to emit events; use sessionId to identify players.
 *
 * This two-ID model is what lets us reconnect without creating duplicate players.
 */

const { v4: uuidv4 } = require('uuid');

class Player {
  /**
   * @param {object} opts
   * @param {string} opts.sessionId  - Permanent session ID from client sessionStorage
   * @param {string} opts.socketId   - Current socket.id (changes on reconnect)
   * @param {string} opts.name       - Display name
   * @param {boolean} opts.isHost    - Is this player the room host?
   */
  constructor({ sessionId, socketId, name, isHost = false }) {
    // ── Identity ──────────────────────────────────────────────────────────
    // sessionId is provided by the client. If none is provided (e.g., old client),
    // we generate one server-side.
    this.sessionId = sessionId || uuidv4();

    // Current live socket connection ID
    this.socketId = socketId;

    // ── Display ───────────────────────────────────────────────────────────
    this.name = name;

    // ── Room role ─────────────────────────────────────────────────────────
    this.isHost = isHost;

    // ── Game state (reset each round) ─────────────────────────────────────
    this.score = 0;
    this.isDrawing = false;
    this.hasGuessedCorrectly = false; // reset every round

    // ── Connection state ──────────────────────────────────────────────────
    this.isConnected = true;

    // If the player disconnects, we store a timeout here so we can
    // cancel it if they reconnect in time.
    this._reconnectTimer = null;
  }

  /**
   * Clears any active reconnection grace timer.
   */
  clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Updates the socket ID when a player reconnects.
   * Called by RoomManager when a returning sessionId is detected.
   * @param {string} newSocketId
   */
  reconnect(newSocketId) {
    this.socketId = newSocketId;
    this.isConnected = true;
    // Cancel any pending eviction timer
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Marks the player as temporarily disconnected.
   * @param {Function} onExpire - Called after RECONNECT_TIMEOUT_MS if no reconnect
   * @param {number} timeoutMs
   */
  startReconnectTimer(onExpire, timeoutMs) {
    this.isConnected = false;
    this._reconnectTimer = setTimeout(onExpire, timeoutMs);
  }

  /**
   * Resets per-round state. Called at the start of every new round.
   */
  resetRoundState() {
    this.isDrawing = false;
    this.hasGuessedCorrectly = false;
  }

  /**
   * Returns the safe public representation of this player.
   * NEVER includes sessionId — that's private to the server.
   * @returns {object}
   */
  toPublic() {
    return {
      id: this.sessionId,       // clients reference players by sessionId (stable)
      socketId: this.socketId,  // used by frontend to identify self
      name: this.name,
      isHost: this.isHost,
      score: this.score,
      isDrawing: this.isDrawing,
      hasGuessedCorrectly: this.hasGuessedCorrectly,
      isConnected: this.isConnected,
    };
  }
}

module.exports = Player;
