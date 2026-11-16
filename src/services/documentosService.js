// Reglas de negocio del Generador Documental.
//   RF2: ingreso estructurado de texto e imágenes según la plantilla.
//   RF3: vista previa obligatoria. El servidor solo guarda lo que el usuario
//        previsualizó: la vista previa genera un token de un solo uso, y el
//        guardado definitivo exige ese token (prueba P3).
//   RF4: el autor solo edita en estados que lo permiten (Borrador, En Corrección).
//   RNF4: los documentos confidenciales solo los ve el Administrador.
//   RNF8: crear y enviar a revisión registran un evento de auditoría.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { enTransaccion } = require('../config/db');
const archivos = require('../config/archivos');
const documentosRepo = require('../repositories/documentosRepo');
const plantillasRepo = require('../repositories/plantillasRepo');
const catalogos = require('../repositories/catalogosRepo');
const { ROLES } = require('./authService');
const { ErrorNegocio } = require('./errores');

const { ESTADOS, EVENTOS } = catalogos;
const MAX_TEXTO_SECCION = 20000;
const MINUTOS_VIGENCIA_PREVIA = 30;

// ---------------------------------------------------------------- permisos

function esAdmin(usuario) {
  return usuario.rol === ROLES.ADMIN;
}

/** Quién puede ver un documento. */
function puedeVer(usuario, documento) {
  if (esAdmin(usuario)) return true;
  if (documento.es_confidencial) return false; // RNF4
  if (documento.id_autor === usuario.id) return true;
  return documento.nombre_estado === ESTADOS.APROBADO; // repositorio general
}

function puedeEditar(usuario, documento) {
  return !esAdmin(usuario) && documento.id_autor === usuario.id && Boolean(documento.permite_edicion_autor);
}

function puedeEnviar(usuario, documento) {
  return (
    !esAdmin(usuario) &&
    documento.id_autor === usuario.id &&
    [ESTADOS.BORRADOR, ESTADOS.EN_CORRECCION].includes(documento.nombre_estado)
  );
}

// ---------------------------------------------------------------- consultas

async function obtenerVisible(usuario, idDocumento) {
  const documento = await documentosRepo.buscarPorId(idDocumento);
  // Se responde "no existe" también cuando no hay permiso, para no revelar documentos ajenos.
  if (!documento || !puedeVer(usuario, documento)) throw new ErrorNegocio('El documento no existe o no tienes permiso para verlo.', 404);
  return documento;
}

async function obtenerCompleto(usuario, idDocumento) {
  const documento = await obtenerVisible(usuario, idDocumento);
  const secciones = await documentosRepo.listarContenido(idDocumento);
  return {
    ...documento,
    secciones,
    permisos: { editar: puedeEditar(usuario, documento), enviar: puedeEnviar(usuario, documento) },
  };
}

async function listarMios(usuario) {
  const documentos = await documentosRepo.listarDelAutor(usuario.id);
  return documentos.map((d) => ({
    ...d,
    permisos: { editar: puedeEditar(usuario, d), enviar: puedeEnviar(usuario, d) },
  }));
}

/** Ruta en disco de una imagen, solo si el usuario puede ver su documento. */
async function rutaImagenVisible(usuario, idImagen) {
  const imagen = await documentosRepo.buscarImagen(idImagen);
  if (!imagen) throw new ErrorNegocio('La imagen no existe.', 404);
  await obtenerVisible(usuario, imagen.id_documento);
  const ruta = path.resolve(archivos.RAIZ_UPLOADS, imagen.ruta_imagen);
  if (!ruta.startsWith(archivos.CARPETA_DOCUMENTOS + path.sep)) throw new ErrorNegocio('La imagen no existe.', 404);
  return ruta;
}

// ---------------------------------------------------------------- vista previa

