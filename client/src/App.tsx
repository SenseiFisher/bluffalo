import React from 'react'
import { GameProvider, useGame } from './context/GameContext'
import { GamePhase } from '@shared/types'
import JoinScreen from './screens/JoinScreen'
import LobbyScreen from './screens/LobbyScreen'
import IntroScreen from './screens/IntroScreen'
import { getClientGame } from './games/registry'
import './games/bluffalo/index' // registers Bluffalo plugin (side-effect)
import './games/pandamonium/index' // registers Pandamonium plugin (side-effect)

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

  if (gameState.phase === GamePhase.LOBBY) {
    return <LobbyScreen />
  }

  if (gameState.phase === GamePhase.INTRO) {
    return <IntroScreen />
  }

  const plugin = getClientGame(gameState.game_type)
  if (!plugin) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center text-white">
        Unknown game: {gameState.game_type}
      </div>
    )
  }

  return <plugin.GameRouter />
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
