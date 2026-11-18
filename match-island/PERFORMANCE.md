# v2.1 流暢度量測

## 改善內容

- 保留棋盤按鈕及內容節點，只更新改變的格子、數字與狀態。
- 交換、消除及落下動畫使用 transform / opacity，不逐幀改動格子位置或尺寸。
- 每次落下只批次讀取一次列距；連鎖文字不再用 offsetWidth 強制重啟 CSS 動畫。
- 使用實際重力來源計算落下距離，動畫暫停、恢復與切局取消皆納入遊戲生命週期。
- 暫存固定鄰格、連線掃描路徑，提示只驗證候選交換涉及的位置。
- 合併最高分寫入；在結算、暫停、切換分頁及離開時立即保存。

## 可重現的測試

```powershell
python -m pip install -r match-island/requirements-test.txt
python -m playwright install chromium --only-shell
python match-island/test_browser.py
python match-island/test_performance.py
```

`test_performance.py` 以固定亂數種子 7301 執行：

1. 160 次選取更新，每次讀取棋盤寬度以包含樣式／版面成本。
2. 觀察棋盤子節點新增及移除數，確認是否重建棋盤。
3. 在 100 張固定種子生成的棋盤上執行 500 次提示搜尋。
4. 執行一次雙彩虹全盤清除，直到所有掉落連鎖結束。

測試包含 1440×1080 桌面與 390×844 加四倍 CPU 降速的手機模擬。報告預設放在系統暫存目錄的 `opencode/match-island/performance.json`，可用 `--output` 指定另一個 JSON 路徑。

正式站可使用：

```powershell
python match-island/test_performance.py --url https://lepard2828.github.io/match-island/
```

## 本機前後單次量測樣本

同一台電腦、同一套 Chromium、同一種子及流程：

| 項目 | v2.0 | v2.1 |
| --- | ---: | ---: |
| 桌面選取更新中位數 | 2.5 ms | 0.7 ms |
| 桌面選取更新 p95 | 3.9 ms | 1.1 ms |
| 手機模擬選取更新 p95 | 66.5 ms | 9.0 ms |
| 手機模擬 160 次更新總計 | 3311.3 ms | 331.3 ms |
| 160 次選取新增／移除棋盤節點 | 各 10,240 | 各 0 |
| 桌面 500 次提示搜尋 | 33.8 ms | 7.4 ms |
| 手機模擬 500 次提示搜尋 | 179.2 ms | 36.8 ms |
| 手機模擬雙彩虹含全部連鎖 | 3108.4 ms | 2870.4 ms |

選取更新不是完整使用者輸入到螢幕顯示的延遲；p95 是這 160 次更新中的第 95 百分位。連鎖測試包含設計上的動畫播放時間，不能直接當作程式計算效能。

## 限制

這是 headless Chromium 的本機微量測，不是真實手機的 FPS 保證。CPU 降速也不會模擬實機 GPU、記憶體、溫度、作業系統或 Safari。數據會隨硬體及背景負載波動；真實 iPhone Safari、Android Chrome 的觸控與長時間遊玩仍應人工驗收。
