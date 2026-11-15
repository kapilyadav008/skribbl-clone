/**
 * socket/index.js
 *
 * Initializes Socket.IO and attaches all event handlers.
 *
 * Handlers registered:
 * - roomHandlers: Room join, settings, leave, and disconnect handling.
 * - (Phase 3 & 4 will register gameHandlers, drawHandlers, chatHandlers).
 */

const { registerRoomHandlers } = require('./roomHandlers');
const { registerGameHandlers } = require('./gameHandlers');
const { registerDrawHandlers } = require('./drawHandlers');

/**
 * initializeSocket
 * @param {import('socket.io').Server} io - The Socket.IO server instance
 */
function initializeSocket(io) {
  // ─── Connection Middleware ──────────────────────────────────────────────
  io.use((socket, next) => {
    // Read optional playerSessionId from socket handshake auth
    const sessionId = socket.handshake.auth?.playerSessionId;
    console.log(`[Socket] Connection attempt: ${socket.id} (sessionId: ${sessionId || 'none'})`);
    next();
  });

  // ─── Connection Handler ─────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── Phase 1 Test echo event (preserved) ───────────────────────────────
    socket.on('ping_test', (data) => {
      console.log(`[Socket] ping_test received from ${socket.id}:`, data);
      socket.emit('pong_test', {
        message: 'pong from server!',
        yourSocketId: socket.id,
        serverTime: new Date().toISOString(),
        received: data,
      });
    });

    // ── Phase 2 Room Handlers ─────────────────────────────────────────────
    registerRoomHandlers(io, socket);

    // ── Phase 3 Game Handlers ─────────────────────────────────────────────
    registerGameHandlers(io, socket);

    // ── Phase 4 Draw Handlers ─────────────────────────────────────────────
    registerDrawHandlers(io, socket);
  });

  console.log('[Socket] Socket.IO initialized with room handlers');
}

module.exports = { initializeSocket };
