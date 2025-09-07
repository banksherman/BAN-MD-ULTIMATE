// server.js — BAN-MD Pairing (QR + 8-digit code)
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import qrcode from "qrcode";
import NodeCache from "node-cache";
import pino from "pino";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
import cfg from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const cache = new NodeCache();
let sock = null;

// root serves index.html automatically via express.static, but ensure explicit:
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// health
app.get("/api", (_req, res) => res.json({ ok: true, message: `${cfg.appName} Pairing API ✅` }));

// API: get QR image (data URL)
app.get("/api/qr", async (_req, res) => {
  try {
    if (!sock) await startSock();
    const qr = await waitForQr(30000);
    if (!qr) return res.status(504).json({ ok: false, message: "No QR yet" });
    // convert to data URL image
    const dataUrl = await qrcode.toDataURL(qr);
    res.json({ ok: true, qr: dataUrl });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// API: request 8-digit pair code by phone
app.get("/api/pair", async (req, res) => {
  try {
    const phone = (req.query.phone || "").toString().trim();
    if (!phone) return res.status(400).json({ ok: false, message: "Provide ?phone=E164" });
    if (!sock) await startSock();
    if (typeof sock.requestPairingCode !== "function") {
      // fallback local code
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      return res.json({ ok: true, phone, code, message: "Local fallback code" });
    }
    const raw = await sock.requestPairingCode(phone);
    const code8 = raw.replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
    res.json({ ok: true, phone, code: code8, message: "Enter this 8-digit code on your phone" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.listen(PORT, () => console.log(`🚀 ${cfg.appName} Pairing server running on port ${PORT}`));

// -------- Baileys socket
async function startSock() {
  if (sock) return sock;
  const { state, saveCreds } = await useMultiFileAuthState("./sessions/pairing");
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: [cfg.appName, "Chrome", "100.0.0.0"]
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
  return sock;
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
