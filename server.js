// ══════════════════════════════════════════════════════════
//  CHAOS CARDS — Server v4
//  accounts.json is SEPARATE — never overwrite it when updating game files
// ══════════════════════════════════════════════════════════
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const BROKE_WAIT_MS = 60 * 60 * 1000; // 1 hour
const BROKE_GIFT = 100;
const START_CHIPS = 500;

// ── accounts.json helpers ──────────────────────────────────
function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch (e) { console.error('Failed to load accounts:', e.message); }
  return {};
}

function saveAccounts(accounts) {
  try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); }
  catch (e) { console.error('Failed to save accounts:', e.message); }
}

let ACCOUNTS = loadAccounts();
// accounts[username] = { passwordHash, chips, lastBroke, totalWon, gamesPlayed }

// Very simple hash (no bcrypt dependency needed)
function hashPass(pass) {
  let h = 5381;
  for (let i = 0; i < pass.length; i++) h = ((h << 5) + h) ^ pass.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// ── HTTP ───────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else { res.writeHead(404); res.end('Not found'); }
});

const wss = new WebSocket.Server({ server: httpServer });

// ── State ──────────────────────────────────────────────────
const servers = new Map();   // id → Room
const clients = new Map();   // ws → { playerId, serverId, username }
const loggedIn = new Map();  // username → playerId (prevent duplicate logins)
let uid = 1;
const nextId = () => String(uid++);

// ══════════════════════════════════════════════════════════
//  CARD ENGINE
// ══════════════════════════════════════════════════════════
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const ALL_SPECIALS = [
  { id:'credit',    name:'Credit Card',      icon:'💳', style:'credit',    effect:'Draw 2 extra cards — owe 5 chips next round.' },
  { id:'license',   name:"Driver's Licence", icon:'🪪', style:'license',   effect:'Bust immunity — survive even if over 21.' },
  { id:'shopping',  name:'Shopping List',    icon:'🛒', style:'shopping',  effect:'A random 2–10 card is added to your hand.' },
  { id:'blackhole', name:'Black Hole',       icon:'🕳️', style:'blackhole', effect:'Removes the highest card from every other player.' },
  { id:'lucky8',    name:'Lucky 8-Ball',     icon:'🎱', style:'lucky8',    effect:'Reveals 3 extra community cards.' },
  { id:'irs',       name:'IRS Notice',       icon:'📋', style:'irs',       effect:'All players pay 3 chips to the pot.' },
  { id:'receipt',   name:'Receipt',          icon:'🧾', style:'receipt',   effect:'Reveals a random opponent\'s hand.' },
  { id:'rubber',    name:'Rubber Duck',      icon:'🦆', style:'rubber',    effect:'Your score locks at 17 this round.' },
  { id:'swap',      name:'Identity Swap',    icon:'🔄', style:'swap',      effect:'Swap your entire hand with a random opponent.' },
  { id:'double',    name:'Double Down',      icon:'⚡', style:'double',    effect:'Double your bet, draw one more card, then stand.' },
  { id:'freeze',    name:'Deep Freeze',      icon:'🧊', style:'freeze',    effect:'Skip the next player\'s turn.' },
  { id:'mirror',    name:'Magic Mirror',     icon:'🪞', style:'mirror',    effect:'Copy the highest score at the table.' },
  { id:'timebomb',  name:'Time Bomb',        icon:'💣', style:'timebomb',  effect:'Everyone else must take one extra card.' },
  { id:'wildcard',  name:'Wild Card',        icon:'🃏', style:'wildcard',  effect:'Counts as 7.' },
  { id:'taxreturn', name:'Tax Return',       icon:'💰', style:'taxreturn', effect:'Collect 4 chips from every other player.' },
  { id:'amnesia',   name:'Amnesia',          icon:'🌀', style:'amnesia',   effect:'Community cards wiped and two new ones dealt.' },
];

