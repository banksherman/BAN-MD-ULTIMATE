// BAN-MD Ultimate Pairing Server - Render-ready
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
const PORT = process.env.PORT || 10000;

// Use persistent sessions on Render
const SESS_DIR = process.env.SESS_DIR || path.join(__dirname, "sessions");
if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, "public")));

let sock;
let lastQR = null;
let qrAt = null;
let jid = null;
const QR_TTL = 20_000;
const PREFIX = "!";

// Categories with commands
const categories = {
  "1": { name: "AI", commands: ["ai1", "ai2", "ai3"] },
  "2": { name: "MEDIA EDIT", commands: ["edit1", "edit2"] },
  "3": { name: "GROUP", commands: ["group1", "group2"] },
  "4": { name: "CODING", commands: ["code1", "code2"] },
  "5": { name: "CONVERT CMDS", commands: ["conv1", "conv2"] },
  "6": { name: "DOWNLOAD", commands: ["dl1", "dl2"] },
  "7": { name: "EDITING", commands: ["edit3", "edit4"] },
  "8": { name: "FUN", commands: ["fun1", "fun2"] },
  "9": { name: "GENERAL", commands: ["gen1", "gen2"] },
  "10": { name: "IMAGES", commands: ["img1", "img2"] },
  "11": { name: "LOGO", commands: ["logo1", "logo2"] },
  "12": { name: "MODS", commands: ["mod1", "mod2"] },
  "13": { name: "OWNER", commands: ["owner1", "owner2"] },
  "14": { name: "REACTION", commands: ["react1", "react2"] },
  "15": { name: "SCREENSHOTS", commands: ["ss1", "ss2"] },
  "16": { name: "SEARCH", commands: ["search1", "search2"] },
  "17": { name: "SPORTS", commands: ["sport1", "sport2"] },
  "18": { name: "STALKER", commands: ["stalk1", "stalk2"] },
  "19": { name: "SYSTEM", commands: ["sys1", "sys2"] },
  "20": { name: "WA CHANNEL", commands: ["wa1", "wa2"] },
  "21": { name: "TOOLS", commands: ["tool1", "tool2"] },
  "22": { name: "TRADE", commands: ["trade1", "trade2"] },
  "23": { name: "TTS", commands: ["tts1", "tts2"] },
  "24": { name: "UTILITY", commands: ["util1", "util2"] },
  "25": { name: "SETTINGS", commands: ["set1", "set2"] },
};

// Flatten all commands
const allCommands = [];
Object.values(categories).forEach(cat => allCommands.push(...cat.commands));

// Helpers
function generateSessionId() {
  return "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function getContactName(jid) {
  let name = jid.split("@")[0];
  try {
    const contact = await sock.onWhatsApp(jid);
    const vcard = await sock.contactGet(contact[0].jid);
    if (vcard && vcard[0] && vcard[0].notify) name = vcard[0].notify;
  } catch {}
  return name;
}

