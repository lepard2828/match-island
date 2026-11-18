"use strict";
(function (root) {
  const SIZE = 8;
  const neighbors = i => [i % SIZE > 0 ? i - 1 : -1, i % SIZE < SIZE - 1 ? i + 1 : -1, i - SIZE, i + SIZE].filter(n => n >= 0 && n < SIZE * SIZE);
  const adjacent = (a, b) => neighbors(a).includes(b);
  function matches(board) {
    const cells = new Set(), runs = [];
    for (let axis = 0; axis < 2; axis++) {
      for (let line = 0; line < SIZE; line++) {
        let run = [];
        const flush = () => { if (run.length >= 3) { runs.push([...run]); run.forEach(i => cells.add(i)); } };
        for (let pos = 0; pos <= SIZE; pos++) {
          const i = axis ? pos * SIZE + line : line * SIZE + pos;
          const tile = pos < SIZE ? board[i] : null;
          if (tile && run.length && tile.type === board[run[0]].type) run.push(i);
          else { flush(); run = tile ? [i] : []; }
        }
      }
    }
    return { cells: [...cells], runs };
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
        for (const j of neighbors(i).filter(j => j > i)) {
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
        while ((i % SIZE >= 2 && board[i - 1].type === type && board[i - 2].type === type) || (i >= SIZE * 2 && board[i - SIZE].type === type && board[i - SIZE * 2].type === type));
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
  const api = { SIZE, neighbors, adjacent, matches, group, move, create, refill };
  root.MatchEngine = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
