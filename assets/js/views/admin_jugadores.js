import { el, todayISO, formatFecha, formatFechaHora, toast, humanizeError, openSheet, confirmSheet, avatarContent, chipJugador } from '../utils.js';
import {
  getMyProfile, esAdminOMaestro, buscarJugadores,
  getRegistrosActivosDeJugador, asignarSustituto, asignarSustitutoAdmin, marcarNoShow, cancelarRegistro,
  aplicarMulta, marcarMultaEstado, getMisMultas,
  aplicarSuspension, levantarSuspension, getMisSuspensiones,
  getMisCashbacks, redimirCashbackPorToken, redimirTodosLosCashbacksDeJugador,
} from '../api.js';

const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };
const REG_STATUS = {
  confirmed: { text: 'Confirmado', cls: 'badge-success' },
  waitlist: { text: 'Lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Sustituto', cls: 'badge-success' },
  sustituto_pendiente: { text: 'Invitado de sustituto', cls: 'badge-warning' },
};
const FINE_STATUS = { pending: { text: 'Pendiente', cls: 'badge-warning' }, paid: { text: 'Pagada', cls: 'badge-success' }, waived: { text: 'Condonada', cls: 'badge-neutral' } };
const CASHBACK_STATUS = {
  disponible: { text: 'Disponible', cls: 'badge-success' },
  no_disponible_hoy: { text: 'Disponible pronto', cls: 'badge-warning' },
  vencido: { text: 'Vencido', cls: 'badge-neutral' },
  usado: { text: 'Usado', cls: 'badge-neutral' },
};

// Lo último que se escribió en el buscador, para que al volver de una ficha
// la lista quede filtrada igual que como se dejó.
let ultimoFiltro = '';

