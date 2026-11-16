// Gestión de plantillas (Administrador): listar, crear, editar, dar de baja y eliminar.
(function () {
  const $ = (id) => document.getElementById(id);

  const panelFormulario = $('panel-formulario');
  const formulario = $('form-plantilla');
  const listaSecciones = $('lista-secciones');
  const moldeSeccion = $('plantilla-fila-seccion');
  const errorFormulario = $('error-formulario');
  const aviso = $('aviso');

  let clientes = [];
  let idEditando = null;

  // ---------- Utilidades ----------
  async function api(url, opciones = {}) {
    const respuesta = await fetch(url, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
    if (respuesta.status === 401) {
      window.location.assign('/');
      throw new Error('Sesión expirada');
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || 'Ocurrió un error inesperado.');
    return datos;
  }

  function mostrarAviso(texto, tipo = 'exito') {
    aviso.textContent = texto;
    aviso.className = `aviso visible aviso-${tipo}`;
    clearTimeout(mostrarAviso.temporizador);
    mostrarAviso.temporizador = setTimeout(() => aviso.classList.remove('visible'), 6000);
  }

  function mostrarErrorFormulario(texto) {
    errorFormulario.textContent = texto;
    errorFormulario.classList.toggle('visible', Boolean(texto));
  }

  function elemento(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  // ---------- Clientes ----------
  async function cargarClientes() {
    const datos = await api('/api/clientes');
    clientes = datos.clientes;

    const filtro = $('filtro-cliente');
    const selector = $('cliente');
    selector.replaceChildren(new Option('Selecciona un cliente', ''));
    for (const c of clientes) {
      filtro.append(new Option(c.nombre_cliente, c.id_cliente));
      selector.append(new Option(c.nombre_cliente, c.id_cliente));
    }
  }

  // ---------- Listado ----------
  async function cargarPlantillas() {
    const cliente = $('filtro-cliente').value;
    const datos = await api(`/api/plantillas${cliente ? `?cliente=${encodeURIComponent(cliente)}` : ''}`);
    const cuerpo = $('cuerpo-tabla');
    cuerpo.replaceChildren();

    for (const p of datos.plantillas) {
      const fila = document.createElement('tr');
      if (!p.activa) fila.classList.add('fila-inactiva');

      fila.append(
        elemento('td', 'celda-principal', p.nombre_plantilla),
        elemento('td', '', p.nombre_cliente),
        elemento('td', '', String(p.total_secciones)),
        elemento('td', '', String(p.total_documentos))
      );

      const celdaEstado = elemento('td');
      celdaEstado.append(
        elemento('span', `insignia ${p.activa ? 'insignia-ok' : 'insignia-inactiva'}`, p.activa ? 'Activa' : 'De baja')
      );
      fila.append(celdaEstado);

      const celdaAcciones = elemento('td', 'celda-acciones');
      const editar = elemento('button', 'boton-enlace', 'Editar');
      editar.type = 'button';
      editar.addEventListener('click', () => abrirEdicion(p.id_plantilla));
      celdaAcciones.append(editar);

      if (p.activa) {
        const eliminar = elemento('button', 'boton-enlace peligro', p.total_documentos > 0 ? 'Dar de baja' : 'Eliminar');
        eliminar.type = 'button';
        eliminar.addEventListener('click', () => eliminarPlantilla(p));
        celdaAcciones.append(eliminar);
      } else {
        const reactivar = elemento('button', 'boton-enlace', 'Reactivar');
        reactivar.type = 'button';
        reactivar.addEventListener('click', () => reactivarPlantilla(p));
        celdaAcciones.append(reactivar);
      }
      fila.append(celdaAcciones);
      cuerpo.append(fila);
    }
    $('tabla-vacia').hidden = datos.plantillas.length > 0;
  }

  // ---------- Secciones del formulario ----------
  function renumerar() {
    const filas = [...listaSecciones.children];
    filas.forEach((fila, i) => {
      fila.querySelector('.numero-seccion').textContent = `${i + 1}.`;
      fila.querySelector('.subir').disabled = i === 0;
      fila.querySelector('.bajar').disabled = i === filas.length - 1;
      fila.querySelector('.quitar').disabled = filas.length === 1;
    });
  }

  function agregarSeccion(seccion = {}) {
    const fila = moldeSeccion.content.firstElementChild.cloneNode(true);
    if (seccion.id_seccion) fila.dataset.id = seccion.id_seccion;
    fila.querySelector('.nombre-seccion').value = seccion.nombre_seccion || '';
    fila.querySelector('.obligatoria').checked = seccion.es_obligatoria === undefined ? true : Boolean(seccion.es_obligatoria);
    fila.querySelector('.permite-imagenes').checked = Boolean(seccion.permite_imagenes);

    fila.querySelector('.subir').addEventListener('click', () => {
      if (fila.previousElementSibling) fila.previousElementSibling.before(fila);
      renumerar();
    });
    fila.querySelector('.bajar').addEventListener('click', () => {
      if (fila.nextElementSibling) fila.nextElementSibling.after(fila);
      renumerar();
    });
    fila.querySelector('.quitar').addEventListener('click', () => {
      if (seccion.usos > 0) {
        mostrarErrorFormulario(
          `La sección "${seccion.nombre_seccion}" ya tiene contenido en documentos y no se puede quitar. Puedes renombrarla o marcarla como opcional.`
        );
        return;
      }
      fila.remove();
      renumerar();
    });

    listaSecciones.append(fila);
    renumerar();
    return fila;
  }

  function leerSecciones() {
    return [...listaSecciones.children].map((fila) => ({
      id: fila.dataset.id ? Number(fila.dataset.id) : null,
      nombre: fila.querySelector('.nombre-seccion').value,
      obligatoria: fila.querySelector('.obligatoria').checked,
      permiteImagenes: fila.querySelector('.permite-imagenes').checked,
    }));
  }

  // ---------- Abrir / cerrar formulario ----------
  function abrirFormulario(titulo) {
    mostrarErrorFormulario('');
    $('titulo-formulario').textContent = titulo;
    panelFormulario.hidden = false;
    $('boton-nueva').disabled = true;
    panelFormulario.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cerrarFormulario() {
    panelFormulario.hidden = true;
    formulario.reset();
    listaSecciones.replaceChildren();
    idEditando = null;
    $('cliente').disabled = false;
    $('boton-nueva').disabled = false;
  }

  function abrirNueva() {
    cerrarFormulario();
    agregarSeccion();
    abrirFormulario('Nueva plantilla');
    $('cliente').focus();
  }

  async function abrirEdicion(id) {
    try {
      const { plantilla } = await api(`/api/plantillas/${id}`);
      cerrarFormulario();
      idEditando = id;
      $('cliente').value = plantilla.id_cliente;
      $('cliente').disabled = plantilla.total_documentos > 0; // no se cambia el cliente si ya hay documentos
      $('nombre').value = plantilla.nombre_plantilla;
      plantilla.secciones.forEach((s) => agregarSeccion(s));
      if (plantilla.secciones.length === 0) agregarSeccion();
      abrirFormulario(`Editar plantilla: ${plantilla.nombre_plantilla}`);
      $('nombre').focus();
    } catch (error) {
      mostrarAviso(error.message, 'error');
    }
  }

  // ---------- Guardar ----------
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErrorFormulario('');

    if (!formulario.checkValidity()) {
      formulario.reportValidity();
      return;
    }

    const datos = {
      idCliente: Number($('cliente').value),
      nombre: $('nombre').value,
      secciones: leerSecciones(),
    };

    const boton = $('boton-guardar');
    boton.disabled = true;
    try {
      const respuesta = idEditando
        ? await api(`/api/plantillas/${idEditando}`, { method: 'PUT', body: JSON.stringify(datos) })
        : await api('/api/plantillas', { method: 'POST', body: JSON.stringify(datos) });
      cerrarFormulario();
      mostrarAviso(respuesta.mensaje);
      await cargarPlantillas();
    } catch (error) {
      mostrarErrorFormulario(error.message);
    } finally {
      boton.disabled = false;
    }
  });

  // ---------- Eliminar / dar de baja / reactivar ----------
  async function eliminarPlantilla(p) {
    const pregunta =
      p.total_documentos > 0
        ? `La plantilla "${p.nombre_plantilla}" tiene ${p.total_documentos} documento(s). Se dará de baja: dejará de estar disponible para documentos nuevos, pero los existentes se conservan. ¿Continuar?`
        : `¿Eliminar definitivamente la plantilla "${p.nombre_plantilla}"? Esta acción no se puede deshacer.`;
    if (!window.confirm(pregunta)) return;
    try {
      const respuesta = await api(`/api/plantillas/${p.id_plantilla}`, { method: 'DELETE' });
      if (idEditando === p.id_plantilla) cerrarFormulario();
      mostrarAviso(respuesta.mensaje);
      await cargarPlantillas();
    } catch (error) {
      mostrarAviso(error.message, 'error');
    }
  }

  async function reactivarPlantilla(p) {
    try {
      const respuesta = await api(`/api/plantillas/${p.id_plantilla}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ activa: true }),
      });
      mostrarAviso(respuesta.mensaje);
      await cargarPlantillas();
    } catch (error) {
      mostrarAviso(error.message, 'error');
    }
  }

  // ---------- Eventos ----------
  $('boton-nueva').addEventListener('click', abrirNueva);
  $('boton-cancelar').addEventListener('click', cerrarFormulario);
  $('boton-agregar-seccion').addEventListener('click', () => agregarSeccion().querySelector('.nombre-seccion').focus());
  $('filtro-cliente').addEventListener('change', () => cargarPlantillas().catch((e) => mostrarAviso(e.message, 'error')));

  // ---------- Inicio ----------
  (async () => {
    try {
      await cargarClientes();
      await cargarPlantillas();
    } catch (error) {
      mostrarAviso(error.message, 'error');
    }
  })();
})();
