import { el, todayISO, formatFecha, formatFechaHora, toast, humanizeError, openSheet, confirmSheet, avatarContent, chipJugador } from '../utils.js';
import { NIVELES } from '../niveles.js';
import { icon } from '../icons.js';
import {
  getMyProfile, esAdminOMaestro, buscarJugadores,
  adminActualizarJugador, adminEliminarJugador, jugadorTieneHistorial, crearJugadorAdmin,
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
  wrap.appendChild(el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, 'Jugadores'),
    el('button', {
      class: 'btn btn-primary btn-sm', style: 'width:auto;padding:8px 16px;font-size:20px;line-height:1;',
      title: 'Dar de alta a un jugador',
      onclick: () => abrirAltaJugador(() => renderAdminJugadores().then((n) => wrap.replaceWith(n))),
    }, '+'),
  ]));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Toca a un jugador para asignar sustituto, aplicar una multa o una suspensión. Con el + das de alta a alguien que todavía no se registra.'));

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

/* WhatsApp directo al jugador desde su ficha. Los celulares mexicanos van
   con 52 + los 10 dígitos, sin el "1" que ya no hace falta. */
function waLinkJugador(jugador) {
  const digitos = ((jugador && jugador.phone) || '').replace(/\D/g, '');
  if (digitos.length !== 10) return null;
  const nombre = (jugador.full_name || '').split(' ')[0];
  const msg = `Hola${nombre ? ' ' + nombre : ''}, te escribimos de Padel Palmira 🎾`;
  return `https://wa.me/52${digitos}?text=${encodeURIComponent(msg)}`;
}

/* ============================================================
   Dar de alta a un jugador desde recepción (botón +).
   ------------------------------------------------------------
   Crear la CUENTA de alguien más no se puede hacer desde el
   navegador (la tabla de perfiles cuelga de las cuentas de
   acceso, y crear una necesita la llave de servicio), así que
   esto pasa por una función servidor que vuelve a checar que
   quien la llama sea Admin o Maestro.
   El jugador queda con su correo ya confirmado y sin contraseña:
   cuando quiera entra él solo, con contraseña o enlace mágico.
   ============================================================ */
function abrirAltaJugador(onListo) {
  const email = el('input', { class: 'input', type: 'email', placeholder: 'sucorreo@ejemplo.com', autocomplete: 'off' });
  const nombre = el('input', { class: 'input', type: 'text', placeholder: 'Nombre y apellido' });
  const celular = el('input', { class: 'input', type: 'tel', placeholder: '10 dígitos' });
  const nivel = el('select', { class: 'input' }, [
    el('option', { value: '' }, 'Sin nivel declarado (lo pone él después)'),
    ...NIVELES.map((n) => el('option', { value: n.value }, n.label)),
  ]);

  const content = el('div', {}, [
    el('div', { class: 'sheet-title' }, 'Dar de alta a un jugador'),
    el('p', { class: 'text-tiny mb-3' },
      'Para cuando alguien llega al club y todavía no se registra. Le creamos su cuenta con su correo; '
      + 'él entra cuando quiera, con contraseña o con el enlace mágico. Si le pones nivel, ya puede anotarse a una noche de inmediato.'),
    el('div', { class: 'field' }, [el('label', {}, 'Correo electrónico'), email]),
    el('div', { class: 'field' }, [el('label', {}, 'Nombre completo'), nombre]),
    el('div', { class: 'field' }, [el('label', {}, 'Celular'), celular]),
    el('div', { class: 'field' }, [el('label', {}, 'Nivel de juego'), nivel]),
  ]);

  const msg = el('p', { class: 'text-tiny mt-2' });
  const btn = el('button', { class: 'btn btn-primary mt-2' }, 'Dar de alta');
  btn.addEventListener('click', async () => {
    const correo = (email.value || '').trim();
    if (!correo.includes('@')) { msg.textContent = 'Escribe un correo válido.'; msg.style.color = 'var(--danger)'; return; }
    if ((nombre.value || '').trim().length < 3) { msg.textContent = 'Escribe el nombre completo.'; msg.style.color = 'var(--danger)'; return; }
    if ((celular.value || '').replace(/\D/g, '').length !== 10) { msg.textContent = 'El celular debe tener 10 dígitos.'; msg.style.color = 'var(--danger)'; return; }
    btn.disabled = true; btn.textContent = 'Dando de alta…';
    try {
      const r = await crearJugadorAdmin({
        email: correo,
        fullName: nombre.value,
        phone: celular.value,
        declaredLevel: nivel.value || null,
      });
      toast(`${r.full_name} ya está dado de alta.`, 'success', 5000);
      handle.close();
      onListo();
    } catch (err) {
      msg.textContent = humanizeError(err);
      msg.style.color = 'var(--danger)';
      btn.disabled = false; btn.textContent = 'Dar de alta';
    }
  });
  content.appendChild(btn);
  content.appendChild(msg);
  content.appendChild(el('button', { class: 'btn btn-ghost mt-2', onclick: () => handle.close() }, 'Cancelar'));
  const handle = openSheet(content);
}

