const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let script = fs.readFileSync('Tampermonkey.js', 'utf8');
const testExport = `
    window.ChatGPTExporter.__test = {
        sanitizeFilename,
        sanitizeImageFilenamePart,
        makeUniqueZipFilename,
        generateUniqueFilename,
        inspectFileAttachment,
        inspectImageAsset,
        extractConversationMessages,
        inspectReferenceFile,
        processContentReferences,
        addFileIfMissing,
        cleanMessageContent,
        detectScriptLocale,
        getScriptTranslation,
        normalizeAssetId,
        stripDilSource,
        looksLikeDilSource,
        readDilFallback,
        conversationPageAdvance,
        isFirstPartyAssetUrl,
    };
`;
script = script.replace(/\n\}\)\(\);\s*$/, `${testExport}\n})();`);

const window = {};
const documentElement = {
  setAttribute() {},
};
const document = {
  documentElement,
  body: {
    appendChild() {},
    removeChild() {},
  },
  createElement() {
    return {
      style: {},
      set textContent(value) {
        this._textContent = value;
      },
      get textContent() {
        return this._textContent || '';
      },
      click() {},
    };
  },
  getElementById() {
    return null;
  },
  cookie: '',
};

Object.assign(window, {
  fetch: async () => ({ json: async () => ({}) }),
  addEventListener() {},
  dispatchEvent() {},
  ChatGPTExporter: {},
});

const sandbox = {
  window,
  document,
  XMLHttpRequest: function XMLHttpRequest() {},
  Headers,
  CustomEvent: function CustomEvent(type) { this.type = type; },
  URL,
  console,
  setTimeout() {},
  alert() {},
};
sandbox.XMLHttpRequest.prototype.open = function open() {};

vm.runInNewContext(script, sandbox, { filename: 'Tampermonkey.js' });

const helpers = window.ChatGPTExporter.__test;
assert.ok(helpers, 'test helpers should be exposed in test mode');

assert.equal(helpers.detectScriptLocale(['zh-CN']), 'zh-CN');
assert.equal(helpers.detectScriptLocale(['zh-TW']), 'zh-TW');
assert.equal(helpers.detectScriptLocale(['zh-HK']), 'zh-TW');
assert.equal(helpers.detectScriptLocale(['zh-Hant']), 'zh-TW');
assert.equal(helpers.detectScriptLocale(['en-GB']), 'en-US');
assert.equal(helpers.detectScriptLocale(['fr-FR']), 'en-US');
assert.equal(helpers.getScriptTranslation('button.export', {}, 'zh-CN'), '导出对话');
assert.equal(helpers.getScriptTranslation('button.export', {}, 'zh-TW'), '匯出對話');
assert.equal(helpers.getScriptTranslation('button.export', {}, 'en-US'), 'Export Conversations');
assert.equal(
  helpers.getScriptTranslation('status.listSummary', { total: 3, filtered: 2, visible: 1, selected: 1 }, 'en-US'),
  '3 total, 2 filtered, showing 1, selected 1'
);

assert.equal(
  helpers.sanitizeFilename(' ../bad/name:*? "with" <chars>. ', 'fallback'),
  'bad-name--- -with- -chars'
);

assert.equal(
  helpers.sanitizeFilename('', 'fallback'),
  'fallback'
);

const longName = 'x'.repeat(200);
assert.equal(helpers.sanitizeFilename(longName).length, 120);

assert.equal(
  helpers.sanitizeImageFilenamePart('sediment://file_abc/../../evil name?.png'),
  'sediment-file_abc-evil-name-png'
);

const registry = new Map();
assert.equal(helpers.makeUniqueZipFilename('chat.json', registry, 'project/'), 'chat.json');
assert.equal(helpers.makeUniqueZipFilename('chat.json', registry, 'project/'), 'chat (2).json');
assert.equal(helpers.makeUniqueZipFilename('chat.json', registry, 'other/'), 'chat.json');

const generated = helpers.generateUniqueFilename({
  title: 'bad/name:*?',
  conversation_id: '00000000-0000-0000-0000-123456789abc',
});
assert.equal(generated, 'bad-name_123456789abc.json');

const attachment = helpers.inspectFileAttachment({
  file_id: 'file_abc123',
  name: '../paper?.pdf',
  content_type: 'application/pdf',
});
assert.equal(attachment.filename, 'paper-.pdf');
assert.equal(attachment.file_id, 'file_abc123');

const namedUpload = helpers.inspectFileAttachment({
  name: 'Memoria_PFG_Javier_Sarobe.docx',
  content_type: 'file_attachment',
});
assert.equal(namedUpload.filename, 'Memoria_PFG_Javier_Sarobe.docx');
assert.equal(namedUpload.key, 'Memoria_PFG_Javier_Sarobe.docx');

