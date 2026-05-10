import React, { useEffect, useState } from 'react'
import { useGame } from '../../../context/GameContext'

interface ConfettiPiece {
  id: number
  left: string
  color: string
  delay: string
  duration: string
  size: number
}

function generateConfetti(count: number): ConfettiPiece[] {
  const colors = ['#fbbf24', '#34d399', '#6ee7b7', '#a7f3d0', '#f0fdf4', '#fb923c']
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: `${Math.random() * 3}s`,
    duration: `${2 + Math.random() * 3}s`,
    size: 6 + Math.floor(Math.random() * 10),
  }))
}

const medalEmoji = ['🥇', '🥈', '🥉']
const podiumOrder = [1, 0, 2]
const podiumHeights = ['h-32', 'h-24', 'h-16']
const podiumColors = ['bg-yellow-400', 'bg-gray-500', 'bg-amber-700']

export default function PandamoniumPodiumScreen() {
  const { gameState, mySessionId, emit } = useGame()
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([])

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

  // Total medals received per player (from pm_medals if available)
  const medals = gameState.pm_medals ?? {}
  const medalCounts = new Map<string, number>()
  for (const targets of Object.values(medals)) {
    for (const sid of targets) {
      medalCounts.set(sid, (medalCounts.get(sid) ?? 0) + 1)
    }
  }

  const getMedalCount = (player: (typeof sortedPlayers)[0]) => {
    // Find by matching display_name since session_id is stripped from players array
    const entry = [...medalCounts.entries()].find(([sid]) => {
      const found = gameState.players.find(
        (p) => p.display_name === player.display_name
      )
      return found && sid === found.session_id
    })
    return entry?.[1] ?? 0
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-green-950 flex flex-col items-center p-4 pt-8 overflow-hidden">
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

      <h1 className="text-5xl font-black text-yellow-400 mb-2 tracking-tight">
        PANDAMONIUM!
      </h1>
      <p className="text-green-300 mb-8 text-lg font-semibold">Final Results 🐼</p>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="w-full max-w-lg mb-8">
          <div className="flex items-end justify-center gap-2">
            {podiumOrder.map((rank) => {
              const player = top3[rank]
              if (!player) return <div key={rank} className="flex-1" />
              return (
                <div key={rank} className="flex-1 flex flex-col items-center">
                  <div className="text-center mb-2">
                    <span className="text-3xl">{medalEmoji[rank]}</span>
                    <p className="text-white font-black text-sm truncate max-w-[100px]">
                      {player.display_name}
                    </p>
                    <p className="text-yellow-400 font-black text-lg">{player.score}</p>
                  </div>
                  <div className={`w-full ${podiumHeights[rank]} ${podiumColors[rank]} rounded-t-lg flex items-start justify-center pt-2`}>
                    <span className="text-white font-black text-2xl opacity-80">{rank + 1}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full leaderboard */}
      <div className="w-full max-w-lg mb-6">
        <h3 className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-3">Final Standings</h3>
        <div className="space-y-2">
          {sortedPlayers.map((player, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                idx === 0 ? 'bg-yellow-400/20 border-yellow-400' : 'bg-green-800/40 border-green-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-sm font-black w-6 text-center ${
                  idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-green-500'
                }`}>
                  {idx < 3 ? medalEmoji[idx] : `${idx + 1}.`}
                </span>
                <span className="text-white font-semibold">{player.display_name}</span>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 font-black text-lg">{player.score}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Winner highlight */}
      {sortedPlayers.length > 0 && (
        <div className="w-full max-w-lg mb-6 bg-yellow-400/10 border border-yellow-400 rounded-2xl p-4 text-center">
          <p className="text-yellow-400 font-black text-xl">
            🐼 {sortedPlayers[0].display_name} wins with {sortedPlayers[0].score} points!
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="w-full max-w-lg space-y-3">
        {isRoomMaster ? (
          <button
            onClick={() => emit('PLAY_AGAIN', {})}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-green-950 font-black text-xl rounded-xl transition-all active:scale-95 shadow-lg"
          >
            Play Again
          </button>
        ) : (
          <div className="bg-green-800/40 border border-green-700 rounded-xl p-4 text-center">
            <p className="text-green-300 text-sm">Waiting for host to start another game...</p>
          </div>
        )}
        <button
          onClick={() => {
            try { localStorage.removeItem('bluffalo_session') } catch {}
            window.location.reload()
          }}
          className="w-full py-3 bg-green-700 hover:bg-green-600 text-white font-bold text-lg rounded-xl transition-all active:scale-95"
        >
          Leave Game
        </button>
      </div>
    </div>
  )
}
