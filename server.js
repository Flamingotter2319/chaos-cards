// ══════════════════════════════════════════════════════════
//  CHAOS CARDS — WebSocket Game Server
//  Deploy to Railway: https://railway.app
// ══════════════════════════════════════════════════════════

const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// ── HTTP server (serves the frontend) ──────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const file = path.join(__dirname, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ── WebSocket server ───────────────────────────────────────
const wss = new WebSocket.Server({ server: httpServer });

// ── Global state ───────────────────────────────────────────
// servers: Map<serverId, ServerRoom>
// ServerRoom: { id, name, password, ownerId, players: Map<playerId, Player>, game: GameState|null }
const servers = new Map();
const clients = new Map(); // ws → { playerId, serverId, playerName }

let uidCounter = 1;
const uid = () => String(uidCounter++);

// ── Helpers ────────────────────────────────────────────────
function broadcast(serverId, msg, excludeId = null) {
  const room = servers.get(serverId);
  if (!room) return;
  const data = JSON.stringify(msg);
  room.players.forEach((player, pid) => {
    if (pid === excludeId) return;
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

function sendTo(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws, message) {
  sendTo(ws, { type: 'error', message });
}

function roomSnapshot(room) {
  return {
    id: room.id,
    name: room.name,
    hasPassword: !!room.password,
    ownerId: room.ownerId,
    playerCount: room.players.size,
    maxPlayers: 8,
    inGame: !!room.game,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, isBot: p.isBot,
      chips: p.chips, isOwner: p.id === room.ownerId
    }))
  };
}

function serverListSnapshot() {
  return [...servers.values()].map(r => ({
    id: r.id, name: r.name,
    hasPassword: !!r.password,
    playerCount: r.players.size,
    inGame: !!r.game
  }));
}

function broadcastServerList() {
  const list = serverListSnapshot();
  wss.clients.forEach(ws => {
    const meta = clients.get(ws);
    if (!meta || !meta.serverId) {
      sendTo(ws, { type: 'serverList', servers: list });
    }
  });
}

// ══════════════════════════════════════════════════════════
//  CARD / GAME ENGINE
// ══════════════════════════════════════════════════════════
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SPECIAL_CARDS = [
  { id: 'credit',   name: 'Credit Card',     icon: '💳', style: 'credit',
    effect: 'Draw 2 extra cards — but owe 5 chips to the pot next round.' },
  { id: 'license',  name: "Driver's Licence", icon: '🪪', style: 'license',
    effect: 'Bust immunity this round — stay alive even if over 21.' },
  { id: 'shopping', name: 'Shopping List',    icon: '🛒', style: 'shopping',
    effect: 'A random 2–10 card is added to your hand.' },
  { id: 'blackhole',name: 'Black Hole',       icon: '🕳️', style: 'blackhole',
    effect: "Removes the highest card from every other player's hand." },
  { id: 'lucky8',   name: 'Lucky 8-Ball',     icon: '🎱', style: 'lucky8',
    effect: '3 community cards are revealed instantly.' },
  { id: 'irs',      name: 'IRS Notice',       icon: '📋', style: 'irs',
    effect: 'All players pay 3 chips to the pot.' },
  { id: 'receipt',  name: 'Receipt',          icon: '🧾', style: 'receipt',
    effect: "Reveals a random opponent's hand to you." },
  { id: 'rubber',   name: 'Rubber Duck',      icon: '🦆', style: 'rubber',
    effect: 'Your score is locked at 17 for this round.' },
];

