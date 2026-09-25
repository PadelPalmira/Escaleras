/* ============================================================
   Tarjetas para compartir en redes — formato "historia" vertical
   (1080×1920, proporción 9:16: Instagram/WhatsApp Estados).
   ------------------------------------------------------------
   Sin dependencias externas (mismo motivo que qrencode.js: el
   registro de paquetes está bloqueado en este proyecto). Todo se
   dibuja a mano sobre un <canvas> con la Canvas API del navegador,
   que ya trae Chrome/Safari integrada.

   A propósito NO se dibujan fotos de perfil de los jugadores: una
   imagen ajena (bucket de Supabase) podría no traer los encabezados
   CORS correctos y "mancharía" el canvas (canvas.toBlob truena en
   silencio o con SecurityError). Con solo iniciales + circulo de
   marca el resultado es 100% confiable para cualquier jugador,
   tenga foto subida o no.
   ============================================================ */

const ANCHO = 1080;
const ALTO = 1920;

const COLOR = {
  bg: '#0b0b0d',
  surface: '#1a1a1e',
  surface2: '#221f26',
  border: 'rgba(255,255,255,0.10)',
  textPrimary: '#f5f5f7',
  textSecondary: '#a3a3ac',
  textTertiary: '#6e6e78',
  cyan: '#00f2ea',
  pink: '#ff00c1',
  onAccent: '#06181a',
};

const FUENTE = '"Helvetica Neue", Arial, sans-serif';

function crearLienzo() {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function gradienteMarca(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, COLOR.cyan);
  g.addColorStop(1, COLOR.pink);
  return g;
}

/* Recorta un texto largo a un ancho máximo, agregando "…" — para nombres
   de jugadores que no quepan en una línea de la tarjeta. */
