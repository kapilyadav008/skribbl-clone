/**
 * pages/JoinPage.jsx
 *
 * SketchClub Invitation Landing Screen (/join/:roomCode).
 *
 * CONCEPT: Styled like an artist workshop invitation card pinned with masking tape.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getRoomInfo } from '../api/roomApi';
import { useRoom } from '../context/RoomContext';
import { TapeBadge, ScribbleUnderline, StarDoodle } from '../components/common/Doodles';

export default function JoinPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { joinRoomAction, loading } = useRoom();

  const [name, setName] = useState(sessionStorage.getItem('lastPlayerName') || '');
  const [roomInfo, setRoomInfo] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomCode) {
      setError('Invalid invite link: missing room code');
      setChecking(false);
      return;
    }

    getRoomInfo(roomCode)
      .then((data) => {
        setRoomInfo(data);
        if (data.isFull) {
          setError('This drawing room has reached maximum capacity!');
        } else if (data.status === 'playing') {
          setError('A match is currently in progress in this room');
        }
      })
      .catch((err) => {
        setError(err.message || 'Room not found');
      })
      .finally(() => {
        setChecking(false);
      });
  }, [roomCode]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please write your nickname');
      return;
    }

    try {
      await joinRoomAction({
        roomCode,
        playerName: name.trim(),
      });
      navigate(`/room/${roomCode.toUpperCase()}`);
    } catch (err) {
      setError(err.message || 'Failed to join room');
    }
  };

  return (
    <div className="min-h-screen bg-paper bg-notebook-dots text-ink flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-paper-pure border-2 border-ink shadow-ink-xl rounded-2xl p-6 sm:p-8 relative">
        {/* Masking tape header badge */}
        <div className="tape-strip w-32 h-6 absolute -top-3 left-1/2 -translate-x-1/2 transform rotate-1 z-10 flex items-center justify-center">
          <span className="text-[10px] font-mono tracking-widest text-ink font-bold opacity-80">ROOM INVITE</span>
        </div>

        {/* Card Header */}
        <div className="text-center pt-2 pb-4 space-y-1">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="text-2xl">💌</span>
            <span className="font-hand text-lg text-cobalt font-bold">You've been invited to</span>
          </div>

          <h1 className="text-3xl font-black uppercase text-ink">
            Sketch<span className="text-cobalt">Club</span>
          </h1>

          <div className="flex justify-center -mt-1 mb-2">
            <ScribbleUnderline className="w-36 h-2.5 text-lime" />
          </div>

          <div className="inline-flex items-center gap-2 bg-paper-warm px-3.5 py-1.5 rounded-lg border border-ink/20 font-mono text-sm">
            <span className="text-ink-light">ROOM CODE:</span>
            <span className="font-black text-coral text-base tracking-widest">
              {roomCode?.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-coral/10 border-2 border-coral text-coral-hover px-4 py-3 rounded-lg text-xs font-bold mb-4">
            <p className="flex items-center gap-1.5 mb-1.5">
              <span>⚠️</span>
              <span>{error}</span>
            </p>
            <Link to="/" className="text-cobalt hover:underline font-mono text-xs block">
              ← Return to Main Studio
            </Link>
          </div>
        )}

        {/* Room Info Snapshot */}
        {checking ? (
          <div className="py-6 text-center text-ink-light font-hand text-lg animate-pulse">
            Checking sketchbook desk status...
          </div>
        ) : roomInfo && !error ? (
          <div className="bg-paper-warm border-2 border-ink/15 rounded-xl p-4 space-y-2 text-xs mb-5 shadow-inner">
            <div className="flex justify-between items-center text-ink-light">
              <span className="font-medium">Players in Room:</span>
              <span className="font-mono font-bold text-ink bg-white px-2 py-0.5 rounded border border-ink/10">
                {roomInfo.playerCount} / {roomInfo.maxPlayers}
              </span>
            </div>
            <div className="flex justify-between items-center text-ink-light">
              <span className="font-medium">Total Rounds:</span>
              <span className="font-bold text-ink">{roomInfo.settings?.rounds || 3} rounds</span>
            </div>
            <div className="flex justify-between items-center text-ink-light">
              <span className="font-medium">Drawing Clock:</span>
              <span className="font-bold text-ink">{roomInfo.settings?.drawTime || 80}s per turn</span>
            </div>
          </div>
        ) : null}

        {/* Join Form */}
        {!checking && !roomInfo?.isFull && roomInfo?.status !== 'playing' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-ink-light flex items-center justify-between">
                <span>Your Nickname</span>
                <span className="font-hand text-sm text-cobalt normal-case font-bold">enter to claim your pencil</span>
              </label>
              <input
                type="text"
                maxLength={20}
                placeholder="What should we call you?"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                className="w-full px-4 py-3 bg-paper border-2 border-ink rounded-lg text-ink font-bold placeholder:text-ink-faint focus:outline-none focus:bg-white focus:ring-2 focus:ring-cobalt/30 text-base"
              />
            </div>

            <button
              type="submit"
              disabled={loading || checking}
              className="w-full py-3.5 bg-cobalt hover:bg-cobalt-hover text-white btn-tactile rounded-lg flex items-center justify-center gap-2 text-base font-black tracking-wide"
            >
              {loading ? 'Entering Room...' : '✏️ Join Game'}
            </button>
          </form>
        )}

        <div className="text-center pt-4 mt-5 border-t border-paper-dark">
          <Link
            to="/"
            className="text-xs font-mono font-bold text-ink-light hover:text-cobalt transition-colors"
          >
            ← Back to Home Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
