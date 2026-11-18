// API de gestión de cuentas (Administrador) y de "Mi perfil" (cualquier usuario con sesión).
const express = require('express');
const { requiereSesion, requiereRol } = require('../middlewares/auth');
const { ROLES } = require('../services/authService');
const { ErrorNegocio } = require('../services/errores');
const usuariosService = require('../services/usuariosService');

const router = express.Router();
const soloAdmin = requiereRol(ROLES.ADMIN);
const accion = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function idDe(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorNegocio('Identificador no válido.');
  return id;
}

// ---- Administrador
router.get('/usuarios', soloAdmin, accion(async (req, res) => res.json({ usuarios: await usuariosService.listar() })));

router.post(
  '/usuarios',
  soloAdmin,
  accion(async (req, res) => {
    const id = await usuariosService.crear(req.body);
    res.status(201).json({ ok: true, id, mensaje: 'Cuenta creada correctamente.' });
  })
);

router.put(
  '/usuarios/:id',
  soloAdmin,
  accion(async (req, res) => {
    await usuariosService.actualizar(req.session.usuario, idDe(req), req.body);
    res.json({ ok: true, mensaje: 'Cuenta actualizada correctamente.' });
  })
);

router.patch(
  '/usuarios/:id/estado',
  soloAdmin,
  accion(async (req, res) => {
    const activo = Boolean(req.body.activo);
    await usuariosService.cambiarEstado(req.session.usuario, idDe(req), activo);
    res.json({ ok: true, mensaje: activo ? 'Cuenta reactivada.' : 'Cuenta desactivada: ya no podrá ingresar.' });
  })
);

router.post(
  '/usuarios/:id/clave',
  soloAdmin,
  accion(async (req, res) => {
    await usuariosService.restablecerClave(idDe(req), req.body.clave);
    res.json({ ok: true, mensaje: 'Contraseña restablecida. Comunícala al usuario por un medio seguro.' });
  })
);

// ---- Mi perfil
router.get('/perfil', requiereSesion, accion(async (req, res) => res.json({ perfil: await usuariosService.miPerfil(req.session.usuario) })));

router.put(
  '/perfil',
  requiereSesion,
  accion(async (req, res) => {
    const cambios = await usuariosService.actualizarMiPerfil(req.session.usuario, req.body);
    Object.assign(req.session.usuario, cambios);
    res.json({ ok: true, mensaje: 'Tus datos fueron actualizados.' });
  })
);

router.post(
  '/perfil/clave',
  requiereSesion,
  accion(async (req, res) => {
    await usuariosService.cambiarMiClave(req.session.usuario, req.body);
    res.json({ ok: true, mensaje: 'Tu contraseña fue cambiada.' });
  })
);

module.exports = router;
