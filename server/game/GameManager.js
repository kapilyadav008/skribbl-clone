/**
 * game/GameManager.js
 *
 * Authoritative Server-Side Game Engine.
 *
 * RESPONSIBILITIES:
 * 1. Room eligibility checks and game initiation (host-only, min 2 players).
 * 2. Fair rotation of the drawer among connected players.
 * 3. Round tracking and total round progression.
 * 4. Word selection workflow (private to drawer, validation).
 * 5. Server-side authoritative round timer and tick broadcasts.
 * 6. Case-insensitive guess evaluation, duplicate prevention, and speed scoring.
 * 7. End of round handling, drawer bonus distribution, and secret word reveal.
 * 8. Game termination and winner determination.
 * 9. Resilience to player and drawer disconnections.
 */

const CONSTANTS = require('../config/constants');
const WordManager = require('./WordManager');
const DrawingManager = require('./DrawingManager');

/**
 * Computes whether a guess is within 1 edit distance of target secret word.
 */
function isCloseGuess(guess, target) {
  if (!guess || !target) return false;
  const g = guess.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (g === t) return false;
  if (Math.abs(g.length - t.length) > 1) return false;

  const m = g.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (g[i - 1] === t[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n] === 1;
}

class GameManager {
  /**
   * @param {import('./Room')} room - The Room instance
   * @param {import('socket.io').Server} io - Socket.IO server instance
   * @param {object} [options]
   * @param {WordManager} [options.wordManager]
   * @param {DrawingManager} [options.drawingManager]
   */
  constructor(room, io, options = {}) {
    this.room = room;
    this.io = io;
    this.wordManager = options.wordManager || new WordManager();
    this.drawingManager = options.drawingManager || new DrawingManager();

    // Game lifecycle configuration
    this.totalRounds = room.settings.rounds || CONSTANTS.GAME.DEFAULT_ROUNDS;
    this.drawTime = room.settings.drawTime || CONSTANTS.GAME.DEFAULT_DRAW_TIME;
    this.wordCount = room.settings.wordCount || CONSTANTS.GAME.DEFAULT_WORD_COUNT;
    this.wordMode = room.settings.wordMode || CONSTANTS.GAME.DEFAULT_WORD_MODE;
    this.roundEndDelay = options.roundEndDelay ?? room.settings.roundEndDelay ?? CONSTANTS.GAME.ROUND_END_DELAY;
    this.wordSelectTimeout = options.wordSelectTimeout ?? room.settings.wordSelectTimeout ?? CONSTANTS.GAME.WORD_SELECT_TIMEOUT;

    // Progression state
    this.currentRound = 0;
    this.drawerOrder = [];
    this.currentDrawerIndex = -1;
    this.currentDrawerId = null;

    // Word and display state (secret word is SERVER-ONLY)
    this.currentWord = null;
    this.currentWordDisplay = null;
    this.offeredWords = [];

    // Phase status: 'idle' | 'selecting_word' | 'drawing' | 'round_ended' | 'game_over'
    this.roundStatus = 'idle';

    // Timer management
    this.roundEndsAt = null;
    this.timeLeft = 0;
    this.timerInterval = null;
    this.selectTimeout = null;
    this.selectEndsAt = null;
    this.roundEndTimeout = null;

    // Guess tracking per round
    this.correctGuessCount = 0;
    this.correctGuessers = new Set(); // Set of sessionIds

    // Last completed round metadata for reconnection sync
    this.lastRoundReason = null;
    this.lastDrawerBonus = 0;

    // Race condition guard: prevents double execution of endRound
    this.isRoundEnding = false;
    this.isAborting = false;

    // Per-turn points earned tracking for round-end breakdown
    this.turnPoints = new Map();

    // Auto-win countdown management for last remaining player
    this.autoWinCountdownTimer = null;
    this.autoWinInterval = null;
    this.autoWinSecondsLeft = null;
    this.autoWinWinnerId = null;
  }

  // ── 1. Validation & Eligibility ──────────────────────────────────────────

  /**
   * Validates whether a game can be started in the given room.
   * @param {import('./Room')} room
   * @param {string} requestingSessionId
   * @returns {{ eligible: boolean, error?: string }}
   */
  static validateCanStart(room, requestingSessionId) {
    if (!room) {
      return { eligible: false, error: 'Room not found' };
    }

    if (room.status === 'playing') {
      return { eligible: false, error: 'Game is already in progress' };
    }

    if (room.hostId !== requestingSessionId) {
      return { eligible: false, error: 'Only the host can start the game' };
    }

    if (room.connectedPlayerCount < CONSTANTS.ROOM.MIN_PLAYERS) {
      return {
        eligible: false,
        error: `At least ${CONSTANTS.ROOM.MIN_PLAYERS} players are required to start the game`,
      };
    }

    return { eligible: true };
  }

  // ── 2. Game Lifecycle ───────────────────────────────────────────────────

  /**
   * Starts a new game session.
   * @param {string} requestingSessionId
   */
  startGame(requestingSessionId) {
    const validation = GameManager.validateCanStart(this.room, requestingSessionId);
    if (!validation.eligible) {
      throw new Error(validation.error);
    }

    // Reset scores & per-round state for all players
    for (const player of this.room.players.values()) {
      player.score = 0;
      player.resetRoundState();
    }

    // Establish deterministic initial drawer order based on currently connected players
    this.drawerOrder = Array.from(this.room.players.values())
      .filter((p) => p.isConnected)
      .map((p) => p.sessionId);

    this.currentRound = 1;
    this.currentDrawerIndex = 0;
    this.room.status = 'playing';
    this.room.game = this;

    // Broadcast game_started event to everyone in the room
    const firstDrawer = this.room.getPlayerBySessionId(this.drawerOrder[0]);
    this.io.to(this.room.roomCode).emit('game_started', {
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      drawerOrder: this.drawerOrder,
      drawer: firstDrawer ? firstDrawer.toPublic() : null,
    });

    console.log(`[GameManager] Game started in room ${this.room.roomCode} (Rounds: ${this.totalRounds})`);

    // Initiate the first turn
    this.startTurn();
  }

  /**
   * Initiates a turn for the next drawer.
   */
  startTurn() {
    this.clearTimers();
    this.drawingManager.reset();
    this.isRoundEnding = false;
    this.currentWord = null;
    this.currentWordDisplay = null;
    this.correctGuessCount = 0;
    this.correctGuessers.clear();

    // If auto-win countdown is active, do not start turn
    if (this.autoWinCountdownTimer !== null) return;

    // Verify minimum connected players before beginning turn
    const activeConnected = Array.from(this.room.players.values()).filter((p) => p.isConnected);
    if (activeConnected.length < CONSTANTS.ROOM.MIN_PLAYERS) {
      if (activeConnected.length === 1) {
        this.checkAutoWinCondition();
      } else {
        this.abortGame('insufficient_players', 'Not enough players. Waiting for another player to join.');
      }
      return;
    }

    // Check if current round's drawer sequence is exhausted
    if (this.currentDrawerIndex >= this.drawerOrder.length) {
      if (this.currentRound < this.totalRounds) {
        // Advance to next round
        this.currentRound++;
        this.currentDrawerIndex = 0;
        // Refresh drawer order with currently connected players
        this.drawerOrder = Array.from(this.room.players.values())
          .filter((p) => p.isConnected)
          .map((p) => p.sessionId);

        if (this.drawerOrder.length < CONSTANTS.ROOM.MIN_PLAYERS) {
          const connected = Array.from(this.room.players.values()).filter((p) => p.isConnected);
          if (connected.length === 1) {
            this.checkAutoWinCondition();
          } else {
            this.abortGame('insufficient_players', 'Not enough players. Waiting for another player to join.');
          }
          return;
        }
      } else {
        // All rounds complete -> Game Over
        this.endGame('completed');
        return;
      }
    }

    const drawerSessionId = this.drawerOrder[this.currentDrawerIndex];
    const drawer = this.room.getPlayerBySessionId(drawerSessionId);

    // If drawer disconnected, skip to next turn
    if (!drawer || !drawer.isConnected) {
      this.currentDrawerIndex++;
      this.startTurn();
      return;
    }

    this.currentDrawerId = drawerSessionId;
    this.turnPoints.clear();

    // Reset player turn states
    for (const player of this.room.players.values()) {
      player.resetRoundState();
      player.isDrawing = (player.sessionId === drawerSessionId);
    }

    this.roundStatus = 'selecting_word';

    // Generate word choices for the drawer
    this.offeredWords = this.wordManager.getRandomWords(this.wordCount, {
      wordMode: this.wordMode,
    });
    this.selectEndsAt = Date.now() + this.wordSelectTimeout * 1000;

    // PRIVACY: Emit word choices strictly to drawer's socket
    if (drawer.socketId) {
      this.io.to(drawer.socketId).emit('word_choices', {
        choices: this.offeredWords,
        drawTime: this.drawTime,
        timeout: this.wordSelectTimeout,
      });
    }

    // PRIVACY: Guessers receive ONLY notice that drawer is selecting a word (never word choices)
    for (const player of this.room.players.values()) {
      if (player.sessionId !== drawerSessionId && player.isConnected && player.socketId) {
        this.io.to(player.socketId).emit('drawer_selecting', {
          currentRound: this.currentRound,
          totalRounds: this.totalRounds,
          drawer: drawer ? drawer.toPublic() : null,
        });
      }
    }

    console.log(
      `[GameManager] Turn started in ${this.room.roomCode}: Drawer is ${drawer.name}. Awaiting word selection.`
    );

    // Set fallback auto-pick timeout if drawer is inactive
    this.selectTimeout = setTimeout(() => {
      if (this.roundStatus === 'selecting_word' && this.offeredWords.length > 0) {
        console.log(`[GameManager] Drawer timed out picking word; auto-selecting "${this.offeredWords[0]}"`);
        this.selectWord(drawerSessionId, this.offeredWords[0]);
      }
    }, this.wordSelectTimeout * 1000);
  }

  // ── 3. Word Selection ───────────────────────────────────────────────────

  /**
   * Called when the drawer selects a word.
   * @param {string} sessionId - Must be the current drawer's sessionId
   * @param {string} selectedWord - One of the offered choices
   */
  selectWord(sessionId, selectedWord) {
    if (this.roundStatus !== 'selecting_word') {
      throw new Error('Not currently in word selection phase');
    }

    if (sessionId !== this.currentDrawerId) {
      throw new Error('Only the current drawer can select a word');
    }

    const validWord = this.wordManager.validateSelection(this.offeredWords, selectedWord);
    if (!validWord) {
      throw new Error('Invalid word selection');
    }

    if (this.selectTimeout) {
      clearTimeout(this.selectTimeout);
      this.selectTimeout = null;
    }
    this.selectEndsAt = null;

    // Authoritative secret word stored on server ONLY
    this.currentWord = validWord;
    this.currentWordDisplay = this.wordManager.generateWordDisplay(this.currentWord, this.wordMode);

    // Setup hint triggers for this word
    const configuredHints = this.room?.settings?.hints !== undefined
      ? this.room.settings.hints
      : CONSTANTS.GAME.DEFAULT_HINTS;
    this.revealedHintIndices = new Set();
    this.hintThresholds = [];
    if (configuredHints > 0 && this.wordMode !== 'hidden') {
      for (let i = 1; i <= configuredHints; i++) {
        const remainingFraction = (configuredHints - i + 1) / (configuredHints + 1);
        this.hintThresholds.push(Math.floor(this.drawTime * remainingFraction));
      }
    }

    this.roundStatus = 'drawing';
    this.roundEndsAt = Date.now() + this.drawTime * 1000;
    this.timeLeft = this.drawTime;

    const drawer = this.room.getPlayerBySessionId(this.currentDrawerId);

    // PRIVACY ENFORCEMENT:
    // 1. Drawer receives the actual word so they know what to draw.
    if (drawer && drawer.socketId) {
      this.io.to(drawer.socketId).emit('round_start', {
        round: this.currentRound,
        totalRounds: this.totalRounds,
        drawer: drawer.toPublic(),
        word: this.currentWord,
        wordLength: this.currentWord.length,
        roundEndsAt: this.roundEndsAt,
        drawTime: this.drawTime,
      });
    }

    // 2. Guessers receive ONLY masked blanks and word length (never the secret word!)
    for (const player of this.room.players.values()) {
      if (player.sessionId !== this.currentDrawerId && player.isConnected && player.socketId) {
        this.io.to(player.socketId).emit('round_start', {
          round: this.currentRound,
          totalRounds: this.totalRounds,
          drawer: drawer ? drawer.toPublic() : null,
          wordDisplay: this.currentWordDisplay.display,
          wordLength: this.currentWord.length,
          roundEndsAt: this.roundEndsAt,
          drawTime: this.drawTime,
        });
      }
    }

    // Broadcast turn announcement to room chat (blue notification)
    if (drawer) {
      this.io.to(this.room.roomCode).emit('chat_message', {
        id: `turn-${Date.now()}-${drawer.sessionId}`,
        sender: 'SketchClub',
        playerName: drawer.name,
        text: `${drawer.name} is now drawing!`,
        type: 'drawer_turn',
        timestamp: Date.now(),
      });
    }

    // Start server-side countdown interval
    this.startRoundTimer();
  }

  // ── 4. Authoritative Round Timer ────────────────────────────────────────

  /**
   * Starts the server-side countdown timer for the drawing phase.
   */
  startRoundTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      const remainingMs = this.roundEndsAt - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      this.timeLeft = remainingSec;

      // Broadcast remaining time to room
      this.io.to(this.room.roomCode).emit('timer_tick', {
        timeLeft: remainingSec,
      });

      // Check for scheduled hint trigger
      if (
        this.hintThresholds &&
        this.hintThresholds.length > 0 &&
        remainingSec <= this.hintThresholds[0]
      ) {
        this.hintThresholds.shift();
        this.revealHint();
      }

      // Handle round timeout exactly once
      if (remainingSec <= 0) {
        this.handleTimeout();
      }
    }, CONSTANTS.GAME.TIMER_TICK_MS);
  }

  /**
   * Handles timer expiry. Protected against race conditions.
   */
  handleTimeout() {
    if (this.isRoundEnding || this.roundStatus !== 'drawing') return;
    this.endRound('time_up');
  }

  /**
   * Authoritatively reveals one unrevealed letter in currentWord to guessers.
   */
  revealHint() {
    if (!this.currentWord || this.roundStatus !== 'drawing' || this.wordMode === 'hidden') {
      return;
    }

    // Find all alphanumeric character positions in currentWord not yet revealed
    const candidateIndices = [];
    for (let i = 0; i < this.currentWord.length; i++) {
      const ch = this.currentWord[i];
      if (ch !== ' ' && ch !== '-' && !this.revealedHintIndices.has(i)) {
        candidateIndices.push(i);
      }
    }

    // Never reveal more than half the clean letters
    const cleanLength = this.currentWord.replace(/[\s-]/g, '').length;
    const maxAllowedReveals = Math.max(1, Math.floor(cleanLength / 2));
    if (candidateIndices.length === 0 || this.revealedHintIndices.size >= maxAllowedReveals) {
      return;
    }

    // Pick a random unrevealed index
    const randomIndex =
      candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
    this.revealedHintIndices.add(randomIndex);

    // Rebuild masked display with the revealed hint characters
    const words = this.currentWord.split(' ');
    let globalCharIndex = 0;
    const maskedWords = words.map((w) => {
      const letters = w.split('').map((ch) => {
        const idx = globalCharIndex++;
        if (ch === '-') return '-';
        if (this.revealedHintIndices.has(idx)) {
          return ch.toUpperCase();
        }
        return '_';
      });
      globalCharIndex++; // skip space
      return letters.join(' ');
    });

    this.currentWordDisplay = {
      wordLength: this.currentWord.length,
      display: maskedWords.join('   '),
      charCount: cleanLength,
    };

    // Broadcast updated hint display to the room
    this.io.to(this.room.roomCode).emit('hint_revealed', {
      wordDisplay: this.currentWordDisplay.display,
      revealedCount: this.revealedHintIndices.size,
    });
  }

  // ── 5. Guess Evaluation & Scoring ───────────────────────────────────────

  /**
   * Processes a player's guess.
   * @param {string} sessionId
   * @param {string} rawGuess
   * @returns {{ isCorrect: boolean, pointsAwarded?: number, alreadyGuessed?: boolean, isClose?: boolean, guess?: string, error?: string }}
   */
  submitGuess(sessionId, rawGuess) {
    if (this.roundStatus !== 'drawing') {
      return { isCorrect: false, error: 'Round is not in drawing phase' };
    }

    if (sessionId === this.currentDrawerId) {
      return { isCorrect: false, error: 'Drawer cannot guess' };
    }

    const player = this.room.getPlayerBySessionId(sessionId);
    if (!player || !player.isConnected) {
      return { isCorrect: false, error: 'Player not connected' };
    }

    const trimmed = (rawGuess || '').trim();
    if (!trimmed) {
      return { isCorrect: false, error: 'Guess cannot be empty' };
    }

    // If player has already guessed correctly, do not allow spoiling
    if (player.hasGuessedCorrectly || this.correctGuessers.has(sessionId)) {
      const containsWord =
        this.currentWord &&
        trimmed.toLowerCase().includes(this.currentWord.toLowerCase());
      if (containsWord) {
        return { isCorrect: false, error: 'Please do not spoil the secret word!' };
      }
      this.io.to(this.room.roomCode).emit('chat_message', {
        id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        playerId: player.sessionId,
        playerName: player.name,
        text: trimmed,
        type: 'guessed_chat',
        timestamp: Date.now(),
      });
      return { isCorrect: false, alreadyGuessed: true };
    }

    const isMatch = this.wordManager.checkGuess(trimmed, this.currentWord);
    if (!isMatch) {
      const close = isCloseGuess(trimmed, this.currentWord);
      // Broadcast guess to room
      this.io.to(this.room.roomCode).emit('chat_message', {
        id: `guess-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        playerId: player.sessionId,
        playerName: player.name,
        text: trimmed,
        type: 'guess',
        timestamp: Date.now(),
      });

      return { isCorrect: false, isClose: close, guess: trimmed };
    }

    // Correct Guess:
    player.hasGuessedCorrectly = true;
    this.correctGuessers.add(sessionId);

    // Calculate speed-based points:
    // Multipliers: 1st guesser = timeLeft * 10, 2nd = timeLeft * 8, 3rd+ = timeLeft * 6
    const remainingSec = Math.max(1, Math.ceil((this.roundEndsAt - Date.now()) / 1000));
    const guesserIndex = this.correctGuessCount;
    const multipliers = CONSTANTS.SCORING.MULTIPLIERS;
    const multiplier =
      guesserIndex < multipliers.length
        ? multipliers[guesserIndex]
        : multipliers[multipliers.length - 1];

    const pointsAwarded = remainingSec * multiplier;
    player.score += pointsAwarded;
    this.correctGuessCount++;
    this.turnPoints.set(sessionId, pointsAwarded);

    // Broadcast correct guess to the entire room (DOES NOT reveal secret word)
    this.io.to(this.room.roomCode).emit('correct_guess', {
      playerId: player.sessionId,
      playerName: player.name,
      pointsAwarded,
      score: player.score,
      scores: Array.from(this.room.players.values()).map((p) => ({
        id: p.sessionId,
        name: p.name,
        score: p.score,
      })),
    });

    // Also broadcast celebratory chat message
    this.io.to(this.room.roomCode).emit('chat_message', {
      id: `correct-${Date.now()}-${player.sessionId}`,
      playerId: player.sessionId,
      playerName: player.name,
      text: `${player.name} guessed the word!`,
      type: 'correct',
      pointsAwarded,
      timestamp: Date.now(),
    });

    console.log(
      `[GameManager] Player ${player.name} guessed correctly! Awarded ${pointsAwarded} pts (TimeLeft: ${remainingSec}s, Multiplier: ${multiplier}x)`
    );

    // Check if ALL active guessers have guessed correctly
    const activeGuessers = Array.from(this.room.players.values()).filter(
      (p) => p.isConnected && p.sessionId !== this.currentDrawerId
    );

    if (activeGuessers.length > 0 && this.correctGuessers.size >= activeGuessers.length) {
      console.log(
        `[GameManager] All active guessers guessed correctly in room ${this.room.roomCode}. Ending round early.`
      );
      this.endRound('all_guessed');
    }

    return { isCorrect: true, pointsAwarded };
  }

  // ── 6. Round End & Transitions ──────────────────────────────────────────

  /**
   * Concludes the current round turn.
   * Calculates drawer bonus and reveals secret word to all players.
   * @param {'time_up' | 'all_guessed' | 'drawer_disconnected'} reason
   */
  endRound(reason = 'time_up') {
    if (this.isRoundEnding || this.autoWinCountdownTimer !== null) return;
    this.isRoundEnding = true;

    this.roundStatus = 'round_ended';
    this.clearTimers();

    // Drawer bonus: 50 points per player who guessed correctly
    let drawerBonus = 0;
    const drawer = this.room.getPlayerBySessionId(this.currentDrawerId);
    if (drawer && this.correctGuessCount > 0) {
      drawerBonus = this.correctGuessCount * CONSTANTS.SCORING.DRAWER_BONUS_PER_GUESSER;
      drawer.score += drawerBonus;
    }

    // Build per-player earnings for this turn
    const turnEarnings = {};
    if (this.turnPoints) {
      for (const [sId, pts] of this.turnPoints.entries()) {
        turnEarnings[sId] = pts;
      }
    }
    if (drawerBonus > 0 && this.currentDrawerId) {
      turnEarnings[this.currentDrawerId] = (turnEarnings[this.currentDrawerId] || 0) + drawerBonus;
    }

    // Retain round-end metadata for reconnection snapshot
    this.lastRoundReason = reason;
    this.lastDrawerBonus = drawerBonus;
    this.lastTurnEarnings = turnEarnings;

    // Build final score snapshot for this round
    const scoreSnapshot = Array.from(this.room.players.values()).map((p) => ({
      id: p.sessionId,
      name: p.name,
      score: p.score,
    }));

    // Broadcast round_end (Now the secret word is revealed to all)
    this.io.to(this.room.roomCode).emit('round_end', {
      word: this.currentWord,
      drawerId: this.currentDrawerId,
      drawerBonus,
      scores: scoreSnapshot,
      turnEarnings,
      reason,
    });

    console.log(
      `[GameManager] Round turn ended in ${this.room.roomCode}. Word was: "${this.currentWord}". Reason: ${reason}. Drawer bonus: ${drawerBonus}`
    );

    // Prepare next turn rotation after delay
    this.currentDrawerIndex++;
    this.roundEndTimeout = setTimeout(() => {
      this.startTurn();
    }, this.roundEndDelay * 1000);
  }

  // ── 7. Game Over ────────────────────────────────────────────────────────

  /**
   * Ends the entire game, resets room status, and determines the winner(s).
   * @param {string} [reason='completed']
   * @param {string} [defaultWinnerId=null]
   */
  endGame(reason = 'completed', defaultWinnerId = null) {
    if (this.roundStatus === 'game_over') return;
    this.roundStatus = 'game_over';
    this.room.status = 'ended';
    this.clearTimers();

    const players = Array.from(this.room.players.values());
    let sortedScores;
    let winners;

    if (reason === 'last_player_standing' && defaultWinnerId) {
      const defaultWinner = this.room.getPlayerBySessionId(defaultWinnerId);
      if (defaultWinner) {
        winners = [{ id: defaultWinner.sessionId, name: defaultWinner.name, score: defaultWinner.score }];
        const others = players
          .filter((p) => p.sessionId !== defaultWinnerId)
          .map((p) => ({ id: p.sessionId, name: p.name, score: p.score }))
          .sort((a, b) => b.score - a.score);
        sortedScores = [
          { id: defaultWinner.sessionId, name: defaultWinner.name, score: defaultWinner.score },
          ...others,
        ];
      }
    }

    if (!sortedScores) {
      sortedScores = [...players]
        .map((p) => ({ id: p.sessionId, name: p.name, score: p.score }))
        .sort((a, b) => b.score - a.score);

      const maxScore = sortedScores.length > 0 ? sortedScores[0].score : 0;
      winners = sortedScores.filter((p) => p.score === maxScore && maxScore > 0);
    }

    this.io.to(this.room.roomCode).emit('game_over', {
      winners,
      finalScores: sortedScores,
      reason,
    });

    console.log(`[GameManager] Game over in room ${this.room.roomCode}. Reason: ${reason}`);
  }

  // ── Auto-Win (Last Remaining Player) ────────────────────────────────────

  /**
   * Evaluates active connected player count and initiates or cancels auto-win countdown.
   */
  checkAutoWinCondition() {
    if (this.roundStatus === 'game_over' || this.roundStatus === 'idle') return;

    const connected = Array.from(this.room.players.values()).filter((p) => p.isConnected);

    // If no players remain connected, cancel any countdown
    if (connected.length === 0) {
      this.cancelAutoWinCountdown();
      return;
    }

    // Exactly 1 connected player remaining -> start 5-second auto-win countdown
    if (connected.length === 1) {
      this.startAutoWinCountdown(connected[0].sessionId);
      return;
    }

    // 2 or more players connected -> if countdown was active, cancel and resume game
    if (connected.length >= 2) {
      this.cancelAutoWinCountdown(true);
    }
  }

  /**
   * Starts server-authoritative 5-second countdown to declare the last remaining player the winner.
   * @param {string} lastPlayerSessionId
   */
  startAutoWinCountdown(lastPlayerSessionId) {
    if (this.roundStatus === 'game_over' || this.roundStatus === 'idle') return;
    if (this.autoWinCountdownTimer !== null) return; // Prevent duplicate countdowns

    this.autoWinWinnerId = lastPlayerSessionId;
    this.autoWinSecondsLeft = 5;

    console.log(
      `[GameManager] Starting 5s auto-win countdown in room ${this.room.roomCode} for player ${lastPlayerSessionId}`
    );

    const initialMsg = 'All other players have left. You win in 5 seconds...';
    this.io.to(this.room.roomCode).emit('auto_win_countdown', {
      secondsLeft: 5,
      message: initialMsg,
    });

    this.autoWinInterval = setInterval(() => {
      if (this.autoWinSecondsLeft === null) return;
      this.autoWinSecondsLeft--;

      if (this.autoWinSecondsLeft > 0) {
        const tickMsg = `All other players have left. You win in ${this.autoWinSecondsLeft} seconds...`;
        this.io.to(this.room.roomCode).emit('auto_win_countdown', {
          secondsLeft: this.autoWinSecondsLeft,
          message: tickMsg,
        });
      }
    }, 1000);

    this.autoWinCountdownTimer = setTimeout(() => {
      this.finalizeAutoWin();
    }, 5000);
  }

  /**
   * Cancels the auto-win countdown if another player reconnects.
   * @param {boolean} [notify=false]
   */
  cancelAutoWinCountdown(notify = false) {
    if (this.autoWinCountdownTimer !== null || this.autoWinInterval !== null) {
      console.log(`[GameManager] Cancelling auto-win countdown in room ${this.room.roomCode}`);
      this.clearAutoWinTimers();

      if (notify) {
        const resumeMsg = 'Another player reconnected. Game continues!';
        this.io.to(this.room.roomCode).emit('auto_win_cancelled', {
          message: resumeMsg,
        });
      }
    }
  }

  /**
   * Finalizes the auto-win when countdown expires with only one player remaining.
   */
  finalizeAutoWin() {
    this.clearAutoWinTimers();

    if (this.roundStatus === 'game_over' || this.roundStatus === 'idle') return;

    const connected = Array.from(this.room.players.values()).filter((p) => p.isConnected);
    if (connected.length !== 1) return;

    const winner = connected[0];
    console.log(
      `[GameManager] Auto-win countdown expired in room ${this.room.roomCode}. Declaring ${winner.name} winner by default.`
    );

    this.clearTimers();
    this.endGame('last_player_standing', winner.sessionId);
  }

  /**
   * Clears auto-win timers and intervals.
   */
  clearAutoWinTimers() {
    if (this.autoWinCountdownTimer) {
      clearTimeout(this.autoWinCountdownTimer);
      this.autoWinCountdownTimer = null;
    }
    if (this.autoWinInterval) {
      clearInterval(this.autoWinInterval);
      this.autoWinInterval = null;
    }
    this.autoWinSecondsLeft = null;
    this.autoWinWinnerId = null;
  }

  /**
   * Aborts an active game and returns the room safely to the lobby.
   * Invoked when active player count drops below minimum required (2 players).
   * @param {string} [reason='insufficient_players']
   * @param {string} [message='Not enough players. Waiting for another player to join.']
   */
  abortGame(reason = 'insufficient_players', message = 'Not enough players. Waiting for another player to join.') {
    // Guard against duplicate execution
    if (this.isAborting || this.roundStatus === 'idle') {
      return;
    }
    this.isAborting = true;
    this.roundStatus = 'idle';

    console.log(`[GameManager] Aborting game in room ${this.room?.roomCode}: ${reason}`);

    // 1. Immediately cancel all timers and intervals
    this.clearTimers();

    // 2. Clear canvas data on server and clients
    if (this.drawingManager) {
      if (typeof this.drawingManager.clear === 'function') {
        this.drawingManager.clear();
      } else if (typeof this.drawingManager.reset === 'function') {
        this.drawingManager.reset();
      }
    }
    this.io.to(this.room.roomCode).emit('canvas_cleared');

    // 3. Reset turn and game state variables
    this.currentWord = null;
    this.currentWordDisplay = null;
    this.offeredWords = [];
    this.currentDrawerId = null;
    this.correctGuessers.clear();
    this.correctGuessCount = 0;
    this.turnPoints.clear();
    this.isRoundEnding = false;

    // 4. Reset room state back to waiting lobby
    this.room.status = 'waiting';
    this.room.game = null;

    // Reset scores & per-round state for all remaining players
    for (const player of this.room.players.values()) {
      player.score = 0;
      player.resetRoundState();
    }

    // 5. Broadcast returned_to_lobby to all remaining clients in the room
    this.io.to(this.room.roomCode).emit('returned_to_lobby', {
      room: this.room.toPublic(),
      reason,
      message,
    });

    // 6. Broadcast system notification to room chat
    this.io.to(this.room.roomCode).emit('chat_message', {
      id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: 'SketchClub',
      text: message,
      type: 'system',
      timestamp: Date.now(),
    });
  }

  // ── 8. Disconnect Handlers ──────────────────────────────────────────────

  /**
   * Handles player disconnection during an active game.
   * @param {string} sessionId
   */
  handlePlayerDisconnect(sessionId) {
    if (this.roundStatus === 'game_over' || this.roundStatus === 'idle') return;

    // Safely finalize any unfinished stroke from this player
    this.drawingManager.handleDisconnect(sessionId);

    // If active connected count is 1, trigger auto-win countdown immediately
    const connected = Array.from(this.room.players.values()).filter((p) => p.isConnected);
    if (connected.length === 1) {
      this.checkAutoWinCondition();
      return;
    }

    // If the active drawer disconnects during word selection or drawing:
    if (sessionId === this.currentDrawerId) {
      console.warn(`[GameManager] Current drawer ${sessionId} disconnected during round.`);
      if (this.roundStatus === 'selecting_word' || this.roundStatus === 'drawing') {
        this.endRound('drawer_disconnected');
      }
      return;
    }

    // If a guesser disconnected, check if remaining guessers have already guessed:
    if (this.roundStatus === 'drawing') {
      const activeGuessers = Array.from(this.room.players.values()).filter(
        (p) => p.isConnected && p.sessionId !== this.currentDrawerId
      );

      if (activeGuessers.length > 0 && this.correctGuessers.size >= activeGuessers.length) {
        this.endRound('all_guessed');
      }
    }
  }

  // ── 9. Reconnection State Recovery ──────────────────────────────────────

  /**
   * Synchronizes the current active game state to a reconnecting socket.
   * Preserves secret word privacy: only the active drawer receives `word`.
   * Guessers receive masked `wordDisplay`.
   * @param {import('socket.io').Socket} socket - Reconnecting client socket
   * @param {string} sessionId - Reconnecting player's permanent session ID
   */
  sendReconnectState(socket, sessionId) {
    if (!socket || !sessionId) return;
    if (this.roundStatus === 'idle' || this.roundStatus === 'game_over') return;

    const drawer = this.room.getPlayerBySessionId(this.currentDrawerId);
    const isDrawer = (sessionId === this.currentDrawerId);
    const drawerPublic = drawer ? drawer.toPublic() : null;

    if (this.roundStatus === 'selecting_word') {
      const remainingTimeout = this.selectEndsAt
        ? Math.max(1, Math.ceil((this.selectEndsAt - Date.now()) / 1000))
        : this.wordSelectTimeout;

      if (isDrawer && this.offeredWords.length > 0) {
        socket.emit('word_choices', {
          choices: this.offeredWords,
          drawTime: this.drawTime,
          timeout: remainingTimeout,
        });
      } else {
        socket.emit('game_started', {
          currentRound: this.currentRound,
          totalRounds: this.totalRounds,
          drawerOrder: this.drawerOrder,
          drawer: drawerPublic,
        });
      }
    } else if (this.roundStatus === 'drawing') {
      const remainingMs = this.roundEndsAt ? Math.max(0, this.roundEndsAt - Date.now()) : 0;
      const remainingSec = Math.ceil(remainingMs / 1000);

      const payload = {
        round: this.currentRound,
        totalRounds: this.totalRounds,
        drawer: drawerPublic,
        wordLength: this.currentWord ? this.currentWord.length : 0,
        roundEndsAt: this.roundEndsAt,
        drawTime: this.drawTime,
        hasGuessedCorrectly: this.correctGuessers.has(sessionId),
      };

      if (isDrawer) {
        payload.word = this.currentWord;
      } else {
        payload.wordDisplay = this.currentWordDisplay ? this.currentWordDisplay.display : '';
      }

      socket.emit('round_start', payload);
      socket.emit('timer_tick', { timeLeft: remainingSec });
    } else if (this.roundStatus === 'round_ended') {
      const scoreSnapshot = Array.from(this.room.players.values()).map((p) => ({
        id: p.sessionId,
        name: p.name,
        score: p.score,
      }));

      socket.emit('round_end', {
        round: this.currentRound,
        totalRounds: this.totalRounds,
        word: this.currentWord,
        drawerId: this.currentDrawerId,
        drawerBonus: this.lastDrawerBonus || 0,
        scores: scoreSnapshot,
        turnEarnings: this.lastTurnEarnings || {},
        reason: this.lastRoundReason || 'time_up',
      });
    }
  }

  // ── 10. Teardown ────────────────────────────────────────────────────────

  /**
   * Clears all running timeouts and intervals.
   */
  clearTimers() {
    this.clearAutoWinTimers();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.selectTimeout) {
      clearTimeout(this.selectTimeout);
      this.selectTimeout = null;
    }
    this.selectEndsAt = null;
    if (this.roundEndTimeout) {
      clearTimeout(this.roundEndTimeout);
      this.roundEndTimeout = null;
    }
    this.hintThresholds = [];
  }
}

module.exports = GameManager;
