import { el, toast, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import { sendMagicLink, entrarConPassword, registrarseConPassword, mandarResetPassword } from '../api.js';
import { whatsappHelpUrl } from '../config.js';

/**
 * Pantalla de entrada.
 *
 * Desde el 2.1 hay dos caminos, y el de contraseña es el principal:
 *
 * En iPhone, el enlace mágico SIEMPRE abre Safari — así funciona iOS con los
 * links del correo. Si el jugador guardó la app en su pantalla de inicio, la
 * sesión se queda viva en Safari y el icono sigue pidiendo entrar, una y otra
 * vez. Es exactamente lo que le pasó a varios la primera semana. Con correo y
 * contraseña nunca se sale de la app, así que el problema desaparece.
 *
 * El enlace mágico se queda como alternativa (para quien no quiere inventar
 * otra contraseña) y como salida de emergencia si alguien la olvida.
 *
 * Como antes, no hay un "regístrate" separado: el mismo formulario sirve para
 * entrar y para crear la cuenta. Nombre y celular NO se piden aquí — se piden
 * una sola vez, ya adentro, en "Completa tu perfil".
 */
export function renderLoginScreen() {
  const wrap = el('div', { class: 'login-screen' });

  const logo = el('div', { class: 'login-logo' }, [el('img', { src: 'assets/img/logo-icon-white.png', alt: 'Padel Palmira', class: 'login-logo-img' })]);
  const title = el('div', { class: 'h1' }, ['Escaleras', el('br'), el('span', { class: 'text-gradient' }, 'Padel Palmira')]);

  const helpLink = el('a', {
    class: 'login-help-link', href: whatsappHelpUrl('Hola, tengo una duda para entrar a la app de Escaleras Palmira 🎾'),
    target: '_blank', rel: 'noopener',
  }, [el('span', { html: icon.whatsapp }), '¿Problemas para entrar? Escríbenos']);

  const cuerpo = el('div');
  wrap.append(logo, title, cuerpo, helpLink);

  const emailGuardado = { valor: '' };

  /* ---------------- Entrar / crear cuenta con contraseña ---------------- */
  function pintarPassword({ modoRegistro = false } = {}) {
    cuerpo.innerHTML = '';

    const sub = el('p', { class: 'text-muted' }, modoRegistro
      ? 'Crea tu cuenta con una contraseña. Así entras directo desde el icono de tu celular, sin tener que ir al correo cada vez.'
      : 'Entra con tu correo y tu contraseña.');

    const emailInput = el('input', { class: 'input', type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', value: emailGuardado.valor });
    const emailField = el('div', { class: 'field' }, [el('label', {}, 'Correo electrónico'), emailInput]);

    const passInput = el('input', {
      class: 'input', type: 'password', placeholder: modoRegistro ? 'Mínimo 8 caracteres' : 'Tu contraseña',
      autocomplete: modoRegistro ? 'new-password' : 'current-password',
    });
    const verPass = el('button', { class: 'btn btn-ghost btn-sm', style: 'width:auto;padding:0;margin-top:6px;font-size:12.5px;' }, 'Ver contraseña');
    verPass.addEventListener('click', () => {
      passInput.type = passInput.type === 'password' ? 'text' : 'password';
      verPass.textContent = passInput.type === 'password' ? 'Ver contraseña' : 'Ocultar contraseña';
    });
    const passField = el('div', { class: 'field' }, [el('label', {}, 'Contraseña'), passInput, verPass]);

    const btn = el('button', { class: 'btn btn-primary' }, modoRegistro ? 'Crear mi cuenta' : 'Entrar');
    const status = el('div', { class: 'text-tiny mt-3' });

    const fallo = (msg, foco) => {
      status.textContent = msg;
      status.style.color = 'var(--danger)';
      if (foco) foco.focus();
    };

    btn.addEventListener('click', async () => {
      const email = (emailInput.value || '').trim();
      const pass = passInput.value || '';
      emailGuardado.valor = email;
      if (!email || !email.includes('@')) return fallo('Escribe un correo válido.', emailInput);
      if (modoRegistro && pass.length < 8) return fallo('La contraseña necesita al menos 8 caracteres.', passInput);
      if (!pass) return fallo('Escribe tu contraseña.', passInput);

      btn.disabled = true;
      btn.textContent = modoRegistro ? 'Creando…' : 'Entrando…';
      status.textContent = '';
      try {
        if (modoRegistro) {
          const { sesion } = await registrarseConPassword(email, pass);
          if (!sesion) {
            // El proyecto pide confirmar el correo antes de dejar entrar.
            cuerpo.innerHTML = '';
            cuerpo.append(
              el('div', { class: 'h1 mb-2' }, 'Confirma tu correo'),
              el('p', { class: 'text-muted' }, [
                'Te mandamos un correo a ', el('strong', {}, email),
                '. Ábrelo una sola vez para confirmar tu cuenta y ya podrás entrar aquí con tu contraseña, siempre.',
              ]),
              el('button', { class: 'btn btn-secondary mt-4', onclick: () => pintarPassword({ modoRegistro: false }) }, 'Ya confirmé — entrar'),
            );
            return;
          }
          toast('¡Cuenta creada!', 'success');
        } else {
          await entrarConPassword(email, pass);
        }
        // El cambio de sesión lo detecta app.js y pinta la app sola.
      } catch (err) {
        const msg = String((err && err.message) || '');
        if (/Invalid login credentials/i.test(msg)) {
          fallo('Ese correo y contraseña no coinciden. Si nunca le pusiste contraseña a tu cuenta, entra con el enlace mágico y ponle una desde tu Perfil.');
        } else if (/User already registered/i.test(msg)) {
          fallo('Ese correo ya tiene cuenta. Entra con tu contraseña, o usa "Olvidé mi contraseña" si no la recuerdas.');
        } else if (/Email not confirmed/i.test(msg)) {
          fallo('Todavía no confirmas tu correo. Busca el correo que te mandamos y ábrelo una vez.');
        } else {
          fallo(humanizeError(err));
        }
        btn.disabled = false;
        btn.textContent = modoRegistro ? 'Crear mi cuenta' : 'Entrar';
      }
    });

    [emailInput, passInput].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); }));

    const alterna = modoRegistro
      ? el('button', { class: 'btn btn-secondary mt-2', onclick: () => pintarPassword({ modoRegistro: false }) }, 'Ya tengo cuenta — entrar')
      : el('button', { class: 'btn btn-secondary mt-2', onclick: () => pintarPassword({ modoRegistro: true }) }, 'Soy nuevo — crear mi cuenta');

    const olvide = el('button', {
      class: 'btn btn-ghost btn-sm mt-2', style: 'font-size:13px;',
      onclick: () => pintarOlvide(emailInput.value),
    }, 'Olvidé mi contraseña');

    const magico = el('button', {
      class: 'btn btn-ghost btn-sm', style: 'font-size:13px;',
      onclick: () => pintarMagico(),
    }, 'Prefiero entrar con un enlace por correo');

    cuerpo.append(sub, emailField, passField, btn, status, alterna, olvide,
      el('hr', { class: 'sep', style: 'margin:18px 0 10px;' }), magico);
  }

  /* ---------------- Olvidé mi contraseña ---------------- */
  function pintarOlvide(emailPrevio) {
    cuerpo.innerHTML = '';
    const emailInput = el('input', { class: 'input', type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', value: (emailPrevio || '').trim() });
    const btn = el('button', { class: 'btn btn-primary' }, 'Mandarme el correo');
    const status = el('div', { class: 'text-tiny mt-3' });

    btn.addEventListener('click', async () => {
      const email = (emailInput.value || '').trim();
      if (!email || !email.includes('@')) {
        status.textContent = 'Escribe un correo válido.';
        status.style.color = 'var(--danger)';
        return;
      }
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        await mandarResetPassword(email);
        cuerpo.innerHTML = '';
        cuerpo.append(
          el('div', { class: 'h1 mb-2' }, 'Revisa tu correo'),
          el('p', { class: 'text-muted' }, [
            'Te mandamos un enlace a ', el('strong', {}, email),
            ' para poner una contraseña nueva. Al abrirlo se te va a abrir el navegador: ahí escribes tu contraseña nueva, y ya después entras con ella desde el icono de la app.',
          ]),
          el('button', { class: 'btn btn-secondary mt-4', onclick: () => pintarPassword({ modoRegistro: false }) }, '← Volver'),
        );
      } catch (err) {
        status.textContent = humanizeError(err);
        status.style.color = 'var(--danger)';
        btn.disabled = false; btn.textContent = 'Mandarme el correo';
      }
    });
    emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });

    cuerpo.append(
      el('div', { class: 'h2 mb-2' }, 'Olvidé mi contraseña'),
      el('p', { class: 'text-muted' }, 'Te mandamos un enlace para ponerle una nueva.'),
      el('div', { class: 'field' }, [el('label', {}, 'Correo electrónico'), emailInput]),
      btn, status,
      el('button', { class: 'btn btn-ghost btn-sm mt-3', onclick: () => pintarPassword({ modoRegistro: false }) }, '← Volver'),
    );
  }

  /* ---------------- Enlace mágico (como siempre) ---------------- */
  function pintarMagico() {
    cuerpo.innerHTML = '';
    const sub = el('p', { class: 'text-muted' }, 'Te mandamos un enlace a tu correo, sin contraseñas. Si es tu primera vez, tu cuenta se crea sola.');
    const emailInput = el('input', { class: 'input', type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', value: emailGuardado.valor });
    const emailField = el('div', { class: 'field' }, [el('label', {}, 'Correo electrónico'), emailInput]);
    const btn = el('button', { class: 'btn btn-primary' }, 'Enviar enlace mágico');
    const status = el('div', { class: 'text-tiny mt-3' });

    const aviso = el('div', { class: 'card mt-3', style: 'display:flex;gap:10px;align-items:flex-start;background:var(--surface-2);' }, [
      el('div', { html: icon.info || icon.mail, style: 'width:18px;height:18px;color:var(--warning);flex-shrink:0;margin-top:2px;' }),
      el('p', { class: 'text-tiny' }, '¿Guardaste la app en la pantalla de inicio de tu iPhone? El enlace del correo siempre se abre en Safari, no en el icono. Para entrar desde el icono, mejor usa contraseña.'),
    ]);

    btn.addEventListener('click', async () => {
      const email = (emailInput.value || '').trim();
      emailGuardado.valor = email;
      if (!email || !email.includes('@')) {
        status.textContent = 'Escribe un correo válido.';
        status.style.color = 'var(--danger)';
        emailInput.focus();
        return;
      }
      btn.disabled = true; btn.textContent = 'Enviando…'; status.textContent = '';
      try {
        await sendMagicLink(email);
        cuerpo.innerHTML = '';
        cuerpo.append(
          el('div', { class: 'h1 mb-2' }, 'Revisa tu correo'),
          el('p', { class: 'text-muted' }, ['Te enviamos un enlace a ', el('strong', {}, email), '. Ábrelo desde este mismo dispositivo para entrar.']),
          el('div', { class: 'card mt-6', style: 'display:flex;gap:12px;align-items:flex-start;' }, [
            el('div', { html: icon.mail, style: 'width:20px;height:20px;color:var(--cyan);flex-shrink:0;margin-top:2px;' }),
            el('p', { class: 'text-tiny' }, 'Si no lo ves en unos minutos, revisa spam o promociones.'),
          ]),
          el('button', { class: 'btn btn-ghost btn-sm mt-4', onclick: () => pintarPassword({ modoRegistro: false }) }, '← Entrar con contraseña'),
        );
      } catch (err) {
        status.textContent = humanizeError(err);
        status.style.color = 'var(--danger)';
        toast('No se pudo enviar el enlace.', 'error');
        btn.disabled = false; btn.textContent = 'Enviar enlace mágico';
      }
    });
    emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });

    cuerpo.append(sub, emailField, btn, status, aviso,
      el('button', { class: 'btn btn-ghost btn-sm mt-3', onclick: () => pintarPassword({ modoRegistro: false }) }, '← Entrar con contraseña'));
  }

  pintarPassword({ modoRegistro: false });
  return wrap;
}

