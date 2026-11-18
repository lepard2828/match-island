"use strict";
const E = window.MatchEngine;
const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, document.getElementById(id));
  return elements.get(id);
};
const setText = (node, value) => { const text = String(value); if (node.textContent !== text) node.textContent = text; };
const setDisabled = (node, value) => { if (node.disabled !== value) node.disabled = value; };
const setClass = (node, name, value) => { if (node.classList.contains(name) !== value) node.classList.toggle(name, value); };
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const MODES = {
  classic: { name: "全向三消", en: "OMNI MATCH · V2", icon: "🍊", desc: "橫直斜連線，製造你的驚喜道具", target: 4200, moves: 24, instruction: "可向八方向交換；橫、直、斜連成 3／4／5 顆，製造不同道具。" },
  blast: { name: "群組消除", en: "POP & BLAST", icon: "💥", desc: "輕點同類，一次消個痛快", target: 2400, moves: 20, instruction: "點選兩個以上相鄰的同類物品，群組越大分數越高。" },
  triple: { name: "收納三消", en: "TRIPLE TOGETHER", icon: "🧺", desc: "七格收納，考驗你的安排", target: 1800, moves: 0, instruction: "點選收入收納槽，三個同類自動消除。別讓七格裝滿！" },
  timed: { name: "限時衝分", en: "90 SECOND RUSH · V2", icon: "⚡", desc: "90 秒倒數，全向連鎖衝高分", target: 6000, moves: 0, instruction: "90 秒全向三消！3 顆炸彈、4 顆十字火箭、5 顆彩虹球。" }
};
const POWERUPS = {
  bomb: { name: "小炸彈", icon: "💣", desc: "爆破周圍 3×3 範圍" },
  rocket: { name: "十字火箭", icon: "✚", desc: "同時清除整列與整行" },
  rainbow: { name: "彩虹球", icon: "🌈", desc: "消除全盤同類物品" }
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
const activeAnimations = new Set(), resumeWaiters = new Set();
const tileParts = [], trayParts = [];
let recordSaveTimer = null, recordsDirty = false, comboAnimation = null;
const format = n => n.toLocaleString("zh-TW");
function resumePending() {
  resumeWaiters.forEach(resolve => resolve()); resumeWaiters.clear();
}
async function motionReady(token) {
  if (token !== epoch || state.ended) return false;
  if (state.paused) await new Promise(resolve => resumeWaiters.add(resolve));
  return token === epoch && !state.ended;
}
function stopAnimations() {
  activeAnimations.forEach(animation => animation.cancel());
  activeAnimations.clear(); comboAnimation = null; resumePending();
}
async function animateTiles(entries, duration, token) {
  if (!await motionReady(token)) return false;
  if (reducedMotion.matches || !entries.length) return true;
  const animations = [];
  for (const { node, frames } of entries) {
    if (typeof node.animate !== "function") continue;
    const animation = node.animate(frames, { duration, easing: "cubic-bezier(.2,.7,.25,1)" });
    activeAnimations.add(animation); animations.push(animation);
    if (state.paused) animation.pause();
  }
  await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  animations.forEach(animation => activeAnimations.delete(animation));
  return motionReady(token);
}
function animateSwap(a, b, token) {
  const first = tileParts[a].button, second = tileParts[b].button;
  const dx = second.offsetLeft - first.offsetLeft, dy = second.offsetTop - first.offsetTop;
  return animateTiles([
    { node: first, frames: [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "translate(0,0)" }] },
    { node: second, frames: [{ transform: `translate(${-dx}px,${-dy}px)` }, { transform: "translate(0,0)" }] }
  ], 90, token);
}
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
  recordsDirty = true;
  if (recordSaveTimer === null) recordSaveTimer = setTimeout(flushRecords, 600);
}
function flushRecords() {
  clearTimeout(recordSaveTimer); recordSaveTimer = null;
  if (!recordsDirty) return;
  try { localStorage.setItem(STORAGE, JSON.stringify(records)); recordsDirty = false; }
  catch { $("save-note").textContent = "此瀏覽器無法儲存紀錄，遊戲仍可繼續"; }
}
function newGame(mode = state?.mode || "classic") {
  flushRecords();
  epoch++;
  stopAnimations();
  dragStart = null; suppressClick = false;
  const config = MODES[mode];
  state = { mode, board: E.create(), score: 0, moves: config.moves, tray: [], remaining: 90, started: false, deadline: 0, paused: false, ended: false, busy: false, swapMotion: null, selected: null, hinted: [], hammer: false, created: 0, detonated: 0, maxChain: 0, tools: { hint: 3, shuffle: 2, hammer: 3 } };
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
      : [["💣", "3 顆 → 小炸彈", "手動連成三顆，獲得 3×3 爆破。"], ["✚", "4 顆 → 十字火箭", "手動連成四顆，同時清除整列與整行。"], ["🌈", "5 顆 → 彩虹球", "手動連成五顆以上，全盤同色消除。"], ["✦", "特殊＋特殊＝大驚喜", "交換兩顆道具，組合出更強的爆破。"]];
  $("guide").innerHTML = notes.map(([icon, title, desc]) => `<div class="guide-row"><span>${icon}</span><div><b>${title}</b>${desc}</div></div>`).join("");
  render();
}
function render() {
  const t = THEMES[theme];
  if (!tileParts.length) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < E.SIZE * E.SIZE; i++) {
      const button = document.createElement("button"), object = document.createElement("span"), badge = document.createElement("span");
      button.className = "tile"; button.dataset.index = i;
      object.className = "tile-object"; badge.className = "power-badge"; badge.setAttribute("aria-hidden", "true");
      button.append(object, badge); fragment.append(button); tileParts.push({ button, object, badge, content: "" });
    }
    $("board").replaceChildren(fragment);
    for (let i = 0; i < 7; i++) { const slot = document.createElement("span"); $("tray").append(slot); trayParts.push(slot); }
  }
  const preview = !state.busy && !state.paused && !state.ended && state.selected !== null && state.board[state.selected]?.special ? E.expand(state.board, [state.selected]) : [];
  const range = new Set(preview), hints = new Set(state.hinted);
  state.board.forEach((tile, i) => {
    const power = POWERUPS[tile?.special];
    const part = tileParts[i], content = `${theme}:${tile?.type}:${tile?.special}`;
    if (part.content !== content) {
      part.content = content;
      setText(part.object, tile ? tile.special === "rainbow" ? "🌈" : t.items[tile.type] : "");
      setText(part.badge, power?.icon || ""); part.badge.hidden = !power || tile.special === "rainbow";
      part.button.style.setProperty("--tile-bg", tile ? COLORS[tile.type] : "transparent");
      part.button.setAttribute("aria-label", `第 ${Math.floor(i / 8) + 1} 列，第 ${i % 8 + 1} 格${tile ? `，${t.names[tile.type]}${power ? `，${power.name}，${power.desc}` : ""}` : "，空格"}`);
    }
    const classes = `tile${!tile ? " empty" : ""}${state.selected === i ? " selected" : ""}${hints.has(i) ? " hinted" : ""}${range.has(i) ? " in-range" : ""}${power ? ` special ${tile.special}` : ""}`;
    if (part.button.className !== classes) part.button.className = classes;
    setDisabled(part.button, !tile || state.paused || state.ended || state.busy);
  });
  $("power-preview").hidden = !preview.length || state.paused || state.ended || state.busy;
  if (preview.length) {
    const tile = state.board[state.selected], power = POWERUPS[tile.special];
    setText($("preview-name"), `${power.icon} ${power.name}`);
    setText($("preview-detail"), `${power.desc} · 含連鎖預計 ${preview.length} 格`);
  }
  $("power-legend").hidden = !["classic", "timed"].includes(state.mode);
  $("round-summary").hidden = !["classic", "timed"].includes(state.mode);
  setClass($("board"), "hammer-mode", state.hammer);
  const busy = String(state.busy);
  if ($("board").getAttribute("aria-busy") !== busy) $("board").setAttribute("aria-busy", busy);
  $("tray").hidden = state.mode !== "triple";
  trayParts.forEach((slot, i) => setText(slot, state.tray[i] !== undefined ? t.items[state.tray[i]] : ""));
  updateStats();
}
function updateStats() {
  setText($("score"), format(state.score));
  setText($("best"), format(Number(records[state.mode]) || 0));
  setText($("resource"), state.mode === "timed" ? Math.ceil(state.remaining) : state.mode === "triple" ? state.board.filter(Boolean).length : state.moves);
  const progress = `${state.mode === "triple" ? (60 - state.board.filter(Boolean).length) / 60 * 100 : Math.min(100, state.score / MODES[state.mode].target * 100)}%`;
  if ($("goal-progress").style.width !== progress) $("goal-progress").style.width = progress;
  for (const tool of ["hint", "shuffle", "hammer"]) {
    setText($(tool + "-count"), state.tools[tool]);
    setDisabled($(tool), state.ended || state.paused || state.busy || !state.tools[tool]);
  }
  setClass($("hammer"), "armed", state.hammer);
  setText($("made-count"), state.created);
  setText($("chain-count"), state.maxChain);
  setText($("blast-count"), state.detonated);
  setDisabled($("pause"), state.ended);
  setText($("pause"), state.paused ? "▷" : "Ⅱ");
  const pauseLabel = state.paused ? "繼續遊戲" : "暫停遊戲";
  if ($("pause").getAttribute("aria-label") !== pauseLabel) $("pause").setAttribute("aria-label", pauseLabel);
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
  saveRecord(); flushRecords(); stopAnimations(); render();
  showOverlay(won ? "🏝️" : "🌱", won ? "太棒了，小島任務完成！" : "休息一下，再挑戰一次。", `本局得到 ${format(state.score)} 分\n${state.created ? `製造 ${state.created} 顆道具 · 最高 ${state.maxChain} 連鎖\n` : ""}${won ? "你又收集了一份好心情。" : state.mode === "triple" ? "收納槽滿了。下次試著先湊齊槽內的物品！" : "每一局都是新的可能，你一定能找到更好的連鎖。"}`, "再來一局 →");
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
function flourish(n, combo, label = "") {
  if (label || combo > 1 || n >= 5) {
    $("combo").textContent = label || (combo > 1 ? `連鎖 ×${combo} !` : `${n} 個一起消！`);
    if (comboAnimation) { comboAnimation.cancel(); activeAnimations.delete(comboAnimation); }
    if (!reducedMotion.matches && typeof $("combo").animate === "function") {
      comboAnimation = $("combo").animate([
        { opacity: 0, transform: "translateY(8px) scale(.85)" },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: .2 },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: .65 },
        { opacity: 0, transform: "translateY(-20px) scale(1)" }
      ], { duration: 650, easing: "ease-out" });
      const animation = comboAnimation;
      activeAnimations.add(animation);
      animation.finished.catch(() => {}).finally(() => activeAnimations.delete(animation));
    }
  }
  beep(combo);
}
function expandSpecials(indices) {
  return E.expand(state.board, indices);
}
async function clearCells(cells, combo, token, creations = [], blast = false, label = "", resolved = false) {
  const expanded = resolved ? cells : expandSpecials(cells);
  state.score += blast ? expanded.length ** 2 * 10 : expanded.length * 30 * combo;
  state.maxChain = Math.max(state.maxChain, combo);
  state.detonated += expanded.filter(i => state.board[i]?.special).length;
  saveRecord(); updateStats();
  const movement = state.swapMotion; state.swapMotion = null;
  if (movement && !await movement) return false;
  if (!await motionReady(token)) return false;
  flourish(expanded.length, combo, label);
  const cleared = expanded.map(i => ({ node: tileParts[i].button, frames: [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.2)", opacity: 0 }] }));
  if (!await animateTiles(cleared, combo > 2 ? 75 : 90, token)) return false;
  expanded.forEach(i => state.board[i] = null);
  for (const creation of creations) state.board[creation.i] = { type: creation.type, special: creation.special };
  state.created += creations.length;
  const motions = [];
  E.refill(state.board, Math.random, motions); render();
  const pitch = tileParts[8].button.offsetTop - tileParts[0].button.offsetTop;
  return animateTiles(motions.map(({ i, rows }) => ({
    node: tileParts[i].button,
    frames: [{ transform: `translateY(${-rows * pitch}px)`, opacity: .45 }, { transform: "translateY(0)", opacity: 1 }]
  })), combo > 2 ? 100 : 130, token);
}
async function settle(token, initial = null, preferred = null, label = "", resolved = false) {
  let combo = 1;
  if (initial) {
    if (!await clearCells(initial, combo++, token, [], state.mode === "blast", label, resolved)) return;
  }
  if (state.mode !== "blast") {
    let match = E.matches(state.board);
    while (match.cells.length) {
      // Reward intentional swaps, not automatic cascades, to keep tools strategic.
      const creations = preferred !== null ? E.rewards(state.board, match.runs, preferred) : [];
      const rewardLabel = creations.length ? creations.map(c => `${POWERUPS[c.special].icon} ${POWERUPS[c.special].name}生成！`).join(" ") : "";
      if (!await clearCells(match.cells, combo++, token, creations, false, rewardLabel)) return;
      match = E.matches(state.board); preferred = null;
    }
  }
  if (token !== epoch || state.ended) return;
  state.busy = false;
  flushRecords();
  if (!checkEnd()) {
    if (!E.move(state.board, state.mode).length) { state.board = E.create(); $("status").textContent = "沒有可行操作，已免費替你重新排列！"; }
    else $("status").textContent = combo > 2 ? `漂亮！完成 ${combo - 1} 次連鎖。繼續收集快樂吧。` : MODES[state.mode].instruction;
    render();
  }
}
async function swap(a, b) {
  if (state.busy || state.paused || state.ended || !state.board[a] || !state.board[b]) return;
  if (!E.adjacent(a, b)) { state.selected = b; render(); return; }
  state.busy = true; state.selected = null; state.hinted = []; startClock();
  const token = epoch;
  [state.board[a], state.board[b]] = [state.board[b], state.board[a]];
  render();
  state.swapMotion = animateSwap(a, b, token);
  const combined = E.combination(state.board, a, b);
  const specialAt = state.board[a].special ? a : state.board[b].special ? b : null;
  if (specialAt !== null) {
    if (state.mode !== "timed") state.moves--;
    const other = specialAt === a ? b : a;
    if (!combined && state.board[specialAt].special === "rainbow") state.board[specialAt].type = state.board[other].type;
    const seeds = combined?.cells || E.effect(state.board, specialAt, state.board[other].type);
    await settle(token, seeds, null, combined?.label || `${POWERUPS[state.board[specialAt].special].name}發動！`, Boolean(combined));
    return;
  }
  if (!E.matches(state.board).cells.length) {
    $("status").textContent = "這次沒有連成三個，已換回；不扣步數。";
    const movement = state.swapMotion; state.swapMotion = null;
    if (!await movement || !await motionReady(token)) return;
    [state.board[a], state.board[b]] = [state.board[b], state.board[a]];
    render();
    if (!await animateSwap(a, b, token)) return;
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
  if (state.mode === "blast") {
    const group = E.group(state.board, i);
    if (group.length < 2) { $("status").textContent = "找找相連的同類物品，至少兩個才能一起消除。"; return; }
    state.moves--; state.busy = true; render(); await settle(epoch, group); return;
  }
  if (state.selected === i) {
    if (state.board[i].special) await detonate();
    else { state.selected = null; render(); }
  } else if (state.selected !== null && E.adjacent(state.selected, i)) await swap(state.selected, i);
  else {
    state.selected = i; render();
    if (state.board[i].special) $("status").textContent = "亮起的是爆破範圍。再點同一顆或按「引爆」；也可交換另一顆道具組合。";
  }
}
async function detonate() {
  if (state.busy || state.paused || state.ended || state.selected === null) return;
  const i = state.selected, power = POWERUPS[state.board[i]?.special];
  if (!power) return;
  startClock(); state.selected = null; state.hinted = []; state.busy = true; render();
  await settle(epoch, [i], null, `${power.name}發動！`);
}
function togglePause() {
  if (state.ended) return;
  if (!state.paused) {
    if (state.mode === "timed" && state.started) state.remaining = Math.max(0, (state.deadline - performance.now()) / 1000);
    state.paused = true;
    activeAnimations.forEach(animation => animation.pause());
    flushRecords();
    showOverlay("☕", "讓快樂，也休息一下。", "遊戲已暫停。準備好再繼續就行。", "繼續遊戲 →");
  } else {
    state.paused = false;
    activeAnimations.forEach(animation => animation.play());
    resumePending();
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
  if (event.isPrimary === false || event.button !== 0 || state.busy || state.paused || state.ended) return;
  suppressClick = false;
  const tile = event.target.closest("[data-index]");
  dragStart = tile ? { i: Number(tile.dataset.index), x: event.clientX, y: event.clientY, pointerId: event.pointerId } : null;
  if (tile) tile.setPointerCapture(event.pointerId);
};
$("board").onpointerup = event => {
  if (!dragStart || dragStart.pointerId !== event.pointerId) return;
  const start = dragStart; dragStart = null;
  if (!["classic", "timed"].includes(state.mode) || state.hammer || state.busy || state.paused || state.ended) return;
  const dx = event.clientX - start.x, dy = event.clientY - start.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy)) > Math.max(Math.abs(dx), Math.abs(dy)) * .45;
  const next = start.i + (diagonal ? Math.sign(dx) + Math.sign(dy) * 8 : Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * 8);
  if (E.adjacent(start.i, next)) { suppressClick = true; swap(start.i, next); }
};
$("board").onpointercancel = event => { if (dragStart?.pointerId === event.pointerId) dragStart = null; };
$("board").onkeydown = event => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const tile = event.target.closest("[data-index]"); if (!tile) return;
  event.preventDefault();
  const i = Number(tile.dataset.index), next = i + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 })[event.key];
  if (E.adjacent(i, next)) $("board").children[next]?.focus();
};
for (const tool of ["hint", "shuffle", "hammer"]) $(tool).onclick = () => useTool(tool);
$("detonate").onclick = detonate;
$("cancel-power").onclick = () => { state.selected = null; render(); $("status").textContent = MODES[state.mode].instruction; };
$("pause").onclick = togglePause;
$("restart").onclick = () => { if (!state.started || state.ended || confirm("確定重新開始這一局？")) newGame(); };
$("overlay-action").onclick = () => state.ended ? newGame() : togglePause();
$("sound").onclick = () => { soundOn = !soundOn; $("sound").textContent = soundOn ? "♪" : "♫"; $("sound").setAttribute("aria-label", soundOn ? "關閉音效" : "開啟音效"); $("sound").setAttribute("aria-pressed", String(soundOn)); if (soundOn) beep(); };
$("help").onclick = () => { if (!state.paused && !state.ended) togglePause(); $("help-dialog").showModal(); };
$("close-help").onclick = $("help-play").onclick = () => $("help-dialog").close();
document.addEventListener("visibilitychange", () => { if (document.hidden) { flushRecords(); if (state.started && !state.paused && !state.ended) togglePause(); } });
window.addEventListener("pagehide", flushRecords);
setInterval(() => {
  if (state.mode !== "timed" || !state.started || state.paused || state.ended) return;
  state.remaining = Math.max(0, (state.deadline - performance.now()) / 1000); updateStats();
  if (state.remaining <= 0 && !state.busy) checkEnd();
}, 150);
newGame();
