/**
 * components/game/DrawingToolbar.jsx
 *
 * "SketchClub" Artist's Toolkit:
 * - Studio-inspired palette organizer with deep ink borders and tactile shadows
 * - Tool selection (Brush & Eraser) with physical toggle feel
 * - Paint cake color swatches
 * - Brush size selector (S, M, L, XL)
 * - Tactile Undo & Clear buttons
 *
 * If `isDrawer` is false, displays a studio spectator note.
 */

import React from 'react';

const COLORS = [
  '#18181B', // Deep Ink Black
  '#FFFFFF', // Canvas White
  '#71717A', // Slate Charcoal
  '#1D4ED8', // Cobalt Blue
  '#0284C7', // Sky Cyan
  '#16A34A', // Forest Green
  '#84CC16', // Studio Lime
  '#EAB308', // Lemon Yellow
  '#EA580C', // Coral Orange
  '#DC2626', // Crimson Red
  '#DB2777', // Rose Pink
  '#9333EA', // Artist Purple
  '#854D0E', // Raw Umber
  '#A16207', // Ochre Brown
  '#0D9488', // Deep Teal
  '#4F46E5', // Indigo
];

const BRUSH_SIZES = [
  { label: 'S', size: 3, dotSize: 'w-1.5 h-1.5' },
  { label: 'M', size: 6, dotSize: 'w-2.5 h-2.5' },
  { label: 'L', size: 12, dotSize: 'w-4 h-4' },
  { label: 'XL', size: 24, dotSize: 'w-5 h-5' },
];

export default function DrawingToolbar({
  isDrawer = false,
  tool = 'brush',
  setTool,
  color = '#18181B',
  setColor,
  brushSize = 6,
  setBrushSize,
  onUndo,
  onClear,
  compact = false,
}) {
  if (!isDrawer) {
    return (
      <div className="w-full bg-paper-light border-2 border-ink shadow-ink py-2 px-3 sm:px-4 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold text-ink">
        <span className="inline-block w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-coral mr-2 animate-pulse"></span>
        <span>👀 You are guessing! Watch the canvas & type in chat.</span>
      </div>
    );
  }

  return (
    <div
      className={`w-full bg-paper-light border-2 border-ink rounded-xl sm:rounded-2xl shadow-ink flex flex-wrap items-center justify-between gap-2 sm:gap-3 select-none ${
        compact ? 'p-2' : 'p-2.5 sm:p-3'
      }`}
    >
      {/* ── Tool Selection (Brush / Eraser) ── */}
      <div className="flex items-center gap-1 bg-paper p-0.5 sm:p-1 rounded-xl border-2 border-ink">
        <button
          type="button"
          onClick={() => setTool('brush')}
          className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-black tracking-wide rounded-lg transition-all flex items-center gap-1 ${
            tool === 'brush'
              ? 'bg-cobalt text-white shadow-ink-sm border-2 border-ink'
              : 'text-ink hover:bg-paper-dark border-2 border-transparent'
          }`}
          title="Brush tool"
        >
          <span>✏️</span>
          <span className="hidden xs:inline">Brush</span>
        </button>
        <button
          type="button"
          onClick={() => setTool('eraser')}
          className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-black tracking-wide rounded-lg transition-all flex items-center gap-1 ${
            tool === 'eraser'
              ? 'bg-coral text-white shadow-ink-sm border-2 border-ink'
              : 'text-ink hover:bg-paper-dark border-2 border-transparent'
          }`}
          title="Eraser tool"
        >
          <span>🧹</span>
          <span className="hidden xs:inline">Eraser</span>
        </button>
      </div>

      {/* ── Color Palette Swatches (2-row grid on mobile, wrapped on desktop) ── */}
      <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 max-w-[220px] sm:max-w-xs justify-center">
        {COLORS.map((c) => {
          const isSelected = tool === 'brush' && color.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                if (tool === 'eraser') setTool('brush');
              }}
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md transition-transform border border-ink sm:border-2 ${
                isSelected
                  ? 'scale-125 ring-2 ring-cobalt ring-offset-1 z-10 shadow-ink-sm'
                  : 'hover:scale-110 active:scale-95'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          );
        })}
      </div>

      {/* ── Brush Sizes ── */}
      <div className="flex items-center gap-0.5 sm:gap-1 bg-paper p-0.5 sm:p-1 rounded-xl border-2 border-ink">
        {BRUSH_SIZES.map(({ label, size, dotSize }) => (
          <button
            key={size}
            type="button"
            onClick={() => setBrushSize(size)}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-mono text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center transition-all ${
              brushSize === size
                ? 'bg-ink text-paper shadow-ink-sm border-2 border-ink'
                : 'text-ink hover:bg-paper-dark border-2 border-transparent'
            }`}
            title={`Brush size: ${size}px`}
          >
            <span className={`rounded-full bg-current ${dotSize} mb-0.5`}></span>
            <span className="text-[9px] sm:text-[10px] leading-none">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Undo & Clear Actions ── */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="btn-tactile px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-black bg-paper hover:bg-paper-dark text-ink rounded-lg sm:rounded-xl flex items-center gap-1"
          title="Undo last stroke"
        >
          <span>↩</span>
          <span className="hidden xs:inline">Undo</span>
        </button>
        <button
          type="button"
          onClick={onClear}
          className="btn-tactile px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-black bg-coral/10 hover:bg-coral text-coral hover:text-white border border-coral sm:border-2 rounded-lg sm:rounded-xl flex items-center gap-1 transition-colors"
          title="Clear canvas"
        >
          <span>🗑️</span>
          <span className="hidden xs:inline">Clear</span>
        </button>
      </div>
    </div>
  );
}
