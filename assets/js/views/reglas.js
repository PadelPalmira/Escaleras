import { el, escapeHtml } from '../utils.js';
import { getReglas } from '../api.js';

/** Convierte markdown muy simple (encabezados, listas, negritas) a HTML seguro. */
function simpleMarkdownToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { if (inList) { html += '</ul>'; inList = false; } continue; }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineFmt(line.slice(2))}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line.startsWith('### ')) html += `<h4>${inlineFmt(line.slice(4))}</h4>`;
    else if (line.startsWith('## ')) html += `<h3>${inlineFmt(line.slice(3))}</h3>`;
    else if (line.startsWith('# ')) html += `<h3>${inlineFmt(line.slice(2))}</h3>`;
    else html += `<p>${inlineFmt(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
function inlineFmt(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export async function renderReglas() {
  const secciones = await getReglas();
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Reglas'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'El reglamento completo del club, siempre a la mano.'));

  if (!secciones || secciones.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '📖'), el('p', {}, 'El reglamento se está preparando.')]));
    return wrap;
  }

  let abierta = null;
  const listWrap = el('div', { class: 'stack gap-3' });

  function draw() {
    listWrap.innerHTML = '';
    secciones.forEach((s) => {
      const isOpen = abierta === s.id;
      const card = el('div', { class: 'card card-tappable', onclick: () => { abierta = isOpen ? null : s.id; draw(); } });
      const header = el('div', { class: 'row-between' }, [
        el('div', { style: 'font-weight:700;font-size:15px;' }, s.title),
        el('span', { class: 'text-tiny' }, isOpen ? '−' : '+'),
      ]);
      card.appendChild(header);
      if (isOpen) {
        const body = el('div', { class: 'text-muted mt-3', style: 'font-size:13.5px;line-height:1.6;' });
        body.innerHTML = simpleMarkdownToHtml(s.body_markdown);
        card.appendChild(body);
      }
      listWrap.appendChild(card);
    });
  }
  draw();
  wrap.appendChild(listWrap);
  return wrap;
}
