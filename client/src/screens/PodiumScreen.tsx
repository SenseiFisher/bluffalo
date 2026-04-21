import React, { useEffect, useState, useRef } from 'react'
import { useGame } from '../context/GameContext'

interface ConfettiPiece {
  id: number
  left: string
  color: string
  delay: string
  duration: string
  size: number
}

function generateConfetti(count: number): ConfettiPiece[] {
  const colors = ['#fbbf24', '#a78bfa', '#34d399', '#f87171', '#60a5fa', '#fb923c']
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: `${Math.random() * 3}s`,
    duration: `${2 + Math.random() * 3}s`,
    size: 6 + Math.floor(Math.random() * 10),
  }))
}

export default function PodiumScreen() {
  const { gameState, mySessionId, emit } = useGame()
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([])
  const clearLocalStorage = () => {
    try { localStorage.removeItem('bluffalo_session') } catch {}
  }

  useEffect(() => {
    setConfetti(generateConfetti(60))
    return () => setConfetti([])
  }, [])

  if (!gameState) return null

  const isRoomMaster = mySessionId === gameState.room_master_session_id

  const sortedPlayers = [...gameState.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.deception_count !== a.deception_count) return b.deception_count - a.deception_count
    return 0
  })

  const top3 = sortedPlayers.slice(0, 3)
  const rest = sortedPlayers.slice(3)

  const podiumOrder = [1, 0, 2] // 2nd, 1st, 3rd visual order for podium effect
  const podiumHeights = ['h-32', 'h-24', 'h-16']
  const podiumColors = ['bg-yellow-400', 'bg-gray-500', 'bg-amber-700']
  const medalEmoji = ['🥇', '🥈', '🥉']

  const handlePlayAgain = () => {
    emit('PLAY_AGAIN', {})
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex flex-col items-center p-4 pt-8 overflow-hidden">
      {/* Confetti */}
      {confetti.map((piece) => (
        <div
          key={piece.id}
          className="confetti-piece pointer-events-none"
          style={{
            left: piece.left,
            backgroundColor: piece.color,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            width: piece.size,
            height: piece.size,
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
          }}
        />
      ))}

      {/* Title */}
      <h1 className="text-5xl font-black text-yellow-400 mb-2 tracking-tight">
        GAME OVER!
      </h1>
      <p className="text-indigo-300 mb-8 text-lg font-semibold">Final Results</p>

      {/* Podium — top 3 */}
      {top3.length > 0 && (
        <div className="w-full max-w-lg mb-8">
          <div className="flex items-end justify-center gap-2">
            {podiumOrder.map((rank) => {
              const player = top3[rank]
              if (!player) return <div key={rank} className="flex-1" />

              return (
                <div key={rank} className="flex-1 flex flex-col items-center">
                  {/* Name & score */}
                  <div className="text-center mb-2">
                    <span className="text-3xl">{medalEmoji[rank]}</span>
                    <p className="text-white font-black text-sm truncate max-w-[100px]">
                      {player.display_name}
                    </p>
                    <p className="text-yellow-400 font-black text-lg">{player.score}</p>
                    <p className="text-indigo-400 text-xs">
                      {player.deception_count} fools
                    </p>
                  </div>

                  {/* Podium block */}
                  <div
                    className={`w-full ${podiumHeights[rank]} ${podiumColors[rank]} rounded-t-lg flex items-start justify-center pt-2`}
                  >
                    <span className="text-white font-black text-2xl opacity-80">
                      {rank + 1}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full leaderboard */}
      {sortedPlayers.length > 0 && (
        <div className="w-full max-w-lg mb-6">
          <h3 className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-3">
            Final Standings
          </h3>
          <div className="space-y-2">
            {sortedPlayers.map((player, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                  idx === 0
                    ? 'bg-yellow-400/20 border-yellow-400'
                    : 'bg-indigo-800/40 border-indigo-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-black w-6 text-center ${
                      idx === 0
                        ? 'text-yellow-400'
                        : idx === 1
                        ? 'text-gray-300'
                        : idx === 2
                        ? 'text-amber-600'
                        : 'text-indigo-500'
                    }`}
                  >
                    {idx < 3 ? medalEmoji[idx] : `${idx + 1}.`}
                  </span>
                  <span className="text-white font-semibold">{player.display_name}</span>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 font-black text-lg">{player.score}</div>
                  <div className="text-indigo-400 text-xs">
                    {player.deception_count} players fooled
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Winner highlight */}
      {sortedPlayers.length > 0 && (
        <div className="w-full max-w-lg mb-6 bg-yellow-400/10 border border-yellow-400 rounded-2xl p-4 text-center">
          <p className="text-yellow-400 font-black text-xl">
            🏆 {sortedPlayers[0].display_name} wins with {sortedPlayers[0].score} points!
          </p>
          <p className="text-indigo-300 text-sm mt-1">
            Fooled {sortedPlayers[0].deception_count} player{sortedPlayers[0].deception_count !== 1 ? 's' : ''} throughout the game
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="w-full max-w-lg space-y-3">
        {isRoomMaster ? (
          <button
            onClick={handlePlayAgain}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-xl rounded-xl transition-all active:scale-95 shadow-lg"
          >
            Play Again
          </button>
        ) : (
          <div className="bg-indigo-800/40 border border-indigo-700 rounded-xl p-4 text-center">
            <p className="text-indigo-300 text-sm">Waiting for host to start another game...</p>
          </div>
        )}

        <button
          onClick={() => {
            clearLocalStorage()
            window.location.reload()
          }}
          className="w-full py-3 bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-lg rounded-xl transition-all active:scale-95"
        >
          Leave Game
        </button>
      </div>
    </div>
  )
}
