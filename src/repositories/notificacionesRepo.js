// Acceso a datos de notificaciones (avisos del sistema a cada usuario).
const { pool } = require('../config/db');

async function crear(conn, { idUsuario, idDocumento, mensaje }) {
  await conn.execute('INSERT INTO notificaciones (id_usuario, id_documento, mensaje) VALUES (?, ?, ?)', [
    idUsuario,
    idDocumento,
    mensaje.slice(0, 255),
  ]);
}

/** Notifica a todos los administradores activos. */
async function crearParaAdministradores(conn, { idDocumento, mensaje }) {
  await conn.execute(
    `INSERT INTO notificaciones (id_usuario, id_documento, mensaje)
     SELECT u.id_usuario, ?, ? FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE r.nombre_rol = 'Administrador' AND u.activo = 1`,
    [idDocumento, mensaje.slice(0, 255)]
  );
}

async function listar(idUsuario, limite = 15) {
  const [filas] = await pool.execute(
    `SELECT n.id_notificacion, n.id_documento, n.mensaje, n.fecha_envio, n.leida, d.codigo_documento
       FROM notificaciones n JOIN documentos d ON d.id_documento = n.id_documento
      WHERE n.id_usuario = ?
      ORDER BY n.fecha_envio DESC, n.id_notificacion DESC
      LIMIT ${Number(limite) | 0}`,
    [idUsuario]
  );
  const [[{ sinLeer }]] = await pool.execute(
    'SELECT COUNT(*) AS sinLeer FROM notificaciones WHERE id_usuario = ? AND leida = 0',
    [idUsuario]
  );
  return { notificaciones: filas, sinLeer };
}

async function marcarLeidas(idUsuario) {
  await pool.execute('UPDATE notificaciones SET leida = 1 WHERE id_usuario = ? AND leida = 0', [idUsuario]);
}

module.exports = { crear, crearParaAdministradores, listar, marcarLeidas };
