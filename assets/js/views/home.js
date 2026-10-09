import { el, todayISO, formatFecha, formatFechaHora, formatHora, avatarContent, toast, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, getMiSituacionCategorias, getMisRegistros, tiersElegibles,
  getEventoLiguillaActivo, getMiCalificacionLiguilla,
  esAdminOMaestro, esMaestro, getEscalerasAdmin, getConteosRegistros,
  getMiRondaActual, horaServidor,
  getNotificacionesUrgentes, marcarNotificacionLeida,
  getLiguillaEventosAdmin, getCalificadosLiguillaAdmin, getParejasLiguilla, getLiguillaEventStartTs,
  getAlertasRecepcion,
} from '../api.js';
import { navigate } from '../router.js';
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

async function renderInicioJugador(profile) {
  const registros = await getMisRegistros({ soloFuturas: true });
  const situacion = profile ? await getMiSituacionCategorias(profile.id) : null;
  const porCategoria = situacion ? situacion.porCategoria : {};
  const categoriasConDatos = ['A', 'B'].filter((c) => porCategoria[c]);
  // Si la noche está en juego ahorita, esto es lo único que le importa al
  // jugador: en qué cancha le toca y con quién.
  let miRonda = null;
  try { miRonda = await getMiRondaActual(); } catch { miRonda = null; }
  // La cuenta regresiva se mide contra el reloj del SERVIDOR: el del telefono
  // de cada jugador puede estar mal puesto y el numero se veria absurdo.
  let desfaseMs = 0;
  if (miRonda && miRonda.cronometro_inicio) {
    try { desfaseMs = Date.now() - (await horaServidor()).getTime(); } catch { desfaseMs = 0; }
  }
  // Avisos que no se puede permitir no ver. Viven en Perfil, pero ahi casi
  // nadie entra: "se abrio un lugar y es tuyo" enterado tarde se convierte en
  // un no-show con penalizacion.
  let urgentes = [];
  try { urgentes = profile ? await getNotificacionesUrgentes(profile.id, 3) : []; } catch { urgentes = []; }

  const hoy = todayISO();
  const registroHoy = registros.find((r) => r.escaleras && r.escaleras.session_date === hoy && ['confirmed', 'substitute', 'waitlist'].includes(r.status));
  // Solo compromisos vigentes: un registro del que ya te diste de baja, que
  // declinaste, o que ya no está activo no es una "próxima sesión" — dejarlo
  // aquí lo hace ver como un pendiente real cuando ya no lo es, y hasta puede
  // sacar de la lista (por el tope de 5) a una sesión que sí sigue en pie.
  const proximosRegistros = registros
    .filter((r) => r.escaleras && r.escaleras.session_date >= hoy
      && ['confirmed', 'substitute', 'waitlist'].includes(r.status))
    .sort((a, b) => a.escaleras.session_date.localeCompare(b.escaleras.session_date));

  const wrap = el('div');

  // Saludo
  const nombre = (profile && profile.full_name) ? profile.full_name.split(' ')[0] : 'Jugador';
  wrap.appendChild(el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, `Hola, ${nombre}`),
    el('div', { class: 'avatar-btn', style: 'width:44px;height:44px;font-size:15px;' }, avatarContent(profile)),
  ]));

  // Tarjeta de la ronda en curso — manda sobre todo lo demás.
  if (miRonda) {
    wrap.appendChild(renderMiRonda(miRonda, desfaseMs));
  }

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

  // Tarjeta "hoy juegas"
  if (miRonda) {
    // Ya se está jugando: la tarjeta de arriba lo dice todo.
  } else if (registroHoy) {
    const esc = registroHoy.escaleras;
    const ws = esc.weekday_schedule;
    wrap.appendChild(
      el('div', { class: 'card card-hero mt-4' }, [
        el('div', { class: 'row-between' }, [
          el('div', { class: 'h2' }, 'Hoy juegas 🎾'),
          el('span', { class: `badge ${STATUS_LABEL[registroHoy.status]?.cls || 'badge-neutral'}` }, STATUS_LABEL[registroHoy.status]?.text || registroHoy.status),
        ]),
        el('p', { class: 'text-muted mt-2' }, `${ws.format === 'individual' ? 'Individual' : ws.format === 'parejas' ? 'Parejas Fijas' : 'Retas Abiertas'} · Categoría ${ws.category || '—'}`),
        el('p', { class: 'text-muted' }, `${formatHora(ws.start_time)} – ${formatHora(ws.end_time)}`),
        el('button', { class: 'btn btn-secondary mt-4', onclick: () => navigate('/convocatorias') }, 'Ver detalles'),
      ])
    );
  } else {
    wrap.appendChild(
      el('div', { class: 'card mt-4' }, [
        el('div', { class: 'h2' }, 'Hoy no juegas'),
        el('p', { class: 'text-muted mt-2' }, 'Revisa las convocatorias abiertas de la semana.'),
        el('button', { class: 'btn btn-primary mt-4', onclick: () => navigate('/convocatorias') }, 'Ver convocatorias'),
      ])
    );
  }

  // Tu posición EN CADA categoría: ya no hay una sola "tu categoría" — cada
  // quien elige dónde jugar, así que puede tener lugar en A, en B, en las
  // dos, o en ninguna todavía.
  wrap.appendChild(el('div', { class: 'section-title' }, 'Tu ranking'));
  if (categoriasConDatos.length > 0) {
    categoriasConDatos.forEach((cat) => {
      const c = porCategoria[cat];
      wrap.appendChild(
        el('div', { class: 'card mt-2' }, [
          el('div', { class: 'row-between' }, [
            el('span', { class: `badge ${CAT_BADGE_CLASS[cat]}` }, CAT_LABEL[cat]),
            c.provisional ? el('span', { class: 'badge badge-warning' }, 'Provisional') : null,
          ]),
          el('div', { class: 'grid-3 mt-4' }, [
            el('div', { class: 'stat-tile' }, [
              el('div', { class: 'stat-value' }, c.rank != null ? `#${c.rank}` : '—'),
              el('div', { class: 'stat-label' }, 'Posición'),
            ]),
            // El numero grande tiene que ser EL MISMO que el del Ranking: el
            // promedio por noche, no la suma.
            el('div', { class: 'stat-tile' }, [
              el('div', { class: 'stat-value' }, c.escaleras_counted > 0 ? Math.round(c.promedio) : '—'),
              el('div', { class: 'stat-label' }, 'Prom. x noche'),
            ]),
            el('div', { class: 'stat-tile' }, [
              el('div', { class: 'stat-value' }, c.escaleras_counted != null ? c.escaleras_counted : '—'),
              el('div', { class: 'stat-label' }, 'Noches'),
            ]),
          ]),
        ])
      );
    });
  } else {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('p', { class: 'text-muted' }, 'Todavía no tienes ranking en ninguna categoría. Se arma en cuanto empiezas a jugar en A o en B.'),
      ])
    );
  }

  // Próximas convocatorias en las que estoy anotado
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
            el('div', { class: 'text-tiny' }, `${ws.format === 'individual' ? 'Individual' : ws.format === 'parejas' ? 'Parejas' : 'Retas'} · Cat ${ws.category || '—'}`),
          ]),
          el('span', { class: `badge ${st.cls}` }, st.text),
        ])
      );
    });
    wrap.appendChild(list);
  }

  // Banner de Liguilla/Ascenso — uno por cada torneo donde tengas
  // movimientos pendientes. Como ahora se puede calificar a los dos el
  // mismo mes (buen nivel en A y en B a la vez), se revisa cada tier por
  // separado en vez de quedarse con uno solo.
  try {
    const tiers = tiersElegibles(porCategoria);
    for (const tier of tiers) {
      const evento = await getEventoLiguillaActivo([tier]);
      if (!evento || ['completed', 'cancelled_no_players', 'cancelled'].includes(evento.status)) continue;
      const miCalificacion = await getMiCalificacionLiguilla(evento.id, profile.id);
      if (!miCalificacion) continue;
      const titulo = tier === 'liguilla_a' ? 'Liguilla' : 'Liguilla Categoría B';
      wrap.appendChild(
        el('div', { class: 'card mt-4', style: 'border-color:var(--cyan);', onclick: () => navigate('/liguilla') }, [
          el('div', { class: 'row-between' }, [
            el('div', { style: 'font-weight:700;' }, [el('span', { html: icon.trophy, style: 'width:16px;height:16px;vertical-align:-3px;margin-right:6px;color:var(--cyan);' }), titulo]),
            el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
          ]),
          el('p', { class: 'text-tiny mt-2' }, 'Tienes movimientos pendientes — toca para ver.'),
        ])
      );
    }
  } catch (err) {
    // El banner de Liguilla nunca debe tumbar el Inicio si algo falla.
    console.error('Error cargando banner de Liguilla:', err);
  }

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
