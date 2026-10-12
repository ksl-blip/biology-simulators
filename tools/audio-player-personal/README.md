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

管理密碼預設係 `admin`（只係呢部裝置嘅本地鎖）。同步 webhook 預設空白；要自己設 `sync-config.js` 先至用得「立即同步」。
