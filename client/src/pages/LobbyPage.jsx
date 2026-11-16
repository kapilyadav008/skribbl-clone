/**
 * pages/LobbyPage.jsx
 *
 * SketchClub Studio Waiting Lobby (/room/:roomCode).
 *
 * CONCEPT: Styled like a bustling art studio workshop table where artists gather.
 * Features artist swatch badges, tape accents, tactile clipboard panels, and crisp ink borders.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { copyToClipboard } from '../utils/helpers';
import SettingsModal from '../components/lobby/SettingsModal';
import WordSelectModal from '../components/game/WordSelectModal';
import GameArena from '../components/game/GameArena';
import { TapeBadge, StarDoodle, ScribbleUnderline } from '../components/common/Doodles';

export default function LobbyPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const {
    room,
    player,
    isSocketConnected,
    loading,
    error,
    gameStarted,
    gameState,
    selectWord,
    joinRoomAction,
    updateSettingsAction,
    startGameAction,
    leaveRoomAction,
  } = useRoom();

  const [copied, setCopied] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [reconnectName, setReconnectName] = useState(
    sessionStorage.getItem('lastPlayerName') || ''
  );

  const cleanCode = (roomCode || '').toUpperCase();

  // ── Auto-reconnect if player refreshes or arrives at /room/:code directly ───
  useEffect(() => {
    if (!room && cleanCode) {
      if (sessionStorage.getItem(`hasExplicitlyLeft_${cleanCode}`) === 'true') {
        return;
      }
      const storedName = sessionStorage.getItem('lastPlayerName');
      if (storedName) {
        joinRoomAction({ roomCode: cleanCode, playerName: storedName }).catch(() => {
          // Handled in context
        });
      }
    }
  }, [room, cleanCode, joinRoomAction]);

  const handleCopyInvite = async () => {
    const inviteUrl = `${window.location.origin}/join/${cleanCode}`;
    const success = await copyToClipboard(inviteUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleLeave = () => {
    leaveRoomAction(cleanCode);
    navigate('/');
  };

  const handleSaveSettings = (newSettings) => {
    updateSettingsAction(newSettings);
    setIsSettingsModalOpen(false);
  };

  const isHost = player?.isHost || (room && player && room.hostId === player.id);
  const connectedPlayers = room?.players?.filter((p) => p.isConnected) || [];
  const connectedCount =
    room?.connectedPlayerCount !== undefined
      ? room.connectedPlayerCount
      : connectedPlayers.length;
  const canStart = isHost && connectedPlayers.length >= 2;
  const isGameActive = Boolean(gameState?.status && gameState.status !== 'idle');

  // Prompt nickname if landing directly on /room/:code without session name
  if (!room && !loading) {
    return (
      <div className="min-h-screen bg-paper bg-notebook-dots text-ink flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-paper-pure border-2 border-ink shadow-ink-xl rounded-2xl p-6 text-center space-y-4 relative">
          <div className="tape-strip w-28 h-5 absolute -top-2.5 left-1/2 -translate-x-1/2 transform -rotate-1"></div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-ink">
            Room: <span className="text-coral font-mono">{cleanCode}</span>
          </h2>
          <p className="text-xs text-ink-light font-medium">
            Please enter your nickname to join this room.
          </p>
          <input
            type="text"
            placeholder="Your name..."
            value={reconnectName}
            onChange={(e) => setReconnectName(e.target.value)}
            className="w-full px-4 py-3 bg-paper border-2 border-ink rounded-lg text-ink font-bold text-sm focus:outline-none focus:bg-white"
          />
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-2.5 bg-paper hover:bg-paper-warm border-2 border-ink/30 text-ink rounded-lg text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (reconnectName.trim()) {
                  sessionStorage.removeItem(`hasExplicitlyLeft_${cleanCode}`);
                  joinRoomAction({ roomCode: cleanCode, playerName: reconnectName.trim() });
                }
              }}
              className="flex-1 py-2.5 bg-cobalt hover:bg-cobalt-hover text-white btn-tactile rounded-lg text-xs font-black"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Live Game Arena during active game rounds ──────────────────────
  if (isGameActive) {
    return (
      <div className="min-h-screen bg-paper bg-notebook-dots text-ink p-3 sm:p-5 md:p-6 flex flex-col items-center">
        {/* Global Error Banner */}
        {error && (
          <div className="w-full max-w-7xl mb-3 bg-coral/10 border-2 border-coral text-coral-hover px-4 py-3 rounded-lg text-xs font-bold shadow-ink-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Live In-Game Arena */}
        <GameArena />

        {/* Word Selection Modal (Phase 6.2) */}
        {gameState?.status === 'selecting_word' && (
          <WordSelectModal
            isOpen={true}
            isDrawer={gameState.isDrawer}
            wordChoices={gameState.wordChoices}
            drawerName={gameState.currentDrawer?.name || 'The drawer'}
            timeLeft={gameState.timeLeft}
            onSelectWord={selectWord}
            error={error}
          />
        )}
      </div>
    );
  }

  // ── Render Pre-Game Studio Table Lobby ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper bg-notebook-dots text-ink p-4 sm:p-6 md:p-8 flex flex-col items-center">
      <div className="max-w-5xl w-full space-y-6">
        {/* Top Studio Clipboard Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-paper-pure border-2 border-ink shadow-ink-lg px-6 py-4 rounded-xl relative">
          {/* Tape Accent */}
          <div className="tape-strip w-24 h-5 absolute -top-2.5 left-8 transform -rotate-2 hidden sm:block"></div>

          {/* Left: Room Code display */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-paper-warm border-2 border-ink flex items-center justify-center text-2xl shadow-ink-sm">
              🎨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold tracking-widest text-ink-light uppercase block">
                  STUDIO ROOM
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isSocketConnected
                      ? 'bg-lime/20 text-ink border-lime'
                      : 'bg-coral/20 text-coral-hover border-coral'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSocketConnected ? 'bg-lime' : 'bg-coral'
                    }`}
                  ></span>
                  {isSocketConnected ? 'LIVE' : 'RECONNECTING'}
                </span>
              </div>
              <span className="text-3xl font-mono font-black text-ink tracking-widest">
                {cleanCode}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleCopyInvite}
              className="px-4 py-2.5 text-xs font-mono font-bold bg-paper-warm hover:bg-paper-dark text-ink border-2 border-ink btn-tactile rounded-lg flex items-center gap-2"
              title="Copy link to clipboard"
            >
              <span>{copied ? '✅ COPIED!' : '📋 COPY INVITE'}</span>
            </button>
            <button
              onClick={handleLeave}
              className="px-4 py-2.5 text-xs font-mono font-bold bg-paper hover:bg-coral/10 text-ink-light hover:text-coral border-2 border-ink/40 rounded-lg transition-colors"
            >
              LEAVE
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-coral/10 border-2 border-coral text-coral-hover px-4 py-3 rounded-lg text-xs font-bold shadow-ink-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Game Started Notification (Phase 5 Milestone) */}
        {gameStarted && (
          <div className="bg-lime/20 border-2 border-lime text-ink px-6 py-5 rounded-2xl shadow-ink-lg text-center space-y-2 relative overflow-hidden animate-bounce">
            <div className="flex justify-center items-center gap-2 text-2xl">
              <span>🎉</span>
              <span className="font-black uppercase tracking-wider text-lg">
                Match Started!
              </span>
              <span>🎨</span>
            </div>
            <p className="text-xs font-medium text-ink-light max-w-lg mx-auto">
              The game engine is live. The first drawer is selecting their secret word!
              <br />
              <span className="font-hand text-base text-cobalt font-bold">
                (Full in-game drawing canvas & live guessing arena arriving in Phase 6)
              </span>
            </p>
          </div>
        )}

        {/* Studio Workspace Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Left: Players in the Room (2 Columns) */}
          <div className="md:col-span-2 bg-paper-pure border-2 border-ink shadow-ink-lg rounded-2xl p-6 space-y-4 relative">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-ink/10 pb-3">
              <div>
                <h2 className="text-lg font-black uppercase text-ink flex items-center gap-2">
                  <span>Players</span>
                  <TapeBadge color="bg-tape-yellow">
                    {connectedCount} / {room?.settings?.maxPlayers || 8}
                  </TapeBadge>
                </h2>
                <p className="font-hand text-sm text-ink-light mt-0.5">
                  Waiting for players to get ready
                </p>
              </div>
            </div>

            {/* Player Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {room?.players?.map((p, idx) => {
                const isCurrentPlayer = player && (p.id === player.id || p.socketId === player.socketId);
                const isRoomHost = room.hostId === p.id || p.isHost;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${
                      isCurrentPlayer
                        ? 'bg-paper-warm border-cobalt shadow-ink-sm ring-1 ring-cobalt/30'
                        : 'bg-paper border-ink/30 hover:border-ink/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar / Swatch Frame */}
                      <div className="w-11 h-11 rounded-lg border-2 border-ink bg-paper-pure flex items-center justify-center text-xl shadow-ink-sm flex-shrink-0">
                        {isRoomHost ? '👑' : ['🎨', '✏️', '🖌️', '📐', '🖍️'][idx % 5]}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-ink truncate max-w-[120px]">
                            {p.name}
                          </span>
                          {isCurrentPlayer && (
                            <span className="text-[10px] font-mono bg-lime text-ink px-1.5 py-0.5 rounded font-black border border-ink/30 uppercase">
                              YOU
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-hand text-ink-light block">
                          {p.isConnected ? 'Ready' : 'Disconnected (reconnecting)'}
                        </span>
                      </div>
                    </div>

                    {isRoomHost && (
                      <span className="text-[11px] font-mono font-bold bg-amber-200 text-ink border border-ink/30 px-2 py-0.5 rounded shadow-sm">
                        HOST
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Game Rules & Start Game (1 Column) */}
          <div className="space-y-6">
            {/* Rules / Settings Card */}
            <div className="bg-paper-pure border-2 border-ink shadow-ink-lg rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b-2 border-ink/10 pb-3">
                <h3 className="font-black text-sm uppercase text-ink tracking-wider flex items-center gap-1.5">
                  <span>📜 Game Rules</span>
                </h3>
                {isHost && (
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="text-xs font-mono font-bold text-cobalt hover:underline flex items-center gap-1"
                  >
                    EDIT ✏️
                  </button>
                )}
              </div>

              <div className="space-y-2 text-xs font-semibold">
                <div className="flex justify-between py-1.5 border-b border-dashed border-ink/15">
                  <span className="text-ink-light font-mono">ROUNDS:</span>
                  <span className="font-bold text-ink">{room?.settings?.rounds || 3}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-dashed border-ink/15">
                  <span className="text-ink-light font-mono">DRAW CLOCK:</span>
                  <span className="font-bold text-ink">{room?.settings?.drawTime || 80}s</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-dashed border-ink/15">
                  <span className="text-ink-light font-mono">WORD CHOICES:</span>
                  <span className="font-bold text-ink">{room?.settings?.wordCount || 3}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-dashed border-ink/15">
                  <span className="text-ink-light font-mono">HINTS:</span>
                  <span className="font-bold text-ink">{room?.settings?.hints || 2}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-ink-light font-mono">WORD MODE:</span>
                  <span className="font-bold text-coral uppercase">
                    {room?.settings?.wordMode || 'normal'}
                  </span>
                </div>
              </div>

              {!isHost && (
                <div className="text-[11px] font-hand text-ink-light text-center border-t border-ink/10 pt-2">
                  Only the room host can change these rules.
                </div>
              )}
            </div>

            {/* Start Game Action Box */}
            <div className="bg-paper-warm border-2 border-ink shadow-ink-lg rounded-2xl p-6 text-center space-y-3">
              {isHost ? (
                <div className="space-y-2.5">
                  <button
                    onClick={startGameAction}
                    disabled={!canStart || gameStarted}
                    className="w-full py-4 bg-lime hover:bg-lime-hover text-ink btn-tactile rounded-xl text-base font-black tracking-wide flex items-center justify-center gap-2 shadow-ink-lg disabled:bg-paper-dark disabled:border-ink/30 disabled:text-ink-faint"
                  >
                    <span>
                      {gameState?.status === 'selecting_word'
                        ? '🎨 Choosing Word...'
                        : gameStarted
                        ? 'Match In Progress'
                        : 'Start Game'}
                    </span>
                  </button>

                  {!canStart && !gameStarted && (
                    <p className="text-xs font-hand text-coral-hover font-bold">
                      Not enough players. Waiting for another player to join ({connectedPlayers.length}/2)
                    </p>
                  )}
                  {canStart && !gameStarted && (
                    <p className="text-xs font-hand text-ink-light font-bold">
                      Ready! Click Start Game when ready.
                    </p>
                  )}
                  {gameState?.status === 'selecting_word' && (
                    <p className="text-xs font-hand text-cobalt font-bold">
                      Round {gameState.currentRound || 1} word selection in progress...
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-2 space-y-2">
                  <div className="text-2xl animate-spin inline-block">⏳</div>
                  <p className="font-hand text-lg text-ink font-bold">
                    {gameState?.status === 'selecting_word'
                      ? 'Choosing a secret word to sketch...'
                      : connectedPlayers.length < 2
                      ? 'Not enough players. Waiting for another player to join.'
                      : 'Waiting for the host to start the game...'}
                  </p>
                  <p className="text-[11px] font-mono text-ink-faint">
                    {gameState?.status === 'selecting_word'
                      ? 'Get your pencils and guessing minds ready!'
                      : 'Chat with friends or practice doodles!'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Host Settings Modal */}
      {isHost && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          initialSettings={room?.settings || {}}
          onSave={handleSaveSettings}
          title="Edit Game Rules"
          submitButtonText="Save Rules"
        />
      )}
    </div>
  );
}
