/**
 * test-connection.js
 *
 * Phase 1 integration test script.
 * Runs the server inline and tests:
 *   1. REST health endpoint returns 200 with correct JSON
 *   2. Socket.IO client can connect
 *   3. Ping/pong event works bidirectionally
 *
 * Run from: cd server && node test-connection.js
 */

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

const TEST_PORT = 4099;
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

async function runTests() {
  console.log('\n🧪 Phase 1 Integration Tests\n');
  console.log('─'.repeat(40));

  // ── Setup a test server ───────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*' }));

  // Load actual routes
  const roomRoutes = require('./routes/roomRoutes');
  app.use('/api', roomRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });

  const { initializeSocket } = require('./socket/index');
  initializeSocket(io);

  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log(`\n📡 Test server started on port ${TEST_PORT}\n`);

  // ── Test 1: Health endpoint ───────────────────────────────────────────────
  console.log('Test 1: GET /api/health');
  try {
    const healthData = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}/api/health`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 200) resolve({ status: res.statusCode, body: JSON.parse(body) });
          else reject(new Error(`Status ${res.statusCode}`));
        });
      }).on('error', reject);
    });

    if (healthData.status === 200)             pass(`HTTP status 200`);
    else                                       fail(`Expected 200, got ${healthData.status}`);

    if (healthData.body.status === 'ok')       pass(`Response has status: "ok"`);
    else                                       fail(`Missing status: "ok" in response`);

    if (healthData.body.message)               pass(`Response has message field`);
    else                                       fail(`Missing message field`);

    if (healthData.body.timestamp)             pass(`Response has timestamp field`);
    else                                       fail(`Missing timestamp field`);

  } catch (err) {
    fail(`Health endpoint error: ${err.message}`);
  }

  // ── Test 2: 404 for unknown routes ────────────────────────────────────────
  console.log('\nTest 2: GET /api/unknown → 404');
  try {
    const result = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}/api/unknown-route`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode }));
      }).on('error', reject);
    });
    if (result.status === 404) pass('Unknown route returns 404');
    else                       fail(`Expected 404, got ${result.status}`);
  } catch (err) {
    fail(`404 test error: ${err.message}`);
  }

  // ── Test 3: Socket.IO connection ─────────────────────────────────────────
  console.log('\nTest 3: Socket.IO WebSocket connection');
  const clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket'],
    autoConnect: false,
  });

  try {
    await new Promise((resolve, reject) => {
      clientSocket.on('connect', () => {
        pass(`Socket connected, id: ${clientSocket.id}`);
        resolve();
      });
      clientSocket.on('connect_error', (err) => reject(err));
      clientSocket.connect();
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  } catch (err) {
    fail(`Socket connection error: ${err.message}`);
  }

  // ── Test 4: Ping / Pong event ─────────────────────────────────────────────
  console.log('\nTest 4: Socket.IO ping_test → pong_test event');
  try {
    const pongData = await new Promise((resolve, reject) => {
      clientSocket.emit('ping_test', { message: 'test ping', time: Date.now() });
      clientSocket.on('pong_test', resolve);
      setTimeout(() => reject(new Error('Pong timeout')), 3000);
    });

    if (pongData.message === 'pong from server!')  pass(`Received correct pong message`);
    else                                            fail(`Wrong pong message: ${pongData.message}`);

    if (pongData.yourSocketId === clientSocket.id) pass(`Socket ID echoed correctly`);
    else                                            fail(`Socket ID mismatch`);

    if (pongData.serverTime)                        pass(`Server timestamp present`);
    else                                            fail(`Missing server timestamp`);

    if (pongData.received && pongData.received.message === 'test ping')
                                                    pass(`Original payload echoed back`);
    else                                            fail(`Payload not echoed back`);

  } catch (err) {
    fail(`Ping/pong error: ${err.message}`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  clientSocket.disconnect();
  httpServer.close();

  // ── Results ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(40));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 All Phase 1 tests passed! Ready for Phase 2.\n');
  } else {
    console.log('⚠️  Some tests failed. Fix before proceeding.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
