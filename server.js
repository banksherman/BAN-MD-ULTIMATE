// BAN-MD Ultimate Pairing Server
// Node.js v20+ recommended

import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";
import QRCode from "qrcode";
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

let sock;
let lastQR = null;
let qrAt = null;
let jid = null;
let sessionId = null;
let isConnected = false;

const QR_TTL = 20_000;
const SESS_DIR = "./sessions";

// ---------------- Categories & Commands ----------------
const categories = {
  "1": { name: "AI", commands: Array.from({length:15}, (_,i)=>`AI_CMD_${i+1}`) },
  "2": { name: "MEDIA EDIT", commands: Array.from({length:12}, (_,i)=>`MEDIA_CMD_${i+1}`) },
  "3": { name: "GROUP", commands: Array.from({length:10}, (_,i)=>`GROUP_CMD_${i+1}`) },
  "4": { name: "CODING", commands: Array.from({length:8}, (_,i)=>`CODING_CMD_${i+1}`) },
  "5": { name: "CONVERT CMDS", commands: Array.from({length:9}, (_,i)=>`CONVERT_CMD_${i+1}`) },
  "6": { name: "DOWNLOAD", commands: Array.from({length:10}, (_,i)=>`DOWNLOAD_CMD_${i+1}`) },
  "7": { name: "EDITING", commands: Array.from({length:10}, (_,i)=>`EDIT_CMD_${i+1}`) },
  "8": { name: "FUN", commands: Array.from({length:15}, (_,i)=>`FUN_CMD_${i+1}`) },
  "9": { name: "GENERAL", commands: Array.from({length:12}, (_,i)=>`GENERAL_CMD_${i+1}`) },
  "10": { name: "IMAGES", commands: Array.from({length:12}, (_,i)=>`IMAGES_CMD_${i+1}`) },
  "11": { name: "LOGO", commands: Array.from({length:8}, (_,i)=>`LOGO_CMD_${i+1}`) },
  "12": { name: "MODS", commands: Array.from({length:8}, (_,i)=>`MODS_CMD_${i+1}`) },
  "13": { name: "OWNER", commands: Array.from({length:6}, (_,i)=>`OWNER_CMD_${i+1}`) },
  "14": { name: "REACTION", commands: Array.from({length:10}, (_,i)=>`REACTION_CMD_${i+1}`) },
  "15": { name: "SCREENSHOTS", commands: Array.from({length:6}, (_,i)=>`SS_CMD_${i+1}`) },
  "16": { name: "SEARCH", commands: Array.from({length:10}, (_,i)=>`SEARCH_CMD_${i+1}`) },
  "17": { name: "SPORTS", commands: Array.from({length:8}, (_,i)=>`SPORTS_CMD_${i+1}`) },
  "18": { name: "STALKER", commands: Array.from({length:6}, (_,i)=>`STALKER_CMD_${i+1}`) },
  "19": { name: "SYSTEM", commands: Array.from({length:6}, (_,i)=>`SYSTEM_CMD_${i+1}`) },
  "20": { name: "WA CHANNEL", commands: Array.from({length:6}, (_,i)=>`WA_CMD_${i+1}`) },
  "21": { name: "TOOLS", commands: Array.from({length:10}, (_,i)=>`TOOLS_CMD_${i+1}`) },
  "22": { name: "TRADE", commands: Array.from({length:8}, (_,i)=>`TRADE_CMD_${i+1}`) },
  "23": { name: "TTS", commands: Array.from({length:6}, (_,i)=>`TTS_CMD_${i+1}`) },
  "24": { name: "UTILITY", commands: Array.from({length:10}, (_,i)=>`UTILITY_CMD_${i+1}`) },
  "25": { name: "SETTINGS", commands: Array.from({length:8}, (_,i)=>`SETTINGS_CMD_${i+1}`) },
};

