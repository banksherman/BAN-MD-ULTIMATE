// BAN-MD Ultimate Pairing Server for Render
// Node.js v20+ recommended

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
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

// Serve static files (public folder)
app.use(express.static(path.join(__dirname, "public")));

let sock;

// -------------------- WhatsApp Socket --------------------
async function startSock() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("./sessions");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: { level: "silent" },
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
        if (shouldReconnect) setTimeout(startSock, 5000); // retry after 5s
        else console.log("🛑 Logged out. Delete sessions/ to relink.");
      }
    });
  } catch (err) {
    console.error("❌ Failed to start WhatsApp socket:", err);
    setTimeout(startSock, 5000); // retry after 5s
  }
}

// -------------------- API Endpoints --------------------

// Pairing code generator
app.get("/pair", async (req, res) => {
  if (!sock) return res.json({ ok: false, message: "Bot not ready yet" });

  const number = req.query.number;
  if (!number) return res.json({ ok: false, message: "Number required" });

  try {
    const code = await sock.requestPairingCode(number); // 8-character code
    res.json({ ok: true, code });
  } catch (err) {
    console.error("❌ Pairing error:", err);
    res.json({ ok: false, message: err.message });
  }
});

// Health check
app.get("/health", (req, res) => res.send("✅ Server running"));

// Serve your index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------------------- Start Server --------------------
app.listen(PORT, () => {
  console.log(`🚀 BAN-MD Ultimate Pairing Server running on port ${PORT}`);
  startSock();
});

