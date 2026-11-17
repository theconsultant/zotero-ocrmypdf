# Changelog

## 2026-11-16 — v0.1.2

- Zotero 10 support: `strict_max_version` raised to `10.*`.
- Fix startup crash on Zotero 10 (`Failed to load resource://gre/modules/AddonManager.jsm`): the build now patches zotero-plugin-toolkit's `_importESModule` to load `.sys.mjs` directly instead of rewriting to `.jsm`.
- Add toolbar button in the items toolbar to OCR selected PDFs.
- Drop the advertised Ctrl+Shift+O shortcut (never implemented; Accel+Shift+O is Zotero's New Note).
- OCR now uses `--skip-text` instead of `--force` (= `--force-ocr`, which rasterized pages that already had text).
- Re-running OCR on `name.ocr.pdf` updates it in place instead of creating `name.ocr.ocr.pdf`.
- Fix "deskew off": ocrmypdf has no `--no-deskew`; the flag is now omitted.
- Fix icon path: icons moved to `chrome/content/icons/` so the menu, progress-window and add-on icons load.
- Add tests (`npm test`): build output, manifest, icons, OCR output path and arguments.
