import {validateCopy} from './core.mjs';

// Publish complete sections, or three consecutive complete question/answer pairs.
// Whole source units keep modifiers, corrections, units and clinical exceptions intact.
export function clinicalEdition(data, topic, history = []) {
 const candidates = [];
 function consider(title, paragraphs, excerpt) {
  const tags = [topic.root.fa, topic.child.fa, 'آموزش پزشکی']
   .map(label => label.replace(/[^\p{L}\p{N} ‌-]+/gu, ' ').trim().replace(/\s+/g, ' '))
   .filter(tag => tag && tag.length <= 45);
  try {
   const copy = validateCopy({title, paragraphs, summary: title, tags, hashtags: tags});
   candidates.push({copy, excerpt});
  } catch {
   // A section that does not fit the post contract must never be silently cut.
  }
 }
 for (const section of data.lesson || []) {
  const parts = section.paragraphs || [];
  if (!section.id || !section.heading || !parts.length || !parts.every(p => p.id && typeof p.text === 'string')) continue;
  const title = section.heading.includes(topic.child.fa) ? section.heading : topic.child.fa + ' | ' + section.heading;
  consider(title, parts.map(p => p.text), {kind: 'lesson', id: section.id, heading: section.heading, item_ids: parts.map(p => p.id)});
 }
 const cards = data.flashcards || [];
 for (let i = 0; i + 2 < cards.length; i += 3) {
  const group = cards.slice(i, i + 3);
  if (!group.every(c => c.id && c.front && c.back)) continue;
  consider(group[0].front, group.map(c => c.front + '\n' + c.back), {kind: 'flashcards', id: group[0].id, item_ids: group.map(c => c.id)});
 }
 const previous = history.filter(row => row.source?.topic_id === topic.source_id);
 const lastUse = candidate => previous.findIndex(row => row.source?.excerpt?.kind === candidate.excerpt.kind && row.source.excerpt.id === candidate.excerpt.id);
 const priority = candidate => candidate.excerpt.kind === 'flashcards' ? 2 : /تشخیص|افتراق|ارزیابی|مراقبت|پیگیری|پایش/.test(candidate.excerpt.heading) ? 0 : 1;
 candidates.sort((a,b) => {
  const x = lastUse(a), y = lastUse(b);
  if (x === -1 && y !== -1) return -1;
  if (y === -1 && x !== -1) return 1;
  return y - x || priority(a) - priority(b);
 });
 return candidates[0] || null;
}
