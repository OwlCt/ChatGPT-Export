# Security Policy

## Supported Versions

Security fixes target the current `main` branch.

## Reporting A Vulnerability

Please do not open a public issue for sensitive vulnerabilities.

Use GitHub Security Advisories when available, or contact the maintainer through GitHub with enough detail to reproduce the issue. Useful details include affected files, browser version, steps to reproduce, and whether exported local data can be exposed.

## Security Model

- The exporter runs only on ChatGPT domains declared in `Tampermonkey.js`.
- The exporter uses the active browser session to call ChatGPT APIs.
- Exported ZIP files are generated locally in the browser.
- `reader.html` is designed to read local ZIP files without contacting remote services.

Please treat exported ZIP files as private data because they may contain conversation text, uploaded files, generated images, and metadata.
