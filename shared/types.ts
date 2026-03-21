export enum GamePhase {
  LOBBY      = "LOBBY",
  PROMPT     = "PROMPT",
  REVEAL     = "REVEAL",
  SELECTION  = "SELECTION",
  RESOLUTION = "RESOLUTION",
  PODIUM     = "PODIUM",
}

export interface Fact {
  content_id: string;
  fact_template: string;
  truth_keyword: string;
  metadata: { difficulty: "Easy" | "Medium" | "Hard"; category: string; };
}

export interface Player {
  id: string;              // socket.id — ephemeral
  session_id: string;      // persistent
  display_name: string;
  score: number;
  deception_count: number;
  is_connected: boolean;
  round: {
    submitted_lie: string | null;
    voted_for_id: string | null;
    great_minds: boolean;
    bamboozle_count: number;
    truth_found: boolean;
  };
}

export interface VoteOption {
  option_id: string;
  text: string;
  is_truth: boolean;
  author_session_id: string | null;
  author_display_name: string | null; // populated by server only during RESOLUTION/PODIUM
}

export interface GameState {
  room_code: string;
  phase: GamePhase;
  players: Player[];
  current_fact: Fact | null;
  vote_options: VoteOption[];
  timer_ends_at: number | null;
  round_number: number;
  total_rounds: number;
  prompt_timer_seconds: number;
  is_final_round: boolean;
  used_fact_ids: string[];
  room_master_session_id: string;
}

// Socket event payload types
export interface JoinRoomPayload {
  room_code: string;
  display_name: string;
  session_id?: string;
}

export interface StartGamePayload {
  total_rounds: number;
}

export interface SubmitLiePayload {
  text: string;
}

export interface SubmitVotePayload {
  option_id: string;
}

export interface PlayAgainPayload {
  // empty
}

export interface RoomJoinedPayload {
  game_state: GameState;
  your_session_id: string;
}

export interface GameStateUpdatePayload {
  game_state: GameState;
}

export interface PhaseChangedPayload {
  phase: GamePhase;
}

export interface VoteOptionsPayload {
  options: VoteOption[];
}

export interface ErrorPayload {
  code: string;
  message: string;
}
