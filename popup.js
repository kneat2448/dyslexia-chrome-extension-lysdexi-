const DEFAULT_SETTINGS = {
  enabled: false,
  profile: 'custom',
  activationScope: 'current-tab',
  uiMode: 'popup-and-floating-toolbar',
  openDyslexicEnabled: true,
  rulerEnabled: false,
  rulerHeight: 48,
  rulerColor: '#5fb9ad',
  wordSplitEnabled: true,
  speakerEnabled: true,
  readerModeEnabled: false,
  speechRate: 1,
  speechPitch: 1,
  toolbarPosition: null,
  compatibilityReports: [],
  enabledSites: []
};

const els = {
  enabledToggle: document.getElementById('enabledToggle'),
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

const PROFILES = {
  homework: {
    openDyslexicEnabled: true,
    rulerEnabled: true,
    rulerHeight: 52,
    rulerColor: '#5fb9ad',
    wordSplitEnabled: true,
    speakerEnabled: true,
    readerModeEnabled: false,
    speechRate: 0.95,
    speechPitch: 1
  },
  research: {
    openDyslexicEnabled: true,
    rulerEnabled: false,
    rulerHeight: 42,
    rulerColor: '#8bb7a2',
    wordSplitEnabled: true,
    speakerEnabled: true,
    readerModeEnabled: true,
    speechRate: 1,
    speechPitch: 1
  },
  exam: {
    openDyslexicEnabled: true,
    rulerEnabled: true,
    rulerHeight: 36,
    rulerColor: '#d0b36d',
    wordSplitEnabled: false,
    speakerEnabled: false,
    readerModeEnabled: false,
    speechRate: 1,
    speechPitch: 1
  },
  night: {
    openDyslexicEnabled: true,
    rulerEnabled: true,
    rulerHeight: 58,
    rulerColor: '#7aa8a4',
    wordSplitEnabled: true,
    speakerEnabled: true,
    readerModeEnabled: true,
    speechRate: 0.9,
    speechPitch: 0.95
  },
  focus: {
    openDyslexicEnabled: true,
    rulerEnabled: true,
    rulerHeight: 64,
    rulerColor: '#5fb9ad',
    wordSplitEnabled: true,
    speakerEnabled: true,
    readerModeEnabled: true,
    speechRate: 0.9,
    speechPitch: 1
  }
};

let settings = { ...DEFAULT_SETTINGS };
let activeTab = null;
let currentHost = '';
let applying = false;

init();

async function init() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentHost = hostFromUrl(activeTab?.url);

  const stored = await chrome.storage.sync.get('settings');
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  const active = await resolveActiveState();
  render(active);
  bindEvents();
}

function bindEvents() {
  els.enabledToggle.addEventListener('change', () => setEnabled(els.enabledToggle.checked));

  for (const el of [
    els.activationScope,
    els.uiMode,
    els.profileSelect,
    els.fontToggle,
    els.rulerToggle,
    els.splitToggle,
    els.speakerToggle,
    els.readerModeToggle,
    els.rulerHeight,
    els.speechRate,
    els.speechPitch,
    els.rulerColor
  ]) {
    el.addEventListener('change', saveFromUi);
  }

  els.rulerHeight.addEventListener('input', saveFromUi);
  els.rulerColor.addEventListener('input', saveFromUi);
  els.reportIssueBtn.addEventListener('click', saveCompatibilityReport);
  els.resetToolbarBtn.addEventListener('click', resetToolbarPosition);
}

async function setEnabled(enabled) {
  if (!activeTab?.id) return;

  if (settings.activationScope === 'current-tab') {
    await ensureContentScripts();
    await chrome.runtime.sendMessage({ type: 'dx-set-tab-enabled', tabId: activeTab.id, enabled });
    render(enabled);
    return;
  }

  if (settings.activationScope === 'manual-per-site') {
    await chrome.runtime.sendMessage({ type: 'dx-set-site-enabled', host: currentHost, enabled });
    const stored = await chrome.storage.sync.get('settings');
    settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
    render(enabled);
    return;
  }

  settings.enabled = enabled;
  await saveSettings();
  render(enabled);
}

