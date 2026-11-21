import { el, todayISO, formatFecha, formatFechaHora, formatHora, avatarContent, toast, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, getMisRegistros,
  getEventoLiguillaActivo, getMiCalificacionLiguilla,
  esAdminOMaestro, esMaestro, getEscalerasAdmin, getConteosRegistros,
  getMiRondaActual, horaServidor,
  getNotificacionesUrgentes, marcarNotificacionLeida,
  getMisConvocatorias, getParejasPorConfirmar,
  responderCalificacionLiguilla,
  getLiguillaEventosAdmin, getCalificadosLiguillaAdmin, getParejasLiguilla, getLiguillaEventStartTs,
  getAlertasRecepcion,
} from '../api.js';
import { navigate } from '../router.js';
import { CLUB_TZ } from '../config.js';
import { abrirNoche } from './admin_escaleras.js';

const CAT_LABEL = { A: 'Categoría A', B: 'Categoría B' };
const CAT_BADGE_CLASS = { A: 'badge-a', B: 'badge-b' };

const STATUS_LABEL = {
  confirmed: { text: 'Confirmado', cls: 'badge-success' },
  waitlist: { text: 'En lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Jugando como sustituto', cls: 'badge-success' },
  declined: { text: 'Declinado', cls: 'badge-neutral' },
  cancelled_ontime: { text: 'Cancelado', cls: 'badge-neutral' },
  cancelled_late: { text: 'Cancelado tarde', cls: 'badge-danger' },
  no_show: { text: 'No asististe', cls: 'badge-danger' },
};

export async function renderHome() {
  const profile = await getMyProfile();
  // Recepcion y direccion no vienen a esta pantalla a ver si juegan hoy:
  // vienen a ver que les toca administrar. Antes veian lo mismo que un
  // jugador y les decia "Hoy no juegas".
  if (esAdminOMaestro(profile)) return renderInicioAdmin(profile);
  return renderInicioJugador(profile);
}

/* ============================================================
   3.0 — El tablero del jugador
   ------------------------------------------------------------
   Orden pedido por el club: la próxima jugada arriba en
   compacto, luego el mes, la carrera por el campeonato, las
   estadísticas, los rivales, los puntos, y hasta abajo el
   detalle de la próxima jugada.

   Para los 99 de 166 jugadores que nunca han jugado una noche,
   esto no puede ser un museo de ceros: se les enseña una
   invitación a jugar y ya.
   ============================================================ */
async function renderInicioJugador(profile) {
  const registros = await getMisRegistros({ soloFuturas: true });

  // Si la noche está en juego ahorita, eso es lo único que importa.
  let miRonda = null;
  try { miRonda = await getMiRondaActual(); } catch { miRonda = null; }
  let desfaseMs = 0;
  if (miRonda && miRonda.cronometro_inicio) {
    try { desfaseMs = Date.now() - (await horaServidor()).getTime(); } catch { desfaseMs = 0; }
  }

  let urgentes = [];
  try { urgentes = profile ? await getNotificacionesUrgentes(profile.id, 3) : []; } catch { urgentes = []; }

  let convocatorias = [];
  try { convocatorias = await getMisConvocatorias(9); } catch { convocatorias = []; }

  // Las parejas que apartaron y NO han aceptado no vienen en
  // mis_convocatorias: sin pedirlas aparte, la tarjeta diría "van 2 de 6"
  // contando una pareja que puede caerse sola — la mentira del 8 de octubre.
  const nocheSugerida = sugerenciaConvocatoria(convocatorias);
  if (nocheSugerida && nocheSugerida.formato === 'parejas') {
    try {
      const pend = await getParejasPorConfirmar([nocheSugerida.escalera_id]);
      if (pend && pend[nocheSugerida.escalera_id]) {
        nocheSugerida.por_confirmar = pend[nocheSugerida.escalera_id].jugadores;
      }
    } catch { /* si falla, se omite el matiz en vez de inventarlo */ }
  }

  // ¿Alguna de estas noches dona lo recaudado? Con guarda: estas funciones
  // son nuevas y un navegador puede traer el api.js viejo en caché — en ese
  // caso la noche se ve como una reta normal y la app entra igual.
  try {
    const mod = await import('../api.js');
    if (typeof mod.getEscalerasConCausa === 'function') {
      const causas = await mod.getEscalerasConCausa();
      if (causas && causas.length) {
        const porId = new Map(causas.map((c) => [c.escalera_id, c]));
        convocatorias.forEach((f) => {
          const c = porId.get(f.escalera_id);
          if (c) f.causa_info = c;
        });
        if (nocheSugerida) nocheSugerida.causa_info = porId.get(nocheSugerida.escalera_id) || null;
      }
    }
  } catch { /* sin causa: todo sigue funcionando igual */ }

  // Todo el tablero en una sola llamada (antes el Inicio hacía seis idas
  // y vueltas y en señal mala se notaba).
  let tablero = null; let premios = [];
  try {
    const mod = await import('../api.js');
    if (typeof mod.getMiTablero === 'function') tablero = await mod.getMiTablero();
    if (typeof mod.getMisPremios === 'function') premios = await mod.getMisPremios();
  } catch (err) {
    console.error('No se pudo cargar tu tablero:', err);
  }

  // La Liguilla está apagada, pero su código sigue entero: si el club la
  // vuelve a prender, todo esto reaparece solo.
  let ligActiva = false;
  try {
    const mod = await import('../api.js');
    if (typeof mod.liguillaActiva === 'function') ligActiva = await mod.liguillaActiva();
  } catch { ligActiva = false; }
  const miLiguilla = ligActiva ? await cargarMiLiguilla(profile) : null;

  const hoy = todayISO();
  const registroHoy = registros.find((r) => r.escaleras && r.escaleras.session_date === hoy
    && ['confirmed', 'substitute', 'waitlist'].includes(r.status));
  const proximosRegistros = registros
    .filter((r) => r.escaleras && r.escaleras.session_date >= hoy
      && ['confirmed', 'substitute', 'waitlist'].includes(r.status))
    .sort((a, b) => a.escaleras.session_date.localeCompare(b.escaleras.session_date));

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'resplandor-marca' }));
  let paso = 0;
  const entra = (nodo) => { paso += 1; if (nodo) nodo.classList.add('entra', `entra-${Math.min(paso, 6)}`); return nodo; };

  /* ---------- Saludo ---------- */
  const nombre = (profile && profile.full_name) ? profile.full_name.split(' ')[0] : 'Jugador';
  wrap.appendChild(el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, `Hola, ${nombre}`),
    el('div', { class: 'avatar-btn', style: 'width:44px;height:44px;font-size:15px;' }, avatarContent(profile)),
  ]));

  /* ---------- Cosas que no pueden esperar ---------- */
  if (profile && profile.password_provisional) {
    wrap.appendChild(el('div', { class: 'card mb-3', style: 'border:1.5px solid var(--warning);' }, [
      el('div', { style: 'font-weight:800;color:var(--warning);' }, 'Cambia tu contraseña'),
      el('p', { class: 'text-tiny mt-2' },
        'Estás entrando con la contraseña provisional que te dio recepción. '
        + 'Ponle una tuya: toma menos de un minuto y nadie más la va a saber.'),
      el('button', { class: 'btn btn-primary btn-sm mt-3', onclick: () => navigate('/perfil') },
        'Ponerle mi contraseña'),
    ]));
  }

  if (miRonda) wrap.appendChild(renderMiRonda(miRonda, desfaseMs));

  // ¿Ganó una playera y no ha elegido talla? Eso va antes que todo.
  const premioPendiente = (premios || []).find((p) => !p.entregada && !p.talla_elegida);
  if (premioPendiente) wrap.appendChild(entra(renderElegirTalla(premioPendiente)));

  if (miLiguilla && miLiguilla.porConfirmar) wrap.appendChild(renderConfirmarLiguilla(miLiguilla));

  if (urgentes.length) {
    wrap.appendChild(el('div', { class: 'section-title mt-4' },
      urgentes.length === 1 ? 'Tienes un aviso' : `Tienes ${urgentes.length} avisos`));
    urgentes.forEach((n) => {
      const card = el('div', { class: 'card', style: 'border-color:var(--warning);' });
      card.appendChild(el('div', { style: 'font-weight:800;font-size:15px;' }, n.title));
      if (n.body) card.appendChild(el('p', { class: 'text-tiny mt-1' }, n.body));
      card.appendChild(el('button', {
        class: 'btn btn-secondary btn-sm mt-3', style: 'width:auto;',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            await marcarNotificacionLeida(n.id);
            card.remove();
            window.dispatchEvent(new CustomEvent('avisos-cambiaron'));
          } catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
        },
      }, 'Enterado'));
      wrap.appendChild(card);
    });
  }

  /* ---------- Hoy ---------- */
  if (miRonda) {
    // Ya se está jugando: la tarjeta de arriba lo dice todo.
  } else if (miLiguilla && miLiguilla.esHoy) {
    wrap.appendChild(renderHoyLiguilla(miLiguilla));
  } else if (registroHoy) {
    const esc = registroHoy.escaleras;
    const ws = esc.weekday_schedule;
    wrap.appendChild(entra(
      el('div', { class: 'card card-hero mt-4' }, [
        el('div', { class: 'row-between' }, [
          el('div', { class: 'h2' }, 'Hoy juegas 🎾'),
          el('span', { class: `badge ${STATUS_LABEL[registroHoy.status]?.cls || 'badge-neutral'}` },
            STATUS_LABEL[registroHoy.status]?.text || registroHoy.status),
        ]),
        el('p', { class: 'text-muted mt-2' },
          `${FORMATO_LARGO[ws.format] || ws.format} · Categoría ${ws.category || '—'}`),
        el('p', { class: 'text-muted' }, `${formatHora(ws.start_time)} – ${formatHora(ws.end_time)}`),
        el('button', { class: 'btn btn-secondary mt-4', onclick: () => navigate('/convocatorias') }, 'Ver detalles'),
      ])
    ));
  }

  /* ---------- 0. Tu próxima jugada (compacta) ---------- */
  wrap.appendChild(entra(renderProximaCompacta(nocheSugerida, proximosRegistros)));

  const tieneDatos = tablero && tablero.tiene_datos;

  if (!tieneDatos) {
    /* ---------- El tablero de quien todavía no juega ---------- */
    wrap.appendChild(entra(el('div', { class: 'panel-vidrio mt-4', style: 'padding:26px 20px;text-align:center;' }, [
      el('div', { style: 'font-size:34px;' }, '🎾'),
      el('div', { class: 'h2 mt-2' }, 'Empieza a jugar para ver tus estadísticas'),
      el('p', { class: 'text-muted mt-2' },
        'En cuanto juegues tu primera noche, aquí vas a ver tus puntos del mes, '
        + 'tu lugar en la tabla, contra quién ganas más y qué te falta para la playera de campeón.'),
      el('button', { class: 'btn btn-primary mt-4', onclick: () => navigate('/convocatorias') },
        'Ver las convocatorias'),
    ])));
  } else {
    /* ---------- 1. Tu mes ---------- */
    wrap.appendChild(entra(renderTuMes(tablero)));
    /* ---------- 2. La carrera por el campeonato ---------- */
    const carrera = el('div');
    wrap.appendChild(entra(carrera));
    renderCarreraCampeonato(carrera, tablero, profile);
    /* ---------- 3. Tus estadísticas ---------- */
    wrap.appendChild(entra(renderTusEstadisticas(tablero)));
    /* ---------- 4. Tus rivales ---------- */
    const rivales = el('div');
    wrap.appendChild(entra(rivales));
    renderTusRivales(rivales);
    /* ---------- 5. Tus puntos ---------- */
    const puntos = el('div');
    wrap.appendChild(entra(puntos));
    renderTusPuntos(puntos);
  }

  /* ---------- Tus próximas sesiones ---------- */
  if (proximosRegistros.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Tus próximas sesiones'));
    const list = el('div', { class: 'card' });
    proximosRegistros.slice(0, 5).forEach((r, i) => {
      const esc = r.escaleras;
      const ws = esc.weekday_schedule;
      const st = STATUS_LABEL[r.status] || { text: r.status, cls: 'badge-neutral' };
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      list.appendChild(
        el('div', { class: 'row-between' }, [
          el('div', {}, [
            el('div', { style: 'font-weight:700;font-size:14.5px;' }, formatFecha(esc.session_date)),
            el('div', { class: 'text-tiny' },
              `${FORMATO_LARGO[ws.format] || ws.format} · Cat ${ws.category || '—'}`),
          ]),
          el('span', { class: `badge ${st.cls}` }, st.text),
        ])
      );
    });
    wrap.appendChild(list);
  }

  /* ---------- 6. Tu próxima jugada (detalle) ---------- */
  wrap.appendChild(renderSugerenciaConvocatoria(nocheSugerida));

  /* ---------- Liguilla, solo si el club la vuelve a prender ---------- */
  if (miLiguilla && !miLiguilla.esHoy && !miLiguilla.porConfirmar) {
    const titulo = TIER_NOMBRE[miLiguilla.evento.tier] || 'Liguilla';
    wrap.appendChild(
      el('div', { class: 'card mt-4', style: 'border-color:var(--cyan);', onclick: () => navigate('/liguilla') }, [
        el('div', { class: 'row-between' }, [
          el('div', { style: 'font-weight:700;' }, [
            el('span', { html: icon.trophy, style: 'width:16px;height:16px;vertical-align:-3px;margin-right:6px;color:var(--cyan);' }),
            titulo,
          ]),
          el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
        ]),
        el('p', { class: 'text-tiny mt-2' },
          miLiguilla.fechaTexto ? `Juegas el ${miLiguilla.fechaTexto}. Toca para ver el cuadro.`
                                : 'Toca para ver cómo va.'),
      ])
    );
  }

  return wrap;
}

