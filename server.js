// ══════════════════════════════════════════════════════════
//  CHAOS CARDS — WebSocket Game Server v2
// ══════════════════════════════════════════════════════════
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

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

const servers = new Map();
const clients = new Map();
let uidCounter = 1;
const uid = () => String(uidCounter++);

// ══════════════════════════════════════════════════════════
//  CARD ENGINE
// ══════════════════════════════════════════════════════════
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const SPECIAL_CARDS = [
  { id:'credit',    name:'Credit Card',      icon:'💳', style:'credit',    effect:'Draw 2 extra cards — owe 5 chips next round.' },
  { id:'license',   name:"Driver's Licence", icon:'🪪', style:'license',   effect:'Bust immunity — survive even if over 21 this round.' },
  { id:'shopping',  name:'Shopping List',    icon:'🛒', style:'shopping',  effect:'A random 2–10 card is added to your hand.' },
  { id:'blackhole', name:'Black Hole',       icon:'🕳️', style:'blackhole', effect:'Removes the highest card from every other player.' },
  { id:'lucky8',    name:'Lucky 8-Ball',     icon:'🎱', style:'lucky8',    effect:'Reveals 3 extra community cards instantly.' },
  { id:'irs',       name:'IRS Notice',       icon:'📋', style:'irs',       effect:'All players pay 3 chips to the pot.' },
  { id:'receipt',   name:'Receipt',          icon:'🧾', style:'receipt',   effect:'Secretly reveals a random opponent\'s hand.' },
  { id:'rubber',    name:'Rubber Duck',      icon:'🦆', style:'rubber',    effect:'Your score locks at exactly 17 this round.' },
  { id:'swap',      name:'Identity Swap',    icon:'🔄', style:'swap',      effect:'Swap your entire hand with a random opponent.' },
  { id:'double',    name:'Double Down',      icon:'⚡', style:'double',    effect:'Double your bet — draw exactly one more card then stand.' },
  { id:'freeze',    name:'Deep Freeze',      icon:'🧊', style:'freeze',    effect:'Skip the next player\'s turn entirely.' },
  { id:'mirror',    name:'Magic Mirror',     icon:'🪞', style:'mirror',    effect:'Copy the highest score at the table as your own.' },
  { id:'timebomb',  name:'Time Bomb',        icon:'💣', style:'timebomb',  effect:'Everyone else must take one extra card immediately.' },
  { id:'wildcard',  name:'Wild Card',        icon:'🃏', style:'wildcard',  effect:'Counts as 7 — a free lucky middle card.' },
  { id:'taxreturn', name:'Tax Return',       icon:'💰', style:'taxreturn', effect:'Collect 4 chips from every other player.' },
  { id:'amnesia',   name:'Amnesia',          icon:'🌀', style:'amnesia',   effect:'All community cards discarded and two new ones dealt.' },
];

function buildDeck(count = 1) {
  const deck = [];
  for (let d = 0; d < count; d++) {
    SUITS.forEach(suit => RANKS.forEach(rank => deck.push({ rank, suit, isNormal: true })));
  }
  SPECIAL_CARDS.forEach(sc => deck.push({ ...sc, isSpecial: true }));
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
  if (card.isSpecial) return 0;
  if (['J','Q','K'].includes(card.rank)) return 10;
  return parseInt(card.rank) || 0;
}

