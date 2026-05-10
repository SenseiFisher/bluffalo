import { registerClientGame } from '../registry'
import PandamoniumGameRouter from './GameRouter'
import PandamoniumLobbySettings from './LobbySettings'

registerClientGame({
  game_type: 'pandamonium',
  display_name: 'Pandamonium',
  GameRouter: PandamoniumGameRouter,
  LobbySettings: PandamoniumLobbySettings,
})
