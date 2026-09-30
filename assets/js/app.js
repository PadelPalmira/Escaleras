import { supabase } from './supabaseClient.js';
import { el, qs } from './utils.js';
import { icon } from './icons.js';
import { whatsappHelpUrl } from './config.js';
import { registerRoute, initRouter, navigate, currentRoute } from './router.js';
import { getMyProfile, esAdminOMaestro, contarNotificacionesSinLeer, voyCalificadoLiguilla } from './api.js';
import { renderLoginScreen, renderNuevaPassword } from './views/login.js';
import { renderCompletarPerfil } from './views/completar_perfil.js';
import { renderGuiaApp } from './views/guia_app.js';
import { renderHome } from './views/home.js';
import { renderRanking } from './views/ranking.js';
import { renderConvocatorias, renderConvocatoriaDetalle } from './views/convocatorias.js';
import { renderReglas } from './views/reglas.js';
import { renderPerfil } from './views/perfil.js';
import { renderLiguilla } from './views/liguilla.js';
import { renderAdmin } from './views/admin.js';
import { renderAdminEscaleras } from './views/admin_escaleras.js';
import { renderAdminLiguilla } from './views/admin_liguilla.js';
import { renderAdminJugadores } from './views/admin_jugadores.js';
import { renderAdminEscanearCashback } from './views/admin_escanear_cashback.js';
import { renderMaestro } from './views/maestro.js';

// La Liguilla tiene pestaña propia porque es la meta del mes para todos:
// ahí se ve cuándo es, quién va calificado y cuántos puntos te faltan. Las
// Reglas se mueven a Perfil (se leen una vez, no todos los días) para que la
// barra no se sature — el reglamento sigue completo, solo cambia de puerta.
const NAV_ITEMS_BASE = [
  { path: '/inicio', label: 'Inicio', icon: icon.home },
  { path: '/ranking', label: 'Ranking', icon: icon.ranking },
  { path: '/convocatorias', label: 'Convocatorias', icon: icon.calendar },
  { path: '/liguilla', label: 'Liguilla', icon: icon.trophy },
  { path: '/perfil', label: 'Perfil', icon: icon.user },
];
const NAV_ITEM_ADMIN = { path: '/admin', label: 'Admin', icon: icon.shield };

let appEl, headerEl, viewEl, navEl;
let perfilActual = null;

function buildShell(navItems) {
  appEl = document.getElementById('app');
  appEl.innerHTML = '';

  headerEl = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('img', { class: 'brand-logo', src: 'assets/img/logo-icon-white.png', alt: '' }),
      'Escaleras Palmira',
    ]),
    el('div', { class: 'header-actions' }, [
      el('a', {
        class: 'help-btn', href: whatsappHelpUrl(), target: '_blank', rel: 'noopener',
        title: 'Ayuda por WhatsApp', 'aria-label': 'Ayuda por WhatsApp',
      }, [el('span', { html: icon.whatsapp })]),
    ]),
  ]);

  viewEl = el('main', { id: 'view' });

  // Con la pestaña de Admin son 6 botones y "Convocatorias" ya no cabe a
  // tamaño normal en un teléfono angosto: la clase compacta baja la
  // tipografía lo justo para que ninguna etiqueta se corte.
  navEl = el('nav', { class: `bottom-nav${navItems.length >= 6 ? ' bottom-nav-compact' : ''}` });
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

/* Punto rojo en la pestana Perfil.
   Las notificaciones viven dentro de la app: si nadie las ve, avisos como
   "se abrio un lugar y es tuyo" o "se cancelo la noche" no sirven de nada.
   Esto es lo minimo para que se noten al abrir. */
