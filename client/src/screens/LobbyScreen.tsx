import React, { useState } from 'react'
import { useGame } from '../context/GameContext'

export default function LobbyScreen() {
  const { gameState, mySessionId, emit, lastError, clearError } = useGame()
  const [totalRounds, setTotalRounds] = useState(7)
  const [promptTimerSeconds, setPromptTimerSeconds] = useState(60)
  const [language, setLanguage] = useState<'en' | 'he'>('en')
  const TIMER_PRESETS = [30, 45, 60, 90, 120, 150]
  const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'he', label: 'עברית' },
  ] as const

  if (!gameState) return null

  const isRoomMaster = mySessionId === gameState.room_master_session_id
  const connectedPlayers = gameState.players.filter((p) => p.is_connected)
  const canStart = connectedPlayers.length >= 2

  const handleStartGame = () => {
    clearError()
    emit('START_GAME', { total_rounds: totalRounds, prompt_timer_seconds: promptTimerSeconds, language })
  }

  const roomUrl = window.location.origin

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8">
      {/* Title */}
      <h1 className="text-5xl font-black text-yellow-400 mb-2 tracking-tight">BLUFFALO</h1>
      <p className="text-indigo-300 mb-8 text-sm">Waiting for players to join...</p>

      {/* Room Code */}
      <div className="bg-indigo-800/60 border border-indigo-600 rounded-2xl p-6 mb-6 text-center w-full max-w-md shadow-xl">
        <p className="text-indigo-300 text-sm font-semibold uppercase tracking-widest mb-2">Room Code</p>
        <div className="text-6xl font-black text-yellow-400 tracking-widest letter-spacing-8">
          {gameState.room_code}
        </div>
        <p className="text-indigo-400 text-xs mt-3">
          Share this code with friends at <span className="text-indigo-300 font-mono">{roomUrl}</span>
        </p>
      </div>

      {/* Players */}
      <div className="w-full max-w-md mb-6">
        <h2 className="text-indigo-300 text-sm font-semibold uppercase tracking-widest mb-3">
          Players ({connectedPlayers.length}/{gameState.players.length})
        </h2>
        <div className="space-y-2">
          {gameState.players.map((player, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between bg-indigo-800/60 border rounded-xl px-4 py-3 ${
                player.is_connected ? 'border-indigo-600' : 'border-indigo-800 opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    player.is_connected ? 'bg-green-400' : 'bg-gray-500'
                  }`}
                />
                <span className="text-white font-semibold">
                  {player.display_name}
                  {player.id === '' && mySessionId === gameState.room_master_session_id && gameState.players[0] === player ? '' : ''}
                </span>
                {gameState.room_master_session_id && idx === 0 && isRoomMaster && (
                  <span className="text-yellow-400 text-xs font-bold bg-yellow-400/10 px-2 py-0.5 rounded-full">
                    HOST
                  </span>
                )}
              </div>
              <span className="text-indigo-400 text-xs">
                {player.is_connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          ))}

          {gameState.players.length === 0 && (
            <div className="text-indigo-400 text-center py-4">
              No players yet. Share the room code!
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {lastError && (
        <div className="w-full max-w-md mb-4 bg-red-900/50 border border-red-500 text-red-300 rounded-xl px-4 py-3 text-sm">
          {lastError.message}
        </div>
      )}

      {/* Room Master controls */}
      {isRoomMaster ? (
        <div className="w-full max-w-md space-y-4">
          <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
            <label className="block text-indigo-300 text-sm font-semibold mb-3 uppercase tracking-wide">
              Number of Rounds
            </label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTotalRounds(Math.max(3, totalRounds - 1))}
                className="w-10 h-10 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-white font-bold text-xl transition-colors active:scale-95"
              >
                −
              </button>
              <span className="text-yellow-400 font-black text-3xl flex-1 text-center">
                {totalRounds}
              </span>
              <button
                onClick={() => setTotalRounds(Math.min(20, totalRounds + 1))}
                className="w-10 h-10 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-white font-bold text-xl transition-colors active:scale-95"
              >
                +
              </button>
            </div>
            <p className="text-indigo-400 text-xs text-center mt-2">Min 3 · Max 20</p>
          </div>

          <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
            <label className="block text-indigo-300 text-sm font-semibold mb-3 uppercase tracking-wide">
              Answer Time
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TIMER_PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPromptTimerSeconds(s)}
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

          <div className="bg-indigo-800/60 border border-indigo-600 rounded-xl p-4">
            <label className="block text-indigo-300 text-sm font-semibold mb-3 uppercase tracking-wide">
              Language
            </label>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
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

          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-indigo-700 disabled:text-indigo-400 disabled:cursor-not-allowed text-indigo-950 font-black text-xl rounded-xl transition-all duration-150 active:scale-95 shadow-lg"
          >
            {canStart ? `Start Game (${totalRounds} rounds)` : `Need ${2 - connectedPlayers.length} more player(s)`}
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <div className="bg-indigo-800/40 border border-indigo-700 rounded-xl p-5 text-center">
            <div className="text-indigo-300 animate-pulse text-lg">
              Waiting for host to start the game...
            </div>
            <p className="text-indigo-500 text-sm mt-2">
              {connectedPlayers.length} player{connectedPlayers.length !== 1 ? 's' : ''} connected
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
