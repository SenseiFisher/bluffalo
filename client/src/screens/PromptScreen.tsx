import React, { useState } from 'react'
import { useGame } from '../context/GameContext'
import { useTimer } from '../hooks/useTimer'

export default function PromptScreen() {
  const { gameState, mySessionId, emit, lastError, clearError } = useGame()
  const [lieText, setLieText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)

  if (!gameState || !gameState.current_fact) return null

  const myPlayer = gameState.players.find((p) => {
    // We can't match by session_id directly since it's stripped, but we can track submission state
    // The server strips session_id so we use mySessionId stored separately
    return false // We rely on our local `submitted` state
  })

  const submittedCount = gameState.players.filter(
    (p) => p.round.submitted_lie !== null
  ).length
  const totalPlayers = gameState.players.filter((p) => p.is_connected).length

  const factTemplate = gameState.current_fact.fact_template
  const parts = factTemplate.split('_______')

  const handleSubmit = () => {
    if (!lieText.trim() || submitted) return
    clearError()
    emit('SUBMIT_LIE', { text: lieText.trim() })
    setSubmitted(true)
  }

  const isFinalRound = gameState.is_final_round

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8">
      {/* Header */}
      <div className="flex justify-between items-center w-full max-w-lg mb-6">
        <div className="text-indigo-300 text-sm font-semibold">
          Round {gameState.round_number} of {gameState.total_rounds}
          {isFinalRound && (
            <span className="ml-2 text-yellow-400 font-bold">★ FINAL ROUND ★</span>
          )}
        </div>
        <div
          className={`text-2xl font-black ${
            timeRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-yellow-400'
          }`}
        >
          {timeRemaining}s
        </div>
      </div>

      {/* Final Round Banner */}
      {isFinalRound && (
        <div className="w-full max-w-lg mb-4 bg-yellow-400/20 border border-yellow-400 rounded-xl px-4 py-2 text-center">
          <span className="text-yellow-400 font-bold text-sm">
            FINAL ROUND — All points x2!
          </span>
        </div>
      )}

      {/* Fact Card */}
      <div className="w-full max-w-lg bg-indigo-800/70 border border-indigo-600 rounded-2xl p-6 mb-6 shadow-xl">
        <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-3">
          Fill in the blank
        </p>
        <p className="text-white text-xl font-semibold leading-relaxed">
          {parts[0]}
          <span className="inline-block bg-indigo-700 border-b-2 border-yellow-400 px-3 py-0.5 mx-1 rounded min-w-[6rem] text-center">
            &nbsp;
          </span>
          {parts[1] || ''}
        </p>
      </div>

      {/* Submission area */}
      {!submitted ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-indigo-800/60 border border-indigo-600 rounded-2xl p-4">
            <label className="block text-indigo-300 text-sm font-semibold mb-2 uppercase tracking-wide">
              Your Lie (or the truth if you dare!)
            </label>
            <input
              type="text"
              value={lieText}
              onChange={(e) => setLieText(e.target.value.slice(0, 50))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              maxLength={50}
              placeholder="Type a convincing answer..."
              className="w-full px-4 py-3 bg-indigo-700 border border-indigo-500 rounded-xl text-white placeholder-indigo-400 focus:outline-none focus:border-yellow-400 transition-colors text-lg"
              autoFocus
            />
            <div className="flex justify-between mt-2">
              <span className={`text-xs ${lieText.length >= 45 ? 'text-yellow-400' : 'text-indigo-400'}`}>
                {lieText.length}/50 characters
              </span>
              {lastError && (
                <span className="text-red-400 text-xs">{lastError.message}</span>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!lieText.trim()}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-indigo-700 disabled:text-indigo-400 disabled:cursor-not-allowed text-indigo-950 font-black text-xl rounded-xl transition-all active:scale-95 shadow-lg"
          >
            Submit Answer
          </button>
        </div>
      ) : (
        <div className="w-full max-w-lg">
          <div className="bg-green-900/40 border border-green-600 rounded-2xl p-6 text-center">
            <div className="text-5xl mb-3">✓</div>
            <p className="text-green-400 font-bold text-xl mb-1">Answer Submitted!</p>
            <p className="text-indigo-300 text-sm">
              Waiting for others to submit their answers...
            </p>
          </div>
        </div>
      )}

      {/* Submission progress */}
      <div className="w-full max-w-lg mt-4">
        <div className="flex justify-between text-indigo-400 text-xs mb-1">
          <span>Submissions</span>
          <span>{submittedCount}/{totalPlayers}</span>
        </div>
        <div className="w-full bg-indigo-800 rounded-full h-2">
          <div
            className="bg-yellow-400 rounded-full h-2 transition-all duration-500"
            style={{ width: totalPlayers > 0 ? `${(submittedCount / totalPlayers) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Leaderboard mini */}
      <div className="w-full max-w-lg mt-6">
        <h3 className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-2">
          Current Standings
        </h3>
        <div className="space-y-1">
          {[...gameState.players]
            .sort((a, b) => b.score - a.score)
            .map((player, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-indigo-800/40 rounded-lg px-3 py-1.5"
              >
                <span className="text-indigo-300 text-sm">
                  <span className="text-indigo-500 mr-2">{idx + 1}.</span>
                  {player.display_name}
                  {player.round.submitted_lie !== null && (
                    <span className="ml-2 text-green-400 text-xs">✓</span>
                  )}
                </span>
                <span className="text-yellow-400 font-bold text-sm">{player.score}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
