# ChatGPT Universal Exporter

[![CI](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml/badge.svg)](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文文档](README_CN.md)

A browser-based ChatGPT export tool with Markdown output and an offline ZIP reader.

The project has two parts:

- `Tampermonkey.js` exports conversations from ChatGPT into a local ZIP archive.
- `index.html` is a statically deployable reader for importing, searching, caching, and exporting conversations to PDF.

It is designed for personal backups, project/team workspace archives, and offline browsing of ChatGPT conversation history.

## Features

- Export personal, project, and team workspace conversations.
- Export selected conversations or full workspace backups.
- Save each conversation as both raw JSON and readable Markdown.
- Download supported generated images into `images/`.
- Download supported file attachments into `files/`.
- Preserve project folders in the ZIP structure.
- Open exports with the static reader, suitable for GitHub Pages or any static host.
- Search conversation titles and full message text.
- Preview images, copy messages, copy code blocks, and open local file links.
- Cache imported conversations, images, and attachments in browser IndexedDB.
- Switch between English and Chinese UI, light/dark/system theme, and import preferences.
- Export the current conversation as a text-selectable PDF.
- Group sidebar counts by user turns, where one user prompt and the following assistant response count as one item.
- Show a right-side jump rail for longer conversations.

## Installation

1. Install a userscript manager such as Tampermonkey.
2. Open `Tampermonkey.js` and install it as a userscript.
3. Visit `https://chatgpt.com/` or `https://chat.openai.com/`.
4. Click the floating **Export Conversations** button.

## Usage

### Export Conversations

1. Open ChatGPT in the browser where the userscript is installed.
2. Click **Export Conversations**.
3. Choose the export scope:
   - Personal conversations
   - Project conversations
   - Team workspace conversations
4. Optionally choose specific conversations from the picker.
5. Wait for the ZIP file to download.

Large exports can take several minutes because conversations and assets are fetched through the browser session.

### Read An Export

1. Open the deployed `index.html` in a modern browser.
2. Drag a ZIP export onto the page, or choose it from the file picker.
3. Browse conversations from the sidebar.
4. Use search, copy buttons, image preview, source panels, local file links, and PDF export as needed.

The reader runs entirely in the browser. After the first import, conversations and assets are saved in the current browser until you clear the cached data.

## ZIP Layout

Typical export contents:

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

Each JSON file keeps the original conversation data returned by ChatGPT. Each Markdown file is generated from that JSON for easier reading and indexing.

## Architecture

### Userscript Exporter

`Tampermonkey.js` runs inside ChatGPT pages and uses the active browser session to call ChatGPT's own backend APIs. It collects conversation metadata, fetches conversation JSON, extracts images and attachments when metadata is available, and writes everything into a ZIP with JSZip.

Main responsibilities:

- Session token detection from same-origin browser requests.
- Workspace and project discovery.
- Conversation listing and filtering.
- Conversation JSON download.
- Markdown conversion.
- Image and attachment extraction.
- ZIP filename sanitization and de-duplication.

### Static Reader

`index.html` is a static, local-first web app. It vendors JSZip from a local file, parses exported ZIP archives, persists imported content in IndexedDB, and exports the current conversation through a dedicated browser print/PDF layout.

Main responsibilities:

- ZIP parsing in the browser.
- Persistent IndexedDB storage for conversations, images, and file attachments.
- JSON and Markdown conversation loading.
- Local image and file URL creation.
- Conversation search and sidebar grouping.
- Message rendering, code/table copy controls, image preview, and source panels.
- English/Chinese UI, theme settings, and import preferences.
- Current-conversation PDF export with images and source references.
- User-turn counting and long-conversation jump navigation.

### Tests

The `test/` directory contains Node-based static checks for the userscript helpers and offline reader. The tests verify filename sanitization, ZIP filename de-duplication, duplicate image-reference handling, and reader UI guardrails.

## Privacy And Security

- Exports are generated locally in your browser.
- Conversation data is not sent to any third-party service by this project.
- The userscript runs only on the ChatGPT domains listed in its metadata.
- The userscript uses your active ChatGPT browser session to access ChatGPT APIs.
- The static reader does not load runtime dependencies from third-party CDNs.
- Imported content is stored in the current browser's IndexedDB and is not uploaded to a server.

## Dependency Integrity

`Tampermonkey.js` loads JSZip `3.10.1` from cdnjs and pins the URL with a SHA-256 fragment:

```text
https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
SHA-256: acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
```

The static reader vendors JSZip `3.10.1` under `vendor/`. Runtime dependency loading does not require a CDN.

## Known Limits

- ChatGPT backend APIs are private and may change without notice.
- Very large exports can hit browser memory or rate-limit constraints.
- Image and attachment export depends on metadata available in each conversation.
- Some team workspace detection may require opening a team conversation first.
- Browsers may delete IndexedDB data in private browsing, low-storage situations, or when site data is cleared.
- PDF export opens a dedicated print window and uses the browser's print dialog to save PDF files. This keeps text selectable and lets the browser handle pagination, images, and source-reference layout.

## Acknowledgements

The exporter is based on [huhusmang/ChatGPT-Exporter](https://github.com/huhusmang/ChatGPT-Exporter), a ChatGPT conversation export tool for personal, project, and team workspaces.

That project credits [ChatGPT Universal Exporter](https://greasyfork.org/zh-CN/scripts/538495-chatgpt-universal-exporter) as the upstream userscript foundation, with original work by Alex Mercer, Hanashiro, and WenDavid.

## Development

Run the checks:

```sh
node --check Tampermonkey.js
npm test
```

Repository layout:

```text
.
|-- Tampermonkey.js
|-- index.html
|-- reader.html
|-- assets/
|   |-- reader.css
|   |-- reader.js
|   |-- fonts/
|   `-- i18n/
|-- vendor/
|-- test/
|   |-- filename.test.js
|   `-- reader.test.js
|-- package.json
|-- README.md
`-- README_CN.md
```

## License

MIT. See `LICENSE`.
