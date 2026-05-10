import React, { useState } from 'react'
import { useGame } from '../../../context/GameContext'
import { useTimer } from '../../../hooks/useTimer'

function PromptDisplay({ text, lang }: { text: string; lang: string }) {
  const parts = text.split('_______')
  return (
    <p className="text-white text-lg font-semibold leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {parts[0]}
      <span className="inline-block bg-green-800 border-b-2 border-green-400 px-3 py-0.5 mx-1 rounded min-w-[6rem] text-center">
        &nbsp;
      </span>
      {parts[1] ?? ''}
    </p>
  )
}

export default function WritingScreen() {
  const { gameState, mySessionId, emit, lastError, clearError } = useGame()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({})
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)

  if (!gameState || !gameState.pm_matchups) return null

  const lang = gameState.language ?? 'en'
  const myMatchups = gameState.pm_matchups.filter(
    (m) =>
      m.player_a_session_id === mySessionId ||
      m.player_b_session_id === mySessionId
  )

  const handleChange = (matchupId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [matchupId]: value.slice(0, 50) }))
  }

  const handleSubmit = (matchupId: string) => {
    const text = (answers[matchupId] ?? '').trim()
    if (!text) return
    clearError()
    emit('PM_SUBMIT_ANSWER', { matchup_id: matchupId, answer: text })
    setSubmitted((prev) => ({ ...prev, [matchupId]: true }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, matchupId: string) => {
    if (e.key === 'Enter') handleSubmit(matchupId)
  }

  const totalAnswersNeeded = gameState.pm_matchups.length * 2
  const totalSubmitted = gameState.pm_matchups.reduce(
    (acc, m) => acc + (m.player_a_submitted ? 1 : 0) + (m.player_b_submitted ? 1 : 0),
    0
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-green-950 flex flex-col items-center p-4 pt-8">
      {/* Header */}
      <div className="flex justify-between items-center w-full max-w-lg mb-6">
        <div className="text-green-300 text-sm font-semibold">
          Round {gameState.round_number} of {gameState.total_rounds}
          {gameState.is_final_round && (
            <span className="ml-2 text-yellow-400 font-bold">★ FINAL</span>
          )}
        </div>
        <div className={`text-2xl font-black ${timeRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
          {timeRemaining}s
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-3xl font-black text-white">Fill in the Blank!</h2>
        <p className="text-green-300 mt-1 text-sm">Write your funniest answer for each prompt</p>
      </div>

      {/* Prompts */}
      <div className="w-full max-w-lg space-y-6">
        {myMatchups.map((matchup, idx) => {
          const isA = matchup.player_a_session_id === mySessionId
          const alreadySubmitted = isA ? matchup.player_a_submitted : matchup.player_b_submitted
          const localSubmitted = submitted[matchup.matchup_id] || alreadySubmitted
          const answer = answers[matchup.matchup_id] ?? ''

          return (
            <div key={matchup.matchup_id} className="bg-green-800/50 border border-green-600 rounded-2xl p-5 shadow-xl">
              <p className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-3">
                Prompt {idx + 1}
              </p>
              <div className="mb-4">
                <PromptDisplay text={matchup.prompt_text} lang={lang} />
              </div>

              {!localSubmitted ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => handleChange(matchup.matchup_id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, matchup.matchup_id)}
                    maxLength={50}
                    placeholder="Type your funny answer..."
                    className="w-full px-4 py-3 bg-green-700 border border-green-500 focus:border-yellow-400 rounded-xl text-white placeholder-green-400 focus:outline-none transition-colors text-lg"
                    autoFocus={idx === 0}
                  />
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${answer.length >= 45 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {answer.length}/50
                    </span>
                    {lastError && idx === 0 && (
                      <span className="text-red-400 text-xs">{lastError.message}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleSubmit(matchup.matchup_id)}
                    disabled={!answer.trim()}
                    className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-green-700 disabled:text-green-400 disabled:cursor-not-allowed text-green-950 font-black text-lg rounded-xl transition-all active:scale-95"
                  >
                    Submit Answer
                  </button>
                </div>
              ) : (
                <div className="bg-green-900/60 border border-green-500 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-1">✓</div>
                  <p className="text-green-400 font-bold">Submitted!</p>
                  <p className="text-green-300 text-sm mt-1">Waiting for others...</p>
                </div>
              )}
            </div>
          )
        })}

        {myMatchups.length === 0 && (
          <div className="text-center text-green-400 py-8">
            <p>No prompts assigned. Waiting...</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-lg mt-6">
        <div className="flex justify-between text-green-400 text-xs mb-1">
          <span>Answers submitted</span>
          <span>{totalSubmitted}/{totalAnswersNeeded}</span>
        </div>
        <div className="w-full bg-green-800 rounded-full h-2">
          <div
            className="bg-yellow-400 rounded-full h-2 transition-all duration-500"
            style={{ width: totalAnswersNeeded > 0 ? `${(totalSubmitted / totalAnswersNeeded) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Leaderboard */}
      <div className="w-full max-w-lg mt-6">
        <h3 className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-2">Standings</h3>
        <div className="space-y-1">
          {[...gameState.players].sort((a, b) => b.score - a.score).map((player, idx) => (
            <div key={idx} className="flex items-center justify-between bg-green-800/40 rounded-lg px-3 py-1.5">
              <span className="text-green-300 text-sm flex items-center gap-1.5">
                <span className="text-green-500">{idx + 1}.</span>
                {player.display_name}
                {player.round.submitted_lie !== null && (
                  <span className="text-green-400 text-xs">✓</span>
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
