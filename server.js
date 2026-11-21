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
// Works both with files in ./public and with all files flattened next to server.js
const PUBLIC = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
const ROOM_TTL = 6 * 60 * 60 * 1000;
const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};

// liberals, ordinary fascists (Hitler is always +1)
const ROLE_TABLE = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
const EXTENSION_DEFAULTS = { communists: false, capitalist: false, anarchist: false, monarchist: false, antiPolicies: false, emergencyPowers: false, extendedLiberalTrack: false };
const ROLE_KEYS = ['liberal', 'fascist', 'hitler', 'communist', 'capitalist', 'anarchist', 'monarchist'];
const EXTENSION_LABELS = { communists: 'Komunisté', capitalist: 'Kapitalista', anarchist: 'Anarchista', monarchist: 'Monarchista / Diktátor', antiPolicies: 'Proti-politiky', emergencyPowers: 'Nouzové pravomoci', extendedLiberalTrack: 'Prodloužená liberální stupnice' };
// Suggested base-game distributions for 11–20 are editable host defaults, not XL-official ratios.
function recommendedRoles(n, extensions = {}) {
  if (extensions.communists) {
    const xl = {
      6:[3,1,1], 7:[4,1,1], 8:[4,2,1], 9:[4,2,2], 10:[5,2,2],
      11:[5,3,2], 12:[6,3,2], 13:[6,3,3], 14:[7,3,3], 15:[7,4,3], 16:[7,4,4]
    };
    const experimental = {17:[8,4,4],18:[8,4,5],19:[9,4,5],20:[9,5,5]};
    const row=xl[n]||experimental[n]||(n===5?[2,1,1]:null);
    if(row)return {liberal:row[0],fascist:row[1],hitler:1,communist:row[2],capitalist:0,anarchist:0,monarchist:0};
  }
  if (ROLE_TABLE[n]) return { liberal: ROLE_TABLE[n][0], fascist: ROLE_TABLE[n][1], hitler: 1, communist:0, capitalist:0, anarchist:0, monarchist:0 };
  const fascist = Math.min(5, Math.max(3, Math.floor((n - 1) / 4)));
  return { liberal: n - fascist - 1, fascist, hitler: 1, communist:0, capitalist:0, anarchist:0, monarchist:0 };
}
function validRoleCounts(counts, n, extensions = {}) {
  if (!counts || !ROLE_KEYS.every(k => Number.isInteger(counts[k] ?? 0) && (counts[k] ?? 0) >= 0)) return false;
  if (counts.liberal < 1 || counts.fascist < 1 || counts.hitler !== 1) return false;
  if ((counts.communist || 0) > 0 && !extensions.communists) return false;
  if ((counts.capitalist || 0) > 0 && !extensions.capitalist) return false;
  if ((counts.anarchist || 0) > 0 && !extensions.anarchist) return false;
  if ((counts.monarchist || 0) > 0 && !extensions.monarchist) return false;
  if (extensions.communists && counts.communist < 1) return false;
  if ((counts.capitalist || 0) > 1 || (counts.anarchist || 0) > 1 || (counts.monarchist || 0) > 1) return false;
  return ROLE_KEYS.reduce((sum, k) => sum + (counts[k] || 0), 0) === n;
}
function normalizedRoleCounts(counts) { const out = {}; for (const k of ROLE_KEYS) out[k] = Number(counts && counts[k]) || 0; return out; }
function powerTrack(n) {
  if (n <= 6) return [null, null, 'peek', 'execute', 'execute', null];
  if (n <= 8) return [null, 'investigate', 'special', 'execute', 'execute', null];
  return ['investigate', 'investigate', 'special', 'execute', 'execute', null];
}
function communistPowerTrack(n) {
  if (n <= 8) return ['bugging', 'radicalisation', 'fiveYearPlan', 'congress'];
  if (n <= 10) return ['bugging', 'radicalisation', 'fiveYearPlan', 'congress', 'confession'];
  return [null, 'radicalisation', 'fiveYearPlan', 'radicalisation', 'confession'];
}
function shuffleDeck(a) { return shuffle(a); }
function makePolicyDeck(n, ex, roleCounts = {}) {
  const deck = [...Array(6).fill('L'), ...Array(11).fill('F')];
  if (ex.communists) {
    // XL specifies 8C/5L/10F (8 players: 8C/6L/9F).
    deck.length = 0;
    deck.push(...Array(n === 8 ? 6 : 5).fill('L'), ...Array(n === 8 ? 9 : 10).fill('F'), ...Array(8).fill('C'));
  }
  if (ex.anarchist && (roleCounts.anarchist === undefined || roleCounts.anarchist > 0)) {
    if (ex.communists) {
      const i = deck.lastIndexOf('C'); if (i >= 0) deck.splice(i, 1);
      deck.push('A');
      const j = deck.lastIndexOf('C'); if (j >= 0) deck.splice(j, 1);
      deck.push('A');
    } else deck.push('A','A','A');
  }
  if (ex.antiPolicies) { const ci=deck.lastIndexOf('C'), fi=deck.lastIndexOf('F'), li=deck.lastIndexOf('L'); if(ci>=0)deck[ci]='AC'; if(fi>=0)deck[fi]='AF'; if(li>=0)deck[li]='SD'; }
  return shuffleDeck(deck);
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
    status: 'lobby', game: null, settings: { roleCounts: null, extensions: { ...EXTENSION_DEFAULTS } }, chat: [], chatSeq: 0, clients: new Map(),
    lastActive: Date.now(), nextPid: 1, gameNo: 0
  };
  rooms.set(room.code, room);
  return room;
}
function addPlayer(room, name) {
  if (room.status !== 'lobby') fail('gameRunning');
  if (room.players.length >= 20) fail('roomFull');
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
  if (n > 20) fail('roomFull');
  const counts = normalizedRoleCounts(room.settings.roleCounts || recommendedRoles(n, room.settings.extensions));
  if (!validRoleCounts(counts, n, room.settings.extensions)) fail('invalidRoleCounts');
  if ((room.settings.extensions.capitalist || room.settings.extensions.antiPolicies) && !room.settings.extensions.communists) fail('extensionDependency');
  room.gameNo++;
  room.game = {
    phase: 'predeal', playerCount: n, roleCounts: counts, extensions: { ...room.settings.extensions },
    deck: [], discard: [], lib: 0, fas: 0, comm: 0, anarch: 0, tracker: 0, round: 1,
    rotationBase: null, presidentId: null, specialNext: null, nominee: null,
    president: null, chancellor: null, lastPres: null, lastChanc: null,
    votes: {}, hand: [], vetoRefused: false, power: null, peek: null,
    investigated: [], ready: {}, history: [], priv: {}, notHitler: [], initialCommunists: [], newlyConverted: [],
    commPowerUsed: [], skipNextCommPower: false, skipNextFascistPower: false, markedForExecution: null, emergencyDeck: [],
    liberalTarget: (room.settings.extensions.extendedLiberalTrack || n > 10) ? 6 : 5, commTarget: n <= 8 ? 5 : 6,
    lastGov: null, events: [], eventSeq: 0, winner: null, reason: null
  };
  room.players.forEach(p => { p.role = null; p.party = null; p.alive = true; });
  room.status = 'playing';
  sysChat(room, 'sysStart', { n });
}
function dealRoles(room) {
  const g = room.game;
  if (!g || g.phase !== 'predeal') fail('notAllowed');
  const c = g.roleCounts;
  const roles = shuffle([
    ...Array(c.liberal).fill('liberal'), ...Array(c.fascist).fill('fascist'), 'hitler',
    ...Array(c.communist).fill('communist'), ...Array(c.capitalist).fill('capitalist'),
    ...Array(c.anarchist).fill('anarchist'), ...Array(c.monarchist).fill('monarchist')
  ]);
  room.players.forEach((p, i) => {
    p.role = roles[i];
    p.party = p.role === 'liberal' ? 'liberal' : p.role === 'communist' ? 'communist' : p.role === 'anarchist' ? (g.extensions.communists ? 'communist' : 'anarchist') : p.role === 'capitalist' ? 'capitalist' : 'fascist';
    p.alive = true;
  });
  const first = room.players[crypto.randomInt(room.players.length)].id;
  g.deck = makePolicyDeck(g.playerCount, g.extensions, g.roleCounts);
  g.initialCommunists = room.players.filter(p => p.party === 'communist').map(p => p.id);
  if (g.extensions.emergencyPowers) {
    const extra = Math.max(0, g.playerCount - 10) + (g.extensions.communists && g.playerCount > 13 ? 2 * (g.playerCount - 13) : 0);
    const total = Math.min(6, extra);
    const emergencyCards = [
      ...shuffle(['propaganda','policyPeek','impeachment','marked','execution','pardon']).slice(0,3).map(power=>({type:'article48',power})),
      ...shuffle(['propaganda','policyPeek','impeachment','marked','execution','voteNoConfidence']).slice(0,3).map(power=>({type:'enablingAct',power}))
    ];
    g.emergencyDeck = shuffle(emergencyCards).slice(0,total);
  }
  g.rotationBase = first; g.presidentId = first; g.phase = 'roles';
  pushEvent(g, { type: 'dealt' });
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
  return al.filter(p => p.id !== g.presidentId && p.id !== g.lastChanc && p.role !== 'dictator' && !(al.length > 5 && p.id === g.lastPres)).map(p => p.id);
}
function endGame(room, winner, reason) {
  const g = room.game;
  const hasCommunists = (g.roleCounts && g.roleCounts.communist > 0) || (g.extensions && g.extensions.communists && room.players.some(p=>p.party==='communist'));
  const hasAnarchist = (g.roleCounts && g.roleCounts.anarchist > 0) || room.players.some(p=>p.role==='anarchist');
  const hasCapitalist = (g.roleCounts && g.roleCounts.capitalist > 0) || room.players.some(p=>p.role==='capitalist');
  let winners = winner === 'coalition' ? ['liberal', ...(hasCommunists ? ['communist'] : []), ...(hasAnarchist ? ['anarchist'] : [])] : winner === 'communistAnarchist' ? ['communist','anarchist'] : [winner];
  if (hasCapitalist && winner !== 'communist' && winner !== 'anarchist' && winner !== 'communistAnarchist' && winner !== 'coalition') winners = [...winners, 'capitalist'];
  Object.assign(g, { phase: 'ended', winner, winners, reason, hand: [], peek: null });
  room.status = 'ended';
  pushEvent(g, { type: 'end', winner, reason });
}
function checkPolicyVictory(room) {
  const g=room.game;
  if (g.lib >= (g.liberalTarget || 5)) { endGame(room,'liberal','policies'); return true; }
  if (g.fas >= 6) { endGame(room,'fascist','policies'); return true; }
  if (g.comm >= (g.commTarget || 0) && g.extensions.communists) {
    if (g.extensions.anarchist && g.roleCounts && g.roleCounts.anarchist > 0 && g.anarch >= 2) endGame(room,'communistAnarchist','communistPolicies');
    else endGame(room,'communist','policies');
    return true;
  }
  return false;
}
function enact(room, card, chaos) {
  const g = room.game;
  const actor = g.president;
  const record = (track, type) => g.history.push({ type: 'policy', track, card, round: g.round, chaos: !!chaos, president: chaos ? null : g.president, chancellor: chaos ? null : g.chancellor, presClaim: null, chancClaim: null });
  if (card === 'L') {
    g.lib++; record('liberal','policy'); pushEvent(g,{type:'policy',card,track:'liberal',chaos:!!chaos});
  } else if (card === 'F') {
    g.fas++; record('fascist','policy'); pushEvent(g,{type:'policy',card,track:'fascist',chaos:!!chaos});
    if (g.markedForExecution && g.fas - g.markedForExecution.atFas >= 3) { const marked=P(room,g.markedForExecution.id); g.markedForExecution=null; if(marked&&marked.alive) { executePlayer(room, marked, 'markedExecution'); if (room.status !== 'playing') return; } }
  } else if (card === 'C') {
    g.comm++; record('communist','policy'); pushEvent(g,{type:'policy',card,track:'communist',chaos:!!chaos});
  } else if (card === 'A') {
    if (g.extensions.communists) {
      g.comm++; g.anarch++; record('communist','policy'); pushEvent(g,{type:'policy',card,track:'communist',anarchist:true,chaos:!!chaos});
    } else {
      record('anarchist','policy'); pushEvent(g,{type:'policy',card,track:'anarchist',chaos:!!chaos});
      if (chaos) { g.deck.push('A'); shuffle(g.deck); g.tracker = 3; return endGame(room,'anarchist','anarchistPolicy'); }
      g.deck.push('A'); shuffle(g.deck);
    }
  } else if (card === 'AC') {
    g.fas++; record('fascist','antiCommunist'); pushEvent(g,{type:'antiPolicy',card,track:'fascist'});
    if (g.comm > 0) g.comm--; g.skipNextCommPower = true;
    if (checkPolicyVictory(room)) return;
    const pw = powerTrack(g.playerCount)[g.fas - 1]; if (g.skipNextFascistPower) g.skipNextFascistPower=false; else if (!chaos && pw && g.president && P(room,g.president) && P(room,g.president).alive) { g.power = pw; g.phase='power'; if(pw==='peek')g.peek=g.deck.slice(0,3); return; }
  } else if (card === 'AF') {
    g.comm++; record('communist','antiFascist'); pushEvent(g,{type:'antiPolicy',card,track:'communist'});
    if (g.fas > 0) g.fas--; g.skipNextFascistPower = true;
    if (checkPolicyVictory(room)) return;
    const cp = communistPowerTrack(g.playerCount)[g.comm - 1]; if (g.skipNextCommPower) g.skipNextCommPower=false; else if (!chaos && cp && g.president && P(room,g.president) && P(room,g.president).alive) { g.power=cp; g.phase='commPower'; return; }
  } else if (card === 'SD') {
    g.lib++; record('liberal','socialDemocratic'); pushEvent(g,{type:'antiPolicy',card,track:'liberal'});
    if (checkPolicyVictory(room)) return;
    if(!chaos && g.president && P(room,g.president) && P(room,g.president).alive){g.power='socialDemocratic'; g.phase='antiPower'; return;}
  }
  if (checkPolicyVictory(room)) return;
  if (card === 'C' || card === 'AF') {
    if (g.skipNextCommPower) g.skipNextCommPower = false;
    else { const cp=communistPowerTrack(g.playerCount)[g.comm-1]; if(!chaos && cp && g.president && P(room,g.president) && P(room,g.president).alive){g.power=cp;g.phase='commPower';return;} }
  }
  if (card === 'F' && g.skipNextFascistPower) { g.skipNextFascistPower = false; g.skipFascistPowerNow = true; }
  ensureDeck(g);
}

