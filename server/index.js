/**
 * index.js — Main entry point for the backend server
 *
 * What this file does:
 * 1. Loads environment variables from .env
 * 2. Creates an Express app
 * 3. Configures CORS so the React frontend can call this server
 * 4. Mounts REST API routes
 * 5. Creates an HTTP server (needed for Socket.IO to attach to)
 * 6. Creates a Socket.IO server and attaches it to the HTTP server
 * 7. Starts listening on the configured PORT
 *
 * Why do we need an HTTP server separately from Express?
 * Socket.IO cannot attach directly to an Express app — it needs
 * the underlying Node.js HTTP server. We create it with
 * `http.createServer(app)` and then pass it to Socket.IO.
 */

// Load .env file first — before anything else reads process.env
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const roomRoutes = require('./routes/roomRoutes');
const { initializeSocket } = require('./socket/index');

// ─── Environment Variables ────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── CORS Origins ─────────────────────────────────────────────────────────────
// Support multiple origins separated by commas in .env
// e.g., CLIENT_URL="http://localhost:5173,https://your-app.vercel.app"
const allowedOrigins = CLIENT_URL.split(',').map((url) => url.trim().replace(/\/+$/, ''));

console.log(`[Server] Starting in ${NODE_ENV} mode`);
console.log(`[Server] Allowed CORS origins: ${allowedOrigins.join(', ')}`);

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

// Parse JSON request bodies (needed for POST /rooms)
app.use(express.json());

// Root health check endpoint for cloud monitoring & Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'SketchClub server is running',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// CORS middleware — allows the React frontend to make HTTP requests to this server
// Without this, browsers block cross-origin requests (security policy)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      // In non-production, permit local loopback variations
      if (
        NODE_ENV !== 'production' &&
        (normalizedOrigin.includes('localhost') || normalizedOrigin.includes('127.0.0.1'))
      ) {
        return callback(null, true);
      }
      console.warn(`[CORS] Blocked origin: ${origin}`);
      return callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

// ─── REST Routes ──────────────────────────────────────────────────────────────
// All REST endpoints are prefixed with /api
app.use('/api', roomRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Express requires 4 parameters for error handlers — the extra `next` is intentional
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── HTTP Server ──────────────────────────────────────────────────────────────
// We create a raw Node.js HTTP server from Express so Socket.IO can attach to it.
const httpServer = http.createServer(app);

// ─── Socket.IO Server ────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Force WebSocket transport to avoid polling issues on Render/Railway
  // 'polling' is the HTTP fallback; we prefer the full WebSocket protocol
  transports: ['websocket', 'polling'],
});

// Initialize all Socket.IO event handlers
initializeSocket(io);

// ─── Start Server ─────────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP + Socket.IO server running on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health or /api/health`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
// When the process is killed (Ctrl+C or deployment restart),
// close the server cleanly instead of abruptly dropping connections.
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — shutting down gracefully');
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received — shutting down gracefully');
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});
