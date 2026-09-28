const DEFAULT_NOTE = 'Works offline. Nothing you read leaves your browser.';
const MAX_REPORTS = 25;

const els = {
  enabledToggle: document.getElementById('enabledToggle'),
  enabledLabel: document.getElementById('enabledLabel'),
  activationScope: document.getElementById('activationScope'),
  uiMode: document.getElementById('uiMode'),
  profileSelect: document.getElementById('profileSelect'),
  fontToggle: document.getElementById('fontToggle'),
  rulerToggle: document.getElementById('rulerToggle'),
  splitToggle: document.getElementById('splitToggle'),
  speakerToggle: document.getElementById('speakerToggle'),
  readerModeToggle: document.getElementById('readerModeToggle'),
  rulerHeight: document.getElementById('rulerHeight'),
  rulerHeightValue: document.getElementById('rulerHeightValue'),
  rulerColor: document.getElementById('rulerColor'),
  speechRate: document.getElementById('speechRate'),
  speechPitch: document.getElementById('speechPitch'),
  reportIssueBtn: document.getElementById('reportIssueBtn'),
  resetToolbarBtn: document.getElementById('resetToolbarBtn'),
  statusNote: document.getElementById('statusNote')
};

// Popup control -> settings key, and how to read the control's value.
const FIELDS = [
  [els.fontToggle, 'openDyslexicEnabled', el => el.checked],
  [els.rulerToggle, 'rulerEnabled', el => el.checked],
  [els.splitToggle, 'wordSplitEnabled', el => el.checked],
  [els.speakerToggle, 'speakerEnabled', el => el.checked],
  [els.readerModeToggle, 'readerModeEnabled', el => el.checked],
  [els.rulerHeight, 'rulerHeight', el => Number(el.value)],
  [els.rulerColor, 'rulerColor', el => el.value],
  [els.speechRate, 'speechRate', el => Number(el.value)],
  [els.speechPitch, 'speechPitch', el => Number(el.value)]
];

const SCOPE_LABELS = {
  'current-tab': 'On for this tab',
  'all-tabs': 'On for all tabs',
  'manual-per-site': 'On for this site'
};

let settings = dxNormalizeSettings({});
let activeTab = null;
let active = false;
let statusTimer = null;
let pendingPatch = {};
let pendingTimer = null;

init();

async function init() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const state = await send({ type: 'dx-get-tab-state', tabId: activeTab?.id });
  if (state?.settings) {
    settings = state.settings;
    active = !!state.active;
  }
  render();

  if (!state?.supported) {
    els.enabledToggle.disabled = true;
    els.statusNote.textContent = "lysdexi can't run on this page. Browser pages and the Chrome Web Store are off-limits to extensions.";
  }

  bindEvents();
}

function bindEvents() {
  els.enabledToggle.addEventListener('change', () => setEnabled(els.enabledToggle.checked));

  els.activationScope.addEventListener('change', async () => {
    await saveNow({ activationScope: els.activationScope.value });
    const state = await send({ type: 'dx-get-tab-state', tabId: activeTab?.id });
    active = !!state?.active;
    render();
  });

  els.uiMode.addEventListener('change', () => saveNow({ uiMode: els.uiMode.value }));

  els.profileSelect.addEventListener('change', () => {
    const profile = els.profileSelect.value;
    saveNow({ profile, ...(DX_PROFILES[profile] || {}) });
  });

  for (const [el, key, read] of FIELDS) {
    // Sliders, the color picker and number fields fire many events while being adjusted; batch them so
    // we stay under chrome.storage.sync's write quota and don't re-apply every tab on each tick.
    const live = el.type === 'range' || el.type === 'color' || el.type === 'number';
    el.addEventListener(live ? 'input' : 'change', () => {
      if (key === 'rulerHeight') els.rulerHeightValue.textContent = `${el.value}px`;
      const patch = { [key]: read(el), profile: 'custom' };
      els.profileSelect.value = 'custom';
      if (live) saveSoon(patch);
      else saveNow(patch);
    });
  }

  els.reportIssueBtn.addEventListener('click', saveCompatibilityReport);
  els.resetToolbarBtn.addEventListener('click', async () => {
    await saveNow({ toolbarPosition: null });
    flashStatus('Toolbar moved back to the corner.');
  });

  // Flush any batched change if the popup closes mid-adjustment.
  window.addEventListener('pagehide', () => {
    if (pendingTimer) flush();
  });
}

async function setEnabled(enabled) {
  if (!activeTab?.id) return;
  const response = await send({ type: 'dx-set-active', tabId: activeTab.id, enabled });
  if (response?.error || !response?.settings) {
    els.enabledToggle.checked = active;
    flashStatus("Couldn't turn lysdexi on here. Try reloading the page.");
    return;
  }
  settings = response.settings;
  active = !!response.active;
  render();
}

function saveSoon(patch) {
  pendingPatch = { ...pendingPatch, ...patch };
  settings = { ...settings, ...patch };
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(flush, 350);
}

function flush() {
  clearTimeout(pendingTimer);
  pendingTimer = null;
  const patch = pendingPatch;
  pendingPatch = {};
  return send({ type: 'dx-update-settings', patch });
}

async function saveNow(patch) {
  pendingPatch = { ...pendingPatch, ...patch };
  const response = await flush();
  if (response?.settings) settings = response.settings;
  render();
}

function render() {
  els.enabledToggle.checked = active;
  const label = SCOPE_LABELS[settings.activationScope];
  els.enabledLabel.textContent = label;
  els.enabledToggle.setAttribute('aria-label', label);

  els.activationScope.value = settings.activationScope;
  els.uiMode.value = settings.uiMode;
  els.profileSelect.value = settings.profile;
  els.fontToggle.checked = settings.openDyslexicEnabled;
  els.rulerToggle.checked = settings.rulerEnabled;
  els.splitToggle.checked = settings.wordSplitEnabled;
  els.speakerToggle.checked = settings.speakerEnabled;
  els.readerModeToggle.checked = settings.readerModeEnabled;
  els.rulerHeight.value = String(settings.rulerHeight);
  els.rulerHeightValue.textContent = `${settings.rulerHeight}px`;
  els.rulerColor.value = settings.rulerColor;
  els.speechRate.value = String(settings.speechRate);
  els.speechPitch.value = String(settings.speechPitch);
}

async function saveCompatibilityReport() {
  const report = {
    createdAt: new Date().toISOString(),
    site: dxSiteKey(activeTab?.url) || 'unknown',
    path: safePath(activeTab?.url),
    extensionVersion: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    settings: {
      profile: settings.profile,
      activationScope: settings.activationScope,
      uiMode: settings.uiMode,
      readerModeEnabled: settings.readerModeEnabled
    }
  };

  // Reports stay in local storage: they are device-specific and would overflow sync storage's 8 KB item limit.
  const { compatibilityReports = [] } = await chrome.storage.local.get('compatibilityReports');
  await chrome.storage.local.set({ compatibilityReports: [report, ...compatibilityReports].slice(0, MAX_REPORTS) });

  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    flashStatus('Report saved and copied. Paste it into a bug report.');
  } catch {
    flashStatus('Report saved on this device.');
  }
}

function flashStatus(message) {
  els.statusNote.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    els.statusNote.textContent = DEFAULT_NOTE;
  }, 2600);
}

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => null);
}

function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}
