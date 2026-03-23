# 🃏 Chaos Cards v4 — Setup Guide

## Step 1 — MongoDB Atlas (free database, ~5 minutes)

1. Go to **[mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)** → Sign up free
2. Click **Build a Database** → Choose **M0 Free** → Pick any region → Create
3. **Create a database user:**
   - Username: `chaoscards` (or anything)
   - Password: generate a strong one — **save it**
   - Click **Create User**
4. **Allow all IPs** (so Render can connect):
   - Under "Where would you like to connect from?" → choose **My Local Environment**
   - IP Address: `0.0.0.0/0` → Add Entry → Finish
5. Click **Connect** on your cluster → **Connect your application**
6. Copy the connection string — it looks like:
   ```
   mongodb+srv://chaoscards:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. Replace `<password>` with your actual password
8. Add `chaoscards` as the database name at the end:
   ```
   mongodb+srv://chaoscards:yourpassword@cluster0.xxxxx.mongodb.net/chaoscards?retryWrites=true&w=majority
   ```
   **Save this full string — you'll need it in Step 3**

---

## Step 2 — GitHub

1. Go to [github.com](https://github.com) → Create repo `chaos-cards`
2. Upload `server.js`, `index.html`, `package.json`
   - **Do NOT upload** `accounts.json` (not needed anymore — MongoDB handles it)

---

## Step 3 — Render

1. Go to [render.com](https://render.com) → sign in with GitHub
2. **New → Web Service** → select `chaos-cards` repo
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
4. Before deploying — click **Environment** → **Add Environment Variable:**
   - Key: `MONGODB_URI`
   - Value: *(paste your full MongoDB connection string from Step 1)*
5. Click **Create Web Service** → deploys in ~2 min
6. Share your `onrender.com` URL with friends!

---

## Updating the game

Just upload new `server.js` / `index.html` to GitHub — Render redeploys automatically.
**Accounts are in MongoDB Atlas — they are never affected by updates.**

---

## How accounts work

| Event | What happens |
|-------|-------------|
| First register | Account created in Atlas with 500 chips |
| Login | Chips and stats loaded from Atlas |
| Win a round | Chips updated in Atlas immediately |
| Go broke (0 chips) | 1-hour timer starts |
| Login after timer | Automatically receive 100 chips |
| Server restart / redeploy | Accounts fully preserved in Atlas |

---

## Game Modes

### Blackjack
- Target: get closest to 21 without busting (going over)
- Blackjack (21 with 2 cards) pays 3:2, 6:5, or 1:1 (configurable)
- Stand on soft 17 and double down are configurable by the host

### Poker
- Each player gets 2 hole cards
- 5 community cards are dealt (flop/turn/river)
- Best 5-card hand wins — no bust rule, everyone plays their hand
- Blinds and ante are configurable

---

## Special Cards (16 total — all toggleable)

Chaos presets: **None / Mild / Wild / All Chaos**

| Card | Effect |
|------|--------|
| 💳 Credit Card | Draw 2 free, owe 5 chips next round |
| 🪪 Driver's Licence | Bust immunity this round |
| 🛒 Shopping List | Random 2–10 card added |
| 🕳️ Black Hole | Removes highest card from all opponents |
| 🎱 Lucky 8-Ball | 3 community cards revealed |
| 📋 IRS Notice | All pay 3 chips to pot |
| 🧾 Receipt | Peek at a random opponent's hand |
| 🦆 Rubber Duck | Score locks at 17 |
| 🔄 Identity Swap | Swap hands with random opponent |
| ⚡ Double Down | Double bet, one more card, stand |
| 🧊 Deep Freeze | Next player's turn skipped |
| 🪞 Magic Mirror | Copy highest score at table |
| 💣 Time Bomb | Everyone else takes a card |
| 🃏 Wild Card | Counts as 7 |
| 💰 Tax Return | Collect 4 chips from everyone |
| 🌀 Amnesia | Community cards wiped and re-dealt |

## Keybindings (rebindable)
- `H` → Hit
- `S` → Stand
- `B` → Confirm Bet
- `↑ / ↓` → Raise / lower bet by 5
