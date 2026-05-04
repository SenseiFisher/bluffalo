export enum DebuffType {
  TIME_CUTOFF = "TIME_CUTOFF",
  FOG = "FOG",
  SCRAMBLE = "SCRAMBLE",
  CHARACTER_EXCLUDE = "CHARACTER_EXCLUDE",
}

export interface Debuff {
  type: DebuffType;
  excluded_character?: string;
}

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface DebuffAward {
  winner_session_id: string;
  winner_display_name: string;
  eligible_targets: Array<{ session_id: string; display_name: string }>;
  pending_debuff: {
    type: DebuffType;
    target_session_id: string;
    target_display_name: string;
    excluded_character?: string;
  } | null;
}

export enum GamePhase {
  LOBBY      = "LOBBY",
  PROMPT     = "PROMPT",
  REVEAL     = "REVEAL",
  SELECTION  = "SELECTION",
  RESOLUTION = "RESOLUTION",
  DEBUFF     = "DEBUFF",
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
  funny_vote_count: number;
  is_connected: boolean;
  disconnected_at: number | null;
  active_debuff: Debuff | null;
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
  co_author_session_ids: string[]; // additional authors who submitted the same lie
  co_author_display_names: string[]; // populated by server only during RESOLUTION/PODIUM
  funny_voter_session_ids: string[];
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
  language: string;
  debuffs_enabled: boolean;
  debuff_award: DebuffAward | null;
  active_debuff_session_id: string | null; // NOT stripped — client uses to check if they are debuffed
  location?: GeoLocation;
  created_at: number;
}

// Socket event payload types
export interface JoinRoomPayload {
  room_code: string;
  display_name: string;
  session_id?: string;
  location?: GeoLocation;
}

export interface StartGamePayload {
  total_rounds: number;
  prompt_timer_seconds?: number;
  language?: string;
  debuffs_enabled?: boolean;
}

export interface SubmitDebuffPayload {
  debuff_type: DebuffType;
  target_session_id: string;
  excluded_character?: string;
}

export interface SubmitLiePayload {
  text: string;
}

export interface SubmitVotePayload {
  option_id: string;
}

export interface SubmitFunnyVotePayload {
  option_id: string;
}

export interface PlayAgainPayload {
  // empty
}

export interface KickPlayerPayload {
  player_id: string; // socket.id of the player to kick
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
