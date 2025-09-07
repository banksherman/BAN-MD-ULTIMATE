// commands/core/core.js — alive, ping, help
export default [
  {
    name: "alive",
    description: "Bot alive check",
    async execute({ sock, chatId }) {
      await sock.sendMessage(chatId, { text: "✅ BAN-MD ULTIMATE WHATSHAPP BOT is alive!" });
    },
  },
  {
    name: "ping",
    description: "Latency",
    async execute({ sock, chatId }) {
      const t = Date.now();
      await sock.sendMessage(chatId, { text: "Pinging..." });
      await sock.sendMessage(chatId, { text: `🏓 ${Date.now() - t}ms` });
    },
  },
  {
    name: "help",
    description: "List commands",
    async execute({ sock, chatId }) {
      const list = [
        "*alive*, *ping*, *help*",
        "*add*, *kick*, *promote*, *demote*, *tagall*, *mute*, *unmute*",
        "*antilink*, *warn*",
        "*sticker*, *photo*, *play*, *ytv*, *qr*, *calc*",
        "*gpt*, *gemini*, *bing*",
      ].join("\n");
      await sock.sendMessage(chatId, { text: "📜 Commands:\n" + list });
    },
  },
];
