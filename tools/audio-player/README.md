# 課堂語音播放器

公開網址：<https://ksl-blip.github.io/biology-simulators/tools/audio-player/>

任何人打開呢個網址都會聽到同一批 mp3。聲音檔放喺 `media/`，播放清單係 `tracks.json`（相對路徑，例如 `media/lesson.mp3`）。GitHub Pages 由 `main` 直接提供呢啲檔案。頁面唔使 Drive API 金鑰，入面亦冇寫入金鑰。

## 加入錄音

喺儲存庫根目錄執行（`lesson.mp3` 可以係 edge-tts 匯出嘅檔）：

```bash
node tools/audio-player/add-track.mjs path/to/lesson.mp3 --title "標題"
```

腳本會將檔案複製到 `media/`，並加到 `tracks.json` 最前面。佢唔會提交，亦唔會讀取 GitHub 金鑰。檢查變更之後：

```bash
git add tools/audio-player/tracks.json tools/audio-player/media
git commit -m "Add classroom audio: 標題"
git push
```

推上 `main`（或開 pull request 合併）之後，等 Pages 更新，再重新打開上面個網址。單個檔案請保持喺 50 MB 以下。

刪除：喺 `tracks.json` 移除該項，刪除 `media/` 入面對應檔案，再提交。

## 管理密碼

右上角「管理」先至見到「立即同步」、「儲存資料夾」、每首嘅「刪除」同「換檔」。播放唔使密碼。每小時同步由機器人做，網頁唔會自己計時。

密碼只係呢部裝置嘅本地鎖，唔係伺服器登入。頁面用 SHA-256 雜湊存在瀏覽器，唔留明文，亦唔會把密碼傳去 webhook。未改過密碼時，預設係 `admin`。解鎖狀態只係呢個分頁工作階段，撳「鎖定」或者關掉分頁就收起。如果以前嘅本機播放器改過密碼，而家會讀返嗰個舊密碼再存成雜湊。

更改密碼要先解鎖。新密碼至少四個字。清除呢個網站嘅瀏覽器資料會重設做 `admin`，共享錄音唔會因此刪除。識得改瀏覽器儲存空間嘅人可以自己解開呢個鎖。

## 同步

解鎖之後可以改 Drive 資料夾，同埋撳「立即同步」。

「儲存資料夾」接受資料夾 ID，或者 `https://drive.google.com/drive/folders/資料夾ID` 這類連結。頁面會向 webhook 送：

```json
{ "action": "set-folder", "source": "classroom-audio-player", "folderId": "新的資料夾ID" }
```

機器人要將 `tools/audio-player/sync-config.js` 入面嘅 `folderId` 改成呢個值，然後提交並推上 `main`。頁面自己改唔到呢個檔。`webhookUrl` 保持唔變。

「立即同步」會送：

```json
{ "action": "sync", "source": "classroom-audio-player", "folderId": "資料夾ID", "immediate": true }
```

Grok Bot routine 收到之後，應該即時下載該 Drive 資料夾入面嘅 mp3，複製入 `tools/audio-player/media/`，更新 `tracks.json` 做相對路徑，然後提交並推上 `main`。每小時同步仍然由機器人自己做，唔使頁面再叫一次。同步唔好只寫 Drive 串流網址；頁面係由網站自己嘅 mp3 播放。

`tools/audio-player/sync-config.js`：

```js
window.CLASSROOM_AUDIO_SYNC = {
  webhookUrl: "",
  folderId: "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0"
};
```

將 webhook 網址貼入 `webhookUrl` 對引號入面（要係 `https://` 開頭），提交並推上 `main`。留空時，撳「立即同步」、「儲存資料夾」、「刪除」或「換檔」會顯示「同步尚未設定」。

刪除會送 `action: "delete"`，同埋 `track`（`id`、`title`、`file`）。換檔會送 `action: "replace"`、同一個 `track`、新檔名、`bytes`、`contentType` 同 `dataBase64`。瀏覽器換檔上限 12 MB。機器人收到之後要更新 `media/` 同 `tracks.json` 再提交，唔好只寫 Drive 連結。頁面唔會自己改公開播放清單，要等提交完成再重新載入。

呢個檔案會公開。唔好放 Drive 金鑰、GitHub 金鑰或者其他寫入密碼。Webhook 只應該開始同步、刪除或換檔。佢要允許來自 `https://ksl-blip.github.io` 嘅 POST，瀏覽器先讀到回應。

播放速度，同上次揀咗邊首，只會記喺你自己部瀏覽器。鎖屏同背景播放用瀏覽器本身嘅播放控制。

以前用瀏覽器上傳、只存在呢部裝置嘅錄音，唔會自動變成共享。打開頁面如果仲見到舊檔，可以逐個下載，再用上面個指令加入。
