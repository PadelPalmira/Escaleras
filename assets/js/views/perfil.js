import { el, avatarContent, formatFecha, formatFechaHora, formatPuntos, toast, humanizeError, ahora } from '../utils.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { comprimirFotoPerfil } from '../avatar.js';
import { generarQR } from '../vendor/qrencode.js';
import { generarTarjetaRanking, generarTarjetaLiguilla, compartirTarjeta } from '../vendor/sharecard.js';
import {
  getMyProfile, updateMyProfile, getMiHistorialPuntos, signOut,
  getMisMultas, getMisSuspensiones, getMisNotificaciones, marcarNotificacionLeida,
  getMiSituacionCategorias, getMiInteresFemenil, alternarInteresFemenil, getAjusteNum,
  subirFotoPerfil, borrarFotoPerfil, getWeekdayScheduleAll, getMisCashbacks,
  getRankingCompleto, getEventoLiguillaActivo, getParejasLiguilla,
} from '../api.js';
import { NIVELES, esFemenil, recomendacionPorNivel, textoDia } from '../niveles.js';

const FINE_STATUS = { pending: { text: 'Pendiente', cls: 'badge-warning' }, paid: { text: 'Pagada', cls: 'badge-success' }, waived: { text: 'Condonada', cls: 'badge-neutral' } };
const NOTIF_URGENT = new Set([
  'confirmacion_requerida', 'sustituto_encontrado', 'multa_aplicada', 'suspension',
  // Fase 6 — cosas que cambian el lugar del jugador y no puede enterarse tarde.
  'privilegio_perdido', 'preferencia_expirada', 'promocion_lista_espera',
  'pareja_cancelada', 'escalera_cancelada', 'invitacion_pareja', 'pareja_vencida',
]);

const REASON_LABEL = {
  match_result: 'Resultado de partido',
  position_bonus: 'Bono de posición final',
  substitute_bonus_ausente: 'Puntos por sustituto (ausente)',
  substitute_bonus_sustituto: 'Puntos por sustituir',
  late_cancel_penalty: 'Penalización — cancelación tardía',
  no_show_penalty: 'Penalización — no asististe',
  liguilla_bonus: 'Bono de Liguilla',
  manual_adjustment: 'Ajuste manual',
};

function renderTarjetaFoto(profile) {
  const card = el('div', { class: 'card', style: 'text-align:center;' });
  const avatarBox = el('div', { class: 'avatar-btn', style: 'width:72px;height:72px;font-size:22px;margin:0 auto 12px;' }, avatarContent(profile));
  const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
  const estado = el('p', { class: 'text-tiny mt-2', style: 'display:none;' }, 'Procesando foto…');

  fileInput.addEventListener('change', async () => {
    const archivo = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!archivo) return;
    estado.style.display = 'block'; estado.textContent = 'Procesando foto…';
    botones.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const { blob, tipo } = await comprimirFotoPerfil(archivo, { maxBytes: 80 * 1024 });
      estado.textContent = 'Subiendo…';
      const url = await subirFotoPerfil(blob, tipo);
      profile.avatar_url = url;
      refrescarAvatar();
      toast(`Foto actualizada (${Math.round(blob.size / 1024)} KB).`, 'success');
      pintarBotones();
    } catch (err) {
      toast(humanizeError(err), 'error');
    }
    estado.style.display = 'none';
    botones.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  });

  // avatarContent() devuelve o un <img> (Node) o las iniciales (texto plano)
  // según tenga foto o no — appendChild exige un Node, así que un string
  // crudo lo revienta. Este helper cubre los dos casos.
  function refrescarAvatar() {
    avatarBox.innerHTML = '';
    const contenido = avatarContent(profile);
    avatarBox.appendChild(contenido instanceof Node ? contenido : document.createTextNode(String(contenido)));
  }

  const botones = el('div', { class: 'btn-row mt-2' });
  function pintarBotones() {
    botones.innerHTML = '';
    botones.appendChild(el('button', {
      class: 'btn btn-secondary btn-sm', style: 'width:auto;',
      onclick: () => fileInput.click(),
    }, profile.avatar_url ? 'Cambiar foto' : 'Subir foto'));
    if (profile.avatar_url) {
      botones.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm', style: 'width:auto;color:var(--danger);',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            await borrarFotoPerfil();
            profile.avatar_url = null;
            refrescarAvatar();
            toast('Foto quitada.', 'success');
            pintarBotones();
          } catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
        },
      }, 'Quitar foto'));
    }
  }
  pintarBotones();

  card.appendChild(avatarBox);
  card.appendChild(el('div', { class: 'h2' }, profile.full_name || 'Sin nombre'));
  card.appendChild(el('div', { class: 'text-tiny mt-1' }, profile.email));
  if (profile.status !== 'active') {
    card.appendChild(el('span', { class: 'badge badge-warning mt-2' }, profile.status === 'suspended' ? 'Suspendido' : 'Inactivo'));
  }
  card.appendChild(fileInput);
  card.appendChild(botones);
  card.appendChild(el('p', { class: 'text-tiny mt-2' }, 'Es opcional. Tu foto se ve junto a tu nombre en todas las listas — solo tu nombre y estadísticas (al darles click) son visibles para otros jugadores.'));
  card.appendChild(estado);
  return card;
}