/* ---------- La tarjeta de "hoy juegas la Liguilla" (solo si está prendida) ---------- */
function renderHoyLiguilla(miLiguilla) {
  const ev = miLiguilla.evento;
  return el('div', { class: 'card card-hero mt-4', style: 'border-color:var(--oro);' }, [
    el('div', { class: 'row-between' }, [
      el('div', { class: 'h2' }, [
        el('span', { html: icon.trophy, style: 'width:19px;height:19px;vertical-align:-3px;margin-right:7px;color:var(--oro);' }),
        'Hoy juegas la Liguilla',
      ]),
      el('span', { class: `badge ${miLiguilla.confirmado ? 'badge-success' : 'badge-warning'}` },
        miLiguilla.confirmado ? 'Confirmado' : 'Falta confirmar'),
    ]),
    el('p', { class: 'text-muted mt-2' }, TIER_NOMBRE[ev.tier] || 'Liguilla'),
    miLiguilla.horaTexto ? el('p', { class: 'text-muted' }, miLiguilla.horaTexto) : null,
    el('button', { class: 'btn btn-secondary mt-4', onclick: () => navigate('/liguilla') }, 'Ver la Liguilla'),
  ]);
}

/* ---------- 0. Tu próxima jugada, versión compacta ---------- */
function renderProximaCompacta(f, proximosRegistros) {
  // Si ya tiene lugar en algo, eso manda sobre la sugerencia.
  const yaTengo = (proximosRegistros || [])[0];
  if (yaTengo) {
    const esc = yaTengo.escaleras; const ws = esc.weekday_schedule;
    return el('button', {
      class: 'card fila-enlace mt-3',
      onclick: () => navigate('/convocatoria?id=' + esc.id),
    }, [
      el('div', { class: 'row gap-2', style: 'align-items:center;min-width:0;' }, [
        el('span', { html: icon.calendar, style: 'width:18px;height:18px;color:var(--cyan);flex:0 0 auto;' }),
        el('div', { style: 'min-width:0;text-align:left;' }, [
          el('div', { class: 'text-tiny', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);font-weight:800;' },
            'Tu próxima jugada'),
          el('div', { style: 'font-weight:700;font-size:14px;' },
            `${formatFecha(esc.session_date)} · ${FORMATO_LARGO[ws.format] || ws.format}`),
        ]),
      ]),
      el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
    ]);
  }
  if (!f) {
    return el('button', {
      class: 'card fila-enlace mt-3', onclick: () => navigate('/convocatorias'),
    }, [
      el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
        el('span', { html: icon.calendar, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
        el('div', { style: 'text-align:left;' }, [
          el('div', { class: 'text-tiny', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);font-weight:800;' },
            'Tu próxima jugada'),
          el('div', { style: 'font-weight:700;font-size:14px;' }, 'Ahorita no hay nada abierto'),
        ]),
      ]),
      el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
    ]);
  }
  const esParejas = f.formato === 'parejas';
  const esRetas = f.formato === 'retas_abiertas';
  let falta = '';
  if (!esRetas) {
    const cap = f.capacidad || 12;
    const total = esParejas ? Math.floor(cap / 2) : cap;
    const van = esParejas ? Math.floor((f.ocupados || 0) / 2) : (f.ocupados || 0);
    const n = Math.max(total - van, 0);
    falta = n > 0
      ? ` · ${esParejas ? (n === 1 ? 'falta 1 pareja' : `faltan ${n} parejas`)
                        : (n === 1 ? 'falta 1 jugador' : `faltan ${n} jugadores`)}`
      : ' · está completa';
  }
  const causa = f.causa_info || null;
  return el('button', {
    class: 'card fila-enlace mt-3' + (causa ? ' tarjeta-causa' : ''),
    style: causa ? '' : 'border-color:var(--cyan);',
    onclick: () => navigate('/convocatoria?id=' + f.escalera_id),
  }, [
    el('div', { class: 'row gap-2', style: 'align-items:center;min-width:0;' }, [
      el('span', {
        html: causa ? icon.corazon : icon.calendar,
        style: `width:18px;height:18px;color:${causa ? 'var(--causa)' : 'var(--cyan)'};flex:0 0 auto;`,
      }),
      el('div', { style: 'min-width:0;text-align:left;' }, [
        el('div', { class: 'text-tiny', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);font-weight:800;' },
          'Tu próxima jugada'),
        el('div', { style: 'font-weight:700;font-size:14px;' },
          causa
            ? `${causa.titulo || 'Retas con causa'} · ${formatFecha(f.session_date)}`
            : `${FORMATO_LARGO[f.formato] || f.formato} · ${formatFecha(f.session_date)}${falta}`),
        causa
          ? el('div', { class: 'text-tiny', style: 'color:var(--causa);font-weight:700;' },
              causa.nombre || '')
          : null,
      ]),
    ]),
    el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
  ]);
}

