// Dashboard del Administrador (RF6): contadores, distribución por estado, almacenamiento,
// plazos críticos, métricas de corrección por cliente y actividad reciente.
(function () {
  const { api, elemento, formatoFecha, formatoRestante, mostrarAviso } = window.ArgusNexus;
  const $ = (id) => document.getElementById(id);
  const aviso = $('aviso');

  const ESTADOS = [
    { nombre: 'Borrador', clase: 'barra-borrador' },
    { nombre: 'En Revisión', clase: 'barra-revision' },
    { nombre: 'En Corrección', clase: 'barra-correccion' },
    { nombre: 'Bloqueado_SLA', clase: 'barra-bloqueado', texto: 'Bloqueado (SLA)' },
    { nombre: 'Aprobado', clase: 'barra-aprobado' },
  ];

  function dibujarBarras(porEstado) {
    const total = ESTADOS.reduce((s, e) => s + (porEstado[e.nombre] || 0), 0);
    const maximo = Math.max(1, ...ESTADOS.map((e) => porEstado[e.nombre] || 0));
    const contenedor = $('barras-estado');
    contenedor.replaceChildren();
    for (const e of ESTADOS) {
      const valor = porEstado[e.nombre] || 0;
      const fila = elemento('div', 'barra-fila');
      const pista = elemento('div', 'barra-pista');
      const barra = elemento('div', `barra ${e.clase}`);
      barra.style.width = `${(valor / maximo) * 100}%`;
      pista.append(barra);
      fila.append(elemento('span', 'barra-etiqueta', e.texto || e.nombre), pista, elemento('span', 'barra-valor', String(valor)));
      contenedor.append(fila);
    }
    contenedor.append(elemento('p', 'texto-ayuda', `Total de documentos: ${total}`));
  }

  function dibujarAlmacenamiento(a) {
    const datos = [
      ['Documentos', a.documentos],
      ['Confidenciales', a.confidenciales],
      ['Imágenes adjuntas', a.imagenes],
      ['Espacio en disco', `${a.megabytes} MB`],
      ['Plantillas activas', a.plantillas_activas],
      ['Clientes activos', a.clientes_activos],
    ];
    $('almacenamiento').replaceChildren(
      ...datos.map(([nombre, valor]) => {
        const div = elemento('div');
        div.append(elemento('dt', '', nombre), elemento('dd', '', String(valor)));
        return div;
      })
    );
  }

  function dibujarCriticos(criticos) {
    const lista = $('lista-criticos');
    lista.replaceChildren();
    for (const c of criticos) {
      const item = elemento('li');
      const enlace = elemento('a', 'sla-critico', `${c.codigo_documento} · ${c.titulo}`);
      enlace.href = `/documentos/${c.id_documento}`;
      const restante = c.segundos_restantes > 0 ? `quedan ${formatoRestante(c.segundos_restantes)}` : 'plazo vencido (se bloqueará en el próximo minuto)';
      item.append(enlace, elemento('span', 'texto-secundario', `${c.autor} · ${restante}`));
      lista.append(item);
    }
    $('sin-criticos').hidden = criticos.length > 0;
  }

  function dibujarMetricas(filas) {
    const cuerpo = $('cuerpo-metricas');
    cuerpo.replaceChildren();
    for (const m of filas) {
      const fila = elemento('tr');
      const tasa = m.tasa_rechazo_pct === null ? '—' : `${Number(m.tasa_rechazo_pct).toLocaleString('es-CL')} %`;
      fila.append(
        elemento('td', 'celda-principal', m.nombre_cliente),
        elemento('td', '', String(m.total_emitidos)),
        elemento('td', '', String(m.total_rechazados)),
        elemento('td', Number(m.tasa_rechazo_pct) >= 50 ? 'sla-critico' : '', tasa),
        elemento('td', '', String(m.sla_cumplidos)),
        elemento('td', m.sla_incumplidos > 0 ? 'sla-critico' : '', String(m.sla_incumplidos))
      );
      cuerpo.append(fila);
    }
    const calculo = filas[0] ? formatoFecha(filas[0].fecha_calculo) : '—';
    $('nota-metricas').textContent = `Instantánea calculada por lote (última actualización: ${calculo}). La tasa de rechazo se calcula como devoluciones / emitidos.`;
  }

  function dibujarActividad(eventos) {
    const lista = $('lista-actividad');
    lista.replaceChildren();
    for (const e of eventos) {
      const item = elemento('li');
      const enlace = elemento('a', '', `${e.nombre_evento}: ${e.codigo_documento} · ${e.titulo}`);
      enlace.href = `/documentos/${e.id_documento}`;
      item.append(enlace, elemento('span', 'texto-secundario', `${e.usuario} · ${formatoFecha(e.fecha_evento)}${e.detalle ? ` · ${e.detalle}` : ''}`));
      lista.append(item);
    }
    $('sin-actividad').hidden = eventos.length > 0;
  }

  async function cargar() {
    const inicio = performance.now();
    const d = await api('/api/dashboard');
    const e = d.porEstado;
    $('c-pendientes').textContent = e['En Revisión'] || 0;
    $('c-correccion').textContent = e['En Corrección'] || 0;
    $('c-criticos').textContent = d.slaCriticos.length;
    $('t-criticos').textContent = `SLA críticos (< ${d.umbralCriticoHoras} h)`;
    $('c-bloqueados').textContent = e.Bloqueado_SLA || 0;
    $('c-aprobados').textContent = e.Aprobado || 0;
    dibujarBarras(e);
    dibujarAlmacenamiento(d.almacenamiento);
    dibujarCriticos(d.slaCriticos);
    dibujarMetricas(d.metricasPorCliente);
    dibujarActividad(d.actividad);
    const total = Math.round(performance.now() - inicio);
    $('tiempo-respuesta').textContent = `Consultas resueltas en ${d.tiempoRespuestaMs} ms en el servidor; carga total ${total} ms (RNF3: máximo 3 segundos).`;
  }

  $('boton-recalcular').addEventListener('click', async (evento) => {
    evento.currentTarget.disabled = true;
    try {
      const r = await api('/api/dashboard/recalcular', { method: 'POST' });
      await cargar();
      mostrarAviso(aviso, r.mensaje);
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
    } finally {
      evento.currentTarget.disabled = false;
    }
  });

  cargar().catch((error) => mostrarAviso(aviso, error.message, 'error'));
  setInterval(() => cargar().catch(() => {}), 60 * 1000);
})();
