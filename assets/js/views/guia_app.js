import { el, ahora } from '../utils.js';
import { icon } from '../icons.js';
import { updateMyProfile, getMiSituacionCategorias } from '../api.js';
import { textoDia } from '../niveles.js';

/**
 * Guía rápida de la app — un carrusel corto que se muestra UNA sola vez:
 *
 *  - A un jugador nuevo, justo después de completar su perfil (esNuevo:
 *    true) — recibe además `recomendacion` (de completar_perfil.js, según
 *    el nivel que acaba de declarar) para mostrarle a qué convocatoria
 *    entrar desde ya.
 *  - A un jugador que ya tenía cuenta de antes de que esta guía existiera
 *    (esNuevo: false) — la primera vez que entra tras esta actualización.
 *    En este caso no hay `recomendacion`: en su lugar se consulta su
 *    situación real en cada categoría (A y/o B, si el sistema ya tiene
 *    suficiente historial suyo) para mostrarla en el mismo espacio.
 *
 * En ambos casos, terminar la guía (o saltarla) marca
 * profiles.app_guide_seen_at para que nunca se vuelva a mostrar sola.
 */
export function renderGuiaApp({ profile, recomendacion = null, esNuevo, onDone }) {
  const wrap = el('div', { class: 'guia-app' });
  let index = 0;
  let situacionActual = null;
  let situacionCargada = esNuevo; // a un jugador nuevo no le consultamos su situación — usa `recomendacion`.

  const slides = buildSlides();

  const dots = el('div', { class: 'guia-dots' });
  slides.forEach((_, i) => dots.appendChild(el('span', { class: `guia-dot${i === 0 ? ' active' : ''}` })));

  const skipLink = el('button', { class: 'guia-skip', type: 'button' }, 'Saltar');
  skipLink.addEventListener('click', finish);

  const header = el('div', { class: 'guia-header' }, [dots, skipLink]);
  const slideHost = el('div', { class: 'guia-slide-host' });
  const backBtn = el('button', { class: 'btn btn-secondary', type: 'button' }, 'Atrás');
  const nextBtn = el('button', { class: 'btn btn-primary', type: 'button' }, 'Siguiente');
  const footer = el('div', { class: 'btn-row mt-4' }, [backBtn, nextBtn]);

  backBtn.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  nextBtn.addEventListener('click', () => {
    if (index < slides.length - 1) { index++; render(); } else { finish(); }
  });

  function finish() {
    updateMyProfile({ app_guide_seen_at: ahora().toISOString() }).catch(() => {});
    onDone();
  }

  async function render() {
    Array.from(dots.children).forEach((d, i) => d.classList.toggle('active', i === index));
    backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = index === slides.length - 1 ? (esNuevo ? 'Entendido, vamos a jugar' : 'Entendido') : 'Siguiente';

    slideHost.innerHTML = '';
    const slide = slides[index];
    const node = await slide.render();
    node.classList.add('guia-slide');
    slideHost.appendChild(node);
  }

  function buildSlides() {
    const arr = [];

    arr.push({
      render: () => Promise.resolve(slideCard(
        icon.info,
        esNuevo ? '¡Bienvenido a Escaleras Palmira!' : '¡Qué bueno tenerte de vuelta!',
        esNuevo
          ? ['Esta es la liga interna del club: eliges cada semana si juegas en Categoría A o en Categoría B, ganas puntos, y una vez al mes hay Liguilla para pelear tu lugar arriba.', 'Esta guía rápida te explica cómo funciona todo — te toma menos de un minuto.']
          : ['Actualizamos varias cosas en el sistema desde la última vez que jugaste — sobre todo cómo funcionan las convocatorias y la cancha 1.', 'Esta guía rápida te deja al día en menos de un minuto.']
      )),
    });

    arr.push({
      render: () => Promise.resolve(slideCard(
        icon.clock,
        'Así funciona una noche',
        ['Lunes a viernes, 8:00–10:00pm, en las 3 canchas del club.', 'Dentro de esas 2 horas se juegan varias rondas de 15 minutos, rotando de cancha y de rival — casi nadie repite el mismo cruce dos veces en la misma noche.']
      )),
    });

    arr.push({
      render: () => Promise.resolve(slideCard(
        icon.shield,
        'Convocatorias justas — esto es lo nuevo',
        [
          esNuevo ? 'Así nos aseguramos que sea parejo para todos:' : 'Esto es justo lo que cambió respecto a antes:',
          '• Si el cupo se llena, la lista de espera se ordena por tu puntaje — ya no por quién se anotó primero.',
          '• La cancha 1 se sortea al azar en la primera ronda de cada noche — nadie empieza con ventaja.',
          '• Después, subes o bajas de cancha según ganes o pierdas cada ronda — nadie se queda fijo toda la noche.',
        ]
      )),
    });

    arr.push({
      render: () => Promise.resolve(slideCard(
        icon.coin,
        'Tus puntos, categoría por categoría',
        ['Ganas puntos por cada game y por ganar el partido — y más si juegas en cancha 1.', 'A y B llevan su propio ranking, cada uno con tu PROMEDIO de puntos por noche de tus últimas 6 escaleras ahí. No hay ascenso ni descenso automático: tú eliges cada semana en cuál anotarte.', 'El detalle completo con todas las cifras está siempre en la pestaña Reglas.']
      )),
    });

    arr.push({
      render: async () => {
        if (recomendacion) return slideRecomendacion(recomendacion);
        if (!situacionCargada) {
          try { situacionActual = await getMiSituacionCategorias(profile.id); } catch (err) { situacionActual = null; }
          situacionCargada = true;
        }
        return slideSituacionActual(situacionActual);
      },
    });

    arr.push({
      render: () => Promise.resolve(slideTour()),
    });

    return arr;
  }

  function slideCard(iconSvg, title, paragrafos) {
    const card = el('div', {});
    card.appendChild(el('div', { class: 'guia-icon' }, [el('span', { html: iconSvg })]));
    card.appendChild(el('div', { class: 'h2 mt-4 mb-3' }, title));
    const body = el('div', { class: 'stack gap-2' });
    paragrafos.forEach((p) => body.appendChild(el('p', { class: 'text-muted', style: 'font-size:14.5px;line-height:1.6;' }, p)));
    card.appendChild(body);
    return card;
  }

  function slideRecomendacion(rec) {
    const card = el('div', {});
    card.appendChild(el('div', { class: 'guia-icon' }, [el('span', { html: icon.trophy })]));
    card.appendChild(el('div', { class: 'h2 mt-4 mb-3' }, 'Tu nivel recomendado'));
    card.appendChild(el('p', { class: 'text-muted', style: 'font-size:14.5px;line-height:1.6;' }, `Nos dijiste ${rec.nivelLabel} — con eso, para empezar:`));
    const box = el('div', { class: 'card mt-3', style: 'background:var(--surface-2);' });
    const tituloBox = rec.modo === 'retas' ? 'Retas Abiertas'
      : rec.modo === 'opciones' ? 'Categoría A o Categoría B'
      : rec.modo === 'femenil' ? 'Retas Abiertas (femenil, próximamente)'
      : `Categoría ${rec.categoria}`;
    box.appendChild(el('div', { class: 'text-tiny', style: 'font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.04em;' }, tituloBox));
    if (rec.modo === 'retas') {
      box.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, '100% social, sin presión de puntos — perfecto para agarrar ritmo. Cuando quieras, también puedes anotarte directo a Categoría B.'));
    } else if (rec.modo === 'opciones') {
      box.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, 'Las dos son válidas para tu nivel — tú eliges cada semana en cuál anotarte, según cómo te sientas ese día.'));
    } else if (rec.modo === 'femenil') {
      box.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, 'Todavía no tenemos escaleras femeniles activas. Mientras se abren, puedes jugar en Retas Abiertas y anotarte a la lista de interesadas de Femenil A y/o Femenil B — en cuanto una junte suficientes jugadoras, se abre y te avisamos.'));
    }
    if (rec.modo === 'opciones' && rec.diasPorCategoria) {
      ['A', 'B'].forEach((cat) => {
        const dias = rec.diasPorCategoria[cat] || [];
        if (!dias.length) return;
        const lista = el('div', { class: 'stack gap-1 mt-3' });
        lista.appendChild(el('div', { class: 'text-tiny', style: 'font-weight:700;' }, `Categoría ${cat}:`));
        dias.forEach((ws) => lista.appendChild(el('div', { class: 'text-tiny', style: 'font-weight:600;' }, `📅 ${textoDia(ws)}`)));
        box.appendChild(lista);
      });
    } else if (rec.dias.length) {
      const lista = el('div', { class: 'stack gap-1 mt-3' });
      rec.dias.forEach((ws) => lista.appendChild(el('div', { class: 'text-tiny', style: 'font-weight:600;' }, `📅 ${textoDia(ws)}`)));
      box.appendChild(lista);
    }
    card.appendChild(box);
    card.appendChild(el('p', { class: 'text-tiny text-muted mt-3' }, 'No es definitivo — es solo para empezar. Tu lugar real en cada categoría se calcula con tus resultados, y puedes cambiar de convocatoria cuando quieras.'));
    return card;
  }

  function slideSituacionActual(situacion) {
    const card = el('div', {});
    card.appendChild(el('div', { class: 'guia-icon' }, [el('span', { html: icon.trophy })]));
    card.appendChild(el('div', { class: 'h2 mt-4 mb-3' }, 'Tu ranking'));
    const porCategoria = situacion ? situacion.porCategoria : null;
    const categoriasConDatos = porCategoria ? ['A', 'B'].filter((c) => porCategoria[c]) : [];
    if (categoriasConDatos.length > 0) {
      categoriasConDatos.forEach((cat) => {
        const datos = porCategoria[cat];
        const box = el('div', { class: 'card mt-2', style: 'background:var(--surface-2);' });
        box.appendChild(el('div', { class: 'row-between' }, [
          el('div', { class: 'text-tiny', style: 'font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.04em;' }, `Categoría ${cat}`),
          el('span', {}, datos.rank != null ? `#${datos.rank}` : '—'),
        ]));
        box.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, 'Es tu lugar en vivo, con tu promedio de puntos por noche de las últimas 6 escaleras en esta categoría — puedes ver el detalle completo en la pestaña Ranking.'));
        card.appendChild(box);
      });
    } else {
      card.appendChild(el('p', { class: 'text-muted', style: 'font-size:14.5px;line-height:1.6;' }, 'Todavía no tenemos suficiente historial reciente tuyo en A ni en B — en cuanto juegues tus próximas escaleras, tu ranking aparece solo.'));
    }
    return card;
  }

  function slideTour() {
    const card = el('div', {});
    card.appendChild(el('div', { class: 'guia-icon' }, [el('span', { html: icon.book })]));
    card.appendChild(el('div', { class: 'h2 mt-4 mb-3' }, 'Un tour rapidísimo'));
    const items = [
      [icon.home, 'Inicio', 'tu próxima sesión y tu resumen del momento.'],
      [icon.ranking, 'Ranking', 'tu lugar en A y en B, y el de todo el club.'],
      [icon.calendar, 'Convocatorias', 'confirma tu lugar, busca sustituto o cancela.'],
      [icon.book, 'Reglas', 'el reglamento completo, siempre a la mano.'],
      [icon.user, 'Perfil', 'tu historial, multas y notificaciones.'],
    ];
    const list = el('div', { class: 'stack gap-3 mt-1' });
    items.forEach(([ic, titulo, desc]) => {
      list.appendChild(el('div', { class: 'row gap-3' }, [
        el('span', { class: 'guia-tour-icon' }, [el('span', { html: ic })]),
        el('div', {}, [el('div', { style: 'font-weight:700;font-size:14px;' }, titulo), el('div', { class: 'text-tiny' }, desc)]),
      ]));
    });
    card.appendChild(list);
    return card;
  }

  wrap.append(header, slideHost, footer);
  render();
  return wrap;
}
