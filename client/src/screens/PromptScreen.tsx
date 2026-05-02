import React, { useState, useMemo } from 'react'
import { useGame } from '../context/GameContext'
import { useTimer } from '../hooks/useTimer'
import { DebuffType } from '@shared/types'
import { DEBUFF_NAMES, DEBUFF_DESCRIPTIONS } from '@shared/constants'
import DebuffIcon from '../components/DebuffIcon'

function scrambleText(text: string): string {
  return text.split(' ').map((word) => {
    if (word.length <= 2) return word
    const inner = word.slice(1, -1).split('')
    for (let i = inner.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [inner[i], inner[j]] = [inner[j], inner[i]]
    }
    return word[0] + inner.join('') + word[word.length - 1]
  }).join(' ')
}

export default function PromptScreen() {
  const { gameState, mySessionId, emit, lastError, clearError } = useGame()
  const [lieText, setLieText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submittedText, setSubmittedText] = useState<string | null>(null)

  const imDebuffed = mySessionId !== null && gameState?.active_debuff_session_id === mySessionId
  const myDebuff = imDebuffed
    ? (gameState?.players.find((p) => p.active_debuff !== null)?.active_debuff ?? null)
    : null

  const effectiveTimerSeconds = (imDebuffed && myDebuff?.type === DebuffType.TIME_CUTOFF)
    ? Math.floor((gameState?.prompt_timer_seconds ?? 60) / 2)
    : (gameState?.prompt_timer_seconds ?? 60)

  // For TIME_CUTOFF: compute stable end time from phase start + halved duration
  const timerEndsAt = useMemo(() => {
    const serverEnd = gameState?.timer_ends_at ?? null
    if (!imDebuffed || myDebuff?.type !== DebuffType.TIME_CUTOFF || !serverEnd) return serverEnd
    const promptTimerMs = (gameState?.prompt_timer_seconds ?? 60) * 1000
    const phaseStart = serverEnd - promptTimerMs
    return phaseStart + effectiveTimerSeconds * 1000
  }, [gameState?.timer_ends_at, imDebuffed, myDebuff?.type, effectiveTimerSeconds, gameState?.prompt_timer_seconds])

  const timeRemaining = useTimer(timerEndsAt)
  const timeLocked = imDebuffed && myDebuff?.type === DebuffType.TIME_CUTOFF && timeRemaining <= 0

  if (!gameState || !gameState.current_fact) return null

  const lang = gameState.language ?? 'en'

  const submittedCount = gameState.players.filter(
    (p) => p.round.submitted_lie !== null
  ).length
  const totalPlayers = gameState.players.filter((p) => p.is_connected).length

  const rawFactTemplate = gameState.current_fact.fact_template
  const scrambledTemplate = useMemo(
    () => rawFactTemplate.split('_______').map(scrambleText).join('_______'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameState.round_number]
  )
  const factTemplate = (imDebuffed && myDebuff?.type === DebuffType.SCRAMBLE)
    ? scrambledTemplate
    : rawFactTemplate
  const parts = factTemplate.split('_______')

  const forbiddenChar = (imDebuffed && myDebuff?.type === DebuffType.CHARACTER_EXCLUDE)
    ? (myDebuff.excluded_character ?? null)
    : null

  const handleSubmit = () => {
    if (!lieText.trim() || timeLocked) return
    clearError()
    if (submittedText !== null) {
      emit('EDIT_LIE', { text: lieText.trim() })
    } else {
      emit('SUBMIT_LIE', { text: lieText.trim() })
    }
    setSubmittedText(lieText.trim())
    setSubmitted(true)
  }

  const handleLieChange = (value: string) => {
    if (forbiddenChar) {
      value = value.split('').filter((c) => c !== forbiddenChar).join('')
    }
    setLieText(value.slice(0, 50))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (forbiddenChar && e.key === forbiddenChar) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') handleSubmit()
  }

  const handleEdit = () => {
    setLieText(submittedText ?? '')
    setSubmitted(false)
  }

  const canEdit = submitted && submittedCount < totalPlayers

  const isFinalRound = gameState.is_final_round

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8">
      {/* Debuff banner — shown to the debuffed player */}
      {imDebuffed && myDebuff && (
        <div className="w-full max-w-lg mb-4 bg-red-900/60 border-2 border-red-500 rounded-xl px-4 py-3 text-center">
          <p className="text-red-300 font-black text-lg">
            <DebuffIcon type={myDebuff.type} className="w-6 h-6 mr-1 align-middle" /> {DEBUFF_NAMES[myDebuff.type]}
          </p>
          <p className="text-red-400 text-sm mt-0.5">{DEBUFF_DESCRIPTIONS[myDebuff.type]}</p>
        </div>
      )}

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

      {/* Fact Card — FOG applies blur here */}
      <div className="w-full max-w-lg bg-indigo-800/70 border border-indigo-600 rounded-2xl p-6 mb-6 shadow-xl">
        <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-3">
          Fill in the blank
        </p>
        <p
          className={`text-white text-xl font-semibold leading-relaxed select-none ${imDebuffed && myDebuff?.type === DebuffType.FOG ? 'blur-md' : ''}`}
          dir={gameState.language === 'he' ? 'rtl' : 'ltr'}
        >
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
              onChange={(e) => handleLieChange(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={50}
              disabled={timeLocked}
              placeholder="Type a convincing answer..."
              className={`w-full px-4 py-3 bg-indigo-700 border rounded-xl text-white placeholder-indigo-400 focus:outline-none transition-colors text-lg ${timeLocked ? 'border-red-500 opacity-50 cursor-not-allowed' : 'border-indigo-500 focus:border-yellow-400'}`}
              autoFocus
            />
            {forbiddenChar && (
              <p className="text-red-400 text-xs mt-1 font-semibold">
                ⛔ Forbidden letter: <span className="font-black">{forbiddenChar}</span>
              </p>
            )}
            {timeLocked && (
              <p className="text-red-400 text-xs mt-1 font-semibold">⏰ Time's up! You were too slow.</p>
            )}
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
            disabled={!lieText.trim() || timeLocked}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-indigo-700 disabled:text-indigo-400 disabled:cursor-not-allowed text-indigo-950 font-black text-xl rounded-xl transition-all active:scale-95 shadow-lg"
          >
            {submittedText !== null ? 'Update Answer' : 'Submit Answer'}
          </button>
        </div>
      ) : (
        <div className="w-full max-w-lg space-y-3">
          <div className="bg-green-900/40 border border-green-600 rounded-2xl p-6 text-center">
            <div className="text-5xl mb-3">✓</div>
            <p className="text-green-400 font-bold text-xl mb-1">Answer Submitted!</p>
            {submittedText && (
              <p className="text-white font-semibold text-lg mt-2 mb-1">"{submittedText}"</p>
            )}
            <p className="text-indigo-300 text-sm">
              Waiting for others to submit their answers...
            </p>
          </div>
          {canEdit && (
            <button
              onClick={handleEdit}
              className="w-full py-3 bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-base rounded-xl transition-all active:scale-95 border border-indigo-500"
            >
              Edit Answer
            </button>
          )}
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
                <span className="text-indigo-300 text-sm flex items-center gap-1.5">
                  <span className="text-indigo-500">{idx + 1}.</span>
                  {player.display_name}
                  {player.round.submitted_lie !== null && (
                    <span className="text-green-400 text-xs">✓</span>
                  )}
                  {player.active_debuff && (
                    <span className="text-red-400 text-xs bg-red-900/40 px-1.5 py-0.5 rounded-full font-semibold">
                      <DebuffIcon type={player.active_debuff.type} className="w-4 h-4 mr-0.5 align-middle" /> {DEBUFF_NAMES[player.active_debuff.type]}
                    </span>
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
