# 課堂語音播放器

公開網址：<https://ksl-blip.github.io/biology-simulators/tools/audio-player/>

播放清單係 `tracks.json`，每首只記標題同 Google Drive 串流連結。mp3 留喺 Drive 資料夾「007 Classroom Audio」（`1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0`），唔好提交去呢個儲存庫。網頁入面冇 Drive 或 GitHub 寫入金鑰。

## 分享設定

每個要播嘅檔案都要喺 Drive 設成 **知道連結嘅人可以查看**（Anyone with the link → Viewer）。未公開嘅檔，`<audio>` 會載入失敗。資料夾本身都可以用同一個分享設定，新檔先會跟住公開。

由 2024 年開始，Google 會拒絕其他網站直接拎 `drive.google.com` / `drive.usercontent.google.com` 嘅檔案（瀏覽器會見到 403）。播放器用 Drive API 嘅媒體網址：

```text
https://www.googleapis.com/drive/v3/files/FILE_ID?alt=media&key=API_KEY
```

`tracks.json` 只記冇金鑰嘅網址。金鑰放喺 `sync-config.js` 嘅 `driveApiKey`，頁面播放時先拼上。建立方法：

1. 用學校帳戶開 [Google Cloud Console](https://console.cloud.google.com/)，建立或揀一個專案。
2. 啟用 [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)。
3. 「憑證」→「建立憑證」→「API 金鑰」。
4. 限制金鑰：API 限制只選 Google Drive API。應用程式限制選「HTTP 參照網址」，加入 `https://ksl-blip.github.io/*`。
5. 將金鑰貼入 `sync-config.js` 嘅 `driveApiKey`，提交並推上 `main`。

呢個金鑰會公開。佢只可以讀「知道連結嘅人」已經睇到嘅檔，唔係寫入密碼。唔好用冇有參照網址限制嘅金鑰。未填金鑰時，頁面會話播唔到。

## 同步

頁面右上角有「同步」。撳下去會向 webhook 送：

```json
{ "action": "sync", "source": "classroom-audio-player", "folderId": "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0" }
```

Grok Bot routine 收到之後，列出該資料夾入面嘅 mp3，用下面指令更新 `tracks.json`（只寫連結，唔下載聲音檔），然後提交並推上 `main`。

`tools/audio-player/sync-config.js`：

```js
window.CLASSROOM_AUDIO_SYNC = {
  webhookUrl: "",
  folderId: "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0"
};
```

將 webhook 網址貼入 `webhookUrl` 對引號入面（要係 `https://` 開頭），提交並推上 `main`。留空時，撳「同步」會顯示「同步尚未設定」。

呢個檔案會公開。唔好放 Drive 金鑰、GitHub 金鑰或者其他寫入密碼。Webhook 只應該開始同步。佢要允許來自 `https://ksl-blip.github.io` 嘅 POST，瀏覽器先讀到回應。

## 手動加一條連結

```bash
node tools/audio-player/add-track.mjs --drive-id FILE_ID --title "標題" --bytes 12345
git add tools/audio-player/tracks.json
git commit -m "Add classroom audio link: 標題"
git push
```

刪除：喺 `tracks.json` 移除該項，再提交。唔使刪儲存庫入面嘅 mp3，因為聲音檔唔喺度。

播放速度，同上次揀咗邊首，只會記喺你自己部瀏覽器。鎖屏同背景播放用瀏覽器本身嘅播放控制。
