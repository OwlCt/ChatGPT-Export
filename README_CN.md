# ChatGPT Universal Exporter

[![CI](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml/badge.svg)](https://github.com/OwlCt/ChatGPT-Export/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English README](README.md)

一个基于浏览器的 ChatGPT 对话导出工具，支持 Markdown 导出和本地离线阅读器。

这个项目由两部分组成：

- `Tampermonkey.js`：在 ChatGPT 页面中运行，把对话导出为本地 ZIP 文件。
- `reader.html`：直接打开导出的 ZIP，在本地浏览器中阅读、搜索和预览对话。

适合用于个人备份、项目/团队空间归档，以及离线浏览 ChatGPT 历史对话。

## 功能

- 导出个人、项目和团队工作空间中的 ChatGPT 对话。
- 支持完整备份，也支持选择部分对话导出。
- 每个对话同时保存原始 JSON 和可读 Markdown。
- 支持把可下载的生成图片保存到 `images/`。
- 支持把可下载的文件附件保存到 `files/`。
- 保留项目文件夹结构。
- 使用 `reader.html` 本地打开导出包，不需要服务器。
- 支持标题搜索和全文搜索。
- 支持图片预览、消息复制、代码块复制和本地文件链接。
- 侧边栏按用户回合计数：一次用户提问和后续助手回复算一条。
- 较长对话会显示右侧快速跳转条。

## 安装

1. 安装 Tampermonkey 等用户脚本管理器。
2. 打开 `Tampermonkey.js`，安装为用户脚本。
3. 访问 `https://chatgpt.com/` 或 `https://chat.openai.com/`。
4. 点击页面上的 **Export Conversations** 浮动按钮。

## 使用

### 导出对话

1. 在已安装用户脚本的浏览器中打开 ChatGPT。
2. 点击 **Export Conversations**。
3. 选择导出范围：
   - 个人对话
   - 项目对话
   - 团队工作空间对话
4. 可以选择全部导出，也可以从列表中勾选部分对话导出。
5. 等待 ZIP 文件下载完成。

大型导出可能需要几分钟，因为对话和资源文件会通过当前浏览器会话逐个获取。

### 阅读导出包

1. 用现代浏览器打开 `reader.html`。
2. 把导出的 ZIP 拖到页面中，或通过文件选择器打开。
3. 在左侧边栏浏览对话。
4. 按需使用搜索、复制、图片预览、来源面板和本地文件链接。

阅读器完全在浏览器本地运行，可以直接从磁盘打开。

## ZIP 结构

典型导出内容：

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

JSON 文件保留 ChatGPT 返回的原始对话数据。Markdown 文件由 JSON 转换生成，方便阅读和索引。

## 技术架构

### 用户脚本导出器

`Tampermonkey.js` 运行在 ChatGPT 页面内，使用当前浏览器会话调用 ChatGPT 自身的后端接口。它会收集对话元数据，下载对话 JSON，在可用时提取图片和附件，然后用 JSZip 写入 ZIP 文件。

主要职责：

- 从同源浏览器请求中识别会话 token。
- 发现工作空间和项目。
- 拉取、筛选对话列表。
- 下载对话 JSON。
- 生成 Markdown。
- 提取图片和文件附件。
- 处理 ZIP 内文件名清理和去重。

### 离线阅读器

`reader.html` 是一个单文件本地 Web 应用。它内嵌 JSZip，可以在无网络环境下解析导出的 ZIP 文件。阅读器会在内存中建立对话、图片、文件和 Markdown 索引，然后渲染成类似 ChatGPT 的阅读界面。

主要职责：

- 在浏览器中解析 ZIP。
- 加载 JSON 和 Markdown 对话。
- 为本地图片和文件创建可访问 URL。
- 对话搜索和侧边栏分组。
- 消息渲染、代码/表格复制、图片预览和来源面板。
- 用户回合计数和长对话快速跳转。

### 测试

`test/` 目录包含基于 Node.js 的静态检查，覆盖用户脚本辅助函数和离线阅读器。测试会检查文件名清理、ZIP 文件名去重、重复图片引用处理，以及阅读器 UI 关键行为。

## 隐私与安全

- 导出过程在你的浏览器本地完成。
- 本项目不会把对话内容发送到任何第三方服务。
- 用户脚本只在脚本元数据声明的 ChatGPT 域名中运行。
- 用户脚本使用你当前的 ChatGPT 浏览器会话访问 ChatGPT 接口。
- `reader.html` 下载后可以离线使用。

## 依赖完整性

`Tampermonkey.js` 从 cdnjs 加载 JSZip `3.10.1`，并在 URL 中固定 SHA-256 片段：

```text
https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
SHA-256: acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
```

`reader.html` 直接内嵌 JSZip `3.10.1`，所以离线阅读器打开 ZIP 时不需要网络请求。

## 已知限制

- ChatGPT 后端接口是非公开接口，可能随时变化。
- 大型导出可能受到浏览器内存或接口限流影响。
- 图片和附件导出取决于每个对话中是否存在可用资源元数据。
- 部分团队工作空间可能需要先打开一个团队对话，脚本才能识别空间信息。
- 阅读器只在本地内存中导入 ZIP，关闭页面后不会持久保存导入内容。

## 致谢

导出器基于 [huhusmang/ChatGPT-Exporter](https://github.com/huhusmang/ChatGPT-Exporter) 开发，这是一个支持个人、项目和团队工作空间的 ChatGPT 对话导出工具。

该项目注明其上游基础来自 [ChatGPT Universal Exporter](https://greasyfork.org/zh-CN/scripts/538495-chatgpt-universal-exporter)，原始工作来自 Alex Mercer、Hanashiro 和 WenDavid。

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
|-- reader.html
|-- test/
|   |-- filename.test.js
|   `-- reader.test.js
|-- package.json
|-- README.md
`-- README_CN.md
```

## 许可证

MIT。详见 `LICENSE`。
