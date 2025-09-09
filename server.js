// BAN-MD Ultimate Pair-Code Server
// Node.js v20+ recommended

import express from "express";
import path from "path";
import pino from "pino";
import fs from "fs";
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
app.use(express.json());

let sock;
let jid = null;
const SESS_DIR = "./sessions";

// -------------------- Helpers --------------------
function generateSessionId() {
  return "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["BAN-MD-Ultimate", "Chrome", "120.0.0.0"],
    markOnlineOnConnect: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      jid = sock?.user?.id;
      const sessionId = generateSessionId();
      console.log("✅ Connected:", jid);
      console.log("🆔 Session ID:", sessionId);

      try {
        await sock.sendMessage(jid, {
          text: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ Session ID:\n${sessionId}\n🎉 Welcome!`
        });
      } catch (err) {
        console.error("❌ Failed to send welcome:", err);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("❌ Connection closed.", { code, shouldReconnect });
      if (shouldReconnect) setTimeout(startSock, 2000);
      else console.log("🛑 Logged out. Delete sessions/ to relink.");
    }
  });

  // Handle incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) return;

      console.log("📩 Message:", text);

      if (text.toLowerCase() === "!ping") {
        const start = Date.now();
        await sock.sendMessage(from, { text: "Pong 🏓" });
        const end = Date.now();
        await sock.sendMessage(from, { text: `⚡ Speed: ${end - start}ms` });
      }

      if (text.toLowerCase() === "!alive") {
        await sock.sendMessage(from, {
          text: "YES AM ONLINE ✅\nBAN-MD-ULTIMATE 😀😀 HEHE"
        });
      }

      if (text.toLowerCase() === "!menu") {
        await sock.sendMessage(from, {
          text: "📜 *BAN-MD Ultimate Menu*\n\n1. !ping\n2. !alive\n(More commands coming...)"
        });
      }
    } catch (err) {
      console.error("❌ Message handling error:", err);
    }
  });
}

// -------------------- API Routes --------------------
app.get("/pair", async (req, res) => {
  const number = req.query.number;
  if (!number) return res.json({ ok: false, message: "Number required" });

  try {
    if (!sock) await startSock();
    const code = await sock.requestPairingCode(number);
    console.log(`📲 Pairing code for ${number}: ${code}`);
    res.json({ ok: true, code });
  } catch (err) {
    console.error("❌ Pair code error:", err);
    res.json({ ok: false, message: "Failed to generate code" });
  }
});

// -------------------- Boot --------------------
startSock().catch(e => console.error("startSock failed:", e));

app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
