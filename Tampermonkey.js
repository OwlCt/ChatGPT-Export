// ==UserScript==
// @name         ChatGPT Universal Exporter (Markdown Support)
// @name:zh-CN   ChatGPT 通用导出器（Markdown 支持）
// @name:zh-TW   ChatGPT 通用匯出器（Markdown 支援）
// @namespace    https://greasyfork.org/users/1616937-owlct
// @version      1.4.0
// @description  Export ChatGPT conversations from personal, project, and team workspaces to local ZIP archives with JSON, Markdown, assets, and an offline reader.
// @description:zh-CN  将 ChatGPT 个人、项目和团队空间对话导出为本地 ZIP，包含 JSON、Markdown、资源文件和离线阅读器。
// @description:zh-TW  將 ChatGPT 個人、專案和團隊工作區對話匯出為本機 ZIP，包含 JSON、Markdown、資源檔案和離線閱讀器。
// @author       OwlCt
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#sha256=acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
// @grant        none
// @homepageURL  https://github.com/OwlCt/ChatGPT-Export
// @supportURL   https://github.com/OwlCt/ChatGPT-Export/issues
// @source       https://github.com/OwlCt/ChatGPT-Export
// ==/UserScript==

/* ============================================================
    v1.4.0 变更 (ChatGPT Intelligent UI)
    ------------------------------------------------------------
    • 浮动按钮被新界面卸掉后会重新挂上，并避开底部输入栏
    • 助手回复优先使用 model_dil_v2.fallbackMarkdown，不执行 DIL / AppBlock
    • Markdown 保留思考摘要、Canvas 文档、工具输出；只下载 OpenAI 托管图片
    • 会话列表同时接受 offset 与 cursor；令牌仍只从本站请求和 /api/auth/session 读取
    ========================================================== */

