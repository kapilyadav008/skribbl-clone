/**
 * api/roomApi.js
 *
 * Thin wrappers around the backend REST endpoints.
 *
 * WHY SEPARATE API UTILS?
 * - Keeps fetch/axios logic out of React components.
 * - If the base URL changes, we update ONE file.
 * - Easy to swap fetch for axios later without touching components.
 *
 * In development: requests go to /api/... which Vite proxies to localhost:4000
 * In production:  requests go to VITE_SERVER_URL/api/...
 *
 * We use the native `fetch` API (no axios needed for 2 endpoints).
 */

// In development, Vite proxies /api → localhost:4000, so we use a relative URL.
// In production, we need the full backend URL without trailing slashes.
const getBaseUrl = () => {
  if (import.meta.env.DEV) {
    return '/api';  // proxied by Vite
  }
  const rawUrl = import.meta.env.VITE_SERVER_URL || '';
  const cleanUrl = rawUrl.replace(/\/+$/, '');
  return cleanUrl ? `${cleanUrl}/api` : '/api';
};

/**
 * checkHealth
 * Tests if the backend server is reachable.
 * @returns {Promise<{status: string, timestamp: string}>}
 */
export async function checkHealth() {
  const res = await fetch(`${getBaseUrl()}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/**
 * createRoom
 * Sends POST /api/rooms to create a new game room.
 * @param {string} hostName - Display name of the host
 * @param {object} settings - Room settings (maxPlayers, rounds, etc.)
 * @param {string} [sessionId] - Host's persistent session ID
 * @returns {Promise<{roomCode: string, inviteLink: string, hostSessionId: string, settings: object}>}
 */
export async function createRoom(hostName, settings, sessionId) {
  const res = await fetch(`${getBaseUrl()}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostName, settings, sessionId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Failed to create room');
  return data;
}

/**
 * getRoomInfo
 * Fetches basic room info to validate a room code before joining.
 * @param {string} roomCode
 * @returns {Promise<{roomCode: string, playerCount: number, connectedPlayerCount: number, status: string, maxPlayers: number, isFull: boolean, settings: object}>}
 */
export async function getRoomInfo(roomCode) {
  const res = await fetch(`${getBaseUrl()}/rooms/${roomCode.toUpperCase()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Room not found');
  return data;
}
