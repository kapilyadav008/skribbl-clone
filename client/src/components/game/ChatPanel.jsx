/**
 * components/game/ChatPanel.jsx
 *
 * Phase 6.5 & Phase 8.1 — Multiplayer Guessing & Chat Interface
 *
 * Provides real-time chat and guess submission for players:
 * - Smart auto-scrolling chat history stream (threshold-aware ~50px).
 * - Distinct styling for guesses, correct answers (green), drawer turn announcements (blue), and close calls.
 * - Suppresses redundant hint chat spam (hints display authoritatively in the header).
 * - Modular design: supports desktop full panel or mobile split view + sticky bottom input.
 * - Input validation: ignores empty submissions, prevents drawer from guessing, blocks spoilers.
 * - SketchClub paper-and-ink visual styling with tactile buttons.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRoom } from '../../context/RoomContext';

export function GuessInputBar({ className = '' }) {
  const { gameState, submitGuess } = useRoom();
  const [inputVal, setInputVal] = useState('');

  const isDrawer = Boolean(gameState?.isDrawer);
  const hasGuessedCorrectly = Boolean(gameState?.hasGuessedCorrectly);
  const status = gameState?.status || 'idle';

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    if (isDrawer && status === 'drawing') {
      return;
    }

    submitGuess(trimmed);
    setInputVal('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`p-2 bg-paper-warm border-t-2 border-ink flex items-center gap-2 ${className}`}
    >
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        disabled={isDrawer && status === 'drawing'}
        placeholder={
          isDrawer && status === 'drawing'
            ? '✏️ You are drawing! Sketch clues on canvas.'
            : hasGuessedCorrectly
            ? 'You guessed it! Chat here (no spoiling)...'
            : 'Type your guess here...'
        }
        className="flex-1 px-3 py-2 bg-paper-pure border-2 border-ink rounded-xl text-xs font-bold text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cobalt disabled:bg-paper-dark disabled:opacity-60 disabled:cursor-not-allowed"
        maxLength={80}
      />
      <button
        type="submit"
        disabled={(isDrawer && status === 'drawing') || !inputVal.trim()}
        className="px-4 py-2 bg-cobalt hover:bg-cobalt-hover text-white btn-tactile rounded-xl text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed shadow-ink-sm flex-shrink-0"
      >
        Send
      </button>
    </form>
  );
}

export default function ChatPanel({
  showHeader = true,
  showInput = true,
  className = 'h-[480px] border-2 border-ink shadow-ink-lg rounded-2xl',
}) {
  const { player, gameState, chatMessages } = useRoom();

  const messagesContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);

  const isDrawer = Boolean(gameState?.isDrawer);
  const hasGuessedCorrectly = Boolean(gameState?.hasGuessedCorrectly);

  // Filter out any redundant hint messages (Change 5)
  const visibleMessages = chatMessages.filter((msg) => msg.type !== 'hint');

  // Handle scroll position: track if user scrolled up within the chat container
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    // Near bottom if within 60px of the bottom edge
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 60;
  };

  // Smart auto-scroll: strictly scroll only the chat container without touching window scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && isNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [visibleMessages]);

  return (
    <div
      className={`flex flex-col bg-paper-pure overflow-hidden select-none ${className}`}
    >
      {/* ── Chat Header ── */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-paper-warm border-b-2 border-ink flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black uppercase tracking-wider text-ink">
              Chat
            </span>
            <span className="w-2 h-2 rounded-full bg-lime animate-pulse" />
          </div>
          <span className="text-[10px] font-mono font-bold text-ink-light uppercase">
            {isDrawer ? 'Drawer (Drawing)' : hasGuessedCorrectly ? 'Solved ✓' : 'Guess Mode'}
          </span>
        </div>
      )}

      {/* ── Messages Stream ── */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-3 overflow-y-auto space-y-2 text-xs font-sans min-h-0"
      >
        {visibleMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-ink-faint p-4">
            <span className="text-2xl mb-1">💬</span>
            <p className="font-hand text-base text-ink font-bold">
              No guesses yet!
            </p>
            <p className="text-[11px]">
              Type your guess to join the action.
            </p>
          </div>
        ) : (
          visibleMessages.map((msg, i) => {
            const key = msg.id || `msg-${i}`;
            const isMe = player && msg.playerId === player.id;

            // Correct guess notification (Change 3: Green)
            if (msg.type === 'correct') {
              return (
                <div
                  key={key}
                  className="p-2 bg-lime/20 border-2 border-lime text-ink font-bold rounded-xl text-center space-y-0.5 animate-fadeIn"
                >
                  <p className="text-xs font-black flex items-center justify-center gap-1 text-lime-900">
                    <span>🎉</span>
                    <span>{msg.playerName || msg.sender} guessed the word!</span>
                  </p>
                  {msg.pointsAwarded && (
                    <p className="text-[10px] font-mono font-bold text-lime-800">
                      +{msg.pointsAwarded} pts
                    </p>
                  )}
                </div>
              );
            }

            // Drawer turn change notification (Change 3: Blue)
            if (msg.type === 'drawer_turn') {
              return (
                <div
                  key={key}
                  className="p-2 bg-cobalt/10 border-2 border-cobalt/40 text-cobalt-dark font-bold rounded-xl text-center text-xs flex items-center justify-center gap-1.5 animate-fadeIn"
                >
                  <span>🎨</span>
                  <span>{msg.text || `${msg.playerName || 'Player'} is now drawing!`}</span>
                </div>
              );
            }

            // Close guess warning
            if (msg.type === 'close') {
              return (
                <div
                  key={key}
                  className="p-1.5 bg-tape-yellow/70 border border-ink/40 text-ink font-bold rounded-lg text-center text-[11px] shadow-sm"
                >
                  ⚠️ {msg.text}
                </div>
              );
            }

            // Chat from player who already guessed
            if (msg.type === 'guessed_chat') {
              return (
                <div
                  key={key}
                  className={`p-1.5 rounded-lg border ${
                    isMe
                      ? 'bg-paper-warm border-ink/40 ml-4'
                      : 'bg-paper border-ink/20 mr-4'
                  }`}
                >
                  <span className="font-bold text-lime-700 mr-1.5">
                    {msg.playerName || msg.sender} ✓:
                  </span>
                  <span className="text-ink break-words">{msg.text}</span>
                </div>
              );
            }

            // System message (e.g. joined/left room)
            if (msg.type === 'system') {
              return (
                <div
                  key={key}
                  className="py-1 px-2 text-center text-[11px] font-mono font-medium text-ink-light italic"
                >
                  {msg.text}
                </div>
              );
            }

            // Normal guess or chat message
            return (
              <div
                key={key}
                className={`p-1.5 rounded-lg border ${
                  isMe
                    ? 'bg-paper-warm border-ink/40 ml-4'
                    : 'bg-paper border-ink/20 mr-4'
                }`}
              >
                <span className="font-bold text-ink mr-1.5">
                  {msg.playerName || msg.sender || 'Player'}:
                </span>
                <span className="text-ink break-words">{msg.text}</span>
              </div>
            );
          })
        )}
      </div>

      {/* ── Input Form ── */}
      {showInput && <GuessInputBar />}
    </div>
  );
}
