import { el, avatarContent, formatFecha, formatFechaHora, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import { getMyProfile, esAdminOMaestro, getReporteCashbacksRedimidos } from '../api.js';

/* ============================================================
   Reporte de cashbacks redimidos
   ------------------------------------------------------------
   Lo que dirección necesita para cuadrar con el club: de los
   cashbacks que la app repartió, CUÁLES ya se cobraron, en qué
   fecha se cobraron y QUIÉN los escaneó en recepción. Eso
   último vive en el cashback mismo (used_by), así que el
   reporte también sirve de bitácora.

   El dinero se cuenta por la fecha en que se REDIMIÓ, no por la
   noche en que se ganó: así cuadra con la caja del mes.
   ============================================================ */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function etiquetaMes(key) {
  const [a, m] = key.split('-');
  const nombre = MESES[Number(m) - 1] || key;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`;
}

/* Los últimos 12 meses, incluido el actual. Se arma en el navegador para no
   hacer una consulta extra solo para llenar el selector. */
function ultimosMeses(n = 12) {
  const hoy = new Date();
  const lista = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return lista;
}

export async function renderAdminCashbacks() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '🔒'),
      el('p', {}, 'No tienes permiso para ver esta sección.'),
    ]);
  }

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Cashbacks cobrados'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' },
    'Los cashbacks que ya se redimieron, con la fecha en que se cobraron y quién los escaneó.'));

  const meses = ultimosMeses(12);
  const selector = el('select', { class: 'input' },
    meses.map((k) => el('option', { value: k }, etiquetaMes(k))));
  wrap.appendChild(el('div', { class: 'mb-3' }, [
    el('div', { class: 'text-tiny mb-1', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);' }, 'Mes en que se cobraron'),
    selector,
  ]));

  const cuerpo = el('div');
  wrap.appendChild(cuerpo);

  const cargar = async () => {
    cuerpo.innerHTML = '';
    cuerpo.appendChild(el('div', { class: 'stack', style: 'padding-top:30px;' }, [el('div', { class: 'spinner' })]));
    let filas;
    try {
      filas = await getReporteCashbacksRedimidos(selector.value);
    } catch (err) {
      cuerpo.innerHTML = '';
      cuerpo.appendChild(el('p', { class: 'text-muted' }, humanizeError(err)));
      return;
    }
    cuerpo.innerHTML = '';

    if (!filas.length) {
      cuerpo.appendChild(el('div', { class: 'empty-state' }, [
        el('div', { class: 'emoji' }, '💸'),
        el('p', {}, `En ${etiquetaMes(selector.value)} no se cobró ningún cashback.`),
      ]));
      return;
    }

    const total = filas.reduce((a, r) => a + Number(r.amount_mxn || 0), 0);
    cuerpo.appendChild(el('div', { class: 'card mb-3' }, [
      el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-size:30px;font-weight:800;line-height:1;color:var(--success);' }, `$${total}`),
          el('div', { class: 'text-tiny mt-1' }, 'MXN cobrados en el mes'),
        ]),
        el('span', { class: 'badge badge-success' },
          `${filas.length} cashback${filas.length === 1 ? '' : 's'}`),
      ]),
    ]));

    // Quién escaneó cuántos: el dato de bitácora, por si hay que preguntarle
    // a alguien de recepción por un cobro en particular.
    const porQuien = new Map();
    filas.forEach((r) => {
      const k = r.redimido_por || 'Sin registrar';
      porQuien.set(k, (porQuien.get(k) || 0) + Number(r.amount_mxn || 0));
    });
    if (porQuien.size > 1 || !porQuien.has('Sin registrar')) {
      const card = el('div', { class: 'card mb-3' });
      card.appendChild(el('div', { class: 'text-tiny mb-2', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);' }, 'Quién los escaneó'));
      [...porQuien.entries()].sort((a, b) => b[1] - a[1]).forEach(([quien, monto], i) => {
        if (i > 0) card.appendChild(el('hr', { class: 'sep', style: 'margin:8px 0;' }));
        card.appendChild(el('div', { class: 'row-between' }, [
          el('div', { style: 'font-weight:600;font-size:14px;' }, quien),
          el('div', { style: 'font-weight:800;' }, `$${monto}`),
        ]));
      });
      cuerpo.appendChild(card);
    }

    const lista = el('div', { class: 'card' });
    filas.forEach((r, i) => {
      if (i > 0) lista.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      lista.appendChild(el('div', { class: 'row-between' }, [
        el('div', { class: 'row gap-2', style: 'align-items:center;min-width:0;' }, [
          el('span', { class: 'avatar-mini' }, avatarContent(r)),
          el('div', { style: 'min-width:0;' }, [
            el('div', { style: 'font-weight:700;font-size:14.5px;' }, r.full_name || '(sin nombre)'),
            el('div', { class: 'text-tiny mt-1' },
              `Cobrado ${formatFechaHora(r.used_at)} · lo escaneó ${r.redimido_por || 'Sin registrar'}`),
            el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);' },
              `Lo ganó la noche del ${formatFecha(r.session_date)}`
              + (r.place ? ` · ${r.place}º lugar` : '')),
          ]),
        ]),
        el('div', { style: 'font-weight:800;color:var(--success);white-space:nowrap;' }, `$${Number(r.amount_mxn)}`),
      ]));
    });
    cuerpo.appendChild(lista);

    cuerpo.appendChild(el('p', { class: 'text-tiny mt-3' },
      'Un cashback vence a los 30 días de ganarse. Los que nunca se cobraron no aparecen aquí: '
      + 'esta lista es solo dinero que ya salió de la caja.'));
  };

  selector.addEventListener('change', () => { cargar().catch(() => {}); });
  cargar().catch(() => {});

  void icon;
  return wrap;
}
