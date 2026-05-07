# INFRA.md — Game Infrastructure Reference
### Project: Bluffalo
**Reflects:** Current codebase state

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v20 LTS |
| Language | TypeScript (client + server + shared) |
| Server framework | Express.js |
| Real-time transport | Socket.IO v4 |
| Client framework | React 18 (hooks) |
| Build tool (client) | Vite → outputs to `/server/public` |
| Styling | Tailwind CSS |
| Optional infra | Redis (fact reporting only) |

The Express server statically serves the compiled React app. A single port (`PORT`, default `3000`) handles HTTP, the REST API, and all WebSocket connections.

---

## 2. Project Structure

```
/bluffalo
├── /client                         # React frontend
│   └── /src
│       ├── /components             # Reusable UI components
│       ├── /context                # GameContext (socket, state, session)
│       ├── /hooks                  # useTimer, etc.
│       └── /screens                # One component per game phase
│
├── /server
│   ├── /public                     # ← Compiled React output (populated by build)
│   └── /src
│       ├── /content                # Fact loader (in-memory cache per language)
│       ├── /handlers               # index.ts — all Socket.IO event handlers
│       ├── /rooms
│       │   ├── roomStore.ts        # In-memory Map<roomCode, GameState> + cleanup
│       │   └── stateMachine.ts     # Phase transitions, timers, submission checks
│       ├── /utils                  # scoring.ts, validation.ts, shuffle.ts
│       ├── redis.ts                # Optional Redis client (fact reporting)
│       ├── server.ts               # Express app + Socket.IO init + REST routes
│       └── index.ts                # Entry point: loads facts, starts server
│
├── /shared
│   ├── types.ts                    # All types shared by client and server
│   └── constants.ts                # Timers, limits, scoring values, presets
│
├── /content
│   ├── facts.json                  # English fact bank
│   └── facts.he.json               # Hebrew fact bank
│
└── /scripts
    └── poll-reported-facts.ts      # Redis polling script for reviewing reported facts
```

---

## 3. Shared Types (`/shared/types.ts`)

All types are defined once and imported by both sides. Key interfaces:

### `Player`

```typescript
interface Player {
  id: string;                      // socket.id — ephemeral, changes on reconnect
  session_id: string;              // UUID v4 — persistent across reconnects
  display_name: string;
  score: number;
  deception_count: number;         // cumulative bamboozles across all rounds
  funny_vote_count: number;
  is_connected: boolean;
  disconnected_at: number | null;  // unix ms timestamp of last disconnect
  active_debuff: Debuff | null;
  round: {
    submitted_lie: string | null;
    voted_for_id: string | null;
    great_minds: boolean;
    bamboozle_count: number;
    truth_found: boolean;
  };
}
```

### `GameState`

```typescript
interface GameState {
  room_code: string;
  phase: GamePhase;
  players: Player[];
  current_fact: Fact | null;
  vote_options: VoteOption[];
  timer_ends_at: number | null;      // unix ms; clients compute countdown locally
  round_number: number;
  total_rounds: number;
  is_final_round: boolean;
  used_fact_ids: string[];
  room_master_session_id: string;
  debuffs_enabled: boolean;
  prompt_timer_seconds: number;
  language: string;
  debuff_award: DebuffAward | null;
  active_debuff_session_id: string | null;
  location?: GeoLocation;            // set by room creator for nearby discovery
}
```

### `GamePhase` enum

```
LOBBY → PROMPT → REVEAL → SELECTION → RESOLUTION → [DEBUFF] → PROMPT (loop) → PODIUM
```

---

## 4. Room Lifecycle

### Creation

A room is created when a player sends `JOIN_ROOM` with `create: true`. The server:

