# ChatGPT Universal Exporter

[![CI](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml/badge.svg)](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[简体中文](README_CN.md) · [繁體中文](README_TW.md)

ChatGPT Universal Exporter exports ChatGPT conversations to a local ZIP archive and provides a companion offline reader for browsing, searching, and archiving them. All processing happens locally in the browser; nothing is sent through a server.

The project has two parts:

- `Tampermonkey.js` — a userscript that runs on ChatGPT pages and packages conversations into a ZIP download.
- `reader/index.html` — an offline reader that imports a ZIP for browsing, search, caching, and PDF export, and can be deployed as a static site.

It is intended for personal backups, archiving project and team-workspace conversations, and reading through history offline.

## Features

- **Export scope** — personal conversations, project conversations, and team workspaces, either as a full backup or as a selected subset.
- **Dual-format output** — every conversation is saved as both raw JSON and converted Markdown, suited to indexing and reading respectively, with project folder structure preserved.
- **Asset extraction** — generated images and uploaded attachments are saved into `images/` and `files/` whenever a download URL is available in the conversation metadata.
- **Reading and search** — the reader supports title and full-text search, message and code-block copying, image preview, and local file links.
- **Local caching** — imported conversations and attachments are persisted in browser IndexedDB, so reopening requires no re-import.
- **Interface and export** — the UI switches between English, Simplified Chinese, and Traditional Chinese with light/dark/system themes and configurable import preferences; the current conversation exports to a PDF whose text remains selectable.
- **Reading experience** — the sidebar counts by user turn (one prompt and its following reply count as a single item), and longer conversations provide a jump rail on the right.

## Installation

1. Install a userscript manager such as Tampermonkey.
2. Open `Tampermonkey.js` and install it as a userscript.
3. Visit `https://chatgpt.com/` or `https://chat.openai.com/`.
4. Click the floating **Export Conversations** button that appears on the page.

## Usage

### Export Conversations

Open ChatGPT in the browser where the userscript is installed, click **Export Conversations**, choose an export scope (personal, project, or team workspace), optionally select specific conversations, and wait for the ZIP file to download.

Conversations and their images and attachments are fetched one at a time through the current browser session, so larger exports taking several minutes is expected.

### Read An Export

Open the deployed `index.html` in a modern browser and drag a ZIP onto the page (or choose it from the file picker); the conversations are then listed in the sidebar. Search, copy, image preview, source panels, local file links, and PDF export are all available as needed.

The reader runs entirely on your machine. After the first import, conversations and assets remain in the current browser until the cache is cleared manually.

## ZIP Layout

A typical export contains:

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

Each JSON file is the raw conversation data returned by ChatGPT. Each Markdown file is generated from it for easier reading and indexing.

## Architecture

### Userscript Exporter

`Tampermonkey.js` runs inside ChatGPT pages and uses the current logged-in browser session to call ChatGPT's own backend APIs. It identifies the session token from same-origin requests, discovers the available workspaces and projects, lists and filters conversations, downloads each conversation's JSON and converts it to Markdown, extracts images and attachments where available, and finally packages everything into a ZIP with JSZip — sanitizing illegal filename characters and resolving name collisions in the process.

### Static Reader

`index.html` is a local-first static web page. JSZip is loaded directly from the repository's `reader/vendor/` directory rather than a CDN. It parses the ZIP in the browser, persists conversations, images, and attachments in IndexedDB, creates accessible URLs for local images and files, and handles search, sidebar grouping, message rendering, code and table copy controls, image preview, and source panels. Interface language, theme, and import preferences are managed here as well. PDF export carries through images and source references, and user-turn counting and long-conversation jump navigation are implemented on this side.

### Tests

The `test/` directory contains a set of Node-based static checks covering the userscript helpers and the reader. They verify filename sanitization, ZIP name de-duplication, duplicate image-reference handling, and several key behaviors in the reader UI.

## Privacy And Security

- The export process runs entirely in your local browser; this project does not send any conversation content to a third party.
- The userscript takes effect only on the ChatGPT domains declared in its metadata, and accesses the APIs through the current logged-in session.
- Once deployed, the reader depends on no third-party runtime CDN.
- Imported content is stored only in the current browser's IndexedDB and is never uploaded to a server.

## Dependency Integrity

`Tampermonkey.js` loads JSZip `3.10.1` from cdnjs, pinning a SHA-256 checksum onto the URL:

```text
https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
SHA-256: acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
```

The reader instead vendors JSZip `3.10.1` under the repository's `reader/vendor/` directory, requiring no CDN at runtime.

## Known Limits

- ChatGPT's backend APIs are private and may change without notice.
- Very large exports may run into browser memory or rate-limit constraints.
- Whether images and attachments can be exported depends on the resource metadata present in each conversation.
- Some team workspaces require opening a team conversation first before the script can detect the workspace.
- Browsers may delete IndexedDB data under low storage, in private browsing, or when site data is cleared.
- PDF export opens a separate print window and saves through the browser's print dialog. This design keeps text selectable and lets the browser handle pagination, images, and source-reference layout.

## Acknowledgements

The exporter is based on [huhusmang/ChatGPT-Exporter](https://github.com/huhusmang/ChatGPT-Exporter), a ChatGPT export tool covering personal, project, and team workspaces.

That project in turn credits [ChatGPT Universal Exporter](https://greasyfork.org/zh-CN/scripts/538495-chatgpt-universal-exporter) as its upstream, originally written by Alex Mercer, Hanashiro, and WenDavid.

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
|-- reader/
|   |-- index.html
|   |-- reader.html
|   |-- openai.svg
|   |-- assets/
|   |   |-- reader.css
|   |   |-- reader.js
|   |   `-- i18n/
|   `-- vendor/
|-- test/
|   |-- filename.test.js
|   `-- reader.test.js
|-- package.json
|-- README.md
|-- README_CN.md
`-- README_TW.md
```

## License

MIT. See `LICENSE`.
