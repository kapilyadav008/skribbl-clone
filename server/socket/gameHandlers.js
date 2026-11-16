/**
 * socket/gameHandlers.js
 *
 * Socket.IO event handlers for Phase 3: Game Engine.
 *
 * Events handled (Client -> Server):
 * - `start_game`: Host requests to begin the game.
 * - `select_word`: Current drawer selects one of the offered choices.
 * - `submit_guess`: Non-drawer player submits a guess for the secret word.
 */

const roomManager = require('../game/RoomManager');
const GameManager = require('../game/GameManager');

/**
 * Registers game event handlers for a socket connection.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerGameHandlers(io, socket) {
  // ── 1. start_game (Host only) ─────────────────────────────────────────────
  socket.on('start_game', () => {
    try {
      const socketData = roomManager.socketMap.get(socket.id);
      if (!socketData) {
        return socket.emit('game_error', { message: 'Not connected to any room' });
      }

      const { roomCode } = socketData;
      const room = roomManager.getRoom(roomCode);
      if (!room) {
        return socket.emit('game_error', { message: 'Room not found' });
      }

      const player = room.getPlayerBySocketId(socket.id);
      if (!player) {
        return socket.emit('game_error', { message: 'Player not found in room' });
      }

      // Check eligibility before starting
      const validation = GameManager.validateCanStart(room, player.sessionId);
      if (!validation.eligible) {
        return socket.emit('game_error', { message: validation.error });
      }

      // Instantiate or re-instantiate GameManager for this room
      const game = new GameManager(room, io);
      room.game = game;

      game.startGame(player.sessionId);
    } catch (error) {
      console.warn(`[Socket] start_game failed for ${socket.id}: ${error.message}`);
      socket.emit('game_error', { message: error.message });
    }
  });

  // ── 2. select_word (Drawer only) ──────────────────────────────────────────
  socket.on('select_word', (data = {}) => {
    try {
      const { word } = data;
      if (!word || typeof word !== 'string') {
        return socket.emit('game_error', { message: 'A word must be selected' });
      }

      const socketData = roomManager.socketMap.get(socket.id);
      if (!socketData) {
        return socket.emit('game_error', { message: 'Not connected to any room' });
      }

      const room = roomManager.getRoom(socketData.roomCode);
      if (!room || !room.game) {
        return socket.emit('game_error', { message: 'No active game in this room' });
      }

      const player = room.getPlayerBySocketId(socket.id);
      if (!player) {
        return socket.emit('game_error', { message: 'Player not found in room' });
      }

      room.game.selectWord(player.sessionId, word);
    } catch (error) {
      console.warn(`[Socket] select_word failed for ${socket.id}: ${error.message}`);
      socket.emit('game_error', { message: error.message });
    }
  });

  // ── 3. submit_guess (Guessers only) ───────────────────────────────────────
  socket.on('submit_guess', (data = {}) => {
    try {
      const { guess } = data;
      if (!guess || typeof guess !== 'string') {
        return socket.emit('game_error', { message: 'Guess cannot be empty' });
      }

      const socketData = roomManager.socketMap.get(socket.id);
      if (!socketData) {
        return socket.emit('game_error', { message: 'Not connected to any room' });
      }

      const room = roomManager.getRoom(socketData.roomCode);
      if (!room) {
        return socket.emit('game_error', { message: 'Room not found' });
      }

      const player = room.getPlayerBySocketId(socket.id);
      if (!player) {
        return socket.emit('game_error', { message: 'Player not found in room' });
      }

      // If no active game, allow in-room lobby chat
      if (!room.game) {
        io.to(room.roomCode).emit('chat_message', {
          id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          playerId: player.sessionId,
          playerName: player.name,
          text: guess.trim(),
          type: 'chat',
          timestamp: Date.now(),
        });
        return;
      }

      // If game is in selecting_word or round_ended phase, treat as friendly room chat
      if (room.game.roundStatus !== 'drawing') {
        io.to(room.roomCode).emit('chat_message', {
          id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          playerId: player.sessionId,
          playerName: player.name,
          text: guess.trim(),
          type: 'chat',
          timestamp: Date.now(),
        });
        return;
      }

      const result = room.game.submitGuess(player.sessionId, guess);
      if (result.error) {
        return socket.emit('game_error', { message: result.error });
      }

      if (result.isClose) {
        socket.emit('chat_message', {
          id: `close-${Date.now()}`,
          sender: 'Studio',
          text: `"${result.guess}" is close!`,
          type: 'close',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.warn(`[Socket] submit_guess error for ${socket.id}: ${error.message}`);
      socket.emit('game_error', { message: error.message });
    }
  });

  // ── 4. return_to_lobby (Host only) ────────────────────────────────────────
  socket.on('return_to_lobby', () => {
    try {
      const socketData = roomManager.socketMap.get(socket.id);
      if (!socketData) return;
      const room = roomManager.getRoom(socketData.roomCode);
      if (!room) return;
      const player = room.getPlayerBySocketId(socket.id);
      if (!player || player.sessionId !== room.hostId) {
        return socket.emit('game_error', { message: 'Only the host can return to the lobby' });
      }

      if (room.game) {
        room.game.clearTimers();
        room.game = null;
      }
      room.status = 'waiting';

      // Reset scores and per-round state
      for (const p of room.players.values()) {
        p.score = 0;
        p.resetRoundState();
      }

      io.to(room.roomCode).emit('returned_to_lobby', {
        room: room.toPublic(),
        reason: 'host_action',
      });
    } catch (err) {
      console.warn(`[Socket] return_to_lobby error: ${err.message}`);
      socket.emit('game_error', { message: err.message });
    }
  });
}

module.exports = { registerGameHandlers };
