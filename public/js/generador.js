// Generador documental (perfil Equipo): formulario dinámico según la plantilla,
// imágenes por sección, vista previa obligatoria y guardado definitivo.
(function () {
  const { api, elemento, mostrarAviso, dibujarDocumento, insigniaEstado, sesion } = window.ArgusNexus;
  const $ = (id) => document.getElementById(id);

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_POR_SECCION = 5;
  const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

  const aviso = $('aviso');
  const formulario = $('form-documento');
  const contenedor = $('contenedor-secciones');

  // Edición: /equipo/documentos/<id>/editar
  const coincidencia = /^\/equipo\/documentos\/(\d+)\/editar$/.exec(window.location.pathname);
  const idDocumento = coincidencia ? Number(coincidencia[1]) : null;

  let plantilla = null; // { id_plantilla, nombre_plantilla, nombre_cliente, secciones }
  let documento = null; // documento en edición
  let token = null;
  const nuevas = new Map(); // idSeccion -> [{ archivo, url }]
  const existentes = new Map(); // idSeccion -> [{ id_imagen, nombre_archivo }]
  const quitadas = new Set(); // ids de imágenes existentes que se eliminan

  // ---------------------------------------------------------------- pasos
  function marcarPaso(n) {
    [1, 2, 3].forEach((i) => $(`paso-${i}`).classList.toggle('activo', i === n));
  }

  function mostrarError(texto) {
    mostrarAviso(aviso, texto, 'error');
    aviso.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------------------------------------------------------------- clientes y plantillas
  async function cargarClientes() {
    const { clientes } = await api('/api/clientes');
    for (const c of clientes) $('cliente').append(new Option(c.nombre_cliente, c.id_cliente));
  }

  $('cliente').addEventListener('change', async () => {
    const selector = $('plantilla');
    selector.replaceChildren(new Option('Selecciona una plantilla', ''));
    selector.disabled = true;
    limpiarSecciones();
    if (!$('cliente').value) return;
    try {
      const { plantillas } = await api(`/api/plantillas?cliente=${encodeURIComponent($('cliente').value)}`);
      const activas = plantillas.filter((p) => p.activa);
      for (const p of activas) selector.append(new Option(p.nombre_plantilla, p.id_plantilla));
      if (!activas.length) selector.replaceChildren(new Option('Este cliente no tiene plantillas activas', ''));
      selector.disabled = !activas.length;
    } catch (error) {
      mostrarError(error.message);
    }
  });

  $('plantilla').addEventListener('change', async () => {
    limpiarSecciones();
    if (!$('plantilla').value) return;
    try {
      const datos = await api(`/api/plantillas/${encodeURIComponent($('plantilla').value)}`);
      plantilla = datos.plantilla;
      dibujarSecciones({});
    } catch (error) {
      mostrarError(error.message);
    }
  });

  // ---------------------------------------------------------------- secciones dinámicas
  function limpiarSecciones() {
    plantilla = null;
    for (const lista of nuevas.values()) lista.forEach((n) => URL.revokeObjectURL(n.url));
    nuevas.clear();
    contenedor.replaceChildren();
    $('bloque-secciones').hidden = true;
    $('boton-previsualizar').disabled = true;
  }

  function dibujarSecciones(textos) {
    contenedor.replaceChildren();
    plantilla.secciones.forEach((s, i) => {
      const id = s.id_seccion;
      const campo = elemento('div', 'campo seccion-documento');
      const etiqueta = elemento('label', '', `${i + 1}. ${s.nombre_seccion}${s.es_obligatoria ? ' *' : ' (opcional)'}`);
      etiqueta.htmlFor = `seccion-${id}`;

      const area = elemento('textarea');
      area.id = `seccion-${id}`;
      area.rows = 5;
      area.maxLength = 20000;
      area.required = Boolean(s.es_obligatoria);
      area.dataset.seccion = id;
      area.value = textos[id] || '';
      campo.append(etiqueta, area);

      if (s.permite_imagenes) {
        const zona = elemento('div', 'zona-imagenes');
        const entrada = elemento('input');
        entrada.type = 'file';
        entrada.accept = TIPOS.join(',');
        entrada.multiple = true;
        entrada.id = `imagenes-${id}`;
        entrada.className = 'entrada-oculta';
        const boton = elemento('label', 'boton-borde boton-adjuntar', '📎 Adjuntar imágenes');
        boton.htmlFor = entrada.id;
        const galeria = elemento('div', 'galeria-miniaturas');
        galeria.id = `galeria-${id}`;
        entrada.addEventListener('change', () => {
          agregarImagenes(id, [...entrada.files]);
          entrada.value = '';
        });
        zona.append(entrada, boton, galeria);
        campo.append(zona);
      }
      contenedor.append(campo);
      if (s.permite_imagenes) dibujarMiniaturas(id);
    });
    $('bloque-secciones').hidden = false;
    $('boton-previsualizar').disabled = false;
  }

  function totalImagenes(idSeccion) {
    const actuales = (existentes.get(idSeccion) || []).filter((i) => !quitadas.has(i.id_imagen)).length;
    return actuales + (nuevas.get(idSeccion) || []).length;
  }

  function agregarImagenes(idSeccion, archivos) {
    const lista = nuevas.get(idSeccion) || [];
    for (const archivo of archivos) {
      if (!TIPOS.includes(archivo.type)) {
        mostrarError(`"${archivo.name}" no es una imagen JPG, PNG o WEBP.`);
        continue;
      }
      if (archivo.size > MAX_BYTES) {
        mostrarError(`"${archivo.name}" supera los 5 MB.`);
        continue;
      }
      if (totalImagenes(idSeccion) + 1 > MAX_POR_SECCION) {
        mostrarError(`Cada sección admite como máximo ${MAX_POR_SECCION} imágenes.`);
        break;
      }
      lista.push({ archivo, url: URL.createObjectURL(archivo) });
      nuevas.set(idSeccion, lista);
    }
    dibujarMiniaturas(idSeccion);
  }

  function miniatura(src, nombre, alQuitar) {
    const item = elemento('figure', 'miniatura');
    const img = elemento('img');
    img.src = src;
    img.alt = nombre;
    const quitar = elemento('button', 'boton-icono quitar-imagen', '✕');
    quitar.type = 'button';
    quitar.setAttribute('aria-label', `Quitar ${nombre}`);
    quitar.addEventListener('click', alQuitar);
    item.append(img, elemento('figcaption', '', nombre), quitar);
    return item;
  }

  function dibujarMiniaturas(idSeccion) {
    const galeria = $(`galeria-${idSeccion}`);
    if (!galeria) return;
    galeria.replaceChildren();
    for (const img of existentes.get(idSeccion) || []) {
      if (quitadas.has(img.id_imagen)) continue;
      galeria.append(
        miniatura(`/api/imagenes/${img.id_imagen}`, img.nombre_archivo, () => {
          quitadas.add(img.id_imagen);
          dibujarMiniaturas(idSeccion);
        })
      );
    }
    for (const n of nuevas.get(idSeccion) || []) {
      galeria.append(
        miniatura(n.url, n.archivo.name, () => {
          URL.revokeObjectURL(n.url);
          nuevas.set(idSeccion, nuevas.get(idSeccion).filter((x) => x !== n));
          dibujarMiniaturas(idSeccion);
        })
      );
    }
  }

  // ---------------------------------------------------------------- paso 2: vista previa
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.checkValidity()) {
      formulario.reportValidity();
      return;
    }

    const secciones = {};
    contenedor.querySelectorAll('textarea').forEach((t) => (secciones[t.dataset.seccion] = t.value));

    const envio = new FormData();
    envio.append(
      'datos',
      JSON.stringify({
        idPlantilla: plantilla.id_plantilla,
        titulo: $('titulo').value,
        secciones,
        eliminarImagenes: [...quitadas],
      })
    );
    for (const [idSeccion, lista] of nuevas) {
      for (const n of lista) envio.append(`imagenes_${idSeccion}`, n.archivo, n.archivo.name);
    }

    const boton = $('boton-previsualizar');
    boton.disabled = true;
    boton.textContent = 'Preparando vista previa…';
    try {
      const url = idDocumento ? `/api/documentos/${idDocumento}/previsualizar` : '/api/documentos/previsualizar';
      const previa = await api(url, { method: 'POST', body: envio });
      token = previa.token;
      mostrarVistaPrevia(previa);
    } catch (error) {
      mostrarError(error.message);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Previsualizar documento';
    }
  });

  async function mostrarVistaPrevia(previa) {
    const usuario = await sesion;
    const textos = new Map(previa.secciones.map((s) => [s.idSeccion, s.texto]));
    // Se muestra primero el contenedor: la escala de las hojas depende de su ancho.
    aviso.classList.remove('visible');
    formulario.hidden = true;
    $('vista-previa').hidden = false;
    marcarPaso(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await dibujarDocumento($('hoja-previa'), {
      codigo: documento ? documento.codigo_documento : null,
      titulo: previa.titulo,
      cliente: plantilla.nombre_cliente,
      idCliente: plantilla.id_cliente,
      clienteTieneLogo: Boolean(plantilla.cliente_tiene_logo),
      plantilla: plantilla.nombre_plantilla,
      autor: `${usuario.nombre} ${usuario.apellido}`,
      fecha: new Date(),
      estado: documento ? documento.nombre_estado : 'Borrador',
      confidencial: documento ? documento.es_confidencial : 0,
      revision: documento ? documento.revision : 0,
      secciones: plantilla.secciones.map((s) => ({
        nombre: s.nombre_seccion,
        texto: textos.get(s.id_seccion) || '',
        imagenes: [
          ...(existentes.get(s.id_seccion) || [])
            .filter((i) => !quitadas.has(i.id_imagen))
            .map((i) => ({ src: `/api/imagenes/${i.id_imagen}`, nombre: i.nombre_archivo })),
          ...(nuevas.get(s.id_seccion) || []).map((n) => ({ src: n.url, nombre: n.archivo.name })),
        ],
      })),
    });
  }

  $('boton-imprimir').addEventListener('click', () => window.print());

  $('boton-volver').addEventListener('click', () => {
    token = null;
    api('/api/documentos/previa', { method: 'DELETE' }).catch(() => {});
    $('vista-previa').hidden = true;
    formulario.hidden = false;
    marcarPaso(1);
  });

  // ---------------------------------------------------------------- paso 3: guardar
  $('boton-guardar').addEventListener('click', async () => {
    const boton = $('boton-guardar');
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const respuesta = await api('/api/documentos/confirmar', { method: 'POST', body: JSON.stringify({ token }) });
      marcarPaso(3);
      window.location.assign(`/documentos/${respuesta.idDocumento}?guardado=1`);
    } catch (error) {
      mostrarError(error.message);
      boton.disabled = false;
      boton.textContent = 'Guardar documento';
    }
  });

  // ---------------------------------------------------------------- inicio
  async function cargarEdicion() {
    const datos = await api(`/api/documentos/${idDocumento}`);
    documento = datos.documento;
    if (!documento.permisos.editar) {
      mostrarError(`Este documento está "${documento.nombre_estado}" y no se puede editar.`);
      formulario.hidden = true;
      return;
    }
    const datosPlantilla = await api(`/api/plantillas/${documento.id_plantilla}`).catch(() => null);
    plantilla = {
      id_plantilla: documento.id_plantilla,
      nombre_plantilla: documento.nombre_plantilla,
      nombre_cliente: documento.nombre_cliente,
      id_cliente: documento.id_cliente,
      cliente_tiene_logo: documento.cliente_tiene_logo,
      secciones: datosPlantilla
        ? datosPlantilla.plantilla.secciones
        : documento.secciones.map((s) => ({ ...s })),
    };
    const textos = {};
    for (const s of documento.secciones) {
      textos[s.id_seccion] = s.texto_ingresado || '';
      existentes.set(s.id_seccion, s.imagenes);
    }

    document.title = `Editar ${documento.codigo_documento} | ArgusNexus`;
    $('titulo-pagina').textContent = `Editar documento ${documento.codigo_documento}`;
    $('subtitulo-pagina').textContent = 'Los cambios se guardan después de revisar la vista previa.';
    $('campos-nuevo').hidden = true;
    $('cliente').required = false;
    $('plantilla').required = false;
    $('datos-edicion').hidden = false;
    $('fijo-codigo').textContent = documento.codigo_documento;
    $('fijo-cliente').textContent = documento.nombre_cliente;
    $('fijo-plantilla').textContent = documento.nombre_plantilla;
    $('fijo-estado').replaceChildren(insigniaEstado(documento.nombre_estado));
    $('titulo').value = documento.titulo;
    dibujarSecciones(textos);
  }

  (async () => {
    try {
      if (idDocumento) {
        document.body.dataset.menu = 'tareas';
        await cargarEdicion();
      } else {
        await cargarClientes();
      }
    } catch (error) {
      mostrarError(error.message);
    }
  })();
})();
