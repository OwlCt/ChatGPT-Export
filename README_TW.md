# ChatGPT Universal Exporter

[![CI](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml/badge.svg)](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English README](README.md) · [简体中文](README_CN.md)

ChatGPT Universal Exporter 用於將 ChatGPT 對話匯出為本機 ZIP 檔案，並透過搭配的離線閱讀器進行瀏覽、搜尋與封存。所有處理皆在瀏覽器本機完成，不經過任何伺服器。

專案由兩個部分組成：

- `Tampermonkey.js`：使用者指令碼，執行於 ChatGPT 頁面，將對話封裝為 ZIP 檔案供下載。
- `index.html`：離線閱讀器，匯入 ZIP 後即可瀏覽、搜尋、快取並匯出 PDF，可作為靜態網站部署。

適用於個人對話備份、專案與團隊空間的封存，以及歷史紀錄的離線閱讀。

## 功能

- **匯出範圍**：支援個人對話、專案對話與團隊工作區，可整體備份，亦可依需求挑選部分對話。
- **雙格式儲存**：每則對話同時保存原始 JSON 與轉換後的 Markdown，分別便於索引與閱讀，並保留專案的資料夾結構。
- **資源擷取**：當對話中繼資料含有可用的下載網址時，自動將生成圖片與上傳附件分別存入 `images/` 與 `files/`。
- **閱讀與搜尋**：閱讀器支援標題搜尋與全文搜尋，支援訊息複製、程式碼區塊複製、圖片預覽以及本機檔案連結。
- **本機快取**：匯入的對話與附件會持久保存於瀏覽器 IndexedDB，再次開啟無須重新匯入。
- **介面與匯出**：介面支援英文、簡體中文、繁體中文切換與亮色／暗色／跟隨系統主題，並可預先設定匯入偏好；目前對話可匯出為文字可選取的 PDF。
- **閱讀體驗**：側邊欄以「使用者回合」計數，即一次提問及其後續回覆計為一則；較長的對話會提供右側快速跳轉導覽。

## 安裝

1. 安裝使用者指令碼管理器（如 Tampermonkey）。
2. 開啟 `Tampermonkey.js` 並將其安裝為使用者指令碼。
3. 前往 `https://chatgpt.com/` 或 `https://chat.openai.com/`。
4. 點擊頁面中出現的 **Export Conversations** 浮動按鈕。

## 使用

### 匯出對話

在已安裝使用者指令碼的瀏覽器中開啟 ChatGPT，點擊 **Export Conversations**，選擇匯出範圍（個人、專案或團隊工作區），如有需要可進一步勾選特定對話，接著等待 ZIP 檔案下載完成。

對話及其圖片、附件皆透過目前的瀏覽器工作階段逐一取得，因此資料量較大時，匯出花費數分鐘屬於正常情形。

### 閱讀匯出包

使用現代瀏覽器開啟已部署的 `index.html`，將 ZIP 拖入頁面（或透過檔案選擇器選取），左側邊欄即會列出所有對話。搜尋、複製、圖片預覽、來源面板、本機檔案連結與 PDF 匯出等功能皆可依需求使用。

閱讀器完全在本機執行。首次匯入後，對話與附件會保留於目前瀏覽器中，直到手動清除快取為止。

## ZIP 結構

典型的匯出內容如下：

```text
chatgpt_personal_backup_2026-06-26.zip
|-- Conversation title_abcd1234.json
|-- Conversation title_abcd1234.md
|-- images/
|   `-- img_01_file_abc123.png
|-- files/
|   `-- uploaded-document.pdf
`-- Project name/
    |-- Project conversation_efgh5678.json
    |-- Project conversation_efgh5678.md
    |-- images/
    `-- files/
```

JSON 檔案為 ChatGPT 回傳的原始對話資料，Markdown 檔案則由其轉換生成，用於便利閱讀與檢索。

## 技術架構

### 使用者指令碼匯出器

