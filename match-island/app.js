"use strict";
const E = window.MatchEngine;
const $ = id => document.getElementById(id);
const MODES = {
  classic: { name: "經典三消", en: "CLASSIC MATCH", icon: "🍊", desc: "交換、連線，享受連鎖驚喜", target: 1800, moves: 24, instruction: "點選兩個相鄰物品交換，連成三個就能消除。" },
  blast: { name: "群組消除", en: "POP & BLAST", icon: "💥", desc: "輕點同類，一次消個痛快", target: 2400, moves: 20, instruction: "點選兩個以上相鄰的同類物品，群組越大分數越高。" },
  triple: { name: "收納三消", en: "TRIPLE TOGETHER", icon: "🧺", desc: "七格收納，考驗你的安排", target: 1800, moves: 0, instruction: "點選收入收納槽，三個同類自動消除。別讓七格裝滿！" },
  timed: { name: "限時衝分", en: "90 SECOND RUSH", icon: "⚡", desc: "90 秒倒數，挑戰手速極限", target: 3000, moves: 0, instruction: "90 秒內達成目標！點選或滑動交換相鄰物品。" }
};
const THEMES = [
  { name: "鮮果日常", items: ["🍊", "🍓", "🥝", "🍋", "🍇", "🫐"], names: ["橘子", "草莓", "奇異果", "檸檬", "葡萄", "藍莓"] },
  { name: "甜點時光", items: ["🍩", "🧁", "🍪", "🍰", "🍬", "🍦"], names: ["甜甜圈", "杯子蛋糕", "餅乾", "蛋糕", "糖果", "冰淇淋"] },
  { name: "海洋假期", items: ["🐠", "🐙", "🐬", "🦀", "🐚", "🐢"], names: ["小魚", "章魚", "海豚", "螃蟹", "貝殼", "海龜"] },
  { name: "花園漫步", items: ["🌻", "🌸", "🌷", "🌿", "🍄", "🌼"], names: ["向日葵", "櫻花", "鬱金香", "綠葉", "蘑菇", "小花"] },
  { name: "毛茸朋友", items: ["🐱", "🐶", "🐼", "🦊", "🐸", "🐰"], names: ["貓咪", "小狗", "熊貓", "狐狸", "青蛙", "兔子"] }
];
const COLORS = ["#fbe7c2", "#f9ddd1", "#e0ebc8", "#f8edbc", "#e7dfee", "#dce8ec"];
const STORAGE = "match-island-records-v1";
let records = {};
try { const data = JSON.parse(localStorage.getItem(STORAGE)); if (data && typeof data === "object") records = data; } catch { /* Storage is optional. */ }
let state, theme = 0, epoch = 0, soundOn = false, audio, dragStart = null, suppressClick = false;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const format = n => n.toLocaleString("zh-TW");
function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function beep(combo = 1) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(420 + Math.min(combo, 8) * 110, audio.currentTime);
    gain.gain.setValueAtTime(.065, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .17);
    osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .18);
  } catch { /* Audio is not required for gameplay. */ }
}
function saveRecord() {
  if (state.score <= (Number(records[state.mode]) || 0)) return;
  records[state.mode] = state.score;
  try { localStorage.setItem(STORAGE, JSON.stringify(records)); } catch { $("save-note").textContent = "此瀏覽器無法儲存紀錄，遊戲仍可繼續"; }
}
function newGame(mode = state?.mode || "classic") {
  epoch++;
  const config = MODES[mode];
  state = { mode, board: E.create(), score: 0, moves: config.moves, tray: [], remaining: 90, started: false, deadline: 0, paused: false, ended: false, busy: false, selected: null, hinted: [], hammer: false, tools: { hint: 3, shuffle: 2, hammer: 3 } };
  if (mode === "triple") {
    // Every item belongs to a complete triple, so the board is always solvable.
    state.board = shuffled(Array.from({ length: 60 }, (_, i) => ({ type: Math.floor(i / 3) % 6, special: null })));
    state.board.push(null, null, null, null);
  }
  $("overlay").hidden = true;
  $("combo").classList.remove("show");
  $("mode-eyebrow").textContent = config.en;
  $("game-title").textContent = config.name;
  $("target").textContent = mode === "triple" ? "清空棋盤" : format(config.target);
  $("resource-label").textContent = mode === "timed" ? "剩餘秒數" : mode === "triple" ? "剩餘物品" : "剩餘步數";
  $("status").textContent = config.instruction;
  document.querySelectorAll("[data-mode]").forEach(el => { el.classList.toggle("active", el.dataset.mode === mode); if (el.classList.contains("mode-button")) el.setAttribute("aria-pressed", String(el.dataset.mode === mode)); });
  const notes = mode === "triple"
    ? [["🧺", "先想再收", "留意槽內物品，優先湊齊三個。"], ["✨", "三個一組", "每組得到 90 分，清空全盤獲勝。"], ["⚒", "小槌子救援", "優先移除槽內同類物品，空槽時移除棋盤同類。"]]
    : mode === "blast"
      ? [["👆", "兩個就能消", "上下左右相連的同類一起消除。"], ["💥", "越大越划算", "群組得分為數量平方 × 10。"], ["⤨", "打開新局面", "沒有可消群組時自動洗牌。"]]
      : [["↔", "四連變火箭", "連成四個，獲得整排消除。"], ["🌈", "五連有驚喜", "連成五個，獲得同色全消。"], ["✦", "連鎖加倍", "掉落引發的連鎖，得分倍率持續增加。"]];
  $("guide").innerHTML = notes.map(([icon, title, desc]) => `<div class="guide-row"><span>${icon}</span><div><b>${title}</b>${desc}</div></div>`).join("");
  render();
}
function render() {
  const t = THEMES[theme];
  $("board").innerHTML = state.board.map((tile, i) => `<button class="tile${!tile ? " empty" : ""}${state.selected === i ? " selected" : ""}${state.hinted.includes(i) ? " hinted" : ""}${tile?.special ? ` special ${tile.special}` : ""}" style="--tile-bg:${tile ? COLORS[tile.type] : "transparent"}" data-index="${i}" aria-label="第 ${Math.floor(i / 8) + 1} 列，第 ${i % 8 + 1} 格${tile ? `，${t.names[tile.type]}${tile.special === "rocket" ? "火箭" : tile.special === "rainbow" ? "彩虹" : ""}` : "，空格"}" ${!tile || state.paused || state.ended || state.busy ? "disabled" : ""}>${tile ? tile.special === "rainbow" ? "🌈" : t.items[tile.type] : ""}</button>`).join("");
  $("board").classList.toggle("hammer-mode", state.hammer);
  $("tray").hidden = state.mode !== "triple";
  $("tray").innerHTML = Array.from({ length: 7 }, (_, i) => `<span>${state.tray[i] !== undefined ? t.items[state.tray[i]] : ""}</span>`).join("");
  updateStats();
}
function updateStats() {
  $("score").textContent = format(state.score);
  $("best").textContent = format(Number(records[state.mode]) || 0);
  $("resource").textContent = state.mode === "timed" ? Math.ceil(state.remaining) : state.mode === "triple" ? state.board.filter(Boolean).length : state.moves;
  $("goal-progress").style.width = `${state.mode === "triple" ? (60 - state.board.filter(Boolean).length) / 60 * 100 : Math.min(100, state.score / MODES[state.mode].target * 100)}%`;
  for (const tool of ["hint", "shuffle", "hammer"]) {
    $(tool + "-count").textContent = state.tools[tool];
    $(tool).disabled = state.ended || state.paused || state.busy || !state.tools[tool];
  }
  $("hammer").classList.toggle("armed", state.hammer);
  $("pause").disabled = state.ended;
  $("pause").textContent = state.paused ? "▷" : "Ⅱ";
  $("pause").setAttribute("aria-label", state.paused ? "繼續遊戲" : "暫停遊戲");
}
function startClock() {
  if (!state.started) {
    state.started = true;
    if (state.mode === "timed") state.deadline = performance.now() + state.remaining * 1000;
  }
}
function showOverlay(icon, title, text, label) {
  $("overlay-icon").textContent = icon; $("overlay-title").textContent = title;
  $("overlay-text").textContent = text; $("overlay-action").textContent = label;
  $("overlay").hidden = false;
}
function endGame(won) {
  state.ended = true; state.busy = false; state.selected = null;
  saveRecord(); render();
  showOverlay(won ? "🏝️" : "🌱", won ? "太棒了，小島任務完成！" : "休息一下，再挑戰一次。", `本局得到 ${format(state.score)} 分\n${won ? "你又收集了一份好心情。" : state.mode === "triple" ? "收納槽滿了。下次試著先湊齊槽內的物品！" : "每一局都是新的可能，你一定能找到更好的連鎖。"}`, "再來一局 →");
}
function checkEnd() {
  if (state.ended) return true;
  if (state.mode === "triple") {
    if (!state.board.some(Boolean) && !state.tray.length) { endGame(true); return true; }
    if (state.tray.length >= 7) { endGame(false); return true; }
  } else if (state.score >= MODES[state.mode].target) { endGame(true); return true; }
  else if ((state.mode !== "timed" && state.moves <= 0) || (state.mode === "timed" && state.remaining <= 0)) { endGame(false); return true; }
  return false;
}
function flourish(n, combo) {
  if (combo > 1 || n >= 5) {
    $("combo").textContent = combo > 1 ? `連鎖 ×${combo} !` : `${n} 個一起消！`;
    $("combo").classList.remove("show"); void $("combo").offsetWidth; $("combo").classList.add("show");
  }
  beep(combo);
}
function expandSpecials(indices) {
  const cells = new Set(indices), queue = [...cells];
  for (let p = 0; p < queue.length; p++) {
    const i = queue[p], tile = state.board[i];
    const more = tile?.special === "rocket" ? Array.from({ length: 8 }, (_, c) => Math.floor(i / 8) * 8 + c)
      : tile?.special === "rainbow" ? state.board.flatMap((t, j) => t?.type === tile.type ? [j] : []) : [];
    more.forEach(j => { if (!cells.has(j)) { cells.add(j); queue.push(j); } });
  }
  return [...cells];
}
async function clearCells(cells, combo, token, creation = null, blast = false) {
  const expanded = expandSpecials(cells);
  state.score += blast ? expanded.length ** 2 * 10 : expanded.length * 30 * combo;
  expanded.forEach(i => $("board").children[i]?.classList.add("clearing"));
  flourish(expanded.length, combo); saveRecord(); updateStats();
  await wait(190);
  while (token === epoch && state.paused && !state.ended) await wait(100);
  if (token !== epoch || state.ended) return false;
  expanded.forEach(i => state.board[i] = null);
  if (creation) state.board[creation.i] = { type: creation.type, special: creation.special };
  E.refill(state.board); render();
  await wait(120);
  while (token === epoch && state.paused && !state.ended) await wait(100);
  return token === epoch && !state.ended;
}
async function settle(token, initial = null, preferred = null) {
  let combo = 1;
  if (initial) {
    if (!await clearCells(initial, combo++, token, null, state.mode === "blast")) return;
  }
  if (state.mode !== "blast") {
    let match = E.matches(state.board);
    while (match.cells.length) {
      const run = match.runs.find(r => r.length >= 4);
      const creation = run ? { i: preferred !== null && run.includes(preferred) ? preferred : run[Math.floor(run.length / 2)], type: state.board[run[0]].type, special: run.length >= 5 ? "rainbow" : "rocket" } : null;
      if (!await clearCells(match.cells, combo++, token, creation)) return;
      match = E.matches(state.board); preferred = null;
    }
  }
  if (token !== epoch || state.ended) return;
  state.busy = false;
  if (!checkEnd()) {
    if (!E.move(state.board, state.mode).length) { state.board = E.create(); $("status").textContent = "沒有可行操作，已免費替你重新排列！"; }
    else $("status").textContent = combo > 2 ? `漂亮！完成 ${combo - 1} 次連鎖。繼續收集快樂吧。` : MODES[state.mode].instruction;
    render();
  }
}
async function swap(a, b) {
  if (!E.adjacent(a, b)) { state.selected = b; render(); return; }
  state.busy = true; state.selected = null; state.hinted = []; startClock();
  const token = epoch;
  [state.board[a], state.board[b]] = [state.board[b], state.board[a]];
  render();
  if (!E.matches(state.board).cells.length) {
    $("status").textContent = "這次沒有連成三個，已換回；不扣步數。";
    await wait(220);
    while (token === epoch && state.paused && !state.ended) await wait(100);
    if (token !== epoch || state.ended) return;
    [state.board[a], state.board[b]] = [state.board[b], state.board[a]];
    state.busy = false; render(); return;
  }
  if (state.mode !== "timed") state.moves--;
  await settle(token, null, b);
}
function collect(i) {
  const type = state.board[i].type;
  state.board[i] = null; state.tray.push(type);
  if (state.tray.filter(t => t === type).length >= 3) { state.tray = state.tray.filter(t => t !== type); state.score += 90; flourish(3, 1); saveRecord(); }
  else beep(1);
  render(); checkEnd();
}
async function activate(i) {
  if (state.busy || state.paused || state.ended || !state.board[i]) return;
  startClock(); state.hinted = [];
  if (state.hammer) {
    state.hammer = false; state.tools.hammer--; state.selected = null;
    if (state.mode === "triple") {
      const type = state.tray.length ? state.tray[0] : state.board[i].type;
      state.tray = state.tray.filter(t => t !== type);
      state.board = state.board.map(t => t?.type === type ? null : t);
      state.score += 90; saveRecord(); render(); checkEnd(); return;
    }
    state.busy = true; render(); await settle(epoch, [i]); return;
  }
  if (state.mode === "triple") { collect(i); return; }
  if (state.board[i].special) { state.selected = null; state.busy = true; render(); await settle(epoch, [i]); return; }
  if (state.mode === "blast") {
    const group = E.group(state.board, i);
    if (group.length < 2) { $("status").textContent = "找找相連的同類物品，至少兩個才能一起消除。"; return; }
    state.moves--; state.busy = true; render(); await settle(epoch, group); return;
  }
  if (state.selected === i) { state.selected = null; render(); }
  else if (state.selected === null) { state.selected = i; render(); }
  else await swap(state.selected, i);
}
function togglePause() {
  if (state.ended) return;
  if (!state.paused) {
    if (state.mode === "timed" && state.started) state.remaining = Math.max(0, (state.deadline - performance.now()) / 1000);
    state.paused = true;
    showOverlay("☕", "讓快樂，也休息一下。", "遊戲已暫停。準備好再繼續就行。", "繼續遊戲 →");
  } else {
    state.paused = false;
    if (state.mode === "timed" && state.started) state.deadline = performance.now() + state.remaining * 1000;
    $("overlay").hidden = true;
  }
  render();
}
function useTool(name) {
  if (state.busy || state.paused || state.ended || !state.tools[name]) return;
  if (name === "hammer") { state.hammer = !state.hammer; state.selected = null; state.hinted = []; $("status").textContent = state.hammer ? "小槌子就緒！點選一格使用，再按道具可取消。" : MODES[state.mode].instruction; render(); return; }
  startClock(); state.hammer = false; state.selected = null;
  if (name === "hint") {
    state.hinted = E.move(state.board, state.mode);
    if (state.mode === "triple") {
      const preferred = state.tray.length ? state.tray[0] : state.board.find(Boolean)?.type;
      state.hinted = state.board.flatMap((t, i) => t?.type === preferred ? [i] : []);
    }
    $("status").textContent = "發光的物品就是建議操作，試試看！";
  } else {
    if (state.mode === "triple") state.board = shuffled(state.board);
    else state.board = E.create();
    state.hinted = [];
    $("status").textContent = "換個角度，好運正在路上。棋盤已重新排列！";
  }
  state.tools[name]--; render();
}
$("mode-list").innerHTML = Object.entries(MODES).map(([id, m]) => `<button class="mode-button" data-mode="${id}" aria-pressed="false"><span class="mode-icon">${m.icon}</span><span><b>${m.name}</b><small>${m.en}</small></span></button>`).join("");
$("discovery-cards").innerHTML = Object.entries(MODES).map(([id, m]) => `<button class="discovery-card" data-mode="${id}"><span class="card-icon">${m.icon}</span><span class="card-arrow">↗</span><b>${m.name}</b><p>${m.desc}</p></button>`).join("");
$("themes").innerHTML = THEMES.map((t, i) => `<button class="theme-button${i === theme ? " active" : ""}" data-theme="${i}" title="${t.name}" aria-label="${t.name}" aria-pressed="${i === theme}">${t.items[0]}</button>`).join("");
document.querySelectorAll("[data-mode]").forEach(el => el.onclick = () => {
  if (state.started && !state.ended && !confirm("切換玩法會開始新局，確定切換？")) return;
  newGame(el.dataset.mode);
  if (el.classList.contains("discovery-card")) $("play").scrollIntoView({ behavior: "smooth" });
});
document.querySelectorAll("[data-theme]").forEach(el => el.onclick = () => {
  theme = Number(el.dataset.theme);
  document.querySelectorAll("[data-theme]").forEach(b => { const active = Number(b.dataset.theme) === theme; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); });
  render();
});
$("board").onclick = event => {
  if (suppressClick) { suppressClick = false; return; }
  const tile = event.target.closest("[data-index]");
  if (tile) activate(Number(tile.dataset.index));
};
$("board").onpointerdown = event => {
  suppressClick = false;
  const tile = event.target.closest("[data-index]");
  dragStart = tile ? { i: Number(tile.dataset.index), x: event.clientX, y: event.clientY } : null;
};
$("board").onpointerup = event => {
  if (!dragStart) return;
  const start = dragStart; dragStart = null;
  if (!["classic", "timed"].includes(state.mode) || state.hammer || state.busy || state.paused || state.ended) return;
  const dx = event.clientX - start.x, dy = event.clientY - start.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  const next = start.i + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * 8);
  if (E.adjacent(start.i, next)) { suppressClick = true; swap(start.i, next); }
};
$("board").onpointercancel = () => { dragStart = null; };
$("board").onkeydown = event => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const tile = event.target.closest("[data-index]"); if (!tile) return;
  event.preventDefault();
  const i = Number(tile.dataset.index), next = i + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 })[event.key];
  if (E.adjacent(i, next)) $("board").children[next]?.focus();
};
for (const tool of ["hint", "shuffle", "hammer"]) $(tool).onclick = () => useTool(tool);
$("pause").onclick = togglePause;
$("restart").onclick = () => { if (!state.started || state.ended || confirm("確定重新開始這一局？")) newGame(); };
$("overlay-action").onclick = () => state.ended ? newGame() : togglePause();
$("sound").onclick = () => { soundOn = !soundOn; $("sound").textContent = soundOn ? "♪" : "♫"; $("sound").setAttribute("aria-label", soundOn ? "關閉音效" : "開啟音效"); $("sound").setAttribute("aria-pressed", String(soundOn)); if (soundOn) beep(); };
$("help").onclick = () => { if (!state.paused && !state.ended) togglePause(); $("help-dialog").showModal(); };
$("close-help").onclick = $("help-play").onclick = () => $("help-dialog").close();
document.addEventListener("visibilitychange", () => { if (document.hidden && state.started && !state.paused && !state.ended) togglePause(); });
setInterval(() => {
  if (state.mode !== "timed" || !state.started || state.paused || state.ended) return;
  state.remaining = Math.max(0, (state.deadline - performance.now()) / 1000); updateStats();
  if (state.remaining <= 0 && !state.busy) checkEnd();
}, 150);
newGame();