/* Solo para niveles femeniles: todavía no hay escaleras femeniles activas,
   así que aquí se anota el interés en Femenil A y/o Femenil B — en cuanto
   una llegue al umbral, se abre y se avisa por notificación a toda la lista. */
async function renderTarjetaFemenil(profile) {
  const card = el('div', { class: 'card mt-3' });
  async function pintar() {
    card.innerHTML = '';
    const interes = await getMiInteresFemenil(profile.id);
    card.appendChild(el('div', { style: 'font-weight:700;font-size:14px;' }, 'Escaleras femeniles — próximamente'));
    card.appendChild(el('p', { class: 'text-tiny mt-1' }, 'Todavía no tenemos suficientes jugadoras anotadas para abrirlas. Anótate en la(s) que te interese(n) y te avisamos en cuanto se abra.'));
    ['A', 'B'].forEach((cat) => {
      const d = interes[cat];
      const fila = el('div', { class: 'row-between mt-3' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;' }, `Femenil ${cat}`),
          el('div', { class: 'text-tiny' }, d.abierta ? '¡Ya está abierta!' : `${d.conteo} de ${d.umbral} anotadas`),
        ]),
        d.abierta
          ? el('span', { class: 'badge badge-success' }, 'Abierta')
          : el('button', {
              class: `btn btn-sm ${d.interesada ? 'btn-secondary' : 'btn-primary'}`, style: 'width:auto;',
              onclick: async (e) => {
                e.target.disabled = true;
                try { await alternarInteresFemenil(profile.id, cat); await pintar(); }
                catch (err) { e.target.disabled = false; }
              },
            }, d.interesada ? 'Ya no me interesa' : 'Anotarme'),
      ]);
      card.appendChild(fila);
    });
  }
  await pintar();
  return card;
}

/* Dibuja un QR (ver assets/js/vendor/qrencode.js, generador propio sin
   dependencias) dentro de un <canvas>, con su zona de silencio blanca
   alrededor — sin eso una cámara de celular no lo detecta bien de cerca. */
function dibujarQR(texto, tamanoPx = 176) {
  const { size, matrix } = generarQR(texto);
  const canvas = el('canvas', { width: tamanoPx, height: tamanoPx, style: `width:${tamanoPx}px;height:${tamanoPx}px;` });
  const ctx = canvas.getContext('2d');
  const cuadros = size + 8; // +4 módulos de zona de silencio por lado
  const modulo = tamanoPx / cuadros;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tamanoPx, tamanoPx);
  ctx.fillStyle = '#000';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) ctx.fillRect((c + 4) * modulo, (r + 4) * modulo, Math.ceil(modulo), Math.ceil(modulo));
    }
  }
  return canvas;
}

