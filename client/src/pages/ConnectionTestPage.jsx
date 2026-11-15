/**
 * pages/ConnectionTestPage.jsx
 *
 * Preserves the Phase 1 REST health check and Socket.IO connection & ping/pong test.
 * Styled with the "SketchClub" Studio Diagnostics aesthetic.
 * Accessible at /debug-connection for diagnosis and connection troubleshooting.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkHealth } from '../api/roomApi';
import socket from '../socket/socket';
import { TapeBadge } from '../components/common/Doodles';

export default function ConnectionTestPage() {
  const [healthStatus, setHealthStatus] = useState('checking...');
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [socketId, setSocketId] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkHealth()
      .then((data) => {
        setHealthStatus(`✅ ${data.message} (${data.environment})`);
      })
      .catch((err) => {
        setHealthStatus(`❌ Failed: ${err.message}`);
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    } else {
      setSocketStatus('connected');
      setSocketId(socket.id);
    }

    const onConnect = () => {
      setSocketStatus('connected');
      setSocketId(socket.id);
      setError(null);
    };

    const onDisconnect = () => {
      setSocketStatus('disconnected');
      setSocketId(null);
    };

    const onConnectError = (err) => {
      setSocketStatus('error');
      setError(`Socket error: ${err.message}`);
    };

    const onPong = (data) => {
      setPingResult(data);
      setPingLoading(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('pong_test', onPong);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('pong_test', onPong);
    };
  }, []);

  const handlePingTest = () => {
    if (!socket.connected) return;
    setPingLoading(true);
    setPingResult(null);
    socket.emit('ping_test', { message: 'Hello from frontend!', time: Date.now() });
  };

  return (
    <div className="min-h-screen bg-paper bg-notebook-dots text-ink flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="btn-tactile px-3.5 py-1.5 bg-paper-light text-ink text-xs font-black rounded-xl inline-flex items-center gap-1.5"
          >
            ← Back to Studio
          </Link>
          <TapeBadge text="DIAGNOSTICS LAB" color="bg-lime" className="-rotate-1" />
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-black text-ink tracking-tight mb-1">
            🎨 SketchClub Signal Test
          </h1>
          <p className="text-ink-light text-sm font-hand text-lg">
            Low-level REST endpoint & WebSocket socket monitor
          </p>
        </div>

        {/* REST Health Check */}
        <div className="bg-paper-light border-2 border-ink rounded-2xl p-5 shadow-ink">
          <h2 className="text-sm font-black uppercase tracking-wider mb-2 text-ink flex items-center gap-2">
            <span>📡</span>
            <span>REST API Health</span>
          </h2>
          <div className="font-mono text-xs bg-paper border border-ink/30 rounded-xl p-3">
            <span className="text-ink-light">GET /api/health → </span>
            <span className={error ? 'text-coral font-bold' : 'text-lime-hover font-bold'}>
              {healthStatus}
            </span>
          </div>
        </div>

        {/* Socket.IO Status */}
        <div className="bg-paper-light border-2 border-ink rounded-2xl p-5 shadow-ink">
          <h2 className="text-sm font-black uppercase tracking-wider mb-2 text-ink flex items-center gap-2">
            <span>🔌</span>
            <span>Socket.IO Live Channel</span>
          </h2>
          <div className="space-y-2 font-mono text-xs bg-paper border border-ink/30 rounded-xl p-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full flex-shrink-0 border border-ink ${
                  socketStatus === 'connected'
                    ? 'bg-lime animate-pulse'
                    : socketStatus === 'error'
                    ? 'bg-coral'
                    : 'bg-zinc-400'
                }`}
              />
              <span className="font-bold">
                State:{' '}
                <span
                  className={
                    socketStatus === 'connected'
                      ? 'text-lime-hover font-bold'
                      : socketStatus === 'error'
                      ? 'text-coral font-bold'
                      : 'text-ink-light'
                  }
                >
                  {socketStatus}
                </span>
              </span>
            </div>
            {socketId && (
              <p className="text-ink">
                socket.id: <span className="text-cobalt font-bold">{socketId}</span>
              </p>
            )}
            {error && <p className="text-coral font-bold">Error: {error}</p>}
          </div>
        </div>

        {/* Ping Test */}
        <div className="bg-paper-light border-2 border-ink rounded-2xl p-5 shadow-ink">
          <h2 className="text-sm font-black uppercase tracking-wider mb-3 text-ink flex items-center gap-2">
            <span>🏓</span>
            <span>Loopback Ping / Pong Benchmark</span>
          </h2>
          <button
            onClick={handlePingTest}
            disabled={socketStatus !== 'connected' || pingLoading}
            className="btn-tactile px-5 py-2.5 bg-cobalt hover:bg-cobalt-light disabled:bg-paper-dark
                       disabled:text-ink-faint text-white rounded-xl font-black text-xs transition-colors mb-4 flex items-center gap-2"
          >
            <span>{pingLoading ? '⏳ Waiting for pong...' : '⚡ Send Ping Wave →'}</span>
          </button>

          {pingResult && (
            <div className="font-mono text-xs bg-paper border border-ink/30 rounded-xl p-3.5 space-y-1.5">
              <p className="text-lime-hover font-bold">✅ Pong packet received from server</p>
              <p>Server message: <span className="text-cobalt font-bold">{pingResult.message}</span></p>
              <p>Server time: <span className="text-ink-light">{pingResult.serverTime}</span></p>
              <p>Client socket ID: <span className="text-ink-light">{pingResult.yourSocketId}</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
