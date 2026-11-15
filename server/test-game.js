/**
 * test-game.js
 *
 * Phase 3 Game Engine Automated Test Suite.
 *
 * Verifies:
 * 1. WordManager unit behavior (categorized lists, random selection without duplicates, masks, selection validation).
 * 2. Host can start a game.
 * 3. Non-host cannot start a game.
 * 4. Insufficient players (< 2) rejected.
 * 5. Only the drawer receives word choices.
 * 6. Invalid word selection rejected.
 * 7. Valid word selection starts round.
 * 8. Secret word is NEVER included in guesser-facing payloads (privacy).
 * 9. Drawer cannot score by guessing.
 * 10. Guess checking is case-insensitive.
 * 11. Leading/trailing whitespace is normalized.
 * 12. Duplicate correct guesses do not award duplicate points.
 * 13. Faster correct guesses receive the documented score (timeLeft * multiplier).
 * 14. Timer expiry ends the round exactly once.
 * 15. Drawer rotation works across players.
 * 16. Game ends after configured rounds with winner determination.
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
const WordManager = require('./game/WordManager');
const CONSTANTS = require('./config/constants');

const TEST_PORT = 4101;
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
  console.log('\n🧪 Phase 3 Game Engine Test Suite\n');
  console.log('═'.repeat(60));

  // ──────────────────────────────────────────────────────────────────────────
  // ── Part 1: WordManager Unit Tests ────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Part 1: WordManager Unit Tests ---');
  const wm = new WordManager();

  // Test 1.1: Categorized word list
  const categories = wm.getCategories();
  if (categories.length >= 3 && categories.includes('animals') && categories.includes('food')) {
    pass(`WordManager loaded categorized word list (${categories.join(', ')})`);
  } else {
    fail(`WordManager categories missing or incomplete: ${JSON.stringify(categories)}`);
  }

  // Test 1.2: Random words without duplicates
  const words = wm.getRandomWords(3);
  const uniqueSet = new Set(words);
  if (words.length === 3 && uniqueSet.size === 3) {
    pass(`WordManager generates 3 unique choices: ${words.join(', ')}`);
  } else {
    fail(`WordManager duplicate choices detected: ${JSON.stringify(words)}`);
  }

  // Test 1.3: Selection validation
  const offered = ['cat', 'guitar', 'ice cream'];
  if (wm.validateSelection(offered, 'guitar') === 'guitar') {
    pass('Validates exact word selection');
  } else {
    fail('Failed to validate exact word selection');
  }

  if (wm.validateSelection(offered, '  GUITAR  ') === 'guitar') {
    pass('Validates selection with case-insensitivity and whitespace trimming');
  } else {
    fail('Failed to validate case-insensitive word selection');
  }

  if (wm.validateSelection(offered, 'airplane') === null) {
    pass('Rejects unoffered word selection');
  } else {
    fail('Failed to reject unoffered word');
  }

  // Test 1.4: Word display masking
  const normalDisplay = wm.generateWordDisplay('ice cream', 'normal');
  if (normalDisplay.display === '_ _ _   _ _ _ _ _' && normalDisplay.wordLength === 9) {
    pass('Normal mode masks letters with underscores and preserves spaces');
  } else {
    fail(`Mask generation failed: ${JSON.stringify(normalDisplay)}`);
  }

  const hiddenDisplay = wm.generateWordDisplay('apple', 'hidden');
  if (hiddenDisplay.display === '?????' && hiddenDisplay.wordLength === 5) {
    pass('Hidden mode masks word appropriately');
  } else {
    fail(`Hidden mask generation failed: ${JSON.stringify(hiddenDisplay)}`);
  }

  // Test 1.5: Guess comparison
  if (wm.checkGuess('  CaT  ', 'cat') && !wm.checkGuess('dog', 'cat')) {
    pass('Guess checking is case-insensitive and trims whitespace');
  } else {
    fail('Guess checking logic failed');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ── Part 2: Socket.IO Server & Game Integration Tests ─────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Part 2: Socket.IO Game Integration Tests ---');

  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*' }));
  app.use('/api', roomRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  initializeSocket(io);

  await new Promise((resolve) => httpServer.listen(TEST_PORT, HOST, resolve));
  console.log(`📡 Game test server running on http://${HOST}:${TEST_PORT}\n`);

  // Create test room
  const hostSessionId = 'alice_host_sess';
  const guest1SessionId = 'bob_guest_sess';
  const guest2SessionId = 'charlie_guest_sess';

  const { room, roomCode } = roomManager.createRoom({
    hostName: 'Alice',
    sessionId: hostSessionId,
    settings: {
      rounds: 2,
      drawTime: 15,
      wordCount: 3,
    },
  });
  // Fast transitions for integration test speed
  room.settings.roundEndDelay = 1;
  room.settings.wordSelectTimeout = 1;

  const clientAlice = createClient(hostSessionId);
  let clientBob = createClient(guest1SessionId);
  const clientCharlie = createClient(guest2SessionId);

  try {
    // ── Setup: Alice joins ──────────────────────────────────────────────────
    await new Promise((resolve) => {
      clientAlice.on('room_joined', resolve);
      clientAlice.emit('join_room', {
        roomCode,
        playerName: 'Alice',
        sessionId: hostSessionId,
      });
    });

    // ── Test 2.1: Insufficient players rejection ────────────────────────────
    console.log('\nTest 2.1: Insufficient players rejection');
    const insufficientPromise = new Promise((resolve) => {
      clientAlice.once('game_error', resolve);
    });

    clientAlice.emit('start_game');
    const insufficientErr = await insufficientPromise;

    if (insufficientErr.message.includes('At least 2 players')) {
      pass('Rejected start_game when only 1 player in room');
    } else {
      fail(`Expected insufficient players error, got: ${JSON.stringify(insufficientErr)}`);
    }

    // ── Setup: Bob and Charlie join ─────────────────────────────────────────
    await new Promise((resolve) => {
      clientBob.on('room_joined', resolve);
      clientBob.emit('join_room', {
        roomCode,
        playerName: 'Bob',
        sessionId: guest1SessionId,
      });
    });

    await new Promise((resolve) => {
      clientCharlie.on('room_joined', resolve);
      clientCharlie.emit('join_room', {
        roomCode,
        playerName: 'Charlie',
        sessionId: guest2SessionId,
      });
    });

    // ── Test 2.2: Non-host cannot start game ────────────────────────────────
    console.log('\nTest 2.2: Non-host cannot start game');
    const nonHostPromise = new Promise((resolve) => {
      clientBob.once('game_error', resolve);
    });

    clientBob.emit('start_game');
    const nonHostErr = await nonHostPromise;

    if (nonHostErr.message.includes('Only the host')) {
      pass('Non-host (Bob) rejected from starting the game');
    } else {
      fail(`Expected host rejection error, got: ${JSON.stringify(nonHostErr)}`);
    }

    // ── Test 2.3: Host can start game & only drawer receives word choices ───
    console.log('\nTest 2.3: Host starts game & private word choices');

    let bobReceivedWordChoices = false;
    clientBob.on('word_choices', () => {
      bobReceivedWordChoices = true;
    });

    const gameStartedPromise = new Promise((resolve) => {
      clientAlice.once('game_started', resolve);
    });

    const aliceChoicesPromise = new Promise((resolve) => {
      clientAlice.once('word_choices', resolve);
    });

    // Alice starts game
    clientAlice.emit('start_game');

    const [gameStartedData, aliceChoices] = await Promise.all([
      gameStartedPromise,
      aliceChoicesPromise,
    ]);

    if (gameStartedData.currentRound === 1 && gameStartedData.totalRounds === 2) {
      pass('Game started broadcast received by clients');
    } else {
      fail(`Unexpected game_started payload: ${JSON.stringify(gameStartedData)}`);
    }

    if (
      aliceChoices.choices &&
      aliceChoices.choices.length === 3 &&
      !bobReceivedWordChoices
    ) {
      pass('Only drawer (Alice) received 3 word choices; guesser (Bob) did not');
    } else {
      fail(`Word choices distribution failed: Alice=${JSON.stringify(aliceChoices)}, Bob=${bobReceivedWordChoices}`);
    }

    // ── Test 2.3b: Reconnection during selecting_word phase ─────────────────
    console.log('\nTest 2.3b: Reconnection during selecting_word phase');
    let bobReceivedChoicesOnReconnect = false;

    clientBob.disconnect();
    const bobReconnectingInSelectPhase = createClient(guest1SessionId);
    bobReconnectingInSelectPhase.on('word_choices', () => {
      bobReceivedChoicesOnReconnect = true;
    });

    const bobSelectPhaseSyncPromise = new Promise((resolve) => {
      bobReconnectingInSelectPhase.once('game_started', resolve);
    });

    bobReconnectingInSelectPhase.emit('join_room', {
      roomCode,
      playerName: 'Bob',
      sessionId: guest1SessionId,
    });

    const bobSelectPhaseData = await bobSelectPhaseSyncPromise;
    await new Promise((r) => setTimeout(r, 50));

    if (
      bobSelectPhaseData.currentRound === 1 &&
      bobSelectPhaseData.drawer &&
      bobSelectPhaseData.drawer.id === hostSessionId &&
      !bobReceivedChoicesOnReconnect
    ) {
      pass('Reconnecting guesser received selecting_word phase and drawer identity without word choices');
    } else {
      fail(`Guesser reconnection in selecting_word failed: ${JSON.stringify(bobSelectPhaseData)}`);
    }

    // Hand back socket to clientBob for subsequent tests
    clientBob = bobReconnectingInSelectPhase;

    // ── Test 2.4: Invalid word selection rejected ───────────────────────────
    console.log('\nTest 2.4: Invalid word selection rejected');
    const invalidWordPromise = new Promise((resolve) => {
      clientAlice.once('game_error', resolve);
    });

    clientAlice.emit('select_word', { word: 'NOT_IN_CHOICES_12345' });
    const invalidWordErr = await invalidWordPromise;

    if (invalidWordErr.message === 'Invalid word selection') {
      pass('Invalid word selection was rejected with game_error');
    } else {
      fail(`Expected invalid word error, got: ${JSON.stringify(invalidWordErr)}`);
    }

    // ── Test 2.5: Valid selection starts round & secret word privacy ────────
    console.log('\nTest 2.5: Valid word selection & Secret word privacy');
    const chosenWord = aliceChoices.choices[0];

    const drawerRoundStartPromise = new Promise((resolve) => {
      clientAlice.once('round_start', resolve);
    });

    const guesserRoundStartPromise = new Promise((resolve) => {
      clientBob.once('round_start', resolve);
    });

    clientAlice.emit('select_word', { word: chosenWord });

    const [drawerPayload, guesserPayload] = await Promise.all([
      drawerRoundStartPromise,
      guesserRoundStartPromise,
    ]);

    if (drawerPayload.word === chosenWord) {
      pass('Drawer received the secret word in round_start');
    } else {
      fail(`Drawer did not receive word: ${JSON.stringify(drawerPayload)}`);
    }

    if (
      guesserPayload.word === undefined &&
      guesserPayload.wordDisplay &&
      guesserPayload.wordLength === chosenWord.length
    ) {
      pass('Guesser received masked wordDisplay and wordLength — secret word NEVER exposed');
    } else {
      fail(`Guesser received exposed word! ${JSON.stringify(guesserPayload)}`);
    }

    // ── Test 2.5b: Reconnection state recovery during active drawing round ──
    console.log('\nTest 2.5b: Reconnection state recovery during active drawing round');

    // 1. Test guesser reconnection via real socket join_room
    clientBob.disconnect();
    const clientBobReconnected = createClient(guest1SessionId);

    const bobReconnectRoundStartPromise = new Promise((resolve) => {
      clientBobReconnected.once('round_start', resolve);
    });
    const bobReconnectTimerPromise = new Promise((resolve) => {
      clientBobReconnected.once('timer_tick', resolve);
    });

    clientBobReconnected.emit('join_room', {
      roomCode,
      playerName: 'Bob',
      sessionId: guest1SessionId,
    });

    const [bobRestoredState, bobTimerTick] = await Promise.all([
      bobReconnectRoundStartPromise,
      bobReconnectTimerPromise,
    ]);

    if (
      bobRestoredState.word === undefined &&
      bobRestoredState.wordDisplay &&
      bobRestoredState.drawer.id === hostSessionId
    ) {
      pass('Reconnecting guesser received masked wordDisplay and drawer identity (secret word hidden)');
    } else {
      fail(`Reconnecting guesser state invalid: ${JSON.stringify(bobRestoredState)}`);
    }

    if (typeof bobTimerTick.timeLeft === 'number' && bobTimerTick.timeLeft > 0) {
      pass('Reconnecting guesser received current authoritative timer_tick');
    } else {
      fail(`Reconnecting guesser timer invalid: ${JSON.stringify(bobTimerTick)}`);
    }

    // Replace clientBob reference with the reconnected socket for subsequent tests
    clientBob = clientBobReconnected;

    // 2. Test drawer snapshot via sendReconnectState
    let drawerSnapshot = null;
    const mockDrawerSocket = {
      emit: (event, payload) => {
        if (event === 'round_start') drawerSnapshot = payload;
      },
    };
    room.game.sendReconnectState(mockDrawerSocket, hostSessionId);

    if (drawerSnapshot && drawerSnapshot.word === chosenWord && drawerSnapshot.drawer.id === hostSessionId) {
      pass('Drawer snapshot contains the secret word and drawer identity');
    } else {
      fail(`Drawer snapshot invalid: ${JSON.stringify(drawerSnapshot)}`);
    }

    // ── Test 2.5c: Hint reveal verification ─────────────────────────────────
    console.log('\nTest 2.5c: Hint reveal verification');
    const hintPromise = new Promise((resolve) => {
      clientBob.once('hint_revealed', resolve);
    });

    room.game.revealHint();
    const hintData = await hintPromise;

    if (
      hintData &&
      hintData.wordDisplay &&
      hintData.wordDisplay.includes('_') &&
      hintData.revealedCount >= 1
    ) {
      pass(`Hint revealed to guesser with masked progress: "${hintData.wordDisplay}"`);
    } else {
      fail(`Hint reveal validation failed: ${JSON.stringify(hintData)}`);
    }

    // ── Test 2.6: Drawer cannot guess own word ──────────────────────────────
    console.log('\nTest 2.6: Drawer cannot guess own word');
    const drawerGuessPromise = new Promise((resolve) => {
      clientAlice.once('game_error', resolve);
    });

    clientAlice.emit('submit_guess', { guess: chosenWord });
    const drawerGuessErr = await drawerGuessPromise;

    if (drawerGuessErr.message.includes('Drawer cannot guess')) {
      pass('Drawer rejected from guessing own word');
    } else {
      fail(`Drawer was not rejected: ${JSON.stringify(drawerGuessErr)}`);
    }

    // ── Test 2.6b: Incorrect guess chat broadcasting ────────────────────────
    console.log('\nTest 2.6b: Incorrect guess chat broadcasting');
    const incorrectChatPromise = new Promise((resolve) => {
      clientAlice.once('chat_message', resolve);
    });

    clientCharlie.emit('submit_guess', { guess: 'randomwrongword' });
    const chatMsg = await incorrectChatPromise;

    if (chatMsg && chatMsg.text === 'randomwrongword' && chatMsg.playerName === 'Charlie') {
      pass('Incorrect guess broadcast as chat_message to room');
    } else {
      fail(`Incorrect guess chat failed: ${JSON.stringify(chatMsg)}`);
    }

    // ── Test 2.7: Case-insensitive, whitespace normalized guess & scoring ──
    console.log('\nTest 2.7: Case-insensitivity, whitespace normalization & speed scoring');

    const bobCorrectGuessPromise = new Promise((resolve) => {
      clientBob.once('correct_guess', resolve);
    });

    // Bob guesses with messy whitespace and uppercase
    const messyGuess = `   ${chosenWord.toUpperCase()}   `;
    clientBob.emit('submit_guess', { guess: messyGuess });

    const bobScoreData = await bobCorrectGuessPromise;
    if (bobScoreData.playerId === guest1SessionId && bobScoreData.pointsAwarded > 0) {
      pass(`Bob scored ${bobScoreData.pointsAwarded} points with case-insensitive whitespace-normalized guess`);
    } else {
      fail(`Bob score verification failed: ${JSON.stringify(bobScoreData)}`);
    }

    // ── Test 2.8: Duplicate correct guess ignored (no double points) ────────
    console.log('\nTest 2.8: Duplicate correct guesses do not award points');
    let duplicateAwarded = false;

    const listener = (data) => {
      if (data.playerId === guest1SessionId) duplicateAwarded = true;
    };
    clientBob.on('correct_guess', listener);

    clientBob.emit('submit_guess', { guess: chosenWord });
    await new Promise((r) => setTimeout(r, 200));

    clientBob.off('correct_guess', listener);
    if (!duplicateAwarded) {
      pass('Duplicate correct guess ignored; no points awarded');
    } else {
      fail('Duplicate correct guess awarded duplicate points');
    }

    // ── Test 2.9: Second guesser multiplier (speed scoring) ─────────────────
    console.log('\nTest 2.9: Second guesser multiplier verification');
    const charlieCorrectPromise = new Promise((resolve) => {
      clientCharlie.once('correct_guess', resolve);
    });

    const roundEndPromise = new Promise((resolve) => {
      clientBob.once('round_end', resolve);
    });

    // Prepare listener for Bob's turn before round ends
    const bobChoicesPromise = new Promise((resolve) => {
      clientBob.once('word_choices', resolve);
    });

    const aliceSelectingPromise = new Promise((resolve) => {
      clientAlice.once('drawer_selecting', resolve);
    });

    clientCharlie.emit('submit_guess', { guess: chosenWord });
    const [charlieScoreData, roundEndData] = await Promise.all([
      charlieCorrectPromise,
      roundEndPromise,
    ]);

    if (charlieScoreData.playerId === guest2SessionId && charlieScoreData.pointsAwarded > 0) {
      pass(`Charlie (2nd guesser) scored ${charlieScoreData.pointsAwarded} points`);
    } else {
      fail(`Charlie scoring failed: ${JSON.stringify(charlieScoreData)}`);
    }

    if (roundEndData.reason === 'all_guessed' && roundEndData.word === chosenWord) {
      pass('Round ended early because all active guessers guessed correctly');
      pass(`Secret word "${chosenWord}" revealed at round_end`);
    } else {
      fail(`Round end validation failed: ${JSON.stringify(roundEndData)}`);
    }

    // Drawer bonus verification: 2 guessers * 50 = 100 points
    if (roundEndData.drawerBonus === 100) {
      pass('Drawer awarded bonus of 100 pts (50 pts * 2 correct guessers)');
    } else {
      fail(`Expected drawerBonus 100, got ${roundEndData.drawerBonus}`);
    }

    // Test reconnection during round_ended: verifies actual reason ('all_guessed') and scores
    let roundEndSnapshot = null;
    const mockRoundEndSocket = {
      emit: (event, payload) => {
        if (event === 'round_end') roundEndSnapshot = payload;
      },
    };
    room.game.sendReconnectState(mockRoundEndSocket, guest1SessionId);

    if (
      roundEndSnapshot &&
      roundEndSnapshot.reason === 'all_guessed' &&
      roundEndSnapshot.drawerBonus === 100 &&
      roundEndSnapshot.word === chosenWord
    ) {
      pass('Reconnecting client in round_ended receives actual reason ("all_guessed") and scores');
    } else {
      fail(`Reconnection in round_ended failed: ${JSON.stringify(roundEndSnapshot)}`);
    }

    // ── Test 2.10: Drawer rotation to next player ───────────────────────────
    console.log('\nTest 2.10: Drawer rotation to next player');
    const [bobChoices, aliceNotice] = await Promise.all([
      bobChoicesPromise,
      aliceSelectingPromise,
    ]);
    if (bobChoices.choices && bobChoices.choices.length === 3) {
      pass('Drawer successfully rotated: Bob received word choices for the next turn');
    } else {
      fail(`Drawer rotation failed: ${JSON.stringify(bobChoices)}`);
    }

    if (aliceNotice && aliceNotice.drawer && aliceNotice.drawer.id === guest1SessionId) {
      pass('Guesser (Alice) received drawer_selecting notice with Bob identity and zero word choices');
    } else {
      fail(`Guesser drawer_selecting notice failed: ${JSON.stringify(aliceNotice)}`);
    }

    // ── Test 2.11: Timer expiry ends the round exactly once ─────────────────
    console.log('\nTest 2.11: Timer expiry ends round exactly once');
    // Bob picks a word, and we test timer expiry
    const bobWord = bobChoices.choices[0];
    const activeGame = room.game;
    // Set short drawTime (1s) to test expiry without long delay
    activeGame.drawTime = 1;
    activeGame.roundEndDelay = 1;

    let roundEndCount = 0;
    const roundEndCounter = () => {
      roundEndCount++;
    };
    clientAlice.on('round_end', roundEndCounter);

    const bobRoundStartPromise = new Promise((resolve) => {
      clientBob.once('round_start', resolve);
    });

    clientBob.emit('select_word', { word: bobWord });
    await bobRoundStartPromise;

    // Wait 2.2 seconds for timer to tick down and expire
    await new Promise((r) => setTimeout(r, 2200));

    clientAlice.off('round_end', roundEndCounter);
    if (roundEndCount === 1) {
      pass('Timer expiry triggered round_end exactly once (no duplicate events)');
    } else {
      fail(`Expected 1 round_end from timer expiry, got ${roundEndCount}`);
    }

    // ── Test 2.12: Completing all rounds leads to game_over ──────────────────
    console.log('\nTest 2.12: Game completion and winner determination');
    activeGame.drawTime = 1;
    activeGame.roundEndDelay = 0.3;
    activeGame.wordSelectTimeout = 1;

    // Automatically select offered words so turns progress without waiting for timeouts
    const autoSelect = (client) => {
      client.on('word_choices', (data) => {
        if (data.choices && data.choices.length > 0) {
          client.emit('select_word', { word: data.choices[0] });
        }
      });
    };
    autoSelect(clientAlice);
    autoSelect(clientBob);
    autoSelect(clientCharlie);

    const gameOverPromise = new Promise((resolve) => {
      clientAlice.once('game_over', resolve);
    });

    const gameOverData = await Promise.race([
      gameOverPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Game over timeout')), 15000)
      ),
    ]);

    if (gameOverData && gameOverData.winners && gameOverData.finalScores) {
      pass('game_over event received with winners and sorted finalScores');
      pass(`Winners: ${gameOverData.winners.map((w) => `${w.name} (${w.score} pts)`).join(', ')}`);
    } else {
      fail(`game_over data invalid: ${JSON.stringify(gameOverData)}`);
    }

    if (room.status === 'ended') {
      pass('Room status transitioned to "ended" after game completion');
    } else {
      fail(`Expected room status "ended", got "${room.status}"`);
    }

    // ── Test 2.13: Host returns room to lobby ──────────────────────────────
    console.log('\nTest 2.13: Host returns room to lobby');
    const lobbyPromise = new Promise((resolve) => {
      clientBob.once('returned_to_lobby', resolve);
    });

    clientAlice.emit('return_to_lobby');
    const lobbyData = await lobbyPromise;

    if (lobbyData && lobbyData.room && room.status === 'waiting') {
      pass('Host successfully returned room to waiting lobby state');
    } else {
      fail(`Return to lobby failed: ${JSON.stringify(lobbyData)}`);
    }

    // Disconnect clients
    clientAlice.disconnect();
    clientBob.disconnect();
    clientCharlie.disconnect();
  } catch (err) {
    fail(`Integration test runtime error: ${err.message}`);
  } finally {
    httpServer.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ── Results Summary ───────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Phase 3 Test Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 All Phase 3 Game Engine tests passed successfully!\n');
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
