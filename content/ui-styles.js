// Styles for the lysdexi UI. They live inside a shadow root so page CSS can't restyle the
// toolbar or reader, and our CSS can't leak into the page.
window.DyslexiaUiStyles = `
  :host { all: initial; }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }

  .font { font-family: 'DXOpenDyslexic', 'Comic Sans MS', Arial, sans-serif; }

  .highlight {
    position: fixed;
    z-index: 2147483645;
    pointer-events: none;
    border-radius: 3px;
    background: rgba(53, 184, 170, 0.16);
    box-shadow: 0 0 0 2px rgba(53, 184, 170, 0.12);
  }

  .ruler {
    position: fixed;
    left: 0;
    right: 0;
    top: -200px;
    z-index: 2147483645;
    pointer-events: none;
    border-top: 1px solid transparent;
    border-bottom: 1px solid transparent;
    transition: height 0.12s ease;
  }

  .toolbar {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: min(320px, calc(100vw - 36px));
    padding: 8px;
    border: 1px solid rgba(223, 211, 189, 0.95);
    border-radius: 8px;
    background: #fbf6ec;
    color: #2c2a22;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
    cursor: grab;
    user-select: none;
    touch-action: none;
    font-size: 13px;
    line-height: 1.3;
  }

  .toolbar.dragging { cursor: grabbing; }

  .toolbar-word {
    min-width: 52px;
    max-width: 210px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #756f5f;
  }

  .toolbar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: #ffffff;
    background: #3f948a;
    cursor: pointer;
  }

  .toolbar button:hover { background: #2f7870; }

  .toolbar button:focus-visible,
  .reader button:focus-visible {
    outline: 3px solid #2c2a22;
    outline-offset: 2px;
  }

  .toolbar button[aria-pressed='true'] {
    background: #2f7870;
    box-shadow: inset 0 0 0 2px rgba(255, 250, 240, 0.7);
  }

  .toolbar svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .split-popup {
    position: fixed;
    z-index: 2147483647;
    max-width: min(300px, calc(100vw - 24px));
    padding: 8px 11px;
    border: 1px solid rgba(223, 211, 189, 0.95);
    border-radius: 8px;
    background: #fbf6ec;
    color: #2c2a22;
    box-shadow: 0 10px 26px rgba(44, 42, 34, 0.15);
    font-size: 14px;
    line-height: 1.35;
    pointer-events: none;
    white-space: nowrap;
  }

  .reader {
    position: fixed;
    inset: 0;
    z-index: 2147483644;
    overflow: auto;
    overscroll-behavior: contain;
    background: #f4eddf;
    color: #2c2a22;
    font-family: Verdana, Arial, sans-serif;
  }

  .reader.font { font-family: 'DXOpenDyslexic', 'Comic Sans MS', Arial, sans-serif; }

  .reader-shell {
    width: min(860px, calc(100vw - 32px));
    margin: 0 auto 80px;
  }

  .reader-header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 0;
    background: #f4eddf;
    border-bottom: 1px solid rgba(223, 211, 189, 0.95);
  }

  .reader-header strong,
  .reader-header span { display: block; }

  .reader-header strong { font-size: 16px; }

  .reader-header span {
    margin-top: 2px;
    color: #6b6556;
    font-size: 13px;
  }

  .reader-header button {
    min-height: 36px;
    border: 0;
    border-radius: 8px;
    padding: 0 14px;
    color: #ffffff;
    background: #3f948a;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  .reader-content {
    padding: 22px 0;
    font-size: 20px;
    line-height: 1.85;
    letter-spacing: 0.03em;
    word-spacing: 0.12em;
  }

  .reader-content h1 { font-size: 1.5em; line-height: 1.4; margin: 0 0 0.8em; }
  .reader-content h2 { font-size: 1.25em; line-height: 1.4; margin: 1.4em 0 0.6em; }
  .reader-content h3 { font-size: 1.1em; line-height: 1.4; margin: 1.2em 0 0.5em; }
  .reader-content p { margin: 0 0 1.25em; }
  .reader-content .empty { color: #6b6556; }
  .reader-content .w { border-radius: 3px; }
`;
