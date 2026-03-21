# TRD.md — Technical Requirements Document
### Project: "Project Fabricate"
**Version:** 1.0 | **Status:** Active | **Companion To:** `PRD.md v1.2`

---

## 1. Technology Stack

### Runtime & Language
- **Runtime:** Node.js (v20 LTS)
- **Language:** TypeScript across both server and client
- **Package Manager:** npm

### Server
- **Framework:** Express.js — serves both the REST API and the compiled React client as static files
- **WebSocket Library:** Socket.io (v4) — manages real-time bidirectional communication
- **Build Tool:** None required on the server; TypeScript compiled directly via `tsc`

### Client
- **Framework:** React 18 (with hooks)
- **Build Tool:** Vite — outputs a static bundle to `/server/public`
- **Styling:** Tailwind CSS
- **WebSocket Client:** `socket.io-client` (version matched to server)
- **State Management:** React Context + `useReducer` for local game state (no Redux)

### Deployment Model
- The Express server statically serves the compiled React app from `/server/public`
- A single `npm run build` command compiles both client and server
- A single `node dist/server.js` command starts the entire application
- No separate web server (Nginx, Apache) is required

---

## 2. Project Structure

```
/project-fabricate
├── /client                        # React frontend source
│   ├── /src
│   │   ├── /components            # Reusable UI components
│   │   ├── /screens               # One component per game phase
│   │   │   ├── LobbyScreen.tsx
│   │   │   ├── PromptScreen.tsx
│   │   │   ├── RevealScreen.tsx
│   │   │   ├── SelectionScreen.tsx
│   │   │   ├── ResolutionScreen.tsx
│   │   │   └── PodiumScreen.tsx
│   │   ├── /context               # GameContext (socket, state, dispatch)
│   │   ├── /hooks                 # Custom hooks (useSocket, useGameState)
│   │   ├── /types                 # Shared TypeScript types (imported from /shared)
│   │   ├── App.tsx                # Root; renders screen based on game phase
│   │   └── main.tsx               # Vite entry point
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.ts
│
├── /server                        # Express + Socket.io backend source
│   ├── /src
│   │   ├── /handlers              # Socket event handlers per game phase
│   │   ├── /rooms                 # Room store and state machine logic
│   │   ├── /content               # Question bank loader
│   │   ├── /utils                 # Scoring, shuffling, validation utilities
│   │   ├── server.ts              # Express app: static serving + Socket.io init
│   │   └── index.ts               # Entry point
│   └── /public                    # ← Compiled React output (populated by build)
│
├── /shared                        # Types and constants shared by client and server
│   ├── types.ts                   # GameState, Player, Fact, Event payloads
│   └── constants.ts               # Phase names, scoring values, timer durations
│
├── /content
│   └── facts.json                 # Question bank
│
├── package.json                   # Root scripts (build, dev, start)
└── tsconfig.json
```

---

## 3. Shared Types (`/shared/types.ts`)

All types are defined once and imported by both client and server. No type duplication is permitted.

```typescript
// --- Enums ---

export enum GamePhase {
  LOBBY      = "LOBBY",
  PROMPT     = "PROMPT",
  REVEAL     = "REVEAL",
  SELECTION  = "SELECTION",
  RESOLUTION = "RESOLUTION",
  PODIUM     = "PODIUM",
}

// --- Content ---

export interface Fact {
  content_id: string;
  fact_template: string;   // Sentence with _______ placeholder
  truth_keyword: string;
  metadata: {
    difficulty: "Easy" | "Medium" | "Hard";
    category: string;
  };
}

// --- Player ---

export interface Player {
  id: string;              // socket.id — reassigned on reconnect
  session_id: string;      // Persistent cookie-based ID for reconnection
  display_name: string;
  score: number;
  deception_count: number; // Cumulative votes received across all rounds
  round: {
    submitted_lie: string | null;
    voted_for_id: string | null;   // content_id or player session_id of chosen option
    great_minds: boolean;
    bamboozle_count: number;
    truth_found: boolean;
  };
}

// --- Vote Option (displayed during Reveal + Selection phases) ---

export interface VoteOption {
  option_id: string;       // Unique per round; used for vote submission
  text: string;            // The lie or truth keyword
  is_truth: boolean;       // Hidden from client until Resolution phase
  author_session_id: string | null; // null for the truth itself
}

// --- Room / Game State ---

export interface GameState {
  room_code: string;
  phase: GamePhase;
  players: Player[];
  current_fact: Fact | null;
  vote_options: VoteOption[];  // Populated during Reveal phase; is_truth masked on client
  timer_ends_at: number | null; // Unix timestamp (ms); null if no active timer
  round_number: number;
  total_rounds: number;
  is_final_round: boolean;
  used_fact_ids: string[];     // Prevents repeating facts in a session
}
```

