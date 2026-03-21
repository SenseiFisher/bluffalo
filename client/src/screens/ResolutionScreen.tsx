import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { useTimer } from '../hooks/useTimer'
import { VoteOption } from '@shared/types'

interface RevealedOption extends VoteOption {
  voters: string[]
  authors: string[]
  revealIndex: number
}

export default function ResolutionScreen() {
  const { gameState, mySessionId } = useGame()
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)
  const [revealedCount, setRevealedCount] = useState(0)

  if (!gameState || !gameState.current_fact) return null

  const factTemplate = gameState.current_fact.fact_template
  const parts = factTemplate.split('_______')

  // Build augmented options with voter info
  const augmentedOptions: RevealedOption[] = gameState.vote_options.map(
    (opt, idx) => {
      const voters = gameState.players
        .filter((p) => p.round.voted_for_id === opt.option_id)
        .map((p) => p.display_name)

      const authors = opt.author_session_id
        ? gameState.players
            .filter((p) => {
              // Since session_id is stripped on players in client, we compare author_session_id
              // against mySessionId to know if it's ours, but for display we need all authors
              return false // Can't match stripped IDs to names easily here
            })
            .map((p) => p.display_name)
        : []

      return {
        ...opt,
        voters,
        authors,
        revealIndex: idx,
      }
    }
  )

  // Sort: lies first, truth last
  const lies = augmentedOptions.filter((o) => !o.is_truth)
  const truth = augmentedOptions.find((o) => o.is_truth)
  const orderedOptions = [...lies, ...(truth ? [truth] : [])]

  // Animate reveal: reveal one option every ~1.2 seconds
  useEffect(() => {
    if (revealedCount >= orderedOptions.length) return
    const timer = setTimeout(() => {
      setRevealedCount((c) => c + 1)
    }, 1200)
    return () => clearTimeout(timer)
  }, [revealedCount, orderedOptions.length])

  // Player round scores (new points earned this round)
  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score)

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8 pb-16">
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

      <div className="text-center mb-5">
        <h2 className="text-3xl font-black text-white">The Big Reveal!</h2>
      </div>

      {/* Fact */}
      <div className="w-full max-w-lg bg-indigo-800/70 border border-indigo-600 rounded-2xl p-4 mb-5 shadow-xl">
        <p className="text-white text-lg font-semibold leading-relaxed">
          {parts[0]}
          {truth && revealedCount >= orderedOptions.length ? (
            <span className="inline-block bg-green-600 border-2 border-green-400 px-3 py-0.5 mx-1 rounded text-white font-black animate-fade-in">
              {gameState.current_fact.truth_keyword}
            </span>
          ) : (
            <span className="inline-block bg-indigo-700 border-b-2 border-yellow-400 px-3 py-0.5 mx-1 rounded text-yellow-400 font-black min-w-[6rem] text-center">
              ???????
            </span>
          )}
          {parts[1] || ''}
        </p>
      </div>

      {/* Reveal Options */}
      <div className="w-full max-w-lg space-y-3 mb-6">
        {orderedOptions.map((option, idx) => {
          const isRevealed = idx < revealedCount
          const isTruth = option.is_truth
          const isMyLie = option.author_session_id === mySessionId

          if (!isRevealed) {
            return (
              <div
                key={option.option_id}
                className="bg-indigo-800/40 border-2 border-indigo-700 rounded-xl px-5 py-4 opacity-40"
              >
                <span className="text-indigo-500 font-bold text-lg">...</span>
              </div>
            )
          }

          return (
            <div
              key={option.option_id}
              className={`rounded-xl px-5 py-4 border-2 animate-slide-up ${
                isTruth
                  ? 'bg-green-900/50 border-green-500'
                  : 'bg-indigo-800/60 border-indigo-600'
              }`}
              style={{ animationDelay: '0ms' }}
            >
              <div className="flex items-start justify-between mb-2">
                <span
                  className={`text-xl font-black ${
                    isTruth ? 'text-green-400' : 'text-white'
                  }`}
                >
                  {option.text}
                  {isTruth && (
                    <span className="ml-2 text-green-400 text-base">✓ TRUTH</span>
                  )}
                </span>
              </div>

              {/* Author info */}
              {!isTruth && (
                <div className="text-sm text-indigo-400">
                  {isMyLie ? (
                    <span className="text-yellow-400 font-semibold">YOUR LIE</span>
                  ) : option.author_session_id ? (
                    <span className="text-indigo-300">
                      By a player
                    </span>
                  ) : null}
                </div>
              )}

              {/* Voters */}
              {option.voters.length > 0 ? (
                <div className="mt-2">
                  <span className="text-indigo-400 text-xs uppercase tracking-wide">
                    Fooled:{' '}
                  </span>
                  <span className="text-yellow-400 text-sm font-semibold">
                    {option.voters.join(', ')}
                  </span>
                </div>
              ) : (
                !isTruth && (
                  <div className="mt-1 text-indigo-600 text-xs">No votes</div>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* Leaderboard */}
      <div className="w-full max-w-lg">
        <h3 className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-3">
          Standings After Round {gameState.round_number}
        </h3>
        <div className="space-y-2">
          {sortedPlayers.map((player, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-indigo-800/40 border border-indigo-700 rounded-xl px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-black w-6 text-center ${
                    idx === 0
                      ? 'text-yellow-400'
                      : idx === 1
                      ? 'text-gray-300'
                      : idx === 2
                      ? 'text-amber-600'
                      : 'text-indigo-500'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="text-white font-semibold">{player.display_name}</span>
                {player.round.truth_found && (
                  <span className="text-green-400 text-xs bg-green-900/40 px-2 py-0.5 rounded-full">
                    +500 Truth
                  </span>
                )}
                {player.round.great_minds && (
                  <span className="text-purple-400 text-xs bg-purple-900/40 px-2 py-0.5 rounded-full">
                    +1000 Great Minds
                  </span>
                )}
                {player.round.bamboozle_count > 0 && (
                  <span className="text-orange-400 text-xs bg-orange-900/40 px-2 py-0.5 rounded-full">
                    +{player.round.bamboozle_count * 250} Bamboozle
                  </span>
                )}
              </div>
              <span className="text-yellow-400 font-black text-lg">{player.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
