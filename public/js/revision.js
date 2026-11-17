// Revisión (Administrador): documentos por estado, con su plazo SLA.
(function () {
  const { api, elemento, formatoFecha, insigniaEstado, celdaSla, mostrarAviso } = window.ArgusNexus;
  const aviso = document.getElementById('aviso');

  const PESTANAS = [
    { estado: 'En Revisión', texto: 'Pendientes' },
    { estado: 'En Corrección', texto: 'En corrección' },
    { estado: 'Bloqueado_SLA', texto: 'Bloqueados' },
    { estado: 'Aprobado', texto: 'Aprobados' },
    { estado: '', texto: 'Todos' },
  ];
  let actual = new URLSearchParams(window.location.search).get('estado') ?? 'En Revisión';

  function dibujarPestanas(totales) {
    const contenedor = document.getElementById('pestanas');
    contenedor.replaceChildren();
    const totalTodos = Object.entries(totales)
      .filter(([estado]) => estado !== 'Borrador')
      .reduce((suma, [, n]) => suma + n, 0);
    for (const p of PESTANAS) {
      const boton = elemento('button', 'pestana', `${p.texto} (${p.estado ? totales[p.estado] || 0 : totalTodos})`);
      boton.type = 'button';
      boton.setAttribute('role', 'tab');
      boton.setAttribute('aria-selected', String(p.estado === actual));
      if (p.estado === 'Bloqueado_SLA' && totales[p.estado]) boton.classList.add('pestana-alerta');
      boton.addEventListener('click', () => {
        actual = p.estado;
        window.history.replaceState(null, '', p.estado ? `?estado=${encodeURIComponent(p.estado)}` : '?estado=');
        cargar().catch((e) => mostrarAviso(aviso, e.message, 'error'));
      });
      contenedor.append(boton);
    }
  }

  async function cargar() {
    const { documentos, totales } = await api(`/api/revision?estado=${encodeURIComponent(actual)}`);
    dibujarPestanas(totales);
    const cuerpo = document.getElementById('cuerpo-tabla');
    cuerpo.replaceChildren();
    for (const d of documentos) {
      const fila = elemento('tr');
      if (d.sla && d.sla.critico) fila.classList.add('fila-critica');
      if (d.nombre_estado === 'Bloqueado_SLA') fila.classList.add('fila-alerta');

      const celdaDoc = elemento('td');
      const enlace = elemento('a', 'celda-principal', d.titulo);
      enlace.href = `/documentos/${d.id_documento}`;
      celdaDoc.append(enlace, elemento('span', 'texto-secundario', `${d.nombre_cliente} · ${d.autor}${d.es_confidencial ? ' · Confidencial' : ''}`));

      const celdaEstado = elemento('td');
      celdaEstado.append(insigniaEstado(d.nombre_estado));

      const acciones = elemento('td', 'celda-acciones');
      const ir = elemento('a', 'boton-enlace', d.permisos.revisar ? 'Revisar' : d.permisos.habilitar ? 'Habilitar' : 'Ver');
      ir.href = `/documentos/${d.id_documento}`;
      acciones.append(ir);

      fila.append(elemento('td', 'celda-codigo', d.codigo_documento), celdaDoc, celdaEstado, celdaSla(d), elemento('td', '', formatoFecha(d.fecha_actualizacion)), acciones);
      cuerpo.append(fila);
    }
    document.getElementById('tabla-vacia').hidden = documentos.length > 0;
  }

  cargar().catch((e) => mostrarAviso(aviso, e.message, 'error'));
  setInterval(() => cargar().catch(() => {}), 60 * 1000); // los plazos se actualizan cada minuto
})();