function acortar(ctx, texto, maxWidth) {
  if (ctx.measureText(texto).width <= maxWidth) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

function iniciales(nombre) {
  if (!nombre) return '?';
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/* Círculo con las iniciales del jugador, en degradado de marca — el
   mismo criterio visual en las 3 tarjetas y en el "lugar" (posición). */
function dibujarCirculoIniciales(ctx, cx, cy, r, texto, fontSize) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = gradienteMarca(ctx, cx - r, cy - r, cx + r, cy + r);
  ctx.fill();
  ctx.fillStyle = COLOR.onAccent;
  ctx.font = `800 ${fontSize}px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, cx, cy + 2);
  ctx.restore();
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* Fondo + logo + título — el mismo esqueleto en las 3 tarjetas, para que
   se vea que son de la misma familia visual. */
async function fondoYEncabezado(ctx, { titulo, subtitulo }) {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Franja diagonal de marca arriba, discreta (no tapa el logo blanco).
  ctx.save();
  ctx.globalAlpha = 0.9;
  const franja = gradienteMarca(ctx, 0, 0, ANCHO, 340);
  ctx.fillStyle = franja;
  ctx.fillRect(0, 0, ANCHO, 340);
  ctx.restore();

  // Logo del club, centrado. Si por lo que sea no carga (archivo movido,
  // etc.) la tarjeta igual se genera — el logo no es indispensable para
  // que la información se entienda.
  try {
    const logo = await cargarImagen('assets/img/logo-wordmark-black.png');
    const wLogo = 420;
    const hLogo = (logo.height / logo.width) * wLogo;
    ctx.drawImage(logo, (ANCHO - wLogo) / 2, 70, wLogo, hLogo);
  } catch { /* sin logo: no es crítico */ }

  ctx.fillStyle = COLOR.textPrimary;
  ctx.textAlign = 'center';
  ctx.font = '800 64px ' + FUENTE;
  ctx.fillText(titulo, ANCHO / 2, 470);

  if (subtitulo) {
    ctx.fillStyle = COLOR.textSecondary;
    ctx.font = '500 34px ' + FUENTE;
    ctx.fillText(subtitulo, ANCHO / 2, 525);
  }
}

function dibujarPie(ctx) {
  ctx.fillStyle = COLOR.textTertiary;
  ctx.font = '500 26px ' + FUENTE;
  ctx.textAlign = 'center';
  ctx.fillText('Escaleras · Padel Palmira', ANCHO / 2, ALTO - 60);
}

/* ============================================================
   1) Resultados de la noche — podio compartido (no personalizado).
   ============================================================ */
export async function generarTarjetaNoche({ sessionDateLabel, formatoLabel, categoryLabel, grupos }) {
  const { canvas, ctx } = crearLienzo();
  await fondoYEncabezado(ctx, {
    titulo: 'Resultados de la noche',
    subtitulo: [sessionDateLabel, formatoLabel, categoryLabel].filter(Boolean).join(' · '),
  });

  // "grupos" ya viene agrupado por lugar: [{ place, nombres: ['Fulano'] o
  // ['Fulano','Zutano'] si es Parejas, amount_mxn }]
  let y = 610;
  const cardX = 80;
  const cardW = ANCHO - 160;

  grupos.forEach((g) => {
    const nombresTxt = g.nombres.join(' / ');
    const alturaCard = g.nombres.length > 1 ? 230 : 190;

    ctx.save();
    redondeado(ctx, cardX, y, cardW, alturaCard, 28);
    ctx.fillStyle = COLOR.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.border;
    ctx.stroke();
    ctx.restore();

    dibujarCirculoIniciales(ctx, cardX + 100, y + alturaCard / 2, 68, `${g.place}º`, 42);

    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.textPrimary;
    ctx.font = '800 42px ' + FUENTE;
    const maxNombreW = cardW - 420;
    if (g.nombres.length > 1) {
      ctx.fillText(acortar(ctx, g.nombres[0], maxNombreW), cardX + 210, y + alturaCard / 2 - 30);
      ctx.fillText(acortar(ctx, g.nombres[1], maxNombreW), cardX + 210, y + alturaCard / 2 + 30);
    } else {
      ctx.fillText(acortar(ctx, nombresTxt, maxNombreW), cardX + 210, y + alturaCard / 2 + 14);
    }

    if (g.amount_mxn) {
      ctx.textAlign = 'right';
      ctx.fillStyle = COLOR.cyan;
      ctx.font = '800 40px ' + FUENTE;
      const etiquetaMonto = g.nombres.length > 1 ? `$${Number(g.amount_mxn)} c/u` : `$${Number(g.amount_mxn)}`;
      ctx.fillText(etiquetaMonto, cardX + cardW - 40, y + alturaCard / 2 + 14);
    }

    y += alturaCard + 32;
  });

  dibujarPie(ctx);
  return canvas;
}

/* ============================================================
   2) Ranking general — arriba de la tabla (no personalizado).
   ============================================================ */
export async function generarTarjetaRanking({ categoryLabel, filas }) {
  const { canvas, ctx } = crearLienzo();
  await fondoYEncabezado(ctx, {
    titulo: 'Ranking General',
    subtitulo: categoryLabel,
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR.textTertiary;
  ctx.font = '500 28px ' + FUENTE;
  ctx.fillText('Promedio de puntos por noche · últimas 6 escaleras', ANCHO / 2, 585);

  let y = 630;
  const cardX = 80;
  const cardW = ANCHO - 160;
  const alturaFila = 150;

  filas.forEach((f) => {
    ctx.save();
    redondeado(ctx, cardX, y, cardW, alturaFila, 24);
    ctx.fillStyle = COLOR.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.border;
    ctx.stroke();
    ctx.restore();

    dibujarCirculoIniciales(ctx, cardX + 95, y + alturaFila / 2, 54, `#${f.rank}`, 30);

    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.textPrimary;
    ctx.font = '800 40px ' + FUENTE;
    ctx.fillText(acortar(ctx, f.full_name, cardW - 380), cardX + 175, y + alturaFila / 2 + 14);

    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.cyan;
    ctx.font = '800 46px ' + FUENTE;
    ctx.fillText(Number(f.promedio).toFixed(0), cardX + cardW - 40, y + alturaFila / 2 + 16);

    y += alturaFila + 20;
  });

  dibujarPie(ctx);
  return canvas;
}

/* ============================================================
   3) Resultado final de Liguilla — podio (no personalizado).
   ============================================================ */
