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

console.log('filename helpers ok');
