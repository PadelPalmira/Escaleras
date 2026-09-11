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

  let procesando = false;
  async function procesarCodigo(texto) {
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
      pintarManual('Este navegador no puede leer QR automáticamente con la cámara. Escribe el código aquí, o abre esta pantalla desde Chrome en Android.');
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
  iniciarCamara();

  // Si el jugador sale de esta pantalla, apagar la cámara — si no, queda
  // prendida "en secreto" consumiendo batería y dando una mala señal.
  window.addEventListener('hashchange', function limpiar() {
    detenido = true;
    if (streamRef) streamRef.getTracks().forEach((t) => t.stop());
    window.removeEventListener('hashchange', limpiar);
  }, { once: true });

  return wrap;
}
