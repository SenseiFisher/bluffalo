import React, { useState, useEffect, useCallback } from 'react'
import { useGame } from '../../../context/GameContext'
import { useTimer } from '../../../hooks/useTimer'
import { GamePhase } from '@shared/types'

interface FloatingReaction {
  id: number
  emoji: string
  x: number
}

export default function MatchupScreen() {
  const { gameState, mySessionId, emit, socket } = useGame()
  const [voted, setVoted] = useState<'a' | 'b' | null>(null)
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const timeRemaining = useTimer(gameState?.timer_ends_at ?? null)

  const isResult = gameState?.phase === GamePhase.PM_MATCHUP_RESULT

  // Listen for PM_REACTION events from any player
  const handleReaction = useCallback((data: { reaction: string; display_name: string }) => {
    setReactions((prev) => [
      ...prev.slice(-15),
      { id: Date.now() + Math.random(), emoji: data.reaction, x: Math.random() * 80 + 5 },
    ])
    // Remove this reaction after animation
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== prev[prev.length - 1]?.id))
    }, 2500)
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.on('PM_REACTION', handleReaction)
    return () => { socket.off('PM_REACTION', handleReaction) }
  }, [socket, handleReaction])

  // Reset vote state when matchup index changes
  useEffect(() => {
    setVoted(null)
  }, [gameState?.pm_matchup_index])

  if (!gameState || !gameState.pm_matchups) return null

  const idx = gameState.pm_matchup_index ?? 0
  const matchup = gameState.pm_matchups[idx]
  if (!matchup) return null

  const total = gameState.pm_matchups.length
  const lang = gameState.language ?? 'en'
  const parts = matchup.prompt_text.split('_______')

  const amParticipant =
    matchup.player_a_session_id === mySessionId ||
    matchup.player_b_session_id === mySessionId

  const totalVotes = matchup.player_a_vote_count + matchup.player_b_vote_count
  const aPct = totalVotes > 0 ? Math.round((matchup.player_a_vote_count / totalVotes) * 100) : 50
  const bPct = totalVotes > 0 ? Math.round((matchup.player_b_vote_count / totalVotes) * 100) : 50

  const handleVote = (side: 'a' | 'b') => {
    if (amParticipant || voted !== null) return
    emit('PM_VOTE', { vote: side })
    setVoted(side)
  }

  const handleReactionClick = (emoji: string) => {
    emit('PM_REACTION', { reaction: emoji })
  }

  const winnerSide = matchup.winner
  const aName = matchup.player_a_display_name
  const bName = matchup.player_b_display_name

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-green-950 flex flex-col items-center p-4 pt-8 relative overflow-hidden">
      {/* Floating reactions */}
      {reactions.map((r) => (
        <div
          key={r.id}
          className="fixed bottom-20 text-4xl pointer-events-none animate-bounce"
          style={{ left: `${r.x}%`, animationDuration: '0.6s' }}
        >
          {r.emoji}
        </div>
      ))}

      {/* Header */}
      <div className="flex justify-between items-center w-full max-w-lg mb-4">
        <div className="text-green-300 text-sm font-semibold">
          Matchup {idx + 1} of {total}
          <span className="ml-2 text-green-500 text-xs">· Round {gameState.round_number}/{gameState.total_rounds}</span>
        </div>
        {!isResult && (
          <div className={`text-2xl font-black ${timeRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
            {timeRemaining}s
          </div>
        )}
      </div>

      <div className="text-center mb-4">
        <h2 className="text-2xl font-black text-white">
          {isResult ? '🐼 Result!' : 'Head to Head!'}
        </h2>
        {!isResult && !amParticipant && (
          <p className="text-green-300 mt-1 text-sm">Vote for the funniest answer</p>
        )}
        {!isResult && amParticipant && (
          <p className="text-green-300 mt-1 text-sm">You're in this matchup — sit back and watch!</p>
        )}
      </div>

      {/* Prompt */}
      <div className="w-full max-w-lg bg-green-800/60 border border-green-600 rounded-2xl p-4 mb-5 shadow-xl">
        <p className="text-white text-lg font-semibold leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
          {parts[0]}
          <span className="inline-block bg-green-700 border-b-2 border-yellow-400 px-3 py-0.5 mx-1 rounded min-w-[6rem] text-center">
            &nbsp;
          </span>
          {parts[1] ?? ''}
        </p>
      </div>

      {/* Answer cards */}
      <div className="w-full max-w-lg grid grid-cols-2 gap-3 mb-5">
        {(['a', 'b'] as const).map((side) => {
          const answer = side === 'a' ? matchup.player_a_answer : matchup.player_b_answer
          const isHidden = side === 'a' ? matchup.a_hidden : matchup.b_hidden
          const name = side === 'a' ? aName : bName
          const voteCount = side === 'a' ? matchup.player_a_vote_count : matchup.player_b_vote_count
          const isWinner = isResult && winnerSide === side
          const isLoser = isResult && winnerSide !== null && winnerSide !== 'tie' && winnerSide !== side
          const myVote = voted === side

          const cardClass = isWinner
            ? 'border-yellow-400 bg-yellow-400/20'
            : isLoser
            ? 'border-green-800 bg-green-900/30 opacity-60'
            : myVote
            ? 'border-green-400 bg-green-700/40'
            : 'border-green-600 bg-green-800/60 hover:border-yellow-400'

          return (
            <button
              key={side}
              onClick={() => !isResult && handleVote(side)}
              disabled={isResult || amParticipant || voted !== null}
              className={`rounded-2xl border-2 p-4 text-left transition-all duration-150 active:scale-95 disabled:cursor-default ${cardClass}`}
            >
              <div className="text-green-300 font-black text-xl mb-2">
                {side.toUpperCase()}
              </div>
              {isHidden ? (
                <p className="text-green-500 text-sm italic">[Hidden by host]</p>
              ) : (
                <p className="text-white font-bold text-lg leading-snug">
                  {answer ?? '…'}
                </p>
              )}
              {isResult && (
                <div className="mt-3 space-y-1">
                  {name && <p className="text-green-300 text-xs">— {name}</p>}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-green-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${isWinner ? 'bg-yellow-400' : 'bg-green-600'}`}
                        style={{ width: `${side === 'a' ? aPct : bPct}%` }}
                      />
                    </div>
                    <span className="text-yellow-400 font-bold text-sm">
                      {side === 'a' ? aPct : bPct}%
                    </span>
                  </div>
                  {voteCount > 0 && (
                    <p className="text-green-400 text-xs">{voteCount} vote{voteCount !== 1 ? 's' : ''}</p>
                  )}
                </div>
              )}
              {isWinner && (
                <div className="mt-2 text-yellow-400 font-black text-sm">🏆 Winner!</div>
              )}
              {isResult && winnerSide === 'tie' && (
                <div className="mt-2 text-green-400 font-bold text-sm">🤝 Tie</div>
              )}
            </button>
          )
        })}
      </div>

      {/* Voted confirmation */}
      {!isResult && voted && (
        <div className="w-full max-w-lg bg-green-900/40 border border-green-600 rounded-xl p-3 text-center mb-4">
          <p className="text-green-400 font-semibold text-sm">Voted for {voted.toUpperCase()}! Waiting for others...</p>
        </div>
      )}

      {/* Vote progress (during voting) */}
      {!isResult && (
        <div className="w-full max-w-lg mb-4">
          <div className="flex justify-between text-green-400 text-xs mb-1">
            <span>Votes in</span>
            <span>{totalVotes}</span>
          </div>
          <div className="w-full bg-green-800 rounded-full h-2">
            <div
              className="bg-yellow-400 rounded-full h-2 transition-all duration-500"
              style={{
                width: (() => {
                  const eligible = gameState.players.filter(
                    (p) =>
                      p.is_connected &&
                      p.session_id !== matchup.player_a_session_id &&
                      p.session_id !== matchup.player_b_session_id
                  ).length
                  return eligible > 0 ? `${(totalVotes / eligible) * 100}%` : '0%'
                })(),
              }}
            />
          </div>
        </div>
      )}

      {/* Reaction buttons */}
      {!isResult && (
        <div className="flex gap-3 mb-4">
          {['🎋', '🐾', '😂'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReactionClick(emoji)}
              className="text-2xl bg-green-800/60 border border-green-600 hover:border-yellow-400 rounded-full w-12 h-12 flex items-center justify-center transition-all active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Leaderboard (during result) */}
      {isResult && (
        <div className="w-full max-w-lg mt-2">
          <h3 className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-2">Standings</h3>
          <div className="space-y-1">
            {[...gameState.players].sort((a, b) => b.score - a.score).map((player, i) => (
              <div key={i} className="flex items-center justify-between bg-green-800/40 rounded-lg px-3 py-1.5">
                <span className="text-green-300 text-sm">
                  <span className="text-green-500 mr-1">{i + 1}.</span>
                  {player.display_name}
                </span>
                <span className="text-yellow-400 font-bold text-sm">{player.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
