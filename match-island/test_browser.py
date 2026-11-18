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
            # Special tiles clear a full row and can trigger cascades.
            page.evaluate("state.board[0].special = 'rocket'; render(); activate(0)")
            page.wait_for_function("!state.busy")
            assert page.evaluate("state.score >= 240 && state.moves === 24")
            # Switching games during animation must not corrupt a new board.
            page.evaluate("state.board[0].special = 'rocket'; activate(0); newGame('triple')")
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
            page.evaluate("newGame('classic'); state.score = 1800; checkEnd()")
            assert page.locator("#overlay-title").inner_text() == "太棒了，小島任務完成！"
            page.reload()
            assert page.evaluate("Number(records.classic) >= 1800")
            assert not errors, errors
            browser.close()
            print("PASS: 200 engine boards; four modes; valid/invalid swaps; specials; tray win/loss; tools; pause; timer; records; 7 viewport widths.")
            print(f"Screenshots: {output}")
    finally:
        server.shutdown()


if __name__ == "__main__":
    run()