// Minúsculas y sin acentos/diéresis ("José Ñúñez" → "jose nunez"), para que
// buscar "jose" encuentre a "José" y "nunez" a "Núñez".
function normalizar(txt) {
  return (txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Letra con la que se agrupa a un jugador en la lista (A, B, C… / #).
function letraDe(nombre) {
  const c = normalizar(nombre).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

export async function renderAdminJugadores() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '🔒'), el('p', {}, 'No tienes permiso para ver esta sección.')]);
  }
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Jugadores'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Toca a un jugador para asignar sustituto, aplicar una multa o una suspensión.'));

  const search = el('input', { class: 'input mb-2', type: 'search', placeholder: 'Buscar jugador por nombre…', autocomplete: 'off' });
  search.value = ultimoFiltro;
  wrap.appendChild(search);
  const contador = el('p', { class: 'text-tiny mb-3' }, '');
  wrap.appendChild(contador);
  const listBox = el('div');
  listBox.appendChild(el('div', { class: 'stack', style: 'padding-top:30px;' }, [el('div', { class: 'spinner' })]));
  wrap.appendChild(listBox);

  let jugadores;
  try {
    jugadores = await buscarJugadores(null, 5000);
  } catch (err) {
    listBox.innerHTML = '';
    listBox.appendChild(el('div', { class: 'stack' }, [
      el('p', { class: 'text-muted' }, humanizeError(err)),
      el('button', { class: 'btn btn-secondary', onclick: () => renderAdminJugadores().then((n) => wrap.replaceWith(n)) }, 'Reintentar'),
    ]));
    return wrap;
  }

  // Orden alfabético en español (ignora mayúsculas y acentos; la Ñ va después de la N).
  jugadores = (jugadores || []).slice().sort((a, b) => {
    const an = (a.full_name || '').trim(), bn = (b.full_name || '').trim();
    if (!an !== !bn) return an ? -1 : 1; // los que no tienen nombre, al final
    return an.localeCompare(bn, 'es', { sensitivity: 'base' });
  });

  listBox.innerHTML = '';
  if (jugadores.length === 0) {
    listBox.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Todavía no hay jugadores registrados.')));
    contador.textContent = '';
    return wrap;
  }

  // Se pinta la lista completa una sola vez; al escribir solo se ocultan/muestran
  // filas, así el filtro es instantáneo aunque haya cientos de jugadores.
  const grupos = [];
  let grupoActual = null;
  const card = el('div', { class: 'card', style: 'padding-top:6px;padding-bottom:6px;' });
  jugadores.forEach((j) => {
    const letra = letraDe(j.full_name);
    if (!grupoActual || grupoActual.letra !== letra) {
      const header = el('div', { class: 'jug-letra' }, letra);
      grupoActual = { letra, header, filas: [] };
      grupos.push(grupoActual);
      card.appendChild(header);
    }
    const estado = j.status === 'suspended' ? 'Suspendido' : (j.status && j.status !== 'active' ? 'Inactivo' : null);
    const fila = el('button', { class: 'list-row jug-row', type: 'button', onclick: () => { ultimoFiltro = search.value; pintarFicha(wrap, j); } }, [
      el('span', { class: 'avatar' }, avatarContent(j)),
      el('span', { class: 'jug-row-txt' }, [
        el('span', { class: 'name' }, j.full_name || '(sin nombre)'),
        j.email ? el('span', { class: 'meta' }, j.email) : null,
      ]),
      estado ? el('span', { class: 'badge badge-warning', style: 'margin-left:auto;' }, estado) : null,
    ]);
    grupoActual.filas.push({ fila, palabras: normalizar(j.full_name).split(/[\s.\-']+/).filter(Boolean) });
    card.appendChild(fila);
  });
  listBox.appendChild(card);
  const sinResultados = el('div', { class: 'card', hidden: true }, el('p', { class: 'text-muted' }, 'Ningún jugador coincide con tu búsqueda.'));
  listBox.appendChild(sinResultados);

  const total = jugadores.length;
  const aplicarFiltro = () => {
    const q = normalizar(search.value);
    // Como en los contactos del celular: cada palabra que escribas tiene que
    // ser el inicio de alguna palabra del nombre, en cualquier orden.
    // "ma" deja a Manuel, Mario, Mauricio…; "gar ana" encuentra a "Ana García".
    const palabras = q.split(/\s+/).filter(Boolean);
    let visibles = 0;
    grupos.forEach((g) => {
      let enGrupo = 0;
      g.filas.forEach((f) => {
        const ok = palabras.every((p) => f.palabras.some((w) => w.startsWith(p)));
        f.fila.hidden = !ok;
        if (ok) { enGrupo++; visibles++; }
      });
      g.header.hidden = enGrupo === 0;
    });
    card.hidden = visibles === 0;
    sinResultados.hidden = visibles !== 0;
    contador.textContent = palabras.length
      ? `${visibles} de ${total} jugador${total === 1 ? '' : 'es'}`
      : `${total} jugador${total === 1 ? '' : 'es'}`;
  };
  search.addEventListener('input', () => { ultimoFiltro = search.value; aplicarFiltro(); });
  aplicarFiltro();

  return wrap;
}

async function pintarFicha(wrap, jugador) {
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'stack', style: 'padding-top:60px;' }, [el('div', { class: 'spinner' })]));
  try {
    await cargarFicha(wrap, jugador);
  } catch (err) {
    wrap.innerHTML = '';
    wrap.appendChild(el('div', { class: 'stack' }, [
      el('p', { class: 'text-muted' }, humanizeError(err)),
      el('button', { class: 'btn btn-secondary', onclick: () => pintarFicha(wrap, jugador) }, 'Reintentar'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => renderAdminJugadores().then((n) => wrap.replaceWith(n)) }, '← Volver a la búsqueda'),
    ]));
  }
}