function buildDeck() {
  const deck = [];
  SUITS.forEach(suit => RANKS.forEach(rank => deck.push({ rank, suit, isNormal: true })));
  SPECIAL_CARDS.forEach(sc => deck.push({ ...sc, isSpecial: true }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function simpleVal(card) {
  if (card.isSpecial) return 0;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank) || 0;
}

function handScore(hand, duckLocked) {
  if (duckLocked) return 17;
  let total = 0, aces = 0;
  hand.forEach(c => {
    if (c.isSpecial) return;
    if (c.rank === 'A') { aces++; total += 11; }
    else total += simpleVal(c);
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function applySpecialCard(game, playerIdx, card) {
  const p = game.players[playerIdx];
  const logs = [];

  switch (card.id) {
    case 'credit':
      logs.push({ msg: `💳 ${p.name} used the Credit Card! Drawing 2 cards — owes 5 chips next round.`, type: 'chaos' });
      for (let i = 0; i < 2; i++) {
        if (game.deck.length === 0) game.deck = buildDeck();
        const c = game.deck.pop();
        p.hand.push(c);
        if (c.isSpecial) {
          const subLogs = applySpecialCard(game, playerIdx, c);
          logs.push(...subLogs);
        }
      }
      p.debt = (p.debt || 0) + 5;
      break;

    case 'license':
      logs.push({ msg: `🪪 ${p.name} flashed their Driver's Licence! Bust immunity granted.`, type: 'good' });
      p.bustImmune = true;
      break;

    case 'shopping': {
      const val = Math.floor(Math.random() * 9) + 2;
      const suit = SUITS[Math.floor(Math.random() * 4)];
      p.hand.push({ rank: String(val), suit, isNormal: true });
      logs.push({ msg: `🛒 ${p.name}'s Shopping List scored a ${val}${suit}!`, type: 'chaos' });
      break;
    }

    case 'blackhole':
      logs.push({ msg: `🕳️ ${p.name} opened a Black Hole! Highest cards vanish!`, type: 'chaos' });
      game.players.forEach((pl, i) => {
        if (i === playerIdx || pl.status === 'bust' || pl.hand.length === 0) return;
        const vals = pl.hand.map(c => simpleVal(c));
        const max = Math.max(...vals);
        const idx = vals.lastIndexOf(max);
        if (idx >= 0) pl.hand.splice(idx, 1);
      });
      break;

    case 'lucky8':
      logs.push({ msg: `🎱 ${p.name} shook the Lucky 8-Ball! 3 community cards revealed!`, type: 'good' });
      for (let i = 0; i < 3; i++) {
        if (game.deck.length === 0) game.deck = buildDeck();
        game.community.push(game.deck.pop());
      }
      break;

    case 'irs':
      logs.push({ msg: `📋 ${p.name} played the IRS Notice. Everyone pays 3 chips!`, type: 'bad' });
      game.players.forEach(pl => {
        const pay = Math.min(3, pl.chips);
        pl.chips -= pay;
        game.pot += pay;
      });
      break;

    case 'receipt': {
      const others = game.players.filter((_, i) => i !== playerIdx && game.players[i].status !== 'bust');
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        const preview = target.hand.map(c => c.isSpecial ? c.name : `${c.rank}${c.suit}`).join(', ');
        logs.push({ msg: `🧾 ${p.name} has a Receipt! Peeked at ${target.name}: [${preview}]`, type: 'chaos', privateFor: p.id });
      }
      break;
    }

    case 'rubber':
      logs.push({ msg: `🦆 ${p.name} deployed the Rubber Duck! Score locked at 17.`, type: 'chaos' });
      p.duckLocked = true;
      break;
  }

  return logs;
}

// ── Bot AI ─────────────────────────────────────────────────
const BOT_TYPES = ['simple', 'smart', 'chaotic'];

function botDecide(bot, game, playerIdx) {
  const score = handScore(bot.hand, bot.duckLocked);
  const type = bot.botType || 'simple';

  if (type === 'simple') return score < 16 ? 'hit' : 'stand';

  if (type === 'smart') {
    // Count community card value
    const commVal = game.community.reduce((s, c) => s + simpleVal(c), 0);
    if (score >= 17) return 'stand';
    if (score <= 11) return 'hit';
    // Stand if community cards suggest dealer is weak
    return commVal < 12 ? 'stand' : 'hit';
  }

  if (type === 'chaotic') {
    // Random with bias toward hitting on low scores
    if (score <= 10) return 'hit';
    if (score >= 20) return 'stand';
    return Math.random() < 0.55 ? 'hit' : 'stand';
  }

  return 'stand';
}

// ── Game Flow ──────────────────────────────────────────────
function startGame(room) {
  const players = [...room.players.values()];
  if (players.length < 2) return false;

  const game = {
    deck: buildDeck(),
    community: [],
    pot: 0,
    round: room.round || 1,
    phase: 'betting', // betting | play | reveal
    currentPlayerIdx: 0,
    turnOrder: players.map(p => p.id),
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      botType: p.botType,
      chips: p.chips,
      hand: [],
      bet: 0,
      status: 'waiting', // waiting|betting|active|standing|bust
      bustImmune: false,
      duckLocked: false,
      debt: p.debt || 0,
    })),
    logs: [],
  };

  room.game = game;

  // Bots auto-bet after a short simulated delay
  game.players.forEach((p, i) => {
    if (p.isBot) {
      setTimeout(() => botBet(room, i), 800 + i * 400);
    }
  });

  broadcastGameState(room, [{ msg: `🃏 Round ${game.round} begins! Place your bets.`, type: 'good' }]);
  return true;
}

function botBet(room, idx) {
  const game = room.game;
  if (!game || game.phase !== 'betting') return;
  const p = game.players[idx];
  if (!p || !p.isBot || p.status !== 'waiting') return;

  const bet = Math.min(Math.floor(Math.random() * 15) + 5, p.chips);
  p.chips -= bet;
  p.bet = bet;
  p.status = 'betting';
  game.pot += bet;

  broadcastGameState(room, [{ msg: `🤖 ${p.name} bets ${bet} chips.`, type: '' }]);
  checkAllBet(room);
}

function checkAllBet(room) {
  const game = room.game;
  if (!game) return;
  const allBet = game.players.every(p => p.status === 'betting' || p.chips === 0);
  if (!allBet) return;

  // Deal phase
  game.phase = 'play';
  game.players.forEach(p => { p.status = 'active'; });

  // Deal 2 cards each + 2 community
  game.players.forEach((_, i) => { dealToPlayer(game, i); dealToPlayer(game, i); });
  dealCommunity(game); dealCommunity(game);

  game.currentPlayerIdx = 0;
  broadcastGameState(room, [{ msg: '🃏 Cards dealt! Play begins.', type: 'good' }]);
  tickTurn(room);
}

function dealToPlayer(game, idx) {
  if (game.deck.length === 0) game.deck = buildDeck();
  const card = game.deck.pop();
  game.players[idx].hand.push(card);
  if (card.isSpecial) {
    const logs = applySpecialCard(game, idx, card);
    game.logs.push(...logs);
  }
}

function dealCommunity(game) {
  if (game.deck.length === 0) game.deck = buildDeck();
  game.community.push(game.deck.pop());
}

function tickTurn(room) {
  const game = room.game;
  if (!game || game.phase !== 'play') return;

  // Skip bust/standing players
  while (
    game.currentPlayerIdx < game.players.length &&
    (game.players[game.currentPlayerIdx].status === 'bust' ||
     game.players[game.currentPlayerIdx].status === 'standing')
  ) {
    game.currentPlayerIdx++;
  }

  if (game.currentPlayerIdx >= game.players.length) {
    endRound(room); return;
  }

  const current = game.players[game.currentPlayerIdx];
  broadcastGameState(room, [{ msg: `▶ ${current.name}'s turn.` }]);

  if (current.isBot) {
    setTimeout(() => executeBotTurn(room, game.currentPlayerIdx), 1200);
  }
}

function executeBotTurn(room, idx) {
  const game = room.game;
  if (!game || game.phase !== 'play') return;
  const p = game.players[idx];
  if (!p || p.isBot !== true) return;

  const decision = botDecide(p, game, idx);
  const logs = [];

  if (decision === 'hit') {
    dealToPlayer(game, idx);
    const score = handScore(p.hand, p.duckLocked);
    logs.push({ msg: `🤖 ${p.name} hits. Score: ${score}.` });
    if (!p.bustImmune && score > 21) {
      p.status = 'bust';
      logs.push({ msg: `💀 ${p.name} busts!`, type: 'bad' });
      game.currentPlayerIdx++;
      broadcastGameState(room, logs);
      tickTurn(room);
    } else {
      broadcastGameState(room, logs);
      // Bot may hit again
      setTimeout(() => executeBotTurn(room, idx), 900);
    }
  } else {
    p.status = 'standing';
    logs.push({ msg: `🤖 ${p.name} stands at ${handScore(p.hand, p.duckLocked)}.` });
    game.currentPlayerIdx++;
    broadcastGameState(room, logs);
    tickTurn(room);
  }
}

function playerAction(room, playerId, action) {
  const game = room.game;
  if (!game || game.phase !== 'play') return;

  const idx = game.players.findIndex(p => p.id === playerId);
  if (idx !== game.currentPlayerIdx) return;
  const p = game.players[idx];
  if (p.status !== 'active') return;

  const logs = [];

  if (action === 'hit') {
    dealToPlayer(game, idx);
    const score = handScore(p.hand, p.duckLocked);
    logs.push({ msg: `${p.name} hits. Score: ${score}.` });
    if (!p.bustImmune && score > 21) {
      p.status = 'bust';
      logs.push({ msg: `💀 ${p.name} busts!`, type: 'bad' });
      game.currentPlayerIdx++;
      broadcastGameState(room, logs);
      tickTurn(room);
    } else {
      broadcastGameState(room, logs);
    }
  } else if (action === 'stand') {
    p.status = 'standing';
    logs.push({ msg: `${p.name} stands at ${handScore(p.hand, p.duckLocked)}.` });
    game.currentPlayerIdx++;
    broadcastGameState(room, logs);
    tickTurn(room);
  }
}

function endRound(room) {
  const game = room.game;
  game.phase = 'reveal';

  // Find best score
  let best = -1;
  game.players.forEach(p => {
    if (p.status === 'bust') return;
    const s = handScore(p.hand, p.duckLocked);
    if (s <= 21 && s > best) best = s;
  });

  const winners = game.players.filter(p => p.status !== 'bust' && handScore(p.hand, p.duckLocked) === best && best >= 0);
  const logs = [];

  if (winners.length > 0) {
    const share = Math.floor(game.pot / winners.length);
    winners.forEach(p => { p.chips += share; p.status = 'winner'; });
    logs.push({ msg: `🏆 ${winners.map(p => p.name).join(' & ')} win${winners.length > 1 ? '' : 's'} ${game.pot} chips!`, type: 'good' });
  } else {
    logs.push({ msg: '💀 Everyone busted! Pot carries over.', type: 'bad' });
  }

  // Sync chips back to room players
  game.players.forEach(gp => {
    const rp = room.players.get(gp.id);
    if (rp) { rp.chips = gp.chips; rp.debt = gp.debt || 0; }
  });

  broadcastGameState(room, logs);

  // Schedule next round
  setTimeout(() => {
    room.round = (room.round || 1) + 1;
    // Remove broke players
    room.players.forEach((p, pid) => { if (p.chips <= 0 && !p.isBot) room.players.delete(pid); });
    room.game = null;
    broadcast(room.id, { type: 'roundOver', results: game.players.map(p => ({ name: p.name, score: handScore(p.hand, p.duckLocked), chips: p.chips, status: p.status })), pot: game.pot });
  }, 3000);
}

// ── Broadcast game state ───────────────────────────────────
function broadcastGameState(room, extraLogs = []) {
  const game = room.game;
  if (!game) return;

  room.players.forEach((rp, pid) => {
    const ws = rp.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Build per-player view (hide other players' hands in betting phase optionally)
    const playersView = game.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      chips: p.chips,
      bet: p.bet,
      status: p.status,
      score: p.id === pid || game.phase === 'reveal' ? handScore(p.hand, p.duckLocked) : null,
      hand: p.hand,
      bustImmune: p.bustImmune,
      duckLocked: p.duckLocked,
      debt: p.debt,
    }));

    sendTo(ws, {
      type: 'gameState',
      phase: game.phase,
      round: game.round,
      pot: game.pot,
      community: game.community,
      players: playersView,
      currentPlayerIdx: game.currentPlayerIdx,
      currentPlayerId: game.players[game.currentPlayerIdx]?.id,
      deckSize: game.deck.length,
      logs: extraLogs,
      myId: pid,
    });
  });
}

