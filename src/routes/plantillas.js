// API de plantillas.
//   Lectura: ambos perfiles (el Equipo necesita las plantillas activas para generar documentos).
//   Escritura: solo Administrador (RF5).
const express = require('express');
const { requiereSesion, requiereRol } = require('../middlewares/auth');
const { ROLES } = require('../services/authService');
const plantillasService = require('../services/plantillasService');
const plantillasRepo = require('../repositories/plantillasRepo');

const router = express.Router();
const soloAdmin = requiereRol(ROLES.ADMIN);

function idValido(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identificador no válido.' });
    return null;
  }
  return id;
}

router.get('/plantillas', requiereSesion, async (req, res, next) => {
  try {
    const esAdmin = req.session.usuario.rol === ROLES.ADMIN;
    const idCliente = Number(req.query.cliente) || null;
    // El Equipo solo ve plantillas activas; el Administrador ve todas.
    const plantillas = await plantillasRepo.listar({ soloActivas: !esAdmin, idCliente });
    res.json({ plantillas });
  } catch (error) {
    next(error);
  }
});

router.get('/plantillas/:id', requiereSesion, async (req, res, next) => {
  try {
    const id = idValido(req, res);
    if (!id) return;
    const plantilla = await plantillasRepo.buscarPorId(id);
    const esAdmin = req.session.usuario.rol === ROLES.ADMIN;
    if (!plantilla || (!esAdmin && !plantilla.activa)) {
      return res.status(404).json({ error: 'La plantilla no existe.' });
    }
    res.json({ plantilla });
  } catch (error) {
    next(error);
  }
});

router.post('/plantillas', soloAdmin, async (req, res, next) => {
  try {
    const id = await plantillasService.crear(req.body, req.session.usuario.id);
    res.status(201).json({ ok: true, id, mensaje: 'Plantilla creada correctamente.' });
  } catch (error) {
    next(error);
  }
});

router.put('/plantillas/:id', soloAdmin, async (req, res, next) => {
  try {
    const id = idValido(req, res);
    if (!id) return;
    await plantillasService.actualizar(id, req.body);
    res.json({ ok: true, mensaje: 'Plantilla actualizada correctamente.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/plantillas/:id/estado', soloAdmin, async (req, res, next) => {
  try {
    const id = idValido(req, res);
    if (!id) return;
    const activa = Boolean(req.body.activa);
    await plantillasService.cambiarEstado(id, activa);
    res.json({ ok: true, mensaje: activa ? 'Plantilla reactivada.' : 'Plantilla dada de baja.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/plantillas/:id', soloAdmin, async (req, res, next) => {
  try {
    const id = idValido(req, res);
    if (!id) return;
    const { resultado } = await plantillasService.eliminar(id);
    const mensaje =
      resultado === 'baja'
        ? 'La plantilla tiene documentos asociados, por lo que se dio de baja en lugar de eliminarse.'
        : 'Plantilla eliminada correctamente.';
    res.json({ ok: true, resultado, mensaje });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