async function cargarFicha(wrap, jugador) {
  wrap.innerHTML = '';
  wrap.appendChild(el('button', { class: 'btn btn-ghost btn-sm mb-3', style: 'width:auto;padding-left:0;', onclick: () => renderAdminJugadores().then((n) => wrap.replaceWith(n)) }, '← Volver a la búsqueda'));

  const refresh = () => pintarFicha(wrap, jugador);

  wrap.appendChild(el('div', { class: 'card', style: 'text-align:center;' }, [
    el('div', { class: 'avatar-btn', style: 'width:72px;height:72px;font-size:22px;margin:0 auto 12px;' }, avatarContent(jugador)),
    el('div', { class: 'h2' }, jugador.full_name || 'Sin nombre'),
    el('div', { class: 'text-tiny mt-1' }, jugador.email),
    jugador.status !== 'active' ? el('span', { class: 'badge badge-warning mt-2' }, jugador.status === 'suspended' ? 'Suspendido' : 'Inactivo') : null,
  ]));

  // ---- Registros activos próximos ----
  const registros = await getRegistrosActivosDeJugador(jugador.id);
  wrap.appendChild(el('div', { class: 'section-title' }, 'Registros próximos'));
  if (registros.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'No tiene registros activos próximos.')));
  } else {
    const list = el('div', { class: 'card' });
    registros.forEach((r, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = REG_STATUS[r.status] || { text: r.status, cls: 'badge-neutral' };
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;font-size:14px;' }, formatFecha(r.escaleras.session_date)),
          el('div', { class: 'text-tiny' }, r.escaleras.weekday_schedule ? `${FORMAT_LABEL[r.escaleras.weekday_schedule.format] || r.escaleras.weekday_schedule.format} · Cat ${r.escaleras.weekday_schedule.category || '—'}` : ''),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]));
      if (['confirmed', 'substitute'].includes(r.status)) {
        const formato = r.escaleras.weekday_schedule ? r.escaleras.weekday_schedule.format : null;
        list.appendChild(el('div', { class: 'btn-row mt-2' }, [
          el('button', { class: 'btn btn-secondary btn-sm', onclick: () => abrirSustituto(r, jugador, formato, refresh) }, 'Sustituto'),
          el('button', { class: 'btn btn-secondary btn-sm', onclick: async () => {
            const ok = await confirmSheet({ title: '¿Marcar no-show?', confirmLabel: 'Sí, marcar', danger: true });
            if (!ok) return;
            try { await marcarNoShow(r.id); toast('Marcado como no-show.', 'success'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); }
          } }, 'No-show'),
          el('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
            const ok = await confirmSheet({
              title: '¿Cancelar este registro?',
              body: 'Si faltan pocas horas para el evento y nadie cubre su lugar, se le aplica la misma penalización de puntos que si él mismo se diera de baja tarde.',
              confirmLabel: 'Sí, cancelar', danger: true,
            });
            if (!ok) return;
            try {
              // El "mensaje" real que regresa cancelar_registro dice si hubo
              // penalización o no — un "Registro cancelado" fijo escondía que
              // a veces sí se le descuentan puntos, sin que el admin lo supiera.
              const res = await cancelarRegistro(r.id);
              toast((res && res.mensaje) || 'Registro cancelado.', res && res.penalizado ? 'error' : 'success', 6000);
              refresh();
            } catch (err) { toast(humanizeError(err), 'error'); }
          } }, 'Cancelar'),
        ]));
      }
    });
    wrap.appendChild(list);
  }

  // ---- Cashbacks ----
  // Alternativa de consulta/gestión manual a escanear su QR — para cuando
  // el jugador no trae el celular a la mano, o para revisar/redimir desde
  // aquí directamente.
  let cashbacks = [];
  try { cashbacks = await getMisCashbacks(jugador.id); } catch (err) { cashbacks = []; }
  wrap.appendChild(el('div', { class: 'section-title mt-6' }, 'Cashbacks'));
  if (cashbacks.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Sin cashbacks.')));
  } else {
    const disponibles = cashbacks.filter((c) => c.status === 'disponible');
    const list = el('div', { class: 'card' });
    cashbacks.forEach((c, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = CASHBACK_STATUS[c.status] || { text: c.status, cls: 'badge-neutral' };
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;' }, `$${Number(c.amount_mxn)} MXN — ${c.place}º lugar`),
          el('div', { class: 'text-tiny' }, `Ganado en la noche del ${formatFecha(c.session_date)}`),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]));
      if (c.status === 'disponible') {
        list.appendChild(el('button', {
          class: 'btn btn-secondary btn-sm mt-2',
          onclick: async (e) => {
            e.target.disabled = true; e.target.textContent = 'Redimiendo…';
            try { await redimirCashbackPorToken(c.redeem_token); toast('Cashback redimido — no olvides marcarlo también en Loyverse.', 'success', 5000); refresh(); }
            catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Redimir'; }
          },
        }, 'Redimir'));
      }
    });
    wrap.appendChild(list);

    if (disponibles.length >= 2) {
      wrap.appendChild(el('button', {
        class: 'btn btn-secondary mt-2',
        onclick: async (e) => {
          e.target.disabled = true; e.target.textContent = 'Redimiendo…';
          try {
            const r = await redimirTodosLosCashbacksDeJugador(jugador.id);
            toast(`Redimidos ${r.redimidos} por $${Number(r.monto_total)} MXN`
              + (r.omitidos_por_hoy > 0 ? ` — ${r.omitidos_por_hoy} quedaron pendientes por ser de hoy.` : '')
              + ' No olvides marcarlo también en Loyverse.', 'success', 6000);
            refresh();
          } catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Redimir todos los disponibles'; }
        },
      }, 'Redimir todos los disponibles'));
    }
  }

  // ---- Multas ----
  const multas = await getMisMultas(jugador.id);
  wrap.appendChild(el('div', { class: 'row-between mt-6' }, [
    el('div', { class: 'section-title', style: 'margin:0;' }, 'Multas'),
    el('button', { class: 'btn btn-secondary btn-sm', style: 'width:auto;', onclick: () => abrirMulta(jugador, refresh) }, '+ Aplicar multa'),
  ]));
  if (multas.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Sin multas.')));
  } else {
    const list = el('div', { class: 'card' });
    multas.forEach((m, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = FINE_STATUS[m.status] || { text: m.status, cls: 'badge-neutral' };
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;' }, `$${Number(m.amount_mxn).toLocaleString('es-MX')} MXN`),
          el('div', { class: 'text-tiny' }, `${m.reason || 'Sin motivo especificado'} · ${formatFechaHora(m.applied_at)}`),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]));
      if (m.status === 'pending') {
        list.appendChild(el('div', { class: 'btn-row mt-2' }, [
          el('button', { class: 'btn btn-secondary btn-sm', onclick: async () => { try { await marcarMultaEstado(m.id, 'paid'); toast('Marcada como pagada.', 'success'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); } } }, 'Marcar pagada'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { try { await marcarMultaEstado(m.id, 'waived'); toast('Multa condonada.', 'info'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); } } }, 'Condonar'),
        ]));
      }
    });
    wrap.appendChild(list);
  }

  // ---- Suspensiones ----
  const suspensiones = await getMisSuspensiones(jugador.id);
  const hoy = todayISO();
  wrap.appendChild(el('div', { class: 'row-between mt-6' }, [
    el('div', { class: 'section-title', style: 'margin:0;' }, 'Suspensiones'),
    el('button', { class: 'btn btn-secondary btn-sm', style: 'width:auto;', onclick: () => abrirSuspension(jugador, refresh) }, '+ Suspender'),
  ]));
  if (suspensiones.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Sin suspensiones.')));
  } else {
    const list = el('div', { class: 'card' });
    suspensiones.forEach((s, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const activa = !s.lifted_at && (!s.end_date || s.end_date >= hoy);
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;' }, `${formatFecha(s.start_date)} — ${s.end_date ? formatFecha(s.end_date) : 'indefinida'}`),
          el('div', { class: 'text-tiny' }, s.reason || 'Sin motivo especificado'),
        ]),
        el('span', { class: `badge ${activa ? 'badge-danger' : 'badge-neutral'}` }, s.lifted_at ? 'Levantada' : (activa ? 'Activa' : 'Terminada')),
      ]));
      if (activa) {
        list.appendChild(el('button', { class: 'btn btn-secondary btn-sm mt-2', style: 'width:auto;', onclick: async () => {
          try { await levantarSuspension(s.id, jugador.id); jugador.status = 'active'; toast('Suspensión levantada.', 'success'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); }
        } }, 'Levantar suspensión'));
      }
    });
    wrap.appendChild(list);
  }
}

