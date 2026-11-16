/**
 * components/game/CanvasArea.jsx
 *
 * Integrated drawing area combining the DrawingCanvas and DrawingToolbar.
 * Manages active tool, color, brush size, and coordinates undo/clear socket emissions.
 */

import React, { useState } from 'react';
import DrawingCanvas from './DrawingCanvas';
import DrawingToolbar from './DrawingToolbar';
import socket from '../../socket/socket';

export default function CanvasArea({ isDrawer = false, roomCode, compact = false }) {
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#18181B');
  const [brushSize, setBrushSize] = useState(6);

  const handleUndo = () => {
    if (!isDrawer) return;
    socket.emit('undo_drawing');
  };

  const handleClear = () => {
    if (!isDrawer) return;
    socket.emit('clear_canvas');
  };

  return (
    <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-[820px] mx-auto">
      <DrawingCanvas
        isDrawer={isDrawer}
        tool={tool}
        color={color}
        brushSize={brushSize}
        roomCode={roomCode}
      />
      <div className={!isDrawer ? 'hidden sm:block' : 'block'}>
        <DrawingToolbar
          isDrawer={isDrawer}
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          onUndo={handleUndo}
          onClear={handleClear}
          compact={compact}
        />
      </div>
    </div>
  );
}

