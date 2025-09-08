// BAN-MD Ultimate Config

export default {
  BOT_NAME: process.env.BOT_NAME || "BAN-MD Ultimate",
  PREFIX: process.env.PREFIX || "!",
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE === "true",

  // 🔑 Session
  SESSION_ID: process.env.SESSION_ID || "BANMD-96543507",

  // 👑 Owner
  OWNER_NAME: process.env.OWNER_NAME || "Kharel Herman",
  OWNER_NUMBER: process.env.OWNER_NUMBER || "256726212154",

  // Alive
  LIVE_MSG: process.env.LIVE_MSG || "✅ Yes, I'm alive! BAN-MD-Ultimate 😀",
  ALIVE_IMG: process.env.ALIVE_IMG || "https://i.ibb.co/3Y9QZHg/alive.jpg",

  // Menu
  MENU_IMAGE_URL: process.env.MENU_IMAGE_URL || "https://i.ibb.co/7VYhZjJ/menu.jpg",

  // Welcome
  WELCOME_MSG: process.env.WELCOME_MSG || "👋 Welcome to the group!"
};