function buildDeck(deckCount, enabledSpecials) {
  const deck = [];
  for (let d = 0; d < deckCount; d++) {
    SUITS.forEach(s => RANKS.forEach(r => deck.push({ rank: r, suit: s, isNormal: true })));
  }
  const specials = enabledSpecials && enabledSpecials.length > 0
    ? ALL_SPECIALS.filter(s => enabledSpecials.includes(s.id))
    : ALL_SPECIALS;
  specials.forEach(sc => deck.push({ ...sc, isSpecial: true }));
  shuffle(deck);
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function simpleVal(card) {
  if (card.isSpecial) return card.id === 'wildcard' ? 7 : 0;
  if (['J','Q','K'].includes(card.rank)) return 10;
  return parseInt(card.rank) || 0;
}

function handScore(hand, duckLocked) {
  if (duckLocked) return 17;
  let total = 0, aces = 0;
  hand.forEach(c => {
    if (c.isSpecial) { total += simpleVal(c); return; }
    if (c.rank === 'A') { aces++; total += 11; }
    else total += simpleVal(c);
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// ── Poker hand evaluation ──────────────────────────────────
// Returns a comparable score (higher = better hand)
function pokerHandRank(hand, community) {
  const all = [...hand, ...community].filter(c => !c.isSpecial);
  if (all.length < 2) return 0;
  const vals = all.map(c => simpleVal(c)).sort((a,b)=>b-a);
  const suits = all.map(c => c.suit);
  const ranks = all.map(c => c.rank);
  const valCount = {};
  vals.forEach(v => valCount[v] = (valCount[v]||0)+1);
  const counts = Object.values(valCount).sort((a,b)=>b-a);
  const suitCount = {};
  suits.forEach(s => suitCount[s] = (suitCount[s]||0)+1);
  const hasFlush = Object.values(suitCount).some(v=>v>=5);
  const sortedVals = [...new Set(vals)].sort((a,b)=>a-b);
  let hasStraight = false;
  for (let i = 0; i <= sortedVals.length - 5; i++) {
    if (sortedVals[i+4] - sortedVals[i] === 4 && new Set(sortedVals.slice(i,i+5)).size===5) { hasStraight=true; break; }
  }
  const topVal = vals[0] || 0;
  // Rank: Royal/Straight flush > Quads > Full house > Flush > Straight > Trips > 2pair > Pair > High
  if (hasStraight && hasFlush) return 800 + topVal;
  if (counts[0] === 4) return 700 + topVal;
  if (counts[0] === 3 && counts[1] >= 2) return 600 + topVal;
  if (hasFlush) return 500 + topVal;
  if (hasStraight) return 400 + topVal;
  if (counts[0] === 3) return 300 + topVal;
  if (counts[0] === 2 && counts[1] === 2) return 200 + topVal;
  if (counts[0] === 2) return 100 + topVal;
  return topVal;
}

// ── Blackjack dealer rules ─────────────────────────────────
// In blackjack mode there's no "dealer" per se, but we use 21-target rules
// In poker mode, winner is best poker hand

// ── Special card effects ───────────────────────────────────
function applySpecial(game, pidx, card) {
  const p = game.players[pidx];
  const logs = [];
  switch (card.id) {
    case 'credit':
      logs.push({ msg:`💳 ${p.name} used Credit Card — 2 free cards, owes 5 chips!`, type:'chaos' });
      for (let i=0;i<2;i++) { const c=drawCard(game); p.hand.push(c); if(c.isSpecial) logs.push(...applySpecial(game,pidx,c)); }
      p.debt=(p.debt||0)+5; break;
    case 'license':
      logs.push({ msg:`🪪 ${p.name} flashed Licence — bust immunity!`, type:'good' });
      p.bustImmune=true; break;
    case 'shopping': {
      const v=Math.floor(Math.random()*9)+2,s=SUITS[Math.floor(Math.random()*4)];
      p.hand.push({ rank:String(v),suit:s,isNormal:true });
      logs.push({ msg:`🛒 ${p.name}'s Shopping List: ${v}${s}!`, type:'chaos' }); break;
    }
    case 'blackhole':
      logs.push({ msg:`🕳️ ${p.name} opened a Black Hole!`, type:'chaos' });
      game.players.forEach((pl,i)=>{ if(i===pidx||pl.status==='bust'||!pl.hand.length) return;
        const mv=Math.max(...pl.hand.map(c=>simpleVal(c))),mi=pl.hand.map(c=>simpleVal(c)).lastIndexOf(mv);
        if(mi>=0) pl.hand.splice(mi,1); }); break;
    case 'lucky8':
      logs.push({ msg:`🎱 ${p.name} shook the 8-Ball — 3 community cards!`, type:'good' });
      for(let i=0;i<3;i++) game.community.push(drawCard(game)); break;
    case 'irs':
      logs.push({ msg:`📋 IRS Notice! Everyone pays 3 chips.`, type:'bad' });
      game.players.forEach(pl=>{ const pay=Math.min(3,pl.chips); pl.chips-=pay; game.pot+=pay; }); break;
    case 'receipt': {
      const oth=game.players.filter((_,i)=>i!==pidx&&game.players[i].status!=='bust');
      if(oth.length){ const t=oth[Math.floor(Math.random()*oth.length)];
        logs.push({ msg:`🧾 ${p.name} peeked at ${t.name}: [${t.hand.map(c=>c.isSpecial?c.name:`${c.rank}${c.suit}`).join(', ')}]`, type:'chaos', privateFor:p.id }); }
      break; }
    case 'rubber':
      logs.push({ msg:`🦆 ${p.name} deployed Rubber Duck — locked at 17!`, type:'chaos' });
      p.duckLocked=true; break;
    case 'swap': {
      const oth2=game.players.filter((_,i)=>i!==pidx&&game.players[i].status!=='bust');
      if(oth2.length){ const t=oth2[Math.floor(Math.random()*oth2.length)];
        const tmp=p.hand; p.hand=t.hand; t.hand=tmp;
        logs.push({ msg:`🔄 ${p.name} swapped hands with ${t.name}!`, type:'chaos' }); }
      break; }
    case 'double': {
      logs.push({ msg:`⚡ ${p.name} doubled down!`, type:'good' });
      const extra=Math.min(p.bet,p.chips); p.chips-=extra; game.pot+=extra; p.bet+=extra;
      const c=drawCard(game); p.hand.push(c);
      if(c.isSpecial) logs.push(...applySpecial(game,pidx,c));
      p.mustStand=true; break; }
    case 'freeze':
      logs.push({ msg:`🧊 ${p.name} played Deep Freeze — next player skipped!`, type:'chaos' });
      game.skipNext=true; break;
    case 'mirror': {
      let best=-1;
      game.players.forEach((pl,i)=>{ if(i===pidx) return;
        const s=handScore(pl.hand,pl.duckLocked); if(s<=21&&s>best) best=s; });
      if(best>0){ p.mirrorScore=best; logs.push({ msg:`🪞 ${p.name} used Magic Mirror — score copied as ${best}!`, type:'good' }); }
      break; }
    case 'timebomb':
      logs.push({ msg:`💣 Time Bomb! Everyone else takes a card!`, type:'bad' });
      game.players.forEach((pl,i)=>{ if(pl.status==='bust'||i===pidx) return;
        const c=drawCard(game); pl.hand.push(c);
        if(!pl.bustImmune&&handScore(pl.hand,pl.duckLocked)>21) pl.status='bust'; }); break;
    case 'wildcard':
      logs.push({ msg:`🃏 ${p.name} played Wild Card — counts as 7!`, type:'chaos' }); break;
    case 'taxreturn':
      logs.push({ msg:`💰 ${p.name} filed a Tax Return — collecting 4 chips from everyone!`, type:'good' });
      game.players.forEach((pl,i)=>{ if(i===pidx) return; const take=Math.min(4,pl.chips); pl.chips-=take; p.chips+=take; }); break;
    case 'amnesia':
      logs.push({ msg:`🌀 Amnesia! Community cards wiped!`, type:'chaos' });
      game.community=[]; for(let i=0;i<2;i++) game.community.push(drawCard(game)); break;
  }
  return logs;
}

function drawCard(game) {
  if (game.deck.length === 0) game.deck = buildDeck(game.settings.deckCount||1, game.settings.enabledSpecials);
  return game.deck.pop();
}

// ── Bot AI ─────────────────────────────────────────────────
function botDecide(bot, game) {
  const score = handScore(bot.hand, bot.duckLocked);
  const mode = game.settings.mode;
  const type = bot.botType || 'simple';

  if (mode === 'poker') {
    // In poker bots play more aggressively
    if (type === 'chaotic') return Math.random() < 0.6 ? 'hit' : 'stand';
    if (type === 'smart') return score < 18 ? 'hit' : 'stand';
    return score < 16 ? 'hit' : 'stand';
  }
  // Blackjack
  if (type === 'simple') return score < 16 ? 'hit' : 'stand';
  if (type === 'smart') {
    if (score >= 17) return 'stand'; if (score <= 11) return 'hit';
    const cv = game.community.reduce((s,c)=>s+simpleVal(c),0);
    return cv < 12 ? 'stand' : 'hit';
  }
  if (type === 'chaotic') {
    if (score <= 10) return 'hit'; if (score >= 20) return 'stand';
    return Math.random() < 0.55 ? 'hit' : 'stand';
  }
  return 'stand';
}

// ══════════════════════════════════════════════════════════
//  GAME FLOW
// ══════════════════════════════════════════════════════════
function startGame(room) {
  const activePlayers = [...room.players.values()].filter(p => !p.spectating);
  if (activePlayers.length < 2) return false;

  const s = room.settings || {};
  const settings = {
    mode: s.mode || 'blackjack',
    deckCount: Math.max(1, s.deckCount || 1),
    minBet: Math.max(1, s.minBet || 5),
    maxBet: Math.max(10, s.maxBet || 100),
    enabledSpecials: s.enabledSpecials || ALL_SPECIALS.map(sc => sc.id),
    // Blackjack rules
    bjSoft17: s.bjSoft17 !== false,      // dealer stands on soft 17
    bjDoubleAllowed: s.bjDoubleAllowed !== false,
    bjSplitAllowed: s.bjSplitAllowed !== false,
    bjBlackjackPays: s.bjBlackjackPays || '3:2',
    // Poker rules
    pokerAnte: s.pokerAnte || 0,
    pokerBlinds: s.pokerBlinds !== false,
    pokerSmallBlind: s.pokerSmallBlind || 5,
    pokerBigBlind: s.pokerBigBlind || 10,
  };

  const game = {
    deck: buildDeck(settings.deckCount, settings.enabledSpecials),
    community: [], pot: 0,
    round: room.round || 1,
    phase: 'betting',
    currentPlayerIdx: 0,
    skipNext: false, settings,
    _pendingLogs: [],
    players: activePlayers.map((p, i) => ({
      id: p.id, name: p.name, isBot: p.isBot, botType: p.botType,
      chips: p.chips, hand: [], bet: 0,
      status: 'waiting',
      bustImmune: false, duckLocked: false, mustStand: false,
      mirrorScore: null, debt: p.debt || 0,
      // Poker blinds
      isSmallBlind: settings.pokerBlinds && i === 0,
      isBigBlind: settings.pokerBlinds && i === 1,
    })),
  };

  room.game = game;

  // Poker: force blinds
  if (settings.mode === 'poker' && settings.pokerBlinds) {
    const sb = game.players[0], bb = game.players[1];
    if (sb && sb.chips > 0) { const amt = Math.min(settings.pokerSmallBlind, sb.chips); sb.chips -= amt; sb.bet = amt; sb.status = 'betting'; game.pot += amt; }
    if (bb && bb.chips > 0) { const amt = Math.min(settings.pokerBigBlind, bb.chips); bb.chips -= amt; bb.bet = amt; bb.status = 'betting'; game.pot += amt; }
    broadcastGame(room, [{ msg: `♠ Blinds posted: ${settings.pokerSmallBlind}/${settings.pokerBigBlind}`, type: 'good' }]);
  }

  // Ante
  if (settings.pokerAnte > 0) {
    game.players.forEach(p => { const amt = Math.min(settings.pokerAnte, p.chips); p.chips -= amt; game.pot += amt; });
  }

  game.players.forEach((p, i) => { if (p.isBot && p.status === 'waiting') setTimeout(() => botBet(room, i), 800 + i * 500); });
  broadcastGame(room, [{ msg: `🃏 Round ${game.round} — ${settings.mode.toUpperCase()}. Place your bets!`, type: 'good' }]);
  return true;
}

function botBet(room, idx) {
  const game = room.game;
  if (!game || game.phase !== 'betting') return;
  const p = game.players[idx];
  if (!p || !p.isBot || p.status !== 'waiting') return;
  const min = game.settings.minBet || 5, max = Math.min(game.settings.maxBet || 100, p.chips);
  const bet = Math.max(min, Math.min(max, Math.floor(Math.random() * 20) + min));
  commitBet(game, idx, bet);
  broadcastGame(room, [{ msg: `🤖 ${p.name} bets ${bet}.` }]);
  checkAllBet(room);
}

function commitBet(game, idx, amount) {
  const p = game.players[idx];
  const bet = Math.max(1, Math.min(amount, p.chips));
  p.chips -= bet; p.bet += bet; p.status = 'betting'; game.pot += bet;
  if (p.debt > 0) { const pay = Math.min(p.debt, p.chips); p.chips -= pay; game.pot += pay; p.debt = 0; }
}

function checkAllBet(room) {
  const game = room.game; if (!game) return;
  if (game.players.some(p => p.status === 'waiting')) return;
  game.phase = 'play';
  game.players.forEach(p => { if (p.status === 'betting') p.status = 'active'; });

  // Deal cards
  if (game.settings.mode === 'blackjack') {
    game.players.forEach((_, i) => { dealTo(game, i); dealTo(game, i); });
    dealCommunity(game); // one community card in BJ (shared reference)
  } else {
    // Poker: 2 hole cards each, then 5 community (flop/turn/river dealt together here)
    game.players.forEach((_, i) => { dealTo(game, i); dealTo(game, i); });
    dealCommunity(game); dealCommunity(game); dealCommunity(game); // flop
    dealCommunity(game); // turn
    dealCommunity(game); // river
  }

  game.currentPlayerIdx = 0;
  const logs = game._pendingLogs || []; game._pendingLogs = [];
  broadcastGame(room, [...logs, { msg: '🃏 Cards dealt! Play begins.', type: 'good' }]);
  tickTurn(room);
}

function dealTo(game, idx) {
  const c = drawCard(game); game.players[idx].hand.push(c);
  if (c.isSpecial) game._pendingLogs = (game._pendingLogs || []).concat(applySpecial(game, idx, c));
}

function dealCommunity(game) { game.community.push(drawCard(game)); }

function tickTurn(room) {
  const game = room.game; if (!game || game.phase !== 'play') return;
  while (
    game.currentPlayerIdx < game.players.length &&
    ['bust','standing','waiting'].includes(game.players[game.currentPlayerIdx].status)
  ) game.currentPlayerIdx++;

  if (game.currentPlayerIdx >= game.players.length) { endRound(room); return; }

  if (game.skipNext) {
    game.skipNext = false;
    const sk = game.players[game.currentPlayerIdx];
    sk.status = 'standing';
    broadcastGame(room, [{ msg: `🧊 ${sk.name}'s turn skipped!`, type: 'chaos' }]);
    game.currentPlayerIdx++; tickTurn(room); return;
  }

  const cur = game.players[game.currentPlayerIdx];
  if (cur.mustStand) {
    cur.status = 'standing'; cur.mustStand = false;
    broadcastGame(room, [{ msg: `⚡ ${cur.name} stands after doubling down.` }]);
    game.currentPlayerIdx++; tickTurn(room); return;
  }

  const logs = game._pendingLogs || []; game._pendingLogs = [];
  broadcastGame(room, [...logs, { msg: `▶ ${cur.name}'s turn.` }]);
  if (cur.isBot) setTimeout(() => executeBotTurn(room, game.currentPlayerIdx), 1300);
}

function executeBotTurn(room, idx) {
  const game = room.game; if (!game || game.phase !== 'play') return;
  const p = game.players[idx]; if (!p || !p.isBot) return;

  if (botDecide(p, game) === 'hit') {
    dealTo(game, idx);
    const score = handScore(p.hand, p.duckLocked);
    const logs = [{ msg: `🤖 ${p.name} hits — ${score}.` }];
    if (!p.bustImmune && score > 21 && game.settings.mode === 'blackjack') {
      p.status = 'bust'; logs.push({ msg: `💀 ${p.name} busts!`, type: 'bad' });
      game.currentPlayerIdx++; broadcastGame(room, logs); tickTurn(room);
    } else { broadcastGame(room, logs); setTimeout(() => executeBotTurn(room, idx), 900); }
  } else {
    p.status = 'standing';
    broadcastGame(room, [{ msg: `🤖 ${p.name} stands at ${handScore(p.hand, p.duckLocked)}.` }]);
    game.currentPlayerIdx++; tickTurn(room);
  }
}

function playerAction(room, playerId, action) {
  const game = room.game; if (!game || game.phase !== 'play') return;
  const idx = game.players.findIndex(p => p.id === playerId);
  if (idx !== game.currentPlayerIdx) return;
  const p = game.players[idx]; if (p.status !== 'active') return;

  if (action === 'hit') {
    dealTo(game, idx);
    const score = handScore(p.hand, p.duckLocked);
    const logs = [{ msg: `${p.name} hits — ${score}.` }];
    // Blackjack: bust on >21. Poker: no bust rule, players play their best hand
    const bust = game.settings.mode === 'blackjack' && !p.bustImmune && score > 21;
    if (bust) {
      p.status = 'bust'; logs.push({ msg: `💀 ${p.name} busts!`, type: 'bad' });
      game.currentPlayerIdx++; broadcastGame(room, logs); tickTurn(room);
    } else { broadcastGame(room, logs); }
  } else if (action === 'stand') {
    p.status = 'standing';
    broadcastGame(room, [{ msg: `${p.name} stands at ${handScore(p.hand, p.duckLocked)}.` }]);
    game.currentPlayerIdx++; tickTurn(room);
  }
}

function endRound(room) {
  const game = room.game; game.phase = 'reveal';
  const mode = game.settings.mode;
  const logs = [];
  let winners = [];

  if (mode === 'blackjack') {
    // BJ: closest to 21 without busting
    let best = -1;
    game.players.forEach(p => {
      if (p.status === 'bust') return;
      const s = p.mirrorScore != null ? p.mirrorScore : handScore(p.hand, p.duckLocked);
      p._finalScore = s;
      if (s <= 21 && s > best) best = s;
    });
    game.players.filter(p => p.status === 'bust').forEach(p => p._finalScore = handScore(p.hand, p.duckLocked));
    winners = game.players.filter(p => p.status !== 'bust' && p._finalScore === best && best >= 0);

    // Blackjack bonus (3:2 or 6:5)
    winners.forEach(p => {
      const isNaturalBJ = handScore(p.hand, false) === 21 && p.hand.filter(c=>!c.isSpecial).length === 2;
      if (isNaturalBJ && game.settings.bjBlackjackPays === '3:2') {
        const bonus = Math.floor(p.bet * 0.5);
        p.chips += bonus;
        logs.push({ msg: `🃏 ${p.name} has Blackjack! Bonus +${bonus} chips (3:2)`, type: 'good' });
      }
    });
  } else {
    // Poker: best hand rank
    let best = -1;
    game.players.forEach(p => {
      const rank = pokerHandRank(p.hand, game.community);
      p._finalScore = rank; p._pokerRank = rank;
      if (rank > best) best = rank;
    });
    winners = game.players.filter(p => p._finalScore === best && best >= 0);
    game.players.forEach(p => {
      // In poker there's no "bust" — everyone shows
      if (p.status !== 'winner') p.status = 'standing';
    });
  }

  if (winners.length > 0) {
    const share = Math.floor(game.pot / winners.length);
    winners.forEach(p => { p.chips += share; p.status = 'winner'; });
    logs.push({ msg: `🏆 ${winners.map(p=>p.name).join(' & ')} win ${game.pot} chips!`, type: 'good' });
  } else {
    logs.push({ msg: `💀 No winner! Pot carries over.`, type: 'bad' });
  }

  // Persist chips to accounts
  game.players.forEach(gp => {
    const rp = room.players.get(gp.id);
    if (rp) { rp.chips = gp.chips; rp.debt = gp.debt || 0; }
    if (rp && rp.username && ACCOUNTS[rp.username]) {
      ACCOUNTS[rp.username].chips = gp.chips;
      ACCOUNTS[rp.username].gamesPlayed = (ACCOUNTS[rp.username].gamesPlayed || 0) + 1;
      if (gp.status === 'winner') ACCOUNTS[rp.username].totalWon = (ACCOUNTS[rp.username].totalWon || 0) + 1;
    }
  });
  saveAccounts(ACCOUNTS);

  broadcastGame(room, logs);

  setTimeout(() => {
    if (!room.game) return;
    room.round = (room.round || 1) + 1;
    const results = game.players.map(p => ({
      name: p.name,
      score: mode === 'poker' ? p._finalScore : (p._finalScore || 0),
      displayScore: mode === 'poker' ? pokerHandLabel(p._pokerRank || 0) : (p.status === 'bust' ? 'BUST' : String(p._finalScore || 0)),
      chips: p.chips, status: p.status,
    }));
    room.game = null;

    // Handle broke players
    room.players.forEach(p => {
      if (p.isBot && p.chips <= 0) p.chips = 500;
      if (!p.isBot && p.chips <= 0) {
        p.spectating = true;
        if (p.username && ACCOUNTS[p.username]) {
          ACCOUNTS[p.username].lastBroke = Date.now();
          saveAccounts(ACCOUNTS);
        }
        // Notify that player they're broke
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({ type: 'broke', waitMs: BROKE_WAIT_MS }));
        }
      }
    });
    room.players.forEach(p => { if (p.pendingJoin) { p.spectating = false; p.pendingJoin = false; } });

    broadcastToRoom(room, { type: 'roundSummary', results, mode });
    setTimeout(() => { if (!room.game) startGame(room); }, 3500);
  }, 4000);
}

function pokerHandLabel(rank) {
  if (rank >= 800) return 'Str. Flush';
  if (rank >= 700) return 'Quads';
  if (rank >= 600) return 'Full House';
  if (rank >= 500) return 'Flush';
  if (rank >= 400) return 'Straight';
  if (rank >= 300) return 'Trips';
  if (rank >= 200) return 'Two Pair';
  if (rank >= 100) return 'Pair';
  return 'High Card';
}

// ── Broadcast ──────────────────────────────────────────────
function broadcastGame(room, extraLogs = []) {
  const game = room.game; if (!game) return;
  room.players.forEach((rp, pid) => {
    const ws = rp.ws; if (!ws || ws.readyState !== WebSocket.OPEN) return;
    sendTo(ws, {
      type: 'gameState', phase: game.phase, round: game.round,
      pot: game.pot, community: game.community,
      mode: game.settings.mode, minBet: game.settings.minBet, maxBet: game.settings.maxBet,
      players: game.players.map(p => ({
        id: p.id, name: p.name, isBot: p.isBot, chips: p.chips, bet: p.bet,
        status: p.status,
        score: handScore(p.hand, p.duckLocked),
        pokerLabel: game.settings.mode === 'poker' ? pokerHandLabel(pokerHandRank(p.hand, game.community)) : null,
        hand: p.hand, bustImmune: p.bustImmune, duckLocked: p.duckLocked,
        debt: p.debt, mirrorScore: p.mirrorScore, isSmallBlind: p.isSmallBlind, isBigBlind: p.isBigBlind,
      })),
      currentPlayerIdx: game.currentPlayerIdx,
      currentPlayerId: game.players[game.currentPlayerIdx]?.id,
      deckSize: game.deck.length, logs: extraLogs, myId: pid,
    });
  });
}

function broadcastToRoom(room, msg) { room.players.forEach(p => { if (p.ws && p.ws.readyState === WebSocket.OPEN) sendTo(p.ws, msg); }); }
function broadcast(sid, msg, excl = null) { const r = servers.get(sid); if (!r) return; r.players.forEach((p, pid) => { if (pid === excl) return; if (p.ws && p.ws.readyState === WebSocket.OPEN) sendTo(p.ws, msg); }); }
function sendTo(ws, msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

function roomSnapshot(room) {
  return {
    id: room.id, name: room.name, hasPassword: !!room.password,
    ownerId: room.ownerId, playerCount: room.players.size, inGame: !!room.game,
    settings: room.settings,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, isBot: p.isBot, chips: p.chips,
      isOwner: p.id === room.ownerId, spectating: p.spectating || false, botType: p.botType,
    })),
  };
}

