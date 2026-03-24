import React, { useState, useEffect, useMemo } from 'react'
import { useGame } from '../context/GameContext'
import { VoteOption } from '@shared/types'

const STEP_DURATION = 2200 // ms between reveal steps

interface AugmentedOption extends VoteOption {
  voteCount: number
  voterNames: string[]
}

export default function ResolutionScreen() {
  const { gameState, mySessionId } = useGame()
  const [step, setStep] = useState(0)

  if (!gameState || !gameState.current_fact) return null

  const factParts = gameState.current_fact.fact_template.split('_______')

  // Build augmented options with voter info
  const augmented: AugmentedOption[] = useMemo(() => {
    return gameState.vote_options.map((opt) => {
      const voterNames = gameState.players
        .filter((p) => p.round.voted_for_id === opt.option_id)
        .map((p) => p.display_name)
      return { ...opt, voteCount: voterNames.length, voterNames }
    })
  }, [gameState.vote_options, gameState.players])

  // Sort: lies ascending by votes, truth always last
  const lies = useMemo(
    () => augmented.filter((o) => !o.is_truth).sort((a, b) => a.voteCount - b.voteCount),
    [augmented]
  )
  const truth = useMemo(() => augmented.find((o) => o.is_truth) ?? null, [augmented])

  // Determine if truth is in the top 3 most voted (among all options)
  const top3ByVotes = useMemo(() => {
    return [...augmented].sort((a, b) => b.voteCount - a.voteCount).slice(0, 3)
  }, [augmented])
  const isTruthInTop3 = useMemo(
    () => top3ByVotes.some((o) => o.is_truth),
    [top3ByVotes]
  )

  // Split into normal (one-by-one) and batch (revealed together)
  const normalItems: AugmentedOption[] = useMemo(() => {
    if (!truth) return lies
    if (isTruthInTop3 && lies.length >= 2) return lies.slice(0, lies.length - 2)
    return lies
  }, [lies, truth, isTruthInTop3])

  const batchItems: AugmentedOption[] = useMemo(() => {
    if (!truth) return []
    if (isTruthInTop3 && lies.length >= 2) return [...lies.slice(lies.length - 2), truth]
    return [truth]
  }, [lies, truth, isTruthInTop3])

  // Total steps: 2 per normal item (show text, reveal author) + 2 for final batch
  const totalSteps = (normalItems.length + 1) * 2

  useEffect(() => {
    setStep(0)
  }, [gameState.round_number])

  useEffect(() => {
    if (step >= totalSteps) return
    const t = setTimeout(() => setStep((s) => s + 1), STEP_DURATION)
    return () => clearTimeout(t)
  }, [step, totalSteps])

  // Helper: is a normal item's text visible?
  const isNormalTextVisible = (idx: number) => step >= idx * 2 + 1
  // Helper: is a normal item's author visible?
  const isNormalAuthorVisible = (idx: number) => step >= idx * 2 + 2
  // Helper: is the batch text visible?
  const isBatchTextVisible = () => step >= normalItems.length * 2 + 1
  // Helper: is the batch author visible?
  const isBatchAuthorVisible = () => step >= normalItems.length * 2 + 2

  const truthRevealed = isBatchAuthorVisible()
  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score)

  const isMyOption = (opt: AugmentedOption) => opt.author_session_id === mySessionId

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8 pb-16">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-4xl font-black text-white">The Big Reveal</h2>
        <p className="text-indigo-300 mt-1 text-sm">
          Round {gameState.round_number} of {gameState.total_rounds}
          {gameState.is_final_round && <span className="ml-2 text-yellow-400 font-bold">★ FINAL</span>}
        </p>
      </div>

      {/* Fact with blank */}
      <div className="w-full max-w-lg bg-indigo-800/70 border border-indigo-600 rounded-2xl p-5 mb-6 shadow-xl">
        <p
          className="text-white text-lg font-semibold leading-relaxed"
          dir={gameState.language === 'he' ? 'rtl' : 'ltr'}
        >
          {factParts[0]}
          {truthRevealed ? (
            <span className="inline-block bg-green-600 border-2 border-green-400 px-3 py-0.5 mx-1 rounded text-white font-black animate-pulse">
              {gameState.current_fact.truth_keyword}
            </span>
          ) : (
            <span className="inline-block bg-indigo-700 border-b-2 border-yellow-400 px-3 py-0.5 mx-1 rounded min-w-[6rem] text-center">
              &nbsp;
            </span>
          )}
          {factParts[1] ?? ''}
        </p>
      </div>

      {/* Reveal cards */}
      <div className="w-full max-w-lg space-y-3 mb-8">

        {/* Normal items — one at a time */}
        {normalItems.map((opt, idx) => (
          <RevealCard
            key={opt.option_id}
            option={opt}
            textVisible={isNormalTextVisible(idx)}
            authorVisible={isNormalAuthorVisible(idx)}
            isMyLie={isMyOption(opt)}
          />
        ))}

        {/* Batch items — all together */}
        {batchItems.map((opt) => (
          <RevealCard
            key={opt.option_id}
            option={opt}
            textVisible={isBatchTextVisible()}
            authorVisible={isBatchAuthorVisible()}
            isMyLie={isMyOption(opt)}
            isBatch={isTruthInTop3 && lies.length >= 2}
          />
        ))}
      </div>

      {/* Leaderboard — only shown after full reveal */}
      {truthRevealed && (
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-black w-6 text-center ${
                    idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-indigo-500'
                  }`}>{idx + 1}</span>
                  <span className="text-white font-semibold">{player.display_name}</span>
                  {player.round.truth_found && (
                    <span className="text-green-400 text-xs bg-green-900/40 px-2 py-0.5 rounded-full">+500 Truth</span>
                  )}
                  {player.round.great_minds && (
                    <span className="text-purple-400 text-xs bg-purple-900/40 px-2 py-0.5 rounded-full">+1000 Great Minds</span>
                  )}
                  {player.round.bamboozle_count > 0 && (
                    <span className="text-orange-400 text-xs bg-orange-900/40 px-2 py-0.5 rounded-full">
                      +{player.round.bamboozle_count * 250} Bamboozle
                    </span>
                  )}
                </div>
                <span className="text-yellow-400 font-black text-lg shrink-0">{player.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Individual reveal card ───────────────────────────────────────────────────

interface RevealCardProps {
  option: AugmentedOption
  textVisible: boolean
  authorVisible: boolean
  isMyLie: boolean
  isBatch?: boolean
}

function RevealCard({ option, textVisible, authorVisible, isMyLie, isBatch }: RevealCardProps) {
  const isTruth = option.is_truth
  const truthRevealed = isTruth && authorVisible

  if (!textVisible) {
    return (
      <div className="bg-indigo-800/30 border-2 border-indigo-800 rounded-xl px-5 py-4 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-indigo-700 animate-pulse" />
        <div className="h-4 bg-indigo-700/50 rounded w-1/2 animate-pulse" />
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden transition-all duration-500 ${
        truthRevealed
          ? 'border-green-500 bg-green-900/40'
          : isBatch
          ? 'border-yellow-500/50 bg-indigo-800/60'
          : 'border-indigo-600 bg-indigo-800/60'
      }`}
    >
      {/* Answer text row */}
      <div className="px-5 py-3 flex items-center justify-between gap-3">
        <span className={`text-xl font-black ${truthRevealed ? 'text-green-300' : 'text-white'}`}>
          {option.text}
          {truthRevealed && <span className="ml-2 text-green-400 text-sm font-bold">✓ THE TRUTH</span>}
        </span>
        {option.voteCount > 0 && (
          <span className="shrink-0 text-yellow-400 font-bold text-sm">
            {option.voteCount} vote{option.voteCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Author + voters — revealed on second step */}
      {authorVisible && (
        <div className="px-5 pb-3 border-t border-indigo-700/50 pt-2 space-y-1 animate-fade-in">
          {/* Author */}
          {!isTruth && (
            <p className="text-sm">
              <span className="text-indigo-400">Written by </span>
              <span className={`font-bold ${isMyLie ? 'text-yellow-400' : 'text-white'}`}>
                {isMyLie ? 'you' : (option.author_display_name ?? 'someone')}
                {isMyLie && ' 😏'}
              </span>
            </p>
          )}
          {/* Voters */}
          {option.voterNames.length > 0 ? (
            <p className="text-sm">
              {isTruth ? (
                <>
                  <span className="text-indigo-400">Spotted by </span>
                  <span className="text-green-400 font-bold">{option.voterNames.join(', ')}</span>
                </>
              ) : (
                <>
                  <span className="text-indigo-400">Fooled </span>
                  <span className="text-orange-400 font-bold">{option.voterNames.join(', ')}</span>
                </>
              )}
            </p>
          ) : (
            !isTruth && <p className="text-indigo-600 text-xs">Nobody was fooled</p>
          )}
        </div>
      )}
    </div>
  )
}
