import { GameState, PandamoniumMatchup } from "../../../../shared/types";
import {
  PM_FULL_BAMBOO_BONUS,
  PM_MEDAL_POINTS,
  PM_COMEBACK_MULTIPLIER,
} from "../../../../shared/constants";

export interface MatchupResult {
  winner_session_id: string | null;
  points: number;
  is_tie: boolean;
  is_full_bamboo: boolean;
}

export function calculateMatchupResult(
  matchup: PandamoniumMatchup,
  roundNumber: number
): MatchupResult {
  const votes = matchup.votes;
  const entries = Object.values(votes);
  const totalVotes = entries.length;

  if (totalVotes === 0) {
    return { winner_session_id: null, points: 0, is_tie: true, is_full_bamboo: false };
  }

  const aVotes = entries.filter((v) => v === "a").length;
  const bVotes = entries.filter((v) => v === "b").length;

  if (aVotes === bVotes) {
    return { winner_session_id: null, points: 0, is_tie: true, is_full_bamboo: false };
  }

  const winnerIsA = aVotes > bVotes;
  const winnerSessionId = winnerIsA
    ? matchup.player_a_session_id
    : matchup.player_b_session_id;
  const winnerVotes = winnerIsA ? aVotes : bVotes;
  const votePct = (winnerVotes / totalVotes) * 100;
  const roundMultiplier = roundNumber >= 2 ? PM_COMEBACK_MULTIPLIER : 1;
  const basePoints = Math.floor(votePct * 10) * roundMultiplier;
  const isFullBamboo = winnerVotes === totalVotes;
  const bonus = isFullBamboo ? PM_FULL_BAMBOO_BONUS : 0;

  return {
    winner_session_id: winnerSessionId,
    points: basePoints + bonus,
    is_tie: false,
    is_full_bamboo: isFullBamboo,
  };
}

export function applyMatchupScores(state: GameState, roundNumber: number): void {
  if (!state.pm_matchups) return;
  for (const matchup of state.pm_matchups) {
    if (matchup.winner !== null) continue;
    const result = calculateMatchupResult(matchup, roundNumber);

    const aVotes = Object.values(matchup.votes).filter((v) => v === "a").length;
    const bVotes = Object.values(matchup.votes).filter((v) => v === "b").length;
    matchup.player_a_vote_count = aVotes;
    matchup.player_b_vote_count = bVotes;

    if (result.is_tie) {
      matchup.winner = "tie";
    } else {
      matchup.winner = result.winner_session_id === matchup.player_a_session_id ? "a" : "b";
      const winner = state.players.find((p) => p.session_id === result.winner_session_id);
      if (winner) {
        winner.score += result.points;
        winner.round.bamboozle_count += 1;
      }
    }
  }
}

export function applyMedalScores(state: GameState): void {
  if (!state.pm_medals) return;
  for (const targetIds of Object.values(state.pm_medals)) {
    for (const targetId of targetIds) {
      const player = state.players.find((p) => p.session_id === targetId);
      if (player) player.score += PM_MEDAL_POINTS;
    }
  }
}
