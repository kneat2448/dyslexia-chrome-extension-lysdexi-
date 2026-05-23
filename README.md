# lysdexi Chrome Extension

Offline Manifest V3 dyslexia reading support for students and everyday readers.

## Features

- Branded lysdexi popup with bundled logo and OpenDyslexic UI.
- Reading profiles for homework, research, exams, night reading, and focus mode.
- Clean reader mode for distraction-reduced study pages.
- Toggle OpenDyslexic font on detected article content.
- Toggle a mouse-following reading ruler with adjustable height.
- Choose the reading ruler color.
- Show hovered word splits in a popup with a middle dot format, such as `read · ing`.
- Detect article pages first, then fall back to feeds, comments, search results, and dynamic text blocks on complex sites.
- Speak the hovered or selected word from a floating toolbar.
- Keyboard shortcuts for toggling lysdexi, ruler, reader mode, and selected-text speech.
- Local compatibility reports for tracking site issues without collecting page text.
- Persist preferences with `chrome.storage.sync`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `Dyslexia-reader-extension`.

The default activation scope is the current tab. Use the popup to switch to all tabs or manual per-site activation.

## Privacy

lysdexi is offline-first. Settings and compatibility reports are stored locally through Chrome storage. Compatibility reports store site metadata such as domain, extension version, browser user agent, and selected lysdexi settings. They do not store page text, selected text, passwords, form values, or browsing history.
