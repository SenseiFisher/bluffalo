import React, { useState } from 'react'
import { useGame } from '../context/GameContext'
import { useTimer } from '../hooks/useTimer'
import ReportButton from '../components/ReportButton'

export default function SelectionScreen() {
  const { gameState, mySessionId, emit, lastError, clearError } = useGame()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [voted, setVoted] = useState(false)
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)

  if (!gameState || !gameState.current_fact) return null

  const factTemplate = gameState.current_fact.fact_template
  const parts = factTemplate.split('_______')

  // Find my player to get my lie's option_id (including merged duplicate options)
  const myOptions = gameState.vote_options.filter(
    (o) =>
      o.author_session_id === mySessionId ||
      o.co_author_session_ids.includes(mySessionId ?? '')
  )
  const myOptionIds = new Set(myOptions.map((o) => o.option_id))

  // Options visible to me: exclude my own lie(s)
  const visibleOptions = gameState.vote_options.filter(
    (o) => !myOptionIds.has(o.option_id)
  )

  const votedCount = gameState.players.filter(
    (p) => p.round.voted_for_id !== null
  ).length
  const eligibleCount = gameState.players.filter(
    (p) => p.is_connected && !p.round.great_minds
  ).length

  const handleVote = (optionId: string) => {
    if (myOptionIds.has(optionId)) return
    clearError()
    setSelectedId(optionId)
    setVoted(true)
    emit('SUBMIT_VOTE', { option_id: optionId })
  }

  // Check if I've already voted (from game state, e.g. after rejoin)
  const myPlayer = gameState.players.find((p) => {
    // Can't match by session_id since it's stripped; rely on local state
    return false
  })

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
        <div
          className={`text-2xl font-black ${
            timeRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-yellow-400'
          }`}
        >
          {timeRemaining}s
        </div>
      </div>

      {/* Phase label */}
      <div className="text-center mb-5">
        <h2 className="text-3xl font-black text-white">Which is the Truth?</h2>
        <p className="text-indigo-300 mt-1 text-sm">Tap the real answer to earn points</p>
      </div>

      {/* Fact */}
      <div className="w-full max-w-lg bg-indigo-800/70 border border-indigo-600 rounded-2xl p-4 mb-5 shadow-xl">
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

      {/* Report fact */}
      <div className="w-full max-w-lg flex justify-end -mt-2 mb-2">
        <ReportButton
          factId={gameState.current_fact.content_id}
          roundNumber={gameState.round_number}
        />
      </div>

      {/* Scoring hint */}
      <div className="w-full max-w-lg mb-4 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-indigo-800/40 border border-indigo-700 rounded-lg p-2 text-center">
          <span className="text-yellow-400 font-bold">+500</span>
          <span className="text-indigo-300 ml-1">Truth Seeker</span>
        </div>
        <div className="bg-indigo-800/40 border border-indigo-700 rounded-lg p-2 text-center">
          <span className="text-yellow-400 font-bold">+250</span>
          <span className="text-indigo-300 ml-1">per Bamboozle</span>
        </div>
      </div>

      {/* Vote Options */}
      <div className="w-full max-w-lg space-y-3">
        {visibleOptions.length === 0 ? (
          <div className="text-center text-indigo-400 py-8">
            <p className="text-lg font-semibold">Your answer matched the truth!</p>
            <p className="text-sm mt-2">Great Minds bonus: +1000 pts</p>
          </div>
        ) : (
          <>
            {visibleOptions.map((option, idx) => (
              <button
                key={option.option_id}
                onClick={() => handleVote(option.option_id)}
                className={`w-full text-left rounded-xl px-5 py-4 flex items-center gap-4 transition-all duration-150 active:scale-95 ${
                  selectedId === option.option_id
                    ? 'bg-yellow-400/20 border-2 border-yellow-400'
                    : 'bg-indigo-800/60 border-2 border-indigo-600 hover:border-yellow-400 hover:bg-indigo-700/60'
                }`}
              >
                <span className="text-indigo-400 font-bold text-lg w-8 shrink-0">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="text-white font-semibold text-xl">{option.text}</span>
                {selectedId === option.option_id && (
                  <span className="ml-auto text-yellow-400 font-bold">YOUR VOTE ✓</span>
                )}
              </button>
            ))}

            {voted && (
              <div className="bg-green-900/40 border border-green-600 rounded-xl p-4 text-center mt-4">
                <p className="text-green-400 font-semibold">Vote submitted!</p>
                <p className="text-indigo-300 text-sm mt-1">Tap another answer to change your vote</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Voting progress */}
      <div className="w-full max-w-lg mt-5">
        <div className="flex justify-between text-indigo-400 text-xs mb-1">
          <span>Votes in</span>
          <span>{votedCount}/{eligibleCount}</span>
        </div>
        <div className="w-full bg-indigo-800 rounded-full h-2">
          <div
            className="bg-yellow-400 rounded-full h-2 transition-all duration-500"
            style={{ width: eligibleCount > 0 ? `${(votedCount / eligibleCount) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {lastError && (
        <div className="w-full max-w-lg mt-3 bg-red-900/50 border border-red-500 text-red-300 rounded-xl px-4 py-2 text-sm">
          {lastError.message}
        </div>
      )}
    </div>
  )
}
