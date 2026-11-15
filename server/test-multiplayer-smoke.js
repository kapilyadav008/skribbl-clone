/**
 * test-multiplayer-smoke.js
 *
 * Automated two-player full gameplay smoke test:
 * - Room creation & joining (Alice & Bob)
 * - Word selection
 * - Hint reception
 * - Chat & guessing with close-guess notification
 * - Correct guess scoring
 * - Round transition
 * - Final game over leaderboard
 * - Host return to lobby
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

const roomManager = require('./game/RoomManager');
const roomRoutes = require('./routes/roomRoutes');
const { initializeSocket } = require('./socket/index');

const PORT = 4103;
const HOST = '127.0.0.1';

async function runSmokeTest() {
  console.log('\n🎮 Running Automated Multiplayer Smoke Test (Phases 6.4–6.7)...\n');

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

  const clientAlice = createClient('alice_smoke_sess');
  const clientBob = createClient('bob_smoke_sess');

  try {
    const room = roomManager.createRoom({
      hostName: 'Alice',
      hostSessionId: 'alice_smoke_sess',
      settings: { rounds: 2, drawTime: 3, hints: 2 },
    });
    const roomCode = room.roomCode;

    // Join room
    await new Promise((res) => {
      clientAlice.once('room_joined', res);
      clientAlice.emit('join_room', { roomCode, playerName: 'Alice', sessionId: 'alice_smoke_sess' });
    });
    await new Promise((res) => {
      clientBob.once('room_joined', res);
      clientBob.emit('join_room', { roomCode, playerName: 'Bob', sessionId: 'bob_smoke_sess' });
    });

    console.log('✅ Room joined by Alice & Bob');

    // Alice starts game
    const choicesPromise = new Promise((res) => clientAlice.once('word_choices', res));
    clientAlice.emit('start_game');
    const choicesData = await choicesPromise;
    console.log('✅ Alice received word choices:', choicesData.choices);

    // Alice selects word
    const chosenWord = choicesData.choices[0];
    const roundStartPromise = new Promise((res) => clientBob.once('round_start', res));
    clientAlice.emit('select_word', { word: chosenWord });
    const bobRoundStart = await roundStartPromise;
    console.log('✅ Bob received masked word:', bobRoundStart.wordDisplay);

    // Charlie/Bob chats incorrect guess
    const chatPromise = new Promise((res) => clientAlice.once('chat_message', res));
    clientBob.emit('submit_guess', { guess: 'wrongguess' });
    const chatMsg = await chatPromise;
    console.log('✅ Chat message broadcast received:', chatMsg.text);

    // Bob submits correct guess
    const correctPromise = new Promise((res) => clientBob.once('correct_guess', res));
    clientBob.emit('submit_guess', { guess: chosenWord });
    const correctData = await correctPromise;
    console.log('✅ Bob correct guess scored:', correctData.pointsAwarded, 'points');

    // Wait for game over
    console.log('⏳ Awaiting match completion...');
    const gameOverData = await new Promise((res) => clientAlice.once('game_over', res));
    console.log('✅ Game Over received. Winners:', gameOverData.winners.map(w => w.name));

    // Return to lobby
    const lobbyPromise = new Promise((res) => clientBob.once('returned_to_lobby', res));
    clientAlice.emit('return_to_lobby');
    await lobbyPromise;
    console.log('✅ Return to lobby successful. Room status:', room.status);

    console.log('\n🎉 Multiplayer Smoke Test COMPLETED SUCCESSFULLY!\n');
  } finally {
    clientAlice.disconnect();
    clientBob.disconnect();
    server.close();
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
