/**
 * game/WordManager.js
 *
 * Manages word lists, randomized word choices for the drawer,
 * word mask generation (blanks) for guessers, and guess validation.
 *
 * KEY RESPONSIBILITIES:
 * 1. Maintain a rich, categorized word repository.
 * 2. Generate N non-duplicate random word options for the drawer.
 * 3. Validate that a chosen word was actually offered in the active round.
 * 4. Generate guesser-safe representations (masked blanks, word length).
 * 5. Case-insensitive and whitespace-normalized guess checking.
 * 6. Keep the secret word authoritative and private on the server.
 */

const path = require('path');
const fs = require('fs');

class WordManager {
  /**
   * @param {object} [customWords] - Optional dictionary of categories or flat array
   */
  constructor(customWords = null) {
    if (customWords) {
      this.wordsData = customWords;
    } else {
      try {
        const filePath = path.join(__dirname, '../data/words.json');
        const raw = fs.readFileSync(filePath, 'utf-8');
        this.wordsData = JSON.parse(raw);
      } catch (err) {
        // Fallback default list if file read fails
        this.wordsData = {
          default: [
            'apple', 'banana', 'cat', 'dog', 'elephant', 'guitar', 'house',
            'ice cream', 'jungle', 'kite', 'lion', 'mountain', 'ninja',
            'ocean', 'pizza', 'queen', 'rainbow', 'sunflower', 'tree',
            'umbrella', 'volcano', 'watermelon', 'xylophone', 'yacht', 'zebra'
          ]
        };
      }
    }

    // Flatten all unique words into a single list for global random selection
    this._allWords = this._buildFlattenedList();
  }

  /**
   * Extracts and normalizes all words from all categories.
   * @private
   * @returns {string[]}
   */
  _buildFlattenedList() {
    const wordSet = new Set();
    if (Array.isArray(this.wordsData)) {
      this.wordsData.forEach((w) => wordSet.add(w.trim().toLowerCase()));
    } else if (typeof this.wordsData === 'object' && this.wordsData !== null) {
      for (const category of Object.values(this.wordsData)) {
        if (Array.isArray(category)) {
          category.forEach((w) => wordSet.add(w.trim().toLowerCase()));
        }
      }
    }
    return Array.from(wordSet);
  }

  /**
   * Returns a list of available categories.
   * @returns {string[]}
   */
  getCategories() {
    return typeof this.wordsData === 'object' && !Array.isArray(this.wordsData)
      ? Object.keys(this.wordsData)
      : ['default'];
  }

  /**
   * Generates N unique random word choices for the drawer.
   * Guarantees no duplicates within the selection.
   *
   * @param {number} count - Number of word choices to pick (e.g. 3)
   * @param {object} [options]
   * @param {string} [options.category] - Optional category filter
   * @param {string} [options.wordMode] - 'normal' | 'hidden'
   * @returns {string[]}
   */
  getRandomWords(count = 3, options = {}) {
    let pool = this._allWords;

    if (options.category && this.wordsData[options.category]) {
      pool = this.wordsData[options.category].map((w) => w.trim().toLowerCase());
    }

    if (!pool || pool.length === 0) {
      pool = ['cat', 'dog', 'tree'];
    }

    const targetCount = Math.min(Math.max(1, count), pool.length);
    const shuffled = [...pool];

    // Fisher-Yates partial shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, targetCount);
  }

  /**
   * Validates whether the selected word was genuinely in the offered choices.
   * Uses case-insensitive, whitespace-trimmed comparison.
   *
   * @param {string[]} offeredWords - The choices presented to the drawer
   * @param {string} selectedWord - The word the drawer submitted
   * @returns {string | null} The matched canonical word, or null if invalid
   */
  validateSelection(offeredWords, selectedWord) {
    if (!Array.isArray(offeredWords) || !selectedWord || typeof selectedWord !== 'string') {
      return null;
    }

    const normalizedSelected = selectedWord.trim().toLowerCase();
    const match = offeredWords.find(
      (w) => typeof w === 'string' && w.trim().toLowerCase() === normalizedSelected
    );

    return match || null;
  }

  /**
   * Generates guesser-facing masked display for the secret word.
   * Never exposes secret characters to guessers.
   *
   * In 'normal' mode:
   *   Alphanumeric chars are replaced with underscores separated by spaces.
   *   Spaces between words are preserved with clear spacing (e.g., 'ice cream' -> '_ _ _   _ _ _ _ _').
   *   Hyphens are preserved.
   *
   * In 'hidden' mode:
   *   Letters are masked without revealing individual letter boundaries (or with '?').
   *
   * @param {string} word - The secret word
   * @param {string} [wordMode='normal'] - Room settings wordMode
   * @returns {{ wordLength: number, display: string, charCount: number }}
   */
  generateWordDisplay(word, wordMode = 'normal') {
    if (!word || typeof word !== 'string') {
      return { wordLength: 0, display: '', charCount: 0 };
    }

    const trimmed = word.trim();
    const charCount = trimmed.replace(/\s+/g, '').length;

    if (wordMode === 'hidden') {
      // In hidden mode, each word segment is masked with '?' or hidden indicator
      const parts = trimmed.split(' ');
      const hiddenParts = parts.map((part) => '?'.repeat(part.length));
      return {
        wordLength: trimmed.length,
        display: hiddenParts.join('   '),
        charCount,
      };
    }

    // Normal mode: Convert words into spaced underscores
    const words = trimmed.split(' ');
    const maskedWords = words.map((w) => {
      return w
        .split('')
        .map((ch) => (ch === '-' ? '-' : '_'))
        .join(' ');
    });

    return {
      wordLength: trimmed.length,
      display: maskedWords.join('   '), // 3 spaces between distinct words
      charCount,
    };
  }

  /**
   * Checks whether a guess matches the secret word.
   * Authoritative, server-side, case-insensitive, trimmed comparison.
   *
   * @param {string} guess - Guesser input
   * @param {string} secretWord - Correct word
   * @returns {boolean}
   */
  checkGuess(guess, secretWord) {
    if (!guess || typeof guess !== 'string' || !secretWord || typeof secretWord !== 'string') {
      return false;
    }
    return guess.trim().toLowerCase() === secretWord.trim().toLowerCase();
  }
}

module.exports = WordManager;
