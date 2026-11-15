/**
 * socket/roomHandlers.js
 *
 * Socket.IO event handlers for Room Management.
 *
 * Events handled:
 * - `join_room`: Joins a player to a room or reconnects existing session.
 * - `update_settings`: Host-only room settings modification.
 * - `leave_room`: Explicit player exit from a room.
 * - `disconnect`: Socket disconnection with reconnection grace period.
 */

const roomManager = require('../game/RoomManager');

/**
 * Registers room event handlers on a socket connection.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerRoomHandlers(io, socket) {
  // ── 1. join_room ──────────────────────────────────────────────────────────
  socket.on('join_room', (data = {}) => {
    try {
      const { roomCode, playerName } = data;
      // Accept sessionId from payload or from socket handshake auth
      const sessionId = data.sessionId || socket.handshake.auth?.playerSessionId;

      if (!roomCode) {
        return socket.emit('room_error', { message: 'Room code is required' });
      }

      const { room, player, isReconnect } = roomManager.joinRoom({
        roomCode,
        playerName,
        sessionId,
        socketId: socket.id,
      });

      // Join the Socket.IO room channel
      socket.join(room.roomCode);

      // Confirm join back to the requesting client
      socket.emit('room_joined', {
        room: room.toPublic(),
        player: player.toPublic(),
        isReconnect,
      });

      // If rejoining or joining during an active drawing round, synchronize drawing history
      if (room.game && room.game.roundStatus === 'drawing' && room.game.drawingManager) {
        socket.emit('drawing_history', {
          strokes: room.game.drawingManager.getHistory(),
        });
      }

      // If rejoining during an active game, synchronize in-flight round state directly to this player
      if (isReconnect && room.game && typeof room.game.sendReconnectState === 'function') {
        room.game.sendReconnectState(socket, player.sessionId);
      }

      // Broadcast to everyone in the room that a player joined / reconnected
      io.to(room.roomCode).emit('player_joined', {
        player: player.toPublic(),
        players: room.toPublic().players,
        playerCount: room.playerCount,
        connectedPlayerCount: room.connectedPlayerCount,
        isReconnect,
      });

      console.log(
        `[Socket] ${player.name} (${player.sessionId}) ${
          isReconnect ? 'reconnected to' : 'joined'
        } room ${room.roomCode}`
      );
    } catch (error) {
      console.warn(`[Socket] join_room failed for ${socket.id}: ${error.message}`);
      socket.emit('room_error', { message: error.message });
    }
  });

  // ── 2. update_settings (Host only) ───────────────────────────────────────
  socket.on('update_settings', (data = {}) => {
    try {
      const { settings } = data;
      if (!settings || typeof settings !== 'object') {
        return socket.emit('room_error', { message: 'Invalid settings payload' });
      }

      const { room, settings: updatedSettings } = roomManager.updateSettings(
        socket.id,
        settings
      );

      // Broadcast updated settings to all players in the room
      io.to(room.roomCode).emit('settings_updated', {
        settings: updatedSettings,
      });

      console.log(`[Socket] Room ${room.roomCode} settings updated by host`);
    } catch (error) {
      console.warn(`[Socket] update_settings failed for ${socket.id}: ${error.message}`);
      socket.emit('room_error', { message: error.message });
    }
  });

  // ── 3. leave_room (Explicit leave) ───────────────────────────────────────
  socket.on('leave_room', (data = {}) => {
    try {
      const socketData = roomManager.socketMap.get(socket.id) || {};
      const roomCode = (data.roomCode || socketData.roomCode || '').trim().toUpperCase();
      const sessionId = data.sessionId || socketData.sessionId || socket.handshake.auth?.playerSessionId;

      if (!roomCode || !sessionId) {
        return;
      }

      socket.leave(roomCode);
      roomManager.socketMap.delete(socket.id);

      const activeRoom = roomManager.getRoom(roomCode);
      if (activeRoom && activeRoom.game && typeof activeRoom.game.handlePlayerDisconnect === 'function') {
        activeRoom.game.handlePlayerDisconnect(sessionId);
      }

      roomManager.permanentlyRemovePlayer(
        roomCode,
        sessionId,
        ({ removedPlayerId, removedPlayerName, remainingPlayers, newHost, roomDeleted }) => {
          if (!roomDeleted) {
            const currentRoom = roomManager.getRoom(roomCode);
            io.to(roomCode).emit('player_left', {
              playerId: removedPlayerId,
              playerName: removedPlayerName,
              players: remainingPlayers,
              playerCount: currentRoom ? currentRoom.playerCount : remainingPlayers.length,
              connectedPlayerCount: currentRoom
                ? currentRoom.connectedPlayerCount
                : remainingPlayers.filter((p) => p.isConnected).length,
              newHostId: newHost ? newHost.id : null,
            });
          }
        }
      );
    } catch (error) {
      console.error(`[Socket] leave_room error for ${socket.id}:`, error.message);
    }
  });

  // ── 4. Disconnect handling ───────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnect: ${socket.id} (${reason})`);

    const result = roomManager.handleDisconnect(socket.id, (eventData) => {
      // Grace period expired: permanently removed
      const { roomCode, removedPlayerId, removedPlayerName, remainingPlayers, newHost, roomDeleted } = eventData;
      if (!roomDeleted) {
        const currentRoom = roomManager.getRoom(roomCode);
        io.to(roomCode).emit('player_left', {
          playerId: removedPlayerId,
          playerName: removedPlayerName,
          players: remainingPlayers,
          playerCount: currentRoom ? currentRoom.playerCount : remainingPlayers.length,
          connectedPlayerCount: currentRoom
            ? currentRoom.connectedPlayerCount
            : remainingPlayers.filter((p) => p.isConnected).length,
          newHostId: newHost ? newHost.id : null,
        });
      }
    });

    if (result) {
      const { room, player } = result;

      // Notify active game if running
      if (room.game && typeof room.game.handlePlayerDisconnect === 'function') {
        room.game.handlePlayerDisconnect(player.sessionId);
      }

      // Notify other players that this player is temporarily disconnected
      io.to(room.roomCode).emit('player_status_change', {
        playerId: player.sessionId,
        isConnected: false,
        players: room.toPublic().players,
        playerCount: room.playerCount,
        connectedPlayerCount: room.connectedPlayerCount,
      });
    }
  });
}

module.exports = { registerRoomHandlers };
