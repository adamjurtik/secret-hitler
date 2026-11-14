'use strict';
/*
 * Secret Hitler – online fan adaptation
 * Based on "Secret Hitler" by Mike Boxleiter, Tommy Maranges and Mac Schubert,
 * licensed CC BY-NC-SA 4.0 (https://www.secrethitler.com). This adaptation is
 * released under the same licence. No external dependencies – plain Node.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ROOM_TTL = 6 * 60 * 60 * 1000;
const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};

// liberals, ordinary fascists (Hitler is always +1)
const ROLE_TABLE = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
function powerTrack(n) {
  if (n <= 6) return [null, null, 'peek', 'execute', 'execute', null];
  if (n <= 8) return [null, 'investigate', 'special', 'execute', 'execute', null];
  return ['investigate', 'investigate', 'special', 'execute', 'execute', null];
}

// ---------- helpers ----------
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

// ---------- rooms ----------
function createRoom(mode) {
  const room = {
    code: genCode(), mode, players: [], hostId: null, boardToken: null,
    status: 'lobby', game: null, chat: [], chatSeq: 0, clients: new Map(),
    lastActive: Date.now(), nextPid: 1, gameNo: 0
  };
  rooms.set(room.code, room);
  return room;
}
function addPlayer(room, name) {
  if (room.status !== 'lobby') fail('gameRunning');
  if (room.players.length >= 10) fail('roomFull');
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

// ---------- game engine ----------
function startGame(room) {
  const n = room.players.length;
  if (n < 5) fail('notEnoughPlayers');
  if (n > 10) fail('roomFull');
  const [L, F] = ROLE_TABLE[n];
  const roles = shuffle([...Array(L).fill('liberal'), ...Array(F).fill('fascist'), 'hitler']);
  room.players.forEach((p, i) => { p.role = roles[i]; p.party = roles[i] === 'liberal' ? 'liberal' : 'fascist'; p.alive = true; });
  const first = room.players[crypto.randomInt(n)].id;
  room.gameNo++;
  room.game = {
    phase: 'roles', playerCount: n, deck: shuffle([...Array(6).fill('L'), ...Array(11).fill('F')]), discard: [],
    lib: 0, fas: 0, tracker: 0, round: 1,
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
function enact(room, card, chaos) {
  const g = room.game;
  if (card === 'L') g.lib++; else g.fas++;
  g.tracker = 0;
  g.history.push({ type: 'policy', round: g.round, card, chaos: !!chaos,
    president: chaos ? null : g.president, chancellor: chaos ? null : g.chancellor, presClaim: null, chancClaim: null });
  if (!chaos && g.lastGov) g.lastGov.histIdx = g.history.length - 1;
  pushEvent(g, { type: 'policy', card, chaos: !!chaos });
  if (g.lib >= 5) return endGame(room, 'liberal', 'policies');
  if (g.fas >= 6) return endGame(room, 'fascist', 'policies');
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
  g.hand = g.deck.splice(0, 3);
  g.lastGov = { president: g.president, chancellor: g.chancellor, histIdx: null };
  g.phase = 'legPres';
}

function act(room, actor, a) {
  const g = room.game;
  const me = actor.player;
  const host = actor.isHost;
  const type = a.type;

  // ----- lobby / meta -----
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
      const i = a.index | 0; if (i < 0 || i > 2) fail('badTarget');
      g.discard.push(g.hand.splice(i, 1)[0]);
      g.phase = 'legChanc'; return;
    }
    case 'chancEnact': {
      if (g.phase !== 'legChanc' || me.id !== g.chancellor) fail('notAllowed');
      const i = a.index | 0; if (i < 0 || i > 1) fail('badTarget');
      const card = g.hand[i]; g.discard.push(g.hand[1 - i]); g.hand = [];
      enact(room, card, false);
      if (room.status !== 'playing') return;
      if (card === 'F') {
        const pw = powerTrack(g.playerCount)[g.fas - 1];
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
        g.vetoRefused = true; g.phase = 'legChanc';
        pushEvent(g, { type: 'vetoRefused' });
      }
      return;
    }
    case 'power': {
      if (g.phase !== 'power' || me.id !== g.president || g.power === 'peek') fail('notAllowed');
      const t = P(room, a.target);
      if (!t || !t.alive || t.id === me.id) fail('badTarget');
      if (g.power === 'investigate') {
        if (g.investigated.includes(t.id)) fail('alreadyInvestigated');
        g.investigated.push(t.id);
        (g.priv[me.id] = g.priv[me.id] || []).push({ type: 'investigate', target: t.id, party: t.party, round: g.round });
        g.history.push({ type: 'investigate', round: g.round, president: me.id, target: t.id });
        pushEvent(g, { type: 'investigate', president: me.id, target: t.id });
        g.phase = 'powerAck'; return;
      }
      if (g.power === 'special') {
        g.history.push({ type: 'special', round: g.round, president: me.id, target: t.id });
        pushEvent(g, { type: 'special', president: me.id, target: t.id });
        g.specialNext = t.id; beginElection(room); return;
      }
      if (g.power === 'execute') {
        t.alive = false;
        g.history.push({ type: 'execute', round: g.round, president: me.id, target: t.id });
        pushEvent(g, { type: 'execute', target: t.id });
        if (t.role === 'hitler') return endGame(room, 'liberal', 'hitlerKilled');
        beginElection(room); return;
      }
      fail('notAllowed');
    }
    case 'powerAck': {
      if (me.id !== g.president) fail('notAllowed');
      if (g.phase === 'power' && g.power === 'peek') {
        g.history.push({ type: 'peek', round: g.round, president: me.id });
        pushEvent(g, { type: 'peek', president: me.id });
        beginElection(room); return;
      }
      if (g.phase === 'powerAck') { beginElection(room); return; }
      fail('notAllowed');
    }
    case 'claim': {
      const lg = g.lastGov; if (!lg || lg.histIdx == null) fail('notAllowed');
      const h = g.history[lg.histIdx];
      const c = String(a.cards || '').toUpperCase();
      if (me.id === lg.president && !h.presClaim && /^[LF]{3}$/.test(c)) h.presClaim = c.split('').sort().join('');
      else if (me.id === lg.chancellor && !h.chancClaim && /^[LF]{2}$/.test(c)) h.chancClaim = c.split('').sort().join('');
      else fail('notAllowed');
      return;
    }
  }
  fail('unknownAction');
}

// ---------- per-client view (hides secrets) ----------
function view(room, tok) {
  const w = who(room, tok);
  const g = room.game;
  const me = w && w.player;
  const v = {
    code: room.code, mode: room.mode, status: room.status, gameNo: room.gameNo,
    isBoard: !!(w && w.board), isHost: !!(w && w.isHost), hostId: room.hostId,
    me: me ? { id: me.id, name: me.name } : null,
    players: room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive, online: (room.clients.get(p.token) || new Set()).size > 0 })),
    boardOnline: room.boardToken ? (room.clients.get(room.boardToken) || new Set()).size > 0 : null,
    chat: room.chat.slice(-80)
  };
  if (!g) return v;
  const ended = g.phase === 'ended';
  v.game = {
    phase: g.phase, playerCount: g.playerCount, powers: powerTrack(g.playerCount),
    lib: g.lib, fas: g.fas, tracker: g.tracker, round: g.round,
    deckCount: g.deck.length, discardCount: g.discard.length,
    presidentId: g.presidentId, nominee: g.nominee, president: g.president, chancellor: g.chancellor,
    lastPres: g.lastPres, lastChanc: g.lastChanc, voted: Object.keys(g.votes), power: g.power,
    vetoUnlocked: g.fas >= 5, vetoRefused: g.vetoRefused, investigated: g.investigated,
    notHitler: g.notHitler, ready: Object.keys(g.ready), history: g.history,
    events: g.events, eventSeq: g.eventSeq, winner: g.winner, reason: g.reason,
    eligible: g.phase === 'nominate' ? eligibleChancellors(room) : [],
    lastGov: g.lastGov
  };
  if (ended) v.game.roles = Object.fromEntries(room.players.map(p => [p.id, p.role]));
  if (me && !ended) {
    const n = g.playerCount;
    const priv = { role: me.role, party: me.party, known: {}, myVote: g.phase === 'vote' && me.id in g.votes ? g.votes[me.id] : null, results: g.priv[me.id] || [] };
    if (me.role === 'fascist' || (me.role === 'hitler' && n <= 6)) {
      room.players.forEach(p => { if (p.id !== me.id && p.role !== 'liberal') priv.known[p.id] = p.role; });
    }
    if ((g.phase === 'legPres' && me.id === g.president) || ((g.phase === 'legChanc' || g.phase === 'veto') && (me.id === g.chancellor || me.id === g.president))) priv.hand = g.hand;
    if (g.phase === 'power' && g.power === 'peek' && me.id === g.president) priv.peek = g.peek;
    v.private = priv;
  } else if (me && ended) {
    v.private = { role: me.role, party: me.party, known: {}, results: g.priv[me.id] || [] };
  }
  return v;
}

// ---------- realtime (Server-Sent Events) ----------
function send(res, obj) { res.write('data: ' + JSON.stringify(obj) + '\n\n'); }
function broadcast(room) {
  room.lastActive = Date.now();
  for (const [tok, set] of room.clients) {
    if (!who(room, tok)) continue;
    const v = view(room, tok);
    for (const res of set) send(res, v);
  }
}
function closeClients(room, tok, reason) {
  const set = room.clients.get(tok);
  if (set) for (const res of set) { send(res, { closed: reason }); res.end(); }
  room.clients.delete(tok);
}
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    for (const set of room.clients.values()) for (const res of set) res.write(': ping\n\n');
    if (now - room.lastActive > ROOM_TTL) {
      for (const set of room.clients.values()) for (const res of set) res.end();
      rooms.delete(code);
    }
  }
}, 25000).unref();

// ---------- HTTP ----------
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 8192) { reject(new GameError('tooLarge')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new GameError('badJson')); } });
  });
}
function getRoom(code) {
  const room = rooms.get(String(code || '').toUpperCase().trim());
  if (!room) fail('noRoom');
  return room;
}

async function api(req, res, url) {
  const route = url.pathname;
  if (req.method === 'POST' && route === '/api/create') {
    const b = await readBody(req);
    const mode = b.mode === 'board' ? 'board' : 'personal';
    if (mode === 'personal') cleanName(b.name);
    const room = createRoom(mode);
    let tok;
    if (mode === 'board') { room.boardToken = tok = token(); room.hostId = 'board'; }
    else { const p = addPlayer(room, b.name); room.hostId = p.id; tok = p.token; }
    return json(res, 200, { code: room.code, token: tok });
  }
  if (req.method === 'POST' && route === '/api/join') {
    const b = await readBody(req);
    const room = getRoom(b.code);
    const p = addPlayer(room, b.name);
    sysChat(room, 'sysJoined', { name: p.name });
    broadcast(room);
    return json(res, 200, { code: room.code, token: p.token });
  }
  if (req.method === 'GET' && route === '/api/check') {
    const room = rooms.get(String(url.searchParams.get('code') || '').toUpperCase());
    return json(res, 200, { ok: !!(room && who(room, url.searchParams.get('token'))) });
  }
  if (req.method === 'GET' && route === '/api/stream') {
    const room = getRoom(url.searchParams.get('code'));
    const tok = url.searchParams.get('token');
    if (!who(room, tok)) fail('badToken');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    if (!room.clients.has(tok)) room.clients.set(tok, new Set());
    const set = room.clients.get(tok);
    const wasOffline = set.size === 0;
    set.add(res);
    if (wasOffline) broadcast(room); else send(res, view(room, tok));
    req.on('close', () => {
      set.delete(res);
      if (set.size === 0) { room.clients.delete(tok); if (rooms.has(room.code)) broadcast(room); }
    });
    return;
  }
  if (req.method === 'POST' && route === '/api/action') {
    const b = await readBody(req);
    const room = getRoom(b.code);
    const w = who(room, b.token);
    if (!w) fail('badToken');
    act(room, w, b.action || {});
    broadcast(room);
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'notFound' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    try { await api(req, res, url); }
    catch (e) {
      if (e instanceof GameError) json(res, 400, { error: e.message });
      else { console.error(e); json(res, 500, { error: 'server' }); }
    }
    return;
  }
  serveStatic(req, res, url);
});

if (require.main === module) {
  server.listen(PORT, () => console.log('Secret Hitler server on http://localhost:' + PORT));
}
module.exports = { server, rooms, act, view, startGame, beginElection, eligibleChancellors, powerTrack };
