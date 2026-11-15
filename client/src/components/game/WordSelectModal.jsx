/**
 * components/game/WordSelectModal.jsx
 *
 * Phase 6.2 — Word Selection UI
 *
 * Displays a modal dialog during the `selecting_word` game phase:
 * - Active Drawer: Selectable word cards (dynamically 1..N choices), live selection countdown,
 *   word character lengths, tactile buttons, pending state, and error handling.
 * - Guessers: Spectator waiting view with drawer's name, friendly artist-at-work animation,
 *   and guessing encouragement. Zero word choices or secret words are ever rendered.
 */

import React, { useState, useEffect } from 'react';
import { useRoom } from '../../context/RoomContext';
import { TapeBadge } from '../common/Doodles';

export default function WordSelectModal(props) {
  const roomContext = useRoom();

  const isOpen =
    props.isOpen !== undefined
      ? props.isOpen
      : roomContext.gameState?.status === 'selecting_word';

  const isDrawer =
    props.isDrawer !== undefined
      ? props.isDrawer
      : Boolean(roomContext.gameState?.isDrawer);

  const wordChoices =
    props.wordChoices !== undefined
      ? props.wordChoices
      : roomContext.gameState?.wordChoices || [];

  const drawerName =
    props.drawerName ||
    roomContext.gameState?.currentDrawer?.name ||
    'The artist';

  const initialTimeLeft =
    props.timeLeft !== undefined
      ? props.timeLeft
      : roomContext.gameState?.timeLeft || 15;

  const onSelectWord = props.onSelectWord || roomContext.selectWord;
  const error = props.error !== undefined ? props.error : roomContext.error;

  const [selectedWord, setSelectedWord] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(initialTimeLeft);

  // Sync remaining seconds if updated from context or reconnect
  useEffect(() => {
    if (initialTimeLeft > 0) {
      setSecondsLeft(initialTimeLeft);
    }
  }, [initialTimeLeft]);

  // Display-only local countdown for the drawer (server timeout remains authoritative)
  useEffect(() => {
    if (!isOpen || !isDrawer) return;
    if (secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isDrawer, secondsLeft]);

  // Reset pending state if server reports an error
  useEffect(() => {
    if (error) {
      setIsPending(false);
      setSelectedWord(null);
    }
  }, [error]);

  // Do not render if not in selecting_word phase
  if (!isOpen) {
    return null;
  }

  const handleSelect = (word) => {
    if (isPending || secondsLeft <= 0 || !word) return;
    setIsPending(true);
    setSelectedWord(word);
    if (typeof onSelectWord === 'function') {
      onSelectWord(word);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-select-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs select-none"
    >
      <div className="relative w-full max-w-lg bg-paper-pure border-2 border-ink shadow-ink-xl rounded-2xl p-6 sm:p-8 text-center space-y-6">
        {/* Masking tape decorative accent */}
        <div className="tape-strip w-32 h-5 absolute -top-2.5 left-1/2 -translate-x-1/2 transform -rotate-1 pointer-events-none" />

        {isDrawer ? (
          /* ── A. Drawer View ────────────────────────────────────────────── */
          <div className="space-y-5">
            <div>
              <TapeBadge color="bg-tape-yellow" className="mb-2">
                YOUR TURN TO DRAW
              </TapeBadge>
              <h2
                id="word-select-title"
                className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-ink"
              >
                Choose a secret word to draw!
              </h2>
              <p className="text-xs text-ink-light font-medium mt-1">
                Pick an option below to begin sketching for the table.
              </p>
            </div>

            {/* Live Selection Countdown */}
            <div className="flex items-center justify-center">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-ink text-xs font-mono font-bold shadow-ink-sm transition-colors ${
                  secondsLeft <= 5
                    ? 'bg-coral text-white animate-pulse'
                    : 'bg-paper-warm text-ink'
                }`}
              >
                <span>⏱️</span>
                <span>{secondsLeft}s remaining</span>
                {secondsLeft <= 5 && secondsLeft > 0 && (
                  <span className="text-[10px] uppercase font-sans font-bold">
                    (Auto-pick soon)
                  </span>
                )}
              </div>
            </div>

            {/* Error Feedback */}
            {error && (
              <div className="p-3 bg-coral/10 border-2 border-coral rounded-xl text-coral text-xs font-bold flex items-center justify-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Word Choices Grid */}
            {wordChoices.length > 0 ? (
              <div
                className={`grid gap-3 pt-1 ${
                  wordChoices.length <= 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : 'grid-cols-2 sm:grid-cols-4'
                }`}
              >
                {wordChoices.map((word, index) => {
                  const isThisSelected = selectedWord === word;
                  return (
                    <button
                      key={`${word}-${index}`}
                      type="button"
                      disabled={isPending || secondsLeft <= 0}
                      onClick={() => handleSelect(word)}
                      className={`group relative flex flex-col items-center justify-between p-4 rounded-xl border-2 border-ink transition-all btn-tactile text-left focus:outline-none focus:ring-2 focus:ring-cobalt ${
                        isThisSelected
                          ? 'bg-cobalt text-white shadow-none translate-x-[2px] translate-y-[2px]'
                          : 'bg-paper-pure hover:bg-paper-warm text-ink'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <span className="text-[10px] font-mono uppercase tracking-wider text-ink-faint group-hover:text-ink font-bold pb-1">
                        Choice #{index + 1}
                      </span>
                      <span className="text-lg font-black tracking-tight break-words py-2 text-center w-full uppercase">
                        {word}
                      </span>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded border border-ink/30 font-bold ${
                          isThisSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-paper-dark/60 text-ink-light'
                        }`}
                      >
                        {word.length} {word.length === 1 ? 'letter' : 'letters'}
                      </span>
                      {isThisSelected && isPending && (
                        <span className="text-[10px] font-mono uppercase mt-1 tracking-wider text-white animate-pulse">
                          Selecting...
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-sm font-hand text-ink-light font-bold">
                Preparing your word choices...
              </div>
            )}

            {/* Timeout warning state */}
            {secondsLeft === 0 && (
              <div className="p-2.5 bg-paper-warm border-2 border-dashed border-ink/30 rounded-xl text-xs font-hand text-ink font-bold animate-pulse">
                ⏳ Time is up! Server is selecting a word for you...
              </div>
            )}
          </div>
        ) : (
          /* ── B. Guesser View ────────────────────────────────────────────── */
          <div className="space-y-5 py-2">
            <div>
              <TapeBadge color="bg-tape-cyan" className="mb-2">
                ARTIST AT WORK
              </TapeBadge>
              <h2
                id="word-select-title"
                className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-ink"
              >
                <span className="text-cobalt font-mono">{drawerName}</span> is
                choosing a word...
              </h2>
            </div>

            {/* Friendly Waiting Animation */}
            <div className="py-4 space-y-3">
              <div className="text-4xl animate-bounce">🎨</div>
              <p className="font-hand text-xl text-ink font-bold">
                Sharpening pencils & priming the canvas!
              </p>
            </div>

            {/* Waiting encouragement card */}
            <div className="p-4 bg-paper-warm border-2 border-ink/40 rounded-xl text-xs font-semibold text-ink-light text-center space-y-1">
              <p className="text-ink font-bold flex items-center justify-center gap-1">
                <span>💡</span>
                <span>Get ready to guess the drawing!</span>
              </p>
              <p className="text-[11px]">
                The faster you guess the drawing correctly once sketching begins,
                the more points you will score.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
