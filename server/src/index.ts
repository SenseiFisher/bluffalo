import * as dotenv from "dotenv";
dotenv.config();

import { loadFacts } from "./content/loader";
import { createApp } from "./server";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Load and validate facts for all supported languages before starting
try {
  const en = loadFacts("en");
  console.log(`[Server] Loaded ${en.length} facts (en)`);
  const he = loadFacts("he");
  console.log(`[Server] Loaded ${he.length} facts (he)`);
} catch (err) {
  console.error("[Server] Failed to load facts:", err);
  process.exit(1);
}

const { httpServer } = createApp();

httpServer.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Server] NODE_ENV: ${process.env.NODE_ENV ?? "development"}`);
});
