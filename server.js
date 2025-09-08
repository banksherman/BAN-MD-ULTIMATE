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
import dotenv from "dotenv";

dotenv.config();

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
let startTime = Date.now();

if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR);

// -------------------- Helpers --------------------
function formatRuntime(ms) {
  let sec = Math.floor(ms / 1000) % 60;
  let min = Math.floor(ms / (1000 * 60)) % 60;
  let hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs}h ${min}m ${sec}s`;
}

// -------------------- Commands --------------------
const commands = {
  ping: {
    description: "Check bot response speed",
    execute: async (sock, from) => {
      const start = Date.now();
      await sock.sendMessage(from, { text: "🏓 Pong!" });
      const end = Date.now();
      const speed = end - start;
      await sock.sendMessage(from, {
        text: `✅ BAN-MD Ultimate is alive!\n⚡ Speed: ${speed}ms`
      });
    }
  },
  alive: {
    description: "Check bot status",
    execute: async (sock, from) => {
      await sock.sendMessage(from, {
        text: process.env.LIVE_MSG || "✅ Yes, I'm alive — BAN-MD Ultimate 😀"
      });
    }
  },
  menu: {
    description: "Show available commands",
    execute: async (sock, from) => {
      const menuText = `
🤖 *BAN-MD Ultimate Menu*

🛠️ *Utility*
• !ping → Bot speed
• !alive → Check status
• !runtime → Uptime

📖 *General*
• !menu → Show this menu
• !owner → Bot owner info
      `;
      await sock.sendMessage(from, {
        text: menuText.trim()
      });
    }
  },
  owner: {
    description: "Show bot owner info",
    execute: async (sock, from) => {
      await sock.sendMessage(from, {
        text: `👑 Owner: ${process.env.OWNER_NAME}\n📞 wa.me/${process.env.OWNER_NUMBER}`
      });
    }
  },
  runtime: {
    description: "Show bot uptime",
    execute: async (sock, from) => {
      const uptime = formatRuntime(Date.now() - startTime);
      await sock.sendMessage(from, { text: `⏳ Uptime: ${uptime}` });
    }
  }
};

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
    syncFullHistory: false
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
      console.log("✅ WhatsApp connected:", jid);

      // Welcome DM
      try {
        await sock.sendMessage(jid, {
          text: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ You are now logged in.\n🎵 Enjoy using the bot!`
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

      if (!body) return;

      console.log(`💬 Message from ${from}: ${body}`);

      if (body.startsWith("!")) {
        const cmd = body.slice(1).trim().split(" ")[0].toLowerCase();
        if (commands[cmd]) {
          await commands[cmd].execute(sock, from, body, msg);
        } else {
          await sock.sendMessage(from, {
            text: `❌ Unknown command: *!${cmd}*\nType *!menu* for help.`
          });
        }
      }
    } catch (err) {
      console.error("❌ Error in handler:", err);
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

process.on("uncaughtException", (e