/**
 * Pantalla de "pon tu contraseña nueva". Se muestra cuando el jugador abre
 * el enlace de "olvidé mi contraseña": Supabase deja la sesión abierta en
 * modo recuperación y lo único que falta es que escriba la nueva.
 */
export function renderNuevaPassword(onListo) {
  const wrap = el('div', { class: 'login-screen' });
  const logo = el('div', { class: 'login-logo' }, [el('img', { src: 'assets/img/logo-icon-white.png', alt: 'Padel Palmira', class: 'login-logo-img' })]);
  const pass1 = el('input', { class: 'input', type: 'password', placeholder: 'Mínimo 8 caracteres', autocomplete: 'new-password' });
  const pass2 = el('input', { class: 'input', type: 'password', placeholder: 'Escríbela otra vez', autocomplete: 'new-password' });
  const btn = el('button', { class: 'btn btn-primary' }, 'Guardar contraseña');
  const status = el('div', { class: 'text-tiny mt-3' });

  btn.addEventListener('click', async () => {
    if ((pass1.value || '').length < 8) {
      status.textContent = 'La contraseña necesita al menos 8 caracteres.';
      status.style.color = 'var(--danger)';
      return;
    }
    if (pass1.value !== pass2.value) {
      status.textContent = 'Las dos contraseñas no son iguales.';
      status.style.color = 'var(--danger)';
      return;
    }
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const { ponerPassword } = await import('../api.js');
      await ponerPassword(pass1.value);
      toast('Contraseña guardada. Ya puedes entrar con ella desde el icono de tu celular.', 'success', 6000);
      onListo();
    } catch (err) {
      status.textContent = humanizeError(err);
      status.style.color = 'var(--danger)';
      btn.disabled = false; btn.textContent = 'Guardar contraseña';
    }
  });

  wrap.append(
    logo,
    el('div', { class: 'h1 mb-2' }, 'Pon tu contraseña nueva'),
    el('p', { class: 'text-muted' }, 'Con esta contraseña vas a poder entrar directo desde el icono de la app, sin pasar por el correo.'),
    el('div', { class: 'field' }, [el('label', {}, 'Contraseña nueva'), pass1]),
    el('div', { class: 'field' }, [el('label', {}, 'Confírmala'), pass2]),
    btn, status,
  );
  return wrap;
}
