/**
 * components/game/DrawingCanvas.jsx
 *
 * HTML5 Real-Time Drawing Canvas Component.
 *
 * KEY FEATURES:
 * 1. Fixed 800x600 internal coordinate system for resolution-independent multi-device drawing.
 * 2. Mouse and Touch drawing support with smooth continuous lines.
 * 3. Authoritative role enforcement: only active drawer can emit strokes.
 * 4. Responsive CSS scaling (`aspect-[4/3]`) without canvas memory or history loss.
 * 5. Full real-time Socket.IO synchronization:
 *    - `draw_start`, `draw_move`, `draw_end`
 *    - `drawing_undone`, `canvas_cleared`, `drawing_history`
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import socket from '../../socket/socket';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

export default function DrawingCanvas({
  isDrawer = false,
  tool = 'brush',
  color = '#000000',
  brushSize = 5,
  roomCode,
}) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef(null);
  const strokeHistoryRef = useRef([]);
  const currentTurnKeyRef = useRef(null);

  // Remote in-progress strokes from drawer (when this client is guessing)
  const remoteStrokeRef = useRef(null);

  /**
   * Helper: Redraw the entire canvas from stroke history.
   */
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Reset canvas with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Replay each stroke in order
    strokeHistoryRef.current.forEach((stroke) => {
      drawFullStroke(ctx, stroke);
    });
  }, []);

  /**
   * Draws a complete stroke on the 2D context.
   */
  function drawFullStroke(ctx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.brushSize || 5;
    ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color || '#000000';

    const pts = stroke.points;
    if (pts.length === 1) {
      // Draw single dot
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, (stroke.brushSize || 5) / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color || '#000000';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws a continuous line segment between two points on the canvas.
   */
  function drawSegment(ctx, p1, p2, strokeColor, size, strokeTool) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.strokeStyle = strokeTool === 'eraser' ? '#ffffff' : strokeColor;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Converts client mouse/touch coordinates to internal 800x600 canvas coordinate system.
   */
  function getCanvasCoordinates(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;

    const x = Math.round((clientX - rect.left) * scaleX);
    const y = Math.round((clientY - rect.top) * scaleY);

    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, x)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, y)),
    };
  }

  /**
   * Drawer pointer down handler.
   */
  const handlePointerDown = (e) => {
    if (!isDrawer) return;
    if (e.button !== undefined && e.button !== 0) return; // primary click only

    const point = getCanvasCoordinates(e);
    isDrawingRef.current = true;

    const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const strokeData = {
      strokeId,
      tool,
      color: tool === 'eraser' ? '#ffffff' : color,
      brushSize,
      point,
    };

    currentStrokeRef.current = {
      strokeId,
      tool,
      color: tool === 'eraser' ? '#ffffff' : color,
      brushSize,
      points: [point],
    };

    // Draw initial dot immediately on local canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.beginPath();
      ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.fill();
      ctx.restore();
    }

    socket.emit('draw_start', strokeData);
  };

  /**
   * Drawer pointer move handler.
   */
  const handlePointerMove = (e) => {
    if (!isDrawer || !isDrawingRef.current || !currentStrokeRef.current) return;

    const point = getCanvasCoordinates(e);
    const pts = currentStrokeRef.current.points;
    const lastPoint = pts[pts.length - 1];

    // Throttle duplicate points
    if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) return;

    pts.push(point);

    // Draw segment immediately on local canvas
    const canvas = canvasRef.current;
    if (canvas && lastPoint) {
      const ctx = canvas.getContext('2d');
      drawSegment(ctx, lastPoint, point, color, brushSize, tool);
    }

    socket.emit('draw_move', {
      strokeId: currentStrokeRef.current.strokeId,
      point,
    });
  };

  /**
   * Drawer pointer up/end handler.
   */
  const handlePointerUp = () => {
    if (!isDrawer || !isDrawingRef.current || !currentStrokeRef.current) return;

    isDrawingRef.current = false;
    const completedStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    strokeHistoryRef.current.push(completedStroke);

    socket.emit('draw_end', {
      strokeId: completedStroke.strokeId,
    });
  };

  /**
   * Socket.IO Listeners for Drawing Events
   */
  useEffect(() => {
    // 1. Remote stroke started
    const onRemoteDrawStart = (data) => {
      if (!data) return;
      const initialPoint = data.point || (Array.isArray(data.points) && data.points[0]);
      if (!initialPoint) return;

      remoteStrokeRef.current = {
        strokeId: data.strokeId,
        tool: data.tool || 'brush',
        color: data.color || '#000000',
        brushSize: data.brushSize || 5,
        points: [initialPoint],
      };

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.beginPath();
        ctx.arc(initialPoint.x, initialPoint.y, (data.brushSize || 5) / 2, 0, Math.PI * 2);
        ctx.fillStyle = data.tool === 'eraser' ? '#ffffff' : data.color || '#000000';
        ctx.fill();
        ctx.restore();
      }
    };

    // 2. Remote stroke point move
    const onRemoteDrawMove = (data) => {
      if (!data || !remoteStrokeRef.current || remoteStrokeRef.current.strokeId !== data.strokeId) return;

      const newPoints = Array.isArray(data.points)
        ? data.points
        : data.point
        ? [data.point]
        : [];

      if (newPoints.length === 0) return;

      const canvas = canvasRef.current;
      const ctx = canvas ? canvas.getContext('2d') : null;
      const pts = remoteStrokeRef.current.points;

      for (const pt of newPoints) {
        if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;
        const lastPoint = pts[pts.length - 1];
        pts.push(pt);

        if (ctx && lastPoint) {
          drawSegment(
            ctx,
            lastPoint,
            pt,
            remoteStrokeRef.current.color,
            remoteStrokeRef.current.brushSize,
            remoteStrokeRef.current.tool
          );
        }
      }
    };

    // 3. Remote stroke completed
    const onRemoteDrawEnd = (data) => {
      if (!data) return;
      if (data.stroke && data.stroke.strokeId) {
        const existingIdx = strokeHistoryRef.current.findIndex((s) => s.strokeId === data.stroke.strokeId);
        if (existingIdx >= 0) {
          strokeHistoryRef.current[existingIdx] = data.stroke;
        } else {
          strokeHistoryRef.current.push(data.stroke);
        }
        if (remoteStrokeRef.current && remoteStrokeRef.current.strokeId === data.stroke.strokeId) {
          remoteStrokeRef.current = null;
        }
      } else if (remoteStrokeRef.current && remoteStrokeRef.current.strokeId === data.strokeId) {
        strokeHistoryRef.current.push(remoteStrokeRef.current);
        remoteStrokeRef.current = null;
      }
    };

    // 4. Remote undo event
    const onRemoteUndo = (data) => {
      if (data.strokeId) {
        strokeHistoryRef.current = strokeHistoryRef.current.filter((s) => s.strokeId !== data.strokeId);
      } else {
        strokeHistoryRef.current.pop();
      }
      redrawAll();
    };

    // 5. Remote clear event
    const onRemoteClear = () => {
      strokeHistoryRef.current = [];
      remoteStrokeRef.current = null;
      redrawAll();
    };

    // 6. Full history catch-up on connect or round transition
    const onDrawingHistory = (data) => {
      const strokes = Array.isArray(data)
        ? data
        : Array.isArray(data?.strokes)
        ? data.strokes
        : [];
      strokeHistoryRef.current = strokes;
      redrawAll();
    };

    // 7. Reset canvas when a genuinely new round/turn begins
    const onRoundStart = (data) => {
      if (!data) return;
      const turnKey = `${data.round || 1}-${data.drawer?.id || 'unknown'}`;
      if (currentTurnKeyRef.current !== null && currentTurnKeyRef.current !== turnKey) {
        // Genuinely new turn! Reset stroke history and wipe canvas
        strokeHistoryRef.current = [];
        remoteStrokeRef.current = null;
        redrawAll();
      }
      currentTurnKeyRef.current = turnKey;
    };

    socket.on('draw_start', onRemoteDrawStart);
    socket.on('draw_move', onRemoteDrawMove);
    socket.on('draw_end', onRemoteDrawEnd);
    socket.on('drawing_undone', onRemoteUndo);
    socket.on('canvas_cleared', onRemoteClear);
    socket.on('drawing_history', onDrawingHistory);
    socket.on('round_start', onRoundStart);

    // Initial canvas render
    redrawAll();

    // Request history if joining mid-round
    socket.emit('get_drawing_history');

    return () => {
      socket.off('draw_start', onRemoteDrawStart);
      socket.off('draw_move', onRemoteDrawMove);
      socket.off('draw_end', onRemoteDrawEnd);
      socket.off('drawing_undone', onRemoteUndo);
      socket.off('canvas_cleared', onRemoteClear);
      socket.off('drawing_history', onDrawingHistory);
      socket.off('round_start', onRoundStart);
    };
  }, [redrawAll]);

  return (
    <div className="relative w-full flex items-center justify-center p-2 sm:p-3 bg-paper-light border-2 border-ink rounded-2xl shadow-ink">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
        className={`w-full max-w-[800px] aspect-[4/3] bg-white border-2 border-ink rounded-xl shadow-sm touch-none ${
          isDrawer ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />
    </div>
  );
}
