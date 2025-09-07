// BAN-MD Ultimate Pairing Server
// Node.js v20 LTS recommended

import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

const app = express();
const __dirname = path.resolve();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// -------------------- Globals --------------------
let sock;
let lastQR = null;
let qrAt = null;
let jid = null;
const QR_TTL = 20_000; // 20s validity
const SESS_DIR = "./sessions";

// -------------------- Helpers --------------------
function generateSessionId() {
  return "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Broadcast stub (for frontend/WebSocket if needed)
function broadcast(event, data) {
  console.log(`📢 Event: ${event}`, data);
}

// -------------------- WhatsApp Socket --------------------
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["BAN-MD-Ultimate", "Chrome", "120.0.0.0"],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 15_000
    // printQRInTerminal deprecated → we handle via connection.update
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      qrAt = Date.now();
      console.log("🔐 New QR generated (valid ~20s)...");
      // Auto-clear QR after TTL
      setTimeout(() => {
        if (Date.now() - qrAt > QR_TTL) lastQR = null;
      }, QR_TTL + 2000);
    }

    if (connection === "open") {
      jid = sock?.user?.id;
      const sessionId = generateSessionId();
      console.log("✅ WhatsApp connected:", jid);
      console.log("🆔 Session ID:", sessionId);

      // Broadcast to frontend (if needed)
      broadcast("connected", { jid, sessionId });

      // Send a welcome DM
      const imagePath = path.join(__dirname, "public", "connected.jpg");
      if (fs.existsSync(imagePath)) {
        await sock.sendMessage(jid, {
          image: fs.readFileSync(imagePath),
          caption: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ Session ID:\n${sessionId}\n🎵 Welcome aboard!`
        });
      } else {
        await sock.sendMessage(jid, {
          text: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ Session ID:\n${sessionId}\n🎵 Welcome aboard!`
        });
      }

      // Clear QR once logged in
      lastQR = null;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
      console.log("❌ Connection closed.", { code, shouldReconnect });

      if (shouldReconnect) {
        setTimeout(startSock, 2000);
      } else {
        console.log("🛑 Logged out. Delete sessions/ to relink.");
      }
    }
  });
}

// -------------------- API Endpoints --------------------
// Endpoint to fetch current QR
app.get("/qr", (req, res) => {
  if (!lastQR) return res.status(404).json({ ok: false, message: "No QR available" });

  const age = Date.now() - qrAt;
  if (age > QR_TTL) {
    lastQR = null;
    return res.status(410).json({ ok: false, message: "QR expired" });
  }

  res.json({ ok: true, qr: lastQR, ttl: QR_TTL - age });
});

// -------------------- Boot --------------------
startSock().catch((e) => {
  console.error("startSock failed:", e);
  process.exit(1);
});

// Error guards
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

// Start HTTP server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

// 🔥 endpoint for frontend QR
app.get("/qr", (req, res) => {
  if (!lastQR) {
    return res.status(404).json({ ok: false, message: "No QR yet" });
  }
  res.json({ ok: true, qr: lastQR });
});

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);

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
