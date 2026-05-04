import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { DebuffType } from '@shared/types'
import { DEBUFF_NAMES, DEBUFF_DESCRIPTIONS, CHARACTER_EXCLUDE_OPTIONS, DEBUFF_TIMER_MS } from '@shared/constants'
import DebuffIcon from '../components/DebuffIcon'

export default function DebuffScreen() {
  const { gameState, mySessionId, emit } = useGame()
  const [debuffType, setDebuffType] = useState<DebuffType | null>(null)
  const [debuffChar, setDebuffChar] = useState<string | null>(null)
  const [debuffTarget, setDebuffTarget] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(DEBUFF_TIMER_MS / 1000)

  useEffect(() => {
    setDebuffType(null)
    setDebuffChar(null)
    setDebuffTarget(null)
  }, [gameState?.round_number])

  useEffect(() => {
    if (!gameState?.timer_ends_at) return
    const update = () => {
      const remaining = Math.max(0, Math.ceil((gameState.timer_ends_at! - Date.now()) / 1000))
      setTimeLeft(remaining)
    }
    update()
    const interval = setInterval(update, 200)
    return () => clearInterval(interval)
  }, [gameState?.timer_ends_at])

  if (!gameState?.debuff_award) return null

  const award = gameState.debuff_award
  const amWinner = mySessionId === award.winner_session_id
  const lang = gameState.language ?? 'en'
  const charOptions = CHARACTER_EXCLUDE_OPTIONS[lang] ?? CHARACTER_EXCLUDE_OPTIONS['en']
  const allDebuffs: DebuffType[] = [DebuffType.TIME_CUTOFF, DebuffType.FOG, DebuffType.SCRAMBLE, DebuffType.CHARACTER_EXCLUDE]
  const canSubmit = debuffType !== null && debuffTarget !== null &&
    (debuffType !== DebuffType.CHARACTER_EXCLUDE || debuffChar !== null)

  const handleSubmit = () => {
    if (!debuffType || !debuffTarget) return
    const payload: Record<string, string> = { debuff_type: debuffType, target_session_id: debuffTarget }
    if (debuffChar) payload.excluded_character = debuffChar
    emit('SUBMIT_DEBUFF', payload)
  }

  const timerPct = (timeLeft / (DEBUFF_TIMER_MS / 1000)) * 100
  const timerColor = timeLeft <= 3 ? 'text-red-400' : timeLeft <= 6 ? 'text-yellow-400' : 'text-indigo-300'

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-5">

        {/* Timer bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-indigo-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-yellow-400 rounded-full transition-all duration-200"
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <span className={`text-sm font-black w-6 text-right ${timerColor}`}>{timeLeft}</span>
        </div>

        {amWinner ? (
          /* ── Winner's picker ── */
          <div className="bg-indigo-900/80 border-2 border-yellow-500 rounded-2xl p-5 space-y-4">
            <p className="text-yellow-400 font-black text-2xl text-center">⚡ Choose a Debuff!</p>
            <p className="text-indigo-400 text-sm text-center -mt-2">You bamboozled the most — pick your revenge</p>

            {/* Debuff type */}
            <div>
              <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide mb-2">Debuff Type</p>
              <div className="grid grid-cols-2 gap-2">
                {allDebuffs.map((type) => (
                  <button
                    key={type}
                    onClick={() => { setDebuffType(type); setDebuffChar(null) }}
                    className={`p-3 rounded-xl border-2 text-left transition-all active:scale-95 ${
                      debuffType === type
                        ? 'border-yellow-400 bg-yellow-900/40'
                        : 'border-indigo-600 bg-indigo-800/60 hover:border-indigo-500'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-white font-black">
                      <DebuffIcon type={type} className="w-6 h-6" /> {DEBUFF_NAMES[type]}
                    </span>
                    <span className="block text-indigo-400 text-xs mt-0.5">{DEBUFF_DESCRIPTIONS[type]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Character picker */}
            {debuffType === DebuffType.CHARACTER_EXCLUDE && (
              <div>
                <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide mb-2">Choose the Forbidden Letter</p>
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
              <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide mb-2">Choose Your Victim</p>
              <div className="space-y-2">
                {award.eligible_targets.map((target) => (
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

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3 bg-red-500 hover:bg-red-400 disabled:bg-indigo-700 disabled:text-indigo-500 disabled:cursor-not-allowed text-white font-black text-lg rounded-xl transition-all active:scale-95"
            >
              💀 Unleash the Debuff!
            </button>
          </div>
        ) : (
          /* ── Waiting screen for non-winners ── */
          <div className="bg-indigo-900/60 border-2 border-indigo-600 rounded-2xl p-8 text-center space-y-3">
            <div className="text-5xl animate-bounce">⚡</div>
            <p className="text-yellow-400 font-black text-2xl">{award.winner_display_name}</p>
            <p className="text-indigo-300 text-lg">is plotting their revenge...</p>
            <p className="text-indigo-500 text-sm">They're choosing a debuff for next round</p>
          </div>
        )}
      </div>
    </div>
  )
}