async function abrirSustituto(registro, jugador, formato, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Asignar sustituto'));
  let esCoach = false;
  // En Parejas Fijas NUNCA hay reparto de puntos por sustituto — se cae la
  // pareja completa, igual que si lo hiciera el propio jugador. Antes esta
  // pantalla siempre repartía 34%/66% sin importar el formato, mientras que
  // "Noches del club" para la misma escalera de Parejas Fijas obligaba al
  // modo "emergencia, sin reparto": la misma acción daba resultados
  // distintos según desde dónde se hiciera. Ahora las dos pantallas siguen
  // la misma regla.
  const esParejas = formato === 'parejas';
  const infoTxt = el('p', { class: 'text-muted mb-3' },
    esParejas
      ? 'En Parejas Fijas no hay reparto de puntos: es una autorización de emergencia de recepción y el sustituto se queda con el 100% de lo que gane.'
      : 'El sustituto recibe 34% de los puntos ganados; el ausente conserva 66%.');
  content.appendChild(infoTxt);
  let coachToggle = null;
  if (!esParejas) {
    coachToggle = el('button', { class: 'chip-btn mb-3' }, '☐ Es un coach del club cubriendo una emergencia');
    coachToggle.addEventListener('click', () => {
      esCoach = !esCoach;
      coachToggle.classList.toggle('selected', esCoach);
      coachToggle.textContent = esCoach ? '☑ Es un coach del club cubriendo una emergencia' : '☐ Es un coach del club cubriendo una emergencia';
      infoTxt.textContent = esCoach ? 'El coach no gana puntos; el ausente recibe la penalización completa por tiempo.' : 'El sustituto recibe 34% de los puntos ganados; el ausente conserva 66%.';
    });
    content.appendChild(coachToggle);
  }
  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:36vh;overflow-y:auto;' });
  async function draw(filtro = '') {
    list.innerHTML = '<p class="text-tiny">Buscando…</p>';
    const jugadores = await buscarJugadores(filtro, 20);
    list.innerHTML = '';
    jugadores.filter((j) => j.id !== jugador.id).forEach((j) => {
      list.appendChild(chipJugador(j, async (e) => {
        e.target.closest('button').disabled = true;
        try {
          if (esParejas) {
            await asignarSustitutoAdmin(registro.id, j.id, 'Emergencia — ficha de jugador');
            toast(`${j.full_name} jugará en su lugar.`, 'success');
          } else {
            await asignarSustituto(registro.id, j.id, esCoach);
            toast(`Invitación enviada a ${j.full_name}: tiene 1 hora para aceptarla desde su app.`, 'success', 5200);
          }
          handle.close(); onChange();
        }
        catch (err) { toast(humanizeError(err), 'error'); e.target.closest('button').disabled = false; }
      }));
    });
    if (list.children.length === 0) list.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
  }
  draw();
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => draw(search.value), 200); });
  content.appendChild(search);
  content.appendChild(list);
  const handle = openSheet(content);
}