export async function generarTarjetaLiguilla({ tierLabel, eventDateLabel, resultados }) {
  const { canvas, ctx } = crearLienzo();
  await fondoYEncabezado(ctx, {
    titulo: 'Resultados de Liguilla',
    subtitulo: [tierLabel, eventDateLabel].filter(Boolean).join(' · '),
  });

  const cardX = 80;
  const cardW = ANCHO - 160;
  const areaTop = 610;
  const areaBottom = ALTO - 130; // deja espacio para el pie de pagina
  const n = Math.max(resultados.length, 1);
  // Con 6 lugares (Liguilla completa) las tarjetas a tamaño fijo de 230px + 32px
  // de separacion (1540px) ya no cabian en los 1920px del lienzo: el 6to lugar
  // quedaba totalmente fuera del area visible. Ahora el alto de cada tarjeta y
  // su separacion se calculan segun cuantos resultados hay que mostrar, con un
  // minimo legible, en vez de un tamaño fijo pensado solo para 1-4 lugares.
  const gapCard = n > 4 ? 16 : 32;
  let alturaCard = Math.floor((areaBottom - areaTop - gapCard * (n - 1)) / n);
  alturaCard = Math.max(110, Math.min(230, alturaCard));
  const escala = alturaCard / 230;
  let y = areaTop;

  resultados.forEach((r) => {
    ctx.save();
    redondeado(ctx, cardX, y, cardW, alturaCard, 28 * escala);
    ctx.fillStyle = COLOR.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.border;
    ctx.stroke();
    ctx.restore();

    dibujarCirculoIniciales(ctx, cardX + 100, y + alturaCard / 2, Math.round(68 * escala), `${r.final_placement}º`, Math.round(42 * escala));

    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.textPrimary;
    ctx.font = `800 ${Math.round(42 * escala)}px ` + FUENTE;
    const maxNombreW = cardW - 260;
    const saltoNombres = Math.round(30 * escala);
    ctx.fillText(acortar(ctx, r.nombre1, maxNombreW), cardX + 210, y + alturaCard / 2 - saltoNombres);
    ctx.fillText(acortar(ctx, r.nombre2, maxNombreW), cardX + 210, y + alturaCard / 2 + saltoNombres);

    y += alturaCard + gapCard;
  });

  dibujarPie(ctx);
  return canvas;
}

/* ============================================================
   4) Mi resultado de la noche — personalizada por jugador. A
   diferencia de las 3 anteriores (que son el mismo podio/tabla para
   cualquiera que la comparta), esta se arma distinta para cada
   jugador: su propio marcador partido por partido, sus puntos de
   esa noche y, si aplica, su lugar actual en el ranking. Es la que
   más se va a compartir en redes, así que lleva un poco más de
   producción visual (marco con brillo en el marcador, acento de
   color según si la noche fue positiva o no) sin salirse de la
   misma familia visual de las otras tres tarjetas.
   ============================================================ */
