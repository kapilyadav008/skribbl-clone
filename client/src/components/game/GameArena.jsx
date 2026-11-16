/**
 * components/game/GameArena.jsx
 *
 * Phase 6.3–6.7 & Phase 8.1 — Mobile-First Gameplay Layout & Arena Polish
 *
 * Core live multiplayer drawing & guessing arena:
 * - Change 1: Mobile-First Layout:
 *   - Top header: Round counter, timer, masked word / hints, compact leave & room code.
 *   - Canvas: Resolution-independent 4:3 HTML5 canvas with touch-none prevent-scroll.
 *   - Below canvas (Mobile): Split 2-column container:
 *     - Left (~40%): Independently scrollable Players roster.
 *     - Right (~60%): Independently scrollable Chat history stream.
 *   - Bottom sticky/fixed: Full-width guess input for guessers, accessible without scrolling.
 *   - Desktop: Retains clean 3-column architecture (Players | Canvas | Chat).
 * - Change 2: Round-End Score Reveal:
 *   - Leaderboard shows baseline score and guess checkmarks during drawing.
 *   - RoundEndModal reveals secret word, points earned this turn (+150 pts, drawer bonus +50 pts), and total score.
 * - Change 3: Clean chat with green correct-guess notifications & blue turn announcements.
 * - Change 4: Clean terminology ("Players", "Start Game", "Back to Lobby").
 * - Change 5: No hint chat spam.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../../context/RoomContext';
import CanvasArea from './CanvasArea';
import ChatPanel, { GuessInputBar } from './ChatPanel';
import RoundEndModal from './RoundEndModal';
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
  const currentDrawerName = gameState?.currentDrawer?.name || 'Player';
  const currentRound = gameState?.currentRound || 1;
  const totalRounds = gameState?.totalRounds || room?.settings?.rounds || 3;
  const timeLeft = gameState?.timeLeft !== undefined ? gameState.timeLeft : 0;
  const status = gameState?.status || 'drawing';

  const myPlayerId = player?.id;
  const roundEndData = gameState?.roundEndData;

  // Track turn baseline scores (Change 2)
  const [turnStartScores, setTurnStartScores] = useState({});
  const lastTurnKeyRef = useRef(null);

  useEffect(() => {
    if (status === 'drawing' || status === 'selecting_word') {
      const turnKey = `${currentRound}-${gameState?.currentDrawer?.id}`;
      if (lastTurnKeyRef.current !== turnKey) {
        lastTurnKeyRef.current = turnKey;
        const baseline = {};
        (room?.players || []).forEach((p) => {
          baseline[p.id] = p.score || 0;
        });
        setTurnStartScores(baseline);
      }
    }
  }, [status, currentRound, gameState?.currentDrawer?.id, room?.players]);

  // Connected players list
  const connectedPlayers = (room?.players || []).filter((p) => p.isConnected);
  // Sort players by score descending
  const sortedPlayers = [...connectedPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));

  const getRankBadge = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  // Turn points earned this round (from round_end data)
  const turnEarnings = roundEndData?.turnEarnings || {};

  return (
    <div className="w-full max-w-7xl mx-auto space-y-3 sm:space-y-4">
      {/* ── 1. Compact Responsive Header Bar ───────────────────────────────── */}
      <header className="bg-paper-pure border-2 border-ink shadow-ink-lg rounded-2xl p-3 sm:p-4 select-none">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4">
          {/* Top row on mobile / Left on desktop: Room Code, Round Counter, Leave */}
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black tracking-wider text-ink uppercase px-2 py-0.5 bg-paper border border-ink/30 rounded-md">
                ROOM: {room?.roomCode}
              </span>
              <TapeBadge color="bg-tape-yellow" className="text-xs">
                ROUND {currentRound} / {totalRounds}
              </TapeBadge>
            </div>

            <button
              type="button"
              onClick={handleLeave}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-paper hover:bg-coral/10 text-ink-light hover:text-coral border border-ink/40 rounded-md transition-colors"
              title="Leave Room"
            >
              LEAVE
            </button>
          </div>

          {/* Center: Secret Word (Drawer) or Masked Blanks & Hints (Guessers) */}
          <div className="flex flex-col items-center justify-center text-center">
            {isDrawer ? (
              <div className="flex items-center gap-2">
                <TapeBadge color="bg-tape-coral" className="text-[10px]">
                  YOUR WORD
                </TapeBadge>
                <span className="font-mono text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-widest text-cobalt drop-shadow-sm">
                  {gameState?.secretWord || gameState?.wordDisplay || '...'}
                </span>
                <span className="text-xs font-mono font-bold text-ink-faint">
                  ({gameState?.wordLength || (gameState?.secretWord ? gameState.secretWord.length : 0)})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="font-mono text-xl sm:text-2xl md:text-3xl font-black tracking-[0.3em] sm:tracking-[0.35em] text-ink select-none">
                  {gameState?.wordDisplay ||
                    (gameState?.wordLength ? '_ '.repeat(gameState.wordLength).trim() : '...')}
                </span>
                <TapeBadge color="bg-tape-cyan" className="text-[10px]">
                  {gameState?.wordLength || 0} LETTERS
                </TapeBadge>
              </div>
            )}

            <div className="text-[11px] font-hand font-bold text-ink-light mt-0.5">
              {isDrawer ? (
                <span>🎨 You are drawing! Sketch clues on the canvas.</span>
              ) : (
                <span>🎨 {currentDrawerName} is sketching now! Type your guess below.</span>
              )}
            </div>
          </div>

          {/* Right: Authoritative Clock Timer */}
          <div className="flex items-center justify-center w-full sm:w-auto">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border-2 border-ink text-sm sm:text-base font-mono font-black shadow-ink-sm transition-colors ${
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

      {/* ── 2. DESKTOP LAYOUT (lg+: 3-Column: Roster | Canvas | Chat) ─────── */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Player Leaderboard (3 cols) */}
        <aside className="lg:col-span-3 bg-paper-pure border-2 border-ink shadow-ink-lg rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b-2 border-ink/10 pb-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-ink flex items-center gap-1.5">
              <span>Players</span>
              <span className="text-xs font-mono px-2 py-0.5 bg-paper rounded border border-ink/20">
                {connectedPlayers.length}
              </span>
            </h3>
            <span className="text-[11px] font-mono font-bold text-ink-light">SCORE</span>
          </div>

          <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
            {sortedPlayers.map((p, index) => {
              const isCurrentPlayer = myPlayerId && p.id === myPlayerId;
              const isCurrentDrawer = p.id === gameState?.currentDrawer?.id;
              const hasGuessed =
                (isCurrentPlayer && gameState?.hasGuessedCorrectly) || p.roundGuessed === true;
              const displayedScore =
                status === 'drawing' && turnStartScores[p.id] !== undefined
                  ? turnStartScores[p.id]
                  : p.score || 0;

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
                    {displayedScore} pts
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick Tip */}
          <div className="p-3 bg-paper-warm border border-ink/20 rounded-xl text-[11px] font-medium text-ink-light text-center">
            {isDrawer ? (
              <p>✏️ Use colors and brush sizes to sketch clear clues quickly!</p>
            ) : (
              <p>👀 Keep your eyes on the canvas — fast guesses score more points.</p>
            )}
          </div>
        </aside>

        {/* Center Column: Interactive Drawing Canvas (6 cols) */}
        <main className="lg:col-span-6 w-full flex flex-col items-center">
          <CanvasArea isDrawer={isDrawer} roomCode={room?.roomCode} />
        </main>

        {/* Right Column: Live Chat & Guessing Stream (3 cols) */}
        <section className="lg:col-span-3 w-full">
          <ChatPanel showHeader={true} showInput={true} />
        </section>
      </div>

      {/* ── 3. MOBILE-FIRST LAYOUT (< 1024px) ─────────────────────────────── */}
      <div className="block lg:hidden space-y-2.5">
        {/* Main Canvas Area (Full width, 4:3, touch-none) */}
        <main className="w-full flex flex-col items-center">
          <CanvasArea isDrawer={isDrawer} roomCode={room?.roomCode} compact={true} />
        </main>

        {/* Below Canvas Split: Left = Players (38%), Right = Chat History (62%) */}
        <div className="grid grid-cols-12 gap-2 h-44 sm:h-52">
          {/* Left: Compact Players Roster */}
          <div className="col-span-5 bg-paper-pure border-2 border-ink shadow-ink-sm rounded-xl p-2 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink/20 pb-1 mb-1 px-0.5">
              <span className="text-[10px] font-black uppercase text-ink tracking-wider">
                Players ({connectedPlayers.length})
              </span>
              <span className="text-[9px] font-mono font-bold text-ink-light">PTS</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 min-h-0">
              {sortedPlayers.map((p, index) => {
                const isCurrentPlayer = myPlayerId && p.id === myPlayerId;
                const isCurrentDrawer = p.id === gameState?.currentDrawer?.id;
                const hasGuessed =
                  (isCurrentPlayer && gameState?.hasGuessedCorrectly) || p.roundGuessed === true;
                const displayedScore =
                  status === 'drawing' && turnStartScores[p.id] !== undefined
                    ? turnStartScores[p.id]
                    : p.score || 0;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] leading-tight ${
                      isCurrentDrawer
                        ? 'bg-paper-warm border-cobalt ring-1 ring-cobalt/30'
                        : isCurrentPlayer
                        ? 'bg-paper-light border-ink/40'
                        : 'bg-paper border-ink/20'
                    }`}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-mono font-bold text-[10px] w-3 text-center flex-shrink-0 text-ink-light">
                        {index + 1}
                      </span>
                      <div className="truncate">
                        <div className="flex items-center gap-0.5 font-bold text-ink truncate">
                          <span className="truncate">{p.name}</span>
                          {isCurrentDrawer && <span title="Drawing">🎨</span>}
                          {hasGuessed && <span className="text-lime-700 font-black">✓</span>}
                        </div>
                      </div>
                    </div>

                    <span className="font-mono font-black text-[10px] text-ink pl-1 flex-shrink-0">
                      {displayedScore}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Compact Chat Messages Stream */}
          <div className="col-span-7 bg-paper-pure border-2 border-ink shadow-ink-sm rounded-xl overflow-hidden flex flex-col">
            <div className="px-2 py-1 bg-paper-warm border-b border-ink/20 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-ink tracking-wider">Chat</span>
              <span className="text-[9px] font-mono font-bold text-ink-light">
                {isDrawer ? 'Drawing' : 'Guess'}
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel
                showHeader={false}
                showInput={false}
                className="h-full border-0 shadow-none rounded-none bg-transparent"
              />
            </div>
          </div>
        </div>

        {/* Bottom Sticky Bar: Guess Input (for guessers) */}
        {!isDrawer && (
          <div className="sticky bottom-0 z-30 pt-1">
            <div className="rounded-xl overflow-hidden border-2 border-ink shadow-ink-lg">
              <GuessInputBar />
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Round-End Modal / Overlay (Phase 8.1 Change 2) ─────────────── */}
      <RoundEndModal
        isOpen={status === 'round_ended'}
        word={roundEndData?.word || gameState?.secretWord || ''}
        reason={roundEndData?.reason || 'time_up'}
        drawer={gameState?.currentDrawer}
        drawerBonus={roundEndData?.drawerBonus || 0}
        turnEarnings={turnEarnings}
        players={connectedPlayers}
        myPlayerId={myPlayerId}
      />

      {/* ── 5. Game Over Modal (Phase 6.6 & 6.7) ────────────────────────────── */}
      {status === 'game_over' && <GameOverModal />}
    </div>
  );
}