---

## 4. Server Architecture

### 4.1 Static File Serving

```
Express GET * → serves /server/public/index.html
```

- All non-API, non-socket routes return `index.html`
- React Router handles client-side navigation
- The Socket.io server is attached to the same HTTP server instance as Express

### 4.2 Room Store

- Rooms are stored in-process as a `Map<string, GameState>` keyed by `room_code`
- No database is required for Phase 1
- A room is destroyed when all players disconnect for more than **5 minutes** (via a cleanup timer)

### 4.3 State Machine — Phase Transition Rules

| Current Phase | Trigger | Next Phase |
|---|---|---|
| `LOBBY` | Room Master emits `START_GAME` | `PROMPT` |
| `PROMPT` | All players submitted OR timer expires | `REVEAL` |
| `REVEAL` | Fixed 5-second display timer | `SELECTION` |
| `SELECTION` | All players voted OR timer expires | `RESOLUTION` |
| `RESOLUTION` | Fixed 6-second display timer | `PROMPT` (next round) or `PODIUM` (final) |
| `PODIUM` | — | Session ends |

- Phase transitions are **server-authoritative only** — no client can force a phase change
- Timers run on the server (`setTimeout`); the `timer_ends_at` timestamp is sent to clients for local countdown rendering

### 4.4 Reconnection Logic

- On initial join, the server issues a `session_id` (UUID v4) stored as an `HttpOnly` cookie
- On reconnect (new socket, same `session_id`), the server:
  1. Finds the room by `room_code` from the reconnect payload
  2. Replaces `player.id` with the new `socket.id`
  3. Re-subscribes the socket to the room
  4. Emits the full current `GameState` to the reconnecting client

---

## 5. Socket.io Event Contract

All events are typed. Payloads must conform to the interfaces defined in `/shared/types.ts`.

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `JOIN_ROOM` | `{ room_code: string, display_name: string, session_id?: string }` | Join or create a room. |
| `START_GAME` | `{ total_rounds: number }` | Room Master only. Starts the session. |
| `SUBMIT_LIE` | `{ text: string }` | Player submits their lie during Prompt phase. |
| `SUBMIT_VOTE` | `{ option_id: string }` | Player votes for an option during Selection phase. |
| `PLAY_AGAIN` | `{}` | Room Master resets the room to Lobby for a new game. |

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `ROOM_JOINED` | `{ game_state: GameState, your_session_id: string }` | Confirms join; delivers full initial state. |
| `GAME_STATE_UPDATE` | `{ game_state: GameState }` | Broadcast to all players on any state change. |
| `PHASE_CHANGED` | `{ phase: GamePhase }` | Subset of update; triggers screen transition animation. |
| `VOTE_OPTIONS` | `{ options: VoteOption[] }` | Sent with `is_truth` masked; replaces field in GameState for client. |
| `ERROR` | `{ code: string, message: string }` | Room not found, name taken, invalid action, etc. |

> **Masking Rule:** `VoteOption.is_truth` is always set to `false` in payloads sent to clients during `REVEAL` and `SELECTION` phases. The server only broadcasts the real value during `RESOLUTION`.

---

## 6. Scoring Engine (`/server/src/utils/scoring.ts`)

All scoring logic is server-side. Clients display values from `GameState` only.

```
Constants (from /shared/constants.ts):
  TRUTH_SEEKER_BONUS    = 500
  BAMBOOZLE_BONUS       = 250
  GREAT_MINDS_BONUS     = 1000
  FINAL_ROUND_MULTIPLIER = 2.0
```

