// Reglas de negocio de plantillas por cliente (RF5).
const { enTransaccion } = require('../config/db');
const plantillasRepo = require('../repositories/plantillasRepo');
const clientesRepo = require('../repositories/clientesRepo');
const { ErrorNegocio } = require('./errores');

const MAX_SECCIONES = 30;

function texto(valor, campo, maximo) {
  const limpio = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) throw new ErrorNegocio(`${campo} es obligatorio.`);
  if (limpio.length > maximo) throw new ErrorNegocio(`${campo} admite como máximo ${maximo} caracteres.`);
  return limpio;
}

function entero(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Valida y normaliza los datos que llegan desde el formulario. */
function validar(datos) {
  const idCliente = entero(datos.idCliente);
  if (!idCliente) throw new ErrorNegocio('Selecciona un cliente.');

  const nombre = texto(datos.nombre, 'El nombre de la plantilla', 100);

  if (!Array.isArray(datos.secciones) || datos.secciones.length === 0) {
    throw new ErrorNegocio('La plantilla debe tener al menos una sección.');
  }
  if (datos.secciones.length > MAX_SECCIONES) {
    throw new ErrorNegocio(`La plantilla admite como máximo ${MAX_SECCIONES} secciones.`);
  }

  const vistos = new Set();
  const secciones = datos.secciones.map((s, i) => {
    const nombreSeccion = texto(s.nombre, `El nombre de la sección ${i + 1}`, 80);
    const clave = nombreSeccion.toLowerCase();
    if (vistos.has(clave)) throw new ErrorNegocio(`La sección "${nombreSeccion}" está repetida.`);
    vistos.add(clave);
    return {
      id: s.id ? entero(s.id) : null,
      nombre: nombreSeccion,
      obligatoria: Boolean(s.obligatoria),
      permiteImagenes: Boolean(s.permiteImagenes),
    };
  });

  return { idCliente, nombre, secciones };
}

async function validarCliente(idCliente) {
  if (!(await clientesRepo.existeActivo(idCliente))) {
    throw new ErrorNegocio('El cliente seleccionado no existe o está inactivo.');
  }
}

function traducirDuplicado(error) {
  if (error && error.code === 'ER_DUP_ENTRY') {
    return new ErrorNegocio('Ya existe una plantilla con ese nombre para el cliente seleccionado.', 409);
  }
  return error;
}

async function crear(datos, idUsuario) {
  const plantilla = validar(datos);
  await validarCliente(plantilla.idCliente);
  try {
    return await enTransaccion(async (conn) => {
      const id = await plantillasRepo.insertar(conn, {
        idCliente: plantilla.idCliente,
        idUsuarioCreador: idUsuario,
        nombre: plantilla.nombre,
      });
      for (const [i, seccion] of plantilla.secciones.entries()) {
        await plantillasRepo.insertarSeccion(conn, id, seccion, i + 1);
      }
      return id;
    });
  } catch (error) {
    throw traducirDuplicado(error);
  }
}

async function actualizar(idPlantilla, datos) {
  const plantilla = validar(datos);
  const actual = await plantillasRepo.buscarPorId(idPlantilla);
  if (!actual) throw new ErrorNegocio('La plantilla no existe.', 404);

  if (actual.total_documentos > 0 && plantilla.idCliente !== actual.id_cliente) {
    throw new ErrorNegocio('No se puede cambiar el cliente de una plantilla que ya tiene documentos.');
  }
  await validarCliente(plantilla.idCliente);

  const existentes = new Map(actual.secciones.map((s) => [s.id_seccion, s]));
  for (const s of plantilla.secciones) {
    if (s.id && !existentes.has(s.id)) throw new ErrorNegocio('Una de las secciones no pertenece a esta plantilla.');
  }

  // Secciones que se quitan: solo si ningún documento las ha usado (protege el historial).
  const conservadas = new Set(plantilla.secciones.filter((s) => s.id).map((s) => s.id));
  const quitadas = actual.secciones.filter((s) => !conservadas.has(s.id_seccion));
  const enUso = quitadas.find((s) => s.usos > 0);
  if (enUso) {
    throw new ErrorNegocio(
      `No se puede quitar la sección "${enUso.nombre_seccion}" porque ya tiene contenido en documentos. ` +
        'Puedes renombrarla o marcarla como opcional.'
    );
  }

  try {
    await enTransaccion(async (conn) => {
      await plantillasRepo.actualizar(conn, idPlantilla, plantilla);
      for (const s of quitadas) await plantillasRepo.eliminarSeccion(conn, s.id_seccion);
      await plantillasRepo.desplazarOrdenes(conn, idPlantilla);
      for (const [i, seccion] of plantilla.secciones.entries()) {
        if (seccion.id) await plantillasRepo.actualizarSeccion(conn, seccion.id, seccion, i + 1);
        else await plantillasRepo.insertarSeccion(conn, idPlantilla, seccion, i + 1);
      }
    });
  } catch (error) {
    throw traducirDuplicado(error);
  }
}

/**
 * Elimina la plantilla si nunca se usó; si ya tiene documentos, la da de baja
 * (activa = 0) para no perder la trazabilidad de los documentos emitidos.
 */
async function eliminar(idPlantilla) {
  const actual = await plantillasRepo.buscarPorId(idPlantilla);
  if (!actual) throw new ErrorNegocio('La plantilla no existe.', 404);

  if (actual.total_documentos > 0) {
    await plantillasRepo.cambiarEstado(idPlantilla, false);
    return { resultado: 'baja' };
  }
  await enTransaccion((conn) => plantillasRepo.eliminar(conn, idPlantilla));
  return { resultado: 'eliminada' };
}

async function cambiarEstado(idPlantilla, activa) {
  const ok = await plantillasRepo.cambiarEstado(idPlantilla, Boolean(activa));
  if (!ok) throw new ErrorNegocio('La plantilla no existe.', 404);
}

module.exports = { crear, actualizar, eliminar, cambiarEstado };
