// BAN-MD Ultimate Bot - Verified QR & Commands
import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";
import qrcode from "qrcode";
import os from "os";
import { default as makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";

const app = express();
const __dirname = path.resolve();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

let sock;
let lastQR = null;
let qrAt = null;
let jid = null;
const QR_TTL = 20000; // 20 seconds
const SESS_DIR = path.join("/tmp", "sessions");
if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });
let startTime = Date.now();

function formatRuntime(ms) {
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / (1000 * 60)) % 60;
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs}h ${min}m ${sec}s`;
}

// ---------------- Commands ----------------
const commands = {
  ping: {
    description: "Check bot response",
    execute: async (sock, from) => {
      const start = Date.now();
      await sock.sendMessage(from, { text: "🏓 Pong!" });
      const end = Date.now();
      await sock.sendMessage(from, { text: `✅ Alive! Speed: ${end - start}ms` });
    }
  },
  alive: {
    description: "Check bot status",
    execute: async (sock, from) => {
      await sock.sendMessage(from, { text: "✅ BAN-MD Ultimate is alive 😎" });
    }
  },
  runtime: {
    description: "Bot uptime",
    execute: async (sock, from) => {
      await sock.sendMessage(from, { text: `⏳ Uptime: ${formatRuntime(Date.now() - startTime)}` });
    }
  },
  menu: {
    description: "Show menu",
    execute: async (sock, from) => {
      const menu = `
╔═══〚 BAN-MD ULTIMATE 〛═══╗
║ Prefix: !
║ Owner : KHAREL BANKS OFC
║ Uptime: ${formatRuntime(Date.now() - startTime)}
╚═══════════════════════════╝

Commands:
!ping    → Ping
!alive   → Check status
!runtime → Uptime
!menu    → Show this menu
`;
      await sock.sendMessage(from, { text: menu });
    }
  }
};

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
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      qrAt = Date.now();
      console.log("🔐 New QR generated");
    }

    if (connection === "open") {
      jid = sock.user?.id;
      console.log("✅ WhatsApp connected:", jid);
      lastQR = null;
      sock.sendMessage(jid, { text: "🤖 BAN-MD Ultimate Connected!" }).catch(console.error);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
      console.log("❌ Connection closed", { code, shouldReconnect });
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
        type === "conversation" ? msg.message.conversation :
        type === "extendedTextMessage" ? msg.message.extendedTextMessage.text :
        "";

      if (!body) return;

      if (body.startsWith("!")) {
        const cmd = body.slice(1).trim().split(" ")[0].toLowerCase();
        if (commands[cmd]) await commands[cmd].execute(sock, from, body, msg);
        else await sock.sendMessage(from, { text: `❌ Unknown command: !${cmd}` });
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// ---------------- QR Page ----------------
app.get("/qr", async (req, res) => {
  if (!sock) await startSock();
  if (!lastQR || Date.now() - qrAt > QR_TTL) return res.send("<h3>⏳ QR not ready. Refresh in a few seconds...</h3>");
  try {
    const qrImage = await qrcode.toDataURL(lastQR);
    res.send(`
      <html>
        <head><title>BAN-MD QR</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
          <h2>📱 Scan QR with WhatsApp</h2>
          <img src="${qrImage}" width="300" height="300"/>
          <p>Valid for ~20 seconds</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ QR generation failed", err);
    res.status(500).send("❌ Failed to generate QR");
  }
});

// ---------------- Boot ----------------
startSock().catch(console.error);
app.listen(PORT, () => console.log(`🌐 Server running at http://localhost:${PORT}`));
