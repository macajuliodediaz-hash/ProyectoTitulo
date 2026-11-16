// Gestión de clientes (Administrador): nombre, logo y estado.
(function () {
  const { api, elemento, mostrarAviso } = window.ArgusNexus;
  const $ = (id) => document.getElementById(id);
  const aviso = $('aviso');

  let idEditando = null;
  let logoActual = false; // el cliente en edición ya tiene logo guardado
  let quitarLogo = false;
  let urlVista = null;

  function errorFormulario(texto) {
    $('error-formulario').textContent = texto;
    $('error-formulario').classList.toggle('visible', Boolean(texto));
  }

  function mostrarVistaLogo(src) {
    const caja = $('vista-logo');
    caja.replaceChildren();
    if (src) {
      const img = elemento('img');
      img.src = src;
      img.alt = 'Logo del cliente';
      caja.append(img);
    } else {
      caja.append(elemento('span', '', 'Sin logo'));
    }
    $('boton-quitar-logo').hidden = !src;
  }

  function cerrar() {
    $('panel-formulario').hidden = true;
    $('form-cliente').reset();
    errorFormulario('');
    idEditando = null;
    logoActual = false;
    quitarLogo = false;
    if (urlVista) URL.revokeObjectURL(urlVista);
    urlVista = null;
    $('boton-nuevo').disabled = false;
  }

  function abrir(cliente) {
    cerrar();
    idEditando = cliente ? cliente.id_cliente : null;
    logoActual = cliente ? Boolean(cliente.tiene_logo) : false;
    $('titulo-formulario').textContent = cliente ? `Editar cliente: ${cliente.nombre_cliente}` : 'Nuevo cliente';
    $('nombre').value = cliente ? cliente.nombre_cliente : '';
    mostrarVistaLogo(logoActual ? `/api/clientes/${idEditando}/logo?v=${Date.now()}` : null);
    $('panel-formulario').hidden = false;
    $('boton-nuevo').disabled = true;
    $('nombre').focus();
  }

  $('logo').addEventListener('change', () => {
    const archivo = $('logo').files[0];
    if (!archivo) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
      errorFormulario('El logo debe ser una imagen PNG, JPG o WEBP.');
      $('logo').value = '';
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      errorFormulario('El logo puede pesar como máximo 2 MB.');
      $('logo').value = '';
      return;
    }
    errorFormulario('');
    quitarLogo = false;
    if (urlVista) URL.revokeObjectURL(urlVista);
    urlVista = URL.createObjectURL(archivo);
    mostrarVistaLogo(urlVista);
  });

  $('boton-quitar-logo').addEventListener('click', () => {
    $('logo').value = '';
    quitarLogo = logoActual;
    mostrarVistaLogo(null);
  });

  $('form-cliente').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!$('form-cliente').checkValidity()) {
      $('form-cliente').reportValidity();
      return;
    }
    const datos = new FormData();
    datos.append('nombre', $('nombre').value);
    if ($('logo').files[0]) datos.append('logo', $('logo').files[0]);
    if (quitarLogo) datos.append('quitarLogo', 'true');

    $('boton-guardar').disabled = true;
    try {
      const respuesta = idEditando
        ? await api(`/api/clientes/${idEditando}`, { method: 'PUT', body: datos })
        : await api('/api/clientes', { method: 'POST', body: datos });
      cerrar();
      mostrarAviso(aviso, respuesta.mensaje);
      await cargar();
    } catch (error) {
      errorFormulario(error.message);
    } finally {
      $('boton-guardar').disabled = false;
    }
  });

  async function cambiarEstado(cliente, activo) {
    if (!activo && !window.confirm(`¿Desactivar "${cliente.nombre_cliente}"? No aparecerá para nuevas plantillas ni documentos; lo existente se conserva.`)) return;
    try {
      const respuesta = await api(`/api/clientes/${cliente.id_cliente}/estado`, { method: 'PATCH', body: JSON.stringify({ activo }) });
      mostrarAviso(aviso, respuesta.mensaje);
      await cargar();
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
    }
  }

  async function cargar() {
    const { clientes } = await api('/api/clientes?todos=1');
    const cuerpo = $('cuerpo-tabla');
    cuerpo.replaceChildren();
    for (const c of clientes) {
      const fila = elemento('tr');
      if (!c.activo) fila.classList.add('fila-inactiva');

      const celdaLogo = elemento('td');
      if (c.tiene_logo) {
        const img = elemento('img', 'logo-tabla');
        img.src = `/api/clientes/${c.id_cliente}/logo?v=${Date.now()}`;
        img.alt = `Logo de ${c.nombre_cliente}`;
        celdaLogo.append(img);
      } else {
        celdaLogo.append(elemento('span', 'texto-secundario', 'Sin logo'));
      }

      const celdaEstado = elemento('td');
      celdaEstado.append(elemento('span', `insignia ${c.activo ? 'insignia-ok' : 'insignia-inactiva'}`, c.activo ? 'Activo' : 'Inactivo'));

      const acciones = elemento('td', 'celda-acciones');
      const editar = elemento('button', 'boton-enlace', 'Editar');
      editar.type = 'button';
      editar.addEventListener('click', () => abrir(c));
      const estado = elemento('button', `boton-enlace ${c.activo ? 'peligro' : ''}`, c.activo ? 'Desactivar' : 'Reactivar');
      estado.type = 'button';
      estado.addEventListener('click', () => cambiarEstado(c, !c.activo));
      acciones.append(editar, estado);

      fila.append(celdaLogo, elemento('td', 'celda-principal', c.nombre_cliente), elemento('td', '', String(c.total_plantillas)), celdaEstado, acciones);
      cuerpo.append(fila);
    }
    $('tabla-vacia').hidden = clientes.length > 0;
  }

  $('boton-nuevo').addEventListener('click', () => abrir(null));
  $('boton-cancelar').addEventListener('click', cerrar);
  cargar().catch((error) => mostrarAviso(aviso, error.message, 'error'));
})();
