// Dibuja un documento en hojas tamaño carta con el formato de los informes de
// GEN BackOffice: portada con logo, título y "Control documental", secciones con
// franja de título, encabezado y pie de página en cada hoja.
// Lo usan la vista previa del generador y la página de un documento.
//
// La paginación se calcula midiendo cada bloque en una hoja oculta del mismo
// tamaño; los párrafos largos se dividen por palabras entre una hoja y la siguiente.
(function () {
  const { elemento, formatoFecha } = window.ArgusNexus;

  const ANCHO_HOJA = 816; // 8,5 pulgadas a 96 ppp
  const ALTO_HOJA = 1056; // 11 pulgadas
  const RUTA_LOGO = '/img/logo-gen.png';
  const LINEAS_MINIMAS = 2; // no se deja una sola línea suelta al final de una hoja

  // ---------------------------------------------------------------- logo
  // Si existe public/img/logo-gen.png se usa; si no, se muestra el nombre en texto.
  let logoDisponible = null;
  function comprobarLogo() {
    if (logoDisponible !== null) return Promise.resolve(logoDisponible);
    return new Promise((resolver) => {
      const prueba = new Image();
      prueba.onload = () => resolver((logoDisponible = true));
      prueba.onerror = () => resolver((logoDisponible = false));
      prueba.src = RUTA_LOGO;
    });
  }

  function logoGen() {
    if (logoDisponible) {
      const img = elemento('img');
      img.src = RUTA_LOGO;
      img.alt = 'GEN Back Office';
      return img;
    }
    return elemento('span', 'logo-texto', 'GEN');
  }

  // Logo del cliente (si el administrador lo cargó en "Clientes"); si no, el espacio queda vacío.
  function logoCliente(d) {
    if (!d.idCliente || !d.clienteTieneLogo) return null;
    const img = elemento('img');
    img.src = `/api/clientes/${d.idCliente}/logo`;
    img.alt = `Logo de ${d.cliente}`;
    return img;
  }

  // ---------------------------------------------------------------- bloques
  // Cada bloque es un elemento independiente que se mide y se ubica en una hoja.
  // Hoja 1: SOLO la presentación (logo GEN, emisor, título) y el recuadro de Control documental.
  function crearPortada(d) {
    const portada = elemento('div', 'hoja-portada');
    const logo = elemento('div', 'portada-logo');
    logo.append(logoGen());
    const titulo = elemento('h3', 'hoja-titulo', d.titulo);
    if (d.titulo.length > 70) titulo.classList.add('titulo-largo'); // así la portada nunca se desborda
    portada.append(logo, elemento('p', 'hoja-emisor', 'GEN BACK OFFICE'), titulo);

    const control = elemento('table', 'tabla-control');
    const cabecera = elemento('thead');
    const filaCabecera = elemento('tr');
    filaCabecera.append(elemento('th', '', 'Control documental'), elemento('th', '', 'Identificación'));
    cabecera.append(filaCabecera);
    const cuerpo = elemento('tbody');
    const filas = [
      ['Código', d.codigo || 'Se asigna al guardar'],
      ['Cliente', d.cliente],
      ['Revisión', `Rev. ${d.revision || 0}`],
      ['Fecha', formatoFecha(d.fecha || new Date(), false)],
      ['Elaborado por', 'GEN BackOffice'], // el emisor del documento es siempre la empresa, no la persona
    ];
    for (const [nombre, valor] of filas) {
      const fila = elemento('tr');
      fila.append(elemento('th', '', nombre), elemento('td', '', valor || '—'));
      cuerpo.append(fila);
    }
    control.append(cabecera, cuerpo);
    portada.append(control);
    return portada;
  }

  // Bloques del contenido (hoja 2 en adelante)
  function crearBloques(d) {
    const bloques = [];
    let numero = 0;
    for (const s of d.secciones) {
      const texto = (s.texto || '').trim();
      const imagenes = s.imagenes || [];
      if (!texto && !imagenes.length) continue; // las secciones opcionales vacías no se muestran
      numero += 1;

      bloques.push({ el: elemento('h4', 'hoja-seccion-titulo', `${numero}. ${s.nombre}`), mantenerConSiguiente: true });

      for (const parrafo of texto.split(/\n\s*\n|\n/)) {
        if (!parrafo.trim()) continue;
        bloques.push({ el: elemento('p', 'hoja-parrafo', parrafo.trim()), divisible: true });
      }

      imagenes.forEach((img, i) => {
        const figura = elemento('figure', 'hoja-figura');
        const imagen = elemento('img');
        imagen.src = img.src;
        imagen.alt = img.nombre;
        figura.append(imagen, elemento('figcaption', '', `Figura ${numero}.${i + 1}. ${img.nombre}`));
        bloques.push({ el: figura });
      });
    }
    return bloques;
  }

  // ---------------------------------------------------------------- hojas
  // Todas las hojas, incluida la portada: encabezado con logo GEN | título y cliente | logo del cliente.
  function crearHoja(d, esPortada = false) {
    const hoja = elemento('article', esPortada ? 'pagina pagina-portada' : 'pagina');
    const encabezado = elemento('header', 'pagina-encabezado');
    const izquierda = elemento('div', 'encabezado-logo');
    izquierda.append(logoGen());
    const centro = elemento('div', 'encabezado-centro');
    centro.append(elemento('div', 'encabezado-titulo', d.titulo), elemento('div', 'encabezado-cliente', d.cliente));
    const derecha = elemento('div', 'encabezado-logo encabezado-logo-cliente');
    const imagenCliente = logoCliente(d);
    if (imagenCliente) derecha.append(imagenCliente);
    encabezado.append(izquierda, centro, derecha);
    hoja.append(encabezado);

    const contenido = elemento('div', 'pagina-contenido');
    const pie = elemento('footer', 'pagina-pie');
    pie.append(
      elemento('span', '', `GEN Back Office  |  ${d.confidencial ? 'Documento confidencial' : 'Uso interno GEN'}`),
      elemento('span', 'pagina-numero')
    );
    hoja.append(contenido, pie);
    return { hoja, contenido };
  }

  function esperarImagenes(raiz) {
    const imagenes = [...raiz.querySelectorAll('img')];
    return Promise.all(
      imagenes.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })))
    );
  }

  /** Divide un párrafo para que la primera parte quepa en el espacio disponible. */
  function dividirParrafo(bloque, medir, disponible) {
    const palabras = bloque.el.textContent.split(' ');
    const altoLinea = parseFloat(getComputedStyle(bloque.el).lineHeight) || 21;
    if (disponible < altoLinea * LINEAS_MINIMAS) return null;

    let min = 1;
    let max = palabras.length - 1;
    let mejor = 0;
    const prueba = bloque.el.cloneNode(false);
    while (min <= max) {
      const medio = Math.floor((min + max) / 2);
      prueba.textContent = palabras.slice(0, medio).join(' ');
      if (medir(prueba) <= disponible) {
        mejor = medio;
        min = medio + 1;
      } else {
        max = medio - 1;
      }
    }
    if (mejor === 0 || palabras.length - mejor < 3) return null; // evita dejar 1-2 palabras sueltas
    const primera = bloque.el.cloneNode(false);
    primera.textContent = palabras.slice(0, mejor).join(' ');
    primera.classList.add('parrafo-continua');
    const resto = bloque.el.cloneNode(false);
    resto.textContent = palabras.slice(mejor).join(' ');
    return [{ el: primera }, { ...bloque, el: resto }];
  }

  async function paginar(contenedor, d) {
    await comprobarLogo();
    const bloques = crearBloques(d);

    // Hoja oculta para medir con exactamente el mismo formato.
    const zonaMedicion = elemento('div', 'zona-medicion');
    const { hoja: hojaMedicion, contenido: areaMedicion } = crearHoja(d);
    zonaMedicion.append(hojaMedicion);
    document.body.append(zonaMedicion);
    for (const b of bloques) areaMedicion.append(b.el);
    await esperarImagenes(areaMedicion);
    areaMedicion.replaceChildren();

    const medir = (el) => {
      areaMedicion.replaceChildren(el);
      return el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginBottom || 0);
    };
    const altoDisponible = areaMedicion.clientHeight;

    const paginas = [[]];
    let usado = 0;
    const cola = [...bloques];
    while (cola.length) {
      const bloque = cola.shift();
      const alto = medir(bloque.el);
      const restante = altoDisponible - usado;

      if (alto <= restante) {
        paginas[paginas.length - 1].push(bloque);
        usado += alto;
        continue;
      }
      if (bloque.divisible) {
        const partes = dividirParrafo(bloque, medir, restante);
        if (partes) {
          paginas[paginas.length - 1].push(partes[0]);
          paginas.push([]);
          usado = 0;
          cola.unshift(partes[1]);
          continue;
        }
      }
      const actual = paginas[paginas.length - 1];
      if (actual.every((b) => b.mantenerConSiguiente)) {
        // La hoja está vacía o solo tiene el título de la sección: pasar a otra hoja no ayudaría.
        actual.push(bloque);
        usado += alto;
        continue;
      }
      // Nueva hoja; un título no queda solo al final de la hoja anterior.
      const nueva = [];
      while (actual[actual.length - 1].mantenerConSiguiente) nueva.unshift(actual.pop());
      paginas.push(nueva);
      usado = nueva.reduce((suma, b) => suma + medir(b.el), 0);
      cola.unshift(bloque);
    }
    zonaMedicion.remove();

    // Dibujo final: la hoja 1 es siempre la portada; el contenido parte en la hoja 2.
    const total = paginas.filter((p) => p.length).length + 1;
    contenedor.replaceChildren();
    const marcoPortada = elemento('div', 'pagina-marco');
    const portada = crearHoja(d, true);
    portada.contenido.append(crearPortada(d));
    portada.hoja.querySelector('.pagina-numero').textContent = `pág. 1 de ${total}`;
    marcoPortada.append(portada.hoja);
    contenedor.append(marcoPortada);

    let numero = 1;
    for (const bloquesHoja of paginas) {
      if (!bloquesHoja.length) continue;
      numero += 1;
      const { hoja, contenido } = crearHoja(d);
      for (const b of bloquesHoja) contenido.append(b.el);
      hoja.querySelector('.pagina-numero').textContent = `pág. ${numero} de ${total}`;
      const marco = elemento('div', 'pagina-marco');
      marco.append(hoja);
      contenedor.append(marco);
    }
    ajustarEscala(contenedor);
  }

  // En pantallas angostas las hojas se reducen proporcionalmente (sin cambiar su contenido).
  function ajustarEscala(contenedor) {
    const disponible = contenedor.clientWidth;
    const escala = Math.min(1, disponible / ANCHO_HOJA);
    contenedor.style.setProperty('--escala-hoja', escala);
    for (const marco of contenedor.querySelectorAll('.pagina-marco')) {
      marco.style.width = `${ANCHO_HOJA * escala}px`;
      marco.style.height = `${ALTO_HOJA * escala}px`;
    }
  }

  const contenedoresActivos = new Set();
  window.addEventListener('resize', () => contenedoresActivos.forEach(ajustarEscala));

  /**
   * @param {HTMLElement} contenedor donde se dibujan las hojas
   * @param {object} d { codigo, titulo, cliente, plantilla, autor, fecha, estado, confidencial, revision,
   *                     secciones: [{ nombre, texto, imagenes: [{ src, nombre }] }] }
   */
  async function dibujarDocumento(contenedor, d) {
    contenedor.classList.add('paginas');
    contenedoresActivos.add(contenedor);
    await paginar(contenedor, d);
  }

  window.ArgusNexus.dibujarDocumento = dibujarDocumento;
})();
