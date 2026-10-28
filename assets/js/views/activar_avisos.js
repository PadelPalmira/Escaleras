import { el, toast } from '../utils.js';

/* ============================================================
   "Préndete los avisos"
   ------------------------------------------------------------
   El backend de push lleva meses listo y corriendo cada minuto,
   pero al 28 de octubre de 2026 había CERO suscripciones: el
   botón vivía hasta abajo de Perfil, donde casi nadie entra. Y
   mientras tanto los avisos de la app se leen alrededor del 10%
   — o sea que recordatorios, lugares que se liberan y
   confirmaciones de Liguilla no le llegaban a nadie.

   Mismo trato que la pantalla de contraseña: se ofrece UNA vez,
   con salida clara. Si dice "ahora no", no se vuelve a asomar.
   ============================================================ */
const CLAVE_POSPUESTO = 'pp_avisos_pospuesto';

function recordarQueDijoAhoraNo() {
  try { localStorage.setItem(CLAVE_POSPUESTO, '1'); } catch { /* da igual */ }
}

/* ¿Vale la pena enseñar esta pantalla?
   Se dice que NO en cuanto haya cualquier duda: es mejor no ofrecerlo que
   ofrecerlo donde no puede funcionar (iPhone sin instalar), donde ya lo
   contestó (permiso dado o negado) o donde ya está prendido. */
export async function convieneOfrecerAvisos() {
  try {
    if (localStorage.getItem(CLAVE_POSPUESTO) === '1') return false;
  } catch { return false; }

  let push;
  try { push = await import('../push.js'); } catch { return false; }
  if (!push.soportaPush()) return false;            // incluye iPhone sin instalar
  if (push.permisoActual() !== 'default') return false;  // ya dijo sí o no antes
  try { if (await push.haySuscripcionLocal()) return false; } catch { return false; }
  return true;
}

export function renderActivarAvisos({ profile, onDone }) {
  const wrap = el('div', { class: 'stack', style: 'padding:28px 20px;max-width:440px;margin:0 auto;' });

  wrap.appendChild(el('div', { class: 'h1' }, 'Que no se te pase tu noche'));
  wrap.appendChild(el('p', { class: 'text-muted mt-2' },
    `${profile && profile.full_name ? profile.full_name.split(' ')[0] + ', p' : 'P'}rende los avisos `
    + 'y te llega una notificación al celular cuando de verdad importa.'));

  const lista = el('ul', { class: 'lista-reglas mt-4' });
  [
    'El día que juegas, para que no se te olvide.',
    'Cuando se libera un lugar y te toca a ti.',
    'Cuando tu pareja confirma, o cuando falta que confirmes tú.',
    'Cuando calificas a la Liguilla del mes.',
  ].forEach((t) => lista.appendChild(el('li', {}, t)));
  wrap.appendChild(lista);

  wrap.appendChild(el('p', { class: 'text-tiny mt-3', style: 'color:var(--text-tertiary);' },
    'Sin esto, los avisos solo se ven si abres la app por tu cuenta. '
    + 'Puedes apagarlos cuando quieras desde Perfil.'));

  const msg = el('p', { class: 'text-tiny mt-3' });

  const prender = el('button', { class: 'btn btn-primary mt-4' }, 'Prender los avisos');
  prender.addEventListener('click', async () => {
    prender.disabled = true;
    prender.textContent = 'Activando…';
    try {
      const push = await import('../push.js');
      const r = await push.activarAvisos();
      if (r.ok) {
        recordarQueDijoAhoraNo();   // ya no hay nada que ofrecer
        toast('Listo, ya te van a llegar al celular.', 'success');
        onDone();
        return;
      }
      msg.textContent = r.motivo;
      msg.style.color = 'var(--warning)';
    } catch (err) {
      msg.textContent = 'No se pudieron activar en este dispositivo.';
      msg.style.color = 'var(--warning)';
      console.error('No se pudieron activar los avisos:', err);
    }
    // Si no se pudo, no se deja atrapado: puede seguir a la app.
    prender.disabled = false;
    prender.textContent = 'Intentar otra vez';
  });
  wrap.appendChild(prender);
  wrap.appendChild(msg);

  const ahoraNo = el('button', { class: 'btn btn-ghost mt-2' }, 'Ahora no');
  ahoraNo.addEventListener('click', () => { recordarQueDijoAhoraNo(); onDone(); });
  wrap.appendChild(ahoraNo);

  return wrap;
}
