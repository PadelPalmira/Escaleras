import { el, toast, humanizeError, formatFechaHora, avatarContent, confirmSheet, openSheet } from '../utils.js';
import { getMyProfile, esAdminOMaestro } from '../api.js';

/* ============================================================
   3.0 — Playeras de campeón: existencias y entregas
   ------------------------------------------------------------
   Si la app corona campeón pero nadie apunta si ya se entregó,
   en dos meses nadie sabe quién debe qué. Aquí recepción ve
   cuántas hay, cuántas quedarían al entregar las apartadas, de
   qué talla ya no hay, y marca cada entrega con su talla.

   El api.js se pide en el momento y con guarda: estas funciones
   son nuevas de este deployment y en GitHub Pages un navegador
   puede traer esta pantalla con el api.js viejo todavía en
   caché. Así, en el peor caso falta la pantalla y no se cae la
   app entera.
   ============================================================ */

const TALLAS = ['S', 'M', 'L', 'XL', 'XXL'];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* "2026-10" no le dice nada a quien está en recepción. */
function nombreMes(monthKey) {
  const [a, m] = String(monthKey || '').split('-').map(Number);
  const nombre = MESES[(m || 1) - 1];
  if (!nombre || !a) return String(monthKey || '');
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`;
}

async function api(nombre) {
  const mod = await import('../api.js');
  if (typeof mod[nombre] !== 'function') {
    throw new Error('Esta pantalla se está actualizando. Cierra la app y vuelve a abrirla.');
  }
  return mod[nombre];
}

export async function renderAdminPlayeras() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '🔒'),
      el('p', {}, 'No tienes permiso para ver esta sección.'),
    ]);
  }

  const wrap = el('div');
  wrap.appendChild(el('button', {
    class: 'btn btn-ghost btn-sm mb-2', style: 'width:auto;padding-left:0;',
    onclick: () => { window.location.hash = '/admin'; },
  }, '← Volver'));
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Playeras de campeón'));

  const cuerpo = el('div');
  wrap.appendChild(cuerpo);

  async function pintar() {
    cuerpo.innerHTML = '';
    cuerpo.appendChild(el('div', { class: 'skeleton', style: 'height:200px;' }));

    let resumen; let premios;
    try {
      resumen = await (await api('getPlayerasResumen'))();
      premios = await (await api('getPremiosAdmin'))(false);
    } catch (err) {
      cuerpo.innerHTML = '';
      cuerpo.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, humanizeError(err))));
      return;
    }
    cuerpo.innerHTML = '';

    /* ---------- Resumen de arriba ---------- */
    const alertas = (resumen.tallas || []).filter((t) => t.alerta);
    cuerpo.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'grid-3' }, [
        el('div', { class: 'stat-tile' }, [
          el('div', { class: 'stat-value' }, String(resumen.total || 0)),
          el('div', { class: 'stat-label' }, 'En existencia'),
        ]),
        el('div', { class: 'stat-tile' }, [
          el('div', { class: 'stat-value' }, String(resumen.pendientes_entregar || 0)),
          el('div', { class: 'stat-label' }, 'Por entregar'),
        ]),
        el('div', { class: 'stat-tile' }, [
          el('div', { class: 'stat-value' },
            String((resumen.total || 0) - (resumen.tallas || []).reduce((a, t) => a + (t.apartadas || 0), 0))),
          el('div', { class: 'stat-label' }, 'Quedarían'),
        ]),
      ]),
      resumen.pendientes_sin_talla > 0
        ? el('div', { class: 'aviso aviso-warn mt-3' },
            `${resumen.pendientes_sin_talla} ${resumen.pendientes_sin_talla === 1 ? 'campeón no ha elegido' : 'campeones no han elegido'} talla todavía. `
            + 'Puedes elegirla tú al entregar.')
        : null,
    ]));

    if (alertas.length) {
      cuerpo.appendChild(el('div', { class: 'aviso aviso-danger mt-3' }, [
        el('strong', {}, 'Hay que reponer: '),
        alertas.map((t) => (t.quedarian < 0
          ? `${t.talla} (faltan ${-t.quedarian})`
          : `${t.talla} (quedarían ${t.quedarian})`)).join(', ') + '.',
      ]));
    }

    /* ---------- Existencias por talla ---------- */
    cuerpo.appendChild(el('div', { class: 'section-title' }, 'Existencias por talla'));
    const tabla = el('div', { class: 'card' });
    (resumen.tallas || []).forEach((t, i) => {
      if (i > 0) tabla.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      tabla.appendChild(el('div', { class: 'row-between' }, [
        el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
          el('span', {
            class: 'avatar-mini',
            style: t.alerta ? 'border-color:var(--danger);color:var(--danger);font-weight:800;' : 'font-weight:800;',
          }, t.talla),
          el('div', {}, [
            el('div', { style: 'font-weight:700;font-size:14px;' }, `${t.hay} en existencia`),
            el('div', { class: 'text-tiny', style: t.alerta ? 'color:var(--danger);' : 'color:var(--text-tertiary);' },
              t.quedarian < 0
                // Pidieron más de las que hay: "quedarían -1" no se
                // entiende, lo que importa es cuántas faltan comprar.
                ? `${t.apartadas} apartada${t.apartadas === 1 ? '' : 's'} y no alcanzan: faltan ${-t.quedarian}`
                : t.apartadas > 0
                  ? `${t.apartadas} apartada${t.apartadas === 1 ? '' : 's'} · quedarían ${t.quedarian}`
                  : (t.alerta ? 'Hay que reponer' : (t.hay > 0 ? 'Sin apartar' : 'No se surte'))),
          ]),
        ]),
        el('button', {
          class: 'btn btn-secondary btn-sm', style: 'width:auto;',
          onclick: () => abrirAjuste(t, pintar),
        }, 'Ajustar'),
      ]));
    });
    cuerpo.appendChild(tabla);

    /* ---------- Campeones ---------- */
    const pendientes = (premios || []).filter((p) => !p.entregada);
    const entregadas = (premios || []).filter((p) => p.entregada);

    cuerpo.appendChild(el('div', { class: 'section-title' },
      `Por entregar (${pendientes.length})`));
    if (!pendientes.length) {
      cuerpo.appendChild(el('div', { class: 'card' },
        el('p', { class: 'text-muted' }, 'No hay playeras pendientes de entregar.')));
    } else {
      const lista = el('div', { class: 'card' });
      pendientes.forEach((p, i) => {
        if (i > 0) lista.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
        lista.appendChild(filaCampeon(p, pintar, true));
      });
      cuerpo.appendChild(lista);
    }

    if (entregadas.length) {
      cuerpo.appendChild(el('div', { class: 'section-title' }, `Ya entregadas (${entregadas.length})`));
      const lista = el('div', { class: 'card' });
      entregadas.forEach((p, i) => {
        if (i > 0) lista.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
        lista.appendChild(filaCampeon(p, pintar, false));
      });
      cuerpo.appendChild(lista);
    }
  }

  await pintar();
  return wrap;
}

function filaCampeon(p, refresh, pendiente) {
  const fila = el('div', {}, [
    el('div', { class: 'row-between' }, [
      el('div', { class: 'row gap-2', style: 'align-items:center;min-width:0;' }, [
        el('span', { class: 'avatar-mini' }, avatarContent({ full_name: p.jugador, avatar_url: p.avatar_url })),
        el('div', { style: 'min-width:0;' }, [
          el('div', { style: 'font-weight:700;font-size:14px;' }, p.jugador || 'Jugador'),
          el('div', { class: 'text-tiny' },
            `${nombreMes(p.month_key)} · Categoría ${p.categoria} · ${Number(p.puntos || 0).toFixed(0)} pts en ${p.noches} noches`),
        ]),
      ]),
      p.entregada
        ? el('span', { class: 'badge badge-success' }, `Entregada ${p.talla_entregada || ''}`.trim())
        : el('span', { class: `badge ${p.talla_elegida ? 'badge-warning' : 'badge-neutral'}` },
            p.talla_elegida ? `Pide ${p.talla_elegida}` : 'Sin talla'),
    ]),
  ]);

  if (pendiente) {
    const acciones = el('div', { class: 'row gap-2 mt-2', style: 'flex-wrap:wrap;' });
    acciones.appendChild(el('button', {
      class: 'btn btn-primary btn-sm', style: 'width:auto;',
      onclick: () => abrirEntrega(p, refresh),
    }, 'Marcar entregada'));
    if (p.telefono) {
      acciones.appendChild(el('a', {
        class: 'btn btn-secondary btn-sm', style: 'width:auto;',
        href: `https://wa.me/${String(p.telefono).replace(/\D/g, '')}?text=`
          + encodeURIComponent(`¡Felicidades! Ganaste la playera de campeón de ${nombreMes(p.month_key)} en Categoría ${p.categoria}. Pásala a recoger a recepción 🎾`),
        target: '_blank', rel: 'noopener',
      }, 'Avisarle'));
    }
    fila.appendChild(acciones);
  } else if (p.entregada_at) {
    fila.appendChild(el('div', { class: 'text-tiny mt-1', style: 'color:var(--text-tertiary);' },
      `Entregada el ${formatFechaHora(p.entregada_at)}`));
  }
  return fila;
}

