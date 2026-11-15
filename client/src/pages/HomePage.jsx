/**
 * pages/HomePage.jsx
 *
 * SketchClub Landing Page.
 *
 * CONCEPT: "SketchClub" — indie sketchbook studio tabletop drawing game.
 * Features warm paper, charcoal ink, cobalt blue primary button, and tactile offset shadows.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import SettingsModal from '../components/lobby/SettingsModal';
import { StarDoodle, ScribbleUnderline, TapeBadge, HandArrow } from '../components/common/Doodles';

export default function HomePage() {
  const navigate = useNavigate();
  const { createRoomAction, joinRoomAction, loading, error, setError } = useRoom();

  const [name, setName] = useState(sessionStorage.getItem('lastPlayerName') || '');
  const [joinCode, setJoinCode] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [localError, setLocalError] = useState('');

  // ── Handle Create Room ───────────────────────────────────────────────────
  const handleOpenCreateModal = () => {
    if (!name.trim()) {
      setLocalError('Please write your nickname before creating a table');
      return;
    }
    setLocalError('');
    setIsSettingsOpen(true);
  };

  const handleCreateRoomConfirm = async (settings) => {
    try {
      const { roomCode } = await createRoomAction({
        hostName: name.trim(),
        settings,
      });
      setIsSettingsOpen(false);
      navigate(`/room/${roomCode}`);
    } catch (err) {
      // Error is caught in context
    }
  };

  // ── Handle Join Room ─────────────────────────────────────────────────────
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setLocalError('Please write your nickname first');
      return;
    }
    if (!joinCode.trim()) {
      setLocalError('Enter a 6-character room code to join');
      return;
    }
    setLocalError('');

    try {
      const { roomCode } = await joinRoomAction({
        roomCode: joinCode.trim(),
        playerName: name.trim(),
      });
      navigate(`/room/${roomCode}`);
    } catch (err) {
      // Error is caught in context
    }
  };

  const activeError = localError || error;

  return (
    <div className="min-h-screen bg-paper bg-notebook-dots text-ink flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background Decorative Doodles */}
      <div className="absolute top-8 left-8 hidden lg:block opacity-70">
        <StarDoodle className="w-8 h-8 text-coral" rotate="-12" />
        <span className="font-hand text-ink-light text-xl block mt-1">pencil sharpener ready!</span>
      </div>
      <div className="absolute bottom-10 right-10 hidden lg:block opacity-70 text-right">
        <StarDoodle className="w-7 h-7 text-lime inline-block" rotate="15" />
        <span className="font-hand text-ink-light text-xl block mt-1">no real drawing skills required</span>
      </div>

      {/* Main Studio Card */}
      <div className="w-full max-w-md bg-paper-pure border-2 border-ink shadow-ink-xl rounded-2xl p-6 sm:p-8 relative">
        {/* Washi Tape Accent */}
        <div className="tape-strip w-28 h-6 absolute -top-3 left-1/2 -translate-x-1/2 transform -rotate-1 z-10 flex items-center justify-center">
          <span className="text-[10px] font-mono tracking-widest text-ink font-bold opacity-75">STUDIO PASS</span>
        </div>

        {/* Brand Header */}
        <div className="text-center pt-2 pb-4 space-y-1 relative">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-2xl">✏️</span>
            <TapeBadge color="bg-lime" rotate="rotate-1">
              Tabletop Edition
            </TapeBadge>
            <span className="text-2xl">🎨</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-ink uppercase">
            Sketch<span className="text-cobalt">Club</span>
          </h1>
          <div className="flex justify-center -mt-1 mb-2">
            <ScribbleUnderline className="w-44 h-3 text-coral" />
          </div>

          <p className="font-hand text-xl text-ink-light -mt-1 font-semibold">
            Draw fast. Guess faster. Laugh together.
          </p>
        </div>

        {/* Error Alert Box */}
        {activeError && (
          <div className="bg-coral/10 border-2 border-coral text-coral-hover px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-between mb-4">
            <span className="flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{activeError}</span>
            </span>
            <button
              onClick={() => {
                setLocalError('');
                setError(null);
              }}
              className="text-ink font-black hover:opacity-75 p-1"
            >
              ✕
            </button>
          </div>
        )}

        <div className="space-y-5">
          {/* Player Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-ink-light flex items-center justify-between">
              <span>Your Artist Nickname</span>
              <span className="font-hand text-sm text-cobalt normal-case font-bold">what friends call you</span>
            </label>
            <div className="relative">
              <input
                type="text"
                maxLength={20}
                placeholder="e.g. Picasso, DoodleBob, Maya"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setLocalError('');
                }}
                className="w-full px-4 py-3 bg-paper border-2 border-ink rounded-lg text-ink font-bold placeholder:text-ink-faint focus:outline-none focus:bg-white focus:ring-2 focus:ring-cobalt/30 transition-all text-base"
              />
            </div>
          </div>

          {/* Action 1: Create Room */}
          <div>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={loading}
              className="w-full py-3.5 bg-cobalt hover:bg-cobalt-hover text-white btn-tactile rounded-lg flex items-center justify-center gap-2 text-base font-black tracking-wide"
            >
              <span>✨ Host a Drawing Room</span>
            </button>
            <p className="text-[11px] text-ink-faint text-center mt-1.5 font-medium">
              Configure rounds, drawing timer & invite your friends
            </p>
          </div>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t-2 border-dashed border-ink/20"></div>
            <span className="flex-shrink mx-3 text-xs font-mono font-bold text-ink-light uppercase tracking-wider bg-paper-warm px-2 py-0.5 rounded border border-ink/15">
              OR JOIN A ROOM
            </span>
            <div className="flex-grow border-t-2 border-dashed border-ink/20"></div>
          </div>

          {/* Action 2: Join Room with Code */}
          <form onSubmit={handleJoinRoom} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                maxLength={6}
                placeholder="ENTER 6-DIGIT CODE"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setLocalError('');
                }}
                className="w-full px-4 py-3 bg-paper border-2 border-ink rounded-lg text-ink font-mono font-black text-center text-lg tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:text-ink-faint focus:outline-none focus:bg-white focus:ring-2 focus:ring-coral/30 uppercase transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-coral hover:bg-coral-hover text-white btn-tactile rounded-lg flex items-center justify-center gap-2 text-base font-black tracking-wide"
            >
              {loading ? 'Entering Table...' : '🚀 Join Room with Code'}
            </button>
          </form>
        </div>

        {/* Footer info & Diagnostics Link */}
        <div className="mt-6 pt-4 border-t border-paper-dark text-center flex items-center justify-between text-xs text-ink-faint">
          <span className="font-hand text-base text-ink-light">Instant play • No login required</span>
          <Link
            to="/debug-connection"
            className="hover:text-cobalt font-mono font-bold underline transition-colors"
          >
            Diagnostics ⚙️
          </Link>
        </div>
      </div>

      {/* Settings Modal for Room Creation */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleCreateRoomConfirm}
        title="Custom Studio Rules"
        submitButtonText="Create Table & Enter Lobby"
        loading={loading}
      />
    </div>
  );
}
