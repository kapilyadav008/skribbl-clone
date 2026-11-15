/**
 * socket/socket.js
 *
 * Creates and exports a SINGLE Socket.IO client instance for the entire app.
 *
 * WHY A SINGLETON?
 * If every component imported `io(url)` directly, each import would create
 * a NEW socket connection — wasting resources and causing multiple connection
 * logs on the server. By exporting one shared instance, all components
 * share the same connection.
 *
 * HOW IT WORKS:
 * - `io()` creates the socket but does NOT connect yet.
 *   We pass `autoConnect: false` so the connection only opens when we
 *   explicitly call `socket.connect()` (done in App.jsx on mount).
 *
 * - `VITE_SERVER_URL` is set in client/.env
 *   In development: http://localhost:4000
 *   In production:  https://your-backend.onrender.com
 *
 * RECONNECTION:
 * Socket.IO has built-in reconnection logic. If the connection drops,
 * it will automatically try to reconnect. We pass `playerSessionId`
 * in the auth handshake so the server can identify returning players
 * even after a socket.id change.
 *
 * HOW TO USE IN COMPONENTS:
 *   import socket from '../socket/socket';
 *   socket.emit('some_event', payload);
 *   socket.on('some_response', (data) => { ... });
 */

import { io } from 'socket.io-client';

const rawServerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
const SERVER_URL = rawServerUrl.replace(/\/+$/, '');

const socket = io(SERVER_URL, {
  // Don't connect automatically — we connect in App.jsx after setup
  autoConnect: false,

  // Prefer WebSocket over HTTP long-polling.
  // Polling creates many short HTTP requests; WebSocket is a single
  // persistent connection — better for real-time drawing.
  transports: ['websocket', 'polling'],

  // Reconnection settings — Socket.IO retries automatically on drop
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,       // wait 1s before first retry
  reconnectionDelayMax: 5000,    // cap retry delay at 5s

  // Auth payload sent on every connection/reconnection.
  // The server reads this in socket.handshake.auth.
  // playerSessionId persists across page reloads (stored in sessionStorage).
  // This is how we support reconnection without duplicate players.
  auth: (cb) => {
    cb({
      playerSessionId: sessionStorage.getItem('playerSessionId') || null,
    });
  },
});

// ─── Debug logging (only in development) ─────────────────────────────────────
if (import.meta.env.DEV) {
  socket.on('connect', () => {
    console.log('[Socket] Connected. socket.id =', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected. Reason:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('reconnect', (attempt) => {
    console.log(`[Socket] Reconnected after ${attempt} attempt(s)`);
  });
}

export default socket;
