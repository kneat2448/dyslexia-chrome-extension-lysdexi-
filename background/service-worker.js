importScripts('/shared/settings.js');

const CONTENT_SCRIPTS = [
  'content/syllables.js',
  'content/speech.js',
  'content/article-detector.js',
  'content/ui-styles.js',
  'content/content.js'
];

chrome.runtime.onInstalled.addListener(async () => {
  // Normalizing also migrates older installs: drops compatibilityReports (moved to local storage)
  // and maps the removed "floating-toolbar-only" UI mode back to the default.
  const { settings } = await chrome.storage.sync.get('settings');
  if (Array.isArray(settings?.compatibilityReports) && settings.compatibilityReports.length) {
    const { compatibilityReports = [] } = await chrome.storage.local.get('compatibilityReports');
    await chrome.storage.local.set({
      compatibilityReports: [...compatibilityReports, ...settings.compatibilityReports].slice(0, 25)
    });
  }
  await chrome.storage.sync.set({ settings: dxNormalizeSettings(settings) });
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(tabKey(tabId)).catch(() => {});
});

async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return dxNormalizeSettings(settings);
}

// Serialize read-modify-write cycles so concurrent patches (popup + toolbar + shortcut) don't clobber each other.
let writeQueue = Promise.resolve();
function updateSettings(patch) {
  const run = writeQueue.then(async () => {
    const next = dxNormalizeSettings({ ...(await getSettings()), ...patch });
    await chrome.storage.sync.set({ settings: next });
    return next;
  });
  writeQueue = run.catch(() => {});
  return run;
}

function tabKey(tabId) {
  return `tab:${tabId}`;
}

async function getTabActivation(settings, tabId, url) {
  if (!dxCanRunOn(url)) return false;
  if (settings.activationScope === 'all-tabs') return settings.enabled;
  if (settings.activationScope === 'manual-per-site') return settings.enabledSites.includes(dxSiteKey(url));
  if (tabId == null) return false;
  const stored = await chrome.storage.session.get(tabKey(tabId));
  return !!stored[tabKey(tabId)];
}

async function setTabActivation(tab, enabled) {
  const settings = await getSettings();
  let next = settings;

  if (settings.activationScope === 'current-tab') {
    await chrome.storage.session.set({ [tabKey(tab.id)]: enabled });
  } else if (settings.activationScope === 'manual-per-site') {
    const site = dxSiteKey(tab.url);
    const sites = new Set(settings.enabledSites);
    if (enabled) sites.add(site);
    else sites.delete(site);
    next = await updateSettings({ enabledSites: [...sites] });
  } else {
    next = await updateSettings({ enabled });
  }

  if (enabled) await ensureContentScripts(tab.id);

  if (settings.activationScope === 'current-tab') await notifyTab(tab, next);
  else await broadcastToTabs(next);

  return { settings: next, active: await getTabActivation(next, tab.id, tab.url) };
}

// Tabs that were open before the extension was installed or updated have no content script yet.
async function ensureContentScripts(tabId) {
  const alive = await chrome.tabs.sendMessage(tabId, { type: 'dx-ping' }, { frameId: 0 }).catch(() => null);
  if (alive?.ok) return;
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
}

async function notifyTab(tab, settings) {
  if (!tab?.id || !dxCanRunOn(tab.url)) return;
  const active = await getTabActivation(settings, tab.id, tab.url);
  await chrome.tabs.sendMessage(tab.id, { type: 'dx-settings-updated', settings, active }).catch(() => {});
}

async function broadcastToTabs(settings) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => notifyTab(tab, settings)));
}

const handlers = {
  async 'dx-get-settings'(message, sender) {
    const settings = await getSettings();
    return { settings, active: await getTabActivation(settings, sender.tab?.id, sender.tab?.url) };
  },

  async 'dx-get-tab-state'(message) {
    const tab = await chrome.tabs.get(message.tabId);
    const settings = await getSettings();
    return {
      settings,
      supported: dxCanRunOn(tab.url),
      active: await getTabActivation(settings, tab.id, tab.url)
    };
  },

  async 'dx-update-settings'(message) {
    const settings = await updateSettings(message.patch || {});
    await broadcastToTabs(settings);
    return { settings };
  },

  async 'dx-set-active'(message) {
    const tab = await chrome.tabs.get(message.tabId);
    if (!dxCanRunOn(tab.url)) return { error: 'unsupported-page' };
    return setTabActivation(tab, !!message.enabled);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message?.type];
  if (!handler) return false;

  handler(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ error: String(error?.message || error) }));
  return true;
});

chrome.commands.onCommand.addListener(async (command, commandTab) => {
  const tab = commandTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !dxCanRunOn(tab.url)) return;

  if (command === 'toggle-extension') {
    const settings = await getSettings();
    const active = await getTabActivation(settings, tab.id, tab.url);
    await setTabActivation(tab, !active);
    return;
  }

  if (command === 'speak-selection') {
    await chrome.tabs.sendMessage(tab.id, { type: 'dx-speak-selection' }).catch(() => {});
    return;
  }

  if (command === 'toggle-ruler' || command === 'toggle-reader-mode') {
    const key = command === 'toggle-ruler' ? 'rulerEnabled' : 'readerModeEnabled';
    const settings = await getSettings();
    const next = await updateSettings({ [key]: !settings[key], profile: 'custom' });
    await broadcastToTabs(next);
  }
});
