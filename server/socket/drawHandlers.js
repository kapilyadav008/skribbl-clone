/**
 * socket/drawHandlers.js
 *
 * Socket.IO event handlers for Phase 4: Real-Time Drawing Canvas.
 *
 * Client to Server:
 * - `draw_start`: Drawer begins a new stroke.
 * - `draw_move`: Drawer continues stroke with new coordinate points.
 * - `draw_end`: Drawer completes stroke.
 * - `undo_drawing`: Drawer undoes the most recent complete stroke.
 * - `clear_canvas`: Drawer clears all strokes from canvas.
 * - `get_drawing_history`: Client requests current stroke history.
 *
 * Server to Clients:
 * - `draw_start`: Broadcast new stroke initialization.
 * - `draw_move`: Broadcast stroke coordinate updates.
 * - `draw_end`: Broadcast stroke conclusion.
 * - `drawing_undone`: Broadcast undo event across all room players.
 * - `canvas_cleared`: Broadcast clear event across all room players.
 * - `drawing_history`: Send full stroke replay array to client.
 */

const roomManager = require('../game/RoomManager');

/**
 * Validates that the socket belongs to the currently active drawer in a drawing round.
 * @param {import('socket.io').Socket} socket
 * @returns {{ room?: import('../game/Room'), game?: import('../game/GameManager'), player?: import('../game/Player'), error?: string }}
 */
function getActiveDrawerContext(socket) {
  const socketData = roomManager.socketMap.get(socket.id);
  if (!socketData) {
    return { error: 'Not connected to any room' };
  }

  const room = roomManager.getRoom(socketData.roomCode);
  if (!room || !room.game) {
    return { error: 'No active game in this room' };
  }

  if (room.game.roundStatus !== 'drawing') {
    return { error: 'Drawing is only allowed during an active drawing round' };
  }

  const player = room.getPlayerBySocketId(socket.id);
  if (!player) {
    return { error: 'Player not found in room' };
  }

  if (player.sessionId !== room.game.currentDrawerId) {
    return { error: 'Only the active drawer can draw' };
  }

  return { room, game: room.game, player };
}

/**
 * Registers drawing event handlers on a socket connection.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerDrawHandlers(io, socket) {
  // ── 1. draw_start ─────────────────────────────────────────────────────────
  socket.on('draw_start', (data = {}) => {
    try {
      const { room, game, player, error } = getActiveDrawerContext(socket);
      if (error) {
        return socket.emit('drawing_error', { message: error });
      }

      const { strokeId, color, brushSize, tool, point } = data;
      const stroke = game.drawingManager.startStroke({
        strokeId,
        sessionId: player.sessionId,
        color,
        brushSize,
        tool,
        point,
      });

      // Broadcast stroke start to everyone else in the room
      socket.to(room.roomCode).emit('draw_start', {
        ...stroke,
        point: stroke.points[0],
      });
    } catch (err) {
      socket.emit('drawing_error', { message: err.message });
    }
  });

  // ── 2. draw_move ──────────────────────────────────────────────────────────
  socket.on('draw_move', (data = {}) => {
    try {
      const { room, game, error } = getActiveDrawerContext(socket);
      if (error) {
        return socket.emit('drawing_error', { message: error });
      }

      const { strokeId } = data;
      const rawPoints = Array.isArray(data.points)
        ? data.points
        : data.point
        ? [data.point]
        : [];

      const addedPoints = game.drawingManager.addPoints(strokeId, rawPoints);
      if (addedPoints.length > 0) {
        // Broadcast point batch to other players in the room
        socket.to(room.roomCode).emit('draw_move', {
          strokeId,
          points: addedPoints,
          point: addedPoints[addedPoints.length - 1],
        });
      }
    } catch (err) {
      socket.emit('drawing_error', { message: err.message });
    }
  });

  // ── 3. draw_end ───────────────────────────────────────────────────────────
  socket.on('draw_end', (data = {}) => {
    try {
      const { room, game, error } = getActiveDrawerContext(socket);
      if (error) {
        return socket.emit('drawing_error', { message: error });
      }

      const { strokeId } = data;
      const finishedStroke = game.drawingManager.endStroke(strokeId);

      socket.to(room.roomCode).emit('draw_end', {
        strokeId,
        stroke: finishedStroke,
      });
    } catch (err) {
      socket.emit('drawing_error', { message: err.message });
    }
  });

  // ── 4. undo_drawing ───────────────────────────────────────────────────────
  socket.on('undo_drawing', () => {
    try {
      const { room, game, error } = getActiveDrawerContext(socket);
      if (error) {
        return socket.emit('drawing_error', { message: error });
      }

      const removedStroke = game.drawingManager.undo();
      if (removedStroke) {
        // Synchronize undo across all room participants
        io.to(room.roomCode).emit('drawing_undone', {
          strokeId: removedStroke.strokeId,
          remainingStrokes: game.drawingManager.strokes.length,
        });
      }
    } catch (err) {
      socket.emit('drawing_error', { message: err.message });
    }
  });

  // ── 5. clear_canvas ───────────────────────────────────────────────────────
  socket.on('clear_canvas', () => {
    try {
      const { room, game, error } = getActiveDrawerContext(socket);
      if (error) {
        return socket.emit('drawing_error', { message: error });
      }

      game.drawingManager.clear();

      // Synchronize canvas wipe across all clients in the room
      io.to(room.roomCode).emit('canvas_cleared', {});
    } catch (err) {
      socket.emit('drawing_error', { message: err.message });
    }
  });

  // ── 6. get_drawing_history ────────────────────────────────────────────────
  socket.on('get_drawing_history', () => {
    try {
      const socketData = roomManager.socketMap.get(socket.id);
      if (!socketData) return;

      const room = roomManager.getRoom(socketData.roomCode);
      if (room && room.game && room.game.drawingManager) {
        socket.emit('drawing_history', {
          strokes: room.game.drawingManager.getHistory(),
        });
      }
    } catch (err) {
      console.warn(`[Socket] get_drawing_history error: ${err.message}`);
    }
  });
}

module.exports = { registerDrawHandlers };

