// Reglas de negocio de autenticación (RF1).
const bcrypt = require('bcryptjs');
const usuariosRepo = require('../repositories/usuariosRepo');

const ROLES = Object.freeze({ ADMIN: 'Administrador', EQUIPO: 'Equipo' });

// Hash ficticio para comparar aunque el correo no exista: así la respuesta
// tarda lo mismo y no revela si la cuenta existe (prueba P2).
const HASH_FICTICIO = bcrypt.hashSync('argusnexus-hash-ficticio', 10);

function inicioSegunRol(rol) {
  return rol === ROLES.ADMIN ? '/admin' : '/equipo';
}

/**
 * Valida las credenciales. Devuelve los datos públicos del usuario o null.
 * Nunca indica si falló el correo o la contraseña.
 */
async function iniciarSesion(correo, clave) {
  const usuario = await usuariosRepo.buscarPorCorreo(correo);
  const claveValida = await bcrypt.compare(clave, usuario ? usuario.password_hash : HASH_FICTICIO);

  if (!usuario || !claveValida || !usuario.activo) return null;

  await usuariosRepo.registrarAcceso(usuario.id_usuario);
  return {
    id: usuario.id_usuario,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correo,
    rol: usuario.rol,
  };
}

async function hashClave(clave) {
  return bcrypt.hash(clave, 12);
}

module.exports = { ROLES, inicioSegunRol, iniciarSesion, hashClave };
