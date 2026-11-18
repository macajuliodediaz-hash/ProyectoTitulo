// Buscador avanzado (RF10). Los filtros quedan en la URL para poder compartir o recargar la búsqueda.
(function () {
  const { api, elemento, formatoFecha, insigniaEstado, celdaSla, mostrarAviso, sesion } = window.ArgusNexus;
  const $ = (id) => document.getElementById(id);
  const aviso = $('aviso');
  const CAMPOS = ['texto', 'cliente', 'estado', 'desde', 'hasta', 'confidencialidad'];
  let esAdmin = false;

  function leerFiltros() {
    const filtros = {};
    for (const campo of CAMPOS) {
      const valor = $(campo).value.trim();
      if (valor && !(campo === 'confidencialidad' && !esAdmin)) filtros[campo] = valor;
    }
    return filtros;
  }

  async function buscar(guardarEnUrl = true) {
    const filtros = leerFiltros();
    const parametros = new URLSearchParams(filtros).toString();
    if (guardarEnUrl) window.history.replaceState(null, '', parametros ? `?${parametros}` : window.location.pathname);
    $('resumen').textContent = 'Buscando…';
    try {
      const { documentos, hayMas } = await api(`/api/buscar${parametros ? `?${parametros}` : ''}`);
      const cuerpo = $('cuerpo-tabla');
      cuerpo.replaceChildren();
      for (const d of documentos) {
        const fila = elemento('tr');
        if (d.sla && d.sla.critico) fila.classList.add('fila-critica');
        const celdaDoc = elemento('td');
        const enlace = elemento('a', 'celda-principal', d.titulo);
        enlace.href = `/documentos/${d.id_documento}`;
        const detalle = [d.nombre_cliente, d.nombre_plantilla, esAdmin ? d.autor : null, d.es_confidencial ? 'Confidencial' : null].filter(Boolean).join(' · ');
        celdaDoc.append(enlace, elemento('span', 'texto-secundario', detalle));
        const celdaEstado = elemento('td');
        celdaEstado.append(insigniaEstado(d.nombre_estado));
        fila.append(elemento('td', 'celda-codigo', d.codigo_documento), celdaDoc, celdaEstado, celdaSla(d), elemento('td', '', formatoFecha(d.fecha_creacion, false)));
        cuerpo.append(fila);
      }
      const n = documentos.length;
      $('resumen').textContent =
        n === 0
          ? 'No se encontraron documentos con esos filtros.'
          : `${n} documento${n === 1 ? '' : 's'} encontrado${n === 1 ? '' : 's'}${hayMas ? ' (se muestran los 200 más recientes; ajusta los filtros)' : ''}.`;
    } catch (error) {
      $('resumen').textContent = '';
      mostrarAviso(aviso, error.message, 'error');
    }
  }

  $('form-busqueda').addEventListener('submit', (evento) => {
    evento.preventDefault();
    buscar();
  });

  $('boton-limpiar').addEventListener('click', () => {
    $('form-busqueda').reset();
    buscar();
  });

  (async () => {
    try {
      const [usuario, { clientes }] = await Promise.all([sesion, api('/api/clientes')]);
      esAdmin = usuario.rol === 'Administrador';
      for (const c of clientes) $('cliente').append(new Option(c.nombre_cliente, c.id_cliente));
      if (esAdmin) {
        $('campo-confidencialidad').hidden = false;
      } else {
        $('titulo-pagina').textContent = 'Repositorio';
        $('descripcion-pagina').textContent = 'Tus documentos y los documentos aprobados del equipo (los confidenciales no se muestran).';
        document.title = 'Repositorio | ArgusNexus';
      }
      // Restaurar filtros desde la URL
      const parametros = new URLSearchParams(window.location.search);
      for (const campo of CAMPOS) if (parametros.has(campo)) $(campo).value = parametros.get(campo);
      await buscar(false);
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
    }
  })();
})();
