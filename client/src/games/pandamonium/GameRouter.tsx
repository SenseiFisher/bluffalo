import React from 'react'
import { useGame } from '../../context/GameContext'
import { GamePhase } from '@shared/types'
import WritingScreen from './screens/WritingScreen'
import MatchupScreen from './screens/MatchupScreen'
import FinalWritingScreen from './screens/FinalWritingScreen'
import FinalRevealScreen from './screens/FinalRevealScreen'
import PodiumScreen from './screens/PodiumScreen'

export default function PandamoniumGameRouter() {
  const { gameState } = useGame()

  switch (gameState?.phase) {
    case GamePhase.PM_WRITING:        return <WritingScreen />
    case GamePhase.PM_MATCHUP:        return <MatchupScreen />
    case GamePhase.PM_MATCHUP_RESULT: return <MatchupScreen />
    case GamePhase.PM_FINAL_WRITING:  return <FinalWritingScreen />
    case GamePhase.PM_FINAL_REVEAL:   return <FinalRevealScreen />
    case GamePhase.PODIUM:            return <PodiumScreen />
    default:                          return null
  }
}
