/**
 * game/RoomManager.js
 *
 * Central in-memory store and manager for all active rooms and player connections.
 *
 * RESPONSIBILITIES:
 * 1. Maintain in-memory Map of active rooms by roomCode.
 * 2. Room creation and validation of host-configured settings.
 * 3. Player joining and session-based reconnection (handles transient socket disconnects).
 * 4. Tracking socketId <-> roomCode mappings for O(1) lookup on socket events.
 * 5. Host transfer on disconnection.
 * 6. Automated room cleanup when all players disconnect or leave.
 */

const Room = require('./Room');
const Player = require('./Player');
const CONSTANTS = require('../config/constants');
const { generateRoomCode } = require('../utils/generateRoomCode');

class RoomManager {
  constructor() {
    // Map<roomCode, Room>
    this.rooms = new Map();

    // Map<socketId, { roomCode, sessionId }> for fast event dispatch
    this.socketMap = new Map();

    // Map<sessionId, { roomCode, expireTimeout }> for reconnection tracking
    this.sessionMap = new Map();
  }

  /**
   * Validates and sanitizes room settings against global bounds.
   * @param {object} rawSettings
   * @returns {object} validated settings
   */
  sanitizeSettings(rawSettings = {}) {
    const G = CONSTANTS.GAME;
    const R = CONSTANTS.ROOM;

    const maxPlayers = Math.min(
      R.MAX_PLAYERS,
      Math.max(R.MIN_PLAYERS, parseInt(rawSettings.maxPlayers, 10) || 8)
    );

    const rounds = Math.min(
      G.MAX_ROUNDS,
      Math.max(G.MIN_ROUNDS, parseInt(rawSettings.rounds, 10) || G.DEFAULT_ROUNDS)
    );

    const drawTime = Math.min(
      G.MAX_DRAW_TIME,
      Math.max(G.MIN_DRAW_TIME, parseInt(rawSettings.drawTime, 10) || G.DEFAULT_DRAW_TIME)
    );

    const wordCount = Math.min(
      G.MAX_WORD_COUNT,
      Math.max(G.MIN_WORD_COUNT, parseInt(rawSettings.wordCount, 10) || G.DEFAULT_WORD_COUNT)
    );

    const hints = Math.min(
      G.MAX_HINTS,
      Math.max(G.MIN_HINTS, parseInt(rawSettings.hints, 10) || G.DEFAULT_HINTS)
    );

    const wordMode = G.WORD_MODES.includes(rawSettings.wordMode)
      ? rawSettings.wordMode
      : G.DEFAULT_WORD_MODE;

    return {
      maxPlayers,
      rounds,
      drawTime,
      wordCount,
      hints,
      wordMode,
    };
  }

  /**
   * Creates a new room with a unique code.
   * @param {object} params
   * @param {string} params.hostName - Name of the host
   * @param {string} [params.sessionId] - Host's persistent session ID
   * @param {object} [params.settings] - Host-configured room settings
   * @returns {{ room: Room, roomCode: string, hostSessionId: string }}
   */
  createRoom({ hostName, sessionId, settings = {} }) {
    if (!hostName || typeof hostName !== 'string' || !hostName.trim()) {
      throw new Error('Host name is required');
    }

    const sanitizedSettings = this.sanitizeSettings(settings);
    const existingCodes = new Set(this.rooms.keys());
    const roomCode = generateRoomCode(existingCodes);

    const hostSessionId = sessionId || `session_${Math.random().toString(36).substring(2)}${Date.now()}`;

    const room = new Room({
      roomCode,
      hostId: hostSessionId,
      settings: sanitizedSettings,
    });

    this.rooms.set(roomCode, room);

    return {
      room,
      roomCode,
      hostSessionId,
    };
  }

  /**
   * Retrieves a room by roomCode (case-insensitive).
   * @param {string} roomCode
   * @returns {Room | null}
   */
  getRoom(roomCode) {
    if (!roomCode || typeof roomCode !== 'string') return null;
    return this.rooms.get(roomCode.trim().toUpperCase()) || null;
  }

  /**
   * Checks whether a room exists.
   * @param {string} roomCode
   * @returns {boolean}
   */
  hasRoom(roomCode) {
    if (!roomCode || typeof roomCode !== 'string') return false;
    return this.rooms.has(roomCode.trim().toUpperCase());
  }