function abrirAjuste(t, refresh) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Existencias talla ${t.talla}`));
  content.appendChild(el('p', { class: 'text-tiny mt-1' },
    'Pon cuántas playeras de esta talla hay físicamente en el club. '
    + 'Al marcar una entrega, el número baja solo.'));
  const input = el('input', {
    class: 'input mt-3', type: 'number', min: '0', inputmode: 'numeric', value: String(t.hay),
  });
  content.appendChild(input);
  const btn = el('button', { class: 'btn btn-primary mt-3' }, 'Guardar');
  content.appendChild(btn);
  const handle = openSheet(content);
  btn.addEventListener('click', async () => {
    const n = parseInt(input.value, 10);
    if (!Number.isFinite(n) || n < 0) { toast('Pon un número válido.', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await (await api('ajustarStockPlayera'))(t.talla, n);
      toast(`Talla ${t.talla}: ${n} en existencia.`, 'success');
      handle.close();
      refresh();
    } catch (err) {
      toast(humanizeError(err), 'error');
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  });
}

function abrirEntrega(p, refresh) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Entregar a ${p.jugador || 'el campeón'}`));
  content.appendChild(el('p', { class: 'text-tiny mt-1' },
    p.talla_elegida
      ? `Pidió talla ${p.talla_elegida}. Si se lleva otra, elígela aquí.`
      : 'No eligió talla en la app. Elige la que se lleva.'));
  const fila = el('div', { class: 'row gap-2 mt-3', style: 'flex-wrap:wrap;' });
  content.appendChild(fila);
  const handle = openSheet(content);

  TALLAS.forEach((talla) => {
    const b = el('button', {
      class: `btn btn-sm ${talla === p.talla_elegida ? 'btn-primary' : 'btn-secondary'}`,
      style: 'width:auto;min-width:56px;',
    }, talla);
    b.addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: `¿Entregar talla ${talla}?`,
        body: 'Se descuenta una playera de esa talla del inventario y queda registrado '
          + 'quién la entregó y cuándo. Esto no se puede deshacer desde la app.',
        confirmLabel: 'Sí, entregada',
      });
      if (!ok) return;
      Array.from(fila.children).forEach((x) => { x.disabled = true; });
      try {
        const r = await (await api('registrarEntregaPlayera'))(p.id, talla);
        toast(`Entregada talla ${talla}. Quedan ${r.quedan}.`, 'success');
        handle.close();
        refresh();
      } catch (err) {
        toast(humanizeError(err), 'error');
        Array.from(fila.children).forEach((x) => { x.disabled = false; });
      }
    });
    fila.appendChild(b);
  });
}
