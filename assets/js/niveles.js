// Escala de nivel declarado (varonil y femenil) y la lógica de qué
// convocatoria(s) recomendarle a un jugador nuevo según su nivel, mientras
// junta historial real de partidos y el sistema calcula su lugar de verdad
// en cada categoría. Un solo lugar para esto — lo usan completar_perfil.js
// (la pregunta), guia_app.js (la explicación) y perfil.js (el recordatorio).
//
// Ya no hay ascenso/descenso ni categoría asignada: esto es solo una
// RECOMENDACIÓN de a qué convocatoria conviene anotarse para empezar. El
// jugador elige libremente cada semana, y su lugar real en cada categoría
// se calcula con sus resultados (ver ranking_vivo).

export const NIVELES = [
  { value: '2da_varonil', label: '2da varonil' },
  { value: '3ra_varonil', label: '3ra varonil' },
  { value: '4ta_varonil', label: '4ta varonil' },
  { value: '5ta_varonil', label: '5ta varonil' },
  { value: '6ta_varonil', label: '6ta varonil' },
  { value: '7ma_varonil', label: '7ma varonil' },
  { value: '7ma_varonil_principiante', label: '7ma varonil principiante' },
  { value: '2da_femenil', label: '2da femenil' },
  { value: '3ra_femenil', label: '3ra femenil' },
  { value: '4ta_femenil', label: '4ta femenil' },
  { value: '5ta_femenil', label: '5ta femenil' },
  { value: '6ta_femenil', label: '6ta femenil' },
  { value: '7ma_femenil', label: '7ma femenil' },
  { value: '7ma_femenil_principiante', label: '7ma femenil principiante' },
];

export const WEEKDAY_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
export const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };

function nivelLabel(nivel) {
  return (NIVELES.find((n) => n.value === nivel) || {}).label || nivel;
}

// 2da a 4ta ya juegan a nivel competitivo alto -> solo Categoría A.
// 5ta está justo en el traslape -> A o B son válidas, el jugador elige.
// 6ta y 7ma ya compiten en el escalón parejo con más gente -> Categoría B.
// 7ma principiante -> Retas Abiertas para agarrar confianza sin presión de
// puntos (nada le impide anotarse directo a Categoría B si prefiere).
// Femenil (cualquier nivel): todavía no hay escaleras femeniles activas —
// se recomienda Retas Abiertas mientras tanto y se le ofrece anotarse a la
// lista de interesadas de Femenil A y/o Femenil B.
const NIVELES_SOLO_A = ['2da_varonil', '3ra_varonil', '4ta_varonil'];
const NIVELES_A_O_B = ['5ta_varonil'];
const NIVELES_SOLO_B = ['6ta_varonil', '7ma_varonil'];
const NIVELES_RETAS = ['7ma_varonil_principiante'];

export function esFemenil(nivel) {
  return String(nivel).endsWith('_femenil') || nivel === '7ma_femenil_principiante';
}

/**
 * A partir del nivel declarado y los horarios reales activos
 * (weekday_schedule), arma la recomendación de a qué convocatoria(s) entrar.
 * `modo` es uno de: 'categoria' (una sola, en `categoria`), 'opciones' (A o
 * B, ambas válidas — ver `diasPorCategoria`), 'retas', o 'femenil'.
 * Devuelve null si el nivel no es reconocido.
 */
export function recomendacionPorNivel(nivel, weekdaySchedules) {
  const activos = (weekdaySchedules || []).filter((ws) => ws.active);
  const diasDe = (cat) => activos.filter((ws) => ws.category === cat);
  const diasRetas = activos.filter((ws) => ws.format === 'retas_abiertas');
  const label = nivelLabel(nivel);

  if (esFemenil(nivel)) {
    return { nivelLabel: label, modo: 'femenil', categoria: null, opciones: [], dias: diasRetas };
  }
  if (NIVELES_SOLO_A.includes(nivel)) {
    return { nivelLabel: label, modo: 'categoria', categoria: 'A', opciones: ['A'], dias: diasDe('A') };
  }
  if (NIVELES_A_O_B.includes(nivel)) {
    return {
      nivelLabel: label, modo: 'opciones', categoria: null, opciones: ['A', 'B'], dias: [],
      diasPorCategoria: { A: diasDe('A'), B: diasDe('B') },
    };
  }
  if (NIVELES_SOLO_B.includes(nivel)) {
    return { nivelLabel: label, modo: 'categoria', categoria: 'B', opciones: ['B'], dias: diasDe('B') };
  }
  if (NIVELES_RETAS.includes(nivel)) {
    return { nivelLabel: label, modo: 'retas', categoria: null, opciones: [], dias: diasRetas };
  }
  return null;
}

export function textoDia(ws) {
  return `${WEEKDAY_LABEL[ws.weekday] || ws.weekday} — ${FORMAT_LABEL[ws.format] || ws.format}`;
}
