/**
 * components/game/GameOverModal.jsx
 *
 * Phase 6.6 & 6.7 — Match Completion Podium & Leaderboard
 *
 * Displays when `gameState.status === 'game_over'`:
 * - Celebratory SketchClub winner's podium (1st, 2nd, 3rd place).
 * - Full ranked final scoreboard.
 * - Graceful tie handling.
 * - Host actions: "Play Again", "Return to Studio Table".
 * - All players: "Leave Room".
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../../context/RoomContext';
import { TapeBadge } from '../common/Doodles';

export default function GameOverModal() {
  const navigate = useNavigate();
  const { player, room, gameState, startGameAction, returnToLobbyAction, leaveRoomAction } = useRoom();

  const handleLeave = () => {
    leaveRoomAction(room?.roomCode);
    navigate('/');
  };

  const gameOverData = gameState?.gameOverData;
  const isHost = player?.isHost || (room && player && room.hostId === player.id);

  if (gameState?.status !== 'game_over') {
    return null;
  }

  const finalScores = gameOverData?.finalScores || [];
  const winners = gameOverData?.winners || [];
  const isTie = winners.length > 1;

  const firstPlace = finalScores[0] || null;
  const secondPlace = finalScores[1] || null;
  const thirdPlace = finalScores[2] || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-xs select-none animate-fadeIn"
    >
      <div className="relative w-full max-w-2xl bg-paper-pure border-2 border-ink shadow-ink-xl rounded-3xl p-6 sm:p-8 text-center space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Decorative Tape Accent */}
        <div className="tape-strip w-36 h-6 absolute -top-3 left-1/2 -translate-x-1/2 transform -rotate-1 pointer-events-none" />

        {/* ── Title Header ── */}
        <div className="space-y-1">
          <TapeBadge color="bg-tape-coral" className="mb-1">
            MATCH COMPLETED
          </TapeBadge>
          <h2
            id="game-over-title"
            className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-ink"
          >
            {isTie ? '🎉 We Have a Tie! 🎉' : '🏆 SketchClub Champions!'}
          </h2>
          <p className="text-xs font-hand text-ink-light text-base font-bold">
            All rounds complete! Here are the final master artist standings:
          </p>
        </div>

        {/* ── Winner Podium (Top 3) ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-3 pb-2 max-w-md mx-auto">
          {/* 2nd Place */}
          <div className="flex flex-col items-center space-y-1.5 order-1">
            {secondPlace ? (
              <>
                <span className="text-2xl sm:text-3xl">🥈</span>
                <span className="text-xs font-black text-ink truncate max-w-full">
                  {secondPlace.name}
                </span>
                <span className="font-mono text-xs font-bold text-ink-light">
                  {secondPlace.score} pts
                </span>
                <div className="w-full h-16 sm:h-20 bg-paper-warm border-2 border-ink rounded-t-xl flex items-center justify-center font-mono font-black text-ink text-sm shadow-ink-sm">
                  #2
                </div>
              </>
            ) : (
              <div className="w-full h-16 bg-paper-warm/40 border-2 border-dashed border-ink/20 rounded-t-xl" />
            )}
          </div>

          {/* 1st Place */}
          <div className="flex flex-col items-center space-y-1.5 order-2">
            {firstPlace ? (
              <>
                <span className="text-4xl sm:text-5xl animate-bounce">🏆</span>
                <span className="text-sm font-black text-cobalt truncate max-w-full">
                  {firstPlace.name}
                </span>
                <span className="font-mono text-sm font-black text-ink">
                  {firstPlace.score} pts
                </span>
                <div className="w-full h-24 sm:h-28 bg-lime/30 border-2 border-ink rounded-t-xl flex items-center justify-center font-mono font-black text-ink text-lg shadow-ink">
                  #1
                </div>
              </>
            ) : null}
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center space-y-1.5 order-3">
            {thirdPlace ? (
              <>
                <span className="text-2xl sm:text-3xl">🥉</span>
                <span className="text-xs font-black text-ink truncate max-w-full">
                  {thirdPlace.name}
                </span>
                <span className="font-mono text-xs font-bold text-ink-light">
                  {thirdPlace.score} pts
                </span>
                <div className="w-full h-12 sm:h-16 bg-paper-dark/50 border-2 border-ink rounded-t-xl flex items-center justify-center font-mono font-black text-ink text-xs shadow-ink-sm">
                  #3
                </div>
              </>
            ) : (
              <div className="w-full h-12 bg-paper-warm/40 border-2 border-dashed border-ink/20 rounded-t-xl" />
            )}
          </div>
        </div>

        {/* ── Complete Final Leaderboard Table ── */}
        <div className="bg-paper-warm border-2 border-ink rounded-2xl p-4 space-y-2 text-left">
          <div className="flex justify-between text-xs font-black uppercase text-ink-light border-b border-ink/20 pb-1.5 font-mono">
            <span>RANK & ARTIST</span>
            <span>FINAL SCORE</span>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs">
            {finalScores.map((s, idx) => {
              const isWinner = winners.some((w) => w.id === s.id);
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-2 rounded-lg border ${
                    isWinner
                      ? 'bg-lime/20 border-lime text-ink font-bold'
                      : 'bg-paper-pure border-ink/20 text-ink'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono font-black w-6 text-center text-ink-light">
                      #{idx + 1}
                    </span>
                    <span className="font-bold truncate">{s.name}</span>
                    {isWinner && <span className="text-[10px] font-mono font-bold text-lime-800">WINNER!</span>}
                  </div>
                  <span className="font-mono font-black">{s.score} pts</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Controls & Actions ── */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={startGameAction}
                className="w-full sm:flex-1 py-3 bg-lime hover:bg-lime-hover text-ink btn-tactile rounded-xl text-sm font-black shadow-ink"
              >
                🔔 Play Again
              </button>
              <button
                type="button"
                onClick={returnToLobbyAction}
                className="w-full sm:flex-1 py-3 bg-cobalt hover:bg-cobalt-hover text-white btn-tactile rounded-xl text-sm font-black shadow-ink"
              >
                📜 Return to Table
              </button>
            </>
          ) : (
            <div className="w-full sm:flex-1 py-2 text-xs font-hand text-ink font-bold">
              Waiting for host to restart match or return to table...
            </div>
          )}

          <button
            type="button"
            onClick={handleLeave}
            className="w-full sm:w-auto px-5 py-3 bg-paper hover:bg-coral/10 text-ink-light hover:text-coral border-2 border-ink/40 rounded-xl text-xs font-mono font-bold transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