function abrirMulta(jugador, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Aplicar multa a ${jugador.full_name || ''}`));
  const amount = el('input', { class: 'input', type: 'number', min: '0', value: '250' });
  const reason = el('input', { class: 'input', type: 'text', placeholder: 'Motivo (opcional)' });
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Monto (MXN)'), amount]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Motivo'), reason]));
  const errBox = el('p', { class: 'text-tiny mt-1', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);
  const btn = el('button', { class: 'btn btn-primary mt-2' }, 'Aplicar multa');
  btn.addEventListener('click', async () => {
    const n = Number(amount.value);
    if (!Number.isFinite(n) || n <= 0) { errBox.textContent = 'El monto debe ser un número mayor a 0.'; errBox.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Aplicando…';
    try { await aplicarMulta(jugador.id, n, reason.value.trim() || null); toast('Multa aplicada.', 'success'); handle.close(); onChange(); }
    catch (err) { errBox.textContent = humanizeError(err); errBox.style.display = 'block'; btn.disabled = false; btn.textContent = 'Aplicar multa'; }
  });
  content.appendChild(btn);
  const handle = openSheet(content);
}

function abrirSuspension(jugador, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Suspender a ${jugador.full_name || ''}`));
  const start = el('input', { class: 'input', type: 'date', value: todayISO() });
  const end = el('input', { class: 'input', type: 'date' });
  const reason = el('input', { class: 'input', type: 'text', placeholder: 'Motivo (opcional)' });
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Desde'), start]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Hasta (opcional — vacío = indefinida)'), end]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Motivo'), reason]));
  const errBox = el('p', { class: 'text-tiny mt-1', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);
  const btn = el('button', { class: 'btn btn-danger mt-2' }, 'Aplicar suspensión');
  btn.addEventListener('click', async () => {
    if (!start.value) { errBox.textContent = 'La fecha de inicio es obligatoria.'; errBox.style.display = 'block'; return; }
    // Sin este chequeo, una fecha "Hasta" anterior a "Desde" se guardaba
    // igual sin ningún aviso, y la ficha del jugador la mostraba de
    // inmediato como "Terminada" — como si la suspensión nunca se hubiera
    // aplicado, sin explicar por qué.
    if (end.value && end.value < start.value) {
      errBox.textContent = 'La fecha "Hasta" no puede ser anterior a "Desde".';
      errBox.style.display = 'block';
      return;
    }
    errBox.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Aplicando…';
    try { await aplicarSuspension(jugador.id, start.value, end.value || null, reason.value.trim() || null); jugador.status = 'suspended'; toast('Suspensión aplicada.', 'success'); handle.close(); onChange(); }
    catch (err) { errBox.textContent = humanizeError(err); errBox.style.display = 'block'; btn.disabled = false; btn.textContent = 'Aplicar suspensión'; }
  });
  content.appendChild(btn);
  const handle = openSheet(content);
}
