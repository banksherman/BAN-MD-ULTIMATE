// BAN-MD Ultimate Bot Server (Pairing Code Only)
// Node.js v20+ recommended

import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";
import os from "os";
import dotenv from "dotenv";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

dotenv.config();

const app = express();
const __dirname = path.resolve();
const PORT = process.env.PORT || 3000;

// -------------------- Globals --------------------
let sock;
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
        text: process.env.LIVE_MSG || "✅ Yes, I'm alive — BAN-MD Ultimate 😀"
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
        text: `👑 Owner: ${process.env.OWNER_NAME}\n📞 wa.me/${process.env.OWNER_NUMBER}`
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
║ User      : ${process.env.OWNER_NAME || "KHAREL BANKS OFC"}
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
┃ !menu   → Show this menu
┃ !owner  → Owner info

═════════════════════════════════
Made by KHAREL BANKS OFC
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
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      jid = sock?.user?.id;
      console.log("✅ WhatsApp connected:", jid);
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

    if (connection === "connecting") {
      try {
        const phoneNumber = process.env.OWNER_NUMBER;
        if (phoneNumber) {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log("📲 Your 8-digit pairing code:", code);
        } else {
          console.log("⚠️ Set OWNER_NUMBER in .env to generate a code.");
        }
      } catch (err) {
        console.error("❌ Failed to get pairing code:", err);
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

// -------------------- Boot --------------------
startSock().catch((e) => {
  console.error("startSock failed:", e);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 BAN-MD Ultimate running on http://localhost:${PORT}`);
});
