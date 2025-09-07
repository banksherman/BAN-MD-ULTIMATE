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
let qrTimestamp = null;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessions");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false // don’t print in console, we’ll serve it
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      lastQR = qr;
      qrTimestamp = Date.now();
      console.log("✅ New QR generated, valid for 20s...");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp logged in as", sock.user.id);
      sock.sendMessage(sock.user.id, {
        text: `🤖 Welcome! Session ID: ${sock.user.id}`
      });
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startSock();

// endpoint for frontend to fetch latest QR
app.get("/qr", (req, res) => {
  // Check if QR is expired (20s max)
  if (!lastQR || (Date.now() - qrTimestamp > 20000)) {
    return res.status(404).json({ ok: false, message: "QR expired, please reload" });
  }
  res.json({ ok: true, qr: lastQR });
});

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
