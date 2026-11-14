// Minimal QR Code generator (byte mode, ECC level M, versions 1–9). No dependencies.
// Algorithm after the public QR specification (ISO/IEC 18004).
(function (global) {
  'use strict';
  // [total codewords, ec per block, [blocks, dataPerBlock], [blocks, dataPerBlock]?]
  const TABLE = [null,
    [26, 10, [1, 16]], [44, 16, [1, 28]], [70, 26, [1, 44]], [100, 18, [2, 32]], [134, 24, [2, 43]],
    [172, 16, [4, 27]], [196, 18, [4, 31]], [242, 22, [2, 38], [2, 39]], [292, 22, [3, 36], [2, 37]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]];

  function gmul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gmul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f); }); }
    return r;
  }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    for (; ver <= 9; ver++) { if (dataCap(ver) * 8 >= 4 + 8 + bytes.length * 8) break; }
    if (ver > 9) throw new Error('QR: text too long');
    const cap = dataCap(ver);
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0xEC; data.length < cap; p ^= 0xEC ^ 0x11) data.push(p);

    // split into blocks + error correction
    const t = TABLE[ver]; const ecLen = t[1]; const div = rsDivisor(ecLen);
    const blocks = []; let k = 0;
    [t[2], t[3]].filter(Boolean).forEach(([cnt, len]) => {
      for (let i = 0; i < cnt; i++) { const d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, div) }); }
    });
    const out = [];
    const maxD = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < maxD; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach(b => out.push(b.e[i]));

    const size = ver * 4 + 17;
    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = build(ver, size, out, mask);
      const s = penalty(m, size);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return { size, modules: best };
  }
  function dataCap(ver) { const t = TABLE[ver]; return [t[2], t[3]].filter(Boolean).reduce((s, [c, l]) => s + c * l, 0); }

  function build(ver, size, data, mask) {
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy; const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = ALIGN[ver]; const last = al.length - 1;
    for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const format = (msk) => {
      const d = (0 << 3) | msk; // ECC M = 00
      let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412; const g = (i) => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, g(i));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
      set(8, size - 8, true);
    };
    format(0);
    if (ver >= 7) {
      let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1; const a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); }
    }
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j; const up = ((right + 1) & 2) === 0; const y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < data.length * 8) { mod[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    const conds = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && conds[mask](x, y)) mod[y][x] = !mod[y][x];
    format(mask);
    return mod;
  }
  function penalty(m, size) {
    let s = 0, dark = 0;
    for (let y = 0; y < size; y++) {
      let runX = 1, runY = 1;
      for (let x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (x > 0) {
          if (m[y][x] === m[y][x - 1]) { runX++; if (runX === 5) s += 3; else if (runX > 5) s++; } else runX = 1;
          if (m[x][y] === m[x - 1][y]) { runY++; if (runY === 5) s += 3; else if (runY > 5) s++; } else runY = 1;
        }
        if (x < size - 1 && y < size - 1) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) s += 3; }
      }
    }
    s += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return s;
  }
  function toSVG(text, opts) {
    opts = opts || {}; const q = encode(text); const border = 3; const n = q.size + border * 2;
    let p = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) p += `M${x + border},${y + border}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" class="qr"><rect width="100%" height="100%" fill="${opts.bg || '#f3e9d2'}"/><path d="${p}" fill="${opts.fg || '#1d1a17'}"/></svg>`;
  }
  global.QR = { encode, toSVG };
  if (typeof module !== 'undefined') module.exports = global.QR;
})(typeof window !== 'undefined' ? window : globalThis);
