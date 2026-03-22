# 🃏 Chaos Cards — Multiplayer Setup

## Deploy to Render (Completely Free, ~5 minutes)

> ⚠️ **Cold starts:** Render's free tier spins down after 15 minutes of inactivity.
> The first person to visit will wait ~50 seconds for it to wake up — after that
> everyone connects instantly as normal. Totally free, no credit card needed.

### Step 1 — Create a GitHub repo
1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click **New repository** → name it `chaos-cards` → click **Create repository**
3. Upload these 3 files: `server.js`, `index.html`, `package.json`
   - Click **Add file → Upload files** and drag all 3 in

### Step 2 — Deploy on Render
1. Go to [render.com](https://render.com) and sign in with GitHub (no credit card needed)
2. Click **New → Web Service**
3. Select your `chaos-cards` GitHub repo
4. Fill in the settings:
   - **Name:** chaos-cards (or anything you like)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Click **Create Web Service**
6. Wait ~2 minutes for the first deploy to finish
7. Your URL will be something like: `https://chaos-cards.onrender.com`

### Step 3 — Share with friends
Send them the Render URL. They open it in any browser, enter a name, and join!

> 💡 **Tip:** To avoid cold starts, open the URL yourself a minute before
> your friends join — it'll be warm and ready.

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
