/**
 * game/DrawingManager.js
 *
 * Manages stroke history, coordinate validation, limits, undo, and clear operations
 * for an active game round.
 *
 * KEY RESPONSIBILITIES:
 * 1. Maintain in-memory history of completed drawing strokes.
 * 2. Track currently active stroke in progress.
 * 3. Validate coordinates, brush size, color, and tools within global bounds.
 * 4. Enforce security limits (max points per stroke, max strokes per round).
 * 5. Handle undo (removes latest complete stroke) and canvas clear.
 * 6. Provide history snapshot for newly joined or reconnecting players.
 * 7. Safely handle player disconnects during an unfinished stroke.
 */

const CONSTANTS = require('../config/constants');

class DrawingManager {
  constructor() {
    // Array of completed stroke objects
    this.strokes = [];

    // In-progress stroke object currently being drawn
    this.currentStroke = null;
  }

  /**
   * Validates a single coordinate point.
   * @param {object} pt - { x, y }
   * @returns {boolean}
   */
  static isValidPoint(pt) {
    if (!pt || typeof pt !== 'object') return false;
    const { x, y } = pt;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (isNaN(x) || isNaN(y)) return false;

    const { CANVAS_WIDTH, CANVAS_HEIGHT } = CONSTANTS.DRAWING;
    return x >= 0 && x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT;
  }

  /**
   * Starts a new stroke.
   * @param {object} params
   * @param {string} params.strokeId
   * @param {string} params.sessionId
   * @param {string} [params.color]
   * @param {number} [params.brushSize]
   * @param {string} [params.tool]
   * @param {object} params.point - Initial { x, y }
   * @returns {object} Validated stroke object
   */
  startStroke({ strokeId, sessionId, color, brushSize, tool, point }) {
    if (!strokeId || typeof strokeId !== 'string') {
      throw new Error('Valid strokeId is required');
    }

    if (!DrawingManager.isValidPoint(point)) {
      throw new Error('Invalid starting point coordinates');
    }

    const D = CONSTANTS.DRAWING;

    if (this.strokes.length >= D.MAX_STROKES_PER_ROUND) {
      throw new Error('Maximum strokes limit reached for this round');
    }

    const validatedBrushSize = Math.min(
      D.MAX_BRUSH_SIZE,
      Math.max(D.MIN_BRUSH_SIZE, parseInt(brushSize, 10) || D.DEFAULT_BRUSH_SIZE)
    );

    const validatedColor =
      typeof color === 'string' && color.trim().length <= 30
        ? color.trim()
        : D.DEFAULT_COLOR;

    const validatedTool = D.TOOLS.includes(tool) ? tool : 'brush';

    const stroke = {
      strokeId,
      sessionId,
      color: validatedColor,
      brushSize: validatedBrushSize,
      tool: validatedTool,
      points: [{ x: Math.round(point.x), y: Math.round(point.y) }],
    };

    this.currentStroke = stroke;
    return stroke;
  }

  /**
   * Appends points to the active in-progress stroke.
   * @param {string} strokeId
   * @param {Array<{ x: number, y: number }>} rawPoints
   * @returns {Array<{ x: number, y: number }>} Added valid points
   */
  addPoints(strokeId, rawPoints) {
    if (!this.currentStroke || this.currentStroke.strokeId !== strokeId) {
      throw new Error('No matching active stroke in progress');
    }

    if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
      return [];
    }

    const D = CONSTANTS.DRAWING;
    const remainingSlots = D.MAX_POINTS_PER_STROKE - this.currentStroke.points.length;
    if (remainingSlots <= 0) {
      return [];
    }

    const validPoints = [];
    for (const pt of rawPoints) {
      if (validPoints.length >= remainingSlots) break;
      if (DrawingManager.isValidPoint(pt)) {
        validPoints.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
      }
    }

    if (validPoints.length > 0) {
      this.currentStroke.points.push(...validPoints);
    }

    return validPoints;
  }

  /**
   * Concludes the active stroke and commits it to stroke history.
   * @param {string} strokeId
   * @returns {object | null} The committed stroke
   */
  endStroke(strokeId) {
    if (!this.currentStroke || this.currentStroke.strokeId !== strokeId) {
      return null;
    }

    const finishedStroke = this.currentStroke;
    this.strokes.push(finishedStroke);
    this.currentStroke = null;
    return finishedStroke;
  }

  /**
   * Removes the most recent complete stroke from history (undo).
   * @returns {object | null} The removed stroke, or null if history was empty
   */
  undo() {
    if (this.strokes.length === 0) {
      return null;
    }
    return this.strokes.pop();
  }

  /**
   * Clears all strokes and resets the active stroke.
   */
  clear() {
    this.strokes = [];
    this.currentStroke = null;
  }

  /**
   * Returns a copy of the completed strokes history.
   * @returns {Array<object>}
   */
  getHistory() {
    return [...this.strokes];
  }

  /**
   * Handles player disconnection while a stroke might be open.
   * @param {string} sessionId
   */
  handleDisconnect(sessionId) {
    if (this.currentStroke && this.currentStroke.sessionId === sessionId) {
      // Safely finalize or discard in-progress stroke
      if (this.currentStroke.points.length > 1) {
        this.strokes.push(this.currentStroke);
      }
      this.currentStroke = null;
    }
  }

  /**
   * Resets the entire drawing manager state for a new turn.
   */
  reset() {
    this.strokes = [];
    this.currentStroke = null;
  }
}

module.exports = DrawingManager;

