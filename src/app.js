// Configuración de la aplicación Express (capas: rutas -> servicios -> repositorios).
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config/env');
const rutasAuth = require('./routes/auth');
const rutasPaginas = require('./routes/paginas');

const app = express();

if (config.produccion) app.set('trust proxy', 1); // necesario detrás del proxy HTTPS del hosting
app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.use(
  session({
    name: 'argusnexus.sid',
    secret: config.sesion.secreto,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.produccion,
      maxAge: config.sesion.horasDuracion * 60 * 60 * 1000,
    },
  })
);

// Cabeceras básicas de seguridad
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use('/api', rutasAuth);
app.use(rutasPaginas);
app.use(express.static(path.join(__dirname, '..', 'public')));

// 404
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ error: 'Recurso no encontrado.' });
  res.status(404).send('Página no encontrada.');
});

// Errores no controlados: se registran en el servidor sin exponer detalles al usuario.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('[error]', error);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({ error: 'Ocurrió un error en el servidor. Intenta nuevamente.' });
  }
  res.status(500).send('Ocurrió un error en el servidor.');
});

module.exports = app;
