import { GameState, GamePhase } from "../../../../shared/types";
import {
  PM_MIN_PLAYERS,
  PM_DEFAULT_TOTAL_ROUNDS,
  PM_MIN_ROUNDS,
  PM_MAX_ROUNDS,
  PM_MEDALS_PER_PLAYER,
  PM_ALLOWED_REACTIONS,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from "../../../../shared/constants";
import {
  initPMGame,
  startFirstPMPhase,
  advancePMWritingToMatchup,
  advancePMMatchupToResult,
  advancePMFinalWritingToReveal,
  checkAllPMAnswersSubmitted,
  checkAllPMMatchupVotesSubmitted,
  checkAllPMFinalAnswersSubmitted,
  clearRoomTimersPM,
} from "./stateMachine";
import {
  startIntroPhase,
  handleIntroSkip,
  checkIntroSkipAfterDisconnect,
} from "../introPhase";
import { validateLie } from "../../utils/validation";
import { loadFacts } from "../bluffalo/content/loader";
import { registerGame, GamePlugin, BroadcastFn, GameEventContext } from "../registry";

const VALID_TIMER_PRESETS = [30, 45, 60, 90];

const INTRO_TEXT = {
  en: "In Pandamonium, players face off in 1-on-1 matchups. Each pair gets a prompt — both players answer it, and everyone else votes for the best response. Win votes to score points. The game ends with a final free-for-all round where players award medals!",
  he: "בפנדמוניום שחקנים מתמודדים אחד מול אחד. לכל זוג יש שאלה — שני השחקנים עונים עליה, וכולם מצביעים על התשובה הטובה יותר. זכייה בקולות מזכה בנקודות. המשחק מסתיים בסיבוב פתוח שבו מחלקים מדליות!",
};

const PandamoniumPlugin: GamePlugin = {
  game_type: "pandamonium",
  display_name: "Pandamonium",
  intro_text: INTRO_TEXT,

  validateContent() {
    const en = loadFacts("en");
    console.log(`[Pandamonium] Loaded ${en.length} facts (en)`);
    const he = loadFacts("he");
    console.log(`[Pandamonium] Loaded ${he.length} facts (he)`);
  },

  startGame(state: GameState, payload: unknown, broadcast: BroadcastFn): GameState {
    const p = payload as {
      total_rounds?: number;
      prompt_timer_seconds?: number;
      language?: string;
      intro_enabled?: boolean;
    };

    const connected = state.players.filter((pl) => pl.is_connected);
    if (connected.length < PM_MIN_PLAYERS) {
      return state;
    }

    let totalRounds = typeof p?.total_rounds === "number" ? p.total_rounds : PM_DEFAULT_TOTAL_ROUNDS;
    totalRounds = Math.max(PM_MIN_ROUNDS, Math.min(PM_MAX_ROUNDS, totalRounds));

    let promptTimerSeconds = typeof p?.prompt_timer_seconds === "number" ? p.prompt_timer_seconds : 60;
    if (!VALID_TIMER_PRESETS.includes(promptTimerSeconds)) promptTimerSeconds = 60;

    const lang =
      typeof p?.language === "string" &&
      (SUPPORTED_LANGUAGES as readonly string[]).includes(p.language)
        ? p.language
        : DEFAULT_LANGUAGE;
    state.language = lang;
    state.debuffs_enabled = false;
    state.intro_enabled = p?.intro_enabled !== false;
    state.intro_text = INTRO_TEXT;

    initPMGame(state, totalRounds, promptTimerSeconds);

    if (state.intro_enabled) {
      startIntroPhase(state, broadcast, () => startFirstPMPhase(state, broadcast));
    } else {
      startFirstPMPhase(state, broadcast);
    }

    return state;
  },

  handleEvent(event: string, payload: unknown, ctx: GameEventContext): boolean {
    const { io, socket, state, roomCode, broadcast } = ctx;

    switch (event) {
      case "SKIP_INTRO": {
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) return true;
        handleIntroSkip(state, player.session_id, broadcast, () => startFirstPMPhase(state, broadcast));
        return true;
      }

      case "PM_SUBMIT_ANSWER": {
        const p = payload as { matchup_id?: string; answer?: string };

        if (
          state.phase !== GamePhase.PM_WRITING &&
          state.phase !== GamePhase.PM_FINAL_WRITING
        ) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in a writing phase" });
          return true;
        }

        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) {
          socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
          return true;
        }

        const result = validateLie(p?.answer);
        if (!result.valid) {
          socket.emit("ERROR", { code: "INVALID_ANSWER", message: result.error });
          return true;
        }
        const answerText = result.value;

        if (state.phase === GamePhase.PM_FINAL_WRITING) {
          if ((state.pm_final_answers ?? {})[player.session_id] !== undefined) {
            socket.emit("ERROR", { code: "ALREADY_SUBMITTED", message: "Already submitted final answer" });
            return true;
          }
          if (!state.pm_final_answers) state.pm_final_answers = {};
          state.pm_final_answers[player.session_id] = answerText;
          player.round.submitted_lie = answerText;
          broadcast(roomCode, state);
          checkAllPMFinalAnswersSubmitted(state, broadcast);
          return true;
        }

        // PM_WRITING
        const matchupId = p?.matchup_id;
        if (typeof matchupId !== "string") {
          socket.emit("ERROR", { code: "MISSING_MATCHUP_ID", message: "matchup_id required" });
          return true;
        }
        const matchup = (state.pm_matchups ?? []).find((m) => m.matchup_id === matchupId);
        if (!matchup) {
          socket.emit("ERROR", { code: "MATCHUP_NOT_FOUND", message: "Matchup not found" });
          return true;
        }
        if (matchup.player_a_session_id === player.session_id) {
          if (matchup.player_a_submitted) {
            socket.emit("ERROR", { code: "ALREADY_SUBMITTED", message: "Already submitted" });
            return true;
          }
          matchup.player_a_answer = answerText;
          matchup.player_a_submitted = true;
        } else if (matchup.player_b_session_id === player.session_id) {
          if (matchup.player_b_submitted) {
            socket.emit("ERROR", { code: "ALREADY_SUBMITTED", message: "Already submitted" });
            return true;
          }
          matchup.player_b_answer = answerText;
          matchup.player_b_submitted = true;
        } else {
          socket.emit("ERROR", { code: "NOT_IN_MATCHUP", message: "You are not in this matchup" });
          return true;
        }

        // Use submitted_lie as progress sentinel — mark non-null when both matchups answered
        const myMatchups = (state.pm_matchups ?? []).filter(
          (m) =>
            m.player_a_session_id === player.session_id ||
            m.player_b_session_id === player.session_id
        );
        const bothSubmitted = myMatchups.every((m) =>
          m.player_a_session_id === player.session_id ? m.player_a_submitted : m.player_b_submitted
        );
        if (bothSubmitted) player.round.submitted_lie = "done";

        broadcast(roomCode, state);
        checkAllPMAnswersSubmitted(state, broadcast);
        return true;
      }

      case "PM_VOTE": {
        const p = payload as { vote?: string };
        if (state.phase !== GamePhase.PM_MATCHUP) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in PM_MATCHUP phase" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) {
          socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
          return true;
        }
        const idx = state.pm_matchup_index ?? 0;
        const matchup = state.pm_matchups?.[idx];
        if (!matchup) return true;

        if (
          player.session_id === matchup.player_a_session_id ||
          player.session_id === matchup.player_b_session_id
        ) {
          socket.emit("ERROR", { code: "PARTICIPANT_CANNOT_VOTE", message: "You are in this matchup" });
          return true;
        }
        if (matchup.votes[player.session_id] !== undefined) {
          socket.emit("ERROR", { code: "ALREADY_VOTED", message: "Already voted" });
          return true;
        }
        const vote = p?.vote;
        if (vote !== "a" && vote !== "b") {
          socket.emit("ERROR", { code: "INVALID_VOTE", message: "Vote must be 'a' or 'b'" });
          return true;
        }
        // If that side is hidden, flip to the other
        const effectiveVote: 'a' | 'b' =
          (vote === "a" && matchup.a_hidden) ? "b"
          : (vote === "b" && matchup.b_hidden) ? "a"
          : vote;

        matchup.votes[player.session_id] = effectiveVote;
        matchup.player_a_vote_count = Object.values(matchup.votes).filter((v) => v === "a").length;
        matchup.player_b_vote_count = Object.values(matchup.votes).filter((v) => v === "b").length;

        broadcast(roomCode, state);
        checkAllPMMatchupVotesSubmitted(state, broadcast);
        return true;
      }

      case "PM_REACTION": {
        if (state.phase !== GamePhase.PM_MATCHUP) return true;
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) return true;
        const p = payload as { reaction?: string };
        const reaction = p?.reaction;
        if (!reaction || !(PM_ALLOWED_REACTIONS as readonly string[]).includes(reaction)) return true;
        io.to(roomCode).emit("PM_REACTION", { reaction, display_name: player.display_name });
        return true;
      }

      case "PM_AWARD_MEDAL": {
        if (state.phase !== GamePhase.PM_FINAL_REVEAL) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in PM_FINAL_REVEAL phase" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player) {
          socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
          return true;
        }
        const p = payload as { target_session_id?: string };
        const targetId = p?.target_session_id;
        if (typeof targetId !== "string") {
          socket.emit("ERROR", { code: "INVALID_TARGET", message: "target_session_id required" });
          return true;
        }
        if (targetId === player.session_id) {
          socket.emit("ERROR", { code: "SELF_MEDAL", message: "Cannot medal yourself" });
          return true;
        }
        const target = state.players.find((pl) => pl.session_id === targetId);
        if (!target) {
          socket.emit("ERROR", { code: "INVALID_TARGET", message: "Target not found" });
          return true;
        }
        if (!state.pm_medals) state.pm_medals = {};
        const myMedals = state.pm_medals[player.session_id] ?? [];
        const existingIdx = myMedals.indexOf(targetId);
        if (existingIdx >= 0) {
          myMedals.splice(existingIdx, 1);
        } else {
          if (myMedals.length >= PM_MEDALS_PER_PLAYER) {
            socket.emit("ERROR", { code: "MEDAL_LIMIT", message: `Max ${PM_MEDALS_PER_PLAYER} medals` });
            return true;
          }
          myMedals.push(targetId);
        }
        state.pm_medals[player.session_id] = myMedals;
        broadcast(roomCode, state);
        return true;
      }

      case "PM_PANIC": {
        if (state.phase !== GamePhase.PM_MATCHUP && state.phase !== GamePhase.PM_MATCHUP_RESULT) {
          socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in matchup phase" });
          return true;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player || player.session_id !== state.room_master_session_id) {
          socket.emit("ERROR", { code: "NOT_HOST", message: "Only the host can use panic" });
          return true;
        }
        const p = payload as { player?: string };
        const side = p?.player;
        if (side !== "a" && side !== "b") {
          socket.emit("ERROR", { code: "INVALID_SIDE", message: "player must be 'a' or 'b'" });
          return true;
        }
        const idx = state.pm_matchup_index ?? 0;
        const matchup = state.pm_matchups?.[idx];
        if (!matchup) return true;
        if (side === "a") matchup.a_hidden = true;
        else matchup.b_hidden = true;
        broadcast(roomCode, state);
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
    state.pm_matchups = undefined;
    state.pm_matchup_index = undefined;
    state.pm_final_answers = undefined;
    state.pm_final_answer_cards = undefined;
    state.pm_medals = undefined;
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
    clearRoomTimersPM(state.room_code);
    return state;
  },

  onPlayerDisconnect(state: GameState, broadcast: BroadcastFn): void {
    checkIntroSkipAfterDisconnect(state, () => startFirstPMPhase(state, broadcast));
    checkAllPMAnswersSubmitted(state, broadcast);
    checkAllPMMatchupVotesSubmitted(state, broadcast);
    checkAllPMFinalAnswersSubmitted(state, broadcast);
  },
};

registerGame(PandamoniumPlugin);
export default PandamoniumPlugin;