/* ---------- 1. Tu mes ---------- */
function renderTuMes(tablero) {
  const cats = Object.keys(tablero.categorias || {});
  const wrap = el('div', { class: 'mt-4' });
  wrap.appendChild(el('div', { class: 'section-title', style: 'margin-top:0;' }, 'Tu mes'));

  if (!cats.length) {
    wrap.appendChild(el('div', { class: 'card' },
      el('p', { class: 'text-muted' }, 'Este mes todavía no juegas ninguna noche.')));
    return wrap;
  }

  cats.forEach((cat) => {
    const c = tablero.categorias[cat];
    const panel = el('div', { class: 'panel-vidrio mt-2', style: 'padding:18px;' });
    panel.appendChild(el('div', { class: 'row-between' }, [
      el('span', { class: `badge ${CAT_BADGE_CLASS[cat] || 'badge-neutral'}` }, CAT_LABEL[cat] || cat),
      c.es_campeon
        ? el('span', { class: 'badge badge-success' }, '🏆 Campeón del mes')
        : el('span', { class: `badge ${c.elegible ? 'badge-success' : 'badge-warning'}` },
            c.elegible ? 'Ya puedes ganar' : `Te faltan ${c.noches_faltantes}`),
    ]));

    panel.appendChild(el('div', { class: 'row-between mt-3', style: 'align-items:flex-end;' }, [
      el('div', {}, [
        el('div', { class: 'numerazo' }, Number(c.puntos).toFixed(0)),
        el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);' }, 'puntos este mes'),
      ]),
      el('div', { style: 'text-align:right;' }, [
        el('div', { style: 'font-size:26px;font-weight:800;' }, `#${c.lugar}`),
        el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);' }, 'tu lugar'),
      ]),
    ]));

    // La barra de noches: el mínimo tiene que verse, no sorprender.
    const hechas = Math.min(c.noches, c.min_noches);
    const pct = Math.round(100 * hechas / Math.max(c.min_noches, 1));
    const barra = el('div', { class: 'barra-premio mt-4' },
      el('i', { style: `width:${pct}%;--ancho-final:${pct}%;` }));
    panel.appendChild(barra);
    panel.appendChild(el('p', { class: 'text-tiny mt-2' },
      c.elegible
        ? `Llevas ${c.noches} noches: ya cumples el mínimo para la playera.`
        : `Llevas ${c.noches} de ${c.min_noches} noches. Te falta${c.noches_faltantes === 1 ? '' : 'n'} ${c.noches_faltantes} para poder ganar la playera.`));

    if (!c.es_campeon && c.lider_nombre) {
      panel.appendChild(el('div', { class: 'aviso aviso-info mt-3' },
        c.puntos_al_lider > 0
          ? `Te faltan ${Number(c.puntos_al_lider).toFixed(0)} puntos para alcanzar a ${c.lider_nombre}.`
          : `Vas empatado con ${c.lider_nombre} en puntos.`));
    }
    if (c.motivo_desempate) {
      panel.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
        c.motivo_desempate));
    }
    wrap.appendChild(panel);
  });
  return wrap;
}

/* ---------- 2. La carrera por el campeonato ---------- */
async function renderCarreraCampeonato(host, tablero, profile) {
  const cats = Object.keys(tablero.categorias || {});
  if (!cats.length) return;
  // Si juega en las dos, se abre en la que lleva más noches.
  let cat = cats[0];
  if (cats.length > 1) {
    cat = tablero.categorias[cats[0]].noches >= tablero.categorias[cats[1]].noches ? cats[0] : cats[1];
  }

  const titulo = el('div', { class: 'section-title' }, 'La carrera por el campeonato');
  const chips = el('div', { class: 'tabs mb-2' });
  const lista = el('div', { class: 'panel-vidrio', style: 'padding:14px 16px;' });
  host.append(titulo, cats.length > 1 ? chips : el('span'), lista);

  async function pintar() {
    chips.innerHTML = '';
    if (cats.length > 1) {
      cats.forEach((c) => chips.appendChild(el('button', {
        class: `tab-chip ${cat === c ? 'active' : ''}`,
        onclick: () => { cat = c; pintar(); },
      }, CAT_LABEL[c] || c)));
    }
    lista.innerHTML = '';
    lista.appendChild(el('div', { class: 'skeleton', style: 'height:150px;' }));
    let filas = [];
    try {
      const mod = await import('../api.js');
      if (typeof mod.getTablaMes !== 'function') { lista.innerHTML = ''; return; }
      filas = await mod.getTablaMes(cat, tablero.mes);
    } catch (err) {
      lista.innerHTML = '';
      lista.appendChild(el('p', { class: 'text-tiny' }, 'No se pudo cargar la carrera.'));
      return;
    }
    lista.innerHTML = '';
    const top = filas.slice(0, 5);
    const yoFuera = !top.some((f) => f.player_id === (profile && profile.id));
    const yo = filas.find((f) => f.player_id === (profile && profile.id));

    top.forEach((f, i) => {
      if (i > 0) lista.appendChild(el('hr', { class: 'sep', style: 'margin:9px 0;' }));
      lista.appendChild(filaCarrera(f, profile));
    });
    if (yoFuera && yo) {
      lista.appendChild(el('hr', { class: 'sep', style: 'margin:9px 0;' }));
      lista.appendChild(el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);text-align:center;' }, '···'));
      lista.appendChild(filaCarrera(yo, profile));
    }
    lista.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm mt-3', onclick: () => navigate('/ranking'),
    }, 'Ver la tabla completa'));
  }
  await pintar();
}

function filaCarrera(f, profile) {
  const soyYo = f.player_id === (profile && profile.id);
  return el('div', { class: 'row-between', style: soyYo ? 'font-weight:800;' : '' }, [
    el('div', { class: 'row gap-2', style: 'align-items:center;min-width:0;' }, [
      el('span', { class: 'rank-num' }, f.es_campeon ? '🏆' : String(f.lugar)),
      el('span', { class: 'avatar-mini' }, avatarContent(f)),
      el('div', { style: 'min-width:0;' }, [
        el('div', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' },
          (f.full_name || 'Jugador') + (soyYo ? ' (tú)' : '')),
        f.noches_faltantes > 0
          ? el('div', { class: 'text-tiny', style: 'color:var(--warning);' },
              `le falta${f.noches_faltantes === 1 ? '' : 'n'} ${f.noches_faltantes} noche${f.noches_faltantes === 1 ? '' : 's'}`)
          : null,
      ]),
    ]),
    el('span', { style: 'font-variant-numeric:tabular-nums;' }, Number(f.puntos).toFixed(0)),
  ]);
}

/* ---------- 3. Tus estadísticas ---------- */
function renderTusEstadisticas(tablero) {
  const e = tablero.estadisticas || {};
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'section-title' }, 'Tus estadísticas'));
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'grid-3' }, [
    el('div', { class: 'stat-tile' }, [
      el('div', { class: 'stat-value' }, String(e.noches_jugadas ?? 0)),
      el('div', { class: 'stat-label' }, 'Noches'),
    ]),
    el('div', { class: 'stat-tile' }, [
      el('div', { class: 'stat-value' }, String(e.partidos ?? 0)),
      el('div', { class: 'stat-label' }, 'Partidos'),
    ]),
    el('div', { class: 'stat-tile' }, [
      el('div', { class: 'stat-value' }, e.pct_ganados != null ? `${e.pct_ganados}%` : '—'),
      el('div', { class: 'stat-label' }, 'Ganados'),
    ]),
  ]));
  if (e.mejor_noche_puntos) {
    card.appendChild(el('div', { class: 'aviso aviso-info mt-3' },
      `Tu mejor noche: ${Number(e.mejor_noche_puntos).toFixed(0)} puntos el ${formatFecha(e.mejor_noche_fecha)}`
      + (e.mejor_noche_cat ? ` en Categoría ${e.mejor_noche_cat}.` : '.')));
  }
  wrap.appendChild(card);
  return wrap;
}

