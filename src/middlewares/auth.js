// Control de acceso en el servidor: cada ruta protegida valida la sesión y el rol,
// aunque el usuario conozca la URL directa (RNF4, prueba P9).
// En cada solicitud se confirma contra la base de datos que la cuenta siga activa
// y se toma su rol actual: si el Administrador desactiva una cuenta o cambia su
// perfil, el cambio aplica de inmediato, sin esperar a que la sesión expire.
const usuariosRepo = require('../repositories/usuariosRepo');

function quiereJson(req) {
  return req.originalUrl.startsWith('/api/');
}

function sinSesion(req, res) {
  if (quiereJson(req)) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  return res.redirect('/');
}

/** Devuelve el usuario vigente de la sesión, o null si no hay sesión o la cuenta ya no está activa. */
async function usuarioVigente(req) {
  const enSesion = req.session && req.session.usuario;
  if (!enSesion) return null;
  const actual = await usuariosRepo.buscarPorId(enSesion.id);
  if (!actual || !actual.activo) {
    await new Promise((resolver) => req.session.destroy(() => resolver()));
    return null;
  }
  // Mantener la sesión al día con los datos actuales de la cuenta
  Object.assign(enSesion, { rol: actual.rol, nombre: actual.nombre, apellido: actual.apellido, correo: actual.correo });
  return enSesion;
}

function requiereSesion(req, res, next) {
  usuarioVigente(req)
    .then((usuario) => (usuario ? next() : sinSesion(req, res)))
    .catch(next);
}

function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    usuarioVigente(req)
      .then((usuario) => {
        if (!usuario) return sinSesion(req, res);
        if (rolesPermitidos.includes(usuario.rol)) return next();
        if (quiereJson(req)) return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso.' });
        return res.status(403).send('Acceso denegado: no tienes permiso para ver esta página.');
      })
      .catch(next);
  };
}

module.exports = { requiereSesion, requiereRol };
