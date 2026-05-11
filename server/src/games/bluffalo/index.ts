import { GameState, GamePhase, DebuffType } from "../../../../shared/types";
import {
  MIN_ROUNDS,
  MAX_ROUNDS,
  DEFAULT_TOTAL_ROUNDS,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  FUNNY_BONUS,
  CHARACTER_EXCLUDE_OPTIONS,
} from "../../../../shared/constants";
import {
  initGame,
  startPromptPhase,
  advanceToNextRound,
  checkAllLiesSubmitted,
  checkAllVotesSubmitted,
  clearRoomTimers,
  allLiesSubmitted,
} from "./stateMachine";
import {
  startIntroPhase,
  handleIntroSkip,
  checkIntroSkipAfterDisconnect,
} from "../introPhase";
import { validateLie } from "../../utils/validation";
import { loadFacts, loadPersonalQuestions } from "./content/loader";
import { setRoom } from "../../rooms/roomStore";
import { broadcastGameState } from "../../handlers/broadcast";
import { registerGame, GamePlugin, BroadcastFn, GameEventContext } from "../registry";

const INTRO_TEXT = {
  en: "In Bluffalo, a fact appears with a blank. Everyone secretly fills in a fake answer. Then all answers — including the real one — are revealed. Vote for what you think is the truth! Fool others to earn points, or spot the real answer to score big.",
  he: "בבלופלו מופיע משפט עם חסר. כולם כותבים תשובה מומצאת בסתר. לאחר מכן כל התשובות — כולל האמיתית — מוצגות. הצביעו על מה שנראה לכם אמת! הטעו אחרים כדי לצבור נקודות, או גלו את האמת לציון גבוה.",
};

