/**
 * context/RoomContext.jsx
 *
 * Central React Context managing Room, Player, Socket, and Game state.
 *
 * RESPONSIBILITIES:
 * 1. Manages socket connection lifecycle and event listeners.
 * 2. Maintains room metadata, player list, and host status.
 * 3. Maintains authoritative Game State (round status, drawer, word choices, blanks, timer, scores).
 * 4. Provides clean async actions for room lifecycle (createRoom, joinRoom, updateSettings, startGame, leaveRoom).
 * 5. Provides gameplay actions (selectWord, submitGuess).
 * 6. Resilient to page reloads and socket reconnects using permanent sessionStorage playerSessionId.
 * 7. Cleans up event listeners to prevent duplicate triggers.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import socket from '../socket/socket';
import { createRoom as apiCreateRoom, getRoomInfo as apiGetRoomInfo } from '../api/roomApi';
import { getOrCreateSessionId } from '../utils/helpers';

const initialGameState = {
  status: 'idle', // 'idle' | 'selecting_word' | 'drawing' | 'round_ended' | 'game_over'
  currentRound: 0,
  totalRounds: 0,
  currentDrawer: null, // { id, name, isHost, ... }
  isDrawer: false,
  wordChoices: [], // Array of strings (drawer only during 'selecting_word')
  wordDisplay: '', // e.g. "_ _ _ _ _" (guessers) or secretWord (drawer)
  secretWord: '', // string (drawer only during round, or revealed to all on round_end)
  wordLength: 0,
  timeLeft: 0,
  drawTime: 0,
  roundEndsAt: null,
  hasGuessedCorrectly: false,
  scores: [], // Array of { id, name, score }
  roundEndData: null, // { word, drawerId, drawerBonus, scores, reason }
  gameOverData: null, // { winners, finalScores, reason }
};

const RoomContext = createContext(null);

export function RoomProvider({ children }) {
  const [room, setRoom] = useState(null);
  const [player, setPlayer] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(socket.connected);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameState, setGameState] = useState(initialGameState);
  const [chatMessages, setChatMessages] = useState([]);

  // Clear transient error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // ── 1. Setup Global Socket Listeners ───────────────────────────────────────
  useEffect(() => {
    // Ensure persistent session ID is initialized
    getOrCreateSessionId();

    const onConnect = () => {
      setIsSocketConnected(true);
    };

    const onDisconnect = () => {
      setIsSocketConnected(false);
    };

    // ── Room Events ──────────────────────────────────────────────────────────
    const onRoomJoined = (data) => {
      setRoom(data.room);
      setPlayer(data.player);
      setLoading(false);
      setError(null);
      if (data.room.status === 'playing') {
        setGameStarted(true);
      }
    };

    const onPlayerJoined = (data) => {
      setRoom((prev) => {
        if (!prev) return null;
        const players = data.players || prev.players || [];
        const connectedCount =
          data.connectedPlayerCount !== undefined
            ? data.connectedPlayerCount
            : players.filter((p) => p.isConnected).length;
        const totalCount =
          data.playerCount !== undefined ? data.playerCount : players.length;

        return {
          ...prev,
          players,
          connectedPlayerCount: connectedCount,
          playerCount: totalCount,
        };
      });
    };

    const onPlayerLeft = (data) => {
      setRoom((prev) => {
        if (!prev) return null;
        const updatedHostId = data.newHostId || prev.hostId;
        const players = data.players || [];
        const connectedCount =
          data.connectedPlayerCount !== undefined
            ? data.connectedPlayerCount
            : players.filter((p) => p.isConnected).length;
        const totalCount =
          data.playerCount !== undefined ? data.playerCount : players.length;

        return {
          ...prev,
          hostId: updatedHostId,
          players,
          connectedPlayerCount: connectedCount,
          playerCount: totalCount,
        };
      });

      // Update current player's isHost if host was transferred to this session
      setPlayer((prev) => {
        if (!prev) return null;
        if (data.newHostId && prev.id === data.newHostId) {
          return { ...prev, isHost: true };
        }
        return prev;
      });
    };

    const onPlayerStatusChange = (data) => {
      setRoom((prev) => {
        if (!prev) return null;
        const players = data.players || prev.players || [];
        const connectedCount =
          data.connectedPlayerCount !== undefined
            ? data.connectedPlayerCount
            : players.filter((p) => p.isConnected).length;
        const totalCount =
          data.playerCount !== undefined ? data.playerCount : players.length;

        return {
          ...prev,
          players,
          connectedPlayerCount: connectedCount,
          playerCount: totalCount,
        };
      });
    };

    const onSettingsUpdated = (data) => {
      setRoom((prev) => (prev ? { ...prev, settings: data.settings } : prev));
    };

    const onRoomError = (data) => {
      setError(data.message || 'Room error occurred');
      setLoading(false);
    };

    // ── Phase 3 Game Lifecycle Events ────────────────────────────────────────
    const onGameStarted = (data) => {
      setGameStarted(true);
      setRoom((prev) => (prev ? { ...prev, status: 'playing' } : prev));
      const localSessionId = getOrCreateSessionId();
      let drawer = data.drawer;
      if (!drawer && Array.isArray(data.drawerOrder) && data.drawerOrder.length > 0) {
        const firstId = data.drawerOrder[0];
        const p = room?.players?.find((pl) => pl.id === firstId);
        if (p) drawer = { id: p.id, name: p.name, isHost: p.isHost };
      }
      const isDrawerClient = Boolean(
        localSessionId && drawer?.id && localSessionId === drawer.id
      );

      setGameState((prev) => ({
        ...prev,
        status: 'selecting_word',
        currentRound: data.currentRound || 1,
        totalRounds: data.totalRounds || prev.totalRounds,
        currentDrawer: drawer || prev.currentDrawer,
        isDrawer: isDrawerClient,
        wordChoices: [],
        secretWord: '',
        wordDisplay: '',
        hasGuessedCorrectly: false,
        roundEndData: null,
        gameOverData: null,
      }));
    };

    const onDrawerSelecting = (data) => {
      setGameState((prev) => ({
        ...prev,
        status: 'selecting_word',
        currentRound: data.currentRound || prev.currentRound,
        totalRounds: data.totalRounds || prev.totalRounds,
        currentDrawer: data.drawer || prev.currentDrawer,
        isDrawer: false,
        wordChoices: [],
        secretWord: '',
        wordDisplay: '',
        hasGuessedCorrectly: false,
        roundEndData: null,
      }));
    };

    const onWordChoices = (data) => {
      // Sent strictly to the active drawer
      setGameState((prev) => ({
        ...prev,
        status: 'selecting_word',
        isDrawer: true,
        wordChoices: data.choices || [],
        drawTime: data.drawTime || prev.drawTime,
        timeLeft: data.timeout || 15,
        hasGuessedCorrectly: false,
        roundEndData: null,
      }));
    };

    const onRoundStart = (data) => {
      const localSessionId = getOrCreateSessionId();
      // Determine drawer identity strictly by comparing drawer.id with local authenticated session ID
      const drawerSessionId = data.drawer?.id;
      const isDrawerClient = Boolean(
        localSessionId && drawerSessionId && localSessionId === drawerSessionId
      );

      setGameState((prev) => ({
        ...prev,
        status: 'drawing',
        currentRound: data.round || prev.currentRound,
        totalRounds: data.totalRounds || prev.totalRounds,
        currentDrawer: data.drawer || null,
        isDrawer: isDrawerClient,
        // Drawer sees secret word; guessers only see masked blank characters
        secretWord: isDrawerClient ? (data.word || '') : '',
        wordDisplay: isDrawerClient ? (data.word || '') : (data.wordDisplay || ''),
        wordLength: data.wordLength || (data.word ? data.word.length : 0),
        roundEndsAt: data.roundEndsAt || null,
        drawTime: data.drawTime || prev.drawTime,
        timeLeft: data.drawTime || prev.timeLeft,
        wordChoices: [],
        hasGuessedCorrectly: Boolean(data.hasGuessedCorrectly),
        roundEndData: null,
      }));
    };

    const onTimerTick = (data) => {
      setGameState((prev) => ({
        ...prev,
        timeLeft: data.timeLeft,
      }));
    };

    const onCorrectGuess = (data) => {
      const mySessionId = getOrCreateSessionId();

      setGameState((prev) => ({
        ...prev,
        hasGuessedCorrectly:
          prev.hasGuessedCorrectly || data.playerId === mySessionId,
        scores: data.scores || prev.scores,
      }));

      // Update room player scores in real time
      if (Array.isArray(data.scores)) {
        setRoom((prev) => {
          if (!prev || !prev.players) return prev;
          const scoreMap = new Map(data.scores.map((s) => [s.id, s.score]));
          const updatedPlayers = prev.players.map((p) => {
            if (scoreMap.has(p.id)) {
              return { ...p, score: scoreMap.get(p.id) };
            }
            return p;
          });
          return { ...prev, players: updatedPlayers };
        });
      }

      // Update active player's score if this client guessed correctly
      setPlayer((prev) => {
        if (!prev) return null;
        if (prev.id === data.playerId) {
          return { ...prev, score: data.score };
        }
        return prev;
      });
    };

    const onRoundEnd = (data) => {
      setGameState((prev) => ({
        ...prev,
        status: 'round_ended',
        currentRound: data.round || prev.currentRound,
        totalRounds: data.totalRounds || prev.totalRounds,
        // Secret word is now revealed to all players at the end of the round
        secretWord: data.word,
        wordDisplay: data.word,
        scores: data.scores || prev.scores,
        roundEndData: data,
        wordChoices: [],
      }));

      // Update room players with final scores (including drawer bonus)
      if (Array.isArray(data.scores)) {
        setRoom((prev) => {
          if (!prev || !prev.players) return prev;
          const scoreMap = new Map(data.scores.map((s) => [s.id, s.score]));
          const updatedPlayers = prev.players.map((p) => {
            if (scoreMap.has(p.id)) {
              return { ...p, score: scoreMap.get(p.id) };
            }
            return p;
          });
          return { ...prev, players: updatedPlayers };
        });
      }
    };

    const onGameOver = (data) => {
      setGameState((prev) => ({
        ...prev,
        status: 'game_over',
        gameOverData: data,
        scores: data.finalScores || prev.scores,
      }));

      setRoom((prev) => (prev ? { ...prev, status: 'ended' } : prev));

      if (Array.isArray(data.finalScores)) {
        setRoom((prev) => {
          if (!prev || !prev.players) return prev;
          const scoreMap = new Map(data.finalScores.map((s) => [s.id, s.score]));
          const updatedPlayers = prev.players.map((p) => {
            if (scoreMap.has(p.id)) {
              return { ...p, score: scoreMap.get(p.id) };
            }
            return p;
          });
          return { ...prev, players: updatedPlayers };
        });
      }
    };

    const onGameError = (data) => {
      setError(data.message || 'Game error occurred');
    };

    const onChatMessage = (data) => {
      if (data && typeof data === 'object') {
        setChatMessages((prev) => [...prev.slice(-99), data]);
      }
    };

    const onHintRevealed = (data) => {
      setGameState((prev) => ({
        ...prev,
        wordDisplay: prev.isDrawer ? prev.secretWord : (data.wordDisplay || prev.wordDisplay),
      }));
    };

    const onReturnedToLobby = (data) => {
      setGameStarted(false);
      setGameState(initialGameState);
      if (data?.room) {
        setRoom(data.room);
      }
      setChatMessages([]);
    };

    // Register all socket listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_joined', onRoomJoined);
    socket.on('player_joined', onPlayerJoined);
    socket.on('player_left', onPlayerLeft);
    socket.on('player_status_change', onPlayerStatusChange);
    socket.on('settings_updated', onSettingsUpdated);
    socket.on('room_error', onRoomError);
    socket.on('game_started', onGameStarted);
    socket.on('drawer_selecting', onDrawerSelecting);
    socket.on('word_choices', onWordChoices);
    socket.on('round_start', onRoundStart);
    socket.on('timer_tick', onTimerTick);
    socket.on('correct_guess', onCorrectGuess);
    socket.on('round_end', onRoundEnd);
    socket.on('game_over', onGameOver);
    socket.on('game_error', onGameError);
    socket.on('chat_message', onChatMessage);
    socket.on('hint_revealed', onHintRevealed);
    socket.on('returned_to_lobby', onReturnedToLobby);

    // Clean up all socket listeners on unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_joined', onRoomJoined);
      socket.off('player_joined', onPlayerJoined);
      socket.off('player_left', onPlayerLeft);
      socket.off('player_status_change', onPlayerStatusChange);
      socket.off('settings_updated', onSettingsUpdated);
      socket.off('room_error', onRoomError);
      socket.off('game_started', onGameStarted);
      socket.off('drawer_selecting', onDrawerSelecting);
      socket.off('word_choices', onWordChoices);
      socket.off('round_start', onRoundStart);
      socket.off('timer_tick', onTimerTick);
      socket.off('correct_guess', onCorrectGuess);
      socket.off('round_end', onRoundEnd);
      socket.off('game_over', onGameOver);
      socket.off('game_error', onGameError);
      socket.off('chat_message', onChatMessage);
      socket.off('hint_revealed', onHintRevealed);
      socket.off('returned_to_lobby', onReturnedToLobby);
    };
  }, []);

  // ── 2. Action Handlers ─────────────────────────────────────────────────────

  /**
   * Connects the socket if currently disconnected.
   */
  const ensureSocketConnected = useCallback(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  /**
   * Creates a new room via REST and joins it via Socket.IO.
   */
  const createRoomAction = useCallback(
    async ({ hostName, settings }) => {
      setLoading(true);
      setError(null);
      try {
        const sessionId = getOrCreateSessionId();
        sessionStorage.setItem('lastPlayerName', hostName);

        const data = await apiCreateRoom(hostName, settings, sessionId);
        const { roomCode } = data;
        sessionStorage.removeItem(`hasExplicitlyLeft_${roomCode}`);

        ensureSocketConnected();

        socket.emit('join_room', {
          roomCode,
          playerName: hostName,
          sessionId,
        });

        return { roomCode, inviteLink: data.inviteLink };
      } catch (err) {
        setLoading(false);
        setError(err.message || 'Failed to create room');
        throw err;
      }
    },
    [ensureSocketConnected]
  );

  /**
   * Validates and joins an existing room.
   */
  const joinRoomAction = useCallback(
    async ({ roomCode, playerName }) => {
      setLoading(true);
      setError(null);
      try {
        const cleanCode = (roomCode || '').trim().toUpperCase();
        if (!cleanCode) throw new Error('Please enter a room code');
        if (!playerName || !playerName.trim()) throw new Error('Please enter your name');

        const sessionId = getOrCreateSessionId();
        sessionStorage.setItem('lastPlayerName', playerName.trim());
        sessionStorage.removeItem(`hasExplicitlyLeft_${cleanCode}`);

        // Validate room exists before attempting socket join
        await apiGetRoomInfo(cleanCode);

        ensureSocketConnected();

        socket.emit('join_room', {
          roomCode: cleanCode,
          playerName: playerName.trim(),
          sessionId,
        });

        return { roomCode: cleanCode };
      } catch (err) {
        setLoading(false);
        setError(err.message || 'Failed to join room');
        throw err;
      }
    },
    [ensureSocketConnected]
  );

  /**
   * Host updates room settings.
   */
  const updateSettingsAction = useCallback((newSettings) => {
    ensureSocketConnected();
    socket.emit('update_settings', { settings: newSettings });
  }, [ensureSocketConnected]);

  /**
   * Host starts the game.
   */
  const startGameAction = useCallback(() => {
    ensureSocketConnected();
    socket.emit('start_game');
  }, [ensureSocketConnected]);

  /**
   * Player leaves the room.
   */
  const leaveRoomAction = useCallback((targetRoomCode) => {
    const code = (targetRoomCode || room?.roomCode || '').trim().toUpperCase();
    if (code) {
      sessionStorage.setItem(`hasExplicitlyLeft_${code}`, 'true');
    }
    if (socket.connected) {
      socket.emit('leave_room', {
        roomCode: code,
        sessionId: player?.id,
      });
    }
    setRoom(null);
    setPlayer(null);
    setGameStarted(false);
    setGameState(initialGameState);
  }, [room, player]);

  /**
   * Drawer selects one of the offered word choices.
   */
  const selectWord = useCallback(
    (word) => {
      if (!word || typeof word !== 'string' || !word.trim()) {
        setError('Please select a valid word');
        return;
      }
      ensureSocketConnected();
      socket.emit('select_word', { word: word.trim() });
    },
    [ensureSocketConnected]
  );

  /**
   * Guesser submits a word guess.
   */
  const submitGuess = useCallback(
    (guess) => {
      if (!guess || typeof guess !== 'string' || !guess.trim()) {
        return;
      }
      ensureSocketConnected();
      socket.emit('submit_guess', { guess: guess.trim() });
    },
    [ensureSocketConnected]
  );

  /**
   * Host returns room to lobby table.
   */
  const returnToLobbyAction = useCallback(() => {
    ensureSocketConnected();
    socket.emit('return_to_lobby');
  }, [ensureSocketConnected]);

  const value = {
    room,
    player,
    isSocketConnected,
    loading,
    error,
    gameStarted,
    gameState,
    chatMessages,
    setError,
    createRoomAction,
    joinRoomAction,
    updateSettingsAction,
    startGameAction,
    leaveRoomAction,
    returnToLobbyAction,
    selectWord,
    selectWordAction: selectWord,
    submitGuess,
    submitGuessAction: submitGuess,
    sendChatMessage: submitGuess,
    ensureSocketConnected,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}
