/**
 * game/Room.js
 *
 * Represents a single game room and all its state.
 *
 * WHY A CLASS?
 * A room has complex state (players, settings, game phase) and behaviour
 * (addPlayer, removePlayer, transferHost). A class bundles these cleanly.
 * It also makes it easy to serialise a room to JSON for REST responses.
 *
 * LIFECYCLE:
 *   created → lobby → playing → ended → (deleted by RoomManager)
 *
 * IMPORTANT SECURITY RULES enforced here:
 *   - Only the host can change settings.
 *   - The game's current word is NEVER exposed in toPublic().
 *   - Player count is capped at settings.maxPlayers.
 */

const CONSTANTS = require('../config/constants');

class Room {
  /**
   * @param {object} opts
   * @param {string} opts.roomCode   - 6-char alphanumeric code
   * @param {string} opts.hostId     - sessionId of the creating player
   * @param {object} opts.settings   - Validated room settings
   */
  constructor({ roomCode, hostId, settings }) {
    // ── Identity ──────────────────────────────────────────────────────────
    this.roomCode = roomCode;
    this.hostId = hostId;        // sessionId of host (not socketId — stable)

    // ── Status ────────────────────────────────────────────────────────────
    // 'lobby'   = waiting for players, host can change settings
    // 'playing' = game in progress, no new players allowed
    // 'ended'   = game finished, back to lobby
    this.status = 'lobby';

    // ── Settings ──────────────────────────────────────────────────────────
    this.settings = { ...settings };

    // ── Players ───────────────────────────────────────────────────────────
    // Map<sessionId, Player> — ordered insertion (JS Maps maintain order)
    this.players = new Map();

    // ── Game state ────────────────────────────────────────────────────────
    // null in lobby. Set by GameManager when game starts.
    this.game = null;

    // ── Timestamps ────────────────────────────────────────────────────────
    this.createdAt = new Date();
  }

  // ── Player management ────────────────────────────────────────────────────

  /**
   * Adds a player to the room.
   * Throws if the room is full.
   * @param {import('./Player')} player
   */
  addPlayer(player) {
    if (this.players.size >= this.settings.maxPlayers) {
      throw new Error('Room is full');
    }
    this.players.set(player.sessionId, player);
  }

  /**
   * Removes a player from the room by sessionId.
   * Returns the removed player (or undefined).
   * @param {string} sessionId
   * @returns {import('./Player') | undefined}
   */
  removePlayer(sessionId) {
    const player = this.players.get(sessionId);
    if (player) this.players.delete(sessionId);
    return player;
  }

  /**
   * Finds a player by their current socket.id.
   * Socket IDs change on reconnect; this is used to look up who sent an event.
   * @param {string} socketId
   * @returns {import('./Player') | undefined}
   */
  getPlayerBySocketId(socketId) {
    for (const player of this.players.values()) {
      if (player.socketId === socketId) return player;
    }
    return undefined;
  }

  /**
   * Finds a player by their stable sessionId.
   * @param {string} sessionId
   * @returns {import('./Player') | undefined}
   */
  getPlayerBySessionId(sessionId) {
    return this.players.get(sessionId);
  }

  /**
   * Returns the number of currently connected (non-disconnected) players.
   * @returns {number}
   */
  get connectedPlayerCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.isConnected) count++;
    }
    return count;
  }

  /**
   * Returns the total player count including temporarily disconnected.
   * @returns {number}
   */
  get playerCount() {
    return this.players.size;
  }

  // ── Host management ───────────────────────────────────────────────────────

  /**
   * Returns the current host Player object.
   * @returns {import('./Player') | undefined}
   */
  get host() {
    return this.players.get(this.hostId);
  }

  /**
   * Transfers host to the next connected player.
   * Called when the current host disconnects permanently.
   * Returns the new host player, or null if no connected players remain.
   * @returns {import('./Player') | null}
   */
  transferHost() {
    // Find the first connected player who is not the current host
    for (const player of this.players.values()) {
      if (player.sessionId !== this.hostId && player.isConnected) {
        // Remove host role from old host (if still in room)
        const oldHost = this.players.get(this.hostId);
        if (oldHost) oldHost.isHost = false;

        // Assign host role to new host
        player.isHost = true;
        this.hostId = player.sessionId;
        return player;
      }
    }
    return null; // No eligible player found (all disconnected)
  }

  // ── Settings management ───────────────────────────────────────────────────

  /**
   * Updates room settings. Only call this after verifying the caller is host.
   * Validates each field against CONSTANTS boundaries.
   * Returns the validated and merged settings object.
   * @param {object} newSettings
   * @returns {object} merged settings
   */
  updateSettings(newSettings) {
    const G = CONSTANTS.GAME;

    // Clamp each field to valid range; ignore unknown fields
    if (newSettings.maxPlayers !== undefined) {
      this.settings.maxPlayers = Math.min(
        CONSTANTS.ROOM.MAX_PLAYERS,
        Math.max(CONSTANTS.ROOM.MIN_PLAYERS, parseInt(newSettings.maxPlayers) || G.DEFAULT_ROUNDS)
      );
    }
    if (newSettings.rounds !== undefined) {
      this.settings.rounds = Math.min(
        G.MAX_ROUNDS,
        Math.max(G.MIN_ROUNDS, parseInt(newSettings.rounds) || G.DEFAULT_ROUNDS)
      );
    }
    if (newSettings.drawTime !== undefined) {
      this.settings.drawTime = Math.min(
        G.MAX_DRAW_TIME,
        Math.max(G.MIN_DRAW_TIME, parseInt(newSettings.drawTime) || G.DEFAULT_DRAW_TIME)
      );
    }
    if (newSettings.wordCount !== undefined) {
      this.settings.wordCount = Math.min(
        G.MAX_WORD_COUNT,
        Math.max(G.MIN_WORD_COUNT, parseInt(newSettings.wordCount) || G.DEFAULT_WORD_COUNT)
      );
    }
    if (newSettings.hints !== undefined) {
      this.settings.hints = Math.min(
        G.MAX_HINTS,
        Math.max(G.MIN_HINTS, parseInt(newSettings.hints) || G.DEFAULT_HINTS)
      );
    }
    if (newSettings.wordMode !== undefined) {
      if (G.WORD_MODES.includes(newSettings.wordMode)) {
        this.settings.wordMode = newSettings.wordMode;
      }
    }

    return { ...this.settings };
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  /**
   * Returns the safe public snapshot of this room.
   * Used for REST responses and game_state broadcasts.
   *
   * SECURITY: Does NOT include the game's currentWord.
   * @returns {object}
   */
  toPublic() {
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      status: this.status,
      settings: { ...this.settings },
      players: Array.from(this.players.values()).map((p) => p.toPublic()),
      playerCount: this.playerCount,
      connectedPlayerCount: this.connectedPlayerCount,
    };
  }

  /**
   * Returns minimal info for the REST GET /rooms/:roomCode endpoint.
   * No player details — just enough for the join screen to validate.
   * @returns {object}
   */
  toJoinInfo() {
    return {
      roomCode: this.roomCode,
      status: this.status,
      playerCount: this.playerCount,
      connectedPlayerCount: this.connectedPlayerCount,
      maxPlayers: this.settings.maxPlayers,
      isFull: this.playerCount >= this.settings.maxPlayers,
      settings: {
        rounds: this.settings.rounds,
        drawTime: this.settings.drawTime,
        wordMode: this.settings.wordMode,
      },
    };
  }
}

module.exports = Room;
