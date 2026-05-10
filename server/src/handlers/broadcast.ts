import { Server } from "socket.io";
import { GameState, GamePhase } from "../../../shared/types";
import { setRoom } from "../rooms/roomStore";

export function sanitizeStateForClient(state: GameState): GameState {
  const base: GameState = {
    ...state,
    current_fact:
      state.current_fact &&
      (state.phase === GamePhase.PROMPT ||
        state.phase === GamePhase.REVEAL ||
        state.phase === GamePhase.SELECTION)
        ? { ...state.current_fact, truth_keyword: "" }
        : state.current_fact,
    vote_options: state.vote_options.map((opt) => {
      const maskTruth = state.phase === GamePhase.REVEAL || state.phase === GamePhase.SELECTION;
      const revealAuthor = state.phase === GamePhase.RESOLUTION || state.phase === GamePhase.PODIUM;
      return {
        ...opt,
        is_truth: maskTruth ? false : opt.is_truth,
        author_display_name: revealAuthor && opt.author_session_id
          ? (state.players.find((p) => p.session_id === opt.author_session_id)?.display_name ?? null)
          : null,
        co_author_display_names: revealAuthor
          ? opt.co_author_session_ids
              .map((sid) => state.players.find((p) => p.session_id === sid)?.display_name ?? null)
              .filter((n): n is string => n !== null)
          : [],
      };
    }),
    players: state.players.map((p) => ({ ...p, session_id: "" })),
  };

  if (state.game_type === "pandamonium" && state.pm_matchups) {
    const hideAnswers =
      state.phase === GamePhase.PM_WRITING || state.phase === GamePhase.PM_FINAL_WRITING;
    const currentIdx = state.pm_matchup_index ?? 0;

    base.pm_matchups = state.pm_matchups.map((m, i) => {
      const isCurrentMatchup = i === currentIdx;
      const hideNames = state.phase === GamePhase.PM_MATCHUP && isCurrentMatchup;
      return {
        ...m,
        player_a_answer: hideAnswers ? null : m.player_a_answer,
        player_b_answer: hideAnswers ? null : m.player_b_answer,
        player_a_display_name: hideNames ? null : m.player_a_display_name,
        player_b_display_name: hideNames ? null : m.player_b_display_name,
        votes: {},
      };
    });

    if (state.phase === GamePhase.PM_FINAL_WRITING) {
      base.pm_final_answers = {};
    }
  }

  return base;
}

export function broadcastGameState(io: Server, roomCode: string, state: GameState): void {
  const sanitized = sanitizeStateForClient(state);
  io.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitized });
}

export function broadcastToRoom(io: Server): (roomCode: string, state: GameState) => void {
  return (roomCode: string, state: GameState) => {
    setRoom(roomCode, state);
    broadcastGameState(io, roomCode, state);
  };
}
