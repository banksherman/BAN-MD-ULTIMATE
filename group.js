// commands/group/group.js — add, kick, promote, demote, tagall, mute, unmute
async function needGroup(sock, chatId, m) {
  if (!chatId.endsWith("@g.us")) {
    await sock.sendMessage(chatId, { text: "This command works only in groups." }, { quoted: m });
    return false;
  }
  return true;
}

function parseTargets(m, args) {
  const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length) return mentions;
  return args.map(a => a.includes("@") ? a : a.replace(/\D/g, "") + "@s.whatsapp.net");
}

export default [
  {
    name: "add",
    description: "Add a member to group. Usage: *add <phone>*",
    async execute({ sock, chatId, m, args }) {
      if (!(await needGroup(sock, chatId, m))) return;
      const phone = (args[0] || "").replace(/\D/g, "");
      if (!phone) return sock.sendMessage(chatId, { text: "Provide a phone: *add 256700000000*" }, { quoted: m });
      try {
        await sock.groupParticipantsUpdate(chatId, [phone + "@s.whatsapp.net"], "add");
        await sock.sendMessage(chatId, { text: "✅ Invited: " + phone }, { quoted: m });
      } catch (e) {
        await sock.sendMessage(chatId, { text: "❌ " + e.message }, { quoted: m });
      }
    },
  },
  {
    name: "kick",
    description: "Remove members. Reply or mention or use numbers.",
    async execute({ sock, chatId, m, args }) {
      if (!(await needGroup(sock, chatId, m))) return;
      const target = parseTargets(m, args);
      if (!target.length) return sock.sendMessage(chatId, { text: "Mention or provide users to kick." }, { quoted: m });
      await sock.groupParticipantsUpdate(chatId, target, "remove");
      await sock.sendMessage(chatId, { text: "🗑️ Removed: " + target.join(", ") }, { quoted: m });
    },
  },
  {
    name: "promote",
    description: "Give admin role (reply or mention).",
    async execute({ sock, chatId, m, args }) {
      if (!(await needGroup(sock, chatId, m))) return;
      const target = parseTargets(m, args);
      if (!target.length) return sock.sendMessage(chatId, { text: "Mention or provide users to promote." }, { quoted: m });
      await sock.groupParticipantsUpdate(chatId, target, "promote");
      await sock.sendMessage(chatId, { text: "⬆️ Promoted." }, { quoted: m });
    },
  },
  {
    name: "demote",
    description: "Remove admin role (reply or mention).",
    async execute({ sock, chatId, m, args }) {
      if (!(await needGroup(sock, chatId, m))) return;
      const target = parseTargets(m, args);
      if (!target.length) return sock.sendMessage(chatId, { text: "Mention or provide users to demote." }, { quoted: m });
      await sock.groupParticipantsUpdate(chatId, target, "demote");
      await sock.sendMessage(chatId, { text: "⬇️ Demoted." }, { quoted: m });
    },
  },
  {
    name: "tagall",
    description: "Tag all members optionally with message. Usage: *tagall <text>*",
    async execute({ sock, chatId, m, args }) {
      if (!(await needGroup(sock, chatId, m))) return;
      const meta = await sock.groupMetadata(chatId);
      const jids = meta.participants.map(p => p.id);
      const text = args.length ? args.join(" ") : "Tagging all";
      await sock.sendMessage(chatId, { text, mentions: jids }, { quoted: m });
    },
  },
  {
    name: "mute",
    description: "Admins only (close)",
    async execute({ sock, chatId, m }) {
      if (!(await needGroup(sock, chatId, m))) return;
      await sock.groupSettingUpdate(chatId, "announcement");
      await sock.sendMessage(chatId, { text: "🔒 Group is now admins-only." }, { quoted: m });
    },
  },
  {
    name: "unmute",
    description: "Open to all (not_announcement)",
    async execute({ sock, chatId, m }) {
      if (!(await needGroup(sock, chatId, m))) return;
      await sock.groupSettingUpdate(chatId, "not_announcement");
      await sock.sendMessage(chatId, { text: "🔓 Group is now open to all." }, { quoted: m });
    },
  },
];
