// BAN-MD Ultimate Pairing Server
// Node.js v20+ recommended

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
const QR_TTL = 20_000; // QR valid for 20 seconds
const SESS_DIR = "./sessions";

// -------------------- Helpers --------------------
function generateSessionId() {
  return "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
}

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
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      qrAt = Date.now();
      console.log("🔐 New QR generated (valid ~20s)...");
      setTimeout(() => {
        if (Date.now() - qrAt > QR_TTL) lastQR = null;
      }, QR_TTL + 2000);
    }

    if (connection === "open") {
      jid = sock?.user?.id;
      const sessionId = generateSessionId();
      console.log("✅ WhatsApp connected:", jid);
      console.log("🆔 Session ID:", sessionId);

      broadcast("connected", { jid, sessionId });

      // 📩 Send welcome DM with Session ID
      const imagePath = path.join(__dirname, "public", "connected.jpg");
      try {
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
      } catch (err) {
        console.error("❌ Failed to send welcome DM:", err);
      }

      lastQR = null; // clear QR after success
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

process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
