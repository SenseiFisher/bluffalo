"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initServer = initServer;
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path = __importStar(require("path"));
const index_1 = require("./handlers/index");
const roomStore_1 = require("./rooms/roomStore");
const stateMachine_1 = require("./rooms/stateMachine");
const roomStore_2 = require("./rooms/roomStore");
function initServer(httpServer) {
    const app = httpServer
        ._events?.request;
    // Register the getRoom function with stateMachine (avoids circular dep)
    (0, stateMachine_1.registerGetRoom)(roomStore_2.getRoom);
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    io.on("connection", (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);
        (0, index_1.registerHandlers)(io, socket);
    });
}
function createApp() {
    const app = (0, express_1.default)();
    const httpServer = (0, http_1.createServer)(app);
    app.use(express_1.default.json());
    // Serve compiled React in production
    if (process.env.NODE_ENV === "production") {
        const publicDir = path.resolve(__dirname, "../../public");
        app.use(express_1.default.static(publicDir));
    }
    // API: Get a fresh room code
    app.get("/api/room/code", (_req, res) => {
        try {
            const code = (0, roomStore_1.generateRoomCode)();
            res.json({ code });
        }
        catch (err) {
            res.status(500).json({ error: "Could not generate room code" });
        }
    });
    // Fallback: serve React app for all other routes in production
    if (process.env.NODE_ENV === "production") {
        const publicDir = path.resolve(__dirname, "../../public");
        app.get("*", (_req, res) => {
            res.sendFile(path.join(publicDir, "index.html"));
        });
    }
    // Register getRoom with stateMachine
    (0, stateMachine_1.registerGetRoom)(roomStore_2.getRoom);
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    io.on("connection", (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);
        (0, index_1.registerHandlers)(io, socket);
    });
    return { app, httpServer };
}
