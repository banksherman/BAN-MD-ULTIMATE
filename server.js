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
let jid = null;
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

function getSystemStats() {
  const uptime = formatRuntime(Date.now() - startTime);
  const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0) + "MB";
  const usedMem =
    ((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(0) + "MB";
  const memUsage = (
    ((os.totalmem() - os.freemem()) / os.totalmem()) *
    100
  ).toFixed(1);
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
        text: "✅ Yes, I'm alive — BAN-MD Ultimate 😎"
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
  owner: {
    description: "Show bot owner info",
    execute: async (sock, from) => {
      await sock.sendMessage(from, {
        text: `👑 Owner: KHAREL BANKS OFC\n📞 wa.me/2567XXXXXXX`
      });
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
┃ !ping   → Speed check
┃ !alive  → Alive check
┃ !runtime → Bot uptime

> 𝗚𝗘𝗡𝗘𝗥𝗔𝗟
┃ !menu   → Show this menu
┃ !owner  → Owner info
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
      lastQR = qr; // store fresh QR
      console.log("🔐 New QR generated, open /qr to scan.");
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

      lastQR = null; // clear QR once connected
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
// Show QR with auto-refresh
app.get("/qr", async (req, res) => {
  // already connected
  if (sock?.user?.id) {
    return res.send(`
      <html>
        <head><title>BAN-MD QR</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>✅ BAN-MD Ultimate is already connected!</h2>
          <p>WhatsApp ID: ${sock.user.id}</p>
          <form method="POST" action="/logout">
            <button style="margin-top:20px;padding:10px 20px;">🔴 Logout</button>
          </form>
        </body>
      </html>
    `);
  }

  // waiting for QR
  if (!lastQR) {
    return res.send(`
      <html>
        <head><title>BAN-MD QR</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>⏳ Generating QR... Please wait</h2>
          <script>setTimeout(() => location.reload(), 4000);</script>
        </body>
      </html>
    `);
  }

  // show scannable QR
  try {
    const qrImage = await qrcode.toDataURL(lastQR);
    res.send(`
      <html>
        <head><title>Scan QR - BAN-MD Ultimate</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>📱 Scan this QR with WhatsApp</h2>
          <img src="${qrImage}" style="width:300px;height:300px;" />
          <p>Page refreshes automatically if code expires</p>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("❌ Failed to generate QR");
  }
});

// logout endpoint
app.post("/logout", (req, res) => {
  try {
    if (fs.existsSync(SESS_DIR)) {
      fs.rmSync(SESS_DIR, { recursive: true, force: true });
    }
    lastQR = null;
    jid = null;
    console.log("🔴 Logged out. Restarting socket...");
    startSock();
    res.redirect("/qr");
  } catch (err) {
    res.status(500).send("❌ Failed to logout");
  }
});

// -------------------- Status Page --------------------
app.get("/status", (req, res) => {
  const stats = getSystemStats();
  const connected = sock?.user?.id ? "✅ Connected" : "❌ Not connected";

  // extract phone number if connected
  let userId = "—";
  if (sock?.user?.id) {
    userId = sock.user.id.split("@")[0];
  }

  res.send(`
    <html>
      <head>
        <title>BAN-MD Status</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: #0f172a;
            color: #f8fafc;
          }
          .card {
            background: #1e293b;
            padding: 20px 40px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            text-align: center;
            width: 400px;
          }
          h1 {
            margin-bottom: 10px;
          }
          p {
            margin: 6px 0;
          }
          .highlight {
            font-size: 18px;
            color: #38bdf8;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🚀 BAN-MD Ultimate Status</h1>
          <p><b>Owner:</b> KHAREL BANKS OFC</p>
          <p><b>Connection:</b> ${connected}</p>
          <p><b>WhatsApp Number:</b> <span class="highlight">${userId}</span></p>
          <hr style="margin:15px 0;border:0;border-top:1px solid #334155;">
          <p><b>Uptime:</b> ${stats.uptime}</p>
          <p><b>CPU Load:</b> ${stats.cpuLoad}</p>
          <p><b>RAM Usage:</b> ${stats.usedMem} / ${stats.totalMem} (${stats.memUsage}%)</p>
        </div>
      </body>
    </html>
  `);
});

// -------------------- Boot --------------------
startSock().catch((e) => {
  console.error("startSock failed:", e);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 BAN-MD Ultimate running on http://localhost:${PORT}`);
});
