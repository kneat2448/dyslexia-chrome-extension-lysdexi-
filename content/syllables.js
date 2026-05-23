window.DyslexiaSyllables = (() => {
  const VOWELS = new Set('aeiouy'.split(''));
  const DIGRAPHS = ['tch', 'sch', 'dge', 'tion', 'sion', 'ck', 'ch', 'sh', 'th', 'ph', 'wh', 'gh', 'ng', 'qu'];
  const VALID_ONSETS = new Set([
    'bl', 'cl', 'fl', 'gl', 'pl', 'sl', 'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr', 'wr',
    'sc', 'sk', 'sm', 'sn', 'sp', 'st', 'sw', 'tw', 'dw', 'str', 'scr', 'spl', 'spr',
    'thr', 'chr', 'shr'
  ]);

  function split(word) {
    const clean = (word || '').toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
    if (!clean || clean.length <= 3) return [word];

    const tokens = tokenize(clean);
    const vowelIndexes = tokens.reduce((acc, token, index) => {
      if (token.isVowel) acc.push(index);
      return acc;
    }, []);

    if (vowelIndexes.length <= 1) return [word];

    const splitBefore = new Set();
    for (let v = 0; v < vowelIndexes.length - 1; v++) {
      const left = vowelIndexes[v];
      const right = vowelIndexes[v + 1];
      const between = tokens.slice(left + 1, right);

      if (between.length === 0) {
        const pair = tokens[left].text.slice(-1) + (tokens[right].text[0] || '');
        if (['io', 'ia', 'oa', 'ua', 'uo', 'ae', 'eo'].includes(pair)) splitBefore.add(right);
      } else if (between.length === 1) {
        splitBefore.add(between[0].digraph ? left + 2 : left + 1);
      } else if (between.length === 2) {
        const onset = between[0].text + between[1].text;
        splitBefore.add(VALID_ONSETS.has(onset) && !between[0].digraph ? left + 1 : left + 2);
      } else {
        const last3 = between.slice(-3).map(token => token.text).join('');
        const last2 = between.slice(-2).map(token => token.text).join('');
        if (VALID_ONSETS.has(last3)) splitBefore.add(right - 3);
        else if (VALID_ONSETS.has(last2)) splitBefore.add(right - 2);
        else splitBefore.add(left + 2);
      }
    }

    const splitIndexes = [0, ...splitBefore].sort((a, b) => a - b);
    const syllables = [];
    for (let i = 0; i < splitIndexes.length; i++) {
      const start = splitIndexes[i];
      const end = splitIndexes[i + 1] ?? tokens.length;
      const part = tokens.slice(start, end).map(token => token.text).join('');
      if (part) syllables.push(part);
    }

    return matchCase(word, syllables.length ? syllables : [word]);
  }

  function tokenize(word) {
    const tokens = [];
    let i = 0;
    while (i < word.length) {
      const digraph = DIGRAPHS.find(item => word.startsWith(item, i));
      if (digraph) {
        tokens.push({ text: digraph, isVowel: /[aeiou]/.test(digraph), digraph: true });
        i += digraph.length;
        continue;
      }

      const text = word[i];
      const prev = tokens[tokens.length - 1];
      const isVowel = VOWELS.has(text) || (text === 'y' && i > 0 && !prev?.isVowel);
      tokens.push({ text, isVowel, digraph: false });
      i++;
    }
    return tokens;
  }

  function matchCase(original, parts) {
    if (/^[A-Z]+$/.test(original)) return parts.map(part => part.toUpperCase());
    if (/^[A-Z]/.test(original)) return parts.map((part, index) => index === 0 ? capitalize(part) : part);
    return parts;
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return { split };
})();