function nombreNivel(valor) {
  const n = NIVELES.find((x) => x.value === valor);
  return n ? `Nivel ${n.label}` : '';
}

/* ============================================================
   Editar los datos de un jugador.
   ------------------------------------------------------------
   El correo NO se edita: es la llave con la que entra a la app
   (enlace mágico), así que cambiarlo aquí lo dejaría sin cuenta.
   Suspender/levantar suspensión tampoco están aquí, porque tienen
   su propio flujo más abajo — ese además le libera las noches.
   ============================================================ */
function abrirEditarJugador(jugador, refresh) {
  const nombre = el('input', { class: 'input', type: 'text', value: jugador.full_name || '', placeholder: 'Nombre y apellido' });
  const celular = el('input', { class: 'input', type: 'tel', value: jugador.phone || '', placeholder: '10 dígitos' });
  const nivel = el('select', { class: 'input' }, [
    el('option', { value: '' }, 'Sin nivel declarado'),
    ...NIVELES.map((n) => el('option', { value: n.value }, n.label)),
  ]);
  nivel.value = jugador.declared_level || '';
  const archivado = el('select', { class: 'input' }, [
    el('option', { value: 'active' }, 'Activo — juega normal'),
    el('option', { value: 'inactive' }, 'Archivado — no aparece ni se puede anotar'),
  ]);
  archivado.value = jugador.status === 'inactive' ? 'inactive' : 'active';

  const content = el('div', {}, [
    el('div', { class: 'sheet-title' }, 'Editar datos'),
    el('p', { class: 'text-tiny mb-3' }, `Correo de acceso: ${jugador.email || '—'} (ese no se puede cambiar desde aquí).`),
    el('div', { class: 'field' }, [el('label', {}, 'Nombre completo'), nombre]),
    el('div', { class: 'field' }, [el('label', {}, 'Celular'), celular]),
    el('div', { class: 'field' }, [el('label', {}, 'Nivel de juego'), nivel]),
    jugador.status === 'suspended'
      ? el('p', { class: 'text-tiny mb-3' }, 'Está suspendido: para cambiarle el estado, levanta primero la suspensión desde su ficha.')
      : el('div', { class: 'field' }, [el('label', {}, 'Estado'), archivado]),
  ]);

  const btn = el('button', { class: 'btn btn-primary mt-2' }, 'Guardar cambios');
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await adminActualizarJugador(jugador.id, {
        fullName: nombre.value,
        phone: celular.value,
        declaredLevel: nivel.value || null,
        status: jugador.status === 'suspended' ? null : archivado.value,
      });
      toast('Datos actualizados.', 'success');
      handle.close();
      // La ficha se repinta con los datos nuevos sin salir de la pantalla.
      Object.assign(jugador, {
        full_name: nombre.value.trim(),
        phone: celular.value.replace(/\D/g, ''),
        declared_level: nivel.value || jugador.declared_level,
        status: jugador.status === 'suspended' ? jugador.status : archivado.value,
      });
      refresh();
    } catch (err) {
      toast(humanizeError(err), 'error');
      btn.disabled = false; btn.textContent = 'Guardar cambios';
    }
  });
  content.appendChild(btn);
  content.appendChild(el('button', { class: 'btn btn-ghost mt-2', onclick: () => handle.close() }, 'Cerrar'));
  const handle = openSheet(content);
}

/* ============================================================
   Dar de baja a un jugador.
   ------------------------------------------------------------
   Antes de preguntar nada, la app revisa si ya tiene historial en
   el club, porque eso cambia por completo lo que va a pasar:
   - Sin historial (típico: registro a medias o cuenta duplicada)
     se borra de verdad, con todo y su acceso.
   - Con historial se archiva: sale de rankings, buscadores y
     listas, pero sus partidos y los de sus rivales quedan intactos.
     Borrarlo de verdad dejaría huecos en noches ya jugadas.
   En los dos casos se le liberan primero sus noches futuras.
   ============================================================ */
