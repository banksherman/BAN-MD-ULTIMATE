// BAN-MD Ultimate Pairing + Bot Server
// Node.js v20+ recommended

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

let sock;
const PREFIX = "!";

// Example categories
const categories = {
  "1": { name: "AI", commands: ["ai1", "ai2"] },
  "2": { name: "MEDIA EDIT", commands: ["edit1", "edit2"] },
  "3": { name: "GROUP", commands: ["group1", "group2"] },
  "4": { name: "CODING", commands: ["code1", "code2"] },
  "5": { name: "FUN", commands: ["joke", "meme"] },
};

// -------------------- WhatsApp Socket --------------------
async function startSock() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("./sessions");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: "silent" }),
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log("✅ WhatsApp connected!");
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
        console.log("❌ Connection closed.", { code, shouldReconnect });
        if (shouldReconnect) setTimeout(startSock, 5000);
        else console.log("🛑 Logged out. Delete sessions/ to relink.");
      }
    });

    // -------------------- Message Handler --------------------
    sock.ev.on("messages.upsert", async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const text =
        msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) return;

      console.log("📩 Received:", text);

      if (text.startsWith(PREFIX)) {
        const cmd = text.slice(PREFIX.length).trim().toLowerCase();

        // !ping
        if (cmd === "ping") {
          const start = Date.now();
          await sock.sendMessage(from, { text: "Pong 🏓" });
          const end = Date.now();
          await sock.sendMessage(from, { text: `⏱ Speed: ${end - start}ms` });
        }

        // !alive
        else if (cmd === "alive") {
          await sock.sendMessage(from, {
            text: "✅ YES AM ONLINE\nBAN-MD-ULTIMATE 😀😀 HEHE",
          });
        }

        // !menu
        else if (cmd === "menu") {
          let menuMessage = `Hey there 😀💻\n\n`;
          menuMessage += `╭───〔 *BAN-MD Ultimate* 〕──────┈⊷\n`;
          menuMessage += `│ Prefix: [ ${PREFIX} ]\n`;
          menuMessage += `│ Commands: 223\n`;
          menuMessage += `╰──────────────────────⊷\n\n`;
          menuMessage += `📂 *CATEGORIES*\n`;
          for (let key in categories)
            menuMessage += `> ${key}. ${categories[key].name}\n`;
          await sock.sendMessage(from, { text: menuMessage });
        }

        // !tagall
        else if (cmd === "tagall") {
          if (!from.endsWith("@g.us"))
            return await sock.sendMessage(from, {
              text: "❌ This command only works in groups.",
            });

          const metadata = await sock.groupMetadata(from);
          const participants = metadata.participants.map((p) => p.id);
          await sock.sendMessage(from, {
            text: `📢 *Tagging All Members*\n\n${participants
              .map((p) => `@${p.split("@")[0]}`)
              .join(" ")}`,
            mentions: participants,
          });
        }

        // !hidetag
        else if (cmd.startsWith("hidetag")) {
          if (!from.endsWith("@g.us"))
            return await sock.sendMessage(from, {
              text: "❌ This command only works in groups.",
            });

          const metadata = await sock.groupMetadata(from);
          const participants = metadata.participants.map((p) => p.id);

          const msgText = text.replace("hidetag", "").trim() || "👋 Hello!";
          await sock.sendMessage(from, {
            text: msgText,
            mentions: participants,
          });
        }

        else {
          await sock.sendMessage(from, {
            text: `❌ Unknown command. Type ${PREFIX}menu for help.`,
          });
        }
      }
    });
  } catch (err) {
    console.error("❌ startSock error:", err);
    setTimeout(startSock, 5000);
  }
}

// -------------------- API Endpoints --------------------
app.get("/pair", async (req, res) => {
  if (!sock) return res.json({ ok: false, message: "Bot not ready yet" });

  const number = req.query.number;
  if (!number) return res.json({ ok: false, message: "Number required" });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ ok: true, code });
  } catch (err) {
    console.error("❌ Pair error:", err);
    res.json({ ok: false, message: err.message });
  }
});

app.get("/health", (req, res) => res.send("✅ Server running"));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

// -------------------- Start --------------------
app.listen(PORT, () => {
  console.log(`🚀 BAN-MD Ultimate Pairing Server running on port ${PORT}`);
  startSock();
});
