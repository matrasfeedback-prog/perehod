"use strict";
const TG = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined
  ? window.Telegram.WebApp : null;
if (TG) {
  try {
    TG.ready();
    TG.expand();
    if (TG.disableVerticalSwipes) TG.disableVerticalSwipes();
  } catch (e) {}
}

var LANG = "ru";
try { LANG = localStorage.getItem("perehod-lang") || "ru"; } catch (e) {}
if (!I18N[LANG]) LANG = "ru";
const T = k => (I18N[LANG][k] !== undefined ? I18N[LANG][k] : I18N.ru[k]);

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const W = 420, H = 640, SW = 66;
const $ = id => document.getElementById(id);
const ovMenu = $("ov-menu"), ovShop = $("ov-shop"), ovOver = $("ov-over");

let state = "menu";
let level = 1, lives = 3, coins = 0, scoreTotal = 0;
let up = { speed: 0, brake: 0, handle: 0 };
let flash = 0, flashMsg = "";
let player = {}, cars = [], lanes = [], keys = {};

const MINV = 46;
const KMH = 0.17;
const CWX = W / 2 - 78, CWW = 156;
let runFast = 0, runSlow = 0, runZebra = 0, offZebra = false;
let runClose = 0, runPolice = 0, levelT = 0, policePlan = null;
let particles = [], floats = [];

const cost = l => 40 * Math.pow(2, l);
const LIFE_COST = 200;
const VERSION = "0.3";

let audioCtx = null, soundOn = true;
try { soundOn = localStorage.getItem("perehod-sound") !== "off"; } catch (e) {}
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type, vol, when, slideTo) {
  const a = ac(), o = a.createOscillator(), g = a.createGain();
  const t0 = a.currentTime + (when || 0);
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noiseBurst(dur, vol, when) {
  const a = ac(), t0 = a.currentTime + (when || 0);
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource(); src.buffer = buf;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g); g.connect(a.destination);
  src.start(t0);
}
function sfx(n) {
  if (!soundOn) return;
  try {
    switch (n) {
      case "go":    tone(440, 0.08, "square", 0.13); tone(660, 0.1, "square", 0.13, 0.09); break;
      case "honk":  tone(370, 0.18, "sawtooth", 0.2); tone(311, 0.18, "sawtooth", 0.16); break;
      case "crash": noiseBurst(0.35, 0.3); tone(170, 0.32, "sawtooth", 0.24, 0, 55); break;
      case "siren": tone(620, 0.28, "sine", 0.14, 0, 880); tone(880, 0.28, "sine", 0.14, 0.3, 620); break;
      case "fine":  tone(220, 0.12, "square", 0.18); tone(175, 0.22, "square", 0.18, 0.13); break;
      case "win":   tone(523, 0.09, "square", 0.13); tone(659, 0.09, "square", 0.13, 0.1); tone(784, 0.16, "square", 0.13, 0.2); break;
      case "buy":   tone(880, 0.06, "square", 0.11); tone(1318, 0.09, "square", 0.11, 0.07); break;
      case "over":  tone(392, 0.16, "triangle", 0.18); tone(330, 0.16, "triangle", 0.18, 0.18); tone(262, 0.34, "triangle", 0.18, 0.36); break;
    }
  } catch (e) {}
}
function setSoundIcon() { $("btn-sound").textContent = soundOn ? "🔊" : "🔇"; }
const laneCount = () => Math.min(level, 8);
const maxV   = () => 120 + up.speed * 30;
const accelF = () => 95 + up.speed * 32;
const brakeF = () => 75 + up.brake * 70;
const latV   = () => 85 + up.handle * 34;

function fitCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();

