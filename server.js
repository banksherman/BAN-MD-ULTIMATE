// BAN-MD Ultimate Bot Server
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
import config from "./config.js";

const app = express();
const __dirname = path.resolve();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// -------------------- Globals --------------------
let sock;
let lastQR = null;
let qrAt = null;
let jid = null;
const QR_TTL = 20_000;
const SESS_DIR = "./sessions";

// -------------------- Helpers --------------------
function broadcast(event, data) {
  console.log(`📢 Event: ${event}`, data);
}

// -------------------- WhatsApp Socket --------------------
async function startSock() {
  let state, saveCreds;

  // ✅ If SESSION_ID is provided, use it directly
  if (config.SESSION_ID && config.SESSION_ID !== "") {
    console.log("🔑 Using provided SESSION_ID:", config.SESSION_ID);

    // Fake auth state from SESSION_ID
    state = {
      creds: {
        noiseKey: {},
        signedIdentityKey: {},
        signedPreKey: {},
        registrationId: 0,
        advSecretKey: config.SESSION_ID,
        account: {},
        me: { id: config.SESSION_ID, name: config.BOT_NAME }
      },
      keys: { get: () => ({}), set: () => {} }
    };

    saveCreds = async () => {};
  } else {
    // 📸 Normal QR-based login (first time)
    console.log("📸 No SESSION_ID found, using QR login...");
    const auth = await useMultiFileAuthState(SESS_DIR);
    state = auth.state;
    saveCreds = auth.saveCreds;
  }

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: [config.BOT_NAME, "Chrome", "120.0.0.0"],
    markOnlineOnConnect: config.ALWAYS_ONLINE,
    syncFullHistory: false,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 15_000
  });

  if (saveCreds) sock.ev.on("creds.update", saveCreds);

  // 🔄 Connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !config.SESSION_ID) {
      lastQR = qr;
      qrAt = Date.now();
      console.log("🔐 New QR generated (valid ~20s)...");
      setTimeout(() => {
        if (Date.now() - qrAt > QR_TTL) lastQR = null;
      }, QR_TTL + 2000);
    }

    if (connection === "open") {
      jid = sock?.user?.id;
      console.log("✅ WhatsApp connected:", jid);
      broadcast("connected", { jid, sessionId: config.SESSION_ID || "QR-MODE" });

      try {
        await sock.sendMessage(jid, {
          text: `🤖 *${config.BOT_NAME} Connected!*\n\n✅ Session ID:\n${config.SESSION_ID || "QR-MODE"}\n🎵 Welcome aboard!`
        });
      } catch (err) {
        console.error("❌ Failed to send welcome DM:", err);
      }

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

  // 📩 Message handler
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const type = Object.keys(msg.message)[0];
      const body =
        type === "conversation"
          ? msg.message.conversation
          : type === "extendedTextMessage"
          ? msg.message.extendedTextMessage.text
          : "";

      console.log(`💬 Message from ${from}: ${body}`);

      // Handle commands here (ping/menu/etc.)
      if (body.startsWith(config.PREFIX)) {
        const cmd = body.slice(config.PREFIX.length).trim().toLowerCase();
        if (cmd === "ping") {
          await sock.sendMessage(from, { text: `🏓 Pong! ${config.BOT_NAME} is alive.` });
        }
      }
    } catch (err) {
      console.error("❌ Error in message handler:", err);
    }
  });
}

// -------------------- API --------------------
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

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
