import React, { useState, useEffect, useMemo } from 'react'
import { useGame } from '../context/GameContext'
import { DebuffType, GameState, VoteOption } from '@shared/types'
import { FUNNY_BONUS, DEBUFF_NAMES, DEBUFF_DESCRIPTIONS, CHARACTER_EXCLUDE_OPTIONS } from '@shared/constants'

const STEP_DURATION = 2200 // ms between reveal steps

interface AugmentedOption extends VoteOption {
  voteCount: number
  voterNames: string[]
  funnyCount: number
}

export default function ResolutionScreen() {
  const { gameState, mySessionId, emit } = useGame()
  const [step, setStep] = useState(0)
  const [debuffType, setDebuffType] = useState<DebuffType | null>(null)
  const [debuffChar, setDebuffChar] = useState<string | null>(null)
  const [debuffTarget, setDebuffTarget] = useState<string | null>(null)

  if (!gameState || !gameState.current_fact) return null

  const factParts = gameState.current_fact.fact_template.split('_______')

  // Build augmented options with voter info
  const augmented: AugmentedOption[] = useMemo(() => {
    return gameState.vote_options.map((opt) => {
      const voterNames = gameState.players
        .filter((p) => p.round.voted_for_id === opt.option_id)
        .map((p) => p.display_name)
      return { ...opt, voteCount: voterNames.length, voterNames, funnyCount: opt.funny_voter_session_ids.length }
    })
  }, [gameState.vote_options, gameState.players])

  // Sort: lies ascending by votes, truth always last
  const lies = useMemo(
    () => augmented.filter((o) => !o.is_truth).sort((a, b) => a.voteCount - b.voteCount),
    [augmented]
  )
  const truth = useMemo(() => augmented.find((o) => o.is_truth) ?? null, [augmented])

  // Random position for truth within the final batch — re-randomized each round
  const truthBatchPosition = useMemo(
    () => Math.floor(Math.random() * 3),
    [gameState.round_number]
  )

  // Split into normal (one-by-one) and batch (revealed together)
  const normalItems: AugmentedOption[] = useMemo(() => {
    if (!truth) return lies
    if (lies.length >= 2) return lies.slice(0, lies.length - 2)
    return lies
  }, [lies, truth])

  const batchItems: AugmentedOption[] = useMemo(() => {
    if (!truth) return []
    if (lies.length >= 2) {
      const twoLies = lies.slice(lies.length - 2)
      const result: AugmentedOption[] = [...twoLies]
      result.splice(truthBatchPosition, 0, truth)
      return result
    }
    return [truth]
  }, [lies, truth, truthBatchPosition])

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

  const isMyOption = (opt: AugmentedOption) =>
    opt.author_session_id === mySessionId ||
    opt.co_author_session_ids.includes(mySessionId ?? '')

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
            mySessionId={mySessionId}
            onFunnyVote={() => emit('SUBMIT_FUNNY_VOTE', { option_id: opt.option_id })}
            hasGivenFunnyVote={mySessionId ? opt.funny_voter_session_ids.includes(mySessionId) : false}
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
            mySessionId={mySessionId}
            isBatch={lies.length >= 2}
            onFunnyVote={() => emit('SUBMIT_FUNNY_VOTE', { option_id: opt.option_id })}
            hasGivenFunnyVote={mySessionId ? opt.funny_voter_session_ids.includes(mySessionId) : false}
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

      {/* Debuff section — only when debuffs are enabled and there's an award this round */}
      {truthRevealed && gameState.debuffs_enabled && gameState.debuff_award && (
        <DebuffSection
          gameState={gameState}
          mySessionId={mySessionId}
          debuffType={debuffType}
          setDebuffType={(t) => { setDebuffType(t); setDebuffChar(null); }}
          debuffChar={debuffChar}
          setDebuffChar={setDebuffChar}
          debuffTarget={debuffTarget}
          setDebuffTarget={setDebuffTarget}
          onSubmit={() => {
            if (!debuffType || !debuffTarget) return
            const payload: Record<string, string> = { debuff_type: debuffType, target_session_id: debuffTarget }
            if (debuffChar) payload.excluded_character = debuffChar
            emit('SUBMIT_DEBUFF', payload)
          }}
        />
      )}
    </div>
  )
}

