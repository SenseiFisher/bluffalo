import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

interface Props {
  factId: string
  roundNumber: number
}

export default function ReportButton({ factId, roundNumber }: Props) {
  const { emit } = useGame()
  const [hasReported, setHasReported] = useState(false)

  useEffect(() => { setHasReported(false) }, [roundNumber])

  const handleReport = () => {
    if (hasReported) return
    emit('REPORT_FACT', { fact_id: factId })
    setHasReported(true)
  }

  return (
    <button
      onClick={handleReport}
      disabled={hasReported}
      className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border transition-all ${
        hasReported
          ? 'border-red-500 bg-red-900/40 text-red-300 cursor-default'
          : 'border-indigo-600 bg-indigo-800/40 text-indigo-300 hover:border-red-500 hover:text-red-300 hover:bg-red-900/20 active:scale-95'
      }`}
    >
      <span>🚩</span>
      <span>{hasReported ? 'Reported' : 'Report'}</span>
    </button>
  )
}