**Per-round execution order:**
1. Detect Great Minds: if `player.submitted_lie` matches `truth_keyword` (normalized) → award bonus, flag `great_minds: true`, exclude from vote options
2. Detect Truth Seekers: players whose `voted_for_id` resolves to the truth option → award Truth Seeker bonus
3. Detect Bamboozles: for each vote cast on a player's lie, award Bamboozle bonus to the lie's author, increment `deception_count`
4. Apply Final Round Multiplier: if `is_final_round`, multiply all points awarded this round by 2.0 before adding to `player.score`

---

## 7. Input Validation Rules

All validation is enforced **server-side**. Client-side validation is UI feedback only and is not trusted.

| Rule | Detail |
|---|---|
| Display Name | Max 20 characters; stripped of HTML; must not be empty |
| Submitted Lie | Max 50 characters; stripped of HTML; must not be empty |
| Great Minds collision | Case-insensitive, trimmed string comparison against `truth_keyword` |
| Duplicate lies | Allowed in the pool; both authors credited if voted for |
| Self-vote | Server rejects any `SUBMIT_VOTE` where `option_id` maps to the submitting player's own lie |
| Phase guard | Server rejects any event that is not valid for the current `GamePhase` |

---

## 8. Client Architecture

### 8.1 Phase-to-Screen Mapping

`App.tsx` reads `gameState.phase` from context and renders the corresponding screen component. No client-side routing library is required for phase navigation.

| `GamePhase` | Screen Component |
|---|---|
| `LOBBY` | `LobbyScreen` |
| `PROMPT` | `PromptScreen` |
| `REVEAL` | `RevealScreen` |
| `SELECTION` | `SelectionScreen` |
| `RESOLUTION` | `ResolutionScreen` |
| `PODIUM` | `PodiumScreen` |

### 8.2 Game Context

A single React Context (`GameContext`) provides all screens with:
- `gameState: GameState` — the current authoritative state from the server
- `mySessionId: string` — identifies which player "I" am
- `socket: Socket` — the socket.io client instance
- `emit(event, payload)` — typed wrapper around `socket.emit`

### 8.3 Timer Rendering

- The server sends `timer_ends_at` (Unix ms timestamp)
- Clients compute remaining time locally: `Math.max(0, timer_ends_at - Date.now())`
- A `useTimer` hook re-renders on a 1-second interval
- This avoids the server needing to broadcast timer ticks

---

## 9. Build & Deployment

### Scripts (root `package.json`)

```json
{
  "scripts": {
    "dev:client": "cd client && vite",
    "dev:server": "cd server && npx ts-node-dev src/index.ts",
    "dev": "concurrently \"npm run dev:client\" \"npm run dev:server\"",
    "build:client": "cd client && vite build --outDir ../server/public",
    "build:server": "cd server && tsc",
    "build": "npm run build:client && npm run build:server",
    "start": "node server/dist/index.js"
  }
}
```

### Development Mode
- Vite dev server proxies `/socket.io` and API requests to the Express server (configured in `vite.config.ts`)
- Hot module replacement is active on the client
- `ts-node-dev` provides hot reload on the server

### Production Deployment
1. `npm run build` — compiles client into `/server/public`, compiles server TypeScript to `/server/dist`
2. `npm start` — starts Express, which serves the React app and handles all WebSocket connections
3. A single port (default: `3000`; configurable via `PORT` env var) serves the entire application

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Set to `production` for static serving |
| `ROOM_TTL_MS` | `300000` | Idle room cleanup timeout (5 minutes) |
| `FACTS_PATH` | `./content/facts.json` | Path to the question bank file |

---

## 10. Content Management

- Facts are stored in `/content/facts.json` as a JSON array of `Fact` objects
- On server startup, the file is loaded into memory as a `Fact[]` array
- The server uses a **Fisher-Yates shuffle** to select facts per session
- `used_fact_ids` in `GameState` prevents repetition within a single session
- Minimum content requirement: **100 unique facts**

---

*End of Document*
