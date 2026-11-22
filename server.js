'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
const ROOM_TTL = 6 * 60 * 60 * 1000;
const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};

const ROLE_TABLE_CLASSIC = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };

const EXPANSION_ROLE_TABLE = {
  6:  { hitler: 1, fašisti: 1, grandma: 0, liberal: 2, kitten: 0, otto: 1, komunista: 1, smuggler: 0, monarchista: 0, anarchista: 0, kapitalista: 0 },
  7:  { hitler: 1, fašisti: 1, grandma: 0, liberal: 3, kitten: 0, otto: 1, komunista: 1, smuggler: 0, monarchista: 0, anarchista: 0, kapitalista: 0 },
  8:  { hitler: 1, fašisti: 2, grandma: 0, liberal: 3, kitten: 0, otto: 1, komunista: 1, smuggler: 0, monarchista: 0, anarchista: 0, kapitalista: 0 },
  9:  { hitler: 1, fašisti: 1, grandma: 1, liberal: 3, kitten: 0, otto: 1, komunista: 1, smuggler: 1, monarchista: 0, anarchista: 0, kapitalista: 0 },
  10: { hitler: 1, fašisti: 1, grandma: 1, liberal: 3, kitten: 1, otto: 1, komunista: 1, smuggler: 1, monarchista: 0, anarchista: 0, kapitalista: 0 },
  11: { hitler: 1, fašisti: 1, grandma: 1, liberal: 4, kitten: 1, otto: 1, komunista: 1, smuggler: 1, monarchista: 0, anarchista: 0, kapitalista: 0 },
  12: { hitler: 1, fašisti: 1, grandma: 1, liberal: 4, kitten: 1, otto: 1, komunista: 1, smuggler: 1, monarchista: 1, anarchista: 0, kapitalista: 0 },
  13: { hitler: 1, fašisti: 1, grandma: 1, liberal: 4, kitten: 1, otto: 1, komunista: 2, smuggler: 1, monarchista: 1, anarchista: 0, kapitalista: 0 },
  14: { hitler: 1, fašisti: 1, grandma: 1, liberal: 5, kitten: 1, otto: 1, komunista: 2, smuggler: 1, monarchista: 1, anarchista: 1, kapitalista: 0 },
  15: { hitler: 1, fašisti: 1, grandma: 1, liberal: 5, kitten: 1, otto: 1, komunista: 3, smuggler: 1, monarchista: 1, anarchista: 1, kapitalista: 0 },
  16: { hitler: 1, fašisti: 1, grandma: 1, liberal: 5, kitten: 1, otto: 1, komunista: 3, smuggler: 1, monarchista: 1, anarchista: 1, kapitalista: 1 },
  17: { hitler: 1, fašisti: 2, grandma: 1, liberal: 5, kitten: 1, otto: 1, komunista: 3, smuggler: 1, monarchista: 1, anarchista: 1, kapitalista: 1 },
  18: { hitler: 1, fašisti: 2, grandma: 1, liberal: 6, kitten: 1, otto: 1, komunista: 3, smuggler: 1, monarchista: 1, anarchista: 1, kapitalista: 1 },
  19: { hitler: 1, fašisti: 2, grandma: 1, liberal: 6, kitten: 1, otto: 1, komunista: 3, smuggler: 1, monarchista: 1, anarchista: 1, kapitalista: 1 },
  20: { hitler: 1, fašisti: 2, grandma: 1, liberal: 6, kitten: 2, otto: 1, komunista: 3, smuggler: 1, monarchista: 1, anarchista: 1, kapitalista: 1 }
};

function getExpansionRolesArray(n) {
  const spec = EXPANSION_ROLE_TABLE[n] || EXPANSION_ROLE_TABLE[10];
  let arr = [];
  for (let [role, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) arr.push(role);
  }
  return arr;
}

function powerTrack(n, mode) {
  if (mode === 'expansion') return [null, 'investigate', 'special', 'execute', 'execute', null];
  if (n <= 6) return [null, null, 'peek', 'execute', 'execute', null];
  if (n <= 8) return [null, 'investigate', 'special', 'execute', 'execute', null];
  return ['investigate', 'investigate', 'special', 'execute', 'execute', null];
}

