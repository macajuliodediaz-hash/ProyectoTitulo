// Reglas de negocio de clientes: nombre único y logo para el encabezado de los documentos.
// Los clientes no se eliminan (sus plantillas y documentos conservan la trazabilidad):
// se desactivan y dejan de aparecer para plantillas y documentos nuevos.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archivos = require('../config/archivos');
const clientesRepo = require('../repositories/clientesRepo');
const { ErrorNegocio } = require('./errores');

const MAX_BYTES_LOGO = 2 * 1024 * 1024;

function validarNombre(valor) {
  const nombre = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 2) throw new ErrorNegocio('El nombre del cliente debe tener al menos 2 caracteres.');
  if (nombre.length > 100) throw new ErrorNegocio('El nombre del cliente admite como máximo 100 caracteres.');
  return nombre;
}

/** Valida el logo subido ANTES de modificar la base de datos. Devuelve su extensión real (o null si no hay logo). */
function validarLogo(archivosSubidos) {
  const archivo = archivosSubidos[0];
  if (!archivo) return null;
  try {
    if (archivo.fieldname !== 'logo') throw new ErrorNegocio('Archivo no esperado.');
    if (archivo.size > MAX_BYTES_LOGO) throw new ErrorNegocio('El logo puede pesar como máximo 2 MB.');
    const extension = archivos.detectarTipo(archivo.path);
    if (!extension) throw new ErrorNegocio('El logo debe ser una imagen JPG, PNG o WEBP válida.');
    return extension;
  } catch (error) {
    archivos.borrarSilencioso(archivo.path);
    throw error;
  }
}

/** Mueve el logo ya validado a /uploads/clientes. Devuelve la ruta relativa. */
function guardarLogo(idCliente, archivo, extension) {
  const nombre = `${idCliente}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  fs.renameSync(archivo.path, path.join(archivos.CARPETA_CLIENTES, nombre));
  return `clientes/${nombre}`;
}

function borrarLogoAnterior(ruta) {
  if (ruta) archivos.borrarSilencioso(path.resolve(archivos.RAIZ_UPLOADS, ruta));
}

function traducirDuplicado(error) {
  if (error && error.code === 'ER_DUP_ENTRY') return new ErrorNegocio('Ya existe un cliente con ese nombre.', 409);
  return error;
}

function descartar(archivosSubidos) {
  archivosSubidos.forEach((a) => archivos.borrarSilencioso(a.path));
}

async function crear({ nombre }, archivosSubidos) {
  let nombreValido;
  try {
    nombreValido = validarNombre(nombre);
  } catch (error) {
    descartar(archivosSubidos);
    throw error;
  }
  const extension = validarLogo(archivosSubidos);
  let id;
  try {
    id = await clientesRepo.insertar(nombreValido);
  } catch (error) {
    descartar(archivosSubidos);
    throw traducirDuplicado(error);
  }
  if (extension) await clientesRepo.actualizarLogo(id, guardarLogo(id, archivosSubidos[0], extension));
  return id;
}

async function actualizar(idCliente, { nombre, quitarLogo }, archivosSubidos) {
  const actual = await clientesRepo.buscarPorId(idCliente);
  if (!actual) {
    descartar(archivosSubidos);
    throw new ErrorNegocio('El cliente no existe.', 404);
  }
  let nombreValido;
  try {
    nombreValido = validarNombre(nombre);
  } catch (error) {
    descartar(archivosSubidos);
    throw error;
  }
  const extension = validarLogo(archivosSubidos);
  try {
    await clientesRepo.actualizarNombre(idCliente, nombreValido);
  } catch (error) {
    descartar(archivosSubidos);
    throw traducirDuplicado(error);
  }
  if (extension) {
    await clientesRepo.actualizarLogo(idCliente, guardarLogo(idCliente, archivosSubidos[0], extension));
    borrarLogoAnterior(actual.logo_ruta);
  } else if (quitarLogo === 'true' || quitarLogo === true) {
    await clientesRepo.actualizarLogo(idCliente, null);
    borrarLogoAnterior(actual.logo_ruta);
  }
}

async function cambiarEstado(idCliente, activo) {
  if (!(await clientesRepo.cambiarEstado(idCliente, activo))) throw new ErrorNegocio('El cliente no existe.', 404);
}

async function rutaLogo(idCliente) {
  const cliente = await clientesRepo.buscarPorId(idCliente);
  if (!cliente || !cliente.logo_ruta) throw new ErrorNegocio('El cliente no tiene logo.', 404);
  const ruta = path.resolve(archivos.RAIZ_UPLOADS, cliente.logo_ruta);
  if (!ruta.startsWith(archivos.CARPETA_CLIENTES + path.sep)) throw new ErrorNegocio('El cliente no tiene logo.', 404);
  return ruta;
}

module.exports = { crear, actualizar, cambiarEstado, rutaLogo };
