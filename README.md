# lysdexi Chrome Extension

Offline Manifest V3 dyslexia reading support for students and everyday readers.

## Features

- Reading profiles for homework, research, exams, night reading, and focus mode.
- OpenDyslexic font on detected article content (icon fonts, code and form controls are left alone).
- Mouse-following reading ruler with adjustable height and color.
- Syllable splits for the hovered word, such as `read · ing` and `na · tion`.
- Clean reader mode: a distraction-free view of the article (Esc to close).
- Speak the hovered word or selected text with the browser's built-in voices.
- Article detection first, then fallbacks for feeds, comments, search results, and pages that load content later.
- Keyboard shortcuts: `Alt+Shift+L` toggle lysdexi, `Alt+Shift+R` ruler, `Alt+Shift+M` reader mode, `Alt+Shift+S` speak selection.
- Local compatibility reports, copied to the clipboard for bug reports, without collecting page text.

lysdexi never rewrites the page's DOM: hovered words are found with `caretRangeFromPoint`, and all UI lives in a shadow root. This keeps it compatible with React/Vue/Angular sites and stops page CSS from breaking the toolbar.

## Project layout

| Path | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `background/service-worker.js` | Settings storage, activation state, shortcuts, broadcasting to tabs |
| `shared/settings.js` | Defaults, profiles and settings validation shared by the worker and popup |
| `content/` | Page features: article detection, syllables, speech, toolbar/ruler/reader UI |
| `popup.*` | Toolbar popup |
| `scripts/package.ps1` | Builds the Web Store zip |

## Load in Chrome for development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

The default activation scope is the current tab. Use the popup to switch to all tabs or manual per-site activation.

## Build for the Chrome Web Store

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package.ps1
```

This writes `dist/lysdexi-<version>.zip`. Bump `version` in `manifest.json` before each upload. See [STORE_LISTING.md](STORE_LISTING.md) for the submission checklist.

## Privacy

See [PRIVACY.md](PRIVACY.md). lysdexi makes no network requests. Preferences use `chrome.storage.sync`, so they follow your Chrome profile if Chrome Sync is on. Compatibility reports stay on the device.

## Credits

OpenDyslexic font by Abelardo Gonzalez, licensed under the SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
