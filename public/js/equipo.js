// "Mis tareas" del perfil Equipo: documentos propios, plazos SLA, contadores, acciones y notificaciones.
(function () {
  const { api, elemento, formatoFecha, insigniaEstado, celdaSla, mostrarAviso } = window.ArgusNexus;
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

  async function cargarDocumentos() {
    const { documentos } = await api('/api/documentos');
    const cuerpo = document.getElementById('cuerpo-tabla');
    cuerpo.replaceChildren();

    const cuenta = (estado) => documentos.filter((d) => d.nombre_estado === estado).length;
    document.getElementById('total-borrador').textContent = cuenta('Borrador');
    document.getElementById('total-revision').textContent = cuenta('En Revisión');
    document.getElementById('total-correccion').textContent = cuenta('En Corrección');

    // Primero lo urgente: correcciones con menos tiempo restante
    documentos.sort((a, b) => {
      const ra = a.sla ? a.sla.segundosRestantes : Infinity;
      const rb = b.sla ? b.sla.segundosRestantes : Infinity;
      return ra - rb;
    });

    for (const d of documentos) {
      const fila = elemento('tr');
      if (d.nombre_estado === 'En Corrección') fila.classList.add('fila-alerta');
      if (d.sla && d.sla.critico) fila.classList.add('fila-critica'); // RNF6: rojo y negrita
      if (d.nombre_estado === 'Bloqueado_SLA') fila.classList.add('fila-alerta');

      const celdaDoc = elemento('td');
      const enlace = elemento('a', 'celda-principal', d.titulo);
      enlace.href = `/documentos/${d.id_documento}`;
      celdaDoc.append(enlace, elemento('span', 'texto-secundario', `${d.nombre_cliente} · ${d.nombre_plantilla}`));

      const celdaEstado = elemento('td');
      celdaEstado.append(insigniaEstado(d.nombre_estado));

      const acciones = elemento('td', 'celda-acciones');
      if (d.permisos.extender) {
        const extender = elemento('a', 'boton-enlace peligro', 'Solicitar extensión');
        extender.href = `/documentos/${d.id_documento}`;
        acciones.append(extender);
      }
      if (d.permisos.editar) {
        const editar = elemento('a', 'boton-enlace', d.nombre_estado === 'En Corrección' ? 'Corregir' : 'Editar');
        editar.href = `/equipo/documentos/${d.id_documento}/editar`;
        acciones.append(editar);
      }
      if (d.permisos.enviar) {
        const boton = elemento('button', 'boton-enlace', d.nombre_estado === 'En Corrección' ? 'Reenviar' : 'Enviar a revisión');
        boton.type = 'button';
        boton.addEventListener('click', () => enviar(d));
        acciones.append(boton);
      }
      if (!d.permisos.editar && !d.permisos.enviar) {
        const ver = elemento('a', 'boton-enlace', 'Ver');
        ver.href = `/documentos/${d.id_documento}`;
        acciones.append(ver);
      }

      fila.append(
        elemento('td', 'celda-codigo', d.codigo_documento),
        celdaDoc,
        celdaEstado,
        celdaSla(d),
        elemento('td', '', formatoFecha(d.fecha_actualizacion)),
        acciones
      );
      cuerpo.append(fila);
    }
    document.getElementById('tabla-vacia').hidden = documentos.length > 0;
  }

  async function cargarNotificaciones() {
    const { notificaciones, sinLeer } = await api('/api/notificaciones');
    const lista = document.getElementById('lista-notificaciones');
    lista.replaceChildren();
    for (const n of notificaciones) {
      const item = elemento('li', n.leida ? '' : 'no-leida');
      const enlace = elemento('a', '', n.mensaje);
      enlace.href = `/documentos/${n.id_documento}`;
      item.append(enlace, elemento('span', 'texto-secundario', formatoFecha(n.fecha_envio)));
      lista.append(item);
    }
    const contador = document.getElementById('contador-notificaciones');
    contador.textContent = `${sinLeer} sin leer`;
    contador.hidden = sinLeer === 0;
    document.getElementById('boton-leidas').hidden = sinLeer === 0;
    document.getElementById('sin-notificaciones').hidden = notificaciones.length > 0;
  }

  document.getElementById('boton-leidas').addEventListener('click', async () => {
    try {
      await api('/api/notificaciones/leidas', { method: 'POST' });
      await cargarNotificaciones();
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
    }
  });

  async function cargar() {
    await Promise.all([cargarDocumentos(), cargarNotificaciones()]);
  }

  cargar().catch((error) => mostrarAviso(aviso, error.message, 'error'));
  setInterval(() => cargar().catch(() => {}), 60 * 1000); // los plazos se actualizan cada minuto
})();