  /**
   * Joins a player into a room or reconnects an existing session.
   * @param {object} params
   * @param {string} params.roomCode
   * @param {string} params.playerName
   * @param {string} params.sessionId
   * @param {string} params.socketId
   * @returns {{ room: Room, player: Player, isReconnect: boolean }}
   */
  joinRoom({ roomCode, playerName, sessionId, socketId }) {
    const code = (roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      throw new Error(`Room ${code} does not exist`);
    }

    if (!playerName || !playerName.trim()) {
      throw new Error('Player name is required');
    }

    const cleanName = playerName.trim().substring(0, 20);

    // ── 1. Check if this is a reconnection with an existing sessionId ──────
    const existingPlayer = room.getPlayerBySessionId(sessionId);

    if (existingPlayer) {
      // Reconnect player: update socket ID and clear pending eviction
      existingPlayer.reconnect(socketId);
      existingPlayer.name = cleanName; // update name if changed

      this.socketMap.set(socketId, { roomCode: code, sessionId });
      this.sessionMap.set(sessionId, { roomCode: code });

      return {
        room,
        player: existingPlayer,
        isReconnect: true,
      };
    }

    // ── 2. New Player Joining Validations ─────────────────────────────────
    if (room.status === 'playing') {
      throw new Error('Game is already in progress');
    }

    if (room.playerCount >= room.settings.maxPlayers) {
      throw new Error('Room is full');
    }

    // Determine host status: if no host is in the room, make this player host
    const isFirstPlayer = room.playerCount === 0 || !room.host;
    const isHost = isFirstPlayer || room.hostId === sessionId;

    if (isFirstPlayer) {
      room.hostId = sessionId;
    }

    const player = new Player({
      sessionId,
      socketId,
      name: cleanName,
      isHost,
    });

    room.addPlayer(player);

    this.socketMap.set(socketId, { roomCode: code, sessionId });
    this.sessionMap.set(sessionId, { roomCode: code });

    return {
      room,
      player,
      isReconnect: false,
    };
  }

  /**
   * Updates settings for a room if the requesting player is the host.
   * @param {string} socketId
   * @param {object} newSettings
   * @returns {{ room: Room, settings: object }}
   */
  updateSettings(socketId, newSettings) {
    const socketData = this.socketMap.get(socketId);
    if (!socketData) {
      throw new Error('Not connected to any room');
    }

    const room = this.rooms.get(socketData.roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.status !== 'lobby') {
      throw new Error('Cannot change settings after game has started');
    }

    const player = room.getPlayerBySocketId(socketId);
    if (!player || !player.isHost) {
      throw new Error('Only the room host can change settings');
    }

    const updated = room.updateSettings(newSettings);
    return { room, settings: updated };
  }

  /**
   * Handles a socket disconnection.
   * Schedules a grace period before permanently removing the player.
   * @param {string} socketId
   * @param {Function} onPlayerRemoved - Callback if player is permanently removed after timeout
   * @returns {{ room: Room, player: Player } | null}
   */
  handleDisconnect(socketId, onPlayerRemoved) {
    const socketData = this.socketMap.get(socketId);
    if (!socketData) return null;

    const { roomCode, sessionId } = socketData;
    this.socketMap.delete(socketId);

    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const player = room.getPlayerBySessionId(sessionId);
    if (!player) return null;

    // Start reconnection grace period
    player.startReconnectTimer(() => {
      // Grace period expired: permanently remove player
      this.permanentlyRemovePlayer(roomCode, sessionId, onPlayerRemoved);
    }, CONSTANTS.RECONNECT.TIMEOUT_MS);

    return { room, player };
  }

  /**
   * Permanently removes a player after disconnect timeout or explicit leave.
   * Handles host transfer and room cleanup if empty.
   * @param {string} roomCode
   * @param {string} sessionId
   * @param {Function} [callback]
   */
  permanentlyRemovePlayer(roomCode, sessionId, callback) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const player = room.getPlayerBySessionId(sessionId);
    if (!player) return;

    // Cancel any pending reconnect timer
    if (typeof player.clearReconnectTimer === 'function') {
      player.clearReconnectTimer();
    } else if (player._reconnectTimer) {
      clearTimeout(player._reconnectTimer);
      player._reconnectTimer = null;
    }

    // Clean up socket mapping
    if (player.socketId) {
      this.socketMap.delete(player.socketId);
    }

    // Remove player
    room.removePlayer(sessionId);
    this.sessionMap.delete(sessionId);

    let newHost = null;

    // If leaving player was host, transfer host to next connected player
    if (player.isHost && room.playerCount > 0) {
      newHost = room.transferHost();
    }

    // If room is completely empty, clean it up
    if (room.playerCount === 0 || room.connectedPlayerCount === 0) {
      this.cleanupRoom(roomCode);
    }

    if (typeof callback === 'function') {
      callback({
        roomCode,
        removedPlayerId: sessionId,
        removedPlayerName: player.name,
        remainingPlayers: Array.from(room.players.values()).map((p) => p.toPublic()),
        newHost: newHost ? newHost.toPublic() : null,
        roomDeleted: !this.rooms.has(roomCode),
      });
    }
  }

  /**
   * Cleans up and deletes an inactive room from memory.
   * @param {string} roomCode
   */
  cleanupRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    // Clear any timers or intervals if game was running
    if (room.game) {
      if (typeof room.game.clearTimers === 'function') {
        room.game.clearTimers();
      } else if (room.game.timerInterval) {
        clearInterval(room.game.timerInterval);
      }
    }

    for (const player of room.players.values()) {
      if (player._reconnectTimer) {
        clearTimeout(player._reconnectTimer);
      }
      this.sessionMap.delete(player.sessionId);
    }

    this.rooms.delete(roomCode);
    console.log(`[RoomManager] Room ${roomCode} deleted from memory.`);
  }
}

// Export singleton instance across server
const roomManager = new RoomManager();
module.exports = roomManager;
