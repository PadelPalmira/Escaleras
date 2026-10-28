/* ==========================================================================
   Avisos al celular (Web Push) — lado del navegador
   --------------------------------------------------------------------------
   Por que existe: al 28 oct 2026 las notificaciones de la app solo vivian
   dentro de la app, y la tabla de lecturas decia lo obvio — de 94 avisos de
   un tipo, 9 leidos. Un recordatorio que solo se ve si ya abriste la app no
   es un recordatorio. El backend de push ya estaba hecho; esto es lo que
   faltaba para que llegue al telefono.

   Reglas que se respetan aqui:
   · Nunca se pide el permiso de golpe al entrar. Los navegadores castigan
     eso y el jugador lo niega para siempre. Solo se pide cuando el jugador
     toca un boton que dice exactamente que va a pasar.
   · En iPhone el push SOLO funciona si la app esta instalada en la pantalla
     de inicio (iOS 16.4+). Se detecta y se le dice, en vez de dejarlo
     picando un boton que no puede funcionar.
   ========================================================================== */

/* api.js se carga en el MOMENTO de usarlo, no arriba con un import
   estático, y se comprueba que la función exista. Motivo: getVapidPublica,
   guardarPushSubscription y borrarPushSubscription son nuevas de este
   deployment. En GitHub Pages un navegador puede tener este archivo nuevo y
   el api.js viejo todavía en caché; con un import estático ese módulo
   reventaría entero. Así, lo único que pasa es que los avisos no se pueden
   prender hasta que el navegador refresque api.js — y la app entra normal. */
async function api(nombre) {
  const mod = await import('./api.js');
  if (typeof mod[nombre] !== 'function') {
    throw new Error('Los avisos todavía no están disponibles. Cierra la app y vuelve a abrirla.');
  }
  return mod[nombre];
}

const RUTA_SW = 'sw.js';

/* ---------------- Deteccion de terreno ---------------- */

export function soportaPush() {
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function esIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se presenta como Mac: se distingue por el soporte tactil.
  return /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/* ¿Esta corriendo como app instalada y no como pestana del navegador? */
export function estaInstalada() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch { /* navegador sin matchMedia util */ }
  return window.navigator.standalone === true;
}

/* En iPhone sin instalar, PushManager ni existe. Esto distingue "no se
   puede en este aparato" de "falta instalarla primero", que es un consejo
   accionable y no un callejon. */
export function faltaInstalarEnIOS() {
  return esIOS() && !estaInstalada();
}

export function permisoActual() {
  if (!('Notification' in window)) return 'no-soportado';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/* ---------------- Service worker ---------------- */

let registroPromesa = null;

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registroPromesa) {
    registroPromesa = navigator.serviceWorker.register(RUTA_SW)
      .catch((err) => { console.error('No se pudo registrar el service worker:', err); return null; });
  }
  return registroPromesa;
}

/* ---------------- Utilidades de llaves ---------------- */

function base64urlABytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (String(s).length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesABase64url(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------------- Alta / baja ---------------- */

/**
 * Pide permiso (si hace falta), suscribe este dispositivo y lo guarda.
 * Devuelve { ok, motivo } — 'motivo' es texto ya listo para mostrarle al
 * jugador cuando algo no se pudo.
 */
export async function activarAvisos() {
  if (!soportaPush()) {
    return { ok: false, motivo: faltaInstalarEnIOS()
      ? 'En iPhone los avisos solo funcionan con la app instalada en tu pantalla de inicio. Abajo te digo cómo.'
      : 'Este navegador no puede recibir avisos. Prueba con Chrome en Android o instalando la app.' };
  }

  const reg = await registrarServiceWorker();
  if (!reg) return { ok: false, motivo: 'No se pudo preparar el servicio de avisos en este dispositivo.' };
  // register() resuelve antes de que el SW este listo para suscribir.
  await navigator.serviceWorker.ready;

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    return { ok: false, motivo: permiso === 'denied'
      ? 'Bloqueaste los avisos para esta app. Se vuelven a activar desde los ajustes del navegador (Notificaciones).'
      : 'No se activaron los avisos.' };
  }

  const llave = await (await api('getVapidPublica'))();
  if (!llave) {
    // Pasa si faltan los secretos del servidor: es un problema nuestro, no
    // del jugador, y decirle "intenta de nuevo" seria mentirle.
    return { ok: false, motivo: 'Los avisos todavía no están configurados del lado del club. Ya lo sabemos y lo estamos arreglando.' };
  }

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Si la suscripcion que ya existe es de otra llave VAPID (p.ej. se roto),
    // no sirve: hay que soltarla antes de pedir una nueva.
    const actual = sub.options && sub.options.applicationServerKey
      ? bytesABase64url(sub.options.applicationServerKey) : null;
    if (actual && actual !== llave) {
      try { await (await api('borrarPushSubscription'))(sub.endpoint); } catch { /* da igual si no estaba */ }
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64urlABytes(llave),
    });
  }

  await guardarSuscripcion(sub);
  return { ok: true };
}

async function guardarSuscripcion(sub) {
  const json = sub.toJSON();
  const guardar = await api('guardarPushSubscription');
  await guardar({
    endpoint: sub.endpoint,
    p256dh: json.keys && json.keys.p256dh,
    auth: json.keys && json.keys.auth,
    userAgent: navigator.userAgent ? navigator.userAgent.slice(0, 300) : null,
  });
}

export async function desactivarAvisos() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  // Primero la base: si se suelta la del navegador y luego falla el borrado,
  // queda un endpoint muerto al que el cron le seguiria hablando.
  try { await (await api('borrarPushSubscription'))(sub.endpoint); } catch (err) {
    console.error('No se pudo borrar la suscripción en la base:', err);
    throw err;
  }
  await sub.unsubscribe();
}

/* ¿Este navegador tiene una suscripcion viva ahora mismo? */
export async function haySuscripcionLocal() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
  } catch { return false; }
}

/* Se llama al arrancar la app. Dos trabajos, los dos silenciosos:
   · registrar el service worker (sin esto no hay "Instalar app" en Android);
   · si el navegador ya tenia permiso y suscripcion, reenviar el endpoint a
     la base por si el navegador lo roto o la fila se quedo sin el. */
export async function sincronizarPushAlArrancar() {
  if (!soportaPush()) return;
  try {
    const reg = await registrarServiceWorker();
    if (!reg) return;
    if (Notification.permission !== 'granted') return;
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await guardarSuscripcion(sub);
  } catch (err) {
    // Nunca debe tumbar el arranque de la app.
    console.error('No se pudo sincronizar el push al arrancar:', err);
  }
}

/* El navegador puede rotar la suscripcion por su cuenta; el SW nos avisa. */
export function escucharRotacionDeSuscripcion() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', async (ev) => {
    if (!ev.data || ev.data.tipo !== 'resuscribir-push') return;
    try { await activarAvisos(); } catch (err) {
      console.error('No se pudo volver a suscribir tras la rotación:', err);
    }
  });
}
