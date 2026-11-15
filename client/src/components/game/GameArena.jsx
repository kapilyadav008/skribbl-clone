/**
 * components/game/GameArena.jsx
 *
 * Phase 6.3–6.7 — Integrated Game Arena
 *
 * Core live multiplayer drawing & guessing arena:
 * - Header: Room code, round indicator, drawer status, secret word (drawer) or masked blanks / hints (guesser),
 *   and authoritative drawing countdown clock.
 * - Scoreboard (Left): Live player roster with current scores, drawer icon, medals, and correct-guess badges.
 * - Main Canvas (Center): Integrated CanvasArea (DrawingCanvas + DrawingToolbar).
 * - Chat & Guessing (Right): Live ChatPanel with real-time guess evaluation, close hints, and auto-scroll.
 * - Round-End Banner: Displays round summary & revealed word between turns while in round_ended phase.
 * - Game Over Modal: Mounts celebratory podium and final leaderboard when game is complete.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../../context/RoomContext';
import CanvasArea from './CanvasArea';
import ChatPanel from './ChatPanel';
import GameOverModal from './GameOverModal';
import { TapeBadge } from '../common/Doodles';

export default function GameArena() {
  const navigate = useNavigate();
  const { room, player, gameState, leaveRoomAction } = useRoom();

  const handleLeave = () => {
    leaveRoomAction(room?.roomCode);
    navigate('/');
  };

  const isDrawer = Boolean(gameState?.isDrawer);
  const currentDrawerName = gameState?.currentDrawer?.name || 'Artist';
  const currentRound = gameState?.currentRound || 1;
  const totalRounds = gameState?.totalRounds || room?.settings?.rounds || 3;
  const timeLeft = gameState?.timeLeft !== undefined ? gameState.timeLeft : 0;
  const status = gameState?.status || 'drawing';

  // Connected players with scores
  const connectedPlayers = (room?.players || []).filter((p) => p.isConnected);
  // Sort players by score descending
  const sortedPlayers = [...connectedPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Determine correct guessers from score updates or local guess state
  const myPlayerId = player?.id;
  const roundEndData = gameState?.roundEndData;

  const getRankBadge = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {/* ── 1. Arena Header Bar ───────────────────────────────────────────── */}
      <header className="bg-paper-pure border-2 border-ink shadow-ink-lg rounded-2xl p-4 sm:p-5 select-none">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left: Room Code & Round Counter */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black tracking-widest text-ink uppercase px-2.5 py-1 bg-paper border border-ink/30 rounded-md">
                ROOM: {room?.roomCode}
              </span>
              <TapeBadge color="bg-tape-yellow">
                ROUND {currentRound} / {totalRounds}
              </TapeBadge>
            </div>

            <button
              type="button"
              onClick={handleLeave}
              className="px-3 py-1 text-xs font-mono font-bold bg-paper hover:bg-coral/10 text-ink-light hover:text-coral border border-ink/40 rounded-md transition-colors"
              title="Leave Room"
            >
              LEAVE
            </button>
          </div>

          {/* Center: Secret Word or Masked Blank characters & Hints */}
          <div className="flex flex-col items-center justify-center text-center">
            {isDrawer ? (
              <div className="flex items-center gap-2">
                <TapeBadge color="bg-tape-coral" className="text-[10px]">
                  YOUR WORD
                </TapeBadge>
                <span className="font-mono text-2xl sm:text-3xl font-black uppercase tracking-widest text-cobalt drop-shadow-sm">
                  {gameState?.secretWord || gameState?.wordDisplay || '...'}
                </span>
                <span className="text-xs font-mono font-bold text-ink-faint">
                  ({gameState?.wordLength || (gameState?.secretWord ? gameState.secretWord.length : 0)} letters)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="font-mono text-2xl sm:text-3xl font-black tracking-[0.35em] text-ink select-none">
                  {gameState?.wordDisplay || (gameState?.wordLength ? '_ '.repeat(gameState.wordLength).trim() : '...')}
                </span>
                <TapeBadge color="bg-tape-cyan" className="text-[10px]">
                  {gameState?.wordLength || 0} LETTERS
                </TapeBadge>
              </div>
            )}

            <div className="text-[11px] font-hand font-bold text-ink-light mt-0.5">
              {isDrawer ? (
                <span>🎨 You are the active drawer! Draw clues on the canvas.</span>
              ) : (
                <span>🎨 {currentDrawerName} is sketching now! Type your guess in chat.</span>
              )}
            </div>
          </div>

          {/* Right: Authoritative Clock Timer */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-ink text-sm sm:text-base font-mono font-black shadow-ink-sm transition-colors ${
                timeLeft <= 10 && status === 'drawing'
                  ? 'bg-coral text-white animate-pulse'
                  : 'bg-paper-warm text-ink'
              }`}
            >
              <span>⏱️</span>
              <span>{timeLeft}s</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. Round-End Reveal Banner (Between Turns) ─────────────────────── */}
      {status === 'round_ended' && (
        <div className="bg-paper-warm border-2 border-ink shadow-ink-lg rounded-2xl p-4 sm:p-5 text-center space-y-2 animate-fadeIn">
          <div className="inline-block px-3 py-1 bg-lime text-ink border border-ink text-xs font-mono font-black uppercase rounded-full">
            ROUND TURN CONCLUDED
          </div>
          <h3 className="text-xl sm:text-2xl font-black uppercase text-ink">
            The secret word was:{' '}
            <span className="text-coral font-mono tracking-wider">
              {roundEndData?.word || gameState?.secretWord || '???'}
            </span>
          </h3>
          <p className="text-xs font-semibold text-ink-light">
            {roundEndData?.reason === 'all_guessed' && '🎉 Everyone guessed the drawing correctly!'}
            {roundEndData?.reason === 'time_up' && '⏰ Time expired for this sketch!'}
            {roundEndData?.reason === 'drawer_disconnected' && '⚠️ Drawer disconnected mid-turn.'}
            {roundEndData?.drawerBonus > 0 && ` • Drawer awarded +${roundEndData.drawerBonus} bonus pts`}
          </p>
          <p className="text-[11px] font-hand text-ink font-bold animate-pulse">
            Next artist taking the canvas in a few seconds...
          </p>
        </div>
      )}

      {/* ── 3. Main Arena 3-Column Grid (Roster + Canvas + Chat) ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Artists Roster & Leaderboard (3 cols on lg+) */}
        <aside className="lg:col-span-3 order-2 lg:order-1 bg-paper-pure border-2 border-ink shadow-ink-lg rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b-2 border-ink/10 pb-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-ink flex items-center gap-1.5">
              <span>Artists</span>
              <span className="text-xs font-mono px-2 py-0.5 bg-paper rounded border border-ink/20">
                {connectedPlayers.length}
              </span>
            </h3>
            <span className="text-[11px] font-mono font-bold text-ink-light">SCORE</span>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {sortedPlayers.map((p, index) => {
              const isCurrentPlayer = myPlayerId && p.id === myPlayerId;
              const isCurrentDrawer = p.id === gameState?.currentDrawer?.id;
              const hasGuessed =
                (isCurrentPlayer && gameState?.hasGuessedCorrectly) ||
                (p.roundGuessed === true);

              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border-2 transition-all ${
                    isCurrentDrawer
                      ? 'bg-paper-warm border-cobalt shadow-ink-sm ring-1 ring-cobalt/30'
                      : isCurrentPlayer
                      ? 'bg-paper-light border-ink/50'
                      : 'bg-paper border-ink/20'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-mono font-black text-ink-light w-5 text-center flex-shrink-0">
                      {getRankBadge(index)}
                    </span>
                    <div className="truncate">
                      <div className="flex items-center gap-1 text-xs font-bold text-ink truncate">
                        <span className="truncate">{p.name}</span>
                        {isCurrentPlayer && (
                          <span className="text-[10px] text-cobalt font-mono font-bold">(You)</span>
                        )}
                        {p.isHost && <span title="Host">👑</span>}
                        {isCurrentDrawer && <span title="Drawing now">🎨</span>}
                      </div>
                      {hasGuessed && (
                        <span className="text-[10px] font-mono font-bold text-lime-700 flex items-center gap-0.5">
                          <span>✓</span> Guessed
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="font-mono font-black text-xs text-ink pl-2 flex-shrink-0">
                    {p.score || 0} pts
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick Artist Tip */}
          <div className="p-3 bg-paper-warm border border-ink/20 rounded-xl text-[11px] font-medium text-ink-light text-center">
            {isDrawer ? (
              <p>✏️ Use colors and brush sizes to sketch clear shapes quickly!</p>
            ) : (
              <p>👀 Keep your eyes on the canvas — fast guesses score up to 10x remaining seconds.</p>
            )}
          </div>
        </aside>

        {/* Center Column: Interactive Drawing Canvas (6 cols on lg+) */}
        <main className="lg:col-span-6 order-1 lg:order-2 w-full flex flex-col items-center">
          <CanvasArea
            isDrawer={isDrawer}
            roomCode={room?.roomCode}
          />
        </main>

        {/* Right Column: Live Chat & Guessing Stream (3 cols on lg+) */}
        <section className="lg:col-span-3 order-3 w-full">
          <ChatPanel />
        </section>
      </div>

      {/* ── 4. Game Over Modal (Phase 6.6 & 6.7) ────────────────────────────── */}
      {status === 'game_over' && <GameOverModal />}
    </div>
  );
}
