import React from 'react'
import { useGame } from '../context/GameContext'
import { useTimer } from '../hooks/useTimer'

export default function RevealScreen() {
  const { gameState } = useGame()
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)

  if (!gameState || !gameState.current_fact) return null

  const factTemplate = gameState.current_fact.fact_template
  const parts = factTemplate.split('_______')

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8">
      {/* Header */}
      <div className="flex justify-between items-center w-full max-w-lg mb-4">
        <div className="text-indigo-300 text-sm font-semibold">
          Round {gameState.round_number} of {gameState.total_rounds}
          {gameState.is_final_round && (
            <span className="ml-2 text-yellow-400 font-bold">★ FINAL</span>
          )}
        </div>
        <div className="text-2xl font-black text-yellow-400">{timeRemaining}s</div>
      </div>

      {/* Phase Label */}
      <div className="text-center mb-6">
        <h2 className="text-3xl font-black text-white">All Answers In!</h2>
        <p className="text-indigo-300 mt-1">Get ready to vote...</p>
      </div>

      {/* Fact */}
      <div className="w-full max-w-lg bg-indigo-800/70 border border-indigo-600 rounded-2xl p-5 mb-6 shadow-xl">
        <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-2">The Question</p>
        <p
          className="text-white text-lg font-semibold leading-relaxed"
          dir={gameState.language === 'he' ? 'rtl' : 'ltr'}
        >
          {parts[0]}
          <span className="inline-block bg-indigo-700 border-b-2 border-yellow-400 px-3 py-0.5 mx-1 rounded min-w-[6rem] text-center">
            &nbsp;
          </span>
          {parts[1] || ''}
        </p>
      </div>

      {/* Vote Options (anonymized) */}
      <div className="w-full max-w-lg">
        <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-3">
          The Answers ({gameState.vote_options.length})
        </p>
        <div className="space-y-2">
          {gameState.vote_options.map((option, idx) => (
            <div
              key={option.option_id}
              className="bg-indigo-800/60 border border-indigo-600 rounded-xl px-5 py-3 flex items-center gap-3 animate-slide-up"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <span className="text-indigo-400 font-bold text-sm w-6">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="text-white font-semibold text-lg">{option.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Countdown */}
      <div className="mt-8 text-center">
        <p className="text-indigo-400 text-sm animate-pulse">
          Voting begins in {timeRemaining} second{timeRemaining !== 1 ? 's' : ''}...
        </p>
      </div>
    </div>
  )
}
