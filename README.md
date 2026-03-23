# 🃏 Chaos Cards v4

## IMPORTANT — File structure
```
chaos-cards/
  server.js       ← game server (overwrite to update)
  index.html      ← frontend   (overwrite to update)
  package.json    ← dependencies (overwrite to update)
  accounts.json   ← ⚠️ DO NOT OVERWRITE — player accounts & chips live here
```
**`accounts.json` is created automatically on first run. Never include it in updates.**

---

## Deploy to Render (Free)

### Step 1 — GitHub
1. [github.com](https://github.com) → New repo → `chaos-cards`
2. Upload `server.js`, `index.html`, `package.json` only

### Step 2 — Render
1. [render.com](https://render.com) → sign in with GitHub
2. **New → Web Service** → select repo
3. Settings: Runtime: Node · Build: `npm install` · Start: `node server.js` · Instance: **Free**
4. Deploy → get your URL

> Open your URL ~1 min before friends join to wake the server from sleep.

---

## Updating the game
1. Replace `server.js` and/or `index.html` on GitHub
2. Render auto-redeploys in ~90 seconds
3. `accounts.json` is **not in GitHub** — it lives on Render's disk and is untouched

---

## Features

### Accounts
- Register/login with username + password
- Chips persist across sessions in `accounts.json`
- Start with **500 chips**
- Go broke → wait **1 hour** → get **100 free chips**
- Stats tracked: chips, rounds won, games played

### Game Modes
| Mode | Rules |
|------|-------|
| **Blackjack** | Target 21, bust on >21, 3:2/6:5/1:1 BJ pays, soft 17 toggle, double down toggle |
| **Poker** | Best 5-card hand from hole cards + 5 community cards, blinds, ante, no bust rule |

### Special Cards (16, all toggleable)
Chaos presets: None / Mild / Wild / All

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

### Card Backs
6 designs: Classic, Navy, Forest, Midnight, Crimson, Gold

### Keybindings
H=Hit · S=Stand · B=Bet · ↑/↓=Adjust bet · All rebindable
