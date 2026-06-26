# Contributing

Thanks for your interest in improving ChatGPT Universal Exporter.

## Before You Start

- Keep the project fully browser-local.
- Do not add telemetry, analytics, or remote services.
- Keep `reader.html` usable as a standalone local file.
- Prefer small, focused changes with tests for parsing, export, or reader behavior.

## Development

Run the verification checks before opening a pull request:

```sh
npm run verify
```

The project intentionally has no runtime npm dependencies. The tests use Node.js built-in modules.

## Pull Requests

Please include:

- A short description of the change.
- Screenshots or notes for visible reader UI changes.
- Test coverage or a clear explanation when tests are not practical.
- Any known limitation or compatibility concern.

## Reporting Issues

When reporting a bug, include:

- Browser and userscript manager version.
- Whether the issue happens during export or in `reader.html`.
- A small redacted sample ZIP or JSON snippet when possible.
- Console errors from the browser developer tools.
