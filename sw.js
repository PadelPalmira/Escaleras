/* ==========================================================================
   Service worker de Escaleras Padel Palmira
   --------------------------------------------------------------------------
   Hace DOS cosas y nada mas: recibir los avisos push y abrir la app cuando
   el jugador toca uno. Tambien es lo que permite instalar la app en la
   pantalla de inicio (sin service worker, Android no ofrece "Instalar" y en
   iPhone el push no existe).

   A PROPOSITO NO GUARDA NADA EN CACHE y no tiene handler de 'fetch'.
   Esta app se sirve en GitHub Pages y ya nos mordio una vez el caso de un
   navegador con un archivo viejo y otro nuevo al mismo tiempo: la app no
   arrancaba. Un service worker que cachee los modulos convierte ese
   problema en permanente y sin forma de que el jugador lo arregle. Si algun
   dia se quiere modo offline, se hace con un manifiesto de version explicito
   y borrando el cache viejo en 'activate' — nunca con un cache-first a secas.
   ========================================================================== */

const VERSION = '2.6.0';

self.addEventListener('install', (event) => {
  // Entra en vigor de inmediato: un SW viejo esperando no sirve de nada
  // cuando lo unico que hace es entregar avisos.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Por si una version futura (o una prueba) llego a dejar caches: se
    // limpian, para que nunca quede un modulo viejo servido desde aqui.
    try {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
    } catch { /* si no hay Cache API, no hay nada que limpiar */ }
    await self.clients.claim();
  })());
});

/* A que pantalla manda cada tipo de aviso. Si el tipo no esta aqui, al
   Inicio: siempre es mejor abrir la app que no abrir nada. */
const RUTA_POR_TIPO = {
  recordatorio_noche: '#/convocatorias',
  convocatoria_abierta: '#/convocatorias',
  cupo_en_riesgo: '#/convocatorias',
  lugar_liberado: '#/convocatorias',
  invitacion_pareja: '#/convocatorias',
  promocion_lista_espera: '#/convocatorias',
  pareja_vencida: '#/convocatorias',
  pareja_cancelada: '#/convocatorias',
  escalera_cancelada: '#/convocatorias',
  privilegio_perdido: '#/convocatorias',
  liguilla_calificado: '#/liguilla',
  liguilla_draft: '#/liguilla',
  liguilla_pick: '#/liguilla',
};

self.addEventListener('push', (event) => {
  // El cuerpo lo cifra y lo manda la edge function 'enviar-push':
  // { titulo, cuerpo, tipo }. Si por lo que sea llegara vacio o ilegible,
  // igual se muestra algo: un push que no pinta nada deja al jugador sin
  // el aviso y encima algunos navegadores lo castigan.
  let datos = {};
  try { datos = event.data ? event.data.json() : {}; }
  catch { datos = { cuerpo: event.data ? event.data.text() : '' }; }

  const titulo = datos.titulo || 'Escaleras Palmira';
  const tipo = datos.tipo || 'general';
  const opciones = {
    body: datos.cuerpo || '',
    icon: 'assets/img/icon-192.png',
    badge: 'assets/img/favicon-32.png',
    lang: 'es-MX',
    // Un tag por tipo: si llegan dos avisos del mismo tipo, el nuevo
    // reemplaza al viejo en vez de apilar tres copias de lo mismo.
    tag: `pp-${tipo}`,
    renotify: true,
    data: { ruta: RUTA_POR_TIPO[tipo] || '#/inicio', tipo },
  };
  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ruta = (event.notification.data && event.notification.data.ruta) || '#/inicio';

  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Si ya tiene la app abierta, se reusa esa ventana: abrir una segunda
    // pestana de la misma app es de las cosas que mas molestan.
    for (const c of abiertas) {
      if (c.url.includes(self.registration.scope) || c.url.includes('/Escaleras/')) {
        try {
          await c.focus();
          if ('navigate' in c) await c.navigate(self.registration.scope + ruta);
          return;
        } catch { /* si no deja navegar, al menos quedo enfocada */ }
        return;
      }
    }
    await self.clients.openWindow(self.registration.scope + ruta);
  })());
});

/* Algunos navegadores rotan la suscripcion por su cuenta. Cuando pasa, la
   vieja deja de servir: se avisa a la app abierta para que vuelva a
   suscribir y guardar la nueva. Si no hay ninguna ventana abierta, se
   recupera sola la proxima vez que el jugador entre (app.js lo revisa). */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    abiertas.forEach((c) => c.postMessage({ tipo: 'resuscribir-push' }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') {
    event.source && event.source.postMessage({ tipo: 'version', version: VERSION });
  }
});
