import { el, toast, humanizeError } from '../utils.js';
import { ponerPassword } from '../api.js';

/* ============================================================
   "Ponle contraseña a tu cuenta"
   ------------------------------------------------------------
   Al 19 de octubre de 2026 solo 18 de 112 jugadores tenían
   contraseña: todos los demás dependían del enlace por correo,
   que es justo lo que falla (no llega, cae en spam, y en iPhone
   siempre abre Safari en vez del icono de la app).

   La opción de ponerse contraseña ya existía, pero escondida
   hasta abajo de Perfil, donde casi nadie entra. Aquí se ofrece
   una sola vez al entrar, con salida: nadie queda atrapado.
   ============================================================ */
const CLAVE_POSPUESTO = 'pp_password_pospuesto';

export function yaLePreguntamosPorPassword() {
  try { return localStorage.getItem(CLAVE_POSPUESTO) === '1'; }
  catch { return true; }   // sin localStorage, mejor no insistir
}

function recordarQueDijoAhoraNo() {
  try { localStorage.setItem(CLAVE_POSPUESTO, '1'); } catch { /* da igual */ }
}

export function renderPonerPassword({ profile, onDone }) {
  const wrap = el('div', { class: 'stack', style: 'padding:28px 20px;max-width:440px;margin:0 auto;' });

  wrap.appendChild(el('div', { class: 'h1' }, 'Ponle una contraseña'));
  wrap.appendChild(el('p', { class: 'text-muted mt-2' },
    `Hola${profile && profile.full_name ? ' ' + profile.full_name.split(' ')[0] : ''}. `
    + 'Hoy entras con el enlace que te llega al correo. Si le pones una contraseña, '
    + 'entras directo desde el icono de la app y ya no dependes de que el correo llegue.'));
  wrap.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
    'En iPhone esto es lo que arregla que el enlace del correo siempre te abra Safari '
    + 'en vez del icono que guardaste en tu pantalla de inicio.'));

  const pass1 = el('input', { class: 'input mt-4', type: 'password',
    placeholder: 'Tu contraseña (mínimo 8 caracteres)', autocomplete: 'new-password' });
  const pass2 = el('input', { class: 'input mt-2', type: 'password',
    placeholder: 'Escríbela otra vez', autocomplete: 'new-password' });
  const msg = el('p', { class: 'text-tiny mt-2' });
  wrap.append(pass1, pass2, msg);

  const guardar = el('button', { class: 'btn btn-primary mt-3' }, 'Guardar y entrar');
  guardar.addEventListener('click', async () => {
    if ((pass1.value || '').length < 8) {
      msg.textContent = 'La contraseña necesita al menos 8 caracteres.';
      msg.style.color = 'var(--danger)'; return;
    }
    if (pass1.value !== pass2.value) {
      msg.textContent = 'Las dos contraseñas no son iguales.';
      msg.style.color = 'var(--danger)'; return;
    }
    guardar.disabled = true; guardar.textContent = 'Guardando…';
    try {
      await ponerPassword(pass1.value);
      try {
        const api = await import('../api.js');   // dinámico: aguanta un api.js viejo en caché
        if (typeof api.marcarPasswordPropia === 'function') await api.marcarPasswordPropia();
      } catch (e) { console.error('No se pudo marcar la contraseña como propia:', e); }
      recordarQueDijoAhoraNo();
      toast('Listo. La próxima vez entra con tu correo y tu contraseña.', 'success', 5000);
      onDone();
    } catch (err) {
      msg.textContent = humanizeError(err);
      msg.style.color = 'var(--danger)';
      guardar.disabled = false; guardar.textContent = 'Guardar y entrar';
    }
  });
  wrap.appendChild(guardar);

  wrap.appendChild(el('button', {
    class: 'btn btn-ghost mt-2',
    onclick: () => { recordarQueDijoAhoraNo(); onDone(); },
  }, 'Ahora no'));
  wrap.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);text-align:center;' },
    'Si dices que ahora no, la puedes poner cuando quieras desde Perfil → Contraseña.'));

  return wrap;
}