// ══════════════════════════════════════════════════════════
//  WebSocket Message Handler
// ══════════════════════════════════════════════════════════
wss.on('connection', (ws) => {
  const playerId = uid();
  clients.set(ws, { playerId, serverId: null, playerName: 'Player' });

  sendTo(ws, { type: 'welcome', playerId, servers: serverListSnapshot() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const meta = clients.get(ws);

    switch (msg.type) {

      // ── Server management ────────────────────────────────
      case 'createServer': {
        if (!msg.name?.trim()) { sendError(ws, 'Server name required.'); return; }
        const sid = uid();
        const room = {
          id: sid,
          name: msg.name.trim().slice(0, 32),
          password: msg.password || '',
          ownerId: playerId,
          players: new Map(),
          game: null,
          round: 1,
        };
        servers.set(sid, room);

        const pname = (msg.playerName || 'Host').trim().slice(0, 20);
        room.players.set(playerId, { id: playerId, name: pname, ws, chips: 100, debt: 0, isBot: false });
        meta.serverId = sid;
        meta.playerName = pname;

        sendTo(ws, { type: 'joinedServer', server: roomSnapshot(room), playerId });
        broadcastServerList();
        break;
      }

      case 'joinServer': {
        const room = servers.get(msg.serverId);
        if (!room) { sendError(ws, 'Server not found.'); return; }
        if (room.password && room.password !== msg.password) { sendError(ws, 'Wrong password.'); return; }
        if (room.players.size >= 8) { sendError(ws, 'Server is full.'); return; }
        if (room.game) { sendError(ws, 'Game already in progress.'); return; }

        const pname = (msg.playerName || 'Player').trim().slice(0, 20);
        room.players.set(playerId, { id: playerId, name: pname, ws, chips: 100, debt: 0, isBot: false });
        meta.serverId = room.id;
        meta.playerName = pname;

        sendTo(ws, { type: 'joinedServer', server: roomSnapshot(room), playerId });
        broadcast(room.id, { type: 'playerJoined', player: { id: playerId, name: pname, chips: 100, isBot: false }, server: roomSnapshot(room) }, playerId);
        broadcastServerList();
        break;
      }

      case 'leaveServer': {
        handleLeave(ws, meta);
        break;
      }

      case 'addBot': {
        const room = servers.get(meta.serverId);
        if (!room || room.ownerId !== playerId) { sendError(ws, 'Only the host can add bots.'); return; }
        if (room.players.size >= 8) { sendError(ws, 'Server is full.'); return; }
        if (room.game) { sendError(ws, 'Cannot add bots during a game.'); return; }

        const botId = uid();
        const botType = BOT_TYPES[Math.floor(Math.random() * BOT_TYPES.length)];
        const botNames = { simple: '🤖 SimpleBot', smart: '🧠 SmartBot', chaotic: '🎲 ChaosBot' };
        const botNum = [...room.players.values()].filter(p => p.isBot).length + 1;
        const botName = `${botNames[botType]} ${botNum}`;

        room.players.set(botId, { id: botId, name: botName, ws: null, chips: 100, debt: 0, isBot: true, botType });
        broadcast(room.id, { type: 'playerJoined', player: { id: botId, name: botName, chips: 100, isBot: true, botType }, server: roomSnapshot(room) });
        broadcastServerList();
        break;
      }

      case 'removeBot': {
        const room = servers.get(meta.serverId);
        if (!room || room.ownerId !== playerId) return;
        const bot = room.players.get(msg.botId);
        if (!bot || !bot.isBot) return;
        room.players.delete(msg.botId);
        broadcast(room.id, { type: 'playerLeft', playerId: msg.botId, server: roomSnapshot(room) });
        broadcastServerList();
        break;
      }

      case 'startGame': {
        const room = servers.get(meta.serverId);
        if (!room) return;
        if (room.ownerId !== playerId) { sendError(ws, 'Only the host can start.'); return; }
        if (room.players.size < 2) { sendError(ws, 'Need at least 2 players.'); return; }
        if (room.game) { sendError(ws, 'Game already running.'); return; }
        startGame(room);
        break;
      }

      // ── Gameplay ─────────────────────────────────────────
      case 'placeBet': {
        const room = servers.get(meta.serverId);
        if (!room || !room.game) return;
        const game = room.game;
        if (game.phase !== 'betting') return;

        const p = game.players.find(pl => pl.id === playerId);
        if (!p || p.status !== 'waiting') return;

        const bet = Math.max(1, Math.min(parseInt(msg.bet) || 10, p.chips));
        p.chips -= bet;
        p.bet = bet;
        p.status = 'betting';
        game.pot += bet;

        if (p.debt > 0) {
          const pay = Math.min(p.debt, p.chips);
          p.chips -= pay; game.pot += pay; p.debt = 0;
        }

        broadcastGameState(room, [{ msg: `${p.name} bets ${bet} chips.` }]);
        checkAllBet(room);
        break;
      }

      case 'hit':
      case 'stand':
        const room2 = servers.get(meta.serverId);
        if (room2 && room2.game) playerAction(room2, playerId, msg.type);
        break;

      case 'refreshServers':
        sendTo(ws, { type: 'serverList', servers: serverListSnapshot() });
        break;
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    if (meta) handleLeave(ws, meta);
    clients.delete(ws);
  });
});

function handleLeave(ws, meta) {
  if (!meta.serverId) return;
  const room = servers.get(meta.serverId);
  if (!room) return;

  room.players.delete(meta.playerId);
  meta.serverId = null;

  if (room.players.size === 0) {
    servers.delete(room.id);
  } else {
    // Transfer ownership if owner left
    if (room.ownerId === meta.playerId) {
      const next = [...room.players.keys()].find(k => !room.players.get(k).isBot) || [...room.players.keys()][0];
      if (next) room.ownerId = next;
    }
    broadcast(room.id, { type: 'playerLeft', playerId: meta.playerId, server: roomSnapshot(room) });
  }
  broadcastServerList();
}

httpServer.listen(PORT, () => {
  console.log(`🃏 Chaos Cards server running on port ${PORT}`);
});
