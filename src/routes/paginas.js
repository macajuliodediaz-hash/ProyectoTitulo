// Páginas protegidas por rol. Viven en src/views (no en public/),
// así no se pueden abrir sin pasar por la validación del servidor.
const path = require('path');
const express = require('express');
const { requiereRol } = require('../middlewares/auth');
const { ROLES, inicioSegunRol } = require('../services/authService');

const router = express.Router();
const vista = (archivo) => path.join(__dirname, '..', 'views', archivo);

// Si ya hay sesión, el login redirige a la interfaz del rol.
router.get('/', (req, res, next) => {
  const usuario = req.session && req.session.usuario;
  if (usuario) return res.redirect(inicioSegunRol(usuario.rol));
  next();
});

router.get('/admin', requiereRol(ROLES.ADMIN), (req, res) => res.sendFile(vista('admin.html')));
router.get('/equipo', requiereRol(ROLES.EQUIPO), (req, res) => res.sendFile(vista('equipo.html')));

module.exports = router;
