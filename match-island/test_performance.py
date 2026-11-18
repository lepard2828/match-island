"""Reproducible Chromium microbenchmarks; timings are not cross-device FPS claims."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import gettempdir
from threading import Thread

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).parent
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(root)))
    Thread(target=server.serve_forever, daemon=True).start()
    results = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for name, viewport, slowdown in (
                ("desktop", {"width": 1440, "height": 1080}, 1),
                ("mobile_4x_cpu", {"width": 390, "height": 844}, 4)):
                page = browser.new_page(viewport=viewport)
                page.add_init_script("""(() => {
                  let seed=7301;
                  Math.random=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
                })()""")
                cdp = page.context.new_cdp_session(page)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": slowdown})
                page.goto(args.url or f"http://127.0.0.1:{server.server_port}")
                page.wait_for_selector(".tile")
                page.evaluate("document.fonts.ready")
                results[name] = page.evaluate("""() => {
                  const samples=[], observer=new MutationObserver(()=>{});
                  const original=[...document.querySelectorAll('.tile')];
                  observer.observe(document.getElementById('board'),{childList:true,subtree:true});
                  let added=0,removed=0;
                  for(let n=0;n<160;n++){
                    const start=performance.now();
                    state.selected=n%64; render();
                    void document.getElementById('board').offsetWidth;
                    samples.push(performance.now()-start);
                    for(const mutation of observer.takeRecords()){
                      added+=mutation.addedNodes.length; removed+=mutation.removedNodes.length;
                    }
                  }
                  observer.disconnect();
                  const stable=original.every((node,i)=>node===document.getElementById('board').children[i]);
                  const boards=Array.from({length:100},()=>E.create());
                  const start=performance.now();
                  for(let n=0;n<500;n++)E.move(boards[n%100],'classic');
                  const hints=performance.now()-start;
                  samples.sort((a,b)=>a-b);
                  return {selection_median_ms:samples[80],selection_p95_ms:samples[152],
                    selection_total_ms:samples.reduce((a,b)=>a+b,0),
                    board_nodes_added:added,board_nodes_removed:removed,stable_tile_nodes:stable,
                    hint_500_total_ms:hints};
                }""")
                results[name]["double_rainbow_ms"] = page.evaluate("""async () => {
                  newGame('classic');
                  state.board[0].special='rainbow'; state.board[1].special='rainbow'; render();
                  const start=performance.now();
                  await swap(0,1);
                  return performance.now()-start;
                }""")
                page.close()
            browser.close()
    finally:
        server.shutdown()
    target = args.output or Path(gettempdir()) / "opencode" / "match-island" / "performance.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    print(f"Report: {target}")


if __name__ == "__main__":
    run()