function chaos(room) {
  const g = room.game;
  ensureDeck(g);
  const card = g.deck.shift();
  g.lastPres = null; g.lastChanc = null;
  enact(room, card, true);
  if (room.status === 'playing' && !['power','commPower','antiPower'].includes(g.phase)) beginElection(room);
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

function convertToCommunist(room, target) {
  const g=room.game;
  if (!target || !target.alive || target.party==='communist') fail('alreadyCommunist');
  if (['hitler','capitalist','monarchist','dictator'].includes(target.role)) fail('conversionImmune');
  const oldRole=target.role;
  if (oldRole === 'anarchist') {
    target.party='communist'; // retain the special role and its separate win/succession rules
  } else if (oldRole === 'fascist' && g.extensions.monarchist) {
    target.role='roteKapelle'; target.party='communist';
  } else {
    target.role='communist'; target.party='communist';
  }
  g.newlyConverted.push(target.id);
  pushEvent(g,{type:'radicalised'});
  return target;
}
function triggerEmergency(room) {
  const g=room.game;
  if (!g.extensions.emergencyPowers || !g.emergencyDeck || !g.emergencyDeck.length) return false;
  const card=g.emergencyDeck.shift();
  const type=card.type;
  const actorId=type==='article48'?g.president:g.chancellor;
  const actor=actorId&&P(room,actorId);
  if(!actor||!actor.alive) return triggerEmergency(room);
  g.currentEmergency={type,power:card.power};
  g.emergencyActor=actorId;
  g.emergencyReturnPhase='legChanc';
  g.phase='emergency';
  return true;
}
function finishPower(room) {
  const g=room.game; g.power=null; g.peek=null;
  if(g.emergencyReturnPhase==='legChanc') {
    g.currentEmergency=null; g.emergencyReturnPhase=null;
    if(g.chancellor && P(room,g.chancellor) && P(room,g.chancellor).alive) { g.phase='legChanc'; return; }
    if(g.hand&&g.hand.length){g.discard.push(...g.hand);g.hand=[];}
    failedGovernment(room); return;
  }
  g.currentEmergency=null;
  beginElection(room);
}
function resolveEnactedPolicy(room, card) {
  const g=room.game;
  g.emergencyReturnPhase=null; g.currentEmergency=null;
  enact(room,card,false);
  if(room.status!=='playing'||['power','commPower','antiPower'].includes(g.phase))return;
  if(card==='F') {
    const pw=powerTrack(g.playerCount)[g.fas-1];
    if(pw&&!g.skipFascistPowerNow&&g.president&&P(room,g.president)&&P(room,g.president).alive){g.power=pw;g.phase='power';if(pw==='peek')g.peek=g.deck.slice(0,3);return;}
    g.skipFascistPowerNow=false;
  }
  beginElection(room);
}

function applyEmergency(room, kind, actorId, targetId) {
  const g=room.game, actor=P(room,actorId), target=targetId?P(room,targetId):null;
  if (!actor || !actor.alive) fail('notAllowed');
  switch(kind) {
    case 'propaganda': g.peek=g.deck.slice(0,1); g.phase='emergencyPeek'; g.emergencyActor=actorId; return;
    case 'policyPeek': g.peek=g.deck.slice(0,3); g.phase='emergencyPeek'; g.emergencyActor=actorId; return;
    case 'impeachment': { if(!target || !target.alive || target.id===actorId)fail('badTarget'); const sourceId=g.currentEmergency.type==='article48'?g.chancellor:g.president; const source=P(room,sourceId); if(!source||!source.alive)fail('notAllowed'); (g.priv[target.id]=g.priv[target.id]||[]).push({type:'impeachment',target:source.id,party:source.party}); pushEvent(g,{type:'impeachment',source:source.id,recipient:target.id}); finishPower(room);return; }
    case 'marked': if(!target || !target.alive || target.id===actorId)fail('badTarget');g.markedForExecution={id:target.id,atFas:g.fas};pushEvent(g,{type:'marked',target:target.id});finishPower(room);return;
    case 'execution': if(!target || !target.alive || target.id===actorId)fail('badTarget'); executePlayer(room,target,'emergencyExecution');return;
    case 'pardon': if(!g.markedForExecution){pushEvent(g,{type:'pardon',target:null});finishPower(room);return;} if(!target || target.id!==g.markedForExecution.id)fail('badTarget');g.markedForExecution=null;pushEvent(g,{type:'pardon',target:target.id});finishPower(room);return;
    case 'voteNoConfidence': if(!g.hand || g.hand.length!==2 || !g.discard.length || g.emergencyReturnPhase!=='legChanc')fail('notAllowed'); const card=g.discard.pop();g.discard.push(...g.hand);g.hand=[];pushEvent(g,{type:'voteNoConfidence'});resolveEnactedPolicy(room,card);return;
    default: fail('badTarget');
  }
}
function executePlayer(room,target,reason) {
  const g=room.game; target.alive=false;
  g.history.push({type:'execute',round:g.round,president:g.president,target:target.id,reason});
  pushEvent(g,{type:'execute',target:target.id,reason});
  if(target.role==='hitler'){
    if(g.extensions.monarchist){
      const monarchist=room.players.find(p=>p.role==='monarchist'&&p.alive);
      if(monarchist){monarchist.role='dictator';const rote=room.players.find(p=>p.role==='roteKapelle'&&p.alive);if(rote){rote.alive=false;rote.role='roteKapelleDeparted';}g.lib++;pushEvent(g,{type:'dictatorRevealed',target:monarchist.id,liberalBonus:1});if(g.lib>=(g.liberalTarget||5))return endGame(room,'liberal','policies');finishPower(room);return;}
    }
    if(g.extensions.communists)return endGame(room,'coalition','hitlerKilled');
    return endGame(room,'liberal','hitlerKilled');
  }
  if(target.role==='dictator')return endGame(room,'coalition','dictatorKilled');
  if(target.role==='capitalist'&&g.extensions.capitalist){g.deck.push('C');shuffle(g.deck);pushEvent(g,{type:'capitalistKilled',communistPolicyAdded:true});}
  if(g.markedForExecution&&g.markedForExecution.id===target.id)g.markedForExecution=null;
  finishPower(room);
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
  if (type === 'configureRoles') {
    if (!host || room.status !== 'lobby') fail('hostOnly');
    const counts = normalizedRoleCounts(a.counts || { liberal: a.liberal, fascist: a.fascist, hitler: a.hitler });
    if (!validRoleCounts(counts, room.players.length, room.settings.extensions)) fail('invalidRoleCounts');
    room.settings.roleCounts = counts; return;
  }
  if (type === 'configureExtension') {
    if (!host || room.status !== 'lobby') fail('hostOnly');
    const key = String(a.key || '');
    if (!Object.prototype.hasOwnProperty.call(EXTENSION_DEFAULTS, key)) fail('badTarget');
    const next = { ...room.settings.extensions, [key]: !!a.enabled };
    if (!next.communists && (next.capitalist || next.antiPolicies)) fail('extensionDependency');
    if ((next.capitalist || next.antiPolicies) && !next.communists) fail('extensionDependency');
    const counts = normalizedRoleCounts(room.settings.roleCounts || recommendedRoles(room.players.length, next));
    if (!next.capitalist) counts.capitalist = 0;
    if (!next.anarchist) counts.anarchist = 0;
    if (!next.monarchist) counts.monarchist = 0;
    if (!next.communists) { counts.communist = 0; counts.capitalist = 0; }
    room.settings.roleCounts = counts;
    room.settings.extensions = next; return;
  }
  if (type === 'resetRoles') {
    if (!host || room.status !== 'lobby') fail('hostOnly');
    room.settings.roleCounts = null; return;
  }
  if (type === 'start') {
    if (!host) fail('hostOnly');
    if (room.status === 'playing') fail('gameRunning');
    room.players.forEach(p => { p.alive = true; });
    startGame(room); return;
  }
  if (type === 'dealRoles') {
    if (!host || room.status !== 'playing' || !g || g.phase !== 'predeal') fail('hostOnly');
    dealRoles(room); return;
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
      const i = a.index | 0; if (i < 0 || i > 2) fail('badTarget');
      g.discard.push(g.hand.splice(i, 1)[0]);
      g.phase = 'legChanc'; if(triggerEmergency(room))return; return;
    }
    case 'chancEnact': {
      if (g.phase !== 'legChanc' || me.id !== g.chancellor) fail('notAllowed');
      const i = a.index | 0; if (i < 0 || i > 1) fail('badTarget');
      const card = g.hand[i]; g.discard.push(g.hand[1 - i]); g.hand = [];
      resolveEnactedPolicy(room,card); return;
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
        g.specialNext = t.id; finishPower(room); return;
      }
      if (g.power === 'execute') {
        t.alive = false;
        g.history.push({ type: 'execute', round: g.round, president: me.id, target: t.id });
        pushEvent(g, { type: 'execute', target: t.id });
        if (t.role === 'hitler') {
          if (g.extensions && g.extensions.monarchist) {
            const monarchist = room.players.find(p => p.role === 'monarchist' && p.alive);
            if (monarchist) {
              monarchist.role = 'dictator'; monarchist.party = 'fascist';
              const rote = room.players.find(p => p.role === 'roteKapelle' && p.alive);
              if (rote) { rote.alive = false; rote.role = 'roteKapelleDeparted'; }
              g.lib++;
              pushEvent(g, { type: 'dictatorRevealed', target: monarchist.id, liberalBonus: 1 });
              if (g.lib >= (g.liberalTarget || 5)) return endGame(room, 'liberal', 'policies');
              beginElection(room); return;
            }
          }
          return endGame(room, 'liberal', 'hitlerKilled');
        }
        if (t.role === 'dictator') return endGame(room, 'coalition', 'dictatorKilled');
        beginElection(room); return;
      }
      fail('notAllowed');
    }
    case 'socialDemocraticChoice': {
      if(g.phase!=='antiPower'||g.power!=='socialDemocratic'||me.id!==g.president)fail('notAllowed');
      if(a.track==='fascist'){if(g.fas<=0)fail('badTarget');g.fas--;} else if(a.track==='communist'){if(g.comm<=0)fail('badTarget');g.comm--;} else if(a.track==='none'&&g.fas===0&&g.comm===0){} else fail('badTarget');
      g.skipNextCommPower=true;g.skipNextFascistPower=true;pushEvent(g,{type:'socialDemocratic',track:a.track});finishPower(room);return;
    }
    case 'skipPower': {
      if(g.phase!=='commPower'||g.power!=='radicalisation'||me.id!==g.president)fail('notAllowed');
      const candidates=room.players.filter(p=>p.alive&&p.id!==me.id&&p.party!=='communist'&&!['hitler','capitalist','monarchist','dictator'].includes(p.role));
      if(candidates.length)fail('notAllowed'); finishPower(room); return;
    }
    case 'commPower': {
      if (!['commPower','antiPower'].includes(g.phase)) fail('notAllowed');
      if (g.power === 'bugging' || g.power === 'radicalisation' || g.power === 'socialDemocratic') {
        if (me.id !== g.president) fail('notAllowed');
        const t=P(room,a.target);
        if (!t || !t.alive || t.id===me.id) fail('badTarget');
        if (g.power==='bugging') {
          room.players.filter(p=>p.party==='communist').forEach(cp=>{(g.priv[cp.id]=g.priv[cp.id]||[]).push({type:'bugging',target:t.id,party:t.party});});
          pushEvent(g,{type:'bugging'}); finishPower(room); return;
        }
        if (g.power==='radicalisation') { convertToCommunist(room,t); finishPower(room); return; }
        if (g.power==='socialDemocratic') { if(t.party==='fascist'){if(g.fas>0)g.fas--;} else if(t.party==='communist'){if(g.comm>0)g.comm--;} else fail('badTarget'); g.skipNextCommPower=true; g.skipNextFascistPower=true; pushEvent(g,{type:'socialDemocratic',target:t.id}); finishPower(room); return; }
      }
      if (g.power==='congress') {
        if(me.id!==g.president)fail('notAllowed');
        room.players.filter(p=>g.newlyConverted.includes(p.id)&&p.party==='communist'&&p.role!=='roteKapelle').forEach(p=>{(g.priv[p.id]=g.priv[p.id]||[]).push(...g.initialCommunists.filter(id=>id!==p.id).map(id=>({type:'congress',target:id,party:'communist'})));});
        pushEvent(g,{type:'congress'}); finishPower(room); return;
      }
      if (g.power==='fiveYearPlan') {
        if(me.id!==g.president)fail('notAllowed');g.deck.push('C','C','L');shuffle(g.deck);pushEvent(g,{type:'fiveYearPlan'});finishPower(room);return;
      }
      if (g.power==='confession') {
        if(me.id!==g.president)fail('notAllowed');pushEvent(g,{type:'confession',target:me.id,party:me.party});finishPower(room);return;
      }
      fail('notAllowed');
    }
    case 'emergency': {
      if(g.phase!=='emergency')fail('notAllowed');
      const item=g.currentEmergency; if(!item)fail('notAllowed');
      const required=item.type==='article48'?g.president:g.chancellor;
      if(me.id!==required)fail('notAllowed');
      applyEmergency(room,item.power,me.id,a.target); return;
    }
    case 'emergencyAck': { if(g.phase!=='emergencyAck'||me.id!==g.emergencyActor)fail('notAllowed'); finishPower(room); return; }
    case 'emergencyPeekChoice': {
      if(g.phase!=='emergencyPeek'||me.id!==g.emergencyActor)fail('notAllowed');
      if(a.discard && g.peek.length){const discarded=g.deck.shift();if(discarded)g.discard.push(discarded);}
      g.peek=null;finishPower(room);return;
    }
    case 'powerAck': {
      if (me.id !== g.president) fail('notAllowed');
      if (g.phase === 'power' && g.power === 'peek') {
        g.history.push({ type: 'peek', round: g.round, president: me.id });
        pushEvent(g, { type: 'peek', president: me.id });
        finishPower(room); return;
      }
      if (g.phase === 'powerAck') { finishPower(room); return; }
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
    players: room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive, publicRole: p.role === 'dictator' ? 'dictator' : (!p.alive && (p.role === 'hitler' || p.role === 'capitalist') ? p.role : null), online: (room.clients.get(p.token) || new Set()).size > 0 })),
    settings: { roleCounts: normalizedRoleCounts(room.settings.roleCounts || recommendedRoles(room.players.length, room.settings.extensions)), customRoles: !!room.settings.roleCounts, extensions: room.settings.extensions, extensionLabels: EXTENSION_LABELS },
    boardOnline: room.boardToken ? (room.clients.get(room.boardToken) || new Set()).size > 0 : null,
    chat: room.chat.slice(-80)
  };
  if (!g) return v;
  const ended = g.phase === 'ended';
  v.game = {
    phase: g.phase, playerCount: g.playerCount, powers: powerTrack(g.playerCount), roleCounts: g.roleCounts, extensions: g.extensions,
    lib: g.lib, fas: g.fas, comm: g.comm || 0, anarch: g.anarch || 0, liberalTarget: g.liberalTarget || 5, commTarget: g.commTarget || 0, commPowers: communistPowerTrack(g.playerCount), tracker: g.tracker, round: g.round,
    deckCount: g.deck.length, discardCount: g.discard.length,
    presidentId: g.presidentId, nominee: g.nominee, president: g.president, chancellor: g.chancellor,
    lastPres: g.lastPres, lastChanc: g.lastChanc, voted: Object.keys(g.votes), power: g.power,
    vetoUnlocked: g.fas >= 5, vetoRefused: g.vetoRefused, investigated: g.investigated, markedForExecution: g.markedForExecution, currentEmergency: g.currentEmergency,
    notHitler: g.notHitler, ready: Object.keys(g.ready), history: g.history,
    events: g.events, eventSeq: g.eventSeq, winner: g.winner, reason: g.reason,
    eligible: g.phase === 'nominate' ? eligibleChancellors(room) : [],
    radicalisationTargets: g.phase==='commPower'&&g.power==='radicalisation'&&me&&me.id===g.president ? room.players.filter(p=>p.alive&&p.id!==me.id&&p.party!=='communist'&&!['hitler','capitalist','monarchist','dictator'].includes(p.role)).map(p=>p.id) : [],
    lastGov: g.lastGov
  };
  if (ended) v.game.roles = Object.fromEntries(room.players.map(p => [p.id, p.role]));
  if (me && !ended) {
    const n = g.playerCount;
    const priv = { role: me.role, party: me.party, known: {}, myVote: g.phase === 'vote' && me.id in g.votes ? g.votes[me.id] : null, results: g.priv[me.id] || [] };
    if (me.role === 'fascist' || me.role === 'monarchist' || (me.role === 'hitler' && n <= 6)) {
      room.players.forEach(p => { if (p.id !== me.id && p.role !== 'liberal' && p.role !== 'monarchist' && p.role !== 'communist' && p.role !== 'anarchist' && p.role !== 'capitalist' && p.role !== 'roteKapelle' && p.role !== 'roteKapelleDeparted') priv.known[p.id] = p.role; });
    }
    if (g.initialCommunists && g.initialCommunists.includes(me.id) && n >= 11) room.players.forEach(p => { if (p.id !== me.id && g.initialCommunists.includes(p.id)) priv.known[p.id] = p.role; });
    if (me.role === 'roteKapelle') room.players.forEach(p => { if (p.id !== me.id && ['fascist','hitler'].includes(p.role)) priv.known[p.id] = p.role; });
    if ((g.phase === 'legPres' && me.id === g.president) || ((g.phase === 'legChanc' || g.phase === 'veto') && (me.id === g.chancellor || me.id === g.president))) priv.hand = g.hand;
    if (g.phase === 'power' && g.power === 'peek' && me.id === g.president) priv.peek = g.peek;
    if (g.phase === 'emergencyPeek' && me.id === g.emergencyActor) priv.peek = g.peek;
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
module.exports = { server, rooms, act, view, startGame, beginElection, eligibleChancellors, powerTrack, communistPowerTrack, makePolicyDeck, recommendedRoles, convertToCommunist, enact, endGame, executePlayer, applyEmergency };
