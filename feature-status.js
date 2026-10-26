/** Open localized feature warnings; delegation also covers Mintlify page navigation. */
document.addEventListener('click', event => {
  const selector = 'button[data-feature-status="experimental"]';
  const trigger = event.target.closest(selector);
  if (!trigger) return;
  const triggerIndex = [...document.querySelectorAll(selector)].indexOf(trigger);

  const warning = trigger.lang === 'es' ? {
    title: 'Característica experimental',
    message: 'Esta característica está en desarrollo activo y puede presentar limitaciones o un comportamiento inesperado. Su funcionamiento y configuración pueden cambiar entre versiones. Pruébala en tu entorno antes de depender de ella en producción.',
    close: 'Entendido',
  } : {
    title: 'Experimental feature',
    message: 'This feature is under active development and may have limitations or unexpected behavior. Its behavior and configuration may change between releases. Test it in your environment before relying on it in production.',
    close: 'Got it',
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'feature-status-dialog';
  dialog.setAttribute('aria-label', warning.title);
  const title = document.createElement('h2');
  title.textContent = warning.title;
  const message = document.createElement('p');
  message.textContent = warning.message;
  message.id = 'feature-status-message';
  dialog.setAttribute('aria-describedby', message.id);
  const form = document.createElement('form');
  form.method = 'dialog';
  const close = document.createElement('button');
  close.type = 'submit';
  close.textContent = warning.close;
  close.autofocus = true;
  form.append(close);
  dialog.append(title, message, form);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    // Mintlify can replace server-rendered badges while the page hydrates.
    const returnTarget = trigger.isConnected ? trigger : document.querySelectorAll(selector)[triggerIndex];
    returnTarget?.focus();
  }, { once: true });
  dialog.addEventListener('click', click => {
    if (click.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (click.clientX < bounds.left || click.clientX > bounds.right
      || click.clientY < bounds.top || click.clientY > bounds.bottom) dialog.close();
  });
  // Native modal supplies focus trapping, Escape dismissal and an inert background.
  dialog.showModal();
});
