# 霜藍週報｜展示版＋Google Sheets 唯讀接入

React / TypeScript / Tailwind CSS / Lucide / Vite / GitHub Pages。

> **不是正式上線版。** 預設使用假資料；試算表連線功能僅實作 Google Sheets 唯讀。實際 Google 登入、授權、正式／測試表及部署尚未驗證。試算表模式下不能轉入或寫入週報，已加入週報的項目仍只在記憶體中，重新整理會消失。

## 1. 本機執行

安裝 Node.js 22 或更新版：

```bash
npm ci
npm run dev
```

開啟終端機顯示的網址。`npm run build` 建置；`npm run preview` 預覽建置結果。展示版無需登入。

## 2. 發布 GitHub Pages 展示版

1. 建立 GitHub repository，將資料夾**內**的檔案全部放在 repository 根目錄（包含 `.github/workflows/deploy.yml` 及 `package-lock.json`；不要上傳 `node_modules`）。
2. GitHub → repository **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
3. 到 **Actions → Deploy to GitHub Pages → Run workflow**，或推送到 `main`；執行成功後到 Pages 查網址。
4. 靜態網頁可能對外公開；私人 repository 不代表已發布頁面有存取驗證。請先依組織政策確認。此版頁面本身不含 Google 登入閘門，登入只用於請求 Sheets 資料。

`vite.config.ts` 使用 `base: './'`，支援 GitHub Pages 子路徑。將來加入 History API 路由時，需另處理頁面重整的 404。

## 3. 設定 Google Sheets 唯讀連線

**先用測試副本**，確認組織政策允許以網頁 OAuth 應用程式存取資料；正式環境須先完成資安、權限與完整測試驗收。

1. 在 Google Cloud 建立或選用專案，啟用 **Google Sheets API**。
2. 設定 OAuth 同意畫面／Google Auth Platform。視帳號、組織政策及應用程式發布狀態，加入測試使用者；如要求驗證，依 Google 的要求處理。
3. 建立 **網頁應用程式**類型的 OAuth 2.0 用戶端。Authorized JavaScript origins 加入你實際使用的來源，例如 `http://localhost:5173`，及 `https://YOUR_USERNAME.github.io`（origin 不包含 repository 路徑）；其他埠號或自訂網域須分別設定。
4. 由該帳號開啟網頁，展開「Google Sheets 唯讀連線設定」，輸入 OAuth 用戶端 ID，以及測試試算表 URL 中 `/d/` 與 `/edit` 之間的試算表 ID；點選授權，使用有該 Sheet 讀取權的 Google 帳號。
5. Google 會要求 `https://www.googleapis.com/auth/spreadsheets.readonly` 權限。**此 scope 不限單一檔案，而是涵蓋該帳號有權存取的試算表的唯讀權限。** 授權前確認同意畫面與組織規範；此版本的程式只請求輸入的試算表。用戶端 ID 不是密碼，但切勿把 client secret、access token 或真實資料放進 repository。

瀏覽器直接呼叫 Google Sheets API；本版**不呼叫、不修改、也不重新部署**現有 Apps Script。access token 不寫入 localStorage；重整後需重新授權。失敗時請檢查 OAuth origin、Sheets API、帳號權限、測試使用者及試算表 ID。部署在 GitHub Pages 並不保證 OAuth／組織政策允許使用。

## 4. 唯讀資料映射與限制

只讀取以下範圍，並檢查關鍵表頭；不符即停止載入：

- `Task_Inbox!B6:J16`：雜事區表頭及資料。
- `Task_Inbox!B18:J28`：ATM 區表頭及資料。
- `Task_Master!A1:J`：主任務庫。
- `Weekly_Report_Log!A1:E`：週報日誌。

收件匣沒有穩定來源 ID；畫面內臨時列號只作當次顯示識別，不供寫回。空白關聯單號分開呈現，不自動合併。來源備註不一定是該週進度；Prompt 已要求標為待確認，仍須人工核對。ATM 的「近 90 天」只原樣顯示收件匣數值，不推定為同問題計次。來源有已結案項目時仍會顯示，不直接假定是待審核。

試算表模式下：不呼叫 `syncInbox`、不修改核取方塊、不寫入 `Task_Master` 或 `Weekly_Report_Log`。重新載入或切回展示資料會清空週報桶；切換前請先保留所需內容。貼至 Gemini 前請依單位規範審查。

## 5. 後續寫入需要處理的事項

提供的既有程式有下列風險，不應直接由網頁呼叫進行正式寫入：

- `syncInbox` 會清空 `B7:J16`、重設勾選，且只載入前 10 筆雜事；提供的版本沒有更新 ATM 收件匣的程式。
- `importSelectedTasks` 以日期與列序組合 ID；同日再次匯入相同行可能重複，也會在主庫寫入前先取消勾選。收件匣列號會因同步重排而變動。
- 所提供文字中，`createWeeklyReportDraftByGroup` 定義在 `importSelectedTasks` 函式內，且沒有看到呼叫它的程式；它直接追加日誌，沒有防重。它按未結案狀態彙整，不足以證明內容屬於所選週。
- 現有文字未包含 `doGet`／`doPost`；無法由此判定實際部署完整程式。開放 Apps Script 端點不能取代後端身分驗證或組織資安控管。

寫入前應先設計穩定來源識別、幂等、防重及併發處理，釐清 ATM 與雜事分別如何轉入；寫入結果不明時先查詢，不自動重送。依原有規劃先在測試副本完成 Google 登入、資料相容、回歸與整體驗收，再決定正式切換。勿將本版視為已完成推薦規則、跨週追蹤、來源同步、寫入、Word 產出或完整既有功能。
