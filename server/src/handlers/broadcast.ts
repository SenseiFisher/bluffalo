import { Server } from "socket.io";
import { GameState, GamePhase } from "../../../shared/types";
import { setRoom } from "../rooms/roomStore";

export function sanitizeStateForClient(state: GameState): GameState {
  return {
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