// ─── Debuff section ───────────────────────────────────────────────────────────

interface DebuffSectionProps {
  gameState: GameState
  mySessionId: string | null
  debuffType: DebuffType | null
  setDebuffType: (t: DebuffType) => void
  debuffChar: string | null
  setDebuffChar: (c: string) => void
  debuffTarget: string | null
  setDebuffTarget: (id: string) => void
  onSubmit: () => void
}

function DebuffSection({ gameState, mySessionId, debuffType, setDebuffType, debuffChar, setDebuffChar, debuffTarget, setDebuffTarget, onSubmit }: DebuffSectionProps) {
  const lang = gameState.language ?? 'en'
  const names = DEBUFF_NAMES[lang] ?? DEBUFF_NAMES['en']
  const descs = DEBUFF_DESCRIPTIONS[lang] ?? DEBUFF_DESCRIPTIONS['en']
  const charOptions = CHARACTER_EXCLUDE_OPTIONS[lang] ?? CHARACTER_EXCLUDE_OPTIONS['en']
  const award = gameState.debuff_award!

  const amWinner = mySessionId === award.winner_session_id
  const pending = award.pending_debuff

  const allDebuffs: DebuffType[] = [DebuffType.TIME_CUTOFF, DebuffType.FOG, DebuffType.SCRAMBLE, DebuffType.CHARACTER_EXCLUDE]
  const eligibleTargets = award.eligible_targets

  const canSubmit = debuffType !== null && debuffTarget !== null &&
    (debuffType !== DebuffType.CHARACTER_EXCLUDE || debuffChar !== null)

  if (pending) {
    // Debuff already chosen — show result to everyone
    return (
      <div className="w-full max-w-lg mt-6 bg-red-900/40 border-2 border-red-500 rounded-2xl p-5 text-center">
        <p className="text-red-300 text-2xl font-black mb-1">💀 Debuff Incoming!</p>
        <p className="text-white text-lg font-semibold">
          {pending.target_display_name} faces <span className="text-yellow-400">{names[pending.type]}</span> next round
          {pending.excluded_character && (
            <span className="ml-1 text-red-300">— forbidden: <span className="font-black">{pending.excluded_character}</span></span>
          )}
        </p>
        <p className="text-red-400 text-sm mt-1">{descs[pending.type]}</p>
      </div>
    )
  }

  if (!amWinner) {
    // Waiting banner for non-winners
    return (
      <div className="w-full max-w-lg mt-6 bg-indigo-800/60 border border-indigo-500 rounded-2xl p-4 text-center">
        <p className="text-yellow-400 font-bold text-lg animate-pulse">
          ⚡ {award.winner_display_name} is choosing a debuff...
        </p>
        <p className="text-indigo-400 text-sm mt-1">
          {lang === 'he' ? 'הם מתכננים נקמה לסיבוב הבא' : 'Planning their revenge for next round'}
        </p>
      </div>
    )
  }

  // Winner's debuff picker
  return (
    <div className="w-full max-w-lg mt-6 bg-indigo-900/80 border-2 border-yellow-500 rounded-2xl p-5 space-y-4">
      <p className="text-yellow-400 font-black text-xl text-center">
        ⚡ {lang === 'he' ? 'בחר דבאף!' : 'Choose a Debuff!'}
      </p>

      {/* Debuff type picker */}
      <div>
        <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide mb-2">
          {lang === 'he' ? 'סוג הדבאף' : 'Debuff Type'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {allDebuffs.map((type) => (
            <button
              key={type}
              onClick={() => setDebuffType(type)}
              className={`p-3 rounded-xl border-2 text-left transition-all active:scale-95 ${
                debuffType === type
                  ? 'border-yellow-400 bg-yellow-900/40'
                  : 'border-indigo-600 bg-indigo-800/60 hover:border-indigo-500'
              }`}
            >
              <span className="block text-white font-black">{names[type]}</span>
              <span className="block text-indigo-400 text-xs mt-0.5">{descs[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Character picker — only for Thanos */}
      {debuffType === DebuffType.CHARACTER_EXCLUDE && (
        <div>
          <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide mb-2">
            {lang === 'he' ? 'בחר אות אסורה' : 'Choose the Forbidden Letter'}
          </p>
          <div className="flex flex-wrap gap-2">
            {charOptions.map((ch) => (
              <button
                key={ch}
                onClick={() => setDebuffChar(ch)}
                className={`w-10 h-10 rounded-lg border-2 font-black text-lg transition-all active:scale-95 ${
                  debuffChar === ch
                    ? 'border-yellow-400 bg-yellow-900/40 text-yellow-400'
                    : 'border-indigo-600 bg-indigo-800/60 text-white hover:border-indigo-500'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Target picker */}
      <div>
        <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide mb-2">
          {lang === 'he' ? 'בחר קורבן' : 'Choose Your Victim'}
        </p>
        <div className="space-y-2">
          {eligibleTargets.map((target) => (
            <button
              key={target.session_id}
              onClick={() => setDebuffTarget(target.session_id)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all active:scale-95 ${
                debuffTarget === target.session_id
                  ? 'border-red-400 bg-red-900/30'
                  : 'border-indigo-600 bg-indigo-800/60 hover:border-indigo-500'
              }`}
            >
              <span className="text-white font-semibold">{target.display_name}</span>
              {debuffTarget === target.session_id && <span className="text-red-400 font-bold">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full py-3 bg-red-500 hover:bg-red-400 disabled:bg-indigo-700 disabled:text-indigo-500 disabled:cursor-not-allowed text-white font-black text-lg rounded-xl transition-all active:scale-95"
      >
        {lang === 'he' ? '💀 הפעל דבאף!' : '💀 Unleash the Debuff!'}
      </button>
    </div>
  )
}

// ─── Author list (handles single and co-authored answers) ────────────────────

function AuthorList({ option, mySessionId, isMyLie }: {
  option: AugmentedOption
  mySessionId: string | null
  isMyLie: boolean
}) {
  const allAuthors = [
    { sessionId: option.author_session_id, name: option.author_display_name ?? 'someone' },
    ...option.co_author_session_ids.map((sid, i) => ({
      sessionId: sid,
      name: option.co_author_display_names[i] ?? 'someone',
    })),
  ]

  const labels = allAuthors.map(({ sessionId, name }) =>
    sessionId === mySessionId ? 'you' : name
  )

  return (
    <>
      <span className={`font-bold ${isMyLie ? 'text-yellow-400' : 'text-white'}`}>
        {labels.join(', ')}
      </span>
      {isMyLie && ' 😏'}
    </>
  )
}

// ─── Individual reveal card ───────────────────────────────────────────────────

interface RevealCardProps {
  option: AugmentedOption
  textVisible: boolean
  authorVisible: boolean
  isMyLie: boolean
  mySessionId: string | null
  isBatch?: boolean
  onFunnyVote: () => void
  hasGivenFunnyVote: boolean
}

function RevealCard({ option, textVisible, authorVisible, isMyLie, mySessionId, isBatch, onFunnyVote, hasGivenFunnyVote }: RevealCardProps) {
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
              <AuthorList option={option} mySessionId={mySessionId} isMyLie={isMyLie} />
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
          {/* Funny vote — only for lies written by someone else */}
          {!isTruth && !isMyLie && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onFunnyVote}
                disabled={hasGivenFunnyVote}
                className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border transition-all ${
                  hasGivenFunnyVote
                    ? 'border-yellow-500 bg-yellow-900/40 text-yellow-300 cursor-default'
                    : 'border-indigo-600 bg-indigo-800/40 text-indigo-300 hover:border-yellow-500 hover:text-yellow-300 hover:bg-yellow-900/20 active:scale-95'
                }`}
              >
                <span>😂</span>
                <span>{hasGivenFunnyVote ? 'Funny!' : 'Funny'}</span>
              </button>
              {option.funnyCount > 0 && (
                <span className="text-yellow-400 text-xs font-semibold">
                  {option.funnyCount} ×{FUNNY_BONUS}pts
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
