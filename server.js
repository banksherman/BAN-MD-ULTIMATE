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
const commands = {};

commands.ping = {
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
};

commands.alive = {
  description: "Check bot status",
  execute: async (sock, from) => {
    await sock.sendMessage(from, {
      text: process.env.LIVE_MSG || "✅ Yes, I'm alive — BAN-MD Ultimate 😀"
    });
  }
};

commands.menu = {
  description: "Show styled menu",
  execute: async (sock, from) => {
    const menuText = `
𝗛𝗲𝘆 𝘁𝗵𝗲𝗿𝗲 😁, 𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼  

╔═════〚 𝗕𝗔𝗡-𝗠𝗗 𝗨𝗟𝗧𝗜𝗠𝗔𝗧𝗘 〛═════╗
║ User      : ${process.env.OWNER_NAME || "BANKS OFFICIAL"}
║ Prefix    : !
║ Mode      : Public
║ Commands  : 250+
║ Time      : ${new Date().toLocaleTimeString()}
║ RAM Usage : ■■□□□□ 25%
╚════════════════════════════════╝

> 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗖𝗠𝗗𝗦
┃✦│ Video, Video2, Play, Play2
┃✦│ Song, Song2, FbDl, TikTok
┃✦│ Twitter, Instagram, Pinterest
┃✦│ Movie, Lyrics, Whatsong
┃✦│ Yts, Ytmp3, Ytmp4

> 𝗖𝗢𝗡𝗩𝗘𝗥𝗧 𝗖𝗠𝗗𝗦
┃❃│ Sticker, Smeme, Photo, Mp4
┃❃│ Retrieve, VV, VV2, Screenshot
┃❃│ Mix, Take, Tweet, Quotely

> 𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦 𝗖𝗠𝗗𝗦 (on/off)
┃✥│ Antidelete, Anticall, Antibot
┃✥│ Badword, Antitag, Antilink
┃✥│ Antilinkall, Gptdm
┃✥│ Autoview, Autolike, Autoread
┃✥│ Autobio, Mode, Menutype, Prefix
┃✥│ WelcomeGoodbye, Wapresence

> 𝗙𝗢𝗢𝗧𝗕𝗔𝗟𝗟 𝗖𝗠𝗗𝗦
┃❅│ Epl, Laliga, Serie-a, Bundesliga
┃❅│ Ligue-1, Fixtures

> 𝗔𝗜 / 𝗚𝗣𝗧 𝗖𝗠𝗗𝗦
┃◈│ Ai, Ai2, Vision, Define
┃◈│ Raven, Gemini, Google
┃◈│ Gpt, Gpt2, Gpt3, Gpt4

> 𝗚𝗥𝗢𝗨𝗣 𝗖𝗠𝗗𝗦
┃✧│ Approve, Reject, Promote, Demote
┃✧│ Delete, Remove, Faker, Foreigners
┃✧│ Close, Open, CloseTime, OpenTime
┃✧│ Icon, Gcprofile, Subject, Desc
┃✧│ Leave, Add, Tagall, Hidetag, Revoke
┃✧│ Mute, Unmute

> 𝗖𝗢𝗗𝗜𝗡𝗚 𝗖𝗠𝗗𝗦
┃◎│ Carbon, Compile-c, Compile-c++
┃◎│ Compile-js, Compile-py, Inspect
┃◎│ Encrypte, Eval

> 𝗚𝗘𝗡𝗘𝗥𝗔𝗟 𝗖𝗠𝗗𝗦
┃✠│ Owner, Script, Menu, List, Ping
┃✠│ Poll, Alive, Speed, Repo
┃✠│ Runtime, Uptime, Dp, Dlt
┃✠│ Mail, Inbox

> 𝗢𝗪𝗡𝗘𝗥 𝗖𝗠𝗗𝗦
┃□│ Restart, Admin, Cast, Broadcast
┃□│ Join, Getcase, Redeploy, Update
┃□│ Botpp, Fullpp, Block, Unblock
┃□│ Kill, Save

> 𝗣𝗥𝗔𝗡𝗞 𝗖𝗠𝗗𝗦
┃▧│ Hack

> 𝗟𝗢𝗚𝗢 𝗖𝗠𝗗𝗦
┃●│ Hacker, Hacker2, Graffiti, Cat
┃●│ Sand, Gold, Arena, Dragonball
┃●│ Naruto, Child, Typography

> 𝗧𝗘𝗫𝗧𝗠𝗔𝗞𝗘𝗥 𝗖𝗠𝗗𝗦
┃○│ Purple, Neon, Noel, Metallic
┃○│ Devil, Impressive, Snow, Water
┃○│ Thunder, Ice, Matrix, Silver

> 𝗨𝗧𝗜𝗟𝗜𝗦 𝗖𝗠𝗗𝗦
┃▣│ Weather, Github, Gitclone
┃▣│ Removebg, Remini, Tts, Trt
┃▣│ Calc

> 𝗥𝗔𝗡𝗗𝗢𝗠 𝗖𝗠𝗗𝗦
┃✪│ Fact, Funfact, Catfact, Advice
┃✪│ Joke, News, Rship, Gpass
┃✪│ Anime, Animegirl, Quotes

> 𝗢𝗧𝗛𝗘𝗥 𝗖𝗠𝗗𝗦
┃✬│ Bible, Quran, Pair, Credits
┃✬│ Upload, Attp, Url, Image, System
╰══ Made on Earth by Humans ══╯
`;
    await sock.sendMessage(from, { text: menuText });
  }
};

commands.owner = {
  description: "Show bot owner info",
  execute: async (sock, from) => {
    await sock.sendMessage(from, {
      text: `👑 Owner: ${process.env.OWNER_NAME}\n📞 wa.me/${process.env.OWNER_NUMBER}`
    });
  }
};

commands.runtime = {
  description: "Show bot uptime",
  execute: async (sock, from) => {
    const uptime = formatRuntime(Date.now() - startTime);
    await sock.sendMessage(from, { text: `⏳ Uptime: ${uptime}` });
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
          text: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ You are now logged in.`
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

process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