// -------------------- Helpers --------------------
function generateSessionId() {
  return "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
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
      setTimeout(() => { if (Date.now() - qrAt > QR_TTL) lastQR = null; }, QR_TTL + 2000);
    }

    if (connection === "open") {
      jid = sock.user?.id;
      sessionId = generateSessionId();
      isConnected = true;
      lastQR = null;
      console.log("✅ WhatsApp connected:", jid);
      console.log("🆔 Session ID:", sessionId);

      // Optional welcome image
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
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
      console.log("❌ Connection closed.", { code, shouldReconnect });
      isConnected = false;

      if (shouldReconnect) {
        console.log("♻️ Reconnecting...");
        setTimeout(startSock, 2000);
      } else {
        console.log("🛑 Logged out. Delete sessions/ to relink.");
      }
    }
  });

  // ---------------- Command Handler ----------------
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    const prefix = ".";
    if (!text.startsWith(prefix)) return;

    const commandBody = text.slice(prefix.length).trim();
    const args = commandBody.split(/ +/);
    const command = args.shift().toLowerCase();

    // Basic commands
    if (command === "ping") {
      await sock.sendMessage(from, { text: "🏓 Pong! BAN-MD Ultimate is alive." });
    } else if (command === "session") {
      await sock.sendMessage(from, { text: `🆔 Your active session: ${jid}\nSession ID: ${sessionId}` });
    }

    // Menu
    else if (command === "menu") {
      let menuMessage = `╰►Hey, 𝕻𝖗𝖊𝖙𝖙𝖞𝖓𝖎𝖆 💜💜
╭───〔  *BAN-MD Ultimate* 〕──────┈⊷
├──────────────
│✵│▸ 𝗣𝗿𝗲𝗳𝗶𝘅: [ . ]
│✵│▸ 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀: 223
╰──────────────────────⊷

╭───◇ *𝗖𝗔𝗧𝗘𝗚𝗢𝗥𝗜𝗘𝗦* ◇──────┈⊷
│「 𝗥𝗲𝗽𝗹𝘆 𝘄𝗶𝘁𝗵 𝗻𝘂𝗺𝗯𝗲𝗿𝘀 𝗯𝗲𝗹𝗼𝘄 」\n`;
      for (let key in categories) {
        menuMessage += `> │◦➛ ${key}. ${categories[key].name}\n`;
      }
      menuMessage += "╰─────────────────────┈⊷";
      await sock.sendMessage(from, { text: menuMessage });
    }

    // Show category commands by number
    else if (categories[command]) {
      const cat = categories[command];
      await sock.sendMessage(from, {
        text: `📂 *${cat.name} Commands*\n\n${cat.commands.map(c => `• ${c}`).join("\n")}`
      });
    }
  });
}

// ---------------- API Endpoints ----------------
app.get("/qr", (req, res) => {
  if (!lastQR) return res.status(404).json({ ok: false, message: "No QR available" });
  const age = Date.now() - qrAt;
  if (age > QR_TTL) { lastQR = null; return res.status(410).json({ ok: false, message: "QR expired" }); }
  res.json({ ok: true, qr: lastQR, ttl: QR_TTL - age });
});

app.get("/status", (req, res) => {
  if (isConnected && jid) return res.json({ ok: true, connected: true, jid, sessionId });
  return res.json({ ok: true, connected: false });
});

app.get("/session-qr", async (req, res) => {
  if (!isConnected || !sessionId) return res.status(404).json({ ok: false, message: "No active session" });
  try {
    const qrDataUrl = await QRCode.toDataURL(sessionId);
    res.json({ ok: true, qr: qrDataUrl, sessionId });
  } catch (err) {
    console.error("Failed to generate session QR", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.post("/reconnect", async (req, res) => {
  try { console.log("🔄 Reconnect requested via API"); await startSock(); res.json({ ok: true, message: "Reconnecting..." }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ---------------- Boot ----------------
startSock().catch((e) => { console.error("startSock failed:", e); process.exit(1); });
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

app.listen(PORT, () => { console.log(`✅ Server running on http://localhost:${PORT}`); });