1. Generates a 4-character room code from an unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0/O/I/1`).
2. Calls `createInitialGameState()` with default config.
3. Adds the creating player as room master.

A fresh code can also be pre-fetched via `GET /api/room/code` (used by the join screen before the player submits the form).

### Room Master

- The first player to join is the room master.
- In **LOBBY**: if the master leaves (`LEAVE_ROOM`), the role transfers to the next player in the list. If the room becomes empty, it is deleted immediately.
- During an **active game**: if the master disconnects, the role silently transfers to the next connected player.

### Cleanup / TTL

- The server schedules a cleanup only when **all players are disconnected simultaneously**.
- TTL is `ROOM_TTL_MS` (env var, default `300,000ms` / 5 minutes).
- If any player reconnects before the timer fires, cleanup is cancelled.
- The timer fires and confirms the room is still empty before deleting it.

---

## 5. Player Management

### Session Identity

- `session_id` (UUID v4) is generated server-side on first join and sent to the client in `ROOM_JOINED`.
- The client stores it in `localStorage['bluffalo_session']` alongside `room_code` and `display_name`.
- `session_id` is **never broadcast** to other players — all `GAME_STATE_UPDATE` payloads strip it from the players array.

### Connection State

- `is_connected` is toggled immediately on socket `disconnecting` / rejoin.
- `disconnected_at` records the timestamp of the most recent disconnect.
- All connected clients see the `is_connected` flag so the UI can show an "away" indicator.

### Disconnection Handling

When a socket fires `disconnecting`:

1. `player.is_connected = false`, `player.disconnected_at = Date.now()`
2. State saved and broadcast to the room.
3. `checkAllLiesSubmitted()` and `checkAllVotesSubmitted()` are called — if all *remaining connected* players have already submitted, the phase advances immediately without waiting for the timer.
4. If **all** players are now disconnected, room cleanup is scheduled.

### Rejoin

- Triggered automatically on page load if `localStorage` contains a valid session.
- Client re-sends `JOIN_ROOM` with the stored `session_id`.
- Server validates room and session, rebinds the socket, sets `is_connected = true`, cancels cleanup if scheduled, and emits the full current `GameState`.
- **Rejoin window:** 30 minutes (`REJOIN_EXPIRY_MS`) from disconnect during an active game.
- **Double-connection prevention:** if a player's `session_id` is already connected, the old socket is disconnected before the new one is accepted.
- localStorage is cleared on `PODIUM` phase or on server errors `ROOM_NOT_FOUND` / `SESSION_NOT_FOUND`.

---

## 6. Socket.IO Events

### Client → Server

| Event | Payload | Phase guard | Notes |
|---|---|---|---|
| `JOIN_ROOM` | `{ room_code, display_name, session_id?, location?, create? }` | Any | Rejoins if `session_id` present; creates room if `create: true` |
| `START_GAME` | `{ total_rounds, prompt_timer_seconds?, language?, debuffs_enabled? }` | LOBBY | Room master only |
| `SUBMIT_LIE` | `{ text }` | PROMPT | Max 50 chars; triggers early advance if all connected submitted |
| `EDIT_LIE` | `{ text }` | PROMPT | Allowed until all players submit |
| `SUBMIT_VOTE` | `{ option_id }` | SELECTION | Self-vote rejected; triggers early advance if all connected voted |
| `SUBMIT_FUNNY_VOTE` | `{ option_id }` | RESOLUTION | Awards FUNNY_BONUS (100 pts) to the option's author immediately |
| `SUBMIT_DEBUFF` | `{ debuff_type, target_session_id, excluded_character? }` | DEBUFF | Debuff winner only; `excluded_character` required for `CHARACTER_EXCLUDE` type |
| `REPORT_FACT` | `{ fact_id }` | Any | Stores in Redis with 24h TTL; no-op if Redis not configured |
| `PLAY_AGAIN` | `{}` | PODIUM | Room master only; resets to LOBBY |
| `LEAVE_ROOM` | `{}` | LOBBY | Deletes room if last player; transfers master otherwise |
| `KICK_PLAYER` | `{ player_id }` | LOBBY | Room master only; emits `KICKED` to target |

### Server → Client

| Event | Payload | When |
|---|---|---|
| `ROOM_JOINED` | `{ game_state: GameState, your_session_id: string }` | Successful join or rejoin |
| `GAME_STATE_UPDATE` | `{ game_state: GameState }` | Any state change; broadcast to whole room |
| `ERROR` | `{ code: string, message: string }` | Validation or authorization failure |
| `KICKED` | `{}` | Sent only to the kicked player |

---

## 7. State Sanitization

Every `GAME_STATE_UPDATE` payload is sanitized before broadcast via `sanitizeStateForClient()`. The server is the only source of truth; clients never hold the raw state.

| Field | PROMPT / REVEAL / SELECTION | RESOLUTION / DEBUFF / PODIUM |
|---|---|---|
| `current_fact.truth_keyword` | Stripped (empty string) | Exposed |
| `VoteOption.is_truth` | Masked (`false`) | Exposed |
| `VoteOption.author_session_id` | Stripped (null) | Exposed |
| `player.session_id` | Always stripped (empty string) | Always stripped |
| `room_master_session_id` | Always exposed | Always exposed |
| `active_debuff_session_id` | Always exposed | Always exposed |

---

## 8. Phase Transitions & Timers

All transitions are **server-authoritative**. No client can force a phase change.

| From | To | Trigger |
|---|---|---|
| LOBBY | PROMPT | Room master emits `START_GAME` |
| PROMPT | REVEAL | All connected players submitted OR timer expires |
| REVEAL | SELECTION | Fixed 5s timer |
| SELECTION | RESOLUTION | All connected players voted OR timer expires |
| RESOLUTION | DEBUFF | Fixed timer; only if debuff was awarded this round |
| RESOLUTION | PROMPT | Fixed timer; if no debuff or debuffs disabled |
| DEBUFF | PROMPT | Winner submits debuff (or timer expires) |
| PROMPT (final) | PODIUM | Same as PROMPT → REVEAL, then straight to PODIUM after RESOLUTION |

**Timer durations** (from `constants.ts`):

| Phase | Duration | Notes |
|---|---|---|
| PROMPT | Configurable (default 60s) | Presets: 30 / 45 / 60 / 90 / 120 / 150s |
| REVEAL | 5s | Fixed |
| SELECTION | 30s | Fixed |
| RESOLUTION | Dynamic | Calculated from reveal group count |
| DEBUFF | 10s | Fixed |

`timer_ends_at` (Unix ms) is included in every `GameState` broadcast. Clients compute the countdown locally — no tick events are sent over the wire.

---

## 9. Room Configuration

Configurable per game session via `START_GAME` payload:

| Option | Default | Range |
|---|---|---|
| `total_rounds` | 7 | 3 – 20 |
| `prompt_timer_seconds` | 60 | Presets: 30 / 45 / 60 / 90 / 120 / 150 |
| `language` | `'he'` | `'he'` (Hebrew), `'en'` (English) |
| `debuffs_enabled` | — | `true` / `false` |

Minimum players to start: **2** (`MIN_PLAYERS_TO_START`).

---

## 10. Debuff System

Debuffs are an opt-in mechanic. When enabled, the player whose lie fooled the most opponents each round earns the right to handicap one opponent for the next round.

**Award condition:** most bamboozles this round, and the truth received fewer than 50% of votes. No award on a tie.

**Debuff types:**

| Internal type | Display name (EN / HE) | Effect |
|---|---|---|
| `TIME_CUTOFF` | Flash / פלאש | Player's prompt timer is cut in half |
| `FOG` | Arthur / ארתור | Player's screen is blurred during PROMPT |
| `SCRAMBLE` | Yoda / יודה | Player's displayed lie text is word-order scrambled |
| `CHARACTER_EXCLUDE` | Thanos / ת'נוס | Player must not use a specified character while typing |

`CHARACTER_EXCLUDE` requires the winner to also pick which character to ban. Shortlists per language:
- English: `e, t, a, o, i, n`
- Hebrew: `ו, י, ל, מ, נ, ר`

The chosen debuff is stored as `player.active_debuff` on the target and applied at the start of the next round's PROMPT phase.

---

## 11. Nearby Room Discovery

The server exposes `GET /api/rooms/nearby?lat=&lng=` which returns the room code of the nearest LOBBY-phase room within a configurable radius.

- Room creators can optionally broadcast their location by including `location: { lat, lng }` in `JOIN_ROOM`. This is captured silently and stored in `GameState.location`.
- The join screen has a "Find nearby room" button that requests the browser's geolocation, calls the endpoint, and auto-fills the room code field.
- Rooms without a stored location are excluded from nearby results.

---

## 12. Content System

Facts are loaded from JSON files at server startup and cached in memory per language.

```typescript
interface Fact {
  content_id: string;          // e.g., "FACT_001"
  fact_template: string;       // sentence with _______ placeholder
  truth_keyword: string;       // correct answer
  metadata: {
    difficulty: "Easy" | "Medium" | "Hard";
    category: string;
  };
}
```

- **Languages:** `'en'` → `facts.json`, `'he'` → `facts.he.json`
- **Selection:** `getRandomFact(usedIds, lang)` picks a random unused fact. Returns `null` if all facts for that language have been used in the session.
- **Deduplication:** `used_fact_ids` on `GameState` prevents repeating facts within a session.
- **Fact reporting:** Players can flag a bad fact via `REPORT_FACT`. The server stores `report:{fact_id}` in Redis with a 24h TTL. The polling script (`scripts/poll-reported-facts.ts`) surfaces these for review. If Redis is not configured, reporting is silently disabled.

---

## 13. Client Architecture

### Screen Routing

`App.tsx` renders screens based on `gameState.phase`. There is no client-side router — phase is the only navigation signal.

| `GamePhase` | Screen |
|---|---|
| `null` (pre-join) | `JoinScreen` |
| `LOBBY` | `LobbyScreen` |
| `PROMPT` | `PromptScreen` |
| `REVEAL` | `RevealScreen` |
| `SELECTION` | `SelectionScreen` |
| `RESOLUTION` | `ResolutionScreen` |
| `DEBUFF` | `DebuffScreen` |
| `PODIUM` | `PodiumScreen` |

### GameContext

A single React Context (`/client/src/context/GameContext.tsx`) is the source of truth on the client:

| Exported value | Type | Description |
|---|---|---|
| `gameState` | `GameState \| null` | Current authoritative state from server |
| `mySessionId` | `string \| null` | Identifies the local player |
| `voteOptions` | `VoteOption[]` | Vote options for current round |
| `isConnected` | `boolean` | Socket connection status |
| `storedSession` | `object \| null` | Parsed localStorage session |
| `lastError` | `object \| null` | Last error emitted by server |
| `emit(event, payload)` | function | Typed wrapper around `socket.emit` |
| `leaveRoom()` | function | Emits `LEAVE_ROOM` and clears localStorage |
| `clearError()` | function | Dismisses `lastError` |

The socket is created once in `GameContext`, configured with auto-reconnect (10 attempts, 1s delay between attempts).

### Timer Rendering

Screens that show a countdown read `gameState.timer_ends_at` and compute `Math.max(0, timer_ends_at - Date.now())` locally on a 1-second interval via a `useTimer` hook. No tick events are sent from the server.

### Dev Proxy

In development, Vite proxies `/socket.io` and `/api` to `http://localhost:3000` (WebSocket upgrade included), so the React dev server and Express server coexist without CORS issues.

