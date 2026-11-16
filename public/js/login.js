// Envía el formulario de ingreso al servidor y redirige según el rol.
const formulario = document.getElementById('form-login');
const cajaError = document.getElementById('mensaje-error');
const boton = formulario.querySelector('button[type="submit"]');

function mostrarError(texto) {
  cajaError.textContent = texto;
  cajaError.classList.add('visible');
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  cajaError.classList.remove('visible');

  if (!formulario.checkValidity()) {
    formulario.reportValidity();
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Ingresando…';

  try {
    const respuesta = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correo: formulario.correo.value,
        clave: formulario.clave.value,
      }),
    });
    const datos = await respuesta.json();

    if (respuesta.ok && datos.redirigir) {
      window.location.assign(datos.redirigir);
      return;
    }
    mostrarError(datos.error || 'No fue posible iniciar sesión.');
    formulario.clave.value = '';
    formulario.clave.focus();
  } catch (error) {
    mostrarError('No hay conexión con el servidor. Intenta nuevamente.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Ingresar';
  }
});
