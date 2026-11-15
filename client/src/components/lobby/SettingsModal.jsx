/**
 * components/lobby/SettingsModal.jsx
 *
 * SketchClub Studio Settings Modal.
 *
 * CONCEPT: Styled like an artist workshop specification sheet with tactile controls.
 */

import React, { useState } from 'react';
import { TapeBadge } from '../common/Doodles';

export default function SettingsModal({
  isOpen,
  onClose,
  initialSettings = {},
  onSave,
  title = 'Studio Rules',
  submitButtonText = 'Apply Rules',
  loading = false,
}) {
  const [settings, setSettings] = useState({
    maxPlayers: initialSettings.maxPlayers || 8,
    rounds: initialSettings.rounds || 3,
    drawTime: initialSettings.drawTime || 80,
    wordCount: initialSettings.wordCount || 3,
    hints: initialSettings.hints !== undefined ? initialSettings.hints : 2,
    wordMode: initialSettings.wordMode || 'normal',
  });

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-[2px] animate-fadeIn">
      <div className="bg-paper-pure border-2 border-ink shadow-ink-xl rounded-2xl w-full max-w-md p-6 relative text-ink space-y-5">
        {/* Top Washi Tape */}
        <div className="tape-strip w-28 h-5 absolute -top-2.5 left-8 transform -rotate-2"></div>

        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-ink/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h3 className="text-xl font-black uppercase tracking-tight text-ink">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-2 border-ink bg-paper-warm hover:bg-paper-dark font-mono font-bold flex items-center justify-center transition-colors text-ink text-sm shadow-ink-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            ✕
          </button>
        </div>

        {/* Form Controls */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold">
          {/* Max Players */}
          <div className="bg-paper p-3 rounded-xl border border-ink/15">
            <div className="flex justify-between items-center mb-1">
              <span className="text-ink-light uppercase font-mono tracking-wider">Table Size:</span>
              <span className="font-mono font-black text-sm bg-paper-pure px-2 py-0.5 rounded border border-ink/15 text-cobalt">
                {settings.maxPlayers} Artists
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="20"
              value={settings.maxPlayers}
              onChange={(e) => handleChange('maxPlayers', parseInt(e.target.value, 10))}
              className="w-full accent-cobalt cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-ink-faint font-mono mt-0.5">
              <span>2</span>
              <span>20 max</span>
            </div>
          </div>

          {/* Rounds */}
          <div className="bg-paper p-3 rounded-xl border border-ink/15">
            <div className="flex justify-between items-center mb-1">
              <span className="text-ink-light uppercase font-mono tracking-wider">Number of Rounds:</span>
              <span className="font-mono font-black text-sm bg-paper-pure px-2 py-0.5 rounded border border-ink/15 text-cobalt">
                {settings.rounds} Rounds
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="10"
              value={settings.rounds}
              onChange={(e) => handleChange('rounds', parseInt(e.target.value, 10))}
              className="w-full accent-cobalt cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-ink-faint font-mono mt-0.5">
              <span>2 quick</span>
              <span>10 epic</span>
            </div>
          </div>

          {/* Draw Time */}
          <div className="bg-paper p-3 rounded-xl border border-ink/15">
            <div className="flex justify-between items-center mb-1">
              <span className="text-ink-light uppercase font-mono tracking-wider">Drawing Clock:</span>
              <span className="font-mono font-black text-sm bg-paper-pure px-2 py-0.5 rounded border border-ink/15 text-coral">
                {settings.drawTime} seconds
              </span>
            </div>
            <input
              type="range"
              min="15"
              max="240"
              step="5"
              value={settings.drawTime}
              onChange={(e) => handleChange('drawTime', parseInt(e.target.value, 10))}
              className="w-full accent-coral cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-ink-faint font-mono mt-0.5">
              <span>15s speed</span>
              <span>240s relaxed</span>
            </div>
          </div>

          {/* Word Choices */}
          <div className="bg-paper p-3 rounded-xl border border-ink/15">
            <div className="flex justify-between items-center mb-1">
              <span className="text-ink-light uppercase font-mono tracking-wider">Word Choices for Drawer:</span>
              <span className="font-mono font-black text-sm bg-paper-pure px-2 py-0.5 rounded border border-ink/15 text-cobalt">
                {settings.wordCount} words
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={settings.wordCount}
              onChange={(e) => handleChange('wordCount', parseInt(e.target.value, 10))}
              className="w-full accent-cobalt cursor-pointer"
            />
          </div>

          {/* Word Mode */}
          <div className="bg-paper p-3 rounded-xl border border-ink/15">
            <label className="block text-ink-light uppercase font-mono tracking-wider mb-1.5">
              Word Mode:
            </label>
            <select
              value={settings.wordMode}
              onChange={(e) => handleChange('wordMode', e.target.value)}
              className="w-full bg-paper-pure border-2 border-ink rounded-lg p-2.5 text-ink font-bold text-xs focus:outline-none focus:ring-2 focus:ring-cobalt/30"
            >
              <option value="normal">Normal (Letters revealed as blanks _ _ _)</option>
              <option value="hidden">Hidden (No letter hints ?????)</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-ink/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 bg-paper hover:bg-paper-warm border-2 border-ink/30 text-ink font-bold rounded-lg transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-cobalt hover:bg-cobalt-hover text-white btn-tactile rounded-lg text-xs font-black tracking-wide"
            >
              {loading ? 'Saving...' : submitButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