function serverListSnapshot() {
  return [...servers.values()].map(r => ({
    id: r.id, name: r.name, hasPassword: !!r.password, playerCount: r.players.size, inGame: !!r.game,
  }));
}

function broadcastServerList() {
  const list = serverListSnapshot();
  wss.clients.forEach(ws => { const m = clients.get(ws); if (!m || !m.serverId) sendTo(ws, { type: 'serverList', servers: list }); });
}

// ══════════════════════════════════════════════════════════
//  WEBSOCKET
// ══════════════════════════════════════════════════════════
wss.on('connection', ws => {
  const playerId = nextId();
  clients.set(ws, { playerId, serverId: null, username: null });
  sendTo(ws, { type: 'hello' });

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const meta = clients.get(ws);

    // ── Auth ────────────────────────────────────────────────
    if (msg.type === 'register') {
      const u = (msg.username || '').trim().toLowerCase().slice(0, 20);
      const p = (msg.password || '').trim();
      if (!u || !p) { sendTo(ws, { type: 'authError', message: 'Username and password required.' }); return; }
      if (u.length < 3) { sendTo(ws, { type: 'authError', message: 'Username must be at least 3 characters.' }); return; }
      if (p.length < 4) { sendTo(ws, { type: 'authError', message: 'Password must be at least 4 characters.' }); return; }
      if (ACCOUNTS[u]) { sendTo(ws, { type: 'authError', message: 'Username already taken.' }); return; }
      ACCOUNTS[u] = { passwordHash: hashPass(p), chips: START_CHIPS, lastBroke: null, totalWon: 0, gamesPlayed: 0, createdAt: Date.now() };
      saveAccounts(ACCOUNTS);
      loggedIn.set(u, playerId);
      meta.username = u;
      sendTo(ws, { type: 'authOk', username: u, chips: START_CHIPS, servers: serverListSnapshot() });
      return;
    }

    if (msg.type === 'login') {
      const u = (msg.username || '').trim().toLowerCase().slice(0, 20);
      const p = (msg.password || '').trim();
      const acc = ACCOUNTS[u];
      if (!acc) { sendTo(ws, { type: 'authError', message: 'Account not found.' }); return; }
      if (acc.passwordHash !== hashPass(p)) { sendTo(ws, { type: 'authError', message: 'Wrong password.' }); return; }
      if (loggedIn.has(u) && loggedIn.get(u) !== playerId) { sendTo(ws, { type: 'authError', message: 'Already logged in from another device.' }); return; }

      // Check if broke and still waiting
      if (acc.chips <= 0 && acc.lastBroke) {
        const elapsed = Date.now() - acc.lastBroke;
        if (elapsed < BROKE_WAIT_MS) {
          sendTo(ws, { type: 'broke', waitMs: BROKE_WAIT_MS - elapsed }); return;
        } else {
          acc.chips = BROKE_GIFT; saveAccounts(ACCOUNTS);
        }
      }

      loggedIn.set(u, playerId);
      meta.username = u;
      sendTo(ws, { type: 'authOk', username: u, chips: acc.chips, totalWon: acc.totalWon, gamesPlayed: acc.gamesPlayed, servers: serverListSnapshot() });
      return;
    }

    // Require auth for everything else
    if (!meta.username) { sendTo(ws, { type: 'authError', message: 'Not logged in.' }); return; }
    const acc = ACCOUNTS[meta.username];

    switch (msg.type) {
      case 'createServer': {
        if (!msg.name?.trim()) { sendTo(ws, { type: 'error', message: 'Server name required.' }); return; }
        const sid = nextId();
        const settings = parseSettings(msg.settings || {});
        const room = { id: sid, name: msg.name.trim().slice(0, 32), password: msg.password || '', ownerId: playerId, players: new Map(), game: null, round: 1, settings };
        servers.set(sid, room);
        room.players.set(playerId, { id: playerId, name: meta.username, ws, chips: acc?.chips || START_CHIPS, debt: 0, isBot: false, spectating: false, username: meta.username });
        meta.serverId = sid;
        sendTo(ws, { type: 'joinedServer', server: roomSnapshot(room), playerId });
        broadcastServerList(); break;
      }
      case 'joinServer': {
        const room = servers.get(msg.serverId);
        if (!room) { sendTo(ws, { type: 'error', message: 'Server not found.' }); return; }
        if (room.password && room.password !== msg.password) { sendTo(ws, { type: 'error', message: 'Wrong password.' }); return; }
        if (room.players.size >= 8) { sendTo(ws, { type: 'error', message: 'Server is full.' }); return; }
        const spectating = !!room.game;
        room.players.set(playerId, { id: playerId, name: meta.username, ws, chips: acc?.chips || START_CHIPS, debt: 0, isBot: false, spectating, pendingJoin: spectating, username: meta.username });
        meta.serverId = room.id;
        sendTo(ws, { type: 'joinedServer', server: roomSnapshot(room), playerId, spectating });
        if (room.game) broadcastGame(room, [{ msg: `👋 ${meta.username} joined as spectator.`, type: 'good' }]);
        broadcast(room.id, { type: 'playerJoined', player: { id: playerId, name: meta.username, chips: acc?.chips || START_CHIPS, isBot: false, spectating }, server: roomSnapshot(room) }, playerId);
        broadcastServerList(); break;
      }
      case 'leaveServer': handleLeave(ws, meta); break;
      case 'addBot': {
        const room = servers.get(meta.serverId);
        if (!room || room.ownerId !== playerId || room.game || room.players.size >= 8) return;
        const botId = nextId(), types = ['simple','smart','chaotic'], botType = types[Math.floor(Math.random()*3)];
        const icons = { simple:'🤖', smart:'🧠', chaotic:'🎲' };
        const num = [...room.players.values()].filter(p=>p.isBot).length + 1;
        const bname = `${icons[botType]} Bot${num}`;
        room.players.set(botId, { id: botId, name: bname, ws: null, chips: 500, debt: 0, isBot: true, botType, spectating: false });
        broadcast(room.id, { type: 'playerJoined', player: { id: botId, name: bname, chips: 500, isBot: true, botType }, server: roomSnapshot(room) });
        broadcastServerList(); break;
      }
      case 'removeBot': {
        const room = servers.get(meta.serverId); if (!room || room.ownerId !== playerId) return;
        const bot = room.players.get(msg.botId); if (!bot || !bot.isBot) return;
        room.players.delete(msg.botId);
        broadcast(room.id, { type: 'playerLeft', playerId: msg.botId, server: roomSnapshot(room) });
        broadcastServerList(); break;
      }
      case 'startGame': {
        const room = servers.get(meta.serverId); if (!room) return;
        if (room.ownerId !== playerId) { sendTo(ws, { type: 'error', message: 'Only host can start.' }); return; }
        if ([...room.players.values()].filter(p=>!p.spectating).length < 2) { sendTo(ws, { type: 'error', message: 'Need at least 2 active players.' }); return; }
        if (room.game) { sendTo(ws, { type: 'error', message: 'Game already running.' }); return; }
        broadcastToRoom(room, { type: 'gameStarting' });
        startGame(room); break;
      }
      case 'updateSettings': {
        const room = servers.get(meta.serverId); if (!room || room.ownerId !== playerId || room.game) return;
        room.settings = parseSettings(msg.settings || {});
        broadcastToRoom(room, { type: 'settingsUpdated', settings: room.settings, server: roomSnapshot(room) }); break;
      }
      case 'placeBet': {
        const room = servers.get(meta.serverId); if (!room || !room.game || room.game.phase !== 'betting') return;
        const game = room.game;
        const p = game.players.find(pl => pl.id === playerId); if (!p || p.status !== 'waiting') return;
        const amount = Math.max(game.settings.minBet || 1, Math.min(parseInt(msg.bet) || game.settings.minBet || 5, p.chips));
        commitBet(game, game.players.indexOf(p), amount);
        broadcastGame(room, [{ msg: `${p.name} bets ${p.bet}.` }]);
        checkAllBet(room); break;
      }
      case 'hit': case 'stand': {
        const room = servers.get(meta.serverId); if (room && room.game) playerAction(room, playerId, msg.type); break;
      }
      case 'chat': {
        const room = servers.get(meta.serverId); if (!room) return;
        const sender = room.players.get(playerId); if (!sender) return;
        broadcastToRoom(room, { type: 'chat', from: sender.name, text: String(msg.text || '').slice(0, 200) }); break;
      }
      case 'refreshServers':
        sendTo(ws, { type: 'serverList', servers: serverListSnapshot() }); break;
      case 'getStats':
        if (acc) sendTo(ws, { type: 'stats', chips: acc.chips, totalWon: acc.totalWon, gamesPlayed: acc.gamesPlayed }); break;
    }
  });

  ws.on('close', () => { const m = clients.get(ws); if (m) { handleLeave(ws, m); if (m.username) { const prev = loggedIn.get(m.username); if (prev === m.playerId) loggedIn.delete(m.username); } } clients.delete(ws); });
});

