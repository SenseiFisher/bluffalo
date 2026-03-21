# REJOIN.md — Game Session Rejoin Requirements
### Project: "Project Fabricate"
**Version:** 1.0 | **Status:** Active | **Companion To:** `TRD.md v1.0`, `PRD.md v1.2`

---

## 1. Session Identification

- Every player is assigned a **`session_id`** (UUID v4) by the server upon their first `JOIN_ROOM` event.
- The `session_id` is **persistent across socket connections** — it does not change when a player reconnects with a new socket.
- The **`socket.id`** (Socket.io's connection handle) is **ephemeral** and will change on every reconnect. It is used internally to route messages but is never used as the player's identity.
- The **`room_code`** (4-character alphanumeric string) identifies the session the player belongs to and is required for all rejoin attempts.

---

## 2. Client-Side Persistence

- On successful `ROOM_JOINED`, the client stores the following in **`localStorage`**:

```json
{
  "session_id": "uuid-v4",
  "room_code": "KXQZ",
  "display_name": "Eli"
}
```

- `localStorage` is used (over `sessionStorage`) so that the credentials survive a **full browser tab close and reopen**, which is the primary disconnect scenario on mobile.
- Data is scoped to the application's origin automatically via browser security policy.
- Stored credentials are **cleared** when:
  - The game reaches the `PODIUM` phase and the session ends.
  - The server responds with an `ERROR` code of `SESSION_NOT_FOUND` or `ROOM_NOT_FOUND` during a rejoin attempt.
  - The player explicitly uses a "Leave Game" action (future scope).

---

## 3. Server-Side State Management

- Room state (`GameState`) is held **in-process** in a `Map<string, GameState>` keyed by `room_code`. No database is required.
- The player's `score`, `deception_count`, and `round` data are preserved on the `Player` object within `GameState` regardless of connection status.
- **Idle Room Cleanup:** A room is destroyed when **all players have been disconnected for longer than `ROOM_TTL_MS`** (default: `300,000ms` / 5 minutes). This is configurable via environment variable.
- Each player record tracks a **`is_connected: boolean`** flag. This is updated immediately on socket `disconnect` and `reconnect` events and is included in `GameState` broadcasts so all players can see who is away.

---

## 4. Reconnection Protocol

### 4.1 Detection (Client)

On application load (`App.tsx` mount), before rendering any screen, the client:

1. Reads `session_id`, `room_code`, and `display_name` from `localStorage`.
2. If all three values are present, automatically emits `JOIN_ROOM` with the stored credentials (see §4.2).
3. If any value is missing, renders the home/join screen normally.

There is no "Resume Session?" prompt — rejoin is always **implicit and automatic**. On mobile, a page refresh is the most common disconnect cause and the player expects to land back in the game immediately.

### 4.2 Rejoin Request

The client reuses the standard `JOIN_ROOM` event. The presence of `session_id` in the payload signals a rejoin attempt to the server.

**Payload:**
```typescript
// New join (no session_id)
{ room_code: "KXQZ", display_name: "Eli" }

// Rejoin (session_id present)
{ room_code: "KXQZ", display_name: "Eli", session_id: "uuid-v4" }
```

The server branches on whether `session_id` is present in the payload.

### 4.3 Server Handshake

On receiving `JOIN_ROOM` with a `session_id`:

1. **Validate `room_code`:** If the room does not exist → emit `ERROR { code: "ROOM_NOT_FOUND" }` → client clears `localStorage`.
2. **Validate `session_id`:** Find the player in `room.players` whose `session_id` matches. If not found → emit `ERROR { code: "SESSION_NOT_FOUND" }` → client clears `localStorage`.
3. **Update socket binding:** Replace `player.id` with the new `socket.id`. Join the socket to the Socket.io room (`socket.join(room_code)`).
4. **Set `is_connected: true`** on the player record.
5. **Emit full state:** Emit `ROOM_JOINED` with the current `GameState` to the reconnecting socket only.
6. **Broadcast update:** Emit `GAME_STATE_UPDATE` to all other players in the room so their UI reflects the player's return.

---

## 5. State Synchronization (Catch-Up)

- On successful rejoin, the server sends the **complete current `GameState`** to the reconnecting client via `ROOM_JOINED`. No event journaling is required.
- The client's `GameContext` replaces its entire local state with the received snapshot.
- `App.tsx` renders the screen that corresponds to `gameState.phase`, so the player lands directly in the correct phase, whether that is `LOBBY`, `PROMPT`, `SELECTION`, etc.
- **Mid-phase rejoin behavior:**

| Rejoined During | Behavior |
|---|---|
| `LOBBY` | Player appears in the lobby list. |
| `PROMPT` | Player sees the prompt. If `submitted_lie` is already set on their record, the UI shows "Waiting for others…" If not, they may still submit if the timer has not expired. |
| `REVEAL` | Player sees the current reveal list. |
| `SELECTION` | Player sees the voting screen. If `voted_for_id` is already set, the UI shows "Waiting for others…" If not, they may still vote if the timer has not expired. |
| `RESOLUTION` | Player sees the resolution animation from the current point. |
| `PODIUM` | Player sees the final podium. |

---

## 6. User Experience

- **Rejoin is silent and automatic.** No confirmation dialog is shown. The player is dropped back into the current game phase without friction.
- **Disconnected player indicator:** While a player's `is_connected` flag is `false`, their entry in the player list on all other devices displays a visual "Away" indicator (e.g., dimmed avatar, disconnected icon). Their name and score remain visible.
- **Game progression is not blocked** by a disconnected player. Timers continue server-side regardless of connection state. See PRD §6 Inactivity Handling for phase-specific consequences of missing a submission or vote.
- **Expired session feedback:** If the server returns `ROOM_NOT_FOUND` or `SESSION_NOT_FOUND`, the client:
  1. Clears `localStorage`.
  2. Navigates to the home screen.
  3. Displays a non-blocking message: `"Your session has ended. Start or join a new game."`

---

## 7. Security & Integrity

- **Identity verification:** A `session_id` is a UUID v4 generated server-side. It is unguessable. A player cannot impersonate another by guessing an ID.
- **Double-connection prevention:** If a player with a given `session_id` is currently marked `is_connected: true` (i.e., they have an active socket) and a second `JOIN_ROOM` with the same `session_id` arrives, the server **closes the previous socket** before binding the new one. Only one active connection per `session_id` is permitted at any time.
- **`session_id` is never broadcast** in any `GAME_STATE_UPDATE` or `VOTE_OPTIONS` payload. It is only sent directly to the owning client in `ROOM_JOINED`. Other players' `session_id` values are never exposed.
- **Phase-guard integrity is maintained on rejoin:** The server re-validates the current `GamePhase` before accepting any event from a reconnected socket, identical to how it handles all connected players.

---

*End of Document*
