// ══════════════════════════════════════════════════════════
//  CHAOS CARDS — Server v5
//  Env: MONGODB_URI=mongodb+srv://...
// ══════════════════════════════════════════════════════════
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI;
const BROKE_WAIT_MS = 60 * 60 * 1000;
const BROKE_GIFT = 100;
const START_CHIPS = 500;

// ── DB ─────────────────────────────────────────────────────
let accounts = null;
const memAccounts = {};

async function connectDB() {
  if (!MONGO_URI) { console.warn('⚠️  No MONGODB_URI — using memory'); return; }
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db('chaoscards');
    accounts = db.collection('accounts');
    await accounts.createIndex({ username: 1 }, { unique: true });
    console.log('✅ MongoDB connected');
  } catch (e) { console.error('❌ MongoDB failed:', e.message); }
}

function hashPass(p) {
  let h = 5381;
  for (let i = 0; i < p.length; i++) h = ((h << 5) + h) ^ p.charCodeAt(i);
  return (h >>> 0).toString(36);
}

async function getAcc(u) { return accounts ? await accounts.findOne({ username: u }) : (memAccounts[u] || null); }
async function createAcc(u, ph) {
  const d = { username: u, passwordHash: ph, chips: START_CHIPS, lastBroke: null, totalWon: 0, gamesPlayed: 0, createdAt: new Date() };
  if (accounts) await accounts.insertOne(d); else memAccounts[u] = d;
  return d;
}
async function updateAcc(u, upd) {
  if (accounts) await accounts.updateOne({ username: u }, { $set: upd });
  else if (memAccounts[u]) Object.assign(memAccounts[u], upd);
}
async function incAcc(u, won) {
  if (accounts) await accounts.updateOne({ username: u }, { $inc: { gamesPlayed: 1, ...(won ? { totalWon: 1 } : {}) } });
  else if (memAccounts[u]) { memAccounts[u].gamesPlayed = (memAccounts[u].gamesPlayed || 0) + 1; if (won) memAccounts[u].totalWon = (memAccounts[u].totalWon || 0) + 1; }
}

// ── HTTP ───────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(data);
    });
  } else { res.writeHead(404); res.end('Not found'); }
});

const wss = new WebSocket.Server({ server: httpServer });
const servers = new Map();
const clients = new Map();
const loggedIn = new Map();
let uid = 1;
const nid = () => String(uid++);

// ══════════════════════════════════════════════════════════
//  CARDS
// ══════════════════════════════════════════════════════════
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const ALL_SPECIALS = [
  { id:'credit',    name:'Credit Card',        icon:'💳', style:'credit',
    effect:'Draw 2 extra cards free — but owe 5 chips to the pot next round.' },
  { id:'license',   name:"Driver's Licence",   icon:'🪪', style:'license',
    effect:'Bust immunity — stay alive even if your score goes over 21 this round.' },
  { id:'shopping',  name:'Shopping List',      icon:'🛒', style:'shopping',
    effect:'A random card valued 2–10 is added to your hand for free.' },
  { id:'blackhole', name:'Black Hole',         icon:'🕳️', style:'blackhole',
    effect:'The highest-value card in every other player\'s hand is removed.' },
  { id:'lucky8',    name:'Lucky 8-Ball',       icon:'🎱', style:'lucky8',
    effect:'3 extra community cards are revealed instantly for everyone.' },
  { id:'irs',       name:'IRS Notice',         icon:'📋', style:'irs',
    effect:'Every player at the table must pay 3 chips into the pot immediately.' },
  { id:'receipt',   name:'Receipt',            icon:'🧾', style:'receipt',
    effect:'Secretly peek at the full hand of a random opponent.' },
  { id:'rubber',    name:'Rubber Duck',        icon:'🦆', style:'rubber',
    effect:'Your score is locked at exactly 17 for the rest of this round.' },
  { id:'swap',      name:'Identity Swap',      icon:'🔄', style:'swap',
    effect:'Your entire hand is swapped with a random opponent\'s hand.' },
  { id:'double',    name:'Double Down',        icon:'⚡', style:'double',
    effect:'Your bet doubles, you receive exactly one more card, then you must stand.' },
  { id:'freeze',    name:'Deep Freeze',        icon:'🧊', style:'freeze',
    effect:'The next player\'s turn is completely skipped.' },
  { id:'mirror',    name:'Magic Mirror',       icon:'🪞', style:'mirror',
    effect:'Your score is replaced by a copy of the current highest score at the table.' },
  { id:'timebomb',  name:'Time Bomb',          icon:'💣', style:'timebomb',
    effect:'Every other player immediately receives one extra card, whether they want it or not.' },
  { id:'wildcard',  name:'Wild Card',          icon:'🃏', style:'wildcard',
    effect:'This card counts as exactly 7 toward your hand total.' },
  { id:'taxreturn', name:'Tax Return',         icon:'💰', style:'taxreturn',
    effect:'You collect 4 chips directly from every other player at the table.' },
  { id:'amnesia',   name:'Amnesia',            icon:'🌀', style:'amnesia',
    effect:'All community cards are discarded and two fresh ones are dealt in their place.' },
  { id:'cloner',    name:'Card Cloner',        icon:'🖨️', style:'cloner',
    effect:'A copy of your highest-value card is duplicated and added to your hand.' },
  { id:'banker',    name:'The Banker',         icon:'🏦', style:'banker',
    effect:'Half the pot is immediately paid out to you, win or lose.' },
  { id:'sniper',    name:'Card Sniper',        icon:'🎯', style:'sniper',
    effect:'Discard the lowest card from a random opponent\'s hand.' },
  { id:'reverse',   name:'Reverse Card',      icon:'🔃', style:'reverse',
    effect:'The turn order is reversed — players now act in the opposite direction.' },
  { id:'jackpot',   name:'Jackpot',           icon:'🎰', style:'jackpot',
    effect:'Roll a dice (1–6). Win that many × 10 chips from the pot instantly.' },
  { id:'plague',    name:'The Plague',        icon:'☠️', style:'plague',
    effect:'Everyone else loses their lowest card. You gain an extra card from the deck.' },
  { id:'shield',    name:'Holy Shield',       icon:'🛡️', style:'shield',
    effect:'Block the next special card effect that targets you this round.' },
  { id:'telescope', name:'Telescope',         icon:'🔭', style:'telescope',
    effect:'See the top 3 cards of the deck before anyone else draws.' },
];