const CASHBACK_STATUS = {
  disponible: { text: 'Disponible', cls: 'badge-success' },
  no_disponible_hoy: { text: 'Disponible pronto', cls: 'badge-warning' },
  vencido: { text: 'Vencido', cls: 'badge-neutral' },
  usado: { text: 'Usado', cls: 'badge-neutral' },
};
function diasRestantes(expiresAt) {
  const ms = new Date(expiresAt).getTime() - ahora().getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function renderTarjetaCashback(c) {
  const st = CASHBACK_STATUS[c.status] || { text: c.status, cls: 'badge-neutral' };
  const puedeMostrarQR = c.status === 'disponible' || c.status === 'no_disponible_hoy';
  return el('div', { class: 'card mt-2' }, [
    el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:800;font-size:20px;' }, `$${Number(c.amount_mxn).toLocaleString('es-MX')} MXN`),
        el('div', { class: 'text-tiny mt-1' }, `Ganado el ${formatFecha(c.earned_at.slice(0, 10))} — Escalera del ${formatFecha(c.session_date)}`),
      ]),
      el('span', { class: `badge ${st.cls}` }, st.text),
    ]),
    c.status === 'disponible' ? el('p', { class: 'text-tiny mt-2' }, `Vence en ${diasRestantes(c.expires_at)} día(s) — ${formatFecha(c.expires_at.slice(0, 10))}.`) : null,
    c.status === 'no_disponible_hoy' ? el('p', { class: 'text-tiny mt-2' }, 'Lo ganaste hoy — puedes usarlo a partir de tu próxima visita, no el mismo día.') : null,
    c.status === 'usado' ? el('p', { class: 'text-tiny mt-2' }, `Usado el ${formatFechaHora(c.used_at)}`) : null,
    c.status === 'vencido' ? el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' }, `Venció el ${formatFecha(c.expires_at.slice(0, 10))} sin usarse.`) : null,
    puedeMostrarQR ? el('div', { class: 'mt-3', style: 'text-align:center;' }, [
      dibujarQR(`CB1:${c.redeem_token}`, 160),
      el('p', { class: 'text-tiny mt-1', style: 'color:var(--text-tertiary);' }, 'Enséñale este código a recepción para usarlo.'),
    ]) : null,
  ]);
}

/* ============================================================
   Compartir — accesos rápidos desde Perfil a las mismas imágenes
   tipo historia que ya se pueden compartir desde Ranking y
   Liguilla. No es contenido personal del jugador: es la misma
   tabla/podio compartido, solo que aquí no hay una noche o pestaña
   ya elegida, así que se manda a compartir la que le toca por su
   propia categoría (o la más reciente con resultados, en Liguilla).
   ============================================================ */
function renderSeccionCompartir(profile) {
  const wrap = el('div', { class: 'mt-4' });
  wrap.appendChild(el('div', { class: 'section-title' }, 'Compartir'));
  const card = el('div', { class: 'card stack gap-3' });

  const botonCompartir = (texto) => el('button', {
    class: 'btn btn-secondary', style: 'display:flex;align-items:center;justify-content:center;gap:8px;',
  }, [el('span', { html: icon.share, style: 'width:18px;height:18px;' }), el('span', {}, texto)]);

  const btnRanking = botonCompartir('Compartir ranking general');
  btnRanking.addEventListener('click', () => compartirRankingDesdePerfil(profile, btnRanking));
  card.appendChild(btnRanking);

  const btnLiguilla = botonCompartir('Compartir resultados de Liguilla');
  btnLiguilla.addEventListener('click', () => compartirLiguillaDesdePerfil(btnLiguilla));
  card.appendChild(btnLiguilla);

  wrap.appendChild(card);
  return wrap;
}

async function compartirRankingDesdePerfil(profile, btn) {
  const textoOriginal = btn.lastChild.textContent;
  btn.disabled = true; btn.lastChild.textContent = 'Generando…';
  try {
    const { filas } = await getRankingCompleto();
    if (!filas || filas.length === 0) { toast('Todavía no hay ranking para compartir.', 'info'); return; }
    const tengoEnA = filas.some((f) => f.player_id === profile.id && f.category === 'A');
    const tengoEnB = filas.some((f) => f.player_id === profile.id && f.category === 'B');
    const cat = (!tengoEnA && tengoEnB) ? 'B' : 'A';
    const dela = filas.filter((f) => f.category === cat).sort((a, b) => (a.rank || 999) - (b.rank || 999));
    if (dela.length === 0) { toast('Todavía no hay ranking en esa categoría para compartir.', 'info'); return; }
    const top = dela.slice(0, 8).map((f) => ({
      rank: f.rank,
      full_name: (f.profiles && f.profiles.full_name) || 'Jugador',
      promedio: f.escaleras_counted > 0 ? Number(f.rolling_points) / Number(f.escaleras_counted) : 0,
    }));
    const canvas = await generarTarjetaRanking({ categoryLabel: cat === 'A' ? 'Categoría A' : 'Categoría B', filas: top });
    await compartirTarjeta(canvas, {
      archivo: `ranking-${cat}.png`,
      titulo: 'Ranking General — Escaleras Padel Palmira',
      texto: 'Ranking General',
    });
  } catch (err) {
    toast(humanizeError(err), 'error');
  } finally {
    btn.disabled = false; btn.lastChild.textContent = textoOriginal;
  }
}

