window.DyslexiaSyllables = (() => {
  const VOWELS = new Set('aeiou'.split(''));
  // Consonant clusters kept together as one unit. "Open" ones start the next syllable (fa·ther),
  // "closed" ones end the previous syllable (pick·et, sing·er).
  const OPEN_DIGRAPHS = ['sch', 'ch', 'sh', 'th', 'ph', 'wh', 'qu'];
  const CLOSED_DIGRAPHS = ['tch', 'dge', 'ck', 'ng', 'gh'];
  const DIGRAPHS = [...OPEN_DIGRAPHS, ...CLOSED_DIGRAPHS].sort((a, b) => b.length - a.length);
  // Endings that always form their own syllable.
  const SUFFIX_UNITS = ['tion', 'sion'];
  // Two-consonant clusters that can begin a syllable mid-word (a·pron, se·cret).
  const MEDIAL_ONSETS = new Set(['bl', 'cl', 'fl', 'gl', 'pl', 'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr']);
  const ONSETS = new Set([
    ...MEDIAL_ONSETS, 'sc', 'sk', 'sm', 'sn', 'sp', 'st', 'sw', 'tw', 'dw',
    'str', 'scr', 'spl', 'spr', 'thr', 'chr', 'shr'
  ]);
  const VOWEL_SPLIT_PAIRS = new Set(['io', 'ia', 'oa', 'ua', 'uo', 'eo', 'ya', 'ye', 'yi', 'yo', 'yu']);
  const MORPHEME_SUFFIXES = ['ings', 'ing', 'ness', 'ment', 'ful', 'less'];

  // Returns the word broken into syllables, preserving the original characters (case, apostrophes, hyphens).
  function split(word) {
    const original = String(word || '').normalize('NFC');
    const pieces = [];
    for (const part of original.split(/(?<=-)/)) {
      pieces.push(...splitPart(part));
    }
    return pieces.length ? pieces : [original];
  }

  function splitPart(part) {
    const letters = part.toLowerCase().replace(/[^\p{L}]/gu, '');
    // The rules below are English-only; leave other scripts and accented words whole.
    if (letters.length <= 3 || /[^a-z]/.test(letters)) return [part];
    return mapOntoOriginal(part, syllabify(letters).map(s => s.length));
  }

  function syllabify(word) {
    for (const suffix of MORPHEME_SUFFIXES) {
      if (!word.endsWith(suffix)) continue;
      let stem = word.slice(0, -suffix.length);
      let head = suffix;
      // Doubled consonant before the suffix splits between the pair: run·ning.
      if (stem.length >= 3 && stem.at(-1) === stem.at(-2) && !VOWELS.has(stem.at(-1))) {
        head = stem.at(-1) + head;
        stem = stem.slice(0, -1);
      }
      if (stem.length >= 2 && hasVowel(stem)) return [...syllabify(stem), head];
    }
    return syllabifyRoot(word);
  }

  function syllabifyRoot(word) {
    const tokens = tokenize(word);
    const vowelIndexes = tokens.flatMap((token, index) => (token.isVowel ? [index] : []));
    if (vowelIndexes.length <= 1) return [word];

    const splitBefore = new Set();
    for (let v = 0; v < vowelIndexes.length - 1; v++) {
      const left = vowelIndexes[v];
      const right = vowelIndexes[v + 1];
      const between = tokens.slice(left + 1, right);

      if (tokens[right].suffixUnit) {
        splitBefore.add(right);
      } else if (between.length === 0) {
        const pair = tokens[left].text.slice(-1) + tokens[right].text[0];
        if (VOWEL_SPLIT_PAIRS.has(pair)) splitBefore.add(right);
      } else if (between.length === 1) {
        splitBefore.add(between[0].closed ? left + 2 : left + 1);
      } else if (between.length === 2) {
        const onset = between[0].text + between[1].text;
        const keepTogether = MEDIAL_ONSETS.has(onset) && !between[0].digraph;
        splitBefore.add(keepTogether ? left + 1 : left + 2);
      } else {
        const last3 = between.slice(-3).map(token => token.text).join('');
        const last2 = between.slice(-2).map(token => token.text).join('');
        if (ONSETS.has(last3)) splitBefore.add(right - 3);
        else if (ONSETS.has(last2)) splitBefore.add(right - 2);
        else splitBefore.add(left + 2);
      }
    }

    const splitIndexes = [0, ...[...splitBefore].sort((a, b) => a - b)];
    const syllables = [];
    for (let i = 0; i < splitIndexes.length; i++) {
      const part = tokens.slice(splitIndexes[i], splitIndexes[i + 1] ?? tokens.length).map(t => t.text).join('');
      if (part) syllables.push(part);
    }
    return syllables;
  }

  function tokenize(word) {
    const tokens = [];
    let i = 0;
    while (i < word.length) {
      const suffixUnit = SUFFIX_UNITS.find(item => word.startsWith(item, i) && i + item.length >= word.length - 1);
      if (suffixUnit && i > 0) {
        tokens.push({ text: suffixUnit, isVowel: true, suffixUnit: true });
        i += suffixUnit.length;
        continue;
      }

      const digraph = DIGRAPHS.find(item => word.startsWith(item, i));
      if (digraph) {
        tokens.push({ text: digraph, isVowel: false, digraph: true, closed: CLOSED_DIGRAPHS.includes(digraph) });
        i += digraph.length;
        continue;
      }

      const text = word[i];
      // "y" is a vowel except at the start of a word (yellow): gym, happy, play·er.
      const isVowel = VOWELS.has(text) || (text === 'y' && i > 0);
      tokens.push({ text, isVowel, digraph: false, closed: text === 'x' });
      i++;
    }

    markSilentE(tokens);
    return tokens;
  }

  // make, time, jumped, makes: the final e is silent. table, wanted, boxes: it is not.
  function markSilentE(tokens) {
    const n = tokens.length;
    const vowelCount = tokens.filter(token => token.isVowel).length;
    if (vowelCount < 2) return;

    const last = tokens[n - 1];
    const prev = tokens[n - 2];
    const prev2 = tokens[n - 3];

    if (last.text === 'e' && prev && !prev.isVowel) {
      const consonantLe = prev.text === 'l' && prev2 && !prev2.isVowel;
      if (!consonantLe) last.isVowel = false;
      return;
    }

    // hundred, sacred: a consonant cluster before -ed/-es keeps the e voiced.
    const cluster = n >= 4 && !tokens[n - 4].isVowel && MEDIAL_ONSETS.has(tokens[n - 4].text + prev2?.text);
    if (n >= 3 && tokens[n - 2].text === 'e' && prev2 && !prev2.isVowel && !cluster) {
      if (last.text === 'd' && !['t', 'd'].includes(prev2.text)) tokens[n - 2].isVowel = false;
      if (last.text === 's' && !['s', 'x', 'z', 'c', 'g', 'ch', 'sh', 'dge', 'tch'].includes(prev2.text)) {
        tokens[n - 2].isVowel = false;
      }
    }
  }

  function hasVowel(text) {
    return /[aeiouy]/.test(text);
  }

  // Lay syllable lengths (counted in letters) back onto the original text so punctuation and case survive.
  function mapOntoOriginal(original, lengths) {
    const out = [];
    let piece = '';
    let lettersInPiece = 0;
    let index = 0;

    for (const char of original) {
      if (/\p{L}/u.test(char)) {
        if (lettersInPiece === lengths[index] && index < lengths.length - 1) {
          out.push(piece);
          piece = '';
          lettersInPiece = 0;
          index++;
        }
        lettersInPiece++;
      }
      piece += char;
    }
    if (piece) out.push(piece);
    return out;
  }

  return { split };
})();
