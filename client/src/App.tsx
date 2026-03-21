import React from 'react'
import { GameProvider, useGame } from './context/GameContext'
import { GamePhase } from '@shared/types'
import JoinScreen from './screens/JoinScreen'
import LobbyScreen from './screens/LobbyScreen'
import PromptScreen from './screens/PromptScreen'
import RevealScreen from './screens/RevealScreen'
import SelectionScreen from './screens/SelectionScreen'
import ResolutionScreen from './screens/ResolutionScreen'
import PodiumScreen from './screens/PodiumScreen'

function GameRouter() {
  const { gameState, isConnected } = useGame()

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-2xl font-bold mb-4">Connecting...</div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto"></div>
        </div>
      </div>
    )
  }

  if (!gameState) {
    return <JoinScreen />
  }

  switch (gameState.phase) {
    case GamePhase.LOBBY:
      return <LobbyScreen />
    case GamePhase.PROMPT:
      return <PromptScreen />
    case GamePhase.REVEAL:
      return <RevealScreen />
    case GamePhase.SELECTION:
      return <SelectionScreen />
    case GamePhase.RESOLUTION:
      return <ResolutionScreen />
    case GamePhase.PODIUM:
      return <PodiumScreen />
    default:
      return <JoinScreen />
  }
}

export default function App() {
  return (
    <GameProvider>
      <div className="min-h-screen bg-indigo-950 text-white">
        <GameRouter />
      </div>
    </GameProvider>
  )
}
