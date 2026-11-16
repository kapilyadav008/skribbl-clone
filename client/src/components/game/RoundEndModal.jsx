/**
 * components/game/RoundEndModal.jsx
 *
 * Phase 8.1 — Round-End Score Reveal Modal
 *
 * Displays when a drawing turn concludes (`status === 'round_ended'`):
 * - Prominently reveals the secret word to all players.
 * - Displays the reason the turn concluded (all guessed, time expired, drawer disconnect).
 * - Displays a comprehensive turn breakdown table:
 *   - Player names, ranks, and roles (drawer / guesser).
 *   - Points earned during this specific turn (+150 pts, drawer bonus +50 pts).
 *   - Updated cumulative match scores.
 * - SketchClub paper-and-ink visual styling with tactile tape badge.
 */

import React from 'react';
import { TapeBadge } from '../common/Doodles';

export default function RoundEndModal({
  isOpen = false,
  word = '',
  reason = 'time_up',
  drawer = null,
  drawerBonus = 0,
  turnEarnings = {},
  players = [],
  myPlayerId = '',
}) {
  if (!isOpen) return null;

  // Build sorted player list for the round summary
  const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

  const getRankBadge = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const getReasonText = () => {
    switch (reason) {
      case 'all_guessed':
        return '🎉 Everyone guessed the drawing correctly!';
      case 'drawer_disconnected':
        return '⚠️ Drawer disconnected mid-turn.';
      case 'time_up':
      default:
        return '⏰ Time expired for this sketch!';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="round-end-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/70 backdrop-blur-xs select-none animate-fadeIn"
    >
      <div className="relative w-full max-w-lg bg-paper-pure border-2 border-ink shadow-ink-xl rounded-3xl p-5 sm:p-6 text-center space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Tape Accent */}
        <div className="tape-strip w-28 h-5 absolute -top-2.5 left-1/2 -translate-x-1/2 transform -rotate-1 pointer-events-none" />

        {/* ── Round Over Badge & Secret Word ── */}
        <div className="space-y-1.5 pt-1">
          <TapeBadge color="bg-tape-yellow" className="text-xs">
            ROUND TURN CONCLUDED
          </TapeBadge>
          <div className="text-xs font-mono font-bold text-ink-light uppercase tracking-wider">
            The secret word was
          </div>
          <h2
            id="round-end-title"
            className="text-2xl sm:text-4xl font-mono font-black uppercase tracking-widest text-coral drop-shadow-sm break-words px-2"
          >
            {word || '???'}
          </h2>
          <p className="text-xs font-semibold text-ink-light">{getReasonText()}</p>
        </div>

        {/* ── Round Earnings & Scoreboard ── */}
        <div className="bg-paper-light border-2 border-ink rounded-2xl p-3 sm:p-4 space-y-2 text-left">
          <div className="flex items-center justify-between border-b border-ink/20 pb-2 px-1 text-[11px] font-mono font-bold text-ink-light uppercase">
            <span>Player</span>
            <div className="flex items-center gap-4">
              <span>This Turn</span>
              <span>Total</span>
            </div>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {sortedPlayers.map((p, idx) => {
              const isMe = myPlayerId && p.id === myPlayerId;
              const isThisDrawer = drawer && p.id === drawer.id;
              const earnedThisTurn = turnEarnings[p.id] || 0;

              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-2 rounded-xl border transition-all text-xs ${
                    isThisDrawer
                      ? 'bg-paper-warm border-cobalt ring-1 ring-cobalt/30'
                      : isMe
                      ? 'bg-white border-ink/50'
                      : 'bg-paper border-ink/20'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-xs w-5 text-center flex-shrink-0">
                      {getRankBadge(idx)}
                    </span>
                    <div className="truncate">
                      <div className="flex items-center gap-1 font-bold text-ink truncate">
                        <span className="truncate">{p.name}</span>
                        {isMe && (
                          <span className="text-[10px] text-cobalt font-mono font-bold">(You)</span>
                        )}
                        {isThisDrawer && <span title="Drawer">🎨</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 font-mono flex-shrink-0">
                    {/* Points earned this turn */}
                    {earnedThisTurn > 0 ? (
                      <span className="text-[11px] font-black text-lime-800 bg-lime/25 px-2 py-0.5 rounded-md border border-lime/50">
                        +{earnedThisTurn} pts
                        {isThisDrawer && drawerBonus > 0 && ' (bonus)'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-ink-faint px-2 py-0.5">
                        +0 pts
                      </span>
                    )}

                    {/* Total Cumulative Score */}
                    <span className="font-black text-ink text-xs w-16 text-right">
                      {p.score || 0} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer Status ── */}
        <div className="pt-1 flex items-center justify-center gap-2 text-xs font-hand text-ink font-bold animate-pulse">
          <span className="w-2 h-2 rounded-full bg-cobalt animate-ping" />
          <span>Next turn starting in a few seconds...</span>
        </div>
      </div>
    </div>
  );
}
