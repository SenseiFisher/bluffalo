import React from 'react'

export interface LobbySettingsProps {
  canStart: boolean;
  connectedPlayerCount: number;
}

export interface GameClientPlugin {
  game_type: string;
  display_name: string;
  GameRouter: React.ComponentType;
  LobbySettings: React.ComponentType<LobbySettingsProps>;
}

const registry = new Map<string, GameClientPlugin>()

export function registerClientGame(plugin: GameClientPlugin): void {
  registry.set(plugin.game_type, plugin)
}

export function getClientGame(game_type: string): GameClientPlugin | undefined {
  return registry.get(game_type)
}

export function listClientGames(): GameClientPlugin[] {
  return Array.from(registry.values())
}
