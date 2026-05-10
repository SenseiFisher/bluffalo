import React from 'react'
import { useGame } from '../../context/GameContext'
import { GamePhase } from '@shared/types'
import PromptScreen from './screens/PromptScreen'
import RevealScreen from './screens/RevealScreen'
import SelectionScreen from './screens/SelectionScreen'
import ResolutionScreen from './screens/ResolutionScreen'
import DebuffScreen from './screens/DebuffScreen'
import PodiumScreen from './screens/PodiumScreen'

export default function BluffaloGameRouter() {
  const { gameState } = useGame()

  switch (gameState?.phase) {
    case GamePhase.PROMPT:     return <PromptScreen />
    case GamePhase.REVEAL:     return <RevealScreen />
    case GamePhase.SELECTION:  return <SelectionScreen />
    case GamePhase.RESOLUTION: return <ResolutionScreen />
    case GamePhase.DEBUFF:     return <DebuffScreen />
    case GamePhase.PODIUM:     return <PodiumScreen />
    default:                   return null
  }
}
