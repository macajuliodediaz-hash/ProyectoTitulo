// Gestión de cuentas de usuario (Administrador).
(function () {
  const { api, elemento, formatoFecha, mostrarAviso, sesion } = window.ArgusNexus;
  const $ = (id) => document.getElementById(id);
  const aviso = $('aviso');
  let idEditando = null;
  let idClave = null;

  function error(contenedor, texto) {
    $(contenedor).textContent = texto;
    $(contenedor).classList.toggle('visible', Boolean(texto));
  }

  function cerrarFormularios() {
    $('panel-formulario').hidden = true;
    $('panel-clave').hidden = true;
    $('form-usuario').reset();
    $('form-clave').reset();
    error('error-formulario', '');
    error('error-clave', '');
    idEditando = null;
    idClave = null;
    $('boton-nuevo').disabled = false;
  }

  function abrirCuenta(usuario) {
    cerrarFormularios();
    idEditando = usuario ? usuario.id : null;
    $('titulo-formulario').textContent = usuario ? `Editar cuenta: ${usuario.nombre} ${usuario.apellido}` : 'Nueva cuenta';
    $('nombre').value = usuario ? usuario.nombre : '';
    $('apellido').value = usuario ? usuario.apellido : '';
    $('correo').value = usuario ? usuario.correo : '';
    $('rol').value = usuario ? usuario.rol : 'Equipo';
    $('campo-clave').hidden = Boolean(usuario); // la contraseña se cambia con "Restablecer contraseña"
    $('clave').required = !usuario;
    $('panel-formulario').hidden = false;
    $('boton-nuevo').disabled = true;
    $('nombre').focus();
  }

  function abrirClave(usuario) {
    cerrarFormularios();
    idClave = usuario.id;
    $('titulo-clave').textContent = `Restablecer contraseña de ${usuario.nombre} ${usuario.apellido}`;
    $('panel-clave').hidden = false;
    $('nueva-clave').focus();
  }

  $('form-usuario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!$('form-usuario').checkValidity()) {
      $('form-usuario').reportValidity();
      return;
    }
    const datos = {
      nombre: $('nombre').value,
      apellido: $('apellido').value,
      correo: $('correo').value,
      rol: $('rol').value,
    };
    if (!idEditando) datos.clave = $('clave').value;
    $('boton-guardar').disabled = true;
    try {
      const respuesta = idEditando
        ? await api(`/api/usuarios/${idEditando}`, { method: 'PUT', body: JSON.stringify(datos) })
        : await api('/api/usuarios', { method: 'POST', body: JSON.stringify(datos) });
      cerrarFormularios();
      mostrarAviso(aviso, respuesta.mensaje);
      await cargar();
    } catch (e) {
      error('error-formulario', e.message);
    } finally {
      $('boton-guardar').disabled = false;
    }
  });

  $('form-clave').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!$('form-clave').checkValidity()) {
      $('form-clave').reportValidity();
      return;
    }
    $('boton-guardar-clave').disabled = true;
    try {
      const respuesta = await api(`/api/usuarios/${idClave}/clave`, { method: 'POST', body: JSON.stringify({ clave: $('nueva-clave').value }) });
      cerrarFormularios();
      mostrarAviso(aviso, respuesta.mensaje);
    } catch (e) {
      error('error-clave', e.message);
    } finally {
      $('boton-guardar-clave').disabled = false;
    }
  });

  async function cambiarEstado(usuario) {
    const activar = !usuario.activo;
    if (!activar && !window.confirm(`¿Desactivar la cuenta de ${usuario.nombre} ${usuario.apellido}? No podrá ingresar al sistema; sus documentos se conservan.`)) return;
    try {
      const respuesta = await api(`/api/usuarios/${usuario.id}/estado`, { method: 'PATCH', body: JSON.stringify({ activo: activar }) });
      mostrarAviso(aviso, respuesta.mensaje);
      await cargar();
    } catch (e) {
      mostrarAviso(aviso, e.message, 'error');
    }
  }

  async function cargar() {
    const [{ usuarios }, yo] = await Promise.all([api('/api/usuarios'), sesion]);
    const cuerpo = $('cuerpo-tabla');
    cuerpo.replaceChildren();
    for (const u of usuarios) {
      const fila = elemento('tr');
      if (!u.activo) fila.classList.add('fila-inactiva');
      const esYo = u.id === yo.id;

      const celdaNombre = elemento('td', 'celda-principal', `${u.nombre} ${u.apellido}`);
      if (esYo) celdaNombre.append(elemento('span', 'texto-secundario', 'Tu cuenta'));

      const celdaRol = elemento('td');
      celdaRol.append(elemento('span', `insignia ${u.rol === 'Administrador' ? 'insignia-revision' : 'insignia-borrador'}`, u.rol));
      const celdaEstado = elemento('td');
      celdaEstado.append(elemento('span', `insignia ${u.activo ? 'insignia-ok' : 'insignia-inactiva'}`, u.activo ? 'Activa' : 'Desactivada'));

      const acciones = elemento('td', 'celda-acciones');
      const editar = elemento('button', 'boton-enlace', 'Editar');
      editar.type = 'button';
      editar.addEventListener('click', () => abrirCuenta(u));
      const clave = elemento('button', 'boton-enlace', 'Restablecer contraseña');
      clave.type = 'button';
      clave.addEventListener('click', () => abrirClave(u));
      acciones.append(editar, clave);
      if (!esYo) {
        const estado = elemento('button', `boton-enlace ${u.activo ? 'peligro' : ''}`, u.activo ? 'Desactivar' : 'Reactivar');
        estado.type = 'button';
        estado.addEventListener('click', () => cambiarEstado(u));
        acciones.append(estado);
      }

      fila.append(celdaNombre, elemento('td', '', u.correo), celdaRol, celdaEstado, elemento('td', '', u.ultimoAcceso ? formatoFecha(u.ultimoAcceso) : 'Nunca'), acciones);
      cuerpo.append(fila);
    }
  }

  $('boton-nuevo').addEventListener('click', () => abrirCuenta(null));
  $('boton-cancelar').addEventListener('click', cerrarFormularios);
  $('boton-cancelar-clave').addEventListener('click', cerrarFormularios);
  cargar().catch((e) => mostrarAviso(aviso, e.message, 'error'));
})();