function applyLang() {
  document.documentElement.lang = LANG;
  $("brand").textContent = T("title");
  $("t-title").textContent = T("title");
  $("btn-start").textContent = T("start");
  $("btn-rules").textContent = T("rules");
  $("t-rules-h").textContent = T("rules");
  $("rules-body").innerHTML = T("rulesHtml");
  $("btn-rules-back").textContent = T("back");
  $("t-over-h").textContent = T("overH");
  $("t-over-pts").textContent = T("overPts");
  $("btn-share").textContent = T("share");
  $("btn-retry").textContent = T("retry");
  $("t-brake").textContent = T("brake");
  $("t-accel").textContent = T("accel");
  $("t-keys").textContent = T("keysHint");
  hud();
  const box = $("langs"); box.innerHTML = "";
  for (const code in I18N) {
    const b = document.createElement("button");
    b.textContent = I18N[code].langName;
    if (code === LANG) b.className = "on";
    b.onclick = () => {
      LANG = code;
      try { localStorage.setItem("perehod-lang", code); } catch (e) {}
      applyLang();
    };
    box.appendChild(b);
  }
}

function setupLevel() {
  cars = []; lanes = [];
  const n = laneCount(), roadH = H - 2 * SW, lh = roadH / n;
  for (let i = 0; i < n; i++) {
    lanes.push({
      y: SW + i * lh, h: lh, dir: i % 2 ? 1 : -1,
      speed: (58 + level * 13) * (0.8 + Math.random() * 0.5),
      t: Math.random() * 1.5,
      gap: Math.max(0.85, 2.7 - level * 0.18)
    });
  }
  player = { x: W / 2, y: H - SW / 2, v: MINV, vx: 0, w: 14, h: 30 };
  runFast = 0; runSlow = 0; runZebra = 0; offZebra = false;
  runClose = 0; runPolice = 0; levelT = 0;
  particles = []; floats = [];
  policePlan = null;
  if (level >= 3 && Math.random() < 0.15) {
    policePlan = { lane: Math.floor(Math.random() * n), delay: 1.2 + Math.random() * 1.5, done: false };
  }
  lanes.forEach((l, i) => { for (let k = 0; k < 2; k++) if (Math.random() < 0.5) spawnCar(l, i, Math.random() * W); });
}

function spawnCar(l, li, x) {
  const cw = 46 + Math.random() * 26, ch = Math.min(l.h * 0.6, 26);
  if (x === undefined) x = l.dir > 0 ? -cw - 10 : W + 10;
  for (const o of cars) {
    if (o.lane === li && x < o.x + o.w + 18 && x + cw > o.x - 18) return;
  }
  const cols = ["#4a7fb5", "#b5564a", "#c9a24a", "#5f8f5a", "#7a6fb0", "#8a8a8a"];
  const base = l.speed * (0.85 + Math.random() * 0.3);
  cars.push({
    x, y: l.y + l.h / 2, w: cw, h: ch, lane: li, dir: l.dir,
    base, v: base * l.dir, brakeT: 0, braking: false,
    col: cols[Math.floor(Math.random() * cols.length)]
  });
}

function spawnPolice(li) {
  const l = lanes[li];
  const cw = 58, ch = Math.min(l.h * 0.6, 26);
  const base = Math.min(58, l.speed * 0.6);
  cars.push({
    x: l.dir > 0 ? -cw - 10 : W + 10,
    y: l.y + l.h / 2, w: cw, h: ch, lane: li, dir: l.dir,
    base, v: base * l.dir, brakeT: 0, braking: false,
    police: true, col: "#e8e6df"
  });
  floats.push({ x: W / 2, y: SW + 34, txt: T("policeWarn"), life: 2.4, col: "#5aa9ff" });
  sfx("siren");
}

