import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";

const app = express();
const __dirname = path.resolve();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

let sock;
let lastQR = null;
let sessionId = null; // custom session ID
let jid = null;       // store actual WhatsApp JID

// 🔑 generate new session ID
function generateSessionId() {
  return "BANMD-" + Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessions");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      lastQR = qr;
      console.log("✅ QR generated, waiting for scan...");
    }

    if (connection === "open") {
      jid = sock.user.id; // WhatsApp real JID
      sessionId = generateSessionId(); // new clean ID

      console.log("✅ Logged in as:", jid);
      console.log("🆔 Session ID:", sessionId);

      const imagePath = path.join(__dirname, "public", "connected.jpg");

      if (fs.existsSync(imagePath)) {
        sock.sendMessage(jid, {
          image: { url: imagePath },
          caption: `🤖 *BAN-MD Ultimate Connected!*\n\n✅ Your Session ID:\n${sessionId}`
        });
      } else {
        sock.sendMessage(jid, {
          text: `🤖 BAN-MD Ultimate Connected!\n\n✅ Your Session ID:\n${sessionId}`
        });
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startSock();

// 🔥 endpoint for frontend QR
app.get("/qr", (req, res) => {
  if (!lastQR) {
    return res.status(404).json({ ok: false, message: "No QR yet" });
  }
  res.json({ ok: true, qr: lastQR });
});

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);

// -------------------- WhatsApp Socket --------------------
const logger = pino({ level: "silent" });

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["BAN-MD-Ultimate", "Chrome", "120.0.0.0"],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 15_000
    // printQRInTerminal is deprecated; we’ll emit QR via connection.update
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      qrAt = Date.now();
      // Clear stale QR after TTL (fallback, frontend also checks)
      setTimeout(() => { if (Date.now() - qrAt > QR_TTL) lastQR = null; }, QR_TTL + 2000);
      console.log("🔐 New QR generated (valid ~20s)...");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connected:", sock?.user?.id);
      // Notify frontend and send a welcome DM
      const jid = sock?.user?.id;
      broadcast("connected", { jid });
      if (jid) {
        sock.sendMessage(jid, {
          text: `🤖 Welcome to BAN-MD Ultimate!\n✅ Session ID: ${jid}\n🎵 Enjoy the vibes!`
        }).catch(() => {});
      }
      // Invalidate QR once connected
      lastQR = null;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 401;
      console.log("❌ Connection closed.", { code, shouldReconnect });

      // If not logged out, try reconnecting
      if (shouldReconnect) {
        setTimeout(startSock, 2000);
      } else {
        console.log("🛑 Logged out. Delete sessions/ to link again.");
      }
    }
  });
}

// Boot
startSock().catch((e) => {
  console.error("startSock failed:", e);
  process.exit(1);
});

// Basic error guards to avoid silent crashes
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

// Start HTTP server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
