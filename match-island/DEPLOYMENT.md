# 消消小島：公開部署與持續改進

## 目前上線狀態

- 正式網站：https://lepard2828.github.io/match-island/
- 公開儲存庫：https://github.com/lepard2828/match-island
- 自動部署與測試：https://github.com/lepard2828/match-island/actions
- 玩家回報與建議：https://github.com/lepard2828/match-island/issues
- 正式分支：`main`；Pages 來源：GitHub Actions；網站使用 HTTPS。
- 首次部署已成功，雲端 Chromium 測試通過。
- 第二版功能與驗收範圍見 `README.md`；每版變更記錄於 `CHANGELOG.md`。正式部署及測試結果以 Actions 的執行紀錄為準。

以下首次建立步驟保留作為重建及備援參考，不需要重複建立另一個同名專案。

## 架構與目標

玩家瀏覽器 → HTTPS 公開網址 → 雲端靜態網站主機。

不經過開發者電腦。上線後，開發者關機、斷網或關閉編輯器均不影響雲端網站；更新時才需要開發者提交新版本。仍受託管平台可用性、使用限額及帳號狀態影響，不能保證永遠不中斷。

目前遊戲完全在瀏覽器執行，不需要租用 VPS、資料庫或常駐遊戲伺服器。最高分留在各玩家自己的瀏覽器，不是全球排行榜，也不是跨裝置存檔。

## 網址設計

- 品牌：消消小島 / Match Island。
- 建議 GitHub 儲存庫名稱：`match-island`。
- GitHub Pages 正式網址格式：`https://<GitHub帳號>.github.io/match-island/`。
- 備選 Cloudflare Pages 專案名稱：`match-island-play`，對應 `https://match-island-play.pages.dev/`；實際名稱需依平台可用性調整。
- 日後自訂網域可使用 `play.<你擁有的網域>`。需先購買或擁有網域，再設定 DNS 與 HTTPS。

這些是規劃名稱，不代表網址已建立、名稱可用或網域已購買。初期固定使用一個正式網址，避免玩家最高分因不同網域而分散。

## 推薦：GitHub Pages + GitHub Actions

### 首次建立

1. 登入 GitHub，建立新的 `match-island` 儲存庫。免費帳號可選公開儲存庫；原始碼也會公開。請先確認願意公開遊戲程式碼。
2. 本工作目錄另有舊遊戲與其他尚未追蹤檔案，不要使用 `git add .` 或整包上傳。新儲存庫只需要保留這個結構：

```text
.github/
  workflows/
    deploy-match-island.yml
match-island/
  index.html
  style.css
  engine.js
  app.js
  test_browser.py
  requirements-test.txt
  build_release.py
  README.md
  DEPLOYMENT.md
```

3. 可用 GitHub 網頁介面上傳選定檔案，或在獨立資料夾 clone 新儲存庫後拷貝上述檔案並提交。不要為了發布而重設或刪除現有專案。
4. 在新儲存庫的 Settings → Pages → Build and deployment，Source 選擇 **GitHub Actions**。
5. 推送到 `main`，或在 Actions 頁面選擇 **Test and Deploy Match Island → Run workflow**（第一次應從 `main` 執行）。
6. 測試及部署成功後，Actions 的 `github-pages` environment 會顯示真正的公開網址。
7. 在 Settings → Pages 確認 HTTPS 設定，再以未登入的無痕瀏覽器及手機行動網路實際開啟驗收。

若已先推送再設定 Pages，第一次部署可能失敗；設定完成後重新執行 workflow 即可。遇到 environment 分支限制時，允許正式分支 `main`。若儲存庫使用 `master`，工作流程也支援它；建議只選一個正式分支發布。

### 自動發布機制

- Pull Request：執行瀏覽器測試與打包，不部署正式站。
- 正式分支 `main` 或 `master`：測試成功才部署；失敗則不發布新版本。
- 測試包含遊戲邏輯、互動與七種螢幕寬度；CI 使用 Linux Chromium，本機可用 Windows Chromium。
- 發布白名單只有四個網站檔案；不會把測試、文件、舊遊戲或專案目錄發布到網站。
- GitHub Actions 使用平台內建的短效權限，不需要將帳號密碼或部署 Token 寫入程式碼。
- 若 GitHub 已更新或停用 workflow 使用的 action 版本，需依官方文件調整版本再發布。

