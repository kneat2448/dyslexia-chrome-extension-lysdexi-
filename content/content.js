(() => {
  // The script can be injected twice (declared content script + on-demand injection from the service worker).
  // A copy left behind by an extension update has a dead runtime; replace it instead of deferring to it.
  if (window.__lysdexi?.isAlive()) return;
  window.__lysdexi?.teardown();

  const FONT_CLASS = 'dx-reader-font';
  const WORD_CHAR = /[\p{L}\p{M}'’-]/u;
  const EDGE_PUNCTUATION = /['’-]/u;
  const SKIP_SELECTOR = [
    'nav', 'aside', 'header', 'footer', 'form', 'dialog', 'menu', 'code', 'pre', 'kbd', 'samp',
    'input', 'textarea', 'select', 'button', '[contenteditable=""]', '[contenteditable="true"]', 'lysdexi-ui'
  ].join(',');
  const READER_BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, figcaption';
  const READER_SKIP_SELECTOR = 'nav, aside, footer, form, dialog, menu, script, style, noscript, [hidden], [aria-hidden="true"], lysdexi-ui';
  const HOVER_DELAY = 180;
  const REFRESH_INTERVAL = 1200;

  const state = {
    settings: null,
    active: false,
    containers: [],
    ui: null,
    hover: null,
    pointer: null,
    moveFrame: 0,
    currentWord: '',
    selectedText: '',
    hoverTimer: null,
    refreshTimer: null,
    observer: null,
    listening: false,
    previousOverflow: null
  };

  window.__lysdexi = {
    isAlive() {
      try {
        return !!chrome.runtime?.id;
      } catch {
        return false;
      }
    },
    teardown
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'dx-ping') {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'dx-speak-selection') {
      if (state.active) window.DyslexiaSpeech.speak(getSpeakableText(), state.settings);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'dx-settings-updated') {
      state.settings = message.settings || state.settings;
      state.active = !!message.active;
      apply();
    }
  });

  boot();

  async function boot() {
    const response = await chrome.runtime.sendMessage({ type: 'dx-get-settings' }).catch(() => null);
    if (!response?.settings) return;
    state.settings = response.settings;
    state.active = !!response.active;
    apply();
  }

  // apply() is idempotent: it brings the page in line with the current settings without rebuilding
  // anything that is already correct, so it is cheap to call on every settings broadcast.
  function apply() {
    if (!state.active || !state.settings || !document.body) {
      teardown();
      return;
    }

    ensureFontFace();
    ensureUi();
    refreshContainers();
    syncReaderMode();
    syncListeners();
    syncRuler();
    syncToolbar();
    syncObserver();
  }

  function teardown() {
    window.DyslexiaSpeech?.stop();
    setListening(false);
    state.observer?.disconnect();
    state.observer = null;
    clearTimeout(state.refreshTimer);
    clearTimeout(state.hoverTimer);
    cancelAnimationFrame(state.moveFrame);
    state.refreshTimer = state.hoverTimer = null;
    state.moveFrame = 0;

    for (const container of state.containers) container.classList.remove(FONT_CLASS);
    state.containers = [];

    closeReaderMode();
    state.ui?.host.remove();
    state.ui = null;
    state.hover = null;
    state.currentWord = '';
    state.selectedText = '';
  }

  // Settings changes made from the page go through the service worker so every tab stays in sync.
  function patchSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    apply();
    chrome.runtime.sendMessage({ type: 'dx-update-settings', patch }).catch(() => {});
  }

  function ensureFontFace() {
    if (document.getElementById('dx-reader-font-face')) return;

    const style = document.createElement('style');
    style.id = 'dx-reader-font-face';
    style.textContent = `
      @font-face {
        font-family: 'DXOpenDyslexic';
        src: url('${chrome.runtime.getURL('assets/fonts/OpenDyslexic3-Regular.ttf')}') format('truetype');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'DXOpenDyslexic';
        src: url('${chrome.runtime.getURL('assets/fonts/OpenDyslexic3-Bold.ttf')}') format('truetype');
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
    `;
    document.documentElement.append(style);
  }

  function ensureUi() {
    if (state.ui?.host.isConnected) return;

    const host = document.createElement('lysdexi-ui');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = window.DyslexiaUiStyles;
    root.append(style);

    const highlight = createElement('div', 'highlight');
    const splitPopup = createElement('div', 'split-popup font');
    splitPopup.setAttribute('role', 'tooltip');
    highlight.hidden = splitPopup.hidden = true;
    root.append(highlight, splitPopup);

    document.documentElement.append(host);
    state.ui = { host, root, highlight, splitPopup, ruler: null, toolbar: null, reader: null };
  }

  // ---------------------------------------------------------------------------
  // Article containers

  function refreshContainers() {
    const next = window.DyslexiaArticleDetector.findContainers();
    for (const old of state.containers) {
      if (!next.includes(old)) old.classList.remove(FONT_CLASS);
    }
    state.containers = next;
    for (const container of next) {
      container.classList.toggle(FONT_CLASS, !!state.settings.openDyslexicEnabled);
    }
  }

  function syncObserver() {
    if (state.observer) return;

    state.observer = new MutationObserver(mutations => {
      if (state.refreshTimer || !mutations.some(needsRefresh)) return;
      // Throttle rather than debounce so pages that mutate constantly still get refreshed.
      state.refreshTimer = setTimeout(() => {
        state.refreshTimer = null;
        if (state.active) refreshContainers();
      }, REFRESH_INTERVAL);
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function needsRefresh(mutation) {
    if (state.containers.some(container => !container.isConnected)) return true;

    const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    // Text changing inside a container is already styled by the container's class.
    if (!target || state.containers.some(container => container.contains(target))) return false;

    if (mutation.type === 'characterData') return /\p{L}/u.test(mutation.target.nodeValue || '');
    return [...mutation.addedNodes].some(node => /\p{L}/u.test(node.textContent || ''));
  }

  // ---------------------------------------------------------------------------
  // Word hover, click and selection

  function syncListeners() {
    setListening(true);
  }

  function setListening(on) {
    if (on === state.listening) return;
    state.listening = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    document[method]('mousemove', onMouseMove, { capture: true, passive: true });
    document[method]('click', onClick, true);
    document[method]('selectionchange', onSelectionChange);
    document[method]('keydown', onKeyDown, true);
    window[method]('scroll', clearHover, { capture: true, passive: true });
    window[method]('resize', onResize, { passive: true });
  }

  function hoverEnabled() {
    return !!(state.settings.wordSplitEnabled || state.settings.speakerEnabled);
  }

  function onMouseMove(event) {
    state.pointer = { x: event.clientX, y: event.clientY };
    if (state.moveFrame) return;
    state.moveFrame = requestAnimationFrame(() => {
      state.moveFrame = 0;
      moveRuler(state.pointer.y);
      if (!state.ui?.reader) updatePageHover(state.pointer.x, state.pointer.y);
    });
  }

  function updatePageHover(x, y) {
    if (!hoverEnabled()) return;
    const hit = wordAtPoint(x, y);
    if (!hit) {
      clearHover();
      return;
    }
    if (state.hover?.node === hit.node && state.hover?.start === hit.start) return;
    setHover(hit);
  }

  // Finds the word under the pointer without modifying the page DOM.
  function wordAtPoint(x, y) {
    const range = document.caretRangeFromPoint?.(x, y);
    const node = range?.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE || !isReadableText(node)) return null;

    const text = node.nodeValue;
    let start = range.startOffset;
    let end = start;
    while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
    while (end < text.length && WORD_CHAR.test(text[end])) end++;
    while (start < end && EDGE_PUNCTUATION.test(text[start])) start++;
    while (end > start && EDGE_PUNCTUATION.test(text[end - 1])) end--;

    const word = text.slice(start, end);
    if (!/\p{L}/u.test(word)) return null;

    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);
    // caretRangeFromPoint snaps to the nearest caret even over blank space, so confirm the pointer is on the word.
    const rect = [...wordRange.getClientRects()].find(r => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1);
    return rect ? { node, start, word, rect } : null;
  }

  function isReadableText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SELECTOR)) return false;
    return state.containers.some(container => container.contains(parent));
  }

  function setHover(hit) {
    state.hover = hit;
    const { highlight, splitPopup } = state.ui;
    const { rect, word } = hit;

    highlight.hidden = false;
    Object.assign(highlight.style, {
      left: `${rect.left - 2}px`,
      top: `${rect.top - 1}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 2}px`
    });

    if (state.settings.wordSplitEnabled) {
      const syllables = window.DyslexiaSyllables.split(word);
      splitPopup.textContent = syllables.length > 1 ? syllables.join(' · ') : word;
      splitPopup.hidden = false;
      const popupRect = splitPopup.getBoundingClientRect();
      const above = rect.top - popupRect.height - 8;
      const top = above >= 8 ? above : rect.bottom + 8;
      const left = clamp(rect.left + rect.width / 2 - popupRect.width / 2, 8, window.innerWidth - popupRect.width - 8);
      splitPopup.style.top = `${top}px`;
      splitPopup.style.left = `${left}px`;
    } else {
      splitPopup.hidden = true;
    }

    clearTimeout(state.hoverTimer);
    state.hoverTimer = setTimeout(() => {
      state.currentWord = word;
      if (!state.selectedText) updateToolbarWord(word);
    }, HOVER_DELAY);
  }

  function clearHover() {
    if (!state.hover) return;
    state.hover = null;
    clearTimeout(state.hoverTimer);
    state.hoverTimer = null;
    if (state.ui) state.ui.highlight.hidden = state.ui.splitPopup.hidden = true;
  }

  function onClick(event) {
    if (!hoverEnabled() || getSelectedText() || state.ui?.reader) return;
    const hit = wordAtPoint(event.clientX, event.clientY);
    if (hit) chooseWord(hit.word);
  }

  function chooseWord(word) {
    state.currentWord = word;
    state.selectedText = '';
    updateToolbarWord(word);
  }

  function onSelectionChange() {
    state.selectedText = getSelectedText();
    updateToolbarWord(state.selectedText || state.currentWord);
  }

  function getSelectedText() {
    // Selections inside the reader live in our shadow root, which document.getSelection() can't see into.
    const selection = (state.ui?.reader && state.ui.root.getSelection?.()) || window.getSelection();
    return (selection?.toString() || '').trim().replace(/\s+/g, ' ');
  }

  function getSpeakableText() {
    return getSelectedText() || state.selectedText || state.currentWord;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && state.ui?.reader) {
      event.stopPropagation();
      patchSettings({ readerModeEnabled: false, profile: 'custom' });
    }
  }

  function onResize() {
    if (state.ui?.toolbar) applyToolbarPosition(state.ui.toolbar);
  }

  // ---------------------------------------------------------------------------
  // Toolbar

  function syncToolbar() {
    const wanted = state.settings.uiMode !== 'popup-only';
    if (!wanted) {
      state.ui.toolbar?.remove();
      state.ui.toolbar = null;
      return;
    }

    if (!state.ui.toolbar) createToolbar();
    const toolbar = state.ui.toolbar;
    const speaker = !!state.settings.speakerEnabled;
    toolbar.querySelector('.toolbar-word').hidden = !speaker;
    toolbar.querySelector('.speak').hidden = !speaker;
    toolbar.querySelector('.ruler-toggle').setAttribute('aria-pressed', String(!!state.settings.rulerEnabled));
    toolbar.querySelector('.reader-toggle').setAttribute('aria-pressed', String(!!state.settings.readerModeEnabled));
    applyToolbarPosition(toolbar);
  }

  function createToolbar() {
    const toolbar = createElement('div', 'toolbar font');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'lysdexi');
    toolbar.innerHTML = `
      <span class="toolbar-word" aria-live="polite">Hover a word</span>
      <button class="ruler-toggle" type="button" title="Toggle reading ruler" aria-label="Toggle reading ruler">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7h16v10H4Z"></path><path d="M8 7v4"></path><path d="M12 7v7"></path><path d="M16 7v4"></path>
        </svg>
      </button>
      <button class="reader-toggle" type="button" title="Toggle clean reader mode" aria-label="Toggle clean reader mode">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 4h14v16H5Z"></path><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>
        </svg>
      </button>
      <button class="speak" type="button" title="Speak word or selection" aria-label="Speak word or selection">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path>
        </svg>
      </button>
    `;
    state.ui.root.append(toolbar);
    state.ui.toolbar = toolbar;
    updateToolbarWord(state.selectedText || state.currentWord);
    makeToolbarDraggable(toolbar);

    toolbar.querySelector('.ruler-toggle').addEventListener('click', () => {
      patchSettings({ rulerEnabled: !state.settings.rulerEnabled, profile: 'custom' });
    });

    toolbar.querySelector('.reader-toggle').addEventListener('click', () => {
      patchSettings({ readerModeEnabled: !state.settings.readerModeEnabled, profile: 'custom' });
    });

    const speak = toolbar.querySelector('.speak');
    // Keep the page selection alive when the button is pressed.
    speak.addEventListener('pointerdown', event => event.preventDefault());
    speak.addEventListener('click', () => {
      if (window.speechSynthesis?.speaking) window.DyslexiaSpeech.stop();
      else window.DyslexiaSpeech.speak(getSpeakableText(), state.settings);
    });
  }

  function updateToolbarWord(word) {
    const label = state.ui?.toolbar?.querySelector('.toolbar-word');
    if (label) label.textContent = word || 'Hover a word';
  }

  function applyToolbarPosition(toolbar) {
    const position = state.settings.toolbarPosition;
    if (!position) {
      toolbar.style.left = toolbar.style.top = toolbar.style.right = toolbar.style.bottom = '';
      return;
    }

    const rect = toolbar.getBoundingClientRect();
    toolbar.style.left = `${clamp(position.left, 8, window.innerWidth - rect.width - 8)}px`;
    toolbar.style.top = `${clamp(position.top, 8, window.innerHeight - rect.height - 8)}px`;
    toolbar.style.right = 'auto';
    toolbar.style.bottom = 'auto';
  }

  function makeToolbarDraggable(toolbar) {
    let drag = null;

    toolbar.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = toolbar.getBoundingClientRect();
      drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      toolbar.classList.add('dragging');
      toolbar.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    toolbar.addEventListener('pointermove', event => {
      if (!drag) return;
      const rect = toolbar.getBoundingClientRect();
      toolbar.style.left = `${clamp(event.clientX - drag.offsetX, 8, window.innerWidth - rect.width - 8)}px`;
      toolbar.style.top = `${clamp(event.clientY - drag.offsetY, 8, window.innerHeight - rect.height - 8)}px`;
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
    });

    const endDrag = event => {
      if (!drag) return;
      drag = null;
      toolbar.classList.remove('dragging');
      if (toolbar.hasPointerCapture(event.pointerId)) toolbar.releasePointerCapture(event.pointerId);
      const rect = toolbar.getBoundingClientRect();
      patchSettings({ toolbarPosition: { left: Math.round(rect.left), top: Math.round(rect.top) } });
    };

    toolbar.addEventListener('pointerup', endDrag);
    toolbar.addEventListener('pointercancel', endDrag);
  }

  // ---------------------------------------------------------------------------
  // Reading ruler

  function syncRuler() {
    if (!state.settings.rulerEnabled) {
      state.ui.ruler?.remove();
      state.ui.ruler = null;
      return;
    }

    if (!state.ui.ruler) {
      state.ui.ruler = createElement('div', 'ruler');
      state.ui.root.append(state.ui.ruler);
    }

    const { r, g, b } = hexToRgb(state.settings.rulerColor);
    Object.assign(state.ui.ruler.style, {
      height: `${clamp(Number(state.settings.rulerHeight) || 48, 20, 120)}px`,
      background: `rgba(${r}, ${g}, ${b}, 0.16)`,
      borderTopColor: `rgba(${r}, ${g}, ${b}, 0.42)`,
      borderBottomColor: `rgba(${r}, ${g}, ${b}, 0.42)`
    });
    if (state.pointer) moveRuler(state.pointer.y);
  }

  function moveRuler(y) {
    const ruler = state.ui?.ruler;
    if (ruler) ruler.style.top = `${y - ruler.offsetHeight / 2}px`;
  }

  // ---------------------------------------------------------------------------
  // Clean reader mode

  function syncReaderMode() {
    if (!state.settings.readerModeEnabled) {
      closeReaderMode();
      return;
    }
    if (!state.ui.reader) openReaderMode();
    state.ui.reader.classList.toggle('font', !!state.settings.openDyslexicEnabled);
  }

  function openReaderMode() {
    const reader = createElement('div', 'reader');
    reader.setAttribute('role', 'dialog');
    reader.setAttribute('aria-modal', 'true');
    reader.setAttribute('aria-label', 'lysdexi clean reader');
    reader.innerHTML = `
      <div class="reader-shell">
        <header class="reader-header">
          <div>
            <strong>lysdexi reader</strong>
            <span>clean study view · Esc to close</span>
          </div>
          <button type="button">Close</button>
        </header>
        <main class="reader-content"></main>
      </div>
    `;

    const content = reader.querySelector('.reader-content');
    const blocks = extractReadableBlocks(state.containers);
    const hasText = blocks.length > 0;
    if (document.title.trim() && blocks[0]?.tag !== 'h1') blocks.unshift({ tag: 'h1', text: document.title.trim() });

    for (const block of blocks) {
      const el = document.createElement(block.tag);
      el.append(wordFragment(block.text));
      content.append(el);
    }
    if (!hasText) {
      const empty = createElement('p', 'empty');
      empty.textContent = "lysdexi couldn't find readable text on this page yet.";
      content.append(empty);
    }

    reader.querySelector('.reader-header button').addEventListener('click', () => {
      patchSettings({ readerModeEnabled: false, profile: 'custom' });
    });

    content.addEventListener('mouseover', event => {
      const wordEl = event.target.closest('.w');
      if (wordEl && hoverEnabled() && state.hover?.node !== wordEl) {
        setHover({ node: wordEl, start: 0, word: wordEl.textContent, rect: wordEl.getBoundingClientRect() });
      }
    });
    content.addEventListener('mouseout', event => {
      if (event.target.closest('.w')) clearHover();
    });
    content.addEventListener('click', event => {
      const wordEl = event.target.closest('.w');
      if (wordEl && hoverEnabled() && !getSelectedText()) chooseWord(wordEl.textContent);
    });
    reader.addEventListener('scroll', clearHover, { passive: true });

    clearHover();
    state.ui.root.append(reader);
    state.ui.reader = reader;
    state.previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    reader.querySelector('.reader-header button').focus({ preventScroll: true });
  }

  function closeReaderMode() {
    if (!state.ui?.reader) return;
    state.ui.reader.remove();
    state.ui.reader = null;
    document.documentElement.style.overflow = state.previousOverflow ?? '';
    state.previousOverflow = null;
    clearHover();
  }

  function extractReadableBlocks(containers) {
    const seen = new Set();
    const blocks = [];

    for (const container of containers) {
      for (const node of container.querySelectorAll(READER_BLOCK_SELECTOR)) {
        if (node.closest(READER_SKIP_SELECTOR)) continue;
        // Nested matches (a <p> inside an <li>) are already covered by the outer block's text.
        const outer = node.parentElement?.closest(READER_BLOCK_SELECTOR);
        if (outer && container.contains(outer)) continue;

        const text = (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ');
        const heading = /^H[1-6]$/.test(node.tagName);
        if (text.length < (heading ? 2 : 12) || seen.has(text)) continue;
        seen.add(text);
        blocks.push({ tag: heading ? (node.tagName === 'H1' ? 'h1' : node.tagName <= 'H3' ? 'h2' : 'h3') : 'p', text });
      }
    }

    if (blocks.length >= 2) return blocks.slice(0, 400);

    return containers
      .map(container => (container.innerText || container.textContent || '').trim())
      .join('\n')
      .split(/\n{2,}|(?<=[.!?])\s+(?=\p{Lu})/u)
      .map(text => text.trim().replace(/\s+/g, ' '))
      .filter(text => text.length > 12)
      .filter(text => !seen.has(text) && seen.add(text))
      .slice(0, 400)
      .map(text => ({ tag: 'p', text }));
  }

  // Only used for reader-mode text, which lysdexi owns; the page's own DOM is never rewritten.
  function wordFragment(text) {
    const fragment = document.createDocumentFragment();
    for (const part of text.split(/(\p{L}[\p{L}\p{M}'’-]*)/u)) {
      if (!part) continue;
      if (/^\p{L}/u.test(part)) {
        const span = createElement('span', 'w');
        span.textContent = part;
        fragment.append(span);
      } else {
        fragment.append(part);
      }
    }
    return fragment;
  }

  // ---------------------------------------------------------------------------
  // Helpers

  function createElement(tag, className) {
    const el = document.createElement(tag);
    el.className = className;
    return el;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hexToRgb(value) {
    const match = String(value || '').match(/^#?([0-9a-f]{6})$/i);
    const hex = match ? match[1] : '5fb9ad';
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
})();
