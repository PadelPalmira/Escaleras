import { el, toast, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import { sendMagicLink } from '../api.js';

export function renderLoginScreen() {
  const wrap = el('div', { class: 'login-screen' });

  const logo = el('div', { class: 'login-logo' }, [el('img', { src: 'assets/img/logo-icon-white.png', alt: 'Padel Palmira', class: 'login-logo-img' })]);
  const title = el('div', { class: 'h1' }, ['Escaleras', el('br'), el('span', { class: 'text-gradient' }, 'Padel Palmira')]);
  const sub = el('p', { class: 'text-muted' }, 'Regístrate o entra con tu correo — te mandamos un enlace mágico, sin contraseñas.');

  const nameField = el('div', { class: 'field' }, [
    el('label', {}, 'Nombre completo'),
    el('input', { class: 'input', type: 'text', placeholder: 'Como te identificamos en el club', autocomplete: 'name', id: 'login-name' }),
  ]);
  const emailField = el('div', { class: 'field' }, [
    el('label', {}, 'Correo electrónico'),
    el('input', { class: 'input', type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', id: 'login-email' }),
  ]);
  const phoneField = el('div', { class: 'field' }, [
    el('label', {}, 'Celular'),
    el('input', { class: 'input', type: 'tel', placeholder: '10 dígitos', autocomplete: 'tel', id: 'login-phone' }),
  ]);
  const helpNote = el('p', { class: 'text-tiny text-muted mt-1' }, 'Nombre, correo y celular son obligatorios — así el club siempre sabe quién se registró y cómo contactarte.');

  const btn = el('button', { class: 'btn btn-primary' }, 'Enviar enlace mágico');
  const status = el('div', { class: 'text-tiny mt-3' });

  btn.addEventListener('click', async () => {
    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const phoneInput = document.getElementById('login-phone');
    const full_name = (nameInput.value || '').trim();
    const email = (emailInput.value || '').trim();
    const phoneDigits = (phoneInput.value || '').replace(/\D/g, '');

    if (!full_name) {
      status.textContent = 'Escribe tu nombre completo.';
      status.style.color = 'var(--danger)';
      nameInput.focus();
      return;
    }
    if (!email || !email.includes('@')) {
      status.textContent = 'Escribe un correo válido.';
      status.style.color = 'var(--danger)';
      emailInput.focus();
      return;
    }
    if (phoneDigits.length !== 10) {
      status.textContent = 'Escribe tu celular a 10 dígitos.';
      status.style.color = 'var(--danger)';
      phoneInput.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    status.textContent = '';
    try {
      await sendMagicLink(email, { full_name, phone: phoneDigits });
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

  [nameField, emailField, phoneField].forEach((field) => {
    field.querySelector('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  });

  wrap.append(logo, title, sub, nameField, emailField, phoneField, helpNote, btn, status);
  return wrap;
}
