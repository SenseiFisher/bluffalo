import * as dotenv from "dotenv";
dotenv.config();

import "./games/bluffalo/index"; // registers the Bluffalo plugin (side-effect)
import { listGames, getGame } from "./games/registry";
import { createApp } from "./server";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Validate content for all registered games before starting
try {
  for (const { game_type } of listGames()) {
    getGame(game_type)!.validateContent();
  }
} catch (err) {
  console.error("[Server] Failed to validate game content:", err);
  process.exit(1);
}

const { httpServer } = createApp();

httpServer.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Server] NODE_ENV: ${process.env.NODE_ENV ?? "development"}`);
});
