// Shared by the service worker (importScripts) and the popup (<script>).

const DX_DEFAULT_SETTINGS = Object.freeze({
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
  enabledSites: []
});

const DX_PROFILES = Object.freeze({
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
});

const DX_ENUMS = Object.freeze({
  profile: ['custom', ...Object.keys(DX_PROFILES)],
  activationScope: ['current-tab', 'all-tabs', 'manual-per-site'],
  uiMode: ['popup-and-floating-toolbar', 'popup-only']
});

// Coerces anything read from storage or sent by a message into a valid settings object.
// Unknown keys are dropped so stale fields (e.g. the old compatibilityReports) don't linger in sync storage.
function dxNormalizeSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = {};

  for (const [key, fallback] of Object.entries(DX_DEFAULT_SETTINGS)) {
    const value = input[key];
    if (typeof fallback === 'boolean') out[key] = typeof value === 'boolean' ? value : fallback;
    else out[key] = value === undefined ? fallback : value;
  }

  for (const [key, allowed] of Object.entries(DX_ENUMS)) {
    if (!allowed.includes(out[key])) out[key] = DX_DEFAULT_SETTINGS[key];
  }

  out.rulerHeight = dxClampNumber(out.rulerHeight, 20, 120, DX_DEFAULT_SETTINGS.rulerHeight);
  out.speechRate = dxClampNumber(out.speechRate, 0.5, 1.8, DX_DEFAULT_SETTINGS.speechRate);
  out.speechPitch = dxClampNumber(out.speechPitch, 0.5, 2, DX_DEFAULT_SETTINGS.speechPitch);
  out.rulerColor = /^#[0-9a-f]{6}$/i.test(String(out.rulerColor)) ? out.rulerColor : DX_DEFAULT_SETTINGS.rulerColor;

  const pos = out.toolbarPosition;
  out.toolbarPosition = pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)
    ? { left: Math.round(pos.left), top: Math.round(pos.top) }
    : null;

  out.enabledSites = Array.isArray(out.enabledSites)
    ? [...new Set(out.enabledSites.filter(site => typeof site === 'string' && site))]
    : [];

  return out;
}

function dxClampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return fallback;
  return Math.max(min, Math.min(max, number));
}

// Key used for manual-per-site activation. file:// pages have no host, so fall back to the protocol.
function dxSiteKey(url) {
  try {
    const parsed = new URL(url);
    return parsed.host || parsed.protocol;
  } catch {
    return '';
  }
}

// Pages where Chrome refuses to run extension scripts.
function dxCanRunOn(url) {
  if (!url || !/^(https?|file):/i.test(url)) return false;
  try {
    const { host, pathname } = new URL(url);
    if (host === 'chromewebstore.google.com') return false;
    if (host === 'chrome.google.com' && pathname.startsWith('/webstore')) return false;
  } catch {
    return false;
  }
  return true;
}
