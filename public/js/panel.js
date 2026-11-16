// Comportamiento común de las interfaces con sesión: muestra el usuario y cierra sesión.
(async function iniciarPanel() {
  const nombre = document.getElementById('usuario-nombre');
  const rol = document.getElementById('usuario-rol');
  const botonSalir = document.getElementById('boton-salir');

  try {
    const respuesta = await fetch('/api/sesion');
    if (respuesta.status === 401) {
      window.location.assign('/');
      return;
    }
    const { usuario } = await respuesta.json();
    nombre.textContent = `${usuario.nombre} ${usuario.apellido}`;
    rol.textContent = usuario.rol;
  } catch (error) {
    nombre.textContent = '';
  }

  botonSalir.addEventListener('click', async () => {
    botonSalir.disabled = true;
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.assign('/');
    }
  });
})();
