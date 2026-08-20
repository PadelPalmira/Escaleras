import { el, toast, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import { sendMagicLink } from '../api.js';

export function renderLoginScreen() {
  const wrap = el('div', { class: 'login-screen' });

  const logo = el('div', { class: 'login-logo' }, '🎾');
  const title = el('div', { class: 'h1' }, ['Escaleras', el('br'), el('span', { class: 'text-gradient' }, 'Padel Palmira')]);
  const sub = el('p', { class: 'text-muted' }, 'Entra con tu correo — te mandamos un enlace mágico, sin contraseñas.');

  const emailField = el('div', { class: 'field' }, [
    el('label', {}, 'Correo electrónico'),
    el('input', { class: 'input', type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', id: 'login-email' }),
  ]);

  const btn = el('button', { class: 'btn btn-primary' }, 'Enviar enlace mágico');
  const status = el('div', { class: 'text-tiny mt-3' });

  btn.addEventListener('click', async () => {
    const input = document.getElementById('login-email');
    const email = (input.value || '').trim();
    if (!email || !email.includes('@')) {
      status.textContent = 'Escribe un correo válido.';
      status.style.color = 'var(--danger)';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    status.textContent = '';
    try {
      await sendMagicLink(email);
      wrap.replaceChildren(
        logo,
        el('div', { class: 'h1 mb-2' }, 'Revisa tu correo'),
        el('p', { class: 'text-muted' }, [
          'Te enviamos un enlace a ',
          el('strong', {}, email),
          '. Ábrelo desde este mismo dispositivo para entrar.',
        ]),
        el('div', { class: 'card mt-6', style: 'display:flex;gap:12px;align-items:flex-start;' }, [
          el('div', { html: icon.mail, style: 'width:20px;height:20px;color:var(--cyan);flex-shrink:0;margin-top:2px;' }),
          el('p', { class: 'text-tiny' }, 'Si no lo ves en unos minutos, revisa spam o promociones.'),
        ])
      );
    } catch (err) {
      status.textContent = humanizeError(err);
      status.style.color = 'var(--danger)';
      toast('No se pudo enviar el enlace.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar enlace mágico';
    }
  });

  emailField.querySelector('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });

  wrap.append(logo, title, sub, emailField, btn, status);
  return wrap;
}