function handScore(hand, duckLocked) {
  if (duckLocked) return 17;
  let total = 0, aces = 0;
  hand.forEach(c => {
    if (c.isSpecial) { if (c.id === 'wildcard') total += 7; return; }
    if (c.rank === 'A') { aces++; total += 11; }
    else total += simpleVal(c);
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function applySpecial(game, pidx, card) {
  const p = game.players[pidx];
  const logs = [];
  switch (card.id) {
    case 'credit':
      logs.push({ msg:`💳 ${p.name} used Credit Card — 2 free cards, owes 5 chips!`, type:'chaos' });
      for (let i=0;i<2;i++) { const c=drawCard(game); p.hand.push(c); if(c.isSpecial) logs.push(...applySpecial(game,pidx,c)); }
      p.debt=(p.debt||0)+5; break;
    case 'license':
      logs.push({ msg:`🪪 ${p.name} flashed their Licence — bust immunity!`, type:'good' });
      p.bustImmune=true; break;
    case 'shopping': {
      const v=Math.floor(Math.random()*9)+2, s=SUITS[Math.floor(Math.random()*4)];
      p.hand.push({ rank:String(v), suit:s, isNormal:true });
      logs.push({ msg:`🛒 ${p.name}'s Shopping List: found a ${v}${s}!`, type:'chaos' }); break;
    }
    case 'blackhole':
      logs.push({ msg:`🕳️ ${p.name} opened a Black Hole — highest cards vanish!`, type:'chaos' });
      game.players.forEach((pl,i)=>{
        if(i===pidx||pl.status==='bust'||!pl.hand.length) return;
        const vals=pl.hand.map(c=>simpleVal(c)),max=Math.max(...vals),idx=vals.lastIndexOf(max);
        if(idx>=0) pl.hand.splice(idx,1);
      }); break;
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
      logs.push({ msg:`🦆 ${p.name} deployed Rubber Duck — score locked at 17!`, type:'chaos' });
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
      game.players.forEach((pl,i)=>{ if(i===pidx) return; const s=handScore(pl.hand,pl.duckLocked); if(s<=21&&s>best) best=s; });
      if(best>0){ p.mirrorScore=best; logs.push({ msg:`🪞 ${p.name} used Magic Mirror — score is now ${best}!`, type:'good' }); }
      break; }
    case 'timebomb':
      logs.push({ msg:`💣 Time Bomb! Everyone else takes a card!`, type:'bad' });
      game.players.forEach((pl,i)=>{ if(pl.status==='bust'||i===pidx) return;
        const c=drawCard(game); pl.hand.push(c);
        if(!pl.bustImmune&&handScore(pl.hand,pl.duckLocked)>21) pl.status='bust'; }); break;
    case 'wildcard':
      logs.push({ msg:`🃏 ${p.name} played a Wild Card — counts as 7!`, type:'chaos' }); break;
    case 'taxreturn':
      logs.push({ msg:`💰 ${p.name} filed a Tax Return — collecting 4 chips from everyone!`, type:'good' });
      game.players.forEach((pl,i)=>{ if(i===pidx) return; const take=Math.min(4,pl.chips); pl.chips-=take; p.chips+=take; }); break;
    case 'amnesia':
      logs.push({ msg:`🌀 Amnesia! Community cards wiped and re-dealt!`, type:'chaos' });
      game.community=[]; for(let i=0;i<2;i++) game.community.push(drawCard(game)); break;
  }
  return logs;
}

function drawCard(game) {
  if(game.deck.length===0) game.deck=buildDeck(game.settings?.deckCount||1);
  return game.deck.pop();
}

// ── Bot AI ──────────────────────────────────────────────
function botDecide(bot, game) {
  const score=handScore(bot.hand,bot.duckLocked);
  const type=bot.botType||'simple';
  if(type==='simple') return score<16?'hit':'stand';
  if(type==='smart'){
    if(score>=17) return 'stand'; if(score<=11) return 'hit';
    const cv=game.community.reduce((s,c)=>s+simpleVal(c),0);
    return cv<12?'stand':'hit';
  }
  if(type==='chaotic'){
    if(score<=10) return 'hit'; if(score>=20) return 'stand';
    return Math.random()<0.55?'hit':'stand';
  }
  return 'stand';
}

// ══════════════════════════════════════════════════════════
//  GAME FLOW
// ══════════════════════════════════════════════════════════
function startGame(room) {
  const allPlayers=[...room.players.values()].filter(p=>!p.spectating);
  if(allPlayers.length<2) return false;
  const settings=room.settings||{ mode:'blackjack',deckCount:1,startChips:100,minBet:5,maxBet:50 };
  const game={
    deck:buildDeck(settings.deckCount||1), community:[], pot:0,
    round:room.round||1, phase:'betting', currentPlayerIdx:0, skipNext:false, settings,
    players:allPlayers.map(p=>({
      id:p.id,name:p.name,isBot:p.isBot,botType:p.botType,
      chips:p.chips,hand:[],bet:0,status:'waiting',
      bustImmune:false,duckLocked:false,mustStand:false,mirrorScore:null,debt:p.debt||0,
    })),
    _pendingLogs:[],
  };
  room.game=game;
  game.players.forEach((p,i)=>{ if(p.isBot) setTimeout(()=>botBet(room,i),800+i*500); });
  broadcastGame(room,[{ msg:`🃏 Round ${game.round} — ${settings.mode.toUpperCase()}. Place your bets!`, type:'good' }]);
  return true;
}

function botBet(room,idx) {
  const game=room.game;
  if(!game||game.phase!=='betting') return;
  const p=game.players[idx];
  if(!p||!p.isBot||p.status!=='waiting') return;
  const min=game.settings.minBet||5,max=Math.min(game.settings.maxBet||50,p.chips);
  const bet=Math.max(min,Math.min(max,Math.floor(Math.random()*20)+min));
  commitBet(game,idx,bet);
  broadcastGame(room,[{ msg:`🤖 ${p.name} bets ${bet} chips.` }]);
  checkAllBet(room);
}

function commitBet(game,idx,amount) {
  const p=game.players[idx];
  const bet=Math.max(1,Math.min(amount,p.chips));
  p.chips-=bet; p.bet=bet; p.status='betting'; game.pot+=bet;
  if(p.debt>0){ const pay=Math.min(p.debt,p.chips); p.chips-=pay; game.pot+=pay; p.debt=0; }
}

function checkAllBet(room) {
  const game=room.game; if(!game) return;
  if(game.players.some(p=>p.status==='waiting')) return;
  game.phase='play';
  game.players.forEach(p=>{ if(p.status==='betting') p.status='active'; });
  game.players.forEach((_,i)=>{ dealToPlayer(game,i); dealToPlayer(game,i); });
  dealCommunity(game); dealCommunity(game);
  if(game.settings.mode==='poker'){ dealCommunity(game); dealCommunity(game); dealCommunity(game); }
  game.currentPlayerIdx=0;
  const logs=game._pendingLogs||[]; game._pendingLogs=[];
  broadcastGame(room,[...logs,{ msg:'🃏 Cards dealt! Play begins.', type:'good' }]);
  tickTurn(room);
}

function dealToPlayer(game,idx) {
  const c=drawCard(game); game.players[idx].hand.push(c);
  if(c.isSpecial) game._pendingLogs=(game._pendingLogs||[]).concat(applySpecial(game,idx,c));
}

function dealCommunity(game){ game.community.push(drawCard(game)); }

function tickTurn(room) {
  const game=room.game; if(!game||game.phase!=='play') return;
  while(
    game.currentPlayerIdx<game.players.length&&
    ['bust','standing','waiting'].includes(game.players[game.currentPlayerIdx].status)
  ) game.currentPlayerIdx++;
  if(game.currentPlayerIdx>=game.players.length){ endRound(room); return; }
  if(game.skipNext){
    game.skipNext=false;
    const sk=game.players[game.currentPlayerIdx];
    sk.status='standing';
    broadcastGame(room,[{ msg:`🧊 ${sk.name}'s turn was frozen!`, type:'chaos' }]);
    game.currentPlayerIdx++; tickTurn(room); return;
  }
  const cur=game.players[game.currentPlayerIdx];
  if(cur.mustStand){
    cur.status='standing'; cur.mustStand=false;
    broadcastGame(room,[{ msg:`⚡ ${cur.name} stands after doubling down.` }]);
    game.currentPlayerIdx++; tickTurn(room); return;
  }
  const logs=game._pendingLogs||[]; game._pendingLogs=[];
  broadcastGame(room,[...logs,{ msg:`▶ ${cur.name}'s turn.` }]);
  if(cur.isBot) setTimeout(()=>executeBotTurn(room,game.currentPlayerIdx),1400);
}

function executeBotTurn(room,idx) {
  const game=room.game; if(!game||game.phase!=='play') return;
  const p=game.players[idx]; if(!p||!p.isBot) return;
  if(botDecide(p,game)==='hit'){
    dealToPlayer(game,idx);
    const score=handScore(p.hand,p.duckLocked);
    const logs=[{ msg:`🤖 ${p.name} hits — ${score}.` }];
    if(!p.bustImmune&&score>21){
      p.status='bust'; logs.push({ msg:`💀 ${p.name} busts!`, type:'bad' });
      game.currentPlayerIdx++; broadcastGame(room,logs); tickTurn(room);
    } else { broadcastGame(room,logs); setTimeout(()=>executeBotTurn(room,idx),1000); }
  } else {
    p.status='standing';
    broadcastGame(room,[{ msg:`🤖 ${p.name} stands at ${handScore(p.hand,p.duckLocked)}.` }]);
    game.currentPlayerIdx++; tickTurn(room);
  }
}

function playerAction(room,playerId,action) {
  const game=room.game; if(!game||game.phase!=='play') return;
  const idx=game.players.findIndex(p=>p.id===playerId);
  if(idx!==game.currentPlayerIdx) return;
  const p=game.players[idx]; if(p.status!=='active') return;
  if(action==='hit'){
    dealToPlayer(game,idx);
    const score=handScore(p.hand,p.duckLocked);
    const logs=[{ msg:`${p.name} hits — ${score}.` }];
    if(!p.bustImmune&&score>21){
      p.status='bust'; logs.push({ msg:`💀 ${p.name} busts!`, type:'bad' });
      game.currentPlayerIdx++; broadcastGame(room,logs); tickTurn(room);
    } else { broadcastGame(room,logs); }
  } else if(action==='stand'){
    p.status='standing';
    broadcastGame(room,[{ msg:`${p.name} stands at ${handScore(p.hand,p.duckLocked)}.` }]);
    game.currentPlayerIdx++; tickTurn(room);
  }
}

function endRound(room) {
  const game=room.game; game.phase='reveal';
  let best=-1;
  game.players.forEach(p=>{
    if(p.status==='bust') return;
    const s=p.mirrorScore!=null?p.mirrorScore:handScore(p.hand,p.duckLocked);
    p._finalScore=s; if(s<=21&&s>best) best=s;
  });
  const winners=game.players.filter(p=>p.status!=='bust'&&p._finalScore===best&&best>=0);
  const logs=[];
  if(winners.length>0){
    const share=Math.floor(game.pot/winners.length);
    winners.forEach(p=>{ p.chips+=share; p.status='winner'; });
    logs.push({ msg:`🏆 ${winners.map(p=>p.name).join(' & ')} win${winners.length>1?'':'s'} ${game.pot} chips!`, type:'good' });
  } else {
    logs.push({ msg:`💀 Everyone busted! Pot carries over.`, type:'bad' });
  }
  game.players.forEach(gp=>{ const rp=room.players.get(gp.id); if(rp){ rp.chips=gp.chips; rp.debt=gp.debt||0; } });
  broadcastGame(room,logs);

  setTimeout(()=>{
    if(!room.game) return;
    room.round=(room.round||1)+1;
    const results=game.players.map(p=>({ name:p.name, score:p._finalScore||0, chips:p.chips, status:p.status }));
    room.game=null;
    room.players.forEach(p=>{ if(p.isBot&&p.chips<=0) p.chips=100; if(!p.isBot&&p.chips<=0) p.spectating=true; });
    room.players.forEach(p=>{ if(p.pendingJoin){ p.spectating=false; p.pendingJoin=false; } });
    broadcastToRoom(room,{ type:'roundSummary', results });
    setTimeout(()=>{ if(!room.game) startGame(room); },3500);
  },4000);
}

// ── Broadcast helpers ──────────────────────────────────────
function broadcastGame(room,extraLogs=[]) {
  const game=room.game; if(!game) return;
  room.players.forEach((rp,pid)=>{
    const ws=rp.ws; if(!ws||ws.readyState!==WebSocket.OPEN) return;
    sendTo(ws,{
      type:'gameState', phase:game.phase, round:game.round, pot:game.pot,
      community:game.community, mode:game.settings.mode,
      players:game.players.map(p=>({
        id:p.id,name:p.name,isBot:p.isBot,chips:p.chips,bet:p.bet,status:p.status,
        score:handScore(p.hand,p.duckLocked),
        hand:p.hand, bustImmune:p.bustImmune,duckLocked:p.duckLocked,debt:p.debt,
        mirrorScore:p.mirrorScore,
      })),
      currentPlayerIdx:game.currentPlayerIdx,
      currentPlayerId:game.players[game.currentPlayerIdx]?.id,
      deckSize:game.deck.length, logs:extraLogs, myId:pid,
    });
  });
}

function broadcastToRoom(room,msg){ room.players.forEach(p=>{ if(p.ws&&p.ws.readyState===WebSocket.OPEN) sendTo(p.ws,msg); }); }
function broadcast(sid,msg,excl=null){ const r=servers.get(sid); if(!r) return; r.players.forEach((p,pid)=>{ if(pid===excl) return; if(p.ws&&p.ws.readyState===WebSocket.OPEN) sendTo(p.ws,msg); }); }
function sendTo(ws,msg){ if(ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

function roomSnapshot(room){
  return { id:room.id,name:room.name,hasPassword:!!room.password,ownerId:room.ownerId,
    playerCount:room.players.size,inGame:!!room.game,settings:room.settings,
    players:[...room.players.values()].map(p=>({ id:p.id,name:p.name,isBot:p.isBot,chips:p.chips,isOwner:p.id===room.ownerId,spectating:p.spectating||false,botType:p.botType })) };
}
function serverListSnapshot(){ return [...servers.values()].map(r=>({ id:r.id,name:r.name,hasPassword:!!r.password,playerCount:r.players.size,inGame:!!r.game })); }
function broadcastServerList(){ const list=serverListSnapshot(); wss.clients.forEach(ws=>{ const m=clients.get(ws); if(!m||!m.serverId) sendTo(ws,{ type:'serverList',servers:list }); }); }

// ── Connection handler ─────────────────────────────────────
wss.on('connection',ws=>{
  const playerId=uid();
  clients.set(ws,{ playerId,serverId:null,playerName:'Player' });
  sendTo(ws,{ type:'welcome',playerId,servers:serverListSnapshot() });

  ws.on('message',raw=>{
    let msg; try{ msg=JSON.parse(raw); }catch{ return; }
    const meta=clients.get(ws);
    const { playerId }=meta;
    switch(msg.type){
      case 'createServer':{
        if(!msg.name?.trim()){ sendTo(ws,{type:'error',message:'Server name required.'}); return; }
        const sid=uid();
        const settings={ mode:['blackjack','poker'].includes(msg.settings?.mode)?msg.settings.mode:'blackjack', deckCount:Math.max(1,Math.min(6,parseInt(msg.settings?.deckCount)||1)), startChips:Math.max(50,parseInt(msg.settings?.startChips)||100), minBet:Math.max(1,parseInt(msg.settings?.minBet)||5), maxBet:Math.max(10,parseInt(msg.settings?.maxBet)||100) };
        const room={ id:sid,name:msg.name.trim().slice(0,32),password:msg.password||'',ownerId:playerId,players:new Map(),game:null,round:1,settings };
        servers.set(sid,room);
        const pname=(msg.playerName||'Host').trim().slice(0,20);
        room.players.set(playerId,{ id:playerId,name:pname,ws,chips:settings.startChips,debt:0,isBot:false,spectating:false });
        meta.serverId=sid; meta.playerName=pname;
        sendTo(ws,{ type:'joinedServer',server:roomSnapshot(room),playerId });
        broadcastServerList(); break;
      }
      case 'joinServer':{
        const room=servers.get(msg.serverId);
        if(!room){ sendTo(ws,{type:'error',message:'Server not found.'}); return; }
        if(room.password&&room.password!==msg.password){ sendTo(ws,{type:'error',message:'Wrong password.'}); return; }
        if(room.players.size>=8){ sendTo(ws,{type:'error',message:'Server is full.'}); return; }
        const pname=(msg.playerName||'Player').trim().slice(0,20);
        const spectating=!!room.game;
        const chips=room.settings?.startChips||100;
        room.players.set(playerId,{ id:playerId,name:pname,ws,chips,debt:0,isBot:false,spectating,pendingJoin:spectating });
        meta.serverId=room.id; meta.playerName=pname;
        sendTo(ws,{ type:'joinedServer',server:roomSnapshot(room),playerId,spectating });
        if(room.game) broadcastGame(room,[{ msg:`👋 ${pname} joined as spectator — plays next round.`, type:'good' }]);
        broadcast(room.id,{ type:'playerJoined',player:{ id:playerId,name:pname,chips,isBot:false,spectating },server:roomSnapshot(room) },playerId);
        broadcastServerList(); break;
      }
      case 'leaveServer': handleLeave(ws,meta); break;
      case 'addBot':{
        const room=servers.get(meta.serverId);
        if(!room||room.ownerId!==playerId||room.game||room.players.size>=8) return;
        const botId=uid(),types=['simple','smart','chaotic'],botType=types[Math.floor(Math.random()*3)];
        const icons={ simple:'🤖',smart:'🧠',chaotic:'🎲' };
        const num=[...room.players.values()].filter(p=>p.isBot).length+1;
        room.players.set(botId,{ id:botId,name:`${icons[botType]} Bot${num}`,ws:null,chips:room.settings?.startChips||100,debt:0,isBot:true,botType,spectating:false });
        broadcast(room.id,{ type:'playerJoined',player:{ id:botId,name:`${icons[botType]} Bot${num}`,chips:100,isBot:true,botType },server:roomSnapshot(room) });
        broadcastServerList(); break;
      }
      case 'removeBot':{
        const room=servers.get(meta.serverId); if(!room||room.ownerId!==playerId) return;
        const bot=room.players.get(msg.botId); if(!bot||!bot.isBot) return;
        room.players.delete(msg.botId);
        broadcast(room.id,{ type:'playerLeft',playerId:msg.botId,server:roomSnapshot(room) });
        broadcastServerList(); break;
      }
      case 'startGame':{
        const room=servers.get(meta.serverId); if(!room) return;
        if(room.ownerId!==playerId){ sendTo(ws,{type:'error',message:'Only host can start.'}); return; }
        if(room.players.size<2){ sendTo(ws,{type:'error',message:'Need at least 2 players.'}); return; }
        if(room.game){ sendTo(ws,{type:'error',message:'Game already running.'}); return; }
        broadcastToRoom(room,{ type:'gameStarting' });
        startGame(room); break;
      }
      case 'updateSettings':{
        const room=servers.get(meta.serverId); if(!room||room.ownerId!==playerId||room.game) return;
        room.settings={ mode:['blackjack','poker'].includes(msg.settings?.mode)?msg.settings.mode:'blackjack', deckCount:Math.max(1,Math.min(6,parseInt(msg.settings?.deckCount)||1)), startChips:Math.max(50,parseInt(msg.settings?.startChips)||100), minBet:Math.max(1,parseInt(msg.settings?.minBet)||5), maxBet:Math.max(10,parseInt(msg.settings?.maxBet)||100) };
        broadcastToRoom(room,{ type:'settingsUpdated',settings:room.settings,server:roomSnapshot(room) }); break;
      }
      case 'placeBet':{
        const room=servers.get(meta.serverId); if(!room||!room.game||room.game.phase!=='betting') return;
        const game=room.game;
        const p=game.players.find(pl=>pl.id===playerId); if(!p||p.status!=='waiting') return;
        const amount=Math.max(game.settings.minBet||1,Math.min(parseInt(msg.bet)||game.settings.minBet||5,p.chips));
        commitBet(game,game.players.indexOf(p),amount);
        broadcastGame(room,[{ msg:`${p.name} bets ${p.bet} chips.` }]);
        checkAllBet(room); break;
      }
      case 'hit': case 'stand':{ const r=servers.get(meta.serverId); if(r&&r.game) playerAction(r,playerId,msg.type); break; }
      case 'chat':{
        const room=servers.get(meta.serverId); if(!room) return;
        const sender=room.players.get(playerId); if(!sender) return;
        broadcastToRoom(room,{ type:'chat',from:sender.name,text:String(msg.text||'').slice(0,200),id:uid() }); break;
      }
      case 'refreshServers': sendTo(ws,{ type:'serverList',servers:serverListSnapshot() }); break;
    }
  });
  ws.on('close',()=>{ const m=clients.get(ws); if(m) handleLeave(ws,m); clients.delete(ws); });
});

function handleLeave(ws,meta){
  if(!meta.serverId) return;
  const room=servers.get(meta.serverId); if(!room) return;
  room.players.delete(meta.playerId);
  meta.serverId=null;
  if(meta.playerId===room.ownerId){
    broadcastToRoom(room,{ type:'serverClosed',reason:'The host left the game.' });
    servers.delete(room.id); broadcastServerList(); return;
  }
  if(room.players.size===0){ servers.delete(room.id); }
  else {
    if(room.game){
      const gp=room.game.players.find(p=>p.id===meta.playerId);
      if(gp){ gp.status='bust';
        if(room.game.players[room.game.currentPlayerIdx]?.id===meta.playerId){ room.game.currentPlayerIdx++; tickTurn(room); }
      }
    }
    broadcast(room.id,{ type:'playerLeft',playerId:meta.playerId,server:roomSnapshot(room) });
  }
  broadcastServerList();
}

httpServer.listen(PORT,()=>console.log(`🃏 Chaos Cards v2 on port ${PORT}`));
