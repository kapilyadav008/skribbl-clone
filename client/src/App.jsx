/**
 * App.jsx
 *
 * Root component that configures React Router and the global RoomProvider context.
 *
 * ROUTES:
 * - /                   -> HomePage (Player name, Create Room, Join with Code)
 * - /join/:roomCode     -> JoinPage (Invite link landing with room details preview)
 * - /room/:roomCode     -> LobbyPage (Live player roster, room settings, host controls)
 * - /debug-connection   -> ConnectionTestPage (Phase 1 REST & WebSocket health tester)
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { getOrCreateSessionId } from './utils/helpers';
import { RoomProvider } from './context/RoomContext';
import HomePage from './pages/HomePage';
import JoinPage from './pages/JoinPage';
import LobbyPage from './pages/LobbyPage';
import ConnectionTestPage from './pages/ConnectionTestPage';

function App() {
  // Ensure the client has a persistent session ID on app launch
  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    console.log('[App] Initialized session ID:', sessionId);
  }, []);

  return (
    <BrowserRouter>
      <RoomProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join/:roomCode" element={<JoinPage />} />
          <Route path="/room/:roomCode" element={<LobbyPage />} />
          <Route path="/debug-connection" element={<ConnectionTestPage />} />
        </Routes>
      </RoomProvider>
    </BrowserRouter>
  );
}

export default App;
