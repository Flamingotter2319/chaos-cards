# 🃏 Chaos Cards — Multiplayer Setup

## Deploy to Railway (Free, ~5 minutes)

### Step 1 — Create a GitHub repo
1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click **New repository** → name it `chaos-cards` → click **Create repository**
3. Upload these 3 files: `server.js`, `index.html`, `package.json`
   - Click **Add file → Upload files** and drag all 3 in

### Step 2 — Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your `chaos-cards` repo
4. Railway auto-detects Node.js and runs `npm start`
5. Click **Generate Domain** under Settings → Networking
6. Your game is live at something like: `https://chaos-cards-production.up.railway.app`

### Step 3 — Share with friends
Send them the Railway URL. That's it — they open it in any browser, enter a name, and join!

---

## Run Locally (same WiFi / testing)

```bash
# Install Node.js from nodejs.org first, then:
npm install
node server.js
# Open http://localhost:3000 in your browser
```

## File Overview

| File | Purpose |
|------|---------|
| `server.js` | Node.js WebSocket server — all game logic lives here |
| `index.html` | Frontend — served by the server, open in any browser |
| `package.json` | Node dependencies (just `ws` for WebSockets) |

## Bot Types

| Bot | Strategy |
|-----|---------|
| 🤖 SimpleBot | Hits below 16, stands otherwise |
| 🧠 SmartBot | Uses community cards + odds to decide |
| 🎲 ChaosBot | Mostly random — loves chaos, occasionally wild |

## Special Cards in the Deck

| Card | Effect |
|------|--------|
| 💳 Credit Card | Draw 2 free cards, owe 5 chips next round |
| 🪪 Driver's Licence | Bust immunity this round |
| 🛒 Shopping List | Random 2–10 added to your hand |
| 🕳️ Black Hole | Removes highest card from all other hands |
| 🎱 Lucky 8-Ball | Reveals 3 community cards instantly |
| 📋 IRS Notice | Everyone pays 3 chips to the pot |
| 🧾 Receipt | Secretly peek at a random opponent's hand |
| 🦆 Rubber Duck | Your score locks at exactly 17 |
