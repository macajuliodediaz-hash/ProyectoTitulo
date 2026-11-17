// Acceso a datos de historial_sla.
// La fecha límite NO se almacena (3FN): se calcula como
//   fecha_inicio + horas_plazo + horas_extension
// y el tiempo restante se calcula con el reloj de la base de datos (NOW()).
const { pool } = require('../config/db');

const LIMITE = 'DATE_ADD(h.fecha_inicio, INTERVAL (h.horas_plazo + h.horas_extension) HOUR)';

/** Abre una nueva iteración de corrección y devuelve su id. */
async function abrir(conn, { idDocumento, idRevisor, motivo, horasPlazo }) {
  const [[{ siguiente }]] = await conn.execute(
    'SELECT COALESCE(MAX(num_iteracion), 0) + 1 AS siguiente FROM historial_sla WHERE id_documento = ?',
    [idDocumento]
  );
  const [r] = await conn.execute(
    `INSERT INTO historial_sla (id_documento, id_revisor, num_iteracion, motivo_correccion, horas_plazo)
     VALUES (?, ?, ?, ?, ?)`,
    [idDocumento, idRevisor, siguiente, motivo, horasPlazo]
  );
  return { idSla: r.insertId, iteracion: siguiente };
}

/** Corrección abierta del documento (o null), con su fecha límite y segundos restantes. */
async function vigente(idDocumento, conn = pool, bloquear = false) {
  const [filas] = await conn.execute(
    `SELECT h.id_sla, h.num_iteracion, h.motivo_correccion, h.fecha_inicio, h.horas_plazo,
            h.horas_extension, h.fecha_extension,
            ${LIMITE} AS fecha_limite,
            TIMESTAMPDIFF(SECOND, NOW(), ${LIMITE}) AS segundos_restantes
       FROM historial_sla h
      WHERE h.id_documento = ? AND h.fecha_cierre IS NULL
      ORDER BY h.num_iteracion DESC
      LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
    [idDocumento]
  );
  return filas[0] || null;
}

async function extender(conn, idSla, horas) {
  await conn.execute('UPDATE historial_sla SET fecha_extension = NOW(), horas_extension = ? WHERE id_sla = ?', [
    horas,
    idSla,
  ]);
}

async function cerrar(conn, idDocumento) {
  await conn.execute('UPDATE historial_sla SET fecha_cierre = NOW() WHERE id_documento = ? AND fecha_cierre IS NULL', [
    idDocumento,
  ]);
}

/** Documentos En Corrección cuyo plazo (incluida la extensión) ya venció. */
async function vencidos(idEstadoCorreccion) {
  const [filas] = await pool.execute(
    `SELECT h.id_documento
       FROM historial_sla h
       JOIN documentos d ON d.id_documento = h.id_documento
      WHERE h.fecha_cierre IS NULL AND d.id_estado = ? AND ${LIMITE} <= NOW()`,
    [idEstadoCorreccion]
  );
  return filas.map((f) => f.id_documento);
}

module.exports = { abrir, vigente, extender, cerrar, vencidos };
