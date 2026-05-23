(() => {
  const state = {
    settings: null,
    active: false,
    containers: [],
    originalNodes: new Map(),
    toolbar: null,
    ruler: null,
    splitPopup: null,
    readerMode: null,
    currentWord: '',
    selectedText: '',
    hoverTargetTimer: null,
    observerTimer: null,
    applying: false,
    cleanup: []
  };

  boot();

  async function boot() {
    const response = await chrome.runtime.sendMessage({ type: 'dx-get-settings' }).catch(() => null);
    state.settings = response?.settings || {};
    state.active = !!response?.active;
    apply();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'dx-ping') {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'dx-speak-selection') {
      const text = getSpeakableText();
      window.DyslexiaSpeech.speak(text, state.settings);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'dx-settings-updated') {
      state.settings = message.settings || state.settings;
      state.active = !!message.active;
      apply();
    }

    if (message.type === 'dx-get-local-active') {
      sendResponse({ active: state.active });
    }
  });

  function apply() {
    if (state.applying) return;
    state.applying = true;
    reset();
    if (!state.active) {
      state.applying = false;
      return;
    }

    const detectedContainers = window.DyslexiaArticleDetector.findContainers();
    if (!detectedContainers.length) {
      state.applying = false;
      return;
    }

    ensureFontFace();
    state.containers = state.settings.readerModeEnabled
      ? [attachReaderMode(detectedContainers)]
      : detectedContainers;

    if (state.settings.openDyslexicEnabled) applyFont();
    if (state.settings.wordSplitEnabled || state.settings.speakerEnabled) wrapWords();
    if (state.settings.wordSplitEnabled) attachSplitPopup();
    if (state.settings.rulerEnabled) attachRuler();
    if (state.settings.speakerEnabled && state.settings.uiMode !== 'popup-only') attachToolbar();
    attachMutationWatcher();
    state.applying = false;
  }

  function reset() {
    window.DyslexiaSpeech?.stop();

    for (const cleanup of state.cleanup.splice(0)) cleanup();

    for (const container of state.containers) {
      container.classList.remove('dx-reader-font');
    }

    for (const [replacement, original] of state.originalNodes.entries()) {
      if (replacement.parentNode) replacement.replaceWith(original);
    }

    state.originalNodes.clear();
    state.containers = [];

    state.toolbar?.remove();
    state.toolbar = null;
    state.ruler?.remove();
    state.ruler = null;
    state.splitPopup?.remove();
    state.splitPopup = null;
    state.readerMode?.remove();
    state.readerMode = null;
    state.selectedText = '';
    state.currentWord = '';
    clearTimeout(state.hoverTargetTimer);
    state.hoverTargetTimer = null;
    clearTimeout(state.observerTimer);
    state.observerTimer = null;
  }

  async function persistSettings() {
    await chrome.storage.sync.set({ settings: state.settings });
  }

  function applyFont() {
    for (const container of state.containers) {
      container.classList.add('dx-reader-font');
    }
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

  function wrapWords() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.parentElement?.namespaceURI !== 'http://www.w3.org/1999/xhtml') return NodeFilter.FILTER_REJECT;
          if (!state.containers.some(container => container.contains(node))) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !/\p{L}/u.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest('nav, aside, header, footer, form, dialog, menu, script, style, noscript, code, pre, kbd, samp, input, textarea, select, button, [contenteditable="true"], .dx-reader-toolbar, .dx-reader-split-popup, .dx-reader-ruler')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
      const fragment = wordFragment(node.nodeValue);
      if (!fragment) continue;
      const marker = document.createElement('span');
      marker.className = 'dx-reader-fragment';
      marker.append(fragment);
      state.originalNodes.set(marker, node.cloneNode(true));
      node.replaceWith(marker);
    }

    document.addEventListener('mouseover', onWordHover, true);
    document.addEventListener('mouseout', onWordLeave, true);
    document.addEventListener('click', onWordClick, true);
    document.addEventListener('mouseup', onSelectionChange, true);
    document.addEventListener('selectionchange', onSelectionChange);
    state.cleanup.push(() => {
      document.removeEventListener('mouseover', onWordHover, true);
      document.removeEventListener('mouseout', onWordLeave, true);
      document.removeEventListener('click', onWordClick, true);
      document.removeEventListener('mouseup', onSelectionChange, true);
      document.removeEventListener('selectionchange', onSelectionChange);
    });
  }

  function wordFragment(text) {
    const parts = text.split(/([\p{L}][\p{L}'-]*)/gu);
    if (parts.length <= 1) return null;

    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (/^[\p{L}][\p{L}'-]*$/u.test(part)) {
        const span = document.createElement('span');
        span.className = 'dx-word';
        span.dataset.word = part;
        span.textContent = part;
        fragment.append(span);
      } else {
        fragment.append(document.createTextNode(part));
      }
    }
    return fragment;
  }

  function onWordHover(event) {
    const wordEl = event.target.closest?.('.dx-word');
    if (!wordEl) return;

    const word = wordEl.dataset.word || wordEl.textContent;
    clearTimeout(state.hoverTargetTimer);
    state.hoverTargetTimer = setTimeout(() => {
      if (state.selectedText) return;
      state.currentWord = word;
      updateToolbarWord(word);
    }, 180);

    if (!state.settings.wordSplitEnabled) return;
    const syllables = window.DyslexiaSyllables.split(word);
    showSplitPopup(wordEl, syllables.length > 1 ? syllables.join(' · ') : word);
  }

  function onWordLeave(event) {
    const wordEl = event.target.closest?.('.dx-word');
    if (!wordEl) return;
    clearTimeout(state.hoverTargetTimer);
    state.hoverTargetTimer = null;
    hideSplitPopup();
  }

  function onWordClick(event) {
    const wordEl = event.target.closest?.('.dx-word');
    if (!wordEl || window.getSelection()?.toString().trim()) return;

    const word = wordEl.dataset.word || wordEl.textContent;
    state.selectedText = '';
    state.currentWord = word;
    updateToolbarWord(word);
  }

  function onSelectionChange() {
    const selected = window.getSelection()?.toString().trim();
    if (!selected) return;

    state.selectedText = selected.replace(/\s+/g, ' ');
    state.currentWord = state.selectedText;
    updateToolbarWord(state.selectedText);
  }

  function attachMutationWatcher() {
    const observer = new MutationObserver(mutations => {
      if (!mutations.some(shouldRefreshForMutation)) return;

      clearTimeout(state.observerTimer);
      state.observerTimer = setTimeout(() => {
        if (state.active) apply();
      }, 900);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    state.cleanup.push(() => observer.disconnect());
  }

  function shouldRefreshForMutation(mutation) {
    const target = mutation.target?.nodeType === Node.ELEMENT_NODE
      ? mutation.target
      : mutation.target?.parentElement;

    if (!target || target.closest?.('.dx-reader-toolbar, .dx-reader-split-popup, .dx-reader-ruler, .dx-reader-fragment')) {
      return false;
    }

    const addedText = [...mutation.addedNodes || []].some(node => {
      if (node.nodeType === Node.TEXT_NODE) return /\p{L}/u.test(node.nodeValue || '');
      if (node.nodeType !== Node.ELEMENT_NODE || node.closest?.('.dx-reader-toolbar, .dx-reader-split-popup, .dx-reader-ruler')) return false;
      return /\p{L}/u.test(node.innerText || node.textContent || '');
    });

    return addedText || (mutation.type === 'characterData' && /\p{L}/u.test(mutation.target.nodeValue || ''));
  }

  function attachToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'dx-reader-toolbar';
    toolbar.innerHTML = `
      <span class="dx-reader-toolbar-word">Hover a word</span>
      <button class="dx-reader-ruler-toggle" type="button" title="Toggle reading ruler" aria-label="Toggle reading ruler" aria-pressed="${state.settings.rulerEnabled ? 'true' : 'false'}">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7h16v10H4Z"></path>
          <path d="M8 7v4"></path>
          <path d="M12 7v7"></path>
          <path d="M16 7v4"></path>
        </svg>
      </button>
      <button class="dx-reader-mode-toggle" type="button" title="Toggle clean reader mode" aria-label="Toggle clean reader mode" aria-pressed="${state.settings.readerModeEnabled ? 'true' : 'false'}">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 4h14v16H5Z"></path>
          <path d="M8 8h8"></path>
          <path d="M8 12h8"></path>
          <path d="M8 16h5"></path>
        </svg>
      </button>
      <button class="dx-reader-speak-button" type="button" title="Speak word" aria-label="Speak word">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"></path>
          <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
          <path d="M18.5 5.5a9 9 0 0 1 0 13"></path>
        </svg>
      </button>
    `;
    document.documentElement.append(toolbar);
    state.toolbar = toolbar;
    applyToolbarPosition(toolbar);
    makeToolbarDraggable(toolbar);

    toolbar.querySelector('.dx-reader-ruler-toggle').addEventListener('click', async () => {
      await toggleRulerFromToolbar();
    });

    toolbar.querySelector('.dx-reader-mode-toggle').addEventListener('click', async () => {
      await toggleReaderModeFromToolbar();
    });

    const speakButton = toolbar.querySelector('.dx-reader-speak-button');
    speakButton.addEventListener('pointerdown', event => event.preventDefault());
    speakButton.addEventListener('click', () => {
      window.DyslexiaSpeech.speak(getSpeakableText(), state.settings);
    });
  }

  function applyToolbarPosition(toolbar) {
    const position = state.settings.toolbarPosition;
    if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return;

    const rect = toolbar.getBoundingClientRect();
    toolbar.style.left = `${clamp(position.left, 8, window.innerWidth - rect.width - 8)}px`;
    toolbar.style.top = `${clamp(position.top, 8, window.innerHeight - rect.height - 8)}px`;
    toolbar.style.right = 'auto';
    toolbar.style.bottom = 'auto';
  }

  function makeToolbarDraggable(toolbar) {
    let drag = null;

    const onPointerDown = event => {
      if (event.button !== 0 || event.target.closest('button')) return;

      const rect = toolbar.getBoundingClientRect();
      drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };

      toolbar.classList.add('dragging');
      toolbar.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = event => {
      if (!drag) return;

      const rect = toolbar.getBoundingClientRect();
      const left = clamp(event.clientX - drag.offsetX, 8, window.innerWidth - rect.width - 8);
      const top = clamp(event.clientY - drag.offsetY, 8, window.innerHeight - rect.height - 8);

      toolbar.style.left = `${left}px`;
      toolbar.style.top = `${top}px`;
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
    };

    const onPointerUp = async event => {
      if (!drag) return;

      drag = null;
      toolbar.classList.remove('dragging');
      toolbar.releasePointerCapture?.(event.pointerId);

      const rect = toolbar.getBoundingClientRect();
      state.settings = {
        ...state.settings,
        toolbarPosition: {
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        }
      };
      await persistSettings();
    };

    toolbar.addEventListener('pointerdown', onPointerDown);
    toolbar.addEventListener('pointermove', onPointerMove);
    toolbar.addEventListener('pointerup', onPointerUp);
    toolbar.addEventListener('pointercancel', onPointerUp);
  }

  async function toggleRulerFromToolbar() {
    state.settings = { ...state.settings, rulerEnabled: !state.settings.rulerEnabled };

    if (state.settings.rulerEnabled) {
      attachRuler();
    } else {
      detachRuler();
    }

    const button = state.toolbar?.querySelector('.dx-reader-ruler-toggle');
    button?.setAttribute('aria-pressed', state.settings.rulerEnabled ? 'true' : 'false');
    await persistSettings();
  }

  async function toggleReaderModeFromToolbar() {
    state.settings = { ...state.settings, readerModeEnabled: !state.settings.readerModeEnabled };
    await persistSettings();
    apply();
  }

  function attachReaderMode(sourceContainers) {
    const overlay = document.createElement('div');
    overlay.className = 'dx-reader-mode';
    overlay.innerHTML = `
      <div class="dx-reader-mode-shell">
        <header class="dx-reader-mode-header">
          <div>
            <strong>lysdexi reader</strong>
            <span>clean study view</span>
          </div>
          <button type="button" aria-label="Close reader mode">Close</button>
        </header>
        <main class="dx-reader-mode-content"></main>
      </div>
    `;

    const content = overlay.querySelector('.dx-reader-mode-content');
    const paragraphs = extractReadableParagraphs(sourceContainers);
    for (const paragraph of paragraphs) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      content.append(p);
    }

    overlay.querySelector('button').addEventListener('click', async () => {
      state.settings = { ...state.settings, readerModeEnabled: false };
      await persistSettings();
      apply();
    });

    document.documentElement.append(overlay);
    state.readerMode = overlay;
    return content;
  }

  function extractReadableParagraphs(containers) {
    const blocks = containers
      .flatMap(container => [...container.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, td, th')])
      .map(node => (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' '))
      .filter(text => text.length > 12);

    const fallback = containers
      .map(container => (container.innerText || container.textContent || '').trim())
      .join('\n')
      .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
      .map(text => text.trim().replace(/\s+/g, ' '))
      .filter(text => text.length > 12);

    return [...new Set(blocks.length >= 2 ? blocks : fallback)].slice(0, 220);
  }

  function getSpeakableText() {
    const liveSelection = window.getSelection()?.toString().trim().replace(/\s+/g, ' ');
    return liveSelection || state.selectedText || state.currentWord;
  }

  function attachSplitPopup() {
    const popup = document.createElement('div');
    popup.className = 'dx-reader-split-popup';
    popup.hidden = true;
    document.documentElement.append(popup);
    state.splitPopup = popup;
  }

  function showSplitPopup(wordEl, text) {
    if (!state.splitPopup) return;

    const rect = wordEl.getBoundingClientRect();
    state.splitPopup.textContent = text;
    state.splitPopup.hidden = false;

    const popupRect = state.splitPopup.getBoundingClientRect();
    const top = Math.max(8, rect.top - popupRect.height - 8);
    const left = clamp(rect.left + rect.width / 2 - popupRect.width / 2, 8, window.innerWidth - popupRect.width - 8);

    state.splitPopup.style.top = `${top}px`;
    state.splitPopup.style.left = `${left}px`;
  }

  function hideSplitPopup() {
    if (state.splitPopup) state.splitPopup.hidden = true;
  }

  function updateToolbarWord(word) {
    const label = state.toolbar?.querySelector('.dx-reader-toolbar-word');
    if (label) label.textContent = word || 'Hover a word';
  }

  function attachRuler() {
    detachRuler();
    const ruler = document.createElement('div');
    ruler.className = 'dx-reader-ruler';
    ruler.style.height = `${clamp(Number(state.settings.rulerHeight) || 48, 20, 120)}px`;
    const color = hexToRgb(state.settings.rulerColor || '#5fb9ad');
    ruler.style.background = `rgba(${color.r}, ${color.g}, ${color.b}, 0.16)`;
    ruler.style.borderTopColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.42)`;
    ruler.style.borderBottomColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.42)`;
    document.documentElement.append(ruler);
    state.ruler = ruler;

    const move = event => {
      const height = ruler.offsetHeight || 48;
      ruler.style.top = `${event.clientY - height / 2}px`;
    };

    document.addEventListener('mousemove', move, true);
    ruler._dxCleanup = () => document.removeEventListener('mousemove', move, true);
    state.cleanup.push(ruler._dxCleanup);
  }

  function detachRuler() {
    if (!state.ruler) return;
    state.ruler._dxCleanup?.();
    state.ruler.remove();
    state.ruler = null;
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
