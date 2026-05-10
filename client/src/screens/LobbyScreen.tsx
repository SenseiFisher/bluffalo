import React, { useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { useUltrasonicEmitter } from '../hooks/useUltrasonicEmitter'
import { getClientGame } from '../games/registry'
import { useState } from 'react'

export default function LobbyScreen() {
  const { gameState, mySessionId, socket, emit, lastError, clearError, leaveRoom } = useGame()
  const [broadcasting, setBroadcasting] = useState(true)

  useEffect(() => {
    history.pushState({ lobby: true }, '')
    const onPop = () => leaveRoom()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [leaveRoom])

  useUltrasonicEmitter(gameState?.room_code ?? '', broadcasting)

  if (!gameState) return null

  const connectedPlayers = gameState.players.filter((p) => p.is_connected)
  const canStart = connectedPlayers.length >= 2
  const isRoomMaster = mySessionId === (gameState.room_master_session_id ?? '')
  const plugin = getClientGame(gameState.game_type)
  const roomUrl = window.location.origin

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8">
      {/* Title */}
      <h1 className="text-5xl font-black text-yellow-400 mb-2 tracking-tight">
        BL
        <span className="relative inline-block">
          <img
            src="/icon.png"
            alt=""
            className="absolute -top-10 left-1/2 -translate-x-1/2 h-11 drop-shadow-lg pointer-events-none"
          />
          U
        </span>
        FFALO
      </h1>
      <p className="text-indigo-300 mb-8 text-sm">Waiting for players to join...</p>

      {/* Room Code */}
      <div className="bg-indigo-800/60 border border-indigo-600 rounded-2xl p-6 mb-6 text-center w-full max-w-md shadow-xl">
        <p className="text-indigo-300 text-sm font-semibold uppercase tracking-widest mb-2">Room Code</p>
        <div className="text-6xl font-black text-yellow-400 tracking-widest letter-spacing-8">
          {gameState.room_code}
        </div>
        <p className="text-indigo-400 text-xs mt-3">
          Share this code with friends at <span className="text-indigo-300 font-mono">{roomUrl}</span>
        </p>
        {isRoomMaster && (
          <button
            onClick={() => setBroadcasting(b => !b)}
            className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all active:scale-95 ${
              broadcasting
                ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500'
                : 'bg-indigo-800 text-indigo-500 border border-indigo-700 hover:border-indigo-500 hover:text-indigo-300'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${broadcasting ? 'bg-indigo-400 animate-pulse' : 'bg-indigo-600'}`} />
            {broadcasting ? 'Broadcasting' : 'Broadcast'}
          </button>
        )}
      </div>

      {/* Players */}
      <div className="w-full max-w-md mb-6">
        <h2 className="text-indigo-300 text-sm font-semibold uppercase tracking-widest mb-3">
          Players ({connectedPlayers.length}/{gameState.players.length})
        </h2>
        <div className="space-y-2">
          {gameState.players.map((player, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between bg-indigo-800/60 border rounded-xl px-4 py-3 ${
                player.is_connected ? 'border-indigo-600' : 'border-indigo-800 opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    player.is_connected ? 'bg-green-400' : 'bg-gray-500'
                  }`}
                />
                <span className="text-white font-semibold">{player.display_name}</span>
                {gameState.room_master_session_id && idx === 0 && isRoomMaster && (
                  <span className="text-yellow-400 text-xs font-bold bg-yellow-400/10 px-2 py-0.5 rounded-full">
                    HOST
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-indigo-400 text-xs">
                  {player.is_connected ? 'Connected' : 'Disconnected'}
                </span>
                {isRoomMaster && player.id !== socket?.id && (
                  <button
                    onClick={() => emit('KICK_PLAYER', { player_id: player.id })}
                    className="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-0.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 transition-colors"
                  >
                    Kick
                  </button>
                )}
              </div>
            </div>
          ))}

          {gameState.players.length === 0 && (
            <div className="text-indigo-400 text-center py-4">
              No players yet. Share the room code!
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {lastError && (
        <div className="w-full max-w-md mb-4 bg-red-900/50 border border-red-500 text-red-300 rounded-xl px-4 py-3 text-sm">
          {lastError.message}
        </div>
      )}

      {/* Game settings (host) or waiting message (guest) */}
      {isRoomMaster ? (
        plugin ? (
          <plugin.LobbySettings
            canStart={canStart}
            connectedPlayerCount={connectedPlayers.length}
          />
        ) : (
          <div className="w-full max-w-md text-indigo-400 text-center py-4">
            Unknown game type: {gameState.game_type}
          </div>
        )
      ) : (
        <div className="w-full max-w-md">
          <div className="bg-indigo-800/40 border border-indigo-700 rounded-xl p-5 text-center">
            <div className="text-indigo-300 animate-pulse text-lg">
              Waiting for host to start the game...
            </div>
            <p className="text-indigo-500 text-sm mt-2">
              {connectedPlayers.length} player{connectedPlayers.length !== 1 ? 's' : ''} connected
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
