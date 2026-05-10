import { registerClientGame } from '../registry'
import BluffaloGameRouter from './GameRouter'
import BluffaloLobbySettings from './LobbySettings'

registerClientGame({
  game_type: 'bluffalo',
  display_name: 'Bluffalo',
  GameRouter: BluffaloGameRouter,
  LobbySettings: BluffaloLobbySettings,
})
