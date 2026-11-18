// API del flujo de revisión, SLA y notificaciones.
const express = require('express');
const { requiereSesion, requiereRol } = require('../middlewares/auth');
const { ROLES } = require('../services/authService');
const { ErrorNegocio } = require('../services/errores');
const revisionService = require('../services/revisionService');
const documentosService = require('../services/documentosService');
const notificacionesRepo = require('../repositories/notificacionesRepo');
const catalogos = require('../repositories/catalogosRepo');
const dashboardService = require('../services/dashboardService');
const trabajoMetricas = require('../jobs/metricas');

const router = express.Router();
const soloAdmin = requiereRol(ROLES.ADMIN);
const soloEquipo = requiereRol(ROLES.EQUIPO);
const ESTADOS_VALIDOS = new Set(Object.values(catalogos.ESTADOS));

function idDe(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorNegocio('Identificador no válido.');
  return id;
}

// Envuelve un manejador async para enviar los errores al middleware de errores.
const accion = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ---- Administrador
router.get(
  '/revision',
  soloAdmin,
  accion(async (req, res) => {
    const estado = req.query.estado && ESTADOS_VALIDOS.has(req.query.estado) ? req.query.estado : null;
    res.json(await documentosService.listarParaRevision(req.session.usuario, estado));
  })
);

router.post(
  '/documentos/:id/aprobar',
  soloAdmin,
  accion(async (req, res) => {
    const r = await revisionService.aprobar(req.session.usuario, idDe(req));
    res.json({ ok: true, ...r, mensaje: 'Documento aprobado. Se notificó al autor.' });
  })
);

router.post(
  '/documentos/:id/rechazar',
  soloAdmin,
  accion(async (req, res) => {
    const r = await revisionService.rechazar(req.session.usuario, idDe(req), req.body.motivo);
    res.json({ ok: true, ...r, mensaje: 'Documento devuelto a corrección. Se inició el plazo SLA y se notificó al autor.' });
  })
);

router.post(
  '/documentos/:id/habilitar',
  soloAdmin,
  accion(async (req, res) => {
    const r = await revisionService.habilitar(req.session.usuario, idDe(req), req.body.motivo);
    res.json({ ok: true, ...r, mensaje: 'Edición habilitada con un nuevo plazo SLA. Se notificó al autor.' });
  })
);

router.patch(
  '/documentos/:id/confidencialidad',
  soloAdmin,
  accion(async (req, res) => {
    const r = await revisionService.cambiarConfidencialidad(req.session.usuario, idDe(req), req.body.confidencial);
    res.json({ ok: true, ...r, mensaje: req.body.confidencial ? 'Documento marcado como confidencial.' : 'Documento marcado como uso interno.' });
  })
);

router.get(
  '/dashboard',
  soloAdmin,
  accion(async (req, res) => res.json(await dashboardService.obtener()))
);

router.post(
  '/dashboard/recalcular',
  soloAdmin,
  accion(async (req, res) => {
    await trabajoMetricas.recalcular();
    res.json({ ok: true, mensaje: 'Métricas recalculadas.' });
  })
);

// ---- Equipo
router.post(
  '/documentos/:id/extension',
  soloEquipo,
  accion(async (req, res) => {
    const r = await revisionService.extender(req.session.usuario, idDe(req));
    res.json({ ok: true, ...r, mensaje: 'Se otorgó la extensión extraordinaria del plazo.' });
  })
);

// ---- Notificaciones (ambos perfiles)
router.get(
  '/notificaciones',
  requiereSesion,
  accion(async (req, res) => res.json(await notificacionesRepo.listar(req.session.usuario.id)))
);

router.post(
  '/notificaciones/leidas',
  requiereSesion,
  accion(async (req, res) => {
    await notificacionesRepo.marcarLeidas(req.session.usuario.id);
    res.json({ ok: true });
  })
);

module.exports = router;
