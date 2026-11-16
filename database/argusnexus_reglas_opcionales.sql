-- =====================================================================
-- ArgusNexus - Script complementario (vista, consulta de Dashboard y reglas)
-- Ejecutar DESPUÉS de argusnexus_schema.sql
-- Los triggers requieren el privilegio TRIGGER; en algunos hostings
-- compartidos puede no estar disponible. En ese caso, las mismas reglas
-- se validan en el servicio SLA del backend (dentro de una transacción).
-- NOTA: este script debe probarse en el MySQL de destino antes de producción.
-- =====================================================================
USE argusnexus;
-- 1) Vista: plazo vigente de cada corrección abierta.
--    La fecha límite se calcula (no se almacena) para respetar la 3FN.
CREATE OR REPLACE VIEW v_sla_vigente AS
SELECT h.id_sla,
       h.id_documento,
       d.codigo_documento,
       d.id_autor,
       h.num_iteracion,
       h.fecha_inicio,
       DATE_ADD(h.fecha_inicio, INTERVAL (h.horas_plazo + h.horas_extension) HOUR) AS fecha_limite,
       TIMESTAMPDIFF(MINUTE, NOW(),
         DATE_ADD(h.fecha_inicio, INTERVAL (h.horas_plazo + h.horas_extension) HOUR)) AS minutos_restantes,
       h.fecha_extension
FROM historial_sla h
JOIN documentos d ON d.id_documento = h.id_documento
WHERE h.fecha_cierre IS NULL;
-- 2) Consulta del Dashboard: documentos por estado (el cliente se obtiene vía plantilla)
SELECT c.nombre_cliente, e.nombre_estado, COUNT(*) AS total
FROM documentos d
JOIN plantillas p ON p.id_plantilla = d.id_plantilla
JOIN clientes c ON c.id_cliente = p.id_cliente
JOIN estados_documento e ON e.id_estado = d.id_estado
GROUP BY c.nombre_cliente, e.nombre_estado;
-- 3) Consulta del Dashboard: SLA críticos (menos de 2 horas para el vencimiento)
SELECT COUNT(*) AS sla_criticos
FROM v_sla_vigente
WHERE minutos_restantes >= 0 AND minutos_restantes < 120;
-- 4) Tasa de rechazo mensual (se calcula; no se almacena)
SELECT c.nombre_cliente, m.anio, m.mes,
       ROUND(m.total_rechazados / NULLIF(m.total_emitidos, 0) * 100, 1) AS tasa_rechazo_pct
FROM metricas_mensuales m
JOIN clientes c ON c.id_cliente = m.id_cliente;
-- 5) Reglas de integridad mediante triggers
DROP TRIGGER IF EXISTS trg_auditoria_no_update;
DROP TRIGGER IF EXISTS trg_auditoria_no_delete;
DROP TRIGGER IF EXISTS trg_sla_extension;
DELIMITER $$
-- 5.1 La bitácora de auditoría es inmutable (RNF8)
CREATE TRIGGER trg_auditoria_no_update BEFORE UPDATE ON auditoria_eventos
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'La bitacora de auditoria es inmutable: no se permiten modificaciones';
END$$
CREATE TRIGGER trg_auditoria_no_delete BEFORE DELETE ON auditoria_eventos
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'La bitacora de auditoria es inmutable: no se permite eliminar registros';
END$$
-- 5.2 Extensión extraordinaria del SLA: se otorga una sola vez.
--     Las horas de extensión y el umbral para solicitarla NO se fijan aquí:
--     son parámetros configurables del servidor (archivo .env, ver
--     src/config/sla.js) y los valida el servicio SLA del backend.
--     Así existe una única fuente para esos valores (observación 2 del docente).
CREATE TRIGGER trg_sla_extension BEFORE UPDATE ON historial_sla
FOR EACH ROW
BEGIN
  IF OLD.fecha_extension IS NOT NULL
     AND (NOT (NEW.fecha_extension <=> OLD.fecha_extension)
          OR NEW.horas_extension <> OLD.horas_extension) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La extension del SLA solo puede otorgarse una vez';
  END IF;
END$$
DELIMITER ;
