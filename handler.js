// src/handler.js — loader + dispatcher + moderation hook
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let moderationCheck = null; // function(chatId, text) -> string|null

export function setModerationHook(fn) {
  moderationCheck = fn || moderationCheck;
}

export async function loadAllCommands(rootDir) {
  const abs = path.isAbsolute(rootDir) ? rootDir : path.join(process.cwd(), rootDir);
  const groups = fs.readdirSync(abs).filter((d) => fs.statSync(path.join(abs, d)).isDirectory());
  const map = new Map();
  for (const g of groups) {
    const dir = path.join(abs, g);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
    for (const f of files) {
      const mod = await import(path.join(dir, f) + "?v=" + Date.now());
      const list = Array.isArray(mod.default) ? mod.default : [mod.default];
      for (const cmd of list) {
        if (!cmd?.name || !cmd?.execute) continue;
        map.set(cmd.name.toLowerCase(), { group: g, ...cmd });
      }
      // If a module exports a 'moderationHook', register it
      if (mod.moderationHook && typeof mod.moderationHook === "function") {
        setModerationHook(mod.moderationHook);
      }
    }
  }
  console.log("Loaded commands:", [...map.keys()].join(", "));
  return map;
}

const PREFIX = "*";

export async function handleUpsert(sock, upsert, commands) {
  const m = upsert.messages?.[0];
  if (!m || m.key.fromMe) return;

  const chatId = m.key.remoteJid;
  const text =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    "";

  // basic moderation scan
  if (moderationCheck) {
    const res = moderationCheck(chatId, text);
    if (res) {
      await sock.sendMessage(chatId, { text: "⚠️ " + res }, { quoted: m });
      // optionally delete message if you are admin (not implemented here)
    }
  }

  if (!text.startsWith(PREFIX)) return;

  const [cmd, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  const name = cmd.toLowerCase();
  const command = commands.get(name);
  if (!command) {
    await sock.sendMessage(chatId, { text: `❓ Unknown command: *${name}*` }, { quoted: m });
    return;
  }

  try {
    await command.execute({ sock, m, chatId, args });
  } catch (e) {
    console.error("Command error:", name, e);
    await sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: m });
  }
}
