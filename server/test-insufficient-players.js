/**
 * test-insufficient-players.js
 *
 * Comprehensive Regression Test Suite for:
 * CRITICAL BUG FIX: GAME CONTINUES WITH ONE PLAYER
 *
 * Verifies all requirements and edge cases:
 * 1. Guesser leaves while drawer remains during active drawing turn.
 * 2. Drawer leaves while guesser remains during active drawing turn.
 * 3. A player leaves during word selection (selecting_word phase).
 * 4. A player leaves during the round-end results screen (round_ended phase).
 * 5. Transient disconnect & reconnect (refresh): grace period respected, game continues.
 * 6. Disconnect grace period expires without reconnect: room returns to lobby.
 * 7. Second player joins after room returns to lobby; new game starts cleanly.
 * 8. Multiple players leave nearly simultaneously (safe idempotent abort).
 * 9. Room becomes empty and is cleaned up from memory.
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

const roomManager = require('./game/RoomManager');
const roomRoutes = require('./routes/roomRoutes');
const { initializeSocket } = require('./socket/index');
const CONSTANTS = require('./config/constants');

const PORT = 4104;
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

async function runRegressionTests() {
  console.log('\n🧪 Running Insufficient Players & Disconnect Regression Test Suite...\n');

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', roomRoutes);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  initializeSocket(io);

  await new Promise((resolve) => server.listen(PORT, HOST, resolve));

  function createClient(sessionId) {
    return ioc(`http://${HOST}:${PORT}`, {
      transports: ['websocket'],
      auth: { playerSessionId: sessionId },
      forceNew: true,
    });
  }

  try {
    // ── Scenario 1: Guesser leaves during active drawing turn ────────────────
    console.log('Scenario 1: Guesser leaves while drawer remains during active drawing');
    {
      const cAlice = createClient('s1_alice');
      const cBob = createClient('s1_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's1_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's1_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's1_bob' });
        }),
      ]);

      // Start game: Alice receives word choices
      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choicesData = await choicesPromise;

      // Alice selects word -> drawing turn starts
      const roundStartPromise = new Promise((res) => cAlice.once('round_start', res));
      cAlice.emit('select_word', { word: choicesData.choices[0] });
      await roundStartPromise;

      if (room.game && room.game.roundStatus === 'drawing') {
        pass('Game is actively in drawing turn with 2 players');
      }

      // Guesser (Bob) explicitly leaves room
      const lobbyPromise = new Promise((res) => cAlice.once('returned_to_lobby', res));
      const leftPromise = new Promise((res) => cAlice.once('player_left', res));
      cBob.emit('leave_room', { roomCode, sessionId: 's1_bob' });

      const [lobbyData, leftData] = await Promise.all([lobbyPromise, leftPromise]);

      if (lobbyData.reason === 'insufficient_players') {
        pass('Drawer received returned_to_lobby with reason "insufficient_players"');
      } else {
        fail(`Expected reason "insufficient_players", got "${lobbyData.reason}"`);
      }

      if (room.status === 'waiting' && room.game === null) {
        pass('Room status returned to "waiting" and room.game was cleanly cleared');
      } else {
        fail(`Room state invalid: status=${room.status}, game=${room.game}`);
      }

      if (room.playerCount === 1 && room.players.has('s1_alice')) {
        pass('Remaining player (Alice) is kept in the room with 1 connected player');
      } else {
        fail(`Player count expected 1, got ${room.playerCount}`);
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 2: Drawer leaves while guesser remains during active drawing ──
    console.log('\nScenario 2: Drawer leaves while guesser remains during active drawing');
    {
      const cAlice = createClient('s2_alice');
      const cBob = createClient('s2_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's2_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's2_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's2_bob' });
        }),
      ]);

      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choicesData = await choicesPromise;

      const roundStartPromise = new Promise((res) => cBob.once('round_start', res));
      cAlice.emit('select_word', { word: choicesData.choices[0] });
      await roundStartPromise;

      // Drawer (Alice, host) explicitly leaves room
      const lobbyPromise = new Promise((res) => cBob.once('returned_to_lobby', res));
      const leftPromise = new Promise((res) => cBob.once('player_left', res));
      cAlice.emit('leave_room', { roomCode, sessionId: 's2_alice' });

      const [lobbyData, leftData] = await Promise.all([lobbyPromise, leftPromise]);

      if (lobbyData.reason === 'insufficient_players') {
        pass('Guesser received returned_to_lobby with reason "insufficient_players"');
      } else {
        fail(`Expected reason "insufficient_players", got "${lobbyData.reason}"`);
      }

      if (room.hostId === 's2_bob') {
        pass('Host ownership successfully transferred to remaining player (Bob)');
      } else {
        fail(`Expected host s2_bob, got ${room.hostId}`);
      }

      if (room.status === 'waiting') {
        pass('Room status safely in waiting lobby');
      } else {
        fail(`Expected waiting, got ${room.status}`);
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 3: Player leaves during word selection phase ────────────────
    console.log('\nScenario 3: Player leaves during word selection phase');
    {
      const cAlice = createClient('s3_alice');
      const cBob = createClient('s3_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's3_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's3_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's3_bob' });
        }),
      ]);

      // Start game: in selecting_word phase
      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      await choicesPromise;

      if (room.game && room.game.roundStatus === 'selecting_word') {
        pass('Game is in selecting_word phase');
      }

      // Guesser leaves during word selection
      const lobbyPromise = new Promise((res) => cAlice.once('returned_to_lobby', res));
      cBob.emit('leave_room', { roomCode, sessionId: 's3_bob' });
      const lobbyData = await lobbyPromise;

      if (lobbyData.reason === 'insufficient_players') {
        pass('Drawer received returned_to_lobby during word selection phase');
      } else {
        fail(`Expected insufficient_players, got ${lobbyData.reason}`);
      }

      if (room.game === null && room.status === 'waiting') {
        pass('Word selection timeout and game instance safely cleared');
      } else {
        fail('Game was not reset after leave during word selection');
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 4: Player leaves during round-end results screen ────────────
    console.log('\nScenario 4: Player leaves during round-end results phase');
    {
      const cAlice = createClient('s4_alice');
      const cBob = createClient('s4_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's4_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's4_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's4_bob' });
        }),
      ]);

      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choicesData = await choicesPromise;

      const roundEndPromise = new Promise((res) => cAlice.once('round_end', res));
      cAlice.emit('select_word', { word: choicesData.choices[0] });

      // Bob guesses correctly to trigger round_end early
      cBob.emit('submit_guess', { guess: choicesData.choices[0] });
      await roundEndPromise;

      if (room.game && room.game.roundStatus === 'round_ended') {
        pass('Game is in round_ended phase (showing results modal)');
      }

      // Bob leaves during round_ended
      const lobbyPromise = new Promise((res) => cAlice.once('returned_to_lobby', res));
      cBob.emit('leave_room', { roomCode, sessionId: 's4_bob' });
      const lobbyData = await lobbyPromise;

      if (lobbyData.reason === 'insufficient_players') {
        pass('Returned to lobby safely when player leaves during round_end delay');
      } else {
        fail(`Expected insufficient_players, got ${lobbyData.reason}`);
      }

      if (room.status === 'waiting' && room.game === null) {
        pass('Round-end timeout cancelled and room returned to lobby');
      } else {
        fail('Room did not cleanly return to waiting');
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 5: Transient disconnect and reconnect (refresh) ────────────
    console.log('\nScenario 5: Transient disconnect & reconnect (refresh)');
    {
      const cAlice = createClient('s5_alice');
      let cBob = createClient('s5_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's5_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's5_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's5_bob' });
        }),
      ]);

      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choicesData = await choicesPromise;

      const roundStartPromise = new Promise((res) => cAlice.once('round_start', res));
      cAlice.emit('select_word', { word: choicesData.choices[0] });
      await roundStartPromise;

      // Bob simulates page refresh (brief socket disconnect)
      let returnedToLobbyTriggered = false;
      cAlice.once('returned_to_lobby', () => {
        returnedToLobbyTriggered = true;
      });

      cBob.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      if (room.game && room.game.roundStatus === 'drawing' && !returnedToLobbyTriggered) {
        pass('Transient disconnect did NOT abort the active game (grace period active)');
      } else {
        fail('Game was prematurely aborted on transient disconnect');
      }

      // Bob reconnects with same sessionId
      cBob = createClient('s5_bob');
      const reconnectPromise = new Promise((res) => cBob.once('room_joined', res));
      cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's5_bob' });
      const joinData = await reconnectPromise;

      if (joinData.isReconnect === true && room.connectedPlayerCount === 2) {
        pass('Bob successfully reconnected within grace period; game remains intact');
      } else {
        fail('Bob reconnect failed');
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 6: Disconnect grace period expiry without reconnect ─────────
    console.log('\nScenario 6: Disconnect grace period expires without reconnect');
    {
      const cAlice = createClient('s6_alice');
      const cBob = createClient('s6_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's6_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's6_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's6_bob' });
        }),
      ]);

      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choicesData = await choicesPromise;

      const roundStartPromise = new Promise((res) => cAlice.once('round_start', res));
      cAlice.emit('select_word', { word: choicesData.choices[0] });
      await roundStartPromise;

      // Bob disconnects and does not return
      const lobbyPromise = new Promise((res) => cAlice.once('returned_to_lobby', res));
      cBob.disconnect();

      // For test speed, manually trigger the reconnect timer callback or simulate timeout
      const bobPlayer = room.getPlayerBySessionId('s6_bob');
      if (bobPlayer && bobPlayer._reconnectTimer) {
        clearTimeout(bobPlayer._reconnectTimer);
        // Force grace period expiration callback
        roomManager.permanentlyRemovePlayer(roomCode, 's6_bob', ({ removedPlayerId }) => {
          io.to(roomCode).emit('player_left', {
            playerId: removedPlayerId,
            players: Array.from(room.players.values()).map((p) => p.toPublic()),
          });
        });
      }

      const lobbyData = await lobbyPromise;

      if (lobbyData.reason === 'insufficient_players') {
        pass('Room returned to lobby after disconnect grace period expired');
      } else {
        fail(`Expected insufficient_players, got ${lobbyData.reason}`);
      }

      cAlice.disconnect();
    }

    // ── Scenario 7: Second player joins after return to lobby; new game starts ──
    console.log('\nScenario 7: Second player joins after return to lobby; new game starts cleanly');
    {
      const cAlice = createClient('s7_alice');
      const cBob = createClient('s7_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's7_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's7_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's7_bob' });
        }),
      ]);

      // Start first game
      const choicesPromise1 = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choices1 = await choicesPromise1;

      const roundStart1 = new Promise((res) => cAlice.once('round_start', res));
      cAlice.emit('select_word', { word: choices1.choices[0] });
      await roundStart1;

      // Bob leaves -> game aborts back to lobby
      const lobbyPromise = new Promise((res) => cAlice.once('returned_to_lobby', res));
      cBob.emit('leave_room', { roomCode, sessionId: 's7_bob' });
      await lobbyPromise;

      cBob.disconnect();

      if (room.status === 'waiting') {
        pass('Room is waiting in lobby with 1 player (Alice)');
      }

      // Charlie joins the room
      const cCharlie = createClient('s7_charlie');
      const joinPromise = new Promise((res) => cCharlie.once('room_joined', res));
      cCharlie.emit('join_room', { roomCode, playerName: 'Charlie', sessionId: 's7_charlie' });
      await joinPromise;

      if (room.connectedPlayerCount === 2) {
        pass('Charlie joined; room now has 2 connected players');
      }

      // Alice (host) starts a new game with Charlie
      const choicesPromise2 = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choices2 = await choicesPromise2;

      if (choices2.choices && choices2.choices.length === 3) {
        pass('Alice successfully started a new game with Charlie (word choices received)');
      } else {
        fail('New game start failed');
      }

      cAlice.disconnect();
      cCharlie.disconnect();
    }

    // ── Scenario 8: Multiple players leave nearly simultaneously ─────────────
    console.log('\nScenario 8: Multiple players leave nearly simultaneously');
    {
      const cAlice = createClient('s8_alice');
      const cBob = createClient('s8_bob');
      const cCharlie = createClient('s8_charlie');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's8_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's8_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's8_bob' });
        }),
        new Promise((res) => {
          cCharlie.once('room_joined', res);
          cCharlie.emit('join_room', { roomCode, playerName: 'Charlie', sessionId: 's8_charlie' });
        }),
      ]);

      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choices = await choicesPromise;

      const roundStart = new Promise((res) => cAlice.once('round_start', res));
      cAlice.emit('select_word', { word: choices.choices[0] });
      await roundStart;

      // Bob and Charlie both leave nearly simultaneously
      cBob.emit('leave_room', { roomCode, sessionId: 's8_bob' });
      cCharlie.emit('leave_room', { roomCode, sessionId: 's8_charlie' });

      await new Promise((r) => setTimeout(r, 200));

      if (room.status === 'waiting' && room.playerCount === 1) {
        pass('Multiple rapid leaves handled safely without double-abort crash or corrupted state');
      } else {
        fail(`Multi-leave state error: status=${room.status}, count=${room.playerCount}`);
      }

      cAlice.disconnect();
      cBob.disconnect();
      cCharlie.disconnect();
    }

    // ── Scenario 9: Room becomes empty ───────────────────────────────────────
    console.log('\nScenario 9: Room becomes completely empty');
    {
      const cAlice = createClient('s9_alice');
      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's9_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await new Promise((res) => {
        cAlice.once('room_joined', res);
        cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's9_alice' });
      });

      cAlice.emit('leave_room', { roomCode, sessionId: 's9_alice' });
      await new Promise((r) => setTimeout(r, 100));

      if (!roomManager.getRoom(roomCode)) {
        pass('Empty room safely deleted from memory');
      } else {
        fail('Empty room was not cleaned up');
      }

      cAlice.disconnect();
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`\n📊 Regression Test Results: ${passed} passed, ${failed} failed\n`);

    if (failed === 0) {
      console.log('🎉 All Insufficient Players Regression Tests passed successfully!\n');
      process.exit(0);
    }
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests().catch((err) => {
  console.error('Regression tests failed with error:', err);
  process.exit(1);
});