function moveTraffic(dt) {
  lanes.forEach((l, i) => {
    l.t -= dt;
    if (l.t <= 0) { spawnCar(l, i); l.t = l.gap * (0.7 + Math.random() * 0.8); }
  });
  cars.forEach(c => {
    if (!c.police) {
      if (c.brakeT > 0) c.brakeT -= dt;
      else if (Math.random() < 0.07 * dt) c.brakeT = 0.5 + Math.random() * 0.9;
    }
    c.braking = c.brakeT > 0;
    const target = (c.brakeT > 0 ? 0.45 : 1) * c.base;
    const cur = Math.abs(c.v);
    const nv = cur < target ? Math.min(target, cur + 90 * dt) : Math.max(target, cur - 170 * dt);
    c.v = nv * c.dir;
    if (c.rage > 0) c.rage -= dt;
    c.x += c.v * dt;
  });
  const byLane = {};
  cars.forEach(c => (byLane[c.lane] = byLane[c.lane] || []).push(c));
  for (const k in byLane) {
    const arr = byLane[k].sort((a, b) => a.dir > 0 ? b.x - a.x : a.x - b.x);
    for (let i = 1; i < arr.length; i++) {
      const lead = arr[i - 1], c = arr[i];
      const gap = c.dir > 0 ? lead.x - (c.x + c.w) : c.x - (lead.x + lead.w);
      if (gap < 20) {
        if (Math.abs(c.v) > Math.abs(lead.v)) { c.v = Math.abs(lead.v) * c.dir; c.braking = true; }
        if (gap < 8) c.x = c.dir > 0 ? lead.x - c.w - 8 : lead.x + lead.w + 8;
      }
    }
  }
  cars = cars.filter(c => c.x > -150 && c.x < W + 150);
}

function fx(dt) {
  particles = particles.filter(q => (q.life -= dt) > 0);
  particles.forEach(q => {
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vy -= 22 * dt; q.r += 14 * dt;
  });
  floats = floats.filter(f => (f.life -= dt) > 0);
  floats.forEach(f => f.y -= 28 * dt);
}

function hud() {
  $("h-level").textContent = T("lvl") + " " + level;
  $("h-score").textContent = scoreTotal + " " + T("pts");
  $("h-lives").textContent = "♥".repeat(lives) + "♡".repeat(Math.max(0, 3 - lives));
}

function showShop(d) {
  state = "shop";
  const row = (label, val, col) =>
    '<div style="display:flex;justify-content:space-between;gap:18px"><span>' + label +
    '</span><b style="color:' + col + '">' + val + "</b></div>";
  let rows = row(T("shopDone"), "+" + d.base, "var(--teal)");
  if (d.speed > 0)  rows += row(T("rowSpeed"), "+" + d.speed, "var(--teal)");
  if (d.speed < 0)  rows += row(T("rowSpeed"), "−" + (-d.speed), "var(--danger)");
  if (d.close > 0)  rows += row(T("rowClose"), "+" + d.close, "var(--teal)");
  if (d.zebra > 0)  rows += row(T("rowZebra"), "−" + d.zebra, "var(--danger)");
  if (d.police > 0) rows += row(T("rowPolice"), "−" + d.police, "var(--danger)");
  rows += '<div style="display:flex;justify-content:space-between;gap:18px;border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span>' +
    T("rowTotal") + "</span><b>+" + d.gain + "</b></div>";
  $("breakdown").innerHTML = rows;
  $("shop-stats").innerHTML = T("balance") + ": <b>" + coins + "</b> · " + T("earned") + ": <b>" + scoreTotal + "</b>";
  const box = $("shop"); box.innerHTML = "";
  const ups = { speed: T("upSpeed"), brake: T("upBrake"), handle: T("upHandle") };
  for (const k in ups) {
    const lvl = up[k], c = cost(lvl), maxed = lvl >= 5;
    const rowEl = document.createElement("div");
    rowEl.className = "shop-row";
    rowEl.innerHTML = '<div class="info"><div class="name">' + ups[k][0] +
      ' <span style="color:var(--muted);font-weight:400;font-size:12px">· ' + ups[k][1] + "</span></div>" +
      '<div class="pips">' + "●".repeat(lvl) + "○".repeat(5 - lvl) + "</div></div>";
    const b = document.createElement("button");
    if (maxed) { b.textContent = T("maxed"); b.disabled = true; }
    else {
      b.textContent = c + " " + T("costSuf");
      b.disabled = coins < c;
      b.onclick = () => { coins -= c; up[k]++; sfx("buy"); showShop(d); };
    }
    rowEl.appendChild(b); box.appendChild(rowEl);
  }
  const lifeRow = document.createElement("div");
  lifeRow.className = "shop-row";
  lifeRow.innerHTML = '<div class="info"><div class="name">' + T("lifeName") +
    ' <span style="color:var(--muted);font-weight:400;font-size:12px">· ' + T("lifeDesc") + "</span></div>" +
    '<div class="pips" style="color:var(--danger)">' + "♥".repeat(lives) + "♡".repeat(Math.max(0, 3 - lives)) + "</div></div>";
  const lb = document.createElement("button");
  if (lives >= 3) { lb.textContent = T("maxed"); lb.disabled = true; }
  else {
    lb.textContent = LIFE_COST + " " + T("costSuf");
    lb.disabled = coins < LIFE_COST;
    lb.onclick = () => { coins -= LIFE_COST; lives++; sfx("buy"); hud(); showShop(d); };
  }
  lifeRow.appendChild(lb); box.appendChild(lifeRow);
  $("btn-next").textContent = T("nextLvl").replace("{n}", level);
  ovShop.classList.remove("hidden");
}

