import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

type Mode = 'home' | 'create' | 'join'

export default function JoinScreen() {
  const { emit, lastError, clearError, storedSession, clearStoredSession } = useGame()
  const [mode, setMode] = useState<Mode>('home')
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFindingNearby, setIsFindingNearby] = useState(false)
  const [nearbyStatus, setNearbyStatus] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

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

    const getGeoLocation = (): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('unsupported')); return }
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 })
      })

    try {
      const [codeResult, geoResult] = await Promise.allSettled([
        fetch('/api/room/code').then((r) => r.json() as Promise<{ code: string }>),
        getGeoLocation(),
      ])

      if (codeResult.status === 'rejected') {
        setLocalError('Failed to create room. Please try again.')
        setIsLoading(false)
        return
      }

      const { code } = codeResult.value
      const location =
        geoResult.status === 'fulfilled'
          ? { lat: geoResult.value.coords.latitude, lng: geoResult.value.coords.longitude }
          : undefined

      emit('JOIN_ROOM', {
        room_code: code,
        display_name: displayName.trim(),
        ...(location ? { location } : {}),
      })
    } catch {
      setLocalError('Failed to create room. Please try again.')
      setIsLoading(false)
    }
  }

  const handleFindNearby = () => {
    if (!navigator.geolocation) {
      setLocalError('Your browser does not support geolocation.')
      return
    }
    setIsFindingNearby(true)
    setNearbyStatus('Getting your location...')
    setLocalError(null)
    clearError()

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setNearbyStatus('Searching for nearby rooms...')
        try {
          const { latitude: lat, longitude: lng } = position.coords
          const res = await fetch(`/api/rooms/nearby?lat=${lat}&lng=${lng}`)
          const data = await res.json() as { code: string | null }
          if (data.code) {
            setRoomCode(data.code)
            setNearbyStatus(null)
          } else {
            setNearbyStatus(null)
            setLocalError('No nearby rooms found. Ask a friend to create one!')
          }
        } catch {
          setNearbyStatus(null)
          setLocalError('Could not search for nearby rooms. Please try again.')
        } finally {
          setIsFindingNearby(false)
        }
      },
      (err) => {
        setIsFindingNearby(false)
        setNearbyStatus(null)
        if (err.code === err.PERMISSION_DENIED) {
          setLocalError('Location access was denied. Enter a room code manually.')
        } else {
          setLocalError('Could not get your location. Enter a room code manually.')
        }
      },
      { timeout: 8000, maximumAge: 60000 }
    )
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
              onClick={() => { setMode('create'); clearError(); setLocalError(null) }}
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
                onClick={handleFindNearby}
                disabled={isLoading || isFindingNearby}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:bg-indigo-800 disabled:text-indigo-500 text-indigo-200 text-sm font-semibold transition-all active:scale-95"
              >
                {isFindingNearby ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-400 border-t-indigo-200 rounded-full animate-spin" />
                    {nearbyStatus ?? 'Searching...'}
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8 8 0 10-16 0c0 3.63 1.556 6.324 3.5 8.327a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" clipRule="evenodd" />
                    </svg>
                    Find nearby room
                  </>
                )}
              </button>
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