/* ---------- 4. Tus rivales ---------- */
async function renderTusRivales(host) {
  host.appendChild(el('div', { class: 'section-title' }, 'Tus rivales'));
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'skeleton', style: 'height:110px;' }));
  host.appendChild(card);

  let rivales = [];
  try {
    const mod = await import('../api.js');
    if (typeof mod.getMisRivales !== 'function') { card.innerHTML = ''; return; }
    rivales = await mod.getMisRivales();
  } catch (err) {
    card.innerHTML = '';
    card.appendChild(el('p', { class: 'text-tiny' }, 'No se pudieron cargar tus rivales.'));
    return;
  }

  // Con uno o dos enfrentamientos esto es ruido ("tu víctima favorita: 1 de 1").
  const MIN = 3;
  const conHistoria = rivales.filter((r) => r.total >= MIN);
  card.innerHTML = '';

  if (!conHistoria.length) {
    card.appendChild(el('p', { class: 'text-muted' },
      `Todavía no te has topado ${MIN} veces con nadie. Juega un par de noches más y aquí van a salir tus clásicos.`));
    return;
  }

  const gano = [...conHistoria].sort((a, b) => (b.ganados - b.perdidos) - (a.ganados - a.perdidos))[0];
  const pierdo = [...conHistoria].sort((a, b) => (b.perdidos - b.ganados) - (a.perdidos - a.ganados))[0];

  const bloque = (titulo, r, bueno) => el('div', { class: 'row-between', style: 'padding:6px 0;' }, [
    el('div', { class: 'row gap-2', style: 'align-items:center;min-width:0;' }, [
      el('span', { class: 'avatar-mini' }, avatarContent(r)),
      el('div', { style: 'min-width:0;' }, [
        el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;font-weight:800;' }, titulo),
        el('div', { style: 'font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }, r.full_name),
      ]),
    ]),
    el('div', { class: 'marcador-rival' }, [
      el('span', { class: bueno ? 'g' : 'p' }, String(r.ganados)),
      el('span', { class: 'sep' }, '–'),
      el('span', { class: bueno ? 'p' : 'g' }, String(r.perdidos)),
    ]),
  ]);

  if (gano && (gano.ganados > gano.perdidos)) card.appendChild(bloque('A quién le ganas más', gano, true));
  if (pierdo && (pierdo.perdidos > pierdo.ganados)) {
    if (card.children.length) card.appendChild(el('hr', { class: 'sep', style: 'margin:8px 0;' }));
    card.appendChild(bloque('Contra quién pierdes más', pierdo, false));
  }
  if (!card.children.length) {
    card.appendChild(el('p', { class: 'text-muted' }, 'Vas parejo con todos tus rivales: ninguno te saca ventaja todavía.'));
  }
  card.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
    'En pádel siempre son dos contra dos: esto cuenta los partidos en los que estuvieron en lados opuestos de la red.'));
}

/* ---------- 5. Tus puntos ---------- */
async function renderTusPuntos(host) {
  host.appendChild(el('div', { class: 'section-title' }, 'Tus puntos'));
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'skeleton', style: 'height:120px;' }));
  host.appendChild(card);

  let noches = [];
  try {
    const mod = await import('../api.js');
    if (typeof mod.getMisPuntosPorNoche !== 'function') { card.innerHTML = ''; return; }
    noches = await mod.getMisPuntosPorNoche(null, 8);
  } catch (err) {
    card.innerHTML = '';
    card.appendChild(el('p', { class: 'text-tiny' }, 'No se pudieron cargar tus puntos.'));
    return;
  }
  card.innerHTML = '';
  if (!noches.length) {
    card.appendChild(el('p', { class: 'text-muted' }, 'Todavía no tienes noches jugadas.'));
    return;
  }

  const orden = [...noches].reverse();              // de la más vieja a la más nueva
  const max = Math.max(...orden.map((n) => Number(n.puntos) || 0), 1);
  const barras = el('div', { class: 'barras-puntos' });
  orden.forEach((n, i) => {
    const alto = Math.max(6, Math.round(72 * (Number(n.puntos) || 0) / max));
    const col = el('div', {}, [
      el('div', { class: 'text-tiny', style: 'text-align:center;font-weight:800;font-size:10px;' },
        Number(n.puntos).toFixed(0)),
      el('div', { class: 'barra', style: `height:${alto}px;animation-delay:${i * 55}ms;` }),
      el('div', { class: 'pie' }, formatFechaCortaSegura(n.session_date)),
    ]);
    barras.appendChild(col);
  });
  card.appendChild(barras);
  card.appendChild(el('p', { class: 'text-tiny mt-3', style: 'color:var(--text-tertiary);' },
    'Tus últimas noches, de la más vieja a la más reciente.'));
}

function formatFechaCortaSegura(fecha) {
  try {
    const d = new Date(fecha + 'T12:00:00Z');
    return d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short' })
      .replace('.', '');
  } catch { return ''; }
}

/* ---------- La playera ganada: elegir talla ---------- */
function renderElegirTalla(premio) {
  const TALLAS = ['S', 'M', 'L', 'XL', 'XXL'];
  const card = el('div', { class: 'card mb-3', style: 'border:1.5px solid var(--oro);' });
  card.appendChild(el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
    el('span', { html: icon.trophy, style: 'width:20px;height:20px;color:var(--oro);' }),
    el('div', { style: 'font-weight:800;font-size:15px;color:var(--oro);' }, '¡Ganaste la playera de campeón!'),
  ]));
  card.appendChild(el('p', { class: 'text-tiny mt-2' },
    `${premio.descripcion || 'Campeón del mes'}. Elige tu talla y recógela en recepción.`));
  const fila = el('div', { class: 'row gap-2 mt-3', style: 'flex-wrap:wrap;' });
  TALLAS.forEach((t) => {
    const b = el('button', { class: 'btn btn-secondary btn-sm', style: 'width:auto;min-width:54px;' }, t);
    b.addEventListener('click', async () => {
      Array.from(fila.children).forEach((x) => { x.disabled = true; });
      try {
        const mod = await import('../api.js');
        if (typeof mod.elegirTallaPlayera !== 'function') throw new Error('Cierra la app y vuelve a abrirla.');
        await mod.elegirTallaPlayera(premio.id, t);
        toast(`Listo, talla ${t} apartada. Pásala a recoger a recepción.`, 'success');
        card.remove();
      } catch (err) {
        toast(humanizeError(err), 'error');
        Array.from(fila.children).forEach((x) => { x.disabled = false; });
      }
    });
    fila.appendChild(b);
  });
  card.appendChild(fila);
  return card;
}

const TIER_NOMBRE = { liguilla_a: 'Liguilla · Categoría A', ascenso_b: 'Liguilla Categoría B' };

/* Mi lugar en la Liguilla del mes, si lo tengo.
   Se revisan los DOS tiers porque se puede calificar a los dos el mismo
   mes. Lo que manda es tener fila en la lista de calificados, no ir en el
   top del ranking: un jugador con 2 noches es elegible para la Liguilla
   pero "provisional" en el Ranking, y antes eso lo dejaba sin ver nada. */
async function cargarMiLiguilla(profile) {
  if (!profile) return null;
  for (const tier of ['liguilla_a', 'ascenso_b']) {
    try {
      const evento = await getEventoLiguillaActivo([tier]);
      if (!evento || ['completed', 'cancelled_no_players', 'cancelled'].includes(evento.status)) continue;
      const cal = await getMiCalificacionLiguilla(evento.id, profile.id);
      if (!cal || !['invited', 'confirmed'].includes(cal.status)) continue;

      let horaTexto = null;
      try {
        const ts = await getLiguillaEventStartTs(evento.id);
        // En la zona del CLUB, no en la del teléfono: toTimeString() da la
        // hora local del navegador y a un jugador fuera de Cuernavaca le
        // enseñaría una hora que no es la de su partido.
        if (ts) {
          horaTexto = new Date(ts).toLocaleTimeString('es-MX', {
            timeZone: CLUB_TZ, hour: 'numeric', minute: '2-digit', hour12: true,
          });
        }
      } catch { /* la hora es un extra */ }

      return {
        evento,
        calificacion: cal,
        confirmado: cal.status === 'confirmed',
        porConfirmar: cal.status === 'invited',
        esHoy: evento.event_date === todayISO(),
        fechaTexto: evento.event_date ? formatFecha(evento.event_date) : null,
        horaTexto,
      };
    } catch (err) {
      console.error('No se pudo leer tu situación de Liguilla:', err);
    }
  }
  return null;
}

