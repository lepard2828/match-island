"use strict";
(function (root) {
  const SIZE = 8;
  const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const neighbors = i => [i % SIZE > 0 ? i - 1 : -1, i % SIZE < SIZE - 1 ? i + 1 : -1, i - SIZE, i + SIZE].filter(n => n >= 0 && n < SIZE * SIZE);
  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const adjacent = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < SIZE * SIZE && b < SIZE * SIZE && a !== b && Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) <= 1 && Math.abs(a % SIZE - b % SIZE) <= 1;
  const swapNeighbors = i => Array.from({ length: SIZE * SIZE }, (_, j) => j).filter(j => adjacent(i, j));
  function matches(board) {
    const cells = new Set(), runs = [];
    for (const [dr, dc] of DIRECTIONS) {
      for (let start = 0; start < SIZE * SIZE; start++) {
        const sr = Math.floor(start / SIZE), sc = start % SIZE;
        if (inside(sr - dr, sc - dc)) continue;
        let run = [];
        const flush = () => { if (run.length >= 3) { runs.push([...run]); run.forEach(i => cells.add(i)); } };
        for (let r = sr, c = sc; inside(r, c); r += dr, c += dc) {
          const i = r * SIZE + c, tile = board[i];
          if (tile && run.length && tile.type === board[run[0]].type) run.push(i);
          else { flush(); run = tile ? [i] : []; }
        }
        flush();
      }
    }
    return { cells: [...cells], runs };
  }
  function rewards(board, runs, preferred) {
    // Intersecting lines form one reward group; the longest line wins.
    const groups = [];
    for (const run of [...runs].sort((a, b) => b.length - a.length)) {
      const touching = groups.filter(g => run.some(i => g.cells.has(i)));
      const current = touching.shift() || { cells: new Set(), longest: run.length };
      run.forEach(i => current.cells.add(i));
      for (const g of touching) {
        g.cells.forEach(i => current.cells.add(i));
        current.longest = Math.max(current.longest, g.longest);
        groups.splice(groups.indexOf(g), 1);
      }
      if (!groups.includes(current)) groups.push(current);
    }
    return groups.flatMap(g => {
      const plain = [...g.cells].filter(i => board[i] && !board[i].special);
      if (!plain.length) return [];
      const i = plain.includes(preferred) ? preferred : plain[Math.floor(plain.length / 2)];
      return [{ i, type: board[i].type, special: g.longest >= 5 ? "rainbow" : g.longest === 4 ? "rocket" : "bomb" }];
    });
  }
  function area(center, radius) {
    const row = Math.floor(center / SIZE), col = center % SIZE, cells = [];
    for (let r = row - radius; r <= row + radius; r++) for (let c = col - radius; c <= col + radius; c++) if (inside(r, c)) cells.push(r * SIZE + c);
    return cells;
  }
  function effect(board, i, color = board[i]?.type) {
    const special = board[i]?.special;
    if (special === "bomb") return area(i, 1);
    if (special === "rocket") return Array.from({ length: SIZE * SIZE }, (_, j) => j).filter(j => Math.floor(j / SIZE) === Math.floor(i / SIZE) || j % SIZE === i % SIZE);
    if (special === "rainbow") return board.flatMap((t, j) => t?.type === color || j === i ? [j] : []);
    return [i];
  }
  function expand(board, indices) {
    const cells = new Set(indices.filter(i => i >= 0 && i < SIZE * SIZE)), queue = [...cells];
    for (let p = 0; p < queue.length; p++) {
      for (const i of effect(board, queue[p])) if (!cells.has(i)) { cells.add(i); queue.push(i); }
    }
    return [...cells].sort((a, b) => a - b);
  }
  function combination(board, a, b) {
    const first = board[a], second = board[b];
    if (!first?.special || !second?.special) return null;
    const kinds = [first.special, second.special];
    if (kinds.every(k => k === "rainbow")) return { label: "雙彩虹・全盤清除", cells: board.flatMap((t, i) => t ? [i] : []) };
    if (kinds.includes("rainbow")) {
      const power = first.special === "rainbow" ? second : first;
      const virtual = board.map((t, i) => i === a || i === b ? { ...t, type: power.type } : t?.type === power.type ? { ...t, special: power.special } : t);
      const seeds = virtual.flatMap((t, i) => t?.type === power.type || i === a || i === b ? [i] : []);
      return { label: power.special === "bomb" ? "彩虹炸彈・同色連環爆" : "彩虹火箭・同色十字雨", cells: expand(virtual, seeds) };
    }
    if (kinds.every(k => k === "bomb")) return { label: "雙炸彈・5×5 大爆破", cells: expand(board, [...area(a, 2), ...area(b, 2)]) };
    if (kinds.includes("bomb")) {
      const row = Math.floor(b / SIZE), col = b % SIZE;
      const seeds = board.flatMap((t, i) => Math.abs(Math.floor(i / SIZE) - row) <= 1 || Math.abs(i % SIZE - col) <= 1 ? [i] : []);
      return { label: "炸彈火箭・三列三行齊發", cells: expand(board, seeds) };
    }
    return { label: "雙火箭・雙重十字衝擊", cells: expand(board, [a, b]) };
  }
  function group(board, start) {
    if (!board[start]) return [];
    const found = new Set([start]), queue = [start];
    for (let p = 0; p < queue.length; p++) neighbors(queue[p]).forEach(i => {
      if (!found.has(i) && board[i]?.type === board[start].type) { found.add(i); queue.push(i); }
    });
    return [...found];
  }
  function move(board, mode) {
    if (mode === "triple") { const i = board.findIndex(Boolean); return i < 0 ? [] : [i]; }
    for (let i = 0; i < board.length; i++) {
      if (board[i]?.special) return [i];
      if (mode === "blast") { const g = group(board, i); if (g.length > 1) return g; }
      else {
        for (const j of swapNeighbors(i).filter(j => j > i)) {
          [board[i], board[j]] = [board[j], board[i]];
          const valid = matches(board).cells.length > 0;
          [board[i], board[j]] = [board[j], board[i]];
          if (valid) return [i, j];
        }
      }
    }
    return [];
  }
  function create(random = Math.random) {
    let board;
    do {
      board = [];
      for (let i = 0; i < SIZE * SIZE; i++) {
        let type;
        do { type = Math.floor(random() * 6); }
        while (DIRECTIONS.some(([dr, dc]) => {
          const r = Math.floor(i / SIZE), c = i % SIZE;
          return inside(r - dr * 2, c - dc * 2) && board[(r - dr) * SIZE + c - dc]?.type === type && board[(r - dr * 2) * SIZE + c - dc * 2]?.type === type;
        }));
        board.push({ type, special: null });
      }
    } while (!move(board, "classic").length);
    return board;
  }
  function refill(board, random = Math.random) {
    for (let c = 0; c < SIZE; c++) {
      const col = [];
      for (let r = SIZE - 1; r >= 0; r--) if (board[r * SIZE + c]) col.push(board[r * SIZE + c]);
      for (let r = SIZE - 1; r >= 0; r--) board[r * SIZE + c] = col[SIZE - 1 - r] || { type: Math.floor(random() * 6), special: null };
    }
    return board;
  }
   const api = { SIZE, neighbors, swapNeighbors, adjacent, matches, rewards, area, effect, expand, combination, group, move, create, refill };
  root.MatchEngine = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
