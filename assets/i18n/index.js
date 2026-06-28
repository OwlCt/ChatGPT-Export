(function () {
  "use strict";

  const registry = [
    {
      code: "en-US",
      label: "English",
      nativeLabel: "English",
      dir: "ltr",
      dateLocale: "en-US"
    },
    {
      code: "zh-CN",
      label: "Chinese (Simplified)",
      nativeLabel: "简体中文",
      dir: "ltr",
      dateLocale: "zh-CN"
    },
    {
      code: "zh-TW",
      label: "Chinese (Traditional)",
      nativeLabel: "繁體中文",
      dir: "ltr",
      dateLocale: "zh-TW"
    }
  ];

  window.ChatGPTReaderI18n = {
    registry,
    fallbackCode: "en-US",
    locales: window.ChatGPTReaderLocales || {}
  };
})();