`Tampermonkey.js` 執行於 ChatGPT 頁面內部，透過目前已登入的瀏覽器工作階段呼叫 ChatGPT 自身的後端 API。其流程為：從同源請求中辨識工作階段 token，探查可用的工作區與專案，擷取並篩選對話清單，下載各對話的 JSON 並轉換為 Markdown，擷取可取得的圖片與附件，最終透過 JSZip 封裝為 ZIP，並在過程中處理檔名非法字元與重名衝突。

### 靜態閱讀器

`index.html` 是一個本機優先的靜態網頁，JSZip 直接從儲存庫的 `vendor/` 目錄載入，而非 CDN。它在瀏覽器中解析 ZIP，將對話、圖片與附件持久保存於 IndexedDB，為本機圖片與檔案產生可存取的 URL，並負責搜尋、側邊欄分組、訊息渲染、程式碼與表格複製、圖片預覽及來源面板。介面語言、主題與匯入偏好亦由其管理。PDF 匯出會保留圖片與來源引用，使用者回合計數與長對話跳轉導覽同樣於此實作。

### 測試

`test/` 目錄包含一組以 Node.js 為基礎的靜態檢查，涵蓋使用者指令碼輔助函式與閱讀器，重點驗證檔名清理、ZIP 重名去重、重複圖片引用處理，以及閱讀器 UI 的若干關鍵行為。

## 隱私與安全

- 匯出過程完全在本機瀏覽器中完成，本專案不會將任何對話內容傳送至第三方。
- 使用者指令碼僅在其中繼資料宣告的 ChatGPT 網域中生效，並透過目前已登入的工作階段存取 API。
- 閱讀器部署後不依賴任何第三方執行階段 CDN。
- 匯入內容僅儲存於目前瀏覽器的 IndexedDB，不會上傳至任何伺服器。

## 相依完整性

`Tampermonkey.js` 從 cdnjs 載入 JSZip `3.10.1`，並在 URL 中固定 SHA-256 校驗值：

```text
https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
SHA-256: acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
```

閱讀器則將 JSZip `3.10.1` 內建於儲存庫的 `vendor/` 目錄，執行階段不依賴 CDN。

## 已知限制

- ChatGPT 後端 API 為非公開介面，可能隨時變更。
- 資料量過大的匯出可能受到瀏覽器記憶體或 API 限流的影響。
- 圖片與附件能否匯出，取決於各對話中是否存在可用的資源中繼資料。
- 部分團隊工作區需先開啟一則團隊對話，指令碼才能辨識其工作區資訊。
- 在儲存空間不足、無痕模式或清除網站資料等情況下，瀏覽器可能刪除 IndexedDB 快取。
- PDF 匯出透過另開列印視窗並經由瀏覽器列印對話框儲存。此設計旨在保持文字可選取，並由瀏覽器負責分頁、圖片與來源引用的版面處理。

## 致謝

本匯出器基於 [huhusmang/ChatGPT-Exporter](https://github.com/huhusmang/ChatGPT-Exporter) 開發，後者是一個涵蓋個人、專案與團隊工作區的 ChatGPT 對話匯出工具。

該專案註明其上游基礎為 [ChatGPT Universal Exporter](https://greasyfork.org/zh-CN/scripts/538495-chatgpt-universal-exporter)，原始工作由 Alex Mercer、Hanashiro 與 WenDavid 完成。

## 開發

執行檢查：

```sh
node --check Tampermonkey.js
npm test
```

儲存庫結構：

```text
.
|-- Tampermonkey.js
|-- index.html
|-- reader.html
|-- assets/
|   |-- reader.css
|   |-- reader.js
|   `-- i18n/
|-- vendor/
|-- test/
|   |-- filename.test.js
|   `-- reader.test.js
|-- package.json
|-- README.md
|-- README_CN.md
`-- README_TW.md
```

## 授權

MIT，詳見 `LICENSE`。
