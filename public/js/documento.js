// Página de un documento: lectura con permisos validados por el servidor y acciones del autor.
(function () {
  const { api, elemento, mostrarAviso, dibujarDocumento } = window.ArgusNexus;
  const aviso = document.getElementById('aviso');
  const coincidencia = /^\/documentos\/(\d+)$/.exec(window.location.pathname);
  const id = coincidencia ? Number(coincidencia[1]) : null;

  function dibujarAcciones(d) {
    const acciones = document.getElementById('acciones');
    acciones.replaceChildren();
    const imprimir = elemento('button', 'boton-borde', 'Imprimir / Guardar PDF');
    imprimir.type = 'button';
    imprimir.addEventListener('click', () => window.print());
    acciones.append(imprimir);
    if (d.permisos.editar) {
      const editar = elemento('a', 'boton-borde', 'Editar');
      editar.href = `/equipo/documentos/${d.id_documento}/editar`;
      acciones.append(editar);
    }
    if (d.permisos.enviar) {
      const enviar = elemento('button', 'boton boton-accion', 'Enviar a revisión');
      enviar.type = 'button';
      enviar.addEventListener('click', async () => {
        if (!window.confirm('¿Enviar este documento a revisión? Mientras esté en revisión no podrás editarlo.')) return;
        enviar.disabled = true;
        try {
          const respuesta = await api(`/api/documentos/${d.id_documento}/enviar`, { method: 'POST' });
          mostrarAviso(aviso, respuesta.mensaje);
          await cargar();
        } catch (error) {
          mostrarAviso(aviso, error.message, 'error');
          enviar.disabled = false;
        }
      });
      acciones.append(enviar);
    }
  }

  async function cargar() {
    const { documento: d } = await api(`/api/documentos/${id}`);
    document.title = `${d.codigo_documento} | ArgusNexus`;
    dibujarAcciones(d);
    await dibujarDocumento(document.getElementById('hoja'), {
      codigo: d.codigo_documento,
      titulo: d.titulo,
      cliente: d.nombre_cliente,
      idCliente: d.id_cliente,
      clienteTieneLogo: Boolean(d.cliente_tiene_logo),
      plantilla: d.nombre_plantilla,
      autor: d.autor,
      fecha: d.fecha_actualizacion,
      estado: d.nombre_estado,
      confidencial: d.es_confidencial,
      revision: d.revision,
      secciones: d.secciones.map((s) => ({
        nombre: s.nombre_seccion,
        texto: s.texto_ingresado || '',
        imagenes: s.imagenes.map((i) => ({ src: `/api/imagenes/${i.id_imagen}`, nombre: i.nombre_archivo })),
      })),
    });
  }

  if (new URLSearchParams(window.location.search).get('guardado')) {
    mostrarAviso(aviso, 'Documento guardado correctamente. Cuando esté listo, envíalo a revisión.');
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (!id) {
    mostrarAviso(aviso, 'Documento no válido.', 'error');
  } else {
    cargar().catch((error) => mostrarAviso(aviso, error.message, 'error'));
  }
})();
