(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const main = $('#main');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let lang = localStorage.getItem('sh_lang') || ((navigator.language || 'cs').toLowerCase().startsWith('cs') ? 'cs' : 'en');
  let session = null;
  try { session = JSON.parse(localStorage.getItem('sh_session') || 'null'); } catch { session = null; }
  let V = null, es = null, screen = 'home', connLost = false;
  const ui = { mode: 'personal', subMode: 'classic', tab: 'history', sel: null, selKey: '', roleOpen: false, roleShown: false, rulesOpen: false, error: '', unread: 0, lastChat: 0, seen: -1, gameNo: -1, joinCode: '', busy: false };
  const ovQueue = []; let ovTimer = null;

  function t(k, p) {
    let s = (I18N[lang] && I18N[lang][k]) || I18N.cs[k] || k;
    if (p) s = s.replace(/\{(\w+)\}/g, (_, x) => (p[x] !== undefined ? p[x] : ''));
    return s;
  }

  const skullPath = '<path d="M32 6C18 6 9 16 9 29c0 8 4 13 9 16v9c0 2 1 3 3 3h22c2 0 3-1 3-3v-9c5-3 9-8 9-16C55 16 46 6 32 6z"/><g style="fill:var(--bgc,#1d1a17)"><circle cx="23" cy="30" r="6"/><circle cx="41" cy="30" r="6"/><path d="M32 37l-4 7h8z"/><rect x="25.5" y="49" width="3" height="8"/><rect x="30.5" y="49" width="3" height="8"/><rect x="35.5" y="49" width="3" height="8"/></g>';
  const ICON = {
    dove: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M4 30c5 4 12 6 19 5 3 6 10 10 18 9l7 5 1-7 9-4-9-1c-2-6-8-9-14-8-4-9-12-15-23-17 3 6 6 12 9 17-6-1-11 0-17 1z"/><circle cx="46" cy="38" r="1.7" style="fill:var(--bgc,#1d1a17)"/></svg>',
    skull: '<svg viewBox="0 0 64 64" fill="currentColor">' + skullPath + '</svg>',
    hitler: '<svg viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="3 5"/><g transform="translate(9.6 9.6) scale(.7)">' + skullPath + '</g></svg>',
    investigate: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><circle cx="27" cy="27" r="16"/><path d="M39 39l17 17"/></svg>',
    peek: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5"><path d="M4 32s10-16 28-16 28 16 28 16-10 16-28 16S4 32 4 32z"/><circle cx="32" cy="32" r="8" fill="currentColor"/></svg>',
    special: '<svg viewBox="0 0 64 64" fill="currentColor"><polygon points="32,5 39.5,24 59,24 43.5,36 49,56 32,44.5 15,56 20.5,36 5,24 24.5,24"/></svg>',
    execute: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5"><circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="5" fill="currentColor"/><path d="M32 2v16M32 46v16M2 32h16M46 32h16"/></svg>',
    veto: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><circle cx="32" cy="32" r="24"/><path d="M22 22l20 20M42 22L22 42"/></svg>',
    phone: '<svg viewBox="0 0 64 64" width="36" fill="none" stroke="currentColor" stroke-width="4"><rect x="8" y="10" width="20" height="36" rx="3"/><rect x="36" y="18" width="20" height="36" rx="3"/><path d="M15 40h6M43 48h6"/></svg>',
    screen: '<svg viewBox="0 0 64 64" width="38" fill="none" stroke="currentColor" stroke-width="4"><rect x="6" y="8" width="52" height="32" rx="2"/><path d="M24 48h16M32 40v8"/><rect x="6" y="50" width="9" height="12" rx="2"/><rect x="49" y="50" width="9" height="12" rx="2"/></svg>',
    emblem: '<svg viewBox="0 0 120 120"><defs><clipPath id="cl"><rect width="60" height="120"/></clipPath><clipPath id="cr"><rect x="60" width="60" height="120"/></clipPath></defs><circle cx="60" cy="60" r="56" fill="#2c5a78" clip-path="url(#cl)"/><circle cx="60" cy="60" r="56" fill="#b5301f" clip-path="url(#cr)"/><circle cx="60" cy="60" r="56" fill="none" stroke="#1d1a17" stroke-width="5"/><circle cx="60" cy="60" r="48" fill="none" stroke="#efe3c8" stroke-width="1.5"/><path d="M60 4v112" stroke="#1d1a17" stroke-width="3"/><g transform="translate(6 30) scale(.82)" fill="#efe3c8" style="--bgc:#2c5a78"><path d="M4 30c5 4 12 6 19 5 3 6 10 10 18 9l7 5 1-7 9-4-9-1c-2-6-8-9-14-8-4-9-12-15-23-17 3 6 6 12 9 17-6-1-11 0-17 1z"/></g><g transform="translate(64 35) scale(.75)" fill="#efe3c8" style="--bgc:#b5301f">' + skullPath + '</g></svg>'
  };

  const tile = (c, extra) => {
    let bg = 'var(--blue)';
    if (c === 'F') bg = 'var(--red)';
    if (c === 'K') bg = 'var(--blue2)';
    if (c === 'A') bg = 'var(--orange)';
    const ic = c === 'L' ? ICON.dove : c === 'K' ? ICON.special : ICON.skull;
    return `<div class="tile ${c} ${extra || ''}" style="--bgc:${bg}">${ic}<span class="lbl">${t('policy' + c)}</span></div>`;
  };

  const pl = (id) => V && V.players.find((p) => p.id === id);
  const nm = (id) => { const p = pl(id); return p ? esc(p.name) : '?'; };
  const aliveCount = () => V.players.filter((p) => p.alive).length;

  function toast(msg, ms) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 2600);
  }
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: 'generic' }));
    if (!r.ok) throw new Error(j.error || 'generic');
    return j;
  }
  const errText = (e) => { const k = 'e_' + (e && e.message); return I18N.cs[k] ? t(k) : t('e_generic'); };
  async function act(type, extra) {
    if (!session) return;
    try { await post('/api/action', { code: session.code, token: session.token, action: { type, ...(extra || {}) } }); }
    catch (e) { toast(errText(e)); }
  }

  function saveSession(s) { session = s; localStorage.setItem('sh_session', JSON.stringify(s)); }
  function endSession(msg) {
    if (es) es.close(); es = null;
    localStorage.removeItem('sh_session'); session = null; V = null; screen = 'home';
    closeModal(); render(); if (msg) toast(msg, 4000);
  }
  function setConn(lost) { connLost = lost; const c = $('#conn'); c.hidden = !lost; c.textContent = t('reconnecting'); }
  function connect() {
    if (es) es.close();
    es = new EventSource(`/api/stream?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.closed) { endSession(d.closed === 'kicked' ? t('e_kicked') : d.closed === 'roomClosed' ? t('e_roomClosed') : null); return; }
      setConn(false); onView(d);
    };
    es.onerror = async () => {
      setConn(true);
      try {
        const r = await fetch(`/api/check?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
        const j = await r.json();
        if (!j.ok) return endSession(t('e_noRoom'));
        if (es && es.readyState === 2) setTimeout(() => session && connect(), 2000);
      } catch { if (es && es.readyState === 2) setTimeout(() => session && connect(), 3000); }
    };
  }
  function onView(v) {
    const g = v.game;
    const fresh = !V || ui.gameNo !== v.gameNo;
    if (fresh) { ui.seen = g ? g.eventSeq : 0; ui.gameNo = v.gameNo; }
    else if (g) {
      g.events.filter((e) => e.seq > ui.seen).forEach((e) => queueEvent(e, v));
      ui.seen = g.eventSeq;
    }
    const lastChat = v.chat.length ? v.chat[v.chat.length - 1].id : 0;
    if (!fresh && lastChat > ui.lastChat && !(ui.tab === 'chat')) ui.unread += v.chat.filter((m) => m.id > ui.lastChat).length;
    ui.lastChat = lastChat;
    const key = g ? g.phase + ':' + g.round : '';
    if (key !== ui.selKey) { ui.sel = null; ui.selKey = key; }
    V = v;
    render();
  }

  function queueEvent(e, v) {
    const name = (id) => { const p = v.players.find((x) => x.id === id); return p ? esc(p.name) : '?'; };
    let html = null, ms = 4200;
    if (e.type === 'vote') {
      ms = 6500;
      html = `<div class="ov-card"><div class="type muted">${t('president')} ${name(e.president)} · ${t('chancellor')} ${name(e.chancellor)}</div>
        <div class="stamp ${e.passed ? 'ok' : 'no'}">${t(e.passed ? 'govElected' : 'govRejected')}</div>
        <div class="type">${t('ja')} ${e.ja} : ${e.nein} ${t('nein')}</div>
        <div class="ov-votes">${Object.entries(e.votes).map(([id, y], i) => `<div style="animation-delay:${i * 70}ms">${name(id)}<span class="mini-ballot ${y ? 'ja' : 'nein'}">${t(y ? 'ja' : 'nein')}</span></div>`).join('')}</div></div>`;
    } else if (e.type === 'policy') {
      html = `<div class="ov-card"><h2>${t(e.chaos ? 'chaosEnacted' : 'enacted' + e.card)}</h2><div class="ov-tile">${tile(e.card, 'flip')}</div></div>`;
    } else if (e.type === 'execute') {
      html = `<div class="ov-card" style="--bgc:var(--paper)"><div style="width:90px;margin:0 auto;color:var(--red)">${ICON.execute}</div><h2>${t('executed', { name: name(e.target) })}</h2></div>`;
    } else if (e.type === 'veto') {
      html = `<div class="ov-card"><div style="width:80px;margin:0 auto;color:var(--red)">${ICON.veto}</div><h2>${t('vetoed')}</h2></div>`;
    }
    if (html) { ovQueue.push({ html, ms }); if (!ovTimer && $('#overlay').hidden) nextOverlay(); }
  }
  function nextOverlay() {
    const ov = $('#overlay');
    clearTimeout(ovTimer); ovTimer = null;
    const item = ovQueue.shift();
    if (!item) { ov.hidden = true; return; }
    ov.className = 'overlay' + (V && V.isBoard ? ' board-screen-ov' : '');
    ov.innerHTML = item.html; ov.hidden = false;
    ovTimer = setTimeout(nextOverlay, item.ms);
  }
  $('#overlay').addEventListener('click', nextOverlay);

  function closeModal() { ui.roleOpen = false; ui.roleShown = false; ui.rulesOpen = false; $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  function renderModal() {
    const m = $('#modal');
    if (!ui.roleOpen && !ui.rulesOpen) { m.hidden = true; return; }
    
    if (ui.rulesOpen) {
      m.innerHTML = `<div class="box panel framed">
        <div class="row" style="justify-content:space-between;margin-bottom:12px"><h3>${t('rulesShort')}</h3><button class="btn ghost small" data-act="closeModal">${t('close')}</button></div>
        <p class="type" style="font-size:13px;line-height:1.5">${V && V.subMode === 'expansion' ? '<b>Expansion Pravidla:</b> Hra obsahuje fašisty, liberály, komunisty a další frakce. Komunistický plán má 5 polí. Kapitál a anarchisté mají specifické podmínky pro výhru.' : '<b>Classic Pravidla:</b> Liberálové vyhrávají 5 zákony nebo zabitím Hitlera. Fašisté 6 zákony nebo zvolením Hitlera po 3. fašistickém zákoně.'}</p>
        <div class="row" style="margin-top:16px"><button class="btn block dark small" data-act="closeModal">${t('close')}</button></div></div>`;
      m.hidden = false;
      return;
    }

    if (!V || !V.private) { m.hidden = true; return; }
    const pr = V.private;
    let body;
    if (!ui.roleShown) {
      body = `<div class="envelope" data-act="reveal"><div class="seal">S</div><h2>${t('secretRole')}</h2><div class="type">${esc(V.me.name)}</div><div class="type muted">${t('tapReveal')}</div></div>`;
    } else {
      const roleIcon = pr.role === 'liberal' ? ICON.dove : pr.role === 'hitler' ? ICON.hitler : ICON.skull;
      const bg = pr.role === 'liberal' ? 'var(--blue)' : pr.role === 'hitler' ? 'var(--ink)' : 'var(--red)';
      const known = Object.entries(pr.known || {});
      let knownHtml = `<p class="goal muted">${t('knowNothingLib')}</p>`;
      if (known.length) knownHtml = `<div class="known"><b>${t('knowFascists')}</b> ${known.map(([id, r]) => `<span class="badge ${r === 'hitler' ? 'kH' : 'kF'}">${nm(id)} — ${t(r)}</span>`).join(' ')}</div>`;
      
      const roleDescKey = 'desc_' + pr.role;
      const roleDescText = I18N[lang][roleDescKey] || I18N.cs[roleDescKey] || t('goalLiberal');

      body = `<div class="cards-pair">
          <div class="rcard ${pr.role}" style="--bgc:${bg}"><span class="k">${t('secretRole')}</span>${roleIcon}<span class="v">${t(pr.role)}</span></div>
          <div class="rcard partyL" style="--bgc:var(--blue2)"><span class="k">${t('partyMembership')}</span>${ICON.dove}<span class="v" style="font-size:18px">${t(pr.party === 'dual' ? 'partyDual' : 'partyL')}</span></div>
        </div>
        <p class="goal"><b>Cíle a schopnosti:</b> ${roleDescText}</p>
        ${knownHtml}
        <div class="row" style="margin-top:16px"><button class="btn dark small" data-act="unreveal">${t('hide')}</button></div>`;
    }
    m.innerHTML = `<div class="box panel framed"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3>${t('myRole')}</h3><button class="btn ghost small" data-act="closeModal">${t('close')}</button></div>${body}</div>`;
    m.hidden = false;
  }
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') return closeModal();
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'reveal') { ui.roleShown = true; renderModal(); }
    if (a.dataset.act === 'unreveal') { ui.roleShown = false; renderModal(); }
    if (a.dataset.act === 'closeModal') closeModal();
  });

  function homeScreen() {
    return `<section class="poster"><div class="rays"></div>
      <div class="emblem">${ICON.emblem}</div>
      <h1><span class="s">Secret</span><span class="h">Hitler</span></h1>
      <div class="year">— 1932 —</div>
      <p class="tagline">${t('tagline')}</p>
      <div class="home-btns">
        <button class="btn" data-go="create">${t('create')}</button>
        <button class="btn blue" data-go="join">${t('join')}</button>
      </div></section>
      <p class="credits">${t('credits')}</p>`;
  }
  
  function createScreen() {
    return `<div class="stack">
      <button class="btn ghost small" data-go="home" style="align-self:flex-start">← ${t('back')}</button>
      <h2 class="deco" style="font-size:28px">${t('chooseSubMode')}</h2>
      <div class="row" style="gap:10px">
        <button class="btn ${ui.subMode === 'classic' ? '' : 'ghost'}" data-submode="classic" style="flex:1">${t('modeClassic')}</button>
        <button class="btn blue ${ui.subMode === 'expansion' ? '' : 'ghost'}" data-submode="expansion" style="flex:1">${t('modeExpansion')}</button>
      </div>
      <h2 class="deco" style="font-size:28px;margin-top:10px">${t('chooseMode')}</h2>
      <button class="mode-card ${ui.mode === 'personal' ? 'sel' : ''}" data-mode="personal"><span class="ic">${ICON.phone}</span><span><h3>${t('modePersonal')}</h3><p>${t('modePersonalDesc')}</p></span></button>
      <button class="mode-card board ${ui.mode === 'board' ? 'sel' : ''}" data-mode="board"><span class="ic">${ICON.screen}</span><span><h3>${t('modeBoard')}</h3><p>${t('modeBoardDesc')}</p></span></button>
      ${ui.mode === 'personal' ? `<div class="field"><label for="nameIn">${t('yourName')}</label><input id="nameIn" maxlength="18" autocomplete="nickname" placeholder="${t('namePh')}" value="${esc(localStorage.getItem('sh_name') || '')}"></div>` : ''}
      ${ui.error ? `<div class="error">${esc(ui.error)}</div>` : ''}
      <button class="btn block" data-act="create" ${ui.busy ? 'disabled' : ''}>${t('createGame')}</button>
    </div>`;
  }
  
  function joinScreen() {
    return `<div class="stack">
      <button class="btn ghost small" data-go="home" style="align-self:flex-start">← ${t('back')}</button>
      <h2 class="deco" style="font-size:34px">${t('join')}</h2>
      <div class="field"><label for="codeIn">${t('roomCode')}</label><input id="codeIn" class="code" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(ui.joinCode)}"></div>
      <div class="field"><label for="nameIn">${t('yourName')}</label><input id="nameIn" maxlength="18" autocomplete="nickname" placeholder="${t('namePh')}" value="${esc(localStorage.getItem('sh_name') || '')}"></div>
      ${ui.error ? `<div class="error">${esc(ui.error)}</div>` : ''}
      <button class="btn blue block" data-act="join" ${ui.busy ? 'disabled' : ''}>${t('joinGame')}</button>
    </div>`;
  }

  function joinUrl() { return location.origin + '/?join=' + V.code; }
  function qrBlock(big) {
    let svg = '';
    try { svg = QR.toSVG(joinUrl()); } catch { svg = ''; }
    return `<div class="qr-box">${svg}<div class="type muted" style="font-size:13px">${t('scanToJoin')}</div>
      <div class="big-code">${V.code}</div>
      <div class="url">${t('orEnterCode')} ${esc(location.host)}</div>
      ${big ? '' : `<button class="btn ghost small" data-act="copy">${t('copyLink')}</button>`}</div>`;
  }
  function playerList(canKick) {
    return `<ul class="plist">${V.players.map((p, i) => `<li><span class="num">${i + 1}.</span><span class="dot ${p.online ? '' : 'off'}"></span><span class="grow">${esc(p.name)}
      ${V.me && p.id === V.me.id ? `<span class="tag">(${t('you')})</span>` : ''}${p.id === V.hostId ? ` <span class="tag">★ ${t('host')}</span>` : ''}</span>
      ${canKick && p.id !== V.hostId ? `<button class="btn ghost small" data-kick="${p.id}">${t('kick')}</button>` : ''}</li>`).join('')}</ul>`;
  }
  function lobbyScreen() {
    const n = V.players.length; 
    const minP = V.subMode === 'expansion' ? 6 : 5;
    const maxP = V.subMode === 'expansion' ? 20 : 10;
    const ok = n >= minP && n <= maxP;
    const startBtn = V.isHost ? `<button class="btn block" data-act="start" ${ok ? '' : 'disabled'}>${t('start')}</button><p class="type muted center" style="margin:6px 0 0;font-size:13px">${t('needPlayers', { min: minP, max: maxP, n })}</p>` : `<p class="type center">${t('waitingHost')}</p>`;
    return `<div class="lobby-grid">
      <h2 class="deco" style="font-size:36px">${t('lobby')} (${V.subMode === 'expansion' ? 'Expansion' : 'Classic'})</h2>
      <div class="panel"><div class="panel-title">${t('players')} · ${n}/${maxP}</div>${playerList(V.isHost)}</div>
      ${startBtn}
      <div class="panel framed">${qrBlock(false)}</div>
      <button class="btn ghost small" data-act="leave" style="justify-self:start">${t('leave')}</button>
    </div>`;
  }

  function statusLine() {
    const g = V.game; const p = nm(g.presidentId); const c = nm(g.nominee || g.chancellor);
    switch (g.phase) {
      case 'roles': return [t('st_roles'), t('readyCount', { r: g.ready.length, n: g.playerCount })];
      case 'nominate': return [t('st_nominate', { p }), t('discuss')];
      case 'vote': return [t('st_vote', { p, c }), t('votedCount', { v: g.voted.length, n: aliveCount() })];
      case 'legPres': return [t('st_legPres', { p: nm(g.president) }), t('noTalk')];
      case 'legChanc': return [t('st_legChanc', { c: nm(g.chancellor) }), t('noTalk')];
      case 'veto': return [t('st_veto', { p: nm(g.president), c: nm(g.chancellor) }), ''];
      case 'power': return [t('st_power_' + g.power, { p: nm(g.president) }), ''];
      case 'powerAck': return [t('st_powerAck', { p: nm(g.president) }), ''];
      default: return ['', ''];
    }
  }
  function statusBar() {
    const [a, b] = statusLine();
    const force = V.isHost && V.game.phase === 'roles' ? `<button class="btn ghost small" data-act="force">${t('forceContinue')}</button>` : '';
    return `<div class="status"><div>${a}${b ? `<small>${b}</small>` : ''}</div><div class="stack" style="gap:6px;align-items:flex-end"><span class="rnd">${t('round', { n: V.game.round })}</span>${force}</div></div>`;
  }
  
  function tracks() {
    const g = V.game;
    let lib = '';
    for (let i = 0; i < 5; i++) {
      lib += `<div class="slot ${i === 4 ? 'win' : ''}" style="--bgc:var(--lblue)">${i < g.lib ? tile('L') : i === 4 ? ICON.dove + `<span>${t('winSlot')}</span>` : ''}</div>`;
    }
    let fas = '';
    for (let i = 0; i < 6; i++) {
      const pw = g.powers[i];
      const label = pw ? t('pw_' + pw) : i === 5 ? t('winSlot') : '';
      const icon = pw ? ICON[pw] : i === 5 ? ICON.skull : '';
      fas += `<div class="slot ${i >= 3 ? 'danger' : ''} ${i === 5 ? 'win' : ''}" style="--bgc:var(--orange)">${i < g.fas ? tile('F') : `${icon}<span>${label}${i === 4 ? '<br>+ veto' : ''}</span>`}</div>`;
    }
    
    let komHtml = '';
    if (g.subMode === 'expansion') {
      let kom = '';
      for (let i = 0; i < 5; i++) {
        kom += `<div class="slot ${i === 4 ? 'win' : ''}" style="--bgc:var(--blue2)">${i < g.kom ? tile('K') : i === 4 ? ICON.special + `<span>${t('winSlot')}</span>` : ''}</div>`;
      }
      komHtml = `<div class="track kom"><div class="track-head"><h3>${t('komTrack')}</h3><span>${g.kom} / 5</span></div><div class="slots" style="grid-template-columns:repeat(5,1fr)">${kom}</div></div>`;
    }

    let pips = '';
    for (let i = 1; i <= 3; i++) pips += `<span class="pip ${i <= g.tracker ? 'on' : ''} ${i === 3 ? 'last' : ''}">${i === 3 ? '!' : i}</span>`;
    return `<div class="tracks">
      <div class="track lib"><div class="track-head"><h3>${t('libTrack')}</h3><span>${g.lib} / 5</span></div><div class="slots">${lib}</div></div>
      ${komHtml}
      <div class="track fas"><div class="track-head"><h3>${t('fasTrack')}</h3><span>${g.fas} / 6</span></div><div class="slots">${fas}</div>
        ${g.fas >= 3 ? `<span class="hz-note">⚠ ${t('hitlerZone')}</span> ` : ''}</div>
      <div class="tracker-row"><div class="tracker">${t('electionTracker')} ${pips} <span class="type" style="text-transform:none">→ ${t('chaos')}</span></div>
        <div class="piles"><span class="pile">${t('drawPile')}: ${g.deckCount}</span><span class="pile">${t('discardPile')}: ${g.discardCount}</span></div></div>
    </div>`;
  }
  
  function seats() {
    const g = V.game; const ended = g.phase === 'ended'; const ac = aliveCount();
    return `<div class="seats">${V.players.map((p) => {
      const b = [];
      if (g.president === p.id) b.push(`<span class="badge P">${t('president')}</span>`);
      else if (g.presidentId === p.id && !ended) b.push(`<span class="badge P cand">${t('president')}?</span>`);
      if (g.chancellor === p.id) b.push(`<span class="badge C">${t('chancellor')}</span>`);
      else if (g.nominee === p.id) b.push(`<span class="badge C cand">${t('chancellor')}?</span>`);
      if (!ended && g.phase === 'nominate' && p.alive && p.id !== g.presidentId && (p.id === g.lastChanc || (ac > 5 && p.id === g.lastPres))) b.push(`<span class="badge">${t('termLimited')}</span>`);
      if (g.notHitler.includes(p.id)) b.push(`<span class="badge nh">${t('notHitler')}</span>`);
      if (g.investigated.includes(p.id)) b.push(`<span class="badge">${t('investigatedMark')}</span>`);
      if (!p.alive) b.push(`<span class="badge">☠ ${t('dead')}</span>`);
      if (ended && g.roles) { const r = g.roles[p.id]; b.push(`<span class="badge">${t(r) || r}</span>`); }
      const voted = g.phase === 'vote' && g.voted.includes(p.id);
      return `<div class="seat ${V.me && p.id === V.me.id ? 'me' : ''} ${p.alive ? '' : 'dead'}">
        ${p.online ? '' : `<span class="dot off"></span>`}${voted ? '<span class="voted">✓</span>' : ''}
        <span class="nm">${esc(p.name)}</span><span class="badges">${b.join('')}</span></div>`;
    }).join('')}</div>`;
  }

  function histItem(h) {
    const r = `<span class="r">${t('round', { n: h.round })}</span>`;
    switch (h.type) {
      case 'election':
        return `<li class="${h.passed ? '' : 'fail'}">${r}${t('h_election', { p: nm(h.president), c: nm(h.chancellor) })} — <b>${t(h.passed ? 'h_passed' : 'h_failed')}</b> (${h.ja}:${h.nein})</li>`;
      case 'policy':
        return `<li class="${h.card}">${r}<b>${t(h.chaos ? 'chaosEnacted' : 'enacted' + h.card)}</b></li>`;
      case 'veto': return `<li class="fail">${r}${t('vetoed')}</li>`;
      case 'investigate': return `<li>${r}${t('investigatedEv', { p: nm(h.president), t: nm(h.target) })}</li>`;
      case 'execute': return `<li class="ex">${r}${t('executed', { name: nm(h.target) })}</li>`;
      default: return '';
    }
  }
  function historyList() {
    const h = V.game.history;
    return h.length ? `<ul class="hist">${h.slice().reverse().map(histItem).join('')}</ul>` : `<p class="type muted">${t('noHistory')}</p>`;
  }
  function chatLog() {
    return `<div class="chat-log" id="chatLog">${V.chat.map((m) => m.sys
      ? `<div class="m sys">— ${esc(t(m.sys, Object.fromEntries(Object.entries(m.params).map(([k, x]) => [k, x]))))}</div>`
      : `<div class="m"><b>${nm(m.pid)}:</b>${esc(m.text)}</div>`).join('')}</div>`;
  }
  function chatBox() {
    const me = V.me && pl(V.me.id);
    const canTalk = me && (V.status !== 'playing' || me.alive);
    return chatLog() + (canTalk ? `<form class="chat-form" id="chatForm"><input id="chatIn" maxlength="300" autocomplete="off" placeholder="${t('chatPh')}"><button class="btn small">${t('send')}</button></form>` : '');
  }

  function actionPanel() {
    const g = V.game, pr = V.private, me = V.me && pl(V.me.id);
    if (!pr || !me) return '';
    if (!me.alive) return `<div class="panel action"><p class="sub" style="margin:0">☠ ${t('deadInfo')}</p></div>`;
    const isP = me.id === g.presidentId;
    let mine = false, h = '';
    const wait = (id) => `<p class="sub">${t('waitFor', { p: nm(id) })}</p>`;
    switch (g.phase) {
      case 'roles': {
        const ready = g.ready.includes(me.id); mine = !ready;
        h = `<h2>${t('secretRole')}</h2><p class="sub">${t('tapReveal')}</p>
          <div class="row"><button class="btn dark" data-act="role">${t('myRole')}</button>
          <button class="btn" data-act="ack" ${ready ? 'disabled' : ''}>${ready ? '✓ ' : ''}${t('imReady')}</button></div>`;
        break;
      }
      case 'nominate':
        if (isP) {
          mine = true;
          const others = V.players.filter((p) => p.alive && p.id !== me.id);
          h = `<h2>${t('chooseChancellor')}</h2><p class="sub">${t('discuss')}</p><div class="choices">${others.map((p) => `<button class="choice" data-nom="${p.id}" ${g.eligible.includes(p.id) ? '' : 'disabled'}>${esc(p.name)}</button>`).join('')}</div>`;
        } else h = `<h2>${t('presCand')}: ${nm(g.presidentId)}</h2>${wait(g.presidentId)}`;
        break;
      case 'vote': {
        const mv = pr.myVote; mine = mv === null;
        h = `<h2>${t('voteOn')}</h2><p class="sub">${t('president')}: <b>${nm(g.presidentId)}</b> · ${t('chancellor')}: <b>${nm(g.nominee)}</b><br>${mv === null ? t('discuss') : t('youVoted', { v: t(mv ? 'ja' : 'nein') })}</p>
          <div class="ballots"><button class="ballot ja ${mv === true ? 'sel' : ''}" data-vote="1">${t('ja')}</button><button class="ballot nein ${mv === false ? 'sel' : ''}" data-vote="0">${t('nein')}</button></div>`;
        break;
      }
      case 'legPres':
        if (me.id === g.president && pr.hand) {
          mine = true;
          h = `<h2>${t('discardOne')}</h2><p class="sub">${t('noTalk')}</p><div class="hand discard">${pr.hand.map((c, i) => `<div data-sel="${i}" class="${ui.sel === i ? 'sel' : ''}">${tile(c, ui.sel === i ? 'sel' : '')}</div>`).join('')}</div>
            <button class="btn block dark" data-act="discard" ${ui.sel === null ? 'disabled' : ''}>${t('discardIt')}</button>`;
        } else h = `<h2>${t('president')}: ${nm(g.president)}</h2><p class="sub">${t('noTalk')}</p>`;
        break;
      case 'legChanc':
        if (me.id === g.chancellor && pr.hand) {
          mine = true;
          h = `<h2>${t('enactOne')}</h2><p class="sub">${t('noTalk')}</p><div class="hand">${pr.hand.map((c, i) => `<div data-sel="${i}">${tile(c, ui.sel === i ? 'sel' : '')}</div>`).join('')}</div>
            <button class="btn block" data-act="enact" ${ui.sel === null ? 'disabled' : ''}>${t('enactIt')}</button>
            ${g.vetoUnlocked && !g.vetoRefused ? `<button class="btn block ghost" style="margin-top:12px" data-act="veto">${t('requestVeto')}</button>` : ''}`;
        } else h = `<h2>${t('chancellor')}: ${nm(g.chancellor)}</h2><p class="sub">${t('noTalk')}</p>`;
        break;
      case 'veto':
        if (me.id === g.president) {
          mine = true;
          h = `<h2>${t('requestVeto')}</h2><p class="sub">${t('vetoAsk')}</p>
            <div class="row"><button class="btn" data-veto="1">${t('vetoAgree')}</button><button class="btn ghost" data-veto="0">${t('vetoRefuse')}</button></div>`;
        } else h = wait(g.president);
        break;
      case 'power':
        if (me.id === g.president) {
          mine = true;
          if (g.power === 'peek') {
            h = `<h2>${t('pw_peek')}</h2><p class="sub">${t('peekTitle')}</p><div class="hand">${(pr.peek || []).map((c) => `<div>${tile(c, 'static')}</div>`).join('')}</div><button class="btn block dark" data-act="powerAck">${t('done')}</button>`;
          } else {
            const key = { investigate: 'chooseInvestigate', special: 'chooseSpecial', execute: 'chooseExecute' }[g.power];
            const others = V.players.filter((p) => p.alive && p.id !== me.id);
            h = `<h2>${t('pw_' + g.power)}</h2><p class="sub">${t(key)}</p><div class="choices">${others.map((p) => `<button class="choice" data-target="${p.id}">${esc(p.name)}</button>`).join('')}</div>`;
          }
        } else h = `<h2>${t('pw_' + g.power)}</h2>${wait(g.president)}`;
        break;
      case 'powerAck':
        if (me.id === g.president) {
          mine = true;
          h = `<h2>${t('pw_investigate')}</h2><button class="btn block dark" data-act="powerAck">${t('done')}</button>`;
        } else h = wait(g.president);
        break;
    }
    return `<div class="panel action ${mine ? 'mine' : ''}">${mine ? `<span class="your-turn">${t('yourTurn')}</span>` : ''}${h}</div>`;
  }

  function endBanner() {
    const g = V.game;
    const reason = g.reason === 'policies' ? 'r_policies_' + g.winner : 'r_' + g.reason;
    return `<div class="end-banner ${g.winner}">
      <h1>${t('win' + g.winner.charAt(0).toUpperCase() + g.winner.slice(1))}</h1><p>${t(reason)}</p></div>
      ${V.isHost ? `<button class="btn block dark" data-act="newGame">${t('newGame')}</button>` : `<p class="type muted center">${t('waitingNewGame')}</p>`}`;
  }

  function gameScreen() {
    const g = V.game; const ended = g.phase === 'ended';
    const head = ended ? endBanner() : statusBar();
    const roleBtn = !ended && g.phase !== 'roles' ? `<button class="btn dark small role-btn" data-act="role">${t('myRole')}</button>` : '';
    const rulesBtn = `<button class="btn ghost small" data-act="rules" style="margin-top:8px">${t('rulesShort')}</button>`;
    return `<div class="game">${head}${ended ? '' : actionPanel()}${roleBtn}${rulesBtn}${ended ? '' : seats()}${tracks()}${ended ? seats() : ''}
      <div class="panel"><div class="panel-title">${t('chat')}</div>${chatBox()}</div></div>`;
  }

  function render() {
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
    const chip = $('#codeChip'); chip.hidden = !(V && session); if (V) chip.textContent = V.code;
    const ex = $('#exitBtn'); ex.hidden = !session; ex.textContent = t('exit');
    
    let html; let cls = '';
    if (screen === 'room') {
      if (!V) html = `<p class="type center" style="margin-top:40px">${t('reconnecting')}</p>`;
      else if (V.status === 'lobby') html = lobbyScreen();
      else html = gameScreen();
    } else if (screen === 'create') html = createScreen();
    else if (screen === 'join') html = joinScreen();
    else html = homeScreen();
    main.className = cls;
    main.innerHTML = html;
    renderModal();
  }

  document.querySelector('.lang').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    lang = b.dataset.lang; localStorage.setItem('sh_lang', lang); render();
  });
  $('#exitBtn').addEventListener('click', async () => {
    if (!session) return;
    if (!confirm(t('confirmLeave'))) return;
    if (V && V.status === 'lobby' && V.me) await act('leave');
    endSession();
  });
  $('#brand').addEventListener('click', (e) => { e.preventDefault(); if (!session) { screen = 'home'; ui.error = ''; render(); } });

  main.addEventListener('submit', (e) => {
    if (e.target.id === 'chatForm') {
      e.preventDefault(); const i = $('#chatIn'); const text = i.value.trim();
      if (text) { act('chat', { text }); i.value = ''; }
    }
  });
  main.addEventListener('input', (e) => { 
    if (e.target.id === 'codeIn') { 
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); 
      ui.joinCode = e.target.value; 
    } 
  });

  main.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-go],[data-mode],[data-submode],[data-act],[data-kick],[data-nom],[data-vote],[data-sel],[data-veto],[data-target],[data-claim],[data-tab]');
    if (!el) return;
    const d = el.dataset;
    if (d.go) { screen = d.go; ui.error = ''; render(); return; }
    if (d.mode) { ui.mode = d.mode; render(); return; }
    if (d.submode) { ui.subMode = d.submode; render(); return; }
    if (d.kick) return act('kick', { target: d.kick });
    if (d.nom) return act('nominate', { target: d.nom });
    if (d.vote) return act('vote', { ja: d.vote === '1' });
    if (d.sel !== undefined) { ui.sel = ui.sel === +d.sel ? null : +d.sel; render(); return; }
    if (d.veto) return act('vetoAnswer', { agree: d.veto === '1' });
    if (d.target) return act('power', { target: d.target });
    switch (d.act) {
      case 'create': {
        const name = ($('#nameIn') || {}).value || '';
        if (ui.mode === 'personal' && !name.trim()) { ui.error = t('e_nameRequired'); render(); return; }
        ui.busy = true; render();
        try {
          if (name) localStorage.setItem('sh_name', name.trim());
          const r = await post('/api/create', { mode: ui.mode, subMode: ui.subMode, name });
          saveSession({ code: r.code, token: r.token }); screen = 'room'; ui.error = ''; V = null; connect();
        } catch (err) { ui.error = errText(err); }
        ui.busy = false; render(); return;
      }
      case 'join': {
        const code = ($('#codeIn') ? $('#codeIn').value : ui.joinCode || '').trim().toUpperCase(); 
        const name = ($('#nameIn') ? $('#nameIn').value : '').trim();
        
        if (!code || code.length < 4) { ui.error = 'Zadej platný 4místný kód hry.'; render(); return; }
        if (!name) { ui.error = t('e_nameRequired'); render(); return; }
        
        ui.busy = true; render();
        try {
          localStorage.setItem('sh_name', name);
          const r = await post('/api/join', { code, name });
          saveSession({ code: r.code, token: r.token }); screen = 'room'; ui.error = ''; V = null; connect();
        } catch (err) { ui.error = errText(err); }
        ui.busy = false; render(); return;
      }
      case 'copy':
        try { await navigator.clipboard.writeText(joinUrl()); toast(t('copied')); } catch { toast(joinUrl(), 5000); }
        return;
      case 'start': return act('start');
      case 'leave': if (confirm(t('confirmLeave'))) { await act('leave'); endSession(); } return;
      case 'force': return act('forceContinue');
      case 'role': ui.roleOpen = true; ui.rulesOpen = false; ui.roleShown = false; renderModal(); return;
      case 'rules': ui.rulesOpen = true; ui.roleOpen = false; renderModal(); return;
      case 'ack': return act('ackRole');
      case 'discard': if (ui.sel !== null) { const i = ui.sel; ui.sel = null; act('presDiscard', { index: i }); } return;
      case 'enact': if (ui.sel !== null) { const i = ui.sel; ui.sel = null; act('chancEnact', { index: i }); } return;
      case 'veto': return act('vetoRequest');
      case 'powerAck': return act('powerAck');
      case 'newGame': return act('newGame');
    }
  });

  const params = new URLSearchParams(location.search);
  const joinParam = (params.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (joinParam) history.replaceState(null, '', '/');
  if (session && (!joinParam || joinParam === session.code)) { screen = 'room'; connect(); }
  else if (joinParam) { ui.joinCode = joinParam; screen = 'join'; }
  render();
})();