---

## 14. Theming & Styling

**Tailwind CSS** with a custom theme defined in `tailwind.config.ts`.

**Color palette:**

| Role | Values |
|---|---|
| Background | `indigo-950` → `purple-900` → `indigo-950` (gradient) |
| Primary UI | `indigo-900`, `indigo-800`, `indigo-600`, `indigo-500` |
| Accent | `yellow-400` |
| Text | white / `gray-300` |

**Custom animations** (added to Tailwind config):

| Name | Duration | Usage |
|---|---|---|
| `bounce-slow` | 2s | Idle indicators |
| `pulse-fast` | 1s | Active states |
| `fade-in` | 0.5s | Screen entry |
| `slide-up` | 0.4s (20px offset) | Card / panel entry |

---

## 15. Input Validation

All validation is enforced **server-side**. Client-side checks are UI feedback only.

| Input | Rule |
|---|---|
| Display name | 1–20 chars; HTML stripped |
| Submitted lie | 1–50 chars; HTML stripped |
| Room code | Exactly 4 chars, regex `/^[A-Z0-9]{4}$/` |
| Self-vote | Rejected — `option_id` must not map to the submitting player's own lie |
| Phase guard | Every event is rejected if the room is not in the expected phase |
| Room master guard | `START_GAME`, `KICK_PLAYER`, `PLAY_AGAIN` rejected if not room master |

---

## 16. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | `production` enables static file serving |
| `ROOM_TTL_MS` | `300000` | Idle room cleanup timeout (ms) |
| `REDIS_PASSWORD` | — | If set, enables Redis connection for fact reporting |

---

## 17. Build & Deployment

```bash
npm run dev          # concurrent Vite dev server + ts-node-dev server
npm run build        # build:client (Vite → /server/public) + build:server (tsc)
npm start            # node server/dist/index.js
```

Production: single `node` process serves the React app as static files and handles all WebSocket connections on one port.

---

*End of Document*
