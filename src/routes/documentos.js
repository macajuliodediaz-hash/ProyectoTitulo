// API del Generador Documental y del flujo del documento.
const express = require('express');
const multer = require('multer');
const { requiereSesion, requiereRol } = require('../middlewares/auth');
const { ROLES } = require('../services/authService');
const { ErrorNegocio } = require('../services/errores');
const { subida, mimeDeRuta, LIMITES } = require('../config/archivos');
const documentosService = require('../services/documentosService');

const router = express.Router();
const soloEquipo = requiereRol(ROLES.EQUIPO);

function idDe(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorNegocio('Identificador no válido.');
  return id;
}

// Recibe el formulario multipart (campo "datos" en JSON + imágenes "imagenes_<idSeccion>").
function recibirFormulario(req, res, next) {
  subida.any()(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const mensajes = {
        LIMIT_FILE_SIZE: `Cada imagen puede pesar como máximo ${LIMITES.bytesPorImagen / (1024 * 1024)} MB.`,
        LIMIT_FILE_COUNT: `Puedes adjuntar como máximo ${LIMITES.imagenesPorEnvio} imágenes por envío.`,
      };
      return next(new ErrorNegocio(mensajes[error.code] || 'No fue posible recibir las imágenes.'));
    }
    next(error);
  });
}

function leerDatos(req) {
  try {
    return JSON.parse(req.body.datos || '{}');
  } catch {
    throw new ErrorNegocio('Los datos del formulario no son válidos.');
  }
}

async function previsualizar(req, res, idDocumento) {
  const archivosSubidos = req.files || [];
  let datos;
  try {
    datos = leerDatos(req);
  } catch (error) {
    for (const a of archivosSubidos) require('fs').rm(a.path, { force: true }, () => {});
    throw error;
  }
  const previa = await documentosService.previsualizar({
    usuario: req.session.usuario,
    sesion: req.session,
    idDocumento,
    datos,
    archivosSubidos,
  });
  res.json({ ok: true, ...previa });
}

// ---- Generador (solo Equipo)
router.post('/documentos/previsualizar', soloEquipo, recibirFormulario, async (req, res, next) => {
  try {
    await previsualizar(req, res, null);
  } catch (error) {
    next(error);
  }
});

router.post('/documentos/:id/previsualizar', soloEquipo, recibirFormulario, async (req, res, next) => {
  try {
    await previsualizar(req, res, idDe(req));
  } catch (error) {
    next(error);
  }
});

router.post('/documentos/confirmar', soloEquipo, async (req, res, next) => {
  try {
    const { idDocumento, nuevo } = await documentosService.confirmar({
      usuario: req.session.usuario,
      sesion: req.session,
      token: req.body.token,
    });
    res.status(nuevo ? 201 : 200).json({
      ok: true,
      idDocumento,
      mensaje: nuevo ? 'Documento guardado como borrador.' : 'Cambios guardados correctamente.',
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/documentos/previa', soloEquipo, (req, res) => {
  documentosService.descartarPrevia(req.session);
  res.json({ ok: true });
});

router.post('/documentos/:id/enviar', soloEquipo, async (req, res, next) => {
  try {
    const { idEvento } = await documentosService.enviarARevision(req.session.usuario, idDe(req));
    res.json({ ok: true, idEvento, mensaje: 'Documento enviado a revisión. Quedó bloqueado para edición.' });
  } catch (error) {
    next(error);
  }
});

// ---- Consulta
router.get('/documentos', requiereSesion, async (req, res, next) => {
  try {
    res.json({ documentos: await documentosService.listarMios(req.session.usuario) });
  } catch (error) {
    next(error);
  }
});

router.get('/documentos/:id', requiereSesion, async (req, res, next) => {
  try {
    res.json({ documento: await documentosService.obtenerCompleto(req.session.usuario, idDe(req)) });
  } catch (error) {
    next(error);
  }
});

// Imágenes: nunca son públicas; se valida el permiso sobre su documento (RNF4).
router.get('/imagenes/:id', requiereSesion, async (req, res, next) => {
  try {
    const ruta = await documentosService.rutaImagenVisible(req.session.usuario, idDe(req));
    res.set('Cache-Control', 'private, max-age=300');
    res.type(mimeDeRuta(ruta));
    res.sendFile(ruta);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