function limpiarTexto(valor) {
  return String(valor ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

function nombreSeguro(nombreOriginal) {
  const base = path.basename(String(nombreOriginal || 'imagen')).replace(/[^\p{L}\p{N}._ -]/gu, '_');
  return base.slice(0, 150) || 'imagen';
}

function borrarTemporales(lista) {
  for (const a of lista || []) archivos.borrarSilencioso(a.rutaTemporal);
}

/** Descarta la vista previa guardada en la sesión (y sus imágenes temporales). */
function descartarPrevia(sesion) {
  if (sesion.previa) {
    borrarTemporales(sesion.previa.nuevas);
    delete sesion.previa;
  }
}

/**
 * Valida el borrador enviado por el formulario y lo deja guardado en la sesión
 * como "vista previa". Devuelve el token que el usuario debe confirmar.
 */
async function previsualizar({ usuario, sesion, idDocumento, datos, archivosSubidos }) {
  try {
    if (esAdmin(usuario)) throw new ErrorNegocio('Solo el perfil Equipo genera documentos.', 403);

    // Plantilla: la elegida (documento nuevo) o la del documento (edición).
    let idPlantilla;
    let imagenesActuales = [];
    if (idDocumento) {
      const documento = await documentosRepo.buscarPorId(idDocumento);
      if (!documento || documento.id_autor !== usuario.id) throw new ErrorNegocio('El documento no existe.', 404);
      if (!puedeEditar(usuario, documento)) {
        throw new ErrorNegocio(`El documento está "${documento.nombre_estado}" y no se puede editar.`, 409);
      }
      idPlantilla = documento.id_plantilla;
      imagenesActuales = (await documentosRepo.listarContenido(idDocumento)).flatMap((s) => s.imagenes);
    } else {
      idPlantilla = Number(datos.idPlantilla);
    }

    const plantilla = Number.isInteger(idPlantilla) ? await plantillasRepo.buscarPorId(idPlantilla) : null;
    if (!plantilla || (!idDocumento && !plantilla.activa)) throw new ErrorNegocio('Selecciona una plantilla válida.');

    const titulo = limpiarTexto(datos.titulo).trim().replace(/\s+/g, ' ');
    if (titulo.length < 3) throw new ErrorNegocio('El título debe tener al menos 3 caracteres.');
    if (titulo.length > 150) throw new ErrorNegocio('El título admite como máximo 150 caracteres.');

    // Textos por sección: solo se aceptan secciones de esta plantilla.
    const recibidos = datos.secciones && typeof datos.secciones === 'object' ? datos.secciones : {};
    const idsValidos = new Set(plantilla.secciones.map((s) => String(s.id_seccion)));
    for (const id of Object.keys(recibidos)) {
      if (!idsValidos.has(String(id))) throw new ErrorNegocio('El formulario contiene una sección que no pertenece a la plantilla.');
    }

    // Imágenes que se quitan (solo del propio documento).
    const eliminar = (Array.isArray(datos.eliminarImagenes) ? datos.eliminarImagenes : []).map(Number);
    const idsActuales = new Set(imagenesActuales.map((i) => i.id_imagen));
    if (eliminar.some((id) => !idsActuales.has(id))) throw new ErrorNegocio('Una de las imágenes no pertenece al documento.');

    // Imágenes nuevas: verificación del tipo real del archivo.
    const nuevas = [];
    for (const archivo of archivosSubidos) {
      const coincidencia = /^imagenes_(\d+)$/.exec(archivo.fieldname);
      const seccion = coincidencia && plantilla.secciones.find((s) => s.id_seccion === Number(coincidencia[1]));
      if (!seccion) throw new ErrorNegocio('Se recibió una imagen para una sección desconocida.');
      if (!seccion.permite_imagenes) throw new ErrorNegocio(`La sección "${seccion.nombre_seccion}" no admite imágenes.`);
      const extension = archivos.detectarTipo(archivo.path);
      if (!extension) throw new ErrorNegocio(`"${nombreSeguro(archivo.originalname)}" no es una imagen JPG, PNG o WEBP válida.`);
      nuevas.push({
        idSeccion: seccion.id_seccion,
        rutaTemporal: archivo.path,
        extension,
        nombre: nombreSeguro(archivo.originalname),
      });
    }

    const secciones = plantilla.secciones.map((s) => {
      const texto = limpiarTexto(recibidos[s.id_seccion]);
      if (s.es_obligatoria && !texto.trim()) throw new ErrorNegocio(`La sección "${s.nombre_seccion}" es obligatoria.`);
      if (texto.length > MAX_TEXTO_SECCION) {
        throw new ErrorNegocio(`La sección "${s.nombre_seccion}" supera los ${MAX_TEXTO_SECCION} caracteres.`);
      }
      const totalImagenes =
        imagenesActuales.filter((i) => i.id_seccion === s.id_seccion && !eliminar.includes(i.id_imagen)).length +
        nuevas.filter((n) => n.idSeccion === s.id_seccion).length;
      if (totalImagenes > archivos.LIMITES.imagenesPorSeccion) {
        throw new ErrorNegocio(`La sección "${s.nombre_seccion}" admite como máximo ${archivos.LIMITES.imagenesPorSeccion} imágenes.`);
      }
      return { idSeccion: s.id_seccion, texto };
    });

    descartarPrevia(sesion);
    const token = crypto.randomBytes(24).toString('hex');
    sesion.previa = {
      token,
      idUsuario: usuario.id,
      idDocumento: idDocumento || null,
      idPlantilla,
      titulo,
      secciones,
      nuevas,
      eliminar,
      creada: Date.now(),
    };
    return { token, titulo, secciones };
  } catch (error) {
    borrarTemporales(archivosSubidos.map((a) => ({ rutaTemporal: a.path })));
    throw error;
  }
}

function tokenValido(esperado, recibido) {
  const a = Buffer.from(String(esperado));
  const b = Buffer.from(String(recibido || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- guardado definitivo

/** Guarda definitivamente lo que el usuario revisó en la vista previa. */
async function confirmar({ usuario, sesion, token }) {
  const previa = sesion.previa;
  if (!previa || previa.idUsuario !== usuario.id || !tokenValido(previa.token, token)) {
    throw new ErrorNegocio('Debes revisar la vista previa del documento antes de guardarlo.', 409);
  }
  if (Date.now() - previa.creada > MINUTOS_VIGENCIA_PREVIA * 60 * 1000) {
    descartarPrevia(sesion);
    throw new ErrorNegocio('La vista previa expiró. Vuelve a previsualizar el documento.', 409);
  }

  const movidas = []; // imágenes ya movidas a su carpeta final (para deshacer si algo falla)
  let imagenesABorrar = [];
  try {
    const resultado = await enTransaccion(async (conn) => {
      let idDocumento = previa.idDocumento;

      if (idDocumento) {
        const actual = await documentosRepo.bloquearParaActualizar(conn, idDocumento);
        if (!actual || actual.id_autor !== usuario.id) throw new ErrorNegocio('El documento no existe.', 404);
        if (!actual.permite_edicion_autor) {
          throw new ErrorNegocio(`El documento está "${actual.nombre_estado}" y ya no se puede editar.`, 409);
        }
        await documentosRepo.actualizarTitulo(conn, idDocumento, previa.titulo);
      } else {
        const codigo = await documentosRepo.siguienteCodigo(conn, new Date().getFullYear());
        const idBorrador = await catalogos.estadoId(ESTADOS.BORRADOR);
        idDocumento = await documentosRepo.insertar(conn, {
          codigo,
          idPlantilla: previa.idPlantilla,
          idEstado: idBorrador,
          idAutor: usuario.id,
          titulo: previa.titulo,
        });
        await documentosRepo.registrarAuditoria(conn, {
          idDocumento,
          idUsuario: usuario.id,
          idTipoEvento: await catalogos.tipoEventoId(EVENTOS.CREACION),
          idEstadoResultante: idBorrador,
          detalle: `Documento ${codigo} creado como borrador`,
        });
      }

      // Contenido por sección
      const idsContenido = new Map();
      for (const s of previa.secciones) {
        idsContenido.set(s.idSeccion, await documentosRepo.guardarContenido(conn, idDocumento, s.idSeccion, s.texto || null));
      }

      // Imágenes quitadas
      if (previa.eliminar.length) {
        const actuales = await documentosRepo.imagenesDelDocumento(conn, idDocumento);
        for (const id of previa.eliminar) {
          const imagen = actuales.find((i) => i.id_imagen === id);
          if (!imagen) continue;
          await documentosRepo.eliminarImagen(conn, id);
          imagenesABorrar.push(path.resolve(archivos.RAIZ_UPLOADS, imagen.ruta_imagen));
        }
      }

      // Imágenes nuevas: se mueven de /uploads/tmp a /uploads/documentos/<id>/
      const carpeta = path.join(archivos.CARPETA_DOCUMENTOS, String(idDocumento));
      fs.mkdirSync(carpeta, { recursive: true });
      for (const n of previa.nuevas) {
        const archivo = `${crypto.randomBytes(12).toString('hex')}.${n.extension}`;
        const destino = path.join(carpeta, archivo);
        fs.renameSync(n.rutaTemporal, destino);
        movidas.push({ desde: n.rutaTemporal, hasta: destino });
        await documentosRepo.insertarImagen(conn, idsContenido.get(n.idSeccion), n.nombre, `documentos/${idDocumento}/${archivo}`);
      }

      return { idDocumento, nuevo: !previa.idDocumento };
    });

    delete sesion.previa;
    for (const ruta of imagenesABorrar) archivos.borrarSilencioso(ruta);
    return resultado;
  } catch (error) {
    // La transacción se deshizo: las imágenes vuelven a la carpeta temporal.
    for (const m of movidas) {
      try {
        fs.renameSync(m.hasta, m.desde);
      } catch {
        /* sin acción */
      }
    }
    imagenesABorrar = [];
    throw error;
  }
}

// ---------------------------------------------------------------- flujo

/** RF4: al enviar a revisión el documento queda bloqueado para el autor. */
async function enviarARevision(usuario, idDocumento) {
  return enTransaccion(async (conn) => {
    const actual = await documentosRepo.bloquearParaActualizar(conn, idDocumento);
    if (!actual || actual.id_autor !== usuario.id || esAdmin(usuario)) throw new ErrorNegocio('El documento no existe.', 404);
    if (![ESTADOS.BORRADOR, ESTADOS.EN_CORRECCION].includes(actual.nombre_estado)) {
      throw new ErrorNegocio(`Un documento "${actual.nombre_estado}" no se puede enviar a revisión.`, 409);
    }

    const idEnRevision = await catalogos.estadoId(ESTADOS.EN_REVISION);
    await documentosRepo.cambiarEstado(conn, idDocumento, idEnRevision);
    if (actual.nombre_estado === ESTADOS.EN_CORRECCION) await documentosRepo.cerrarSlaAbierto(conn, idDocumento);

    const idEvento = await documentosRepo.registrarAuditoria(conn, {
      idDocumento,
      idUsuario: usuario.id,
      idTipoEvento: await catalogos.tipoEventoId(EVENTOS.ENVIO_REVISION),
      idEstadoResultante: idEnRevision,
      detalle: actual.nombre_estado === ESTADOS.EN_CORRECCION ? 'Reenvío tras corrección' : 'Primer envío a revisión',
    });
    return { idEvento };
  });
}

module.exports = {
  obtenerCompleto,
  listarMios,
  rutaImagenVisible,
  previsualizar,
  confirmar,
  descartarPrevia,
  enviarARevision,
};
