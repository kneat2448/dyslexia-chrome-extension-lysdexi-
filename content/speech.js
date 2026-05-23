window.DyslexiaSpeech = (() => {
  let utterance = null;

  function speak(text, settings) {
    const clean = String(text || '').trim();
    if (!clean || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = clamp(Number(settings?.speechRate) || 1, 0.5, 1.8);
    utterance.pitch = clamp(Number(settings?.speechPitch) || 1, 0.5, 2);
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    utterance = null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return { speak, stop };
})();
