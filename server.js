// BAN-MD Ultimate Bot Server
// Made by KHAREL BANKS OFC
// Node.js v20+ recommended

import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";
import qrcode from "qrcode";
import os from "os";
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
const QR_TTL = 20000;
const SESS_DIR = path.join("/tmp", "sessions"); // Render-compatible
let startTime = Date.now();

if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });

// -------------------- Helpers --------------------
function formatRuntime(ms) {
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / (1000 * 60)) % 60;
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs}h ${min}m ${sec}s`;
}

function getSystemStats() {
  const uptime = formatRuntime(Date.now() - startTime);
  const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0) + "MB";
  const usedMem = ((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(0) + "MB";
  const memUsage = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1);
  const cpuLoad = os.loadavg()[0].toFixed(2);

  return { uptime, totalMem, usedMem, memUsage, cpuLoad };
}

// -------------------- Commands --------------------
const commands = {
  ping: {
    description: "Check bot response speed",
    execute: async (sock, from) => {
      const start = Date.now();
      await sock.sendMessage(from, { text: "🏓 Pong!" });
      const end = Date.now();
      await sock.sendMessage(from, { text: `✅ BAN-MD Ultimate is alive!\n⚡ Speed: ${end - start}ms` });
    }
  },
  alive: {
    description: "Check bot status",
    execute: async (sock, from) => {
      await sock.sendMessage(from, { text: "✅ Yes, I'm alive — BAN-MD Ultimate 😎" });
    }
  },
  runtime: {
    description: "Show bot uptime",
    execute: async (sock, from) => {
      await sock.sendMessage(from, { text: `⏳ Uptime: ${formatRuntime(Date.now() - startTime)}` });
    }
  },
  owner: {
    description: "Show bot owner info",
    execute: async (sock, from) => {
      await sock.sendMessage(from, { text: "👑 Owner: KHAREL BANKS OFC\n📞 wa.me/2567XXXXXXX" });
    }
  },
  menu: {
    description: "Show styled menu with live stats",
    execute: async (sock, from) => {
      const stats = getSystemStats();
      const menuText = `
𝗛𝗲𝘆 𝘁𝗵𝗲𝗿𝗲 😁, 𝗪𝗲𝗹𝗰𝗼𝗺𝗲!

╔═════〚 𝗕𝗔𝗡-𝗠𝗗 𝗨𝗟𝗧𝗜𝗠𝗔𝗧𝗘 〛═════╗
║ User      : KHAREL BANKS OFC
║ Prefix    : !
║ Mode      : Public
║ Commands  : 250+
║ Uptime    : ${stats.uptime}
║ CPU Load  : ${stats.cpuLoad}
║ RAM Usage : ${stats.usedMem} / ${stats.totalMem} (${stats.memUsage}%)
╚════════════════════════════════╝

> 𝗨𝗧𝗜𝗟𝗜𝗧𝗬
┃ !ping    → Speed check
┃ !alive   → Alive check
┃ !runtime → Bot uptime

> 𝗚𝗘𝗡𝗘𝗥𝗔𝗟
┃ !menu    → Show this menu
┃ !owner   → Owner info
      `;
      await sock.sendMessage(from, { text: menuText.trim() });
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
      if (shouldReconnect) setTimeout(startSock, 2000);
      else console.log("🛑 Logged out. Delete sessions/ to relink.");
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
        if (commands[cmd]) await commands[cmd].execute(sock, from, body, msg);
        else await sock.sendMessage(from, { text: `❌ Unknown command: *!${cmd}*\nType *!menu* for help.` });
      }
    } catch (err) {
      console.error("❌ Error in handler:", err);
    }
  });
}

// -------------------- API --------------------
app.get("/qr", async (req, res) => {
  if (!sock) {
    console.log("⚡ Starting socket for QR...");
    await startSock();
  }

  if (!lastQR) return res.send("<h3>❌ No QR available yet. Please refresh in 2-3s...</h3>");

  if (Date.now() - qrAt > QR_TTL) {
    lastQR = null;
    return res.send("<h3>⏳ QR expired. Refresh page for a new one.</h3>");
  }

  try {
    const qrImage = await qrcode.toDataURL(lastQR);
    res.send(`
      <html>
        <head><title>Scan QR - BAN-MD Ultimate</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>📱 Scan this QR with WhatsApp</h2>
          <img src="${qrImage}" style="width:300px;height:300px;" />
          <p>Valid for ~20 seconds</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("❌ Failed to generate QR");
  }
});

app.get("/pair", async (req, res) => {
  try {
    if (!sock) return res.send("❌ Socket not ready.");
    let demoCode = Math.random().toString().slice(2, 10);
    res.send(`
      <html>
        <head><title>BAN-MD Pairing</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>BAN-MD PAIRING (Demo)</h2>
          <p>📲 Your 8-digit demo pairing code:</p>
          <h1 style="font-size:40px;">${demoCode}</h1>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("❌ Failed to generate pair code");
  }
});

// -------------------- Boot --------------------
startSock().catch((e) => {
  console.error("startSock failed:", e);
  process
