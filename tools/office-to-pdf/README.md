# Office → PDF 轉換器

本機工具：將 Word、Excel、PowerPoint，或者包含呢啲檔案嘅 ZIP，轉成 PDF。可以用 LibreOffice 做高質轉換，再選擇合併成**一個 PDF**，或者維持多個 PDF 再下載成 **ZIP**。

呢個唔係 GitHub Pages 靜態網頁。GitHub Pages 只會把資料夾入面嘅 HTML、CSS、JS 當普通檔案提供，**唔會**執行 `server.py`，亦**唔會**提供 LibreOffice。轉換一定要喺你自己部電腦安裝 Python 同 LibreOffice（`soffice`），然後喺本機啟動伺服器。學生首頁 `index.html` 冇連去呢個工具。

## 系統要求

- Python 3.10 或以上
- LibreOffice，而且命令列搵到 `soffice` 或 `libreoffice`
- 依賴：Flask、pypdf（見 `requirements.txt`）

macOS 安裝 LibreOffice 之後，如果終端機搵唔到 `soffice`，可以先加：

```bash
export PATH="/Applications/LibreOffice.app/Contents/MacOS:$PATH"
```

Windows 要將 LibreOffice 嘅 `program` 資料夾（入面有 `soffice.exe`）加到 PATH。

## 啟動

喺儲存庫根目錄：

```bash
cd tools/office-to-pdf
./start.sh
```

`start.sh` 首次會建立 `.venv` 並安裝依賴，然後執行 `server.py`。

或者自己開虛擬環境：

```bash
cd tools/office-to-pdf
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py
```

然後用瀏覽器開啟：**http://127.0.0.1:8765**

直接用瀏覽器打開 `static/index.html`，或者打開 GitHub Pages 上嘅同一路徑，轉換都唔會成功，因為冇本機伺服器。

## 用法

1. 拖放或選擇 `.docx`／`.doc`／`.xlsx`／`.xls`／`.pptx`／`.ppt`／`.pdf`／`.zip`（亦支援 `.odt`／`.ods`／`.odp`）
2. 選擇輸出方式：
   - **合併成一個 PDF**
   - **維持多個 PDF（下載 ZIP）**
3. 按「開始轉換」，完成後下載

`testdata/` 有細小樣本（Word、Excel，以及一個 ZIP），可以用嚟試轉換。

## 支援格式

| 類型 | 副檔名 |
|------|--------|
| Word | `.doc` `.docx` `.odt` |
| Excel | `.xls` `.xlsx` `.ods` |
| PowerPoint | `.ppt` `.pptx` `.odp` |
| PDF | `.pdf`（合併時直接納入） |
| ZIP | `.zip`（自動解壓內含 Office／PDF） |

## API（簡要）

- `GET /api/health` — 檢查 LibreOffice
- `POST /api/convert` — `multipart/form-data`：`files`（多檔）、`mode`=`merge`\|`multi`
- `GET /api/download/<job_id>/<filename>` — 下載結果

## 注意

- 轉換喺本機進行，檔案唔會上載互聯網
- 複雜動畫、巨集、特殊字型可能同原檔略有差異
- 單次上載上限約 200 MB；單一檔案轉換逾時 180 秒
- 運行時產生嘅 `.venv/`、`work/`、`temp/`、`uploads/`、`output/` 唔好提交入儲存庫
