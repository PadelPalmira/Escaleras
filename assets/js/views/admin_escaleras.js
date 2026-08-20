import { el, formatFecha, formatHora, toast, humanizeError, openSheet, confirmSheet } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, esAdminOMaestro,
  getEscalerasAdmin, getRegistrosEscalera, getRondasConPartidos,
  generarRondaInicial, generarSiguienteRonda, registrarResultadoPartido, corregirResultadoPartido, cerrarEscalera,
  marcarNoShow, cancelarRegistro, asignarSustituto, buscarJugadores,
} from '../api.js';
import { navigate } from '../router.js';

const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };
const ESTADO_ESCALERA = {
  scheduled: { text: 'Programada', cls: 'badge-neutral' },
  registration_open: { text: 'Registro abierto', cls: 'badge-neutral' },
  confirmed: { text: 'Confirmada', cls: 'badge-neutral' },
  in_progress: { text: 'En juego', cls: 'badge-warning' },
  completed: { text: 'Cerrada', cls: 'badge-success' },
  cancelled: { text: 'Cancelada', cls: 'badge-danger' },
};
const REG_STATUS = {
  confirmed: { text: 'Confirmado', cls: 'badge-success' },
  waitlist: { text: 'Lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Sustituto', cls: 'badge-success' },
  declined: { text: 'Declinado', cls: 'badge-neutral' },
  cancelled_ontime: { text: 'Cancelado', cls: 'badge-neutral' },
  cancelled_late: { text: 'Cancelado tarde', cls: 'badge-danger' },
  no_show: { text: 'No asistió', cls: 'badge-danger' },
};

export async function renderAdminEscaleras() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '🔒'), el('p', {}, 'No tienes permiso para ver esta sección.')]);
  }

  const wrap = el('div');
  await pintarLista(wrap);
  return wrap;
}

async function pintarLista(wrap) {
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Resultados de escaleras'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Elige una noche para capturar resultados o gestionar el roster.'));

  const escaleras = await getEscalerasAdmin();
  if (escaleras.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '📅'), el('p', {}, 'No hay escaleras recientes o próximas.')]));
    return;
  }
  escaleras.forEach((esc) => {
    const ws = esc.weekday_schedule;
    const est = ESTADO_ESCALERA[esc.status] || { text: esc.status, cls: 'badge-neutral' };
    const card = el('div', { class: 'card card-tappable mt-4', onclick: () => pintarDetalle(wrap, esc.id) }, [
      el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:800;font-size:15px;' }, formatFecha(esc.session_date)),
          el('div', { class: 'text-tiny mt-1' }, `${FORMAT_LABEL[ws.format] || ws.format}${ws.category ? ' · Cat ' + ws.category : ''} · ${formatHora(ws.start_time)}`),
        ]),
        el('span', { class: `badge ${est.cls}` }, est.text),
      ]),
    ]);
    wrap.appendChild(card);
  });
}

