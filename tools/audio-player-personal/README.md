# 個人語音播放器

公開網址：<https://ksl-blip.github.io/biology-simulators/tools/audio-player-personal/>

呢個係由課堂版複製出來、畀老師自己用嘅播放器。網址同播放清單都同 [課堂語音播放器](../audio-player/) 分開。聲音檔放喺 `media/`，播放清單係 `tracks.json`。本機密碼、速度同埋上次播放用嘅瀏覽器鍵亦都同課堂版分開，唔會互相蓋過。

一開始清單係空嘅。用下面腳本加入錄音：

```bash
node tools/audio-player-personal/add-track.mjs path/to/lesson.mp3 --title "標題"
git add tools/audio-player-personal/tracks.json tools/audio-player-personal/media
git commit -m "Add personal audio: 標題"
git push
```

管理密碼預設係 `admin`（只係呢部裝置嘅本地鎖）。共用 Google Drive 資料夾已經設定；資料夾根目錄嘅新 MP3 會由自動同步加入播放器，通常最多約一小時。

刪除播放清單項目：解鎖「管理」後登入 Google，再撳「刪除」。呢頁會即時收起該項，並把紀錄寫入共用 Drive 資料夾根目錄嘅 `deleted-tracks.json`（同倉庫入面嘅忽略清單同一格式）。每小時同步必須尊重呢個清單，唔好把已刪項目加返網站，亦唔好刪除 Google Drive 入面嘅音頻檔。其他裝置會喺下次自動同步之後先更新，最多約一小時。「立即同步」同「儲存資料夾」唔使改任何設定檔。Google 登入用公開嘅網頁應用程式用戶端 ID，授權來源係 `https://ksl-blip.github.io`。唔好把任何金鑰寫入呢個公開資料夾。
