import React, { useState } from 'react'
import { useGame } from '../../context/GameContext'
import type { LobbySettingsProps } from '../registry'
import { PM_MIN_PLAYERS, PM_MIN_ROUNDS, PM_MAX_ROUNDS } from '@shared/constants'

const TIMER_PRESETS = [30, 45, 60, 90]
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
] as const

export default function PandamoniumLobbySettings({ canStart: frameworkCanStart, connectedPlayerCount }: LobbySettingsProps) {
  const { emit, clearError } = useGame()
  const [totalRounds, setTotalRounds] = useState(5)
  const [timerSeconds, setTimerSeconds] = useState(60)
  const [language, setLanguage] = useState<'en' | 'he'>('he')
  const [introEnabled, setIntroEnabled] = useState(true)

  const canStart = frameworkCanStart && connectedPlayerCount >= PM_MIN_PLAYERS
  const playersNeeded = Math.max(0, PM_MIN_PLAYERS - connectedPlayerCount)

  const handleStart = () => {
    clearError()
    emit('START_GAME', {
      total_rounds: totalRounds,
      prompt_timer_seconds: timerSeconds,
      language,
      intro_enabled: introEnabled,
    })
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {/* Rounds */}
      <div className="bg-green-800/60 border border-green-600 rounded-xl p-4">
        <label className="block text-green-300 text-sm font-semibold mb-3 uppercase tracking-wide">
          Number of Rounds
        </label>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTotalRounds(Math.max(PM_MIN_ROUNDS, totalRounds - 1))}
            className="w-10 h-10 bg-green-700 hover:bg-green-600 rounded-lg text-white font-bold text-xl transition-colors active:scale-95"
          >
            −
          </button>
          <span className="text-yellow-400 font-black text-3xl flex-1 text-center">{totalRounds}</span>
          <button
            onClick={() => setTotalRounds(Math.min(PM_MAX_ROUNDS, totalRounds + 1))}
            className="w-10 h-10 bg-green-700 hover:bg-green-600 rounded-lg text-white font-bold text-xl transition-colors active:scale-95"
          >
            +
          </button>
        </div>
        <p className="text-green-400 text-xs text-center mt-2">
          Min {PM_MIN_ROUNDS} · Max {PM_MAX_ROUNDS} · Last round is Total Pandamonium
        </p>
      </div>

      {/* Timer */}
      <div className="bg-green-800/60 border border-green-600 rounded-xl p-4">
        <label className="block text-green-300 text-sm font-semibold mb-3 uppercase tracking-wide">
          Answer Time
        </label>
        <div className="grid grid-cols-4 gap-2">
          {TIMER_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => setTimerSeconds(s)}
              className={`py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${
                timerSeconds === s
                  ? 'bg-yellow-400 text-green-950'
                  : 'bg-green-700 hover:bg-green-600 text-white'
              }`}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="bg-green-800/60 border border-green-600 rounded-xl p-4">
        <label className="block text-green-300 text-sm font-semibold mb-3 uppercase tracking-wide">
          Language
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={`py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${
                language === l.code
                  ? 'bg-yellow-400 text-green-950'
                  : 'bg-green-700 hover:bg-green-600 text-white'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Intro toggle */}
      <div className="bg-green-800/60 border border-green-600 rounded-xl p-4">
        <label
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIntroEnabled(!introEnabled)}
        >
          <div>
            <span className="block text-green-300 text-sm font-semibold uppercase tracking-wide">
              {language === 'he' ? 'הסבר משחק' : 'Game Intro'}
            </span>
            <span className="block text-green-400 text-xs mt-1">
              {language === 'he'
                ? 'סקירה קצרה של הכללים לפני תחילת המשחק'
                : 'A 1-minute rules overview when the game starts'}
            </span>
          </div>
          <div
            className={`w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 relative ${
              introEnabled ? 'bg-yellow-400' : 'bg-green-700'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                introEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </div>
        </label>
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-green-700 disabled:text-green-400 disabled:cursor-not-allowed text-green-950 font-black text-xl rounded-xl transition-all duration-150 active:scale-95 shadow-lg"
      >
        {canStart
          ? `Start Game (${totalRounds} rounds)`
          : playersNeeded > 0
          ? `Need ${playersNeeded} more player${playersNeeded !== 1 ? 's' : ''} (min ${PM_MIN_PLAYERS})`
          : 'Waiting...'}
      </button>
    </div>
  )
}