async function pintarDetalle(wrap, escaleraId) {
  wrap.innerHTML = '';
  const loading = el('div', { class: 'stack', style: 'padding-top:60px;' }, [el('div', { class: 'spinner' })]);
  wrap.appendChild(loading);

  const [escaleras, registros, rondas] = await Promise.all([
    getEscalerasAdmin(), getRegistrosEscalera(escaleraId), getRondasConPartidos(escaleraId),
  ]);
  const esc = escaleras.find((e) => e.id === escaleraId);
  wrap.innerHTML = '';
  if (!esc) { wrap.appendChild(el('p', { class: 'text-muted' }, 'Esa escalera ya no está disponible.')); return; }
  const ws = esc.weekday_schedule;

  const refresh = () => pintarDetalle(wrap, escaleraId);

  const back = el('button', { class: 'btn btn-ghost btn-sm mb-3', style: 'width:auto;padding-left:0;', onclick: () => pintarLista(wrap) }, '← Volver');
  wrap.appendChild(back);

  const est = ESTADO_ESCALERA[esc.status] || { text: esc.status, cls: 'badge-neutral' };
  wrap.appendChild(el('div', { class: 'row-between' }, [
    el('div', { class: 'h2' }, formatFecha(esc.session_date)),
    el('span', { class: `badge ${est.cls}` }, est.text),
  ]));
  wrap.appendChild(el('p', { class: 'text-muted mt-1' }, `${FORMAT_LABEL[ws.format] || ws.format}${ws.category ? ' · Cat ' + ws.category : ''} · ${formatHora(ws.start_time)}–${formatHora(ws.end_time)}`));

  if (ws.format === 'retas_abiertas') {
    wrap.appendChild(el('div', { class: 'card mt-4' }, el('p', { class: 'text-muted' }, 'Retas Abiertas es 100% social — no otorga puntos ni tiene rondas capturables aquí.')));
    return;
  }

  // ---- Roster ----
  wrap.appendChild(el('div', { class: 'section-title' }, `Jugadores registrados (${registros.length})`));
  if (registros.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Todavía nadie se ha registrado.')));
  } else {
    const rosterCard = el('div', { class: 'card' });
    registros.forEach((r, i) => {
      if (i > 0) rosterCard.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = REG_STATUS[r.status] || { text: r.status, cls: 'badge-neutral' };
      const row = el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;font-size:14px;' }, (r.profiles && r.profiles.full_name) || '(sin nombre)'),
          el('div', { class: 'text-tiny' }, r.is_coach_substitute ? 'Sustituto — coach' : ''),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]);
      rosterCard.appendChild(row);
      if (['confirmed', 'substitute'].includes(r.status)) {
        const acciones = el('div', { class: 'btn-row mt-2' }, [
          el('button', { class: 'btn btn-secondary btn-sm', onclick: () => abrirSustituto(r, refresh) }, 'Sustituto'),
          el('button', { class: 'btn btn-secondary btn-sm', onclick: async () => {
            const ok = await confirmSheet({ title: '¿Marcar no-show?', body: 'Aplica la penalización de no-show configurada del mes en curso.', confirmLabel: 'Sí, marcar', danger: true });
            if (!ok) return;
            try { await marcarNoShow(r.id); toast('Marcado como no-show.', 'success'); refresh(); }
            catch (err) { toast(humanizeError(err), 'error'); }
          } }, 'No-show'),
          el('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
            const ok = await confirmSheet({ title: '¿Cancelar este registro?', confirmLabel: 'Sí, cancelar', danger: true });
            if (!ok) return;
            try { await cancelarRegistro(r.id); toast('Registro cancelado.', 'success'); refresh(); }
            catch (err) { toast(humanizeError(err), 'error'); }
          } }, 'Cancelar'),
        ]);
        rosterCard.appendChild(acciones);
      }
    });
    wrap.appendChild(rosterCard);
  }

  // ---- Rondas ----
  wrap.appendChild(el('div', { class: 'section-title' }, 'Rondas'));

  if (rondas.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('p', { class: 'text-muted mb-3' }, 'Todavía no se ha generado la primera ronda.'),
      el('button', { class: 'btn btn-primary', onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Generando…';
        try { await generarRondaInicial(escaleraId); toast('Ronda 1 generada.', 'success'); refresh(); }
        catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Generar ronda 1'; }
      } }, 'Generar ronda 1'),
    ]));
    return;
  }

  rondas.forEach((ronda) => {
    const rondaCard = el('div', { class: 'card mt-4' });
    rondaCard.appendChild(el('div', { class: 'row-between mb-2' }, [
      el('div', { style: 'font-weight:700;' }, `Ronda ${ronda.round_number}`),
      el('span', { class: `badge ${ronda.status === 'completed' ? 'badge-success' : 'badge-warning'}` }, ronda.status === 'completed' ? 'Completa' : 'En curso'),
    ]));
    ronda.partidos.forEach((m, i) => {
      if (i > 0) rondaCard.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      rondaCard.appendChild(renderPartidoRow(m, refresh));
    });
    wrap.appendChild(rondaCard);
  });

  const ultimaRonda = rondas[rondas.length - 1];
  const pendientes = ultimaRonda.partidos.filter((m) => m.status === 'pending').length;
  const accionesFinales = el('div', { class: 'stack gap-3 mt-4' });
  if (pendientes === 0) {
    if (esc.status !== 'completed') {
      accionesFinales.appendChild(el('button', { class: 'btn btn-secondary', onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Generando…';
        try { await generarSiguienteRonda(escaleraId); toast(`Ronda ${ultimaRonda.round_number + 1} generada.`, 'success'); refresh(); }
        catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Generar siguiente ronda'; }
      } }, 'Generar siguiente ronda'));
      accionesFinales.appendChild(el('button', { class: 'btn btn-primary', onclick: async (e) => {
        const ok = await confirmSheet({ title: '¿Cerrar la escalera?', body: 'Se otorgan los bonos de posición final según la cancha de cada jugador en esta última ronda. No se puede deshacer desde aquí.', confirmLabel: 'Sí, cerrar' });
        if (!ok) return;
        e.target.disabled = true; e.target.textContent = 'Cerrando…';
        try { const res = await cerrarEscalera(escaleraId); toast('Escalera cerrada — bonos de posición otorgados.', 'success'); refresh(); }
        catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Cerrar escalera'; }
      } }, 'Cerrar escalera'));
    } else {
      accionesFinales.appendChild(el('p', { class: 'text-muted' }, 'Esta escalera ya está cerrada. Para corregir un resultado, usa "Corregir" en el partido correspondiente.'));
    }
  } else {
    accionesFinales.appendChild(el('p', { class: 'text-muted' }, `Faltan ${pendientes} partido(s) por capturar en la ronda ${ultimaRonda.round_number}.`));
  }
  wrap.appendChild(accionesFinales);
}