const mergedUploads = [];
helpers.addFileIfMissing(mergedUploads, namedUpload, 'text_part');
helpers.addFileIfMissing(mergedUploads, {
  file_id: 'file_real123',
  filename: 'Memoria_PFG_Javier_Sarobe.docx',
  content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}, 'attachment');
assert.equal(mergedUploads.length, 1);
assert.equal(mergedUploads[0].file_id, 'file_real123');
assert.ok(mergedUploads[0].aliases.includes('Memoria_PFG_Javier_Sarobe.docx'));
assert.ok(mergedUploads[0].aliases.includes('file_real123'));

const referenceFile = helpers.inspectReferenceFile({
  type: 'sandbox_path',
  matched_text: 'paper.pdf',
  sandbox_path: '/mnt/data/paper.pdf',
});
assert.equal(referenceFile.filename, 'paper.pdf');
assert.equal(referenceFile.key, '/mnt/data/paper.pdf');

const processed = helpers.processContentReferences('See paper.pdf', [{
  type: 'sandbox_path',
  matched_text: 'paper.pdf',
  sandbox_path: '/mnt/data/paper.pdf',
}]);
assert.equal(processed.text, 'See ([paper.pdf][1])');
assert.equal(processed.footnotes[0].url, 'chatgpt-file:%2Fmnt%2Fdata%2Fpaper.pdf');

assert.equal(
  helpers.cleanMessageContent('A \uE200cite\uE202turn686317calculator0\uE201 B'),
  'A  B'
);
assert.equal(
  helpers.cleanMessageContent('A citeturn686317calculator0 B'),
  'A  B'
);

const duplicateImageConversation = {
  mapping: {
    root: { parent: null, children: ['user-msg'] },
    'user-msg': {
      parent: 'root',
      children: [],
      message: {
        id: 'msg_1',
        author: { role: 'user' },
        content: {
          content_type: 'multimodal_text',
          parts: [
            'please read this image',
            {
              content_type: 'image_asset_pointer',
              asset_pointer: 'sediment://file_image123',
            },
          ],
        },
        metadata: {
          attachments: [{
            content_type: 'image/png',
            asset_pointer: 'sediment://file_image123',
            url: 'https://example.test/image.png',
          }],
        },
      },
    },
  },
};

const duplicateImageMessages = helpers.extractConversationMessages(duplicateImageConversation);
assert.equal(duplicateImageMessages.length, 1);
assert.equal(duplicateImageMessages[0].images.length, 1);
assert.equal(duplicateImageMessages[0].images[0].asset_pointer, 'sediment://file_image123');
assert.equal(duplicateImageMessages[0].images[0].url, 'https://example.test/image.png');
assert.equal(duplicateImageMessages[0].images[0].source, 'multimodal_text,attachment');

assert.equal(helpers.normalizeAssetId('file-service://file-abc/file_123'), 'file_123');
assert.equal(helpers.normalizeAssetId('sediment://file_abc'), 'file_abc');
assert.equal(helpers.isFirstPartyAssetUrl('https://images.openai.com/chart.png'), true);
assert.equal(helpers.isFirstPartyAssetUrl('https://files.oaiusercontent.com/a.png'), true);
assert.equal(helpers.isFirstPartyAssetUrl('/backend-api/files/file_123'), true);
assert.equal(helpers.isFirstPartyAssetUrl('https://evil.example/a.jpg'), false);
const cursorPage = helpers.conversationPageAdvance({ items: [{ id: 'a' }, { id: 'b' }], cursor: 'next' }, 2);
assert.equal(cursorPage.cursor, 'next');
assert.equal(cursorPage.offsetDelta, 2);
assert.equal(cursorPage.done, false);
const finishedPage = helpers.conversationPageAdvance({ items: [{ id: 'a' }], has_more: false }, 100);
assert.equal(finishedPage.cursor, '');
assert.equal(finishedPage.offsetDelta, 1);
assert.equal(finishedPage.done, true);
assert.equal(
  helpers.conversationPageAdvance({ items: new Array(100).fill({ id: 'a' }) }, 100).done,
  false
);
assert.equal(helpers.conversationPageAdvance({ items: [], cursor: null }, 100).done, true);
assert.equal(helpers.conversationPageAdvance({ items: [], cursor: 'again' }, 100).done, true);
assert.equal(helpers.getScriptTranslation('block.canvas', {}, 'zh-CN'), '画布');
assert.equal(helpers.getScriptTranslation('block.canvas', {}, 'zh-TW'), '畫布');
assert.equal(helpers.getScriptTranslation('block.app', {}, 'zh-TW'), '互動應用');