let shareCanvas = null;

function buildShareCard() {
  const c = document.createElement("canvas");
  c.width = 800; c.height = 450;
  const g = c.getContext("2d");
  g.fillStyle = "#15171c"; g.fillRect(0, 0, 800, 450);
  g.fillStyle = "#22252b"; g.fillRect(40, 0, 180, 450);
  g.strokeStyle = "rgba(232,230,223,0.3)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 0); g.lineTo(40, 450); g.moveTo(220, 0); g.lineTo(220, 450); g.stroke();
  g.fillStyle = "rgba(232,230,223,0.75)";
  for (let y = 16; y < 450; y += 46) g.fillRect(40, y, 180, 24);
  g.save();
  g.translate(130, 226); g.scale(3.4, 3.4);
  g.fillStyle = "#0e0f12";
  g.fillRect(-2.5, -15, 5, 9);
  g.fillRect(-2.5, 7, 5, 9);
  g.strokeStyle = "#ff6b4a"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -11); g.lineTo(0, 11); g.stroke();
  g.strokeStyle = "#0e0f12"; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-8, -10); g.lineTo(8, -10); g.stroke();
  g.fillStyle = "#2fd4a7";
  g.beginPath(); g.arc(0, -2, 6, 0, 7); g.fill();
  g.fillStyle = "#f0c060";
  g.beginPath(); g.arc(0, -5, 3.5, 0, 7); g.fill();
  g.restore();
  g.textAlign = "left";
  g.fillStyle = "#ff6b4a";
  g.font = "700 38px -apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText(T("title").toUpperCase(), 280, 100);
  g.fillStyle = "#2fd4a7";
  g.font = "700 116px -apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText(String(scoreTotal), 276, 228);
  g.fillStyle = "#9a9da6";
  g.font = "26px -apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText(T("overPts"), 282, 268);
  g.fillStyle = "#f2f1ec";
  g.font = "600 28px -apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText(T("overLvls").replace("{n}", level - 1), 280, 340);
  g.fillStyle = "#5b5f68";
  g.font = "20px -apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText("🚴", 280, 398);
  g.fillText(T("title") + " · Telegram", 312, 398);
  return c;
}

function gameOver() {
  state = "over";
  sfx("over");
  let best = 0;
  try {
    best = +(localStorage.getItem("perehod-best") || 0);
    if (scoreTotal > best) { best = scoreTotal; localStorage.setItem("perehod-best", best); }
  } catch (e) {}
  $("final-score").textContent = scoreTotal;
  $("final-levels").textContent = T("overLvls").replace("{n}", level - 1);
  $("final-best").textContent = best ? T("record").replace("{n}", best) : "";
  shareCanvas = buildShareCard();
  $("share-card").src = shareCanvas.toDataURL("image/png");
  ovOver.classList.remove("hidden");
}

