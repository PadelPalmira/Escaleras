import { el, formatFecha, formatHora, toast, humanizeError, openSheet, confirmSheet } from '../utils.js';
import {
  getMyProfile, getMiCategoria, getProximasEscaleras, getMisRegistros,
  registrarJugador, cancelarRegistro, asignarSustituto, responderInvitacionPareja,
  getJugadoresParaPareja,
} from '../api.js';

const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };

const STATUS_LABEL = {
  confirmed: { text: 'Confirmado', cls: 'badge-success' },
  waitlist: { text: 'Lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Sustituto', cls: 'badge-success' },
  declined: { text: 'Declinado', cls: 'badge-neutral' },
  cancelled_ontime: { text: 'Cancelado', cls: 'badge-neutral' },
  cancelled_late: { text: 'Cancelado tarde', cls: 'badge-danger' },
  no_show: { text: 'No asististe', cls: 'badge-danger' },
};

export async function renderConvocatorias() {
  const [profile, escaleras, misRegistros] = await Promise.all([
    getMyProfile(), getProximasEscaleras(8), getMisRegistros({ soloFuturas: true }),
  ]);
  const categoria = profile ? await getMiCategoria(profile.id) : null;
  const miCategoriaActual = categoria ? categoria.category : null;

  const registroPorEscalera = new Map();
  misRegistros.forEach((r) => registroPorEscalera.set(r.escalera_id, r));

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Convocatorias'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Confirma tu lugar, busca sustituto o cancela — hasta el corte de cada sesión.'));

  const relevantes = escaleras.filter((esc) => {
    const ws = esc.weekday_schedule;
    if (!ws) return false;
    if (registroPorEscalera.has(esc.id)) return true; // ya tengo un registro aquí: siempre visible, sin importar la categoría actual
    if (ws.format === 'retas_abiertas') return true;
    if (!miCategoriaActual) return true; // sin categoría calculada aún: mostrar todo
    return ws.category === miCategoriaActual || ws.category === null;
  });

  if (relevantes.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '📅'),
      el('p', {}, 'No hay convocatorias abiertas en los próximos días.'),
    ]));
    return wrap;
  }

  for (const esc of relevantes) {
    wrap.appendChild(renderEscaleraCard(esc, registroPorEscalera.get(esc.id), profile, () => refresh(wrap)));
  }

  async function refresh(oldWrap) {
    const fresh = await renderConvocatorias();
    oldWrap.replaceWith(fresh);
  }

  return wrap;
}

function renderEscaleraCard(esc, miRegistro, profile, onChange) {
  const ws = esc.weekday_schedule;
  const card = el('div', { class: 'card' });

  card.appendChild(
    el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:800;font-size:15.5px;' }, formatFecha(esc.session_date)),
        el('div', { class: 'text-tiny mt-1' }, `${FORMAT_LABEL[ws.format]}${ws.category ? ' · Cat ' + ws.category : ''} · ${formatHora(ws.start_time)}–${formatHora(ws.end_time)}`),
      ]),
      miRegistro ? el('span', { class: `badge ${STATUS_LABEL[miRegistro.status]?.cls || 'badge-neutral'}` }, STATUS_LABEL[miRegistro.status]?.text || miRegistro.status) : null,
    ])
  );

  const actions = el('div', { class: 'stack gap-2 mt-4' });

  if (ws.format === 'retas_abiertas') {
    actions.appendChild(el('p', { class: 'text-muted' }, '100% social, sin categoría ni puntos. Avísale a los del grupo que vas — el registro para Retas Abiertas llega pronto en la app.'));
    card.appendChild(actions);
    return card;
  }

  if (!miRegistro || ['declined', 'cancelled_ontime', 'cancelled_late', 'no_show'].includes(miRegistro.status)) {
    // Sin lugar activo: ofrecer registro
    if (ws.format === 'individual') {
      const btn = el('button', { class: 'btn btn-primary' }, 'Confirmar mi lugar');
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Confirmando…';
        try {
          const res = await registrarJugador(esc.id, profile.id, null);
          toast(res.resultado === 'confirmed' ? '¡Listo, tienes tu lugar!' : 'Quedaste en lista de espera.', 'success');
          onChange();
        } catch (err) {
          toast(humanizeError(err), 'error');
          btn.disabled = false; btn.textContent = 'Confirmar mi lugar';
        }
      });
      actions.appendChild(btn);
    } else if (ws.format === 'parejas') {
      const btn = el('button', { class: 'btn btn-primary' }, 'Registrarme con pareja');
      btn.addEventListener('click', () => abrirSelectorPareja(esc, profile, onChange));
      actions.appendChild(btn);
    }
  } else {
    // Tengo un lugar activo (confirmed / waitlist / substitute)
    if (miRegistro.partner_status === 'pending') {
      actions.appendChild(el('div', { class: 'card', style: 'background:var(--surface-2);' }, [
        el('p', { class: 'text-muted' }, 'Pareja pendiente de confirmar para esta noche.'),
        el('div', { class: 'btn-row mt-3' }, [
          el('button', {
            class: 'btn btn-secondary btn-sm',
            onclick: async (e) => {
              e.target.disabled = true;
              try { await responderInvitacionPareja(miRegistro.id, false); toast('Invitación declinada.', 'info'); onChange(); }
              catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
            },
          }, 'Rechazar'),
          el('button', {
            class: 'btn btn-primary btn-sm',
            onclick: async (e) => {
              e.target.disabled = true;
              try { await responderInvitacionPareja(miRegistro.id, true); toast('¡Pareja confirmada!', 'success'); onChange(); }
              catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
            },
          }, 'Aceptar'),
        ]),
      ]));
    }

    const btnRow = el('div', { class: 'btn-row' });
    const btnSub = el('button', { class: 'btn btn-secondary btn-sm' }, 'Buscar sustituto');
    btnSub.addEventListener('click', () => abrirSelectorSustituto(miRegistro, profile, onChange));
    const btnCancel = el('button', { class: 'btn btn-danger btn-sm' }, 'Cancelar');
    btnCancel.addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: '¿Cancelar tu lugar?',
        body: 'Si cancelas con poco tiempo de anticipación puede aplicar una penalización de puntos, según el reglamento.',
        confirmLabel: 'Sí, cancelar',
        danger: true,
      });
      if (!ok) return;
      try {
        const resultado = await cancelarRegistro(miRegistro.id);
        const msg = resultado === 'cancelled_late' ? 'Cancelado — al ser tan cerca de la sesión, aplica penalización según el reglamento.' : 'Cancelado sin penalización.';
        toast(msg, resultado === 'cancelled_late' ? 'error' : 'success');
        onChange();
      } catch (err) { toast(humanizeError(err), 'error'); }
    });
    if (ws.format === 'individual') btnRow.appendChild(btnSub);
    btnRow.appendChild(btnCancel);
    actions.appendChild(btnRow);
  }

  card.appendChild(actions);
  return card;
}

