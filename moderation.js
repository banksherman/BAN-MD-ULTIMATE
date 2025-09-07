// commands/moderation/moderation.js — antilink, warn
const antiLink = new Map(); // chatId -> boolean
const warns = new Map(); // key chatId:user -> count
const LIMIT = 3;

function key(chatId, user){ return chatId + ":" + user; }

export default [
  {
    name: "antilink",
    description: "Toggle anti-link in this group: *antilink on/off*",
    async execute({ sock, chatId, m, args }) {
      if (!chatId.endsWith("@g.us")) return sock.sendMessage(chatId, { text: "Group only." }, { quoted: m });
      const state = (args[0] || "").toLowerCase();
      if (state === "on") { antiLink.set(chatId, true); }
      else if (state === "off") { antiLink.delete(chatId); }
      const on = antiLink.has(chatId);
      await sock.sendMessage(chatId, { text: `🔗 Anti-link is now ${on ? "ON" : "OFF"}.` }, { quoted: m });
    },
  },
  {
    name: "warn",
    description: "Warn a user (3 = kick). Usage: *warn @user* or reply",
    async execute({ sock, chatId, m, args }) {
      if (!chatId.endsWith("@g.us")) return sock.sendMessage(chatId, { text: "Group only." }, { quoted: m });
      const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const target = mentions[0];
      if (!target) return sock.sendMessage(chatId, { text: "Mention a user to warn: *warn @user*"}, { quoted: m });
      const k = key(chatId, target);
      const c = (warns.get(k) || 0) + 1;
      warns.set(k, c);
      await sock.sendMessage(chatId, { text: `⚠️ ${target} warned (${c}/${LIMIT}).` }, { quoted: m });
      if (c >= LIMIT) {
        try {
          await sock.groupParticipantsUpdate(chatId, [target], "remove");
          warns.delete(k);
          await sock.sendMessage(chatId, { text: `🚫 ${target} removed for exceeding warnings.` });
        } catch (e) {
          await sock.sendMessage(chatId, { text: "Tried to kick but failed: " + e.message });
        }
      }
    },
  },
];

// moderationHook for handler
export function moderationHook(chatId, text) {
  if (!antiLink.has(chatId)) return null;
  if (/https?:\/\//i.test(text || "")) return "Links are not allowed in this group.";
  return null;
}
