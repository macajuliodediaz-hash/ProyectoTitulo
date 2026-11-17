// Flujo de revisión y temporizador SLA.
//   RF7  El Administrador habilita la edición (rechazo o rehabilitación de un bloqueado).
//   RF8  Cada corrección inicia un SLA de SLA_HORAS_PLAZO horas (24).
//   RF9  Si el plazo vence sin reenvío: bloqueo automático, notificación y auditoría.
//   RNF7 Extensión extraordinaria única de SLA_HORAS_EXTENSION horas, solo con menos de
//        SLA_HORAS_UMBRAL_EXTENSION horas restantes.
//   RNF8 Cada cambio de estado deja un registro en la bitácora de auditoría.
// Cada operación se ejecuta en UNA transacción: cambio de estado + SLA + notificación + auditoría
// se aplican juntos o no se aplica ninguno (observación 1 del docente: consistencia ACID).
const { enTransaccion } = require('../config/db');
const slaConfig = require('../config/sla');
const documentosRepo = require('../repositories/documentosRepo');
const slaRepo = require('../repositories/slaRepo');
const notificacionesRepo = require('../repositories/notificacionesRepo');
const catalogos = require('../repositories/catalogosRepo');
const { ROLES } = require('./authService');
const { ErrorNegocio } = require('./errores');

const { ESTADOS, EVENTOS } = catalogos;

function exigirAdmin(usuario) {
  if (usuario.rol !== ROLES.ADMIN) throw new ErrorNegocio('Solo el Administrador puede realizar esta acción.', 403);
}

function validarMotivo(valor) {
  const motivo = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (motivo.length < 5) throw new ErrorNegocio('Indica el motivo de la corrección (al menos 5 caracteres).');
  if (motivo.length > 255) throw new ErrorNegocio('El motivo admite como máximo 255 caracteres.');
  return motivo;
}

async function bloquearDocumento(conn, idDocumento) {
  const doc = await documentosRepo.bloquearParaActualizar(conn, idDocumento);
  if (!doc) throw new ErrorNegocio('El documento no existe.', 404);
  return doc;
}

function exigirEstado(doc, ...estados) {
  if (!estados.includes(doc.nombre_estado)) {
    const estado = doc.nombre_estado === ESTADOS.BLOQUEADO_SLA ? 'Bloqueado (SLA)' : doc.nombre_estado;
    throw new ErrorNegocio(`Esta acción no está disponible para un documento "${estado}".`, 409);
  }
}

async function auditar(conn, doc, idUsuario, evento, nombreEstado, detalle) {
  return documentosRepo.registrarAuditoria(conn, {
    idDocumento: doc.id_documento,
    idUsuario,
    idTipoEvento: await catalogos.tipoEventoId(evento),
    idEstadoResultante: nombreEstado ? await catalogos.estadoId(nombreEstado) : null,
    detalle,
  });
}

// ---------------------------------------------------------------- Administrador

async function aprobar(usuario, idDocumento) {
  exigirAdmin(usuario);
  return enTransaccion(async (conn) => {
    const doc = await bloquearDocumento(conn, idDocumento);
    exigirEstado(doc, ESTADOS.EN_REVISION);
    await documentosRepo.cambiarEstado(conn, idDocumento, await catalogos.estadoId(ESTADOS.APROBADO));
    await notificacionesRepo.crear(conn, {
      idUsuario: doc.id_autor,
      idDocumento,
      mensaje: `${doc.codigo_documento} «${doc.titulo}» fue aprobado.`,
    });
    const idEvento = await auditar(conn, doc, usuario.id, EVENTOS.APROBACION, ESTADOS.APROBADO, 'Documento aprobado');
    return { idEvento };
  });
}

/** P5: rechazo = En Corrección + SLA de 24 h + notificación + auditoría, en una sola transacción. */
async function rechazar(usuario, idDocumento, motivoRecibido) {
  exigirAdmin(usuario);
  const motivo = validarMotivo(motivoRecibido);
  return enTransaccion(async (conn) => {
    const doc = await bloquearDocumento(conn, idDocumento);
    exigirEstado(doc, ESTADOS.EN_REVISION);
    return devolverACorreccion(conn, doc, usuario, motivo, EVENTOS.RECHAZO, 'Rechazado');
  });
}

/** RF7: el Administrador rehabilita la edición de un documento bloqueado por SLA. */
async function habilitar(usuario, idDocumento, motivoRecibido) {
  exigirAdmin(usuario);
  const motivo = validarMotivo(motivoRecibido);
  return enTransaccion(async (conn) => {
    const doc = await bloquearDocumento(conn, idDocumento);
    exigirEstado(doc, ESTADOS.BLOQUEADO_SLA);
    // Se registra como una nueva devolución a corrección (nueva iteración y nuevo plazo).
    return devolverACorreccion(conn, doc, usuario, motivo, EVENTOS.RECHAZO, 'Rehabilitado tras bloqueo SLA');
  });
}

