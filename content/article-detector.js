window.DyslexiaArticleDetector = (() => {
  const CANDIDATE_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.article',
    '.post',
    '.entry-content',
    '.content',
    '#content'
  ];

  const COMPLEX_TEXT_SELECTORS = [
    'p',
    'li',
    'blockquote',
    'figcaption',
    'td',
    'th',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    '[role="article"]',
    '[role="listitem"]',
    '[data-testid*="post" i]',
    '[data-testid*="tweet" i]',
    '[class*="post" i]',
    '[class*="message" i]',
    '[class*="comment" i]',
    '[class*="body" i]',
    '[class*="text" i]'
  ];

  const EXCLUDED_SELECTOR = [
    'nav',
    'aside',
    'header',
    'footer',
    'form',
    'dialog',
    'menu',
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'video',
    'audio',
    '[aria-hidden="true"]',
    '[hidden]',
    '[contenteditable="true"]',
    '.dx-reader-toolbar',
    '.dx-reader-split-popup',
    '.dx-reader-ruler',
    '.dx-reader-mode'
  ].join(',');

  function findContainers() {
    const direct = CANDIDATE_SELECTORS
      .flatMap(selector => [...document.querySelectorAll(selector)])
      .filter(isReadableContainer);

    if (direct.length) return uniqueTopLevel(direct).slice(0, 4);

    const paragraphs = [...document.querySelectorAll('p')]
      .filter(p => wordCount(p.innerText) >= 12);
    const parents = paragraphs
      .map(p => p.closest('article, main, section, div') || p.parentElement)
      .filter(Boolean)
      .filter(isReadableContainer);

    if (parents.length) return uniqueTopLevel(parents).slice(0, 4);

    const complexBlocks = findComplexTextBlocks();
    if (complexBlocks.length) return complexBlocks;

    return isReadableContainer(document.body) ? [document.body] : [];
  }

  function isReadableContainer(node) {
    if (!node || node.closest(EXCLUDED_SELECTOR) || !isVisible(node)) return false;
    const text = (node.innerText || '').trim();
    return wordCount(text) >= 80;
  }

  function findComplexTextBlocks() {
    const blocks = COMPLEX_TEXT_SELECTORS
      .flatMap(selector => [...document.querySelectorAll(selector)])
      .filter(isComplexReadableBlock)
      .sort((a, b) => scoreBlock(b) - scoreBlock(a));

    return compactComplexBlocks(blocks).slice(0, 350);
  }

  function isComplexReadableBlock(node) {
    if (!node || node.closest(EXCLUDED_SELECTOR) || !isVisible(node)) return false;

    const text = (node.innerText || node.textContent || '').trim();
    const words = wordCount(text);
    if (words < 3 || words > 260) return false;

    const rect = node.getBoundingClientRect();
    if (rect.width < 35 || rect.height < 8) return false;

    return /[\p{L}]/u.test(text);
  }

  function compactComplexBlocks(nodes) {
    const picked = [];
    for (const node of [...new Set(nodes)]) {
      if (picked.some(existing => existing.contains(node))) continue;
      if (picked.some(existing => node.contains(existing) && wordCount(node.innerText) > 180)) continue;
      picked.push(node);
    }
    return picked;
  }

  function scoreBlock(node) {
    const text = (node.innerText || node.textContent || '').trim();
    const words = wordCount(text);
    const rect = node.getBoundingClientRect();
    const tagBoost = ['P', 'LI', 'BLOCKQUOTE', 'TD'].includes(node.tagName) ? 30 : 0;
    return words * 2 + Math.min(rect.width, 900) / 30 + tagBoost;
  }

  function uniqueTopLevel(nodes) {
    const unique = [...new Set(nodes)];
    return unique.filter(node => !unique.some(other => other !== node && other.contains(node)));
  }

  function isVisible(node) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function wordCount(text) {
    return (text.match(/\b[\p{L}\p{N}'-]+\b/gu) || []).length;
  }

  return { findContainers };
})();