async function abrirSelectorPareja(esc, profile, onChange) {
  const jugadores = await getJugadoresParaPareja(esc.id, profile.id);
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Elige a tu pareja'));
  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:44vh;overflow-y:auto;' });

  function draw(filter = '') {
    list.innerHTML = '';
    const f = filter.trim().toLowerCase();
    jugadores.filter((j) => !f || (j.full_name || '').toLowerCase().includes(f)).slice(0, 30).forEach((j) => {
      list.appendChild(el('button', {
        class: 'chip-btn',
        onclick: async () => {
          try {
            const res = await registrarJugador(esc.id, profile.id, j.id);
            toast(res.resultado === 'confirmed' ? '¡Listo! Esperando que tu pareja acepte.' : 'Quedaron en lista de espera.', 'success');
            handle.close();
            onChange();
          } catch (err) { toast(humanizeError(err), 'error'); }
        },
      }, j.full_name || '(sin nombre)'));
    });
    if (list.children.length === 0) list.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
  }
  draw();
  search.addEventListener('input', () => draw(search.value));
  content.appendChild(search);
  content.appendChild(list);
  const handle = openSheet(content);
}

async function abrirSelectorSustituto(miRegistro, profile, onChange) {
  const jugadores = await getJugadoresParaPareja(miRegistro.escalera_id, profile.id);
  let esCoach = false;
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Buscar sustituto'));
  const infoTxt = el('p', { class: 'text-muted mb-3' }, 'Tu sustituto recibe el 34% de los puntos que gane; tú conservas el 66%.');
  content.appendChild(infoTxt);

  const coachToggle = el('button', { class: 'chip-btn mb-3' }, '☐ Es un coach del club cubriendo una emergencia');
  coachToggle.addEventListener('click', () => {
    esCoach = !esCoach;
    coachToggle.classList.toggle('selected', esCoach);
    coachToggle.textContent = esCoach ? '☑ Es un coach del club cubriendo una emergencia' : '☐ Es un coach del club cubriendo una emergencia';
    infoTxt.textContent = esCoach
      ? 'El coach no gana puntos. Tú recibes la penalización completa según el tiempo de aviso — como si no hubieras conseguido sustituto.'
      : 'Tu sustituto recibe el 34% de los puntos que gane; tú conservas el 66%.';
  });
  content.appendChild(coachToggle);

  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:36vh;overflow-y:auto;' });

  function draw(filter = '') {
    list.innerHTML = '';
    const f = filter.trim().toLowerCase();
    jugadores.filter((j) => !f || (j.full_name || '').toLowerCase().includes(f)).slice(0, 30).forEach((j) => {
      list.appendChild(el('button', {
        class: 'chip-btn',
        onclick: async () => {
          try {
            await asignarSustituto(miRegistro.id, j.id, esCoach);
            toast(`${j.full_name} jugará en tu lugar.`, 'success');
            handle.close();
            onChange();
          } catch (err) { toast(humanizeError(err), 'error'); }
        },
      }, j.full_name || '(sin nombre)'));
    });
    if (list.children.length === 0) list.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
  }
  draw();
  search.addEventListener('input', () => draw(search.value));
  content.appendChild(search);
  content.appendChild(list);

  const handle = openSheet(content);
}
