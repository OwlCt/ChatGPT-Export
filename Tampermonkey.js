// ==UserScript==
// @name         ChatGPT Universal Exporter (Markdown Support)
// @version      1.3.4
// @description  User-centric ZIP exporter for personal/team/project spaces. Supports JSON & Markdown formats. Based on ChatGPT Universal Exporter.
// @author       huhu
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#sha256=acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
// @grant        none
// @license      MIT
// @source       https://greasyfork.org/scripts/538495-chatgpt-universal-exporter
// @namespace    https://github.com/huhusmang/ChatGPT-Exporter
// @homepageURL  https://greasyfork.org/zh-CN/scripts/556233-chatgpt-universal-exporter-markdown-support
// @downloadURL  https://update.greasyfork.org/scripts/556233/ChatGPT%20Universal%20Exporter%20(Markdown%20Support).user.js
// @updateURL    https://update.greasyfork.org/scripts/556233/ChatGPT%20Universal%20Exporter%20(Markdown%20Support).meta.js
// ==/UserScript==

/* ============================================================
    v1.3.4 变更 (附件文件导出)
    ------------------------------------------------------------
    • 导出普通文件附件到 files/ 目录
    • Markdown 中为已下载附件生成本地链接
    • 阅读器可打开 ZIP 中的附件链接
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

    // --- 核心：网络拦截与信息捕获 ---
    (function interceptNetwork() {
        const rawFetch = window.fetch;
        window.fetch = async function (resource, options) {
            tryCaptureToken(options?.headers);
            if (options?.headers?.['ChatGPT-Account-Id']) {
                const id = options.headers['ChatGPT-Account-Id'];
                if (id && !capturedWorkspaceIds.has(id)) {
                    console.log('🎯 [Fetch] 捕获到 Workspace ID:', id);
                    capturedWorkspaceIds.add(id);
                }
            }
            return rawFetch.apply(this, arguments);
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener('readystatechange', () => {
                if (this.readyState === 4) {
                    try {
                        tryCaptureToken(this.getRequestHeader('Authorization'));
                        const id = this.getRequestHeader('ChatGPT-Account-Id');
                        if (id && !capturedWorkspaceIds.has(id)) {
                            console.log('🎯 [XHR] 捕获到 Workspace ID:', id);
                            capturedWorkspaceIds.add(id);
                        }
                    } catch (_) {}
                }
            });
            return rawOpen.apply(this, arguments);
        };
    })();

    function tryCaptureToken(header) {
        if (!header) return;
        const h = typeof header === 'string' ? header : header instanceof Headers ? header.get('Authorization') : header.Authorization || header.authorization;
        if (h?.startsWith('Bearer ')) {
        const token = h.slice(7);
        // [v8.2.0 修复] 在捕获源头增加验证，拒绝已知的无效占位符Token
        if (token && token.toLowerCase() !== 'dummy') {
            accessToken = token;
        }
        }
    }

    async function ensureAccessToken() {
        if (accessToken) return accessToken;
        try {
            const session = await (await fetch('/api/auth/session?unstable_client=true')).json();
            if (session.accessToken) {
                accessToken = session.accessToken;
                return accessToken;
            }
        } catch (_) {}
        alert('无法获取 Access Token。请刷新页面或打开任意一个对话后再试。');
        return null;
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
        const cookieString = document.cookie;
        const match = cookieString.match(/oai-did=([^;]+)/);
        return match ? match[1] : null;
    }

    function generateUniqueFilename(convData) {
        const convId = convData.conversation_id || '';
        const shortId = convId.includes('-') ? convId.split('-').pop() : (convId || Date.now().toString(36));
        let baseName = convData.title;
        if (!baseName || baseName.trim().toLowerCase() === 'new chat') {
            baseName = 'Untitled Conversation';
        }
        const safeBaseName = sanitizeFilename(baseName, 'Untitled Conversation', MAX_SAFE_NAME_LENGTH);
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
                const label = file.label || file.filename || '文件';
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

            if (contentType === 'text') {
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
            } else if (contentType && Array.isArray(parts) && parts.length) {
                // Fallback: any content_type that still carries parts — gather text & be permissive about images.
                parts.forEach(part => collectTextPart(part, textParts, images, files));
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

        const traverse = (nodeId) => {
            if (!nodeId || visited.has(nodeId)) return;
            visited.add(nodeId);
            const node = mapping[nodeId];
            if (!node) return;

            const msg = node.message;
            if (msg) {
                const author = msg.author?.role;
                const isHidden = msg.metadata?.is_visually_hidden_from_conversation ||
                    msg.metadata?.is_contextual_answers_system_message;
                if (author && author !== 'system' && !isHidden) {
                    const content = msg.content;
                    const { rawText = '', images = [], files: partFiles = [] } = content ? (collectParts(content) || {}) : {};

                    const files = partFiles.slice();

                    // attachments may carry image pointers or downloadable files.
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
                    let processedText = rawText;
                    let footnotes = [];
                    if (Array.isArray(contentReferences) && contentReferences.length > 0) {
                        const processed = processContentReferences(rawText, contentReferences);
                        processedText = processed.text;
                        footnotes = processed.footnotes;
                    }
                    const cleaned = cleanMessageContent(processedText);

                    const hasText = cleaned && cleaned.length > 0;
                    const hasImages = images.length > 0;
                    const hasFiles = files.length > 0;
                    if (hasText || hasImages || hasFiles) {
                        messages.push({
                            messageId: msg.id || nodeId,
                            role: author,
                            content: cleaned || '',
                            create_time: msg.create_time || null,
                            footnotes,
                            images,
                            files
                        });
                    }
                }
            }

            if (Array.isArray(node.children)) {
                node.children.forEach(childId => traverse(childId));
            }
        };

        if (rootId) {
            traverse(rootId);
        } else {
            mappingKeys.forEach(traverse);
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
                        : `\n\n${markdownLinkLabel(file.label || file.filename || '文件')}\n\n`;
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
    function getExportButton() {
        let btn = document.getElementById('gpt-rescue-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'gpt-rescue-btn';
            btn.style.display = 'none';
            btn.textContent = 'Export Conversations';
            document.body.appendChild(btn);
        }
        return btn;
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
            btn.textContent = 'Export Conversations';
            return;
        }

        try {
            const zip = new JSZip();
            const zipFilenameRegistry = makeZipScopeRegistry();
            const failedConversations = [];
            if (Array.isArray(conversationEntries) && conversationEntries.length > 0) {
                for (let i = 0; i < conversationEntries.length; i++) {
                    const entry = conversationEntries[i];
                    const label = entry?.title ? entry.title.slice(0, 12) : '对话';
                    btn.textContent = `📥 ${label} (${i + 1}/${conversationEntries.length})`;
                    try {
                        const convData = await getConversation(entry.id, workspaceId);
                        const target = entry?.projectTitle
                            ? zip.folder(sanitizeFilename(entry.projectTitle))
                            : zip;
                        await exportConversationIntoZip(convData, target, accessToken, zipFilenameRegistry);
                    } catch (convErr) {
                        console.error(`⚠️ 跳过对话 [${entry.title || entry.id}]: ${convErr.message}`);
                        failedConversations.push({ id: entry.id, title: entry.title || 'Unknown', error: convErr.message });
                    }
                    await sleep(jitter());
                }
            } else {
                btn.textContent = '📂 获取项目外对话…';
                const orphanIds = await collectIds(btn, workspaceId, null);
                for (let i = 0; i < orphanIds.length; i++) {
                    btn.textContent = `📥 根目录 (${i + 1}/${orphanIds.length})`;
                    try {
                        const convData = await getConversation(orphanIds[i], workspaceId);
                        await exportConversationIntoZip(convData, zip, accessToken, zipFilenameRegistry);
                    } catch (convErr) {
                        console.error(`⚠️ 跳过对话 [${orphanIds[i]}]: ${convErr.message}`);
                        failedConversations.push({ id: orphanIds[i], title: orphanIds[i], error: convErr.message });
                    }
                    await sleep(jitter());
                }

                btn.textContent = '🔍 获取项目列表…';
                const projects = await getProjects(workspaceId);
                for (const project of projects) {
                    const projectFolder = zip.folder(sanitizeFilename(project.title));
                    btn.textContent = `📂 项目: ${project.title}`;
                    const projectConvIds = await collectIds(btn, workspaceId, project.id);
                    if (projectConvIds.length === 0) continue;

                    for (let i = 0; i < projectConvIds.length; i++) {
                        btn.textContent = `📥 ${project.title.substring(0,10)}... (${i + 1}/${projectConvIds.length})`;
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

            btn.textContent = '📦 生成 ZIP 文件…';
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
                alert(`⚠️ 导出完成，但有 ${failedConversations.length} 个对话失败（已跳过）：\n\n${failList}`);
                console.warn('导出中跳过的对话:', failedConversations);
            } else {
                alert(`✅ 导出完成！`);
            }
            btn.textContent = '✅ 完成';

        } catch (e) {
            console.error("导出过程中发生严重错误:", e);
            alert(`导出失败: ${e.message}。详情请查看控制台（F12 -> Console）。`);
            btn.textContent = '⚠️ Error';
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = 'Export Conversations';
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
                alert('未找到项目空间对话。');
                return;
            }
            await exportConversations({ mode: 'project', workspaceId, conversationEntries: projectEntries, exportType: 'full' });
        } catch (err) {
            console.error('导出项目空间失败:', err);
            alert(`导出项目空间失败: ${err.message}`);
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

        const modeLabel = mode === 'team' ? '团队空间' : mode === 'project' ? '项目空间' : '个人空间';
        if (confirm(`Chrome 扩展请求导出 ${modeLabel} 对话（来源: ${source}）。是否开始？`)) {
            proceed();
        }
    }

    // --- API 调用函数 ---
    function normalizeProjectSpaceItem(item) {
        const rawGizmo = item?.gizmo?.gizmo || item?.gizmo || item;
        const display = rawGizmo?.display || item?.gizmo?.display || item?.display;
        const id = rawGizmo?.id || item?.gizmo?.id || item?.id;
        const title = display?.name || rawGizmo?.name || 'Untitled Project';
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
        if (match?.[1]) return match[1];
        const detectedIds = detectAllWorkspaceIds();
        return detectedIds.length > 0 ? detectedIds[0] : null;
    }

    async function getProjectSpaces(workspaceId, options = {}) {
        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error('无法获取 oai-device-id，请确保已登录并刷新页面。');
        }
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        if (resolvedWorkspaceId) { headers['ChatGPT-Account-Id'] = resolvedWorkspaceId; }

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

            const r = await fetch(`/backend-api/gizmos/snorlax/sidebar?${query.toString()}`, { headers });
            if (!r.ok) {
                throw new Error(`获取项目空间列表失败 (${r.status})`);
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
        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error('无法获取 oai-device-id，请确保已登录并刷新页面。');
        }
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        if (workspaceId) { headers['ChatGPT-Account-Id'] = workspaceId; }

        if (gizmoId) {
            let cursor = '0';
            do {
                const r = await fetch(`/backend-api/gizmos/${gizmoId}/conversations?cursor=${cursor}`, { headers });
                if (!r.ok) throw new Error(`列举项目对话列表失败 (${r.status})`);
                const j = await r.json();
                j.items?.forEach(it => all.add(it.id));
                cursor = j.cursor;
                await sleep(jitter());
            } while (cursor);
        } else {
            for (const is_archived of [false, true]) {
                let offset = 0, has_more = true, page = 0;
                do {
                    btn.textContent = `📂 项目外对话 (${is_archived ? 'Archived' : 'Active'} p${++page})`;
                    const r = await fetch(`/backend-api/conversations?offset=${offset}&limit=${PAGE_LIMIT}&order=updated${is_archived ? '&is_archived=true' : ''}`, { headers });
                    if (!r.ok) throw new Error(`列举项目外对话列表失败 (${r.status})`);
                    const j = await r.json();
                    if (j.items && j.items.length > 0) {
                        j.items.forEach(it => all.add(it.id));
                        has_more = j.items.length === PAGE_LIMIT;
                        offset += j.items.length;
                    } else {
                        has_more = false;
                    }
                    await sleep(jitter());
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
            title: item.title || 'Untitled Conversation',
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
        if (existing.title === 'Untitled Conversation' && entry.title) {
            existing.title = entry.title;
        }
    }

    async function listConversations(workspaceId) {
        if (!await ensureAccessToken()) {
            throw new Error('无法获取 Access Token，请刷新页面或打开任意一个对话后再试。');
        }

        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error('无法获取 oai-device-id，请确保已登录并刷新页面。');
        }

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        if (workspaceId) { headers['ChatGPT-Account-Id'] = workspaceId; }

        const map = new Map();
        const addEntry = (item, extra = {}) => upsertConversationEntry(map, item, extra);

        for (const is_archived of [false, true]) {
            let offset = 0;
            let has_more = true;
            do {
                const r = await fetch(`/backend-api/conversations?offset=${offset}&limit=${PAGE_LIMIT}&order=updated${is_archived ? '&is_archived=true' : ''}`, { headers });
                if (!r.ok) throw new Error(`列举对话列表失败 (${r.status})`);
                const j = await r.json();
                if (j.items && j.items.length > 0) {
                    j.items.forEach(it => addEntry(it, { is_archived }));
                    has_more = j.items.length === PAGE_LIMIT;
                    offset += j.items.length;
                } else {
                    has_more = false;
                }
                await sleep(jitter());
            } while (has_more);
        }

        if (workspaceId) {
            const projects = await getProjects(workspaceId);
            for (const project of projects) {
                let cursor = '0';
                do {
                    const r = await fetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${cursor}`, { headers });
                    if (!r.ok) throw new Error(`列举项目对话列表失败 (${r.status})`);
                    const j = await r.json();
                    j.items?.forEach(it => addEntry(it, { projectId: project.id, projectTitle: project.title }));
                    cursor = j.cursor;
                    await sleep(jitter());
                } while (cursor);
            }
        }

        return Array.from(map.values())
            .sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
    }

    async function listProjectSpaceConversations(workspaceId) {
        if (!await ensureAccessToken()) {
            throw new Error('无法获取 Access Token，请刷新页面或打开任意一个对话后再试。');
        }

        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error('无法获取 oai-device-id，请确保已登录并刷新页面。');
        }

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        if (resolvedWorkspaceId) { headers['ChatGPT-Account-Id'] = resolvedWorkspaceId; }

        const map = new Map();
        const projects = await getProjectSpaces(resolvedWorkspaceId, { conversationsPerGizmo: PROJECT_SIDEBAR_PREVIEW, ownedOnly: true });

        for (const project of projects) {
            let cursor = '0';
            let fetched = false;
            do {
                const r = await fetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${cursor}`, { headers });
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
                    throw new Error(`列举项目空间对话列表失败 (${r.status})`);
                }
                const j = await r.json();
                j.items?.forEach(item => upsertConversationEntry(map, item, {
                    projectId: project.id,
                    projectTitle: project.title
                }));
                cursor = j.cursor;
                fetched = true;
                await sleep(jitter());
            } while (cursor);
        }

        return Array.from(map.values())
            .sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
    }

    async function getConversation(id, workspaceId, retries = 3) {
        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error('无法获取 oai-device-id，请确保已登录并刷新页面。');
        }
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        if (resolvedWorkspaceId) { headers['ChatGPT-Account-Id'] = resolvedWorkspaceId; }

        let lastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const r = await fetch(`/backend-api/conversation/${id}`, { headers });
                if (r.ok) {
                    const j = await r.json();
                    j.__fetched_at = new Date().toISOString();
                    return j;
                }
                lastError = new Error(`获取对话详情失败 conv ${id} (${r.status})`);
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
        // 处理 sediment://file_xxx 格式 (新格式)
        if (trimmed.startsWith('sediment://')) {
            const path = trimmed.replace('sediment://', '');
            // sediment://file_0000000066dc72099fe3a16ea00b7e51 → file_0000000066dc72099fe3a16ea00b7e51
            return path || trimmed.replace(/[^\w.-]/g, '_');
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
        if (!r.ok) throw new Error(`文件下载链接获取失败 (${r.status})`);
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
        if (!r.ok) throw new Error(`图片下载失败 (${r.status})`);
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
        if (!r.ok) throw new Error(`文件下载失败 (${r.status})`);
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
                    if (!blob) throw new Error('没有可用下载链接');
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
    // (UI部分无变动，此处省略以保持简洁)
    /**
     * [新增] 全面检测函数，返回所有找到的ID
     * @returns {string[]} - 返回包含所有唯一Workspace ID的数组
     */
    function detectAllWorkspaceIds() {
        const foundIds = new Set(capturedWorkspaceIds); // 从网络拦截的结果开始

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
            const modeLabel = mode === 'team' ? '团队空间' : mode === 'project' ? '项目空间' : '个人空间';
            const workspaceLabel = workspaceId ? `（${workspaceId}）` : '';
            dialog.innerHTML = `
                <h2 style="margin-top:0; margin-bottom: 12px; font-size: 18px;">选择要导出的对话</h2>
                <div style="margin-bottom: 12px; color: #666; font-size: 12px;">空间：${modeLabel}${workspaceLabel}</div>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <input id="conv-search" type="text" placeholder="搜索标题/项目名/ID"
                        style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;">
                    <select id="filter-scope" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="all">全部范围</option>
                        <option value="project">仅项目</option>
                        <option value="root">仅项目外</option>
                    </select>
                    <select id="filter-archived" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="all">全部状态</option>
                        <option value="active">仅未归档</option>
                        <option value="archived">仅已归档</option>
                    </select>
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                    <select id="filter-time-field" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="update">按更新时间</option>
                        <option value="create">按创建时间</option>
                    </select>
                    <input id="filter-start-date" type="date" style="padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                    <span style="color: #666; font-size: 12px;">至</span>
                    <input id="filter-end-date" type="date" style="padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                    <button id="clear-date-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">清空日期</button>
                </div>
                <div id="conv-status" style="margin-bottom: 8px; font-size: 12px; color: #666;">正在加载列表...</div>
                <div id="conv-list" style="max-height: 360px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fff;"></div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                    <div style="display: flex; gap: 8px;">
                        <button id="select-all-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">全选</button>
                        <button id="clear-all-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">清空</button>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="back-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">返回</button>
                        <button id="export-selected-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;" disabled>导出选中 (0)</button>
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
                scopeSelect.title = '项目空间仅包含项目对话';
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
                statusEl.textContent = '正在加载列表...';
                return;
            }

            const visibleCount = Math.min(state.visibleCount, state.filtered.length);
            statusEl.textContent = `共 ${state.list.length} 条，当前筛选 ${state.filtered.length} 条，显示 ${visibleCount} 条，已选 ${state.selected.size} 条`;
            exportBtn.textContent = `导出选中 (${state.selected.size})`;

            if (state.filtered.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = '没有匹配的对话。';
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
                title.textContent = item.title || 'Untitled Conversation';
                title.style.fontWeight = 'bold';
                title.style.fontSize = '14px';

                const meta = document.createElement('div');
                meta.style.fontSize = '12px';
                meta.style.color = '#666';
                const timeLabelPrefix = state.timeField === 'create' ? '创建' : '更新';
                const timeValue = state.timeField === 'create' ? item.create_time : item.update_time;
                const timeLabel = formatTimestamp(timeValue) || '未知';
                meta.textContent = `${timeLabelPrefix}: ${timeLabel}`;

                const tags = document.createElement('div');
                tags.style.marginTop = '6px';
                tags.style.display = 'flex';
                tags.style.gap = '6px';
                tags.style.flexWrap = 'wrap';

                if (item.projectTitle) {
                    const projectTag = document.createElement('span');
                    projectTag.textContent = `项目: ${item.projectTitle}`;
                    Object.assign(projectTag.style, {
                        background: '#eef2ff', color: '#4338ca',
                        padding: '2px 6px', borderRadius: '999px', fontSize: '11px'
                    });
                    tags.appendChild(projectTag);
                }

                if (item.is_archived) {
                    const archivedTag = document.createElement('span');
                    archivedTag.textContent = '已归档';
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
                loadMore.textContent = `加载更多（剩余 ${state.filtered.length - state.visibleCount} 条）`;
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
                statusEl.textContent = `加载失败: ${err.message}`;
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
                    html = `<h2 style="margin-top:0; margin-bottom: 20px; font-size: 18px;">导出团队空间</h2>`;

                    if (detectedIds.length > 1) {
                        html += `<div style="background: #eef2ff; border: 1px solid #818cf8; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0 0 12px 0; font-weight: bold; color: #4338ca;">🔎 检测到多个 Workspace，请选择一个:</p>
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
                                     <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534;">✅ 已自动检测到 Workspace ID:</p>
                                     <code id="workspace-id-code" style="background: #e0e7ff; padding: 4px 8px; border-radius: 4px; font-family: monospace; color: #4338ca; word-break: break-all;">${detectedIds[0]}</code>
                                   </div>`;
                    } else {
                        html += `<div style="background: #fffbeb; border: 1px solid #facc15; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0; color: #92400e;">⚠️ 未能自动检测到 Workspace ID。</p>
                                     <p style="margin: 8px 0 0 0; font-size: 12px; color: #92400e;">请尝试刷新页面或打开一个团队对话，或在下方手动输入。</p>
                                   </div>
                                   <label for="team-id-input" style="display: block; margin-bottom: 8px; font-weight: bold;">手动输入 Team Workspace ID:</label>
                                   <input type="text" id="team-id-input" placeholder="粘贴您的 Workspace ID (ws-...)" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;">`;
                    }

                    let actionButtons = '';
                    if (pendingTeamAction === 'all') {
                        actionButtons = `<button id="start-team-export-btn" style="padding: 10px 16px; border: none; border-radius: 8px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">导出全部 (ZIP)</button>`;
                    } else if (pendingTeamAction === 'select') {
                        actionButtons = `<button id="start-team-picker-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">选择对话导出</button>`;
                    } else {
                        actionButtons = `<button id="start-team-export-btn" style="padding: 10px 16px; border: none; border-radius: 8px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">导出全部 (ZIP)</button>
                                     <button id="start-team-picker-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">选择对话导出</button>`;
                    }

                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px;">
                                 <button id="back-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">返回</button>
                                 <div style="display: flex; gap: 8px;">
                                     ${actionButtons}
                                 </div>
                               </div>`;
                    break;
                }

                case 'initial':
                default:
                    html = `<h2 style="margin-top:0; margin-bottom: 20px; font-size: 18px;">选择要导出的空间</h2>
                                <div style="display: flex; flex-direction: column; gap: 16px;">
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">个人空间</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">导出您个人账户下的对话。</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-personal-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">导出全部</button>
                                            <button id="select-personal-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">选择对话导出</button>
                                        </div>
                                    </div>
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">项目空间</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">导出项目空间下的对话，将按项目自动分组。</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-project-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">导出全部</button>
                                            <button id="select-project-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">选择对话导出</button>
                                        </div>
                                    </div>
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">团队空间</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">导出团队空间下的对话，将自动检测ID。</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-team-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">导出全部</button>
                                            <button id="select-team-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">选择对话导出</button>
                                        </div>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
                                    <button id="cancel-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">取消</button>
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
                const startTeamFlow = (action) => {
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
                        alert('请选择或输入一个有效的 Team Workspace ID！');
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
        if (document.getElementById('gpt-rescue-btn')) return;
        const b = document.createElement('button');
        b.id = 'gpt-rescue-btn';
        b.textContent = 'Export Conversations';
        Object.assign(b.style, {
            position: 'fixed', bottom: '24px', right: '24px', zIndex: '99997',
            padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontWeight: 'bold', background: '#10a37f', color: '#fff', fontSize: '14px',
            boxShadow: '0 3px 12px rgba(0,0,0,.15)', userSelect: 'none'
        });
        b.onclick = showExportDialog;
        document.body.appendChild(b);
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
