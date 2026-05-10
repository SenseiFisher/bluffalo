# Adding a New Game

Games are self-contained plugins. The framework handles rooms, players, connections, and reconnections — your game handles everything that happens once the room is started.

---

## 1. Server: create the game module

Create a directory at `server/src/games/<your-game>/`.

### Required files

#### `server/src/games/<your-game>/index.ts`

This file must call `registerGame` with an object that implements `GamePlugin`:

```ts
import { registerGame, GamePlugin, BroadcastFn, GameEventContext } from '../registry'
import { GameState, GamePhase } from '../../../../shared/types'

const MyGamePlugin: GamePlugin = {
  game_type: 'my-game',      // unique slug, sent over the wire
  display_name: 'My Game',   // shown in the game picker

  validateContent() {
    // Called at server startup. Load and validate any content files.
    // Throw to abort startup with an error.
  },

  startGame(state: GameState, payload: unknown, broadcast: BroadcastFn): GameState {
    // Called when the room master clicks Start.
    // `payload` is the raw object emitted by the client's START_GAME event.
    // Validate settings, update state, transition to your first phase, and broadcast.
    // Must return the updated state.
    state.phase = GamePhase.PROMPT  // use an existing phase or add one to shared/types.ts
    broadcast(state.room_code, state)
    return state
  },

  handleEvent(event: string, payload: unknown, ctx: GameEventContext): boolean {
    // Called for every socket event that is NOT a framework event.
    // Return true if you handled it, false to silently ignore it.
    const { socket, state, roomCode, broadcast } = ctx

    switch (event) {
      case 'MY_GAME_ACTION': {
        // ... handle the event, mutate state, broadcast
        broadcast(roomCode, state)
        return true
      }
      default:
        return false
    }
  },

  resetToLobby(state: GameState): GameState {
    // Called by PLAY_AGAIN. Reset all game-specific state fields to their
    // pre-game defaults. Framework fields (phase, players, room_code) are
    // reset by the caller after this returns.
    state.phase = GamePhase.LOBBY
    // reset your custom fields...
    return state
  },

  onPlayerDisconnect(state: GameState, broadcast: BroadcastFn): void {
    // Called after a player is marked disconnected.
    // Advance phases if the disconnect unblocks an "all submitted" check.
  },
}

registerGame(MyGamePlugin)
export default MyGamePlugin
```

#### Framework events (do NOT handle in your plugin)

These are handled by the framework and never reach `handleEvent`:

`JOIN_ROOM`, `START_GAME`, `LEAVE_ROOM`, `KICK_PLAYER`, `PLAY_AGAIN`, `REPORT_FACT`, `disconnect`, `disconnecting`

### Register the plugin at startup

In `server/src/index.ts`, add one import before `createApp()`:

```ts
import './games/my-game/index'   // registers the plugin (side-effect)
```

That's it — the server will now include your game in `/api/games` and route events to it automatically.

---

## 2. Client: create the game module

Create a directory at `client/src/games/<your-game>/`.

### Required components

#### `GameRouter.tsx`

Renders the correct screen for each of your game's phases:

```tsx
import React from 'react'
import { useGame } from '../../context/GameContext'

export default function MyGameRouter() {
  const { gameState } = useGame()

  switch (gameState?.phase) {
    case 'MY_PHASE': return <MyPhaseScreen />
    default:         return null
  }
}
```

#### `LobbySettings.tsx`

Rendered in the lobby for the room master. Owns its own settings state and emits `START_GAME`:

```tsx
import React, { useState } from 'react'
import { useGame } from '../../context/GameContext'
import type { LobbySettingsProps } from '../registry'

export default function MyGameLobbySettings({ canStart, connectedPlayerCount }: LobbySettingsProps) {
  const { emit, clearError } = useGame()
  const [mySetting, setMySetting] = useState(42)

  const handleStart = () => {
    clearError()
    emit('START_GAME', { my_setting: mySetting })
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {/* your settings controls */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-4 bg-yellow-400 ..."
      >
        {canStart ? 'Start Game' : `Need ${2 - connectedPlayerCount} more player(s)`}
      </button>
    </div>
  )
}
```

#### `index.ts`

Registers the client plugin:

```ts
import { registerClientGame } from '../registry'
import MyGameRouter from './GameRouter'
import MyGameLobbySettings from './LobbySettings'

registerClientGame({
  game_type: 'my-game',
  display_name: 'My Game',
  GameRouter: MyGameRouter,
  LobbySettings: MyGameLobbySettings,
})
```

### Register the plugin in App.tsx

In `client/src/App.tsx`, add one import:

```ts
import './games/my-game/index'   // registers the plugin (side-effect)
```

The game will now appear in the game picker when creating a room.

---

## Shared types

If your game needs new phases, add them to the `GamePhase` enum in `shared/types.ts`:

```ts
export enum GamePhase {
  // existing phases...
  MY_PHASE = "MY_PHASE",
}
```

If your game needs fields on `GameState` (beyond what Bluffalo uses), add them as optional fields:

```ts
export interface GameState {
  // existing fields...
  my_game_field?: string     // optional so other games aren't affected
}
```

---

## Checklist

- [ ] `server/src/games/<name>/index.ts` — implements and registers `GamePlugin`
- [ ] `server/src/index.ts` — one `import './games/<name>/index'` line added
- [ ] `client/src/games/<name>/GameRouter.tsx` — phase routing component
- [ ] `client/src/games/<name>/LobbySettings.tsx` — settings + Start button
- [ ] `client/src/games/<name>/index.ts` — registers `GameClientPlugin`
- [ ] `client/src/App.tsx` — one `import './games/<name>/index'` line added
- [ ] `game_type` slug matches exactly between server and client plugins
