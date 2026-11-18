// Métricas del Dashboard (RF6, RNF3).
// metricas_mensuales es una instantánea por cliente y mes calculada por lote;
// la tasa de rechazo se calcula al consultar (no se almacena, 3FN).
const { pool } = require('../config/db');

/**
 * Recalcula los indicadores de los últimos `meses` meses para todos los clientes.
 *   total_emitidos:   documentos enviados a revisión por primera vez en el mes
 *   total_rechazados: devoluciones a corrección registradas en el mes
 *   sla_cumplidos:    correcciones cerradas a tiempo (reenviadas antes del vencimiento) en el mes
 *   sla_incumplidos:  bloqueos por SLA vencido en el mes
 */
async function recalcular(meses = 6) {
  const [r] = await pool.execute(
    `INSERT INTO metricas_mensuales
            (id_cliente, anio, mes, total_emitidos, total_rechazados, sla_cumplidos, sla_incumplidos, fecha_calculo)
     SELECT * FROM (
     SELECT c.id_cliente, p.anio, p.mes,
            (SELECT COUNT(*) FROM auditoria_eventos a
               JOIN tipos_evento t ON t.id_tipo_evento = a.id_tipo_evento
               JOIN documentos d ON d.id_documento = a.id_documento
               JOIN plantillas pl ON pl.id_plantilla = d.id_plantilla
              WHERE pl.id_cliente = c.id_cliente AND t.nombre_evento = 'Envío a revisión'
                AND a.detalle = 'Primer envío a revisión'
                AND YEAR(a.fecha_evento) = p.anio AND MONTH(a.fecha_evento) = p.mes) AS total_emitidos,
            (SELECT COUNT(*) FROM historial_sla h
               JOIN documentos d ON d.id_documento = h.id_documento
               JOIN plantillas pl ON pl.id_plantilla = d.id_plantilla
              WHERE pl.id_cliente = c.id_cliente
                AND YEAR(h.fecha_inicio) = p.anio AND MONTH(h.fecha_inicio) = p.mes) AS total_rechazados,
            (SELECT COUNT(*) FROM historial_sla h
               JOIN documentos d ON d.id_documento = h.id_documento
               JOIN plantillas pl ON pl.id_plantilla = d.id_plantilla
              WHERE pl.id_cliente = c.id_cliente AND h.fecha_cierre IS NOT NULL
                AND h.fecha_cierre <= DATE_ADD(h.fecha_inicio, INTERVAL (h.horas_plazo + h.horas_extension) HOUR)
                AND YEAR(h.fecha_cierre) = p.anio AND MONTH(h.fecha_cierre) = p.mes) AS sla_cumplidos,
            (SELECT COUNT(*) FROM auditoria_eventos a
               JOIN tipos_evento t ON t.id_tipo_evento = a.id_tipo_evento
               JOIN documentos d ON d.id_documento = a.id_documento
               JOIN plantillas pl ON pl.id_plantilla = d.id_plantilla
              WHERE pl.id_cliente = c.id_cliente AND t.nombre_evento = 'Bloqueo SLA'
                AND YEAR(a.fecha_evento) = p.anio AND MONTH(a.fecha_evento) = p.mes) AS sla_incumplidos,
            NOW() AS fecha_calculo
       FROM clientes c
       CROSS JOIN (
         SELECT YEAR(DATE_SUB(CURDATE(), INTERVAL n MONTH)) AS anio, MONTH(DATE_SUB(CURDATE(), INTERVAL n MONTH)) AS mes
           FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) AS x
          WHERE n < ?
       ) AS p
     ) AS calculo
     ON DUPLICATE KEY UPDATE total_emitidos = VALUES(total_emitidos), total_rechazados = VALUES(total_rechazados),
            sla_cumplidos = VALUES(sla_cumplidos), sla_incumplidos = VALUES(sla_incumplidos), fecha_calculo = NOW()`,
    [Math.min(Math.max(meses, 1), 6)]
  );
  return r.affectedRows;
}

/** Métricas del mes actual por cliente, con la tasa de rechazo calculada. */
async function mesActualPorCliente() {
  const [filas] = await pool.execute(
    `SELECT c.nombre_cliente, m.total_emitidos, m.total_rechazados, m.sla_cumplidos, m.sla_incumplidos,
            ROUND(m.total_rechazados / NULLIF(m.total_emitidos, 0) * 100, 1) AS tasa_rechazo_pct, m.fecha_calculo
       FROM metricas_mensuales m
       JOIN clientes c ON c.id_cliente = m.id_cliente
      WHERE m.anio = YEAR(CURDATE()) AND m.mes = MONTH(CURDATE()) AND c.activo = 1
      ORDER BY c.nombre_cliente`
  );
  return filas;
}

/** Totales de los últimos 6 meses (todos los clientes) para la tendencia. */
async function tendencia() {
  const [filas] = await pool.execute(
    `SELECT anio, mes, SUM(total_emitidos) AS emitidos, SUM(total_rechazados) AS rechazados,
            SUM(sla_cumplidos) AS sla_cumplidos, SUM(sla_incumplidos) AS sla_incumplidos
       FROM metricas_mensuales
      WHERE STR_TO_DATE(CONCAT(anio, '-', mes, '-01'), '%Y-%c-%d') >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
      GROUP BY anio, mes
      ORDER BY anio, mes`
  );
  return filas;
}

async function slaCriticos(segundosUmbral) {
  const [filas] = await pool.execute(
    `SELECT d.id_documento, d.codigo_documento, d.titulo, CONCAT(u.nombre, ' ', u.apellido) AS autor,
            TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(h.fecha_inicio, INTERVAL (h.horas_plazo + h.horas_extension) HOUR)) AS segundos_restantes
       FROM historial_sla h
       JOIN documentos d ON d.id_documento = h.id_documento
       JOIN usuarios u ON u.id_usuario = d.id_autor
      WHERE h.fecha_cierre IS NULL
        AND TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(h.fecha_inicio, INTERVAL (h.horas_plazo + h.horas_extension) HOUR)) < ?
      ORDER BY segundos_restantes`,
    [segundosUmbral]
  );
  return filas;
}

async function actividadReciente(limite = 8) {
  const [filas] = await pool.execute(
    `SELECT a.id_evento, a.fecha_evento, t.nombre_evento, a.detalle, d.id_documento, d.codigo_documento, d.titulo,
            COALESCE(CONCAT(u.nombre, ' ', u.apellido), 'Sistema') AS usuario
       FROM auditoria_eventos a
       JOIN tipos_evento t ON t.id_tipo_evento = a.id_tipo_evento
       JOIN documentos d ON d.id_documento = a.id_documento
       LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      ORDER BY a.fecha_evento DESC, a.id_evento DESC
      LIMIT ${Number(limite) | 0}`
  );
  return filas;
}

async function almacenamiento() {
  const [[fila]] = await pool.execute(
    `SELECT (SELECT COUNT(*) FROM documentos) AS documentos,
            (SELECT COUNT(*) FROM documentos WHERE es_confidencial = 1) AS confidenciales,
            (SELECT COUNT(*) FROM imagenes_documento) AS imagenes,
            (SELECT COUNT(*) FROM plantillas WHERE activa = 1) AS plantillas_activas,
            (SELECT COUNT(*) FROM clientes WHERE activo = 1) AS clientes_activos`
  );
  return fila;
}

module.exports = { recalcular, mesActualPorCliente, tendencia, slaCriticos, actividadReciente, almacenamiento };
