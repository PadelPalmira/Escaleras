import { el, avatarContent, toast, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import { getSession, getAjusteNum } from '../api.js';
import { generarTarjetaRanking, compartirTarjeta } from '../vendor/sharecard.js';

/* ============================================================
   3.0 — Las tres tablas de la liga
   ------------------------------------------------------------
   MES, AÑO e HISTÓRICO, todas por PUNTOS TOTALES. Las tres
   salen de la misma función en la base (puntos_base), así que
   no se pueden contradecir entre ellas — que es exactamente el
   error que nos costó caro con la Liguilla.

   Solo la del MES lleva las reglas del premio: el mínimo de
   noches del jugador, quién va de campeón y por qué alguien
   quedó arriba de otro cuando empataron. Año e histórico son
   informativas, sin premio, por decisión del club.
   ============================================================ */

const CAT_LABEL = { A: 'Categoría A', B: 'Categoría B' };
const CAT_BADGE = { A: 'badge-a', B: 'badge-b' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function nombreMes(monthKey) {
  const [a, m] = String(monthKey).split('-').map(Number);
  const nombre = MESES[(m || 1) - 1] || '';
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`;
}

/* El api.js se pide en el momento y se comprueba que las funciones existan:
   son nuevas de este deployment y, en GitHub Pages, un navegador puede
   traer esta pantalla nueva con el api.js viejo todavía en caché. Así, en
   el peor caso falta la tabla y no se cae la app entera. */
async function api(nombre) {
  const mod = await import('../api.js');
  if (typeof mod[nombre] !== 'function') {
    throw new Error('La tabla se está actualizando. Cierra la app y vuelve a abrirla.');
  }
  return mod[nombre];
}

async function compartirTabla(categoria, filas, btn) {
  const original = btn.lastChild.textContent;
  btn.disabled = true;
  btn.lastChild.textContent = 'Generando…';
  try {
    const top = filas.slice(0, 8).map((f) => ({
      rank: f.lugar, full_name: f.full_name, promedio: Number(f.puntos),
    }));
    const canvas = await generarTarjetaRanking({ categoryLabel: CAT_LABEL[categoria] || categoria, filas: top });
    await compartirTarjeta(canvas, {
      archivo: `tabla-${categoria}.png`,
      titulo: 'Tabla — Escaleras Padel Palmira',
      texto: `Tabla ${CAT_LABEL[categoria] || categoria}`,
    });
  } catch (err) {
    toast(humanizeError(err), 'error');
  } finally {
    btn.disabled = false;
    btn.lastChild.textContent = original;
  }
}

export async function renderRanking() {
  const session = await getSession();
  const meId = session ? session.user.id : null;

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Ranking'));

  let periodo = 'mes';          // mes | anio | historico
  let categoria = 'B';
  const mesActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }).slice(0, 7);

  const tabsPeriodo = el('div', { class: 'tabs' });
  const tabsCat = el('div', { class: 'tabs mt-2' });
  const nota = el('div', { class: 'mt-3' });
  const cuerpo = el('div', { class: 'mt-2' });

  function pintarTabs() {
    tabsPeriodo.innerHTML = '';
    [['mes', 'Este mes'], ['anio', 'Este año'], ['historico', 'Histórico']].forEach(([k, t]) => {
      tabsPeriodo.appendChild(el('button', {
        class: `tab-chip ${periodo === k ? 'active' : ''}`,
        onclick: () => { periodo = k; pintarTabs(); pintar(); },
      }, t));
    });
    tabsCat.innerHTML = '';
    ['A', 'B'].forEach((c) => {
      tabsCat.appendChild(el('button', {
        class: `tab-chip ${categoria === c ? 'active' : ''}`,
        onclick: () => { categoria = c; pintarTabs(); pintar(); },
      }, CAT_LABEL[c]));
    });
  }

  async function pintar() {
    cuerpo.innerHTML = '';
    nota.innerHTML = '';
    cuerpo.appendChild(el('div', { class: 'skeleton', style: 'height:220px;' }));

    let filas = [];
    try {
      filas = periodo === 'mes'
        ? await (await api('getTablaMes'))(categoria, mesActual)
        : await (await api('getTablaPeriodo'))(categoria, periodo);
    } catch (err) {
      cuerpo.innerHTML = '';
      cuerpo.appendChild(el('div', { class: 'card' },
        el('p', { class: 'text-muted' }, humanizeError(err))));
      return;
    }

    // ---- La nota de arriba explica QUÉ ordena esta tabla ----
    if (periodo === 'mes') {
      // El mínimo se lee del ajuste, que es de donde lo saca la base.
      // Antes se deducía del primer lugar (noches + faltantes), y eso
      // está mal en cuanto el líder ya cumplió el mínimo: le sobran
      // noches y faltantes es 0, así que decía "al menos 5" cuando son
      // 4. Lo cachó el harness con el líder en 5 noches.
      const minNoches = await getAjusteNum('premio_min_noches_mes', 4);
      nota.appendChild(el('div', { class: 'aviso aviso-info' }, [
        el('strong', {}, `${nombreMes(mesActual)} · playera de campeón. `),
        `Gana quien junte más puntos en el mes, y para poder ganar hay que haber jugado al menos ${minNoches} noches de esta categoría.`,
      ]));
      const campeon = filas.find((f) => f.es_campeon);
      if (!campeon && filas.length) {
        nota.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
          `Todavía nadie llega a las ${minNoches} noches, así que por ahora este mes no tiene campeón.`));
      }
    } else if (periodo === 'anio') {
      nota.appendChild(el('p', { class: 'text-tiny' },
        'Puntos acumulados del año, desde que arrancó la app en septiembre. Es informativa: el premio es mensual.'));
    } else {
      nota.appendChild(el('p', { class: 'text-tiny' },
        'Todos los puntos de siempre. Es informativa: el premio es mensual.'));
    }

    cuerpo.innerHTML = '';

    if (!filas.length) {
      cuerpo.appendChild(el('div', { class: 'empty-state' }, [
        el('div', { class: 'emoji' }, '🎾'),
        el('p', {}, periodo === 'mes'
          ? 'Todavía no se juega ninguna noche de esta categoría este mes.'
          : 'Todavía no hay noches jugadas en esta categoría.'),
      ]));
      return;
    }

    // ---- Compartir ----
    const btnCompartir = el('button', {
      class: 'btn btn-secondary btn-sm mb-3',
      style: 'display:inline-flex;align-items:center;gap:6px;width:auto;',
    }, [
      el('span', { html: icon.share, style: 'width:16px;height:16px;' }),
      el('span', {}, 'Compartir'),
    ]);
    btnCompartir.addEventListener('click', () => compartirTabla(categoria, filas, btnCompartir));
    cuerpo.appendChild(el('div', { style: 'text-align:right;' }, btnCompartir));

    // ---- La tabla ----
    const lista = el('div', { class: 'card' });
    filas.forEach((f) => {
      const soyYo = f.player_id === meId;
      const fila = el('div', { class: `list-row${soyYo ? ' me' : ''}` }, [
        el('div', { class: 'rank' }, f.es_campeon ? '🏆' : `#${f.lugar}`),
        el('div', { class: 'avatar' }, avatarContent(f)),
        el('div', { style: 'min-width:0;' }, [
          el('div', { class: 'name' }, (f.full_name || 'Jugador') + (soyYo ? ' (tú)' : '')),
          el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);' },
            `${f.noches} ${f.noches === 1 ? 'noche' : 'noches'} · ${f.ganados} de ${f.partidos} partidos`),
          // El mínimo tiene que VERSE, no sorprender al final del mes.
          periodo === 'mes' && f.noches_faltantes > 0
            ? el('span', { class: 'chip-faltan mt-1', style: 'display:inline-block;' },
                `le falta${f.noches_faltantes === 1 ? '' : 'n'} ${f.noches_faltantes} noche${f.noches_faltantes === 1 ? '' : 's'} para poder ganar`)
            : null,
          periodo === 'mes' && f.elegible && !f.es_campeon
            ? el('span', { class: 'chip-faltan chip-listo mt-1', style: 'display:inline-block;' }, 'ya puede ganar')
            : null,
        ]),
        el('div', { class: 'value' }, Number(f.puntos).toFixed(0)),
      ]);
      lista.appendChild(fila);

      // Por qué quedó arriba o abajo cuando empataron en puntos.
      if (periodo === 'mes' && f.motivo_desempate) {
        lista.appendChild(el('div', {
          class: 'text-tiny',
          style: 'color:var(--text-tertiary);padding:0 0 10px 68px;margin-top:-6px;',
        }, f.motivo_desempate));
      }
    });
    cuerpo.appendChild(lista);

    cuerpo.appendChild(el('p', { class: 'text-tiny mt-3', style: 'color:var(--text-tertiary);' },
      'El número grande son tus puntos acumulados, no un promedio: venir más veces sí te sube.'));
  }

  pintarTabs();
  wrap.append(tabsPeriodo, tabsCat, nota, cuerpo);
  await pintar();
  return wrap;
}
