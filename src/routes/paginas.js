// Páginas protegidas por rol. Viven en src/views (no en public/),
// así no se pueden abrir sin pasar por la validación del servidor.
const path = require('path');
const express = require('express');
const { requiereSesion, requiereRol } = require('../middlewares/auth');
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
router.get('/admin/plantillas', requiereRol(ROLES.ADMIN), (req, res) => res.sendFile(vista('admin-plantillas.html')));
router.get('/admin/revision', requiereRol(ROLES.ADMIN), (req, res) => res.sendFile(vista('admin-revision.html')));
router.get('/admin/usuarios', requiereRol(ROLES.ADMIN), (req, res) => res.sendFile(vista('admin-usuarios.html')));
router.get('/admin/clientes', requiereRol(ROLES.ADMIN), (req, res) => res.sendFile(vista('admin-clientes.html')));
router.get('/equipo', requiereRol(ROLES.EQUIPO), (req, res) => res.sendFile(vista('equipo.html')));
router.get('/equipo/nuevo', requiereRol(ROLES.EQUIPO), (req, res) => res.sendFile(vista('generador.html')));
router.get('/equipo/documentos/:id/editar', requiereRol(ROLES.EQUIPO), (req, res) => res.sendFile(vista('generador.html')));

router.get('/buscador', requiereSesion, (req, res) => res.sendFile(vista('buscador.html')));
router.get('/perfil', requiereSesion, (req, res) => res.sendFile(vista('perfil.html')));

// Vista de un documento: ambos perfiles (el permiso sobre el documento lo valida la API).
router.get('/documentos/:id', requiereSesion, (req, res) => res.sendFile(vista('documento.html')));

module.exports = router;
