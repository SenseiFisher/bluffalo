import React, { useState } from 'react'
import { useGame } from '../../../context/GameContext'
import { useTimer } from '../../../hooks/useTimer'
import { PM_MEDALS_PER_PLAYER, PM_MEDAL_POINTS } from '@shared/constants'

export default function FinalRevealScreen() {
  const { gameState, mySessionId, emit } = useGame()
  const [myMedals, setMyMedals] = useState<Set<string>>(new Set())
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)

  if (!gameState) return null

  const cards = gameState.pm_final_answer_cards ?? []
  const medals = gameState.pm_medals ?? {}

  const getMedalCount = (sessionId: string) =>
    Object.values(medals).flat().filter((id) => id === sessionId).length

  const handleMedalToggle = (targetSessionId: string) => {
    if (targetSessionId === mySessionId) return
    const alreadyMedalled = myMedals.has(targetSessionId)
    if (!alreadyMedalled && myMedals.size >= PM_MEDALS_PER_PLAYER) return
    emit('PM_AWARD_MEDAL', { target_session_id: targetSessionId })
    setMyMedals((prev) => {
      const next = new Set(prev)
      if (alreadyMedalled) next.delete(targetSessionId)
      else next.add(targetSessionId)
      return next
    })
  }

  const lang = gameState.language ?? 'en'
  const parts = gameState.current_fact?.fact_template.split('_______') ?? ['', '']

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-green-950 flex flex-col items-center p-4 pt-8 pb-16">
      {/* Header */}
      <div className="flex justify-between items-center w-full max-w-lg mb-4">
        <h2 className="text-3xl font-black text-yellow-400">🐼 Total Pandamonium!</h2>
        <div className={`text-2xl font-black ${timeRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
          {timeRemaining}s
        </div>
      </div>

      <p className="text-green-300 text-sm mb-4 text-center">
        Award medals to your {PM_MEDALS_PER_PLAYER} favorites!
        <span className="text-green-500 ml-2">({myMedals.size}/{PM_MEDALS_PER_PLAYER} used)</span>
      </p>

      {/* Prompt */}
      <div className="w-full max-w-lg bg-green-800/60 border border-green-600 rounded-2xl p-4 mb-5 shadow-xl">
        <p className="text-white text-lg font-semibold leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
          {parts[0]}
          <span className="inline-block bg-green-700 border-b-2 border-yellow-400 px-3 py-0.5 mx-1 rounded min-w-[6rem] text-center">&nbsp;</span>
          {parts[1] ?? ''}
        </p>
      </div>

      {/* Answer cards */}
      <div className="w-full max-w-lg space-y-3 mb-6">
        {cards.map((card) => {
          const isMe = card.session_id === mySessionId
          const isMedalled = myMedals.has(card.session_id)
          const receivedMedals = getMedalCount(card.session_id)
          const canMedal = !isMe && (isMedalled || myMedals.size < PM_MEDALS_PER_PLAYER)

          return (
            <div
              key={card.session_id}
              className={`rounded-2xl border-2 p-4 transition-all duration-150 ${
                isMedalled
                  ? 'border-yellow-400 bg-yellow-400/10'
                  : isMe
                  ? 'border-green-700 bg-green-800/30 opacity-60'
                  : 'border-green-600 bg-green-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-white font-bold text-lg leading-snug mb-1">
                    "{card.answer}"
                  </p>
                  <p className="text-green-400 text-sm">— {card.display_name} {isMe ? '(you)' : ''}</p>
                  {receivedMedals > 0 && (
                    <p className="text-yellow-400 text-xs mt-1 font-semibold">
                      🏅 {receivedMedals} medal{receivedMedals !== 1 ? 's' : ''} · +{receivedMedals * PM_MEDAL_POINTS} pts
                    </p>
                  )}
                </div>
                {!isMe && (
                  <button
                    onClick={() => handleMedalToggle(card.session_id)}
                    disabled={!canMedal}
                    className={`shrink-0 w-12 h-12 rounded-full border-2 text-2xl transition-all active:scale-90 ${
                      isMedalled
                        ? 'border-yellow-400 bg-yellow-400/20 text-yellow-400'
                        : canMedal
                        ? 'border-green-500 bg-green-800/40 hover:border-yellow-400 text-green-400'
                        : 'border-green-800 bg-green-900/20 text-green-700 cursor-not-allowed'
                    }`}
                  >
                    🏅
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Standings */}
      <div className="w-full max-w-lg">
        <h3 className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-2">Current Standings</h3>
        <div className="space-y-1">
          {[...gameState.players].sort((a, b) => b.score - a.score).map((player, idx) => (
            <div key={idx} className="flex items-center justify-between bg-green-800/40 rounded-lg px-3 py-1.5">
              <span className="text-green-300 text-sm">
                <span className="text-green-500 mr-1">{idx + 1}.</span>
                {player.display_name}
              </span>
              <span className="text-yellow-400 font-bold text-sm">{player.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
