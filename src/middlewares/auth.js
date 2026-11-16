// Control de acceso en el servidor: cada ruta protegida valida la sesión y el rol,
// aunque el usuario conozca la URL directa (RNF4, prueba P9).

function quiereJson(req) {
  return req.originalUrl.startsWith('/api/');
}

function requiereSesion(req, res, next) {
  if (req.session && req.session.usuario) return next();
  if (quiereJson(req)) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  return res.redirect('/');
}

function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    const usuario = req.session && req.session.usuario;
    if (!usuario) return requiereSesion(req, res, next);
    if (rolesPermitidos.includes(usuario.rol)) return next();
    if (quiereJson(req)) return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso.' });
    return res.status(403).send('Acceso denegado: no tienes permiso para ver esta página.');
  };
}

module.exports = { requiereSesion, requiereRol };