## 備選：Cloudflare Pages 手動上傳

適合想先公開網站、但暫時不想公開原始碼儲存庫的情況。瀏覽器仍然可以讀取網站使用的前端程式碼，這不是保密機制。

```powershell
python match-island/build_release.py
```

1. 登入 Cloudflare Dashboard，進入 Workers & Pages，選擇建立 Pages 專案的 Direct Upload / 拖放上傳方式。
2. 專案名稱可先嘗試 `match-island-play`。
3. 上傳 `match-island/dist/match-island.zip`，或整個 `match-island/dist/site/` 資料夾。壓縮檔內的首頁直接位於根目錄。
4. 完成部署後，使用平台實際配發的 `*.pages.dev` HTTPS 網址。
5. 更新時，在同一專案建立新部署並上傳新的壓縮檔；不要每次另建專案，網址才能保持一致。

這個 GitHub Actions 工作流程只會自動部署 GitHub Pages，不會同步部署 Cloudflare。若選擇 Cloudflare 並希望自動部署，首次建立時應改選 Git 整合，連接專用 GitHub 儲存庫：

- 正式分支：`main`
- 建置命令：`python3 match-island/build_release.py`
- 輸出目錄：`match-island/dist/site`
- 專案根目錄：儲存庫根目錄

平台的 Direct Upload 與 Git 整合有不同專案限制，應先選好長期流程，不要預期手動上傳專案一定能原地改為 Git 整合。

## 發布前驗收

```powershell
python -m pip install -r match-island/requirements-test.txt
python -m playwright install chromium --only-shell
python match-island/test_browser.py
python match-island/build_release.py
```

- 查看發行包只有 `index.html`、`style.css`、`engine.js`、`app.js`。
- 實際訪問正式 HTTPS 網址，而不是 `127.0.0.1` 或臨時隧道網址。
- 手機行動網路與另一台電腦均能玩；四個模式、音效、提示、洗牌、暫停正常。
- 關閉原本的本機伺服器，再確認公開網址仍可開啟；開發者電腦關機時，另一台裝置也應可遊玩。
- 更新後重新整理，檢查新功能與最高分是否正常。

## 持續改進節奏

### 第一階段：穩定公開版

先完成雲端部署與外部裝置驗收，再收集實際玩家意見。保留目前無登入、無廣告、免費遊玩的簡單架構。

### 第二階段：玩法與品質

優先新增難度選擇、關卡目標、每日挑戰、教學引導、玩家回饋入口與版本紀錄。每個改善開一張 GitHub Issue，使用獨立分支與 Pull Request；先測試再合併正式分支。

桌面 Chromium 自動測試不能取代真實 iPhone Safari、Android Chrome、觸控拖曳與長時間遊玩的人工驗收。

### 第三階段：視需求新增雲端功能

全球排行榜、會員及跨裝置存檔需另做後端服務、資料庫、濫用防護及隱私規劃。不能直接相信前端上傳的分數，否則容易被偽造。先不要為沒有驗證的需求增加成本。

若加入分析工具或回饋表單，先明確說明收集資料、保存方式與玩家權利；不要把私密 API 金鑰放入前端。

### 版本與回復

- 初次公開成功後，為當時提交建立 `v1.0.0` 標籤。
- 每次發布在版本紀錄寫明新增內容、修正與已知問題。
- 發布前確認 GitHub Actions 綠燈，避免直接改正式站。
- 若新版有問題，以新的修復提交或明確 revert 該次發布提交恢復，再讓自動部署重新發布；不要對共享分支做強制重設。
- 網站回復不等於還原玩家瀏覽器資料；日後修改存檔格式時需提供相容或遷移策略。

## 費用與營運

這類小型靜態網站通常可先從平台免費方案起步；不是永久免費或無限流量承諾。正式上線前查看當時的 Pages、Actions、流量及使用條款。自訂網域一般有年度續費。

使用穩定託管與固定網址即可滿足「開發者電腦關機仍可玩」；不需要讓家用電腦一直開機。

參考：
- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://developers.cloudflare.com/pages/get-started/direct-upload/
