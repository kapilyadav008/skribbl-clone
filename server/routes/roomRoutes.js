/**
 * routes/roomRoutes.js
 *
 * REST API endpoints for room management.
 *
 * Endpoints:
 * - GET  /api/health            -> Server health check (Phase 1)
 * - POST /api/rooms             -> Create a room, returns roomCode and invite link
 * - GET  /api/rooms/:roomCode   -> Room info validation for join screen
 */

const express = require('express');
const router = express.Router();
const roomManager = require('../game/RoomManager');

// ─── Health Check ────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Skribbl.io Clone server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── POST /api/rooms — Create a Room ─────────────────────────────────────────
router.post('/rooms', (req, res) => {
  try {
    const { hostName, settings, sessionId } = req.body;

    if (!hostName || typeof hostName !== 'string' || !hostName.trim()) {
      return res.status(400).json({ error: 'Host name is required' });
    }

    const { room, roomCode, hostSessionId } = roomManager.createRoom({
      hostName: hostName.trim(),
      sessionId,
      settings,
    });

    // Determine the base client URL for invite link generation
    const clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0].trim() : 'http://localhost:5173';
    const inviteLink = `${clientUrl}/join/${roomCode}`;

    return res.status(201).json({
      success: true,
      roomCode,
      roomId: roomCode,
      hostSessionId,
      inviteLink,
      settings: room.settings,
    });
  } catch (error) {
    console.error('[REST] Error creating room:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to create room' });
  }
});

// ─── GET /api/rooms/:roomCode — Get Room Info ────────────────────────────────
router.get('/rooms/:roomCode', (req, res) => {
  try {
    const { roomCode } = req.params;
    const room = roomManager.getRoom(roomCode);

    if (!room) {
      return res.status(404).json({ error: `Room ${roomCode.toUpperCase()} not found` });
    }

    return res.json(room.toJoinInfo());
  } catch (error) {
    console.error('[REST] Error fetching room:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve room details' });
  }
});

module.exports = router;