// ── Shuffle using Fisher-Yates with crypto-grade randomness ──
function shuffle(arr) {
  // Multiple Fisher-Yates passes for extra randomness
  for (let pass = 0; pass < 3; pass++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  // Cut the deck at a random point
  const cut = Math.floor(Math.random() * arr.length);
  return [...arr.slice(cut), ...arr.slice(0, cut)];
}

function buildDeck(deckCount, enabledSpecials) {
  const deck = [];
  for (let d = 0; d < deckCount; d++)
    SUITS.forEach(s => RANKS.forEach(r => deck.push({ rank: r, suit: s, isNormal: true })));
  const specials = Array.isArray(enabledSpecials) && enabledSpecials.length
    ? ALL_SPECIALS.filter(s => enabledSpecials.includes(s.id))
    : ALL_SPECIALS;
  specials.forEach(sc => deck.push({ ...sc, isSpecial: true }));
  return shuffle(deck);
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

function pokerHandRank(hand, community) {
  const all = [...hand, ...community].filter(c => !c.isSpecial);
  if (all.length < 2) return 0;
  const vals = all.map(c => simpleVal(c)).sort((a,b) => b-a);
  const suits = all.map(c => c.suit);
  const vc = {}; vals.forEach(v => vc[v] = (vc[v]||0)+1);
  const counts = Object.values(vc).sort((a,b)=>b-a);
  const sc = {}; suits.forEach(s => sc[s] = (sc[s]||0)+1);
  const hasFlush = Object.values(sc).some(v=>v>=5);
  const uv = [...new Set(vals)].sort((a,b)=>a-b);
  let hasStraight = false;
  for (let i=0; i<=uv.length-5; i++)
    if (uv[i+4]-uv[i]===4 && new Set(uv.slice(i,i+5)).size===5) { hasStraight=true; break; }
  const top = vals[0]||0;
  if (hasStraight&&hasFlush) return 800+top;
  if (counts[0]===4) return 700+top;
  if (counts[0]===3&&counts[1]>=2) return 600+top;
  if (hasFlush) return 500+top;
  if (hasStraight) return 400+top;
  if (counts[0]===3) return 300+top;
  if (counts[0]===2&&counts[1]===2) return 200+top;
  if (counts[0]===2) return 100+top;
  return top;
}

function pokerLabel(rank) {
  if (rank>=800) return 'Str.Flush'; if (rank>=700) return 'Quads';
  if (rank>=600) return 'Full House'; if (rank>=500) return 'Flush';
  if (rank>=400) return 'Straight'; if (rank>=300) return 'Trips';
  if (rank>=200) return 'Two Pair'; if (rank>=100) return 'Pair';
  return 'High Card';
}

// ── Special effects ────────────────────────────────────────
function applySpecial(game, pidx, card) {
  const p = game.players[pidx];
  const logs = [];
  const others = () => game.players.filter((_,i)=>i!==pidx&&game.players[i].status!=='bust');

  switch (card.id) {
    case 'credit':
      logs.push({msg:`💳 ${p.name} used Credit Card — 2 free cards, owes 5 chips!`,type:'chaos'});
      for(let i=0;i<2;i++){const c=drawCard(game);p.hand.push(c);if(c.isSpecial)logs.push(...applySpecial(game,pidx,c));}
      p.debt=(p.debt||0)+5; break;
    case 'license':
      logs.push({msg:`🪪 ${p.name} has Licence — bust immunity!`,type:'good'});
      p.bustImmune=true; break;
    case 'shopping':{
      const v=Math.floor(Math.random()*9)+2,s=SUITS[Math.floor(Math.random()*4)];
      p.hand.push({rank:String(v),suit:s,isNormal:true});
      logs.push({msg:`🛒 ${p.name}'s Shopping List: ${v}${s}!`,type:'chaos'}); break;}
    case 'blackhole':
      logs.push({msg:`🕳️ ${p.name} opened a Black Hole!`,type:'chaos'});
      game.players.forEach((pl,i)=>{
        if(i===pidx||pl.status==='bust'||!pl.hand.length)return;
        const mv=Math.max(...pl.hand.map(c=>simpleVal(c)));
        const mi=pl.hand.map(c=>simpleVal(c)).lastIndexOf(mv);
        if(mi>=0)pl.hand.splice(mi,1);}); break;
    case 'lucky8':
      logs.push({msg:`🎱 ${p.name} shook the 8-Ball — 3 community cards!`,type:'good'});
      for(let i=0;i<3;i++)game.community.push(drawCard(game)); break;
    case 'irs':
      logs.push({msg:`📋 IRS Notice! Everyone pays 3 chips.`,type:'bad'});
      game.players.forEach(pl=>{const pay=Math.min(3,pl.chips);pl.chips-=pay;game.pot+=pay;}); break;
    case 'receipt':{
      const oth=others();
      if(oth.length){const t=oth[Math.floor(Math.random()*oth.length)];
        logs.push({msg:`🧾 ${p.name} peeked at ${t.name}: [${t.hand.map(c=>c.isSpecial?c.name:`${c.rank}${c.suit}`).join(', ')}]`,type:'chaos'});}
      break;}
    case 'rubber':
      logs.push({msg:`🦆 ${p.name} deployed Rubber Duck — locked at 17!`,type:'chaos'});
      p.duckLocked=true; break;
    case 'swap':{
      const oth2=others();
      if(oth2.length){const t=oth2[Math.floor(Math.random()*oth2.length)];
        const tmp=p.hand;p.hand=t.hand;t.hand=tmp;
        logs.push({msg:`🔄 ${p.name} swapped hands with ${t.name}!`,type:'chaos'});}
      break;}
    case 'double':{
      logs.push({msg:`⚡ ${p.name} doubled down!`,type:'good'});
      const extra=Math.min(p.bet,p.chips);p.chips-=extra;game.pot+=extra;p.bet+=extra;
      const c=drawCard(game);p.hand.push(c);
      if(c.isSpecial)logs.push(...applySpecial(game,pidx,c));
      p.mustStand=true; break;}
    case 'freeze':
      logs.push({msg:`🧊 ${p.name} played Deep Freeze — next player skipped!`,type:'chaos'});
      game.skipNext=true; break;
    case 'mirror':{
      let best=-1;
      game.players.forEach((pl,i)=>{if(i===pidx)return;const s=handScore(pl.hand,pl.duckLocked);if(s<=21&&s>best)best=s;});
      if(best>0){p.mirrorScore=best;logs.push({msg:`🪞 ${p.name} used Magic Mirror — score is ${best}!`,type:'good'});}
      break;}
    case 'timebomb':
      logs.push({msg:`💣 Time Bomb! Everyone else takes a card!`,type:'bad'});
      game.players.forEach((pl,i)=>{if(pl.status==='bust'||i===pidx)return;
        const c=drawCard(game);pl.hand.push(c);
        if(!pl.bustImmune&&handScore(pl.hand,pl.duckLocked)>21&&game.settings.mode!=='highorlow')pl.status='bust';}); break;
    case 'wildcard':
      logs.push({msg:`🃏 ${p.name} played Wild Card — counts as 7!`,type:'chaos'}); break;
    case 'taxreturn':
      logs.push({msg:`💰 ${p.name} filed Tax Return — collecting 4 chips from everyone!`,type:'good'});
      game.players.forEach((pl,i)=>{if(i===pidx)return;const take=Math.min(4,pl.chips);pl.chips-=take;p.chips+=take;}); break;
    case 'amnesia':
      logs.push({msg:`🌀 Amnesia! Community cards wiped!`,type:'chaos'});
      game.community=[];for(let i=0;i<2;i++)game.community.push(drawCard(game)); break;
    case 'cloner':{
      const vals=p.hand.filter(c=>!c.isSpecial);
      if(vals.length){
        const top=[...vals].sort((a,b)=>simpleVal(b)-simpleVal(a))[0];
        p.hand.push({...top});
        logs.push({msg:`🖨️ ${p.name} cloned a ${top.rank}${top.suit}!`,type:'good'});}
      break;}
    case 'banker':{
      const take=Math.floor(game.pot/2);
      p.chips+=take;game.pot-=take;
      logs.push({msg:`🏦 ${p.name} visited The Banker — took ${take} chips from the pot!`,type:'good'}); break;}
    case 'sniper':{
      const oth3=others();
      if(oth3.length){const t=oth3[Math.floor(Math.random()*oth3.length)];
        const nspec=t.hand.filter(c=>!c.isSpecial);
        if(nspec.length){
          const min=nspec.reduce((a,b)=>simpleVal(a)<simpleVal(b)?a:b);
          t.hand=t.hand.filter(c=>c!==min);
          logs.push({msg:`🎯 ${p.name} sniped ${min.rank}${min.suit} from ${t.name}!`,type:'chaos'});}}
      break;}
    case 'reverse':
      logs.push({msg:`🔃 ${p.name} reversed turn order!`,type:'chaos'});
      game.reversed=!game.reversed;
      game.players.reverse();
      game.currentPlayerIdx=game.players.length-1-game.currentPlayerIdx;
      break;
    case 'jackpot':{
      const roll=Math.floor(Math.random()*6)+1;
      const win=roll*10;const actual=Math.min(win,game.pot);
      p.chips+=actual;game.pot-=actual;
      logs.push({msg:`🎰 ${p.name} rolled a ${roll} — jackpot! +${actual} chips!`,type:'good'}); break;}
    case 'plague':
      logs.push({msg:`☠️ ${p.name} unleashed The Plague!`,type:'bad'});
      game.players.forEach((pl,i)=>{
        if(i===pidx){const c=drawCard(game);p.hand.push(c);return;}
        if(pl.status==='bust'||!pl.hand.length)return;
        const nspec=pl.hand.filter(c=>!c.isSpecial);
        if(nspec.length){const min=nspec.reduce((a,b)=>simpleVal(a)<simpleVal(b)?a:b);pl.hand=pl.hand.filter(c=>c!==min);}
      }); break;
    case 'shield':
      logs.push({msg:`🛡️ ${p.name} raised Holy Shield — next special targeting them is blocked!`,type:'good'});
      p.shielded=true; break;
    case 'telescope':{
      const top3=game.deck.slice(-3).reverse();
      logs.push({msg:`🔭 ${p.name} used Telescope — sees: [${top3.map(c=>c.isSpecial?c.name:`${c.rank}${c.suit}`).join(', ')}]`,type:'chaos',privateFor:p.id}); break;}
  }
  return logs;
}

function drawCard(game) {
  if(game.deck.length===0) game.deck=buildDeck(game.settings.deckCount||1,game.settings.enabledSpecials);
  return game.deck.pop();
}

// ── Bot AI ─────────────────────────────────────────────────
function botDecide(bot, game) {
  const score = handScore(bot.hand, bot.duckLocked);
  const mode = game.settings.mode;
  const type = bot.botType||'simple';
  // Mode-specific targets
  const targets = { blackjack:17, highorlow:7, lucky21:19, bust:16 };
  const target = targets[mode]||17;
  if (type==='simple') return score<target?'hit':'stand';
  if (type==='smart') {
    if (score>=target+1) return 'stand'; if (score<=11) return 'hit';
    const cv=game.community.reduce((s,c)=>s+simpleVal(c),0);
    return cv<12?'stand':'hit';
  }
  if (type==='chaotic') {
    if (score<=10) return 'hit'; if (score>=21) return 'stand';
    return Math.random()<0.55?'hit':'stand';
  }
  return 'stand';
}

// ══════════════════════════════════════════════════════════
//  GAME MODES
//  blackjack  — classic, target 21, bust >21
//  poker      — best 5-card hand from hole+community
//  highorlow  — target exactly 7 (closest wins), no bust
//  lucky21    — MUST hit until 17+, can't stand before 17
//  bust       — REVERSED: highest score WITHOUT going over wins
//               BUT: you want to be as close to 21 AS POSSIBLE
//               without any player busting — last one standing wins
//  shootout   — everyone gets 1 card, highest wins, all others pay
// ══════════════════════════════════════════════════════════

function parseSettings(s) {
  const modes = ['blackjack','poker','highorlow','lucky21','bust','shootout'];
  return {
    mode: modes.includes(s.mode)?s.mode:'blackjack',
    deckCount: Math.max(1,Math.min(6,parseInt(s.deckCount)||1)),
    minBet: Math.max(1,parseInt(s.minBet)||5),
    maxBet: Math.max(10,parseInt(s.maxBet)||100),
    enabledSpecials: Array.isArray(s.enabledSpecials)?s.enabledSpecials:ALL_SPECIALS.map(sc=>sc.id),
    bjSoft17: s.bjSoft17!==false,
    bjDoubleAllowed: s.bjDoubleAllowed!==false,
    bjBlackjackPays: ['3:2','6:5','1:1'].includes(s.bjBlackjackPays)?s.bjBlackjackPays:'3:2',
    pokerAnte: Math.max(0,parseInt(s.pokerAnte)||0),
    pokerBlinds: s.pokerBlinds!==false,
    pokerSmallBlind: Math.max(1,parseInt(s.pokerSmallBlind)||5),
    pokerBigBlind: Math.max(2,parseInt(s.pokerBigBlind)||10),
  };
}

function startGame(room) {
  const active=[...room.players.values()].filter(p=>!p.spectating);
  if(active.length<2) return false;
  const settings=parseSettings(room.settings||{});
  const game={
    deck:buildDeck(settings.deckCount,settings.enabledSpecials),
    community:[],pot:0,round:room.round||1,
    phase:'betting',currentPlayerIdx:0,skipNext:false,reversed:false,
    settings,_pendingLogs:[],
    players:active.map((p,i)=>({
      id:p.id,name:p.name,isBot:p.isBot,botType:p.botType,
      chips:p.chips,hand:[],bet:0,status:'waiting',
      bustImmune:false,duckLocked:false,mustStand:false,
      mirrorScore:null,debt:p.debt||0,shielded:false,
      isSmallBlind:settings.pokerBlinds&&settings.mode==='poker'&&i===0,
      isBigBlind:settings.pokerBlinds&&settings.mode==='poker'&&i===1,
    })),
  };
  room.game=game;

  // Poker blinds
  if(settings.mode==='poker'&&settings.pokerBlinds){
    const sb=game.players[0],bb=game.players[1];
    if(sb){const a=Math.min(settings.pokerSmallBlind,sb.chips);sb.chips-=a;sb.bet=a;sb.status='betting';game.pot+=a;}
    if(bb){const a=Math.min(settings.pokerBigBlind,bb.chips);bb.chips-=a;bb.bet=a;bb.status='betting';game.pot+=a;}
    game._pendingLogs.push({msg:`♠ Blinds: ${settings.pokerSmallBlind}/${settings.pokerBigBlind}`,type:'good'});
  }
  if(settings.pokerAnte>0)
    game.players.forEach(p=>{const a=Math.min(settings.pokerAnte,p.chips);p.chips-=a;game.pot+=a;});

  // Shootout: deal 1 card immediately, skip betting for bots
  if(settings.mode==='shootout'){
    game.players.forEach((_,i)=>dealTo(game,i));
  }

  game.players.forEach((p,i)=>{if(p.isBot&&p.status==='waiting')setTimeout(()=>botBet(room,i),700+i*450);});
  broadcastGame(room,[{msg:`🃏 Round ${game.round} — ${modeName(settings.mode)}. Place your bets!`,type:'good'}]);
  return true;
}

function modeName(m){
  return {blackjack:'BLACKJACK',poker:'POKER',highorlow:'HIGH OR LOW',lucky21:'LUCKY 21',bust:'LAST STANDING',shootout:'SHOOTOUT'}[m]||m.toUpperCase();
}

function botBet(room,idx){
  const game=room.game; if(!game||game.phase!=='betting')return;
  const p=game.players[idx]; if(!p||!p.isBot||p.status!=='waiting')return;
  const min=game.settings.minBet||5,max=Math.min(game.settings.maxBet||100,p.chips);
  const bet=Math.max(min,Math.min(max,Math.floor(Math.random()*20)+min));
  commitBet(game,idx,bet);
  broadcastGame(room,[{msg:`🤖 ${p.name} bets ${bet}.`}]);
  checkAllBet(room);
}

function commitBet(game,idx,amount){
  const p=game.players[idx];
  const bet=Math.max(1,Math.min(amount,p.chips));
  p.chips-=bet;p.bet+=bet;p.status='betting';game.pot+=bet;
  if(p.debt>0){const pay=Math.min(p.debt,p.chips);p.chips-=pay;game.pot+=pay;p.debt=0;}
}

function checkAllBet(room){
  const game=room.game; if(!game)return;
  if(game.players.some(p=>p.status==='waiting'))return;
  game.phase='play';
  game.players.forEach(p=>{if(p.status==='betting')p.status='active';});

  const mode=game.settings.mode;
  if(mode==='shootout'){
    // Already dealt 1 card, go straight to reveal
    endRound(room); return;
  } else if(mode==='poker'){
    game.players.forEach((_,i)=>{dealTo(game,i);dealTo(game,i);});
    for(let i=0;i<5;i++)dealComm(game);
  } else {
    game.players.forEach((_,i)=>{dealTo(game,i);dealTo(game,i);});
    dealComm(game); dealComm(game);
  }
  game.currentPlayerIdx=0;
  const logs=game._pendingLogs||[];game._pendingLogs=[];
  broadcastGame(room,[...logs,{msg:'🃏 Cards dealt! Play begins.',type:'good'}]);
  tickTurn(room);
}

function dealTo(game,idx){
  const c=drawCard(game);game.players[idx].hand.push(c);
  if(c.isSpecial)game._pendingLogs=(game._pendingLogs||[]).concat(applySpecial(game,idx,c));
}
function dealComm(game){game.community.push(drawCard(game));}

function shouldBust(game,p){
  const mode=game.settings.mode;
  if(mode==='highorlow'||mode==='poker'||mode==='shootout') return false; // no bust
  if(mode==='lucky21') return false; // can go over but must keep going
  return !p.bustImmune&&handScore(p.hand,p.duckLocked)>21;
}

function tickTurn(room){
  const game=room.game; if(!game||game.phase!=='play')return;
  while(game.currentPlayerIdx<game.players.length&&
    ['bust','standing','waiting'].includes(game.players[game.currentPlayerIdx].status))
    game.currentPlayerIdx++;
  if(game.currentPlayerIdx>=game.players.length){endRound(room);return;}

  if(game.skipNext){
    game.skipNext=false;const sk=game.players[game.currentPlayerIdx];
    sk.status='standing';
    broadcastGame(room,[{msg:`🧊 ${sk.name}'s turn skipped!`,type:'chaos'}]);
    game.currentPlayerIdx++;tickTurn(room);return;
  }
  const cur=game.players[game.currentPlayerIdx];
  if(cur.mustStand){
    cur.status='standing';cur.mustStand=false;
    broadcastGame(room,[{msg:`⚡ ${cur.name} stands after doubling down.`}]);
    game.currentPlayerIdx++;tickTurn(room);return;
  }

  // Lucky21: auto-force hit if below 17
  if(game.settings.mode==='lucky21'&&handScore(cur.hand,cur.duckLocked)<17&&!cur.isBot){
    dealTo(game,game.currentPlayerIdx);
    broadcastGame(room,[{msg:`🤞 ${cur.name} must hit (Lucky 21 — under 17).`}]);
    tickTurn(room);return;
  }

  const logs=game._pendingLogs||[];game._pendingLogs=[];
  broadcastGame(room,[...logs,{msg:`▶ ${cur.name}'s turn.`}]);
  if(cur.isBot)setTimeout(()=>executeBotTurn(room,game.currentPlayerIdx),1300);
}

function executeBotTurn(room,idx){
  const game=room.game;if(!game||game.phase!=='play')return;
  const p=game.players[idx];if(!p||!p.isBot)return;
  if(botDecide(p,game)==='hit'){
    dealTo(game,idx);
    const score=handScore(p.hand,p.duckLocked);
    const logs=[{msg:`🤖 ${p.name} hits — ${score}.`}];
    if(shouldBust(game,p)){
      p.status='bust';logs.push({msg:`💀 ${p.name} busts!`,type:'bad'});
      game.currentPlayerIdx++;broadcastGame(room,logs);tickTurn(room);
    } else {broadcastGame(room,logs);setTimeout(()=>executeBotTurn(room,idx),900);}
  } else {
    p.status='standing';
    broadcastGame(room,[{msg:`🤖 ${p.name} stands at ${handScore(p.hand,p.duckLocked)}.`}]);
    game.currentPlayerIdx++;tickTurn(room);
  }
}

function playerAction(room,playerId,action){
  const game=room.game;if(!game||game.phase!=='play')return;
  const idx=game.players.findIndex(p=>p.id===playerId);
  if(idx!==game.currentPlayerIdx)return;
  const p=game.players[idx];if(p.status!=='active')return;
  if(action==='hit'){
    dealTo(game,idx);
    const score=handScore(p.hand,p.duckLocked);
    const logs=[{msg:`${p.name} hits — ${score}.`}];
    if(shouldBust(game,p)){
      p.status='bust';logs.push({msg:`💀 ${p.name} busts!`,type:'bad'});
      game.currentPlayerIdx++;broadcastGame(room,logs);tickTurn(room);
    } else broadcastGame(room,logs);
  } else if(action==='stand'){
    p.status='standing';
    broadcastGame(room,[{msg:`${p.name} stands at ${handScore(p.hand,p.duckLocked)}.`}]);
    game.currentPlayerIdx++;tickTurn(room);
  }
}

function endRound(room){
  const game=room.game;game.phase='reveal';
  const mode=game.settings.mode;
  let winners=[];

  if(mode==='blackjack'||mode==='lucky21'){
    let best=-1;
    game.players.forEach(p=>{
      if(p.status==='bust'){p._finalScore=handScore(p.hand,p.duckLocked);return;}
      const s=p.mirrorScore!=null?p.mirrorScore:handScore(p.hand,p.duckLocked);
      p._finalScore=s;if(s<=21&&s>best)best=s;
    });
    winners=game.players.filter(p=>p.status!=='bust'&&p._finalScore===best&&best>=0);
    // BJ bonus payout
    if(mode==='blackjack'){
      winners.forEach(p=>{
        if(p.hand.filter(c=>!c.isSpecial).length===2&&handScore(p.hand,false)===21){
          const pays={'3:2':0.5,'6:5':0.2,'1:1':0}[game.settings.bjBlackjackPays||'3:2'];
          const bonus=Math.floor(p.bet*pays);
          if(bonus>0)p.chips+=bonus;
        }
      });
    }
  } else if(mode==='poker'){
    let best=-1;
    game.players.forEach(p=>{
      const rank=pokerHandRank(p.hand,game.community);
      p._finalScore=rank;p._pokerRank=rank;if(rank>best)best=rank;p.status='standing';
    });
    winners=game.players.filter(p=>p._finalScore===best&&best>=0);
  } else if(mode==='highorlow'){
    // closest to 7 wins (no bust)
    let bestDist=999;
    game.players.forEach(p=>{
      const s=handScore(p.hand,p.duckLocked);p._finalScore=s;
      const d=Math.abs(s-7);if(d<bestDist)bestDist=d;
    });
    winners=game.players.filter(p=>Math.abs(p._finalScore-7)===bestDist);
  } else if(mode==='bust'){
    // Last player standing (not busted) wins. If all bust, highest score wins
    const alive=game.players.filter(p=>p.status!=='bust');
    if(alive.length>0){
      let best=-1;alive.forEach(p=>{const s=handScore(p.hand,p.duckLocked);p._finalScore=s;if(s>best)best=s;});
      winners=alive.filter(p=>p._finalScore===best);
    } else {
      // ALL busted — highest score wins anyway
      let best=-1;
      game.players.forEach(p=>{const s=handScore(p.hand,p.duckLocked);p._finalScore=s;if(s>best)best=s;});
      winners=game.players.filter(p=>p._finalScore===best);
    }
  } else if(mode==='shootout'){
    // 1 card each, highest wins
    let best=-1;
    game.players.forEach(p=>{const s=simpleVal(p.hand[0]||{rank:'2',suit:'♠'});p._finalScore=s;if(s>best)best=s;});
    winners=game.players.filter(p=>p._finalScore===best);
  }

  // Fallback: if still no winners somehow, give pot back equally
  if(winners.length===0) winners=[...game.players];

  const logs=[];
  const share=Math.floor(game.pot/winners.length);
  winners.forEach(p=>{p.chips+=share;p.status='winner';});
  logs.push({msg:`🏆 ${winners.map(p=>p.name).join(' & ')} win${winners.length>1?'':'s'} ${game.pot} chips!`,type:'good'});

  // Sync chips
  game.players.forEach(gp=>{
    const rp=room.players.get(gp.id);
    if(rp){rp.chips=gp.chips;rp.debt=gp.debt||0;}
    if(rp&&rp.username){
      updateAcc(rp.username,{chips:gp.chips}).catch(console.error);
      incAcc(rp.username,gp.status==='winner').catch(console.error);
    }
  });

  broadcastGame(room,logs);

  setTimeout(()=>{
    if(!room.game)return;
    room.round=(room.round||1)+1;
    const results=game.players.map(p=>({
      name:p.name,score:p._finalScore||0,
      displayScore:mode==='poker'?pokerLabel(p._pokerRank||0):(p.status==='bust'?'BUST':String(p._finalScore||0)),
      chips:p.chips,status:p.status,
    }));
    room.game=null;
    room.players.forEach(p=>{
      if(p.isBot&&p.chips<=0)p.chips=500;
      if(!p.isBot&&p.chips<=0){
        p.spectating=true;
        const now=Date.now();
        if(p.username)updateAcc(p.username,{chips:0,lastBroke:now}).catch(console.error);
        if(p.ws&&p.ws.readyState===WebSocket.OPEN)
          p.ws.send(JSON.stringify({type:'broke',waitMs:BROKE_WAIT_MS}));
      }
    });
    room.players.forEach(p=>{if(p.pendingJoin){p.spectating=false;p.pendingJoin=false;}});
    broadcastToRoom(room,{type:'roundSummary',results,mode});
    setTimeout(()=>{if(!room.game)startGame(room);},3500);
  },4000);
}

// ── Broadcast ──────────────────────────────────────────────
function broadcastGame(room,extraLogs=[]){
  const game=room.game;if(!game)return;
  room.players.forEach((rp,pid)=>{
    const ws=rp.ws;if(!ws||ws.readyState!==WebSocket.OPEN)return;
    sendTo(ws,{
      type:'gameState',phase:game.phase,round:game.round,pot:game.pot,
      community:game.community,mode:game.settings.mode,
      minBet:game.settings.minBet,maxBet:game.settings.maxBet,
      enabledSpecials:game.settings.enabledSpecials,
      players:game.players.map(p=>({
        id:p.id,name:p.name,isBot:p.isBot,chips:p.chips,bet:p.bet,status:p.status,
        score:handScore(p.hand,p.duckLocked),
        pokerLabel:game.settings.mode==='poker'?pokerLabel(pokerHandRank(p.hand,game.community)):null,
        hand:p.hand,bustImmune:p.bustImmune,duckLocked:p.duckLocked,
        debt:p.debt,mirrorScore:p.mirrorScore,
        isSmallBlind:p.isSmallBlind,isBigBlind:p.isBigBlind,
      })),
      currentPlayerIdx:game.currentPlayerIdx,
      currentPlayerId:game.players[game.currentPlayerIdx]?.id,
      deckSize:game.deck.length,logs:extraLogs,myId:pid,
    });
  });
}
function broadcastToRoom(room,msg){room.players.forEach(p=>{if(p.ws&&p.ws.readyState===WebSocket.OPEN)sendTo(p.ws,msg);});}
function broadcast(sid,msg,excl=null){const r=servers.get(sid);if(!r)return;r.players.forEach((p,pid)=>{if(pid===excl)return;if(p.ws&&p.ws.readyState===WebSocket.OPEN)sendTo(p.ws,msg);});}
function sendTo(ws,msg){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));}
function roomSnap(room){
  return{id:room.id,name:room.name,hasPassword:!!room.password,ownerId:room.ownerId,
    playerCount:room.players.size,inGame:!!room.game,settings:room.settings,
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,isBot:p.isBot,chips:p.chips,isOwner:p.id===room.ownerId,spectating:p.spectating||false,botType:p.botType}))};
}
function srvList(){return[...servers.values()].map(r=>({id:r.id,name:r.name,hasPassword:!!r.password,playerCount:r.players.size,inGame:!!r.game}));}
function broadcastSrvList(){const list=srvList();wss.clients.forEach(ws=>{const m=clients.get(ws);if(!m||!m.serverId)sendTo(ws,{type:'serverList',servers:list});});}

