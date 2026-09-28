window.DyslexiaSpeech = (() => {
  // Chrome silently stops utterances that run longer than ~15 seconds, so long text is queued in chunks.
  const MAX_CHUNK = 200;

  function speak(text, settings) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const lang = document.documentElement.lang || navigator.language;
    for (const chunk of chunkText(clean)) {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      utterance.rate = clamp(Number(settings?.speechRate) || 1, 0.5, 1.8);
      utterance.pitch = clamp(Number(settings?.speechPitch) || 1, 0.5, 2);
      window.speechSynthesis.speak(utterance);
    }
  }

  function stop() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function chunkText(text) {
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/gu) || [text];
    const chunks = [];
    let current = '';

    const push = piece => {
      if (current && (current + piece).length > MAX_CHUNK) {
        chunks.push(current.trim());
        current = '';
      }
      current += piece;
    };

    for (const sentence of sentences) {
      if (sentence.length <= MAX_CHUNK) push(sentence);
      else for (const word of sentence.split(/(?<=\s)/)) push(word);
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return { speak, stop };
})();