export async function generarTarjetaResultadoJugador({
  jugador, companeroFijo, sessionDateLabel, formatoLabel, categoryLabel, resumen, partidos, ranking,
}) {
  const { canvas, ctx } = crearLienzo();
  await fondoYEncabezado(ctx, {
    titulo: 'Mi resultado de la noche',
    subtitulo: [sessionDateLabel, formatoLabel, categoryLabel].filter(Boolean).join(' · '),
  });

  // Nombre del jugador (y compañero fijo si aplica), debajo del encabezado.
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR.textPrimary;
  ctx.font = '800 46px ' + FUENTE;
  const nombreTxt = companeroFijo ? `${jugador} y ${companeroFijo}` : jugador;
  ctx.fillText(acortar(ctx, nombreTxt || 'Jugador', ANCHO - 160), ANCHO / 2, 600);

  // Hero: puntos ganados esa noche, en grande — con acento de color según si
  // la noche fue positiva o no (evita celebrar en grande una noche con
  // penalización neta).
  const puntos = Number(resumen.puntos_noche) || 0;
  const positivo = puntos >= 0;
  ctx.save();
  redondeado(ctx, 80, 640, ANCHO - 160, 230, 32);
  const heroGrad = ctx.createLinearGradient(80, 640, ANCHO - 80, 870);
  heroGrad.addColorStop(0, positivo ? 'rgba(0,242,234,0.16)' : 'rgba(255,0,193,0.12)');
  heroGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = heroGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR.border;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = positivo ? COLOR.cyan : COLOR.pink;
  ctx.font = '800 110px ' + FUENTE;
  ctx.fillText(`${positivo ? '+' : ''}${puntos.toFixed(0)}`, ANCHO / 2, 780);
  ctx.fillStyle = COLOR.textSecondary;
  ctx.font = '600 32px ' + FUENTE;
  ctx.fillText('puntos esta noche', ANCHO / 2, 830);

  // Récord ganados-perdidos, justo debajo del hero.
  ctx.fillStyle = COLOR.textPrimary;
  ctx.font = '700 38px ' + FUENTE;
  ctx.fillText(
    `${resumen.partidos_ganados}V - ${resumen.partidos_perdidos}D  ·  ${resumen.partidos_jugados} partido(s)`,
    ANCHO / 2, 920,
  );

  if (ranking && ranking.posicion) {
    ctx.fillStyle = COLOR.textTertiary;
    ctx.font = '500 30px ' + FUENTE;
    ctx.fillText(`#${ranking.posicion} en el ranking de tu categoría`, ANCHO / 2, 965);
  }

  // Marcador partido por partido, tipo tarjeta de resultados deportivos.
  let y = 1020;
  const cardX = 80;
  const cardW = ANCHO - 160;
  const alturaCard = 150;
  const filas = partidos || [];
  const maxFilas = 4; // una historia no puede crecer sin límite si jugó muchas rondas

  if (!filas.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLOR.textTertiary;
    ctx.font = '500 30px ' + FUENTE;
    ctx.fillText('No se registraron partidos esa noche.', ANCHO / 2, y + 40);
  }

  filas.slice(0, maxFilas).forEach((p) => {
    ctx.save();
    redondeado(ctx, cardX, y, cardW, alturaCard, 22);
    ctx.fillStyle = COLOR.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.gano ? 'rgba(0,242,234,0.35)' : COLOR.border;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.textTertiary;
    ctx.font = '600 26px ' + FUENTE;
    ctx.fillText(`Ronda ${p.ronda} · Cancha ${p.cancha}`, cardX + 32, y + 44);

    ctx.fillStyle = COLOR.textPrimary;
    ctx.font = '800 44px ' + FUENTE;
    ctx.fillText(`${p.games_propios} - ${p.games_rival}`, cardX + 32, y + 100);

    ctx.textAlign = 'right';
    ctx.fillStyle = p.gano ? COLOR.cyan : COLOR.textSecondary;
    ctx.font = '800 32px ' + FUENTE;
    ctx.fillText(p.gano ? 'GANÓ' : 'PERDIÓ', cardX + cardW - 32, y + 44);

    if (p.rivales && p.rivales.length) {
      ctx.fillStyle = COLOR.textSecondary;
      ctx.font = '500 26px ' + FUENTE;
      ctx.fillText(acortar(ctx, `vs. ${p.rivales.join(' y ')}`, cardW - 64), cardX + cardW - 32, y + 100);
    }

    y += alturaCard + 22;
  });

  if (filas.length > maxFilas) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLOR.textTertiary;
    ctx.font = '500 28px ' + FUENTE;
    ctx.fillText(`+ ${filas.length - maxFilas} partido(s) más`, ANCHO / 2, y + 24);
  }

  dibujarPie(ctx);
  return canvas;
}

/* ============================================================
   Compartir / descargar la tarjeta ya generada.
   ------------------------------------------------------------
   Se intenta primero la Web Share API con archivo (lo que en un celular
   abre directo el selector de WhatsApp/Instagram/etc.); si el navegador
   no la soporta (o no soporta compartir ARCHIVOS, solo texto — hay que
   comprobarlo con canShare, no solo con "share" in navigator) se cae a
   una descarga normal de PNG, que nunca falla.
   ============================================================ */
export async function compartirTarjeta(canvas, { archivo, titulo, texto }) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), 'image/png');
  });
  const file = new File([blob], archivo, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: titulo, text: texto });
      return 'compartido';
    } catch (err) {
      // El usuario cerró el selector de compartir: no es un error real.
      if (err && err.name === 'AbortError') return 'cancelado';
      // Cualquier otra falla real cae a la descarga de todos modos.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'descargado';
}
