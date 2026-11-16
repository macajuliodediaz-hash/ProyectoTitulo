// Acceso a datos de la tabla clientes.
const { pool } = require('../config/db');

async function listarActivos() {
  const [filas] = await pool.execute(
    `SELECT id_cliente, nombre_cliente, (logo_ruta IS NOT NULL) AS tiene_logo
       FROM clientes WHERE activo = 1 ORDER BY nombre_cliente`
  );
  return filas;
}

async function listarTodos() {
  const [filas] = await pool.execute(
    `SELECT c.id_cliente, c.nombre_cliente, c.activo, (c.logo_ruta IS NOT NULL) AS tiene_logo,
            (SELECT COUNT(*) FROM plantillas p WHERE p.id_cliente = c.id_cliente) AS total_plantillas
       FROM clientes c ORDER BY c.nombre_cliente`
  );
  return filas;
}

async function buscarPorId(idCliente) {
  const [filas] = await pool.execute(
    'SELECT id_cliente, nombre_cliente, logo_ruta, activo FROM clientes WHERE id_cliente = ?',
    [idCliente]
  );
  return filas[0] || null;
}

async function existeActivo(idCliente) {
  const [filas] = await pool.execute('SELECT 1 FROM clientes WHERE id_cliente = ? AND activo = 1', [idCliente]);
  return filas.length > 0;
}

async function insertar(nombre) {
  const [r] = await pool.execute('INSERT INTO clientes (nombre_cliente) VALUES (?)', [nombre]);
  return r.insertId;
}

async function actualizarNombre(idCliente, nombre) {
  await pool.execute('UPDATE clientes SET nombre_cliente = ? WHERE id_cliente = ?', [nombre, idCliente]);
}

async function actualizarLogo(idCliente, ruta) {
  await pool.execute('UPDATE clientes SET logo_ruta = ? WHERE id_cliente = ?', [ruta, idCliente]);
}

async function cambiarEstado(idCliente, activo) {
  const [r] = await pool.execute('UPDATE clientes SET activo = ? WHERE id_cliente = ?', [activo ? 1 : 0, idCliente]);
  return r.affectedRows > 0;
}

module.exports = {
  listarActivos,
  listarTodos,
  buscarPorId,
  existeActivo,
  insertar,
  actualizarNombre,
  actualizarLogo,
  cambiarEstado,
};