async function compartirLiguillaDesdePerfil(btn) {
  const textoOriginal = btn.lastChild.textContent;
  btn.disabled = true; btn.lastChild.textContent = 'Buscando…';
  try {
    let evento = null; let parejas = null;
    for (const tier of ['liguilla_a', 'ascenso_b']) {
      let ev;
      try { ev = await getEventoLiguillaActivo([tier]); } catch { ev = null; }
      if (!ev || !['confirmed', 'in_progress', 'completed'].includes(ev.status)) continue;
      const ps = await getParejasLiguilla(ev.id);
      if (ps.some((p) => p.final_placement)) { evento = ev; parejas = ps; break; }
    }
    if (!evento) { toast('Todavía no hay resultados de Liguilla para compartir.', 'info'); return; }
    const resultados = parejas
      .filter((p) => p.final_placement)
      .sort((a, b) => a.final_placement - b.final_placement)
      .map((p) => ({ final_placement: p.final_placement, nombre1: p.player1?.full_name || '—', nombre2: p.player2?.full_name || '—' }));
    const canvas = await generarTarjetaLiguilla({
      tierLabel: evento.tier === 'liguilla_a' ? 'Liguilla · Categoría A' : 'Liguilla Categoría B',
      eventDateLabel: evento.event_date ? formatFecha(evento.event_date) : '',
      resultados,
    });
    await compartirTarjeta(canvas, {
      archivo: `liguilla-${evento.tier}.png`,
      titulo: 'Resultados de Liguilla — Escaleras Padel Palmira',
      texto: 'Resultados de Liguilla',
    });
  } catch (err) {
    toast(humanizeError(err), 'error');
  } finally {
    btn.disabled = false; btn.lastChild.textContent = textoOriginal;
  }
}

async function renderSeccionCashbacks(profile) {
  let cashbacks;
  try { cashbacks = await getMisCashbacks(profile.id); } catch (err) { return null; }
  if (!cashbacks || cashbacks.length === 0) return null;

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'section-title' }, 'Cashbacks'));
  wrap.appendChild(el('div', { class: 'card', style: 'background:var(--surface-2);' }, [
    el('p', { class: 'text-tiny' }, 'Válidos para Escaleras y reservas de cancha. No aplican a clases, consumos u otros servicios, ni a reservas por Playtomic. Se ganan entre los primeros lugares de la noche y se pueden ir acumulando — no se pueden usar el mismo día que se ganan.'),
  ]));

  const vigentes = cashbacks.filter((c) => c.status === 'disponible' || c.status === 'no_disponible_hoy');
  const usados = cashbacks.filter((c) => c.status === 'usado');
  const vencidos = cashbacks.filter((c) => c.status === 'vencido');

  if (vigentes.filter((c) => c.status === 'disponible').length >= 2) {
    wrap.appendChild(el('div', { class: 'card mt-3', style: 'text-align:center;border:1.5px dashed var(--cyan);' }, [
      el('div', { style: 'font-weight:700;' }, 'Redimirlos todos de un solo escaneo'),
      el('p', { class: 'text-tiny mt-1' }, 'Enséñale este código a recepción para usar de un jalón todos tus cashbacks vigentes esa noche.'),
      el('div', { class: 'mt-2' }, dibujarQR(`CBALL:${profile.id}`, 160)),
    ]));
  }

  if (vigentes.length > 0) {
    wrap.appendChild(el('div', { class: 'text-tiny mt-3', style: 'font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary);' }, 'Vigentes'));
    vigentes.forEach((c) => wrap.appendChild(renderTarjetaCashback(c)));
  }
  if (usados.length > 0) {
    wrap.appendChild(el('div', { class: 'text-tiny mt-3', style: 'font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary);' }, 'Usados'));
    usados.forEach((c) => wrap.appendChild(renderTarjetaCashback(c)));
  }
  if (vencidos.length > 0) {
    wrap.appendChild(el('div', { class: 'text-tiny mt-3', style: 'font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary);' }, 'Vencidos'));
    vencidos.forEach((c) => wrap.appendChild(renderTarjetaCashback(c)));
  }

  return wrap;
}

