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

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('settings');
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  } else {
    await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, ...stored.settings } });
  }
});

async function getSettings() {
  const stored = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function getTabActivation(tabId, url) {
  const settings = await getSettings();
  const host = safeHost(url);

  if (settings.activationScope === 'all-tabs') return !!settings.enabled;

  if (settings.activationScope === 'manual-per-site') {
    return !!settings.enabledSites?.includes(host);
  }

  const tabState = await chrome.storage.session.get(`tab:${tabId}`);
  return !!tabState[`tab:${tabId}`];
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

async function broadcastToTabs(settings) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.map(async tab => {
      if (!tab.id || !tab.url || /^(chrome|edge|about):/i.test(tab.url)) return;
      const active = await getTabActivation(tab.id, tab.url);
      await chrome.tabs.sendMessage(tab.id, {
        type: 'dx-settings-updated',
        settings,
        active
      });
    })
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'dx-get-settings') {
      const settings = await getSettings();
      const active = await getTabActivation(sender.tab?.id, sender.tab?.url);
      sendResponse({ settings, active });
      return;
    }

    if (message.type === 'dx-save-settings') {
      const settings = { ...DEFAULT_SETTINGS, ...(message.settings || {}) };
      await chrome.storage.sync.set({ settings });
      await broadcastToTabs(settings);
      sendResponse({ settings });
      return;
    }

    if (message.type === 'dx-command') {
      const settings = await getSettings();
      if (message.command === 'toggle-ruler') settings.rulerEnabled = !settings.rulerEnabled;
      if (message.command === 'toggle-reader-mode') settings.readerModeEnabled = !settings.readerModeEnabled;
      if (message.command === 'speak-selection' && sender.tab?.id) {
        await chrome.tabs.sendMessage(sender.tab.id, { type: 'dx-speak-selection' }).catch(() => {});
        sendResponse({ settings });
        return;
      }
      await chrome.storage.sync.set({ settings });
      await broadcastToTabs(settings);
      sendResponse({ settings });
      return;
    }

    if (message.type === 'dx-set-tab-enabled') {
      await chrome.storage.session.set({ [`tab:${message.tabId}`]: !!message.enabled });
      const settings = await getSettings();
      await chrome.tabs.sendMessage(message.tabId, {
        type: 'dx-settings-updated',
        settings,
        active: !!message.enabled
      }).catch(() => {});
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'dx-set-site-enabled') {
      const settings = await getSettings();
      const sites = new Set(settings.enabledSites || []);
      if (message.enabled) sites.add(message.host);
      else sites.delete(message.host);
      const next = { ...settings, enabledSites: [...sites] };
      await chrome.storage.sync.set({ settings: next });
      await broadcastToTabs(next);
      sendResponse({ settings: next });
      return;
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || /^(chrome|edge|about):/i.test(tab.url)) return;

  if (command === 'toggle-extension') {
    const settings = await getSettings();
    if (settings.activationScope === 'current-tab') {
      const active = !(await getTabActivation(tab.id, tab.url));
      await chrome.storage.session.set({ [`tab:${tab.id}`]: active });
      await chrome.tabs.sendMessage(tab.id, { type: 'dx-settings-updated', settings, active }).catch(() => {});
      return;
    }

    settings.enabled = !settings.enabled;
    await chrome.storage.sync.set({ settings });
    await broadcastToTabs(settings);
    return;
  }

  if (command === 'speak-selection') {
    await chrome.tabs.sendMessage(tab.id, { type: 'dx-speak-selection' }).catch(() => {});
    return;
  }

  if (command === 'toggle-ruler' || command === 'toggle-reader-mode') {
    const settings = await getSettings();
    if (command === 'toggle-ruler') settings.rulerEnabled = !settings.rulerEnabled;
    if (command === 'toggle-reader-mode') settings.readerModeEnabled = !settings.readerModeEnabled;
    await chrome.storage.sync.set({ settings });
    await broadcastToTabs(settings);
  }
});