/* "Confirma tu lugar", con el botón que de verdad confirma — sin mandarlo
   a otra pantalla a buscarlo. */
function renderConfirmarLiguilla(info) {
  const titulo = TIER_NOMBRE[info.evento.tier] || 'Liguilla';
  const card = el('div', { class: 'card mt-3', style: 'border:1.5px solid var(--oro);' });
  card.appendChild(el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
    el('span', { html: icon.trophy, style: 'width:19px;height:19px;color:var(--oro);' }),
    el('div', { style: 'font-weight:800;font-size:15px;color:var(--oro);' }, '¡Calificaste a la Liguilla!'),
  ]));
  card.appendChild(el('p', { class: 'text-tiny mt-2' },
    `${titulo}${info.fechaTexto ? ' · ' + info.fechaTexto : ''}${info.horaTexto ? ' · ' + info.horaTexto : ''}`));
  card.appendChild(el('p', { class: 'text-tiny mt-1' },
    'Falta que confirmes tu lugar. Si no confirmas, pasa al siguiente de la fila.'));

  const btn = el('button', { class: 'btn btn-primary mt-3' }, 'Confirmar mi lugar');
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Confirmando…';
    try {
      await responderCalificacionLiguilla(info.calificacion.id, true);
      toast('¡Listo! Tu lugar quedó apartado.', 'success');
      navigate('/liguilla');
    } catch (err) {
      toast(humanizeError(err), 'error');
      btn.disabled = false; btn.textContent = 'Confirmar mi lugar';
    }
  });
  card.appendChild(btn);
  card.appendChild(el('button', {
    class: 'btn btn-ghost btn-sm mt-2', onclick: () => navigate('/liguilla'),
  }, 'Ver los detalles primero'));
  return card;
}

/* Cuanto te falta para la Liguilla, debajo de tus numeros del ranking.
   La RPC mi_carrera_liguilla ya trae todo resuelto del lado del servidor:
   ya_calificado, margen (de colchon si vas dentro, lo que falta si no),
   aun_posible y un mensaje. Aqui solo se elige la version corta, porque la
   larga ya vive en la pestana de Liguilla. Si la RPC falla o el jugador
   todavia no tiene carrera, no se pinta nada — nunca un hueco raro. */

/* ============================================================
   La convocatoria que esta mas cerca de jugarse (2.6)
   ------------------------------------------------------------
   Se elige SIN mirar el nivel del jugador: el nivel solo decide
   cual es la "recomendada", no a cuales puede entrar (lo verifique
   anotando un 7ma varonil principiante a Individual B: entra).
   Se excluyen las noches donde ya tiene lugar — esas ya salen en
   "Hoy juegas" y en "Tus proximas sesiones" — y la Liguilla, que
   tiene su propia pestana y no es de libre inscripcion.
   ============================================================ */
function sugerenciaConvocatoria(convocatorias) {
  const candidatas = (convocatorias || []).filter((f) => {
    // OJO con ventana_abierta: NO significa "se puede anotar". Es la
    // ventana de VENTAJA del top del ranking, que solo vive el domingo de
    // 10 a 18, y en Retas Abiertas vale false siempre (no hay ranking que
    // repartir). Filtrar por ella dejaba este panel vacío el 99% del
    // tiempo: comprobado contra producción el 20 nov 2026, las dos noches
    // visibles traían abierta=false y "Tu próxima jugada" no salía nunca.
    // Lo que de verdad importa es si el jugador todavía puede hacer algo
    // con esa noche, y todo lo que devuelve mis_convocatorias ya está
    // abierto para él.
    if (f.es_liguilla) return false;
    if (f.esc_status && f.esc_status !== 'scheduled') return false;
    // Ya tiene lugar (o esta en la fila): no es algo que sugerirle.
    if (f.mi_registro_id && ['confirmed', 'substitute', 'waitlist'].includes(f.mi_status)) return false;
    // Ya paso la hora de inicio: sugerir algo que ya empezo es ruido.
    if (f.horas_faltantes != null && f.horas_faltantes <= 0) return false;
    return true;
  });
  if (candidatas.length === 0) return null;
  candidatas.sort((a, b) => {
    const ha = a.horas_faltantes == null ? 1e9 : a.horas_faltantes;
    const hb = b.horas_faltantes == null ? 1e9 : b.horas_faltantes;
    if (ha !== hb) return ha - hb;
    return String(a.session_date).localeCompare(String(b.session_date));
  });
  return candidatas[0];
}

const FORMATO_LARGO = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };

function renderSugerenciaConvocatoria(f) {
  const wrap = el('div');

  if (f) {
    const esParejas = f.formato === 'parejas';
    const esRetas = f.formato === 'retas_abiertas';
    const causa = f.causa_info || null;
    const card = el('div', {
      class: 'card mt-4' + (causa ? ' tarjeta-causa' : ''),
      style: causa ? '' : 'border-color:var(--cyan);',
    });

    card.appendChild(el('div', { class: 'row-between' }, [
      el('div', { class: 'text-tiny', style: 'text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary);font-weight:800;' },
        'Tu próxima jugada'),
      causa
        ? el('span', { class: 'badge badge-causa' }, 'Con causa')
        : (f.categoria ? el('span', { class: `badge ${CAT_BADGE_CLASS[f.categoria] || 'badge-neutral'}` },
            CAT_LABEL[f.categoria] || f.categoria) : null),
    ]));

    if (causa) {
      const hueco = el('div', { class: 'mt-3' });
      card.appendChild(hueco);
      import('../vendor/apapacho.js')
        .then((mod) => { hueco.appendChild(mod.logoApapacho({ alto: 64 })); })
        .catch(() => { /* sin el corazón la tarjeta sigue sirviendo */ });
    }

    // El nombre del fondo ya lo dice el logo de arriba: repetirlo aquí
    // dejaba "Fondo Apapacho" dos veces seguidas.
    card.appendChild(el('div', { class: 'h2 mt-2' },
      causa ? (causa.titulo || 'Retas con causa') : (FORMATO_LARGO[f.formato] || f.formato)));
    card.appendChild(el('p', { class: 'text-muted mt-1' }, formatFecha(f.session_date)));
    card.appendChild(el('p', { class: 'text-muted' },
      `${formatHora(f.start_time)}${f.end_time ? ' – ' + formatHora(f.end_time) : ''}`));

    // En Retas NO se enseña conteo ni cupo: el tope de 25 es solo para
    // recepcion (instruccion del 22 oct 2026). Decir "faltan N" aqui seria
    // justo la fuga que se cerro en el 2.5.
    if (esRetas) {
      card.appendChild(el('p', { class: 'text-tiny mt-3' },
        causa
          ? (causa.destino || 'Lo que se recaude se dona completo.') + ' Nivel libre y sin puntos. Se paga en recepción.'
          : 'Nivel libre y sin puntos. Se paga en recepción.'));
    } else {
      const cap = f.capacidad || 12;
      const total = esParejas ? Math.floor(cap / 2) : cap;
      const van = esParejas ? Math.floor((f.ocupados || 0) / 2) : (f.ocupados || 0);
      // Los que apartaron sin confirmar se cuentan aparte: ese lugar se
      // puede caer solo y quien lo quiera tiene derecho a saberlo.
      const enElAire = esParejas
        ? Math.floor((f.por_confirmar || 0) / 2)
        : (f.por_confirmar || 0);
      const firmes = Math.max(van - enElAire, 0);
      const faltan = Math.max(total - van, 0);
      const unidad = esParejas ? (faltan === 1 ? 'pareja' : 'parejas') : (faltan === 1 ? 'jugador' : 'jugadores');
      const sinConfirmar = enElAire > 0
        ? ` ${enElAire} ${esParejas ? (enElAire === 1 ? 'pareja' : 'parejas') : (enElAire === 1 ? 'jugador' : 'jugadores')} sin confirmar.`
        : '';
      card.appendChild(el('div', { class: `aviso ${faltan > 0 || enElAire > 0 ? 'aviso-warn' : 'aviso-info'} mt-3` },
        faltan > 0
          ? `Van ${firmes} de ${total} en firme.${sinConfirmar} Faltan ${faltan} ${unidad} para que se juegue.`
          : (enElAire > 0
              ? `Está completa, pero solo ${firmes} de ${total} en firme.${sinConfirmar}`
              : `Ya está completa (${van} de ${total}). Te puedes anotar a la lista de espera.`)));
    }

    card.appendChild(el('button', {
      class: 'btn btn-primary mt-3',
      onclick: () => navigate('/convocatoria?id=' + f.escalera_id),
    }, 'Ver esta convocatoria'));
    card.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm mt-2',
      onclick: () => navigate('/convocatorias'),
    }, 'Ver todas las convocatorias'));
    wrap.appendChild(card);
    return wrap;
  }

  // Sin nada abierto: el boton a todas las convocatorias se mantiene
  // siempre, porque es la puerta que el jugador viene a buscar.
  wrap.appendChild(el('button', {
    class: 'btn btn-secondary mt-4',
    onclick: () => navigate('/convocatorias'),
  }, 'Ver todas las convocatorias'));
  return wrap;
}

