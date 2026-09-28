# Chrome Web Store submission checklist

## Before uploading

- [ ] Bump `version` in `manifest.json` (every upload needs a higher version).
- [ ] Run `scripts/package.ps1` and upload `dist/lysdexi-<version>.zip`.
- [ ] Host `PRIVACY.md` at a public URL (for example the GitHub file link, or GitHub Pages) and paste it into **Privacy practices → Privacy policy URL**.
- [ ] Register the developer account ($5 one-time fee) and verify the contact email.

## Store listing assets (you need to create these)

| Asset | Requirement |
| --- | --- |
| Store icon | 128×128 PNG (`assets/icons/icon-128.png`) |
| Screenshots | At least 1, up to 5; 1280×800 or 640×400 PNG/JPEG |
| Small promo tile | 440×280 PNG/JPEG (optional but recommended) |
| Marquee promo tile | 1400×560 (optional) |

Suggested screenshots: an article with the font and ruler on, the syllable popup, clean reader mode, and the popup settings panel.

## Listing text

**Category:** Accessibility

**Short description** (from the manifest, 132 characters max):
> Offline dyslexia reading support: OpenDyslexic font, reading ruler, syllable splitting, clean reader mode and text-to-speech.

**Detailed description (draft):**

> lysdexi makes web pages easier to read for people with dyslexia, and for anyone who finds dense text tiring.
>
> • OpenDyslexic font: swaps the article text for a dyslexia-friendly typeface.
> • Reading ruler: a tinted band follows your mouse so you don't lose your line.
> • Syllable splitting: hover a word to see it broken into syllables (won · der · ful).
> • Text-to-speech: hear the hovered word or any selected text.
> • Clean reader mode: strips away menus, ads and sidebars.
> • Profiles: Homework, Research, Exam focus, Night reading and Focus mode.
> • Keyboard shortcuts for everything.
>
> Private by design: lysdexi works fully offline, makes no network requests, and never stores or sends the text you read.

## Privacy practices tab

**Single purpose:**
> Make web page text easier to read for people with dyslexia by changing the font, adding a reading ruler, splitting words into syllables, offering a clean reader view, and reading text aloud.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| Host permission `<all_urls>` | The user can read any website with lysdexi, so the content script must be able to run on any page to restyle article text, show the reading ruler and read text aloud. It only changes a page after the user turns it on. |
| `storage` | Saves the user's reading preferences, per-site activation list, per-tab on/off state and locally stored compatibility reports. |
| `scripting` | Injects the reading tools into tabs that were already open when the extension was installed or updated, when the user turns lysdexi on in that tab. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing under "collected data". The extension does not transmit any user data, and page content is processed locally and never stored. Then certify all three disclosures (no selling, no unrelated use, no creditworthiness use).

## Review notes

Broad host permissions (`<all_urls>`) usually add a few days of manual review. That's expected for a reading tool that works on every site. The justifications above address what reviewers ask for.
