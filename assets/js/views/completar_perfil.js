import { el, toast, humanizeError } from '../utils.js';
import { updateMyProfile } from '../api.js';

/**
 * Pantalla obligatoria que bloquea el resto de la app hasta que el perfil
 * tenga nombre completo y celular (el correo ya viene de la cuenta). Se
 * muestra tanto a cuentas nuevas (por si el enlace mágico se generó sin
 * metadata, p.ej. reenviado desde otro flujo) como a cuentas que ya
 * existían de antes de que estos campos fueran obligatorios.
 */
export function renderCompletarPerfil(profile, onDone) {
  const wrap = el('div', { class: 'login-screen' });

  const logo = el('div', { class: 'login-logo' }, [el('img', { src: 'assets/img/logo-icon-white.png', alt: 'Padel Palmira', class: 'login-logo-img' })]);
  const title = el('div', { class: 'h1' }, 'Completa tu perfil');
  const sub = el('p', { class: 'text-muted' }, 'Nos falta tu nombre completo y tu celular para terminar tu registro en el club — son obligatorios.');

  const nameInput = el('input', { class: 'input', type: 'text', value: profile.full_name || '', placeholder: 'Como te identificamos en el club', autocomplete: 'name', id: 'onb-name' });
  const emailField = el('div', { class: 'field' }, [
    el('label', {}, 'Correo electrónico'),
    el('input', { class: 'input', type: 'email', value: profile.email || '', disabled: true }),
  ]);
  const nameField = el('div', { class: 'field' }, [el('label', {}, 'Nombre completo'), nameInput]);
  const phoneInput = el('input', { class: 'input', type: 'tel', value: profile.phone || '', placeholder: '10 dígitos', autocomplete: 'tel', id: 'onb-phone' });
  const phoneField = el('div', { class: 'field' }, [el('label', {}, 'Celular'), phoneInput]);

  const btn = el('button', { class: 'btn btn-primary' }, 'Guardar y continuar');
  const status = el('div', { class: 'text-tiny mt-3' });

  btn.addEventListener('click', async () => {
    const full_name = (nameInput.value || '').trim();
    const phoneDigits = (phoneInput.value || '').replace(/\D/g, '');

    if (!full_name) {
      status.textContent = 'Escribe tu nombre completo.';
      status.style.color = 'var(--danger)';
      nameInput.focus();
      return;
    }
    if (phoneDigits.length !== 10) {
      status.textContent = 'Escribe tu celular a 10 dígitos.';
      status.style.color = 'var(--danger)';
      phoneInput.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    status.textContent = '';
    try {
      const updated = await updateMyProfile({ full_name, phone: phoneDigits });
      toast('Perfil completado.', 'success');
      onDone(updated);
    } catch (err) {
      status.textContent = humanizeError(err);
      status.style.color = 'var(--danger)';
      btn.disabled = false;
      btn.textContent = 'Guardar y continuar';
    }
  });

  [nameField, phoneField].forEach((field) => {
    field.querySelector('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  });

  wrap.append(logo, title, sub, nameField, emailField, phoneField, btn, status);
  return wrap;
}
