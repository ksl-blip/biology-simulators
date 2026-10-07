# 功課 Google Form 產生器

給香港中學文憑試生物科老師用。打開 GitHub Pages 上的這個網頁，用 **ksl@fss.edu.hk** 登入，就可以複製範本 Google Form、換上今次的語音和筆記連結，並複製一段 WhatsApp 訊息。不用部署 Apps Script，也沒有後端。

網址：<https://ksl-blip.github.io/biology-simulators/tools/form-generator/>

學生姓名、學號、功課 PDF 和回應試算表不要放進這個公開儲存庫。產生紀錄只存在你這部瀏覽器的 localStorage。

## 這個網頁會做的事

1. 按香港日期建議標題 `2029 DSE Biology Homework Submission YYYYMMDDx`，並查看資料夾裡現有檔名，用下一個未用過的 a、b、c。
2. 掃描範本，列出說明、題目、分節、圖片和 YouTube 影片裡的網址，讓你標示哪一個是語音、哪一個是筆記。每個範本只標一次。
3. 把範本複製到同一個資料夾（或你指定的資料夾），改雲端硬碟檔名和表單標題。
4. 以完整字串取代那兩個舊網址。語音如果是 YouTube，會一併更新表單上的影片。PDF 檔案上載題不會被改寫。
5. 要求新表單發佈並接受回應，然後給出學生連結、編輯連結和 WhatsApp 訊息。

預設範本：`1uerPSCadog-u3AsRlM0OR-3mRpJR_GXJCOMlVh75Uvw`  
預設資料夾：`1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF`

## 這個網頁版做不到的事

Google Forms API 沒有這些功能，介面不會假裝做到：

- 不能自動建立或連結回應試算表。請打開編輯連結，按「回應」→「連結至試算表」。
- 不能把連結縮成 forms.gle。學生連結是 API 交回的發佈網址。
- 不能到截止時間自動關閉。截止日期只會寫進表單說明。

需要試算表、短網址或自動關閉時，用頁底的 [Apps Script 做法](apps-script.html)。

## 第一次：建立 OAuth 用戶端 ID

用戶端 ID 是公開的，不是密碼。程式庫裡的 `config.js` 把 `CLIENT_ID` 留空。你可以之後把 ID 填進那個檔再部署，也可以只在網頁「設定」貼一次（存在這部瀏覽器）。網頁裡的值會蓋過 `config.js`。

1. 用 **ksl@fss.edu.hk** 開啟 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立新專案，名稱可以是「功課表單產生器」。
3. 啟用 [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) 和 [Google Forms API](https://console.cloud.google.com/apis/library/forms.googleapis.com)。這個版本不用 Picker API，也不用 API 金鑰。
4. 「API 和服務」→「OAuth 同意畫面」。使用者類型選 **內部 (Internal)**。這是 Workspace 內部應用程式，不用經過 Google 驗證。
5. 「憑證」→「建立憑證」→「OAuth 用戶端 ID」。類型選 **網頁應用程式**。
6. 已授權的 JavaScript 來源只填 `https://ksl-blip.github.io`。不要加上網頁路徑。重新導向 URI 可以留空（登入用彈出視窗）。
7. 複製用戶端 ID，貼到網頁的「設定」並儲存。按「用學校帳戶登入」，在帳戶清單選 ksl@fss.edu.hk。

登入會要求雲端硬碟和表單權限。需要完整的雲端硬碟權限，才能按表單 ID 複製你已經擁有的範本，以及讀取資料夾裡現有功課的檔名來決定 a、b、c。如果只用「這個應用程式開啟過的檔案」，程式看不到資料夾裡其他表單，標題會撞名。

如果學校管理員封鎖 Cloud 專案或第三方應用程式，登入會失敗。請改用 [Apps Script 做法](apps-script.html)，不用 Cloud Console。

## 每次出功課

1. 打開「產生」，核對標題。
2. 如果範本顯示「尚未標示連結」，先到「範本」掃描，指出語音和筆記，然後儲存。
3. 貼上今次的兩個連結。補充說明和截止日期可以留空。
4. 按「產生表單」。複製學生連結或 WhatsApp 訊息。

## 後備：Apps Script

`Code.gs`、`Index.html`（I 大寫）和 `appsscript.json` 仍是完整的 Apps Script 網頁應用程式。它另外可以建立回應試算表、取得 forms.gle，以及到截止時間自動關閉。設定步驟在 [apps-script.html](apps-script.html)。網站首頁沒有連到這個工具。

## 開發者檢查

```bash
node tools/form-generator/test/lint.js
node --test tools/form-generator/test/logic.test.js tools/form-generator/test/client-logic.test.js
node tools/form-generator/test/preview-server.js
```

`index.html?mock=1` 會改載 `test/mock-google.js`，用模擬的登入和 Drive／Forms 回應看版面。正式網頁仍向 Google 登入。
