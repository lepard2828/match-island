"""Run with: python -m pip install playwright; python test_browser.py."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from tempfile import gettempdir
import os

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    root = Path(__file__).parent
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(root)))
    Thread(target=server.serve_forever, daemon=True).start()
    output = Path(gettempdir()) / "opencode" / "match-island"
    output.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1080})
            # Reproducible random boards keep CI failures actionable.
            seed = int(os.environ.get("MATCH_ISLAND_TEST_SEED", "7301")) & 0xFFFFFFFF
            page.add_init_script(f"""(() => {{
              let seed={seed};
              Math.random=()=>{{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }};
            }})()""")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("dialog", lambda dialog: dialog.accept())
            page.goto(os.environ.get("MATCH_ISLAND_URL") or f"http://127.0.0.1:{server.server_port}")
            page.wait_for_selector(".tile")
            assert page.locator(".tile").count() == 64
            page.evaluate("""() => {
              const E = MatchEngine;
              for (let n = 0; n < 200; n++) {
                const b = E.create();
                if (E.matches(b).cells.length) throw Error('initial matches');
                const m = E.move(b, 'classic');
                if (m.length !== 2 || !E.adjacent(...m)) throw Error('no move');
                const before = JSON.stringify(b);
                E.move(b, 'classic');
                if (before !== JSON.stringify(b)) throw Error('hint mutates board');
                b[0] = null; b[8] = null; E.refill(b);
                if (b.some(t => !t)) throw Error('gravity holes');
              }
               if (E.adjacent(7, 8)) throw Error('row wrap');
               if (!E.adjacent(0, 9) || !E.adjacent(7, 14) || E.adjacent(-1, 0)) throw Error('diagonal bounds');
               if (E.neighbors(0).length !== 2 || E.swapNeighbors(0).length !== 3) throw Error('mode neighbor isolation');
               for (const step of [1,8,9,7]) {
                 for (const length of [3,4,5,6]) {
                   const board = Array(64).fill(null), start = step === 7 ? 7 : 0;
                   const line = Array.from({length}, (_,n) => start + n * step);
                   line.forEach(i => board[i] = {type:0,special:null});
                   const found = E.matches(board);
                   if (JSON.stringify(found.cells.sort((a,b)=>a-b)) !== JSON.stringify(line.sort((a,b)=>a-b))) throw Error('direction match');
                   const rewards = E.rewards(board, found.runs, line[0]);
                   const kind = length >= 5 ? 'rainbow' : length === 4 ? 'rocket' : 'bomb';
                   if (rewards.length !== 1 || rewards[0].special !== kind || rewards[0].i !== line[0]) throw Error('3/4/5 reward');
                 }
               }
               const intersect = Array(64).fill(null);
               [24,25,26,27,28,11,19,35].forEach(i => intersect[i] = {type:0,special:null});
               const cross = E.rewards(intersect,E.matches(intersect).runs,27);
               if (cross.length !== 1 || cross[0].special !== 'rainbow') throw Error('intersection priority');
               const separate = Array(64).fill(null);
               [0,1,2].forEach(i=>separate[i]={type:0,special:null});
               [48,49,50,51].forEach(i=>separate[i]={type:1,special:null});
               if (E.rewards(separate,E.matches(separate).runs,1).length!==2) throw Error('independent rewards');
               const board = Array.from({length:64},()=>({type:2,special:null}));
               board[27].special='bomb';
               if (E.expand(board,[27]).length!==9) throw Error('bomb radius');
               board[0].special='bomb';
               if (E.expand(board,[0]).length!==4) throw Error('corner bomb');
               board[0].special=null; board[27].special='rocket';
               if (E.expand(board,[27]).length!==15) throw Error('cross rocket');
               board[27].special='bomb'; board[28].special='rocket'; board[4].special='rainbow';
               const before=JSON.stringify(board), chain=E.expand(board,[27]);
               if (!chain.includes(4) || chain.length!==64 || JSON.stringify(board)!==before) throw Error('recursive chain or mutation');
               for (const pair of [['bomb','bomb'],['rocket','rocket'],['bomb','rocket'],['rainbow','bomb'],['rainbow','rocket'],['rainbow','rainbow']]) {
                 const b=Array.from({length:64},()=>({type:2,special:null}));
                 b[0]={type:0,special:pair[0]}; b[3]={type:1,special:pair[1]};
                 b[16].type=1; b[63].type=0;
                 const copy=JSON.stringify(b), combo=E.combination(b,0,3);
                 if (!combo || !combo.cells.includes(0) || !combo.cells.includes(3) || combo.cells.length!==new Set(combo.cells).size || copy!==JSON.stringify(b)) throw Error('fusion contract');
                 if (pair[0]==='rainbow' && pair[1]!=='rainbow' && combo.cells.includes(63)) throw Error('rainbow fusion wrong color');
                 if (pair.every(k=>k==='rainbow') && combo.cells.length!==64) throw Error('double rainbow');
               }
            }""")
            page.screenshot(path=str(output / "desktop.png"), full_page=True)
            for width in (320, 375, 390, 680, 768, 1024, 1440):
                page.set_viewport_size({"width": width, "height": 950})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), page.evaluate("""Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => [e.tagName,e.className,Math.round(e.getBoundingClientRect().right)])""")
            page.set_viewport_size({"width": 390, "height": 844})
            page.screenshot(path=str(output / "mobile.png"), full_page=True)
            page.set_viewport_size({"width": 1440, "height": 1080})
            page.locator("#hint").click()
            assert page.locator(".hinted").count() == 2
            move = page.evaluate("state.hinted")
            page.locator(f'[data-index="{move[0]}"]').click()
            page.locator(f'[data-index="{move[1]}"]').click()
            page.wait_for_function("!state.busy")
            assert page.evaluate("state.score > 0 && state.moves === 23")
            page.locator('[data-theme="2"]').click()
            assert page.evaluate("theme === 2")
            score = page.evaluate("state.score")
            page.locator("#pause").click()
            assert page.locator("#overlay").is_visible()
            page.locator("#overlay-action").click()
            assert page.evaluate("!state.paused && state.score") == score
            page.locator("#help").click()
            assert page.locator("#help-dialog").is_visible()
            page.locator("#help-play").click()
            page.locator("#overlay-action").click()
            # Invalid swaps do not consume a move.
            page.evaluate("""() => {
              newGame('classic');
              const b = state.board;
              window.invalidPair = null;
              for (let i = 0; i < 64 && !window.invalidPair; i++) {
                for (const j of E.neighbors(i)) {
                  [b[i], b[j]] = [b[j], b[i]];
                  const valid = E.matches(b).cells.length;
                  [b[i], b[j]] = [b[j], b[i]];
                  if (!valid) { window.invalidPair = [i,j]; break; }
                }
              }
              swap(...window.invalidPair);
            }""")
            page.wait_for_function("!state.busy")
            assert page.evaluate("state.moves === 24 && state.score === 0")
            # Preview before detonation; cross rockets cover row AND column.
            page.evaluate("state.board[0].special = 'rocket'; render(); activate(0)")
            assert page.locator("#power-preview").is_visible()
            assert page.locator(".in-range").count() == 15
            assert page.evaluate("!state.busy && state.score === 0")
            page.locator("#detonate").click()
            page.wait_for_function("!state.busy")
            assert page.evaluate("state.score >= 450 && state.moves === 24")
            # Actual swaps create one 3/4/5 reward; cascades do not farm more.
            for length, kind in ((3, "bomb"), (4, "rocket"), (5, "rainbow")):
                page.evaluate("""({length}) => {
                  newGame('classic');
                  state.board=Array(64).fill(null);
                  for(let i=0;i<length-1;i++) state.board[i]={type:0,special:null};
                  state.board[length-1]={type:1,special:null};
                  state.board[length+7]={type:0,special:null};
                  window.originalRewards=E.rewards;
                  window.generated=[];
                  E.rewards=(...args)=>{const result=window.originalRewards(...args); window.generated.push(...result); return result;};
                  render(); swap(length+7,length-1);
                }""", {"length": length})
                page.wait_for_function("!state.busy", timeout=30000)
                assert page.evaluate("window.generated.map(c=>c.special)") == [kind]
                assert page.evaluate("state.created === 1 && state.moves === 23")
                page.evaluate("() => { E.rewards=window.originalRewards; }")
            # Diagonal touch drag matches the click swap semantics.
            page.evaluate("""() => {
              newGame('classic');
              state.board=Array(64).fill(null);
              [0,9].forEach(i=>state.board[i]={type:0,special:null});
              state.board[18]={type:1,special:null};
              state.board[27]={type:0,special:null};
              render();
            }""")
            page.locator('[data-index="27"]').scroll_into_view_if_needed()
            a = page.locator('[data-index="27"]').bounding_box()
            b = page.locator('[data-index="18"]').bounding_box()
            page.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
            page.mouse.down()
            page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=5)
            page.mouse.up()
            page.wait_for_function("!state.busy")
            assert page.evaluate("state.created === 1 && state.moves === 23"), page.evaluate("({created:state.created,moves:state.moves,selected:state.selected,busy:state.busy,status:document.getElementById('status').textContent,dragStart,suppressClick})")
            # Keyboard focus survives selection renders.
            page.evaluate("newGame('classic')")
            page.locator('[data-index="0"]').focus()
            page.keyboard.press("Enter")
            assert page.evaluate("document.activeElement.dataset.index === '0'")
            page.keyboard.press("ArrowRight")
            assert page.evaluate("document.activeElement.dataset.index === '1'")
            # Double rainbow swaps clear all 64 tiles for a single move.
            page.evaluate("newGame('classic'); state.board[0].special='rainbow'; state.board[1].special='rainbow'; render()")
            page.locator('[data-index="0"]').click()
            page.locator('[data-index="1"]').click()
            page.wait_for_function("!state.busy")
            assert page.evaluate("state.score >= 1920 && state.moves === 23 && state.detonated >= 2")
            # Exercise all six fusion paths through the real swap resolver.
            for pair in (("bomb", "bomb"), ("rocket", "rocket"), ("bomb", "rocket"), ("rainbow", "bomb"), ("rainbow", "rocket"), ("rainbow", "rainbow")):
                result = page.evaluate("""pair => {
                  newGame('classic');
                  state.board[0]={type:0,special:pair[0]};
                  state.board[1]={type:1,special:pair[1]};
                  const copy=state.board.map(t=>({...t}));
                  [copy[0],copy[1]]=[copy[1],copy[0]];
                  const expected=E.combination(copy,0,1).cells.length*30;
                  render(); swap(0,1);
                  return {expected,actual:state.score};
                }""", list(pair))
                assert result["expected"] == result["actual"], (pair, result)
                page.wait_for_function("!state.busy")
                assert page.evaluate("state.moves === 23 && state.created === 0")
            # A normal tile chooses a rainbow's color, rather than clearing both colors.
            result = page.evaluate("""() => {
              newGame('classic');
              state.board[0]={type:0,special:'rainbow'};
              state.board[1]={type:1,special:null};
              const expected=(state.board.filter(t=>t.type===1).length+1)*30;
              render(); swap(0,1);
              return {expected,actual:state.score};
            }""")
            assert result["expected"] == result["actual"]
            page.wait_for_function("!state.busy")
            # Pausing in the middle of a blast freezes board changes until resumed.
            page.evaluate("newGame('classic'); state.board[0].special='bomb'; state.selected=0; detonate(); togglePause()")
            board_before = page.evaluate("JSON.stringify(state.board)")
            page.wait_for_timeout(350)
            assert page.evaluate("JSON.stringify(state.board)") == board_before
            page.locator("#overlay-action").click()
            page.wait_for_function("!state.busy")
            # Switching games during animation must not corrupt a new board.
            page.evaluate("newGame('classic'); state.board[0].special = 'rocket'; state.selected=0; detonate(); newGame('triple')")
            page.wait_for_timeout(400)
            assert page.evaluate("state.mode === 'triple' && state.score === 0 && state.board.filter(Boolean).length === 60")
            # Clear all triples through actual DOM clicks.
            for _ in range(20):
                indices = page.evaluate("""() => {
                  const type = state.board.find(Boolean).type;
                  return state.board.flatMap((t,i) => t?.type === type ? [i] : []).slice(0,3);
                }""")
                for i in indices:
                    page.locator(f'[data-index="{i}"]').click()
            assert page.evaluate("state.ended && state.score === 1800 && !state.tray.length")
            page.locator("#overlay-action").click()
            page.evaluate("""() => {
              const ids = Array.from({length:6}, (_,type) => state.board.findIndex(t => t?.type === type));
              ids.forEach(i => activate(i));
              activate(state.board.findIndex(Boolean));
            }""")
            assert page.evaluate("state.ended && state.tray.length === 7")
            page.evaluate("newGame('triple'); activate(state.board.findIndex(Boolean)); useTool('hammer'); activate(state.board.findIndex(Boolean))")
            assert page.evaluate("state.tray.length === 0 && state.tools.hammer === 2")
            page.evaluate("newGame('blast'); window.g = E.move(state.board, 'blast')")
            count = page.evaluate("window.g.length")
            page.locator(f'[data-index="{page.evaluate("window.g[0]")}"]').click()
            page.wait_for_function("!state.busy")
            assert page.evaluate("state.score") == count * count * 10
            assert page.evaluate("state.moves") == 19
            page.evaluate("newGame('timed'); useTool('hint')")
            page.locator("#pause").click()
            remaining = page.evaluate("state.remaining")
            page.wait_for_timeout(400)
            assert page.evaluate("state.remaining") == remaining
            page.locator("#overlay-action").click()
            page.evaluate("state.deadline = performance.now() - 1")
            page.wait_for_function("state.ended")
            # End-of-moves and winning results.
            page.evaluate("newGame('classic'); state.moves = 0; checkEnd()")
            assert page.evaluate("state.ended")
            page.evaluate("newGame('classic'); state.score = MODES.classic.target; checkEnd()")
            assert page.locator("#overlay-title").inner_text() == "太棒了，小島任務完成！"
            page.reload()
            assert page.evaluate("Number(records.classic) >= MODES.classic.target")
            assert not errors, errors
            browser.close()
            print("PASS V2: 200 boards; 4 line directions; 3/4/5 rewards; intersections; 6 special fusions; preview; diagonal drag; keyboard; 4 modes; pause; records; 7 widths.")
            print(f"Screenshots: {output}")
    finally:
        server.shutdown()


if __name__ == "__main__":
    run()