export async function renderPerfil() {
  const profile = await getMyProfile();
  if (!profile) return el('div', { class: 'empty-state' }, 'No se pudo cargar tu perfil.');
  const [historial, notificaciones, multas, suspensiones, situacion, minNoches, semanas] = await Promise.all([
    getMiHistorialPuntos(profile.id, 20),
    getMisNotificaciones(profile.id, 20),
    getMisMultas(profile.id),
    getMisSuspensiones(profile.id),
    getMiSituacionCategorias(profile.id),
    getAjusteNum('min_noches_para_mover', 3),
    getAjusteNum('semanas_vigencia_puntos', 8),
  ]);
  const porCategoria = situacion ? situacion.porCategoria : {};
  const categoriasConDatos = ['A', 'B'].filter((c) => porCategoria[c]);

  const wrap = el('div');

  wrap.appendChild(renderTarjetaFoto(profile));

  // Acceso al reglamento. Ya no tiene pestaña propia (la barra de abajo se
  // la quedó la Liguilla), así que vive aquí y en Inicio — bien visible, no
  // enterrado: en la versión 2.0 cambiaron reglas importantes.
  wrap.appendChild(
    el('button', {
      class: 'card mt-3 fila-enlace',
      onclick: () => navigate('/reglas'),
    }, [
      el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
        el('span', { html: icon.book, style: 'width:19px;height:19px;color:var(--cyan);' }),
        el('div', {}, [
          el('div', { style: 'font-weight:700;font-size:14px;' }, 'Reglamento completo'),
          el('div', { class: 'text-tiny mt-1' }, 'Cómo se juega, puntos, categorías y penalizaciones'),
        ]),
      ]),
      el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
    ])
  );

  // Notificaciones
  const sinLeer = (notificaciones || []).filter((n) => !n.read_at);
  wrap.appendChild(el('div', { class: 'section-title' }, `Notificaciones${sinLeer.length > 0 ? ` (${sinLeer.length})` : ''}`));
  if (!notificaciones || notificaciones.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'No tienes notificaciones.')));
  } else {
    const list = el('div', { class: 'card' });
    notificaciones.slice(0, 10).forEach((n, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const urgente = !n.read_at && NOTIF_URGENT.has(n.type);
      const row = el('div', {
        class: 'row-between',
        style: n.read_at ? 'opacity:0.55;' : '',
        onclick: async () => { if (!n.read_at) { try { await marcarNotificacionLeida(n.id); n.read_at = ahora().toISOString(); row.style.opacity = '0.55'; dot && dot.remove(); window.dispatchEvent(new CustomEvent('avisos-cambiaron')); } catch (err) { toast(humanizeError(err), 'error'); } } },
      }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;font-size:13.5px;' }, n.title),
          el('div', { class: 'text-tiny mt-1' }, n.body),
          el('div', { class: 'text-tiny mt-1' }, formatFechaHora(n.created_at)),
        ]),
      ]);
      let dot = null;
      if (!n.read_at) { dot = el('span', { class: `badge ${urgente ? 'badge-danger' : 'badge-neutral'}` }, urgente ? 'Urgente' : 'Nuevo'); row.appendChild(dot); }
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  // Edición rápida de datos
  wrap.appendChild(el('div', { class: 'section-title' }, 'Tus datos'));
  const nameInput = el('input', { class: 'input', type: 'text', value: profile.full_name || '' });
  const phoneInput = el('input', { class: 'input', type: 'tel', value: profile.phone || '', placeholder: '10 dígitos' });

  const nivelSelect = el('select', { class: 'input' }, [
    el('option', { value: '' }, profile.declared_level ? '(sin cambio)' : '¿Cuál es tu nivel de juego?'),
    ...NIVELES.map((n) => el('option', { value: n.value }, n.label)),
  ]);
  if (profile.declared_level) nivelSelect.value = profile.declared_level;
  const nivelRecBox = el('div', { class: 'card mt-2', style: 'display:none;background:var(--surface-2);' });
  let weekdaySchedulesCache = null;
  async function pintarNivelRec() {
    const nivel = nivelSelect.value;
    if (!nivel) { nivelRecBox.style.display = 'none'; return; }
    if (!weekdaySchedulesCache) {
      try { weekdaySchedulesCache = await getWeekdayScheduleAll(); } catch (err) { weekdaySchedulesCache = []; }
    }
    const rec = recomendacionPorNivel(nivel, weekdaySchedulesCache);
    nivelRecBox.innerHTML = '';
    if (!rec) { nivelRecBox.style.display = 'none'; return; }
    nivelRecBox.appendChild(el('div', { class: 'text-tiny', style: 'font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.04em;' }, 'Con ese nivel te recomendaríamos'));
    if (rec.modo === 'retas') {
      nivelRecBox.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, 'Retas Abiertas — o directo Categoría B si prefieres competir desde ya.'));
    } else if (rec.modo === 'opciones') {
      nivelRecBox.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, 'Categoría A o Categoría B — las dos son válidas, tú eliges cada semana.'));
    } else if (rec.modo === 'femenil') {
      nivelRecBox.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, 'Todavía no hay escaleras femeniles activas — Retas Abiertas mientras tanto, y puedes anotarte a la lista de interesadas aquí abajo.'));
    } else {
      nivelRecBox.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, `Categoría ${rec.categoria}.`));
    }
    nivelRecBox.style.display = 'block';
  }
  nivelSelect.addEventListener('change', pintarNivelRec);

  const saveBtn = el('button', { class: 'btn btn-secondary mt-2' }, 'Guardar cambios');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try {
      const payload = { full_name: nameInput.value.trim(), phone: phoneInput.value.trim() || null };
      // El nivel solo se envía si el jugador de verdad eligió algo en el
      // select — así nunca se borra un nivel ya declarado solo por guardar
      // el nombre o el teléfono sin tocar ese campo.
      if (nivelSelect.value) payload.declared_level = nivelSelect.value;
      await updateMyProfile(payload);
      toast('Datos actualizados.', 'success');
      navigate('/perfil');
    } catch (err) { toast(humanizeError(err), 'error'); }
    saveBtn.disabled = false; saveBtn.textContent = 'Guardar cambios';
  });
  wrap.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [el('label', {}, 'Nombre completo'), nameInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Teléfono'), phoneInput]),
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [
      el('label', {}, 'Tu nivel de juego' + (profile.declared_level ? ` (actual: ${(NIVELES.find((n) => n.value === profile.declared_level) || {}).label || profile.declared_level})` : '')),
      nivelSelect,
      el('p', { class: 'text-tiny mt-1' }, profile.declared_level
        ? 'Solo es una recomendación de a dónde entrar — puedes cambiarla cuando quieras, no afecta tu lugar ya ganado en el Ranking.'
        : 'Todavía no lo has declarado — sin esto no vemos qué convocatoria recomendarte, aunque puedes anotarte libremente a A o B mientras tanto.'),
      nivelRecBox,
    ]),
    saveBtn,
  ]));

  // Cashbacks (solo se muestra si tiene alguno, para no saturar a la mayoría)
  const seccionCashbacks = await renderSeccionCashbacks(profile);
  if (seccionCashbacks) wrap.appendChild(seccionCashbacks);

  // Accesos rápidos para compartir el ranking/Liguilla en redes — siempre
  // visibles, no dependen de que el jugador tenga nada propio que mostrar.
  wrap.appendChild(renderSeccionCompartir(profile));

  // Multas (solo se muestra la sección si tiene alguna, para no saturar a la mayoría)
  if (multas && multas.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Multas'));
    const list = el('div', { class: 'card' });
    multas.forEach((m, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = FINE_STATUS[m.status] || { text: m.status, cls: 'badge-neutral' };
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;' }, `$${Number(m.amount_mxn).toLocaleString('es-MX')} MXN`),
          el('div', { class: 'text-tiny' }, `${m.reason || 'Sin motivo especificado'} · ${formatFecha(m.applied_at.slice(0, 10))}`),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]));
    });
    wrap.appendChild(list);
  }

  // Suspensiones (solo si tiene alguna)
  if (suspensiones && suspensiones.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Suspensiones'));
    const list = el('div', { class: 'card' });
    suspensiones.forEach((s, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const hoy = ahora().toISOString().slice(0, 10);
      const activa = !s.lifted_at && (!s.end_date || s.end_date >= hoy);
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;' }, `${formatFecha(s.start_date)} — ${s.end_date ? formatFecha(s.end_date) : 'indefinida'}`),
          el('div', { class: 'text-tiny' }, s.reason || 'Sin motivo especificado'),
        ]),
        el('span', { class: `badge ${activa ? 'badge-danger' : 'badge-neutral'}` }, s.lifted_at ? 'Levantada' : (activa ? 'Activa' : 'Terminada')),
      ]));
    });
    wrap.appendChild(list);
  }

  /* El puente entre esta lista y el numero del Ranking. Sin esto un jugador
     suma sus lineas a mano, le da 553 y en Ranking ve 92: parece un error de
     la app y no lo es. */
  if (esFemenil(profile.declared_level)) {
    wrap.appendChild(await renderTarjetaFemenil(profile));
  }

  wrap.appendChild(el('div', { class: 'section-title' }, 'Tu puntaje móvil'));
  if (categoriasConDatos.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Todavía no tienes noches jugadas dentro de la ventana, en ninguna categoría.')));
  } else {
    categoriasConDatos.forEach((cat) => {
      const categoria = porCategoria[cat];
      const noches = Number(categoria.escaleras_counted || 0);
      const total = Number(categoria.rolling_points || 0);
      const prom = noches > 0 ? total / noches : 0;
      const provisional = noches < minNoches;
      wrap.appendChild(el('div', { class: 'card mt-2' }, [
        el('div', { class: 'row-between' }, [
          el('div', {}, [
            el('div', { class: 'row gap-2', style: 'align-items:baseline;' }, [
              el('span', { style: 'font-size:30px;font-weight:800;line-height:1;' }, noches > 0 ? prom.toFixed(0) : '—'),
              el('span', { class: `badge ${cat === 'A' ? 'badge-a' : 'badge-b'}`, style: 'font-size:10px;padding:2px 8px;' }, `Cat ${cat}`),
            ]),
            el('div', { class: 'text-tiny mt-1' }, 'puntos por noche'),
          ]),
          provisional
            ? el('span', { class: 'badge badge-warning' }, 'Provisional')
            : el('span', { class: 'badge badge-neutral' }, `${noches} noches`),
        ]),
        el('p', { class: 'text-tiny mt-3' },
          noches > 0
            ? `Es el promedio de tus últimas ${noches} escaleras en Categoría ${cat} (${total.toFixed(0)} pts en total). Ese promedio es el que te ordena en el Ranking de esa categoría, no la suma.`
            : 'Todavía no tienes noches jugadas dentro de la ventana.'),
        provisional
          ? el('p', { class: 'text-tiny mt-1', style: 'color:var(--text-tertiary);' },
              `Con menos de ${minNoches} noches tu puntaje en Categoría ${cat} es provisional: tu lugar todavía puede moverse mucho.`)
          : null,
        el('p', { class: 'text-tiny mt-1', style: 'color:var(--text-tertiary);' },
          `Una noche jugada cuenta durante ${semanas} semanas; después sale de tu ventana.`),
      ]));
    });
    wrap.appendChild(el('p', { class: 'text-tiny mt-1', style: 'color:var(--text-tertiary);' },
      'A y B llevan puntos independientes: puedes anotarte a la que quieras cada semana, no hay ascenso ni descenso automático.'));
  }

  // Historial de puntos
  wrap.appendChild(el('div', { class: 'section-title' }, 'Historial de puntos'));
  if (!historial || historial.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Todavía no tienes movimientos de puntos.')));
  } else {
    const list = el('div', { class: 'card' });
    historial.forEach((h, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const positivo = Number(h.points) >= 0;
      list.appendChild(
        el('div', { class: 'row-between' }, [
          el('div', {}, [
            el('div', { style: 'font-weight:600;font-size:13.5px;' }, REASON_LABEL[h.reason] || h.reason),
            el('div', { class: 'text-tiny' }, formatFechaHora(h.created_at)),
            // De que ronda y que cancha salio cada linea: es lo que un jugador
            // necesita para revisar sus propios puntos sin preguntarle a nadie.
            h.notes ? el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);' },
              String(h.notes).split(' | ')[0]) : null,
          ]),
          el('div', { style: `font-weight:800;font-variant-numeric:tabular-nums;color:${positivo ? 'var(--success)' : 'var(--danger)'}` }, formatPuntos(h.points)),
        ])
      );
    });
    wrap.appendChild(list);
  }

  // Logout
  const logoutBtn = el('button', { class: 'btn btn-ghost mt-6', style: 'color:var(--danger);' }, ['Cerrar sesión']);
  logoutBtn.addEventListener('click', async () => { await signOut(); window.location.reload(); });
  wrap.appendChild(logoutBtn);

  return wrap;
}
