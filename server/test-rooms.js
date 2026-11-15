/**
 * test-rooms.js
 *
 * Phase 2 Automated Test Suite.
 * Tests:
 * 1. Health check & Phase 1 ping_test preservation
 * 2. POST /api/rooms creation & settings validation
 * 3. GET /api/rooms/:roomCode validation & 404 handling
 * 4. Socket.IO join_room with multiple clients
 * 5. Reconnection with same sessionId (no duplicate players)
 * 6. Maximum player limit enforcement (room full rejection)
 * 7. Invalid room code handling
 * 8. Host-only update_settings enforcement
 * 9. Host transfer on disconnect
 * 10. Room cleanup after all players leave
 */

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

const roomManager = require('./game/RoomManager');
const roomRoutes = require('./routes/roomRoutes');
const { initializeSocket } = require('./socket/index');

const TEST_PORT = 4100;
const HOST = '127.0.0.1';
let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✅ PASS: ${msg}`);
  passed++;
}

function fail(msg) {
  console.error(`  ❌ FAIL: ${msg}`);
  failed++;
}

function makeHttpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: HOST,
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function createClient(sessionId) {
  return ioc(`http://${HOST}:${TEST_PORT}`, {
    transports: ['websocket'],
    auth: { playerSessionId: sessionId },
    forceNew: true,
  });
}