/* ============================================================
   INICIO DEL ADMIN
   ------------------------------------------------------------
   Recepción abre la app y tiene que ver, sin buscar nada:
     · qué le toca HOY y el botón para hacerlo,
     · qué se le quedó sin cerrar de días pasados,
     · qué noches de esta semana van flojas de gente.
   Un solo botón grande por bloque. Nada de menús.
   ============================================================ */

const FORMATO = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };

async function renderInicioAdmin(profile) {
  const wrap = el('div');
  const nombre = (profile && profile.full_name) ? profile.full_name.split(' ')[0] : 'Recepción';

  wrap.appendChild(el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, `Hola, ${nombre}`),
    el('div', { class: 'avatar-btn', style: 'width:44px;height:44px;font-size:15px;' }, avatarContent(profile)),
  ]));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Esto es lo que te toca administrar.'));

  let escaleras = [];
  try {
    escaleras = await getEscalerasAdmin();
  } catch (err) {
    console.error('No se pudieron cargar las noches:', err);
    wrap.appendChild(el('div', { class: 'aviso aviso-danger' },
      'No se pudieron cargar las noches del club. Revisa tu conexión y vuelve a entrar.'));
    return wrap;
  }

  const hoy = todayISO();
  const jugables = escaleras.filter((e) => e.weekday_schedule && e.weekday_schedule.format !== 'retas_abiertas');
  const deHoy = jugables.filter((e) => e.session_date === hoy && e.status !== 'cancelled');
  const pendientes = jugables.filter((e) => e.session_date < hoy && !['completed', 'cancelled'].includes(e.status));
  const proximas = jugables
    .filter((e) => e.session_date > hoy && e.status === 'scheduled')
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .slice(0, 4);

  const conteos = await getConteosRegistros(
    [...deHoy, ...pendientes, ...proximas].map((e) => e.id)).catch(() => ({}));

  /* ---------- lo que hay que atender (bajas de ultima hora, multas) ---------- */
  // Se pide despues de las noches para no retrasar lo de hoy, pero se pinta
  // ARRIBA: una baja a dos horas de la noche se arregla por WhatsApp o no se
  // arregla. El hueco se reserva aqui y se llena cuando llega la respuesta.
  const huecoAlertas = el('div');
  const huecoPendientes = el('div');
  wrap.appendChild(huecoAlertas);

  /* ---------- lo de hoy ---------- */
  wrap.appendChild(el('div', { class: 'section-title', style: 'margin-top:0;' }, 'Hoy'));
  if (!deHoy.length) {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'h2' }, 'Hoy no hay escalera'),
      el('p', { class: 'text-muted mt-2' },
        escaleras.some((e) => e.session_date === hoy && e.weekday_schedule && e.weekday_schedule.format === 'retas_abiertas' && e.status !== 'cancelled')
          ? 'Hoy son Retas Abiertas: se cobran en recepción y no se capturan aquí.'
          : 'Hoy no hay ninguna noche programada.'),
    ]));
  } else {
    deHoy.forEach((e) => wrap.appendChild(tarjetaAdmin(e, conteos[e.id], true)));
  }

  /* ---------- lo que se quedó abierto ---------- */
  if (pendientes.length) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Se quedaron sin cerrar'));
    wrap.appendChild(el('div', { class: 'aviso aviso-warn mb-3' },
      'Mientras no se cierren, esas noches no cuentan para el ranking ni para la Liguilla.'));
    pendientes.forEach((e) => wrap.appendChild(tarjetaAdmin(e, conteos[e.id], false)));
  }

  /* ---------- las que vienen ---------- */
  if (proximas.length) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Cómo van las que vienen'));
    const card = el('div', { class: 'card' });
    proximas.forEach((e, i) => {
      const c = conteos[e.id] || { confirmados: 0, espera: 0, porConfirmar: 0 };
      const cupo = (e.weekday_schedule && e.weekday_schedule.capacity) || 12;
      const completo = c.confirmados >= cupo && !(c.porConfirmar > 0);
      if (i > 0) card.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      card.appendChild(el('div', { class: 'row-between fila-enlace', onclick: () => irANoche(e.id) }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;font-size:14.5px;' }, formatFecha(e.session_date)),
          el('div', { class: 'text-tiny' },
            `${FORMATO[e.weekday_schedule.format]}${e.weekday_schedule.category ? ' · Cat ' + e.weekday_schedule.category : ''}`),
        ]),
        el('span', { class: `badge ${completo ? 'badge-success' : 'badge-warning'}` },
          completo ? `${c.confirmados}/${cupo} lleno`
            : (c.porConfirmar ? `${c.confirmados - c.porConfirmar}+${c.porConfirmar}?/${cupo}` : `${c.confirmados}/${cupo}`)),
      ]));
    });
    wrap.appendChild(card);
    wrap.appendChild(el('p', { class: 'text-tiny mt-2' },
      'Si una noche no llega a su cupo, no hay escalera: se cancela. Puedes agregar gente tú mismo desde la noche.'));
  }

  // Lo que no es urgente (multas, suspendidos) va aquí abajo: no tiene que
  // competir con la noche de hoy por el primer vistazo.
  wrap.appendChild(huecoPendientes);
  pintarAlertasRecepcion(huecoAlertas, huecoPendientes).catch((err) => {
    console.error('No se pudieron cargar las alertas de recepción:', err);
    huecoAlertas.innerHTML = ''; huecoPendientes.innerHTML = '';
  });

  /* ---------- Liguilla del mes: la app la lleva sola, recepción la monitorea ---------- */
  try {
    const bloque = await renderMonitorLiguilla();
    if (bloque) wrap.appendChild(bloque);
  } catch (err) { console.error('No se pudo cargar el monitor de Liguilla:', err); }

  /* ---------- accesos ---------- */
  wrap.appendChild(el('div', { class: 'section-title' }, 'Otras cosas'));
  const accesos = el('div', { class: 'card' });
  const enlace = (texto, sub, path) => el('div', { class: 'fila-enlace', onclick: () => navigate(path) }, [
    el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:700;font-size:14.5px;' }, texto),
        el('div', { class: 'text-tiny mt-1' }, sub),
      ]),
      el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
    ]),
  ]);
  accesos.appendChild(enlace('Todas las noches', 'Historial y noches que vienen', '/admin/escaleras'));
  accesos.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
  accesos.appendChild(enlace('Jugadores', 'Sustituto, multa o suspensión', '/admin/jugadores'));
  accesos.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
  accesos.appendChild(enlace('Liguilla del mes', 'Calificados, draft y bracket', '/admin/liguilla'));
  if (esMaestro(profile)) {
    accesos.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
    accesos.appendChild(enlace('Configuración', 'Horarios, fórmula de puntos y staff', '/maestro'));
  }
  wrap.appendChild(accesos);

  return wrap;
}

/* ============================================================
   Alertas de recepción
   ------------------------------------------------------------
   Lo que pidió dirección después de la primera semana real: que
   el Inicio del admin AVISE cuando alguien se da de baja a
   última hora (para alcanzar a jalar gente por WhatsApp) y que
   deje ver de un golpe quién trae multa sin pagar y quién está
   suspendido o archivado. Lo urgente arriba, con el botón de
   WhatsApp en el mismo renglón.
   ============================================================ */
function waLinkRecepcion(nombre, telefono, mensaje) {
  const digitos = (telefono || '').replace(/\D/g, '');
  const texto = mensaje || `Hola${nombre ? ' ' + String(nombre).split(' ')[0] : ''}, te escribimos de Padel Palmira 🎾`;
  if (digitos.length !== 10) return null;
  return `https://wa.me/52${digitos}?text=${encodeURIComponent(texto)}`;
}