export async function refrescarAvisos(profile) {
  if (!navEl) return;
  // El id se resuelve de la sesion viva, no del perfil que se capturo al
  // arrancar: si la sesion cambia (o si esta funcion se llama desde un
  // evento, sin argumento) el punto tiene que reflejar a quien esta dentro
  // AHORA, no a quien estaba cuando se armo la barra.
  let pid = (profile && profile.id) || (perfilActual && perfilActual.id) || null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data && data.session && data.session.user) pid = data.session.user.id;
  } catch { /* si falla, nos quedamos con el del arranque */ }
  if (!pid) return;
  let n = 0;
  try { n = await contarNotificacionesSinLeer(pid); } catch { return; }
  const btn = Array.from(navEl.children).find((b) => b.dataset.path === '/perfil');
  if (!btn) return;
  const previo = btn.querySelector('.nav-punto');
  if (previo) previo.remove();
  if (n > 0) {
    btn.style.position = 'relative';
    btn.appendChild(el('span', {
      class: 'nav-punto',
      style: 'position:absolute;top:4px;right:calc(50% - 20px);min-width:17px;height:17px;'
        + 'padding:0 4px;border-radius:9px;background:var(--danger);color:#0b0b0d;'
        + 'font-size:10.5px;font-weight:800;line-height:17px;text-align:center;',
    }, n > 9 ? '9+' : String(n)));
  }
}

/* Brillo dorado en la pestaña Liguilla.
   Si vas dentro del top 12 de tu categoría (o ya saliste en la lista
   oficial del mes), el trofeo de abajo se pone dorado: es un recordatorio
   permanente de que tienes algo en juego. En cuanto sales del corte
   vuelve solo a su color normal. Se revisa al abrir la app y, como el
   lugar solo se mueve cuando se cierra una noche, como mucho una vez por
   minuto al navegar — no en cada toque. */
let ultimoChequeoCalificado = 0;

export async function refrescarBrilloLiguilla({ forzar = false } = {}) {
  if (!navEl) return;
  const ahoraMs = Date.now();
  if (!forzar && ahoraMs - ultimoChequeoCalificado < 60000) return;
  ultimoChequeoCalificado = ahoraMs;
  const btn = Array.from(navEl.children).find((b) => b.dataset.path === '/liguilla');
  if (!btn) return;
  let calificado = false;
  try { calificado = await voyCalificadoLiguilla(); } catch { return; }
  btn.classList.toggle('calificado', calificado);
  btn.title = calificado ? 'Vas calificado a la Liguilla de este mes' : '';
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

  // Nombre completo y celular son obligatorios (además del correo, que ya
  // viene de la cuenta) — si faltan, bloqueamos el resto de la app hasta
  // completarlos (y de paso, dentro de esa misma pantalla, también se pide
  // el nivel de juego — ver completar_perfil.js). Cubre tanto cuentas
  // nuevas como perfiles viejos que se crearon antes de que estos campos
  // fueran requeridos.
  //
  // 2.0: el nivel también es obligatorio, pero SOLO para jugadores. Antes
  // no se revalidaba para nadie, y así se acumularon cuentas a medias: gente
  // que entró con su correo, cerró la pantalla y quedó como registro sin
  // nombre. El staff (maestro/admin) queda fuera a propósito: no juega
  // escaleras, así que pedirle un nivel sería repetir el viejo bug de
  // "pedirle datos de nuevo a cuentas que ya estaban completas".
  // La base también lo exige ahora (trg_guard_perfil_completo): con el
  // perfil a medias no se puede anotar a una noche ni aunque se salte esta
  // pantalla desde otro lado.
  const perfilAMedias = profile && (
    !profile.full_name?.trim()
    || !profile.phone?.trim()
    || (profile.role === 'jugador' && !profile.declared_level)
  );
  if (perfilAMedias) {
    appEl.innerHTML = '';
    appEl.appendChild(renderCompletarPerfil(profile, (updatedProfile, recomendacion) => {
      // Justo después de completar el perfil, un jugador nuevo ve la guía
      // rápida de la app (con su recomendación de nivel ya integrada) antes
      // de entrar — es la única vez que la va a ver.
      appEl.innerHTML = '';
      appEl.appendChild(renderGuiaApp({ profile: updatedProfile, recomendacion, esNuevo: true, onDone: () => showApp() }));
    }));
    return;
  }

  // Un jugador que ya tenía cuenta de antes de que esta guía existiera la ve
  // una sola vez, la primera vez que entra tras esta actualización — para
  // que entienda qué cambió (sobre todo el nuevo sistema de convocatorias y
  // de cancha 1) sin tener que descubrirlo jugando.
  if (profile && !profile.app_guide_seen_at) {
    appEl.innerHTML = '';
    appEl.appendChild(renderGuiaApp({ profile, recomendacion: null, esNuevo: false, onDone: () => showApp() }));
    return;
  }

  perfilActual = profile;
  const navItems = esAdminOMaestro(profile) ? [...NAV_ITEMS_BASE, NAV_ITEM_ADMIN] : NAV_ITEMS_BASE;

  buildShell(navItems);
  registerRoute('/inicio', renderHome);
  registerRoute('/ranking', renderRanking);
  registerRoute('/convocatorias', renderConvocatorias);
  registerRoute('/convocatoria', renderConvocatoriaDetalle);
  registerRoute('/reglas', renderReglas);
  registerRoute('/perfil', renderPerfil);
  registerRoute('/liguilla', renderLiguilla);
  registerRoute('/admin', renderAdmin);
  registerRoute('/admin/escaleras', renderAdminEscaleras);
  registerRoute('/admin/liguilla', renderAdminLiguilla);
  registerRoute('/admin/jugadores', renderAdminJugadores);
  registerRoute('/admin/escanear-cashback', renderAdminEscanearCashback);
  registerRoute('/maestro', renderMaestro);
  initRouter(viewEl, {
    onNavigateCb: (path) => { updateActiveNav(path); refrescarAvisos(profile); refrescarBrilloLiguilla(); },
  });
  refrescarAvisos(profile);
  refrescarBrilloLiguilla({ forzar: true });
}

