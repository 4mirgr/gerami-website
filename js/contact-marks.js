// Keep contact names as selectable text. Only visible copy gets decorative images.
const contactLogos = {
  linkedin: '/assets/optimized/linkedin.e14ad9c44fe2388e.svg',
  gmail: '/assets/optimized/gmail.4e4a8dd4379ec84a.svg',
};
const excluded = 'script,style,template,noscript,textarea,input,select,pre,code,svg,math,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[data-contact-copy]';
// Consume URLs, domains and addresses as units so their component words are never decorated.
const tokens = /(?:https?:\/\/|www\.|mailto:|tel:)\S+|[\w.!#$%&'*+/=?^_`{|}~-]+@[\w-]+(?:\.[\w-]+)+|(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?|(?<![\p{L}\p{N}_])(?:(linkedin|لینکدین|لینکداین)|(?:e[-‐‑]?mails?|gmail|ای[‌ -]?میل|جی[‌ -]?میل|پست\s+الکترونیکی?))(?![\p{L}\p{N}_])/giu;

function decorate(text) {
  if (!/mail|میل|لینکد|linkedin|الکترونیک/i.test(text.data)) return;
  let copy, offset = 0;
  for (const token of text.data.matchAll(tokens)) {
    const word = token[0];
    const address = /^[^@\s]+@gmail\.com$/i.test(word) && !word.includes(':');
    if (!address && !token[1] && /[@.:/]/.test(word)) continue;
    const brand = token[1] ? 'linkedin' : 'gmail';
    copy ??= document.createElement('span');
    copy.append(text.data.slice(offset, token.index));
    const phrase = document.createElement('span');
    phrase.className = 'contact-word';
    if (address) phrase.dir = 'ltr';
    const icon = document.createElement('img');
    icon.className = brand + '-mark';
    icon.src = contactLogos[brand];
    icon.alt = '';
    icon.width = icon.height = 13;
    icon.loading = 'lazy';
    phrase.append(icon, word);
    copy.append(phrase);
    offset = token.index + word.length;
  }
  if (!copy) return;
  copy.dataset.contactCopy = '';
  copy.append(text.data.slice(offset));
  text.replaceWith(copy);
}

function scan(node) {
  if (!node.isConnected || !node.parentElement || node.parentElement.closest(excluded)) return;
  if (node.nodeType === Node.TEXT_NODE) { decorate(node); return; }
  if (node.nodeType !== Node.ELEMENT_NODE || node.matches(excluded)) return;
  // Static templates already show icons without JavaScript. Repaint them inline
  // at the exact word once their translated sentence is available.
  if (node.matches('img.linkedin-mark,img.gmail-mark')) { node.remove(); return; }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(child) {
      if (child.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      if (child.matches(excluded)) return NodeFilter.FILTER_REJECT;
      return child.matches('img.linkedin-mark,img.gmail-mark') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const hits = [];
  while (walker.nextNode()) hits.push(walker.currentNode);
  for (const hit of hits) {
    if (hit.nodeType === Node.TEXT_NODE) decorate(hit);
    else hit.remove();
  }
}

scan(document.body);
new MutationObserver(records => {
  for (const record of records) {
    const parent = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
    const copy = parent?.closest('[data-contact-copy]');
    if (copy?.isConnected) {
      // A renderer may edit a text node in place rather than replace the label.
      copy.replaceWith(copy.textContent);
    } else if (record.type === 'characterData') scan(record.target);
    else for (const child of record.addedNodes) scan(child);
  }
}).observe(document.body, {subtree:true, childList:true, characterData:true});