class GameError extends Error {}
const fail = (code) => { throw new GameError(code); };
const token = () => crypto.randomBytes(18).toString('base64url');
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)]; } while (rooms.has(c));
  return c;
}
function cleanName(n) {
  n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18);
  if (!n) fail('nameRequired');
  return n;
}

function createRoom(mode, subMode) {
  const room = {
    code: genCode(), mode, subMode: subMode || 'classic', players: [], hostId: null, boardToken: null,
    status: 'lobby', game: null, chat: [], chatSeq: 0, clients: new Map(),
    lastActive: Date.now(), nextPid: 1, gameNo: 0
  };
  rooms.set(room.code, room);
  return room;
}
function addPlayer(room, name) {
  if (room.status !== 'lobby') fail('gameRunning');
  const maxLimit = room.subMode === 'expansion' ? 20 : 10;
  if (room.players.length >= maxLimit) fail('roomFull');
  name = cleanName(name);
  if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) fail('nameTaken');
  const p = { id: 'p' + room.nextPid++, token: token(), name, alive: true, role: null, party: null };
  room.players.push(p);
  return p;
}
function who(room, tok) {
  if (!tok) return null;
  if (room.boardToken && tok === room.boardToken) return { board: true, isHost: room.hostId === 'board' };
  const p = room.players.find(x => x.token === tok);
  return p ? { player: p, isHost: room.hostId === p.id } : null;
}
const P = (room, id) => room.players.find(p => p.id === id);
const alive = (room) => room.players.filter(p => p.alive);
function nextAliveAfter(room, id) {
  const ps = room.players; const i = ps.findIndex(p => p.id === id);
  for (let k = 1; k <= ps.length; k++) { const p = ps[(i + k) % ps.length]; if (p.alive) return p.id; }
  return null;
}
function sysChat(room, key, params) {
  room.chat.push({ id: ++room.chatSeq, sys: key, params: params || {}, t: Date.now() });
  if (room.chat.length > 200) room.chat.shift();
}

function startGame(room) {
  const n = room.players.length;
  const minP = room.subMode === 'expansion' ? 6 : 5;
  const maxP = room.subMode === 'expansion' ? 20 : 10;
  if (n < minP) fail('notEnoughPlayers');
  if (n > maxP) fail('roomFull');
  
  let roles = [];
  if (room.subMode === 'expansion') {
    roles = shuffle(getExpansionRolesArray(n));
  } else {
    const [L, F] = ROLE_TABLE_CLASSIC[n];
    roles = shuffle([...Array(L).fill('liberal'), ...Array(F).fill('fascist'), 'hitler']);
  }

  room.players.forEach((p, i) => { 
    p.role = roles[i]; 
    if (['liberal', 'kitten', 'otto'].includes(roles[i])) p.party = 'liberal';
    else if (['komunista', 'smuggler', 'rote_kapelle'].includes(roles[i])) p.party = 'komunista';
    else if (roles[i] === 'kapitalista') p.party = 'dual';
    else p.party = 'fascist';
    p.alive = true; 
  });

  const first = room.players[crypto.randomInt(n)].id;
  room.gameNo++;

  let deckCards = [...Array(6).fill('L'), ...Array(11).fill('F')];
  if (room.subMode === 'expansion') {
    deckCards = deckCards.concat(['K', 'K', 'K', 'A', 'A']); 
  }

  room.game = {
    phase: 'roles', playerCount: n, subMode: room.subMode, deck: shuffle(deckCards), discard: [],
    lib: 0, fas: 0, kom: 0, an: 0, tracker: 0, round: 1,
    rotationBase: first, presidentId: first, specialNext: null, nominee: null,
    president: null, chancellor: null, lastPres: null, lastChanc: null,
    votes: {}, hand: [], vetoRefused: false, power: null, peek: null,
    investigated: [], ready: {}, history: [], priv: {}, notHitler: [],
    lastGov: null, events: [], eventSeq: 0, winner: null, reason: null
  };
  room.status = 'playing';
  sysChat(room, 'sysStart', { n });
}

