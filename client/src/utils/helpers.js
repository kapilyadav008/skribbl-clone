/**
 * utils/helpers.js
 *
 * Pure utility functions — no React, no sockets, no side effects.
 * Easy to unit-test in isolation.
 */

/**
 * formatTime
 * Converts seconds to MM:SS display string.
 * Example: 90 → "1:30", 5 → "0:05"
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * generateSessionId
 * Creates a random session ID for the player.
 * This is NOT cryptographically secure — just enough to identify
 * a returning player within the same browser session.
 * @returns {string}
 */
export function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * getOrCreateSessionId
 * Gets the existing playerSessionId from sessionStorage,
 * or generates and stores a new one.
 *
 * WHY sessionStorage instead of localStorage?
 * sessionStorage is cleared when the tab is closed.
 * This means opening a new tab = new player identity.
 * This allows testing multiple players in separate tabs on the same browser.
 *
 * @returns {string}
 */
export function getOrCreateSessionId() {
  let sessionId = sessionStorage.getItem('playerSessionId');
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem('playerSessionId', sessionId);
  }
  return sessionId;
}

/**
 * normalizeGuess
 * Normalizes a guess string for comparison.
 * Lowercases and trims whitespace.
 * The server does the same normalization before comparing to the secret word.
 * @param {string} text
 * @returns {string}
 */
export function normalizeGuess(text) {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * copyToClipboard
 * Copies text to clipboard. Returns true on success.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  }
}

/**
 * getTimerColor
 * Returns a Tailwind text color class based on how much time is left.
 * Used by the Timer component to turn red as time runs out.
 * @param {number} timeLeft - seconds remaining
 * @param {number} totalTime - total seconds for the round
 * @returns {string} Tailwind CSS class
 */
export function getTimerColor(timeLeft, totalTime) {
  const ratio = timeLeft / totalTime;
  if (ratio > 0.5) return 'text-green-400';
  if (ratio > 0.25) return 'text-yellow-400';
  return 'text-red-400';
}
