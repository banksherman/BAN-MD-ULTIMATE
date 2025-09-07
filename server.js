import express from "express";
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import fs from "fs";
import path from "path";

const app = express();
const __dirname = path.resolve();
const PORT = process.env.PORT || 3000;

// Ensure public folder exists
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

app.use(express.static(publicDir));

let sock;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessions");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;

    if (qr) {
      const qrPath = path.join(publicDir, "qr.json");
      fs.writeFileSync(qrPath, JSON.stringify({ qr }));
      console.log("✅ QR saved to /public/qr.json");
    }

    if (connection === "open") {
      const id = sock.user.id;
      await sock.sendMessage(id, {
        text: `🤖 Welcome to BAN-MD Ultimate!\n✅ Session ID: ${id}`,
      });
      console.log("✅ Logged in as:", id);
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startSock();

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
