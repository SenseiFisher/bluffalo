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
  INTRO      = "INTRO",
  PROMPT     = "PROMPT",
  REVEAL     = "REVEAL",
  SELECTION  = "SELECTION",
  RESOLUTION = "RESOLUTION",
  DEBUFF     = "DEBUFF",
  PODIUM     = "PODIUM",
  // Pandamonium phases
  PM_WRITING        = "PM_WRITING",
  PM_MATCHUP        = "PM_MATCHUP",
  PM_MATCHUP_RESULT = "PM_MATCHUP_RESULT",
  PM_FINAL_WRITING  = "PM_FINAL_WRITING",
  PM_FINAL_REVEAL   = "PM_FINAL_REVEAL",
}

export interface Fact {
  content_id: string;
  fact_template: string;
  truth_keyword: string;
  metadata: { difficulty: "Easy" | "Medium" | "Hard"; category: string; };
}

export type SpecialRoundType = 'personal_question';

export interface PersonalQuestionTemplate {
  content_id: string;
  fact_template: string; // contains "[Name]" and "_______"
  metadata: { category: string; };
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

export interface PandamoniumMatchup {
  matchup_id: string;
  prompt_content_id: string;
  prompt_text: string;
  player_a_session_id: string;
  player_a_display_name: string | null;
  player_a_answer: string | null;
  player_a_submitted: boolean;
  player_b_session_id: string;
  player_b_display_name: string | null;
  player_b_answer: string | null;
  player_b_submitted: boolean;
  votes: Record<string, 'a' | 'b'>;
  player_a_vote_count: number;
  player_b_vote_count: number;
  winner: 'a' | 'b' | 'tie' | null;
  a_hidden: boolean;
  b_hidden: boolean;
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
  game_type: string;
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
  intro_enabled: boolean;
  intro_skipped_by: string[];
  intro_text: { en: string; he: string } | null;
  debuff_award: DebuffAward | null;
  active_debuff_session_id: string | null; // NOT stripped — client uses to check if they are debuffed
  is_special_round: boolean;
  personal_question_subject_session_id: string | null; // NOT stripped — client uses to check if they are the subject
  location?: GeoLocation;
  created_at: number;
  // Pandamonium-specific fields
  pm_matchups?: PandamoniumMatchup[];
  pm_matchup_index?: number;
  pm_final_answers?: Record<string, string>;
  pm_final_answer_cards?: Array<{ session_id: string; display_name: string; answer: string }>;
  pm_medals?: Record<string, string[]>;
}

export interface GameListItem {
  game_type: string;
  display_name: string;
}

// Socket event payload types
export interface JoinRoomPayload {
  room_code: string;
  display_name: string;
  session_id?: string;
  game_type?: string;
  create?: boolean;
  location?: GeoLocation;
  initial_settings?: {
    total_rounds?: number;
    prompt_timer_seconds?: number;
    language?: string;
    debuffs_enabled?: boolean;
    intro_enabled?: boolean;
  };
}

export interface StartGamePayload {
  total_rounds: number;
  prompt_timer_seconds?: number;
  language?: string;
  debuffs_enabled?: boolean;
  intro_enabled?: boolean;
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