function pushEvent(g, e) {
  g.events.push({ ...e, seq: ++g.eventSeq });
  if (g.events.length > 12) g.events.shift();
}
function ensureDeck(g) {
  if (g.deck.length < 3) { g.deck = shuffle(g.deck.concat(g.discard)); g.discard = []; }
}
function beginElection(room, first) {
  const g = room.game;
  if (!first) {
    if (g.specialNext) { g.presidentId = g.specialNext; g.specialNext = null; }
    else { g.rotationBase = nextAliveAfter(room, g.rotationBase); g.presidentId = g.rotationBase; }
    g.round++;
  }
  Object.assign(g, { phase: 'nominate', nominee: null, votes: {}, president: null, chancellor: null,
    hand: [], vetoRefused: false, power: null, peek: null });
}
function eligibleChancellors(room) {
  const g = room.game; const al = alive(room);
  return al.filter(p => p.id !== g.presidentId && p.id !== g.lastChanc && !(al.length > 5 && p.id === g.lastPres)).map(p => p.id);
}
function endGame(room, winner, reason) {
  const g = room.game;
  Object.assign(g, { phase: 'ended', winner, reason, hand: [], peek: null });
  room.status = 'ended';
  pushEvent(g, { type: 'end', winner, reason });
}
function enact(room, card, chaosFlag) {
  const g = room.game;
  if (card === 'L') g.lib++; 
  else if (card === 'F') g.fas++;
  else if (card === 'K') g.kom++;
  else if (card === 'A') g.an++;

  g.tracker = 0;
  g.history.push({ type: 'policy', round: g.round, card, chaos: !!chaosFlag,
    president: chaosFlag ? null : g.president, chancellor: chaosFlag ? null : g.chancellor, presClaim: null, chancClaim: null });
  if (!chaosFlag && g.lastGov) g.lastGov.histIdx = g.history.length - 1;
  pushEvent(g, { type: 'policy', card, chaos: !!chaosFlag });
  
  if (g.lib >= 5) return endGame(room, 'liberal', 'policies');
  if (g.fas >= 6) return endGame(room, 'fascist', 'policies');
  if (g.subMode === 'expansion' && g.kom >= 5) return endGame(room, 'komunista', 'policies');
  ensureDeck(g);
}
function chaos(room) {
  const g = room.game;
  ensureDeck(g);
  const card = g.deck.shift();
  g.lastPres = null; g.lastChanc = null;
  enact(room, card, true);
  if (room.status === 'playing') beginElection(room);
}
function failedGovernment(room) {
  const g = room.game;
  g.tracker++;
  if (g.tracker >= 3) chaos(room); else beginElection(room);
}
function tally(room) {
  const g = room.game; const al = alive(room);
  if (al.some(p => !(p.id in g.votes))) return;
  const ja = al.filter(p => g.votes[p.id]).length;
  const passed = ja > al.length / 2;
  const rec = { round: g.round, president: g.presidentId, chancellor: g.nominee, votes: { ...g.votes }, passed, ja, nein: al.length - ja };
  g.history.push({ type: 'election', ...rec });
  pushEvent(g, { type: 'vote', ...rec });
  if (!passed) return failedGovernment(room);
  g.president = g.presidentId; g.chancellor = g.nominee;
  g.lastPres = g.president; g.lastChanc = g.chancellor;
  const ch = P(room, g.chancellor);
  if (g.fas >= 3) {
    if (ch.role === 'hitler') return endGame(room, 'fascist', 'hitlerElected');
    if (!g.notHitler.includes(ch.id)) g.notHitler.push(ch.id);
  }
  ensureDeck(g);
  let drawCount = 3;
  g.hand = g.deck.splice(0, drawCount);
  g.lastGov = { president: g.president, chancellor: g.chancellor, histIdx: null };
  g.phase = 'legPres';
}

