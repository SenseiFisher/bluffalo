import React, { useState } from 'react'
import { useGame } from '../context/GameContext'
import { useTimer } from '../hooks/useTimer'

export default function IntroScreen() {
  const { gameState, mySessionId, emit } = useGame()
  const timer = useTimer(gameState?.timer_ends_at ?? null)
  const [skipped, setSkipped] = useState(false)

  if (!gameState) return null

  const lang = gameState.language ?? 'en'
  const isHe = lang === 'he'
  const introText = gameState.intro_text?.[lang as 'en' | 'he'] ?? ''

  const connectedPlayers = gameState.players.filter((p) => p.is_connected)
  const skippedCount = gameState.intro_skipped_by?.length ?? 0
  const totalCount = connectedPlayers.length
  const iHaveSkipped = skipped || (mySessionId !== null && gameState.intro_skipped_by?.includes(mySessionId))

  const handleSkip = () => {
    if (iHaveSkipped) return
    setSkipped(true)
    emit('SKIP_INTRO', {})
  }

  return (
    <div className="min-h-screen bg-indigo-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="text-yellow-400 font-black text-4xl mb-1">
            {isHe ? 'איך משחקים' : 'How to Play'}
          </div>
          <div className="text-indigo-400 text-sm">
            {isHe ? 'המשחק יתחיל בעוד' : 'Game starts in'}{' '}
            <span className="text-yellow-300 font-bold">{timer}s</span>
          </div>
        </div>

        <div
          dir={isHe ? 'rtl' : 'ltr'}
          className="bg-indigo-800/60 border border-indigo-600 rounded-2xl p-6"
        >
          <p className="text-white text-lg leading-relaxed">{introText}</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleSkip}
            disabled={iHaveSkipped}
            className={`w-full py-4 font-black text-xl rounded-xl transition-all duration-150 active:scale-95 shadow-lg ${
              iHaveSkipped
                ? 'bg-indigo-700 text-indigo-400 cursor-not-allowed'
                : 'bg-yellow-400 hover:bg-yellow-300 text-indigo-950'
            }`}
          >
            {iHaveSkipped
              ? isHe ? 'ממתין לשאר...' : 'Waiting for others...'
              : isHe ? 'דלג על ההסבר' : 'Skip Intro'}
          </button>

          {skippedCount > 0 && (
            <div className="text-indigo-400 text-sm">
              {skippedCount}/{totalCount}{' '}
              {isHe ? 'שחקנים דילגו' : 'player(s) skipped'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