function parseSettings(s) {
  return {
    mode: ['blackjack','poker'].includes(s.mode) ? s.mode : 'blackjack',
    deckCount: Math.max(1, Math.min(6, parseInt(s.deckCount) || 1)),
    minBet: Math.max(1, parseInt(s.minBet) || 5),
    maxBet: Math.max(10, parseInt(s.maxBet) || 100),
    enabledSpecials: Array.isArray(s.enabledSpecials) ? s.enabledSpecials : ALL_SPECIALS.map(sc => sc.id),
    // BJ rules
    bjSoft17: s.bjSoft17 !== false,
    bjDoubleAllowed: s.bjDoubleAllowed !== false,
    bjBlackjackPays: ['3:2','6:5','1:1'].includes(s.bjBlackjackPays) ? s.bjBlackjackPays : '3:2',
    // Poker rules
    pokerAnte: Math.max(0, parseInt(s.pokerAnte) || 0),
    pokerBlinds: s.pokerBlinds !== false,
    pokerSmallBlind: Math.max(1, parseInt(s.pokerSmallBlind) || 5),
    pokerBigBlind: Math.max(2, parseInt(s.pokerBigBlind) || 10),
  };
}

function handleLeave(ws, meta) {
  if (!meta.serverId) return;
  const room = servers.get(meta.serverId); if (!room) return;
  room.players.delete(meta.playerId);
  meta.serverId = null;
  if (meta.playerId === room.ownerId) {
    broadcastToRoom(room, { type: 'serverClosed', reason: 'The host left.' });
    servers.delete(room.id); broadcastServerList(); return;
  }
  if (room.players.size === 0) { servers.delete(room.id); }
  else {
    if (room.game) {
      const gp = room.game.players.find(p => p.id === meta.playerId);
      if (gp) {
        gp.status = 'bust';
        if (room.game.players[room.game.currentPlayerIdx]?.id === meta.playerId) { room.game.currentPlayerIdx++; tickTurn(room); }
      }
    }
    broadcast(room.id, { type: 'playerLeft', playerId: meta.playerId, server: roomSnapshot(room) });
  }
  broadcastServerList();
}

httpServer.listen(PORT, () => console.log(`🃏 Chaos Cards v4 on port ${PORT}`));
