import { Server, Socket } from "socket.io";
import { GameState, GameListItem } from "../../../shared/types";

export type BroadcastFn = (roomCode: string, state: GameState) => void;

export interface GameEventContext {
  io: Server;
  socket: Socket;
  state: GameState;
  roomCode: string;
  broadcast: BroadcastFn;
}

export interface GamePlugin {
  game_type: string;
  display_name: string;
  startGame(state: GameState, payload: unknown, broadcast: BroadcastFn): GameState;
  handleEvent(event: string, payload: unknown, ctx: GameEventContext): boolean;
  resetToLobby(state: GameState): GameState;
  onPlayerDisconnect(state: GameState, broadcast: BroadcastFn): void;
  validateContent(): void;
}

const registry = new Map<string, GamePlugin>();

export function registerGame(plugin: GamePlugin): void {
  registry.set(plugin.game_type, plugin);
}

export function getGame(game_type: string): GamePlugin | undefined {
  return registry.get(game_type);
}

export function listGames(): GameListItem[] {
  return Array.from(registry.values()).map((p) => ({
    game_type: p.game_type,
    display_name: p.display_name,
  }));
}