// ── WS handler ─────────────────────────────────────────────
wss.on('connection',ws=>{
  const playerId=nid();
  clients.set(ws,{playerId,serverId:null,username:null});
  sendTo(ws,{type:'hello',playerId});

  ws.on('message',async raw=>{
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    const meta=clients.get(ws);
    const{playerId}=meta;

    if(msg.type==='register'){
      const u=(msg.username||'').trim().toLowerCase().slice(0,20);
      const p=(msg.password||'').trim();
      if(!u||!p||u.length<3||p.length<4){sendTo(ws,{type:'authError',message:u.length<3?'Username needs 3+ chars.':p.length<4?'Password needs 4+ chars.':'Fill all fields.'});return;}
      if(loggedIn.has(u)){sendTo(ws,{type:'authError',message:'Already logged in elsewhere.'});return;}
      const existing=await getAcc(u);
      if(existing){sendTo(ws,{type:'authError',message:'Username already taken.'});return;}
      const acc=await createAcc(u,hashPass(p));
      loggedIn.set(u,playerId);meta.username=u;
      sendTo(ws,{type:'authOk',playerId,username:u,chips:acc.chips,totalWon:0,gamesPlayed:0,servers:srvList()});
      return;
    }

    if(msg.type==='login'){
      const u=(msg.username||'').trim().toLowerCase().slice(0,20);
      const p=(msg.password||'').trim();
      const acc=await getAcc(u);
      if(!acc){sendTo(ws,{type:'authError',message:'Account not found.'});return;}
      if(acc.passwordHash!==hashPass(p)){sendTo(ws,{type:'authError',message:'Wrong password.'});return;}
      if(loggedIn.has(u)&&loggedIn.get(u)!==playerId){sendTo(ws,{type:'authError',message:'Already logged in on another device.'});return;}
      if(acc.chips<=0&&acc.lastBroke){
        const elapsed=Date.now()-new Date(acc.lastBroke).getTime();
        if(elapsed<BROKE_WAIT_MS){sendTo(ws,{type:'broke',waitMs:BROKE_WAIT_MS-elapsed});return;}
        await updateAcc(u,{chips:BROKE_GIFT,lastBroke:null});acc.chips=BROKE_GIFT;
      }
      loggedIn.set(u,playerId);meta.username=u;
      sendTo(ws,{type:'authOk',playerId,username:u,chips:acc.chips,totalWon:acc.totalWon||0,gamesPlayed:acc.gamesPlayed||0,servers:srvList()});
      return;
    }

    if(!meta.username){sendTo(ws,{type:'authError',message:'Session expired — please log in again.'});return;}
    const acc=await getAcc(meta.username);

    switch(msg.type){
      case 'createServer':{
        if(!msg.name?.trim()){sendTo(ws,{type:'error',message:'Server name required.'});return;}
        const sid=nid();
        const room={id:sid,name:msg.name.trim().slice(0,32),password:msg.password||'',ownerId:playerId,players:new Map(),game:null,round:1,settings:parseSettings(msg.settings||{})};
        servers.set(sid,room);
        room.players.set(playerId,{id:playerId,name:meta.username,ws,chips:acc?.chips||START_CHIPS,debt:0,isBot:false,spectating:false,username:meta.username});
        meta.serverId=sid;
        sendTo(ws,{type:'joinedServer',server:roomSnap(room),playerId});
        broadcastSrvList();break;
      }
      case 'joinServer':{
        const room=servers.get(msg.serverId);
        if(!room){sendTo(ws,{type:'error',message:'Server not found.'});return;}
        if(room.password&&room.password!==msg.password){sendTo(ws,{type:'error',message:'Wrong password.'});return;}
        if(room.players.size>=8){sendTo(ws,{type:'error',message:'Server full.'});return;}
        const spectating=!!room.game;
        room.players.set(playerId,{id:playerId,name:meta.username,ws,chips:acc?.chips||START_CHIPS,debt:0,isBot:false,spectating,pendingJoin:spectating,username:meta.username});
        meta.serverId=room.id;
        sendTo(ws,{type:'joinedServer',server:roomSnap(room),playerId,spectating});
        if(room.game)broadcastGame(room,[{msg:`👋 ${meta.username} joined as spectator.`,type:'good'}]);
        broadcast(room.id,{type:'playerJoined',player:{id:playerId,name:meta.username,chips:acc?.chips||START_CHIPS,isBot:false,spectating},server:roomSnap(room)},playerId);
        broadcastSrvList();break;
      }
      case 'leaveServer':handleLeave(ws,meta);break;
      case 'addBot':{
        const room=servers.get(meta.serverId);
        if(!room||room.ownerId!==playerId||room.game||room.players.size>=8)return;
        const botId=nid(),types=['simple','smart','chaotic'],btype=types[Math.floor(Math.random()*3)];
        const icons={simple:'🤖',smart:'🧠',chaotic:'🎲'};
        const num=[...room.players.values()].filter(p=>p.isBot).length+1;
        const bname=`${icons[btype]} Bot${num}`;
        room.players.set(botId,{id:botId,name:bname,ws:null,chips:500,debt:0,isBot:true,botType:btype,spectating:false});
        broadcast(room.id,{type:'playerJoined',player:{id:botId,name:bname,chips:500,isBot:true,botType:btype},server:roomSnap(room)});
        broadcastSrvList();break;
      }
      case 'removeBot':{
        const room=servers.get(meta.serverId);if(!room||room.ownerId!==playerId)return;
        const bot=room.players.get(msg.botId);if(!bot||!bot.isBot)return;
        room.players.delete(msg.botId);
        broadcast(room.id,{type:'playerLeft',playerId:msg.botId,server:roomSnap(room)});
        broadcastSrvList();break;
      }
      case 'startGame':{
        const room=servers.get(meta.serverId);if(!room)return;
        if(room.ownerId!==playerId){sendTo(ws,{type:'error',message:'Only host can start.'});return;}
        if([...room.players.values()].filter(p=>!p.spectating).length<2){sendTo(ws,{type:'error',message:'Need at least 2 active players.'});return;}
        if(room.game){sendTo(ws,{type:'error',message:'Game already running.'});return;}
        broadcastToRoom(room,{type:'gameStarting'});
        startGame(room);break;
      }
      case 'updateSettings':{
        const room=servers.get(meta.serverId);if(!room||room.ownerId!==playerId||room.game)return;
        room.settings=parseSettings(msg.settings||{});
        broadcastToRoom(room,{type:'settingsUpdated',settings:room.settings,server:roomSnap(room)});break;
      }
      case 'placeBet':{
        const room=servers.get(meta.serverId);if(!room||!room.game||room.game.phase!=='betting')return;
        const game=room.game;
        const p=game.players.find(pl=>pl.id===playerId);if(!p||p.status!=='waiting')return;
        const amount=Math.max(game.settings.minBet||1,Math.min(parseInt(msg.bet)||game.settings.minBet||5,p.chips));
        commitBet(game,game.players.indexOf(p),amount);
        broadcastGame(room,[{msg:`${p.name} bets ${p.bet}.`}]);
        checkAllBet(room);break;
      }
      case 'hit':case 'stand':{
        const room=servers.get(meta.serverId);if(room&&room.game)playerAction(room,playerId,msg.type);break;
      }
      case 'chat':{
        const room=servers.get(meta.serverId);if(!room)return;
        const sender=room.players.get(playerId);if(!sender)return;
        broadcastToRoom(room,{type:'chat',from:sender.name,text:String(msg.text||'').slice(0,200)});break;
      }
      case 'refreshServers':sendTo(ws,{type:'serverList',servers:srvList()});break;
    }
  });

  ws.on('close',()=>{
    const m=clients.get(ws);
    if(m){handleLeave(ws,m);if(m.username&&loggedIn.get(m.username)===m.playerId)loggedIn.delete(m.username);}
    clients.delete(ws);
  });
});

function handleLeave(ws,meta){
  if(!meta.serverId)return;
  const room=servers.get(meta.serverId);if(!room)return;
  room.players.delete(meta.playerId);meta.serverId=null;
  if(meta.playerId===room.ownerId){
    broadcastToRoom(room,{type:'serverClosed',reason:'The host left.'});
    servers.delete(room.id);broadcastSrvList();return;
  }
  if(room.players.size===0){servers.delete(room.id);}
  else{
    if(room.game){
      const gp=room.game.players.find(p=>p.id===meta.playerId);
      if(gp){gp.status='bust';if(room.game.players[room.game.currentPlayerIdx]?.id===meta.playerId){room.game.currentPlayerIdx++;tickTurn(room);}}
    }
    broadcast(room.id,{type:'playerLeft',playerId:meta.playerId,server:roomSnap(room)});
  }
  broadcastSrvList();
}

connectDB().then(()=>httpServer.listen(PORT,()=>console.log(`🃏 Chaos Cards v5 on port ${PORT}`)));
