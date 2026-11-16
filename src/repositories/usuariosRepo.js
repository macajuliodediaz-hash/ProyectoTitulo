// Acceso a datos de la tabla usuarios (solo consultas parametrizadas).
const { pool } = require('../config/db');

async function buscarPorCorreo(correo) {
  const [filas] = await pool.execute(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.password_hash, u.activo,
            r.nombre_rol AS rol
       FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.correo = ?
      LIMIT 1`,
    [correo]
  );
  return filas[0] || null;
}

async function registrarAcceso(idUsuario) {
  await pool.execute('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?', [idUsuario]);
}

async function buscarIdRol(nombreRol) {
  const [filas] = await pool.execute('SELECT id_rol FROM roles WHERE nombre_rol = ?', [nombreRol]);
  return filas[0] ? filas[0].id_rol : null;
}

async function crearOActualizar({ idRol, nombre, apellido, correo, passwordHash }) {
  await pool.execute(
    `INSERT INTO usuarios (id_rol, nombre, apellido, correo, password_hash)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id_rol = VALUES(id_rol), nombre = VALUES(nombre),
       apellido = VALUES(apellido), password_hash = VALUES(password_hash), activo = 1`,
    [idRol, nombre, apellido, correo, passwordHash]
  );
}

module.exports = { buscarPorCorreo, registrarAcceso, buscarIdRol, crearOActualizar };
