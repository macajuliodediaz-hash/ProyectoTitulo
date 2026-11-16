// Acceso a datos de la tabla clientes.
const { pool } = require('../config/db');

async function listarActivos() {
  const [filas] = await pool.execute(
    'SELECT id_cliente, nombre_cliente FROM clientes WHERE activo = 1 ORDER BY nombre_cliente'
  );
  return filas;
}

async function existeActivo(idCliente) {
  const [filas] = await pool.execute('SELECT 1 FROM clientes WHERE id_cliente = ? AND activo = 1', [idCliente]);
  return filas.length > 0;
}

module.exports = { listarActivos, existeActivo };
