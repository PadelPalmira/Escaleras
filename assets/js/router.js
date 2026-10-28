const routes = {};
let currentPath = null;
let mountEl = null;
let onNavigate = null;

export function registerRoute(path, renderFn) {
  routes[path] = renderFn;
}

export function initRouter(mountElement, { onNavigateCb } = {}) {
  mountEl = mountElement;
  onNavigate = onNavigateCb;
  window.addEventListener('hashchange', () => render());
  render();
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) { render(); return; }
  window.location.hash = path;
}

export function currentRoute() {
  return currentPath;
}

async function render() {
  const hash = window.location.hash.replace(/^#/, '') || '/inicio';
  const path = hash.split('?')[0];
  currentPath = path;
  const renderFn = routes[path] || routes['/inicio'];
  mountEl.innerHTML = '';
  mountEl.appendChild(skeletonDeCarga());
  if (onNavigate) onNavigate(path);
  try {
    const node = await renderFn();
    mountEl.innerHTML = '';
    if (node) mountEl.appendChild(node);
  } catch (err) {
    console.error(err);
    mountEl.innerHTML = '';
    const errBox = document.createElement('div');
    errBox.className = 'empty-state';
    errBox.innerHTML = `<div class="emoji">😕</div><p>No se pudo cargar esta sección.</p><p class="text-tiny mt-2">${(err && err.message) || ''}</p>`;
    mountEl.appendChild(errBox);
  }
}

/* Estado de carga (2.6).
   Antes era un spinner chiquito centrado: pantalla vacía y, al llegar los
   datos, un salto. Esto dibuja la silueta de una pantalla típica de la app
   (título, tarjeta grande, subtítulo, dos tarjetas) para que el ojo tenga
   dónde descansar. La clase .skeleton de la hoja de estilos ya existía y no
   se usaba en ningún lado.

   A PROPÓSITO no importa nada de utils.js ni depende de CSS nuevo: cada
   bloque trae su propio fondo en línea, así que si un navegador tiene la
   hoja de estilos vieja cacheada se ve igual (solo sin el brillo que se
   mueve). Un import nuevo aquí sería justo la trampa que ya nos tumbó la
   app una vez: router.js es de los primeros módulos en cargar. */
function skeletonDeCarga() {
  const wrap = document.createElement('div');
  wrap.className = 'stack';
  wrap.style.cssText = 'gap:14px;padding-top:6px;';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  wrap.setAttribute('aria-label', 'Cargando');

  const bloque = (alto, extra) => {
    const d = document.createElement('div');
    d.className = 'skeleton';
    // background-COLOR, no background: el atajo en línea le ganaría al
    // degradado de .skeleton y mataría el brillo que se mueve.
    d.style.cssText = `height:${alto}px;background-color:#1a1a1e;border-radius:16px;${extra || ''}`;
    return d;
  };

  wrap.appendChild(bloque(26, 'width:48%;border-radius:8px;'));
  wrap.appendChild(bloque(128, 'margin-top:4px;'));
  wrap.appendChild(bloque(15, 'width:32%;border-radius:7px;margin-top:8px;'));
  wrap.appendChild(bloque(76));
  wrap.appendChild(bloque(76));
  return wrap;
}
