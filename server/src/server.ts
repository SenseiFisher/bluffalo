import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import * as path from "path";
import { registerHandlers } from "./handlers/index";
import { registerGameEventForwarder } from "./handlers/gameRouter";
import { generateRoomCode, findNearbyRoom, getRoom } from "./rooms/roomStore";
import { registerGetRoom } from "./games/bluffalo/stateMachine";
import { registerGetRoomPM } from "./games/pandamonium/stateMachine";
import { listGames } from "./games/registry";

export function initServer(httpServer: ReturnType<typeof createServer>): void {
  const app = (httpServer as unknown as { _events: { request: express.Application } })
    ._events?.request as express.Application | undefined;

  // Register the getRoom function with stateMachines (avoids circular dep)
  registerGetRoom(getRoom);
  registerGetRoomPM(getRoom);

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    registerHandlers(io, socket);
    registerGameEventForwarder(io, socket);
  });
}

export function createApp(): { app: express.Application; httpServer: ReturnType<typeof createServer> } {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json());

  // Serve compiled React in production
  if (process.env.NODE_ENV === "production") {
    const publicDir = path.resolve(__dirname, "../../../public");
    app.use(express.static(publicDir));
  }

  // API: Get a fresh room code
  app.get("/api/room/code", (_req, res) => {
    try {
      const code = generateRoomCode();
      res.json({ code });
    } catch (err) {
      res.status(500).json({ error: "Could not generate room code" });
    }
  });

  // API: List available games
  app.get("/api/games", (_req, res) => {
    res.json(listGames());
  });

  // API: Find nearest open LOBBY-phase room
  app.get("/api/rooms/nearby", (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: "Invalid coordinates" });
      return;
    }
    res.json({ code: findNearbyRoom(lat, lng, 50) });
  });

  // Fallback: serve React app for all other routes in production
  if (process.env.NODE_ENV === "production") {
    const publicDir = path.resolve(__dirname, "../../../public");
    app.get("*", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  // Register getRoom with stateMachines
  registerGetRoom(getRoom);
  registerGetRoomPM(getRoom);

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    registerHandlers(io, socket);
    registerGameEventForwarder(io, socket);
  });

  return { app, httpServer };
}