async function abrirDarDeBaja(jugador, wrap) {
  let tieneHistorial = true;
  try {
    tieneHistorial = await jugadorTieneHistorial(jugador.id);
  } catch (err) {
    toast(humanizeError(err), 'error');
    return;
  }

  const nombre = jugador.full_name || 'este registro sin nombre';
  const content = el('div', {}, [
    el('div', { class: 'sheet-title' }, tieneHistorial ? '¿Archivar a este jugador?' : '¿Borrar este registro?'),
    el('p', { class: 'text-tiny mb-3' }, tieneHistorial
      ? `${nombre} ya tiene historial en el club (partidos, puntos, cashbacks o multas). `
        + 'Se va a ARCHIVAR: desaparece del ranking, del buscador y de las listas, y no se puede volver a anotar. '
        + 'Su historial y el de sus rivales se queda intacto — borrarlo de verdad dejaría huecos en noches ya jugadas. '
        + 'Si tiene lugar en noches que todavía no se juegan, se lo liberamos y entra quien siga en la lista de espera.'
      : `${nombre} nunca ha jugado ni tiene nada a su nombre, así que se BORRA de verdad: su perfil desaparece del club. `
        + 'Si algún día vuelve a entrar con el mismo correo, la app lo trata como jugador nuevo y le pide registrarse otra vez.'),
  ]);

  const btnOk = el('button', { class: 'btn btn-danger mt-2' }, tieneHistorial ? 'Sí, archivarlo' : 'Sí, borrarlo');
  btnOk.addEventListener('click', async () => {
    btnOk.disabled = true; btnOk.textContent = 'Procesando…';
    try {
      const r = await adminEliminarJugador(jugador.id);
      handle.close();
      const liberadas = r && r.noches_liberadas ? ` Se le liberaron ${r.noches_liberadas} noche(s).` : '';
      toast(r && r.accion === 'borrado'
        ? `Registro borrado.${liberadas}`
        : `Jugador archivado.${liberadas}`, 'success', 5000);
      // Ya no existe (o ya no debe salir) en la ficha: de vuelta a la lista.
      renderAdminJugadores().then((n) => wrap.replaceWith(n));
    } catch (err) {
      toast(humanizeError(err), 'error');
      btnOk.disabled = false; btnOk.textContent = tieneHistorial ? 'Sí, archivarlo' : 'Sí, borrarlo';
    }
  });
  content.appendChild(btnOk);
  content.appendChild(el('button', { class: 'btn btn-ghost mt-2', onclick: () => handle.close() }, 'Mejor no'));
  const handle = openSheet(content);
}

async function cargarFicha(wrap, jugador) {
  wrap.innerHTML = '';
  wrap.appendChild(el('button', { class: 'btn btn-ghost btn-sm mb-3', style: 'width:auto;padding-left:0;', onclick: () => renderAdminJugadores().then((n) => wrap.replaceWith(n)) }, '← Volver a la búsqueda'));

  const refresh = () => pintarFicha(wrap, jugador);

  const faltaPerfil = !((jugador.full_name || '').trim()) || !((jugador.phone || '').trim()) || !jugador.declared_level;

  wrap.appendChild(el('div', { class: 'card', style: 'text-align:center;' }, [
    el('div', { class: 'avatar-btn', style: 'width:72px;height:72px;font-size:22px;margin:0 auto 12px;' }, avatarContent(jugador)),
    el('div', { class: 'h2' }, jugador.full_name || 'Sin nombre'),
    el('div', { class: 'text-tiny mt-1' }, jugador.email),
    jugador.phone ? el('div', { class: 'text-tiny mt-1' }, `Cel. ${jugador.phone}`) : null,
    jugador.declared_level ? el('div', { class: 'text-tiny mt-1' }, nombreNivel(jugador.declared_level)) : null,
    jugador.status !== 'active' ? el('span', { class: 'badge badge-warning mt-2' }, jugador.status === 'suspended' ? 'Suspendido' : 'Archivado') : null,
    // Escribirle por WhatsApp es lo que recepción hace todo el tiempo:
    // "oye, ¿sí vienes?", "te esperamos", "se abrió un lugar". Antes había
    // que salirse de la app a buscar el número.
    waLinkJugador(jugador)
      ? el('a', {
          class: 'btn btn-secondary mt-3', href: waLinkJugador(jugador), target: '_blank', rel: 'noopener',
          style: 'display:flex;align-items:center;justify-content:center;gap:8px;',
        }, [el('span', { html: icon.whatsapp, style: 'width:18px;height:18px;' }), 'Escribirle por WhatsApp'])
      : el('p', { class: 'text-tiny mt-3', style: 'color:var(--text-tertiary);' }, 'Sin celular guardado: agrégaselo en "Editar datos" para poder escribirle por WhatsApp.'),
    el('div', { class: 'btn-row mt-3' }, [
      el('button', { class: 'btn btn-secondary btn-sm', onclick: () => abrirEditarJugador(jugador, refresh) }, 'Editar datos'),
      el('button', { class: 'btn btn-danger btn-sm', onclick: () => abrirDarDeBaja(jugador, wrap) }, 'Dar de baja'),
    ]),
  ]));

  // Un perfil a medias es casi siempre alguien que entró con su correo y
  // cerró la app antes de terminar de registrarse. No puede anotarse a
  // ninguna noche hasta completarlo (la base lo bloquea), así que aquí se
  // le avisa a recepción para que lo complete a mano o lo borre.
  if (faltaPerfil) {
    wrap.appendChild(el('div', { class: 'aviso aviso-warn mt-2' }, [
      el('strong', {}, 'Le falta terminar su registro. '),
      'Mientras no tenga nombre, celular y nivel no se puede anotar a ninguna noche. '
      + 'Complétalo con "Editar datos" si sabes quién es, o dale de baja si fue un registro que quedó a medias.',
    ]));
  }

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