function act(room, actor, a) {
  const g = room.game;
  const me = actor.player;
  const host = actor.isHost;
  const type = a.type;

  if (type === 'chat') {
    if (!me) fail('notAllowed');
    if (room.status === 'playing' && !me.alive) fail('deadNoSpeak');
    const text = String(a.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 300);
    if (!text) return;
    room.chat.push({ id: ++room.chatSeq, pid: me.id, text, t: Date.now() });
    if (room.chat.length > 200) room.chat.shift();
    return;
  }
  if (type === 'start') {
    if (!host) fail('hostOnly');
    if (room.status === 'playing') fail('gameRunning');
    room.players.forEach(p => { p.alive = true; });
    startGame(room); return;
  }
  if (type === 'kick') {
    if (!host) fail('hostOnly');
    if (room.status === 'playing') fail('gameRunning');
    const t = P(room, a.target); if (!t || t.id === room.hostId) fail('badTarget');
    room.players = room.players.filter(p => p !== t);
    closeClients(room, t.token, 'kicked');
    sysChat(room, 'sysKicked', { name: t.name });
    return;
  }
  if (type === 'leave') {
    if (!me) fail('notAllowed');
    if (room.status === 'playing') fail('gameRunning');
    room.players = room.players.filter(p => p !== me);
    if (room.hostId === me.id) room.hostId = room.players[0] ? room.players[0].id : null;
    closeClients(room, me.token, 'left');
    sysChat(room, 'sysLeft', { name: me.name });
    return;
  }
  if (type === 'closeRoom') {
    if (!host) fail('hostOnly');
    for (const tok of [...room.clients.keys()]) closeClients(room, tok, 'roomClosed');
    rooms.delete(room.code);
    return;
  }
  if (type === 'newGame') {
    if (!host) fail('hostOnly');
    if (room.status !== 'ended') fail('notAllowed');
    room.status = 'lobby'; room.game = null;
    room.players.forEach(p => { p.alive = true; p.role = null; p.party = null; });
    return;
  }

  if (room.status !== 'playing' || !g) fail('notAllowed');

  if (type === 'forceContinue') {
    if (!host || g.phase !== 'roles') fail('notAllowed');
    beginElection(room, true); return;
  }
  if (!me) fail('notAllowed');
  if (!me.alive) fail('dead');
  const isPres = me.id === g.presidentId;

  switch (type) {
    case 'ackRole': {
      if (g.phase !== 'roles') fail('notAllowed');
      g.ready[me.id] = true;
      if (room.players.every(p => g.ready[p.id])) beginElection(room, true);
      return;
    }
    case 'nominate': {
      if (g.phase !== 'nominate' || !isPres) fail('notAllowed');
      if (!eligibleChancellors(room).includes(a.target)) fail('ineligible');
      g.nominee = a.target; g.votes = {}; g.phase = 'vote';
      return;
    }
    case 'vote': {
      if (g.phase !== 'vote') fail('notAllowed');
      g.votes[me.id] = !!a.ja;
      tally(room); return;
    }
    case 'presDiscard': {
      if (g.phase !== 'legPres' || me.id !== g.president) fail('notAllowed');
      const i = a.index | 0; if (i < 0 || i >= g.hand.length) fail('badTarget');
      g.discard.push(g.hand.splice(i, 1)[0]);
      g.phase = 'legChanc'; return;
    }
    case 'chancEnact': {
      if (g.phase !== 'legChanc' || me.id !== g.chancellor) fail('notAllowed');
      const i = a.index | 0; if (i < 0 || i >= g.hand.length) fail('badTarget');
      const card = g.hand[i];
      g.hand.splice(i, 1);
      g.discard.push(...g.hand); 
      g.hand = [];
      enact(room, card, false);
      if (room.status !== 'playing') return;
      if (card === 'F') {
        const pw = powerTrack(g.playerCount, g.subMode)[g.fas - 1];
        if (pw) {
          g.power = pw; g.phase = 'power';
          if (pw === 'peek') g.peek = g.deck.slice(0, 3);
          return;
        }
      }
      beginElection(room); return;
    }
    case 'vetoRequest': {
      if (g.phase !== 'legChanc' || me.id !== g.chancellor || g.fas < 5 || g.vetoRefused) fail('notAllowed');
      g.phase = 'veto'; return;
    }
    case 'vetoAnswer': {
      if (g.phase !== 'veto' || me.id !== g.president) fail('notAllowed');
      if (a.agree) {
        g.discard.push(...g.hand); g.hand = [];
        g.history.push({ type: 'veto', round: g.round, president: g.president, chancellor: g.chancellor });
        pushEvent(g, { type: 'veto' });
        ensureDeck(g);
        failedGovernment(room);
      } else {
        g.