function nombreEquipo(m, prefix) {
  const p1 = m[`${prefix}_player1_nombre`];
  const p2 = m[`${prefix}_player2_nombre`];
  return [p1 && p1.full_name, p2 && p2.full_name].filter(Boolean).join(' / ') || '—';
}

function renderPartidoRow(m, onChange) {
  const row = el('div', {});
  row.appendChild(el('div', { class: 'row-between' }, [
    el('div', { class: 'text-tiny' }, `Cancha ${m.court_number}`),
    m.status === 'completed'
      ? el('span', { class: 'badge badge-success' }, `${m.score_team1}-${m.score_team2} sets`)
      : el('span', { class: 'badge badge-neutral' }, 'Pendiente'),
  ]));
  row.appendChild(el('div', { class: 'mt-1', style: 'font-size:14px;font-weight:600;' }, nombreEquipo(m, 'team1')));
  row.appendChild(el('div', { style: 'font-size:14px;font-weight:600;' }, nombreEquipo(m, 'team2')));

  if (!m.team1_player1 && !m.team2_player1) {
    row.appendChild(el('p', { class: 'text-tiny mt-1' }, 'Sin jugadores suficientes esta ronda.'));
    return row;
  }

  const btn = el('button', {
    class: `btn btn-sm mt-2 ${m.status === 'completed' ? 'btn-secondary' : 'btn-primary'}`,
    style: 'width:auto;',
    onclick: () => abrirCapturaResultado(m, onChange),
  }, m.status === 'completed' ? 'Corregir resultado' : 'Capturar resultado');
  row.appendChild(btn);
  return row;
}

