import {requiredCredits, safeCreditUrl} from './site-credits.js';

const button = document.getElementById('siteInfoButton');
const dialog = document.getElementById('siteInfoDialog');
const content = document.getElementById('siteInfoDetails');
let loaded = false;
function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
function link(parent, label, url) {
  const safe = safeCreditUrl(url);
  if (!safe) { if (label) parent.append(text('span', label)); return; }
  const a = text('a', label); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a);
}
async function read(url) {
  const response = await fetch(url, {cache: 'no-cache'});
  if (!response.ok) throw Error('Information unavailable');
  return response.json();
}
async function load() {
  try {
    const [info, gallery] = await Promise.all([read('content/site-info.json'), read('content/gallery.json')]);
    const fragment = document.createDocumentFragment();
    const credits = requiredCredits(gallery, info.assets);
    if (credits.length) {
      fragment.append(text('h3', '3D-assets en materialen'));
      const list = document.createElement('ul');
      for (const credit of credits) {
        const item = document.createElement('li');
        item.append(text('strong', credit.title || credit.id));
        if (credit.credit) item.append(text('p', credit.credit));
        const references = document.createElement('p');
        link(references, 'Bron', credit.source);
        if (credit.license) { references.append(' · '); link(references, credit.license, credit.licenseUrl); }
        item.append(references);
        for (const value of [credit.copyright, credit.changes, credit.notice]) if (value) item.append(text('p', value));
        list.append(item);
      }
      fragment.append(list);
    }
    for (const section of info.legal || []) {
      if (!section.text && !section.url) continue;
      if (section.title) fragment.append(text('h3', section.title));
      if (section.text) fragment.append(text('p', section.text));
      if (section.url) link(fragment, section.linkLabel || section.title || 'Meer informatie', section.url);
    }
    content.replaceChildren(fragment); loaded = true;
  } catch {
    content.replaceChildren(text('p', 'De aanvullende informatie kon niet worden geladen.'));
    const retry = text('button', 'Opnieuw proberen'); retry.className = 'text-link'; retry.onclick = load; content.append(retry);
  }
}
button.addEventListener('click', () => { dialog.showModal(); if (!loaded) void load(); });
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