async function pintarAlertasRecepcion(box, boxResto) {
  const a = await getAlertasRecepcion();
  const incompletas = a.incompletas || [];
  const bajas = a.bajas || [];
  const multas = a.multas || [];
  const suspendidos = a.suspendidos || [];
  box.innerHTML = '';
  if (boxResto) boxResto.innerHTML = '';
  if (!incompletas.length && !bajas.length && !multas.length && !suspendidos.length) return;
  const resto = boxResto || box;

  /* ---- LO PRIMERO: noches de hoy y mañana que NO están completas ----
     Esta es la alerta que faltaba el 8 de octubre. No depende de haber
     cachado el momento en que se liberó el lugar ni de POR QUÉ se liberó:
     si falta gente, sale aquí, y punto. */
  incompletas.forEach((e) => {
    const esParejas = e.formato === 'parejas';
    const faltan = esParejas ? Math.ceil(e.faltan / 2) : e.faltan;
    const van = esParejas ? Math.floor(e.ocupados / 2) : e.ocupados;
    const total = esParejas ? Math.floor(e.capacidad / 2) : e.capacidad;
    const unidad = esParejas ? (faltan === 1 ? 'pareja' : 'parejas') : (faltan === 1 ? 'jugador' : 'jugadores');
    const horas = Number(e.horas_para_empezar);
    const urge = horas <= 6;
    const card = el('div', { class: 'card mb-3', style: `border:1.5px solid var(--${urge ? 'danger' : 'warning'});` }, [
      el('div', { class: 'row-between' }, [
        el('div', { style: 'min-width:0;' }, [
          el('div', { style: `font-weight:800;font-size:16px;color:var(--${urge ? 'danger' : 'warning'});` },
            `Falta${faltan === 1 ? '' : 'n'} ${faltan} ${unidad}`),
          el('div', { style: 'font-weight:700;font-size:14.5px;margin-top:4px;' }, formatFecha(e.session_date)),
          el('div', { class: 'text-tiny mt-1' },
            `${FORMATO[e.formato] || e.formato}${e.categoria ? ' · Cat ' + e.categoria : ''}`
            + ` · ${formatHora(e.start_time)} · van ${van} de ${total}`),
          horas <= 24
            ? el('div', { class: 'text-tiny mt-1', style: `color:var(--${urge ? 'danger' : 'warning'});font-weight:700;` },
                horas < 1 ? 'Empieza en menos de 1 hora' : `Empieza en ${horas} h`)
            : null,
          e.pendientes_de_aceptar > 0
            ? el('div', { class: 'text-tiny mt-1', style: 'color:var(--warning);' },
                `Ojo: ${e.pendientes_de_aceptar} ${e.pendientes_de_aceptar === 1 ? 'pareja apartada sigue' : 'parejas apartadas siguen'} esperando que el invitado acepte — puede caerse.`)
            : null,
        ]),
      ]),
      el('button', { class: 'btn btn-primary btn-sm mt-3', onclick: () => irANoche(e.escalera_id) },
        'Abrir y completar la noche'),
    ]);
    box.appendChild(card);
  });

  /* ---- lugares que se liberaron, por la vía que sea ---- */
  if (bajas.length) {
    box.appendChild(el('div', { class: 'section-title', style: 'margin-top:0;color:var(--warning);' },
      bajas.length === 1 ? 'Se liberó 1 lugar' : `Se liberaron ${bajas.length} lugares`));
    const card = el('div', { class: 'card', style: 'border-color:var(--warning);' });
    bajas.forEach((b, i) => {
      if (i > 0) card.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      const faltan = Math.max((b.capacidad || 12) - (b.ocupados || 0), 0);
      const link = waLinkRecepcion(b.nombre, b.telefono,
        `Hola, te escribimos de Padel Palmira 🎾 Nos quedó un lugar libre para la escalera del ${formatFecha(b.session_date)}. ¿Te animas?`);
      card.appendChild(el('div', { class: 'row-between' }, [
        el('div', { style: 'min-width:0;' }, [
          el('div', { style: 'font-weight:700;font-size:14.5px;' }, b.nombre || '(sin nombre)'),
          el('div', { class: 'text-tiny mt-1' },
            `${formatFecha(b.session_date)} · ${FORMATO[b.formato] || b.formato}`
            + (b.categoria ? ' · Cat ' + b.categoria : '')),
          el('div', { class: 'text-tiny mt-1' },
            `${b.motivo || 'Se liberó el lugar'} · ${formatFechaHora(b.cancelled_at)}`),
          el('div', { class: 'text-tiny mt-1', style: faltan > 0 ? 'color:var(--warning);font-weight:700;' : 'color:var(--success);font-weight:700;' },
            faltan > 0
              ? (b.cubierto ? `Entró alguien de lista de espera, pero aún faltan ${faltan}` : `Falta${faltan === 1 ? '' : 'n'} ${faltan} para el cupo`)
              : 'El cupo sigue completo'),
        ]),
        el('span', { class: `badge ${b.tardia ? 'badge-danger' : 'badge-neutral'}` },
          b.tardia ? 'Baja tardía' : (b.por_el_mismo ? 'A tiempo' : 'Sin penalización')),
      ]));
      const fila = el('div', { class: 'btn-row mt-2' });
      fila.appendChild(el('button', { class: 'btn btn-secondary btn-sm',
        onclick: () => irANoche(b.escalera_id) }, 'Abrir esa noche'));
      if (link) {
        fila.appendChild(el('a', { class: 'btn btn-secondary btn-sm', href: link, target: '_blank', rel: 'noopener',
          style: 'display:flex;align-items:center;justify-content:center;gap:6px;' },
          [el('span', { html: icon.whatsapp, style: 'width:16px;height:16px;' }), 'WhatsApp']));
      }
      card.appendChild(fila);
    });
    box.appendChild(card);
    box.appendChild(el('p', { class: 'text-tiny mt-2 mb-3' },
      'Las bajas hechas en los primeros 15 minutos después de anotarse no salen aquí: no cuentan como baja.'));
  }

  /* ---- multas y suspendidos: no es urgente, pero tiene que estar a la vista ---- */
  if (multas.length || suspendidos.length) {
    const resumen = [];
    if (multas.length) resumen.push(`${multas.length} multa${multas.length === 1 ? '' : 's'} sin pagar`);
    if (suspendidos.length) {
      resumen.push(suspendidos.length === 1
        ? '1 jugador suspendido o archivado'
        : `${suspendidos.length} jugadores suspendidos o archivados`);
    }
    resto.appendChild(el('div', { class: 'section-title' }, 'Pendientes con jugadores'));
    const card = el('div', { class: 'card' });
    card.appendChild(el('p', { class: 'text-muted' }, resumen.join(' · ')));

    multas.forEach((m) => {
      const link = waLinkRecepcion(m.nombre, m.telefono,
        `Hola${m.nombre ? ' ' + String(m.nombre).split(' ')[0] : ''}, te escribimos de Padel Palmira 🎾 Tienes una multa pendiente de $${Number(m.monto)} MXN. La puedes pagar en recepción.`);
      card.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      card.appendChild(el('div', { class: 'row-between' }, [
        el('div', { style: 'min-width:0;' }, [
          el('div', { style: 'font-weight:700;font-size:14.5px;' }, m.nombre || '(sin nombre)'),
          el('div', { class: 'text-tiny mt-1' },
            `$${Number(m.monto)} MXN · ${m.motivo || 'multa'} · ${formatFechaHora(m.applied_at)}`),
        ]),
        link
          ? el('a', { class: 'btn btn-secondary btn-sm', href: link, target: '_blank', rel: 'noopener', style: 'width:auto;' }, 'Cobrar')
          : el('span', { class: 'badge badge-warning' }, 'Sin pagar'),
      ]));
    });

    suspendidos.forEach((p) => {
      card.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      card.appendChild(el('div', { class: 'row-between' }, [
        el('div', { style: 'min-width:0;' }, [
          el('div', { style: 'font-weight:700;font-size:14.5px;' }, p.nombre || '(sin nombre)'),
          el('div', { class: 'text-tiny mt-1' },
            p.estado === 'suspended'
              ? (p.hasta ? `Suspendido hasta ${formatFecha(String(p.hasta).slice(0, 10))}` : 'Suspendido')
              : 'Archivado — no puede anotarse'),
        ]),
        el('span', { class: `badge ${p.estado === 'suspended' ? 'badge-danger' : 'badge-neutral'}` },
          p.estado === 'suspended' ? 'Suspendido' : 'Archivado'),
      ]));
    });

    card.appendChild(el('button', { class: 'btn btn-ghost btn-sm mt-2',
      onclick: () => navigate('/admin/jugadores') }, 'Ver todos los jugadores'));
    resto.appendChild(card);
  }
}

function irANoche(id) { abrirNoche(id); navigate('/admin/escaleras'); }

