// server.js — BAN-MD Ultimate WhatsApp Bot (Bundled)
import express from "express";
import cors from "cors";
import pino from "pino";
import NodeCache from "node-cache";
import path from "path";
import { fileURLToPath } from "url";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); 

const PORT = process.env.PORT || 3000;
let sock = null;
const cache = new NodeCache();

app.get("/api", (_req, res) => res.json({ ok: true, message: "BAN-MD Ultimate API ✅" }));

app.get("/qr", async (_req, res) => {
  try {
    if (!sock) await startSock();
    const qr = await waitForQr(30000);
    if (!qr) return res.status(504).json({ ok: false, message: "No QR yet" });
    res.json({ ok: true, qr });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/paircode", async (req, res) => {
  try {
    const phone = (req.query.phone || "").toString().trim();
    if (!phone) return res.status(400).json({ ok: false, message: "Provide ?phone=E164" });
    if (!sock) await startSock();
    if (typeof sock.requestPairingCode !== "function") {
      return res.status(501).json({ ok: false, message: "Pair code not supported. Use QR." });
    }
    let raw = await sock.requestPairingCode(phone);
    const code8 = raw.replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
    res.json({ ok: true, code: code8, message: "Enter this 8‑digit code on your phone" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.listen(PORT, () => console.log("🚀 BAN-MD Ultimate WhatsApp Bot on port " + PORT));

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessions/ultimate");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    browser: ["BAN-MD-Ultimate", "Chrome", "120.0.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) cache.set("QR", qr, 25);
    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnect:", shouldReconnect);
      if (shouldReconnect) startSock();
    } else if (connection === "open") {
      console.log("✅ WhatsApp connected");
    }
  });
}

function waitForQr(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const cached = cache.get("QR");
    if (cached) return resolve(cached);
    let done = false;
    const onUpd = (u) => {
      if (u.qr && !done) {
        done = true;
        sock.ev.off("connection.update", onUpd);
        resolve(u.qr);
      }
    };
    sock.ev.on("connection.update", onUpd);
    setTimeout(() => {
      if (!done) {
        sock?.ev?.off?.("connection.update", onUpd);
        resolve(null);
      }
    }, timeoutMs);
  });
}

startSock().catch((e) => console.error("startSock failed:", e));
