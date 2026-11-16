# SketchClub — Real-Time Multiplayer Drawing & Guessing Game

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://sketchclub-seven.vercel.app/)
[![GitHub](https://img.shields.io/badge/github-repo-blue.svg)](https://github.com/kapilyadav008/skribbl-clone)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/vite-8.3.8-purple.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/react-19.3.1-61dafb.svg)](https://react.dev/)
[![Socket.IO](https://img.shields.io/badge/socket.io-4.8.4-black.svg)](https://socket.io/)

**SketchClub** is a fast-paced, real-time multiplayer drawing and guessing web application inspired by Skribbl.io. Built with an indie sketchbook and tactile paper-and-ink visual aesthetic, it features server-authoritative turn management, real-time canvas stroke synchronization, progressive hint unmasking, speed-based scoring, and full mobile-first responsive gameplay.

---

## 🔗 Live Links

- **Live Application:** [https://sketchclub-seven.vercel.app/](https://sketchclub-seven.vercel.app/)
- **GitHub Repository:** [https://github.com/kapilyadav008/skribbl-clone](https://github.com/kapilyadav008/skribbl-clone)
- **Production Backend API:** [https://sketchclub-server.onrender.com/health](https://sketchclub-server.onrender.com/health)

---

## 🎨 Implemented Features

### 1. Room Creation & Lobby Management
- **Instant Room Creation:** Generate private rooms with clean, 6-character alphanumeric room codes (e.g. `ABC123`).
- **Shareable Invite Links:** One-click clipboard copy (`/join/:roomCode`) that allows friends to jump directly into the room.
- **Customizable Game Rules:** Hosts can configure Table Capacity (2–20 players), Round Count (2–10), Drawing Turn Duration (15–240s), Word Choices (1–5), and Word Mask Mode (`normal` or `hidden`).
- **Dynamic Host Delegation:** If the host leaves or disconnects permanently, room ownership is automatically transferred to the next connected player.
- **Auto-Cleanup:** Inactive and empty rooms are automatically reclaimed from server memory.

### 2. Real-Time Drawing & Canvas Engine
- **Resolution-Independent Coordinate System:** Standardized 800×600 internal canvas coordinate system ensuring identical stroke placement across laptops, tablets, and phones regardless of CSS scaling.
- **Stroke Streaming & Batching:** Real-time Socket.IO synchronization via `draw_start`, `draw_move`, and `draw_end` events with point interpolation.
- **Drawing Toolkit:**
  - 16 distinct color swatches.
  - 4 calibrated brush sizes (S: 3px, M: 6px, L: 12px, XL: 24px).
  - Dedicated Eraser tool.
  - Multi-level Undo stack and one-click Canvas Clear with synchronized room broadcasts.
- **Late-Join & Reconnect Stroke Recovery:** Server maintains a full stroke history buffer so reconnecting players immediately receive the current drawing in progress.

### 3. Server-Authoritative Game Loop
- **Secret Word Selection:** At the start of each turn, the active drawer receives 3 randomized word choices with a 15-second selection countdown. Word choices are strictly emitted to the drawer's private socket ID. If the countdown expires, the server automatically selects a word.
- **Guesser Privacy Protection:** Guessers only receive masked blanks (e.g., `_ _ _ _ _`) and character lengths. The actual word is never exposed in client payloads, network packets, or DOM nodes until the round ends.
- **Progressive Hint Unmasking:** Server reveals letters progressively at calibrated time intervals (e.g., at 60% and 30% remaining time) without spoiling short words.
- **Speed-Based Scoring Multipliers:**
  - **1st Guesser:** `TimeLeft × 10` points
  - **2nd Guesser:** `TimeLeft × 8` points
  - **3rd+ Guessers:** `TimeLeft × 6` points
  - **Drawer Bonus:** Flat 50 bonus points for every player who correctly guesses the sketch.
- **Premature Turn Completion:** Turns immediately wrap up when all active guessers find the secret word.
- **Round-End Breakdown & Podium:** Dedicated post-turn modal displaying points earned this turn, cumulative scores, and the revealed word. At game conclusion, a 3-tier podium (#1, #2, #3) crowns the winners with options to play again or return to the lobby.
- **Last Remaining Player Silent Auto-Win:** When an active match drops to only one connected player, a server-authoritative 5-second timer runs silently in the background. If another player reconnects within the 5 seconds, the countdown is cancelled and normal gameplay resumes. If only one player remains when the timer expires, the match concludes cleanly and displays the standard Game Over leaderboard and podium with the remaining player ranked #1—preserving their actual score without artificial bonus points or special forfeit badges.

### 4. Interactive Guessing & Real-Time Chat
- **Spoiler Shield:** Correct guesses are hidden from chat to prevent spoiling the word for other players. A celebratory notification (`Player guessed the word!`) is broadcast instead.
- **Close Guess Detection:** Server analyzes incorrect guesses with Levenshtein distance $\le 2$ or 1 character difference and alerts the guesser privately with `"You're close!"`.
- **Drawer Guess Lock:** The active drawer is blocked from entering guesses.
- **Clean Event-Driven System Notifications:** Subtle, deduplicated chat announcements (`"[Player Name] joined the room."` and `"[Player Name] left the room."`) appear cleanly without reconnect spam.

### 5. Mobile-First Responsive Design & Container-Isolated Chat
- **4:3 Aspect-Ratio Canvas:** Built with CSS `touch-none` preventing mobile viewport drag/zoom while drawing.
- **Mobile Split View:** Below the canvas, screens under 1024px split neatly into a 40% scrollable Players roster and a 60% scrollable Chat history.
- **Sticky Bottom Input Bar:** Mobile guessers have an always-visible, sticky input bar to type guesses quickly without scrolling past the canvas.
- **Container-Isolated Chat Auto-Scroll:** Chat message streaming strictly updates `container.scrollTop` inside the chat panel. It never invokes ancestor `scrollIntoView()` or forces the browser window to jump downwards, ensuring seamless split-screen and mobile gameplay.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|:---|:---|
| **Frontend Framework** | React 19, Vite 8, React Router v7 |
| **Styling & Design** | Tailwind CSS v3, Paper-and-Ink tactile theme, Hand-drawn SVGs |
| **Canvas** | HTML5 Canvas API, Normalized Coordinate Interpolation, Touch Events |
| **Real-Time Client** | Socket.IO Client v4 (WebSocket transport) |
| **Backend Runtime** | Node.js (v18+), Express v4 |
| **Real-Time Server** | Socket.IO Server v4 with in-memory room & session maps |
| **State Management** | Server-Authoritative OOP (`RoomManager`, `GameManager`, `DrawingManager`, `WordManager`) |
| **Deployment** | Vercel (Frontend SPA) + Render (Node.js Web Service) |

---

## 📁 Project Folder Structure

```
skribbl-clone/
├── client/                         # React + Vite Frontend
│   ├── public/                     # Static assets (favicons, icons)
│   ├── src/
│   │   ├── api/
│   │   │   └── roomApi.js          # REST client for room creation & metadata
│   │   ├── components/
│   │   │   ├── common/             # Reusable tactile doodles, tape badges, buttons
│   │   │   ├── game/               # Gameplay components
│   │   │   │   ├── CanvasArea.jsx     # Canvas + Toolbar orchestrator
│   │   │   │   ├── ChatPanel.jsx      # Guessing stream, notifications & input bar
│   │   │   │   ├── DrawingCanvas.jsx  # HTML5 Canvas with mouse & touch listeners
│   │   │   │   ├── DrawingToolbar.jsx # Colors, brush sizes, undo & clear
│   │   │   │   ├── GameArena.jsx      # Responsive desktop & mobile game arena
│   │   │   │   ├── GameOverModal.jsx  # Final match podium & leaderboard
│   │   │   │   ├── RoundEndModal.jsx  # Turn score reveal & word reveal modal
│   │   │   │   └── WordSelectModal.jsx# Word choice picker (drawer) & waiting view
│   │   │   └── lobby/
│   │   │       └── SettingsModal.jsx  # Host game settings configuration dialog
│   │   ├── context/
│   │   │   └── RoomContext.jsx     # Global room state, socket listeners & dispatchers
│   │   ├── pages/
│   │   │   ├── ConnectionTestPage.jsx # Phase 1 REST & WebSocket health diagnostic
│   │   │   ├── HomePage.jsx        # Landing page (name, create room, join by code)
│   │   │   ├── JoinPage.jsx        # Invite link landing preview (/join/:code)
│   │   │   └── LobbyPage.jsx       # Pre-game lobby & live match routing
│   │   ├── socket/
│   │   │   └── socket.js           # Singleton Socket.IO client instance
│   │   ├── utils/
│   │   │   └── helpers.js          # Session ID generator & clipboard utility
│   │   ├── App.jsx                 # Route definitions & Session initialization
│   │   └── main.jsx                # Application mount point
│   ├── .env.example                # Frontend environment template
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vercel.json                 # SPA client route rewrites for Vercel
│   └── vite.config.js
├── server/                         # Node.js + Express + Socket.IO Backend
│   ├── config/
│   │   └── constants.js            # Global bounds, scoring, reconnect & canvas constants
│   ├── data/
│   │   └── words.json              # 180+ tiered dictionary words
│   ├── game/                       # Core In-Memory Domain Models
│   │   ├── DrawingManager.js       # Stroke validation, undo stack & coordinate bounds
│   │   ├── GameManager.js          # Authoritative game loop, timers, scoring & turns
│   │   ├── Player.js               # Player entity, reconnect timer & serialization
│   │   ├── Room.js                 # Room entity, settings & player membership
│   │   ├── RoomManager.js          # Room lifecycle, host transfers & memory cleanup
│   │   └── WordManager.js          # Word randomization, hints & Levenshtein matching
│   ├── routes/
│   │   └── roomRoutes.js           # REST endpoints: POST /api/rooms, GET /api/rooms/:code
│   ├── socket/
│   │   ├── drawHandlers.js         # Socket events for drawing, undo & clear
│   │   ├── gameHandlers.js         # Socket events for word selection, guesses & rounds
│   │   ├── roomHandlers.js         # Socket events for joining, settings & disconnects
│   │   └── index.js                # Socket.IO connection bootstrap
│   ├── utils/
│   │   └── generateRoomCode.js     # Unambiguous 6-char room code generator
│   ├── .env.example                # Backend environment template
│   ├── index.js                    # Express & HTTP server entry point
│   ├── package.json
│   ├── test-connection.js          # Phase 1 integration test suite
│   ├── test-drawing.js             # Phase 4 canvas & stroke test suite
│   ├── test-game.js                # Phase 3 game engine test suite
│   ├── test-insufficient-players.js# Player disconnect & minimum players regression suite
│   ├── test-multiplayer-smoke.js   # 2-player end-to-end full match smoke test
│   └── test-rooms.js               # Phase 2 room management test suite
├── render.yaml                     # Render Blueprint configuration
├── vercel.json                     # Root Vercel deployment configuration
└── package.json                    # Root package descriptor & convenience scripts
```

---

## ⚙️ Prerequisites & Local Setup

### Prerequisites
- **Node.js**: `v18.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **npm**: `v9.0.0` or higher (bundled with Node.js)
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/kapilyadav008/skribbl-clone.git
cd skribbl-clone
```

### 2. Configure Environment Variables

**Backend (`server/.env`):**
Create `server/.env` from `server/.env.example`:
```bash
cp server/.env.example server/.env
```
Default local values:
```env
PORT=4000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

**Frontend (`client/.env`):**
Create `client/.env` from `client/.env.example`:
```bash
cp client/.env.example client/.env
```
Default local value:
```env
VITE_SERVER_URL=http://localhost:4000
```

### 3. Install Dependencies

Install backend dependencies:
```bash
cd server
npm install
cd ..
```

Install frontend dependencies:
```bash
cd client
npm install
cd ..
```

### 4. Run the Application Locally

In two separate terminal windows:

**Terminal 1 (Backend Server):**
```bash
cd server
npm run dev
```
*The server will start listening at `http://localhost:4000` with nodemon auto-reload.*

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
```
*Vite will start the dev server at `http://localhost:5173`.*

Open `http://localhost:5173` in your browser. Open a secondary incognito browser window to join the same room and test multiplayer drawing in real time!

---

## 🔐 Environment Variables

| Variable | Location | Default / Example | Purpose |
|:---|:---|:---|:---|
| `PORT` | `server/.env` | `4000` | Port for Express & Socket.IO server (assigned by Render in production). |
| `CLIENT_URL` | `server/.env` | `http://localhost:5173` | Allowed CORS origins (supports multiple comma-separated URLs for Vercel preview/production). |
| `NODE_ENV` | `server/.env` | `development` / `production` | Environment mode flag for logging and optimizations. |
| `VITE_SERVER_URL` | `client/.env` | `http://localhost:4000` | Base URL used by the frontend for REST API calls and Socket.IO connection. |

*No secrets, API keys, or database credentials are required because game state is in-memory.*

---

## 🎮 How to Play

1. **Create or Join a Room:**
   - On the Home page, type your nickname and click **✨ Create Private Room**.
   - Customize table rules (number of rounds, draw timer, hints) or proceed with defaults.
2. **Invite Friends:**
   - In the lobby, click **📋 COPY INVITE** to copy your room's direct link (`/join/XXXXXX`), or share the 6-character room code.
   - Wait for at least one friend to join.
3. **Start Game:**
   - Once 2 or more players are seated, the host clicks **Start Game**.
4. **Drawing Turn:**
   - The selected drawer chooses 1 secret word from 3 choices.
   - Use the palette, brush sizes, and tools to sketch clues on the canvas before the clock runs out.
   - Use **Undo** or **Clear** if you need to fix a mistake.
5. **Guessing Turn:**
   - Guessers watch strokes appear on their screen in real time.
   - Type your guesses in the chat box.
   - Guessing quickly earns up to 300+ speed-multiplier points!
   - Close guesses trigger a helpful yellow nudge.
6. **Round Transitions & Victory:**
   - When time expires or everyone guesses correctly, the secret word is revealed with points earned for the turn.
   - After all rounds conclude, the top 3 champions are celebrated on the match podium!

---

## 🏗️ System Architecture & Mechanics

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React SPA (Frontend)                           │
│  HomePage / JoinPage ──> LobbyPage ──> GameArena (4:3 Canvas & Chat)   │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │ REST API                       │ WebSockets
                    │ (POST /rooms, GET /rooms/:id)  │ (Real-Time Bidirectional)
                    ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Node.js + Socket.IO Server                         │
├────────────────────────────────────────────────────────────────────────┤
│  RoomManager       │ GameManager        │ DrawingManager │ WordManager │
│  - 6-char codes    │ - Turn lifecycle   │ - 800x600 norm │ - Tiered db │
│  - 30s grace per.  │ - Secret privacy   │ - Stroke queue │ - Hints     │
│  - Host transfer   │ - Authoritative clk│ - Undo stack   │ - Distance  │
│  - Memory cleanup  │ - Speed scoring    │ - Stroke broadcast check     │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Server-Authoritative Game State:**
   - Game status, round progression, drawer assignment, and timers are managed solely on the server. Clients receive synchronized snapshots and cannot manipulate timers or inject arbitrary scores.
2. **Secret Word Privacy:**
   - The unmasked word is sent exclusively to the active drawer's individual socket connection (`word_choices`). Guessers receive masked strings containing underscores and length metadata (`_ _ _ _ _`).
3. **Drawing Synchronization:**
   - Coordinate points are normalized to an 800×600 internal resolution. Points are validated against bounds and stroke limits before being broadcast to other room participants.
4. **Graceful Disconnection Recovery:**
   - If a player accidentally closes their tab or refreshes their browser, a 30-second reconnection timer is started. Reconnecting with the same persistent `sessionId` restores the player's score, room seat, and latest canvas drawing history without interrupting the game.

---

## 🚀 Deployment

The project is architected for zero-downtime, continuous deployment from GitHub:

### Backend Deployment (Render)
- Configured via `render.yaml` as a Web Service.
- **Root Directory:** `server`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `CLIENT_URL=https://sketchclub-seven.vercel.app`

### Frontend Deployment (Vercel)
- Configured via root `vercel.json` and `client/vercel.json` with SPA routing rewrites.
- **Root Directory:** `./`
- **Build Command:** `npm run build --prefix client`
- **Output Directory:** `client/dist`
- **Environment Variables:**
  - `VITE_SERVER_URL=https://sketchclub-server.onrender.com`

---

## 🧪 Automated Testing Suite

The repository includes a comprehensive, multi-phase automated test suite with **90 backend unit/integration tests**, **20 auto-win & chat regression test assertions**, and a complete **multiplayer smoke test**.

### Run Full Backend Unit & Integration Tests:
```bash
npm --prefix server test
```
*Executes all test phases sequentially:*
- `test-connection.js`: REST health endpoints, 404 handler, and Socket.IO ping/pong echoing.
- `test-rooms.js`: Room creation, settings sanitization, join limits, host transfers, explicit leave events, and room cleanup.
- `test-game.js`: Game lifecycle, word selection privacy, timer ticks, speed scoring multipliers, hints, and podium results.
- `test-drawing.js`: Canvas coordinate bounds, tool validation, stroke streaming, undo/clear synchronization, and late-join stroke recovery.

### Run Auto-Win & Chat Notification Regression Suite:
```bash
node server/test-insufficient-players.js
```
*Validates 20 assertions across 7 core multiplayer scenarios including silent 5s background auto-win, reconnect countdown cancellation, join/leave notification deduplication, score preservation, and empty room cleanup.*

### Run Multiplayer End-to-End Smoke Test:
```bash
node server/test-multiplayer-smoke.js
```
*Runs an automated 2-player, 2-round simulation verifying room creation, word picking, drawing, real-time guessing, scoring, round end, and final game over.*

### Run Frontend Production Build Check:
```bash
npm --prefix client run build
```
*Verifies clean compilation and bundle chunk generation with Vite.*

---

## ⚠️ Known Limitations

1. **In-Memory State (Process Volatility):** Active rooms, player sessions, and stroke histories reside in server RAM. A backend restart or Render free-tier idle spin-down clears active rooms.
2. **Single-Node Architecture:** The server utilizes Socket.IO's default in-memory adapter. Running multiple clustered or multi-region backend instances would require sticky sessions and a shared Redis adapter.
3. **Session-Based Profiles:** Player identification uses browser `sessionStorage` UUIDs. Player stats, custom avatars, and win histories do not persist across different devices or cleared browser sessions.
4. **Fixed 4:3 Aspect Ratio:** The canvas coordinate space is fixed at 800×600 to guarantee exact cross-device coordinate alignment. Arbitrary free-form or panoramic canvas dimensions are not supported.

---

## 📄 License & Credits

Developed by **Kapil Kumar** for the Web3Task internship technical evaluation.
Inspired by the gameplay mechanics of Skribbl.io.