$("btn-share").onclick = async () => {
  const text = T("shareText").replace("{s}", scoreTotal).replace("{l}", level - 1);
  if (shareCanvas && navigator.canShare) {
    try {
      const blob = await new Promise(r => shareCanvas.toBlob(r, "image/png"));
      const file = new File([blob], "perehod.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  const url = "https://t.me/share/url?url=" + encodeURIComponent(location.href) +
    "&text=" + encodeURIComponent(text);
  if (TG) TG.openTelegramLink(url);
  else window.open(url, "_blank");
};
$("btn-start").onclick = () => { ovMenu.classList.add("hidden"); setupLevel(); state = "ready"; };
$("btn-rules").onclick = () => { ovMenu.classList.add("hidden"); $("ov-rules").classList.remove("hidden"); };
$("btn-rules-back").onclick = () => { $("ov-rules").classList.add("hidden"); ovMenu.classList.remove("hidden"); };
$("btn-next").onclick = () => { ovShop.classList.add("hidden"); setupLevel(); state = "ready"; };
$("btn-retry").onclick = () => {
  level = 1; lives = 3; coins = 0; scoreTotal = 0;
  up = { speed: 0, brake: 0, handle: 0 };
  hud(); ovOver.classList.add("hidden"); setupLevel(); state = "ready";
};

function update(dt) {
  levelT += dt;
  if (policePlan && !policePlan.done && levelT > policePlan.delay) {
    policePlan.done = true;
    const pl = lanes[policePlan.lane];
    if (player.y > pl.y + pl.h + 50) spawnPolice(policePlan.lane);
  }
  moveTraffic(dt);
  fx(dt);

  const p = player;
  if (keys.accel)      p.v = Math.min(maxV(), p.v + accelF() * dt);
  else if (keys.brake) p.v = Math.max(MINV, p.v - brakeF() * dt);
  else                 p.v = Math.max(MINV, p.v - 25 * dt);

  const targ = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  p.vx += (targ * latV() - p.vx) * Math.min(1, (4 + up.handle) * dt);
  p.x = Math.max(p.w, Math.min(W - p.w, p.x + p.vx * dt));
  p.y -= p.v * dt;

  const onRoad = p.y > SW && p.y < H - SW;
  offZebra = onRoad && (p.x < CWX - 8 || p.x > CWX + CWW + 8);
  if (onRoad) {
    if (offZebra) runZebra += 16 * dt;
    if (p.v > 95) runFast += 6 * dt;
    else if (p.v < 58) runSlow += 4 * dt;
  }

  for (const c of cars) {
    const dx = Math.abs(p.x - c.x - c.w / 2), dy = Math.abs(p.y - c.y);
    if (dx < (p.w + c.w) / 2 && dy < (p.h + c.h) / 2 - 4) {
      lives--; hud(); flash = 1; flashMsg = T("hit");
      sfx("crash");
      if (lives <= 0) { gameOver(); return; }
      player = { x: W / 2, y: H - SW / 2, v: MINV, vx: 0, w: 14, h: 30 };
      runFast = 0; runSlow = 0; runZebra = 0; offZebra = false;
      runClose = 0; particles = []; floats = [];
      state = "ready";
      return;
    }
    const behind = c.dir > 0 ? (p.x < c.x) : (p.x > c.x + c.w);
    if (!c.police && !c.nearDone && !behind && dx < (p.w + c.w) / 2 + 14 && dy < (p.h + c.h) / 2 + 10) {
      c.nearDone = true;
      const pts = 5 + Math.round(level / 2);
      runClose += pts;
      floats.push({ x: p.x, y: p.y - 24, txt: T("closeFloat").replace("{p}", pts), life: 1.3, col: "#2fd4a7" });
      burnDriver(c);
      sfx("honk");
    }
    if (c.police && !c.fined) {
      const inFront = c.dir > 0
        ? (p.x > c.x + c.w - 2 && p.x < c.x + c.w + 32)
        : (p.x < c.x + 2 && p.x > c.x - 32);
      if (inFront && dy < (p.h + c.h) / 2 + 10) {
        c.fined = true;
        runPolice += 30;
        floats.push({ x: p.x, y: p.y - 24, txt: T("policeFine"), life: 1.6, col: "#ff5d5d" });
        sfx("fine");
      }
    }
  }

  if (p.y < SW / 2) {
    const d = {
      base: 30 + level * 20,
      speed: Math.round(runFast - runSlow),
      close: Math.round(runClose),
      zebra: Math.round(runZebra),
      police: Math.round(runPolice)
    };
    d.gain = Math.max(0, d.base + d.speed + d.close - d.zebra - d.police);
    scoreTotal += d.gain; coins += d.gain; level++;
    hud(); flash = 1; flashMsg = "+" + d.gain;
    sfx("win");
    showShop(d);
  }
}

function burnDriver(c) {
  const rage = T("rage");
  c.rage = 1.4;
  c.rageTxt = rage[Math.floor(Math.random() * rage.length)];
  const rear = c.v > 0 ? c.x : c.x + c.w;
  const dir = c.v > 0 ? -1 : 1;
  const cols = ["#8a5a3a", "#b97a45", "#ff8a4a", "#d85a30", "#6e4a2e"];
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: rear, y: c.y + (Math.random() - 0.5) * c.h * 0.6,
      vx: dir * (40 + Math.random() * 70) + (Math.random() - 0.5) * 30,
      vy: -(10 + Math.random() * 40),
      r: 3 + Math.random() * 4,
      life: 0.6 + Math.random() * 0.5,
      col: cols[Math.floor(Math.random() * cols.length)]
    });
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw() {
  ctx.fillStyle = "#2a2d34"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#3c3f47"; ctx.fillRect(0, 0, W, SW); ctx.fillRect(0, H - SW, W, SW);
  ctx.fillStyle = "#22252b"; ctx.fillRect(0, SW, W, H - 2 * SW);

  ctx.setLineDash([16, 14]); ctx.strokeStyle = "#4d515b"; ctx.lineWidth = 2;
  lanes.forEach((l, i) => {
    if (i > 0) { ctx.beginPath(); ctx.moveTo(0, l.y); ctx.lineTo(W, l.y); ctx.stroke(); }
  });
  ctx.setLineDash([]);

  ctx.strokeStyle = offZebra && state === "play" ? "rgba(255,93,93,0.8)" : "rgba(232,230,223,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CWX, SW); ctx.lineTo(CWX, H - SW);
  ctx.moveTo(CWX + CWW, SW); ctx.lineTo(CWX + CWW, H - SW);
  ctx.stroke();
  ctx.fillStyle = "rgba(232,230,223,0.7)";
  for (let y = SW + 8; y < H - SW - 8; y += 26) ctx.fillRect(CWX, y, CWW, 13);

  cars.forEach(c => {
    let sx = 0, sy = 0;
    if (c.rage > 0) { sx = (Math.random() - 0.5) * 3; sy = (Math.random() - 0.5) * 3; }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = c.col;
    roundRect(c.x, c.y - c.h / 2, c.w, c.h, 5); ctx.fill();
    ctx.fillStyle = "rgba(225,238,248,0.85)";
    const fw = c.w * 0.18, off = c.v > 0 ? c.w - fw - 6 : 6;
    ctx.fillRect(c.x + off, c.y - c.h / 2 + 3, fw, c.h - 6);
    ctx.fillStyle = c.rage > 0 ? "#ff5d5d" : "rgba(255,220,130,0.9)";
    const hx = c.dir > 0 ? c.x + c.w - 3 : c.x;
    ctx.fillRect(hx, c.y - c.h / 2 + 2, 3, 5);
    ctx.fillRect(hx, c.y + c.h / 2 - 7, 3, 5);
    const rx = c.dir > 0 ? c.x : c.x + c.w - 3;
    ctx.fillStyle = c.braking ? "#ff3b30" : "rgba(140,45,45,0.55)";
    ctx.fillRect(rx, c.y - c.h / 2 + 2, 3, 5);
    ctx.fillRect(rx, c.y + c.h / 2 - 7, 3, 5);
    if (c.police) {
      const ph = Math.floor(performance.now() / 160) % 2;
      ctx.fillStyle = "#163a8a";
      ctx.fillRect(c.x + 10, c.y - 2, c.w - 20, 4);
      ctx.fillStyle = ph ? "#3b82f6" : "#ff3b30";
      ctx.fillRect(c.x + c.w / 2 - 11, c.y - 4, 9, 8);
      ctx.fillStyle = ph ? "#ff3b30" : "#3b82f6";
      ctx.fillRect(c.x + c.w / 2 + 2, c.y - 4, 9, 8);
    }
    ctx.restore();
    if (c.rage > 0) {
      ctx.globalAlpha = Math.min(1, c.rage);
      ctx.fillStyle = "#ff5d5d";
      ctx.font = "700 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(c.rageTxt, c.x + c.w / 2, c.y - c.h / 2 - 8);
      ctx.globalAlpha = 1;
    }
  });

  particles.forEach(q => {
    ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 1.6));
    ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1;

  floats.forEach(f => {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.col;
    ctx.font = "700 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.txt, f.x, f.y);
  });
  ctx.globalAlpha = 1;

  if (state === "play" || state === "ready" || state === "shop") drawBike();

  if (flash > 0) {
    ctx.fillStyle = "rgba(0,0,0," + (0.35 * flash) + ")"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.font = "700 28px sans-serif"; ctx.textAlign = "center";
    ctx.globalAlpha = Math.min(1, flash);
    ctx.fillText(flashMsg, W / 2, H / 2);
    ctx.globalAlpha = 1;
    flash -= 0.015;
  }

  if (state === "ready") {
    ctx.fillStyle = "rgba(242,241,236,0.95)";
    ctx.font = "700 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(T("ready"), W / 2, H - SW - 16);
  }
  if (state === "play") {
    ctx.fillStyle = "rgba(242,241,236,0.85)"; ctx.font = "12px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(Math.round(player.v * KMH) + " " + T("kmh"), 10, H - 10);
    if (offZebra) {
      ctx.fillStyle = "#ff5d5d"; ctx.font = "700 15px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(T("offZebra"), W / 2, 24);
    }
  }
}

function drawBike() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.vx / 600);
  ctx.fillStyle = "#0e0f12";
  ctx.fillRect(-2.5, -15, 5, 9);
  ctx.fillRect(-2.5, 7, 5, 9);
  ctx.strokeStyle = "#ff6b4a"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 11); ctx.stroke();
  ctx.strokeStyle = "#0e0f12"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.stroke();
  ctx.fillStyle = "#2fd4a7";
  ctx.beginPath(); ctx.arc(0, -2, 6, 0, 7); ctx.fill();
  ctx.fillStyle = "#f0c060";
  ctx.beginPath(); ctx.arc(0, -5, 3.5, 0, 7); ctx.fill();
  ctx.restore();
}

