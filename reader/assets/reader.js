    (() => {
      "use strict";

      const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]);
      const TEXT_DECODER = new TextDecoder("utf-8");
      const LOCAL_FILE_REF_PREFIX = "chatgpt-file:";
      const SETTINGS_KEY = "chatgpt-export-reader.settings.v1";
      const DB_NAME = "chatgpt-export-reader";
      const DB_VERSION = 1;
      const META_KEY = "library";
      const DEFAULT_SETTINGS = {
        language: "auto",
        theme: "system",
        defaultImportMode: "append",
        rememberImportChoice: false
      };
      const i18nConfig = window.ChatGPTReaderI18n || { registry: [], fallbackCode: "en-US", locales: {} };
      const localeRegistry = Array.isArray(i18nConfig.registry) ? i18nConfig.registry : [];
      const localeMap = i18nConfig.locales || {};
      const fallbackLocaleCode = i18nConfig.fallbackCode || "en-US";

      const dom = {
        app: document.getElementById("app"),
        main: document.getElementById("main"),
        sidebar: document.getElementById("sidebar"),
        sidebarPanel: document.getElementById("sidebarPanel"),
        sidebarScroll: document.getElementById("sidebarScroll"),
        chooseZipButton: document.getElementById("chooseZipButton"),
        searchButton: document.getElementById("searchButton"),
        railChooseZipButton: document.getElementById("railChooseZipButton"),
        railSearchButton: document.getElementById("railSearchButton"),
        mediaLibraryButton: document.getElementById("mediaLibraryButton"),
        railMediaLibraryButton: document.getElementById("railMediaLibraryButton"),
        railSettingsButton: document.getElementById("railSettingsButton"),
        mobilePdfButton: document.getElementById("mobilePdfButton"),
        emptyChooseButton: document.getElementById("emptyChooseButton"),
        settingsButton: document.getElementById("settingsButton"),
        fileInput: document.getElementById("fileInput"),
        searchModal: document.getElementById("searchModal"),
        searchModalIcon: document.getElementById("searchModalIcon"),
        searchModalInput: document.getElementById("searchModalInput"),
        searchModalCloseButton: document.getElementById("searchModalCloseButton"),
        searchModalResults: document.getElementById("searchModalResults"),
        importChoiceModal: document.getElementById("importChoiceModal"),
        importChoiceCopy: document.getElementById("importChoiceCopy"),
        rememberImportChoiceInput: document.getElementById("rememberImportChoiceInput"),
        appendImportButton: document.getElementById("appendImportButton"),
        replaceImportButton: document.getElementById("replaceImportButton"),
        cancelImportChoiceButton: document.getElementById("cancelImportChoiceButton"),
        conversationList: document.getElementById("conversationList"),
        metaPanel: document.getElementById("metaPanel"),
        zipName: document.getElementById("zipName"),
        zipStats: document.getElementById("zipStats"),
        zipStatus: document.getElementById("zipStatus"),
        importSummaryPopup: document.getElementById("importSummaryPopup"),
        importSummaryName: document.getElementById("importSummaryName"),
        importSummaryStats: document.getElementById("importSummaryStats"),
        importSummaryStatus: document.getElementById("importSummaryStatus"),
        emptyState: document.getElementById("emptyState"),
        dropZone: document.getElementById("dropZone"),
        readerPane: document.getElementById("readerPane"),
        threadTitle: document.getElementById("threadTitle"),
        threadMeta: document.getElementById("threadMeta"),
        exportPdfButton: document.getElementById("exportPdfButton"),
        messages: document.getElementById("messages"),
        assetLibrary: document.getElementById("assetLibrary"),
        assetLibraryTitle: document.getElementById("assetLibraryTitle"),
        assetLibraryMeta: document.getElementById("assetLibraryMeta"),
        assetLibraryHeaderActions: document.getElementById("assetLibraryHeaderActions"),
        assetLibraryContent: document.getElementById("assetLibraryContent"),
        turnJump: document.getElementById("turnJump"),
        mainScroll: document.getElementById("mainScroll"),
        sourcePanel: document.getElementById("sourcePanel"),
        sourcePanelTitle: document.getElementById("sourcePanelTitle"),
        sourcePanelList: document.getElementById("sourcePanelList"),
        sourcePanelCloseButton: document.getElementById("sourcePanelCloseButton"),
        collapseSidebarButton: document.getElementById("collapseSidebarButton"),
        expandSidebarButton: document.getElementById("expandSidebarButton"),
        openSidebarButton: document.getElementById("openSidebarButton"),
        mobileTitle: document.getElementById("mobileTitle"),
        imageModal: document.getElementById("imageModal"),
        modalImage: document.getElementById("modalImage"),
        modalCloseButton: document.getElementById("modalCloseButton"),
        settingsModal: document.getElementById("settingsModal"),
        settingsCloseButton: document.getElementById("settingsCloseButton"),
        settingsCloseActionButton: document.getElementById("settingsCloseActionButton"),
        languageSelect: document.getElementById("languageSelect"),
        themeSelect: document.getElementById("themeSelect"),
        defaultImportModeSelect: document.getElementById("defaultImportModeSelect"),
        confirmImportChoiceButton: document.getElementById("confirmImportChoiceButton"),
        storageUsedValue: document.getElementById("storageUsedValue"),
        storageRemainingValue: document.getElementById("storageRemainingValue"),
        settingsClearButton: document.getElementById("settingsClearButton"),
        appDialogModal: document.getElementById("appDialogModal"),
        appDialogTitle: document.getElementById("appDialogTitle"),
        appDialogCopy: document.getElementById("appDialogCopy"),
        appDialogField: document.getElementById("appDialogField"),
        appDialogInputLabel: document.getElementById("appDialogInputLabel"),
        appDialogInput: document.getElementById("appDialogInput"),
        appDialogCancelButton: document.getElementById("appDialogCancelButton"),
        appDialogConfirmButton: document.getElementById("appDialogConfirmButton"),
        pdfExportModal: document.getElementById("pdfExportModal"),
        pdfExportCloseButton: document.getElementById("pdfExportCloseButton"),
        pdfExportCancelButton: document.getElementById("pdfExportCancelButton"),
        pdfExportConfirmButton: document.getElementById("pdfExportConfirmButton"),
        pdfThemeSelect: document.getElementById("pdfThemeSelect"),
        pdfCodeStyleSelect: document.getElementById("pdfCodeStyleSelect"),
        pdfIncludeImages: document.getElementById("pdfIncludeImages"),
        pdfIncludeSources: document.getElementById("pdfIncludeSources"),
        toast: document.getElementById("toast")
      };

      const state = {
        settings: { ...DEFAULT_SETTINGS },
        localeCode: fallbackLocaleCode,
        localeMeta: localeRegistry[0] || { code: fallbackLocaleCode, dateLocale: fallbackLocaleCode, dir: "ltr" },
        conversations: [],
        filtered: [],
        conversationSortOrder: "desc",
        selectedId: null,
        query: "",
        zipName: "",
        zipNames: [],
        totalFiles: 0,
        pendingImportFile: null,
        pendingImportMode: "append",
        objectUrls: [],
        storageAvailable: false,
        db: null,
        pendingAssetRecords: [],
        assetRecordsByPath: new Map(),
        imageByFullPath: new Map(),
        fileByFullPath: new Map(),
        imageGroups: new Map(),
        fileGroups: new Map(),
        sourceGroups: [],
        turnJumpItems: [],
        activeTurnJumpIndex: -1,
        activeSourceGroupIndex: null,
        activeView: "conversation",
        libraryFilter: "all",
        libraryLayout: "grid",
        libraryQuery: "",
        librarySort: "name",
        librarySelected: new Set(),
        libraryNames: {},
        librarySortMenuOpen: false,
        importToken: 0,
        searchModalOpen: false,
        appDialogResolver: null,
        importSummaryTimer: 0,
        toastTimer: 0,
        turnJumpScrollFrame: 0
      };

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function readSettings() {
        try {
          const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
          return {
            ...DEFAULT_SETTINGS,
            ...(parsed && typeof parsed === "object" ? parsed : {})
          };
        } catch (_) {
          return { ...DEFAULT_SETTINGS };
        }
      }

      function saveSettings() {
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
        } catch (err) {
          console.warn("Failed to save settings", err);
        }
      }

      function browserChineseLocale() {
        const languages = Array.isArray(navigator.languages) && navigator.languages.length
          ? navigator.languages
          : [navigator.language || ""];
        for (const language of languages) {
          const normalized = String(language || "").toLowerCase().replace(/_/g, "-");
          if (["zh-tw", "zh-hk", "zh-mo", "zh-hant"].some(code => normalized === code || normalized.startsWith(`${code}-`))) {
            return localeMap["zh-TW"] ? "zh-TW" : "zh-CN";
          }
          if (normalized === "zh" || normalized.startsWith("zh-")) {
            return localeMap["zh-CN"] ? "zh-CN" : "zh-TW";
          }
        }
        return "";
      }

      function resolveLocaleCode(language = state.settings.language) {
        if (language && language !== "auto" && localeMap[language]) return language;
        return browserChineseLocale() || fallbackLocaleCode;
      }

      function currentCollationLocale() {
        return state.localeMeta.dateLocale || state.localeCode || fallbackLocaleCode;
      }

      function localeMeta(code = state.localeCode) {
        return localeRegistry.find(locale => locale.code === code) ||
          localeRegistry.find(locale => locale.code === fallbackLocaleCode) ||
          { code: fallbackLocaleCode, dateLocale: fallbackLocaleCode, dir: "ltr" };
      }

      function t(key, params = {}) {
        const active = localeMap[state.localeCode] || {};
        const fallback = localeMap[fallbackLocaleCode] || {};
        let template = active[key] ?? fallback[key] ?? key;
        if (template === key && location.hostname === "localhost") {
          console.warn("Missing i18n key", key);
        }
        return String(template).replace(/\{(\w+)\}/g, (_, name) => (
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
        ));
      }

      function applyTheme() {
        const choice = state.settings.theme || "system";
        const dark = choice === "dark" ||
          (choice === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
      }

      function applyLocale() {
        state.localeCode = resolveLocaleCode();
        state.localeMeta = localeMeta(state.localeCode);
        document.documentElement.lang = state.localeCode;
        document.documentElement.dir = state.localeMeta.dir || "ltr";
        document.querySelectorAll("[data-i18n]").forEach(node => {
          node.textContent = t(node.dataset.i18n);
        });
        document.querySelectorAll("[data-i18n-attr]").forEach(node => {
          String(node.dataset.i18nAttr || "").split(";").forEach(pair => {
            const [attr, key] = pair.split(":").map(part => part && part.trim());
            if (attr && key) node.setAttribute(attr, t(key));
          });
        });
        document.title = t("app.title");
        dom.searchModalInput.placeholder = t("search.placeholder");
        if (!state.selectedId) dom.mobileTitle.textContent = t("app.title");
        if (!state.zipName) dom.zipName.textContent = t("status.notImported");
        setupSidebarControls();
        populateLanguageSelect();
        syncSettingsControls();
        renderList();
        if (state.activeView === "library") {
          renderAssetLibrary();
        } else {
          const selected = getSelectedConversation();
          if (selected) renderConversation(selected);
        }
        if (state.searchModalOpen) renderSearchModalResults();
      }

      function updateSettings(patch) {
        state.settings = { ...state.settings, ...patch };
        saveSettings();
        applyTheme();
        applyLocale();
      }

      function populateLanguageSelect() {
        if (!dom.languageSelect) return;
        const current = dom.languageSelect.value || state.settings.language;
        const options = [
          `<option value="auto">${escapeHtml(t("settings.languageAuto"))}</option>`,
          ...localeRegistry.map(locale => (
            `<option value="${escapeHtml(locale.code)}">${escapeHtml(locale.nativeLabel || locale.label || locale.code)}</option>`
          ))
        ].join("");
        if (dom.languageSelect.innerHTML !== options) {
          dom.languageSelect.innerHTML = options;
        }
        dom.languageSelect.value = localeMap[current] || current === "auto" ? current : "auto";
      }

      function syncSettingsControls() {
        if (dom.languageSelect) dom.languageSelect.value = state.settings.language || "auto";
        if (dom.themeSelect) dom.themeSelect.value = state.settings.theme || "system";
        if (dom.defaultImportModeSelect) dom.defaultImportModeSelect.value = state.settings.defaultImportMode || "append";
      }

      function openSettingsModal() {
        syncSettingsControls();
        refreshStorageEstimate();
        dom.settingsModal.classList.add("visible");
        dom.settingsModal.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => dom.languageSelect?.focus());
      }

      function closeSettingsModal() {
        dom.settingsModal.classList.remove("visible");
        dom.settingsModal.setAttribute("aria-hidden", "true");
      }

      function settleAppDialog(result) {
        const resolver = state.appDialogResolver;
        if (!resolver) return;
        state.appDialogResolver = null;
        dom.appDialogModal.classList.remove("visible");
        dom.appDialogModal.setAttribute("aria-hidden", "true");
        resolver(result);
      }

      function openAppDialog(options = {}) {
        if (state.appDialogResolver) settleAppDialog({ confirmed: false, value: "" });
        const hasInput = Boolean(options.input);
        dom.appDialogTitle.textContent = options.title || "";
        dom.appDialogCopy.textContent = options.copy || "";
        dom.appDialogCancelButton.textContent = options.cancelLabel || t("actions.cancel");
        dom.appDialogConfirmButton.textContent = options.confirmLabel || t("actions.submit");
        dom.appDialogConfirmButton.classList.toggle("danger", Boolean(options.danger));
        dom.appDialogField.hidden = !hasInput;
        dom.appDialogInputLabel.textContent = options.inputLabel || "";
        dom.appDialogInput.value = hasInput ? (options.value || "") : "";
        dom.appDialogModal.classList.add("visible");
        dom.appDialogModal.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => {
          if (hasInput) {
            dom.appDialogInput.focus();
            dom.appDialogInput.select();
          } else {
            dom.appDialogConfirmButton.focus();
          }
        });
        return new Promise(resolve => {
          state.appDialogResolver = resolve;
        });
      }

      async function confirmAppDialog(options) {
        const result = await openAppDialog(options);
        return Boolean(result?.confirmed);
      }

      function requestToPromise(request) {
        return new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
        });
      }

      function openDatabase() {
        if (!("indexedDB" in window)) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("conversations")) {
              db.createObjectStore("conversations", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("assets")) {
              db.createObjectStore("assets", { keyPath: "path" });
            }
            if (!db.objectStoreNames.contains("meta")) {
              db.createObjectStore("meta", { keyPath: "key" });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
        });
      }

      async function initStorage() {
        try {
          state.db = await openDatabase();
          state.storageAvailable = Boolean(state.db);
        } catch (err) {
          console.warn("IndexedDB unavailable", err);
          state.db = null;
          state.storageAvailable = false;
          showToast(t("status.cacheUnavailable"));
        }
      }

      function transaction(storeNames, mode = "readonly") {
        if (!state.db) return null;
        return state.db.transaction(storeNames, mode);
      }

      async function getAllFromStore(storeName) {
        const tx = transaction([storeName]);
        if (!tx) return [];
        return await requestToPromise(tx.objectStore(storeName).getAll());
      }

      async function getMeta() {
        const tx = transaction(["meta"]);
        if (!tx) return null;
        return await requestToPromise(tx.objectStore("meta").get(META_KEY));
      }

      function waitForTransaction(tx) {
        return new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
          tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
        });
      }

      async function clearStoredLibrary() {
        if (!state.db) return;
        const tx = transaction(["conversations", "assets", "meta"], "readwrite");
        tx.objectStore("conversations").clear();
        tx.objectStore("assets").clear();
        tx.objectStore("meta").clear();
        await waitForTransaction(tx);
      }

      function stripRuntimeConversation(conversation) {
        return JSON.parse(JSON.stringify(conversation, (key, value) => {
          if (key === "localUrl") return "";
          if (key === "url" && typeof value === "string" && value.startsWith("blob:")) return "";
          return value;
        }));
      }

      async function saveLibraryToStorage() {
        if (!state.db) return;
        state.pendingAssetRecords.forEach(record => {
          if (record?.path) state.assetRecordsByPath.set(record.path, record);
        });
        const tx = transaction(["conversations", "assets", "meta"], "readwrite");
        const conversationsStore = tx.objectStore("conversations");
        const assetsStore = tx.objectStore("assets");
        conversationsStore.clear();
        assetsStore.clear();
        state.conversations.forEach(conversation => conversationsStore.put(stripRuntimeConversation(conversation)));
        state.assetRecordsByPath.forEach(record => assetsStore.put(record));
        tx.objectStore("meta").put({
          key: META_KEY,
          zipNames: state.zipNames,
          totalFiles: state.totalFiles,
          selectedId: state.selectedId,
          libraryNames: state.libraryNames,
          savedAt: Date.now()
        });
        await waitForTransaction(tx);
        state.pendingAssetRecords = [];
      }

      function stageAssetRecord(record) {
        if (!record?.path) return;
        state.pendingAssetRecords.push(record);
        state.assetRecordsByPath.set(record.path, record);
      }

      function assetRecordToRuntime(record) {
        if (!record?.blob) return null;
        state.assetRecordsByPath.set(record.path, record);
        const url = URL.createObjectURL(record.blob);
        state.objectUrls.push(url);
        return {
          path: record.path,
          baseDir: record.baseDir || "",
          relative: record.relative || "",
          name: record.name || basename(record.path),
          nameLower: record.nameLower || basename(record.path).toLowerCase(),
          url,
          mimeType: record.mimeType || record.blob.type || mimeFromPath(record.path),
          size: record.size || record.blob.size || 0,
          importedAt: record.importedAt || 0
        };
      }

      async function restoreLibraryFromStorage() {
        if (!state.db) return false;
        const [meta, conversations, assets] = await Promise.all([
          getMeta(),
          getAllFromStore("conversations"),
          getAllFromStore("assets")
        ]);
        if (!Array.isArray(conversations) || conversations.length === 0) return false;
        resetImportedData({ cancelImport: false });
        state.conversations = conversations;
        state.conversations.forEach(conversation => buildSearchText(conversation));
        state.filtered = state.conversations.slice();
        state.zipNames = Array.isArray(meta?.zipNames) ? meta.zipNames : [];
        state.zipName = state.zipNames[0] || "";
        state.totalFiles = Number(meta?.totalFiles) || assets.length;
        state.libraryNames = meta?.libraryNames && typeof meta.libraryNames === "object" ? meta.libraryNames : {};
        const imageRecords = [];
        const fileRecords = [];
        for (const asset of assets) {
          const runtime = assetRecordToRuntime(asset);
          if (!runtime) continue;
          if (asset.kind === "image") imageRecords.push(runtime);
          else fileRecords.push(runtime);
        }
        buildImageIndexes(imageRecords);
        buildFileIndex(fileRecords);
        state.conversations.forEach(conversation => attachLocalImages(conversation.messages, conversation.baseDir));
        updateImportSummary();
        renderList();
        const preferred = meta?.selectedId && state.conversations.some(item => item.id === meta.selectedId)
          ? meta.selectedId
          : state.conversations[0].id;
        selectConversation(preferred);
        return true;
      }

      function decodeHtmlEntities(value) {
        return String(value ?? "")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");
      }

      function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }

      function normalizeZipPath(path) {
        return String(path || "")
          .replace(/\\/g, "/")
          .replace(/^\/+/, "")
          .split("/")
          .filter(part => part && part !== ".")
          .join("/");
      }

      function dirname(path) {
        const normalized = normalizeZipPath(path);
        const index = normalized.lastIndexOf("/");
        return index === -1 ? "" : normalized.slice(0, index);
      }

      function basename(path) {
        const normalized = normalizeZipPath(path);
        const index = normalized.lastIndexOf("/");
        return index === -1 ? normalized : normalized.slice(index + 1);
      }

      function extension(path) {
        const name = basename(path);
        const index = name.lastIndexOf(".");
        return index === -1 ? "" : name.slice(index + 1).toLowerCase();
      }

      function withoutExtension(path) {
        const name = basename(path);
        const index = name.lastIndexOf(".");
        return index === -1 ? name : name.slice(0, index);
      }

      function joinZipPath(base, relative) {
        const raw = relative.replace(/^\.\/+/, "");
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
        return normalizeZipPath([base, raw].filter(Boolean).join("/"));
      }

      function normalizeEpochSeconds(value) {
        if (!value) return 0;
        if (typeof value === "number" && Number.isFinite(value)) {
          return value > 1e12 ? Math.floor(value / 1000) : value;
        }
        if (typeof value === "string") {
          const parsed = Date.parse(value);
          if (!Number.isNaN(parsed)) {
            return Math.floor(parsed / 1000);
          }
        }
        return 0;
      }

      function formatTimestamp(value) {
        const seconds = normalizeEpochSeconds(value);
        if (!seconds) return "";
        const date = new Date(seconds * 1000);
        if (Number.isNaN(date.getTime())) return "";
        return new Intl.DateTimeFormat(state.localeMeta.dateLocale || state.localeCode, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }).format(date);
      }

      function formatListTimestamp(value) {
        const seconds = normalizeEpochSeconds(value);
        if (!seconds) return "";
        const date = new Date(seconds * 1000);
        if (Number.isNaN(date.getTime())) return "";
        return new Intl.DateTimeFormat(state.localeMeta.dateLocale || state.localeCode, {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }).format(date);
      }

      function safeUrl(url) {
        const value = String(url || "").trim();
        if (!value) return "";
        if (/^(https?:|mailto:|blob:|data:image\/)/i.test(value)) return value;
        return "";
      }

      function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function sanitizeFilename(value, fallback = "attachment") {
        const safe = String(value || "")
          .replace(/[\x00-\x1f\x7f]/g, "")
          .replace(/[\/\\?%*:|"<>]/g, "-")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^[. -]+|[. -]+$/g, "")
          .slice(0, 120);
        return safe || fallback;
      }

      function sanitizeImageFilenamePart(value, fallback = "image") {
        const safe = String(value || fallback)
          .replace(/[\x00-\x1f\x7f]/g, "")
          .replace(/[\/\\?%*:|"<>]/g, "-")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^[. -]+|[. -]+$/g, "")
          .slice(0, 80)
          .replace(/[^A-Za-z0-9_.-]+/g, "-")
          .replace(/[-.]{2,}/g, "-")
          .replace(/^[.-]+|[.-]+$/g, "");
        return safe || fallback;
      }

      function normalizeAssetId(raw) {
        if (!raw || typeof raw !== "string") return "";
        const trimmed = raw.trim();
        if (trimmed.startsWith("sediment://")) {
          const noScheme = trimmed.replace(/^sediment:\/\//, "");
          const path = noScheme.split(/[?#]/)[0].split("/").filter(Boolean).pop();
          return path || trimmed.replace(/[^\w.-]/g, "_");
        }
        if (trimmed.startsWith("file://") || trimmed.startsWith("file-") || trimmed.startsWith("file_")) {
          const uuid = trimmed.match(/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/i);
          if (uuid) return uuid[0];
          const compact = trimmed.match(/file[_-]([a-f0-9]+)/i);
          if (compact) return `file_${compact[1]}`;
        }
        if (/^https?:\/\//i.test(trimmed)) {
          try {
            const url = new URL(trimmed);
            const parts = url.pathname.split("/").filter(Boolean);
            const last = parts[parts.length - 1];
            if (last) return last.replace(/\.[a-z0-9]+$/i, "");
          } catch (_) {}
        }
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed)) {
          return trimmed.toLowerCase();
        }
        return trimmed.replace(/[^\w.-]/g, "_");
      }

      function isImageContentType(value) {
        const text = String(value || "").toLowerCase();
        return text === "image_asset" ||
          text === "image_asset_pointer" ||
          text.startsWith("image/") ||
          text.includes("image_asset");
      }

      function imageReferenceKeys(image) {
        if (!image || typeof image !== "object") return [];
        return [
          image.asset_pointer,
          image.file_id,
          image.url,
          image.download_url,
          normalizeAssetId(image.asset_pointer || image.file_id || image.url || image.download_url || "")
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
            .flatMap(value => String(value || "").split(","))
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index);
          images[existingIndex] = { ...existing };
          [
            "asset_pointer",
            "url",
            "download_url",
            "content_type",
            "file_id",
            "dispositionLabel",
            "localUrl",
            "localPath",
            "filename"
          ].forEach(field => {
            if (!images[existingIndex][field] && incoming[field]) images[existingIndex][field] = incoming[field];
          });
          images[existingIndex].source = sources.join(",");
          return;
        }
        images.push(incoming);
      }

      function inspectFileAttachment(att) {
        if (!att || typeof att !== "object") return null;
        const nested = att.file && typeof att.file === "object" ? att.file : {};
        const contentType = att.mime_type || att.content_type || att.type ||
          nested.mime_type || nested.content_type || nested.type || "";
        if (isImageContentType(contentType) || att.image_asset || nested.image_asset) return null;
        const fileId = att.file_id || nested.file_id || att.id || nested.id ||
          att.asset_pointer || nested.asset_pointer || "";
        const url = att.download_url || att.url || nested.download_url || nested.url || "";
        const rawName = att.name || att.file_name || att.filename || att.title || att.display_name ||
          nested.name || nested.file_name || nested.filename || nested.title || "";
        const contentTypeText = String(contentType || "").toLowerCase();
        const hasFileSignal = contentTypeText.includes("file") ||
          contentTypeText.includes("attachment") ||
          (contentTypeText && contentTypeText !== "text" && contentTypeText !== "multimodal_text") ||
          Boolean(att.file || nested.file || rawName);
        if (!fileId && !url && !(rawName && hasFileSignal)) return null;
        const fallbackName = normalizeAssetId(fileId || url) || "attachment";
        const filename = sanitizeFilename(rawName || fallbackName, fallbackName);
        return {
          key: fileId || url || rawName || filename,
          file_id: fileId,
          url,
          download_url: att.download_url || nested.download_url || "",
          filename,
          label: rawName || filename,
          content_type: contentType,
          size: att.size || nested.size || null
        };
      }

      function inspectReferenceFile(ref) {
        if (!ref || typeof ref !== "object") return null;
        const refType = String(ref.type || ref.content_type || ref.mime_type || "").toLowerCase();
        if (refType === "grouped_webpages" || refType === "sources_footnote" || refType.includes("webpage")) return null;
        const nameOnlyFile = item => {
          const explicitName = item?.name || item?.file_name || item?.filename || item?.title || item?.display_name || "";
          const pathName = item?.path || item?.file_path || item?.sandbox_path || item?.matched_text || "";
          const rawName = explicitName || String(pathName).split(/[\\/]/).filter(Boolean).pop() || pathName;
          const key = item?.file_id || item?.asset_pointer || item?.url || item?.download_url ||
            item?.path || item?.file_path || item?.sandbox_path || rawName;
          if (!key && !rawName) return null;
          const fallbackName = normalizeAssetId(key) || "attachment";
          const filename = sanitizeFilename(rawName || fallbackName, fallbackName);
          return {
            key: key || filename,
            file_id: item?.file_id || item?.asset_pointer || "",
            url: item?.url || "",
            download_url: item?.download_url || "",
            filename,
            label: rawName || filename,
            content_type: item?.mime_type || item?.content_type || item?.type || "",
            size: item?.size || null
          };
        };
        const hasFileSignal = refType.includes("file") ||
          refType.includes("sandbox") ||
          refType.includes("attachment") ||
          Boolean(ref.file_id || ref.asset_pointer || ref.file || ref.file_path || ref.sandbox_path);
        const direct = inspectFileAttachment(ref);
        if (direct && hasFileSignal) return direct;
        const fallback = hasFileSignal ? nameOnlyFile(ref) : null;
        if (fallback) return fallback;
        const items = Array.isArray(ref.items) ? ref.items : [];
        for (const item of items) {
          const itemType = String(item?.type || item?.content_type || item?.mime_type || "").toLowerCase();
          const itemHasFileSignal = itemType.includes("file") ||
            itemType.includes("sandbox") ||
            itemType.includes("attachment") ||
            Boolean(item?.file_id || item?.asset_pointer || item?.file || item?.file_path || item?.sandbox_path);
          const inspected = inspectFileAttachment(item);
          if (inspected && itemHasFileSignal) return inspected;
          const itemFallback = itemHasFileSignal ? nameOnlyFile(item) : null;
          if (itemFallback) return itemFallback;
        }
        return null;
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
          "key",
          "file_id",
          "url",
          "download_url",
          "filename",
          "label",
          "content_type",
          "size",
          "path",
          "file_path",
          "sandbox_path"
        ].forEach(field => {
          if (!merged[field] && incoming[field]) merged[field] = incoming[field];
        });
        merged.source = [existing.source, source].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(",");
        return merged;
      }

      function localFileRefKey(url) {
        const value = String(url || "");
        if (!value.startsWith(LOCAL_FILE_REF_PREFIX)) return "";
        try {
          return decodeURIComponent(value.slice(LOCAL_FILE_REF_PREFIX.length));
        } catch (_) {
          return value.slice(LOCAL_FILE_REF_PREFIX.length);
        }
      }

      function markdownLinkLabel(value) {
        return String(value || "file").replace(/([\\\[\]])/g, "\\$1");
      }

      function mimeFromPath(path) {
        const ext = extension(path);
        if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
        if (ext === "png") return "image/png";
        if (ext === "webp") return "image/webp";
        if (ext === "gif") return "image/gif";
        if (ext === "svg") return "image/svg+xml";
        if (ext === "bmp") return "image/bmp";
        if (ext === "avif") return "image/avif";
        return "application/octet-stream";
      }

      function formatBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value < 0) return "--";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let size = value;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
          size /= 1024;
          unit += 1;
        }
        const digits = unit === 0 || size >= 10 ? 0 : 1;
        return `${size.toFixed(digits)} ${units[unit]}`;
      }

      async function refreshStorageEstimate() {
        if (!dom.storageUsedValue || !dom.storageRemainingValue) return;
        if (!navigator.storage?.estimate) {
          dom.storageUsedValue.textContent = t("settings.storageUnknown");
          dom.storageRemainingValue.textContent = t("settings.storageUnknown");
          return;
        }
        try {
          const estimate = await navigator.storage.estimate();
          const usage = Number(estimate.usage) || 0;
          const quota = Number(estimate.quota) || 0;
          dom.storageUsedValue.textContent = formatBytes(usage);
          dom.storageRemainingValue.textContent = quota ? formatBytes(Math.max(0, quota - usage)) : t("settings.storageUnknown");
        } catch (err) {
          console.warn("Storage estimate failed", err);
          dom.storageUsedValue.textContent = t("settings.storageUnknown");
          dom.storageRemainingValue.textContent = t("settings.storageUnknown");
        }
      }

      function showToast(message) {
        clearTimeout(state.toastTimer);
        dom.toast.textContent = message;
        dom.toast.classList.add("visible");
        state.toastTimer = setTimeout(() => dom.toast.classList.remove("visible"), 1800);
      }

      function setStatus(message) {
        dom.zipStatus.textContent = message || "";
      }

      function hideImportSummary() {
        clearTimeout(state.importSummaryTimer);
        dom.importSummaryPopup.classList.remove("visible");
        dom.importSummaryPopup.setAttribute("aria-hidden", "true");
      }

      function showImportSummary({ name, stats, status }) {
        clearTimeout(state.importSummaryTimer);
        dom.importSummaryName.textContent = name || t("status.importComplete");
        dom.importSummaryStats.textContent = stats || "";
        dom.importSummaryStatus.textContent = status || "";
        dom.importSummaryPopup.classList.add("visible");
        dom.importSummaryPopup.setAttribute("aria-hidden", "false");
        state.importSummaryTimer = setTimeout(hideImportSummary, 4200);
      }

      function updateSidebarDivider() {
        dom.sidebarPanel.classList.toggle("scrolled", dom.sidebarScroll.scrollTop > 0);
      }

      function revokeObjectUrls() {
        for (const url of state.objectUrls) {
          URL.revokeObjectURL(url);
        }
        state.objectUrls = [];
      }

      function resetImportedData({ cancelImport = true } = {}) {
        if (cancelImport) state.importToken += 1;
        revokeObjectUrls();
        state.conversations = [];
        state.filtered = [];
        state.selectedId = null;
        state.query = "";
        state.zipName = "";
        state.zipNames = [];
        state.totalFiles = 0;
        state.pendingImportFile = null;
        state.pendingAssetRecords = [];
        state.assetRecordsByPath = new Map();
        state.imageByFullPath = new Map();
        state.fileByFullPath = new Map();
        state.imageGroups = new Map();
        state.fileGroups = new Map();
        state.sourceGroups = [];
        state.turnJumpItems = [];
        state.activeTurnJumpIndex = -1;
        state.activeSourceGroupIndex = null;
        state.activeView = "conversation";
        state.libraryFilter = "all";
        state.libraryLayout = "grid";
        state.libraryQuery = "";
        state.librarySort = "name";
        state.librarySelected = new Set();
        state.libraryNames = {};
        state.librarySortMenuOpen = false;
        dom.searchModalInput.value = "";
        hideImportSummary();
        dom.metaPanel.classList.remove("visible");
        dom.zipName.textContent = t("status.notImported");
        dom.zipStats.textContent = "";
        dom.zipStatus.textContent = "";
        dom.conversationList.innerHTML = "";
        dom.turnJump.classList.remove("visible");
        dom.turnJump.innerHTML = "";
        dom.readerPane.classList.remove("visible");
        hideAssetLibrary();
        dom.emptyState.style.display = "grid";
        dom.mobileTitle.textContent = t("app.title");
        closeSearchModal();
        closeImportChoiceModal();
        closeSourcePanel();
        dom.mediaLibraryButton?.classList.remove("active");
      }

      function clearState() {
        resetImportedData({ cancelImport: true });
        dom.fileInput.value = "";
      }

      function nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
      }
      async function readZip(file) {
        if (!window.JSZip) {
          throw new Error(t("error.missingZipParser"));
        }
        const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
        return Object.values(zip.files)
          .filter(entry => !entry.dir)
          .map(entry => ({
            name: normalizeZipPath(entry.name),
            async arrayBuffer() {
              return await entry.async("arraybuffer");
            },
            async text() {
              return await entry.async("string");
            },
            async blob(type) {
              return new Blob([await entry.async("arraybuffer")], { type });
            }
          }))
          .filter(entry => entry.name);
      }

      function cleanMessageContent(text) {
        if (!text) return "";
        return String(text)
          .replace(/\uE200cite(?:\uE202turn\d+[a-z_]+\d+)+\uE201/gi, "")
          .replace(/[\uE200-\uE202]?cite(?:[\uE200-\uE202]?turn\d+[a-z_]+\d+)+[\uE200-\uE202]?/gi, "")
          .trim();
      }

      function processContentReferences(text, contentReferences) {
        if (!text || !Array.isArray(contentReferences) || contentReferences.length === 0) {
          return { text, footnotes: [] };
        }

        const references = contentReferences.filter(ref => ref && typeof ref.matched_text === "string" && ref.matched_text.length > 0);
        if (references.length === 0) return { text, footnotes: [] };

        const getReferenceInfo = ref => {
          const file = inspectReferenceFile(ref);
          if (file) {
            const label = file.label || file.filename || t("file.generic");
            return {
              url: `${LOCAL_FILE_REF_PREFIX}${encodeURIComponent(file.key)}`,
              title: label,
              label,
              fileKey: file.key
            };
          }
          const item = Array.isArray(ref.items) ? ref.items[0] : null;
          const url = item?.url || (Array.isArray(ref.safe_urls) ? ref.safe_urls[0] : "") || "";
          const title = item?.title || "";
          let label = item?.attribution || "";
          if (!label && typeof ref.alt === "string") {
            const match = ref.alt.match(/\[([^\]]+)\]\([^)]+\)/);
            if (match) label = match[1];
          }
          if (!label) label = title || url;
          return { url, title, label };
        };

        const footnotes = [];
        const footnoteIndexByKey = new Map();
        references
          .filter(ref => ref.type === "grouped_webpages" || inspectReferenceFile(ref))
          .sort((a, b) => {
            const aIdx = Number.isFinite(a.start_idx) ? a.start_idx : Number.MAX_SAFE_INTEGER;
            const bIdx = Number.isFinite(b.start_idx) ? b.start_idx : Number.MAX_SAFE_INTEGER;
            return aIdx - bIdx;
          })
          .forEach(ref => {
            const info = getReferenceInfo(ref);
            if (!info.url) return;
            const key = `${info.url}|${info.title}`;
            if (footnoteIndexByKey.has(key)) return;
            const index = footnotes.length + 1;
            footnoteIndexByKey.set(key, index);
            footnotes.push({ index, url: info.url, title: info.title, label: info.label });
          });

        let output = text;
        references
          .slice()
          .sort((a, b) => {
            const aIdx = Number.isFinite(a.start_idx) ? a.start_idx : -1;
            const bIdx = Number.isFinite(b.start_idx) ? b.start_idx : -1;
            if (aIdx !== -1 || bIdx !== -1) return bIdx - aIdx;
            return (b.matched_text?.length || 0) - (a.matched_text?.length || 0);
          })
          .forEach(ref => {
            if (!ref?.matched_text || ref.type === "sources_footnote") return;
            let replacement = "";
            if (ref.type === "grouped_webpages" || inspectReferenceFile(ref)) {
              const info = getReferenceInfo(ref);
              if (info.url) {
                const key = `${info.url}|${info.title}`;
                const index = footnoteIndexByKey.get(key);
                replacement = index ? `([${markdownLinkLabel(info.label)}][${index}])` : (ref.alt || "");
              } else {
                replacement = ref.alt || "";
              }
            } else {
              replacement = ref.alt || "";
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

      function inspectImageAsset(asset) {
        if (!asset || typeof asset !== "object") return null;
        const pointer = asset.asset_pointer || asset.file_id || asset.id || null;
        if (!pointer) return null;
        let label = asset.disposition_label || asset.alt_text || asset.alt || "";
        if (!label && asset.metadata?.dalle?.prompt) label = asset.metadata.dalle.prompt;
        if (!label && asset.metadata?.generation?.serialization_title) label = asset.metadata.generation.serialization_title;
        return {
          asset_pointer: pointer,
          url: asset.url || asset.download_url || asset.dalle_url || null,
          content_type: asset.content_type || asset.mime_type || null,
          file_id: asset.file_id || null,
          dispositionLabel: (typeof label === "string" ? label : "image").slice(0, 200)
        };
      }

      function extractConversationMessages(convData) {
        const mapping = convData?.mapping;
        if (!mapping || typeof mapping !== "object") return [];

        const messages = [];
        const mappingKeys = Object.keys(mapping);
        const rootId = mapping["client-created-root"]
          ? "client-created-root"
          : mappingKeys.find(id => !mapping[id]?.parent) || mappingKeys[0];
        const visited = new Set();

        const collectTextPart = (part, textParts, images, files) => {
          if (typeof part === "string") {
            textParts.push(part);
            return;
          }
          if (!part || typeof part !== "object") return;
          const inspectedFile = inspectFileAttachment(part.file || part);
          if (inspectedFile) {
            addFileIfMissing(files, inspectedFile, "text_part");
            textParts.push(`<!-- file:${encodeURIComponent(inspectedFile.key)} -->`);
            return;
          }
          if (typeof part.text === "string") textParts.push(part.text);
          const isImage = part.content_type === "image_asset" || part.content_type === "image_asset_pointer" || part.image_asset;
          if (isImage) {
            const inspected = inspectImageAsset(part.image_asset || part);
            if (inspected) {
              textParts.push(`<!-- image:${inspected.asset_pointer} -->`);
              addImageIfMissing(images, inspected, "text_part");
            }
          }
        };

        const collectParts = content => {
          const textParts = [];
          const images = [];
          const files = [];
          const contentType = content?.content_type;
          const parts = Array.isArray(content?.parts) ? content.parts : [];
          const handleImagePart = (imgAsset, source) => {
            const inspected = inspectImageAsset(imgAsset);
            if (inspected) addImageIfMissing(images, inspected, source);
          };
          const handleFilePart = (fileAsset, source) => {
            const inspected = inspectFileAttachment(fileAsset?.file || fileAsset);
            if (!inspected) return;
            addFileIfMissing(files, inspected, source);
            textParts.push(`<!-- file:${encodeURIComponent(inspected.key)} -->`);
          };
          const isImageContentType = ct => ct === "image_asset" || ct === "image_asset_pointer";
          const isFileContentType = ct => {
            const text = String(ct || "").toLowerCase();
            return text.includes("file") || text.includes("attachment");
          };

          if (contentType === "text") {
            parts.forEach(part => collectTextPart(part, textParts, images, files));
          } else if (isImageContentType(contentType)) {
            handleImagePart(content.image_asset || content, "image_asset");
          } else if (isFileContentType(contentType)) {
            handleFilePart(content.file || content, "file_asset");
          } else if (contentType === "multimodal_text") {
            parts.forEach(part => {
              if (typeof part === "string") {
                collectTextPart(part, textParts, images, files);
              } else if (part && isImageContentType(part.content_type || part.type)) {
                handleImagePart(part.image_asset || part, "multimodal_text");
              } else if (part && isFileContentType(part.content_type || part.type)) {
                handleFilePart(part.file || part, "multimodal_text");
              } else if (part && typeof part === "object" && part.text) {
                collectTextPart(part.text, textParts, images, files);
              } else {
                collectTextPart(part, textParts, images, files);
              }
            });
          } else if (contentType && parts.length) {
            parts.forEach(part => collectTextPart(part, textParts, images, files));
          }

          return { rawText: textParts.filter(Boolean).join("\n"), images, files };
        };

        const traverse = nodeId => {
          if (!nodeId || visited.has(nodeId)) return;
          visited.add(nodeId);
          const node = mapping[nodeId];
          if (!node) return;
          const msg = node.message;
          if (msg) {
            const author = msg.author?.role;
            const isHidden = msg.metadata?.is_visually_hidden_from_conversation ||
              msg.metadata?.is_contextual_answers_system_message;
            if (author && author !== "system" && !isHidden) {
              const { rawText = "", images = [], files: partFiles = [] } = msg.content ? (collectParts(msg.content) || {}) : {};
              const files = partFiles.slice();
              if (Array.isArray(msg.metadata?.attachments)) {
                msg.metadata.attachments.forEach(att => {
                  if (!att) return;
                  if (isImageContentType(att.content_type || att.type || att.mime_type)) {
                    const inspected = inspectImageAsset(att.image_asset || att);
                    if (inspected) addImageIfMissing(images, inspected, "attachment");
                    return;
                  }
                  const file = inspectFileAttachment(att);
                  addFileIfMissing(files, file, "attachment");
                });
              }

              const contentReferences = msg.metadata?.content_references || [];
              if (Array.isArray(contentReferences)) {
                contentReferences.forEach(ref => {
                  const file = inspectReferenceFile(ref);
                  if (!file) return;
                  addFileIfMissing(files, file, "content_reference");
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
              if ((cleaned && cleaned.length > 0) || images.length > 0 || files.length > 0) {
                messages.push({
                  messageId: msg.id || nodeId,
                  role: author,
                  content: cleaned || "",
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

        if (rootId) traverse(rootId);
        else mappingKeys.forEach(traverse);
        return messages;
      }

      function parseMarkdownMessages(markdown) {
        const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
        const messages = [];
        let current = null;
        const flush = () => {
          if (!current) return;
          current.content = current.lines.join("\n").trim();
          delete current.lines;
          if (current.content) messages.push(current);
        };

        for (const line of lines) {
          const trimmed = line.trim();
          if (/^#\s+User\s*$/i.test(trimmed) || /^#{1,3}\s+用户\s*$/i.test(trimmed)) {
            flush();
            current = { role: "user", content: "", lines: [], footnotes: [], images: [] };
          } else if (/^#\s+Assistant\s*$/i.test(trimmed) || /^#{1,3}\s+助手\s*$/i.test(trimmed)) {
            flush();
            current = { role: "assistant", content: "", lines: [], footnotes: [], images: [] };
          } else {
            if (!current) current = { role: "assistant", content: "", lines: [], footnotes: [], images: [] };
            current.lines.push(line);
          }
        }
        flush();
        return messages.length ? messages : [{ role: "assistant", content: String(markdown || "").trim(), footnotes: [], images: [] }];
      }

      function imageRecordBaseDir(path) {
        const normalized = normalizeZipPath(path);
        const lower = normalized.toLowerCase();
        const index = lower.lastIndexOf("/images/");
        if (index >= 0) {
          return {
            baseDir: normalized.slice(0, index),
            relative: normalized.slice(index + 1)
          };
        }
        if (lower.startsWith("images/")) {
          return { baseDir: "", relative: normalized };
        }
        return { baseDir: dirname(normalized), relative: basename(normalized) };
      }

      function fileRecordBaseDir(path) {
        const normalized = normalizeZipPath(path);
        const lower = normalized.toLowerCase();
        const index = lower.lastIndexOf("/files/");
        if (index >= 0) {
          return {
            baseDir: normalized.slice(0, index),
            relative: normalized.slice(index + 1)
          };
        }
        if (lower.startsWith("files/")) {
          return { baseDir: "", relative: normalized };
        }
        return { baseDir: dirname(normalized), relative: basename(normalized) };
      }

      function buildImageIndexes(imageRecords) {
        const byFullPath = new Map(state.imageByFullPath);
        const groups = new Map();
        for (const [key, records] of state.imageGroups) {
          groups.set(key, records.slice());
        }
        for (const record of imageRecords) {
          byFullPath.set(record.path, record);
          const key = record.baseDir || "";
          if (!groups.has(key)) groups.set(key, []);
          const group = groups.get(key);
          const existingIndex = group.findIndex(item => item.path === record.path);
          if (existingIndex >= 0) group[existingIndex] = record;
          else group.push(record);
        }
        for (const group of groups.values()) {
          group.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
        }
        state.imageByFullPath = byFullPath;
        state.imageGroups = groups;
      }

      function buildFileIndex(fileRecords) {
        const byFullPath = new Map(state.fileByFullPath);
        const groups = new Map(state.fileGroups);
        for (const record of fileRecords) {
          byFullPath.set(record.path, record);
          const key = record.baseDir || "";
          if (!groups.has(key)) groups.set(key, []);
          const group = groups.get(key);
          const existingIndex = group.findIndex(item => item.path === record.path);
          if (existingIndex >= 0) group[existingIndex] = record;
          else group.push(record);
        }
        for (const group of groups.values()) {
          group.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
        }
        state.fileByFullPath = byFullPath;
        state.fileGroups = groups;
      }

      function fileReferenceKeys(file) {
        if (!file || typeof file !== "object") return [];
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

      function fileNameFromReferenceKey(key) {
        const value = String(key || "");
        if (!value) return "";
        if (/^https?:\/\//i.test(value)) {
          try {
            return basename(new URL(value).pathname);
          } catch (_) {
            return "";
          }
        }
        return basename(value);
      }

      function findFileRecordForReference(key, baseDir, files = []) {
        const group = state.fileGroups.get(baseDir || "") || [];
        if (!group.length) return null;
        const candidates = [key, normalizeAssetId(key), fileNameFromReferenceKey(key)]
          .filter(Boolean)
          .map(value => value.toLowerCase());
        for (const file of files) {
          fileReferenceKeys(file).forEach(alias => {
            candidates.push(String(alias).toLowerCase(), normalizeAssetId(alias).toLowerCase(), fileNameFromReferenceKey(alias).toLowerCase());
          });
        }
        const needles = candidates.filter((value, index, list) => value && list.indexOf(value) === index);
        return group.find(record => {
          const name = record.nameLower || record.name.toLowerCase();
          const path = record.path.toLowerCase();
          return needles.some(needle => name === needle || name.includes(needle) || path.includes(needle));
        }) || null;
      }

      function findImageRecordForAsset(asset, baseDir, order) {
        const group = state.imageGroups.get(baseDir || "") || [];
        if (!group.length) return null;
        const pointer = asset?.asset_pointer || asset?.file_id || asset?.url || "";
        const assetId = normalizeAssetId(pointer);
        const safeId = sanitizeImageFilenamePart(assetId);
        const needles = [assetId, safeId]
          .filter(Boolean)
          .map(value => value.toLowerCase())
          .filter((value, index, list) => list.indexOf(value) === index);
        const exact = needles.length
          ? group.find(record => needles.some(needle => record.nameLower.includes(needle)))
          : null;
        if (exact) return exact;
        const prefix = `img_${String(order + 1).padStart(2, "0")}_`;
        return group.find(record => record.nameLower.startsWith(prefix)) || group[order] || null;
      }

      function attachLocalImages(messages, baseDir) {
        const seen = new Map();
        let imageOrder = 0;
        for (const message of messages) {
          if (!Array.isArray(message.images)) continue;
          for (const image of message.images) {
            const key = image.asset_pointer || image.url || `${message.messageId || "message"}:${imageOrder}`;
            if (!seen.has(key)) {
              seen.set(key, findImageRecordForAsset(image, baseDir, imageOrder));
              imageOrder += 1;
            }
            const record = seen.get(key);
            if (record) {
              image.localUrl = record.url;
              image.localPath = record.path;
              image.filename = record.name;
            }
          }
        }
      }

      function resolveMarkdownImageUrl(src, baseDir) {
        const raw = String(src || "").trim().replace(/^<|>$/g, "");
        const safe = safeUrl(raw);
        if (safe) return safe;
        const path = joinZipPath(baseDir || "", decodeURIComponentSafe(raw));
        const record = state.imageByFullPath.get(path);
        return record?.url || "";
      }

      function resolveMarkdownLinkUrl(src, baseDir) {
        return resolveMarkdownLink(src, baseDir).href;
      }

      function resolveMarkdownLink(src, baseDir) {
        const raw = String(src || "").trim().replace(/^<|>$/g, "");
        const safe = safeUrl(raw);
        if (safe) return { href: safe, download: "", local: safe.startsWith("blob:") };
        const path = joinZipPath(baseDir || "", decodeURIComponentSafe(raw));
        const record = state.fileByFullPath.get(path) || state.imageByFullPath.get(path);
        return record?.url
          ? { href: record.url, download: assetRecordDisplayName(record), local: true, path: record.path, record }
          : { href: "", download: "", local: false };
      }

      function decodeURIComponentSafe(value) {
        try {
          return decodeURIComponent(value);
        } catch (_) {
          return value;
        }
      }

      function conversationTitleFromPath(path) {
        return withoutExtension(path)
          .replace(/_[a-f0-9]{8,}$/i, "")
          .replace(/[_-]+/g, " ")
          .trim() || "Untitled Conversation";
      }

      function conversationBranchId(data) {
        return typeof data?.current_node === "string" ? data.current_node.trim() : "";
      }

      function conversationFromJson(data, path, mdText) {
        const baseDir = dirname(path);
        const messages = extractConversationMessages(data);
        attachLocalImages(messages, baseDir);
        const createdAt = data.create_time || messages.find(m => m.create_time)?.create_time || "";
        const updatedAt = data.update_time || messages[messages.length - 1]?.create_time || createdAt || "";
        const title = (typeof data.title === "string" && data.title.trim()) || conversationTitleFromPath(path);
        const id = data.conversation_id || path;
        const branchId = conversationBranchId(data);
        return {
          id: branchId ? `${id}:${branchId}:${path}` : `${id}:${path}`,
          conversationId: data.conversation_id || "",
          branchId,
          title,
          project: baseDir || "根目录",
          baseDir,
          jsonPath: path,
          mdPath: "",
          source: "json",
          createdAt,
          updatedAt,
          messages,
          markdownText: mdText || "",
          searchText: "",
          sortTime: normalizeEpochSeconds(updatedAt) || normalizeEpochSeconds(createdAt)
        };
      }

      function conversationFromMarkdown(path, markdown) {
        const baseDir = dirname(path);
        const messages = parseMarkdownMessages(markdown);
        return {
          id: `md:${path}`,
          conversationId: "",
          title: conversationTitleFromPath(path),
          project: baseDir || "根目录",
          baseDir,
          jsonPath: "",
          mdPath: path,
          source: "markdown",
          createdAt: "",
          updatedAt: "",
          messages,
          markdownText: markdown,
          searchText: "",
          sortTime: 0
        };
      }

      function buildSearchText(conversation) {
        const parts = [
          conversation.title,
          conversation.project,
          conversation.jsonPath,
          conversation.mdPath,
          conversation.conversationId
        ];
        for (const message of conversation.messages) {
          parts.push(message.role, message.content);
          if (Array.isArray(message.footnotes)) {
            message.footnotes.forEach(note => parts.push(note.title, note.url, note.label));
          }
        }
        conversation.searchText = parts.filter(Boolean).join("\n").toLowerCase();
      }

      function markdownPathForJson(path, markdownEntries) {
        const stem = withoutExtension(path).toLowerCase();
        const dir = dirname(path);
        const exact = normalizeZipPath([dir, `${withoutExtension(path)}.md`].filter(Boolean).join("/"));
        if (markdownEntries.has(exact)) return exact;
        for (const key of markdownEntries.keys()) {
          if (dirname(key) === dir && withoutExtension(key).toLowerCase() === stem) return key;
        }
        return "";
      }

      async function buildConversations(entries, token) {
        const pathEntries = new Map();
        for (const entry of entries) pathEntries.set(entry.name, entry);

        const jsonEntries = entries.filter(entry => extension(entry.name) === "json");
        const markdownEntries = new Map(entries.filter(entry => extension(entry.name) === "md").map(entry => [entry.name, entry]));
        const imageEntries = entries.filter(entry => IMAGE_EXTENSIONS.has(extension(entry.name)));
        const fileEntries = entries.filter(entry => {
          const lower = entry.name.toLowerCase();
          return lower.includes("/files/") || lower.startsWith("files/");
        });

        setStatus(t("status.readingImages", { count: imageEntries.length }));
        const imageRecords = [];
        for (let i = 0; i < imageEntries.length; i++) {
          if (token !== state.importToken) return [];
          const entry = imageEntries[i];
          try {
            const { baseDir, relative } = imageRecordBaseDir(entry.name);
            const blob = await entry.blob(mimeFromPath(entry.name));
            const url = URL.createObjectURL(blob);
            state.objectUrls.push(url);
            stageAssetRecord({
              path: entry.name,
              kind: "image",
              baseDir,
              relative,
              name: basename(entry.name),
              nameLower: basename(entry.name).toLowerCase(),
              mimeType: blob.type || mimeFromPath(entry.name),
              size: blob.size || 0,
              blob,
              importedAt: Date.now()
            });
            imageRecords.push({
              path: entry.name,
              baseDir,
              relative,
              name: basename(entry.name),
              nameLower: basename(entry.name).toLowerCase(),
              mimeType: blob.type || mimeFromPath(entry.name),
              size: blob.size || 0,
              importedAt: Date.now(),
              url
            });
          } catch (err) {
            console.warn("Image read failed", entry.name, err);
          }
          if (i % 20 === 0) {
            setStatus(t("status.readingImagesProgress", { current: i + 1, total: imageEntries.length }));
            await nextFrame();
          }
        }
        buildImageIndexes(imageRecords);

        setStatus(t("status.readingFiles", { count: fileEntries.length }));
        const fileRecords = [];
        for (let i = 0; i < fileEntries.length; i++) {
          if (token !== state.importToken) return [];
          const entry = fileEntries[i];
          try {
            const { baseDir, relative } = fileRecordBaseDir(entry.name);
            const blob = await entry.blob(mimeFromPath(entry.name));
            const url = URL.createObjectURL(blob);
            state.objectUrls.push(url);
            stageAssetRecord({
              path: entry.name,
              kind: "file",
              baseDir,
              relative,
              name: basename(entry.name),
              nameLower: basename(entry.name).toLowerCase(),
              mimeType: blob.type || mimeFromPath(entry.name),
              size: blob.size || 0,
              blob,
              importedAt: Date.now()
            });
            fileRecords.push({
              path: entry.name,
              baseDir,
              relative,
              name: basename(entry.name),
              nameLower: basename(entry.name).toLowerCase(),
              mimeType: blob.type || mimeFromPath(entry.name),
              size: blob.size || 0,
              importedAt: Date.now(),
              url
            });
          } catch (err) {
            console.warn("File read failed", entry.name, err);
          }
          if (i % 20 === 0) {
            setStatus(t("status.readingFilesProgress", { current: i + 1, total: fileEntries.length }));
            await nextFrame();
          }
        }
        buildFileIndex(fileRecords);

        const conversations = [];
        const consumedMarkdown = new Set();
        for (let i = 0; i < jsonEntries.length; i++) {
          if (token !== state.importToken) return [];
          const entry = jsonEntries[i];
          try {
            const text = await entry.text();
            const data = JSON.parse(text);
            if (!data || typeof data !== "object" || !data.mapping) continue;
            const mdPath = markdownPathForJson(entry.name, markdownEntries);
            const mdText = mdPath ? await markdownEntries.get(mdPath).text() : "";
            if (mdPath) consumedMarkdown.add(mdPath);
            const conversation = conversationFromJson(data, entry.name, mdText);
            conversation.mdPath = mdPath;
            buildSearchText(conversation);
            conversations.push(conversation);
          } catch (err) {
            console.warn("JSON conversation read failed", entry.name, err);
          }
          if (i % 25 === 0) {
            setStatus(t("status.parsingConversations", { current: i + 1, total: jsonEntries.length }));
            await nextFrame();
          }
        }

        let markdownCount = 0;
        for (const [path, entry] of markdownEntries) {
          if (token !== state.importToken) return [];
          if (consumedMarkdown.has(path)) continue;
          try {
            const markdown = await entry.text();
            if (!markdown.trim()) continue;
            const conversation = conversationFromMarkdown(path, markdown);
            buildSearchText(conversation);
            conversations.push(conversation);
            markdownCount += 1;
          } catch (err) {
            console.warn("Markdown conversation read failed", path, err);
          }
        }

        conversations.sort((a, b) => {
          if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
          return a.title.localeCompare(b.title, currentCollationLocale());
        });

        setStatus(markdownCount ? t("status.markdownOnly", { count: markdownCount }) : t("status.importComplete"));
        return conversations;
      }

      function renderConversationSortButton() {
        const asc = state.conversationSortOrder === "asc";
        const label = t(asc ? "conversation.sortOldest" : "conversation.sortNewest");
        const order = asc ? "asc" : "desc";
        return `<button class="conversation-sort-button" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${asc}" data-sort-order="${order}">${sortOrderIconSvg(order)}</button>`;
      }

      function renderList() {
        state.filtered = state.conversations.slice();
        const sortDir = state.conversationSortOrder === "asc" ? 1 : -1;
        state.filtered.sort((a, b) => {
          if (a.sortTime !== b.sortTime) return sortDir * (a.sortTime - b.sortTime);
          return a.title.localeCompare(b.title, currentCollationLocale());
        });

        if (!state.filtered.length) {
          dom.conversationList.innerHTML = `<div class="empty-list">${escapeHtml(t("import.emptyList"))}</div>`;
          return;
        }

        const groups = new Map();
        for (const conversation of state.filtered) {
          const key = conversation.project || "根目录";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(conversation);
        }

        let html = "";
        let groupIndex = 0;
        for (const [project, conversations] of groups) {
          const sortButton = groupIndex === 0 ? renderConversationSortButton() : "";
          html += `<div class="group"><div class="group-title"><span class="group-title-text">${escapeHtml(project)} · ${conversations.length}</span>${sortButton}</div>`;
          for (const conversation of conversations) {
            const active = conversation.id === state.selectedId ? " active" : "";
            const subtitle = [
              formatListTimestamp(conversation.updatedAt || conversation.createdAt),
              t("turn.count", { count: countConversationTurns(conversation.messages) })
            ].filter(Boolean).join(" · ");
            html += `
              <button class="conversation-item${active}" type="button" data-id="${escapeHtml(conversation.id)}">
                <span class="conversation-title">${escapeHtml(conversation.title)}</span>
                <span class="conversation-subtitle">${escapeHtml(subtitle)}</span>
              </button>
            `;
          }
          html += "</div>";
          groupIndex += 1;
        }
        dom.conversationList.innerHTML = html;
      }

      function hideAssetLibrary() {
        dom.assetLibrary.classList.remove("visible");
        dom.assetLibraryHeaderActions.innerHTML = "";
        dom.assetLibraryContent.innerHTML = "";
      }

      function allImageRecords() {
        return Array.from(state.imageByFullPath.values())
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
      }

      function allFileRecords() {
        return Array.from(state.fileByFullPath.values())
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
      }

      function libraryRecordKey(record) {
        return `${record.kind}:${record.path}`;
      }

      function recordDisplayName(record) {
        return state.libraryNames[libraryRecordKey(record)] || record.name || basename(record.path);
      }

      function assetRecordDisplayName(record) {
        if (!record?.path) return record?.name || "";
        const kind = record.kind || (state.imageByFullPath.has(record.path) ? "image" : "file");
        return state.libraryNames[`${kind}:${record.path}`] || record.name || basename(record.path);
      }

      function libraryAllRecords() {
        return [
          ...allImageRecords().map(record => ({ ...record, kind: "image" })),
          ...allFileRecords().map(record => ({ ...record, kind: "file" }))
        ];
      }

      function getLibraryRecordByKey(key) {
        return libraryAllRecords().find(record => libraryRecordKey(record) === key) || null;
      }

      function selectedLibraryRecords() {
        return Array.from(state.librarySelected)
          .map(key => getLibraryRecordByKey(key))
          .filter(Boolean);
      }

      function pruneLibrarySelection(records = libraryRecords()) {
        const valid = new Set(records.map(record => libraryRecordKey(record)));
        for (const key of Array.from(state.librarySelected)) {
          if (!valid.has(key)) state.librarySelected.delete(key);
        }
      }

      function currentLibraryEmptyMessage() {
        if (state.libraryFilter === "images") return t("library.noMedia");
        if (state.libraryFilter === "files") return t("library.noFiles");
        return t("library.empty");
      }

      function closeLibraryMenus() {
        state.librarySortMenuOpen = false;
      }

      function openLibraryRecord(record) {
        if (!record) return;
        if (record.kind === "image") {
          dom.modalImage.src = record.url;
          dom.modalImage.alt = recordDisplayName(record);
          dom.imageModal.classList.add("visible");
          return;
        }
        const a = document.createElement("a");
        a.href = record.url;
        a.download = recordDisplayName(record);
        a.target = "_blank";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      function downloadSingleLibraryRecord(record) {
        if (!record) return;
        const a = document.createElement("a");
        a.href = record.url;
        a.download = recordDisplayName(record);
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      async function downloadLibraryRecords(records) {
        if (!records.length) return;
        if (records.length === 1) {
          downloadSingleLibraryRecord(records[0]);
          return;
        }
        if (!window.JSZip) {
          records.forEach(openLibraryRecord);
          return;
        }
        const zip = new window.JSZip();
        const usedNames = new Set();
        for (const record of records) {
          const stored = state.assetRecordsByPath.get(record.path);
          if (!stored?.blob) continue;
          const baseName = sanitizeFilename(recordDisplayName(record), record.name || "asset");
          let name = baseName;
          let index = 2;
          while (usedNames.has(name.toLowerCase())) {
            const dot = baseName.lastIndexOf(".");
            name = dot > 0
              ? `${baseName.slice(0, dot)}-${index}${baseName.slice(dot)}`
              : `${baseName}-${index}`;
            index += 1;
          }
          usedNames.add(name.toLowerCase());
          zip.file(name, stored.blob);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, t("library.downloadArchiveName"));
      }

      async function renameLibraryRecord(record) {
        if (!record) return;
        const key = libraryRecordKey(record);
        const result = await openAppDialog({
          title: t("library.renameTitle"),
          copy: t("library.renameCopy"),
          input: true,
          inputLabel: t("library.renamePrompt"),
          value: recordDisplayName(record),
          confirmLabel: t("actions.submit"),
          cancelLabel: t("actions.cancel")
        });
        if (!result?.confirmed) return;
        const next = result.value;
        const clean = sanitizeFilename(next, record.name);
        if (!clean) return;
        if (clean === record.name) delete state.libraryNames[key];
        else state.libraryNames[key] = clean;
        saveLibraryToStorage();
        renderAssetLibrary();
      }

      async function deleteLibraryRecords(records) {
        if (!records.length) return;
        const ok = await confirmAppDialog({
          title: t("library.deleteTitle"),
          copy: t("library.deleteConfirm", { count: records.length }),
          confirmLabel: t("library.delete"),
          cancelLabel: t("actions.cancel"),
          danger: true
        });
        if (!ok) return;
        for (const record of records) {
          const key = libraryRecordKey(record);
          state.librarySelected.delete(key);
          delete state.libraryNames[key];
          state.assetRecordsByPath.delete(record.path);
          if (record.kind === "image") {
            state.imageByFullPath.delete(record.path);
            for (const [groupKey, group] of state.imageGroups) {
              const next = group.filter(item => item.path !== record.path);
              if (next.length) state.imageGroups.set(groupKey, next);
              else state.imageGroups.delete(groupKey);
            }
            state.conversations.forEach(conversation => {
              conversation.messages.forEach(message => {
                if (!Array.isArray(message.images)) return;
                message.images.forEach(image => {
                  if (image.localPath === record.path) {
                    delete image.localUrl;
                    delete image.localPath;
                    delete image.filename;
                  }
                });
              });
            });
          } else {
            state.fileByFullPath.delete(record.path);
            for (const [groupKey, group] of state.fileGroups) {
              const next = group.filter(item => item.path !== record.path);
              if (next.length) state.fileGroups.set(groupKey, next);
              else state.fileGroups.delete(groupKey);
            }
          }
        }
        await saveLibraryToStorage();
        renderAssetLibrary();
      }

      async function handleLibraryBulkAction(action) {
        const records = selectedLibraryRecords();
        if (action === "open") {
          openLibraryRecord(records[0]);
        } else if (action === "download") {
          await downloadLibraryRecords(records);
        } else if (action === "delete") {
          await deleteLibraryRecords(records);
        }
      }

      async function handleLibraryItemAction(action, key) {
        const record = getLibraryRecordByKey(key);
        if (!record) return;
        if (action === "rename") await renameLibraryRecord(record);
        else if (action === "download") await downloadLibraryRecords([record]);
        else if (action === "delete") await deleteLibraryRecords([record]);
      }

      function libraryRecords() {
        const query = state.libraryQuery.trim().toLowerCase();
        const images = allImageRecords().map(record => ({ ...record, kind: "image" }));
        const files = allFileRecords().map(record => ({ ...record, kind: "file" }));
        const records = state.libraryFilter === "images"
          ? images
          : (state.libraryFilter === "files" ? files : [...images, ...files]);
        return records.filter(record => {
          if (!query) return true;
          return [recordDisplayName(record), record.name, record.path, record.relative, record.baseDir, record.mimeType]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(query));
        }).sort((a, b) => {
          if (state.librarySort === "size") return (Number(b.size) || 0) - (Number(a.size) || 0);
          if (state.librarySort === "date") return (Number(b.importedAt) || 0) - (Number(a.importedAt) || 0);
          if (state.librarySort === "type") {
            const type = fileTypeLabel(a.name, a.mimeType).localeCompare(fileTypeLabel(b.name, b.mimeType), state.localeMeta.dateLocale || state.localeCode);
            if (type) return type;
          }
          return recordDisplayName(a).localeCompare(recordDisplayName(b), state.localeMeta.dateLocale || state.localeCode, { numeric: true, sensitivity: "base" });
        });
      }

      function openAssetLibrary(filter = "all") {
        state.activeView = "library";
        state.libraryFilter = filter === "images" || filter === "files" ? filter : "all";
        state.libraryQuery = "";
        pruneLibrarySelection();
        renderAssetLibrary();
      }

      function assetModifiedLabel(record) {
        const time = Number(record.importedAt) || 0;
        return time ? formatListTimestamp(time / 1000) : t("library.uploaded");
      }

      function renderAssetThumb(record) {
        if (record.kind === "image") {
          return `<img src="${escapeHtml(record.url)}" alt="${escapeHtml(record.name)}" loading="lazy">`;
        }
        return `<span class="library-file-icon">${fileIconSvg()}</span>`;
      }

      function renderLibraryHeaderActions() {
        dom.assetLibraryHeaderActions.parentElement?.querySelector(".library-controls")?.remove();
        dom.assetLibraryHeaderActions.innerHTML = `
          <label class="library-search">
            ${searchIconSvg()}
            <input id="librarySearchInput" type="search" value="${escapeHtml(state.libraryQuery)}" placeholder="${escapeHtml(t("library.search"))}">
          </label>
        `;
      }

      function renderLibrarySelectionActions(selectedCount) {
        if (!selectedCount) {
          return `
            <div class="library-tabs" role="tablist">
              <button class="library-tab${state.libraryFilter === "all" ? " active" : ""}" type="button" data-filter="all">${escapeHtml(t("library.all"))}</button>
              <button class="library-tab${state.libraryFilter === "images" ? " active" : ""}" type="button" data-filter="images">${escapeHtml(t("library.images"))}</button>
              <button class="library-tab${state.libraryFilter === "files" ? " active" : ""}" type="button" data-filter="files">${escapeHtml(t("library.files"))}</button>
            </div>
          `;
        }
        return `
            <div class="library-bulk-actions">
              <button class="library-bulk-button primary" type="button" data-bulk-action="open">${openIconSvg()}<span>${escapeHtml(t("library.open"))}</span></button>
              <button class="library-bulk-button" type="button" data-bulk-action="download">${downloadIconSvg()}<span>${escapeHtml(t("library.download"))}</span></button>
              <button class="library-bulk-button danger" type="button" data-bulk-action="delete">${trashIconSvg()}<span>${escapeHtml(t("library.delete"))}</span></button>
            </div>
        `;
      }

      function renderLibrarySortMenu() {
        const options = [
          ["name", t("library.sortByName")],
          ["date", t("library.sortByDate")],
          ["type", t("library.sortByType")],
          ["size", t("library.sortBySize")]
        ];
        return `
          <div class="library-sort-wrap">
            <button class="library-layout-button" type="button" data-sort-toggle title="${escapeHtml(t("library.sort"))}">${sortIconSvg()}</button>
            <div class="library-menu library-sort-menu${state.librarySortMenuOpen ? " visible" : ""}">
              ${options.map(([value, label]) => (
                `<button class="${state.librarySort === value ? "active" : ""}" type="button" data-sort="${escapeHtml(value)}">${checkIconSvg()}<span>${escapeHtml(label)}</span></button>`
              )).join("")}
            </div>
          </div>
        `;
      }

      function renderLibraryControls(selectedCount) {
        return `
          <div class="library-controls">
            ${renderLibrarySelectionActions(selectedCount)}
            <div class="library-control-right">
              ${selectedCount ? `<span class="library-selected-count">${escapeHtml(t("library.selectedCount", { count: selectedCount }))}</span>` : ""}
              ${renderLibrarySortMenu()}
              <span class="library-control-divider" aria-hidden="true"></span>
              <div class="library-layout-toggle" aria-label="${escapeHtml(t("library.layout"))}">
                <button class="library-layout-button${state.libraryLayout === "grid" ? " active" : ""}" type="button" data-layout="grid" title="${escapeHtml(t("library.grid"))}">${gridIconSvg()}</button>
                <button class="library-layout-button${state.libraryLayout === "list" ? " active" : ""}" type="button" data-layout="list" title="${escapeHtml(t("library.list"))}">${listIconSvg()}</button>
              </div>
            </div>
          </div>
        `;
      }

      function renderLibraryGrid(records) {
        return `<div class="library-grid">${records.map(record => {
          const key = libraryRecordKey(record);
          const selected = state.librarySelected.has(key);
          const displayName = recordDisplayName(record);
          return `
            <article class="library-card${selected ? " selected" : ""}" data-asset-key="${escapeHtml(key)}">
              <button class="library-select-toggle" type="button" data-asset-select="${escapeHtml(key)}" aria-label="${escapeHtml(t("library.selectItem", { name: displayName }))}">${selected ? checkIconSvg() : ""}</button>
              <button class="library-card-open" type="button" data-asset-open="${escapeHtml(key)}" title="${escapeHtml(displayName)}">
                <span class="library-card-preview">
                  ${renderAssetThumb(record)}
                  <span class="library-card-overlay" aria-hidden="true">
                    <span class="library-card-name">${escapeHtml(displayName)}</span>
                    <span class="library-card-size">${escapeHtml(formatBytes(record.size))}</span>
                  </span>
                </span>
              </button>
              <div class="library-card-actions">
                <button class="library-item-action" type="button" data-item-action="rename" data-asset-key="${escapeHtml(key)}" title="${escapeHtml(t("library.rename"))}">${editIconSvg()}</button>
                <button class="library-item-action" type="button" data-item-action="download" data-asset-key="${escapeHtml(key)}" title="${escapeHtml(t("library.download"))}">${downloadIconSvg()}</button>
                <button class="library-item-action danger" type="button" data-item-action="delete" data-asset-key="${escapeHtml(key)}" title="${escapeHtml(t("library.delete"))}">${trashIconSvg()}</button>
              </div>
            </article>
          `;
        }).join("")}</div>`;
      }

      function renderLibraryList(records) {
        return `
          <div class="library-table" role="table">
            <div class="library-table-head" role="row">
              <span>${escapeHtml(t("library.name"))}</span>
              <span>${escapeHtml(t("library.modified"))}</span>
              <span>${escapeHtml(t("library.size"))}</span>
            </div>
            ${records.map(record => {
              const key = libraryRecordKey(record);
              const selected = state.librarySelected.has(key);
              const displayName = recordDisplayName(record);
              return `
                <div class="library-row${selected ? " selected" : ""}" role="row" data-asset-key="${escapeHtml(key)}">
                  <span class="library-row-name">
                    <button class="library-select-toggle" type="button" data-asset-select="${escapeHtml(key)}" aria-label="${escapeHtml(t("library.selectItem", { name: displayName }))}">${selected ? checkIconSvg() : ""}</button>
                    <span class="library-row-thumb">${renderAssetThumb(record)}</span>
                    <button class="library-row-open" type="button" data-asset-open="${escapeHtml(key)}">
                      <span>${escapeHtml(displayName)}</span>
                    </button>
                  </span>
                  <span>${escapeHtml(assetModifiedLabel(record))}</span>
                  <span>${escapeHtml(formatBytes(record.size))}</span>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      function renderAssetLibrary() {
        closeSourcePanel();
        dom.emptyState.style.display = "none";
        dom.readerPane.classList.remove("visible");
        dom.turnJump.classList.remove("visible");
        dom.assetLibrary.classList.add("visible");
        dom.assetLibraryTitle.textContent = t("library.title");
        dom.mobileTitle.textContent = t("library.title");
        const images = allImageRecords();
        const files = allFileRecords();
        const records = libraryRecords();
        pruneLibrarySelection(records);
        const selectedCount = state.librarySelected.size;
        dom.assetLibraryMeta.textContent = t("library.summary", { images: images.length, files: files.length });
        renderLibraryHeaderActions();
        dom.assetLibraryHeaderActions.insertAdjacentHTML("afterend", renderLibraryControls(selectedCount));
        dom.assetLibraryContent.innerHTML = `
          ${records.length
            ? (state.libraryLayout === "list" ? renderLibraryList(records) : renderLibraryGrid(records))
            : `<div class="notice">${escapeHtml(currentLibraryEmptyMessage())}</div>`}
        `;
        dom.mediaLibraryButton?.classList.toggle("active", state.activeView === "library");
        closeSidebar();
      }

      function highlightPlain(text, query) {
        const value = escapeHtml(text || "");
        const trimmed = query.trim();
        if (!trimmed) return value;
        const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, "ig");
        return value.replace(pattern, "<mark>$1</mark>");
      }

      function selectConversation(id) {
        const conversation = state.conversations.find(item => item.id === id);
        if (!conversation) return;
        state.activeView = "conversation";
        state.selectedId = id;
        renderList();
        renderConversation(conversation);
        closeSidebar();
      }

      function renderConversation(conversation) {
        dom.emptyState.style.display = "none";
        hideAssetLibrary();
        dom.readerPane.classList.add("visible");
        closeSourcePanel();
        dom.threadTitle.textContent = conversation.title;
        dom.mobileTitle.textContent = conversation.title;
        dom.threadMeta.innerHTML = "";

        if (!conversation.messages.length) {
          state.sourceGroups = [];
          state.turnJumpItems = [];
          state.activeTurnJumpIndex = -1;
          dom.turnJump.classList.remove("visible");
          dom.turnJump.innerHTML = "";
          dom.messages.innerHTML = `<div class="notice">${escapeHtml(t("messages.empty"))}</div>`;
          return;
        }

        const groups = groupMessages(conversation.messages);
        state.sourceGroups = [];
        state.turnJumpItems = buildTurnJumpItems(groups);
        dom.messages.innerHTML = groups
          .map((group, index) => renderMessageGroup(group, index, conversation.baseDir))
          .join("");
        renderTurnJump(state.turnJumpItems);
        highlightElement(dom.messages, state.query);
        dom.mainScroll.scrollTop = 0;
        requestAnimationFrame(updateTurnJumpActive);
      }

      function roleLabel(role) {
        if (role === "user") return "U";
        if (role === "tool") return "T";
        return "A";
      }

      function copyIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" stroke-width="1.8"></rect><path d="M5 15V7a2 2 0 0 1 2-2h8" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      }

      function plainTextFromHtml(html) {
        const template = document.createElement("template");
        template.innerHTML = html;
        return template.content.textContent || "";
      }

      function sidebarIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3" stroke-width="1.8"></rect><path d="M10 6v12" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      }

      function importIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4.75h7.2L17 7.55v11.7H7V4.75Z" stroke-width="1.7" stroke-linejoin="round"></path><path d="M14 4.75V8h3" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 10.5v5" stroke-width="1.8" stroke-linecap="round"></path><path d="m9.7 13.2 2.3 2.3 2.3-2.3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      }

      function searchIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6" stroke-width="1.8"></circle><path d="M16 16l4 4" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      }

      function chatBubbleIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8.5A3.5 3.5 0 0 1 8.5 5h7A3.5 3.5 0 0 1 19 8.5v4a3.5 3.5 0 0 1-3.5 3.5H11l-4 3v-3.3A3.5 3.5 0 0 1 5 12.5v-4Z" stroke-width="1.8" stroke-linejoin="round"></path></svg>';
      }

      function sortOrderIconSvg(order) {
        if (order === "asc") {
          return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5" stroke-width="1.8" stroke-linecap="round"></path><path d="M6 11l6-6 6 6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
        }
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14" stroke-width="1.8" stroke-linecap="round"></path><path d="M6 13l6 6 6-6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      }

      function mediaIconSvg() {
        return '<svg class="library-icon" viewBox="0 0 20 20" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" aria-hidden="true"><path d="M14.402 2.648a2.2 2.2 0 0 1 2.547 1.783l1.782 10.11a2.2 2.2 0 0 1-1.782 2.547l-1.494.263a2.2 2.2 0 0 1-2.547-1.782l-.856-4.86v4.424a2.2 2.2 0 0 1-2.199 2.199H8.337a2.2 2.2 0 0 1-1.534-.626 2.2 2.2 0 0 1-1.533.626H3.754a2.2 2.2 0 0 1-2.199-2.199V4.867c0-1.214.985-2.198 2.199-2.198H5.27a2.2 2.2 0 0 1 1.533.624 2.2 2.2 0 0 1 1.534-.624h1.516c.746 0 1.405.372 1.802.94.317-.354.75-.608 1.254-.697zm1.237 2.014a.87.87 0 0 0-1.005-.704l-1.495.263a.87.87 0 0 0-.704 1.006l1.784 10.11a.87.87 0 0 0 1.005.705l1.494-.264a.867.867 0 0 0 .704-1.005zM3.754 3.999a.87.87 0 0 0-.868.868v10.266c0 .48.388.869.868.869H5.27c.48 0 .868-.39.868-.869V4.867a.87.87 0 0 0-.868-.868zm4.583 0a.87.87 0 0 0-.868.868v10.266c0 .48.388.868.868.869h1.516c.48 0 .868-.39.868-.869V4.867a.87.87 0 0 0-.868-.868z"></path></svg>';
      }

      function gridIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="5" width="5" height="5" rx="1" stroke-width="1.8"></rect><rect x="14" y="5" width="5" height="5" rx="1" stroke-width="1.8"></rect><rect x="5" y="14" width="5" height="5" rx="1" stroke-width="1.8"></rect><rect x="14" y="14" width="5" height="5" rx="1" stroke-width="1.8"></rect></svg>';
      }

      function listIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6h11M8 12h11M8 18h11" stroke-width="1.8" stroke-linecap="round"></path><path d="M5 6h.01M5 12h.01M5 18h.01" stroke-width="2.4" stroke-linecap="round"></path></svg>';
      }

      function checkIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      }

      function openIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 12h8M12 8v8" stroke-width="1.8" stroke-linecap="round"></path><path d="M5 8.5A3.5 3.5 0 0 1 8.5 5h7A3.5 3.5 0 0 1 19 8.5v7a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 15.5v-7Z" stroke-width="1.8"></path></svg>';
      }

      function editIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19l4.2-1 8.6-8.6a2.1 2.1 0 0 0-3-3L6.2 15 5 19Z" stroke-width="1.8" stroke-linejoin="round"></path><path d="M13.8 7.4l2.8 2.8" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      }

      function trashIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 7h12M9 7V5h6v2M9 10v7M15 10v7M7 7l1 12h8l1-12" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      }

      function sortIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M8 12h8M11 17h2" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      }

      function clearIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 7h12M9 7V5h6v2M9 10v7M15 10v7M7 7l1 12h8l1-12" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      }

      function settingsIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke-width="1.8"></circle><path d="M19 12a7.7 7.7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.1 7.1 0 0 0-2-1.2L14.2 3h-4.4l-.3 2.7a7.1 7.1 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7.7 7.7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.1 7.1 0 0 0 2 1.2l.3 2.7h4.4l.3-2.7a7.1 7.1 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" stroke-width="1.5" stroke-linejoin="round"></path></svg>';
      }

      function fileIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4.75h7.2L17 7.55v11.7H7V4.75Z" stroke-width="1.7" stroke-linejoin="round"></path><path d="M14 4.75V8h3" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9.5 12h5M9.5 15h3.5" stroke-width="1.7" stroke-linecap="round"></path></svg>';
      }

      function downloadIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v10" stroke-width="1.8" stroke-linecap="round"></path><path d="M8 10l4 4 4-4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5 19h14" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      }

      function shareIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4" stroke-width="1.8" stroke-linecap="round"></path><path d="M8 8l4-4 4 4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="M6 13v4.25A2.75 2.75 0 0 0 8.75 20h6.5A2.75 2.75 0 0 0 18 17.25V13" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      }

      function globeIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-width="1.8"></circle><path d="M4.5 12h15M12 4c2 2.2 3 4.8 3 8s-1 5.8-3 8M12 4c-2 2.2-3 4.8-3 8s1 5.8 3 8" stroke-width="1.4" stroke-linecap="round"></path></svg>';
      }

      function setupSidebarControls() {
        const openSidebarLabel = t("aria.openSidebar");
        const closeSidebarLabel = t("aria.closeSidebar");
        const importLabel = t("actions.importZip");
        const searchLabel = t("actions.search");
        const mediaLabel = t("actions.mediaLibrary");
        const settingsLabel = t("actions.settings");
        dom.collapseSidebarButton.innerHTML = sidebarIconSvg();
        dom.collapseSidebarButton.title = closeSidebarLabel;
        dom.collapseSidebarButton.setAttribute("aria-label", closeSidebarLabel);
        dom.expandSidebarButton.innerHTML = sidebarIconSvg();
        dom.expandSidebarButton.title = openSidebarLabel;
        dom.expandSidebarButton.setAttribute("aria-label", openSidebarLabel);
        dom.expandSidebarButton.dataset.tooltip = openSidebarLabel;
        dom.chooseZipButton.innerHTML = `${importIconSvg()}<span>${escapeHtml(importLabel)}</span>`;
        dom.searchButton.innerHTML = `${searchIconSvg()}<span>${escapeHtml(searchLabel)}</span>`;
        dom.mediaLibraryButton.innerHTML = `${mediaIconSvg()}<span>${escapeHtml(mediaLabel)}</span>`;
        dom.settingsButton.innerHTML = `${settingsIconSvg()}<span>${escapeHtml(settingsLabel)}</span>`;
        dom.railChooseZipButton.innerHTML = importIconSvg();
        dom.railChooseZipButton.title = importLabel;
        dom.railChooseZipButton.setAttribute("aria-label", importLabel);
        dom.railChooseZipButton.dataset.tooltip = importLabel;
        dom.railSearchButton.innerHTML = searchIconSvg();
        dom.railSearchButton.title = searchLabel;
        dom.railSearchButton.setAttribute("aria-label", searchLabel);
        dom.railSearchButton.dataset.tooltip = searchLabel;
        dom.railMediaLibraryButton.innerHTML = mediaIconSvg();
        dom.railMediaLibraryButton.title = mediaLabel;
        dom.railMediaLibraryButton.setAttribute("aria-label", mediaLabel);
        dom.railMediaLibraryButton.dataset.tooltip = mediaLabel;
        dom.railSettingsButton.innerHTML = settingsIconSvg();
        dom.railSettingsButton.title = settingsLabel;
        dom.railSettingsButton.setAttribute("aria-label", settingsLabel);
        dom.railSettingsButton.dataset.tooltip = settingsLabel;
        dom.searchModalIcon.innerHTML = searchIconSvg();
        dom.mobilePdfButton.innerHTML = shareIconSvg();
        dom.mobilePdfButton.title = t("actions.exportPdf");
        dom.mobilePdfButton.setAttribute("aria-label", t("actions.exportPdf"));
        dom.exportPdfButton.innerHTML = shareIconSvg();
        dom.exportPdfButton.title = t("actions.exportPdf");
        dom.exportPdfButton.setAttribute("aria-label", t("actions.exportPdf"));
      }

      function groupMessages(messages) {
        const groups = [];
        for (const message of messages) {
          const role = message.role === "user" ? "user" : "assistant";
          const prev = groups[groups.length - 1];
          if (prev && prev.role === role) {
            prev.messages.push(message);
            continue;
          }
          groups.push({ role, messages: [message] });
        }
        return groups.map(group => ({
          ...group,
          copyText: group.messages.map(message => message.content || "").filter(Boolean).join("\n\n"),
          copyImage: group.messages
            .flatMap(message => Array.isArray(message.images) ? message.images : [])
            .find(image => image.localUrl || image.url) || null
        }));
      }

      function countConversationTurns(messages) {
        const groups = groupMessages(Array.isArray(messages) ? messages : []);
        const userTurns = groups.filter(group => group.role === "user").length;
        return userTurns || groups.length;
      }

      function renderMessageGroup(group, groupIndex, baseDir) {
        const role = group.role;
        const rendered = group.messages.map(message => renderMessageContent(message, baseDir));
        const renderedMessages = rendered.map(item => item.html).join("");
        const sources = mergeSources(rendered.flatMap(item => item.sources));
        sources.forEach(source => { source.baseDir = source.baseDir || baseDir || ""; });
        state.sourceGroups[groupIndex] = sources;
        const canCopy = group.copyText.trim() || group.copyImage;
        const copyLabel = group.copyText.trim() ? t("messages.copy") : t("image.copy");
        const copyButton = canCopy
          ? `<button class="mini-button copy-message" type="button" data-group-index="${groupIndex}" title="${copyLabel}" aria-label="${copyLabel}">${copyIconSvg()}</button>`
          : "";
        const sourceButton = sources.length ? renderSourceButton(sources, groupIndex) : "";
        const actionBar = `<div class="message-actions">
          ${copyButton}
          ${sourceButton}
        </div>`;

        return `
          <article class="message ${role}" data-group-index="${groupIndex}">
            <div class="message-inner">
              <div class="message-body">
                ${renderedMessages}
                ${actionBar}
              </div>
            </div>
          </article>
        `;
      }

      function messagePreview(message) {
        const text = plainTextFromHtml(renderInline(
          cleanMessageContent(message?.content || "")
            .replace(/<!--\s*(?:image|file):[^>]+-->/g, " ")
            .replace(/\[[^\]]+\]\[[0-9]+\]/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
          ""
        )).replace(/\s+/g, " ").trim();
        return text || (message?.role === "user" ? t("messages.userFallback") : t("messages.assistantFallback"));
      }

      function buildTurnJumpItems(groups) {
        const items = [];
        groups.forEach((group, groupIndex) => {
          if (group.role !== "user") return;
          const preview = messagePreview(group.messages[0]);
          items.push({
            groupIndex,
            label: preview.length > 34 ? `${preview.slice(0, 34)}...` : preview
          });
        });
        return items.length >= 5 ? items : [];
      }

      function renderTurnJump(items) {
        state.turnJumpItems = items || [];
        state.activeTurnJumpIndex = state.turnJumpItems.length ? 0 : -1;
        if (!state.turnJumpItems.length) {
          dom.turnJump.classList.remove("visible");
          dom.turnJump.innerHTML = "";
          return;
        }
        const ticks = state.turnJumpItems
          .map((item, index) => `<span class="turn-jump-tick${index === 0 ? " active" : ""}" data-turn-index="${index}"></span>`)
          .join("");
        const list = state.turnJumpItems
          .map((item, index) => `<button class="turn-jump-item${index === 0 ? " active" : ""}" type="button" data-turn-index="${index}" data-group-index="${item.groupIndex}" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`)
          .join("");
        dom.turnJump.innerHTML = `
          <div class="turn-jump-rail" aria-hidden="true">${ticks}</div>
          <div class="turn-jump-popover" role="list">${list}</div>
        `;
        dom.turnJump.classList.add("visible");
      }

      function setTurnJumpActive(index) {
        if (!state.turnJumpItems.length) return;
        const bounded = Math.max(0, Math.min(index, state.turnJumpItems.length - 1));
        if (state.activeTurnJumpIndex === bounded) return;
        state.activeTurnJumpIndex = bounded;
        dom.turnJump.querySelectorAll(".turn-jump-tick").forEach((node, i) => {
          node.classList.toggle("active", i === bounded);
        });
        dom.turnJump.querySelectorAll(".turn-jump-item").forEach((node, i) => {
          node.classList.toggle("active", i === bounded);
        });
      }

      function updateTurnJumpActive() {
        if (!state.turnJumpItems.length || !dom.turnJump.classList.contains("visible")) return;
        const viewportTop = dom.mainScroll.scrollTop + 96;
        let activeIndex = 0;
        for (let i = 0; i < state.turnJumpItems.length; i++) {
          const groupIndex = state.turnJumpItems[i].groupIndex;
          const target = Array.from(dom.messages.querySelectorAll(".message"))
            .find(node => node.dataset.groupIndex === String(groupIndex));
          if (target && target.offsetTop <= viewportTop) {
            activeIndex = i;
          } else if (target) {
            break;
          }
        }
        setTurnJumpActive(activeIndex);
      }

      function scrollToMessageGroup(groupIndex) {
        const target = Array.from(dom.messages.querySelectorAll(".message"))
          .find(node => node.dataset.groupIndex === String(groupIndex));
        if (!target) return;
        const activeIndex = state.turnJumpItems.findIndex(item => String(item.groupIndex) === String(groupIndex));
        if (activeIndex >= 0) setTurnJumpActive(activeIndex);
        const scrollTop = target.offsetTop - 72;
        dom.mainScroll.scrollTo({ top: Math.max(0, scrollTop), behavior: "smooth" });
      }

      function scheduleTurnJumpActiveUpdate() {
        if (state.turnJumpScrollFrame) return;
        state.turnJumpScrollFrame = requestAnimationFrame(() => {
          state.turnJumpScrollFrame = 0;
          updateTurnJumpActive();
        });
      }

      function renderMessageContent(message, baseDir) {
        const content = message.content || "";
        const messageFiles = Array.isArray(message.files) ? message.files : [];
        const messageFootnotes = Array.isArray(message.footnotes)
          ? message.footnotes.map(note => resolveMessageFootnote(note, baseDir, messageFiles))
          : [];
        const referencedPointers = new Set();
        const referencedFiles = new Set();
        const placeholderFiles = [];
        let markdown = content.replace(/<!--\s*image:([^>]+?)\s*-->/g, (_, pointer) => {
          const image = Array.isArray(message.images)
            ? message.images.find(item => String(item.asset_pointer) === pointer.trim())
            : null;
          if (!image?.localUrl) return "";
          referencedPointers.add(image.asset_pointer);
          const alt = image.dispositionLabel || image.filename || "image";
          return `\n\n![${alt}](${image.localUrl})\n`;
        });
        markdown = markdown.replace(/<!--\s*file:([^>]+?)\s*-->/g, (_, encodedKey) => {
          const key = decodeURIComponentSafe(encodedKey.trim());
          const file = messageFiles.find(item => fileReferenceKeys(item).includes(key)) || { key, filename: key, label: key };
          referencedFiles.add(file);
          if (!placeholderFiles.includes(file)) placeholderFiles.push(file);
          return "\n";
        });

        if (messageFootnotes.length > 0) {
          markdown += "\n\n" + messageFootnotes
            .slice()
            .sort((a, b) => a.index - b.index)
            .filter(note => note.url)
            .map(note => `[${note.index}]: ${note.url}${note.title ? ` "${note.title}"` : ""}`)
            .join("\n");
        }

        const leftoverImages = Array.isArray(message.images)
          ? message.images.filter(image => image.localUrl && !referencedPointers.has(image.asset_pointer))
          : [];

        const imageGrid = leftoverImages.length
          ? `<div class="image-grid">${leftoverImages.map(renderImageFrame).join("")}</div>`
          : "";
        const displayFiles = messageFiles
          .filter(file => referencedFiles.has(file) || !String(file.source || "").split(",").every(source => source === "content_reference"));
        placeholderFiles.forEach(file => {
          if (!displayFiles.includes(file)) displayFiles.push(file);
        });
        const fileList = displayFiles.length
          ? `<div class="attachment-stack">${displayFiles.map(file => renderFileMarkdownLink(file, baseDir, messageFiles)).join("")}</div>`
          : "";
        const renderedMarkdown = renderMarkdown(markdown, baseDir);
        const textBubble = renderedMarkdown
          ? `<div class="bubble"><div class="markdown">${renderedMarkdown}</div></div>`
          : "";
        return {
          html: `
            ${fileList}
            ${textBubble}
            ${imageGrid}
          `,
          sources: mergeSources([...messageFootnotes, ...extractFootnotesFromMarkdown(markdown)])
        };
      }

      function renderFileMarkdownLink(file, baseDir, files) {
        return renderFileAttachmentCard(file, baseDir, files);
      }

      function renderMarkdownFileCard(label, src, baseDir) {
        const link = resolveMarkdownLink(src, baseDir);
        const record = link.record || (link.path ? state.fileByFullPath.get(link.path) : null);
        if (!link.href || !record) return "";
        return renderFileAttachmentCard({
          label: decodeHtmlEntities(label) || record.name,
          filename: record.name,
          path: record.path,
          aliases: [record.name, record.path]
        }, baseDir, []);
      }

      function fileTypeLabel(name, contentType = "") {
        const ext = extension(name);
        if (ext === "doc" || ext === "docx") return t("file.document");
        if (ext === "pdf") return t("file.pdf");
        if (ext === "xls" || ext === "xlsx" || ext === "csv") return t("file.sheet");
        if (ext === "ppt" || ext === "pptx") return t("file.presentation");
        if (ext === "txt" || ext === "md") return t("file.text");
        if (ext === "zip" || ext === "rar" || ext === "7z") return t("file.archive");
        if (ext) return ext.toUpperCase();
        const type = String(contentType || "").split(";")[0].split("/").pop();
        return type ? type.toUpperCase() : t("file.generic");
      }

      function renderFileAttachmentCard(file, baseDir, files = []) {
        const keys = fileReferenceKeys(file);
        const directPath = file?.path || file?.localPath || "";
        const directRecord = directPath ? state.fileByFullPath.get(normalizeZipPath(directPath)) : null;
        const record = directRecord || keys
          .map(key => findFileRecordForReference(key, baseDir, files))
          .find(Boolean);
        const recordName = record ? assetRecordDisplayName(record) : "";
        const name = recordName || file.label || file.filename || record?.name || t("file.generic");
        if (!record) {
          return `<span class="file-attachment-card" title="${escapeHtml(name)}"><span class="file-attachment-icon">${fileIconSvg()}</span><span class="file-attachment-body"><span class="file-attachment-name">${escapeHtml(name)}</span><span class="file-attachment-meta">${escapeHtml(t("file.missing"))}</span></span></span>`;
        }
        const href = escapeHtml(record.url);
        const download = escapeHtml(recordName || record.name || basename(record.path));
        const meta = fileTypeLabel(record.name || name, file.content_type);
        return `<a class="file-attachment-card" href="${href}" target="_blank" rel="noreferrer" download="${download}" title="${escapeHtml(name)}"><span class="file-attachment-icon">${fileIconSvg()}</span><span class="file-attachment-body"><span class="file-attachment-name">${escapeHtml(name)}</span><span class="file-attachment-meta">${escapeHtml(meta)}</span></span><span class="file-attachment-download" aria-hidden="true">${downloadIconSvg()}</span></a>`;
      }

      function resolveMessageFootnote(note, baseDir, files) {
        const fileKey = localFileRefKey(note?.url);
        if (!fileKey) return note;
        const record = findFileRecordForReference(fileKey, baseDir, files);
        if (!record) return { ...note, url: "" };
        return {
          ...note,
          url: record.relative || `files/${record.name}`,
          title: note.title || assetRecordDisplayName(record),
          label: note.label || note.title || assetRecordDisplayName(record),
          download: assetRecordDisplayName(record),
          localPath: record.path
        };
      }

      function renderImageFrame(image) {
        const src = safeUrl(image.localUrl || image.url || "");
        if (!src) return "";
        const caption = image.dispositionLabel || image.filename || basename(image.localPath || "") || "image";
        const escapedSrc = escapeHtml(src);
        const escapedCaption = escapeHtml(caption);
        return `
          <div class="image-item">
            <button class="image-frame" type="button" data-image-src="${escapedSrc}" data-image-alt="${escapedCaption}">
              <img src="${escapedSrc}" alt="${escapedCaption}" loading="lazy">
            </button>
          </div>
        `;
      }

      function extractFootnotesFromMarkdown(markdown) {
        const footnotePattern = /^\[(\d+)\]:\s+(\S+)(?:\s+"([\s\S]+)")?\s*$/;
        return String(markdown || "")
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map(line => line.match(footnotePattern))
          .filter(Boolean)
          .map(match => ({
            index: match[1],
            url: match[2],
            title: match[3] || "",
            label: match[3] || sourceHost(match[2]) || match[2]
          }));
      }

      function mergeSources(sources) {
        const merged = [];
        const seen = new Set();
        for (const source of sources || []) {
          if (!source) continue;
          const url = source.url || "";
          const title = source.title || source.label || "";
          if (!url && !title) continue;
          const key = url || title;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({
            ...source,
            index: merged.length + 1,
            url,
            title,
            label: source.label || title || sourceHost(url) || url
          });
        }
        return merged;
      }

      function renderMarkdown(markdown, baseDir) {
        const lines = cleanMessageContent(markdown).replace(/\r\n?/g, "\n").split("\n");
        const html = [];
        let paragraph = [];
        let list = null;
        let orderedListNext = 1;
        let blockquote = [];
        let inCode = false;
        let codeLang = "";
        let codeLines = [];
        const footnotePattern = /^\[(\d+)\]:\s+(\S+)(?:\s+"([\s\S]+)")?\s*$/;
        const footnotes = [];
        const footnoteByIndex = new Map();

        for (const line of lines) {
          const match = line.match(footnotePattern);
          if (!match || footnoteByIndex.has(match[1])) continue;
          const footnote = {
            index: match[1],
            url: match[2],
            title: match[3] || ""
          };
          footnotes.push(footnote);
          footnoteByIndex.set(footnote.index, footnote);
        }

        const flushParagraph = () => {
          if (!paragraph.length) return;
          html.push(`<p>${renderInline(paragraph.join("\n"), baseDir, footnoteByIndex)}</p>`);
          paragraph = [];
        };
        const flushList = () => {
          if (!list) return;
          const start = list.type === "ol" && list.start > 1 ? ` start="${list.start}"` : "";
          html.push(`<${list.type}${start}>${list.items.map(item => `<li>${renderInline(item, baseDir, footnoteByIndex)}</li>`).join("")}</${list.type}>`);
          list = null;
        };
        const flushBlockquote = () => {
          if (!blockquote.length) return;
          html.push(`<blockquote>${renderMarkdown(blockquote.join("\n"), baseDir)}</blockquote>`);
          blockquote = [];
        };
        const flushCode = () => {
          const code = codeLines.join("\n");
          const lang = codeLang || "text";
          html.push(`
            <div class="code-block">
              <div class="code-toolbar"><span>${escapeHtml(lang)}</span><button class="code-copy" type="button">${escapeHtml(t("code.copy"))}</button></div>
              <pre><code>${escapeHtml(code)}</code></pre>
            </div>
          `);
          codeLines = [];
          codeLang = "";
        };
        const parseDivAttrs = attrString => {
          const attrs = {};
          if (!attrString) return attrs;
          const re = /(\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s}]+)/g;
          let m;
          while ((m = re.exec(attrString))) {
            let v = m[2];
            if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
              v = v.slice(1, -1);
            }
            attrs[m[1]] = v;
          }
          return attrs;
        };
        const collectFencedDivLines = (lines, startIndex) => {
          const content = [];
          let depth = 1;
          let inCode = false;
          let codeMarker = null;
          for (let i = startIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const codeFence = line.match(/^(`{3,}|~{3,})/);
            if (codeFence) {
              if (!inCode) {
                inCode = true;
                codeMarker = codeFence[1][0];
              } else if (codeMarker && line[0] === codeMarker) {
                inCode = false;
                codeMarker = null;
              }
              content.push(line);
              continue;
            }
            if (inCode) {
              content.push(line);
              continue;
            }
            if (/^:{3,}\s*\S/.test(line) && !/^:{3,}\s*$/.test(line)) {
              depth++;
              content.push(line);
              continue;
            }
            if (/^:{3,}\s*$/.test(line)) {
              depth--;
              if (depth === 0) return { content, endIndex: i };
              content.push(line);
              continue;
            }
            content.push(line);
          }
          return { content, endIndex: lines.length - 1 };
        };
        const renderFencedDiv = (className, attrString, inner, rawText) => {
          const classes = ["md-div"];
          const safeClass = String(className || "").replace(/[^a-zA-Z0-9_-]/g, "");
          if (safeClass) classes.push(`md-div--${safeClass}`);
          const attrs = parseDivAttrs(attrString);
          const safeVariant = String(attrs.variant || "").replace(/[^a-zA-Z0-9_-]/g, "");
          if (safeVariant) classes.push(`md-div--variant-${safeVariant}`);
          const dataId = attrs.id ? ` data-div-id="${escapeHtml(attrs.id)}"` : "";
          const copyLabel = t("block.copy");
          const copyData = encodeURIComponent(rawText || "");
          const copyButton = `<button class="md-div-copy" type="button" title="${escapeHtml(copyLabel)}" aria-label="${escapeHtml(copyLabel)}" data-div-copy="${escapeHtml(copyData)}">${copyIconSvg()}</button>`;
          return `<div class="${classes.join(" ")}"${dataId}>${copyButton}${inner}</div>`;
        };
        const parseTableRow = line => {
          const trimmed = line.trim();
          if (!trimmed.includes("|")) return null;
          const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
          const cells = normalized.split("|").map(cell => cell.trim());
          return cells.length > 1 ? cells : null;
        };
        const isTableDivider = line => {
          const cells = parseTableRow(line);
          return Boolean(cells && cells.every(cell => /^:?-{3,}:?$/.test(cell)));
        };
        const tableAlignments = line => {
          const cells = parseTableRow(line) || [];
          return cells.map(cell => {
            const left = cell.startsWith(":");
            const right = cell.endsWith(":");
            if (left && right) return "center";
            if (right) return "right";
            return "";
          });
        };
        const tableCellClass = align => align ? ` class="align-${align}"` : "";
        const tableColgroup = count => {
          if (!count) return "";
          return `<colgroup>${Array.from({ length: count }, (_, index) => `<col class="${index === 0 ? "table-col-label" : "table-col-data"}">`).join("")}</colgroup>`;
        };
        const flushTable = tableRows => {
          if (!tableRows.length) return;
          const hasHeader = tableRows.length > 1 && isTableDivider(tableRows[1]);
          const headerCells = parseTableRow(tableRows[0]) || [];
          const alignments = hasHeader ? tableAlignments(tableRows[1]) : [];
          const bodyRows = hasHeader ? tableRows.slice(2) : tableRows;
          const columnCount = Math.max(headerCells.length, ...bodyRows.map(row => (parseTableRow(row) || []).length));
          let table = `<table>${tableColgroup(columnCount)}`;
          if (hasHeader) {
            table += `<thead><tr>${headerCells.map((cell, index) => `<th${tableCellClass(alignments[index])}>${renderInline(cell, baseDir, footnoteByIndex)}</th>`).join("")}</tr></thead>`;
          }
          table += "<tbody>";
          for (const row of bodyRows) {
            const cells = parseTableRow(row);
            if (!cells) continue;
            table += `<tr>${cells.map((cell, index) => `<td${tableCellClass(alignments[index])}>${renderInline(cell, baseDir, footnoteByIndex)}</td>`).join("")}</tr>`;
          }
          table += "</tbody></table>";
          const copyText = [hasHeader ? headerCells : null, ...bodyRows.map(row => parseTableRow(row))]
            .filter(Boolean)
            .map(cells => cells.map(cell => plainTextFromHtml(renderInline(cell, baseDir, footnoteByIndex)).trim()).join("\t"))
            .join("\n");
          const encodedCopyText = encodeURIComponent(copyText);
          html.push(`
            <div class="table-wrap">
              <div class="table-scroll">
                <div class="table-toolbar">
                  <button class="table-copy" type="button" title="${escapeHtml(t("table.copy"))}" aria-label="${escapeHtml(t("table.copy"))}" data-table-copy="${escapeHtml(encodedCopyText)}">${copyIconSvg()}</button>
                </div>
                ${table}
              </div>
            </div>
          `);
        };
        const flushAll = () => {
          flushParagraph();
          flushList();
          flushBlockquote();
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const fence = line.match(/^```([\w#+.-]*)\s*$/);
          if (fence) {
            if (inCode) {
              flushCode();
              inCode = false;
            } else {
              flushAll();
              inCode = true;
              codeLang = fence[1] || "text";
            }
            continue;
          }
          if (inCode) {
            codeLines.push(line);
            continue;
          }

          const divOpen = line.match(/^(:{3,})\s*(?:([^\s{]+)\s*)?(?:\{([^}]*)\})?\s*$/);
          if (divOpen && (divOpen[2] || divOpen[3])) {
            flushAll();
            const collected = collectFencedDivLines(lines, i);
            const rawText = collected.content.join("\n").trim();
            const inner = renderMarkdown(rawText, baseDir);
            html.push(renderFencedDiv(divOpen[2], divOpen[3], inner, rawText));
            i = collected.endIndex;
            continue;
          }

          const footnoteMatch = line.match(footnotePattern);
          if (footnoteMatch) {
            flushAll();
            continue;
          }

          if (/^\s*<!--[\s\S]*-->\s*$/.test(line)) {
            flushAll();
            continue;
          }

          if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            flushAll();
            html.push('<hr class="markdown-divider">');
            continue;
          }

          if (!line.trim()) {
            flushParagraph();
            flushBlockquote();
            if (list) continue;
            continue;
          }

          const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
          if (imageMatch) {
            flushAll();
            const src = resolveMarkdownImageUrl(imageMatch[2], baseDir);
            if (src) {
              html.push(renderImageFrame({ localUrl: src, dispositionLabel: imageMatch[1] || "image" }));
            }
            continue;
          }

          const fileLinkMatch = line.trim().match(/^(?:[-*+]\s+)?\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/);
          if (fileLinkMatch) {
            const fileCard = renderMarkdownFileCard(fileLinkMatch[1], fileLinkMatch[2], baseDir);
            if (fileCard) {
              flushAll();
              html.push(`<div class="attachment-stack">${fileCard}</div>`);
              continue;
            }
          }

          const row = parseTableRow(line);
          if (row && parseTableRow(lines[i + 1] || "")) {
            flushAll();
            const tableRows = [line];
            let nextIndex = i + 1;
            while (nextIndex < lines.length && parseTableRow(lines[nextIndex])) {
              tableRows.push(lines[nextIndex]);
              nextIndex += 1;
            }
            flushTable(tableRows);
            i = nextIndex - 1;
            continue;
          }

          const heading = line.match(/^(#{1,4})\s+(.+)$/);
          if (heading) {
            flushAll();
            const level = heading[1].length;
            html.push(`<h${level}>${renderInline(heading[2], baseDir, footnoteByIndex)}</h${level}>`);
            continue;
          }

          const quote = line.match(/^>\s?(.*)$/);
          if (quote) {
            flushParagraph();
            flushList();
            blockquote.push(quote[1]);
            continue;
          }

          const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
          const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
          if (unordered || ordered) {
            flushParagraph();
            flushBlockquote();
            const type = unordered ? "ul" : "ol";
            const markerNumber = ordered ? Number(ordered[1]) : 0;
            const itemNumber = ordered
              ? (markerNumber === 1 && orderedListNext > 1 ? orderedListNext : markerNumber || orderedListNext)
              : 0;
            if (!list || list.type !== type) {
              flushList();
              list = { type, items: [], start: type === "ol" ? itemNumber : 0 };
            }
            list.items.push(unordered ? unordered[1] : ordered[2]);
            if (ordered) orderedListNext = itemNumber + 1;
            continue;
          }

          flushList();
          flushBlockquote();
          paragraph.push(line);
        }

        if (inCode) flushCode();
        flushAll();
        return html.join("");
      }

      function renderSourceButton(sources, groupIndex) {
        const count = sources.length > 1 ? `<span class="source-button-count">+${sources.length - 1}</span>` : "";
        const icon = renderSourceButtonIcon(sources);
        const label = t("source.view");
        return `
          <button class="mini-button source-button" type="button" data-group-index="${groupIndex}" aria-expanded="false" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
            ${icon}
            <span class="source-button-label">${escapeHtml(t("source.title"))}</span>
            ${count}
          </button>
        `;
      }

      function sourceKind(source) {
        const link = resolveMarkdownLink(source?.url || "", source?.baseDir || "");
        if (link.local || localFileRefKey(source?.url || "")) return "file";
        return "web";
      }

      function renderSourceButtonIcon(sources) {
        const kinds = sources.map(sourceKind);
        const hasWeb = kinds.includes("web");
        const hasFile = kinds.includes("file");
        const icons = [];
        if (hasWeb) icons.push(`<span class="source-dot-icon web">${globeIconSvg()}</span>`);
        if (hasFile) icons.push(`<span class="source-dot-icon file">${fileIconSvg()}</span>`);
        const mixed = icons.length > 1 ? " mixed" : "";
        return `<span class="source-dot${mixed}" aria-hidden="true">${icons.join("")}</span>`;
      }

      function sourceHost(url) {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch (_) {
          return "";
        }
      }

      function renderInline(text, baseDir, footnoteByIndex = new Map()) {
        let output = escapeHtml(text);
        const footnoteRefs = [];
        const makeFootnoteRef = (index, label = "") => {
          const token = `\u0000FN${footnoteRefs.length}\u0000`;
          const note = footnoteByIndex.get(String(index));
          const link = note?.url ? resolveMarkdownLink(note.url, baseDir) : { href: "", download: "" };
          const chipLabel = label || note?.title || sourceHost(note?.url || "") || t("source.fallback");
          footnoteRefs.push(citationChip(link.href, chipLabel, link.download || note?.download || ""));
          return token;
        };

        output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
          const url = resolveMarkdownImageUrl(src, baseDir);
          if (!url) return "";
          return renderImageFrame({ localUrl: url, dispositionLabel: alt || "image" });
        });

        output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, url) => {
          const link = resolveMarkdownLink(url, baseDir);
          if (!link.href) return label;
          if (link.local && link.record && state.fileByFullPath.has(link.record.path)) {
            return renderMarkdownFileCard(label, url, baseDir);
          }
          const download = link.download ? ` download="${escapeHtml(link.download)}"` : "";
          return `<a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer"${download}>${label}</a>`;
        });

        output = output.replace(/\s*\(\[([^\]]+)\]\[(\d+)\]\)/g, (_, label, index) => makeFootnoteRef(index, label));
        output = output.replace(/\[([^\]]+)\]\[(\d+)\]/g, (_, label, index) => makeFootnoteRef(index, label));

        output = output.replace(/\[(\d+)\]/g, (_, index) => makeFootnoteRef(index));

        output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
        output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        output = output.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
        output = output.replace(/\n/g, "<br>");
        footnoteRefs.forEach((ref, index) => {
          output = output.split(`\u0000FN${index}\u0000`).join(ref);
        });
        return output;
      }

      function citationChip(href, label, download = "") {
        const text = escapeHtml(label || t("source.fallback"));
        const body = `${globeIconSvg()}<span class="citation-text">${text}</span>`;
        const downloadAttr = download ? ` download="${escapeHtml(download)}"` : "";
        return href
          ? `<a class="citation-chip" href="${escapeHtml(href)}" target="_blank" rel="noreferrer"${downloadAttr} title="${text}">${body}</a>`
          : `<span class="citation-chip" title="${text}">${body}</span>`;
      }

      function highlightElement(root, query) {
        const trimmed = query.trim();
        if (!trimmed) return;
        const pattern = new RegExp(escapeRegExp(trimmed), "ig");
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.nodeValue || !pattern.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
            pattern.lastIndex = 0;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (parent.closest("pre, code, button, script, style, mark")) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          const frag = document.createDocumentFragment();
          const text = node.nodeValue;
          let lastIndex = 0;
          text.replace(pattern, (match, offset) => {
            frag.append(document.createTextNode(text.slice(lastIndex, offset)));
            const mark = document.createElement("mark");
            mark.textContent = match;
            frag.append(mark);
            lastIndex = offset + match.length;
            return match;
          });
          frag.append(document.createTextNode(text.slice(lastIndex)));
          node.parentNode.replaceChild(frag, node);
        }
      }

      function normalizeDedupeText(value) {
        return String(value || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
      }

      function normalizedConversationPath(path) {
        return normalizeZipPath(path)
          .toLowerCase()
          .replace(/(^|\/)images\/.*$/i, "")
          .replace(/\.[a-z0-9]+$/i, "")
          .replace(/_[a-f0-9]{8,}$/i, "")
          .replace(/_\d{8,14}$/i, "");
      }

      function conversationContentFingerprint(conversation) {
        const messages = conversation.messages || [];
        if (!conversation.title && !messages.length) return "";
        const first = messages[0]?.content || "";
        const last = messages[messages.length - 1]?.content || "";
        const time = normalizeEpochSeconds(conversation.updatedAt || conversation.createdAt) || "";
        return [
          "content",
          conversation.branchId ? `branch:${conversation.branchId}` : "",
          normalizeDedupeText(conversation.title),
          time,
          messages.length,
          normalizeDedupeText(first).slice(0, 160),
          normalizeDedupeText(last).slice(0, 160)
        ].join("|");
      }

      function conversationMergeKeys(conversation) {
        const keys = [];
        const add = key => {
          if (key && !keys.includes(key)) keys.push(key);
        };
        add(conversation.conversationId && conversation.branchId ? `id:${conversation.conversationId}:${conversation.branchId}` : "");
        add(conversation.jsonPath ? `json:${normalizedConversationPath(conversation.jsonPath)}` : "");
        add(conversation.mdPath ? `md:${normalizedConversationPath(conversation.mdPath)}` : "");
        add(conversationContentFingerprint(conversation));
        return keys;
      }

      function mergeConversations(existing, incoming) {
        const merged = [];
        const indexByKey = new Map();
        const register = (conversation, index) => {
          conversationMergeKeys(conversation).forEach(key => indexByKey.set(key, index));
        };
        let added = 0;
        let updated = 0;
        const put = (conversation, countAsIncoming) => {
          const keys = conversationMergeKeys(conversation);
          const existingIndex = keys.map(key => indexByKey.get(key)).find(index => Number.isInteger(index));
          if (Number.isInteger(existingIndex)) {
            merged[existingIndex] = conversation;
            register(conversation, existingIndex);
            if (countAsIncoming) updated += 1;
          } else {
            const nextIndex = merged.length;
            merged.push(conversation);
            register(conversation, nextIndex);
            if (countAsIncoming) added += 1;
          }
        };
        existing.forEach(conversation => put(conversation, false));
        incoming.forEach(conversation => put(conversation, true));
        merged.sort((a, b) => {
          if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
          return a.title.localeCompare(b.title, currentCollationLocale());
        });
        return { conversations: merged, added, updated };
      }

      function dedupeConversations(conversations) {
        const merged = [];
        const indexByKey = new Map();
        let removed = 0;
        const register = (conversation, index) => {
          conversationMergeKeys(conversation).forEach(key => indexByKey.set(key, index));
        };
        for (const conversation of conversations) {
          const keys = conversationMergeKeys(conversation);
          const existingIndex = keys.map(key => indexByKey.get(key)).find(index => Number.isInteger(index));
          if (Number.isInteger(existingIndex)) {
            merged[existingIndex] = conversation;
            removed += 1;
            register(conversation, existingIndex);
          } else {
            merged.push(conversation);
            register(conversation, merged.length - 1);
          }
        }
        merged.sort((a, b) => {
          if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
          return a.title.localeCompare(b.title, currentCollationLocale());
        });
        return { conversations: merged, removed };
      }

      function updateImportSummary() {
        const name = state.zipNames.length > 1
          ? `${state.zipNames[0]} +${state.zipNames.length - 1}`
          : (state.zipNames[0] || state.zipName || t("status.notImported"));
        state.zipName = name;
        dom.zipName.textContent = name;
        dom.zipStats.textContent = t("import.summaryStats", {
          conversations: state.conversations.length,
          files: state.totalFiles
        });
      }

      async function importZipFile(file, { append = false } = {}) {
        if (!file) return;
        append = Boolean(append && state.conversations.length);
        const token = state.importToken + 1;
        if (!append) {
          resetImportedData({ cancelImport: false });
        }
        state.importToken = token;
        const importedName = file.name || "export.zip";
        if (!append) {
          state.zipNames = [];
          state.totalFiles = 0;
        }
        state.zipNames.push(importedName);
        state.zipName = importedName;
        hideImportSummary();
        dom.zipName.textContent = append ? `${state.zipName} (${t("settings.importAppend")})` : state.zipName;
        dom.zipStats.textContent = append ? t("status.readingIncremental") : t("status.reading");
        document.body.classList.add("busy");

        try {
          setStatus(t("status.parsingZip"));
          const entries = await readZip(file);
          if (token !== state.importToken) return;
          dom.zipStats.textContent = t("import.summaryStats", { conversations: 0, files: entries.length });
          const parsedConversations = await buildConversations(entries, token);
          if (token !== state.importToken) return;
          const deduped = dedupeConversations(parsedConversations);
          const conversations = deduped.conversations;
          state.totalFiles += entries.length;
          let added = conversations.length;
          let updated = 0;
          if (append) {
            const merged = mergeConversations(state.conversations, conversations);
            state.conversations = merged.conversations;
            added = merged.added;
            updated = merged.updated;
          } else {
            state.conversations = conversations;
          }
          state.filtered = state.conversations.slice();
          updateImportSummary();
          renderList();

          if (state.conversations.length) {
            const preferred = append
              ? conversations[0]?.id || state.selectedId || state.conversations[0].id
              : conversations[0]?.id || state.conversations[0].id;
            selectConversation(preferred);
            const importStatus = append
              ? t("import.appendedStatus", { added, updated: updated + deduped.removed })
              : (deduped.removed ? t("import.dedupedStatus", { count: deduped.removed }) : t("status.importComplete"));
            showImportSummary({
              name: state.zipName,
              stats: t("import.summaryStats", {
                conversations: state.conversations.length,
                files: state.totalFiles
              }),
              status: importStatus
            });
            try {
              await saveLibraryToStorage();
            } catch (storageErr) {
              console.warn("Cache save failed", storageErr);
              showToast(t("status.cacheUnavailable"));
            }
          } else {
            dom.emptyState.style.display = "grid";
            dom.readerPane.classList.remove("visible");
            setStatus(t("status.noReadableConversations"));
          }
        } catch (err) {
          console.error(err);
          setStatus(err.message || t("error.importFailed"));
          dom.conversationList.innerHTML = `<div class="empty-list">${escapeHtml(err.message || t("error.importFailed"))}</div>`;
          showToast(t("error.importFailed"));
        } finally {
          document.body.classList.remove("busy");
        }
      }

      function openFilePicker() {
        dom.fileInput.click();
      }

      function openSidebar() {
        dom.app.classList.remove("sidebar-collapsed");
        dom.sidebar.classList.add("open");
      }

      function closeSidebar() {
        dom.sidebar.classList.remove("open");
      }

      function collapseSidebar() {
        dom.sidebar.classList.remove("open");
        dom.app.classList.add("sidebar-collapsed");
      }

      function openSearchModal() {
        state.searchModalOpen = true;
        dom.searchModal.classList.add("visible");
        dom.searchModal.setAttribute("aria-hidden", "false");
        dom.searchModalInput.value = state.query || "";
        renderSearchModalResults();
        requestAnimationFrame(() => dom.searchModalInput.focus());
      }

      function closeSearchModal() {
        state.searchModalOpen = false;
        dom.searchModal.classList.remove("visible");
        dom.searchModal.setAttribute("aria-hidden", "true");
      }

      function setPendingImportMode(mode) {
        state.pendingImportMode = mode === "replace" ? "replace" : "append";
        for (const button of [dom.appendImportButton, dom.replaceImportButton]) {
          const selected = button.dataset.importMode === state.pendingImportMode;
          button.classList.toggle("selected", selected);
          button.setAttribute("aria-checked", selected ? "true" : "false");
        }
      }

      function openImportChoiceModal(file) {
        if (!file) return;
        state.pendingImportFile = file;
        setPendingImportMode("append");
        dom.importChoiceCopy.textContent = t("import.copy", { count: state.conversations.length });
        dom.rememberImportChoiceInput.checked = false;
        dom.importChoiceModal.classList.add("visible");
        dom.importChoiceModal.setAttribute("aria-hidden", "false");
      }

      function closeImportChoiceModal() {
        state.pendingImportFile = null;
        state.pendingImportMode = "append";
        dom.importChoiceModal.classList.remove("visible");
        dom.importChoiceModal.setAttribute("aria-hidden", "true");
      }

      function handlePickedFile(file) {
        if (!file) return;
        if (
          state.conversations.length &&
          (!state.settings.rememberImportChoice || state.settings.defaultImportMode === "ask")
        ) {
          openImportChoiceModal(file);
          return;
        }
        const append = state.conversations.length && state.settings.defaultImportMode !== "replace";
        importZipFile(file, { append });
      }

      function searchSnippet(conversation, query) {
        const messages = conversation.messages || [];
        const fallback = [
          formatTimestamp(conversation.updatedAt || conversation.createdAt),
          `${countConversationTurns(messages)} 条`
        ].filter(Boolean).join(" · ");
        if (!query) return fallback;
        const lowerQuery = query.toLowerCase();
        const match = messages.find(message => String(message.content || "").toLowerCase().includes(lowerQuery));
        if (!match) return fallback || "标题匹配";
        const text = String(match.content || "").replace(/\s+/g, " ").trim();
        const lowerText = text.toLowerCase();
        const index = lowerText.indexOf(lowerQuery);
        const start = Math.max(0, index - 28);
        const end = Math.min(text.length, index + query.length + 52);
        const prefix = start > 0 ? "..." : "";
        const suffix = end < text.length ? "..." : "";
        return `${prefix}${text.slice(start, end)}${suffix}`;
      }

      function searchModalMatches(query) {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return state.conversations.slice(0, 80);
        return state.conversations
          .filter(conversation => conversation.searchText.includes(trimmed))
          .slice(0, 120);
      }

      function renderSearchModalResults() {
        const query = dom.searchModalInput.value || "";
        const hasQuery = Boolean(query.trim());
        const results = searchModalMatches(query);
        const heading = hasQuery
          ? (results.length ? t("search.found", { count: results.length }) : t("search.none"))
          : (state.conversations.length ? t("search.recent") : t("search.empty"));

        if (!results.length) {
          dom.searchModalResults.innerHTML = `
            <div class="search-results-heading">${escapeHtml(heading)}</div>
            <div class="search-empty">${state.conversations.length ? t("search.tryAnother") : t("search.importFirst")}</div>
          `;
          return;
        }

        dom.searchModalResults.innerHTML = `
          <div class="search-results-heading">${escapeHtml(heading)}</div>
          ${results.map(conversation => `
            <button class="search-result${conversation.id === state.selectedId ? " active" : ""}" type="button" data-id="${escapeHtml(conversation.id)}">
              <span class="search-result-icon" aria-hidden="true">${chatBubbleIconSvg()}</span>
              <span class="search-result-main">
                <span class="search-result-title">${highlightPlain(conversation.title, query)}</span>
                <span class="search-result-snippet">${hasQuery ? highlightPlain(searchSnippet(conversation, query), query) : escapeHtml(searchSnippet(conversation, ""))}</span>
              </span>
            </button>
          `).join("")}
        `;
      }

      async function clearImportedDataWithConfirm() {
        if (!state.conversations.length && !state.zipNames.length) {
          showToast(t("toast.noDataToClear"));
          return;
        }
        const ok = await confirmAppDialog({
          title: t("confirm.clearTitle"),
          copy: t("confirm.clear"),
          confirmLabel: t("actions.clear"),
          cancelLabel: t("actions.cancel"),
          danger: true
        });
        if (!ok) return;
        await clearStoredLibrary();
        clearState();
        await refreshStorageEstimate();
        showToast(t("toast.cleared"));
      }

      function closeSourcePanel() {
        state.activeSourceGroupIndex = null;
        dom.main.classList.remove("sources-open");
        dom.sourcePanel.setAttribute("aria-hidden", "true");
        dom.sourcePanelTitle.textContent = t("source.title");
        dom.sourcePanelList.innerHTML = "";
        dom.messages.querySelectorAll(".source-button").forEach(button => {
          button.setAttribute("aria-expanded", "false");
        });
      }

      function openSourcePanel(groupIndex) {
        const sources = state.sourceGroups[groupIndex] || [];
        if (!sources.length) return;
        const isAlreadyOpen = dom.main.classList.contains("sources-open") &&
          state.activeSourceGroupIndex === groupIndex;
        if (isAlreadyOpen) {
          closeSourcePanel();
          return;
        }

        state.activeSourceGroupIndex = groupIndex;
        dom.main.classList.add("sources-open");
        dom.sourcePanel.setAttribute("aria-hidden", "false");
        dom.sourcePanelTitle.textContent = t("source.countTitle", { count: sources.length });
        dom.sourcePanelList.innerHTML = sources.map(renderSourceCard).join("");
        dom.messages.querySelectorAll(".source-button").forEach(button => {
          button.setAttribute("aria-expanded", String(Number(button.dataset.groupIndex) === groupIndex));
        });
      }

      function renderSourceCard(source) {
        const link = resolveMarkdownLink(source.url, source.baseDir || "");
        const href = link.href;
        const displayName = link.local && link.record ? assetRecordDisplayName(link.record) : "";
        const host = sourceHost(source.url) || (href && link.local ? t("source.localFile") : t("source.fallback"));
        const title = displayName || source.title || source.label || host;
        const summary = source.url || source.label || "";
        const downloadName = displayName || link.download;
        const download = downloadName ? ` download="${escapeHtml(downloadName)}"` : "";
        const icon = sourceKind(source) === "file" ? fileIconSvg() : globeIconSvg();
        const body = `
          <div class="source-card-top">${icon}<span>${escapeHtml(host)}</span></div>
          <div class="source-card-title">${escapeHtml(title)}</div>
          <div class="source-card-url">${escapeHtml(summary)}</div>
        `;
        return href
          ? `<a class="source-card" href="${escapeHtml(href)}" target="_blank" rel="noreferrer"${download}>${body}</a>`
          : `<div class="source-card">${body}</div>`;
      }

      function loadImageElement(src) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          if (/^https?:/i.test(src)) image.crossOrigin = "anonymous";
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(t("error.imageReadFailed")));
          image.src = src;
        });
      }

      async function imageSourceToPngBlob(src) {
        const image = await loadImageElement(src);
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) {
          throw new Error(t("error.imageCopyUnavailable"));
        }
        context.drawImage(image, 0, 0);
        return await new Promise((resolve, reject) => {
          canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error(t("error.imageConvertFailed")));
          }, "image/png");
        });
      }

      async function copyImageSource(src) {
        if (!src) return false;
        if (navigator.clipboard?.write && window.ClipboardItem) {
          const pngBlob = await imageSourceToPngBlob(src);
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngBlob })
          ]);
          return true;
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(src);
        }
        return false;
      }

      function openPdfExportModal() {
        const conversation = getSelectedConversation();
        if (!conversation) {
          showToast(t("error.pdfNoConversation"));
          return;
        }
        dom.pdfThemeSelect.value = "auto";
        dom.pdfExportModal.setAttribute("aria-hidden", "false");
      }

      function closePdfExportModal() {
        dom.pdfExportModal.setAttribute("aria-hidden", "true");
      }

      function pdfExportOptions() {
        const selectedTheme = dom.pdfThemeSelect.value || "auto";
        return {
          theme: selectedTheme === "auto" ? (document.documentElement.dataset.theme || "light") : selectedTheme,
          codeStyle: dom.pdfCodeStyleSelect.value || "full",
          includeImages: Boolean(dom.pdfIncludeImages.checked),
          includeSources: Boolean(dom.pdfIncludeSources.checked)
        };
      }

      function pdfExportRoleLabel(role) {
        return role === "user" ? t("pdfExport.user") : t("pdfExport.assistant");
      }

      function renderPdfExportSources(sources) {
        if (!sources.length) return "";
        const items = sources.map((source, index) => {
          const link = resolveMarkdownLink(source.url, source.baseDir || "");
          const href = link.href || safeUrl(source.url || "");
          const download = link.download || source.download || "";
          const host = sourceHost(source.url || "") || (href && link.local ? t("source.localFile") : t("source.fallback"));
          const title = source.title || source.label || host;
          const summary = source.url || source.label || "";
          const downloadAttr = download ? ` download="${escapeHtml(download)}"` : "";
          const body = `
            <span class="pdf-source-index">${index + 1}</span>
            <span class="pdf-source-body">
              <span class="pdf-source-host">${escapeHtml(host)}</span>
              <span class="pdf-source-title">${escapeHtml(title)}</span>
              ${summary ? `<span class="pdf-source-url">${escapeHtml(summary)}</span>` : ""}
            </span>
          `;
          return href
            ? `<li><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer"${downloadAttr}>${body}</a></li>`
            : `<li><span>${body}</span></li>`;
        }).join("");
        return `
          <section class="pdf-message-sources">
            <h3>${escapeHtml(t("source.title"))}</h3>
            <ol>${items}</ol>
          </section>
        `;
      }

      function renderPdfExportMessageGroup(group, groupIndex, conversation, options) {
        const rendered = group.messages.map(message => renderMessageContent(message, conversation.baseDir));
        const sources = mergeSources(rendered.flatMap(item => item.sources));
        sources.forEach(source => { source.baseDir = source.baseDir || conversation.baseDir || ""; });
        const role = group.role === "user" ? "user" : "assistant";
        const body = rendered.map(item => item.html).join("");
        const sourceList = options.includeSources ? renderPdfExportSources(sources) : "";
        return `
          <article class="pdf-message ${role}" data-group-index="${groupIndex}">
            <div class="pdf-message-role">${escapeHtml(pdfExportRoleLabel(role))}</div>
            <div class="pdf-message-content">${body || `<p class="pdf-empty-message">${escapeHtml(t("messages.empty"))}</p>`}</div>
            ${sourceList}
          </article>
        `;
      }

      function pdfExportDocumentStyles() {
        return `
          @page { size: A4; margin: 14mm 15mm; }
          * { box-sizing: border-box; }
          html { background: #fff; color: #202123; }
          body {
            margin: 0;
            background: #fff;
            color: #202123;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
            font-size: 13px;
            line-height: 1.65;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          body.dark {
            background: #151515;
            color: #ececf1;
          }
          a { color: #0b57d0; text-decoration: underline; }
          body.dark a { color: #8ab4f8; }
          .pdf-export-doc {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
          }
          .pdf-export-header {
            margin: 0 0 16px;
            padding: 0 0 12px;
            border-bottom: 2px solid #e5e7eb;
          }
          body.dark .pdf-export-header { border-bottom-color: #3f4048; }
          .pdf-export-title {
            margin: 0 0 6px;
            color: inherit;
            font-size: 23px;
            line-height: 1.25;
            font-weight: 750;
          }
          .pdf-export-meta {
            margin: 0;
            color: #6e6e80;
            font-size: 12px;
            line-height: 1.5;
          }
          body.dark .pdf-export-meta { color: #acacbe; }
          .pdf-messages {
            display: grid;
            gap: 14px;
          }
          .pdf-message {
            width: 100%;
            padding: 12px 16px 13px;
            border-left: 4px solid #15803d;
            border-radius: 8px;
            background: #f0faf2;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
            break-inside: auto;
            page-break-inside: auto;
          }
          .pdf-message.user {
            border-left-color: #1d4ed8;
            background: #eef6ff;
          }
          body.dark .pdf-message {
            border-left-color: #53a86b;
            background: #17251b;
          }
          body.dark .pdf-message.user {
            border-left-color: #5b8def;
            background: #1a2340;
          }
          .pdf-message-role {
            margin: 0 0 7px;
            color: #166534;
            font-size: 11px;
            font-weight: 750;
            letter-spacing: 0.02em;
            break-after: avoid;
            page-break-after: avoid;
          }
          .pdf-message.user .pdf-message-role { color: #1d4ed8; }
          body.dark .pdf-message-role { color: #82c58d; }
          body.dark .pdf-message.user .pdf-message-role { color: #8ab4f8; }
          .pdf-message-content,
          .message-body,
          .bubble,
          .markdown {
            min-width: 0;
            max-width: 100%;
          }
          .message-body {
            display: block;
            width: 100%;
          }
          .bubble {
            width: 100%;
          }
          .markdown {
            font-size: 13px;
            line-height: 1.65;
          }
          .markdown > :first-child { margin-top: 0; }
          .markdown > :last-child { margin-bottom: 0; }
          .markdown p,
          .markdown ul,
          .markdown ol,
          .markdown blockquote,
          .markdown table,
          .code-block,
          .attachment-stack,
          .image-grid {
            margin-top: 0;
          }
          .markdown h1 { font-size: 20px; line-height: 1.3; }
          .markdown h2 { font-size: 17px; line-height: 1.35; }
          .markdown h3,
          .markdown h4 { font-size: 15px; line-height: 1.4; }
          .markdown ul,
          .markdown ol {
            padding-left: 1.6em;
          }
          .markdown li { margin: 0.25em 0; }
          .markdown blockquote {
            margin: 0 0 1em;
            padding: 0.2em 0 0.2em 1em;
            border-left: 3px solid #cbd5e1;
            color: #4b5563;
          }
          body.dark .markdown blockquote {
            border-left-color: #4b5563;
            color: #c7c7d1;
          }
          .md-div {
            margin: 0 0 1em;
            padding: 10px 14px;
            border: 1px solid #d6d8de;
            border-radius: 8px;
            background: #f7f7f8;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          body.dark .md-div {
            border-color: #3f4048;
            background: #202123;
          }
          .md-div > :first-child { margin-top: 0; }
          .md-div > :last-child { margin-bottom: 0; }
          .md-div--writing {
            border-left: 3px solid #10a37f;
          }
          .markdown-divider {
            border: 0;
            border-top: 1px solid #d6d8de;
            margin: 1em 0;
          }
          .markdown code:not(pre code) {
            padding: 0.12em 0.32em;
            border-radius: 5px;
            background: rgba(15, 23, 42, 0.08);
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
            font-size: 0.92em;
          }
          body.dark .markdown code:not(pre code) { background: rgba(255, 255, 255, 0.12); }
          .code-block {
            margin: 0 0 1em;
            overflow: hidden;
            border: 1px solid #d6d8de;
            border-radius: 8px;
            background: #0f172a;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          .code-toolbar {
            display: flex;
            min-height: 30px;
            padding: 6px 10px;
            color: #cbd5e1;
            background: rgba(255, 255, 255, 0.08);
            font-size: 12px;
          }
          .code-copy,
          .table-toolbar,
          .message-actions,
          .source-button,
          .md-div-copy {
            display: none !important;
          }
          pre {
            margin: 0;
            padding: 12px;
            overflow: visible;
            color: #e5e7eb;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
          }
          pre code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
            white-space: pre-wrap;
          }
          body.plain-code .code-toolbar { display: none; }
          body.plain-code .code-block {
            background: #f7f7f8;
          }
          body.plain-code pre {
            color: #202123;
          }
          body.dark.plain-code .code-block {
            background: #1e1f23;
            border-color: #3f4048;
          }
          body.dark.plain-code pre {
            color: #e5e5e5;
          }
          .table-wrap,
          .table-scroll {
            overflow: visible;
            max-width: 100%;
          }
          table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin: 0 0 1em;
            font-size: 12px;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          th,
          td {
            border-bottom: 1px solid #d6d8de;
            padding: 7px 8px;
            vertical-align: top;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          th {
            background: rgba(15, 23, 42, 0.06);
            font-weight: 700;
          }
          body.dark th,
          body.dark td {
            border-bottom-color: #3f4048;
          }
          body.dark th { background: rgba(255, 255, 255, 0.08); }
          th.align-center,
          td.align-center { text-align: center; }
          th.align-right,
          td.align-right { text-align: right; }
          .attachment-stack {
            display: grid;
            gap: 8px;
            margin: 0 0 10px;
          }
          .file-attachment-card {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            width: min(340px, 100%);
            min-height: 52px;
            padding: 7px 12px 7px 7px;
            border: 1px solid #d6d8de;
            border-radius: 8px;
            color: inherit !important;
            background: rgba(255, 255, 255, 0.65);
            text-decoration: none !important;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          body.dark .file-attachment-card {
            border-color: #3f4048;
            background: rgba(255, 255, 255, 0.06);
          }
          .file-attachment-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            width: 36px;
            height: 36px;
            border-radius: 7px;
            color: #fff;
            background: #5b79ff;
          }
          .file-attachment-icon svg {
            width: 18px;
            height: 18px;
          }
          .file-attachment-body {
            display: grid;
            gap: 2px;
            min-width: 0;
          }
          .file-attachment-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
            font-weight: 700;
          }
          .file-attachment-meta {
            overflow: hidden;
            color: #6e6e80;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 12px;
          }
          body.dark .file-attachment-meta { color: #acacbe; }
          .file-attachment-download { display: none; }
          .image-grid {
            display: grid;
            gap: 10px;
            margin: 10px 0 0;
          }
          .image-frame {
            display: inline-flex;
            max-width: 100%;
            width: auto;
            padding: 0;
            overflow: hidden;
            border: 1px solid #d6d8de;
            border-radius: 8px;
            background: #fff;
            cursor: default;
            line-height: 0;
            vertical-align: top;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          body.dark .image-frame {
            border-color: #3f4048;
            background: #1e1f23;
          }
          .image-frame img {
            display: block;
            width: auto;
            max-width: 100%;
            max-height: 118mm;
            object-fit: contain;
          }
          body.no-images .image-frame,
          body.no-images .image-grid {
            display: none !important;
          }
          .citation-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            max-width: 150px;
            height: 20px;
            margin: 0 2px;
            padding: 0 6px;
            border: 1px solid #d6d8de;
            border-radius: 999px;
            color: #374151;
            background: rgba(255, 255, 255, 0.55);
            font-size: 11px;
            line-height: 20px;
            text-decoration: none;
            vertical-align: -3px;
          }
          body.dark .citation-chip {
            border-color: #3f4048;
            color: #e5e7eb;
            background: rgba(255, 255, 255, 0.08);
          }
          .citation-chip svg {
            flex: 0 0 auto;
            width: 11px;
            height: 11px;
            stroke: currentColor;
            fill: none;
          }
          .citation-text {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          body.no-sources .citation-chip,
          body.no-sources .pdf-message-sources {
            display: none !important;
          }
          .pdf-message-sources {
            margin: 12px 0 0;
            padding-top: 10px;
            border-top: 1px solid rgba(0, 0, 0, 0.08);
          }
          body.dark .pdf-message-sources {
            border-top-color: rgba(255, 255, 255, 0.12);
          }
          .pdf-message-sources h3 {
            margin: 0 0 7px;
            color: #6e6e80;
            font-size: 11px;
            line-height: 1.4;
            font-weight: 750;
          }
          body.dark .pdf-message-sources h3 { color: #acacbe; }
          .pdf-message-sources ol {
            display: grid;
            gap: 6px;
            margin: 0;
            padding: 0;
            list-style: none;
          }
          .pdf-message-sources li > a,
          .pdf-message-sources li > span {
            display: grid;
            grid-template-columns: 22px minmax(0, 1fr);
            gap: 7px;
            color: inherit;
            text-decoration: none;
          }
          .pdf-source-index {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.08);
            color: #4b5563;
            font-size: 10px;
            font-weight: 700;
          }
          body.dark .pdf-source-index {
            background: rgba(255, 255, 255, 0.12);
            color: #d1d5db;
          }
          .pdf-source-body {
            display: grid;
            gap: 1px;
            min-width: 0;
          }
          .pdf-source-host {
            color: #6e6e80;
            font-size: 10.5px;
            line-height: 1.35;
          }
          .pdf-source-title {
            color: inherit;
            font-size: 12px;
            line-height: 1.35;
            font-weight: 650;
          }
          .pdf-source-url {
            color: #6e6e80;
            font-size: 10.5px;
            line-height: 1.35;
          }
          body.dark .pdf-source-host,
          body.dark .pdf-source-url {
            color: #acacbe;
          }
          .pdf-empty-message {
            margin: 0;
            color: #6e6e80;
          }
          body.dark .pdf-empty-message {
            color: #acacbe;
          }
          @media print {
            html, body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        `;
      }

      function buildPdfExportDocument(conversation, options) {
        const groups = groupMessages(conversation.messages || []);
        const createdAt = conversation.createdAt ? t("pdfExport.createdAt", { time: formatTimestamp(conversation.createdAt) }) : "";
        const generatedAt = t("pdfExport.generatedAt", { time: formatTimestamp(Date.now() / 1000) });
        const meta = [createdAt, generatedAt].filter(Boolean).join(" · ");
        const bodyClass = [
          options.theme === "dark" ? "dark" : "light",
          options.codeStyle === "plain" ? "plain-code" : "",
          options.includeImages ? "" : "no-images",
          options.includeSources ? "" : "no-sources"
        ].filter(Boolean).join(" ");
        const messages = groups.length
          ? groups.map((group, index) => renderPdfExportMessageGroup(group, index, conversation, options)).join("")
          : `<p class="pdf-empty-message">${escapeHtml(t("messages.empty"))}</p>`;
        const title = conversation.title || t("pdf.filenameFallback");
        return `<!doctype html>
<html lang="${escapeHtml(state.localeCode)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(sanitizeFilename(title, t("pdf.filenameFallback")))}</title>
  <style>${pdfExportDocumentStyles()}</style>
</head>
<body class="${escapeHtml(bodyClass)}">
  <main class="pdf-export-doc">
    <header class="pdf-export-header">
      <h1 class="pdf-export-title">${escapeHtml(title)}</h1>
      <p class="pdf-export-meta">${escapeHtml(meta)}</p>
    </header>
    <section class="pdf-messages">${messages}</section>
  </main>
  <script>
    (() => {
      const imagePromises = Array.from(document.images || []).map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
          const done = () => resolve();
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
          setTimeout(done, 3000);
        });
      });
      Promise.allSettled([document.fonts ? document.fonts.ready : Promise.resolve(), ...imagePromises])
        .then(() => setTimeout(() => {
          window.focus();
          window.print();
        }, 120));
    })();
  </script>
</body>
</html>`;
      }

      function printConversationPdf() {
        const conversation = getSelectedConversation();
        if (!conversation) return;
        const exportWindow = window.open("", "_blank");
        if (!exportWindow) {
          showToast(t("error.pdfPopupBlocked"));
          return;
        }
        closePdfExportModal();
        const html = buildPdfExportDocument(conversation, pdfExportOptions());
        exportWindow.document.open();
        exportWindow.document.write(html);
        exportWindow.document.close();
        try {
          exportWindow.opener = null;
        } catch (_) {}
      }

      function closeModal() {
        dom.imageModal.classList.remove("visible");
        dom.modalImage.removeAttribute("src");
        dom.modalImage.alt = "";
      }

      function getSelectedConversation() {
        return state.conversations.find(item => item.id === state.selectedId) || null;
      }

      function getSelectedMessageGroups() {
        const selected = getSelectedConversation();
        return selected ? groupMessages(selected.messages) : [];
      }

      setupSidebarControls();

      dom.chooseZipButton.addEventListener("click", openFilePicker);
      dom.railChooseZipButton.addEventListener("click", openFilePicker);
      dom.mobilePdfButton.addEventListener("click", openPdfExportModal);
      dom.emptyChooseButton.addEventListener("click", openFilePicker);
      dom.searchButton.addEventListener("click", openSearchModal);
      dom.railSearchButton.addEventListener("click", openSearchModal);
      dom.mediaLibraryButton.addEventListener("click", () => openAssetLibrary("all"));
      dom.railMediaLibraryButton.addEventListener("click", () => openAssetLibrary("all"));
      dom.settingsButton.addEventListener("click", openSettingsModal);
      dom.railSettingsButton.addEventListener("click", openSettingsModal);
      dom.openSidebarButton.addEventListener("click", openSidebar);
      dom.expandSidebarButton.addEventListener("click", openSidebar);
      dom.collapseSidebarButton.addEventListener("click", collapseSidebar);
      dom.sourcePanelCloseButton.addEventListener("click", closeSourcePanel);
      dom.exportPdfButton.addEventListener("click", openPdfExportModal);
      dom.pdfExportCloseButton.addEventListener("click", closePdfExportModal);
      dom.pdfExportCancelButton.addEventListener("click", closePdfExportModal);
      dom.pdfExportConfirmButton.addEventListener("click", printConversationPdf);
      dom.pdfExportModal.addEventListener("click", event => {
        if (event.target === dom.pdfExportModal) closePdfExportModal();
      });
      dom.mainScroll.addEventListener("scroll", scheduleTurnJumpActiveUpdate, { passive: true });
      window.addEventListener("resize", scheduleTurnJumpActiveUpdate);

      dom.fileInput.addEventListener("change", event => {
        const file = event.target.files?.[0];
        handlePickedFile(file);
        dom.fileInput.value = "";
      });

      dom.appendImportButton.addEventListener("click", () => {
        setPendingImportMode("append");
      });

      dom.replaceImportButton.addEventListener("click", () => {
        setPendingImportMode("replace");
      });

      dom.confirmImportChoiceButton.addEventListener("click", () => {
        const file = state.pendingImportFile;
        const mode = state.pendingImportMode;
        if (dom.rememberImportChoiceInput.checked) {
          updateSettings({ defaultImportMode: mode, rememberImportChoice: true });
        }
        closeImportChoiceModal();
        importZipFile(file, { append: mode !== "replace" });
      });

      dom.cancelImportChoiceButton.addEventListener("click", closeImportChoiceModal);

      dom.importChoiceModal.addEventListener("click", event => {
        if (event.target === dom.importChoiceModal) closeImportChoiceModal();
      });

      dom.searchModalInput.addEventListener("input", event => {
        state.query = event.target.value || "";
        renderSearchModalResults();
      });

      dom.searchModalResults.addEventListener("click", event => {
        const button = event.target.closest(".search-result");
        if (!button) return;
        selectConversation(button.dataset.id);
        closeSearchModal();
      });

      dom.searchModal.addEventListener("click", event => {
        if (event.target === dom.searchModal) closeSearchModal();
      });

      dom.searchModalCloseButton.addEventListener("click", closeSearchModal);

      dom.settingsCloseButton.addEventListener("click", closeSettingsModal);
      dom.settingsCloseActionButton.addEventListener("click", closeSettingsModal);
      dom.settingsClearButton.addEventListener("click", async () => {
        await clearImportedDataWithConfirm();
        refreshStorageEstimate();
      });
      dom.settingsModal.addEventListener("click", event => {
        if (event.target === dom.settingsModal) closeSettingsModal();
      });
      dom.appDialogCancelButton.addEventListener("click", () => {
        settleAppDialog({ confirmed: false, value: dom.appDialogInput.value });
      });
      dom.appDialogConfirmButton.addEventListener("click", () => {
        settleAppDialog({ confirmed: true, value: dom.appDialogInput.value });
      });
      dom.appDialogModal.addEventListener("click", event => {
        if (event.target === dom.appDialogModal) {
          settleAppDialog({ confirmed: false, value: dom.appDialogInput.value });
        }
      });
      dom.appDialogInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          settleAppDialog({ confirmed: true, value: dom.appDialogInput.value });
        } else if (event.key === "Escape") {
          event.preventDefault();
          settleAppDialog({ confirmed: false, value: dom.appDialogInput.value });
        }
      });
      dom.appDialogModal.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          settleAppDialog({ confirmed: false, value: dom.appDialogInput.value });
        }
      });
      dom.languageSelect.addEventListener("change", event => {
        updateSettings({ language: event.target.value || "auto" });
      });
      dom.themeSelect.addEventListener("change", event => {
        updateSettings({ theme: event.target.value || "system" });
      });
      dom.defaultImportModeSelect.addEventListener("change", event => {
        updateSettings({
          defaultImportMode: event.target.value || "append",
          rememberImportChoice: false
        });
      });

      dom.conversationList.addEventListener("click", event => {
        const sortButton = event.target.closest(".conversation-sort-button");
        if (sortButton) {
          state.conversationSortOrder = state.conversationSortOrder === "asc" ? "desc" : "asc";
          renderList();
          return;
        }
        const button = event.target.closest(".conversation-item");
        if (!button) return;
        selectConversation(button.dataset.id);
      });

      dom.assetLibraryHeaderActions.addEventListener("input", event => {
        if (event.target.id !== "librarySearchInput") return;
        state.libraryQuery = event.target.value || "";
        closeLibraryMenus();
        renderAssetLibrary();
        const input = dom.assetLibraryHeaderActions.querySelector("#librarySearchInput");
        input?.focus();
      });

      dom.assetLibraryHeaderActions.parentElement.addEventListener("click", async event => {
        const bulkAction = event.target.closest("[data-bulk-action]");
        if (bulkAction) {
          await handleLibraryBulkAction(bulkAction.dataset.bulkAction);
          return;
        }
        const tab = event.target.closest(".library-tab");
        if (tab) {
          state.libraryFilter = tab.dataset.filter || "all";
          closeLibraryMenus();
          pruneLibrarySelection();
          renderAssetLibrary();
          return;
        }
        const sortToggle = event.target.closest("[data-sort-toggle]");
        if (sortToggle) {
          state.librarySortMenuOpen = !state.librarySortMenuOpen;
          renderAssetLibrary();
          return;
        }
        const sortOption = event.target.closest("[data-sort]");
        if (sortOption) {
          state.librarySort = sortOption.dataset.sort || "name";
          closeLibraryMenus();
          renderAssetLibrary();
          return;
        }
        const layout = event.target.closest(".library-layout-button");
        if (layout) {
          state.libraryLayout = layout.dataset.layout === "list" ? "list" : "grid";
          closeLibraryMenus();
          renderAssetLibrary();
        }
      });

      dom.assetLibraryContent.addEventListener("click", async event => {
        const selectButton = event.target.closest("[data-asset-select]");
        if (selectButton) {
          const key = selectButton.dataset.assetSelect;
          if (state.librarySelected.has(key)) state.librarySelected.delete(key);
          else state.librarySelected.add(key);
          closeLibraryMenus();
          renderAssetLibrary();
          return;
        }
        const openButton = event.target.closest("[data-asset-open]");
        if (openButton) {
          openLibraryRecord(getLibraryRecordByKey(openButton.dataset.assetOpen));
          return;
        }
        const itemAction = event.target.closest("[data-item-action]");
        if (itemAction) {
          await handleLibraryItemAction(itemAction.dataset.itemAction, itemAction.dataset.assetKey);
          return;
        }
      });

      dom.turnJump.addEventListener("click", event => {
        const button = event.target.closest(".turn-jump-item");
        if (!button) return;
        closeSourcePanel();
        scrollToMessageGroup(button.dataset.groupIndex);
      });

      dom.messages.addEventListener("click", async event => {
        const sourceButton = event.target.closest(".source-button");
        if (sourceButton) {
          openSourcePanel(Number(sourceButton.dataset.groupIndex));
          return;
        }

        const imageButton = event.target.closest(".image-frame, .media-card, .library-card, .library-row");
        if (imageButton) {
          const src = imageButton.dataset.imageSrc;
          if (src) {
            dom.modalImage.src = src;
            dom.modalImage.alt = imageButton.dataset.imageAlt || "";
            dom.imageModal.classList.add("visible");
          }
          return;
        }

        const codeButton = event.target.closest(".code-copy");
        if (codeButton) {
          const code = codeButton.closest(".code-block")?.querySelector("code")?.textContent || "";
          if (code) {
            await navigator.clipboard.writeText(code);
            showToast(t("code.copied"));
          }
          return;
        }

        const divCopyButton = event.target.closest(".md-div-copy");
        if (divCopyButton) {
          let text = "";
          try {
            text = decodeURIComponent(divCopyButton.dataset.divCopy || "");
          } catch (_) {
            text = divCopyButton.dataset.divCopy || "";
          }
          if (text) {
            await navigator.clipboard.writeText(text);
            showToast(t("block.copied"));
          }
          return;
        }

        const tableButton = event.target.closest(".table-copy");
        if (tableButton) {
          let text = "";
          try {
            text = decodeURIComponent(tableButton.dataset.tableCopy || "");
          } catch (_) {
            text = tableButton.dataset.tableCopy || "";
          }
          if (text) {
            await navigator.clipboard.writeText(text);
            showToast(t("table.copied"));
          }
          return;
        }

        const copyButton = event.target.closest(".copy-message");
        if (copyButton) {
          const index = Number(copyButton.dataset.groupIndex);
          const group = getSelectedMessageGroups()[index];
          if (group) {
            if (group.copyText?.trim()) {
              await navigator.clipboard.writeText(group.copyText);
              showToast(t("messages.copied"));
            } else if (group.copyImage) {
              const src = group.copyImage.localUrl || group.copyImage.url || "";
              try {
                const copiedImage = await copyImageSource(src);
                showToast(copiedImage ? t("image.copied") : t("image.linkCopied"));
              } catch (err) {
                if (src && navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(src);
                  showToast(t("image.linkCopied"));
                } else {
                  showToast(t("image.copyFailed"));
                }
              }
            }
          }
        }
      });

      dom.sidebarScroll.addEventListener("scroll", updateSidebarDivider, { passive: true });

      dom.imageModal.addEventListener("click", event => {
        if (event.target === dom.imageModal) closeModal();
      });
      dom.modalCloseButton.addEventListener("click", closeModal);
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          closeSearchModal();
          closeImportChoiceModal();
          closeSettingsModal();
          closePdfExportModal();
          closeModal();
          closeSidebar();
          closeSourcePanel();
        }
      });

      for (const target of [document.body, dom.dropZone]) {
        target.addEventListener("dragover", event => {
          event.preventDefault();
          dom.dropZone.classList.add("dragging");
        });
        target.addEventListener("dragleave", event => {
          if (event.target === target) dom.dropZone.classList.remove("dragging");
        });
        target.addEventListener("drop", event => {
          event.preventDefault();
          dom.dropZone.classList.remove("dragging");
          const file = Array.from(event.dataTransfer?.files || []).find(item => /\.zip$/i.test(item.name)) || event.dataTransfer?.files?.[0];
          handlePickedFile(file);
        });
      }

      window.addEventListener("beforeunload", revokeObjectUrls);
      window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

      async function boot() {
        state.settings = readSettings();
        applyTheme();
        applyLocale();
        clearState();
        setStatus(t("status.loadingCache"));
        await initStorage();
        const restored = await restoreLibraryFromStorage();
        if (!restored) setStatus("");
      }

      boot().catch(err => {
        console.error(err);
        clearState();
        showToast(t("status.cacheUnavailable"));
      });
    })();
