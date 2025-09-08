// BAN-MD Ultimate Bot Server
// Node.js v20+ recommended

import express from "express";
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
let antiLinkEnabled = false;
let startTime = Date.now();

// -------------------- Helpers --------------------
function generateSessionId() {
  return config.SESSION_ID || "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
}

function formatRuntime(ms) {
  let sec = Math.floor(ms / 1000) % 60;
  let min = Math.floor(ms / (1000 * 60)) % 60;
  let hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs}h ${min}m ${sec}s`;
}

// -------------------- Commands --------------------
const commands = {
  ping: {
    description: "Check if the bot is alive",
    execute: async (sock, from) => {
      await sock.sendMessage(from, { text: `🏓 Pong! ${config.BOT_NAME} is alive.` });
    }
  },
  alive: {
    description: "Show alive message",
    execute: async (sock, from) => {
      await sock.sendMessage(from, {
        image: { url: config.ALIVE_IMG },
        caption: config.LIVE_MSG
      });
    }
  },
  menu: {
    description: "Show available commands",
    execute: async (sock, from) => {
      const menu = Object.keys(commands)
        .map((cmd) => `• ${config.PREFIX}${cmd} → ${commands[cmd].description}`)
        .join("\n");
      await sock.sendMessage(from, {
        text: `🤖 *${config.BOT_NAME} Menu*\n\n${menu}`
      });
    }
  },
  help: {
    description: "Alias for menu",
    execute: async (sock, from) => {
      return commands.menu.execute(sock, from);
    }
  },
  owner: {
    description: "Show owner info",
    execute: async (sock, from) => {
      await sock.sendMessage(from, {
        text: `👑 *Owner:* ${config.OWNER_NAME}\n📞 wa.me/${config.OWNER_NUMBER}`
      });
    }
  },
  runtime: {
    description: "Show bot uptime",
    execute: async (sock, from) => {
      const uptime = formatRuntime(Date.now() - startTime);
      await sock.sendMessage(from, { text: `⏳ Uptime: ${uptime}` });
    }
  },
  antilink: {
    description: "Enable/disable anti-link",
    execute: async (sock, from, body) => {
      if (body.includes("on")) {
        antiLinkEnabled = true;
        await sock.sendMessage(from, { text: "✅ Anti-link is *ON*" });
      } else if (body.includes("off")) {
        antiLinkEnabled = false;
        await sock.sendMessage(from, { text: "❌ Anti-link is *OFF*" });
      } else {
        await sock.sendMessage(from, { text: "Usage: !antilink on/off" });
      }
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
    browser: [config.BOT_NAME, "Chrome", "120.0.0.0"],
    markOnlineOnConnect: config.ALWAYS_ONLINE,
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
      const sessionId = generateSessionId();
      console.log("✅ WhatsApp connected:", jid);
      console.log("🆔 Session ID:", sessionId);

      // Welcome DM
      await sock.sendMessage(jid, {
        text: `🤖 *${config.BOT_NAME} Connected!*\n\n✅ Session ID:\n${sessionId}\n🎵 Welcome aboard!`
      });

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

      if (!body) return;

      console.log(`💬 Message from ${from}: ${body}`);

      // 🚫 Anti-link filter
      if (antiLinkEnabled && body.includes("chat.whatsapp.com")) {
        await sock.sendMessage(from, { text: "⚠️ No links allowed here!" });
        try {
          await sock.groupParticipantsUpdate(from, [msg.key.participant], "remove");
        } catch (err) {
          console.error("❌ Failed to kick:", err);
        }
        return;
      }

      // Commands
      if (body.startsWith(config.PREFIX)) {
        const cmd = body.slice(config.PREFIX.length).trim().split(" ")[0].toLowerCase();
        if (commands[cmd]) {
          await commands[cmd].execute(sock, from, body, msg);
        } else {
          await sock.sendMessage(from, {
            text: `❌ Unknown command: *${config.PREFIX}${cmd}*\nType *${config.PREFIX}menu* for help.`
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

process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
