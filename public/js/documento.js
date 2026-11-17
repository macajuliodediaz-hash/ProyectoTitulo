// Página de un documento: lectura (permisos validados por el servidor), acciones del autor,
// plazo SLA con extensión (RNF7) y panel de revisión del Administrador (RF7).
(function () {
  const { api, elemento, mostrarAviso, dibujarDocumento, insigniaEstado, formatoRestante, formatoFecha } = window.ArgusNexus;
  const $ = (idElemento) => document.getElementById(idElemento);
  const aviso = $('aviso');
  const coincidencia = /^\/documentos\/(\d+)$/.exec(window.location.pathname);
  const id = coincidencia ? Number(coincidencia[1]) : null;
  let cuentaRegresiva = null;

  async function ejecutar(boton, url, opciones, alTerminar) {
    boton.disabled = true;
    try {
      const respuesta = await api(url, opciones);
      mostrarAviso(aviso, respuesta.mensaje);
      if (alTerminar) alTerminar();
      await cargar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
      boton.disabled = false;
    }
  }

  // ---------------------------------------------------------------- acciones del autor
  function dibujarAcciones(d) {
    const acciones = $('acciones');
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
      const enviar = elemento('button', 'boton boton-accion', d.nombre_estado === 'En Corrección' ? 'Reenviar a revisión' : 'Enviar a revisión');
      enviar.type = 'button';
      enviar.addEventListener('click', () => {
        if (!window.confirm('¿Enviar este documento a revisión? Mientras esté en revisión no podrás editarlo.')) return;
        ejecutar(enviar, `/api/documentos/${d.id_documento}/enviar`, { method: 'POST' });
      });
      acciones.append(enviar);
    }
  }

  // ---------------------------------------------------------------- estado y SLA
  function dibujarEstado(d) {
    const franja = $('estado-documento');
    clearInterval(cuentaRegresiva);
    franja.replaceChildren();
    franja.className = 'tarjeta franja-estado';

    const fila = elemento('div', 'franja-fila');
    fila.append(elemento('span', 'franja-etiqueta', 'Estado:'), insigniaEstado(d.nombre_estado));
    if (d.es_confidencial) fila.append(elemento('span', 'insignia insignia-bloqueado', 'Confidencial'));
    franja.append(fila);

    if (d.nombre_estado === 'Bloqueado_SLA') {
      franja.classList.add('franja-critica');
      franja.append(elemento('p', 'franja-texto', 'El plazo de corrección venció sin reenvío. Solo el Administrador puede habilitar nuevamente la edición.'));
    }

    if (d.sla) {
      const s = d.sla;
      if (s.critico) franja.classList.add('franja-critica');
      franja.append(elemento('p', 'franja-texto', `Motivo de la corrección: ${s.motivo}`));

      const plazo = elemento('p', 'franja-plazo');
      const restante = elemento('strong', s.critico ? 'sla-critico' : '');
      plazo.append('Tiempo restante: ', restante, ` · vence el ${formatoFecha(s.fechaLimite)}`);
      if (s.extensionUsada) plazo.append(' · extensión ya utilizada');
      franja.append(plazo);

      // Cuenta regresiva en vivo (el valor real lo calcula el servidor)
      const vence = Date.now() + s.segundosRestantes * 1000;
      const actualizar = () => {
        const seg = Math.round((vence - Date.now()) / 1000);
        restante.textContent = formatoRestante(seg);
        if (seg <= 0) clearInterval(cuentaRegresiva);
      };
      actualizar();
      cuentaRegresiva = setInterval(actualizar, 30 * 1000);

      if (d.permisos.extender) {
        const extender = elemento('button', 'boton boton-accion', `Solicitar +${s.horasExtension} horas`);
        extender.type = 'button';
        extender.addEventListener('click', () => {
          if (!window.confirm(`La extensión extraordinaria agrega ${s.horasExtension} horas y solo se puede usar una vez. ¿Solicitarla?`)) return;
          ejecutar(extender, `/api/documentos/${d.id_documento}/extension`, { method: 'POST' });
        });
        franja.append(extender);
      } else if (s.critico && !s.extensionUsada && d.permisos.editar) {
        franja.append(elemento('p', 'texto-secundario', 'La extensión estará disponible cuando queden menos horas.'));
      }
    }
    franja.hidden = false;
  }

  // ---------------------------------------------------------------- panel del Administrador
  function dibujarPanelRevision(d) {
    const panel = $('panel-revision');
    const p = d.permisos;
    panel.hidden = !p.confidencialidad;
    if (panel.hidden) return;

    const acciones = $('acciones-revision');
    acciones.replaceChildren();
    $('error-revision').classList.remove('visible');
    $('campo-motivo').hidden = !(p.revisar || p.habilitar);
    $('motivo').value = '';

    const pedirMotivo = () => {
      const motivo = $('motivo').value.trim();
      if (motivo.length < 5) {
        $('error-revision').textContent = 'Escribe el motivo de la corrección (al menos 5 caracteres).';
        $('error-revision').classList.add('visible');
        $('motivo').focus();
        return null;
      }
      $('error-revision').classList.remove('visible');
      return motivo;
    };

    if (p.revisar) {
      const aprobar = elemento('button', 'boton boton-aprobar', 'Aprobar documento');
      aprobar.type = 'button';
      aprobar.addEventListener('click', () => {
        if (!window.confirm('¿Aprobar este documento? Se notificará al autor.')) return;
        ejecutar(aprobar, `/api/documentos/${d.id_documento}/aprobar`, { method: 'POST' });
      });
      const rechazar = elemento('button', 'boton boton-rechazar', 'Devolver a corrección');
      rechazar.type = 'button';
      rechazar.addEventListener('click', () => {
        const motivo = pedirMotivo();
        if (!motivo) return;
        if (!window.confirm('Se devolverá el documento al autor con un plazo de corrección. ¿Continuar?')) return;
        ejecutar(rechazar, `/api/documentos/${d.id_documento}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) });
      });
      acciones.append(rechazar, aprobar);
    }

    if (p.habilitar) {
      const habilitar = elemento('button', 'boton boton-accion', 'Habilitar corrección (nuevo plazo)');
      habilitar.type = 'button';
      habilitar.addEventListener('click', () => {
        const motivo = pedirMotivo();
        if (!motivo) return;
        ejecutar(habilitar, `/api/documentos/${d.id_documento}/habilitar`, { method: 'POST', body: JSON.stringify({ motivo }) });
      });
      acciones.append(habilitar);
    }

    if (!p.revisar && !p.habilitar) {
      acciones.append(elemento('p', 'texto-secundario', 'No hay acciones de revisión pendientes para este estado.'));
    }

    const casilla = $('confidencial');
    casilla.checked = Boolean(d.es_confidencial);
    casilla.onchange = async () => {
      casilla.disabled = true;
      try {
        const respuesta = await api(`/api/documentos/${d.id_documento}/confidencialidad`, {
          method: 'PATCH',
          body: JSON.stringify({ confidencial: casilla.checked }),
        });
        mostrarAviso(aviso, respuesta.mensaje);
        await cargar();
      } catch (error) {
        casilla.checked = !casilla.checked;
        mostrarAviso(aviso, error.message, 'error');
      } finally {
        casilla.disabled = false;
      }
    };
  }

  // ---------------------------------------------------------------- carga
  async function cargar() {
    const { documento: d } = await api(`/api/documentos/${id}`);
    document.title = `${d.codigo_documento} | ArgusNexus`;
    dibujarAcciones(d);
    dibujarEstado(d);
    dibujarPanelRevision(d);
    await dibujarDocumento($('hoja'), {
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
