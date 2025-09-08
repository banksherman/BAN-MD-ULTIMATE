// BAN-MD Ultimate Bot Server - Full Media Implementation
// Made by KHAREL BANKS OFC
// Node.js v20+ recommended

import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";
import qrcode from "qrcode";
import os from "os";
import fetch from "node-fetch";
import ytdl from "ytdl-core";
import sharp from "sharp";

import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  prepareWAMessageMedia
} from "@whiskeysockets/baileys";

const app = express();
const __dirname = path.resolve();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

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

> 𝗔𝗜
┃ !ai       → Chat with GPT
┃ !vision   → Generate image from prompt
┃ !define   → Word definition

> 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 / 𝗠𝗘𝗗𝗜𝗔
┃ !song     → Download YouTube audio
┃ !ytmp3    → YouTube audio
┃ !ytmp4    → YouTube video
┃ !video    → Download video
┃ !sticker  → Convert image/video to sticker

> 𝗚𝗥𝗢𝗨𝗣 / 𝗔𝗗𝗠𝗜𝗡
┃ !add      → Add member
┃ !remove   → Remove member
┃ !promote  → Promote admin
┃ !demote   → Demote admin
┃ !menu     → Show this menu
┃ !owner    → Owner info
      `;
      await sock.sendMessage(from, { text: menuText.trim() });
    }
  },

  // -------------------- Media Commands --------------------
  song: {
    description: "Download YouTube audio",
    execute: async (sock, from, body) => {
      const url = body.replace(/^!song\s*/i, "");
      if (!url) return await sock.sendMessage(from, { text: "❌ Provide a YouTube link." });
      try {
        const info = await ytdl.getInfo(url);
        const stream = ytdl(url, { filter: "audioonly" });
        const filePath = path.join("/tmp", `${info.videoDetails.title}.mp3`);
        const writeStream = fs.createWriteStream(filePath);
        stream.pipe(writeStream);
        writeStream.on("finish", async () => {
          const buffer = fs.readFileSync(filePath);
          await sock.sendMessage(from, { audio: buffer, mimetype: "audio/mpeg", fileName: `${info.videoDetails.title}.mp3` });
          fs.unlinkSync(filePath);
        });
      } catch (err) {
        console.error(err);
        await sock.sendMessage(from, { text: "❌ Failed to download audio." });
      }
    }
  },
  ytmp3: { description: "Download YouTube audio", execute: async (sock, from, body) => commands.song.execute(sock, from, body) },
  ytmp4: {
    description: "Download YouTube video",
    execute: async (sock, from, body) => {
      const url = body.replace(/^!ytmp4\s*/i, "");
      if (!url) return await sock.sendMessage(from, { text: "❌ Provide a YouTube link." });
      try {
        const info = await ytdl.getInfo(url);
        const stream = ytdl(url, { quality: "highestvideo" });
        const filePath = path.join("/tmp", `${info.videoDetails.title}.mp4`);
        const writeStream = fs.createWriteStream(filePath);
        stream.pipe(writeStream);
        writeStream.on("finish", async () => {
          const buffer = fs.readFileSync(filePath);
          await sock.sendMessage(from, { video: buffer, mimetype: "video/mp4", fileName: `${info.videoDetails.title}.mp4` });
          fs.unlinkSync(filePath);
        });
      } catch (err) {
        console.error(err);
        await sock.sendMessage(from, { text: "❌ Failed to download video." });
      }
    }
  },
  video: { description: "Download YouTube video", execute: async (sock, from, body) => commands.ytmp4.execute(sock, from, body) },
  sticker: {
    description: "Convert image/video to sticker",
    execute: async (sock, from, body, msg) => {
      try {
        const mediaMessage = msg.message.imageMessage || msg.message.videoMessage;
        if (!mediaMessage) return await sock.sendMessage(from, { text: "❌ Send an image or short video with !sticker" });
        const buffer = mediaMessage.imageMessage ? mediaMessage.imageMessage.data : mediaMessage.videoMessage.data;
        const stickerBuffer = await sharp(buffer).resize(512, 512, { fit: "contain" }).webp().toBuffer();
        await sock.sendMessage(from, { sticker: stickerBuffer });
      } catch (err) {
        console.error(err);
        await sock.sendMessage(from, { text: "❌ Failed to create sticker." });
      }
    }
  }
};

// -------------------- AI Command --------------------
commands.ai = {
  description: "Chat with GPT",
  execute: async (sock, from, body) => {
    const prompt = body.replace(/^!ai\s*/i, "");
    if (!prompt) return await sock.sendMessage(from, { text: "❌ Provide a prompt." });
    try {
      const { Configuration, OpenAIApi } = await import("openai");
      const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
      const openai = new OpenAIApi(configuration);
      const response = await openai.createChatCompletion({ model: "gpt-4", messages: [{ role: "user", content: prompt }], max_tokens: 500 });
      await sock.sendMessage(from, { text: response.data.choices[0].message.content });
    } catch (err) {
      console.error(err);
      await sock.sendMessage(from, { text: "❌ AI request failed." });
    }
  }
};

// -------------------- WhatsApp Socket --------------------
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, logger: pino({ level: "silent" }), browser: ["BAN-MD-Ultimate", "Chrome", "120.0.0.0"], markOnlineOnConnect: true, syncFullHistory: false });
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) { lastQR = qr; qrAt = Date.now(); console.log("🔐 New QR generated (valid ~20s)..."); }
    if (connection === "open") {
      jid = sock?.user?.id;
      console.log("✅ WhatsApp connected:", jid);
      try { await sock.sendMessage(jid, { text: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ You are now logged in.\n🎵 Enjoy using the bot!` }); } catch (err) { console.error("❌ Failed to send welcome DM:", err); }
      lastQR = null;
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
      console.log("❌ Connection closed.", { code, shouldReconnect });
      if (shouldReconnect) setTimeout(startSock, 2000); else console.log("🛑 Logged out. Delete sessions/ to relink.");
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      const from = msg.key.remoteJid;
      const type = Object.keys(msg.message)[0];
      const body = type === "conversation" ? msg.message.conversation : type === "extendedTextMessage" ? msg.message.extendedTextMessage.text : "";
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

// -------------------- QR Page --------------------
app.get("/qr", async (req, res) => {
  try {
    if (!sock) { console.log("⚡ Starting socket for QR..."); await startSock(); }
    if (!lastQR || Date.now() - qrAt > QR_TTL) {
      lastQR = null;
      const qrPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject("QR generation timeout"), 15000);
        sock.ev.once("connection.update", (update) => { if (update.qr) { clearTimeout(timeout); resolve(update.qr); } });
      });
      const qr = await qrPromise.catch((e) => { console.error("❌ QR generation failed:", e); return null; });
      if (!qr) return res.send("<h3>❌ Failed to load QR. Refresh page.</h3>");
      lastQR = qr;
      qrAt = Date.now();
    }
    const qrImage = await qrcode.toDataURL(lastQR);
    res.send(`
      <html>
        <head><title>Scan QR - BAN-MD Ultimate</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>📲💻 Scan QR to Login</h2>
          <p>WhatsApp → Linked Devices → Link a device</p>
          <img src="${qrImage}" style="width:300px;height:300px;" />
          <p>Valid for ~20 seconds</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ QR route error:", err);
    res.send("<h3>❌ Failed to load QR. Refresh page.</h3>");
  }
});

// -------------------- Boot --------------------
startSock().catch((e) => console.error("startSock failed:", e));
app.listen(PORT, () => console.log(`🌐 Server running on http://localhost:${PORT}`));
