// Rutas de autenticación: /api/login, /api/logout, /api/sesion
const express = require('express');
const authService = require('../services/authService');

const router = express.Router();
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/login', async (req, res, next) => {
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const clave = String(req.body.clave || '');

    if (!CORREO_VALIDO.test(correo) || clave.length === 0 || clave.length > 200) {
      return res.status(400).json({ error: 'Ingresa un correo y una contraseña válidos.' });
    }

    const usuario = await authService.iniciarSesion(correo, clave);
    if (!usuario) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    // Nueva sesión al ingresar (evita fijación de sesión).
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.usuario = usuario;
      req.session.save((err) => {
        if (err) return next(err);
        res.json({ ok: true, redirigir: authService.inicioSegunRol(usuario.rol) });
      });
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('argusnexus.sid');
    res.json({ ok: true, redirigir: '/' });
  });
});

router.get('/sesion', (req, res) => {
  const usuario = req.session && req.session.usuario;
  if (!usuario) return res.status(401).json({ error: 'Sin sesión activa.' });
  res.json({ usuario });
});

module.exports = router;
