import { el, toast, humanizeError, openSheet } from '../utils.js';
import { icon } from '../icons.js';
import { getMyProfile, esAdminOMaestro, redimirCashbackPorToken, redimirTodosLosCashbacksDeJugador } from '../api.js';

/* Recordatorio de conciliación: recepción marca el cashback aquí (queda
   "usado" en el sistema) Y también en Loyverse — así al fin de mes se puede
   comparar lo cobrado contra lo redimido y que cuadre, para que a nadie se
   le ocurra "perdonarse" un cashback sin registrarlo en ningún lado. */
function mostrarResultado({ titulo, detalle, advertencia }) {
  const content = el('div', { style: 'text-align:center;' }, [
    el('div', { style: 'font-size:40px;' }, '✅'),
    el('div', { class: 'sheet-title mt-2' }, titulo),
    detalle ? el('p', { class: 'text-muted' }, detalle) : null,
    el('div', { class: 'card mt-3', style: 'background:var(--surface-2);text-align:left;' }, [
      el('div', { class: 'row gap-2', style: 'align-items:flex-start;' }, [
        el('span', { html: icon.bell, style: 'width:18px;height:18px;color:var(--warning, #fbbf24);flex-shrink:0;margin-top:2px;' }),
        el('div', {}, [
          el('div', { style: 'font-weight:700;font-size:13.5px;' }, 'Recuerda marcar el cashback en Loyverse también'),
          el('p', { class: 'text-tiny mt-1' }, 'Así lo cobrado en Loyverse se puede comparar contra lo redimido aquí al fin de mes.'),
        ]),
      ]),
    ]),
    advertencia ? el('p', { class: 'text-tiny mt-3', style: 'color:var(--warning, #fbbf24);' }, advertencia) : null,
    el('button', { class: 'btn btn-primary mt-4' }, 'Seguir escaneando'),
  ]);
  const btn = content.querySelector('button');
  const handle = openSheet(content);
  btn.addEventListener('click', () => handle.close());
  return handle;
}

