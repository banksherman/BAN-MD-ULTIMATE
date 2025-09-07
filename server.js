// server.js — BAN-MD Ultimate (Node 18+)
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pino from "pino";
import { fileURLToPath } from "url";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const app        = express();
const PORT       = process.env.PORT || 3000;

// -------------------- Static & basics --------------------
app.use(cors());
app.use(express.json());

// Ensure folders exist
const PUBLIC_DIR  = path.join(__dirname, "public");
const SESS_DIR    = path.join(__dirname, "sessions");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(SESS_DIR))   fs.mkdirSync(SESS_DIR,   { recursive: true });

// Serve static files (index.html goes here)
app.use(express.static(PUBLIC_DIR));

// -------------------- SSE (events) -----------------------
/** Simple Server-Sent Events for frontend status updates (e.g., "connected") */
const sseClients = new Set();
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write(`event: ping\ndata: ok\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});
const broadcast = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) c.write(payload);
};

// -------------------- Health & QR endpoints --------------
let sock = null;
let lastQR = null;
let qrAt  = 0; // ms timestamp when we stored it
const QR_TTL = 20000; // WhatsApp QR validity window (~20s)

app.get("/api", (_req, res) => res.json({ ok: true, message: "BAN-MD Ultimate API ✅" }));

app.get("/qr", (_req, res) => {
  // Never serve expired QR
  if (!lastQR || Date.now() - qrAt > QR_TTL) {
    return res.status(404).json({ ok: false, message: "QR expired or not ready" });
  }
  return res.json({ ok: true, qr: lastQR });
});

// -------------------- WhatsApp Socket --------------------
const logger = pino({ level: "silent" });

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["BAN-MD-Ultimate", "Chrome", "120.0.0.0"],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 15_000
    // printQRInTerminal is deprecated; we’ll emit QR via connection.update
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      qrAt = Date.now();
      // Clear stale QR after TTL (fallback, frontend also checks)
      setTimeout(() => { if (Date.now() - qrAt > QR_TTL) lastQR = null; }, QR_TTL + 2000);
      console.log("🔐 New QR generated (valid ~20s)...");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connected:", sock?.user?.id);
      // Notify frontend and send a welcome DM
      const jid = sock?.user?.id;
      broadcast("connected", { jid });
      if (jid) {
        sock.sendMessage(jid, {
          text: `🤖 Welcome to BAN-MD Ultimate!\n✅ Session ID: ${jid}\n🎵 Enjoy the vibes!`
        }).catch(() => {});
      }
      // Invalidate QR once connected
      lastQR = null;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
      console.log("❌ Connection closed.", { code, shouldReconnect });

      // If not logged out, try reconnecting
      if (shouldReconnect) {
        setTimeout(startSock, 2000);
      } else {
        console.log("🛑 Logged out. Delete sessions/ to link again.");
      }
    }
  });
}

// Boot
startSock().catch((e) => {
  console.error("startSock failed:", e);
  process.exit(1);
});

// Basic error guards to avoid silent crashes
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

// Start HTTP server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
