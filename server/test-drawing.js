/**
 * test-drawing.js
 *
 * Phase 4 Real-Time Drawing Canvas Automated Test Suite.
 *
 * Verifies:
 * 1. DrawingManager unit behavior (coordinate validation, limits, stroke lifecycle, undo, clear).
 * 2. Active drawer authorization (drawer can draw).
 * 3. Non-drawer rejection (guesser cannot draw).
 * 4. Rejection of drawing outside an active drawing round.
 * 5. Stroke flow: draw_start, draw_move, draw_end.
 * 6. Same-room broadcast delivery to guessers.
 * 7. Room isolation: players in other rooms do NOT receive drawing events.
 * 8. Undo functionality (removes latest complete stroke and synchronizes).
 * 9. Clear canvas functionality (clears all strokes and synchronizes).
 * 10. History synchronization on request and for new/reconnecting players.
 * 11. Coordinate and brush size bounds validation.
 * 12. Safe handling of drawer disconnection during an unfinished stroke.
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
const DrawingManager = require('./game/DrawingManager');
const CONSTANTS = require('./config/constants');

const TEST_PORT = 4102;
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

function createClient(sessionId) {
  return ioc(`http://${HOST}:${TEST_PORT}`, {
    transports: ['websocket'],
    auth: { playerSessionId: sessionId },
    forceNew: true,
  });
}

async function runTests() {
  console.log('\n🧪 Phase 4 Real-Time Drawing Canvas Test Suite\n');
  console.log('═'.repeat(60));

  // ──────────────────────────────────────────────────────────────────────────
  // ── Part 1: DrawingManager Unit Tests ─────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Part 1: DrawingManager Unit Tests ---');
  const dm = new DrawingManager();

  // Test 1.1: Coordinate validation
  if (
    DrawingManager.isValidPoint({ x: 0, y: 0 }) &&
    DrawingManager.isValidPoint({ x: 800, y: 600 }) &&
    DrawingManager.isValidPoint({ x: 400, y: 300 })
  ) {
    pass('Valid coordinates within bounds (0..800, 0..600) accepted');
  } else {
    fail('Valid coordinates rejected');
  }

  if (
    !DrawingManager.isValidPoint({ x: -1, y: 100 }) &&
    !DrawingManager.isValidPoint({ x: 801, y: 100 }) &&
    !DrawingManager.isValidPoint({ x: 100, y: 601 }) &&
    !DrawingManager.isValidPoint({ x: NaN, y: 50 }) &&
    !DrawingManager.isValidPoint(null)
  ) {
    pass('Invalid, out-of-bound, and NaN coordinates rejected');
  } else {
    fail('Invalid coordinates were incorrectly accepted');
  }

  // Test 1.2: Stroke start, add points, end stroke
  const stroke = dm.startStroke({
    strokeId: 'strk_unit_1',
    sessionId: 'user_1',
    color: '#ff0000',
    brushSize: 8,
    tool: 'brush',
    point: { x: 50, y: 50 },
  });

  if (stroke.strokeId === 'strk_unit_1' && stroke.brushSize === 8 && stroke.points.length === 1) {
    pass('Stroke started correctly with initial coordinate');
  } else {
    fail(`Stroke initialization mismatch: ${JSON.stringify(stroke)}`);
  }

  const addedPts = dm.addPoints('strk_unit_1', [
    { x: 55, y: 55 },
    { x: 60, y: 60 },
    { x: 9999, y: 9999 }, // out of bounds, should be skipped
  ]);

  if (addedPts.length === 2 && dm.currentStroke.points.length === 3) {
    pass('Valid points appended and invalid points filtered');
  } else {
    fail(`Points append mismatch: ${JSON.stringify(addedPts)}`);
  }

  const finishedStroke = dm.endStroke('strk_unit_1');
  if (finishedStroke && dm.strokes.length === 1 && dm.currentStroke === null) {
    pass('Stroke ended and committed to stroke history');
  } else {
    fail('Failed to commit stroke to history');
  }

  // Test 1.3: Undo stroke
  const undone = dm.undo();
  if (undone && undone.strokeId === 'strk_unit_1' && dm.strokes.length === 0) {
    pass('Undo successfully popped most recent complete stroke');
  } else {
    fail('Undo operation failed');
  }

  // Test 1.4: Clear strokes
  dm.startStroke({ strokeId: 's1', sessionId: 'u1', point: { x: 10, y: 10 } });
  dm.endStroke('s1');
  dm.startStroke({ strokeId: 's2', sessionId: 'u1', point: { x: 20, y: 20 } });
  dm.endStroke('s2');
  if (dm.getHistory().length === 2) {
    dm.clear();
    if (dm.getHistory().length === 0 && dm.currentStroke === null) {
      pass('Clear successfully wiped all strokes and reset current stroke');
    } else {
      fail('Clear canvas failed');
    }
  }

  // Test 1.5: Disconnect during unfinished stroke
  dm.startStroke({ strokeId: 's3', sessionId: 'disconnect_user', point: { x: 30, y: 30 } });
  dm.addPoints('s3', [{ x: 35, y: 35 }]);
  dm.handleDisconnect('disconnect_user');
  if (dm.currentStroke === null && dm.strokes.length === 1) {
    pass('Disconnect during unfinished stroke handled safely without data corruption');
  } else {
    fail('Disconnect handling failed');
  }
  dm.reset();

  // ──────────────────────────────────────────────────────────────────────────
  // ── Part 2: Socket.IO Drawing & Authorization Integration Tests ───────────
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Part 2: Socket.IO Drawing Integration Tests ---');

  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*' }));
  app.use('/api', roomRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  initializeSocket(io);

  await new Promise((resolve) => httpServer.listen(TEST_PORT, HOST, resolve));
  console.log(`📡 Drawing test server running on http://${HOST}:${TEST_PORT}\n`);

  // Room 1: Alice (Host/Drawer), Bob (Guesser)
  const aliceSession = 'alice_draw_sess';
  const bobSession = 'bob_guess_sess';
  const { roomCode: roomCode1, room: room1 } = roomManager.createRoom({
    hostName: 'Alice',
    sessionId: aliceSession,
    settings: { rounds: 2, drawTime: 80, wordCount: 3 },
  });

  // Room 2: Charlie (Isolation check)
  const charlieSession = 'charlie_iso_sess';
  const { roomCode: roomCode2 } = roomManager.createRoom({
    hostName: 'Charlie',
    sessionId: charlieSession,
    settings: { rounds: 2, drawTime: 80, wordCount: 3 },
  });

  const clientAlice = createClient(aliceSession);
  const clientBob = createClient(bobSession);
  const clientCharlie = createClient(charlieSession);

  try {
    // ── Setup: Connect players ──────────────────────────────────────────────
    await new Promise((resolve) => {
      clientAlice.on('room_joined', resolve);
      clientAlice.emit('join_room', {
        roomCode: roomCode1,
        playerName: 'Alice',
        sessionId: aliceSession,
      });
    });

    await new Promise((resolve) => {
      clientBob.on('room_joined', resolve);
      clientBob.emit('join_room', {
        roomCode: roomCode1,
        playerName: 'Bob',
        sessionId: bobSession,
      });
    });

    await new Promise((resolve) => {
      clientCharlie.on('room_joined', resolve);
      clientCharlie.emit('join_room', {
        roomCode: roomCode2,
        playerName: 'Charlie',
        sessionId: charlieSession,
      });
    });

    // ── Test 2.1: Drawing outside active round is rejected ───────────────────
    console.log('\nTest 2.1: Drawing outside active round is rejected');
    const outsideRoundPromise = new Promise((resolve) => {
      clientAlice.once('drawing_error', resolve);
    });

    clientAlice.emit('draw_start', {
      strokeId: 'early_stroke',
      point: { x: 100, y: 100 },
    });

    const outsideErr = await outsideRoundPromise;
    if (outsideErr.message.includes('No active game')) {
      pass('Rejected drawing before game is started ("No active game in this room")');
    } else {
      fail(`Unexpected error for early drawing: ${JSON.stringify(outsideErr)}`);
    }

    // ── Start game in Room 1 (enters 'selecting_word' phase) ─────────────────
    const aliceChoicesPromise = new Promise((resolve) => {
      clientAlice.once('word_choices', resolve);
    });
    clientAlice.emit('start_game');
    const choicesData = await aliceChoicesPromise;

    // Test drawing while in 'selecting_word' phase (before drawer selects word)
    const selectingPhasePromise = new Promise((resolve) => {
      clientAlice.once('drawing_error', resolve);
    });
    clientAlice.emit('draw_start', {
      strokeId: 'selecting_phase_stroke',
      point: { x: 100, y: 100 },
    });
    const selectingErr = await selectingPhasePromise;
    if (selectingErr.message.includes('Drawing is only allowed during an active drawing round')) {
      pass('Rejected drawing during word selection phase ("Drawing is only allowed during an active drawing round")');
    } else {
      fail(`Expected selecting phase rejection, got: ${JSON.stringify(selectingErr)}`);
    }

    // Select word to enter 'drawing' phase
    const roundStartPromise = new Promise((resolve) => {
      clientAlice.once('round_start', resolve);
    });
    clientAlice.emit('select_word', { word: choicesData.choices[0] });
    await roundStartPromise;

    // Room 1 is now in active 'drawing' round! Alice is drawer, Bob is guesser.

    // ── Test 2.2: Non-drawer drawing is rejected ────────────────────────────
    console.log('\nTest 2.2: Non-drawer drawing is rejected');
    const bobRejectedPromise = new Promise((resolve) => {
      clientBob.once('drawing_error', resolve);
    });

    clientBob.emit('draw_start', {
      strokeId: 'bob_illegal_stroke',
      point: { x: 100, y: 100 },
    });

    const bobErr = await bobRejectedPromise;
    if (bobErr.message.includes('Only the active drawer can draw')) {
      pass('Guesser (Bob) was rejected from drawing with "Only the active drawer can draw"');
    } else {
      fail(`Expected non-drawer error, got: ${JSON.stringify(bobErr)}`);
    }

    // ── Test 2.3: Active drawer can draw; Bob receives; Charlie does not ───
    console.log('\nTest 2.3: Active drawer stroke broadcasting and room isolation');
    let charlieReceivedStroke = false;
    clientCharlie.on('draw_start', () => {
      charlieReceivedStroke = true;
    });

    const bobSawStartPromise = new Promise((resolve) => {
      clientBob.once('draw_start', resolve);
    });

    const testStrokeId = 'alice_stroke_101';
    clientAlice.emit('draw_start', {
      strokeId: testStrokeId,
      color: '#1976d2',
      brushSize: 6,
      tool: 'brush',
      point: { x: 120, y: 150 },
    });

    const bobStartData = await bobSawStartPromise;
    if (
      bobStartData.strokeId === testStrokeId &&
      bobStartData.color === '#1976d2' &&
      bobStartData.brushSize === 6 &&
      (bobStartData.point || (bobStartData.points && bobStartData.points[0]))
    ) {
      pass('Guesser (Bob) in the same room received draw_start broadcast with valid start point');
    } else {
      fail(`Bob received invalid stroke data: ${JSON.stringify(bobStartData)}`);
    }

    // Test draw_move (verify both points array and single point for frontend rendering)
    const bobSawMovePromise = new Promise((resolve) => {
      clientBob.once('draw_move', resolve);
    });

    clientAlice.emit('draw_move', {
      strokeId: testStrokeId,
      points: [
        { x: 125, y: 155 },
        { x: 130, y: 160 },
      ],
    });

    const bobMoveData = await bobSawMovePromise;
    if (
      bobMoveData.strokeId === testStrokeId &&
      Array.isArray(bobMoveData.points) &&
      bobMoveData.points.length === 2 &&
      bobMoveData.point &&
      bobMoveData.point.x === 130
    ) {
      pass('Guesser (Bob) received draw_move updates with both points batch and latest point');
    } else {
      fail(`Bob received invalid move data: ${JSON.stringify(bobMoveData)}`);
    }

    // Test draw_end
    const bobSawEndPromise = new Promise((resolve) => {
      clientBob.once('draw_end', resolve);
    });

    clientAlice.emit('draw_end', { strokeId: testStrokeId });
    const bobEndData = await bobSawEndPromise;

    if (bobEndData.strokeId === testStrokeId) {
      pass('Guesser (Bob) received draw_end confirmation');
    } else {
      fail(`Bob received invalid end data: ${JSON.stringify(bobEndData)}`);
    }

    await new Promise((r) => setTimeout(r, 100));
    if (!charlieReceivedStroke) {
      pass('Room isolation verified: Charlie in Room 2 did NOT receive Room 1 drawing events');
    } else {
      fail('Room isolation failed: Charlie received drawing event from another room');
    }

    // ── Test 2.3b: Frontend DrawingCanvas remote stroke rendering emulation ─
    console.log('\nTest 2.3b: Remote DrawingCanvas real-time stroke stream emulation');
    // Emulate frontend DrawingCanvas state on Bob's client
    let emulatedRemoteStroke = null;
    let emulatedSegmentsDrawn = 0;
    let emulatedNanPoints = 0;

    const onStart = (data) => {
      const initialPoint = data.point || (Array.isArray(data.points) && data.points[0]);
      if (!initialPoint) {
        emulatedNanPoints++;
        return;
      }
      emulatedRemoteStroke = {
        strokeId: data.strokeId,
        points: [initialPoint],
      };
    };

    const onMove = (data) => {
      if (!emulatedRemoteStroke || emulatedRemoteStroke.strokeId !== data.strokeId) return;
      const pts = emulatedRemoteStroke.points;
      const newPoints = Array.isArray(data.points) ? data.points : data.point ? [data.point] : [];
      for (const pt of newPoints) {
        if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number' || isNaN(pt.x) || isNaN(pt.y)) {
          emulatedNanPoints++;
          continue;
        }
        const lastPoint = pts[pts.length - 1];
        pts.push(pt);
        if (lastPoint && !isNaN(lastPoint.x) && !isNaN(pt.x)) {
          emulatedSegmentsDrawn++;
        }
      }
    };

    clientBob.on('draw_start', onStart);
    clientBob.on('draw_move', onMove);

    const continuousStrokeId = 'stream_stroke_202';
    clientAlice.emit('draw_start', {
      strokeId: continuousStrokeId,
      color: '#ff5722',
      brushSize: 4,
      tool: 'brush',
      point: { x: 200, y: 200 },
    });

    await new Promise((r) => setTimeout(r, 50));

    for (let i = 1; i <= 5; i++) {
      clientAlice.emit('draw_move', {
        strokeId: continuousStrokeId,
        point: { x: 200 + i * 10, y: 200 + i * 10 },
      });
      await new Promise((r) => setTimeout(r, 20));
    }

    const bobSawEnd2Promise = new Promise((resolve) => clientBob.once('draw_end', resolve));
    clientAlice.emit('draw_end', { strokeId: continuousStrokeId });
    await bobSawEnd2Promise;

    clientBob.off('draw_start', onStart);
    clientBob.off('draw_move', onMove);

    if (
      emulatedNanPoints === 0 &&
      emulatedSegmentsDrawn === 5 &&
      emulatedRemoteStroke &&
      emulatedRemoteStroke.points.length === 6
    ) {
      pass(`Remote client successfully accumulated and rendered all ${emulatedSegmentsDrawn} stroke segments in real time without undefined/NaN`);
    } else {
      fail(`Remote emulation failed: drawn=${emulatedSegmentsDrawn}, NaN=${emulatedNanPoints}, totalPts=${emulatedRemoteStroke?.points?.length}`);
    }

    // Clean up test stroke so subsequent undo tests maintain expected stroke counts
    const undoCleanupPromise = new Promise((resolve) => clientBob.once('drawing_undone', resolve));
    clientAlice.emit('undo_drawing');
    await undoCleanupPromise;

    // ── Test 2.4: Invalid coordinates and brush sizes rejected ──────────────
    console.log('\nTest 2.4: Invalid coordinates and brush sizes validation');
    const invalidCoordPromise = new Promise((resolve) => {
      clientAlice.once('drawing_error', resolve);
    });

    clientAlice.emit('draw_start', {
      strokeId: 'invalid_stroke',
      point: { x: -500, y: 9999 }, // Out of bounds
    });

    const coordErr = await invalidCoordPromise;
    if (coordErr.message.includes('Invalid starting point coordinates')) {
      pass('Out-of-bounds coordinates rejected with drawing_error');
    } else {
      fail(`Invalid coordinates not rejected: ${JSON.stringify(coordErr)}`);
    }

    // ── Test 2.5: Undo drawing ──────────────────────────────────────────────
    console.log('\nTest 2.5: Undo drawing synchronization');
    // Draw a second stroke so we have 2 complete strokes
    clientAlice.emit('draw_start', {
      strokeId: 'alice_stroke_102',
      color: '#388e3c',
      brushSize: 4,
      tool: 'brush',
      point: { x: 200, y: 200 },
    });
    clientAlice.emit('draw_end', { strokeId: 'alice_stroke_102' });

    await new Promise((r) => setTimeout(r, 150));

    // Verify 2 strokes exist
    if (room1.game.drawingManager.strokes.length === 2) {
      pass('Server history accurately holds 2 completed strokes');
    }

    const bobSawUndoPromise = new Promise((resolve) => {
      clientBob.once('drawing_undone', resolve);
    });

    clientAlice.emit('undo_drawing');
    const undoData = await bobSawUndoPromise;

    if (undoData.strokeId === 'alice_stroke_102' && undoData.remainingStrokes === 1) {
      pass('Undo broadcast received by room with undone strokeId and remaining count');
    } else {
      fail(`Undo broadcast invalid: ${JSON.stringify(undoData)}`);
    }

    if (room1.game.drawingManager.strokes.length === 1) {
      pass('Server stroke history successfully decremented to 1');
    }

    // ── Test 2.6: Clear canvas ──────────────────────────────────────────────
    console.log('\nTest 2.6: Clear canvas synchronization');
    const bobSawClearPromise = new Promise((resolve) => {
      clientBob.once('canvas_cleared', resolve);
    });

    clientAlice.emit('clear_canvas');
    await bobSawClearPromise;

    if (room1.game.drawingManager.strokes.length === 0) {
      pass('Clear canvas wiped all server strokes and broadcast canvas_cleared to room');
    } else {
      fail('Clear canvas failed to empty server history');
    }

    // ── Test 2.7: Drawing history sync for reconnecting player ─────────────
    console.log('\nTest 2.7: Drawing history synchronization on reconnect & request');
    // Draw a new stroke in Room 1
    clientAlice.emit('draw_start', {
      strokeId: 'stroke_for_history',
      color: '#f57c00',
      brushSize: 5,
      tool: 'brush',
      point: { x: 300, y: 300 },
    });
    clientAlice.emit('draw_end', { strokeId: 'stroke_for_history' });

    await new Promise((r) => setTimeout(r, 150));

    // Bob disconnects and reconnects with the SAME bobSession (browser refresh)
    clientBob.disconnect();
    const clientBobReconnected = createClient(bobSession);

    const reconnectHistoryPromise = new Promise((resolve) => {
      clientBobReconnected.once('drawing_history', resolve);
    });

    clientBobReconnected.emit('join_room', {
      roomCode: roomCode1,
      playerName: 'Bob',
      sessionId: bobSession,
    });

    const historyData = await reconnectHistoryPromise;
    if (
      historyData &&
      Array.isArray(historyData.strokes) &&
      historyData.strokes.length === 1 &&
      historyData.strokes[0].strokeId === 'stroke_for_history'
    ) {
      pass('Reconnecting player received complete drawing history upon rejoining');
    } else {
      fail(`History payload invalid on reconnect: ${JSON.stringify(historyData)}`);
    }

    // Also test explicit get_drawing_history request
    const manualHistoryPromise = new Promise((resolve) => {
      clientBobReconnected.once('drawing_history', resolve);
    });
    clientBobReconnected.emit('get_drawing_history');
    const manualHistoryData = await manualHistoryPromise;

    if (manualHistoryData.strokes && manualHistoryData.strokes.length === 1) {
      pass('Explicit get_drawing_history request returned valid history');
    } else {
      fail('Explicit get_drawing_history failed');
    }

    // ── Test 2.8: Drawer disconnect during unfinished stroke ────────────────
    console.log('\nTest 2.8: Safe handling of drawer disconnect during open stroke');
    // Alice starts a stroke and disconnects before calling draw_end
    clientAlice.emit('draw_start', {
      strokeId: 'stroke_before_crash',
      color: '#000000',
      brushSize: 3,
      tool: 'brush',
      point: { x: 50, y: 50 },
    });
    clientAlice.emit('draw_move', {
      strokeId: 'stroke_before_crash',
      points: [{ x: 55, y: 55 }],
    });

    await new Promise((r) => setTimeout(r, 50));
    // Disconnect Alice abruptly
    clientAlice.disconnect();

    await new Promise((r) => setTimeout(r, 200));

    // Verify server did not crash and currentStroke was finalized safely
    if (room1.game.drawingManager.currentStroke === null) {
      pass('Disconnect during unfinished stroke handled safely without orphan state');
    } else {
      fail('currentStroke was not cleared after disconnect');
    }

    // Teardown clients
    clientBobReconnected.disconnect();
    clientCharlie.disconnect();
  } catch (err) {
    fail(`Drawing integration test error: ${err.message}`);
  } finally {
    httpServer.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ── Results Summary ───────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Phase 4 Test Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 All Phase 4 Drawing Canvas tests passed successfully!\n');
    process.exit(0);
  } else {
    console.error('⚠️ Some tests failed. Please inspect logs above.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
