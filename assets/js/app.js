import { supabase } from './supabaseClient.js';
import { el, qs } from './utils.js';
import { icon } from './icons.js';
import { registerRoute, initRouter, navigate, currentRoute } from './router.js';
import { getMyProfile, esAdminOMaestro } from './api.js';
import { renderLoginScreen } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderRanking } from './views/ranking.js';
import { renderConvocatorias } from './views/convocatorias.js';
import { renderReglas } from './views/reglas.js';
import { renderPerfil } from './views/perfil.js';
import { renderLiguilla } from './views/liguilla.js';
import { renderAdmin } from './views/admin.js';
import { renderAdminEscaleras } from './views/admin_escaleras.js';
import { renderAdminLiguilla } from './views/admin_liguilla.js';
import { renderAdminJugadores } from './views/admin_jugadores.js';
import { renderMaestro } from './views/maestro.js';

const NAV_ITEMS_BASE = [
  { path: '/inicio', label: 'Inicio', icon: icon.home },
  { path: '/ranking', label: 'Ranking', icon: icon.ranking },
  { path: '/convocatorias', label: 'Convocatorias', icon: icon.calendar },
  { path: '/reglas', label: 'Reglas', icon: icon.book },
  { path: '/perfil', label: 'Perfil', icon: icon.user },
];
const NAV_ITEM_ADMIN = { path: '/admin', label: 'Admin', icon: icon.shield };

let appEl, headerEl, viewEl, navEl;

function buildShell(navItems) {
  appEl = document.getElementById('app');
  appEl.innerHTML = '';

  headerEl = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [el('span', { class: 'dot' }), 'Escaleras Palmira']),
    el('div', { class: 'header-actions' }),
  ]);

  viewEl = el('main', { id: 'view' });

  navEl = el('nav', { class: 'bottom-nav' });
  navItems.forEach((item) => {
    const btn = el('button', {
      class: 'nav-item',
      onclick: () => navigate(item.path),
    }, [el('span', { html: item.icon }), el('span', {}, item.label)]);
    btn.dataset.path = item.path;
    navEl.appendChild(btn);
  });

  appEl.append(headerEl, viewEl, navEl);
}

function updateActiveNav(path) {
  Array.from(navEl.children).forEach((btn) => {
    // /admin/* y /maestro también resaltan el tab "Admin".
    const active = path === btn.dataset.path || (btn.dataset.path === '/admin' && (path.startsWith('/admin') || path === '/maestro'));
    btn.classList.toggle('active', active);
  });
}

function showLoginScreen() {
  appEl.innerHTML = '';
  appEl.appendChild(renderLoginScreen());
}

async function showApp() {
  // El rol determina si se muestra el tab de Admin — la app nunca confía
  // solo en esto para permisos reales: cada RPC/tabla lo vuelve a exigir
  // en el servidor (RLS + guardas internas). Esto es solo la interfaz.
  let profile = null;
  try { profile = await getMyProfile(); } catch (err) { console.error('No se pudo cargar el perfil para la navegación:', err); }
  const navItems = esAdminOMaestro(profile) ? [...NAV_ITEMS_BASE, NAV_ITEM_ADMIN] : NAV_ITEMS_BASE;

  buildShell(navItems);
  registerRoute('/inicio', renderHome);
  registerRoute('/ranking', renderRanking);
  registerRoute('/convocatorias', renderConvocatorias);
  registerRoute('/reglas', renderReglas);
  registerRoute('/perfil', renderPerfil);
  registerRoute('/liguilla', renderLiguilla);
  registerRoute('/admin', renderAdmin);
  registerRoute('/admin/escaleras', renderAdminEscaleras);
  registerRoute('/admin/liguilla', renderAdminLiguilla);
  registerRoute('/admin/jugadores', renderAdminJugadores);
  registerRoute('/maestro', renderMaestro);
  initRouter(viewEl, { onNavigateCb: updateActiveNav });
}

async function boot() {
  appEl = document.getElementById('app');
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await showApp();
  } else {
    showLoginScreen();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && !appEl.querySelector('.bottom-nav')) {
      showApp();
    } else if (event === 'SIGNED_OUT') {
      showLoginScreen();
    }
  });
}

boot();
