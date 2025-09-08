// BAN-MD Ultimate Bot Server
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
  ytmp4: { description: "Download YouTube video", execute: async (sock, from, body) => commands.song.execute(sock, from, body) },
  video: { description: "Download YouTube video", execute: async (sock, from, body) => commands.ytmp4.execute(sock, from, body) },

  sticker: {
    description: "Convert image/video to sticker",
    execute: async (sock, from, body, msg) => {
      try {
        const mediaMessage = msg.message.imageMessage || msg.message.videoMessage;
        if (!mediaMessage) return await sock.sendMessage(from, { text: "❌ Send an image or short video with !sticker" });

        const buffer = mediaMessage.imageMessage ? mediaMessage.imageMessage.data : mediaMessage.videoMessage.data;
        const stickerBuffer = await sharp(buffer).re
