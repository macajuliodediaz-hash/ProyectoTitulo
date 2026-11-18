// Gestión de perfiles y cuentas de usuario.
//   Administrador: crear, editar (incluido el rol), desactivar/reactivar y restablecer contraseñas.
//   Cada usuario: actualizar su nombre y cambiar su contraseña (con la contraseña actual).
// Las contraseñas se guardan solo como hash bcrypt (RF1).
const bcrypt = require('bcryptjs');
const usuariosRepo = require('../repositories/usuariosRepo');
const { ROLES, hashClave } = require('./authService');
const { ErrorNegocio } = require('./errores');

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(valor, campo, minimo, maximo) {
  const limpio = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (limpio.length < minimo) throw new ErrorNegocio(`${campo} debe tener al menos ${minimo} caracteres.`);
  if (limpio.length > maximo) throw new ErrorNegocio(`${campo} admite como máximo ${maximo} caracteres.`);
  return limpio;
}

function validarCorreo(valor) {
  const correo = String(valor ?? '').trim().toLowerCase();
  if (!CORREO_VALIDO.test(correo) || correo.length > 100) throw new ErrorNegocio('Ingresa un correo electrónico válido.');
  return correo;
}

/** Política de contraseñas: mínimo 8 caracteres, con al menos una letra y un número. */
function validarClave(valor) {
  const clave = String(valor ?? '');
  if (clave.length < 8) throw new ErrorNegocio('La contraseña debe tener al menos 8 caracteres.');
  if (clave.length > 72) throw new ErrorNegocio('La contraseña admite como máximo 72 caracteres.');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave) || !/\d/.test(clave)) {
    throw new ErrorNegocio('La contraseña debe incluir al menos una letra y un número.');
  }
  return clave;
}

function validarRol(valor) {
  if (!Object.values(ROLES).includes(valor)) throw new ErrorNegocio('Selecciona un perfil válido.');
  return valor;
}

function traducirDuplicado(error) {
  if (error && error.code === 'ER_DUP_ENTRY') return new ErrorNegocio('Ya existe una cuenta con ese correo.', 409);
  return error;
}

function publico(u) {
  return {
    id: u.id_usuario,
    nombre: u.nombre,
    apellido: u.apellido,
    correo: u.correo,
    rol: u.rol,
    activo: Boolean(u.activo),
    fechaCreacion: u.fecha_creacion,
    ultimoAcceso: u.ultimo_acceso,
  };
}

async function obtener(idUsuario) {
  const usuario = await usuariosRepo.buscarPorId(idUsuario);
  if (!usuario) throw new ErrorNegocio('La cuenta no existe.', 404);
  return usuario;
}

/** Nunca puede quedar el sistema sin un Administrador activo. */
async function protegerUltimoAdministrador(actual, { nuevoRol, nuevoActivo }) {
  const dejaDeSerAdminActivo =
    actual.rol === ROLES.ADMIN && actual.activo && (nuevoRol !== ROLES.ADMIN || !nuevoActivo);
  if (dejaDeSerAdminActivo && (await usuariosRepo.contarAdministradoresActivos()) <= 1) {
    throw new ErrorNegocio('Debe existir al menos un Administrador activo.', 409);
  }
}

// ---------------------------------------------------------------- Administrador

async function listar() {
  return (await usuariosRepo.listar()).map(publico);
}

async function crear(datos) {
  const cuenta = {
    nombre: texto(datos.nombre, 'El nombre', 2, 50),
    apellido: texto(datos.apellido, 'El apellido', 2, 50),
    correo: validarCorreo(datos.correo),
    rol: validarRol(datos.rol),
  };
  const clave = validarClave(datos.clave);
  try {
    return await usuariosRepo.insertar({
      ...cuenta,
      idRol: await usuariosRepo.buscarIdRol(cuenta.rol),
      passwordHash: await hashClave(clave),
    });
  } catch (error) {
    throw traducirDuplicado(error);
  }
}

async function actualizar(administrador, idUsuario, datos) {
  const actual = await obtener(idUsuario);
  const cambios = {
    nombre: texto(datos.nombre, 'El nombre', 2, 50),
    apellido: texto(datos.apellido, 'El apellido', 2, 50),
    correo: validarCorreo(datos.correo),
    rol: validarRol(datos.rol),
  };
  if (idUsuario === administrador.id && cambios.rol !== ROLES.ADMIN) {
    throw new ErrorNegocio('No puedes quitarte a ti mismo el perfil de Administrador.', 409);
  }
  await protegerUltimoAdministrador(actual, { nuevoRol: cambios.rol, nuevoActivo: Boolean(actual.activo) });
  try {
    await usuariosRepo.actualizar(idUsuario, { ...cambios, idRol: await usuariosRepo.buscarIdRol(cambios.rol) });
  } catch (error) {
    throw traducirDuplicado(error);
  }
}

async function cambiarEstado(administrador, idUsuario, activo) {
  const actual = await obtener(idUsuario);
  if (idUsuario === administrador.id && !activo) throw new ErrorNegocio('No puedes desactivar tu propia cuenta.', 409);
  await protegerUltimoAdministrador(actual, { nuevoRol: actual.rol, nuevoActivo: Boolean(activo) });
  await usuariosRepo.cambiarEstado(idUsuario, Boolean(activo));
}

async function restablecerClave(idUsuario, nuevaClave) {
  await obtener(idUsuario);
  await usuariosRepo.cambiarClave(idUsuario, await hashClave(validarClave(nuevaClave)));
}

// ---------------------------------------------------------------- Mi perfil

async function miPerfil(usuario) {
  return publico(await obtener(usuario.id));
}

async function actualizarMiPerfil(usuario, datos) {
  const cambios = {
    nombre: texto(datos.nombre, 'El nombre', 2, 50),
    apellido: texto(datos.apellido, 'El apellido', 2, 50),
  };
  await usuariosRepo.actualizarNombre(usuario.id, cambios);
  return cambios;
}

async function cambiarMiClave(usuario, { claveActual, claveNueva }) {
  const hash = await usuariosRepo.hashDe(usuario.id);
  if (!hash || !(await bcrypt.compare(String(claveActual ?? ''), hash))) {
    throw new ErrorNegocio('La contraseña actual no es correcta.');
  }
  const nueva = validarClave(claveNueva);
  if (await bcrypt.compare(nueva, hash)) throw new ErrorNegocio('La nueva contraseña debe ser distinta de la actual.');
  await usuariosRepo.cambiarClave(usuario.id, await hashClave(nueva));
}

module.exports = {
  listar,
  crear,
  actualizar,
  cambiarEstado,
  restablecerClave,
  miPerfil,
  actualizarMiPerfil,
  cambiarMiClave,
};