const plainMessages = helpers.extractConversationMessages({
  mapping: {
    root: {
      parent: null,
      children: ['user'],
      message: {
        id: 'plain',
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: ['Hello **world**'] },
      },
    },
  },
});
assert.equal(plainMessages.length, 1);
assert.equal(plainMessages[0].content, 'Hello **world**');
assert.equal(helpers.looksLikeDilSource(plainMessages[0].content), false);

const dilSource = 'Intro\n\n{@body const [tab,setTab] = DIL.useState("overview")}\n<box><title>{tab}</title>World</box>';
assert.equal(helpers.stripDilSource(dilSource), 'Intro\n\nWorld');
assert.equal(helpers.readDilFallback({ model_dil_v2: { fallbackMarkdown: ' Readable ' } }), 'Readable');

const intelligentMessages = helpers.extractConversationMessages({
  mapping: {
    root: { parent: null, children: ['user'] },
    user: {
      parent: 'root',
      children: ['thought'],
      message: {
        id: 'user-1',
        author: { role: 'user' },
        content: { content_type: 'text', parts: ['Hi'] },
      },
    },
    thought: {
      parent: 'user',
      children: ['tool'],
      message: {
        id: 'thought-1',
        author: { role: 'assistant' },
        content: {
          content_type: 'thoughts',
          thoughts: [{ summary: 'Plan', content: 'Check the docs' }],
        },
        metadata: { is_visually_hidden_from_conversation: true },
      },
    },
    tool: {
      parent: 'thought',
      children: ['canvas'],
      message: {
        id: 'tool-1',
        author: { role: 'tool', name: 'python' },
        content: { content_type: 'execution_output', text: '42' },
      },
    },
    canvas: {
      parent: 'tool',
      children: ['answer'],
      message: {
        id: 'canvas-1',
        author: { role: 'tool', name: 'canmore.create_textdoc' },
        recipient: 'canmore.create_textdoc',
        content: {
          content_type: 'code',
          text: JSON.stringify({ name: 'ADR', type: 'document', content: '# Decision\n\nUse Postgres.' }),
        },
      },
    },
    answer: {
      parent: 'canvas',
      children: [],
      message: {
        id: 'answer-1',
        author: { role: 'assistant' },
        content: {
          content_type: 'text',
          parts: [
            `${dilSource}\n<AppBlock title="Drum Lab"><button>Play</button></AppBlock>`,
          ],
        },
        metadata: {
          model_dil_v2: {
            fallbackMarkdown: 'Readable answer\n\n![lamb](https://evil.example/a.jpg)\n\n![chart](https://images.openai.com/chart.png)',
            appData: {
              opGenui: {
                componentResults: {
                  image: {
                    componentName: 'AsyncImage',
                    state: {
                      images: [{
                        content_url: 'https://images.openai.com/chart.png',
                        url: 'https://evil.example/a.jpg',
                        query: 'lamb',
                      }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
assert.equal(intelligentMessages.length, 2);
assert.equal(intelligentMessages[0].content, 'Hi');
assert.match(intelligentMessages[1].content, /:::reasoning/);
assert.match(intelligentMessages[1].content, /Check the docs/);
assert.match(intelligentMessages[1].content, /:::tool/);
assert.match(intelligentMessages[1].content, /42/);
assert.match(intelligentMessages[1].content, /:::canvas/);
assert.match(intelligentMessages[1].content, /Use Postgres/);
assert.match(intelligentMessages[1].content, /Readable answer/);
assert.doesNotMatch(intelligentMessages[1].content, /\{@body/);
assert.doesNotMatch(intelligentMessages[1].content, /evil\.example/);
assert.match(intelligentMessages[1].content, /<!-- image:https:\/\/images\.openai\.com\/chart\.png -->/);
assert.match(intelligentMessages[1].content, /:::app/);
assert.match(intelligentMessages[1].content, /Drum Lab/);
assert.equal(intelligentMessages[1].images.length, 1);
assert.equal(intelligentMessages[1].images[0].url, 'https://images.openai.com/chart.png');
assert.equal(intelligentMessages[1].images[0].source, 'genui');

const legacyCode = helpers.extractConversationMessages({
  mapping: {
    root: {
      parent: null,
      children: [],
      message: {
        id: 'code-1',
        author: { role: 'assistant' },
        content: { content_type: 'code', language: 'python', text: 'print(1)' },
      },
    },
  },
});
assert.match(legacyCode[0].content, /print\(1\)/);

console.log('filename helpers ok');
