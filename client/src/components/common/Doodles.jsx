/**
 * components/common/Doodles.jsx
 *
 * Lightweight vector doodle accents and sketch decorations for the SketchClub identity.
 * Adds tactile indie sketchbook flavor without bulky image assets.
 */

import React from 'react';

export function StarDoodle({ className = 'w-6 h-6 text-coral', rotate = '0' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} transform rotate-[${rotate}deg]`}
    >
      <path d="M12 2l2.4 6.6 7 .6-5.3 4.6 1.6 6.9-5.7-3.6-5.7 3.6 1.6-6.9-5.3-4.6 7-.6z" />
    </svg>
  );
}

export function ScribbleUnderline({ className = 'w-36 h-3 text-coral' }) {
  return (
    <svg
      viewBox="0 0 120 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M3 8c18-4 35-4 54-1 18 3 36 2 60-3" />
    </svg>
  );
}

export function HandArrow({ className = 'w-10 h-10 text-cobalt', flip = false }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${flip ? '-scale-x-100' : ''}`}
    >
      <path d="M8 32 C 14 20, 24 16, 32 10" />
      <path d="M22 8 L 33 10 L 30 20" />
    </svg>
  );
}

export function TapeBadge({ children, className = '', color = 'bg-tape-yellow', rotate = '-rotate-1' }) {
  return (
    <div
      className={`inline-block px-3 py-1 ${color} text-ink border border-ink/30 text-xs font-mono font-bold tracking-wider uppercase shadow-sm select-none transform ${rotate} ${className}`}
    >
      {children}
    </div>
  );
}