/** Sheet reutilizable para capturar/corregir un marcador de 2-3 sets (team1/team2). */
function abrirCapturaResultado(m, onChange) {
  const setsPrevios = (m.sets_json && m.sets_json.sets) || [];
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, m.status === 'completed' ? 'Corregir resultado' : 'Capturar resultado'));
  content.appendChild(el('p', { class: 'text-tiny mb-3' }, `${nombreEquipo(m, 'team1')}  vs  ${nombreEquipo(m, 'team2')}`));

  function setRow(label, prev) {
    const g1 = el('input', { class: 'input', type: 'number', min: '0', placeholder: '0', value: prev ? String(prev.team1) : '' });
    const g2 = el('input', { class: 'input', type: 'number', min: '0', placeholder: '0', value: prev ? String(prev.team2) : '' });
    const node = el('div', { class: 'field' }, [
      el('label', {}, label),
      el('div', { class: 'row gap-2' }, [g1, el('div', { class: 'text-tiny' }, 'vs'), g2]),
    ]);
    return { node, g1, g2 };
  }

  const set1 = setRow('Set 1 (games)', setsPrevios[0]);
  const set2 = setRow('Set 2 (games)', setsPrevios[1]);
  const set3 = setRow('Set 3 — súper muerte (opcional, solo si hubo empate a sets)', setsPrevios[2]);

  content.appendChild(set1.node);
  content.appendChild(set2.node);
  content.appendChild(set3.node);

  if (m.status === 'completed') {
    const nota = el('input', { class: 'input', type: 'text', placeholder: 'Motivo de la corrección (opcional)' });
    content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Nota de corrección'), nota]));
    content._nota = nota;
  }

  const errBox = el('p', { class: 'text-tiny mt-2', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);

  const saveBtn = el('button', { class: 'btn btn-primary mt-3' }, 'Guardar resultado');
  saveBtn.addEventListener('click', async () => {
    errBox.style.display = 'none';
    let sets;
    try {
      sets = construirSets(set1, set2, set3);
    } catch (e) {
      errBox.textContent = e.message; errBox.style.display = 'block'; return;
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try {
      if (m.status === 'completed') {
        await corregirResultadoPartido(m.id, sets, content._nota ? content._nota.value.trim() || null : null);
        toast('Resultado corregido.', 'success');
      } else {
        await registrarResultadoPartido(m.id, sets);
        toast('Resultado guardado.', 'success');
      }
      handle.close();
      onChange();
    } catch (err) {
      errBox.textContent = humanizeError(err); errBox.style.display = 'block';
      saveBtn.disabled = false; saveBtn.textContent = 'Guardar resultado';
    }
  });
  content.appendChild(saveBtn);

  const handle = openSheet(content);
}

function construirSets(set1, set2, set3) {
  function leer(s, requerido) {
    const t1 = s.g1.value.trim(), t2 = s.g2.value.trim();
    if (!t1 && !t2) return null;
    const n1 = Number(t1), n2 = Number(t2);
    if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 < 0 || n2 < 0) throw new Error('Los marcadores deben ser números válidos (0 o más).');
    if (n1 === n2) throw new Error('Un set no puede terminar empatado.');
    return { team1: n1, team2: n2 };
  }
  const s1 = leer(set1, true);
  const s2 = leer(set2, true);
  if (!s1 || !s2) throw new Error('Captura al menos el Set 1 y el Set 2.');
  const sets = [s1, s2];
  const s3 = leer(set3, false);
  if (s3) sets.push(s3);
  else if ((s1.team1 > s1.team2) === (s2.team1 > s2.team2)) {
    // Mismo equipo ganó ambos sets — no hace falta el 3ro, esto es válido.
  } else {
    throw new Error('Hay empate a un set — captura el Set 3 (súper muerte) para definir el partido.');
  }
  return sets;
}

async function abrirSustituto(registro, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Asignar sustituto'));
  let esCoach = false;
  const infoTxt = el('p', { class: 'text-muted mb-3' }, 'El sustituto recibe 34% de los puntos ganados; el ausente conserva 66%.');
  content.appendChild(infoTxt);
  const coachToggle = el('button', { class: 'chip-btn mb-3' }, '☐ Es un coach del club cubriendo una emergencia');
  coachToggle.addEventListener('click', () => {
    esCoach = !esCoach;
    coachToggle.classList.toggle('selected', esCoach);
    coachToggle.textContent = esCoach ? '☑ Es un coach del club cubriendo una emergencia' : '☐ Es un coach del club cubriendo una emergencia';
    infoTxt.textContent = esCoach ? 'El coach no gana puntos; el ausente recibe la penalización completa por tiempo.' : 'El sustituto recibe 34% de los puntos ganados; el ausente conserva 66%.';
  });
  content.appendChild(coachToggle);

  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:36vh;overflow-y:auto;' });
  async function draw(filtro = '') {
    list.innerHTML = '<p class="text-tiny">Buscando…</p>';
    const jugadores = await buscarJugadores(filtro, 20);
    list.innerHTML = '';
    jugadores.filter((j) => j.id !== registro.player_id).forEach((j) => {
      list.appendChild(el('button', {
        class: 'chip-btn',
        onclick: async () => {
          try {
            await asignarSustituto(registro.id, j.id, esCoach);
            toast(`${j.full_name} jugará en su lugar.`, 'success');
            handle.close();
            onChange();
          } catch (err) { toast(humanizeError(err), 'error'); }
        },
      }, j.full_name || '(sin nombre)'));
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
