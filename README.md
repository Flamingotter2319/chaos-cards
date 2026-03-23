# 🃏 Chaos Cards v2 — Multiplayer Setup

## Deploy to Render (Completely Free)

> ⚠️ **Cold starts:** Render's free tier sleeps after 15 min of inactivity.
> First visitor waits ~50s for it to wake. After that, everyone connects instantly.
> No credit card needed.

### Step 1 — GitHub repo
1. Go to [github.com](https://github.com) → **New repository** → name it `chaos-cards`
2. Upload `server.js`, `index.html`, `package.json`

### Step 2 — Deploy on Render
1. Go to [render.com](https://render.com) → sign in with GitHub
2. **New → Web Service** → select your repo
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
4. Click **Create Web Service** — deploys in ~2 min
5. Your URL: `https://chaos-cards.onrender.com`

### Step 3 — Share
Send the URL to friends. They open it, enter a name, done.

> 💡 Open the URL yourself ~1 min before friends join to warm it up.

---

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node.js WebSocket server — all game logic |
| `index.html` | Frontend — served by the server |
| `package.json` | Dependencies (just `ws`) |

## Features (v2)

- ✅ Players see each other around an oval felt table
- ✅ Cards zoom on hover
- ✅ Chat works in both lobby and in-game
- ✅ All players auto-navigate to game when host starts
- ✅ Betting works correctly — bots auto-bet, round starts when all bets placed
- ✅ Server closes when host leaves
- ✅ Rounds auto-continue without going back to lobby
- ✅ Join mid-game as spectator, play from next round
- ✅ Game settings: Blackjack / Poker mode, deck count, chips, bet limits
- ✅ 16 special cards
- ✅ Mix of Simple / Smart / Chaotic bots

## Special Cards (16)

| Card | Effect |
|------|--------|
| 💳 Credit Card | Draw 2 free cards, owe 5 chips next round |
| 🪪 Driver's Licence | Bust immunity this round |
| 🛒 Shopping List | Random 2–10 card added to hand |
| 🕳️ Black Hole | Removes highest card from all other hands |
| 🎱 Lucky 8-Ball | Reveals 3 community cards instantly |
| 📋 IRS Notice | Everyone pays 3 chips to pot |
| 🧾 Receipt | Peek at a random opponent's hand |
| 🦆 Rubber Duck | Score locked at 17 this round |
| 🔄 Identity Swap | Swap hands with a random opponent |
| ⚡ Double Down | Double your bet, draw one card, stand |
| 🧊 Deep Freeze | Skip next player's turn |
| 🪞 Magic Mirror | Copy the highest score at the table |
| 💣 Time Bomb | Everyone else must take one card |
| 🃏 Wild Card | Counts as 7 |
| 💰 Tax Return | Collect 4 chips from every other player |
| 🌀 Amnesia | Community cards wiped and re-dealt |

## Bot Types

| Bot | Strategy |
|-----|---------|
| 🤖 SimpleBot | Hits below 16, stands otherwise |
| 🧠 SmartBot | Uses community card values to decide |
| 🎲 ChaosBot | Mostly random — unpredictable |