(function () {
    'use strict';

    // --- 配置与全局变量 ---
    const BASE_DELAY = 600;
    const JITTER = 400;
    const PAGE_LIMIT = 100;
    const PROJECT_SIDEBAR_PREVIEW = 5;
    const PROJECT_SIDEBAR_LIMIT = 50;
    let accessToken = null;
    let capturedWorkspaceIds = new Set(); // 使用Set存储网络拦截到的ID，确保唯一性
    let supplementalWorkspaceIds = new Set(); // 账号目录里看到的 ID，只用于团队选择，不自动加到每次请求上

    const SCRIPT_FALLBACK_LOCALE = 'en-US';
    const SCRIPT_LOCALES = {
        'en-US': {
            'button.export': 'Export Conversations',
            'button.exportAll': 'Export all',
            'button.exportAllZip': 'Export all (ZIP)',
            'button.selectConversationsExport': 'Select chats',
            'button.cancel': 'Cancel',
            'button.back': 'Back',
            'button.clear': 'Clear',
            'button.selectAll': 'Select all',
            'button.clearDates': 'Clear dates',
            'button.exportSelected': 'Export selected ({count})',
            'button.loadMore': 'Load more ({count} remaining)',
            'button.done': 'Done',
            'button.error': 'Error',
            'fallback.conversation': 'Conversation',
            'fallback.untitledConversation': 'Untitled Conversation',
            'fallback.unknown': 'Unknown',
            'fallback.untitledProject': 'Untitled Project',
            'fallback.file': 'File',
            'mode.personal': 'Personal space',
            'mode.project': 'Project space',
            'mode.team': 'Team space',
            'dialog.selectSpaceTitle': 'Choose export space',
            'dialog.personalTitle': 'Personal space',
            'dialog.personalCopy': 'Export conversations from your personal account.',
            'dialog.projectTitle': 'Project space',
            'dialog.projectCopy': 'Export project-space conversations, grouped by project.',
            'dialog.teamTitle': 'Team space',
            'dialog.teamCopy': 'Export team-space conversations. The Workspace ID is detected automatically.',
            'dialog.exportTeamTitle': 'Export team space',
            'dialog.multipleWorkspace': 'Multiple workspaces detected. Choose one:',
            'dialog.workspaceDetected': 'Workspace ID detected automatically:',
            'dialog.workspaceMissing': 'Could not detect a Workspace ID.',
            'dialog.workspaceMissingHint': 'Refresh the page, open a team conversation, or enter one manually below.',
            'dialog.manualWorkspaceLabel': 'Team Workspace ID:',
            'dialog.workspacePlaceholder': 'Paste your Workspace ID (ws-...)',
            'dialog.selectConversationsTitle': 'Choose conversations to export',
            'dialog.space': 'Space: {mode}{workspace}',
            'dialog.searchPlaceholder': 'Search title/project/ID',
            'dialog.projectScopeLocked': 'Project space only includes project conversations',
            'filter.scopeAll': 'All scopes',
            'filter.scopeProject': 'Projects only',
            'filter.scopeRoot': 'Root only',
            'filter.statusAll': 'All statuses',
            'filter.statusActive': 'Active only',
            'filter.statusArchived': 'Archived only',
            'filter.timeUpdate': 'By updated time',
            'filter.timeCreate': 'By created time',
            'filter.dateTo': 'to',
            'status.loadingList': 'Loading list...',
            'status.listSummary': '{total} total, {filtered} filtered, showing {visible}, selected {selected}',
            'status.noMatches': 'No matching conversations.',
            'status.loadFailed': 'Load failed: {message}',
            'status.fetchingOrphanConversations': 'Fetching root conversations...',
            'status.rootProgress': 'Root ({current}/{total})',
            'status.fetchingProjectList': 'Fetching project list...',
            'status.project': 'Project: {title}',
            'status.projectProgress': '{title}... ({current}/{total})',
            'status.generatingZip': 'Generating ZIP...',
            'status.rootPage': 'Root conversations ({state} p{page})',
            'status.active': 'Active',
            'status.archived': 'Archived',
            'picker.timeCreated': 'Created',
            'picker.timeUpdated': 'Updated',
            'picker.unknownTime': 'Unknown',
            'picker.projectTag': 'Project: {title}',
            'picker.archivedTag': 'Archived',
            'alert.accessTokenUnavailable': 'Could not get Access Token. Refresh the page or open any conversation and try again.',
            'alert.exportCompletedWithFailures': 'Export complete, but {count} conversations failed and were skipped:\n\n{list}',
            'alert.exportSuccess': 'Export complete.',
            'alert.exportFailed': 'Export failed: {message}. See the console for details (F12 -> Console).',
            'alert.noProjectConversations': 'No project-space conversations found.',
            'alert.projectExportFailed': 'Project-space export failed: {message}',
            'alert.invalidWorkspaceId': 'Choose or enter a valid Team Workspace ID.',
            'confirm.scheduledExport': 'Chrome extension requested exporting {mode} conversations (source: {source}). Start now?',
            'error.deviceIdUnavailable': 'Could not get oai-device-id. Make sure you are signed in and refresh the page.',
            'error.projectSpaceListFailed': 'Failed to fetch project-space list ({status})',
            'error.projectConversationListFailed': 'Failed to list project conversations ({status})',
            'error.rootConversationListFailed': 'Failed to list root conversations ({status})',
            'error.conversationListFailed': 'Failed to list conversations ({status})',
            'error.projectSpaceConversationListFailed': 'Failed to list project-space conversations ({status})',
            'error.conversationDetailFailed': 'Failed to fetch conversation {id} ({status})',
            'error.fileDownloadUrlFailed': 'Failed to get file download URL ({status})',
            'error.imageDownloadFailed': 'Image download failed ({status})',
            'error.fileDownloadFailed': 'File download failed ({status})',
            'error.noDownloadUrl': 'No available download URL',
            'block.reasoning': 'Thinking',
            'block.thoughtFor': 'Thought for {seconds}s',
            'block.canvas': 'Canvas',
            'block.tool': 'Tool',
            'block.app': 'Interactive app'
        },
        'zh-CN': {
            'button.export': '导出对话',
            'button.exportAll': '导出全部',
            'button.exportAllZip': '导出全部 (ZIP)',
            'button.selectConversationsExport': '选择对话导出',
            'button.cancel': '取消',
            'button.back': '返回',
            'button.clear': '清空',
            'button.selectAll': '全选',
            'button.clearDates': '清空日期',
            'button.exportSelected': '导出选中 ({count})',
            'button.loadMore': '加载更多（剩余 {count} 条）',
            'button.done': '完成',
            'button.error': '错误',
            'fallback.conversation': '对话',
            'fallback.untitledConversation': '未命名对话',
            'fallback.unknown': '未知',
            'fallback.untitledProject': '未命名项目',
            'fallback.file': '文件',
            'mode.personal': '个人空间',
            'mode.project': '项目空间',
            'mode.team': '团队空间',
            'dialog.selectSpaceTitle': '选择要导出的空间',
            'dialog.personalTitle': '个人空间',
            'dialog.personalCopy': '导出您个人账户下的对话。',
            'dialog.projectTitle': '项目空间',
            'dialog.projectCopy': '导出项目空间下的对话，将按项目自动分组。',
            'dialog.teamTitle': '团队空间',
            'dialog.teamCopy': '导出团队空间下的对话，将自动检测 ID。',
            'dialog.exportTeamTitle': '导出团队空间',
            'dialog.multipleWorkspace': '检测到多个 Workspace，请选择一个：',
            'dialog.workspaceDetected': '已自动检测到 Workspace ID：',
            'dialog.workspaceMissing': '未能自动检测到 Workspace ID。',
            'dialog.workspaceMissingHint': '请尝试刷新页面或打开一个团队对话，或在下方手动输入。',
            'dialog.manualWorkspaceLabel': '手动输入 Team Workspace ID：',
            'dialog.workspacePlaceholder': '粘贴您的 Workspace ID (ws-...)',
            'dialog.selectConversationsTitle': '选择要导出的对话',
            'dialog.space': '空间：{mode}{workspace}',
            'dialog.searchPlaceholder': '搜索标题/项目名/ID',
            'dialog.projectScopeLocked': '项目空间仅包含项目对话',
            'filter.scopeAll': '全部范围',
            'filter.scopeProject': '仅项目',
            'filter.scopeRoot': '仅项目外',
            'filter.statusAll': '全部状态',
            'filter.statusActive': '仅未归档',
            'filter.statusArchived': '仅已归档',
            'filter.timeUpdate': '按更新时间',
            'filter.timeCreate': '按创建时间',
            'filter.dateTo': '至',
            'status.loadingList': '正在加载列表...',
            'status.listSummary': '共 {total} 条，当前筛选 {filtered} 条，显示 {visible} 条，已选 {selected} 条',
            'status.noMatches': '没有匹配的对话。',
            'status.loadFailed': '加载失败: {message}',
            'status.fetchingOrphanConversations': '获取项目外对话...',
            'status.rootProgress': '根目录 ({current}/{total})',
            'status.fetchingProjectList': '获取项目列表...',
            'status.project': '项目: {title}',
            'status.projectProgress': '{title}... ({current}/{total})',
            'status.generatingZip': '生成 ZIP 文件...',
            'status.rootPage': '项目外对话 ({state} p{page})',
            'status.active': 'Active',
            'status.archived': 'Archived',
            'picker.timeCreated': '创建',
            'picker.timeUpdated': '更新',
            'picker.unknownTime': '未知',
            'picker.projectTag': '项目: {title}',
            'picker.archivedTag': '已归档',
            'alert.accessTokenUnavailable': '无法获取 Access Token。请刷新页面或打开任意一个对话后再试。',
            'alert.exportCompletedWithFailures': '导出完成，但有 {count} 个对话失败（已跳过）：\n\n{list}',
            'alert.exportSuccess': '导出完成！',
            'alert.exportFailed': '导出失败: {message}。详情请查看控制台（F12 -> Console）。',
            'alert.noProjectConversations': '未找到项目空间对话。',
            'alert.projectExportFailed': '导出项目空间失败: {message}',
            'alert.invalidWorkspaceId': '请选择或输入一个有效的 Team Workspace ID！',
            'confirm.scheduledExport': 'Chrome 扩展请求导出 {mode} 对话（来源: {source}）。是否开始？',
            'error.deviceIdUnavailable': '无法获取 oai-device-id，请确保已登录并刷新页面。',
            'error.projectSpaceListFailed': '获取项目空间列表失败 ({status})',
            'error.projectConversationListFailed': '列举项目对话列表失败 ({status})',
            'error.rootConversationListFailed': '列举项目外对话列表失败 ({status})',
            'error.conversationListFailed': '列举对话列表失败 ({status})',
            'error.projectSpaceConversationListFailed': '列举项目空间对话列表失败 ({status})',
            'error.conversationDetailFailed': '获取对话详情失败 conv {id} ({status})',
            'error.fileDownloadUrlFailed': '文件下载链接获取失败 ({status})',
            'error.imageDownloadFailed': '图片下载失败 ({status})',
            'error.fileDownloadFailed': '文件下载失败 ({status})',
            'error.noDownloadUrl': '没有可用下载链接',
            'block.reasoning': '思考',
            'block.thoughtFor': '已思考 {seconds} 秒',
            'block.canvas': '画布',
            'block.tool': '工具',
            'block.app': '交互应用'
        }
    };

    function makeTraditionalChineseScriptLocale(source) {
        const replacements = [
            ['导出', '匯出'], ['导入', '匯入'], ['选择', '選擇'], ['对话', '對話'], ['设置', '設定'],
            ['关闭', '關閉'], ['打开', '開啟'], ['边栏', '邊欄'], ['项目', '項目'], ['团队', '團隊'],
            ['空间', '空間'], ['个人', '個人'], ['检测', '偵測'], ['多个', '多個'], ['请输入', '請輸入'],
            ['输入', '輸入'], ['粘贴', '貼上'], ['标题', '標題'], ['范围', '範圍'], ['状态', '狀態'],
            ['归档', '封存'], ['创建', '建立'], ['更新', '更新'], ['清空', '清除'], ['加载', '載入'],
            ['列表', '清單'], ['筛选', '篩選'], ['显示', '顯示'], ['选中', '選取'], ['匹配', '符合'],
            ['时间', '時間'], ['未知', '未知'], ['全部', '全部'], ['取消', '取消'], ['返回', '返回'],
            ['完成', '完成'], ['错误', '錯誤'], ['未命名', '未命名'], ['文件', '檔案'], ['获取', '取得'],
            ['根目录', '根目錄'], ['生成', '產生'], ['失败', '失敗'], ['跳过', '略過'], ['无法', '無法'],
            ['刷新', '重新整理'], ['页面', '頁面'], ['任意', '任一'], ['成功', '成功'], ['图片', '圖片'],
            ['下载', '下載'], ['链接', '連結'], ['没有', '沒有'], ['可用', '可用'], ['详情', '詳細資訊'],
            ['控制台', '主控台'], ['发生', '發生'], ['严重', '嚴重'], ['自动', '自動'], ['列举', '列出'],
            ['有效', '有效'], ['请求', '要求'], ['来源', '來源'], ['开始', '開始'], ['确保', '確保'],
            ['登录', '登入'], ['侧边栏', '側邊欄'], ['预览', '預覽'], ['会话', '對話'], ['浏览器', '瀏覽器'],
            ['当前', '目前'], ['剩余', '剩餘'], ['仅', '僅'], ['按', '依'], ['个', '個'], ['条', '則'],
            ['请', '請'], ['这个', '這個'], ['一个', '一個'],
            ['画布', '畫布'], ['交互', '互動'], ['应用', '應用']
        ];
        const converted = {};
        Object.entries(source).forEach(([key, value]) => {
            let text = value;
            replacements.forEach(([from, to]) => {
                text = text.split(from).join(to);
            });
            converted[key] = text;
        });
        return converted;
    }

    SCRIPT_LOCALES['zh-TW'] = makeTraditionalChineseScriptLocale(SCRIPT_LOCALES['zh-CN']);

    function normalizeScriptLocale(code) {
        return String(code || '').trim().replace(/_/g, '-');
    }

    function detectScriptLocale(languages = null) {
        const provided = Array.isArray(languages)
            ? languages
            : languages
                ? [languages]
                : null;
        const nav = window.navigator || (typeof navigator !== 'undefined' ? navigator : null);
        const candidates = provided || [
            ...(Array.isArray(nav?.languages) ? nav.languages : []),
            nav?.language,
            document.documentElement?.lang
        ].filter(Boolean);
        const normalized = candidates.map(normalizeScriptLocale).filter(Boolean);

        for (const code of normalized) {
            if (SCRIPT_LOCALES[code]) return code;
        }
        for (const code of normalized) {
            const lower = code.toLowerCase();
            if (['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'].some(locale => lower === locale || lower.startsWith(`${locale}-`))) return 'zh-TW';
            if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-CN';
            if (lower === 'en' || lower.startsWith('en-')) return 'en-US';
        }
        return SCRIPT_FALLBACK_LOCALE;
    }

    const SCRIPT_LOCALE_CODE = detectScriptLocale();

    function getScriptTranslation(key, vars = {}, localeCode = SCRIPT_LOCALE_CODE) {
        const locale = SCRIPT_LOCALES[localeCode] || SCRIPT_LOCALES[SCRIPT_FALLBACK_LOCALE];
        const fallback = SCRIPT_LOCALES[SCRIPT_FALLBACK_LOCALE];
        const template = locale[key] ?? fallback[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (_, name) => (
            Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
        ));
    }

    const t = getScriptTranslation;

    // --- 核心：网络拦截与信息捕获 ---
    (function interceptNetwork() {
        const rawFetch = window.fetch;
        window.fetch = async function (resource, options) {
            try {
                tryCaptureToken(options?.headers);
                tryCaptureWorkspace(options?.headers);
                if (typeof Request !== 'undefined' && resource instanceof Request) {
                    tryCaptureToken(resource.headers);
                    tryCaptureWorkspace(resource.headers);
                }
            } catch (_) {}
            return rawFetch.apply(this, arguments);
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener('readystatechange', () => {
                if (this.readyState === 4) {
                    try {
                        tryCaptureToken(this.getRequestHeader('Authorization'));
                        tryCaptureToken(this.getRequestHeader('X-Authorization'));
                        tryCaptureWorkspace(this.getRequestHeader('ChatGPT-Account-Id'));
                    } catch (_) {}
                }
            });
            return rawOpen.apply(this, arguments);
        };
    })();

    function headerValue(headers, name) {
        if (!headers) return '';
        if (typeof headers === 'string') {
            return name.toLowerCase() === 'authorization' ? headers : '';
        }
        if (typeof Headers !== 'undefined' && headers instanceof Headers) {
            return headers.get(name) || '';
        }
        if (typeof headers !== 'object') return '';
        const target = name.toLowerCase();
        for (const key of Object.keys(headers)) {
            if (String(key).toLowerCase() === target && headers[key]) return headers[key];
        }
        return '';
    }

    function rememberAccessToken(token) {
        const value = String(token || '').trim();
        if (!value || value.toLowerCase() === 'dummy') return '';
        accessToken = value;
        rememberTokenAccounts(value);
        return value;
    }

    function tryCaptureToken(header) {
        if (!header) return;
        const values = typeof header === 'string'
            ? [header]
            : [headerValue(header, 'Authorization'), headerValue(header, 'X-Authorization')];
        values.forEach(value => {
            if (typeof value === 'string' && value.startsWith('Bearer ')) {
                rememberAccessToken(value.slice(7));
            }
        });
    }

    function tryCaptureWorkspace(header) {
        const id = typeof header === 'string' ? header : headerValue(header, 'ChatGPT-Account-Id');
        if (id && !capturedWorkspaceIds.has(id)) {
            console.log('🎯 捕获到 Workspace ID:', id);
            capturedWorkspaceIds.add(id);
        }
    }

    function decodeJwtPayload(token) {
        try {
            const part = String(token || '').split('.')[1];
            if (!part) return null;
            const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
            if (typeof atob !== 'function') return null;
            const binary = atob(padded);
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            const json = typeof TextDecoder !== 'undefined'
                ? new TextDecoder().decode(bytes)
                : binary;
            return JSON.parse(json);
        } catch (_) {
            return null;
        }
    }

    function rememberTokenAccounts(token) {
        const payload = decodeJwtPayload(token);
        const auth = payload?.['https://api.openai.com/auth'];
        const accountId = auth?.chatgpt_account_id || auth?.account_id || payload?.chatgpt_account_id;
        if (accountId) supplementalWorkspaceIds.add(String(accountId));
    }

    async function ensureAccessToken() {
        if (accessToken) return accessToken;
        const sessionUrls = ['/api/auth/session', '/api/auth/session?unstable_client=true'];
        for (const url of sessionUrls) {
            try {
                const response = await fetch(url, { credentials: 'include' });
                if (!response.ok) continue;
                const session = await response.json();
                const token = rememberAccessToken(session?.accessToken || session?.access_token);
                if (token) return token;
            } catch (_) {}
        }
        alert(t('alert.accessTokenUnavailable'));
        return null;
    }

    async function loadAccountDirectory() {
        try {
            if (!accessToken) {
                const response = await fetch('/api/auth/session', { credentials: 'include' });
                if (response.ok) {
                    const session = await response.json();
                    rememberAccessToken(session?.accessToken || session?.access_token);
                }
            }
            if (!accessToken) return;
            const headers = buildApiHeaders(null);
            const response = await fetch('/backend-api/accounts/check/v4-2023-04-27', {
                headers,
                credentials: 'include'
            });
            if (!response.ok) return;
            const data = await response.json();
            const accounts = data?.accounts;
            if (!accounts || typeof accounts !== 'object') return;
            Object.values(accounts).forEach(entry => {
                const id = entry?.account?.account_id || entry?.account?.id;
                if (id) supplementalWorkspaceIds.add(String(id));
            });
        } catch (_) {}
    }

    // --- 辅助函数 ---
    const MAX_SAFE_NAME_LENGTH = 120;
    const MAX_SAFE_ID_LENGTH = 64;
    const MAX_IMAGE_ID_LENGTH = 80;
    const LOCAL_FILE_REF_PREFIX = 'chatgpt-file:';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const jitter = () => BASE_DELAY + Math.random() * JITTER;
    const sanitizeFilename = (name, fallback = 'untitled', maxLength = MAX_SAFE_NAME_LENGTH) => {
        const fallbackName = String(fallback || 'untitled')
            .replace(/[\x00-\x1f\x7f]/g, '')
            .replace(/[\/\\?%*:|"<>]/g, '-')
            .trim() || 'untitled';
        let safe = String(name ?? '')
            .replace(/[\x00-\x1f\x7f]/g, '')
            .replace(/[\/\\?%*:|"<>]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^[. -]+|[. -]+$/g, '');
        if (!safe) safe = fallbackName;
        if (safe.length > maxLength) {
            safe = safe.slice(0, maxLength).replace(/[. -]+$/g, '');
        }
        return safe || fallbackName;
    };
    const sanitizeImageFilenamePart = (value, fallback = 'image') => {
        const safe = sanitizeFilename(value, fallback, MAX_IMAGE_ID_LENGTH)
            .replace(/[^A-Za-z0-9_.-]+/g, '-')
            .replace(/[-.]{2,}/g, '-')
            .replace(/^[.-]+|[.-]+$/g, '');
        return safe || fallback;
    };
    const splitFilename = (filename) => {
        const idx = filename.lastIndexOf('.');
        if (idx <= 0 || idx === filename.length - 1) return { stem: filename, ext: '' };
        return { stem: filename.slice(0, idx), ext: filename.slice(idx) };
    };
    const makeUniqueZipFilename = (filename, registry, scopeKey = '') => {
        if (!registry) return filename;
        const key = scopeKey || '';
        if (!registry.has(key)) registry.set(key, new Set());
        const used = registry.get(key);
        let candidate = filename;
        if (used.has(candidate)) {
            const { stem, ext } = splitFilename(filename);
            let index = 2;
            do {
                candidate = `${stem} (${index++})${ext}`;
            } while (used.has(candidate));
        }
        used.add(candidate);
        return candidate;
    };
    const normalizeEpochSeconds = (value) => {
        if (!value) return 0;
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value > 1e12 ? Math.floor(value / 1000) : value;
        }
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return Math.floor(parsed / 1000);
            }
        }
        return 0;
    };
    const formatTimestamp = (value) => {
        const seconds = normalizeEpochSeconds(value);
        if (!seconds) return '';
        const date = new Date(seconds * 1000);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
    };
    const parseDateInputToEpoch = (value, isEnd = false) => {
        if (!value) return null;
        const parts = value.split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        const [year, month, day] = parts;
        const date = isEnd
            ? new Date(year, month - 1, day, 23, 59, 59, 999)
            : new Date(year, month - 1, day, 0, 0, 0, 0);
        const epochMs = date.getTime();
        return Number.isNaN(epochMs) ? null : Math.floor(epochMs / 1000);
    };

    /**
     * [新增] 从Cookie中获取 oai-device-id
     * @returns {string|null} - 返回设备ID或null
     */
    function getOaiDeviceId() {
        const cookieString = document.cookie || '';
        const patterns = [
            /(?:^|;\s*)oai-did=([^;]+)/,
            /(?:^|;\s*)oai-device-id=([^;]+)/
        ];
        for (const pattern of patterns) {
            const match = cookieString.match(pattern);
            if (match?.[1]) {
                try {
                    return decodeURIComponent(match[1]);
                } catch (_) {
                    return match[1];
                }
            }
        }
        try {
            const keys = ['oai-did', 'oai-device-id', 'oaiDeviceId'];
            for (const key of keys) {
                const value = localStorage.getItem(key);
                if (value && value !== 'null' && value !== 'undefined') {
                    return String(value).replace(/^"|"$/g, '');
                }
            }
        } catch (_) {}
        return null;
    }

    function buildApiHeaders(workspaceId) {
        const headers = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const deviceId = getOaiDeviceId();
        if (deviceId) headers['oai-device-id'] = deviceId;
        if (workspaceId) headers['ChatGPT-Account-Id'] = workspaceId;
        return headers;
    }

    function conversationPageAdvance(page, limit) {
        const items = Array.isArray(page?.items) ? page.items : [];
        const rawCursor = page?.cursor;
        const cursor = typeof rawCursor === 'string'
            ? rawCursor
            : (typeof rawCursor === 'number' && rawCursor ? String(rawCursor) : '');
        if (cursor) {
            if (items.length === 0) return { cursor: '', offsetDelta: 0, done: true };
            return { cursor, offsetDelta: items.length, done: false };
        }
        if (typeof page?.has_more === 'boolean') {
            return { cursor: '', offsetDelta: items.length, done: !page.has_more || items.length === 0 };
        }
        return {
            cursor: '',
            offsetDelta: items.length,
            done: items.length === 0 || items.length < limit
        };
    }

    function isFirstPartyAssetUrl(url) {
        const value = String(url || '').trim();
        if (!value) return false;
        if (value.startsWith('/') && !value.startsWith('//')) return true;
        try {
            const host = new URL(value).hostname.toLowerCase();
            return host === 'chatgpt.com'
                || host.endsWith('.chatgpt.com')
                || host === 'chat.openai.com'
                || host === 'openai.com'
                || host.endsWith('.openai.com')
                || host.endsWith('.oaistatic.com')
                || host.endsWith('.oaiusercontent.com');
        } catch (_) {
            return false;
        }
    }

    function generateUniqueFilename(convData) {
        const convId = convData.conversation_id || '';
        const shortId = convId.includes('-') ? convId.split('-').pop() : (convId || Date.now().toString(36));
        let baseName = convData.title;
        if (!baseName || baseName.trim().toLowerCase() === 'new chat') {
            baseName = t('fallback.untitledConversation');
        }
        const safeBaseName = sanitizeFilename(baseName, t('fallback.untitledConversation'), MAX_SAFE_NAME_LENGTH);
        const safeShortId = sanitizeImageFilenamePart(shortId, 'conversation').slice(0, MAX_SAFE_ID_LENGTH);
        return `${safeBaseName}_${safeShortId}.json`;
    }

    function generateMarkdownFilename(convData) {
        const jsonName = generateUniqueFilename(convData);
        return jsonName.endsWith('.json')
            ? `${jsonName.slice(0, -5)}.md`
            : `${jsonName}.md`;
    }

    function cleanMessageContent(text) {
        if (!text) return '';
        return text
            .replace(/\uE200cite(?:\uE202turn\d+[a-z_]+\d+)+\uE201/gi, '')
            .replace(/[\uE200-\uE202]?cite(?:[\uE200-\uE202]?turn\d+[a-z_]+\d+)+[\uE200-\uE202]?/gi, '')
            .trim();
    }

    function processContentReferences(text, contentReferences) {
        if (!text || !Array.isArray(contentReferences) || contentReferences.length === 0) {
            return { text, footnotes: [] };
        }

        const references = contentReferences.filter(ref => ref && typeof ref.matched_text === 'string' && ref.matched_text.length > 0);
        if (references.length === 0) {
            return { text, footnotes: [] };
        }

        const getReferenceInfo = (ref) => {
            const file = inspectReferenceFile(ref);
            if (file) {
                const label = file.label || file.filename || t('fallback.file');
                return {
                    url: `${LOCAL_FILE_REF_PREFIX}${encodeURIComponent(file.key)}`,
                    title: label,
                    label,
                    fileKey: file.key
                };
            }
            const item = Array.isArray(ref.items) ? ref.items[0] : null;
            const url = item?.url || (Array.isArray(ref.safe_urls) ? ref.safe_urls[0] : '') || '';
            const title = item?.title || '';
            let label = item?.attribution || '';
            if (!label && typeof ref.alt === 'string') {
                const match = ref.alt.match(/\[([^\]]+)\]\([^)]+\)/);
                if (match) label = match[1];
            }
            if (!label) label = title || url;
            return { url, title, label };
        };

        const footnotes = [];
        const footnoteIndexByKey = new Map();
        const citationRefs = references
            .filter(ref => ref.type === 'grouped_webpages' || inspectReferenceFile(ref))
            .sort((a, b) => {
                const aIdx = Number.isFinite(a.start_idx) ? a.start_idx : Number.MAX_SAFE_INTEGER;
                const bIdx = Number.isFinite(b.start_idx) ? b.start_idx : Number.MAX_SAFE_INTEGER;
                return aIdx - bIdx;
            });

        citationRefs.forEach(ref => {
            const info = getReferenceInfo(ref);
            if (!info.url) return;
            const key = `${info.url}|${info.title}`;
            if (footnoteIndexByKey.has(key)) return;
            const index = footnotes.length + 1;
            footnoteIndexByKey.set(key, index);
            footnotes.push({ index, url: info.url, title: info.title, label: info.label });
        });

        const sortedByReplacement = references
            .slice()
            .sort((a, b) => {
                const aIdx = Number.isFinite(a.start_idx) ? a.start_idx : -1;
                const bIdx = Number.isFinite(b.start_idx) ? b.start_idx : -1;
                if (aIdx !== -1 || bIdx !== -1) {
                    return bIdx - aIdx;
                }
                return (b.matched_text?.length || 0) - (a.matched_text?.length || 0);
            });

        let output = text;
        sortedByReplacement.forEach(ref => {
            if (!ref?.matched_text || ref.type === 'sources_footnote') return;
            let replacement = '';
            if (ref.type === 'grouped_webpages' || inspectReferenceFile(ref)) {
                const info = getReferenceInfo(ref);
                if (info.url) {
                    const key = `${info.url}|${info.title}`;
                    const index = footnoteIndexByKey.get(key);
                    replacement = index ? `([${markdownLinkLabel(info.label)}][${index}])` : (ref.alt || '');
                } else {
                    replacement = ref.alt || '';
                }
            } else {
                replacement = ref.alt || '';
            }

            if (Number.isFinite(ref.start_idx) && Number.isFinite(ref.end_idx)) {
                if (output.slice(ref.start_idx, ref.end_idx) === ref.matched_text) {
                    output = output.slice(0, ref.start_idx) + replacement + output.slice(ref.end_idx);
                    return;
                }
            }
            output = output.split(ref.matched_text).join(replacement);
        });

        return { text: output, footnotes };
    }

    // 从一个 image_asset 对象中尽可能提取可下载线索
    // 支持旧格式 (image_asset 嵌套对象) 和新格式 (image_asset_pointer 扁平对象)
    function inspectImageAsset(asset) {
        if (!asset || typeof asset !== 'object') return null;
        const pointer = asset.asset_pointer || asset.file_id || asset.id || null;
        if (!pointer) return null;
        let label = asset.disposition_label || asset.alt_text || asset.alt || '';
        if (!label && asset.metadata?.dalle?.prompt) {
            label = asset.metadata.dalle.prompt;
        }
        // 从 metadata 中提取 image_gen_title 作为备选标签
        if (!label && asset.metadata?.generation?.serialization_title) {
            label = asset.metadata.generation.serialization_title;
        }
        return {
            asset_pointer: pointer,
            url: asset.url || asset.download_url || asset.dalle_url || null,
            content_type: asset.content_type || asset.mime_type || null,
            file_id: asset.file_id || null,
            dispositionLabel: (typeof label === 'string' ? label : 'image').slice(0, 200),
        };
    }

    function isImageContentType(value) {
        const text = String(value || '').toLowerCase();
        return text === 'image_asset' ||
            text === 'image_asset_pointer' ||
            text.startsWith('image/') ||
            text.includes('image_asset');
    }

    function imageReferenceKeys(image) {
        if (!image || typeof image !== 'object') return [];
        return [
            image.asset_pointer,
            image.file_id,
            image.url,
            image.download_url,
            normalizeAssetId(image.asset_pointer || image.file_id || image.url || image.download_url || '')
        ].filter(Boolean);
    }

    function addImageIfMissing(images, image, source) {
        if (!image) return;
        const incoming = { ...image, source };
        const keys = imageReferenceKeys(incoming);
        const existingIndex = images.findIndex(existing => {
            const existingKeys = imageReferenceKeys(existing);
            return existingKeys.some(key => keys.includes(key));
        });
        if (existingIndex >= 0) {
            const existing = images[existingIndex];
            const sources = [existing.source, source]
                .flatMap(value => String(value || '').split(','))
                .filter(Boolean)
                .filter((value, index, list) => list.indexOf(value) === index);
            images[existingIndex] = { ...existing };
            [
                'asset_pointer',
                'url',
                'download_url',
                'content_type',
                'file_id',
                'dispositionLabel',
                'localUrl',
                'localPath',
                'filename'
            ].forEach(field => {
                if (!images[existingIndex][field] && incoming[field]) images[existingIndex][field] = incoming[field];
            });
            images[existingIndex].source = sources.join(',');
            return;
        }
        images.push(incoming);
    }

    function inspectFileAttachment(att) {
        if (!att || typeof att !== 'object') return null;
        const nested = att.file && typeof att.file === 'object' ? att.file : {};
        const contentType = att.mime_type || att.content_type || att.type ||
            nested.mime_type || nested.content_type || nested.type || '';
        if (isImageContentType(contentType) || att.image_asset || nested.image_asset) return null;
        const fileId = att.file_id || nested.file_id || att.id || nested.id ||
            att.asset_pointer || nested.asset_pointer || '';
        const url = att.download_url || att.url || nested.download_url || nested.url || '';
        const rawName = att.name || att.file_name || att.filename || att.title || att.display_name ||
            nested.name || nested.file_name || nested.filename || nested.title || '';
        const contentTypeText = String(contentType || '').toLowerCase();
        const hasFileSignal = contentTypeText.includes('file') ||
            contentTypeText.includes('attachment') ||
            (contentTypeText && contentTypeText !== 'text' && contentTypeText !== 'multimodal_text') ||
            Boolean(att.file || nested.file || rawName);
        if (!fileId && !url && !(rawName && hasFileSignal)) return null;
        const fallbackName = normalizeAssetId(fileId || url) || 'attachment';
        const filename = sanitizeFilename(rawName || fallbackName, fallbackName, MAX_SAFE_NAME_LENGTH);
        return {
            key: fileId || url || rawName || filename,
            file_id: fileId,
            url,
            download_url: att.download_url || nested.download_url || '',
            filename,
            label: rawName || filename,
            content_type: contentType,
            size: att.size || nested.size || null
        };
    }

    function addFileIfMissing(files, file, source) {
        if (!file) return;
        const keys = fileReferenceKeys(file);
        const existingIndex = files.findIndex(existing => {
            const existingKeys = fileReferenceKeys(existing);
            return existingKeys.some(key => keys.includes(key));
        });
        if (existingIndex >= 0) {
            files[existingIndex] = mergeFileAttachment(files[existingIndex], file, source);
            return;
        }
        files.push({
            ...file,
            aliases: keys,
            source
        });
    }

    function mergeFileAttachment(existing, incoming, source) {
        const aliases = [...fileReferenceKeys(existing), ...fileReferenceKeys(incoming)]
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index);
        const merged = { ...existing, aliases };
        [
            'key',
            'file_id',
            'url',
            'download_url',
            'filename',
            'label',
            'content_type',
            'size',
            'path',
            'file_path',
            'sandbox_path'
        ].forEach(field => {
            if (!merged[field] && incoming[field]) merged[field] = incoming[field];
        });
        merged.source = [existing.source, source].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(',');
        return merged;
    }

    function inspectReferenceFile(ref) {
        if (!ref || typeof ref !== 'object') return null;
        const refType = String(ref.type || ref.content_type || ref.mime_type || '').toLowerCase();
        if (refType === 'grouped_webpages' || refType === 'sources_footnote' || refType.includes('webpage')) return null;
        const nameOnlyFile = (item) => {
            const explicitName = item?.name || item?.file_name || item?.filename || item?.title || item?.display_name || '';
            const pathName = item?.path || item?.file_path || item?.sandbox_path || item?.matched_text || '';
            const rawName = explicitName || String(pathName).split(/[\\/]/).filter(Boolean).pop() || pathName;
            const key = item?.file_id || item?.asset_pointer || item?.url || item?.download_url ||
                item?.path || item?.file_path || item?.sandbox_path || rawName;
            if (!key && !rawName) return null;
            const fallbackName = normalizeAssetId(key) || 'attachment';
            const filename = sanitizeFilename(rawName || fallbackName, fallbackName, MAX_SAFE_NAME_LENGTH);
            return {
                key: key || filename,
                file_id: item?.file_id || item?.asset_pointer || '',
                url: item?.url || '',
                download_url: item?.download_url || '',
                filename,
                label: rawName || filename,
                content_type: item?.mime_type || item?.content_type || item?.type || '',
                size: item?.size || null
            };
        };
        const hasFileSignal = refType.includes('file') ||
            refType.includes('sandbox') ||
            refType.includes('attachment') ||
            Boolean(ref.file_id || ref.asset_pointer || ref.file || ref.file_path || ref.sandbox_path);
        const direct = inspectFileAttachment(ref);
        if (direct && hasFileSignal) return direct;
        const fallback = hasFileSignal ? nameOnlyFile(ref) : null;
        if (fallback) return fallback;
        const items = Array.isArray(ref.items) ? ref.items : [];
        for (const item of items) {
            const itemType = String(item?.type || item?.content_type || item?.mime_type || '').toLowerCase();
            const itemHasFileSignal = itemType.includes('file') ||
                itemType.includes('sandbox') ||
                itemType.includes('attachment') ||
                Boolean(item?.file_id || item?.asset_pointer || item?.file || item?.file_path || item?.sandbox_path);
            const inspected = inspectFileAttachment(item);
            if (inspected && itemHasFileSignal) return inspected;
            const itemFallback = itemHasFileSignal ? nameOnlyFile(item) : null;
            if (itemFallback) return itemFallback;
        }
        return null;
    }

    function looksLikeDilSource(text) {
        return /\{@body\b|\{#if\b|\{#each\b|<AppBlock\b|<\/?(?:box|row|col|grid|text|title|button|AsyncImage)\b|\bDIL\.useState\b/i.test(String(text || ''));
    }

    function scanToMatchingBrace(text, openIndex) {
        let depth = 0;
        let quote = '';
        for (let i = openIndex; i < text.length; i++) {
            const ch = text[i];
            if (quote) {
                if (ch === '\\') { i += 1; continue; }
                if (ch === quote) quote = '';
                continue;
            }
            if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; continue; }
            if (ch === '{') depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) return i;
            }
        }
        return text.length - 1;
    }

    function stripDilSource(text) {
        const source = String(text || '').replace(/<AppBlock\b[^>]*>[\s\S]*?<\/AppBlock>/gi, '\n');
        const directiveStarts = ['{@body', '{#if', '{#each', '{:elif', '{:else'];
        let withoutDirectives = '';
        for (let i = 0; i < source.length; i++) {
            const slice = source.slice(i);
            if (slice.startsWith('{/if}') || slice.startsWith('{/each}')) {
                i += slice.startsWith('{/if}') ? 4 : 6;
                continue;
            }
            const matched = directiveStarts.find(token => slice.startsWith(token));
            if (!matched) {
                withoutDirectives += source[i];
                continue;
            }
            i = scanToMatchingBrace(source, i);
        }
        const withoutTags = withoutDirectives.replace(/<\/?[A-Za-z][\w:-]*\b[^>]*\/?>/g, '');
        const withoutExpr = withoutTags.replace(/\{[^{}\n]{0,400}\}/g, match => {
            const inner = match.slice(1, -1).trim();
            if (!inner) return '';
            if (/^[A-Za-z_$][\w$.]*(\([^)]*\))?$/.test(inner) || /[=()[\].]/.test(inner)) return '';
            return match;
        });
        return withoutExpr.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function readDilDocument(metadata) {
        if (!metadata || typeof metadata !== 'object') return null;
        const doc = metadata.model_dil_v2 || metadata.model_dil || metadata.modelDil || null;
        return doc && typeof doc === 'object' ? doc : null;
    }

    function readDilFallback(metadata) {
        const text = readDilDocument(metadata)?.fallbackMarkdown;
        return typeof text === 'string' ? text.trim() : '';
    }

    function extractAppBlocks(text) {
        const blocks = [];
        const pattern = /<AppBlock\b([^>]*)>([\s\S]*?)<\/AppBlock>/gi;
        let match;
        while ((match = pattern.exec(String(text || '')))) {
            const attrs = match[1] || '';
            const titleMatch = attrs.match(/\btitle\s*=\s*"([^"]*)"/i) || attrs.match(/\btitle\s*=\s*'([^']*)'/i);
            blocks.push({
                title: titleMatch ? titleMatch[1] : '',
                html: String(match[2] || '').trim()
            });
        }
        return blocks;
    }

    function fenceCode(code, lang) {
        const body = String(code || '');
        const longest = (body.match(/`{3,}/g) || []).reduce((max, run) => Math.max(max, run.length), 2);
        const fence = '`'.repeat(longest + 1);
        return `${fence}${lang || ''}\n${body}\n${fence}`;
    }

    function parseJsonObject(text) {
        if (typeof text !== 'string') return null;
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
        try {
            const value = JSON.parse(trimmed);
            return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        } catch (_) {
            return null;
        }
    }

    function inspectCanvasMessage(msg) {
        const recipient = `${msg?.recipient || ''} ${msg?.author?.name || ''}`;
        const metadata = msg?.metadata || {};
        const canvasMeta = metadata.canvas || metadata.textdoc || metadata.canmore || null;
        const signaled = /canmore|textdoc|canvas/i.test(recipient) || Boolean(canvasMeta);
        const content = msg?.content || {};
        const direct = typeof content.text === 'string' ? content.text : '';
        const parsed = parseJsonObject(direct);
        const body = (typeof parsed?.content === 'string' && parsed.content)
            || (typeof parsed?.textdoc?.content === 'string' && parsed.textdoc.content)
            || (typeof canvasMeta?.content === 'string' && canvasMeta.content)
            || '';
        if (!body) return null;
        const type = String(parsed?.type || parsed?.textdoc_type || canvasMeta?.textdoc_type || canvasMeta?.type || '');
        if (!signaled && type !== 'document' && type !== 'code' && type !== 'text') return null;
        const title = parsed?.name || parsed?.title || parsed?.textdoc?.title || canvasMeta?.title || canvasMeta?.name || '';
        return { title: String(title || ''), type, body: String(body) };
    }

    function inspectToolMessage(msg) {
        const role = msg?.author?.role;
        const content = msg?.content || {};
        const contentType = String(content.content_type || '');
        const sideTypes = ['code', 'execution_output', 'computer_output', 'tether_browsing_display', 'tether_quote', 'system_error', 'sonic_webpage'];
        const toolLike = role === 'tool' || (role === 'assistant' && sideTypes.includes(contentType) && contentType !== 'code');
        if (!toolLike || inspectCanvasMessage(msg)) return null;
        let text = '';
        if (typeof content.text === 'string') text = content.text;
        else if (typeof content.summary === 'string' && content.summary) text = content.summary;
        else if (typeof content.result === 'string') text = content.result;
        else if (Array.isArray(content.parts)) text = content.parts.filter(part => typeof part === 'string').join('\n');
        text = String(text || '').trim();
        const images = [];
        const screenshot = content.screenshot || content.image || content.asset || null;
        const inspected = inspectImageAsset(screenshot?.image_asset || screenshot);
        if (inspected) images.push({ ...inspected, source: 'tool' });
        if (!text && images.length === 0) return null;
        const lang = content.language && content.language !== 'unknown' ? String(content.language) : '';
        return {
            name: String(msg?.author?.name || msg?.recipient || contentType || 'tool'),
            text,
            lang,
            contentType,
            images
        };
    }

    function formatThoughts(content) {
        const thoughts = Array.isArray(content?.thoughts) ? content.thoughts : [];
        return thoughts.map(thought => {
            const summary = String(thought?.summary || '').trim();
            const body = String(thought?.content || (Array.isArray(thought?.chunks) ? thought.chunks.join('') : '') || '').trim();
            if (summary && body && summary !== body) return `**${summary}**\n\n${body}`;
            return body || summary;
        }).filter(Boolean).join('\n\n');
    }

    function emptySideChannel() {
        return { thinking: [], recap: '', tools: [], canvases: [], images: [] };
    }

    function cloneSideChannel(side) {
        const source = side || emptySideChannel();
        return {
            thinking: source.thinking.slice(),
            recap: source.recap || '',
            tools: source.tools.slice(),
            canvases: source.canvases.slice(),
            images: source.images.map(image => ({ ...image }))
        };
    }

    function hasSideChannel(side) {
        return Boolean(side && (side.thinking.length || side.recap || side.tools.length || side.canvases.length || side.images.length));
    }

    function formatToolBlock(tool) {
        const heading = `**${t('block.tool')}${tool.name ? `: ${tool.name}` : ''}**`;
        let body = tool.text || '';
        if (tool.contentType === 'code' || tool.lang || tool.contentType === 'execution_output' || tool.contentType === 'tether_browsing_display' || tool.contentType === 'system_error') {
            body = body ? fenceCode(body, tool.lang || '') : '';
        }
        return `:::tool\n${heading}\n\n${body}\n:::`;
    }

    function formatSideChannel(side) {
        if (!hasSideChannel(side)) return '';
        const chunks = [];
        if (side.thinking.length || side.recap) {
            const heading = side.recap || t('block.reasoning');
            const body = side.thinking.filter(Boolean).join('\n\n');
            chunks.push(`:::reasoning\n**${heading}**${body ? `\n\n${body}` : ''}\n:::`);
        }
        side.canvases.forEach(canvas => {
            const label = canvas.title ? `${t('block.canvas')}: ${canvas.title}` : t('block.canvas');
            const body = canvas.type === 'code' ? fenceCode(canvas.body, '') : canvas.body;
            chunks.push(`:::canvas\n**${label}**\n\n${body}\n:::`);
        });
        side.tools.forEach(tool => chunks.push(formatToolBlock(tool)));
        return chunks.join('\n\n');
    }

    function formatAppBlocks(blocks) {
        return (blocks || []).filter(block => block?.html).map(block => {
            const label = block.title ? `${t('block.app')}: ${block.title}` : t('block.app');
            return `:::app\n**${label}**\n\n${fenceCode(block.html, 'html')}\n:::`;
        }).join('\n\n');
    }

    function collectGenuiImages(metadata, images) {
        const results = readDilDocument(metadata)?.appData?.opGenui?.componentResults;
        if (!results || typeof results !== 'object') return;
        Object.values(results).forEach(result => {
            const state = result?.state;
            if (!state || typeof state !== 'object') return;
            const candidates = [];
            if (Array.isArray(state.images)) candidates.push(...state.images);
            if (state.image && typeof state.image === 'object') candidates.push(state.image);
            candidates.forEach(img => {
                if (!img || typeof img !== 'object') return;
                const contentUrl = img.content_url || img.download_url || '';
                const pageUrl = img.url || '';
                const downloadUrl = isFirstPartyAssetUrl(contentUrl)
                    ? contentUrl
                    : (isFirstPartyAssetUrl(pageUrl) ? pageUrl : '');
                const pointer = img.asset_pointer || img.file_id || img.id || downloadUrl;
                if (!pointer) return;
                addImageIfMissing(images, {
                    asset_pointer: pointer,
                    url: downloadUrl || null,
                    content_type: img.content_type || img.mime_type || null,
                    file_id: img.file_id || null,
                    dispositionLabel: String(img.alt || img.title || img.query || result?.componentName || 'image').slice(0, 200)
                }, 'genui');
            });
        });
    }

    function rewriteRemoteMarkdownImages(text, images) {
        return String(text || '').replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (full, alt, url) => {
            if (!isFirstPartyAssetUrl(url)) return alt || '';
            let image = (images || []).find(item => item?.url === url || item?.asset_pointer === url);
            if (!image) {
                addImageIfMissing(images, {
                    asset_pointer: url,
                    url,
                    dispositionLabel: String(alt || 'image').slice(0, 200)
                }, 'markdown');
                image = (images || []).find(item => item?.url === url || item?.asset_pointer === url);
            }
            return image ? `\n\n<!-- image:${image.asset_pointer} -->\n` : (alt || '');
        }).replace(/<img\b[^>]*>/gi, '');
    }

    function extractConversationMessages(convData) {
        const mapping = convData?.mapping;
        if (!mapping) return [];

        const messages = [];
        const mappingKeys = Object.keys(mapping);
        const rootId = mapping['client-created-root']
            ? 'client-created-root'
            : mappingKeys.find(id => !mapping[id]?.parent) || mappingKeys[0];
        const visited = new Set();

        // Collect parts of a single message, capturing both text and image pointers.
        const collectParts = (content) => {
            let textParts = [];
            const images = [];
            const files = [];

            const contentType = content?.content_type;
            const parts = Array.isArray(content?.parts) ? content.parts : [];

            const handleImagePart = (imgAsset, source) => {
                const inspected = inspectImageAsset(imgAsset);
                if (!inspected) return;
                addImageIfMissing(images, inspected, source);
            };
            const handleFilePart = (fileAsset, source) => {
                const inspected = inspectFileAttachment(fileAsset?.file || fileAsset);
                if (!inspected) return;
                addFileIfMissing(files, inspected, source);
                textParts.push(`<!-- file:${encodeURIComponent(inspected.key)} -->`);
            };

            // 判断是否为图片类型的 content_type
            const isImageContentType = (ct) => ct === 'image_asset' || ct === 'image_asset_pointer';
            const isFileContentType = (ct) => {
                const text = String(ct || '').toLowerCase();
                return text.includes('file') || text.includes('attachment');
            };

            if (contentType === 'text' || !contentType) {
                parts.forEach(part => collectTextPart(part, textParts, images, files));
            } else if (isImageContentType(contentType)) {
                // 旧格式: content.image_asset 嵌套; 新格式: content 本身就是 asset
                handleImagePart(content.image_asset || content, 'image_asset');
            } else if (isFileContentType(contentType)) {
                handleFilePart(content.file || content, 'file_asset');
            } else if (contentType === 'multimodal_text') {
                parts.forEach(part => {
                    if (typeof part === 'string') {
                        collectTextPart(part, textParts, images, files);
                    } else if (part && isImageContentType(part.content_type || part.type)) {
                        // 新格式: part 自身就是 image_asset_pointer，无嵌套的 .image_asset
                        handleImagePart(part.image_asset || part, 'multimodal_text');
                    } else if (part && isFileContentType(part.content_type || part.type)) {
                        handleFilePart(part.file || part, 'multimodal_text');
                    } else if (part && typeof part === 'object' && part.text) {
                        collectTextPart(part.text, textParts, images, files);
                    } else {
                        collectTextPart(part, textParts, images, files);
                    }
                });
            } else if (contentType === 'audio_transcription') {
                const transcript = content.text || content.transcript || '';
                if (transcript) textParts.push(String(transcript));
                parts.forEach(part => collectTextPart(part, textParts, images, files));
            } else if (contentType === 'code' || contentType === 'execution_output' || contentType === 'tether_quote' || contentType === 'system_error') {
                if (typeof content.text === 'string' && content.text) textParts.push(content.text);
                parts.forEach(part => collectTextPart(part, textParts, images, files));
            } else if (contentType === 'tether_browsing_display' || contentType === 'sonic_webpage') {
                const visible = content.summary || content.result || content.text || '';
                if (visible) textParts.push(String(visible));
            } else if (contentType && Array.isArray(parts) && parts.length) {
                // Fallback: any content_type that still carries parts — gather text & be permissive about images.
                parts.forEach(part => collectTextPart(part, textParts, images, files));
            } else if (typeof content?.text === 'string' && content.text) {
                textParts.push(content.text);
            }

            const rawText = textParts.filter(Boolean).join('\n');
            return { rawText, images, files };
        };

        const collectTextPart = (part, textParts, images, files) => {
            if (typeof part === 'string') { textParts.push(part); return; }
            if (part && typeof part === 'object') {
                const inspectedFile = inspectFileAttachment(part.file || part);
                if (inspectedFile) {
                    addFileIfMissing(files, inspectedFile, 'text_part');
                    textParts.push(`<!-- file:${encodeURIComponent(inspectedFile.key)} -->`);
                    return;
                }
                if (typeof part.text === 'string') textParts.push(part.text);
                const isImg = part.content_type === 'image_asset' || part.content_type === 'image_asset_pointer' || part.image_asset;
                if (isImg) {
                    const inspected = inspectImageAsset(part.image_asset || part);
                    if (inspected) {
                        textParts.push(`<!-- image:${inspected.asset_pointer} -->`);
                        if (images) addImageIfMissing(images, inspected, 'text_part');
                    }
                }
            }
        };

        const absorbSideImages = (images, side) => {
            (side?.images || []).forEach(image => addImageIfMissing(images, image, image.source || 'tool'));
        };

        const pushVisibleMessage = (msg, nodeId, author, body, images, files, footnotes) => {
            const cleaned = cleanMessageContent(body);
            const hasText = cleaned && cleaned.length > 0;
            const hasImages = images.length > 0;
            const hasFiles = files.length > 0;
            if (hasText || hasImages || hasFiles) {
                messages.push({
                    messageId: msg?.id || nodeId,
                    role: author === 'user' ? 'user' : (author || 'assistant'),
                    content: cleaned || '',
                    create_time: msg?.create_time || null,
                    footnotes,
                    images,
                    files
                });
            }
        };

        const traverse = (nodeId, inherited) => {
            if (!nodeId || visited.has(nodeId)) return;
            visited.add(nodeId);
            const node = mapping[nodeId];
            if (!node) return;

            let pending = cloneSideChannel(inherited);
            let consumed = false;
            const msg = node.message;
            if (msg) {
                const author = msg.author?.role;
                const content = msg.content;
                const contentType = content?.content_type;
                const isHidden = msg.metadata?.is_visually_hidden_from_conversation ||
                    msg.metadata?.is_contextual_answers_system_message;
                const preamble = Boolean(msg.metadata?.is_thinking_preamble_message);

                if (contentType === 'thoughts') {
                    const text = formatThoughts(content);
                    if (text) pending.thinking.push(text);
                } else if (contentType === 'reasoning_recap') {
                    const recap = String(content?.content || '').trim();
                    const duration = Number(msg.metadata?.finished_duration_sec);
                    pending.recap = recap || (Number.isFinite(duration) && duration > 0
                        ? t('block.thoughtFor', { seconds: Math.round(duration) })
                        : pending.recap);
                } else if (preamble && author !== 'user') {
                    const collected = content ? collectParts(content) : { rawText: '' };
                    if (collected.rawText) pending.thinking.push(collected.rawText);
                } else if (author && author !== 'system') {
                    const canvas = inspectCanvasMessage(msg);
                    const tool = inspectToolMessage(msg);
                    if (canvas && (author === 'tool' || contentType === 'code')) {
                        pending.canvases.push(canvas);
                    } else if (tool && (author === 'tool' || tool.contentType !== 'code')) {
                        pending.tools.push(tool);
                        (tool.images || []).forEach(image => addImageIfMissing(pending.images, image, 'tool'));
                    } else if (!(isHidden && author !== 'user')) {
                        const { rawText: collectedText = '', images = [], files: partFiles = [] } = content ? (collectParts(content) || {}) : {};
                        const files = partFiles.slice();
                        const originalText = collectedText;

                        if (Array.isArray(msg.metadata?.attachments)) {
                            msg.metadata.attachments.forEach(att => {
                                if (!att) return;
                                if (isImageContentType(att.content_type || att.type || att.mime_type)) {
                                    const inspected = inspectImageAsset(att.image_asset || att);
                                    if (inspected) addImageIfMissing(images, inspected, 'attachment');
                                    return;
                                }
                                const file = inspectFileAttachment(att);
                                addFileIfMissing(files, file, 'attachment');
                            });
                        }

                        const contentReferences = msg.metadata?.content_references || [];
                        if (Array.isArray(contentReferences)) {
                            contentReferences.forEach(ref => {
                                const file = inspectReferenceFile(ref);
                                if (!file) return;
                                addFileIfMissing(files, file, 'content_reference');
                            });
                        }

                        collectGenuiImages(msg.metadata, images);
                        absorbSideImages(images, pending);
                        const fallback = readDilFallback(msg.metadata);
                        let answerText = fallback || (looksLikeDilSource(originalText) ? stripDilSource(originalText) : originalText);
                        answerText = rewriteRemoteMarkdownImages(answerText, images);
                        let footnotes = [];
                        if (Array.isArray(contentReferences) && contentReferences.length > 0) {
                            const processed = processContentReferences(answerText, contentReferences);
                            answerText = processed.text;
                            footnotes = processed.footnotes;
                        }
                        const canvasBlock = canvas && !answerText.includes(String(canvas.body || '').slice(0, 80))
                            ? formatSideChannel({ thinking: [], recap: '', tools: [], canvases: [canvas], images: [] })
                            : '';
                        const body = [
                            formatSideChannel(pending),
                            canvasBlock,
                            answerText,
                            formatAppBlocks(extractAppBlocks(originalText))
                        ].filter(Boolean).join('\n\n');
                        pushVisibleMessage(msg, nodeId, author, body, images, files, footnotes);
                        pending = emptySideChannel();
                        consumed = true;
                    }
                }
            }

            const forChildren = consumed ? emptySideChannel() : pending;
            if (Array.isArray(node.children) && node.children.length) {
                node.children.forEach(childId => traverse(childId, cloneSideChannel(forChildren)));
            } else if (!consumed && hasSideChannel(forChildren)) {
                const images = [];
                absorbSideImages(images, forChildren);
                pushVisibleMessage(msg, nodeId, 'assistant', formatSideChannel(forChildren), images, [], []);
            }
        };

        if (rootId) {
            traverse(rootId, emptySideChannel());
        } else {
            mappingKeys.forEach(id => traverse(id, emptySideChannel()));
        }

        return messages;
    }

    function markdownLinkLabel(value) {
        return String(value || 'file').replace(/([\\\[\]])/g, '\\$1');
    }

    function markdownPath(path) {
        return String(path || '')
            .split('/')
            .map(part => encodeURIComponent(part))
            .join('/');
    }

    function localFileRefKey(url) {
        const value = String(url || '');
        if (!value.startsWith(LOCAL_FILE_REF_PREFIX)) return '';
        try {
            return decodeURIComponent(value.slice(LOCAL_FILE_REF_PREFIX.length));
        } catch (_) {
            return value.slice(LOCAL_FILE_REF_PREFIX.length);
        }
    }

    function resolveFootnoteUrl(url, attachmentFiles) {
        const key = localFileRefKey(url);
        if (!key) return url;
        const file = localFileRefCandidates(key).map(candidate => attachmentFiles?.get(candidate)).find(Boolean);
        return file ? markdownPath(`files/${file.filename}`) : '';
    }

    function localFileRefCandidates(key) {
        const candidates = [
            key,
            normalizeAssetId(key),
            sanitizeFilename(key, key, MAX_SAFE_NAME_LENGTH),
            sanitizeFilename(String(key).split(/[\\/]/).filter(Boolean).pop() || key, key, MAX_SAFE_NAME_LENGTH)
        ].filter(Boolean);
        return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
    }

    function fileReferenceKeys(file) {
        if (!file || typeof file !== 'object') return [];
        return [
            file.key,
            file.file_id,
            file.url,
            file.download_url,
            file.path,
            file.file_path,
            file.sandbox_path,
            file.filename,
            ...(Array.isArray(file.aliases) ? file.aliases : [])
        ].filter(Boolean);
    }

    function convertConversationToMarkdown(convData) {
        // imageFiles (optional): Map<asset_pointer, {filename, dispositionLabel}> — when passed,
        // image markers inside text are replaced with `![alt](images/filename)` and a
        // "生成图片" block is appended for any image that has no in-text marker.
        const imageFiles = (arguments.length > 1 && arguments[1] instanceof Map) ? arguments[1] : null;
        const attachmentFiles = (arguments.length > 2 && arguments[2] instanceof Map) ? arguments[2] : null;
        const messages = extractConversationMessages(convData);
        if (messages.length === 0) {
            return '# Conversation\nNo visible user or assistant messages were exported.\n';
        }

        const mdLines = [];
        messages.forEach((msg, msgIdx) => {
            const roleLabel = msg.role === 'user' ? '# User' : '# Assistant';
            mdLines.push(roleLabel);

            let body = msg.content || '';

            // Collect which images are referenced inline so we can append the rest at the end.
            const referenced = new Set();
            if (imageFiles && Array.isArray(msg.images) && msg.images.length > 0) {
                msg.images.forEach(img => {
                    const entry = imageFiles.get(img.asset_pointer);
                    if (!entry) return;
                    const placeholder = `<!-- image:${img.asset_pointer} -->`;
                    const mdImg = `\n\n![${entry.dispositionLabel || 'image'}](images/${entry.filename})\n`;
                    if (body.includes(placeholder)) {
                        body = body.split(placeholder).join(mdImg);
                        referenced.add(img.asset_pointer);
                    }
                });
            }

            const referencedFileEntries = new Set();
            if (Array.isArray(msg.files) && msg.files.length > 0) {
                msg.files.forEach(file => {
                    const entry = attachmentFiles
                        ? fileReferenceKeys(file).map(key => attachmentFiles.get(key)).find(Boolean)
                        : null;
                    const replacement = entry
                        ? `\n\n[${markdownLinkLabel(entry.label || entry.filename)}](${markdownPath(`files/${entry.filename}`)})\n\n`
                        : `\n\n${markdownLinkLabel(file.label || file.filename || t('fallback.file'))}\n\n`;
                    fileReferenceKeys(file).forEach(key => {
                        const placeholder = `<!-- file:${encodeURIComponent(key)} -->`;
                        if (body.includes(placeholder)) {
                            body = body.split(placeholder).join(replacement);
                            if (entry) referencedFileEntries.add(entry);
                        }
                    });
                });
            }

            mdLines.push(body);

            // Append any images that weren't referenced inline as a dedicated block.
            if (imageFiles && Array.isArray(msg.images) && msg.images.length > 0) {
                const leftover = msg.images.filter(img => !referenced.has(img.asset_pointer));
                if (leftover.length > 0) {
                    mdLines.push('');
                    mdLines.push(`<!-- 生成图片 (${leftover.length}) -->`);
                    leftover.forEach(img => {
                        const entry = imageFiles.get(img.asset_pointer);
                        if (!entry) return;
                        mdLines.push(`![${entry.dispositionLabel || 'image'}](images/${entry.filename})`);
                    });
                }
            }

            if (attachmentFiles && Array.isArray(msg.files) && msg.files.length > 0) {
                const referencedFiles = new Set((msg.footnotes || [])
                    .map(note => localFileRefKey(note.url))
                    .filter(Boolean)
                    .flatMap(key => localFileRefCandidates(key))
                    .map(key => attachmentFiles.get(key))
                    .filter(Boolean));
                const linkedFiles = msg.files
                    .map(file => fileReferenceKeys(file).map(key => attachmentFiles.get(key)).find(Boolean))
                    .filter(Boolean)
                    .filter(file => !referencedFiles.has(file) && !referencedFileEntries.has(file));
                if (linkedFiles.length > 0) {
                    mdLines.push('');
                    mdLines.push(`<!-- 附件 (${linkedFiles.length}) -->`);
                    linkedFiles.forEach(file => {
                        mdLines.push(`- [${markdownLinkLabel(file.label || file.filename)}](${markdownPath(`files/${file.filename}`)})`);
                    });
                }
            }

            if (Array.isArray(msg.footnotes) && msg.footnotes.length > 0) {
                mdLines.push('');
                msg.footnotes
                    .slice()
                    .sort((a, b) => a.index - b.index)
                    .forEach(note => {
                        const url = resolveFootnoteUrl(note.url, attachmentFiles);
                        if (!url) return;
                        const title = note.title ? ` "${note.title}"` : '';
                        mdLines.push(`[${note.index}]: ${url}${title}`);
                    });
            }
            mdLines.push('');
        });

        return mdLines.join('\n').trim() + '\n';
    }

    function downloadFile(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    // --- 导出流程核心逻辑 ---
    function styleExportButton(button) {
        Object.assign(button.style, {
            position: 'fixed', bottom: '96px', right: '20px', zIndex: '2147483646',
            padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontWeight: 'bold', background: '#10a37f', color: '#fff', fontSize: '14px',
            boxShadow: '0 3px 12px rgba(0,0,0,.15)', userSelect: 'none', pointerEvents: 'auto',
            display: 'block'
        });
        button.setAttribute('type', 'button');
        button.setAttribute('data-chatgpt-exporter', '1');
    }

    function mountExportButton() {
        if (!document.body) return null;
        let button = document.getElementById('gpt-rescue-btn');
        if (!button) {
            button = document.createElement('button');
            button.id = 'gpt-rescue-btn';
            button.textContent = t('button.export');
            button.onclick = showExportDialog;
        }
        styleExportButton(button);
        if (!button.isConnected) document.body.appendChild(button);
        return button;
    }

    function getExportButton() {
        return mountExportButton();
    }

    function makeZipScopeRegistry() {
        return new Map();
    }

    async function exportConversations(options = {}) {
        const { mode = 'personal', workspaceId = null, conversationEntries = null, exportType = null } = options;
        const btn = getExportButton();
        btn.disabled = true;

        if (!await ensureAccessToken()) {
            btn.disabled = false;
            btn.textContent = t('button.export');
            return;
        }

        try {
            const zip = new JSZip();
            const zipFilenameRegistry = makeZipScopeRegistry();
            const failedConversations = [];
            if (Array.isArray(conversationEntries) && conversationEntries.length > 0) {
                for (let i = 0; i < conversationEntries.length; i++) {
                    const entry = conversationEntries[i];
                    const label = entry?.title ? entry.title.slice(0, 12) : t('fallback.conversation');
                    btn.textContent = `📥 ${label} (${i + 1}/${conversationEntries.length})`;
                    try {
                        const convData = await getConversation(entry.id, workspaceId);
                        const target = entry?.projectTitle
                            ? zip.folder(sanitizeFilename(entry.projectTitle))
                            : zip;
                        await exportConversationIntoZip(convData, target, accessToken, zipFilenameRegistry);
                    } catch (convErr) {
                        console.error(`⚠️ 跳过对话 [${entry.title || entry.id}]: ${convErr.message}`);
                        failedConversations.push({ id: entry.id, title: entry.title || t('fallback.unknown'), error: convErr.message });
                    }
                    await sleep(jitter());
                }
            } else {
                btn.textContent = `📂 ${t('status.fetchingOrphanConversations')}`;
                const orphanIds = await collectIds(btn, workspaceId, null);
                for (let i = 0; i < orphanIds.length; i++) {
                    btn.textContent = `📥 ${t('status.rootProgress', { current: i + 1, total: orphanIds.length })}`;
                    try {
                        const convData = await getConversation(orphanIds[i], workspaceId);
                        await exportConversationIntoZip(convData, zip, accessToken, zipFilenameRegistry);
                    } catch (convErr) {
                        console.error(`⚠️ 跳过对话 [${orphanIds[i]}]: ${convErr.message}`);
                        failedConversations.push({ id: orphanIds[i], title: orphanIds[i], error: convErr.message });
                    }
                    await sleep(jitter());
                }

                btn.textContent = `🔍 ${t('status.fetchingProjectList')}`;
                const projects = await getProjects(workspaceId);
                for (const project of projects) {
                    const projectFolder = zip.folder(sanitizeFilename(project.title));
                    btn.textContent = `📂 ${t('status.project', { title: project.title })}`;
                    const projectConvIds = await collectIds(btn, workspaceId, project.id);
                    if (projectConvIds.length === 0) continue;

                    for (let i = 0; i < projectConvIds.length; i++) {
                        btn.textContent = `📥 ${t('status.projectProgress', { title: project.title.substring(0, 10), current: i + 1, total: projectConvIds.length })}`;
                        try {
                            const convData = await getConversation(projectConvIds[i], workspaceId);
                            await exportConversationIntoZip(convData, projectFolder, accessToken, zipFilenameRegistry);
                        } catch (convErr) {
                            console.error(`⚠️ 跳过对话 [${projectConvIds[i]}]: ${convErr.message}`);
                            failedConversations.push({ id: projectConvIds[i], title: projectConvIds[i], error: convErr.message });
                        }
                        await sleep(jitter());
                    }
                }
            }

            btn.textContent = `📦 ${t('status.generatingZip')}`;
            const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
            const date = new Date().toISOString().slice(0, 10);
            const selectionType = exportType || ((Array.isArray(conversationEntries) && conversationEntries.length > 0) ? 'selected' : 'full');
            let filename = '';
            if (selectionType === 'selected') {
                filename = mode === 'team'
                    ? `chatgpt_team_selected_${workspaceId}_${date}.zip`
                    : mode === 'project'
                        ? `chatgpt_project_selected_${date}.zip`
                        : `chatgpt_personal_selected_${date}.zip`;
            } else {
                filename = mode === 'team'
                    ? `chatgpt_team_backup_${workspaceId}_${date}.zip`
                    : mode === 'project'
                        ? `chatgpt_project_backup_${date}.zip`
                        : `chatgpt_personal_backup_${date}.zip`;
            }
            downloadFile(blob, filename);
            if (failedConversations.length > 0) {
                const failList = failedConversations.map(f => `• ${f.title}: ${f.error}`).join('\n');
                alert(`⚠️ ${t('alert.exportCompletedWithFailures', { count: failedConversations.length, list: failList })}`);
                console.warn('导出中跳过的对话:', failedConversations);
            } else {
                alert(`✅ ${t('alert.exportSuccess')}`);
            }
            btn.textContent = `✅ ${t('button.done')}`;

        } catch (e) {
            console.error("导出过程中发生严重错误:", e);
            alert(t('alert.exportFailed', { message: e.message }));
            btn.textContent = `⚠️ ${t('button.error')}`;
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = t('button.export');
            }, 3000);
        }
    }

    async function startExportProcess(mode, workspaceId) {
        await exportConversations({ mode, workspaceId });
    }

    async function startProjectSpaceExportProcess(workspaceId = null) {
        try {
            const projectEntries = await listProjectSpaceConversations(workspaceId);
            if (projectEntries.length === 0) {
                alert(t('alert.noProjectConversations'));
                return;
            }
            await exportConversations({ mode: 'project', workspaceId, conversationEntries: projectEntries, exportType: 'full' });
        } catch (err) {
            console.error('导出项目空间失败:', err);
            alert(t('alert.projectExportFailed', { message: err.message }));
        }
    }

    async function startSelectiveExportProcess(mode, workspaceId, conversationEntries) {
        await exportConversations({ mode, workspaceId, conversationEntries });
    }

    function startScheduledExport(options = {}) {
        const { mode = 'personal', workspaceId = null, autoConfirm = false, source = 'schedule' } = options;
        const proceed = async () => {
            try {
                if (mode === 'project') {
                    await startProjectSpaceExportProcess(workspaceId);
                } else {
                    await startExportProcess(mode, workspaceId);
                }
            } catch (err) {
                console.error('[ChatGPT Exporter] 自动导出失败:', err);
            }
        };

        if (autoConfirm) {
            proceed();
            return;
        }

        const modeLabel = t(`mode.${mode === 'team' ? 'team' : mode === 'project' ? 'project' : 'personal'}`);
        if (confirm(t('confirm.scheduledExport', { mode: modeLabel, source }))) {
            proceed();
        }
    }

    // --- API 调用函数 ---
    function normalizeProjectSpaceItem(item) {
        const rawGizmo = item?.gizmo?.gizmo || item?.gizmo || item;
        const display = rawGizmo?.display || item?.gizmo?.display || item?.display;
        const id = rawGizmo?.id || item?.gizmo?.id || item?.id;
        const title = display?.name || rawGizmo?.name || t('fallback.untitledProject');
        if (!id) return null;
        return {
            id,
            title,
            conversations: item?.conversations?.items || []
        };
    }

    function resolveWorkspaceId(workspaceId) {
        if (workspaceId) return workspaceId;
        const match = document.cookie.match(/(?:^|; )_account=([^;]+)/);
        if (match?.[1]) {
            try {
                return decodeURIComponent(match[1]);
            } catch (_) {
                return match[1];
            }
        }
        // 只采用页面自己发出的账号头。账号目录里的 ID 留给团队选择，避免猜错空间。
        if (capturedWorkspaceIds.size > 0) return Array.from(capturedWorkspaceIds)[0];
        if (supplementalWorkspaceIds.size === 1) return Array.from(supplementalWorkspaceIds)[0];
        return null;
    }

    async function fetchRootConversationPage(headers, { offset = 0, cursor = '', archived = false } = {}) {
        const query = new URLSearchParams();
        query.set('limit', String(PAGE_LIMIT));
        query.set('order', 'updated');
        if (cursor) query.set('cursor', cursor);
        else query.set('offset', String(offset));
        if (archived) query.set('is_archived', 'true');
        return fetch(`/backend-api/conversations?${query.toString()}`, {
            headers,
            credentials: 'include'
        });
    }

    async function getProjectSpaces(workspaceId, options = {}) {
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        const headers = buildApiHeaders(resolvedWorkspaceId);

        const projects = new Map();
        let cursor = null;

        do {
            const query = new URLSearchParams();
            query.set('limit', String(PROJECT_SIDEBAR_LIMIT));
            if (options.conversationsPerGizmo !== undefined) {
                query.set('conversations_per_gizmo', String(options.conversationsPerGizmo));
            }
            if (options.ownedOnly !== undefined) {
                query.set('owned_only', options.ownedOnly ? 'true' : 'false');
            }
            if (cursor) {
                query.set('cursor', cursor);
            }

            const r = await fetch(`/backend-api/gizmos/snorlax/sidebar?${query.toString()}`, { headers, credentials: 'include' });
            if (!r.ok) {
                throw new Error(t('error.projectSpaceListFailed', { status: r.status }));
            }
            const data = await r.json();
            data.items?.forEach(item => {
                const project = normalizeProjectSpaceItem(item);
                if (project) {
                    projects.set(project.id, project);
                }
            });
            cursor = data.cursor || null;
            if (cursor) {
                await sleep(jitter());
            }
        } while (cursor);

        return Array.from(projects.values());
    }

    async function getProjects(workspaceId) {
        if (!workspaceId) return [];
        try {
            const projects = await getProjectSpaces(workspaceId);
            return projects.map(({ id, title }) => ({ id, title }));
        } catch (err) {
            console.warn(`获取项目(Gizmo)列表失败 (${err?.message || err})`);
            return [];
        }
    }

    async function collectIds(btn, workspaceId, gizmoId) {
        const all = new Set();
        const headers = buildApiHeaders(workspaceId || null);

        if (gizmoId) {
            let cursor = '0';
            const seenCursors = new Set();
            do {
                if (seenCursors.has(String(cursor))) break;
                seenCursors.add(String(cursor));
                const r = await fetch(`/backend-api/gizmos/${gizmoId}/conversations?cursor=${encodeURIComponent(cursor)}`, { headers, credentials: 'include' });
                if (!r.ok) throw new Error(t('error.projectConversationListFailed', { status: r.status }));
                const j = await r.json();
                j.items?.forEach(it => all.add(it.id));
                if (!Array.isArray(j.items) || j.items.length === 0) break;
                cursor = j.cursor;
                if (cursor) await sleep(jitter());
            } while (cursor);
        } else {
            for (const is_archived of [false, true]) {
                let offset = 0;
                let cursor = '';
                let has_more = true;
                let page = 0;
                const seenCursors = new Set();
                do {
                    btn.textContent = `📂 ${t('status.rootPage', {
                        state: is_archived ? t('status.archived') : t('status.active'),
                        page: ++page
                    })}`;
                    const r = await fetchRootConversationPage(headers, { offset, cursor, archived: is_archived });
                    if (!r.ok) throw new Error(t('error.rootConversationListFailed', { status: r.status }));
                    const j = await r.json();
                    j.items?.forEach(it => all.add(it.id));
                    const advance = conversationPageAdvance(j, PAGE_LIMIT);
                    if (advance.cursor) {
                        if (seenCursors.has(advance.cursor)) break;
                        seenCursors.add(advance.cursor);
                        cursor = advance.cursor;
                    } else {
                        cursor = '';
                        offset += advance.offsetDelta;
                    }
                    has_more = !advance.done;
                    if (has_more) await sleep(jitter());
                } while (has_more);
            }
        }
        return Array.from(all);
    }

    function upsertConversationEntry(map, item, extra = {}) {
        if (!item?.id) return;
        const create_time = normalizeEpochSeconds(item.create_time || 0);
        const update_time = normalizeEpochSeconds(item.update_time || item.create_time || 0);
        const entry = {
            id: item.id,
            title: item.title || t('fallback.untitledConversation'),
            create_time,
            update_time,
            is_archived: item.is_archived ?? extra.is_archived ?? false,
            projectId: extra.projectId || null,
            projectTitle: extra.projectTitle || null
        };
        const existing = map.get(entry.id);
        if (!existing) {
            map.set(entry.id, entry);
            return;
        }
        if (!existing.projectTitle && entry.projectTitle) {
            existing.projectTitle = entry.projectTitle;
            existing.projectId = entry.projectId;
        }
        if (!existing.create_time && entry.create_time) {
            existing.create_time = entry.create_time;
        }
        existing.is_archived = existing.is_archived || entry.is_archived;
        if ((entry.update_time || 0) > (existing.update_time || 0)) {
            existing.update_time = entry.update_time;
        }
        if (existing.title === t('fallback.untitledConversation') && entry.title) {
            existing.title = entry.title;
        }
    }

    async function listConversations(workspaceId) {
        if (!await ensureAccessToken()) {
            throw new Error(t('alert.accessTokenUnavailable'));
        }

        const headers = buildApiHeaders(workspaceId || null);

        const map = new Map();
        const addEntry = (item, extra = {}) => upsertConversationEntry(map, item, extra);

        for (const is_archived of [false, true]) {
            let offset = 0;
            let cursor = '';
            let has_more = true;
            const seenCursors = new Set();
            do {
                const r = await fetchRootConversationPage(headers, { offset, cursor, archived: is_archived });
                if (!r.ok) throw new Error(t('error.conversationListFailed', { status: r.status }));
                const j = await r.json();
                j.items?.forEach(it => addEntry(it, { is_archived }));
                const advance = conversationPageAdvance(j, PAGE_LIMIT);
                if (advance.cursor) {
                    if (seenCursors.has(advance.cursor)) break;
                    seenCursors.add(advance.cursor);
                    cursor = advance.cursor;
                } else {
                    cursor = '';
                    offset += advance.offsetDelta;
                }
                has_more = !advance.done;
                if (has_more) await sleep(jitter());
            } while (has_more);
        }

        if (workspaceId) {
            const projects = await getProjects(workspaceId);
            for (const project of projects) {
                let cursor = '0';
                const seenCursors = new Set();
                do {
                    if (seenCursors.has(String(cursor))) break;
                    seenCursors.add(String(cursor));
                    const r = await fetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${encodeURIComponent(cursor)}`, { headers, credentials: 'include' });
                    if (!r.ok) throw new Error(t('error.projectConversationListFailed', { status: r.status }));
                    const j = await r.json();
                    j.items?.forEach(it => addEntry(it, { projectId: project.id, projectTitle: project.title }));
                    if (!Array.isArray(j.items) || j.items.length === 0) break;
                    cursor = j.cursor;
                    if (cursor) await sleep(jitter());
                } while (cursor);
            }
        }

        return Array.from(map.values())
            .sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
    }

    async function listProjectSpaceConversations(workspaceId) {
        if (!await ensureAccessToken()) {
            throw new Error(t('alert.accessTokenUnavailable'));
        }

        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        const headers = buildApiHeaders(resolvedWorkspaceId);

        const map = new Map();
        const projects = await getProjectSpaces(resolvedWorkspaceId, { conversationsPerGizmo: PROJECT_SIDEBAR_PREVIEW, ownedOnly: true });

        for (const project of projects) {
            let cursor = '0';
            let fetched = false;
            do {
                const r = await fetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${encodeURIComponent(cursor)}`, { headers, credentials: 'include' });
                if (!r.ok) {
                    if (!fetched && Array.isArray(project.conversations) && project.conversations.length > 0) {
                        console.warn(`项目空间对话列表请求失败 (${r.status})，使用侧边栏返回的预览对话。`);
                        project.conversations.forEach(item => upsertConversationEntry(map, item, {
                            projectId: project.id,
                            projectTitle: project.title
                        }));
                        cursor = null;
                        break;
                    }
                    throw new Error(t('error.projectSpaceConversationListFailed', { status: r.status }));
                }
                const j = await r.json();
                j.items?.forEach(item => upsertConversationEntry(map, item, {
                    projectId: project.id,
                    projectTitle: project.title
                }));
                if (!Array.isArray(j.items) || j.items.length === 0) {
                    cursor = null;
                    break;
                }
                cursor = j.cursor;
                fetched = true;
                await sleep(jitter());
            } while (cursor);
        }

        return Array.from(map.values())
            .sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
    }

    async function getConversation(id, workspaceId, retries = 3) {
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        const headers = buildApiHeaders(resolvedWorkspaceId);

        let lastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const r = await fetch(`/backend-api/conversation/${id}`, { headers, credentials: 'include' });
                if (r.ok) {
                    const j = await r.json();
                    j.__fetched_at = new Date().toISOString();
                    return j;
                }
                lastError = new Error(t('error.conversationDetailFailed', { id, status: r.status }));
                // 仅对 5xx 服务端错误重试
                if (r.status >= 500 && attempt < retries) {
                    const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                    console.warn(`⚠️ 第 ${attempt} 次获取对话 ${id} 失败 (${r.status})，${Math.round(backoff / 1000)}s 后重试...`);
                    await sleep(backoff);
                    continue;
                }
                throw lastError;
            } catch (err) {
                lastError = err;
                if (attempt < retries && !(err.message && err.message.includes('(4'))) {
                    const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                    console.warn(`⚠️ 第 ${attempt} 次获取对话 ${id} 异常: ${err.message}，${Math.round(backoff / 1000)}s 后重试...`);
                    await sleep(backoff);
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
    }

    // --- 图片导出辅助函数 ---
    function normalizeAssetId(raw) {
        if (!raw) return '';
        if (typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        // sediment://file_xxx 与 file-service://file-xxx 都是同一类文件指针
        if (trimmed.startsWith('sediment://') || trimmed.startsWith('file-service://')) {
            const path = trimmed.replace(/^(?:sediment|file-service):\/\//, '').split(/[?#]/)[0];
            const leaf = path.split('/').filter(Boolean).pop();
            return leaf || trimmed.replace(/[^\w.-]/g, '_');
        }
        if (trimmed.startsWith('file://') || trimmed.startsWith('file-') || trimmed.startsWith('file_')) {
            const m = trimmed.match(/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/i);
            if (m) return m[0];
            // 也尝试匹配 file_xxxx 格式 (无连字符)
            const m2 = trimmed.match(/file[_-]([a-f0-9]+)/i);
            if (m2) return `file_${m2[1]}`;
        }
        if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
            const u = new URL(trimmed);
            const path = u.pathname.split('/').filter(Boolean);
            const last = path[path.length - 1];
            if (last) return last.replace(/\.[a-z0-9]+$/i, '');
        }
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed)) {
            return trimmed.toLowerCase();
        }
        return trimmed.replace(/[^\w.-]/g, '_');
    }

    function guessImageExt(contentType, url) {
        if (typeof contentType === 'string') {
            const ct = contentType.toLowerCase();
            if (ct.includes('png')) return 'png';
            if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
            if (ct.includes('webp')) return 'webp';
            if (ct.includes('gif')) return 'gif';
            if (ct.includes('svg')) return 'svg';
            if (ct.includes('bmp')) return 'bmp';
        }
        if (typeof url === 'string') {
            const m = url.toLowerCase().match(/\.(png|jpe?g|webp|gif|svg|bmp)(?:\?|$)/);
            if (m) return m[1] === 'jpg' ? 'jpg' : m[1];
        }
        return 'png';
    }

    function guessFileExt(contentType, url, filename) {
        const byName = String(filename || url || '').toLowerCase().match(/\.([a-z0-9]{1,12})(?:\?|$)/);
        if (byName) return byName[1];
        const ct = String(contentType || '').toLowerCase();
        if (ct.includes('pdf')) return 'pdf';
        if (ct.includes('csv')) return 'csv';
        if (ct.includes('json')) return 'json';
        if (ct.includes('markdown')) return 'md';
        if (ct.includes('plain')) return 'txt';
        if (ct.includes('spreadsheet')) return 'xlsx';
        if (ct.includes('presentation')) return 'pptx';
        if (ct.includes('wordprocessing')) return 'docx';
        if (ct.includes('zip')) return 'zip';
        return '';
    }

    async function resolveFileDownloadUrl(fileId, accessToken) {
        const deviceId = getOaiDeviceId();
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
        };
        if (deviceId) headers['oai-device-id'] = deviceId;
        const resolvedWs = resolveWorkspaceId(null);
        if (resolvedWs) headers['ChatGPT-Account-Id'] = resolvedWs;

        const r = await fetch(`/backend-api/files/${fileId}/download`, { headers });
        if (!r.ok) throw new Error(t('error.fileDownloadUrlFailed', { status: r.status }));
        const data = await r.json();
        return data.download_url || null;
    }

    async function resolveImageDownloadUrl(fileId, accessToken) {
        return resolveFileDownloadUrl(fileId, accessToken);
    }

    async function fetchImageBlob(image, accessToken) {
        let url = image.url || image.download_url;

        // 如果没有直接 URL，尝试通过 asset_pointer 从后端 API 解析真实下载链接
        if (!url && image.asset_pointer) {
            const fileId = normalizeAssetId(image.asset_pointer);
            if (fileId) {
                try {
                    url = await resolveImageDownloadUrl(fileId, accessToken);
                    console.log(`🖼️ 已解析图片下载链接 [${fileId}]`);
                } catch (err) {
                    console.warn(`⚠️ 无法解析图片下载链接 [${fileId}]:`, err.message);
                    return null;
                }
            }
        }

        if (!url) return null;

        const opts = { credentials: 'include' };
        // 对 ChatGPT 同源请求添加 Authorization，对签名 CDN URL 则不需要
        if (accessToken && url.startsWith('/')) {
            opts.headers = { 'Authorization': `Bearer ${accessToken}` };
        }
        const r = await fetch(url, opts);
        if (!r.ok) throw new Error(t('error.imageDownloadFailed', { status: r.status }));
        return await r.blob();
    }

    async function fetchAttachmentBlob(file, accessToken) {
        let url = file.url || file.download_url;
        if (!url && file.file_id) {
            const fileId = normalizeAssetId(file.file_id);
            if (fileId) {
                url = await resolveFileDownloadUrl(fileId, accessToken);
                console.log(`📎 已解析文件下载链接 [${fileId}]`);
            }
        }
        if (!url) return null;

        const opts = { credentials: 'include' };
        if (accessToken && url.startsWith('/')) {
            opts.headers = { 'Authorization': `Bearer ${accessToken}` };
        }
        const r = await fetch(url, opts);
        if (!r.ok) throw new Error(t('error.fileDownloadFailed', { status: r.status }));
        return await r.blob();
    }

    async function downloadConversationAssets(convData, targetZip, generateMarkdown, accessToken, zipFilenameRegistry) {
        const messages = extractConversationMessages(convData);
        const seen = new Set();
        const pending = [];
        const seenFiles = new Set();
        const pendingFiles = [];
        const imageFiles = new Map(); // asset_pointer -> { filename, dispositionLabel }
        const attachmentFiles = new Map(); // attachment key -> { filename, label }

        for (const msg of messages) {
            if (Array.isArray(msg.images)) {
                for (let k = 0; k < msg.images.length; k++) {
                    const img = msg.images[k];
                    const key = img.asset_pointer || img.url || (img.asset_pointer + '_' + k);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    pending.push({ image: img, msgIndex: pending.length, assetId: normalizeAssetId(img.asset_pointer) });
                }
            }
            if (Array.isArray(msg.files)) {
                for (let k = 0; k < msg.files.length; k++) {
                    const file = msg.files[k];
                    const key = file.key || file.file_id || file.url || `${file.filename}_${k}`;
                    if (seenFiles.has(key)) continue;
                    seenFiles.add(key);
                    pendingFiles.push({ file, key, assetId: normalizeAssetId(file.file_id || file.url || key) });
                }
            }
        }

        if (pending.length === 0 && pendingFiles.length === 0) {
            return generateMarkdown ? convertConversationToMarkdown(convData) : null;
        }
        let okCount = 0;
        if (pending.length > 0) {
            const ns = targetZip.folder('images');
            const imageScope = `${targetZip.root || ''}${targetZip.name || ''}images/`;
            for (let i = 0; i < pending.length; i++) {
                const { image, assetId } = pending[i];
                try {
                    const blob = await fetchImageBlob(image, accessToken);
                    const ext = guessImageExt(image.content_type, image.url);
                    const safeAssetId = sanitizeImageFilenamePart(assetId, `image_${i + 1}`);
                    const filename = makeUniqueZipFilename(
                        `img_${String(i + 1).padStart(2, '0')}_${safeAssetId}.${ext}`,
                        zipFilenameRegistry,
                        imageScope
                    );
                    ns.file(filename, blob);
                    imageFiles.set(image.asset_pointer, {
                        filename,
                        dispositionLabel: image.dispositionLabel || 'image'
                    });
                    okCount++;
                } catch (err) {
                    console.warn(`⚠️ 图片下载跳过 [${assetId}]:`, err.message, image);
                }
                await sleep(jitter());
            }
            console.log(`🖼️ 图片导出: ${okCount}/${pending.length} 张成功`);
        }

        let okFileCount = 0;
        if (pendingFiles.length > 0) {
            const ns = targetZip.folder('files');
            const fileScope = `${targetZip.root || ''}${targetZip.name || ''}files/`;
            for (let i = 0; i < pendingFiles.length; i++) {
                const { file, key, assetId } = pendingFiles[i];
                try {
                    const blob = await fetchAttachmentBlob(file, accessToken);
                    if (!blob) throw new Error(t('error.noDownloadUrl'));
                    let safeName = sanitizeFilename(file.filename || file.label || assetId, `file_${i + 1}`, MAX_SAFE_NAME_LENGTH);
                    if (!splitFilename(safeName).ext) {
                        const ext = guessFileExt(file.content_type, file.url, file.filename);
                        if (ext) safeName += `.${ext}`;
                    }
                    const filename = makeUniqueZipFilename(safeName, zipFilenameRegistry, fileScope);
                    ns.file(filename, blob);
                    const entry = {
                        filename,
                        label: file.label || file.filename || filename
                    };
                    fileReferenceKeys({ ...file, key }).forEach(alias => attachmentFiles.set(alias, entry));
                    okFileCount++;
                } catch (err) {
                    console.warn(`⚠️ 文件下载跳过 [${assetId}]:`, err.message, file);
                }
                await sleep(jitter());
            }
            console.log(`📎 文件导出: ${okFileCount}/${pendingFiles.length} 个成功`);
        }

        return generateMarkdown ? convertConversationToMarkdown(convData, imageFiles, attachmentFiles) : null;
    }

    /**
     * 将单个对话导出到 ZIP（同时写入 JSON 原始数据、Markdown（含图片引用）、以及图片文件）。
     * @returns {Promise<void>}
     */
    async function exportConversationIntoZip(convData, zip, accessToken, zipFilenameRegistry) {
        const scope = `${zip.root || ''}${zip.name || ''}`;
        const jsonFilename = makeUniqueZipFilename(generateUniqueFilename(convData), zipFilenameRegistry, scope);
        zip.file(jsonFilename, JSON.stringify(convData, null, 2));
        const markdown = await downloadConversationAssets(convData, zip, true, accessToken, zipFilenameRegistry);
        const markdownFilename = makeUniqueZipFilename(
            jsonFilename.endsWith('.json') ? `${jsonFilename.slice(0, -5)}.md` : generateMarkdownFilename(convData),
            zipFilenameRegistry,
            scope
        );
        zip.file(markdownFilename, markdown);
    }

    // --- UI 相关函数 ---
    /**
     * [新增] 全面检测函数，返回所有找到的ID
     * @returns {string[]} - 返回包含所有唯一Workspace ID的数组
     */
    function detectAllWorkspaceIds() {
        const foundIds = new Set([...capturedWorkspaceIds, ...supplementalWorkspaceIds]);

        // 扫描 __NEXT_DATA__
        try {
            const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
            // 遍历所有账户信息
            const accounts = data?.props?.pageProps?.user?.accounts;
            if (accounts) {
                Object.values(accounts).forEach(acc => {
                    if (acc?.account?.id) {
                        foundIds.add(acc.account.id);
                    }
                });
            }
        } catch (e) {}

        // 扫描 localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('account') || key.includes('workspace'))) {
                    const value = localStorage.getItem(key);
                    if (value && /^[a-z0-9]{2,}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.replace(/"/g, ''))) {
                         const extractedId = value.match(/ws-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
                         if(extractedId) foundIds.add(extractedId[0]);
                    } else if (value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.replace(/"/g, ''))) {
                         foundIds.add(value.replace(/"/g, ''));
                    }
                }
            }
        } catch(e) {}

        console.log('🔍 检测到以下 Workspace IDs:', Array.from(foundIds));
        return Array.from(foundIds);
    }

    function showConversationPicker(options = {}) {
        const { mode = 'personal', workspaceId = null } = options;
        const existing = document.getElementById('export-dialog-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'export-dialog-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: '99998',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        const dialog = document.createElement('div');
        dialog.id = 'export-dialog';
        Object.assign(dialog.style, {
            background: '#fff', padding: '24px', borderRadius: '12px',
            boxShadow: '0 5px 15px rgba(0,0,0,.3)', width: '720px',
            fontFamily: 'sans-serif', color: '#333', boxSizing: 'border-box'
        });

        const closeDialog = () => document.body.removeChild(overlay);
        const state = {
            list: [],
            filtered: [],
            selected: new Set(),
            query: '',
            scope: mode === 'project' ? 'project' : 'all',
            scopeLocked: mode === 'project',
            archived: 'all',
            timeField: 'update',
            loading: true,
            pageSize: 100,
            visibleCount: 100,
            startDate: '',
            endDate: ''
        };

        const renderBase = () => {
            const modeLabel = t(`mode.${mode === 'team' ? 'team' : mode === 'project' ? 'project' : 'personal'}`);
            const workspaceLabel = workspaceId ? ` (${workspaceId})` : '';
            dialog.innerHTML = `
                <h2 style="margin-top:0; margin-bottom: 12px; font-size: 18px;">${t('dialog.selectConversationsTitle')}</h2>
                <div style="margin-bottom: 12px; color: #666; font-size: 12px;">${t('dialog.space', { mode: modeLabel, workspace: workspaceLabel })}</div>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <input id="conv-search" type="text" placeholder="${t('dialog.searchPlaceholder')}"
                        style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;">
                    <select id="filter-scope" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="all">${t('filter.scopeAll')}</option>
                        <option value="project">${t('filter.scopeProject')}</option>
                        <option value="root">${t('filter.scopeRoot')}</option>
                    </select>
                    <select id="filter-archived" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="all">${t('filter.statusAll')}</option>
                        <option value="active">${t('filter.statusActive')}</option>
                        <option value="archived">${t('filter.statusArchived')}</option>
                    </select>
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                    <select id="filter-time-field" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="update">${t('filter.timeUpdate')}</option>
                        <option value="create">${t('filter.timeCreate')}</option>
                    </select>
                    <input id="filter-start-date" type="date" style="padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                    <span style="color: #666; font-size: 12px;">${t('filter.dateTo')}</span>
                    <input id="filter-end-date" type="date" style="padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                    <button id="clear-date-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.clearDates')}</button>
                </div>
                <div id="conv-status" style="margin-bottom: 8px; font-size: 12px; color: #666;">${t('status.loadingList')}</div>
                <div id="conv-list" style="max-height: 360px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fff;"></div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                    <div style="display: flex; gap: 8px;">
                        <button id="select-all-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectAll')}</button>
                        <button id="clear-all-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.clear')}</button>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="back-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.back')}</button>
                        <button id="export-selected-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;" disabled>${t('button.exportSelected', { count: 0 })}</button>
                    </div>
                </div>
            `;

            const searchInput = dialog.querySelector('#conv-search');
            const scopeSelect = dialog.querySelector('#filter-scope');
            const archivedSelect = dialog.querySelector('#filter-archived');
            const timeFieldSelect = dialog.querySelector('#filter-time-field');
            const startDateInput = dialog.querySelector('#filter-start-date');
            const endDateInput = dialog.querySelector('#filter-end-date');
            const clearDateBtn = dialog.querySelector('#clear-date-btn');
            const selectAllBtn = dialog.querySelector('#select-all-btn');
            const clearAllBtn = dialog.querySelector('#clear-all-btn');
            const backBtn = dialog.querySelector('#back-btn');
            const exportBtn = dialog.querySelector('#export-selected-btn');

            if (state.scopeLocked && scopeSelect) {
                scopeSelect.value = 'project';
                scopeSelect.disabled = true;
                scopeSelect.style.opacity = '0.7';
                scopeSelect.style.cursor = 'not-allowed';
                scopeSelect.title = t('dialog.projectScopeLocked');
            }

            searchInput.oninput = (e) => {
                state.query = e.target.value || '';
                applyFilters();
                renderList();
            };
            scopeSelect.onchange = (e) => {
                state.scope = e.target.value;
                applyFilters();
                renderList();
            };
            archivedSelect.onchange = (e) => {
                state.archived = e.target.value;
                applyFilters();
                renderList();
            };
            timeFieldSelect.onchange = (e) => {
                state.timeField = e.target.value;
                applyFilters();
                renderList();
            };
            startDateInput.onchange = (e) => {
                state.startDate = e.target.value || '';
                applyFilters();
                renderList();
            };
            endDateInput.onchange = (e) => {
                state.endDate = e.target.value || '';
                applyFilters();
                renderList();
            };
            clearDateBtn.onclick = () => {
                state.startDate = '';
                state.endDate = '';
                startDateInput.value = '';
                endDateInput.value = '';
                applyFilters();
                renderList();
            };
            selectAllBtn.onclick = () => {
                state.filtered.forEach(item => state.selected.add(item.id));
                renderList();
            };
            clearAllBtn.onclick = () => {
                state.selected.clear();
                renderList();
            };
            backBtn.onclick = () => {
                closeDialog();
                showExportDialog();
            };
            exportBtn.onclick = async () => {
                if (state.selected.size === 0) return;
                const selectedList = state.list.filter(item => state.selected.has(item.id));
                closeDialog();
                await startSelectiveExportProcess(mode, workspaceId, selectedList);
            };
        };

        const applyFilters = () => {
            const query = state.query.trim().toLowerCase();
            const startBound = parseDateInputToEpoch(state.startDate, false);
            const endBound = parseDateInputToEpoch(state.endDate, true);
            state.filtered = state.list.filter(item => {
                const text = `${item.title || ''} ${item.projectTitle || ''} ${item.id || ''}`.toLowerCase();
                if (query && !text.includes(query)) return false;
                if (state.scope === 'project' && !item.projectTitle) return false;
                if (state.scope === 'root' && item.projectTitle) return false;
                if (state.archived === 'active' && item.is_archived) return false;
                if (state.archived === 'archived' && !item.is_archived) return false;
                if (startBound || endBound) {
                    const sourceTime = state.timeField === 'create'
                        ? item.create_time
                        : item.update_time;
                    const ts = normalizeEpochSeconds(sourceTime || 0);
                    if (!ts) return false;
                    if (startBound && ts < startBound) return false;
                    if (endBound && ts > endBound) return false;
                }
                return true;
            });
            state.visibleCount = state.pageSize;
        };

        const renderList = () => {
            const statusEl = dialog.querySelector('#conv-status');
            const listEl = dialog.querySelector('#conv-list');
            const exportBtn = dialog.querySelector('#export-selected-btn');
            const selectAllBtn = dialog.querySelector('#select-all-btn');
            const clearAllBtn = dialog.querySelector('#clear-all-btn');
            const controlsDisabled = state.loading;

            if (selectAllBtn) selectAllBtn.disabled = controlsDisabled;
            if (clearAllBtn) clearAllBtn.disabled = controlsDisabled;
            if (exportBtn) exportBtn.disabled = controlsDisabled || state.selected.size === 0;

            listEl.innerHTML = '';
            if (state.loading) {
                statusEl.textContent = t('status.loadingList');
                return;
            }

            const visibleCount = Math.min(state.visibleCount, state.filtered.length);
            statusEl.textContent = t('status.listSummary', {
                total: state.list.length,
                filtered: state.filtered.length,
                visible: visibleCount,
                selected: state.selected.size
            });
            exportBtn.textContent = t('button.exportSelected', { count: state.selected.size });

            if (state.filtered.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = t('status.noMatches');
                empty.style.color = '#999';
                empty.style.padding = '8px 4px';
                listEl.appendChild(empty);
                return;
            }

            const visibleItems = state.filtered.slice(0, state.visibleCount);
            visibleItems.forEach(item => {
                const label = document.createElement('label');
                Object.assign(label.style, {
                    display: 'flex', gap: '8px', padding: '8px',
                    border: '1px solid #e5e7eb', borderRadius: '6px',
                    marginBottom: '8px', cursor: 'pointer', alignItems: 'flex-start'
                });

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = state.selected.has(item.id);
                checkbox.onchange = (e) => {
                    if (e.target.checked) {
                        state.selected.add(item.id);
                    } else {
                        state.selected.delete(item.id);
                    }
                    renderList();
                };

                const content = document.createElement('div');
                content.style.flex = '1';

                const title = document.createElement('div');
                title.textContent = item.title || t('fallback.untitledConversation');
                title.style.fontWeight = 'bold';
                title.style.fontSize = '14px';

                const meta = document.createElement('div');
                meta.style.fontSize = '12px';
                meta.style.color = '#666';
                const timeLabelPrefix = state.timeField === 'create' ? t('picker.timeCreated') : t('picker.timeUpdated');
                const timeValue = state.timeField === 'create' ? item.create_time : item.update_time;
                const timeLabel = formatTimestamp(timeValue) || t('picker.unknownTime');
                meta.textContent = `${timeLabelPrefix}: ${timeLabel}`;

                const tags = document.createElement('div');
                tags.style.marginTop = '6px';
                tags.style.display = 'flex';
                tags.style.gap = '6px';
                tags.style.flexWrap = 'wrap';

                if (item.projectTitle) {
                    const projectTag = document.createElement('span');
                    projectTag.textContent = t('picker.projectTag', { title: item.projectTitle });
                    Object.assign(projectTag.style, {
                        background: '#eef2ff', color: '#4338ca',
                        padding: '2px 6px', borderRadius: '999px', fontSize: '11px'
                    });
                    tags.appendChild(projectTag);
                }

                if (item.is_archived) {
                    const archivedTag = document.createElement('span');
                    archivedTag.textContent = t('picker.archivedTag');
                    Object.assign(archivedTag.style, {
                        background: '#fef3c7', color: '#92400e',
                        padding: '2px 6px', borderRadius: '999px', fontSize: '11px'
                    });
                    tags.appendChild(archivedTag);
                }

                content.appendChild(title);
                content.appendChild(meta);
                if (tags.childNodes.length > 0) content.appendChild(tags);

                label.appendChild(checkbox);
                label.appendChild(content);
                listEl.appendChild(label);
            });

            if (state.filtered.length > state.visibleCount) {
                const loadMore = document.createElement('button');
                loadMore.textContent = t('button.loadMore', { count: state.filtered.length - state.visibleCount });
                Object.assign(loadMore.style, {
                    width: '100%', padding: '8px 12px', border: '1px solid #ccc',
                    borderRadius: '6px', background: '#fff', cursor: 'pointer'
                });
                loadMore.onclick = () => {
                    state.visibleCount = Math.min(state.visibleCount + state.pageSize, state.filtered.length);
                    renderList();
                };
                listEl.appendChild(loadMore);
            }
        };

        renderBase();
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };

        const listPromise = mode === 'project'
            ? listProjectSpaceConversations(workspaceId)
            : listConversations(workspaceId);
        listPromise
            .then(list => {
                state.list = list;
                state.loading = false;
                applyFilters();
                renderList();
            })
            .catch(err => {
                const statusEl = dialog.querySelector('#conv-status');
                state.loading = false;
                state.list = [];
                state.filtered = [];
                statusEl.textContent = t('status.loadFailed', { message: err.message });
                renderList();
            });
    }

    /**
     * [重构] 多步骤、用户主导的导出对话框
     */
    function showExportDialog() {
        if (document.getElementById('export-dialog-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'export-dialog-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: '99998',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        const dialog = document.createElement('div');
        dialog.id = 'export-dialog';
        Object.assign(dialog.style, {
            background: '#fff', padding: '24px', borderRadius: '12px',
            boxShadow: '0 5px 15px rgba(0,0,0,.3)', width: '450px',
            fontFamily: 'sans-serif', color: '#333', boxSizing: 'border-box'
        });

        const closeDialog = () => document.body.removeChild(overlay);

        let pendingTeamAction = null;
        const renderStep = (step, action = null) => {
            pendingTeamAction = action;
            let html = '';
            switch (step) {
                case 'team': {
                    const detectedIds = detectAllWorkspaceIds();
                    html = `<h2 style="margin-top:0; margin-bottom: 20px; font-size: 18px;">${t('dialog.exportTeamTitle')}</h2>`;

                    if (detectedIds.length > 1) {
                        html += `<div style="background: #eef2ff; border: 1px solid #818cf8; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0 0 12px 0; font-weight: bold; color: #4338ca;">🔎 ${t('dialog.multipleWorkspace')}</p>
                                     <div id="workspace-id-list">`;
                        detectedIds.forEach((id, index) => {
                            html += `<label style="display: block; margin-bottom: 8px; padding: 8px; border-radius: 6px; cursor: pointer; border: 1px solid #ddd; background: #fff;">
                                         <input type="radio" name="workspace_id" value="${id}" ${index === 0 ? 'checked' : ''}>
                                         <code style="margin-left: 8px; font-family: monospace; color: #555;">${id}</code>
                                      </label>`;
                        });
                        html += `</div></div>`;
                    } else if (detectedIds.length === 1) {
                        html += `<div style="background: #f0fdf4; border: 1px solid #4ade80; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534;">✅ ${t('dialog.workspaceDetected')}</p>
                                     <code id="workspace-id-code" style="background: #e0e7ff; padding: 4px 8px; border-radius: 4px; font-family: monospace; color: #4338ca; word-break: break-all;">${detectedIds[0]}</code>
                                   </div>`;
                    } else {
                        html += `<div style="background: #fffbeb; border: 1px solid #facc15; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0; color: #92400e;">⚠️ ${t('dialog.workspaceMissing')}</p>
                                     <p style="margin: 8px 0 0 0; font-size: 12px; color: #92400e;">${t('dialog.workspaceMissingHint')}</p>
                                   </div>
                                   <label for="team-id-input" style="display: block; margin-bottom: 8px; font-weight: bold;">${t('dialog.manualWorkspaceLabel')}</label>
                                   <input type="text" id="team-id-input" placeholder="${t('dialog.workspacePlaceholder')}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;">`;
                    }

                    let actionButtons = '';
                    if (pendingTeamAction === 'all') {
                        actionButtons = `<button id="start-team-export-btn" style="padding: 10px 16px; border: none; border-radius: 8px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAllZip')}</button>`;
                    } else if (pendingTeamAction === 'select') {
                        actionButtons = `<button id="start-team-picker-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>`;
                    } else {
                        actionButtons = `<button id="start-team-export-btn" style="padding: 10px 16px; border: none; border-radius: 8px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAllZip')}</button>
                                     <button id="start-team-picker-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>`;
                    }

                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px;">
                                 <button id="back-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.back')}</button>
                                 <div style="display: flex; gap: 8px;">
                                     ${actionButtons}
                                 </div>
                               </div>`;
                    break;
                }

                case 'initial':
                default:
                    html = `<h2 style="margin-top:0; margin-bottom: 20px; font-size: 18px;">${t('dialog.selectSpaceTitle')}</h2>
                                <div style="display: flex; flex-direction: column; gap: 16px;">
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">${t('dialog.personalTitle')}</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">${t('dialog.personalCopy')}</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-personal-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAll')}</button>
                                            <button id="select-personal-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>
                                        </div>
                                    </div>
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">${t('dialog.projectTitle')}</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">${t('dialog.projectCopy')}</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-project-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAll')}</button>
                                            <button id="select-project-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>
                                        </div>
                                    </div>
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">${t('dialog.teamTitle')}</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">${t('dialog.teamCopy')}</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-team-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAll')}</button>
                                            <button id="select-team-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>
                                        </div>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
                                    <button id="cancel-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.cancel')}</button>
                                </div>`;
                    break;
            }
            dialog.innerHTML = html;
            attachListeners(step);
        };

        const attachListeners = (step) => {
            if (step === 'initial') {
                document.getElementById('select-personal-btn').onclick = () => {
                    closeDialog();
                    startExportProcess('personal', null);
                };
                document.getElementById('select-personal-picker-btn').onclick = () => {
                    closeDialog();
                    showConversationPicker({ mode: 'personal', workspaceId: null });
                };
                document.getElementById('select-project-btn').onclick = () => {
                    closeDialog();
                    startProjectSpaceExportProcess();
                };
                document.getElementById('select-project-picker-btn').onclick = () => {
                    closeDialog();
                    showConversationPicker({ mode: 'project', workspaceId: null });
                };
                const startTeamFlow = async (action) => {
                    await loadAccountDirectory();
                    const detectedIds = detectAllWorkspaceIds();
                    if (detectedIds.length === 1) {
                        const workspaceId = detectedIds[0];
                        closeDialog();
                        if (action === 'all') {
                            startExportProcess('team', workspaceId);
                        } else {
                            showConversationPicker({ mode: 'team', workspaceId });
                        }
                        return;
                    }
                    renderStep('team', action);
                };
                document.getElementById('select-team-btn').onclick = () => startTeamFlow('all');
                document.getElementById('select-team-picker-btn').onclick = () => startTeamFlow('select');
                document.getElementById('cancel-btn').onclick = closeDialog;
            } else if (step === 'team') {
                document.getElementById('back-btn').onclick = () => renderStep('initial');
                const resolveWorkspaceId = () => {
                    let workspaceId = '';
                    const radioChecked = document.querySelector('input[name="workspace_id"]:checked');
                    const codeEl = document.getElementById('workspace-id-code');
                    const inputEl = document.getElementById('team-id-input');

                    if (radioChecked) {
                        workspaceId = radioChecked.value;
                    } else if (codeEl) {
                        workspaceId = codeEl.textContent;
                    } else if (inputEl) {
                        workspaceId = inputEl.value.trim();
                    }

                    if (!workspaceId) {
                        alert(t('alert.invalidWorkspaceId'));
                        return;
                    }
                    return workspaceId;
                };
                const exportAllBtn = document.getElementById('start-team-export-btn');
                const pickerBtn = document.getElementById('start-team-picker-btn');
                if (exportAllBtn) exportAllBtn.onclick = () => {
                    const workspaceId = resolveWorkspaceId();
                    if (!workspaceId) return;
                    closeDialog();
                    startExportProcess('team', workspaceId);
                };
                if (pickerBtn) pickerBtn.onclick = () => {
                    const workspaceId = resolveWorkspaceId();
                    if (!workspaceId) return;
                    closeDialog();
                    showConversationPicker({ mode: 'team', workspaceId });
                };
            }
        };

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };
        renderStep('initial');
    }

    function addBtn() {
        mountExportButton();
        if (window.__chatgptExporterButtonWatch) return;
        window.__chatgptExporterButtonWatch = true;
        const remount = () => {
            const existing = document.getElementById('gpt-rescue-btn');
            if (!existing || !existing.isConnected) mountExportButton();
        };
        if (typeof MutationObserver !== 'undefined' && document.body) {
            const observer = new MutationObserver(remount);
            observer.observe(document.body, { childList: true });
        }
        setInterval(remount, 2000);
    }

    // --- 脚本启动 ---
    setTimeout(addBtn, 2000);

    window.ChatGPTExporter = window.ChatGPTExporter || {};
    Object.assign(window.ChatGPTExporter, {
        showDialog: showExportDialog,
        startManualExport: (mode = 'personal', workspaceId = null) => {
            if (mode === 'project') {
                return startProjectSpaceExportProcess(workspaceId);
            }
            return startExportProcess(mode, workspaceId);
        },
        startScheduledExport
    });

    document.documentElement.setAttribute('data-chatgpt-exporter-ready', '1');
    window.dispatchEvent(new CustomEvent('CHATGPT_EXPORTER_READY'));

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data?.type !== 'CHATGPT_EXPORTER_COMMAND') return;
        const api = window.ChatGPTExporter;
        if (!api) return;
        try {
            switch (data.action) {
                case 'START_SCHEDULED_EXPORT':
                    api.startScheduledExport(data.payload || {});
                    break;
                case 'OPEN_DIALOG':
                    api.showDialog();
                    break;
                case 'START_MANUAL_EXPORT':
                    api.startManualExport(data.payload?.mode, data.payload?.workspaceId);
                    break;
                default:
                    console.warn('[ChatGPT Exporter] 未知命令:', data.action);
            }
        } catch (err) {
            console.error('[ChatGPT Exporter] 处理命令失败:', err);
        }
    });

})();
