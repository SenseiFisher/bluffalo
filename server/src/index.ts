import * as dotenv from "dotenv";
dotenv.config();

import { loadFacts } from "./content/loader";
import { createApp } from "./server";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Load and validate facts before starting the server
try {
  const facts = loadFacts();
  console.log(`[Server] Loaded ${facts.length} facts`);
} catch (err) {
  console.error("[Server] Failed to load facts:", err);
  process.exit(1);
}

const { httpServer } = createApp();

httpServer.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Server] NODE_ENV: ${process.env.NODE_ENV ?? "development"}`);
});
