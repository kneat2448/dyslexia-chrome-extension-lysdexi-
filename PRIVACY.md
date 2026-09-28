# lysdexi Privacy Policy

_Last updated: 28 September 2026_

lysdexi is an offline reading aid. It does not collect, sell, or transmit any personal data, and it makes no network requests of its own.

## What lysdexi reads

To restyle a page, lysdexi reads the text of the page you have switched it on for, entirely inside your browser. Page text, hovered words, and selected text are never stored or sent anywhere. Text-to-speech uses your browser's built-in speech engine.

## What lysdexi stores

| Data | Where | Why |
| --- | --- | --- |
| Your preferences (profile, font, ruler size and color, speech rate, toolbar position) | `chrome.storage.sync` | So your settings follow you. If Chrome Sync is on, Google syncs this between your signed-in browsers. |
| Sites you switched on in "Manual per site" mode (domain names only) | `chrome.storage.sync` | To remember where lysdexi should turn on automatically. |
| Which tabs lysdexi is on for | `chrome.storage.session` | Cleared when the browser closes. |
| Compatibility reports you create with **Report this site** | `chrome.storage.local` | Kept on this device only (last 25). |

A compatibility report contains the site's domain and page path, the extension version, your browser's user agent, a few lysdexi settings, and a timestamp. It is also copied to your clipboard so you can choose to paste it into a bug report. lysdexi never sends it anywhere itself. Reports never include page text, selected text, form values, passwords, or browsing history.

## Permissions

- **Access to all sites**: needed so lysdexi can restyle whichever page you choose to read.
- **storage**: saves the preferences listed above.
- **scripting**: adds lysdexi to tabs that were already open when you installed or updated it.

## Removing your data

Uninstalling lysdexi deletes everything it stored.

## Contact

Questions or problems: open an issue at https://github.com/kneat2448/dyslexia-chrome-extension-lysdexi-/issues
