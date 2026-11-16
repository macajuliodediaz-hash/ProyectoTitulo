-- =====================================================================
-- Migración 001: logo de cada cliente
-- Agrega la ruta del logo del cliente, que se muestra en el encabezado
-- de los documentos (a la derecha; a la izquierda va el logo de GEN).
-- Solo es necesaria en bases creadas antes de este cambio: el script
-- argusnexus_schema.sql ya incluye la columna.
-- La columna depende únicamente de la clave del cliente: se mantiene la 3FN.
-- =====================================================================
USE argusnexus;

ALTER TABLE clientes
  ADD COLUMN logo_ruta VARCHAR(255) NULL AFTER nombre_cliente;
