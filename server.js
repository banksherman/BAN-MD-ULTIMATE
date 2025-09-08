import express from "express";
import cors from "cors";
import pino from "pino";
import qrcode from "qrcode";
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";

const app = express();
app.use(cors());
app.use(express.json());

const logger = pino({ level: "info" });
let sessions = {};

// Fancy Menu on Home Route
app.get("/", (req, res) => {
  res.send(`
    <pre>
   ╔══════════════════════════════════════╗
   ║   🚀 BAN-MD ULTIMATE - WHATSAPP BOT  ║
   ║         By KHAREL BANKS OFC          ║
   ╠══════════════════════════════════════╣
   ║ 1. GET QR CODE   → /qr               ║
   ║ 2. GET PAIR CODE → /pair             ║
   ║ 3. HEALTH CHECK  → /health           ║
   ╚══════════════════════════════════════╝
    </pre>
  `);
});

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "running", bot: "BAN-MD Ultimate" });
});

// Create or reuse WhatsApp session
async function createSession(sessionId = "session1") {
  if (sessions[sessionId]) return sessions[sessionId];

  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: true, logger });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    if (update.connection === "open") logger.info(`✅ Connected as ${sessionId}`);
    if (update.connection === "close") logger.warn(`❌ Connection closed for ${sessionId}`);
  });

  sessions[sessionId] = sock;
  return sock;
}

// QR Code Endpoint
app.get("/qr", async (req, res) => {
  const session = await createSession();
  if (!session) return res.status(500).send("Failed to create session");
  qrcode.toDataURL("Scan this QR inside terminal!", (err, url) => {
    if (err) return res.status(500).send("Error generating QR");
    res.send(`<img src="${url}" />`);
  });
});

// Pair Code Endpoint (simple demo)
app.get("/pair", async (req, res) => {
  const session = await createSession();
  res.send("📲 Pair Code feature coming soon...");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`BAN-MD Ultimate running on port ${PORT}`));