// Start WhatsApp socket
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

  // Connection updates
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && (!lastQR || Date.now() - qrAt > QR_TTL)) {
      lastQR = qr;
      qrAt = Date.now();
      console.log("🔐 New QR generated (valid ~20s)...");
    }

    if (connection === "open") {
      jid = sock?.user?.id;
      const sessionId = generateSessionId();
      console.log("✅ WhatsApp connected:", jid);
      console.log("🆔 Session ID:", sessionId);

      const contactName = await getContactName(jid);
      const imagePath = path.join(__dirname, "public", "connected.jpg");
      try {
        if (fs.existsSync(imagePath)) {
          await sock.sendMessage(jid, {
            image: fs.readFileSync(imagePath),
            caption: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ Session ID:\n${sessionId}\n🎵 Welcome, ${contactName}!`
          });
        } else {
          await sock.sendMessage(jid, {
            text: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ Session ID:\n${sessionId}\n🎵 Welcome, ${contactName}!`
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
      if (shouldReconnect) setTimeout(startSock, 5000);
      else console.log("🛑 Logged out. Delete sessions/ to relink.");
    }
  });

  // Message handler
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) return;

      const contactName = await getContactName(from);

      // Commands with prefix
      if (text.startsWith(PREFIX)) {
        const cmd = text.slice(PREFIX.length).trim().toLowerCase();

        // !menu
        if (cmd === "menu") {
          let menuMessage = `Hey there 😀💻 ${contactName}\n\n`;
          menuMessage += `╭───〔  *BAN-MD Ultimate* 〕──────┈⊷\n`;
          menuMessage += `├──────────────\n`;
          menuMessage += `│✵│▸ 𝗣𝗿𝗲𝗳𝗶𝘅: [ ${PREFIX} ]\n`;
          menuMessage += `│✵│▸ 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀: 223\n`;
          menuMessage += `╰──────────────────────⊷\n\n`;
          menuMessage += `╭───◇ *𝗖𝗔𝗧𝗘𝗚𝗢𝗥𝗜𝗘𝗦* ◇──────┈⊷\n`;
          menuMessage += `│「 𝗥𝗲𝗽𝗹𝘆 𝘄𝗶𝘁𝗵 𝗻𝘂𝗺𝗯𝗲𝗿𝘀 𝗯𝗲𝗹𝗼𝘄 」\n`;
          for (let key in categories) menuMessage += `> │◦➛ ${key}. ${categories[key].name}\n`;
          menuMessage += "╰─────────────────────┈⊷";

          const imagePath = path.join(__dirname, "public", "menu.jpg");
          if (fs.existsSync(imagePath)) {
            await sock.sendMessage(from, { image: fs.readFileSync(imagePath), caption: menuMessage });
          } else await sock.sendMessage(from, { text: menuMessage });
          return;
        }

        // !ping
        if (cmd === "ping") {
          const start = Date.now();
          await sock.sendMessage(from, { text: "🏓 Pinging..." });
          const speed = Date.now() - start;
          await sock.sendMessage(from, { text: `🏓 Pong! Response speed: ${speed}ms` });
          return;
        }

        // !alive
        if (cmd === "alive") {
          await sock.sendMessage(from, { text: "YES AM ONLINE BAN-MD-ULTIMATE 😀😀 HEHE" });
          return;
        }

        // !tagall
        if (cmd === "tagall") {
          if (!from.endsWith("@g.us")) {
            await sock.sendMessage(from, { text: "❌ This command works only in groups!" });
            return;
          }
          const groupMetadata = await sock.groupMetadata(from);
          const participants = groupMetadata.participants.map(p => p.id);
          let mentionText = "📢 Attention everyone:\n\n";
          participants.forEach(p => (mentionText += `@${p.split("@")[0]} `));
          await sock.sendMessage(from, { text: mentionText, mentions: participants });
          return;
        }

        // !hidetag
        if (cmd === "hidetag") {
          if (!from.endsWith("@g.us")) {
            await sock.sendMessage(from, { text: "❌ This command works only in groups!" });
            return;
          }
          const groupMetadata = await sock.groupMetadata(from);
          const participants = groupMetadata.participants.map(p => p.id);
          const hiddenMessage = "📢 Attention everyone!"; // custom hidden text
          await sock.sendMessage(from, { text: hiddenMessage, mentions: participants });
          return;
        }

        // All other commands
        if (allCommands.includes(cmd)) {
          await sock.sendMessage(from, { text: `✅ Command *${PREFIX}${cmd}* executed successfully, ${contactName}!` });
        } else {
          await sock.sendMessage(from, { text: `❌ Unknown command, ${contactName}. Type ${PREFIX}menu to see all commands.` });
        }
      }

      // Category number replies
      const catNumber = parseInt(text);
      if (categories[catNumber]) {
        const cat = categories[catNumber];
        let cmdsMessage = `📂 *${cat.name} Commands*\n\n`;
        cat.commands.forEach((c, i) => { cmdsMessage += `💠 ${i + 1}. ${PREFIX}${c}\n`; });
        cmdsMessage += `\n📌 Use commands with the prefix [${PREFIX}]`;

        const catImagePath = path.join(__dirname, `public/cat${catNumber}.jpg`);
        if (fs.existsSync(catImagePath)) {
          await sock.sendMessage(from, { image: fs.readFileSync(catImagePath), caption: cmdsMessage });
        } else await sock.sendMessage(from, { text: cmdsMessage });
      }

    } catch (err) {
      console.error("❌ Error handling message:", err);
    }
  });
}

// QR API
app.get("/qr", (req, res) => {
  if (!lastQR) return res.status(404).json({ ok: false, message: "No QR available" });
  const age = Date.now() - qrAt;
  if (age > QR_TTL) { lastQR = null; return res.status(410).json({ ok: false, message: "QR expired" }); }
  res.json({ ok: true, qr: lastQR, ttl: QR_TTL - age });
});

// Boot
startSock().catch((e) => { console.error("startSock failed:", e); process.exit(1); });
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
