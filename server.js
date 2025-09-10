// BAN-MD Ultimate Pairing + Basic Commands (Render-ready)
// Node.js v20+ recommended

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import crypto from "crypto";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const PREFIX = "!"; // command prefix
let sock;

// Ensure sessions folder exists
const SESS_DIR = "./sessions";
if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR);

// Generate session ID (random 8 bytes hex)
function generateSessionId() {
  return crypto.randomBytes(8).toString("hex");
}

// -------------------- Start WhatsApp Socket --------------------
async function startSock() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
    });

    sock.ev.on("creds.update", saveCreds);

    // Connection updates
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log("✅ WhatsApp connected!");
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
        console.log("❌ Connection closed.", { code, shouldReconnect });
        if (shouldReconnect) setTimeout(startSock, 5000);
        else console.log("🛑 Logged out. Delete sessions/ to relink.");
      }
    });

    // Message handler
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      if (!body.startsWith(PREFIX)) return;

      const cmd = body.slice(PREFIX.length).trim().split(" ")[0].toLowerCase();
      const userName = msg.pushName || "User";

      if (cmd === "ping") {
        const start = Date.now();
        await sock.sendMessage(from, { text: `Pong 🏓` });
        const end = Date.now();
        await sock.sendMessage(from, { text: `⏱ Speed: ${end - start}ms` });
      } else if (cmd === "alive") {
        await sock.sendMessage(from, {
          text: `✅ YES AM ONLINE\nBAN-MD-ULTIMATE 😀😀 HEHE`
        });
      } else if (cmd === "menu") {
        let menuMsg = `Hey there 😀💻 ${userName}\n\n`;
        menuMsg += `╭───〔  *BAN-MD Ultimate* 〕──────┈⊷\n`;
        menuMsg += `├──────────────\n`;
        menuMsg += `│✵│▸ 𝗣𝗿𝗲𝗳𝗶𝘅: [ ${PREFIX} ]\n`;
        menuMsg += `│✵│▸ 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀: ping, alive, menu\n`;
        menuMsg += `╰──────────────────────⊷`;
        await sock.sendMessage(from, { text: menuMsg });
      } else {
        await sock.sendMessage(from, {
          text: `❌ Unknown command. Type ${PREFIX}menu to see available commands.`
        });
      }
    });

  } catch (err) {
    console.error("❌ startSock error:", err);
    setTimeout(startSock, 5000); // retry after 5s
  }
}

// -------------------- API Endpoints --------------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/pair", async (req, res) => {
  if (!sock) return res.json({ ok: false, message: "Bot not ready yet" });

  const number = req.query.number;
  if (!number) return res.json({ ok: false, message: "Number required" });

  try {
    // Generate random 8-digit code
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    const sessionId = generateSessionId();

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    await sock.sendMessage(jid, {
      text: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ Welcome!\n🆔 Your Session ID: ${sessionId}\n\nType !menu to see commands.`
    });

    res.json({ ok: true, code, sessionId });
  } catch (err) {
    console.error("❌ Pair error:", err);
    res.json({ ok: false, message: err.message });
  }
});

// Quick health check for Render
app.get("/health", (req, res) => res.send("✅ OK"));

// -------------------- Boot --------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 BAN-MD Ultimate Server running on port ${PORT}`);
  startSock();
});
