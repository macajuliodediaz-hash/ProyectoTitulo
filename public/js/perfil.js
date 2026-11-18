// Mi perfil: datos personales y cambio de contraseña (ambos perfiles).
(function () {
  const { api, formatoFecha, mostrarAviso } = window.ArgusNexus;
  const $ = (id) => document.getElementById(id);
  const aviso = $('aviso');

  function error(contenedor, texto) {
    $(contenedor).textContent = texto;
    $(contenedor).classList.toggle('visible', Boolean(texto));
  }

  async function cargar() {
    const { perfil } = await api('/api/perfil');
    $('nombre').value = perfil.nombre;
    $('apellido').value = perfil.apellido;
    $('correo').textContent = perfil.correo;
    $('rol').textContent = perfil.rol;
    $('creada').textContent = formatoFecha(perfil.fechaCreacion, false);
  }

  $('form-datos').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error('error-datos', '');
    if (!$('form-datos').checkValidity()) {
      $('form-datos').reportValidity();
      return;
    }
    $('boton-datos').disabled = true;
    try {
      const respuesta = await api('/api/perfil', {
        method: 'PUT',
        body: JSON.stringify({ nombre: $('nombre').value, apellido: $('apellido').value }),
      });
      mostrarAviso(aviso, respuesta.mensaje);
      $('usuario-nombre').textContent = `${$('nombre').value.trim()} ${$('apellido').value.trim()}`;
    } catch (e) {
      error('error-datos', e.message);
    } finally {
      $('boton-datos').disabled = false;
    }
  });

  $('form-clave').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error('error-clave', '');
    if (!$('form-clave').checkValidity()) {
      $('form-clave').reportValidity();
      return;
    }
    if ($('clave-nueva').value !== $('clave-confirmacion').value) {
      error('error-clave', 'La confirmación no coincide con la nueva contraseña.');
      return;
    }
    $('boton-clave').disabled = true;
    try {
      const respuesta = await api('/api/perfil/clave', {
        method: 'POST',
        body: JSON.stringify({ claveActual: $('clave-actual').value, claveNueva: $('clave-nueva').value }),
      });
      $('form-clave').reset();
      mostrarAviso(aviso, respuesta.mensaje);
    } catch (e) {
      error('error-clave', e.message);
    } finally {
      $('boton-clave').disabled = false;
    }
  });

  cargar().catch((e) => mostrarAviso(aviso, e.message, 'error'));
})();
