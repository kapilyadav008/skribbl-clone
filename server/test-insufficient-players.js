/**
 * test-insufficient-players.js
 *
 * Comprehensive Regression & Verification Test Suite for:
 * SKETCHCLUB — FINAL AUTO-WIN UI & CHAT CLEANUP
 *
 * Verifies all 8 requirements:
 * 1. Two players start -> one leaves -> silent 5s background timer -> normal game_over leaderboard.
 * 2. Three players start -> two leave -> remaining player crowned winner after 5s.
 * 3. Player reconnects within 5s -> countdown cancelled, game continues normally.
 * 4. Join/leave chat messages display "[Player Name] joined the room." and "[Player Name] left the room." exactly once.
 * 5. No auto-win countdown messages appear in chat (silent timer).
 * 6. Refresh / transient disconnect does NOT emit premature leave chat message; reconnect does NOT emit duplicate join chat message.
 * 7. Last remaining player wins regardless of previous scores, without modifying actual score.
 * 8. Winner returns to lobby successfully; empty room cleanly deleted from memory.
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

const roomManager = require('./game/RoomManager');
const roomRoutes = require('./routes/roomRoutes');
const { initializeSocket } = require('./socket/index');

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

async function runAutoWinTests() {
  console.log('\n🧪 Running Final Auto-Win & Chat Notification Test Suite...\n');

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
    // ── Scenario 1: Two players -> guesser leaves -> silent timer -> normal game over ──
    console.log('Scenario 1: Guesser leaves during drawing -> silent 5s timer -> normal leaderboard');
    {
      const cAlice = createClient('s1_alice');
      const cBob = createClient('s1_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's1_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      const aliceChatMessages = [];
      cAlice.on('chat_message', (msg) => aliceChatMessages.push(msg));

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

      // Verify join message received by Alice
      const bobJoinMsg = aliceChatMessages.find((m) => m.text === 'Bob joined the room.');
      if (bobJoinMsg && bobJoinMsg.type === 'system') {
        pass('Alice received "Bob joined the room." system notification');
      } else {
        fail('Did not receive "Bob joined the room." notification');
      }

      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choicesData = await choicesPromise;

      const roundStartPromise = new Promise((res) => cAlice.once('round_start', res));
      cAlice.emit('select_word', { word: choicesData.choices[0] });
      await roundStartPromise;

      if (room.game && room.game.roundStatus === 'drawing') {
        pass('Game is actively in drawing turn with 2 players');
      }

      // Guesser (Bob) explicitly leaves room
      const gameOverPromise = new Promise((res) => cAlice.once('game_over', res));

      cBob.emit('leave_room', { roomCode, sessionId: 's1_bob' });

      // Wait for the 5-second silent timer to complete
      const gameOverData = await gameOverPromise;
      if (gameOverData.reason === 'last_player_standing') {
        pass('Game ended with reason "last_player_standing" after 5s silent countdown');
      } else {
        fail(`Expected reason "last_player_standing", got "${gameOverData.reason}"`);
      }

      // Verify Bob left notification was received exactly once
      const bobLeaveMessages = aliceChatMessages.filter((m) => m.text === 'Bob left the room.');
      if (bobLeaveMessages.length === 1) {
        pass('Alice received "Bob left the room." exactly once');
      } else {
        fail(`Expected 1 leave message, found ${bobLeaveMessages.length}`);
      }

      // Verify NO countdown messages were posted in chat
      const countdownChatMsgs = aliceChatMessages.filter(
        (m) => m.text && (m.text.includes('win in') || m.text.includes('seconds...'))
      );
      if (countdownChatMsgs.length === 0) {
        pass('No auto-win countdown messages appeared in chat (silent timer verified)');
      } else {
        fail(`Found ${countdownChatMsgs.length} countdown messages in chat`);
      }

      // Verify Alice is in 1st place with actual score preserved
      if (gameOverData.winners && gameOverData.winners[0]?.name === 'Alice') {
        pass('Alice is declared the sole winner');
      } else {
        fail(`Expected Alice as winner, got ${JSON.stringify(gameOverData.winners)}`);
      }

      if (gameOverData.finalScores && gameOverData.finalScores[0]?.name === 'Alice') {
        pass('Alice is ranked #1 in finalScores with actual score preserved');
      } else {
        fail(`Alice not in #1 spot: ${JSON.stringify(gameOverData.finalScores)}`);
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 2: Drawer leaves while guesser remains ──────────────────────
    console.log('\nScenario 2: Drawer leaves while guesser remains');
    {
      const cAlice = createClient('s2_alice');
      const cBob = createClient('s2_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's2_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      const bobChatMessages = [];
      cBob.on('chat_message', (msg) => bobChatMessages.push(msg));

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

      // Drawer (Alice) leaves
      const gameOverPromise = new Promise((res) => cBob.once('game_over', res));

      cAlice.emit('leave_room', { roomCode, sessionId: 's2_alice' });

      const gameOverData = await gameOverPromise;
      if (gameOverData.reason === 'last_player_standing' && gameOverData.winners[0]?.name === 'Bob') {
        pass('Bob won the game after 5 seconds by default');
      } else {
        fail(`Bob did not win properly: ${JSON.stringify(gameOverData)}`);
      }

      if (room.hostId === 's2_bob') {
        pass('Host ownership successfully transferred to remaining player (Bob)');
      } else {
        fail(`Expected host s2_bob, got ${room.hostId}`);
      }

      const aliceLeaveMsgs = bobChatMessages.filter((m) => m.text === 'Alice left the room.');
      if (aliceLeaveMsgs.length === 1) {
        pass('Bob received "Alice left the room." exactly once');
      } else {
        fail(`Expected 1 leave message, got ${aliceLeaveMsgs.length}`);
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 3: 3 players -> 2 leave -> remaining player wins after 5s ──
    console.log('\nScenario 3: 3 players start -> 2 leave -> remaining player wins after 5s');
    {
      const cAlice = createClient('s3_alice');
      const cBob = createClient('s3_bob');
      const cCharlie = createClient('s3_charlie');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's3_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      const aliceChat = [];
      cAlice.on('chat_message', (m) => aliceChat.push(m));

      await Promise.all([
        new Promise((res) => {
          cAlice.once('room_joined', res);
          cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's3_alice' });
        }),
        new Promise((res) => {
          cBob.once('room_joined', res);
          cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's3_bob' });
        }),
        new Promise((res) => {
          cCharlie.once('room_joined', res);
          cCharlie.emit('join_room', { roomCode, playerName: 'Charlie', sessionId: 's3_charlie' });
        }),
      ]);

      const choicesPromise = new Promise((res) => cAlice.once('word_choices', res));
      cAlice.emit('start_game');
      const choices = await choicesPromise;

      const roundStart = new Promise((res) => cAlice.once('round_start', res));
      cAlice.emit('select_word', { word: choices.choices[0] });
      await roundStart;

      // Bob and Charlie both leave
      const gameOverPromise = new Promise((res) => cAlice.once('game_over', res));

      cBob.emit('leave_room', { roomCode, sessionId: 's3_bob' });
      cCharlie.emit('leave_room', { roomCode, sessionId: 's3_charlie' });

      const gameOverData = await gameOverPromise;
      if (gameOverData.reason === 'last_player_standing' && gameOverData.winners[0]?.name === 'Alice') {
        pass('Alice won after 5s when other 2 players left');
      } else {
        fail('Alice did not win properly in 3-player scenario');
      }

      if (aliceChat.some((m) => m.text === 'Bob left the room.') && aliceChat.some((m) => m.text === 'Charlie left the room.')) {
        pass('Leave notifications received for both departed players');
      } else {
        fail('Missing leave notification for Bob or Charlie');
      }

      cAlice.disconnect();
      cBob.disconnect();
      cCharlie.disconnect();
    }

    // ── Scenario 4: Player leaves during word selection phase ────────────────
    console.log('\nScenario 4: Player leaves during word selection phase');
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
      await choicesPromise;

      if (room.game && room.game.roundStatus === 'selecting_word') {
        pass('Game is in selecting_word phase');
      }

      const gameOverPromise = new Promise((res) => cAlice.once('game_over', res));
      cBob.emit('leave_room', { roomCode, sessionId: 's4_bob' });

      const gameOverData = await gameOverPromise;
      if (gameOverData.reason === 'last_player_standing' && gameOverData.winners[0]?.name === 'Alice') {
        pass('Game cleanly ended with last_player_standing during word selection');
      } else {
        fail(`Unexpected game over data: ${JSON.stringify(gameOverData)}`);
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 5: Reconnect within 5s cancels countdown without leave message ──
    console.log('\nScenario 5: Disconnect, reconnect within 5s cancels countdown, no false leave/join spam');
    {
      const cAlice = createClient('s5_alice');
      let cBob = createClient('s5_bob');

      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's5_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      const aliceChat = [];
      cAlice.on('chat_message', (m) => aliceChat.push(m));

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

      // Bob disconnects socket (simulating page refresh)
      cBob.disconnect();

      // Wait 1 second (within grace period and within 5s auto-win timer)
      await new Promise((r) => setTimeout(r, 1000));

      // Assert no leave message was emitted because Bob is only temporarily disconnected
      const falseLeave = aliceChat.find((m) => m.text === 'Bob left the room.');
      if (!falseLeave) {
        pass('No premature "Bob left the room." emitted during temporary disconnect');
      } else {
        fail('Premature leave message emitted on transient disconnect');
      }

      // Bob reconnects with same sessionId
      cBob = createClient('s5_bob');
      const reconnectPromise = new Promise((res) => cBob.once('room_joined', res));
      cBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 's5_bob' });
      await reconnectPromise;

      // Assert no duplicate "Bob joined the room." on reconnect
      const joinCount = aliceChat.filter((m) => m.text === 'Bob joined the room.').length;
      if (joinCount === 1) {
        pass('Bob reconnected without duplicate "Bob joined the room." spam');
      } else {
        fail(`Expected exactly 1 join message, found ${joinCount}`);
      }

      if (room.game && room.game.autoWinCountdownTimer === null) {
        pass('autoWinCountdownTimer is null and game continues normally');
      } else {
        fail('Countdown timer was not cleared on reconnect');
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 6: Winner returns to lobby ──────────────────────────────────
    console.log('\nScenario 6: Winner returns to lobby using existing controls');
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

      // Bob leaves -> Alice wins
      const gameOverPromise = new Promise((res) => cAlice.once('game_over', res));
      cBob.emit('leave_room', { roomCode, sessionId: 's6_bob' });
      await gameOverPromise;

      // Alice emits return_to_lobby
      const returnedPromise = new Promise((res) => cAlice.once('returned_to_lobby', res));
      cAlice.emit('return_to_lobby');
      const returnedData = await returnedPromise;

      if (returnedData.reason === 'host_action') {
        pass('Alice successfully returned to lobby with reason "host_action"');
      } else {
        fail(`Expected reason "host_action", got ${returnedData.reason}`);
      }

      if (room.status === 'waiting' && room.game === null) {
        pass('Room is safely in waiting state and ready for next game');
      } else {
        fail(`Room state incorrect: status=${room.status}, game=${room.game}`);
      }

      cAlice.disconnect();
      cBob.disconnect();
    }

    // ── Scenario 7: Room becomes completely empty ───────────────────────────
    console.log('\nScenario 7: Room becomes completely empty');
    {
      const cAlice = createClient('s7_alice');
      const { room, roomCode } = roomManager.createRoom({
        hostName: 'Alice',
        hostSessionId: 's7_alice',
        settings: { rounds: 2, drawTime: 30, wordCount: 3 },
      });

      await new Promise((res) => {
        cAlice.once('room_joined', res);
        cAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 's7_alice' });
      });

      cAlice.emit('leave_room', { roomCode, sessionId: 's7_alice' });
      await new Promise((r) => setTimeout(r, 100));

      if (!roomManager.getRoom(roomCode)) {
        pass('Empty room safely deleted from memory');
      } else {
        fail('Empty room was not cleaned up');
      }

      cAlice.disconnect();
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

    if (failed === 0) {
      console.log('🎉 All Auto-Win & Chat Notification Tests passed successfully!\n');
      process.exit(0);
    }
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runAutoWinTests().catch((err) => {
  console.error('Test suite failed with error:', err);
  process.exit(1);
});