async function runTests() {
  console.log('\n🧪 Phase 2 Room Management Test Suite\n');
  console.log('═'.repeat(50));

  // ── Setup Express & Socket.IO server ──────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*' }));
  app.use('/api', roomRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  initializeSocket(io);

  await new Promise((resolve) => httpServer.listen(TEST_PORT, HOST, resolve));
  console.log(`📡 Test server running on http://${HOST}:${TEST_PORT}\n`);

  let testRoomCode = '';
  let hostSessionId = 'host_session_123';
  let guestSessionId = 'guest_session_456';

  // ── Test 1: Preservation of GET /api/health ────────────────────────────────
  console.log('Test 1: Preservation of GET /api/health');
  try {
    const res = await makeHttpRequest('GET', '/api/health');
    if (res.status === 200 && res.body.status === 'ok') {
      pass('Health endpoint returns 200 OK');
    } else {
      fail(`Unexpected health response: ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    fail(`Health test error: ${err.message}`);
  }

  // ── Test 2: POST /api/rooms — Creation & Settings Validation ──────────────
  console.log('\nTest 2: POST /api/rooms creation and settings sanitization');
  try {
    // Missing hostName should fail
    const invalidRes = await makeHttpRequest('POST', '/api/rooms', { hostName: '  ' });
    if (invalidRes.status === 400) {
      pass('Rejects room creation with empty host name (400)');
    } else {
      fail(`Expected 400, got ${invalidRes.status}`);
    }

    // Valid creation with clamped settings
    const createRes = await makeHttpRequest('POST', '/api/rooms', {
      hostName: 'Alice',
      sessionId: hostSessionId,
      settings: {
        maxPlayers: 2, // set low to test max players limit later
        rounds: 99,    // should be clamped to MAX_ROUNDS (10)
        drawTime: 10,  // should be clamped to MIN_DRAW_TIME (15)
      },
    });

    if (createRes.status === 201 && createRes.body.success && createRes.body.roomCode) {
      testRoomCode = createRes.body.roomCode;
      pass(`Created room with 6-char code: ${testRoomCode}`);
      pass(`Generated invite link: ${createRes.body.inviteLink}`);

      if (createRes.body.settings.rounds === 10 && createRes.body.settings.drawTime === 15) {
        pass('Settings clamped properly to bounds (rounds: 10, drawTime: 15)');
      } else {
        fail(`Settings not clamped properly: ${JSON.stringify(createRes.body.settings)}`);
      }
    } else {
      fail(`Failed to create room: ${JSON.stringify(createRes.body)}`);
    }
  } catch (err) {
    fail(`POST /api/rooms error: ${err.message}`);
  }

  // ── Test 3: GET /api/rooms/:roomCode Validation & 404 Handling ────────────
  console.log('\nTest 3: GET /api/rooms/:roomCode');
  try {
    // Non-existent room
    const notFoundRes = await makeHttpRequest('GET', '/api/rooms/NONEX1');
    if (notFoundRes.status === 404) {
      pass('Non-existent room code returns 404');
    } else {
      fail(`Expected 404, got ${notFoundRes.status}`);
    }

    // Valid room lookup
    const foundRes = await makeHttpRequest('GET', `/api/rooms/${testRoomCode.toLowerCase()}`);
    if (foundRes.status === 200 && foundRes.body.roomCode === testRoomCode && foundRes.body.maxPlayers === 2) {
      pass('Valid room code returns correct join metadata (case-insensitive)');
    } else {
      fail(`Unexpected room info: ${JSON.stringify(foundRes.body)}`);
    }
  } catch (err) {
    fail(`GET /api/rooms error: ${err.message}`);
  }

  // ── Test 4: Socket.IO join_room & player_joined Broadcast ─────────────────
  console.log('\nTest 4: Socket.IO join_room and player_joined broadcast');
  const clientAlice = createClient(hostSessionId);
  const clientBob = createClient(guestSessionId);

  try {
    // 1. Alice joins as host
    const aliceJoinedPromise = new Promise((resolve, reject) => {
      clientAlice.on('room_joined', resolve);
      clientAlice.on('room_error', reject);
      setTimeout(() => reject(new Error('Alice join timeout')), 3000);
    });

    clientAlice.emit('join_room', {
      roomCode: testRoomCode,
      playerName: 'Alice',
      sessionId: hostSessionId,
    });

    const aliceResult = await aliceJoinedPromise;
    if (aliceResult.player.name === 'Alice' && aliceResult.player.isHost === true) {
      pass('Alice successfully joined and is designated host');
    } else {
      fail(`Alice join result invalid: ${JSON.stringify(aliceResult)}`);
    }

    // 2. Bob joins as second player
    const bobJoinedPromise = new Promise((resolve, reject) => {
      clientBob.on('room_joined', resolve);
      clientBob.on('room_error', reject);
      setTimeout(() => reject(new Error('Bob join timeout')), 3000);
    });

    const aliceSawBobPromise = new Promise((resolve, reject) => {
      clientAlice.on('player_joined', (data) => {
        if (data.player.name === 'Bob') resolve(data);
      });
      setTimeout(() => reject(new Error('Alice did not see Bob join')), 3000);
    });

    clientBob.emit('join_room', {
      roomCode: testRoomCode,
      playerName: 'Bob',
      sessionId: guestSessionId,
    });

    const [bobResult, aliceSawBob] = await Promise.all([bobJoinedPromise, aliceSawBobPromise]);
    if (bobResult.player.name === 'Bob' && bobResult.player.isHost === false) {
      pass('Bob joined as guest');
    }
    if (aliceSawBob.players.length === 2) {
      pass('Alice received player_joined broadcast with total 2 players');
    }
  } catch (err) {
    fail(`Join room test error: ${err.message}`);
  }

  // ── Test 5: Reconnection without Duplicate Players ────────────────────────
  console.log('\nTest 5: Reconnection with same sessionId');
  try {
    // Disconnect Bob's socket
    clientBob.disconnect();

    // Create a new socket for Bob with the SAME guestSessionId
    const clientBobReconnected = createClient(guestSessionId);

    const bobReconnectedPromise = new Promise((resolve, reject) => {
      clientBobReconnected.on('room_joined', resolve);
      clientBobReconnected.on('room_error', reject);
      setTimeout(() => reject(new Error('Bob reconnect timeout')), 3000);
    });

    clientBobReconnected.emit('join_room', {
      roomCode: testRoomCode,
      playerName: 'Bob',
      sessionId: guestSessionId,
    });

    const reconnectResult = await bobReconnectedPromise;
    if (reconnectResult.isReconnect === true) {
      pass('Bob recognized as reconnecting player (isReconnect = true)');
    } else {
      fail('Bob was treated as a new player instead of reconnecting');
    }

    const room = roomManager.getRoom(testRoomCode);
    if (room && room.playerCount === 2) {
      pass('Player count remained 2 (no duplicate player created)');
    } else {
      fail(`Player count expected 2, got ${room?.playerCount}`);
    }

    clientBobReconnected.disconnect();
  } catch (err) {
    fail(`Reconnection test error: ${err.message}`);
  }

  // ── Test 6: Max Player Limit Enforcement ──────────────────────────────────
  console.log('\nTest 6: Max Player Limit Validation (Room Full)');
  try {
    // Room has Alice and Bob (maxPlayers is 2). Try to join Charlie
    const charlieSessionId = 'charlie_session_789';
    const clientCharlie = createClient(charlieSessionId);

    const charlieRejectedPromise = new Promise((resolve) => {
      clientCharlie.on('room_error', (data) => resolve(data));
      clientCharlie.on('room_joined', () => fail('Charlie should not have been allowed in'));
      setTimeout(() => resolve(null), 3000);
    });

    clientCharlie.emit('join_room', {
      roomCode: testRoomCode,
      playerName: 'Charlie',
      sessionId: charlieSessionId,
    });

    const errorResult = await charlieRejectedPromise;
    if (errorResult && errorResult.message === 'Room is full') {
      pass('Charlie was rejected with "Room is full" error');
    } else {
      fail(`Charlie did not receive expected full room error: ${JSON.stringify(errorResult)}`);
    }

    clientCharlie.disconnect();
  } catch (err) {
    fail(`Max player limit test error: ${err.message}`);
  }

  // ── Test 7: Invalid Room Code Handling ────────────────────────────────────
  console.log('\nTest 7: Invalid Room Code Handling');
  try {
    const clientDave = createClient('dave_123');
    const daveRejectedPromise = new Promise((resolve) => {
      clientDave.on('room_error', resolve);
      setTimeout(() => resolve(null), 3000);
    });

    clientDave.emit('join_room', {
      roomCode: 'INVALID',
      playerName: 'Dave',
    });

    const err = await daveRejectedPromise;
    if (err && err.message.includes('does not exist')) {
      pass('Received room_error for non-existent room code');
    } else {
      fail(`Invalid room error failed: ${JSON.stringify(err)}`);
    }

    clientDave.disconnect();
  } catch (err) {
    fail(`Invalid room test error: ${err.message}`);
  }

  // ── Test 8: Host-Only update_settings ─────────────────────────────────────
  console.log('\nTest 8: Host-Only update_settings');
  try {
    // Connect Bob again so we have a non-host
    const clientBob2 = createClient(guestSessionId);
    await new Promise((resolve) => {
      clientBob2.on('room_joined', resolve);
      clientBob2.emit('join_room', {
        roomCode: testRoomCode,
        playerName: 'Bob',
        sessionId: guestSessionId,
      });
    });

    // Bob (non-host) tries to update settings -> should fail
    const bobForbiddenPromise = new Promise((resolve) => {
      clientBob2.on('room_error', resolve);
    });

    clientBob2.emit('update_settings', {
      settings: { rounds: 5 },
    });

    const forbiddenResult = await bobForbiddenPromise;
    if (forbiddenResult.message.includes('Only the room host')) {
      pass('Non-host (Bob) rejected from updating settings');
    } else {
      fail(`Expected host rejection, got: ${JSON.stringify(forbiddenResult)}`);
    }

    // Alice (host) updates settings -> should succeed and broadcast
    const settingsBroadcastPromise = new Promise((resolve) => {
      clientBob2.on('settings_updated', resolve);
    });

    clientAlice.emit('update_settings', {
      settings: { rounds: 4, drawTime: 60 },
    });

    const updated = await settingsBroadcastPromise;
    if (updated.settings.rounds === 4 && updated.settings.drawTime === 60) {
      pass('Host (Alice) successfully updated settings and broadcast to room');
    } else {
      fail(`Settings update mismatch: ${JSON.stringify(updated)}`);
    }

    // ── Test 8b: Guest explicitly leaves room (Host sees player_left immediately) ─
    console.log('\nTest 8b: Guest explicitly leaves room (Host receives player_left)');
    const aliceSawGuestLeavePromise = new Promise((resolve) => {
      clientAlice.once('player_left', resolve);
    });

    clientBob2.emit('leave_room', {
      roomCode: testRoomCode,
      sessionId: guestSessionId,
    });

    const guestLeaveData = await aliceSawGuestLeavePromise;
    if (
      guestLeaveData.playerId === guestSessionId &&
      guestLeaveData.players.length === 1 &&
      guestLeaveData.players[0].name === 'Alice' &&
      guestLeaveData.connectedPlayerCount === 1
    ) {
      pass('Guest explicitly left: Host immediately received player_left with updated player roster');
    } else {
      fail(`Host received invalid player_left payload: ${JSON.stringify(guestLeaveData)}`);
    }

    // ── Test 8c: Guest rejoins room after leaving (appears exactly once) ─────────
    console.log('\nTest 8c: Guest rejoins room after leaving');
    const aliceSawGuestRejoinPromise = new Promise((resolve) => {
      clientAlice.once('player_joined', resolve);
    });

    clientBob2.emit('join_room', {
      roomCode: testRoomCode,
      playerName: 'Bob',
      sessionId: guestSessionId,
    });

    const guestRejoinData = await aliceSawGuestRejoinPromise;
    if (
      guestRejoinData.players.length === 2 &&
      guestRejoinData.players.filter((p) => p.name === 'Bob').length === 1
    ) {
      pass('Guest cleanly rejoined after explicit leave: appears exactly once in room');
    } else {
      fail(`Guest rejoin failed or produced duplicate: ${JSON.stringify(guestRejoinData)}`);
    }

    clientBob2.disconnect();
  } catch (err) {
    fail(`Settings permission test error: ${err.message}`);
  }

  // ── Test 9: Host Transfer and Player Leave ─────────────────────────────────
  console.log('\nTest 9: Host Transfer on Host Exit');
  try {
    // Connect Bob fresh
    const clientBobFinal = createClient(guestSessionId);
    await new Promise((resolve) => {
      clientBobFinal.on('room_joined', resolve);
      clientBobFinal.emit('join_room', {
        roomCode: testRoomCode,
        playerName: 'Bob',
        sessionId: guestSessionId,
      });
    });

    const bobSawHostTransferPromise = new Promise((resolve) => {
      clientBobFinal.on('player_left', (data) => {
        if (data.newHostId === guestSessionId) {
          resolve(data);
        }
      });
    });

    // Alice explicitly leaves
    clientAlice.emit('leave_room');

    const leaveData = await bobSawHostTransferPromise;
    if (leaveData && leaveData.newHostId === guestSessionId) {
      pass('Alice left and host was successfully transferred to Bob');
    } else {
      fail(`Host transfer failed: ${JSON.stringify(leaveData)}`);
    }

    // ── Test 10: Room Cleanup when All Players Leave ────────────────────────
    console.log('\nTest 10: Room Cleanup When Empty');
    clientBobFinal.emit('leave_room');

    // Give server a moment to clean up
    await new Promise((r) => setTimeout(r, 200));

    if (!roomManager.hasRoom(testRoomCode)) {
      pass(`Room ${testRoomCode} was successfully deleted from memory`);
    } else {
      fail('Room was not deleted after all players left');
    }

    clientBobFinal.disconnect();
    clientAlice.disconnect();
  } catch (err) {
    fail(`Host transfer & cleanup test error: ${err.message}`);
  }

  // ── Teardown ──────────────────────────────────────────────────────────────
  httpServer.close();

  console.log('\n' + '═'.repeat(50));
  console.log(`\n📊 Phase 2 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 All Phase 2 tests passed! Ready for Phase 3.\n');
  } else {
    console.log('⚠️ Some Phase 2 tests failed. Review output above.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
