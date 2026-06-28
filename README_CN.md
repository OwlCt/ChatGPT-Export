# ChatGPT Universal Exporter

[![CI](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml/badge.svg)](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English README](README.md) · [繁體中文](README_TW.md)

ChatGPT Universal Exporter 用于将 ChatGPT 对话导出为本地 ZIP 文件，并通过配套的离线阅读器进行浏览、搜索与归档。全部处理均在浏览器本地完成，不经过任何服务器。

项目由两部分组成：

- `Tampermonkey.js`：用户脚本，运行于 ChatGPT 页面，将对话打包为 ZIP 文件供下载。
- `index.html`：离线阅读器，导入 ZIP 后即可浏览、搜索、缓存并导出 PDF，可作为静态站点部署。

适用于个人对话备份、项目与团队空间的归档，以及历史记录的离线阅读。

## 功能

- **导出范围**：支持个人对话、项目对话与团队工作空间，既可整体备份，也可按需选择部分对话。
- **双格式保存**：每条对话同时保存原始 JSON 与转换后的 Markdown，兼顾索引与阅读，并保留项目的文件夹结构。
- **资源提取**：当对话元数据中包含可用的下载地址时，自动将生成图片与上传附件分别存入 `images/` 与 `files/`。
- **阅读与检索**：阅读器支持标题搜索与全文搜索，支持消息复制、代码块复制、图片预览以及本地文件链接。
- **本地缓存**：导入的对话与附件持久化存储于浏览器 IndexedDB，再次打开无需重新导入。
- **界面与导出**：界面支持英文、简体中文、繁体中文切换与亮色/暗色/跟随系统主题，并可预设导入偏好；当前对话可导出为文字可选的 PDF。
- **阅读体验**：侧边栏按"用户回合"计数，即一次提问及其后续回复计为一条；较长对话提供右侧快速跳转导航。

## 安装

1. 安装用户脚本管理器（如 Tampermonkey）。
2. 打开 `Tampermonkey.js` 并将其安装为用户脚本。
3. 访问 `https://chatgpt.com/` 或 `https://chat.openai.com/`。
4. 点击页面中出现的 **Export Conversations** 浮动按钮。

## 使用

### 导出对话

在已安装用户脚本的浏览器中打开 ChatGPT，点击 **Export Conversations**，选择导出范围（个人、项目或团队工作空间），如有需要可进一步勾选具体对话，随后等待 ZIP 文件下载完成。

对话及其图片、附件均通过当前浏览器会话逐条获取，因此数据量较大时，导出耗时数分钟属于正常情况。

### 阅读导出包

使用现代浏览器打开已部署的 `index.html`，将 ZIP 拖入页面（或通过文件选择器选择），左侧边栏即会列出全部对话。搜索、复制、图片预览、来源面板、本地文件链接与 PDF 导出等功能均可按需使用。

阅读器完全在本地运行。首次导入后，对话与附件将保留在当前浏览器中，直至手动清除缓存。

## ZIP 结构

典型导出内容如下：

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

JSON 文件为 ChatGPT 返回的原始对话数据，Markdown 文件由其转换生成，用于便捷阅读与检索。

## 技术架构

### 用户脚本导出器

`Tampermonkey.js` 运行于 ChatGPT 页面内部，借助当前已登录的浏览器会话调用 ChatGPT 自身的后端接口。其工作流程为：从同源请求中识别会话 token，发现可用的工作空间与项目，拉取并筛选对话列表，下载各对话的 JSON 并转换为 Markdown，提取可获取的图片与附件，最终通过 JSZip 打包为 ZIP，并在此过程中处理文件名非法字符与重名冲突。

### 静态阅读器

`index.html` 是一个本地优先的静态网页，JSZip 直接从仓库 `vendor/` 目录加载而非 CDN。它在浏览器中解析 ZIP，将对话、图片与附件持久化存储于 IndexedDB，为本地图片与文件生成可访问 URL，并负责搜索、侧边栏分组、消息渲染、代码与表格复制、图片预览及来源面板。界面语言、主题与导入偏好亦由其管理。PDF 导出会保留图片与来源引用，用户回合计数与长对话跳转导航同样在此实现。

### 测试

`test/` 目录包含一组基于 Node.js 的静态检查，覆盖用户脚本辅助函数与阅读器，重点验证文件名清理、ZIP 重名去重、重复图片引用处理，以及阅读器 UI 的若干关键行为。

## 隐私与安全

- 导出过程完全在本地浏览器中完成，本项目不会将任何对话内容发送至第三方。
- 用户脚本仅在其元数据声明的 ChatGPT 域名中生效，并通过当前已登录的会话访问接口。
- 阅读器部署后不依赖任何第三方运行时 CDN。
- 导入内容仅存储于当前浏览器的 IndexedDB，不会上传至任何服务器。

## 依赖完整性

`Tampermonkey.js` 从 cdnjs 加载 JSZip `3.10.1`，并在 URL 中固定 SHA-256 校验值：

```text
https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
SHA-256: acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
```

阅读器则将 JSZip `3.10.1` 内置于仓库 `vendor/` 目录，运行时不依赖 CDN。

## 已知限制

- ChatGPT 后端接口为非公开接口，可能随时变更。
- 数据量过大的导出可能受到浏览器内存或接口限流的影响。
- 图片与附件能否导出，取决于各对话中是否存在可用的资源元数据。
- 部分团队工作空间需先打开一个团队对话，脚本方能识别其空间信息。
- 在存储空间不足、隐私模式或清除站点数据等情况下，浏览器可能删除 IndexedDB 缓存。
- PDF 导出通过另开打印窗口并经浏览器打印对话框保存。此设计旨在保持文字可选，并由浏览器负责分页、图片与来源引用的版式处理。

## 致谢

本导出器基于 [huhusmang/ChatGPT-Exporter](https://github.com/huhusmang/ChatGPT-Exporter) 开发，后者是一个覆盖个人、项目与团队工作空间的 ChatGPT 对话导出工具。

该项目注明其上游基础为 [ChatGPT Universal Exporter](https://greasyfork.org/zh-CN/scripts/538495-chatgpt-universal-exporter)，原始工作由 Alex Mercer、Hanashiro 与 WenDavid 完成。

## 开发

运行检查：

```sh
node --check Tampermonkey.js
npm test
```

仓库结构：

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

## 许可证

MIT，详见 `LICENSE`。
