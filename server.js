// BAN-MD Ultimate Pairing Server
// Node.js v20+ recommended

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public/
app.use(express.static(path.join(__dirname, "public")));

let sock;

// -------------------- WhatsApp Socket --------------------
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessions");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: { level: "silent" }
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
      if (shouldReconnect) setTimeout(startSock, 2000);
      else console.log("🛑 Logged out. Delete sessions/ to relink.");
    }
  });
}

// -------------------- API Endpoints --------------------

// Generate 8-character pairing code for number
app.get("/pair", async (req, res) => {
  if (!sock) return res.json({ ok: false, message: "Bot not ready yet" });

  const number = req.query.number;
  if (!number) return res.json({ ok: false, message: "Number required" });

  try {
    // This generates the official 8-character pairing code
    const code = await sock.requestPairingCode(number);
    res.json({ ok: true, code });
  } catch (err) {
    console.error("❌ Pairing error:", err);
    res.json({ ok: false, message: err.message });
  }
});

// Root route → serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------------------- Boot --------------------
app.listen(PORT, () => {
  console.log(`🚀 BAN-MD Ultimate Pairing Server running on http://localhost:${PORT}`);
  startSock().catch((e) => console.error("❌ Failed to start WhatsApp socket:", e));
});
