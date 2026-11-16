// "Mis tareas" del perfil Equipo: documentos propios, contadores y acciones.
(function () {
  const { api, elemento, formatoFecha, insigniaEstado, mostrarAviso } = window.ArgusNexus;
  const aviso = document.getElementById('aviso');

  async function enviar(documento) {
    const pregunta = `¿Enviar "${documento.titulo}" a revisión? Mientras esté en revisión no podrás editarlo.`;
    if (!window.confirm(pregunta)) return;
    try {
      const respuesta = await api(`/api/documentos/${documento.id_documento}/enviar`, { method: 'POST' });
      mostrarAviso(aviso, respuesta.mensaje);
      await cargar();
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
    }
  }

  async function cargar() {
    const { documentos } = await api('/api/documentos');
    const cuerpo = document.getElementById('cuerpo-tabla');
    cuerpo.replaceChildren();

    const cuenta = (estado) => documentos.filter((d) => d.nombre_estado === estado).length;
    document.getElementById('total-borrador').textContent = cuenta('Borrador');
    document.getElementById('total-revision').textContent = cuenta('En Revisión');
    document.getElementById('total-correccion').textContent = cuenta('En Corrección');

    for (const d of documentos) {
      const fila = elemento('tr');
      if (d.nombre_estado === 'En Corrección') fila.classList.add('fila-alerta');

      const celdaDoc = elemento('td');
      const enlace = elemento('a', 'celda-principal', d.titulo);
      enlace.href = `/documentos/${d.id_documento}`;
      celdaDoc.append(enlace, elemento('span', 'texto-secundario', `${d.nombre_cliente} · ${d.nombre_plantilla}`));

      const celdaEstado = elemento('td');
      celdaEstado.append(insigniaEstado(d.nombre_estado));

      const acciones = elemento('td', 'celda-acciones');
      if (d.permisos.editar) {
        const editar = elemento('a', 'boton-enlace', 'Editar');
        editar.href = `/equipo/documentos/${d.id_documento}/editar`;
        acciones.append(editar);
      }
      if (d.permisos.enviar) {
        const boton = elemento('button', 'boton-enlace', 'Enviar a revisión');
        boton.type = 'button';
        boton.addEventListener('click', () => enviar(d));
        acciones.append(boton);
      }
      if (!d.permisos.editar && !d.permisos.enviar) {
        const ver = elemento('a', 'boton-enlace', 'Ver');
        ver.href = `/documentos/${d.id_documento}`;
        acciones.append(ver);
      }

      fila.append(elemento('td', 'celda-codigo', d.codigo_documento), celdaDoc, celdaEstado, elemento('td', '', formatoFecha(d.fecha_actualizacion)), acciones);
      cuerpo.append(fila);
    }
    document.getElementById('tabla-vacia').hidden = documentos.length > 0;
  }

  cargar().catch((error) => mostrarAviso(aviso, error.message, 'error'));
})();
