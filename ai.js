// commands/ai/ai.js — gpt, gemini, bing (real API calls, keys in config.js)
import fetch from "node-fetch";
import cfg from "../../config.js";

export default [
  {
    name: "gpt",
    description: "OpenAI ChatGPT: *gpt <prompt>*",
    async execute({ sock, chatId, args }) {
      const prompt = args.join(" ");
      if (!prompt) return sock.sendMessage(chatId, { text: "Usage: *gpt your question*" });
      const key = cfg.api.openai;
      if (!key || key.includes("YOUR_OPENAI")) return sock.sendMessage(chatId, { text: "Set OpenAI key in config.js" });
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }] }),
      });
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 1000);
      await sock.sendMessage(chatId, { text });
    },
  },
  {
    name: "gemini",
    description: "Google Gemini: *gemini <prompt>*",
    async execute({ sock, chatId, args }) {
      const prompt = args.join(" ");
      if (!prompt) return sock.sendMessage(chatId, { text: "Usage: *gemini your prompt*" });
      const key = cfg.api.gemini;
      if (!key || key.includes("YOUR_GEMINI")) return sock.sendMessage(chatId, { text: "Set Gemini key in config.js" });
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(j).slice(0, 1000);
      await sock.sendMessage(chatId, { text });
    },
  },
  {
    name: "bing",
    description: "Bing AI (stub using web search API call)",
    async execute({ sock, chatId, args }) {
      const q = args.join(" ");
      const key = cfg.api.bing;
      if (!q) return sock.sendMessage(chatId, { text: "Usage: *bing <query>*" });
      if (!key || key.includes("YOUR_BING")) return sock.sendMessage(chatId, { text: "Set Bing key in config.js" });
      const r = await fetch("https://api.bing.microsoft.com/v7.0/search?q=" + encodeURIComponent(q), {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      const j = await r.json();
      const first = j?.webPages?.value?.[0];
      const text = first ? `🔎 ${first.name}\n${first.snippet}` : "No results.";
      await sock.sendMessage(chatId, { text });
    },
  },
];
