# BAN-MD ULTIMATE WHATSHAPP BOT
Full-featured WhatsApp Multi-Device bot framework with QR + 8-digit pair login, clean modular commands, and a built-in landing page.

## Run (Node 18+)
```
npm install
npm start
```
- Open http://localhost:3000/ → click **Generate QR** or **Get Pair Code**.
- Or call `/qr`, `/pair?phone=+256700000000`, `/api`

## Configure
Edit `config.js`:
```js
export default {
  owner: ["256700000000@s.whatsapp.net"],
  prefix: "*",
  api: {
    openai: "YOUR_OPENAI_KEY_HERE",
    gemini: "YOUR_GEMINI_KEY_HERE",
    bing: "YOUR_BING_KEY_HERE"
  }
}
```

## Commands
- Core: `alive`, `ping`, `help`
- Group: `add`, `kick`, `promote`, `demote`, `tagall`, `mute`, `unmute`
- Moderation: `antilink`, `warn`
- Media/Tools: `sticker`, `photo`, `play`, `ytv`, `qr`, `calc`
- AI: `gpt`, `gemini`, `bing`

> More commands can be added by placing files in `./commands/<group>/` exporting `{ name, description, async execute({ sock, m, chatId, args }){} }`.
> pair
> https://ban-md-ultimate.onrender.com
https://ban-md-ultimate.onrender.com/
