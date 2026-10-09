# 課堂語音播放器

公開網址：<https://ksl-blip.github.io/biology-simulators/tools/audio-player/>

任何人打開呢個網址都會聽到同一批 mp3。聲音檔放喺 `media/`，播放清單係 `tracks.json`。GitHub Pages 由 `main` 直接提供呢啲檔案。網頁只負責播放，入面冇上載金鑰。

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

播放速度，同上次揀咗邊首，只會記喺你自己部瀏覽器。鎖屏同背景播放用瀏覽器本身嘅播放控制。

以前用瀏覽器上傳、只存在呢部裝置嘅錄音，唔會自動變成共享。打開頁面如果仲見到舊檔，可以逐個下載，再用上面個指令加入。