let last = performance.now();
function loop(t) {
  const dt = Math.min((t - last) / 1000, 0.05); last = t;
  if (state === "play") update(dt);
  else if (state === "ready") {
    moveTraffic(dt);
    fx(dt);
    if (keys.accel) { state = "play"; sfx("go"); }
  }
  draw();
  requestAnimationFrame(loop);
}

const km = {
  ArrowUp: "accel", KeyW: "accel",
  ArrowDown: "brake", KeyS: "brake",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right"
};
addEventListener("keydown", e => { const k = km[e.code]; if (k) { keys[k] = 1; e.preventDefault(); } });
addEventListener("keyup",   e => { const k = km[e.code]; if (k) keys[k] = 0; });

document.querySelectorAll("#controls button").forEach(b => {
  const k = b.dataset.k;
  const on  = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); keys[k] = 1; b.classList.add("hold"); };
  const off = () => { keys[k] = 0; b.classList.remove("hold"); };
  b.addEventListener("pointerdown", on);
  ["pointerup", "pointercancel"].forEach(ev => b.addEventListener(ev, off));
  b.addEventListener("contextmenu", e => e.preventDefault());
});

$("btn-sound").onclick = () => {
  soundOn = !soundOn;
  try { localStorage.setItem("perehod-sound", soundOn ? "on" : "off"); } catch (e) {}
  if (soundOn) sfx("buy");
  setSoundIcon();
};
$("ver").textContent = "v" + VERSION;
setSoundIcon();
applyLang();
setupLevel();
hud();
requestAnimationFrame(loop);