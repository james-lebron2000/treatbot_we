const CP1252_REVERSE_MAP = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
};

const MOJIBAKE_CHAR_PATTERN = /[ÃÂâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿŒœŠšŽžƒ]/g;
const MOJIBAKE_SIGNATURES = [
  /ã€/,
  /â‰/,
  /â€”/,
  /å…/,
  /æœ/,
  /çš/,
  /å¤/,
  /é˜/,
  /ç™/,
  /å±/,
  /åˆ/,
  /çº/,
  /ç»/,
  /èƒ/,
  /ï¼/,
  /ï¼ˆ/,
  /ï¼‰/,
  /ä¸/,
  /å­/,
  /åŒ»/,
  /åŽŸ/,
  /é€‚/,
  /ç—‡/,
  /Î¼/,
  /Î±/,
  /Î²/
];

const countMatches = (text, pattern) => {
  const hit = `${text || ''}`.match(pattern);
  return hit ? hit.length : 0;
};

const trimControlChars = (text) => `${text || ''}`.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

const isLikelyMojibake = (text) => {
  if (!text) {
    return false;
  }
  const weirdCount = countMatches(text, MOJIBAKE_CHAR_PATTERN);
  const replacementCount = countMatches(text, /�/g);
  const cjkCount = countMatches(text, /[\u4e00-\u9fff]/g);
  const hasSignature = MOJIBAKE_SIGNATURES.some((pattern) => pattern.test(text));
  return weirdCount + replacementCount >= 2 || hasSignature || (weirdCount >= 1 && cjkCount === 0);
};

const toCp1252Buffer = (text) => {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0xff) {
      bytes.push(code);
    } else if (Object.prototype.hasOwnProperty.call(CP1252_REVERSE_MAP, code)) {
      bytes.push(CP1252_REVERSE_MAP[code]);
    } else {
      bytes.push(0x3f);
    }
  }
  return Buffer.from(bytes);
};

const readabilityScore = (text) => {
  const cjkCount = countMatches(text, /[\u4e00-\u9fff]/g);
  const weirdCount = countMatches(text, MOJIBAKE_CHAR_PATTERN);
  const replacementCount = countMatches(text, /�/g);
  const punctuationBonus = countMatches(text, /[（）《》、：；，。]/g);
  return cjkCount * 3 + punctuationBonus - weirdCount * 2 - replacementCount * 4;
};

const collectDecodeCandidates = (text) => {
  const queue = [text];
  const visited = new Set();
  const candidates = [];

  while (queue.length > 0 && candidates.length < 6) {
    const current = trimControlChars(queue.shift());
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    candidates.push(current);

    const decoded = trimControlChars(toCp1252Buffer(current).toString('utf8'));
    if (decoded && !visited.has(decoded)) {
      queue.push(decoded);
    }
  }

  return candidates;
};

const safeText = (value) => {
  const raw = trimControlChars(`${value || ''}`);
  if (!raw || !isLikelyMojibake(raw)) {
    return raw;
  }

  const candidates = collectDecodeCandidates(raw);
  let best = raw;
  let bestScore = readabilityScore(raw);

  candidates.forEach((candidate) => {
    const score = readabilityScore(candidate);
    if (score > bestScore + 1) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
};

const normalizeStringArray = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return [safeText(value)].filter(Boolean);
  }
  return [];
};

const toPlainObject = (value) => {
  if (!value) {
    return {};
  }
  if (typeof value.get === 'function') {
    return value.get({ plain: true });
  }
  return { ...value };
};

const sanitizeTrial = (trial) => {
  const source = toPlainObject(trial);
  return {
    ...source,
    id: safeText(source.id),
    name: safeText(source.name),
    phase: safeText(source.phase),
    type: safeText(source.type),
    indication: safeText(source.indication),
    institution: safeText(source.institution),
    location: safeText(source.location),
    description: safeText(source.description),
    contact_phone: safeText(source.contact_phone),
    inclusion_criteria: normalizeStringArray(source.inclusion_criteria),
    exclusion_criteria: normalizeStringArray(source.exclusion_criteria)
  };
};

module.exports = {
  safeText,
  normalizeStringArray,
  sanitizeTrial
};
