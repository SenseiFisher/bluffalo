import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react'
import { io, Socket } from 'socket.io-client'
import {
  GameState,
  GamePhase,
  VoteOption,
  ErrorPayload,
} from '@shared/types'

interface StoredSession {
  session_id: string
  room_code: string
  display_name: string
}

interface GameContextValue {
  socket: Socket | null
  gameState: GameState | null
  mySessionId: string | null
  voteOptions: VoteOption[]
  lastError: ErrorPayload | null
  clearError: () => void
  emit: (event: string, data?: unknown) => void
  isConnected: boolean
  storedSession: StoredSession | null
  clearStoredSession: () => void
  leaveRoom: () => void
}

const GameContext = createContext<GameContextValue>({
  socket: null,
  gameState: null,
  mySessionId: null,
  voteOptions: [],
  lastError: null,
  clearError: () => {},
  emit: () => {},
  isConnected: false,
  storedSession: null,
  clearStoredSession: () => {},
  leaveRoom: () => {},
})

export function GameProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [mySessionId, setMySessionId] = useState<string | null>(null)
  const [voteOptions, setVoteOptions] = useState<VoteOption[]>([])
  const [lastError, setLastError] = useState<ErrorPayload | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [storedSession, setStoredSession] = useState<StoredSession | null>(() => {
    try {
      const raw = localStorage.getItem('bluffalo_session')
      if (!raw) return null
      const parsed = JSON.parse(raw) as StoredSession
      return (parsed.session_id && parsed.room_code && parsed.display_name) ? parsed : null
    } catch { return null }
  })

  const clearError = useCallback(() => setLastError(null), [])

  const saveSession = (session: StoredSession) => {
    try {
      localStorage.setItem('bluffalo_session', JSON.stringify(session))
      setStoredSession(session)
    } catch {
      // ignore
    }
  }

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem('bluffalo_session')
      setStoredSession(null)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('ROOM_JOINED', (payload: { game_state: GameState; your_session_id: string }) => {
      setMySessionId(payload.your_session_id)
      setGameState(payload.game_state)

      // Save session to localStorage for rejoin
      const player = payload.game_state.players.find(() => true) // find first player that matches
      const displayName = payload.game_state.players.find(
        (p) => p.id === socket.id
      )?.display_name

      saveSession({
        session_id: payload.your_session_id,
        room_code: payload.game_state.room_code,
        display_name: displayName ?? '',
      })
    })

    socket.on('GAME_STATE_UPDATE', (payload: { game_state: GameState }) => {
      setGameState(payload.game_state)

      // If we just transitioned to SELECTION, the vote options are in the game state
      if (payload.game_state.vote_options.length > 0) {
        setVoteOptions(payload.game_state.vote_options)
      }
    })

    socket.on('PHASE_CHANGED', (payload: { phase: GamePhase }) => {
      setGameState((prev) => (prev ? { ...prev, phase: payload.phase } : prev))
    })

    socket.on('VOTE_OPTIONS', (payload: { options: VoteOption[] }) => {
      setVoteOptions(payload.options)
    })

    socket.on('ERROR', (payload: ErrorPayload) => {
      setLastError(payload)

      // Clear localStorage on session/room not found
      if (payload.code === 'SESSION_NOT_FOUND' || payload.code === 'ROOM_NOT_FOUND') {
        clearSession()
        setMySessionId(null)
        setGameState(null)
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  // Clear localStorage when PODIUM phase is done (user explicitly resets via Play Again)
  useEffect(() => {
    if (gameState?.phase === GamePhase.LOBBY && mySessionId) {
      // Keep session alive in lobby; don't clear
    }
  }, [gameState?.phase, mySessionId])

  const emit = useCallback((event: string, data?: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data ?? {})
    }
  }, [])

  const leaveRoom = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('LEAVE_ROOM')
    }
    setGameState(null)
    setMySessionId(null)
    clearSession()
  }, [clearSession])

  return (
    <GameContext.Provider
      value={{
        socket: socketRef.current,
        gameState,
        mySessionId,
        voteOptions,
        lastError,
        clearError,
        emit,
        isConnected,
        storedSession,
        clearStoredSession: clearSession,
        leaveRoom,
      }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  return useContext(GameContext)
}
