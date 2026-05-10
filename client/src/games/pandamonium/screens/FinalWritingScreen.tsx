import React, { useState } from 'react'
import { useGame } from '../../../context/GameContext'
import { useTimer } from '../../../hooks/useTimer'

export default function FinalWritingScreen() {
  const { gameState, emit, lastError, clearError } = useGame()
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)

  if (!gameState || !gameState.current_fact) return null

  const lang = gameState.language ?? 'en'
  const parts = gameState.current_fact.fact_template.split('_______')

  const submittedCount = gameState.players.filter((p) => p.round.submitted_lie !== null).length
  const totalPlayers = gameState.players.filter((p) => p.is_connected).length

  const handleSubmit = () => {
    if (!answer.trim() || submitted) return
    clearError()
    emit('PM_SUBMIT_ANSWER', { answer: answer.trim() })
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-green-950 flex flex-col items-center p-4 pt-8">
      {/* Header */}
      <div className="flex justify-between items-center w-full max-w-lg mb-6">
        <div className="text-yellow-400 font-black text-sm uppercase tracking-wide">
          🐼 Total Pandamonium!
        </div>
        <div className={`text-2xl font-black ${timeRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
          {timeRemaining}s
        </div>
      </div>

      <div className="w-full max-w-lg mb-4 bg-yellow-400/20 border border-yellow-400 rounded-xl px-4 py-2 text-center">
        <span className="text-yellow-400 font-bold text-sm">FINAL ROUND — Everyone gets the same prompt!</span>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-3xl font-black text-white">One Last Chance</h2>
        <p className="text-green-300 mt-1 text-sm">Write your most hilarious answer yet</p>
      </div>

      {/* Prompt */}
      <div className="w-full max-w-lg bg-green-800/60 border border-green-600 rounded-2xl p-6 mb-6 shadow-xl">
        <p className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-3">Fill in the blank</p>
        <p className="text-white text-xl font-semibold leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
          {parts[0]}
          <span className="inline-block bg-green-700 border-b-2 border-yellow-400 px-3 py-0.5 mx-1 rounded min-w-[6rem] text-center">
            &nbsp;
          </span>
          {parts[1] ?? ''}
        </p>
      </div>

      {/* Input */}
      {!submitted ? (
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-green-800/60 border border-green-600 rounded-2xl p-4">
            <label className="block text-green-300 text-sm font-semibold mb-2 uppercase tracking-wide">
              Your Answer
            </label>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, 50))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              maxLength={50}
              placeholder="Make it unforgettable..."
              className="w-full px-4 py-3 bg-green-700 border border-green-500 focus:border-yellow-400 rounded-xl text-white placeholder-green-400 focus:outline-none transition-colors text-lg"
              autoFocus
            />
            <div className="flex justify-between mt-2">
              <span className={`text-xs ${answer.length >= 45 ? 'text-yellow-400' : 'text-green-400'}`}>
                {answer.length}/50
              </span>
              {lastError && <span className="text-red-400 text-xs">{lastError.message}</span>}
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!answer.trim()}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-green-700 disabled:text-green-400 disabled:cursor-not-allowed text-green-950 font-black text-xl rounded-xl transition-all active:scale-95 shadow-lg"
          >
            Submit Final Answer
          </button>
        </div>
      ) : (
        <div className="w-full max-w-lg bg-green-900/40 border border-green-500 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">✓</div>
          <p className="text-green-400 font-bold text-xl mb-1">Answer Locked In!</p>
          <p className="text-white font-semibold text-lg mt-2">"{answer}"</p>
          <p className="text-green-300 text-sm mt-2">Waiting for others to submit...</p>
        </div>
      )}

      {/* Progress */}
      <div className="w-full max-w-lg mt-6">
        <div className="flex justify-between text-green-400 text-xs mb-1">
          <span>Answers in</span>
          <span>{submittedCount}/{totalPlayers}</span>
        </div>
        <div className="w-full bg-green-800 rounded-full h-2">
          <div
            className="bg-yellow-400 rounded-full h-2 transition-all duration-500"
            style={{ width: totalPlayers > 0 ? `${(submittedCount / totalPlayers) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Leaderboard */}
      <div className="w-full max-w-lg mt-6">
        <h3 className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-2">Current Standings</h3>
        <div className="space-y-1">
          {[...gameState.players].sort((a, b) => b.score - a.score).map((player, idx) => (
            <div key={idx} className="flex items-center justify-between bg-green-800/40 rounded-lg px-3 py-1.5">
              <span className="text-green-300 text-sm flex items-center gap-1.5">
                <span className="text-green-500">{idx + 1}.</span>
                {player.display_name}
                {player.round.submitted_lie !== null && <span className="text-green-400 text-xs">✓</span>}
              </span>
              <span className="text-yellow-400 font-bold text-sm">{player.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