async function saveFromUi(event) {
  if (applying) return;

  const previousScope = settings.activationScope;
  if (event?.target && event.target !== els.profileSelect && els.profileSelect.value !== 'custom') {
    els.profileSelect.value = 'custom';
  }
  const selectedProfile = els.profileSelect.value;
  const profileSettings = selectedProfile === 'custom' ? {} : PROFILES[selectedProfile] || {};
  settings = {
    ...settings,
    ...profileSettings,
    profile: selectedProfile,
    activationScope: els.activationScope.value,
    uiMode: els.uiMode.value,
    openDyslexicEnabled: selectedProfile === 'custom' ? els.fontToggle.checked : profileSettings.openDyslexicEnabled,
    rulerEnabled: selectedProfile === 'custom' ? els.rulerToggle.checked : profileSettings.rulerEnabled,
    wordSplitEnabled: selectedProfile === 'custom' ? els.splitToggle.checked : profileSettings.wordSplitEnabled,
    speakerEnabled: selectedProfile === 'custom' ? els.speakerToggle.checked : profileSettings.speakerEnabled,
    readerModeEnabled: selectedProfile === 'custom' ? els.readerModeToggle.checked : profileSettings.readerModeEnabled,
    rulerHeight: selectedProfile === 'custom' ? Number(els.rulerHeight.value) : profileSettings.rulerHeight,
    rulerColor: selectedProfile === 'custom' ? normalizeColor(els.rulerColor.value, DEFAULT_SETTINGS.rulerColor) : profileSettings.rulerColor,
    speechRate: selectedProfile === 'custom' ? Number(els.speechRate.value) : profileSettings.speechRate,
    speechPitch: selectedProfile === 'custom' ? Number(els.speechPitch.value) : profileSettings.speechPitch
  };

  await saveSettings();
  render(await resolveActiveState());

  if (previousScope !== settings.activationScope) {
    const active = await resolveActiveState();
    render(active);
  } else {
    els.rulerHeightValue.textContent = `${settings.rulerHeight}px`;
  }
}

async function saveSettings() {
  await chrome.runtime.sendMessage({ type: 'dx-save-settings', settings });
}

async function resolveActiveState() {
  if (settings.activationScope === 'all-tabs') return !!settings.enabled;
  if (settings.activationScope === 'manual-per-site') return !!settings.enabledSites?.includes(currentHost);

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'dx-get-local-active' });
    return !!response?.active;
  } catch {
    return false;
  }
}

function render(active) {
  applying = true;
  els.enabledToggle.checked = !!active;
  els.activationScope.value = settings.activationScope;
  els.uiMode.value = settings.uiMode;
  els.profileSelect.value = settings.profile || 'custom';
  els.fontToggle.checked = !!settings.openDyslexicEnabled;
  els.rulerToggle.checked = !!settings.rulerEnabled;
  els.splitToggle.checked = !!settings.wordSplitEnabled;
  els.speakerToggle.checked = !!settings.speakerEnabled;
  els.readerModeToggle.checked = !!settings.readerModeEnabled;
  els.rulerHeight.value = String(settings.rulerHeight);
  els.rulerHeightValue.textContent = `${settings.rulerHeight}px`;
  els.rulerColor.value = normalizeColor(settings.rulerColor, DEFAULT_SETTINGS.rulerColor);
  els.speechRate.value = String(settings.speechRate);
  els.speechPitch.value = String(settings.speechPitch);
  applying = false;
}

async function saveCompatibilityReport() {
  const report = {
    createdAt: new Date().toISOString(),
    host: currentHost || 'unknown',
    urlPattern: safeUrlPattern(activeTab?.url),
    extensionVersion: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    settings: {
      profile: settings.profile,
      activationScope: settings.activationScope,
      readerModeEnabled: settings.readerModeEnabled
    }
  };

  const reports = [report, ...(settings.compatibilityReports || [])].slice(0, 25);
  settings = { ...settings, compatibilityReports: reports };
  await saveSettings();
  flashStatus('Saved a local compatibility report.');
}

async function resetToolbarPosition() {
  settings = { ...settings, toolbarPosition: null };
  await saveSettings();
  flashStatus('Toolbar position reset.');
}

function flashStatus(message) {
  els.statusNote.textContent = message;
  setTimeout(() => {
    els.statusNote.textContent = 'Offline. Settings stay on this device.';
  }, 2200);
}

async function ensureContentScripts() {
  if (!activeTab?.id) return;

  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'dx-ping' });
    return;
  } catch {
    await chrome.scripting.insertCSS({
      target: { tabId: activeTab.id, allFrames: true },
      files: ['content/content.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, allFrames: true },
      files: [
        'content/syllables.js',
        'content/speech.js',
        'content/article-detector.js',
        'content/content.js'
      ]
    });
  }
}

function safeUrlPattern(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

function normalizeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
