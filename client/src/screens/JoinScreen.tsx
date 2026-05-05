import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { useUltrasonicDetector } from '../hooks/useUltrasonicDetector'

type Mode = 'home' | 'create' | 'join'

export default function JoinScreen() {
  const { emit, lastError, clearError, storedSession, clearStoredSession } = useGame()
  const [mode, setMode] = useState<Mode>('home')
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)

  const { status: listenStatus, errorMessage: listenError, debug: listenDebug, stop: stopListening } =
    useUltrasonicDetector(isListening, (code) => {
      setRoomCode(code)
      setIsListening(false)
    })

  const handleRejoin = () => {
    if (!storedSession) return
    setIsLoading(true)
    setLocalError(null)
    clearError()
    emit('JOIN_ROOM', {
      room_code: storedSession.room_code,
      display_name: storedSession.display_name,
      session_id: storedSession.session_id,
    })
  }

  useEffect(() => {
    if (lastError) {
      setLocalError(lastError.message)
      setIsLoading(false)
    }
  }, [lastError])

  useEffect(() => {
    if (listenError) {
      setLocalError(listenError)
      setIsListening(false)
    }
  }, [listenError])

  const handleCreateGame = async () => {
    if (!displayName.trim()) {
      setLocalError('Please enter your display name')
      return
    }
    if (displayName.trim().length > 20) {
      setLocalError('Display name must be 20 characters or fewer')
      return
    }

    setIsLoading(true)
    setLocalError(null)
    clearError()

    try {
      const res = await fetch('/api/room/code')
      const data = await res.json() as { code: string }
      emit('JOIN_ROOM', {
        room_code: data.code,
        display_name: displayName.trim(),
        create: true,
      })
    } catch {
      setLocalError('Failed to create room. Please try again.')
      setIsLoading(false)
    }
  }

  const handleJoinGame = () => {
    if (!displayName.trim()) {
      setLocalError('Please enter your display name')
      return
    }
    if (displayName.trim().length > 20) {
      setLocalError('Display name must be 20 characters or fewer')
      return
    }
    if (!roomCode.trim() || roomCode.trim().length !== 4) {
      setLocalError('Please enter a valid 4-character room code')
      return
    }

    setIsLoading(true)
    setLocalError(null)
    clearError()

    emit('JOIN_ROOM', {
      room_code: roomCode.toUpperCase().trim(),
      display_name: displayName.trim(),
    })
  }

  const resetMode = () => {
    setMode('home')
    setLocalError(null)
    setIsLoading(false)
    setIsListening(false)
    stopListening()
    clearError()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-10 text-center">
        <h1 className="text-7xl font-black text-yellow-400 tracking-tight drop-shadow-lg">
          BL
          <span className="relative inline-block">
            <img
              src="/icon.png"
              alt=""
              className="absolute -top-10 left-1/2 -translate-x-1/2 h-16 drop-shadow-lg pointer-events-none"
            />
            U
          </span>
          FFALO
        </h1>
        <p className="text-indigo-300 text-lg mt-2 font-medium">
          The Social Deception Game
        </p>
      </div>

      {/* Stored session banner */}
      {storedSession && (
        <div className="w-full max-w-md mb-4 bg-yellow-400/10 border border-yellow-400/50 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-yellow-300 text-xs font-semibold uppercase tracking-wide mb-0.5">Game in progress</p>
            <p className="text-white font-bold truncate">{storedSession.display_name}</p>
            <p className="text-indigo-300 text-sm font-mono tracking-widest">{storedSession.room_code}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={handleRejoin}
              disabled={isLoading}
              className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-sm rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {isLoading ? 'Rejoining…' : 'Rejoin'}
            </button>
            <button
              onClick={() => { clearStoredSession(); setLocalError(null) }}
              className="px-4 py-2 text-indigo-400 hover:text-white text-xs text-center transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Card */}
      <div className="bg-indigo-900/80 backdrop-blur rounded-2xl shadow-2xl p-8 w-full max-w-md border border-indigo-700/50">

        {mode === 'home' && (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => {
                setMode('create')
                clearError()
                setLocalError(null)
              }}
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-xl rounded-xl transition-all duration-150 active:scale-95 shadow-lg"
            >
              Create Game
            </button>
            <button
              onClick={() => { setMode('join'); clearError(); setLocalError(null) }}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xl rounded-xl transition-all duration-150 active:scale-95 shadow-lg border border-indigo-500"
            >
              Join Game
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-bold text-white text-center">Create a Room</h2>

            <div>
              <label className="block text-indigo-300 text-sm font-semibold mb-2 uppercase tracking-wide">
                Your Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={20}
                placeholder="Enter your display name"
                className="w-full px-4 py-3 bg-indigo-800 border border-indigo-600 rounded-xl text-white placeholder-indigo-400 focus:outline-none focus:border-yellow-400 transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGame()}
                disabled={isLoading}
              />
              <div className="text-right text-indigo-400 text-xs mt-1">
                {displayName.length}/20
              </div>
            </div>

            {localError && (
              <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-xl px-4 py-3 text-sm">
                {localError}
              </div>
            )}

            <button
              onClick={handleCreateGame}
              disabled={isLoading}
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-indigo-700 disabled:text-indigo-400 text-indigo-950 font-black text-xl rounded-xl transition-all duration-150 active:scale-95"
            >
              {isLoading ? 'Creating...' : 'Create Room'}
            </button>

            <button onClick={resetMode} className="text-indigo-400 hover:text-white text-sm text-center transition-colors">
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-bold text-white text-center">Join a Room</h2>

            <div>
              <label className="block text-indigo-300 text-sm font-semibold mb-2 uppercase tracking-wide">
                Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={4}
                placeholder="XXXX"
                className="w-full px-4 py-3 bg-indigo-800 border border-indigo-600 rounded-xl text-white placeholder-indigo-400 text-center text-3xl font-black tracking-widest focus:outline-none focus:border-yellow-400 transition-colors uppercase"
                disabled={isLoading || isFindingNearby}
              />
              <button
                type="button"
                onClick={() => {
                  if (isListening) {
                    setIsListening(false)
                    stopListening()
                  } else {
                    setLocalError(null)
                    clearError()
                    setIsListening(true)
                  }
                }}
                disabled={isLoading}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:bg-indigo-800 disabled:text-indigo-500 text-indigo-200 text-sm font-semibold transition-all active:scale-95"
              >
                {isListening ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-400 border-t-indigo-200 rounded-full animate-spin" />
                    {listenStatus === 'requesting' ? 'Requesting mic...' : 'Listening for host...'}
                    <span className="ml-auto text-indigo-400 text-xs">Tap to cancel</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                      <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                    </svg>
                    Listen for room
                  </>
                )}
              </button>
              {isListening && (
                <p className="mt-1 text-center text-indigo-500 text-xs font-mono">
                  {listenDebug
                    ? `${listenDebug.freq} Hz · strength ${listenDebug.amplitude}`
                    : 'No signal detected'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-indigo-300 text-sm font-semibold mb-2 uppercase tracking-wide">
                Your Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={20}
                placeholder="Enter your display name"
                className="w-full px-4 py-3 bg-indigo-800 border border-indigo-600 rounded-xl text-white placeholder-indigo-400 focus:outline-none focus:border-yellow-400 transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleJoinGame()}
                disabled={isLoading}
              />
              <div className="text-right text-indigo-400 text-xs mt-1">
                {displayName.length}/20
              </div>
            </div>

            {localError && (
              <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-xl px-4 py-3 text-sm">
                {localError}
              </div>
            )}

            <button
              onClick={handleJoinGame}
              disabled={isLoading}
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-indigo-700 disabled:text-indigo-400 text-indigo-950 font-black text-xl rounded-xl transition-all duration-150 active:scale-95"
            >
              {isLoading ? 'Joining...' : 'Join Room'}
            </button>

            <button onClick={resetMode} className="text-indigo-400 hover:text-white text-sm text-center transition-colors">
              Back
            </button>
          </div>
        )}
      </div>

      <p className="mt-6 text-indigo-500 text-sm">
        Craft convincing lies. Spot the truth. Fool everyone.
      </p>
    </div>
  )
}