const BluffaloPlugin: GamePlugin = {
  game_type: "bluffalo",
  display_name: "Bluffalo",
  intro_text: INTRO_TEXT,

  validateContent() {
    const en = loadFacts("en");
    console.log(`[Bluffalo] Loaded ${en.length} facts (en)`);
    const he = loadFacts("he");
    console.log(`[Bluffalo] Loaded ${he.length} facts (he)`);
    loadPersonalQuestions("en");
    loadPersonalQuestions("he");
  },

  startGame(state: GameState, payload: unknown, broadcast: BroadcastFn): GameState {
    const p = payload as {
      total_rounds?: number;
      prompt_timer_seconds?: number;
      language?: string;
      debuffs_enabled?: boolean;
      intro_enabled?: boolean;
    };

    let totalRounds = typeof p?.total_rounds === "number" ? p.total_rounds : DEFAULT_TOTAL_ROUNDS;
    totalRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, totalRounds));

    const VALID_TIMER_PRESETS = [30, 45, 60, 90, 120, 150];
    let promptTimerSeconds = typeof p?.prompt_timer_seconds === "number" ? p.prompt_timer_seconds : 60;
    if (!VALID_TIMER_PRESETS.includes(promptTimerSeconds)) promptTimerSeconds = 60;
    state.prompt_timer_seconds = promptTimerSeconds;

    const lang =
      typeof p?.language === "string" &&
      (SUPPORTED_LANGUAGES as readonly string[]).includes(p.language)
        ? p.language
        : DEFAULT_LANGUAGE;
    state.language = lang;
    state.debuffs_enabled = p?.debuffs_enabled === true;
    state.intro_enabled = p?.intro_enabled !== false;
    state.intro_text = INTRO_TEXT;

    initGame(state, totalRounds);

    if (state.intro_enabled) {
      startIntroPhase(state, broadcast, () => startPromptPhase(state, broadcast));
    } else {
      startPromptPhase(state, broadcast);
    }

    return state;
  },

  handleEvent(event: string, payload: unknown, ctx: GameEventContext): boolean {
    const { io, socket, state, roomCode, broadcast } = ctx;

    switch (event) {
      case "SKIP_INTRO": {
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) return true;
        handleIntroSkip(state, player.session_id, broadcast, () => startPromptPhase(state, broadcast));
        return true;
      }

      case "SUBMIT_LIE": {
        const p = payload as { text?: string };
        if (state.phase !== GamePhase.PROMPT) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in PROMPT phase" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) {
          socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
          return true;
        }
        if (player.round.submitted_lie !== null) {
          socket.emit("ERROR", { code: "ALREADY_SUBMITTED", message: "Already submitted a lie" });
          return true;
        }
        const lieResult = validateLie(p?.text);
        if (!lieResult.valid) {
          socket.emit("ERROR", { code: "INVALID_LIE", message: lieResult.error });
          return true;
        }
        const lieText = lieResult.value;
        if (!state.is_special_round) {
          if (lieText.toLowerCase() === state.current_fact!.truth_keyword.toLowerCase()) {
            player.round.great_minds = true;
          }
        }
        player.round.submitted_lie = lieText;
        broadcast(roomCode, state);
        checkAllLiesSubmitted(state, broadcast);
        return true;
      }

      case "EDIT_LIE": {
        const p = payload as { text?: string };
        if (state.phase !== GamePhase.PROMPT) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in PROMPT phase" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) {
          socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
          return true;
        }
        if (player.round.submitted_lie === null) {
          socket.emit("ERROR", { code: "NOT_SUBMITTED", message: "No answer to edit" });
          return true;
        }
        if (allLiesSubmitted(state)) {
          socket.emit("ERROR", { code: "TOO_LATE", message: "All players have already submitted" });
          return true;
        }
        const lieResult = validateLie(p?.text);
        if (!lieResult.valid) {
          socket.emit("ERROR", { code: "INVALID_LIE", message: lieResult.error });
          return true;
        }
        const lieText = lieResult.value;
        player.round.great_minds =
          !state.is_special_round &&
          lieText.toLowerCase() === state.current_fact!.truth_keyword.toLowerCase();
        player.round.submitted_lie = lieText;
        broadcast(roomCode, state);
        checkAllLiesSubmitted(state, broadcast);
        return true;
      }

      case "SUBMIT_VOTE": {
        const p = payload as { option_id?: string };
        if (state.phase !== GamePhase.SELECTION) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in SELECTION phase" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) {
          socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
          return true;
        }
        const optionId = p?.option_id;
        if (typeof optionId !== "string") {
          socket.emit("ERROR", { code: "INVALID_VOTE", message: "Invalid option_id" });
          return true;
        }
        if (
          state.is_special_round &&
          player.session_id === state.personal_question_subject_session_id
        ) {
          socket.emit("ERROR", {
            code: "SUBJECT_CANNOT_VOTE",
            message: "You are the subject — no voting this round",
          });
          return true;
        }
        const option = state.vote_options.find((o) => o.option_id === optionId);
        if (!option) {
          socket.emit("ERROR", { code: "INVALID_OPTION", message: "Option not found" });
          return true;
        }
        const isOwnOption =
          !option.is_truth &&
          (option.author_session_id === player.session_id ||
            option.co_author_session_ids.includes(player.session_id));
        if (isOwnOption) {
          socket.emit("ERROR", { code: "SELF_VOTE", message: "Cannot vote for your own lie" });
          return true;
        }
        player.round.voted_for_id = optionId;
        broadcast(roomCode, state);
        checkAllVotesSubmitted(state, broadcast);
        return true;
      }

      case "SUBMIT_FUNNY_VOTE": {
        const p = payload as { option_id?: string };
        if (state.phase !== GamePhase.RESOLUTION) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in RESOLUTION phase" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) {
          socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
          return true;
        }
        const optionId = p?.option_id;
        if (typeof optionId !== "string") {
          socket.emit("ERROR", { code: "INVALID_VOTE", message: "Invalid option_id" });
          return true;
        }
        const option = state.vote_options.find((o) => o.option_id === optionId);
        if (!option) {
          socket.emit("ERROR", { code: "INVALID_OPTION", message: "Option not found" });
          return true;
        }
        const isOwnOption =
          option.author_session_id === player.session_id ||
          option.co_author_session_ids.includes(player.session_id);
        if (isOwnOption) {
          socket.emit("ERROR", { code: "SELF_VOTE", message: "Cannot funny-vote your own answer" });
          return true;
        }
        if (option.funny_voter_session_ids.includes(player.session_id)) {
          socket.emit("ERROR", {
            code: "ALREADY_FUNNY_VOTED",
            message: "Already gave a funny vote to this answer",
          });
          return true;
        }
        option.funny_voter_session_ids.push(player.session_id);
        const allAuthors = [option.author_session_id, ...option.co_author_session_ids].filter(
          (id): id is string => id !== null
        );
        for (const authorSessionId of allAuthors) {
          const author = state.players.find((pl) => pl.session_id === authorSessionId);
          if (author) {
            author.score += FUNNY_BONUS;
            author.funny_vote_count += 1;
          }
        }
        broadcast(roomCode, state);
        return true;
      }

      case "SUBMIT_DEBUFF": {
        const p = payload as {
          debuff_type?: string;
          target_session_id?: string;
          excluded_character?: string;
        };
        if (state.phase !== GamePhase.DEBUFF) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in DEBUFF phase" });
          return true;
        }
        if (!state.debuffs_enabled || !state.debuff_award) {
          socket.emit("ERROR", { code: "NO_DEBUFF_AWARD", message: "No debuff award this round" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player || player.session_id !== state.debuff_award.winner_session_id) {
          socket.emit("ERROR", {
            code: "NOT_DEBUFF_WINNER",
            message: "You did not earn the debuff this round",
          });
          return true;
        }
        if (state.debuff_award.pending_debuff !== null) {
          socket.emit("ERROR", { code: "DEBUFF_ALREADY_CHOSEN", message: "Debuff already selected" });
          return true;
        }
        const debuffType = p?.debuff_type as DebuffType | undefined;
        if (!debuffType || !Object.values(DebuffType).includes(debuffType)) {
          socket.emit("ERROR", { code: "INVALID_DEBUFF_TYPE", message: "Invalid debuff type" });
          return true;
        }
        const targetId = p?.target_session_id;
        if (typeof targetId !== "string") {
          socket.emit("ERROR", { code: "INVALID_TARGET", message: "Invalid target" });
          return true;
        }
        const target = state.players.find(
          (pl) =>
            pl.session_id === targetId &&
            pl.is_connected &&
            pl.session_id !== player.session_id
        );
        if (!target) {
          socket.emit("ERROR", {
            code: "INVALID_TARGET",
            message: "Target player not found or invalid",
          });
          return true;
        }
        let excludedChar: string | undefined;
        if (debuffType === DebuffType.CHARACTER_EXCLUDE) {
          const charOptions =
            CHARACTER_EXCLUDE_OPTIONS[state.language] ?? CHARACTER_EXCLUDE_OPTIONS["en"];
          excludedChar =
            typeof p?.excluded_character === "string" ? p.excluded_character : undefined;
          if (!excludedChar || !charOptions.includes(excludedChar)) {
            socket.emit("ERROR", { code: "INVALID_CHARACTER", message: "Invalid excluded character" });
            return true;
          }
        }
        state.debuff_award.pending_debuff = {
          type: debuffType,
          target_session_id: targetId,
          target_display_name: target.display_name,
          ...(excludedChar ? { excluded_character: excludedChar } : {}),
        };
        setRoom(roomCode, state);
        advanceToNextRound(state, (code, s) => broadcastGameState(io, code, s));
        return true;
      }

      default:
        return false;
    }
  },

  resetToLobby(state: GameState): GameState {
    state.phase = GamePhase.LOBBY;
    state.round_number = 0;
    state.is_final_round = false;
    state.current_fact = null;
    state.vote_options = [];
    state.timer_ends_at = null;
    state.used_fact_ids = [];
    state.debuff_award = null;
    state.active_debuff_session_id = null;
    state.is_special_round = false;
    state.personal_question_subject_session_id = null;
    for (const p of state.players) {
      p.score = 0;
      p.deception_count = 0;
      p.funny_vote_count = 0;
      p.active_debuff = null;
      p.round = {
        submitted_lie: null,
        voted_for_id: null,
        great_minds: false,
        bamboozle_count: 0,
        truth_found: false,
      };
    }
    clearRoomTimers(state.room_code);
    return state;
  },

  onPlayerDisconnect(state: GameState, broadcast: BroadcastFn): void {
    checkIntroSkipAfterDisconnect(state, () => startPromptPhase(state, broadcast));
    checkAllLiesSubmitted(state, broadcast);
    checkAllVotesSubmitted(state, broadcast);
  },
};

registerGame(BluffaloPlugin);
export default BluffaloPlugin;
