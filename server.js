// server.js — BAN-MD ULTIMATE WHATSAPP BOT
import express from "express";
import cors from "cors";
import pino from "pino";
import NodeCache from "node-cache";
import path from "path";
import { fileURLToPath } from "url";
import { Boom } from "@hapi/boom";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

import { loadAllCommands, handleUpsert, setModerationHook } from "./src/handler.js";
import cfg from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serve landing page

const PORT = process.env.PORT || 3000;
let sock = null;
let commands = new Map();
const cache = new NodeCache();

// Health
app.get("/api", (_req, res) =>
  res.json({ ok: true, message: "BAN-MD Ultimate API ✅" })
);

// QR endpoint
app.get("/qr", async (_req, res) => {
  try {
    if (!sock) await startSock();
    const qr = await waitForQr(30000);
    if (!qr) return res.status(504).json({ ok: false, message: "No QR yet" });
    res.json({ ok: true, qr });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// Pair with 8-digit code
app.

