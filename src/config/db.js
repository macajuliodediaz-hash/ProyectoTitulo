// Pool de conexiones a MySQL (mysql2/promise).
// Todas las consultas del sistema usan marcadores "?" (consultas parametrizadas)
// para prevenir inyección SQL (observación 1).
const mysql = require('mysql2/promise');
const { db } = require('./env');

const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  ssl: db.ssl,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'local',
  dateStrings: false,
});

/**
 * Ejecuta varias operaciones dentro de una transacción.
 * Si alguna falla, se deshacen todas (ACID). Ejemplo de uso:
 *   await enTransaccion(async (conn) => { await conn.execute(...); await conn.execute(...); });
 */
async function enTransaccion(trabajo) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await trabajo(conn);
    await conn.commit();
    return resultado;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { pool, enTransaccion };