/* El enlace de "olvide mi contrasena" abre la app con la sesion en modo
   recuperacion: lo unico que falta es que escriba la contrasena nueva. Se
   revisa de dos formas porque el SDK procesa el hash al crearse el cliente
   (a veces antes de que alcancemos a escuchar el evento) y ahi el hash ya
   no esta. */
let enRecuperacion = false;
function esEnlaceDeRecuperacion() {
  const h = String(window.location.hash || '');
  return h.includes('type=recovery');
}
function mostrarNuevaPassword() {
  if (enRecuperacion) return;
  enRecuperacion = true;
  appEl = appEl || document.getElementById('app');
  appEl.innerHTML = '';
  appEl.appendChild(renderNuevaPassword(() => {
    enRecuperacion = false;
    // Limpia el #access_token=... de la barra de direcciones antes de entrar.
    history.replaceState(null, '', window.location.pathname + '#/inicio');
    showApp();
  }));
}

async function boot() {
  appEl = document.getElementById('app');
  const recuperando = esEnlaceDeRecuperacion();
  const { data } = await supabase.auth.getSession();
  if (recuperando && data.session) {
    mostrarNuevaPassword();
    return;
  }
  if (data.session) {
    await showApp();
  } else {
    showLoginScreen();
  }

  // Cualquier pantalla que marque un aviso como leido avisa por aqui para
  // que el punto rojo baje en el momento, sin tener que cambiar de pestana.
  window.addEventListener('avisos-cambiaron', () => { refrescarAvisos(); });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      mostrarNuevaPassword();
    } else if (event === 'SIGNED_IN' && !enRecuperacion && !appEl.querySelector('.bottom-nav')) {
      showApp();
    } else if (event === 'SIGNED_OUT') {
      enRecuperacion = false;
      showLoginScreen();
    }
  });
}

boot();