async function devolverACorreccion(conn, doc, usuario, motivo, evento, prefijo) {
  await slaRepo.cerrar(conn, doc.id_documento); // por seguridad: nunca dos correcciones abiertas
  await documentosRepo.cambiarEstado(conn, doc.id_documento, await catalogos.estadoId(ESTADOS.EN_CORRECCION));
  const { iteracion } = await slaRepo.abrir(conn, {
    idDocumento: doc.id_documento,
    idRevisor: usuario.id,
    motivo,
    horasPlazo: slaConfig.horasPlazo,
  });
  await notificacionesRepo.crear(conn, {
    idUsuario: doc.id_autor,
    idDocumento: doc.id_documento,
    mensaje: `${doc.codigo_documento} requiere corrección (plazo ${slaConfig.horasPlazo} h): ${motivo}`,
  });
  const idEvento = await auditar(
    conn,
    doc,
    usuario.id,
    evento,
    ESTADOS.EN_CORRECCION,
    `${prefijo}. Iteración ${iteracion}. Motivo: ${motivo}`.slice(0, 255)
  );
  const sla = await slaRepo.vigente(doc.id_documento, conn);
  return { idEvento, iteracion, fechaLimite: sla.fecha_limite };
}

async function cambiarConfidencialidad(usuario, idDocumento, valor) {
  exigirAdmin(usuario);
  const confidencial = Boolean(valor);
  return enTransaccion(async (conn) => {
    const doc = await bloquearDocumento(conn, idDocumento);
    if (Boolean(doc.es_confidencial) === confidencial) return { idEvento: null, sinCambios: true };
    await documentosRepo.cambiarConfidencialidad(conn, idDocumento, confidencial);
    const idEvento = await auditar(
      conn,
      doc,
      usuario.id,
      EVENTOS.CAMBIO_CONFIDENCIALIDAD,
      null,
      confidencial ? 'Marcado como confidencial' : 'Marcado como uso interno'
    );
    return { idEvento };
  });
}

// ---------------------------------------------------------------- Equipo

/** P6 / P7: extensión extraordinaria, una sola vez y solo cerca del vencimiento. */
async function extender(usuario, idDocumento) {
  return enTransaccion(async (conn) => {
    const doc = await bloquearDocumento(conn, idDocumento);
    if (usuario.rol === ROLES.ADMIN || doc.id_autor !== usuario.id) throw new ErrorNegocio('El documento no existe.', 404);
    exigirEstado(doc, ESTADOS.EN_CORRECCION);

    const sla = await slaRepo.vigente(idDocumento, conn, true);
    if (!sla) throw new ErrorNegocio('El documento no tiene un plazo de corrección vigente.', 409);
    if (sla.fecha_extension) throw new ErrorNegocio('La extensión extraordinaria ya fue utilizada: solo se otorga una vez.', 409);

    const restantes = Number(sla.segundos_restantes);
    if (restantes <= 0) throw new ErrorNegocio('El plazo ya venció; no es posible extenderlo.', 409);
    if (restantes >= slaConfig.horasUmbralExtension * 3600) {
      throw new ErrorNegocio(
        `La extensión solo se puede solicitar cuando quedan menos de ${slaConfig.horasUmbralExtension} horas.`,
        409
      );
    }

    await slaRepo.extender(conn, sla.id_sla, slaConfig.horasExtension);
    const idEvento = await auditar(
      conn,
      doc,
      usuario.id,
      EVENTOS.EXTENSION_SLA,
      ESTADOS.EN_CORRECCION,
      `Extensión extraordinaria de ${slaConfig.horasExtension} h (iteración ${sla.num_iteracion})`
    );
    const actualizado = await slaRepo.vigente(idDocumento, conn);
    return { idEvento, fechaLimite: actualizado.fecha_limite };
  });
}

// ---------------------------------------------------------------- tarea programada

/** P8: bloquea los documentos cuyo plazo venció sin reenvío. Devuelve los ids bloqueados. */
async function bloquearVencidos() {
  const idCorreccion = await catalogos.estadoId(ESTADOS.EN_CORRECCION);
  const candidatos = await slaRepo.vencidos(idCorreccion);
  const bloqueados = [];
  for (const idDocumento of candidatos) {
    try {
      const resultado = await enTransaccion(async (conn) => {
        const doc = await bloquearDocumento(conn, idDocumento);
        if (doc.nombre_estado !== ESTADOS.EN_CORRECCION) return false; // fue reenviado justo a tiempo
        const sla = await slaRepo.vigente(idDocumento, conn, true);
        if (!sla || Number(sla.segundos_restantes) > 0) return false;

        await documentosRepo.cambiarEstado(conn, idDocumento, await catalogos.estadoId(ESTADOS.BLOQUEADO_SLA));
        await slaRepo.cerrar(conn, idDocumento);
        const mensaje = `${doc.codigo_documento} fue bloqueado: venció el plazo de corrección sin reenvío.`;
        await notificacionesRepo.crear(conn, { idUsuario: doc.id_autor, idDocumento, mensaje });
        await notificacionesRepo.crearParaAdministradores(conn, { idDocumento, mensaje });
        // id_usuario NULL: la acción la ejecuta el sistema, no una persona.
        await auditar(conn, doc, null, EVENTOS.BLOQUEO_SLA, ESTADOS.BLOQUEADO_SLA, `Plazo vencido (iteración ${sla.num_iteracion})`);
        return true;
      });
      if (resultado) bloqueados.push(idDocumento);
    } catch (error) {
      console.error(`[sla] No se pudo bloquear el documento ${idDocumento}:`, error.message);
    }
  }
  return bloqueados;
}

module.exports = { aprobar, rechazar, habilitar, cambiarConfidencialidad, extender, bloquearVencidos };
