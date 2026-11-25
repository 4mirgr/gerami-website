import {searchText} from './site-model.mjs';

// Use whole phrases so, for example, pulmonary hypertension and hypertension stay distinct.
const equivalents = [
 ['copd', 'chronic obstructive pulmonary disease', 'بیماری انسدادی مزمن ریه', 'بیماری مزمن انسدادی ریه', 'بیماری انسداد مزمن ریه', 'انسداد مزمن ریه', 'سی او پی دی'],
 ['asthma', 'آسم', 'اسم ریوی'], ['azotemia', 'azotaemia', 'آزوتمی', 'ازوتمی'],
 ['dysphagia', 'اختلال در بلع', 'اختلال بلع', 'دیسفاژی', 'swallowing difficulties', 'difficulty swallowing'],
 ['spirometry', 'spiromertry lab', 'اسپیرومتری', 'اسپیرومتری ریه'], ['ventilator', 'ونتیلاتور'],
 ['intmed', 'int med', 'اینت مد', 'اینت‌مد'], ['cardiology', 'قلب و عروق'],
 ['kidney', 'kidneys', 'renal', 'کلیه'], ['lung', 'lungs', 'ریه'],
 ['breathlessness', 'shortness of breath', 'تنگی نفس', 'dyspnea', 'dyspnoea'],
 ['hypertension', 'high blood pressure', 'فشار خون بالا', 'پرفشاری خون'],
 ['diabetes', 'دیابت'], ['stroke', 'سکته مغزی'], ['heart failure', 'نارسایی قلبی','نارسایی قلب'],
 ['inhaler','inhalers','اسپری تنفسی','اسپری'],
 ['patient health record', 'پنل پرونده سلامت بیمار', 'پرونده سلامت بیمار'],
];
const plain = value => searchText(String(value || '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const aliases = new Map();
for (const [canonical, ...forms] of equivalents) {
  for (const form of [canonical, ...forms]) aliases.set(plain(form), canonical);
}
const phrases = [...aliases.keys()].sort((a, b) => b.length - a.length);
// Normalized alternatives contain only letters, numbers and spaces.
const pattern = new RegExp('(^| )(' + phrases.join('|') + ')(?= |$)', 'gu');
const normalize = value => plain(value).replace(pattern, (_, space, form) => space + aliases.get(form));
const stopWords = new Set('a an the of for to and in with or on از به در با و یا را برای'.split(' '));
const paths = {
  article: /^\/articles\/(?:[a-z0-9-]+\/){1,3}$/,
  topic: /^\/topics\/(?:[a-z0-9-]+\/){0,2}$/,
  project: /^\/projects#[a-z0-9-]+$/,
  page: /^(?:\/projects|\/pages\/[a-z0-9-]+\.html)$/,
};

function strings(values) {
  return Array.isArray(values) ? values.filter(value => typeof value === 'string') : [];
}

function terms(values) {
  // Padding makes word-boundary lookup cheap while typing in either script.
  return values.map(value => ' ' + normalize(value) + ' ');
}

function excerpt(value) {
  const text = String(value || '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 145 ? text.slice(0, 144).replace(/\s+\S*$/u, '') + '…' : text;
}

export function prepareIndex(data) {
  if (data?.version !== 1 || !Array.isArray(data.rows)) throw Error('Invalid search index');
  const index = [];
  for (const row of data.rows) {
    if (!row || !Object.hasOwn(paths, row.kind) || !paths[row.kind].test(row.url) || !Array.isArray(row.titles)) continue;
    const titles = strings(row.titles);
    const descriptions = strings(row.details);
    const bodies = strings(row.body);
    index.push({
      url: row.url,
      kind: row.kind,
      titles,
      details: [0, 1].map(i => excerpt(descriptions[i] || bodies[i])),
      headings: terms(titles),
      keywords: terms([...strings(row.keywords), ...descriptions]),
      bodies: terms(bodies),
    });
  }
  return index;
}

let loading;
export function loadSearchIndex() {
  if (!loading) {
    loading = fetch('/content/search-index.json', {credentials: 'omit', signal: AbortSignal.timeout(9000)})
      .then(response => {
        if (!response.ok) throw Error('Search unavailable');
        return response.json();
      })
      .then(prepareIndex)
      .catch(error => {
        loading = undefined;
        throw error;
      });
  }
  return loading;
}

function tokenMatch(fields, token) {
  const start = ' ' + token;
  if (fields.some(field => field.includes(start + ' '))) return 1;
  if (token.length >= 3 && fields.some(field => field.includes(start))) return 0.55;
  return 0;
}

function relevance(row, phrase, tokens) {
  let score = 0;
  for (const token of tokens) {
    const best = Math.max(12 * tokenMatch(row.headings, token), 6 * tokenMatch(row.keywords, token),
                          2 * tokenMatch(row.bodies, token));
    if (!best) return 0;
    score += best;
  }
  const whole = ' ' + phrase + ' ';
  if (row.headings.includes(whole)) score += 40;
  else if (row.headings.some(field => field.includes(whole))) score += 18;
  if (tokens.length > 1 && row.bodies.some(field => field.includes(whole))) score += 4;
  return score;
}

export function searchIndex(index, query, lang = 'fa', limit = 6) {
  const phrase = normalize(String(query || '').slice(0, 200));
  const tokens = [...new Set(phrase.split(' ').filter(token => token && !stopWords.has(token)))];
  if (!tokens.length) return [];

  const language = lang === 'en' ? 1 : 0;
  const matches = [];
  for (const row of index) {
    if (!row.titles[language]) continue;
    const score = relevance(row, phrase, tokens);
    if (score > 0) matches.push({row, score});
  }
  matches.sort((a, b) => b.score - a.score ||
    Number(b.row.kind === 'article') - Number(a.row.kind === 'article') || a.row.url.localeCompare(b.row.url));
  return matches.slice(0, Math.max(0, limit)).map(({row}) => ({
    url: row.url,
    kind: row.kind,
    title: row.titles[language],
    detail: row.details[language],
  }));
}
