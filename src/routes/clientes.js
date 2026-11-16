// API de clientes. Lectura: ambos perfiles. Escritura: solo Administrador.
const express = require('express');
const multer = require('multer');
const { requiereSesion, requiereRol } = require('../middlewares/auth');
const { ROLES } = require('../services/authService');
const { ErrorNegocio } = require('../services/errores');
const { subida, mimeDeRuta } = require('../config/archivos');
const clientesRepo = require('../repositories/clientesRepo');
const clientesService = require('../services/clientesService');

const router = express.Router();
const soloAdmin = requiereRol(ROLES.ADMIN);

function idDe(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorNegocio('Identificador no válido.');
  return id;
}

function recibirLogo(req, res, next) {
  subida.single('logo')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) return next(new ErrorNegocio('No fue posible recibir el logo (máximo 2 MB).'));
    next(error);
  });
}

const archivoDe = (req) => (req.file ? [req.file] : []);

router.get('/clientes', requiereSesion, async (req, res, next) => {
  try {
    const todos = req.query.todos === '1' && req.session.usuario.rol === ROLES.ADMIN;
    res.json({ clientes: todos ? await clientesRepo.listarTodos() : await clientesRepo.listarActivos() });
  } catch (error) {
    next(error);
  }
});

router.post('/clientes', soloAdmin, recibirLogo, async (req, res, next) => {
  try {
    const id = await clientesService.crear(req.body, archivoDe(req));
    res.status(201).json({ ok: true, id, mensaje: 'Cliente creado correctamente.' });
  } catch (error) {
    next(error);
  }
});

router.put('/clientes/:id', soloAdmin, recibirLogo, async (req, res, next) => {
  try {
    await clientesService.actualizar(idDe(req), req.body, archivoDe(req));
    res.json({ ok: true, mensaje: 'Cliente actualizado correctamente.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/clientes/:id/estado', soloAdmin, async (req, res, next) => {
  try {
    const activo = Boolean(req.body.activo);
    await clientesService.cambiarEstado(idDe(req), activo);
    res.json({ ok: true, mensaje: activo ? 'Cliente reactivado.' : 'Cliente desactivado.' });
  } catch (error) {
    next(error);
  }
});

router.get('/clientes/:id/logo', requiereSesion, async (req, res, next) => {
  try {
    const ruta = await clientesService.rutaLogo(idDe(req));
    // El logo puede reemplazarse con la misma URL: el navegador debe confirmar si cambió.
    res.set('Cache-Control', 'private, no-cache');
    res.type(mimeDeRuta(ruta));
    res.sendFile(ruta);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