/* Una noche, con el botón que toca según en qué momento va. */
function tarjetaAdmin(e, conteo, esHoy) {
  const ws = e.weekday_schedule || {};
  const c = conteo || { confirmados: 0, espera: 0, porConfirmar: 0 };
  const cupo = ws.capacity || 12;
  const completo = c.confirmados >= cupo;
  // Un lugar apartado por una pareja que no ha aceptado NO es un lugar
  // seguro: el cupo se ve lleno y se puede caer solo (8 oct 2026).
  const enElAire = c.porConfirmar || 0;
  const esParejas = ws.format === 'parejas';
  const firmes = c.confirmados - enElAire;

  let etiqueta; let clase; let nota;
  if (e.status === 'in_progress') {
    etiqueta = 'Seguir capturando'; clase = 'btn-primary';
    nota = 'La noche ya arrancó. Captura los marcadores y genera cada ronda.';
  } else if (e.status === 'scheduled' && completo && enElAire > 0) {
    etiqueta = 'Ver quién va'; clase = 'btn-secondary';
    nota = `OJO: el cupo se ve lleno pero ${esParejas ? (enElAire / 2 === 1 ? '1 pareja sigue esperando' : (enElAire / 2) + ' parejas siguen esperando') : enElAire + ' todavía esperan'} que el invitado acepte. Si no aceptan, esos lugares se liberan solos.`;
  } else if (e.status === 'scheduled' && completo) {
    etiqueta = 'Abrir y comenzar'; clase = 'btn-primary';
    nota = 'Ya está el cupo completo. Cuando estén en cancha, ábrela y dale Comenzar.';
  } else if (e.status === 'scheduled') {
    etiqueta = 'Ver quién va'; clase = 'btn-secondary';
    nota = `Faltan ${cupo - c.confirmados} para completar. Si no se llena, hay que cancelar la noche.`;
  } else {
    etiqueta = 'Abrir'; clase = 'btn-secondary'; nota = '';
  }

  return el('div', { class: `card ${esHoy ? 'card-hero' : 'mt-3'}` }, [
    el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { class: 'h2' }, formatFecha(e.session_date)),
        el('p', { class: 'text-muted mt-1' },
          `${FORMATO[ws.format] || ws.format}${ws.category ? ' · Cat ' + ws.category : ''} · ${formatHora(ws.start_time)}`),
      ]),
      el('span', { class: `badge ${completo && !enElAire ? 'badge-success' : 'badge-warning'}` },
        enElAire ? `${firmes}+${enElAire}?/${cupo}` : `${c.confirmados}/${cupo}`),
    ]),
    nota ? el('p', { class: 'text-tiny mt-3', style: enElAire ? 'color:var(--warning);font-weight:700;' : '' }, nota) : null,
    c.espera > 0 ? el('p', { class: 'text-tiny mt-1' }, `${c.espera} en lista de espera`) : null,
    el('button', { class: `btn ${clase} mt-4`, onclick: () => irANoche(e.id) }, etiqueta),
  ]);
}

/* ============================================================
   "Te toca en la cancha X con Fulano"
   ------------------------------------------------------------
   Cada ronda los 12 jugadores salen de la cancha y preguntan lo
   mismo. Esto se los contesta desde su propio teléfono, sin que
   recepción tenga que gritarlo doce veces.
   ============================================================ */
function renderMiRonda(r, desfaseMs = 0) {
  const card = el('div', { class: 'card card-hero mt-4' });
  card.appendChild(el('div', { class: 'row-between' }, [
    el('div', { class: 'text-tiny', style: 'letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:var(--cyan);' },
      `Ronda ${r.ronda} de ${r.tope} · jugando ahora`),
    r.marcador_puesto
      ? el('span', { class: 'badge badge-success' }, `${r.mis_games}-${r.sus_games}`)
      : null,
  ]));

  card.appendChild(el('div', { style: 'font-size:34px;font-weight:800;line-height:1.1;margin-top:6px;' },
    `Cancha ${r.cancha}`));

  card.appendChild(el('div', { class: 'mt-3' }, [
    el('div', { class: 'text-tiny' }, r.formato === 'parejas' ? 'Tu pareja' : 'Juegas con'),
    el('div', { style: 'font-weight:700;font-size:16px;' }, r.companero || '—'),
  ]));
  card.appendChild(el('div', { class: 'mt-2' }, [
    el('div', { class: 'text-tiny' }, 'Contra'),
    el('div', { style: 'font-weight:700;font-size:16px;' },
      [r.rival1, r.rival2].filter(Boolean).join(' y ') || '—'),
  ]));

  // Cuenta regresiva, si recepción ya arrancó el reloj de esta ronda.
  if (r.cronometro_inicio && !r.marcador_puesto) {
    const largo = Number(r.minutos_por_ronda || 15) * 60000;
    const fin = new Date(r.cronometro_inicio).getTime() + largo;
    const reloj = el('div', { class: 'mt-3', style: 'font-size:15px;font-weight:700;' });
    const pintar = () => {
      // Nunca mas de lo que dura la ronda: si algo sale raro con los relojes,
      // es mejor no mostrar nada que mostrar un numero imposible.
      const seg = Math.min(Math.round((fin - (Date.now() - desfaseMs)) / 1000), Math.round(largo / 1000));
      if (seg > 0) {
        reloj.textContent = `Quedan ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')} de la ronda`;
        reloj.style.color = seg <= 60 ? 'var(--warning)' : 'var(--text-secondary)';
      } else {
        reloj.textContent = 'Se acabó el tiempo de la ronda.';
        reloj.style.color = 'var(--danger)';
      }
      if (seg > Math.round(largo / 1000)) reloj.textContent = '';
    };
    pintar();
    const t = setInterval(() => {
      if (!reloj.isConnected) { clearInterval(t); return; }
      pintar();
    }, 1000);
    card.appendChild(reloj);
  }

  if (r.marcador_puesto) {
    card.appendChild(el('p', { class: 'text-tiny mt-3' },
      'Ya está capturado el marcador de esta ronda. Espera a que recepción arme la siguiente.'));
  }
  return card;
}


/* La Liguilla corre sola (calificados, confirmaciones, draft, cuadro). Aquí
   recepción solo ve en qué va cada una y qué le toca vigilar. */
const LIG_NOMBRE = { liguilla_a: 'Liguilla · Categoría A', ascenso_b: 'Liguilla Categoría B' };
async function renderMonitorLiguilla() {
  const eventos = await getLiguillaEventosAdmin();
  const mes = todayISO().slice(0, 7);
  const activos = (eventos || []).filter((ev) =>
    ['qualifying', 'draft_open', 'confirmed', 'in_progress'].includes(ev.status)
    || (ev.status === 'scheduled' && ev.event_date && ev.event_date.slice(0, 7) === mes));
  if (!activos.length) return null;
  activos.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));

  const box = el('div');
  box.appendChild(el('div', { class: 'section-title' }, 'Liguilla del mes'));
  const card = el('div', { class: 'card' });
  for (let i = 0; i < activos.length; i++) {
    const ev = activos[i];
    let badge = { text: 'Programada', cls: 'badge-neutral' };
    let detalle = '';
    if (ev.status === 'scheduled') {
      detalle = `Se juega el ${formatFecha(ev.event_date)}. Los calificados salen solos al cerrar la última noche de la categoría.`;
    } else if (ev.status === 'qualifying') {
      const cal = await getCalificadosLiguillaAdmin(ev.id);
      const conf = cal.filter((c) => c.status === 'confirmed').length;
      const pend = cal.filter((c) => c.status === 'invited').length;
      let corte = '';
      try {
        const inicio = await getLiguillaEventStartTs(ev.id);
        if (inicio) corte = ` El plazo cierra el ${formatFechaHora(new Date(new Date(inicio).getTime() - 24 * 3600e3).toISOString())}`;
      } catch { /* sin fecha de corte */ }
      badge = { text: `${conf}/12 confirmados`, cls: conf >= 12 ? 'badge-success' : 'badge-warning' };
      detalle = pend > 0
        ? `Faltan ${pend} por confirmar: recuérdales que lo hagan en su app.${corte}`
        : (conf < 12 ? 'Ya no queda nadie por invitar: busca sustitutos o ciérrala.' : 'Arrancando el draft.');
    } else if (ev.status === 'draft_open') {
      const parejas = await getParejasLiguilla(ev.id);
      badge = { text: `Draft ${parejas.length}/6`, cls: 'badge-warning' };
      detalle = 'Los jugadores están eligiendo pareja. La app salta a quien no elige a tiempo.';
    } else if (ev.status === 'confirmed') {
      badge = { text: 'Parejas listas', cls: 'badge-success' };
      detalle = 'El cuadro se publica solo 3 horas antes del evento.';
    } else if (ev.status === 'in_progress') {
      badge = { text: 'En juego', cls: 'badge-success' };
      detalle = 'Captura los resultados desde Liguilla del mes.';
    }
    if (i > 0) card.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
    card.appendChild(el('div', { class: 'fila-enlace', onclick: () => navigate('/admin/liguilla') }, [
      el('div', { style: 'width:100%;' }, [
        el('div', { class: 'row-between', style: 'gap:10px;' }, [
          el('div', { style: 'font-weight:700;font-size:14.5px;' }, LIG_NOMBRE[ev.tier] || ev.tier),
          el('span', { class: `badge ${badge.cls}`, style: 'white-space:nowrap;' }, badge.text),
        ]),
        el('div', { class: 'text-tiny mt-1' }, detalle),
      ]),
    ]));
  }
  box.appendChild(card);
  return box;
}
