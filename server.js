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

// ---------------- Globals ----------------
let sock;
let lastQR = null;
let qrAt = null;
let jid = null;
let botReady = false;

const QR_TTL = 20_000; // QR valid for 20s
const SESS_DIR = "./sessions";
const PREFIX = "!"; // command prefix

// Store pairing codes and linked numbers
const pairCodes = new Map(); // code => { number, linked: false, timestamp }

// Example commands
const commands = ["menu", "ping", "alive"];

// ---------------- Helpers ----------------
function generateSessionId() {
  return "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
}

// ---------------- WhatsApp Socket ----------------
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

  // ---------------- Connection Updates ----------------
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      qrAt = Date.now();
      botReady = false;
      console.log("🔐 New QR generated (valid ~20s)...");
      setTimeout(() => {
        if (Date.now() - qrAt > QR_TTL) lastQR = null;
      }, QR_TTL + 2000);
    }

    if (connection === "open") {
      jid = sock?.user?.id;
      const sessionId = generateSessionId();
      botReady = true;
      console.log("✅ WhatsApp connected:", jid);
      console.log("🆔 Session ID:", sessionId);

      // Send welcome message
      const contactName = jid.split("@")[0];
      const imagePath = path.join(__dirname, "public", "connected.jpg");
      try {
        if (fs.existsSync(imagePath)) {
          await sock.sendMessage(jid, {
            image: fs.readFileSync(imagePath),
            caption: `🤖 *BAN-MD Ultimate Connected!*\n✅ Session ID: ${sessionId}\n🎵 Welcome, ${contactName}!`
          });
        } else {
          await sock.sendMessage(jid, {
            text: `🤖 *BAN-MD Ultimate Connected!*\n✅ Session ID: ${sessionId}\n🎵 Welcome, ${contactName}!`
          });
        }
      } catch (err) {
        console.error("❌ Failed to send welcome DM:", err);
      }

      lastQR = null;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
      console.log("❌ Connection closed.", { code, shouldReconnect });
      botReady = false;
      if (shouldReconnect) setTimeout(startSock, 2000);
      else console.log("🛑 Logged out. Delete sessions/ to relink.");
    }
  });

  // ---------------- Message Handler ----------------
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) return;

      console.log("📩 Message received:", text);

      // -------- Handle Commands --------
      if (text.startsWith(PREFIX)) {
        const cmd = text.slice(PREFIX.length).trim().toLowerCase();

        if (cmd === "menu") {
          let contactName = from.split("@")[0];
          const menuMessage = `Hey there 😀💻 ${contactName}\n\n╭───〔  *BAN-MD Ultimate* 〕──────┈⊷\n├──────────────\n│✵│▸ 𝗣𝗿𝗲𝗳𝗶𝘅: [ ${PREFIX} ]\n│✵│▸ 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀: ${commands.length}\n╰─────────────────────⊷\n` +
            commands.map(c => `💠 ${PREFIX}${c}`).join("\n");

          const imagePath = path.join(__dirname, "public", "menu.jpg");
          if (fs.existsSync(imagePath)) {
            await sock.sendMessage(from, { image: fs.readFileSync(imagePath), caption: menuMessage });
          } else {
            await sock.sendMessage(from, { text: menuMessage });
          }
          return;
        }

        if (cmd === "ping") {
          const start = Date.now();
          await sock.sendMessage(from, { text: "🏓 Pong!" });
          const end = Date.now();
          await sock.sendMessage(from, { text: `⚡ Response Time: ${end - start}ms` });
          return;
        }

        if (cmd === "alive") {
          await sock.sendMessage(from, { text: "✅ YES AM ONLINE BAN-MD-ULTIMATE 😀😀 HEHE" });
          return;
        }

        // Unknown command
        await sock.sendMessage(from, { text: `❌ Unknown command. Type ${PREFIX}menu to see all commands.` });
      }

    } catch (err) {
      console.error("❌ Error handling message:", err);
    }
  });
}

// ---------------- API Endpoints ----------------

// QR endpoint
app.get("/qr", (req, res) => {
  if (!lastQR) return res.status(404).json({ ok: false, message: "No QR available" });
  const age = Date.now() - qrAt;
  if (age > QR_TTL) {
    lastQR = null;
    return res.status(410).json({ ok: false, message: "QR expired" });
  }
  res.json({ ok: true, qr: lastQR, ttl: QR_TTL - age });
});

// Status endpoint
app.get("/status", (req, res) => {
  res.json({ ready: botReady });
});

// Pairing code endpoint
app.get("/pair", (req, res) => {
  if (!botReady) return res.json({ ok: false, message: "Bot not ready yet. Try again in a few seconds." });
  const number = req.query.number;
  if (!number) return res.json({ ok: false, message: "Provide your WhatsApp number" });

  const code = Math.floor(10000000 + Math.random() * 90000000).toString();
  pairCodes.set(code, { number, linked: false, timestamp: Date.now() });

  console.log(`📲 New pair code generated for ${number}: ${code}`);
  res.json({ ok: true, code });
});

// ---------------- Boot ----------------
startSock().catch(e => {
  console.error("startSock failed:", e);
  process.exit(1);
});

process.on("uncaughtException", e => console.error("uncaughtException", e));
process.on("unhandledRejection", e => console.error("unhandledRejection", e));

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});