export async function renderAdminEscanearCashback() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '🔒'),
      el('p', {}, 'No tienes permiso para ver esta sección.'),
    ]);
  }

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Escanear cashback'));
  wrap.appendChild(el('p', { class: 'text-muted mb-3' }, 'Apunta la cámara al código QR que te enseña el jugador. En cuanto se lea, se marca "usado" solo — no hay que tocar nada más.'));

  const video = el('video', { autoplay: true, playsinline: true, muted: true, style: 'width:100%;border-radius:var(--r-lg);background:#000;display:block;' });
  const camaraCard = el('div', { class: 'card', style: 'padding:0;overflow:hidden;' }, video);
  const estado = el('p', { class: 'text-tiny mt-3', style: 'text-align:center;' }, 'Iniciando cámara…');
  const manualWrap = el('div', { class: 'card mt-3' });

  wrap.appendChild(camaraCard);
  wrap.appendChild(estado);
  wrap.appendChild(manualWrap);

  // Este cuadro de "escríbelo a mano" siempre está disponible — no depende
  // de que la cámara o el lector automático funcionen en ese celular, así
  // recepción nunca se queda sin forma de redimir un cashback.
  function pintarManual(motivo) {
    manualWrap.innerHTML = '';
    manualWrap.appendChild(el('p', { class: 'text-tiny' }, motivo));
    const input = el('input', { class: 'input mt-2', type: 'text', placeholder: 'Pega o escribe el código del cashback' });
    const btn = el('button', { class: 'btn btn-secondary mt-2' }, 'Validar');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await procesarCodigo(input.value.trim());
      btn.disabled = false;
      input.value = '';
    });
    manualWrap.appendChild(input);
    manualWrap.appendChild(btn);
  }
  pintarManual('¿No tienes forma de escanear ahora, o la cámara no lo lee? Escribe el código aquí:');

  // Si llegamos aquí desde el QR (la cámara del celular abrió la liga), el
  // código viene en la dirección: se redime solo, sin que recepción teclee
  // nada. Es justo lo que arregla el escaneo en iPhone.
  const codigoEnLaLiga = (() => {
    const h = String(window.location.hash || '');
    const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : '';
    try { return new URLSearchParams(q).get('c'); } catch { return null; }
  })();

  // Desde el 2.1 el QR del jugador es una LIGA
  // (…#/admin/escanear-cashback?c=CB1:xxxx) para que la cámara nativa del
  // iPhone lo pueda abrir: Safari no trae el lector de códigos que usan
  // Chrome y Android, así que dentro de la app nunca se podía escanear ahí.
  // Aquí se acepta cualquiera de las dos formas: la liga nueva y el código
  // pelón de los QR viejos (o de un screenshot guardado).
  function limpiarCodigo(texto) {
    const t = String(texto || '').trim();
    if (!t) return '';
    if (/^https?:\/\//i.test(t) || t.includes('?c=')) {
      try {
        const q = t.includes('?') ? t.slice(t.indexOf('?') + 1) : '';
        const c = new URLSearchParams(q).get('c');
        if (c) return c.trim();
      } catch { /* si no se puede leer, se usa tal cual */ }
    }
    return t;
  }

  let procesando = false;
  async function procesarCodigo(textoCrudo) {
    const texto = limpiarCodigo(textoCrudo);
    if (!texto || procesando) return;
    procesando = true;
    try {
      if (texto.startsWith('CB1:')) {
        const token = texto.slice(4);
        const r = await redimirCashbackPorToken(token);
        mostrarResultado({
          titulo: `$${Number(r.amount_mxn).toLocaleString('es-MX')} MXN redimido`,
          detalle: `Jugador: ${r.full_name || 'sin nombre'}.`,
        });
      } else if (texto.startsWith('CBALL:')) {
        const playerId = texto.slice(6);
        const r = await redimirTodosLosCashbacksDeJugador(playerId);
        if (r.redimidos === 0 && r.omitidos_por_hoy === 0) {
          toast('Ese jugador no tiene cashbacks vigentes para redimir.', 'warning');
        } else {
          mostrarResultado({
            titulo: r.redimidos > 0 ? `$${Number(r.monto_total).toLocaleString('es-MX')} MXN redimidos (${r.redimidos})` : 'Nada por redimir todavía',
            detalle: r.redimidos > 0 ? `Se marcaron ${r.redimidos} cashback(s) como usados de un solo golpe.` : null,
            advertencia: r.omitidos_por_hoy > 0 ? `Tiene ${r.omitidos_por_hoy} cashback(s) ganado(s) hoy mismo que todavía no puede usar — hasta su próxima visita.` : null,
          });
        }
      } else {
        toast('Ese código no es de un cashback de Escaleras.', 'error');
      }
    } catch (err) {
      toast(humanizeError(err), 'error');
    }
    procesando = false;
  }

  // 'BarcodeDetector' puede existir sin que este navegador de verdad sepa
  // leer QR (getSupportedFormats() vacío) — pasa en Chrome de escritorio sin
  // el componente instalado. Hay que confirmar el formato, no solo la clase.
  async function detectorQRDisponible() {
    if (!('BarcodeDetector' in window)) return false;
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      return formatos.includes('qr_code');
    } catch (err) { return false; }
  }

  let streamRef = null;
  let detenido = false;
  async function iniciarCamara() {
    const soportado = await detectorQRDisponible();
    if (!soportado) {
      camaraCard.style.display = 'none';
      estado.textContent = '';
      pintarManual('Escribe aquí el código del cashback:');
      // iPhone/Safari no traen el lector de QR del navegador. En vez de
      // dejar a recepción tecleando, se le explica el camino que SÍ
      // funciona en cualquier celular: la cámara normal del teléfono lee
      // el QR del jugador (que ahora es una liga) y abre esta pantalla
      // sola, con el cashback ya redimido.
      camaraCard.replaceChildren(el('div', { style: 'padding:18px;' }, [
        el('div', { style: 'font-size:34px;text-align:center;' }, '📷'),
        el('div', { style: 'font-weight:800;font-size:15px;text-align:center;margin-top:6px;' },
          'Usa la cámara normal de tu celular'),
        el('p', { class: 'text-tiny mt-2', style: 'text-align:center;' },
          'Este navegador (Safari en iPhone) no puede leer códigos QR por dentro. '
          + 'Sal de la app, abre la app Cámara de tu celular y apunta al QR del jugador: '
          + 'te va a salir un aviso para abrir la liga y el cashback se redime solo al abrirla.'),
      ]));
      camaraCard.style.background = 'var(--surface-2)';
      return;
    }
    try {
      streamRef = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = streamRef;
      estado.textContent = 'Buscando código…';
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => {
        if (detenido) return;
        try {
          const codigos = await detector.detect(video);
          if (codigos.length > 0 && !procesando) {
            await procesarCodigo(codigos[0].rawValue);
          }
        } catch (err) { /* frame sin código válido — se sigue intentando */ }
        setTimeout(loop, 350);
      };
      loop();
    } catch (err) {
      estado.textContent = 'No se pudo abrir la cámara.';
      pintarManual('No se pudo abrir la cámara (¿permiso denegado?). Escribe el código aquí mientras tanto.');
    }
  }
  if (codigoEnLaLiga) {
    // Llegamos desde el QR: no hay nada que escanear, se redime directo.
    estado.textContent = 'Leyendo el código del QR…';
    camaraCard.style.display = 'none';
    procesarCodigo(codigoEnLaLiga).finally(() => {
      // Se limpia la dirección para que al recargar no intente redimir otra vez.
      history.replaceState(null, '', window.location.pathname + '#/admin/escanear-cashback');
      estado.textContent = '';
      iniciarCamara();
    });
  } else {
    iniciarCamara();
  }

  // Si el jugador sale de esta pantalla, apagar la cámara — si no, queda
  // prendida "en secreto" consumiendo batería y dando una mala señal.
  window.addEventListener('hashchange', function limpiar() {
    detenido = true;
    if (streamRef) streamRef.getTracks().forEach((t) => t.stop());
    window.removeEventListener('hashchange', limpiar);
  }, { once: true });

  return wrap;
}
