import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { useUltrasonicDetector } from '../hooks/useUltrasonicDetector'
import type { GameListItem } from '@shared/types'
import {
  MIN_ROUNDS, MAX_ROUNDS, PROMPT_TIMER_PRESETS, DEFAULT_TOTAL_ROUNDS,
  PM_MIN_ROUNDS, PM_MAX_ROUNDS, PM_ANSWER_TIMER_PRESETS, PM_DEFAULT_TOTAL_ROUNDS,
} from '@shared/constants'

type Mode = 'home' | 'create-settings' | 'join'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
] as const

const GAME_CONFIGS: Record<string, {
  minRounds: number
  maxRounds: number
  defaultRounds: number
  timerPresets: readonly number[]
  hasDebuffs: boolean
  roundsNote: string
}> = {
  bluffalo: {
    minRounds: MIN_ROUNDS,
    maxRounds: MAX_ROUNDS,
    defaultRounds: DEFAULT_TOTAL_ROUNDS,
    timerPresets: PROMPT_TIMER_PRESETS,
    hasDebuffs: true,
    roundsNote: `Min ${MIN_ROUNDS} · Max ${MAX_ROUNDS}`,
  },
  pandamonium: {
    minRounds: PM_MIN_ROUNDS,
    maxRounds: PM_MAX_ROUNDS,
    defaultRounds: PM_DEFAULT_TOTAL_ROUNDS,
    timerPresets: PM_ANSWER_TIMER_PRESETS,
    hasDebuffs: false,
    roundsNote: `Min ${PM_MIN_ROUNDS} · Max ${PM_MAX_ROUNDS} · Last round is Total Pandamonium`,
  },
}

export default function JoinScreen() {
  const { emit, lastError, clearError, storedSession, clearStoredSession } = useGame()
  const [mode, setMode] = useState<Mode>('home')
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [games, setGames] = useState<GameListItem[]>([])

  // Create game settings state
  const [selectedGame, setSelectedGame] = useState('bluffalo')
  const [totalRounds, setTotalRounds] = useState(DEFAULT_TOTAL_ROUNDS)
  const [promptTimerSeconds, setPromptTimerSeconds] = useState(60)
  const [language, setLanguage] = useState<'en' | 'he'>('he')
  const [debuffsEnabled, setDebuffsEnabled] = useState(true)
  const [introEnabled, setIntroEnabled] = useState(true)

  const gameConfig = GAME_CONFIGS[selectedGame] ?? GAME_CONFIGS.bluffalo

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

  const handleSelectGame = (gameType: string) => {
    const config = GAME_CONFIGS[gameType] ?? GAME_CONFIGS.bluffalo
    setSelectedGame(gameType)
    setTotalRounds(config.defaultRounds)
    if (!(config.timerPresets as readonly number[]).includes(promptTimerSeconds)) {
      setPromptTimerSeconds(60)
    }
  }

  const handleProceedToCreate = () => {
    setLocalError(null)
    clearError()
    setMode('create-settings')
    if (games.length === 0) {
      fetch('/api/games')
        .then((r) => r.json())
        .then((data) => setGames(data as GameListItem[]))
        .catch(() => setLocalError('Failed to load games. Please try again.'))
    }
  }

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
        game_type: selectedGame,
        create: true,
        initial_settings: {
          total_rounds: totalRounds,
          prompt_timer_seconds: promptTimerSeconds,
          language,
          debuffs_enabled: debuffsEnabled,
          intro_enabled: introEnabled,
        },
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
              onClick={() => { handleProceedToCreate(); setLocalError(null) }}
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

        {mode === 'create-settings' && (
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-bold text-white text-center">Create a Room</h2>

            {/* Name input */}
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
                disabled={isLoading}
              />
              <div className="text-right text-indigo-400 text-xs mt-1">
                {displayName.length}/20
              </div>
            </div>

            {/* Game selector */}
            <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
              <label className="block text-indigo-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                Game
              </label>
              {games.length === 0 ? (
                <div className="flex justify-center py-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-400" />
                </div>
              ) : (
                <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${games.length}, 1fr)` }}>
                  {games.map((g) => (
                    <button
                      key={g.game_type}
                      onClick={() => handleSelectGame(g.game_type)}
                      disabled={isLoading}
                      className={`py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${
                        selectedGame === g.game_type
                          ? 'bg-yellow-400 text-indigo-950'
                          : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                      }`}
                    >
                      {g.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Rounds */}
            <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
              <label className="block text-indigo-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                Number of Rounds
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setTotalRounds(Math.max(gameConfig.minRounds, totalRounds - 1))}
                  disabled={isLoading}
                  className="w-10 h-10 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-white font-bold text-xl transition-colors active:scale-95"
                >
                  −
                </button>
                <span className="text-yellow-400 font-black text-3xl flex-1 text-center">
                  {totalRounds}
                </span>
                <button
                  onClick={() => setTotalRounds(Math.min(gameConfig.maxRounds, totalRounds + 1))}
                  disabled={isLoading}
                  className="w-10 h-10 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-white font-bold text-xl transition-colors active:scale-95"
                >
                  +
                </button>
              </div>
              <p className="text-indigo-400 text-xs text-center mt-2">{gameConfig.roundsNote}</p>
            </div>

            {/* Timer */}
            <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
              <label className="block text-indigo-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                Answer Time
              </label>
              <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${gameConfig.timerPresets.length}, 1fr)` }}>
                {gameConfig.timerPresets.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPromptTimerSeconds(s)}
                    disabled={isLoading}
                    className={`py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${
                      promptTimerSeconds === s
                        ? 'bg-yellow-400 text-indigo-950'
                        : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
              <label className="block text-indigo-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                Language
              </label>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    disabled={isLoading}
                    className={`py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${
                      language === l.code
                        ? 'bg-yellow-400 text-indigo-950'
                        : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Debuffs — Bluffalo only */}
            {gameConfig.hasDebuffs && (
              <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
                <label
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => !isLoading && setDebuffsEnabled(!debuffsEnabled)}
                >
                  <div>
                    <span className="block text-indigo-300 text-sm font-semibold uppercase tracking-wide">
                      Debuffs
                    </span>
                    <span className="block text-indigo-400 text-xs mt-1">
                      Best deceiver earns a power to punish!
                    </span>
                  </div>
                  <div
                    className={`w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 relative ${
                      debuffsEnabled ? 'bg-yellow-400' : 'bg-indigo-700'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                        debuffsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </label>
              </div>
            )}

            {/* Game Intro */}
            <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
              <label
                className="flex items-center justify-between cursor-pointer"
                onClick={() => !isLoading && setIntroEnabled(!introEnabled)}
              >
                <div>
                  <span className="block text-indigo-300 text-sm font-semibold uppercase tracking-wide">
                    Game Intro
                  </span>
                  <span className="block text-indigo-400 text-xs mt-1">
                    {language === 'he'
                      ? 'סקירה קצרה של הכללים לפני תחילת המשחק'
                      : 'A 1-minute rules overview when the game starts'}
                  </span>
                </div>
                <div
                  className={`w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 relative ${
                    introEnabled ? 'bg-yellow-400' : 'bg-indigo-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      introEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>
            </div>

            {localError && (
              <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-xl px-4 py-3 text-sm">
                {localError}
              </div>
            )}

            <button
              onClick={handleCreateGame}
              disabled={isLoading}
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-indigo-700 disabled:text-indigo-400 disabled:cursor-not-allowed text-indigo-950 font-black text-xl rounded-xl transition-all duration-150 active:scale-95"
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
                disabled={isLoading}
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
